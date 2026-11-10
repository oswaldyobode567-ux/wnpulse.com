import asyncio
import tempfile
import unittest
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from PIL import Image
import app
from editorial import make, poster, ZONE


class Community(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        config = patch.object(app, "DB", str(Path(self.directory.name)/"drafts.sqlite"))
        config.start()
        self.addCleanup(config.stop)
        app.setup()
        self.now = datetime.now(ZONE)
        self.draft = {"kind":"guide","title":"Comprendre WinPulse","lines":["Découvrir le suivi des pronostics"],
                      "link":"https://wnpulse.com/blog","until":(self.now+timedelta(hours=1)).timestamp()}

    def test_selects_only_public_future_pick_and_renders_png(self):
        pred = {"free_daily_pick":True,"locked":False,"pick":"Lille","pick_odds":1.48}
        row = {"result":"pending","home_team":"Lille","away_team":"Le Havre","prediction":pred}
        rows = [
            {**row,"commence_time":(self.now-timedelta(minutes=1)).isoformat()},
            {**row,"prediction":{**pred,"locked":True},"commence_time":(self.now+timedelta(minutes=10)).isoformat()},
            {**row,"commence_time":(self.now+timedelta(minutes=30)).isoformat()},
        ]
        draft=make("pick",{"items":rows},self.now,self.now)
        self.assertIn("Cote observée : 1,48",draft["lines"])
        self.assertIsNone(make("pick",{"items":rows[:2]},self.now,self.now))
        with Image.open(BytesIO(poster(draft))) as image:
            self.assertEqual((image.format,image.size),("PNG",(1080,1080)))

    def test_rejects_inconsistent_results(self):
        data={"date":(self.now-timedelta(days=1)).date().isoformat(),"source":"track_record","complete":True,
              "summary":{"won":3,"lost":2,"pending":1,"void":0,"total":6}}
        draft=make("results",data,self.now,self.now)
        self.assertIn("3 gagnés · 2 perdus",draft["lines"])
        data["summary"]["total"]=5
        self.assertIsNone(make("results",data,self.now,self.now))

    async def test_channel_requires_approval_and_sends_once(self):
        app.put("a",self.draft,self.now.timestamp())
        send=AsyncMock(return_value={"message_id":19})
        with patch.multiple(app,LIVE=True,VALID_CHANNEL=True,VALID_TOKEN=True,CHANNEL="@testwinpulse",telegram=send):
            self.assertIn("non validé",await app.publish("a"))
            self.assertTrue(app.move("a",("draft",),"approved"))
            await asyncio.gather(app.publish("a"),app.publish("a"))
        self.assertEqual(send.await_count,1)
        self.assertEqual(app.get("a")["telegram_id"],19)

    async def test_ambiguous_delivery_is_not_retried(self):
        app.put("a",self.draft,self.now.timestamp())
        app.move("a",("draft",),"approved")
        send=AsyncMock(side_effect=TimeoutError)
        with patch.multiple(app,LIVE=True,VALID_CHANNEL=True,VALID_TOKEN=True,telegram=send):
            self.assertIn("non confirmée",await app.publish("a"))
            await app.publish("a")
        self.assertEqual(app.get("a")["state"],"review")
        self.assertEqual(send.await_count,1)

    async def test_non_admin_cannot_approve(self):
        app.put("a",self.draft,self.now.timestamp())
        send=AsyncMock()
        with patch.multiple(app,ADMIN={42},telegram=send):
            await app.command({"chat":{"id":7,"type":"private"},"from":{"id":7},"text":"/approve a"})
        self.assertEqual(app.get("a")["state"],"draft")
        send.assert_not_awaited()

    def test_webhook_authenticates_and_deduplicates(self):
        with patch.multiple(app,VALID_TOKEN=True,VALID_SECRET=True,SECRET="x"*32,command=AsyncMock()) as mocks:
            with TestClient(app.app) as client:
                body={"update_id":24,"message":{"text":"/aide"}}
                self.assertEqual(client.post("/telegram/webhook",json=body).status_code,403)
                headers={"X-Telegram-Bot-Api-Secret-Token":"x"*32}
                for _ in range(2):
                    self.assertEqual(client.post("/telegram/webhook",json=body,headers=headers).status_code,200)
            self.assertEqual(app.command.await_count,1)
