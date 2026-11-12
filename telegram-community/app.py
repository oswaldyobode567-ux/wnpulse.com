"""Independent WinPulse community service; the default never publishes."""
import asyncio
import hmac
import hashlib
import html
import json
import logging
import os
import re
import secrets
import sqlite3
import time
import unicodedata
from contextlib import asynccontextmanager, closing
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Request

from editorial import LABELS, LINKS, NOTICE, SLOTS, ZONE, clean, daily_picks, fixture_visual, make, poster, subscription

LOG = logging.getLogger("winpulse.community")
API = "https://wnpulsecom-production.up.railway.app/api"
CATALOGUE_TOKEN = os.getenv("COMMUNITY_CATALOGUE_TOKEN", "").strip()
DB = os.getenv("COMMUNITY_DB", "/data/community.sqlite3")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
CHANNEL = os.getenv("TELEGRAM_CHANNEL_ID", "").strip()
GROUP = os.getenv("TELEGRAM_GROUP_ID", "").strip()
GROUP_ANIMATION = os.getenv("TELEGRAM_GROUP_ANIMATION","").strip().lower()=="true"
RESOLVED_GROUP = None
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
        CREATE TABLE IF NOT EXISTS review_batches(owner INTEGER NOT NULL, kind TEXT NOT NULL,
          keys_json TEXT NOT NULL, PRIMARY KEY(owner,kind));
        CREATE TABLE IF NOT EXISTS editorial_selection(owner INTEGER PRIMARY KEY, batch TEXT NOT NULL,
          options_json TEXT NOT NULL, selected INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS group_binding(id INTEGER PRIMARY KEY CHECK(id=1), chat_id INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS group_activity(chat_id INTEGER NOT NULL, day TEXT NOT NULL, slot TEXT NOT NULL,
          PRIMARY KEY(chat_id,day,slot));
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

async def fetch_cover(client, path):
    raw = bytearray()
    async with client.stream("GET",API.removesuffix("/api")+path) as response:
        response.raise_for_status()
        if response.headers.get("content-type","").split(";")[0].strip() != "image/webp":
            return None
        async for chunk in response.aiter_bytes():
            if len(raw)+len(chunk)>2_000_000:
                return None
            raw.extend(chunk)
    return await asyncio.to_thread(decode_cover,raw)

async def draft_cover(client, draft):
    return await news_cover(client, draft) if draft.get("kind") == "news" else (None, "")

def badge_source(media):
    if not isinstance(media, dict) or media.get("kind") == "portrait":
        return None
    source = str(media.get("url") or media.get("badge") or "")
    return source if re.fullmatch(
        r"https://(?:media(?:-1)?\.api-sports\.io/(?:[a-z]+/)?teams/[0-9]+\.png|crests\.football-data\.org/[a-zA-Z0-9_-]+\.png)",source
    ) else None

def decode_badge(raw):
    from PIL import Image

    with Image.open(BytesIO(raw), formats=("PNG","JPEG")) as image:
        if not 1 <= image.width * image.height <= 4_000_000:
            raise ValueError("Unsupported badge size")
        return image.convert("RGBA")

async def load_badge(client, source):
    if not source:
        return None
    try:
        raw=bytearray()
        async with client.stream("GET",source,timeout=4) as response:
            response.raise_for_status()
            if response.headers.get("content-type","").split(";")[0].strip() not in ("image/png","image/jpeg"):
                return None
            async for chunk in response.aiter_bytes():
                if len(raw)+len(chunk)>800_000:
                    return None
                raw.extend(chunk)
        return await asyncio.to_thread(decode_badge,raw)
    except Exception:
        return None

def portrait_source(media):
    if not isinstance(media, dict) or media.get("kind")!="portrait" or media.get("verified_license") is not True:
        return None, ""
    source = str(media.get("url") or "").split("?",1)[0]
    page = str(media.get("source_url") or "")
    license_name = str(media.get("license") or "")
    license_url = str(media.get("license_url") or "")
    author = clean(media.get("author"),65)
    if not (author and re.fullmatch(r"https://(?:upload|thumb)\.wikimedia\.org/wikipedia/commons/[^\s?#]+\.(?:jpe?g|png)",source,re.I)
            and re.fullmatch(r"https://commons\.wikimedia\.org/wiki/File:[^\s]{1,240}",page)
            and re.fullmatch(r"CC BY(?:-SA)? (?:3|4)\.0",license_name)
            and re.fullmatch(r"https://creativecommons\.org/licenses/by(?:-sa)?/(?:3|4)\.0/?",license_url)):
        return None, ""
    return source, f"{author} · {license_name} · Photo redimensionnée\n{page}\n{license_url}"

async def load_pick_media(client, media):
    badge = badge_source(media)
    portrait, credit = portrait_source(media)
    image = await load_badge(client,badge or portrait)
    return image, credit if image is not None else ""

async def pick_badges(client, draft):
    visual=draft.get("visual") or {}
    if not visual:
        try:
            rows=(await read("/discovery")).get("items",[])
            match=next((r for r in rows if " – ".join(fixture_visual(r)["teams"])==draft["lines"][0]),None)
            if match:
                visual=fixture_visual(match)
                draft["visual"]=visual
        except Exception:
            pass
    return await asyncio.gather(*(load_pick_media(client,media) for media in visual.get("media",[])[:2]))

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
        image = await fetch_cover(client, path)
        if image is None:
            return None, ""
        attribution = ("\n\n"+clean(credit.get("caption"),95)+" · "+clean(credit["author"],65)
                       +" · "+license_name+" · Image recadrée et mise en page\n"+source+"\n"+license_url)
        return image, attribution
    except Exception as exc:
        LOG.info("Article cover unavailable (%s)",type(exc).__name__)
        return None, ""

def format_caption(text):
    def style(line,i):
        safe=html.escape(line,quote=False)
        if (i==0 or " vs " in line or line.startswith(("NOTRE CHOIX","WINPULSE ·","Tendance forte","Scénario partagé"))):
            return f"<b>{safe}</b>"
        return safe
    return "\n".join(style(line,i) for i,line in enumerate(text.splitlines()))

async def sports_hero(client,draft):
    if draft.get("kind")!="pick":
        return None,""
    sport=str((draft.get("visual") or {}).get("sport","")).split("_",1)[0]
    if sport in ("soccer","football"):
        path=Path(__file__).with_name("stadium-editorial.webp")
        if path.is_file():
            try:
                return await asyncio.to_thread(lambda:decode_cover(path.read_bytes())),"AMBIANCE FOOTBALL · ILLUSTRATION IA"
            except Exception:
                pass
    if sport in ("basketball","tennis"):
        try:
            return await fetch_cover(client,f"/api/blog/photos/{sport}.webp"),"PHOTO D’ILLUSTRATION"
        except Exception:
            pass
    return None,""

async def telegram(method, chat, text, draft=None, markup=None):
    params={"chat_id":str(chat)}
    async with httpx.AsyncClient(timeout=14,follow_redirects=False) as client:
        if draft:
            photo, attribution=await draft_cover(client,draft)
            # Do not use licensed photos without their complete credits.
            if len((text+attribution).encode("utf-16-le"))//2>1024:
                photo, attribution=None, ""
            badges=[]
            if draft.get("kind")=="pick":
                for image, credit in await pick_badges(client,draft):
                    extra="\n\n"+credit if credit else ""
                    if len((text+attribution+extra).encode("utf-16-le"))//2>1024:
                        image,extra=None,""
                    badges.append(image)
                    attribution+=extra
            hero,hero_label=await sports_hero(client,draft)
            png=await asyncio.to_thread(poster,draft,photo,badges,hero,hero_label)
            res=await client.post(f"https://api.telegram.org/bot{TOKEN}/sendPhoto",
                data={**params,"caption":format_caption(text+attribution),"parse_mode":"HTML"},files={"photo":("winpulse.png",png,"image/png")})
        else:
            res=await client.post(f"https://api.telegram.org/bot{TOKEN}/{method}",json={**params,"text":text,**({"reply_markup":markup} if markup else {})})
        if res.status_code >= 400:
            raise ValueError("Telegram rejected the request")
        data=res.json()
        if data.get("ok") is not True or not isinstance(data.get("result"),dict):
            raise ValueError("Telegram response not confirmed")
        return data["result"]

def caption(draft):
    if draft.get("kind")=="pick" and draft.get("details"):
        d=draft["details"]
        if not d.get("time_zone"):
            try:
                year=datetime.fromtimestamp(draft["until"],ZONE).year
                start=datetime.strptime(f"{year}/{d['date']}", "%Y/%d/%m · %H:%M")
                start=start.replace(tzinfo=ZoneInfo("Africa/Porto-Novo")).astimezone(ZONE)
                draft["details"]=d={**d,"date":start.strftime("%d/%m · %H:%M"),"time_zone":ZONE.key}
            except (KeyError,ValueError,TypeError,OverflowError):
                pass
        return "\n".join(["WINPULSE · "+("SÉLECTION" if draft.get("admin_pick") else "SÉLECTION GRATUITE"), "", "  vs  ".join(d["teams"]),
            d["competition"], f"📅 {d['date']} · Paris",
            *({"strong":["Tendance forte · estimation"],"shared":["Scénario partagé · estimation"]}.get(d.get("profile"),[])), "",
            f"NOTRE CHOIX → {d['pick']}", f"{d['market']}  |  Cote {d['odds']}",
            *( [f"Chez {d['bookmaker']}"] if d.get("bookmaker") else [] ),
            "", "Découvre les analyses et l’abonnement WinPulse.", draft["link"], "18+"])
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

DRAFT_INPUTS = {
    "pick": ("/discovery", None),
    "results": ("/track-record/highlights", {"time_zone": ZONE.key}),
    "news": ("/blog/posts", {"limit": 12}),
}

def preview_recovery_kind(key, now):
    return next((kind for kind in ("pick", "results") if key == f"{now:%Y%m%d}-{kind}"), None)

async def preview_row(key, now):
    row = get(key)
    kind = preview_recovery_kind(key, now)
    if row is not None or not kind:
        return row
    try:
        path, params = DRAFT_INPUTS[kind]
        draft = make(kind, await read(path, params), now, now)
        if draft:
            hour, minute = SLOTS[kind]
            due = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            put(key, draft, due.timestamp())
        return get(key)
    except Exception as exc:
        LOG.info("On-demand draft %s unavailable (%s)", kind, type(exc).__name__)
        return None

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
            path, params = DRAFT_INPUTS[kind]
            draft=make(kind,await read(path,params),now,max(due,now))
            if draft:
                draft["intro"]=await editorial_intro(kind)
                put(key,draft,due.timestamp())
        except Exception as exc:
            LOG.info("Draft %s unavailable (%s)",kind,type(exc).__name__)

def approve_draft(key, now):
    row=get(key)
    if not row:
        return "Brouillon introuvable. Copie l’identifiant exact dans /drafts."
    state=row["state"]
    if state=="sent":
        if re.fullmatch(r"@[a-zA-Z0-9_]+",CHANNEL) and row["telegram_id"]:
            return f"Déjà publié : https://t.me/{CHANNEL[1:]}/{row['telegram_id']}"
        return "Ce brouillon a déjà été publié."
    if state=="sending":
        return "L’envoi est en cours. Ne relance pas la commande."
    if state=="review":
        return "Telegram n’a pas confirmé l’envoi. Vérifie le canal avant de republier."
    if state=="cancelled":
        return "Ce brouillon a été annulé."
    if state=="expired" or row["expires"]<=now:
        move(key,("draft","approved"),"expired")
        end=datetime.fromtimestamp(row["expires"],ZONE)
        return f"Brouillon expiré depuis le {end:%d/%m à %H:%M} (Paris). Aucun envoi prévu."
    if state not in ("draft","approved"):
        return "Ce brouillon ne peut pas être validé. Consulte /drafts."
    if state=="draft" and not move(key,("draft",),"approved"):
        return "Le statut a changé. Renvoie /approve pour voir le nouvel état."
    prefix = "Déjà validé." if state=="approved" else "Brouillon validé."
    if not (LIVE and VALID_CHANNEL and VALID_TOKEN):
        return prefix+" Publication dans le canal désactivée ou non configurée."
    if row["due"]<=now:
        return prefix+" Envoi au prochain passage du bot, tant que le brouillon est encore valide."
    due=datetime.fromtimestamp(row["due"],ZONE)
    return f"{prefix} Publication prévue le {due:%d/%m à %H:%M} (Paris)."

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

async def bot_request(method, payload):
    async with httpx.AsyncClient(timeout=8,follow_redirects=False) as client:
        response=await client.post(f"https://api.telegram.org/bot{TOKEN}/{method}",json=payload)
        data=response.json()
        if response.status_code>=400 or data.get("ok") is not True:
            raise ValueError("Telegram request rejected")
        return data["result"]

def saved_group():
    with closing(connect()) as con:
        row=con.execute("SELECT chat_id FROM group_binding WHERE id=1").fetchone()
    return row["chat_id"] if row else None

async def resolve_group():
    if not GROUP_ANIMATION or not VALID_TOKEN:
        return None
    explicit=saved_group() or GROUP
    source=explicit or CHANNEL
    if not source:
        return None
    chat=await bot_request("getChat",{"chat_id":source})
    if chat.get("type")=="channel" and not explicit:
        linked=chat.get("linked_chat_id")
        if not linked:
            return None
        chat=await bot_request("getChat",{"chat_id":linked})
    if chat.get("type") not in ("group","supergroup") or type(chat.get("id")) is not int:
        return None
    me=await bot_request("getMe",{})
    member=await bot_request("getChatMember",{"chat_id":chat["id"],"user_id":me["id"]})
    if member.get("status") not in ("member","administrator","creator"):
        return None
    if member.get("status")=="member" and (chat.get("permissions") or {}).get("can_send_messages") is False:
        return None
    return chat["id"]

def reserve_activity(chat, day, slot):
    with closing(connect()) as con,con:
        return con.execute("INSERT OR IGNORE INTO group_activity VALUES(?,?,?)",(chat,day,slot)).rowcount==1

async def animate_group(now):
    chat=RESOLVED_GROUP
    if not GROUP_ANIMATION or chat is None:
        return
    minutes=now.hour*60+now.minute
    day=now.date().isoformat()
    if 12*60+30<=minutes<12*60+40 and reserve_activity(chat,day,"discussion"):
        messages=[
            "👋 Bonjour l’équipe ! Quelle rencontre suivez-vous aujourd’hui, et quel détail pourrait faire la différence ?",
            "👋 Le débat du jour : quel joueur ou quelle équipe vous intrigue le plus aujourd’hui ?",
            "👋 À vous la parole : quelle rencontre mérite qu’on regarde au-delà du score ?",
        ]
        await telegram("sendMessage",chat,messages[now.toordinal()%len(messages)])
    if 20*60<=minutes<20*60+10 and reserve_activity(chat,day,"poll"):
        question,choices=[
            ("Quel sport suivez-vous ce soir ?",["Football","Basket","Tennis","Autre"]),
            ("Quelle analyse vous intéresse le plus ?",["Forme récente","Compositions","Confrontations","Statistiques"]),
            ("Vous suivez plutôt quel type de rencontre ?",["Championnat","Coupe","Match international","Je découvre"]),
        ][now.toordinal()%3]
        await bot_request("sendPoll",{"chat_id":chat,"question":question,"options":[{"text":option} for option in choices],"is_anonymous":True})

async def group_scheduler():
    global RESOLVED_GROUP
    retry=0.0
    while True:
        try:
            if time.monotonic()>=retry:
                retry=time.monotonic()+600
                RESOLVED_GROUP=await resolve_group()
                LOG.info("Group animation: %s","ready" if RESOLVED_GROUP is not None else "no eligible group")
            await animate_group(datetime.now(ZONE))
        except Exception as exc:
            LOG.warning("Group activity unavailable (%s)",type(exc).__name__)
        await asyncio.sleep(60)

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
    tasks=[asyncio.create_task(scheduler())]
    if GROUP_ANIMATION:
        tasks.append(asyncio.create_task(group_scheduler()))
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)

app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)

@app.get("/health")
async def health():
    return {"ok":True,"telegram_configured":VALID_SECRET and VALID_TOKEN and bool(ADMIN),
            "channel_configured":VALID_CHANNEL,"channel_publication_enabled":LIVE and VALID_CHANNEL,
            "group_animation_ready":GROUP_ANIMATION and RESOLVED_GROUP is not None}

def natural_intent(text):
    normalized=unicodedata.normalize("NFKD",text.lower())
    normalized=" ".join(re.findall(r"[a-z0-9]+","".join(c for c in normalized if not unicodedata.combining(c))))
    for prefix in ("bonjour ", "salut ", "donne moi ", "montre moi ", "je veux ", "envoie moi "):
        if normalized.startswith(prefix):
            normalized=normalized[len(prefix):]
    normalized=re.sub(r" (?:stp|s il te plait)$","",normalized)
    groups={
        "/show_picks":("pronostic","pronostics","prono","pronos","pronostic du jour","pronostics du jour",
                       "les pronostics","les pronostics du jour","pronostics disponibles","les pronostics disponibles",
                       "pronos du jour","pronostique","pronostiques","pronostiques du jour"),
        "/show_results":("resultat","resultats","les resultats","resultats du jour","les resultats du jour","bilan","bilan du jour","resultats d hier"),
        "/show_news":("actualite","actualites","actu","news","les actualites"),
        "/drafts":("brouillon","brouillons","mes brouillons"),
        "/pro":("abonnement","abonnements","tarif","tarifs","prix","passer pro"),
        "/start":("aide","menu","bonjour","salut"),
        "/publish_picks":("publier les pronostics","valider les pronostics","publie les pronostics"),
        "/publish_results":("publier les resultats","valider les resultats","publie les resultats"),
        "/publish_news":("publier l actualite","valider l actualite"),
    }
    return next((name for name,aliases in groups.items() if normalized in aliases),None)

def review_draft(draft, now):
    prefix=now.strftime("%Y%m%d")+"-"
    # Reuse an existing approval/publication for the exact same displayed content.
    with closing(connect()) as con:
        existing=con.execute("SELECT id,payload FROM drafts WHERE id LIKE ? AND state IN ('draft','approved','sent')",
                             (prefix+"%",)).fetchall()
    for row in existing:
        previous=json.loads(row["payload"])
        if previous.get("kind")==draft["kind"] and previous.get("lines")==draft["lines"]:
            return row["id"]
    digest=hashlib.sha256(json.dumps([draft["kind"],draft["lines"]],ensure_ascii=False).encode()).hexdigest()[:12]
    key=prefix+draft["kind"]+"-"+digest
    put(key,draft,now.timestamp())
    return key

async def admin_catalogue():
    if len(CATALOGUE_TOKEN)<32:
        raise ValueError("Catalogue not configured")
    async with httpx.AsyncClient(timeout=12,follow_redirects=False) as client:
        response=await client.get(API+"/internal/community/shortlist",
                                  headers={"X-WNPulse-Community-Key":CATALOGUE_TOKEN})
        response.raise_for_status()
        data=response.json()
    if not isinstance(data,dict) or data.get("scope")!="community_admin" or not isinstance(data.get("items"),list):
        raise ValueError("Unexpected catalogue response")
    return data["items"][:10]

def selection_menu(batch, options, selected):
    rows=[]
    for index,(_, label) in enumerate(options):
        mark="✅" if selected & (1<<index) else "⬜"
        rows.append([{"text":f"{mark} {index+1}. {label}", "callback_data":f"wp:{batch}:{index}"}])
    count=selected.bit_count()
    if count:
        rows.append([{"text":f"Publier sur @wnplus ({count})","callback_data":f"wp:{batch}:publish"}])
    return {"inline_keyboard":rows}

async def telegram_action(method, payload):
    async with httpx.AsyncClient(timeout=6,follow_redirects=False) as client:
        res=await client.post(f"https://api.telegram.org/bot{TOKEN}/{method}",json=payload)
        if res.status_code>=400 or res.json().get("ok") is not True:
            raise ValueError("Telegram interaction not confirmed")

def choose_editorial(owner, batch, action):
    with closing(connect()) as con, con:
        con.execute("BEGIN IMMEDIATE")
        row=con.execute("SELECT * FROM editorial_selection WHERE owner=? AND batch=?",(owner,batch)).fetchone()
        if not row:
            return None
        options=json.loads(row["options_json"])
        selected=row["selected"]
        if action=="publish":
            if not selected:
                return ("empty",options,selected)
            con.execute("DELETE FROM editorial_selection WHERE owner=? AND batch=?",(owner,batch))
            return ("publish",options,selected)
        i=int(action)
        if i>=len(options):
            return None
        selected ^= 1<<i
        con.execute("UPDATE editorial_selection SET selected=? WHERE owner=? AND batch=?",(selected,owner,batch))
        return ("toggle",options,selected)

async def callback(query):
    user=query.get("from") or {}
    message=query.get("message") or {}
    chat=message.get("chat") or {}
    owner=user.get("id")
    match=re.fullmatch(r"wp:([a-f0-9]{12}):(publish|[0-9])",str(query.get("data") or ""))
    if not match or user.get("is_bot") or owner not in ADMIN or chat.get("type")!="private" or chat.get("id")!=owner:
        return
    batch,action=match.groups()
    chosen=choose_editorial(owner,batch,action)
    info={"callback_query_id":query["id"]}
    if chosen is None:
        await telegram_action("answerCallbackQuery",{**info,"text":"Cette liste n’est plus active."})
        return
    state,options,selected=chosen
    if state=="empty":
        await telegram_action("answerCallbackQuery",{**info,"text":"Coche au moins une sélection."})
        return
    if state=="publish":
        now=time.time()
        results=[f"{i+1}. {approve_draft(key,now)}" for i,(key,_) in enumerate(options) if selected & (1<<i)]
        await telegram_action("answerCallbackQuery",{**info,"text":"Sélection enregistrée."})
        await telegram_action("editMessageReplyMarkup",{"chat_id":owner,"message_id":message["message_id"],"reply_markup":{"inline_keyboard":[]}})
        await telegram("sendMessage",owner,"\n\n".join(results))
    else:
        await telegram_action("answerCallbackQuery",{**info,"text":f"{selected.bit_count()} sélection(s)"})
        await telegram_action("editMessageReplyMarkup",{"chat_id":owner,"message_id":message["message_id"],
                              "reply_markup":selection_menu(batch,options,selected)})

async def show_admin_picks(chat_id):
    with closing(connect()) as con,con:
        con.execute("DELETE FROM editorial_selection WHERE owner=?",(chat_id,))
    now=datetime.now(ZONE)
    try:
        items=await admin_catalogue()
        drafts=[draft for row in items if (draft:=make("pick",{"items":[row]},now,now,admin=True))]
    except Exception as exc:
        LOG.info("Admin catalogue unavailable (%s)",type(exc).__name__)
        await telegram("sendMessage",chat_id,"Le catalogue administrateur est indisponible pour le moment. Réessaie dans quelques instants.")
        return
    if not drafts:
        await telegram("sendMessage",chat_id,"Aucune sélection à venir ne répond aux critères de la liste.")
        return
    await telegram("sendMessage",chat_id,f"{len(drafts)} propositions du catalogue WinPulse. Tendances fortes en tête, puis scénarios partagés. Rien ne sera envoyé sans ton choix.")
    options=[]
    for i,draft in enumerate(drafts,1):
        key=review_draft(draft,now)
        await telegram("sendPhoto",chat_id,f"{i}/{len(drafts)}\n"+caption(draft),draft)
        options.append((key,clean(" – ".join(draft["details"]["teams"]),57)))
    batch=secrets.token_hex(6)
    with closing(connect()) as con,con:
        con.execute("INSERT OR REPLACE INTO editorial_selection(owner,batch,options_json) VALUES(?,?,?)",(chat_id,batch,json.dumps(options)))
    await telegram("sendMessage",chat_id,"Coche les matchs à envoyer, puis appuie sur « Publier sur @wnplus ».",markup=selection_menu(batch,options,0))

async def show_current(chat_id, kind, is_admin):
    if kind=="pick" and is_admin:
        await show_admin_picks(chat_id)
        return
    now=datetime.now(ZONE)
    path,params=DRAFT_INPUTS[kind]
    try:
        data=await read(path,params)
        if kind=="pick":
            drafts=daily_picks(data,now,now)
        else:
            draft=make(kind,data,now,now)
            drafts=[draft] if draft else []
    except Exception as exc:
        LOG.info("Current content unavailable (%s)",type(exc).__name__)
        await telegram("sendMessage",chat_id,"WinPulse ne répond pas pour le moment. Réessaie dans quelques instants.")
        return
    if not drafts:
        if is_admin:
            with closing(connect()) as con,con:
                con.execute("DELETE FROM review_batches WHERE owner=? AND kind=?",(chat_id,kind))
        answer={"pick":"Aucun pronostic gratuit à venir n’est disponible actuellement. Les matchs déjà commencés ne sont pas proposés.",
                "results":"Le bilan de la veille n’est pas encore disponible.",
                "news":"Aucune actualité récente disponible pour le moment."}[kind]
        await telegram("sendMessage",chat_id,answer)
        return
    # Public discovery has a small daily allowance. Never disclose Pro picks or silently truncate.
    if len(drafts)>10:
        await telegram("sendMessage",chat_id,"La liste est trop longue pour un seul envoi. Consulte les sélections à jour : "+LINKS["pick"])
        return
    count=len(drafts)
    heading=(f"{count} pronostic{'s' if count>1 else ''} gratuit{'s' if count>1 else ''} à venir · heure de Paris.\n"
             "Une carte par match, dans l’ordre des horaires. Ce sont des sélections individuelles."
             if kind=="pick" else "Voici le bilan de la veille, avec tous les statuts." if kind=="results" else "Voici la dernière actualité.")
    await telegram("sendMessage",chat_id,heading+("\nAperçus privés : rien n’est encore publié sur @wnplus." if is_admin else ""))
    keys=[]
    for i,draft in enumerate(drafts,1):
        key=review_draft(draft,now) if is_admin else None
        await telegram("sendPhoto",chat_id,f"{i}/{count}\n"+caption(draft),draft)
        if key:
            keys.append(key)
    if is_admin:
        with closing(connect()) as con,con:
            con.execute("INSERT INTO review_batches VALUES(?,?,?) ON CONFLICT(owner,kind) DO UPDATE SET keys_json=excluded.keys_json",
                        (chat_id,kind,json.dumps(keys)))
        phrase={"pick":"publier les pronostics","results":"publier les résultats","news":"publier l’actualité"}[kind]
        await telegram("sendMessage",chat_id,f"Ces {count} aperçu(s) sont prêts. Écris « {phrase} » pour valider leur envoi sur @wnplus.\nTu peux aussi écrire « pronostics du jour », « résultats » ou « actualités ».")

def approve_review(owner, kind):
    if kind=="pick":
        return "Écris « pronostics du jour », coche tes choix puis appuie sur « Publier sur @wnplus »."
    with closing(connect()) as con:
        row=con.execute("SELECT keys_json FROM review_batches WHERE owner=? AND kind=?",(owner,kind)).fetchone()
    if not row:
        return "Commence par demander les pronostics, les résultats ou les actualités pour les vérifier en privé."
    now=time.time()
    keys=json.loads(row["keys_json"])
    return "\n\n".join(approve_draft(key,now) for key in keys[:10])

async def command(message):
    chat=message.get("chat") or {}
    user=message.get("from") or {}
    if type(chat.get("id")) is not int:
        return
    global RESOLVED_GROUP
    chat_id=chat["id"]
    private=chat.get("type")=="private"
    is_group=chat.get("type") in {"group","supergroup"}
    text=str(message.get("text") or "").strip()
    binding_command=text.lower() in ("/lier",f"/lier@{USERNAME}")
    if binding_command and private and user.get("id") in ADMIN:
        await telegram("sendMessage",chat_id,"Ouvre le groupe privé WinPlus, puis envoie la commande /lier directement dans le groupe avec ton profil Telegram.")
        return
    if binding_command and is_group:
        if message.get("sender_chat"):
            await telegram("sendMessage",chat_id,"Envoie /lier avec ton profil Telegram personnel pour que je puisse vérifier tes droits.")
            return
        if user.get("is_bot"):
            return
        if user.get("id") not in ADMIN:
            await telegram("sendMessage",chat_id,"Seul un administrateur WinPlus autorisé peut relier ce groupe.")
            return
        if not GROUP_ANIMATION:
            await telegram("sendMessage",chat_id,"Le réglage d’animation du groupe est désactivé sur le serveur.")
            return
        try:
            member=await bot_request("getChatMember",{"chat_id":chat_id,"user_id":user["id"]})
        except Exception:
            await telegram("sendMessage",chat_id,"Impossible de vérifier tes droits dans ce groupe. Vérifie que je suis bien administrateur du groupe.")
            return
        if member.get("status") not in {"administrator","creator"}:
            await telegram("sendMessage",chat_id,"La commande /lier doit être envoyée par un administrateur de ce groupe.")
            return
        with closing(connect()) as con,con:
            con.execute("INSERT OR REPLACE INTO group_binding(id,chat_id) VALUES(1,?)",(chat_id,))
        RESOLVED_GROUP=chat_id
        await telegram("sendMessage",chat_id,"Le groupe est relié à WinPulse. J’y accueillerai les nouveaux membres et lancerai les rendez-vous de discussion.")
        return
    if user.get("is_bot"):
        return
    group=is_group and chat_id==RESOLVED_GROUP
    if not (private or group):
        return
    is_admin=private and user.get("id") in ADMIN
    if group and message.get("new_chat_members"):
        members=[clean(m.get("first_name"),30) for m in message["new_chat_members"][:5] if isinstance(m,dict) and not m.get("is_bot")]
        if members:
            await telegram("sendMessage",chat_id,"👋 Bienvenue "+", ".join(members)+" ! Quel sport ou quelle équipe suis-tu ? Utilise /aide pour découvrir le groupe.")
        return
    parts=text.split(maxsplit=1)
    if not parts:
        return
    if parts[0].startswith("/"):
        name, _, addressed = parts[0].lower().partition("@")
        if addressed and addressed != USERNAME:
            return
        arg=parts[1].strip() if len(parts)>1 else ""
    else:
        addressed_group=group and USERNAME and re.search(rf"(?<!\w)@{re.escape(USERNAME)}\b",text,flags=re.I)
        reply=(message.get("reply_to_message") or {}).get("from") or {}
        reply_to_bot=group and reply.get("is_bot") is True and str(reply.get("username","")).lower()==USERNAME
        cleaned=re.sub(rf"@{re.escape(USERNAME)}\b","",text,flags=re.I) if addressed_group else text
        name=natural_intent(cleaned) if private or addressed_group or reply_to_bot else None
        if group:
            name={"/show_picks":"/pronos","/show_results":"/resultats","/show_news":"/actu"}.get(name,name)
        arg=""
        if not name:
            if private:
                await telegram("sendMessage",chat_id,"Écris « pronostics du jour », « résultats », « actualités » ou « abonnement ». Je te montrerai le contenu disponible.")
            return
    if private and name in ("/show_picks","/pronos","/pronostic","/pronostics","/show_results","/resultats","/show_news","/actu"):
        kind="pick" if name in ("/show_picks","/pronos","/pronostic","/pronostics") else "results" if name in ("/show_results","/resultats") else "news"
        await show_current(chat_id,kind,is_admin)
        return
    if name in ("/publish_picks","/publish_results","/publish_news"):
        if is_admin:
            kind={"/publish_picks":"pick","/publish_results":"results","/publish_news":"news"}[name]
            await telegram("sendMessage",chat_id,approve_review(chat_id,kind))
        return
    answer=""
    if group and name in {"/start","/aide"}:
        answer="Bienvenue dans le groupe WinPulse !\n\n/pronos · Sélections gratuites\n/resultats · Bilan complet\n/actu · Actualités\n/pro · Abonnement"
    elif name in {"/start","/aide"}:
        answer=f"Bienvenue sur WinPulse !\n\nÉcris simplement :\n• Pronostics du jour\n• Résultats\n• Actualités\n• Abonnement\n\n{LINKS['start']}"
        if is_admin:
            answer+="\n\nTu es administrateur : coche les pronostics à publier. Pour le bilan, écris « publier les résultats » après avoir vu la carte. Les anciennes commandes restent disponibles."
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
        answer="Brouillons et historique (heure de Paris)\n"+"\n".join(f"{r['id']} · {r['state']} · {datetime.fromtimestamp(r['due'],ZONE):%d/%m %H:%M}" for r in rows) if rows else "Aucun brouillon pour l’instant."
    elif is_admin and name=="/preview":
        now=datetime.now(ZONE)
        row=await preview_row(arg, now)
        if not row:
            message = {
                "pick": "Aucun pronostic gratuit à venir n’a pu être préparé. Réessaie plus tard.",
                "results": "Le bilan de la veille n’a pas pu être préparé à partir du Track Record. Réessaie plus tard.",
            }.get(preview_recovery_kind(arg, now), "Brouillon introuvable. Consulte /drafts.")
            await telegram("sendMessage",chat_id,message)
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
        answer=approve_draft(arg,time.time())
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
        elif isinstance(update.get("callback_query"),dict):
            await callback(update["callback_query"])
    except Exception as exc:
        LOG.warning("Telegram reply unconfirmed (%s)",type(exc).__name__)
    return {"ok":True}
