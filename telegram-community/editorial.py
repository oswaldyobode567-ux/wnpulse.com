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

def make(kind, data, now, scheduled):
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
        details={"teams":visual["teams"],"competition":visual["league"],
                 "market":clean(pred.get("market_label"),70) or "Pronostic",
                 "pick":clean(pred["pick"],120),"odds":f"{odds:.2f}".replace(".",","),
                 "date":start.astimezone(ZONE).strftime("%d/%m · %H:%M"),
                 "bookmaker":clean(pred.get("best_bookmaker"),50)}
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
            "visual":visual,"details":details}

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
        is_pick = draft["kind"]=="pick"
        d=draft.get("details") or {}
        visual=draft.get("visual") or {}
        def centered(text,x,y,width,size,max_lines=2):
            face=font(size,True)
            words=clean(text,150).split()
            lines=[""]
            for word in words:
                trial=(lines[-1]+" "+word).strip()
                if draw.textlength(trial,font=face)>width and lines[-1]:
                    lines.append(word)
                else:
                    lines[-1]=trial
            for line in lines[:max_lines]:
                while draw.textlength(line,font=face)>width and len(line)>1:
                    line=line[:-2].rstrip("…")+"…"
                draw.text((x,y),line,font=face,fill="#F4F2F7",anchor="mt")
                y+=size+10
        draw.rounded_rectangle((76,70,1004,155),22,fill="#F38C40")
        draw.text((108,96),"WINPULSE",font=font(34,True),fill="#151D30")
        draw.text((969,107),"SÉLECTION" if is_pick else "LE BILAN",font=font(24,True),fill="#151D30",anchor="rm")
        if is_pick:
            teams=visual.get("teams") or d.get("teams") or draft["lines"][0].split(" – ",1)
            draw.text((96,183),clean(visual.get("league"),48).upper() or "PRONOSTIC GRATUIT",
                      font=font(24,True),fill="#FFB57D")
            for i,(team,x) in enumerate(zip(teams,(315,765))):
                draw.rounded_rectangle((x-209,237,x+209,589),28,fill="#1C2A43",outline="#3B4B64",width=2)
                draw.rounded_rectangle((x-75,270,x+75,420),22,fill="#F2F5FB")
                entry=badges[i] if i<len(badges) else None
                if entry is not None:
                    icon=ImageOps.contain(entry.convert("RGBA"),(130,130),Image.Resampling.LANCZOS)
                    image.paste(icon,(x-icon.width//2,345-icon.height//2),icon)
                else:
                    initials="".join(word[0] for word in team.split()[:3] if word).upper() or "—"
                    draw.text((x,345),initials,font=font(42,True),fill="#233B5D",anchor="mm")
                centered(team,x,452,364,32)
            draw.rounded_rectangle((498,329,582,393),14,fill="#F38C40")
            draw.text((540,361),"VS",font=font(26,True),fill="#151D30",anchor="mm")
            draw.text((96,622),d.get("date") or (draft["lines"][3] if len(draft["lines"])>3 else ""),
                      font=font(25),fill="#DAE4F5")
            draw.rounded_rectangle((96,682,984,924),24,fill="#F0F3F9")
            draw.text((126,709),"NOTRE CHOIX",font=font(22,True),fill="#6E4C39")
            choice=d.get("pick") or (draft["lines"][1].partition(":")[2].strip() if len(draft["lines"])>1 else "")
            face=font(35,True)
            chosen=clean(choice,110)
            while draw.textlength(chosen,font=face)>615 and len(chosen)>1:
                chosen=chosen[:-2].rstrip("…")+"…"
            draw.text((126,766),chosen,font=face,fill="#17253D")
            market=d.get("market") or (draft["lines"][1].partition(":")[0] if len(draft["lines"])>1 else "")
            draw.text((126,838),clean(market,44),font=font(23),fill="#41516B")
            odds=d.get("odds") or (draft["lines"][2].partition(":")[2].strip() if len(draft["lines"])>2 else "")
            draw.rounded_rectangle((787,733,953,869),20,fill="#F38C40")
            draw.text((870,761),"COTE",font=font(18,True),fill="#402E25",anchor="mt")
            draw.text((870,803),odds,font=font(40,True),fill="#17253D",anchor="mt")
        else:
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
