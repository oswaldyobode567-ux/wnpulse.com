"""Independent WinPulse community service; the default never publishes."""
import asyncio
import hmac
import json
import logging
import os
import re
import sqlite3
import time
from contextlib import asynccontextmanager, closing
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request

from editorial import LABELS, LINKS, NOTICE, SLOTS, ZONE, clean, make, poster, subscription

LOG = logging.getLogger("winpulse.community")
API = "https://wnpulsecom-production.up.railway.app/api"
DB = os.getenv("COMMUNITY_DB", "/data/community.sqlite3")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
CHANNEL = os.getenv("TELEGRAM_CHANNEL_ID", "").strip()
GROUP = os.getenv("TELEGRAM_GROUP_ID", "").strip()
USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@").lower()
ADMIN = {int(s) for s in os.getenv("TELEGRAM_ADMIN_IDS", "").split(",") if s.strip().isdigit()}
LIVE = os.getenv("TELEGRAM_CHANNEL_PUBLISH", "").strip().lower() == "true"
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
VALID_TOKEN = bool(re.fullmatch(r"\d+:[A-Za-z0-9_-]{20,}", TOKEN))
VALID_SECRET = bool(re.fullmatch(r"[A-Za-z0-9_-]{32,256}", SECRET))
VALID_CHANNEL = bool(re.fullmatch(r"(?:@[A-Za-z0-9_]{5,}|-100\d+)", CHANNEL))

def connect():
    con = sqlite3.connect(DB, timeout=4)
    con.row_factory = sqlite3.Row
    return con

def setup():
    Path(DB).parent.mkdir(parents=True,exist_ok=True)
    with closing(connect()) as con, con:
        con.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL,
          due REAL NOT NULL, expires REAL NOT NULL, telegram_id INTEGER);
        CREATE TABLE IF NOT EXISTS updates(id INTEGER PRIMARY KEY, received REAL NOT NULL);
        """)

def put(key, draft, due):
    with closing(connect()) as con, con:
        con.execute("INSERT OR IGNORE INTO drafts VALUES(?,?,'draft',?,?,NULL)",
                    (key,json.dumps(draft,ensure_ascii=False),due,draft["until"]))

def get(key):
    with closing(connect()) as con:
        return con.execute("SELECT * FROM drafts WHERE id=?",(key,)).fetchone()

def move(key, allowed, state, telegram_id=None):
    with closing(connect()) as con, con:
        result = con.execute("UPDATE drafts SET state=?,telegram_id=? WHERE id=? AND state IN ("+
            ",".join("?" for _ in allowed)+")",(state,telegram_id,key,*allowed))
        return result.rowcount == 1

def take_update(uid):
    with closing(connect()) as con, con:
        now=time.time()
        con.execute("DELETE FROM updates WHERE received < ?",(now-7*86400,))
        return con.execute("INSERT OR IGNORE INTO updates VALUES (?,?)",(uid,now)).rowcount == 1

async def read(path, params=None):
    async with httpx.AsyncClient(timeout=12,follow_redirects=False) as client:
        res=await client.get(API+path,params=params)
        res.raise_for_status()
        return res.json()

def decode_cover(raw):
    from PIL import Image, ImageOps

    with Image.open(BytesIO(raw), formats=("WEBP",)) as image:
        if not 1 <= image.width * image.height <= 12_000_000:
            raise ValueError("Unsupported image size")
        return ImageOps.exif_transpose(image).convert("RGB")

async def news_cover(client, draft):
    if draft.get("kind") != "news":
        return None, ""
    slug = re.fullmatch(r"/blog/([a-z0-9-]{4,160})", urlsplit(draft["link"]).path)
    if not slug:
        return None, ""
    try:
        article = (await read("/blog/posts/"+slug[1])).get("post", {})
        credit = article.get("cover_credit") or {}
        # Only WinPulse-hosted archives with known reuse rights. Never follow an external URL.
        path = credit.get("url", "")
        if (article.get("cover_kind") != "archive_photo"
                or not re.fullmatch(r"/api/blog/photos/[a-z0-9-]{1,60}\.webp",path)
                or not clean(credit.get("author"),65)):
            return None, ""
        source, license_url = credit.get("source",""), credit.get("license_url","")
        license_name = credit.get("license","")
        if (not re.fullmatch(r"https://commons\.wikimedia\.org/wiki/File:[^\s]{1,240}",source)
                or not re.fullmatch(r"https://creativecommons\.org/licenses/by-sa/(?:3|4)\.0/",license_url)
                or not re.fullmatch(r"CC BY-SA (?:3|4)\.0",license_name)):
            return None, ""
        raw = bytearray()
        async with client.stream("GET",API.removesuffix("/api")+path) as response:
            response.raise_for_status()
            if response.headers.get("content-type","").split(";")[0].strip() != "image/webp":
                return None, ""
            async for chunk in response.aiter_bytes():
                if len(raw)+len(chunk)>2_000_000:
                    return None, ""
                raw.extend(chunk)
        image = await asyncio.to_thread(decode_cover,raw)
        attribution = ("\n\n"+clean(credit.get("caption"),95)+" · "+clean(credit["author"],65)
                       +" · "+license_name+" · Image recadrée et mise en page\n"+source+"\n"+license_url)
        return image, attribution
    except Exception as exc:
        LOG.info("Article cover unavailable (%s)",type(exc).__name__)
        return None, ""

async def telegram(method, chat, text, draft=None):
    params={"chat_id":str(chat)}
    async with httpx.AsyncClient(timeout=14,follow_redirects=False) as client:
        if draft:
            photo, attribution=await news_cover(client,draft)
            # If full attribution would not fit, keep the text-only card.
            if len((text+attribution).encode("utf-16-le"))//2>1024:
                photo, attribution=None, ""
            png=await asyncio.to_thread(poster,draft,photo)
            res=await client.post(f"https://api.telegram.org/bot{TOKEN}/sendPhoto",
                data={**params,"caption":text+attribution},files={"photo":("winpulse.png",png,"image/png")})
        else:
            res=await client.post(f"https://api.telegram.org/bot{TOKEN}/{method}",json={**params,"text":text})
        if res.status_code >= 400:
            raise ValueError("Telegram rejected the request")
        data=res.json()
        if data.get("ok") is not True or not isinstance(data.get("result"),dict):
            raise ValueError("Telegram response not confirmed")
        return data["result"]

def caption(draft):
    return "\n".join([draft["title"], *( [draft["intro"]] if draft.get("intro") else []),
                      "", *draft["lines"], "", draft["link"], NOTICE])

async def editorial_intro(kind):
    """Optional editorial line only. Never send external articles or user messages to the model."""
    if not GEMINI_KEY or not re.fullmatch(r"[A-Za-z0-9_.-]{4,80}",GEMINI_MODEL):
        return ""
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            res=await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                headers={"x-goog-api-key":GEMINI_KEY},
                json={"contents":[{"parts":[{"text":f"Une accroche éditoriale française sobre, 4 à 10 mots, pour introduire une publication WinPulse : {LABELS[kind]}. Sans chiffres, résultats, promesses, incitation à miser, ni liens. Écris uniquement l’accroche."}]}],
                      "generationConfig":{"maxOutputTokens":120}})
        res.raise_for_status()
        raw=res.json()["candidates"][0]["content"]["parts"]
        line=clean(" ".join(p.get("text","") for p in raw if not p.get("thought")),90)
        if re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿœŒ’' ,.!?:–-]{6,90}",line) and not re.search(
            r"gagn|garanti|profit|argent|certain|mise|jackpot|pari sûr",line,re.I):
            return line
    except Exception as exc:
        LOG.info("Editorial intro unavailable (%s)",type(exc).__name__)
    return ""

async def prepare(now):
    for kind,(hour,minute) in SLOTS.items():
        due=now.replace(hour=hour,minute=minute,second=0,microsecond=0)
        # Give operators up to three hours to review; retry unavailable sources.
        if not due-timedelta(hours=3) <= now <= due+timedelta(hours=2):
            continue
        key=f"{now:%Y%m%d}-{kind}"
        if get(key):
            continue
        try:
            path, params = {"pick":("/discovery",None),"news":("/blog/posts",{"limit":12}),
                "results":("/track-record/highlights",{"time_zone":ZONE.key})}[kind]
            draft=make(kind,await read(path,params),now,max(due,now))
            if draft:
                draft["intro"]=await editorial_intro(kind)
                put(key,draft,due.timestamp())
        except Exception as exc:
            LOG.info("Draft %s unavailable (%s)",kind,type(exc).__name__)

async def publish(key):
    if not (LIVE and VALID_CHANNEL and VALID_TOKEN):
        return "Publication désactivée."
    row=get(key)
    if not row or row["state"]!="approved":
        return "Brouillon indisponible ou non validé."
    if row["expires"]<=time.time():
        move(key,("approved",),"expired")
        return "Ce brouillon a expiré."
    if not move(key,("approved",),"sending"):
        return "Déjà pris en charge."
    try:
        draft=json.loads(row["payload"])
        result=await telegram("sendPhoto",CHANNEL,caption(draft),draft)
        if type(result.get("message_id")) is not int:
            raise ValueError("Unconfirmed publication")
        move(key,("sending",),"sent",result["message_id"])
        return "Publication envoyée."
    except Exception as exc:
        LOG.warning("Publication %s unconfirmed (%s)",key,type(exc).__name__)
        move(key,("sending",),"review")
        return "Publication non confirmée. Vérifie le canal ; aucun renvoi automatique."

async def scheduler():
    while True:
        try:
            now=datetime.now(ZONE)
            await prepare(now)
            if LIVE:
                with closing(connect()) as con:
                    keys=[r[0] for r in con.execute("SELECT id FROM drafts WHERE state='approved' AND due<=?",(now.timestamp(),))]
                for key in keys:
                    await publish(key)
        except Exception as exc:
            LOG.warning("Scheduler: %s",type(exc).__name__)
        await asyncio.sleep(90)

@asynccontextmanager
async def lifespan(app):
    setup()
    task=asyncio.create_task(scheduler())
    try:
        yield
    finally:
        task.cancel()
        await asyncio.gather(task,return_exceptions=True)

app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)

@app.get("/health")
async def health():
    return {"ok":True,"telegram_configured":VALID_SECRET and VALID_TOKEN and bool(ADMIN),
            "channel_configured":VALID_CHANNEL,"channel_publication_enabled":LIVE and VALID_CHANNEL}

async def command(message):
    chat=message.get("chat") or {}
    user=message.get("from") or {}
    if user.get("is_bot") or type(chat.get("id")) is not int:
        return
    chat_id=chat["id"]
    private=chat.get("type")=="private"
    group=str(chat_id)==GROUP and chat.get("type") in {"group","supergroup"}
    if not (private or group):
        return
    is_admin=private and user.get("id") in ADMIN
    text=str(message.get("text") or "")
    if group and message.get("new_chat_members"):
        members=[clean(m.get("first_name"),30) for m in message["new_chat_members"][:5] if isinstance(m,dict) and not m.get("is_bot")]
        if members:
            await telegram("sendMessage",chat_id,"Bienvenue "+", ".join(members)+" ! Consulte /aide pour découvrir WinPulse.")
        return
    parts=text.split(maxsplit=1)
    if not parts or not parts[0].startswith("/"):
        return
    name, _, addressed = parts[0].lower().partition("@")
    if addressed and addressed != USERNAME:
        return
    arg=parts[1].strip() if len(parts)>1 else ""
    answer=""
    if name in {"/start","/aide"}:
        answer=f"Bienvenue sur WinPulse ! /pronos pour les sélections gratuites, /pro pour l’abonnement et /resultats pour le suivi.\n{LINKS['start']}"
        if is_admin:
            answer+="\nAdministration : /drafts, /preview ID, /approve ID, /cancel ID, /promo TEXTE, /rappel TEXTE."
    elif private and name=="/id":
        answer=f"Ton identifiant Telegram : {chat_id}. Ajoute-le à TELEGRAM_ADMIN_IDS si tu es propriétaire."
    elif name=="/actu":
        answer="Les actualités et les guides WinPulse sont ici :\n"+LINKS["news"]
    elif name=="/pro":
        try:
            answer=subscription(await read("/plans"))
        except Exception:
            answer=subscription([])
        answer+="\n"+LINKS["pro"]
    elif name=="/pronos":
        answer="Découvre les sélections gratuites sur WinPulse.\n"+LINKS["pick"]+"\n"+NOTICE
    elif name=="/resultats":
        answer="Retrouve l’historique complet, avec gagnés, perdus et annulés.\n"+LINKS["results"]
    elif is_admin and name=="/drafts":
        with closing(connect()) as con:
            rows=con.execute("SELECT id,state,due FROM drafts ORDER BY due DESC LIMIT 12").fetchall()
        answer="Brouillons et historique (heure de Porto-Novo)\n"+"\n".join(f"{r['id']} · {r['state']} · {datetime.fromtimestamp(r['due'],ZONE):%d/%m %H:%M}" for r in rows) if rows else "Aucun brouillon pour l’instant."
    elif is_admin and name=="/preview":
        row=get(arg)
        if not row:
            await telegram("sendMessage",chat_id,"Brouillon introuvable. Consulte /drafts.")
            return
        draft=json.loads(row["payload"])
        await telegram("sendPhoto",chat_id,"APERÇU PRIVÉ · "+arg+"\n"+caption(draft),draft)
        return
    elif is_admin and name in {"/promo","/rappel"}:
        line=clean(arg,300)
        if not line:
            answer="Ajoute le texte et précise les conditions si c’est une promotion."
        else:
            import secrets
            now=datetime.now(ZONE)
            kind="promo" if name=="/promo" else "guide"
            key=f"{now:%Y%m%d}-{kind}-{secrets.token_hex(3)}"
            due=now.replace(hour=18,minute=30,second=0,microsecond=0)
            if due<=now:
                due=now+timedelta(minutes=15)
            put(key,{"kind":kind,"title":LABELS[kind],"lines":[line],"link":LINKS[kind], "intro":await editorial_intro(kind),
                     "until":(due+timedelta(hours=6)).timestamp()},due.timestamp())
            answer=f"Brouillon {key} pour {due:%d/%m à %H:%M}. /preview {key} puis /approve {key}."
    elif is_admin and name=="/approve":
        row=get(arg)
        answer=("Brouillon validé ; publication prévue à l’heure indiquée (ou au prochain passage si dépassée)."
                if row and row["expires"]>time.time() and move(arg,("draft",),"approved")
                else "Brouillon indisponible, déjà traité ou expiré.")
        if not LIVE and row:
            answer+=" Publication canal désactivée pour ce service."
    elif is_admin and name=="/cancel":
        answer="Brouillon annulé." if move(arg,("draft","approved"),"cancelled") else "Brouillon non annulable."
    if answer:
        await telegram("sendMessage",chat_id,answer)

@app.post("/telegram/webhook")
async def webhook(request:Request):
    if not VALID_TOKEN or not VALID_SECRET:
        raise HTTPException(503,"Bot unavailable")
    supplied=request.headers.get("x-telegram-bot-api-secret-token","")
    if not hmac.compare_digest(supplied.encode(),SECRET.encode()):
        raise HTTPException(403,"Forbidden")
    chunks=[]
    size=0
    async for chunk in request.stream():
        size+=len(chunk)
        if size>128_000:
            raise HTTPException(413,"Payload too large")
        chunks.append(chunk)
    try:
        update=json.loads(b"".join(chunks))
    except (ValueError,UnicodeError):
        raise HTTPException(400,"Invalid update") from None
    if not isinstance(update,dict) or type(update.get("update_id")) is not int:
        raise HTTPException(400,"Invalid update")
    if not take_update(update["update_id"]):
        return {"ok":True}
    try:
        if isinstance(update.get("message"),dict):
            await command(update["message"])
    except Exception as exc:
        LOG.warning("Telegram reply unconfirmed (%s)",type(exc).__name__)
    return {"ok":True}
