"""Editorial inputs: public WinPulse data, never private picks or chat history."""
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

SITE = "https://wnpulse.com"
ZONE = ZoneInfo("Europe/Paris")
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

def daily_picks(data, now, scheduled):
    """All usable public selections, stable order, one official selection per match."""
    choices=[]
    seen=set()
    rows=data.get("items",[]) if isinstance(data,dict) else []
    for row in rows:
        if not isinstance(row,dict):
            continue
        draft=make("pick",{"items":[row]},now,scheduled)
        if not draft:
            continue
        identity=str(row.get("id") or row.get("match_id") or tuple(draft["visual"]["teams"]))
        if identity in seen:
            continue
        seen.add(identity)
        choices.append((stamp(row["commence_time"]),identity,draft))
    return [draft for _,_,draft in sorted(choices,key=lambda choice:(choice[0],choice[1]))]

def make(kind, data, now, scheduled, admin=False):
    """Return exact facts and their validity deadline; no guessed results."""
    lines, link, until = [], LINKS[kind], datetime.combine(now.date()+timedelta(days=1), datetime.min.time(), ZONE)
    visual = {}
    details = {}
    if kind == "pick":
        candidates = []
        for row in data.get("items", []):
            if not isinstance(row, dict) or not isinstance(row.get("prediction"), dict):
                continue
            pred = row["prediction"]
            start = stamp(row.get("commence_time"))
            if not start or not scheduled < start <= now + timedelta(days=2):
                continue
            if ((not admin and pred.get("free_daily_pick") is not True) or pred.get("locked") is not False
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
                 f"{start.astimezone(ZONE):%d/%m à %H:%M} · heure de Paris"]
        details={"teams":visual["teams"],"competition":visual["league"],
                 "market":clean(pred.get("market_label"),70) or "Pronostic",
                 "pick":clean(pred["pick"],120),"odds":f"{odds:.2f}".replace(".",","),
                 "date":start.astimezone(ZONE).strftime("%d/%m · %H:%M"),"time_zone":ZONE.key,
                 "bookmaker":clean(pred.get("best_bookmaker"),50),
                 "profile":pred.get("community_profile") if admin else None}
    elif kind == "results":
        summary = data.get("summary", {})
        expected = (now.date()-timedelta(days=1)).isoformat()
        keys = ("won", "lost", "void", "pending", "total")
        if (data.get("date") != expected or data.get("source") != "track_record" or data.get("complete") is not True
                or not isinstance(summary, dict) or not all(type(summary.get(k)) is int and summary[k]>=0 for k in keys)
                or sum(summary[k] for k in keys[:-1]) != summary["total"] or not summary["total"]):
            return None
        lines = [f"Matchs du {(now.date()-timedelta(days=1)):%d/%m/%Y} · Paris",
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
            "visual":visual,"details":details,"admin_pick":admin}

def subscription(plans):
    pro = next((p for p in plans if isinstance(p,dict) and p.get("id")=="pro"),None) if isinstance(plans,list) else None
    if not pro or any(type(pro.get(k)) is not int or pro[k]<=0 for k in ("price_xof","duration_days")):
        return "Le tarif et les moyens de paiement à jour sont affichés sur WinPulse."
    price = f"{pro['price_xof']:,}".replace(","," ")
    return f"WinPulse Pro : {price} FCFA pour {pro['duration_days']} jours. Consulte l’abonnement pour les moyens de paiement disponibles."

def match_poster(draft, badges, hero, hero_label):
    from hashlib import sha256
    from io import BytesIO
    from PIL import Image, ImageDraw, ImageFont, ImageOps

    visual = draft.get("visual") or {}
    details = draft.get("details") or {}
    lines = draft.get("lines") or []
    teams = visual.get("teams") or details.get("teams") or (lines[0].split(" – ", 1) if lines else [])
    color = ("#81f7cb", "#ffb37b", "#aeb9ff", "#66dbff")[sha256("|".join(teams).encode()).digest()[0] % 4]
    image = Image.new("RGB", (1080, 1080), "#0a1220")
    if hero:
        cover = ImageOps.fit(hero.convert("RGB"), (1080, 750), Image.Resampling.LANCZOS, centering=(0.5, 0.56))
        shade = Image.new("RGBA", cover.size)
        fade = ImageDraw.Draw(shade)
        for y in range(750):
            alpha = int(98 + 157 * (y / 749) ** 2)
            fade.line((0, y, 1080, y), fill=(10, 18, 32, alpha))
        image.paste(Image.alpha_composite(cover.convert("RGBA"), shade).convert("RGB"), (0, 0))
    draw = ImageDraw.Draw(image)

    def write(value, x, y, size, fill="#f5f8ff", width=850, anchor="la"):
        face = ImageFont.truetype("DejaVuSans-Bold.ttf", size)
        value = clean(value, 150)
        while len(value) > 1 and draw.textlength(value, font=face) > width:
            value = value[:-2].rstrip("…") + "…"
        draw.text((x, y), value, fill=fill, font=face, anchor=anchor)

    draw.rectangle((0, 0, 1080, 8), fill=color)
    write("WNPULSE", 68, 63, 34, color)
    write(clean(visual.get("league"), 70).upper() or "SÉLECTION DU JOUR", 68, 124, 24)
    for offset in range(4):
        draw.ellipse((110 + offset * 27, 263 + offset * 17, 970 - offset * 27, 563 - offset * 17), outline="#667d9b", width=2)
    for idx, (team, x) in enumerate(zip(teams, (306, 774))):
        y = 371 + idx * 15
        draw.ellipse((x-126, y-121, x+126, y+133), fill="#0a1424", outline=color, width=5)
        draw.ellipse((x-114, y-114, x+114, y+114), fill="#c3d2e5", outline="#edf5ff", width=4)
        badge = badges[idx] if idx < len(badges) else None
        draw.ellipse((x-102, y-102, x+102, y+102), fill="#edf3fc" if badge else "#233b5a")
        if badge:
            icon = ImageOps.contain(badge.convert("RGBA"), (143, 143), Image.Resampling.LANCZOS)
            image.paste(icon, (x-icon.width//2, y-icon.height//2), icon)
        else:
            initials = "".join(word[0] for word in team.split()[:3]).upper() or "—"
            write(initials, x, y, 55, anchor="mm")
        write(team, x, 545, 31, width=390, anchor="mt")
    write("VS", 540, 381, 40, color, anchor="mm")
    write(details.get("date") or (lines[3] if len(lines) > 3 else ""), 70, 626, 24, "#bdcde1")
    if hero:
        write(hero_label, 1012, 630, 16, "#bdcde1", anchor="ra")
    draw.rounded_rectangle((65, 708, 1015, 981), 31, fill="#16253b", outline="#526783", width=3)
    draw.rounded_rectangle((814, 752, 979, 927), 21, fill=color)
    pick = details.get("pick") or (lines[1].partition(":")[2].strip() if len(lines) > 1 else "")
    market = details.get("market") or (lines[1].partition(":")[0] if len(lines) > 1 else "")
    odds = details.get("odds") or (lines[2].partition(":")[2].strip() if len(lines) > 2 else "")
    write("SÉLECTION", 102, 753, 23, color)
    write(pick, 102, 814, 40, width=662)
    write(market, 102, 892, 25, "#bdcde1", width=660)
    write("COTE", 896, 796, 21, "#101a2a", anchor="mm")
    write(odds, 896, 867, 44, "#101a2a", width=145, anchor="mm")
    write("18+  ·  wnpulse.com", 70, 1025, 23, "#c5d3e6")
    output = BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def poster(draft, photo=None, badges=(), hero=None, hero_label="VISUEL D’ILLUSTRATION"):
    if draft.get("kind") == "pick":
        return match_poster(draft, badges, hero, hero_label)
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
    if draft.get("kind") == "results":
        draw.rounded_rectangle((76,70,1004,155),22,fill="#F38C40")
        draw.text((108,96),"WINPULSE",font=font(34,True),fill="#151D30")
        draw.text((969,107),"LE BILAN",font=font(24,True),fill="#151D30",anchor="rm")
        draw.text((96,193),"BILAN DES PRONOSTICS",font=font(34,True),fill="#F4F2F7")
        draw.text((96,252),draft["lines"][0],font=font(24),fill="#D5DFEF")
        values=re.findall(r"([0-9]+)"," ".join(draft["lines"][1:3]))
        for i,(label,color) in enumerate((("GAGNÉS","#76E9B3"),("PERDUS","#FFA2A8"),("ANNULÉS","#B6CEF7"),("EN ATTENTE","#FFD07D"))):
            x,y=(96+(i%2)*457,337+(i//2)*239)
            draw.rounded_rectangle((x,y,x+431,y+213),25,fill="#1C2A43")
            draw.text((x+28,y+25),label,font=font(22,True),fill="#CBD9EE")
            draw.text((x+28,y+79),values[i] if i<len(values) else "—",font=font(64,True),fill=color)
        draw.text((96,870),draft["lines"][-1],font=font(28,True),fill="#F4F2F7")
        draw.text((96,963),"Les analyses sur wnpulse.com",font=font(25,True),fill="#F7B17E")
        draw.text((984,963),"18+",font=font(22),fill="#D8E2F0",anchor="rt")
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
