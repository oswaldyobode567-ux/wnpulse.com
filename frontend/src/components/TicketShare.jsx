import { useEffect, useState } from "react";
import { ImageDown, Send } from "lucide-react";
import { API } from "@/lib/api";

const SITE = "https://wnpulse.com";
function photoCategory(leg) {
  const sport = String(leg.sport_key || leg.sport || "").toLowerCase();
  const league = String(leg.competition || leg.sport_title || "").toLowerCase();
  if (/uefa_champs_league|champions league|ligue des champions/.test(sport + " " + league)) return "champions";
  if (sport === "soccer_epl" || /premier league/.test(league)) return "premier";
  if (/soccer|football/.test(sport) && !sport.includes("american")) return "football";
  if (sport.startsWith("basketball")) return "basketball";
  if (sport.startsWith("tennis")) return "tennis";
  return null;
}

async function archivePhotos(legs) {
  try {
    const response = await fetch("/share-photos/index.json", { signal: AbortSignal.timeout(1800) });
    if (!response.ok) return [];
    const catalogue = await response.json();
    const keys = [...new Set(legs.map(photoCategory).filter(Boolean))].slice(0, 3);
    return (await Promise.all(keys.map(async key => ({
      ...catalogue[key], image: await loadPosterImage(`/share-photos/${key}.webp`),
    })))).filter(photo => photo.image && photo.source);
  } catch { return []; }
}

function loadPosterImage(url, timeout = 1800) {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), timeout);
    const finish = value => { clearTimeout(timer); resolve(value); };
    image.crossOrigin = "anonymous";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = url;
  });
}

function safeBadge(leg, media, side) {
  const candidates = [leg, media].flatMap(item => [
    item?.[`${side}_media`]?.kind === "badge" ? item[`${side}_media`].url : null,
    item?.[`${side}_logo`], item?.[`${side}_team_logo`], item?.[`${side}_crest`],
    ...(Array.isArray(item?.[`${side}_image_candidates`]) ? item[`${side}_image_candidates`] : []),
  ]);
  return candidates.find(url => typeof url === "string" &&
    /^https:\/\/(?:media(?:-1)?\.api-sports\.io\/(?:[a-z]+\/)?teams\/[0-9]+\.png|crests\.football-data\.org\/[a-zA-Z0-9_-]+\.png)$/.test(url));
}

async function posterBadges(legs) {
  let catalogue = [];
  try {
    const response = await fetch(`${API}/media/catalogue`, {
      signal: AbortSignal.timeout(1600),
    });
    if (response.ok) catalogue = (await response.json()).items || [];
  } catch { /* The ticket can still render with the available media. */ }
  const byId = new Map(catalogue.map(row => [String(row.match_id), row]));
  return Promise.all(legs.map(leg => Promise.all(["home", "away"].map(side =>
    (async () => {
      const source = safeBadge(leg, byId.get(String(leg.match_id || leg.id)), side);
      if (!source) return null;
      const proxy = loadPosterImage(`${API}/media/share-badge?source=${encodeURIComponent(source)}`, 4000);
      const direct = await loadPosterImage(source);
      return direct || await proxy;
    })()
  ))));
}

async function renderTicket({ title, odds, legs, i18n }) {
  const accent = "#8fe3d1";
  const [photos, badges] = await Promise.all([archivePhotos(legs), posterBadges(legs)]);
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const font = (size, bold) => { ctx.font = `${bold ? 700 : 400} ${size}px system-ui, sans-serif`; };
  function wrap(text, width) {
    const lines = [];
    let line = "";
    for (const char of String(text || "")) {
      if (line && ctx.measureText(line + char).width > width) {
        const boundary = line.lastIndexOf(" ");
        lines.push(boundary > 0 ? line.slice(0, boundary) : line);
        line = boundary > 0 ? line.slice(boundary + 1) : "";
      }
      line += char;
    }
    return [...lines, line].filter(Boolean);
  }
  font(33, true);
  const heading = wrap(title, 790);
  const cards = legs.map(leg => {
    font(28, true);
    const teams = wrap(`${leg.home_team} — ${leg.away_team}`, 640);
    font(23, false);
    const selection = wrap(`${i18n.bet(leg.market_label || "Marché")} · ${i18n.bet(leg.pick)}`, 640);
    return { leg, teams, selection, height: 97 + teams.length * 36 + selection.length * 31 };
  });
  const top = 330 + heading.length * 42;
  canvas.height = top + cards.reduce((height, card) => height + card.height + 16, 0) + 122 + photos.length * 27;
  const backdrop = ctx.createLinearGradient(0, 0, 900, canvas.height);
  backdrop.addColorStop(0, "#0b1425");
  backdrop.addColorStop(1, "#172840");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  photos.forEach(({ image }, index) => {
    const h = 400;
    const w = 900 / photos.length;
    const x = index * w;
    const scale = Math.max(w / image.width, h / image.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, h);
    ctx.clip();
    ctx.drawImage(image, x + (w - image.width * scale) / 2, (h - image.height * scale) * .28,
      image.width * scale, image.height * scale);
    ctx.restore();
  });
  const shade = ctx.createLinearGradient(0, 0, 0, top);
  shade.addColorStop(0, "#080d16cc");
  shade.addColorStop(.45, "#080d1620");
  shade.addColorStop(1, "#0b1425");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 900, top);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 900, 6);
  const write = (text, x, y, size, bold, color) => {
    font(size, bold);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  function medallion(badge, x, y, radius) {
    if (!badge) return;
    const shine = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    shine.addColorStop(0, "#f5f8ff");
    shine.addColorStop(.42, "#8092ae");
    shine.addColorStop(1, "#10192a");
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = radius * .5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, radius - 4, 0, Math.PI * 2);
    ctx.fillStyle = "#e7edf6";
    ctx.fill();
    const scale = (radius - 7) * 1.4 / Math.max(badge.width, badge.height);
    ctx.drawImage(badge, x - badge.width * scale / 2, y - badge.height * scale / 2, badge.width * scale, badge.height * scale);
  }
  write("WNPULSE", 44, 62, 28, true, accent);
  if (photos.length) {
    ctx.textAlign = "right";
    write(i18n.t("Photos d’archives"), 856, 62, 17, false, "#e8edf6");
    ctx.textAlign = "start";
  }
  const feature = legs.slice(0, 3);
  feature.forEach((_, index) => {
    const x = 450 + (index - (feature.length - 1) / 2) * 245;
    const y = 206 + heading.length * 28;
    medallion(badges[index][0], x - 59, y - 6, 45);
    medallion(badges[index][1], x + 59, y + 6, 45);
    if (badges[index].every(Boolean)) write("VS", x - 13, y + 6, 19, true, accent);
  });
  heading.forEach((line, index) => write(line, 44, 116 + index * 42, 33, true, "#fff"));
  if (Number(odds) > 1) write(`${i18n.t("Cote totale")} · ${new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format(Number(odds))}`, 44, top - 34, 30, true, "#fdba74");
  let y = top;
  cards.forEach(({ leg, teams, selection, height }, index) => {
    const glass = ctx.createLinearGradient(44, y, 856, y + height);
    glass.addColorStop(0, "#243650");
    glass.addColorStop(1, "#111c31");
    ctx.beginPath();
    ctx.roundRect(44, y, 812, height, 18);
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = "#a8bdd742";
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(63, y + 52, 24, 2);
    write(String(index + 1).padStart(2, "0"), 62, y + 36, 20, true, "#fdba74");
    const start = new Date(leg.commence_time);
    const meta = [leg.competition || leg.sport_title, Number.isFinite(start.getTime()) ? new Intl.DateTimeFormat(i18n.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(start) : ""].filter(Boolean).join(" · ");
    font(19, false);
    const info = wrap(meta, 630)[0];
    if (info) write(info, 113, y + 36, 19, false, "#cbd5e1");
    teams.forEach((line, i) => write(line, 113, y + 73 + i * 36, 28, true, "#fff"));
    selection.forEach((line, i) => write(line, 113, y + 73 + teams.length * 36 + i * 31, 23, false, "#dbeafe"));
    if (Number(leg.pick_odds) > 1) write(new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format(Number(leg.pick_odds)), 113, y + height - 18, 24, true, "#fdba74");
    y += height + 16;
  });
  write("wnpulse.com", 44, y + 37, 22, true, "#fff");
  write(`18+ · ${i18n.t("Aucun gain garanti.")}`, 44, y + 72, 20, false, "#cbd5e1");
  photos.forEach((photo, index) => {
    write(`${photo.label} · ${photo.author} · ${photo.license} · ${i18n.t("recadrée")}`, 44, y + 103 + index * 26, 15, false, "#cbd5e1");
  });
  if (photos.length) write("wnpulse.com/share-photos/credits.html", 44, y + 103 + photos.length * 26, 15, false, "#cbd5e1");
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve({ blob, photos }) : reject(new Error("PNG unavailable")), "image/png"));
}

export default function TicketShare({ title, odds, legs, message, isUsable, i18n, showTextLinks = true }) {
  const [poster, setPoster] = useState(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => () => { if (poster) URL.revokeObjectURL(poster.url); }, [poster]);
  const ready = poster?.message === message ? poster : null;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(SITE)}&text=${encodeURIComponent(message)}`;
  async function makePoster() {
    if (!isUsable() || creating) return;
    setCreating(true);
    setFailed(false);
    try {
      const { blob, photos } = await renderTicket({ title, odds, legs, i18n });
      const file = new File([blob], "wnpulse-combine.png", { type: "image/png" });
      setPoster({ file, url: URL.createObjectURL(blob), message, photos });
    } catch {
      setFailed(true);
    } finally {
      setCreating(false);
    }
  }
  async function shareImage() {
    if (!isUsable() || !ready) return;
    try { await navigator.share({ files: [ready.file], title }); }
    catch (error) { if (error.name !== "AbortError") setFailed(true); }
  }
  const canShareFile = Boolean(ready && navigator.canShare?.({ files: [ready.file] }));
  const guard = event => { if (!isUsable()) event.preventDefault(); };
  const button = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold";
  return <div className="mt-3 space-y-2" data-testid="ticket-poster-share">
    <div className="flex flex-wrap gap-2">
      {!ready && <button className={button} type="button" onClick={makePoster} disabled={creating}><ImageDown size={17} aria-hidden="true" />{i18n.t(creating ? "Création de l’affiche…" : "Créer l’affiche")}</button>}
      {canShareFile && <button className={button} type="button" onClick={shareImage}><Send size={17} aria-hidden="true" />{i18n.t("Partager l’image")}</button>}
      {ready && <a className={button} onClick={guard} href={ready.url} download="wnpulse-combine.png">{i18n.t("Télécharger l’image")}</a>}
      {showTextLinks && <><a className={button + " text-emerald-800"} onClick={guard} href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a className={button + " text-sky-800"} onClick={guard} href={telegram} target="_blank" rel="noopener noreferrer">Telegram</a></>}
    </div>
    {ready && <><img className="max-h-80 w-auto rounded-xl border border-slate-200 shadow-xl motion-safe:transition-transform motion-safe:duration-700 motion-safe:hover:scale-[1.025]" src={ready.url} alt={i18n.t("Aperçu de l’affiche du combiné")} /><p className="text-xs text-slate-600">{i18n.t("Choisis WhatsApp ou Telegram dans le menu de partage, ou télécharge l’image pour la joindre à ton message.")}</p></>}
    {ready?.photos.map(photo => <a key={photo.source} href={photo.source} target="_blank" rel="noopener noreferrer" className="block text-xs text-slate-600 underline">{photo.label} · {photo.author} · {photo.license}</a>)}
    {failed && <p className="text-xs text-slate-600" role="status">{i18n.t("Le partage d’image a échoué. Réessaie ou utilise les liens de partage texte.")}</p>}
  </div>;
}
