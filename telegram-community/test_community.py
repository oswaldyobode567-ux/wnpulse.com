import asyncio
import tempfile
import unittest
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
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
        row = {"result":"pending","home_team":"Lille","away_team":"Le Havre","prediction":pred,"sport_key":"soccer_france_ligue_one"}
        rows = [
            {**row,"commence_time":(self.now-timedelta(minutes=1)).isoformat()},
            {**row,"prediction":{**pred,"locked":True},"commence_time":(self.now+timedelta(minutes=10)).isoformat()},
            {**row,"commence_time":(self.now+timedelta(minutes=30)).isoformat()},
        ]
        draft=make("pick",{"items":rows},self.now,self.now)
        self.assertIn("Cote observée : 1,48",draft["lines"])
        self.assertEqual(draft["visual"]["teams"],["Lille","Le Havre"])
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

    async def test_preview_recovers_current_pick_without_publishing(self):
        now = self.now.replace(hour=21, minute=0)
        key = f"{now:%Y%m%d}-pick"
        upcoming = {"result":"pending","home_team":"Lille","away_team":"Le Havre",
                    "commence_time":(now+timedelta(hours=1)).isoformat(),
                    "prediction":{"free_daily_pick":True,"locked":False,"pick":"Lille","pick_odds":1.48}}
        with patch.object(app,"read",AsyncMock(return_value={"items":[upcoming]})) as read:
            old=f"{now-timedelta(days=1):%Y%m%d}-pick"
            self.assertIsNone(await app.preview_row(old,now))
            row=await app.preview_row(key,now)
            self.assertEqual(row["state"],"draft")
            self.assertIsNone(row["telegram_id"])
            self.assertEqual((await app.preview_row(key,now))["id"],key)
            read.assert_awaited_once_with("/discovery", None)

    async def test_preview_recovers_verified_results_for_previous_day(self):
        now = self.now.replace(hour=21, minute=0)
        key = f"{now:%Y%m%d}-results"
        data = {"date":now.date().isoformat(),"source":"track_record","complete":True,
                "summary":{"won":3,"lost":2,"pending":1,"void":0,"total":6}}
        with patch.object(app,"read",AsyncMock(return_value=data)) as read:
            self.assertIsNone(await app.preview_row(key,now))
            data["date"] = (now.date()-timedelta(days=1)).isoformat()
            row=await app.preview_row(key,now)
            self.assertEqual(row["state"],"draft")
            self.assertIsNone(row["telegram_id"])
            self.assertIn("3 gagnés · 2 perdus",row["payload"])
            self.assertEqual((await app.preview_row(key,now))["id"],key)
            self.assertEqual(read.await_count,2)
            read.assert_awaited_with("/track-record/highlights", {"time_zone":ZONE.key})

    async def test_saved_news_draft_uses_archive_photo_and_credit(self):
        draft = {**self.draft, "kind":"news", "link":"https://wnpulse.com/blog/villarreal-getafe"}
        raw = BytesIO()
        Image.new("RGB", (960, 540), (215, 190, 75)).save(raw, "WEBP", lossless=True)
        article = {"post":{"cover_kind":"archive_photo","cover_credit":{
            "url":"/api/blog/photos/villarreal.webp","caption":"Archives : janvier 2025","author":"FotosLaLiga",
            "source":"https://commons.wikimedia.org/wiki/File:Villarreal.jpg","license":"CC BY-SA 4.0",
            "license_url":"https://creativecommons.org/licenses/by-sa/4.0/"}}}
        def cover_request(request):
            self.assertEqual(str(request.url), app.API.removesuffix("/api")+"/api/blog/photos/villarreal.webp")
            return httpx.Response(200,headers={"content-type":"image/webp"},content=raw.getvalue())
        async with httpx.AsyncClient(transport=httpx.MockTransport(cover_request)) as client:
            with patch.object(app,"read",AsyncMock(return_value=article)) as read:
                photo, credit=await app.news_cover(client,draft)
                read.assert_awaited_once_with("/blog/posts/villarreal-getafe")
                self.assertIn("FotosLaLiga · CC BY-SA 4.0",credit)
                with Image.open(BytesIO(poster(draft,photo))) as rendered:
                    self.assertEqual(rendered.getpixel((540,430)),(215,190,75))
                article["post"]["cover_credit"]["url"]="https://example.org/photo.webp"
                self.assertEqual(await app.news_cover(client,draft),(None,""))

    async def test_pick_uses_its_own_badge_and_results_avoid_generic_photo(self):
        raw = BytesIO()
        Image.new("RGB",(120,120),(50,160,220)).save(raw,"PNG")
        paths=[]
        def badge_request(request):
            paths.append(str(request.url))
            return httpx.Response(200,headers={"content-type":"image/png"},content=raw.getvalue())
        source="https://media.api-sports.io/football/teams/157.png"
        draft={**self.draft,"kind":"pick","lines":["Bayern – Mayence","Pronostic : Bayern","Cote : 1,48"],
               "visual":{"teams":["Bayern","Mayence"],"media":[{"badge":source},{"badge":"https://example.com/logo.png"}]}}
        async with httpx.AsyncClient(transport=httpx.MockTransport(badge_request)) as client:
            loaded=await app.pick_badges(client,draft)
            self.assertIsNone(loaded[1][0])
            with Image.open(BytesIO(poster(draft,None,[entry[0] for entry in loaded]))) as rendered:
                self.assertEqual(rendered.getpixel((324,396)),(50,160,220))
            self.assertEqual(await app.draft_cover(client,{"kind":"results"}),(None,""))
        self.assertEqual(paths,[source])
        self.assertEqual(app.NOTICE,"18+")

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
