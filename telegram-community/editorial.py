"""Editorial inputs: public WinPulse data, never private picks or chat history."""
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

SITE = "https://wnpulse.com"
ZONE = ZoneInfo("Africa/Porto-Novo")
LINKS = {name: f"{SITE}/{path}?utm_source=telegram&utm_medium=community"
         for name, path in {"pick":"app", "results":"resultats", "news":"blog",
                            "pro":"app/abonnement", "start":"register", "guide":"blog", "promo":"app/abonnement"}.items()}
NOTICE = "18+"
LABELS = {"pick":"Sélection gratuite", "results":"Bilan des pronostics", "news":"Actualité sportive",
          "guide":"Comprendre WinPulse", "promo":"Offre WinPulse"}
SLOTS = {"results": (8, 30), "pick": (12, 0), "news": (18, 0)}

def clean(value, limit=180):
    return " ".join(str(value or "").split())[:limit].strip()

def stamp(value):
    if not isinstance(value, str):
        return None
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return date if date.tzinfo else None
    except ValueError:
        return None

def fixture_visual(row):
    return {"teams":[clean(row.get("home_team"),75),clean(row.get("away_team"),75)],
            "sport":clean(row.get("sport_key"),65),"league":clean(row.get("sport_title"),65),
            "media":[{**(row.get(side+"_media") or {}),
                       "badge":row.get(side+"_logo") or row.get(side+"_team_logo")}
                     for side in ("home","away")]}

def make(kind, data, now, scheduled):
    """Return exact facts and their validity deadline; no guessed results."""
    lines, link, until = [], LINKS[kind], datetime.combine(now.date()+timedelta(days=1), datetime.min.time(), ZONE)
    visual = {}
    if kind == "pick":
        candidates = []
        for row in data.get("items", []):
            if not isinstance(row, dict) or not isinstance(row.get("prediction"), dict):
                continue
            pred = row["prediction"]
            start = stamp(row.get("commence_time"))
            if not start or not scheduled < start <= now + timedelta(days=2):
                continue
            if (pred.get("free_daily_pick") is not True or pred.get("locked") is not False
                    or pred.get("is_live") or pred.get("is_finished") or row.get("result") != "pending"):
                continue
            try:
                odds = float(pred.get("pick_odds"))
            except (TypeError, ValueError):
                continue
            if not 1 < odds <= 1000 or not all(clean(v) for v in (row.get("home_team"), row.get("away_team"), pred.get("pick"))):
                continue
            candidates.append((start, row, pred, odds))
        if not candidates:
            return None
        start, row, pred, odds = min(candidates, key=lambda c:c[0])
        visual = fixture_visual(row)
        until = min(until, start)
        lines = [f"{clean(row['home_team'],70)} – {clean(row['away_team'],70)}",
                 f"{clean(pred.get('market_label'),70) or 'Pronostic'} : {clean(pred['pick'],100)}",
                 f"Cote observée : {odds:.2f}".replace(".",","),
                 f"{start.astimezone(ZONE):%d/%m à %H:%M} · heure de Porto-Novo"]
    elif kind == "results":
        summary = data.get("summary", {})
        expected = (now.date()-timedelta(days=1)).isoformat()
        keys = ("won", "lost", "void", "pending", "total")
        if (data.get("date") != expected or data.get("source") != "track_record" or data.get("complete") is not True
                or not isinstance(summary, dict) or not all(type(summary.get(k)) is int and summary[k]>=0 for k in keys)
                or sum(summary[k] for k in keys[:-1]) != summary["total"] or not summary["total"]):
            return None
        lines = [f"Matchs du {(now.date()-timedelta(days=1)):%d/%m/%Y} · Porto-Novo",
                 f"{summary['won']} gagnés · {summary['lost']} perdus",
                 f"{summary['void']} annulés · {summary['pending']} en attente",
                 f"{summary['total']} pronostics au total"]
    elif kind == "news":
        post = next((p for p in data.get("posts", []) if isinstance(p,dict) and p.get("kind")=="news_link"
                     and clean(p.get("title")) and re.fullmatch(r"[a-z0-9-]{4,160}",str(p.get("slug") or ""))
                     and (when:=stamp(p.get("published_at"))) and now-timedelta(hours=48)<=when<=now
                     and (seen:=stamp(p.get("source_seen_at"))) and now-timedelta(hours=72)<=seen<=now),None)
        if not post:
            return None
        lines = [clean(post["title"]), f"Source : {clean(post.get('source_name'),65) or 'voir l’article'}"]
        link = LINKS[kind].replace("/blog?", f"/blog/{post['slug']}?")
    else:
        return None
    return {"kind":kind,"title":LABELS[kind],"lines":lines,"link":link,"until":until.timestamp(),
            "visual":visual}

def subscription(plans):
    pro = next((p for p in plans if isinstance(p,dict) and p.get("id")=="pro"),None) if isinstance(plans,list) else None
    if not pro or any(type(pro.get(k)) is not int or pro[k]<=0 for k in ("price_xof","duration_days")):
        return "Le tarif et les moyens de paiement à jour sont affichés sur WinPulse."
    price = f"{pro['price_xof']:,}".replace(","," ")
    return f"WinPulse Pro : {price} FCFA pour {pro['duration_days']} jours. Consulte l’abonnement pour les moyens de paiement disponibles."

def poster(draft, photo=None, badges=()):
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    from io import BytesIO
    image = Image.new("RGB",(1080,1080))
    draw = ImageDraw.Draw(image)
    for y in range(1080):
        t=y/1080
        draw.line((0,y,1080,y),fill=(int(17+20*t),int(20+5*t),int(37-8*t)))
    draw.rounded_rectangle((64,62,1016,1018),32,outline="#555269",width=3)
    def font(size, bold=False):
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",size)
    draw.text((110,117),"WINPULSE  /  COMMUNAUTÉ",font=font(27,True),fill="#FFAB65")
    y=207
    def block(text, face, color, max_lines):
        nonlocal y
        words=text.split()
        parts=[""]
        for word in words:
            part=(parts[-1]+" "+word).strip()
            if draw.textlength(part,font=face) > 850 and parts[-1]:
                parts.append(word)
            else:
                parts[-1]=part
        for i,line in enumerate(parts[:max_lines]):
            if i == max_lines-1 and len(parts)>max_lines:
                line=line.rstrip(" .")+"…"
            while draw.textlength(line,font=face)>850:
                line=line[:-2].rstrip("…")+"…"
            draw.text((110,y),line,font=face,fill=color)
            y+=face.size+13
        y+=18
    if draft.get("kind") in ("pick","results"):
        pick = draft["kind"] == "pick"
        # Draw a sports broadcast composition, never an unrelated match photo.
        draw.rounded_rectangle((96,196,984,627),25,fill="#162640",outline="#405D80",width=2)
        for x in range(132,970,38):
            draw.line((x,220,x,600),fill="#1B3453",width=2)
        draw.ellipse((452,313,628,489),outline="#345679",width=3)
        draw.line((540,218,540,604),fill="#345679",width=3)
        if pick:
            teams = (draft.get("visual") or {}).get("teams") or draft["lines"][0].split(" – ",1)
            league = (draft.get("visual") or {}).get("league")
            draw.text((540,232),clean(league,50).upper() or "SÉLECTION GRATUITE",
                      font=font(25,True),fill="#FFAD68",anchor="mt")
            for i,(team,x) in enumerate(zip(teams,(324,756))):
                draw.rounded_rectangle((x-94,302,x+94,490),26,fill="#EDF3FD")
                entry = badges[i] if i<len(badges) else None
                if entry is not None:
                    icon = ImageOps.contain(entry.convert("RGBA"),(157,157),Image.Resampling.LANCZOS)
                    image.paste(icon,(x-icon.width//2,396-icon.height//2),icon)
                else:
                    initials = "".join(word[0] for word in team.split()[:3] if word).upper() or "—"
                    draw.text((x,396),initials,font=font(52,True),fill="#233B5D",anchor="mm")
                team_font = font(27,True)
                label = clean(team,75)
                while draw.textlength(label,font=team_font)>370:
                    label=label[:-2].rstrip("…")+"…"
                draw.text((x,527),label,font=team_font,fill="#F4F2F7",anchor="mt")
            draw.text((540,396),"VS",font=font(36,True),fill="#FFAD68",anchor="mm")
        else:
            draw.text((540,230),"TRACK RECORD",font=font(26,True),fill="#FFAD68",anchor="mt")
            numbers = re.findall(r"([0-9]+)", " ".join(draft["lines"][1:3]))
            for (label,color,x), number in zip((("GAGNÉS","#66E4AA",236),("PERDUS","#FF9DA1",438),
                                               ("ANNULÉS","#9AB8E6",642),("EN ATTENTE","#FFD07D",844)), numbers):
                draw.rounded_rectangle((x-87,320,x+87,513),18,fill="#101B2E")
                draw.text((x,394),number,font=font(53,True),fill=color,anchor="mm")
                draw.text((x,474),label,font=font(18,True),fill="#EDF3FD",anchor="mm")
        y=654
        for i,line in enumerate(draft["lines"][1:4] if pick else (draft["lines"][0], draft["lines"][-1])):
            block(line,font(36 if i==0 else 27,i==0),"#F4F2F7",2 if i==0 else 1)
        draw.text((110,956),"wnpulse.com  •  18+",font=font(24),fill="#E2D9EA")
        buffer=BytesIO()
        image.save(buffer,format="PNG")
        return buffer.getvalue()
    if photo is not None:
        news = draft.get("kind") == "news"
        photo_height = 448 if news else 342
        draw.text((110,169),draft["title"],font=font(39,True),fill="#FFFFFF")
        cover = ImageOps.fit(photo, (860,photo_height), method=Image.Resampling.LANCZOS)
        mask = Image.new("L", cover.size)
        ImageDraw.Draw(mask).rounded_rectangle((0,0,859,photo_height-1),radius=18,fill=255)
        image.paste(cover,(110,236),mask)
        label_y = 236 + photo_height - 53
        draw.rounded_rectangle((127,label_y,456,label_y+37),radius=8,fill="#111425")
        draw.text((141,label_y+6),"PHOTO D’ARCHIVES" if news else "PHOTO D’ILLUSTRATION",
                  font=font(21,True),fill="#FFFFFF")
        y=236 + photo_height + 27
        for i,line in enumerate(draft["lines"][:2 if news else 4]):
            block(line,font(33 if i==0 else 24,i==0),"#F4F2F7", (3 if news else 2) if i==0 else 1)
        draw.text((110,956),"wnpulse.com  •  18+",font=font(24),fill="#E2D9EA")
        buffer=BytesIO()
        image.save(buffer,format="PNG")
        return buffer.getvalue()
    block(draft["title"],font(55,True),"#FFFFFF",2)
    draw.line((110,y,970,y),fill="#FFAB65",width=3)
    y+=55
    for i,line in enumerate(draft["lines"][:4]):
        block(line,font(38 if i==0 else 33,i==0),"#F4F2F7",3 if i==0 else 2)
    draw.text((110,942),"wnpulse.com  •  18+",font=font(24),fill="#E2D9EA")
    buffer=BytesIO()
    image.save(buffer,format="PNG")
    return buffer.getvalue()
