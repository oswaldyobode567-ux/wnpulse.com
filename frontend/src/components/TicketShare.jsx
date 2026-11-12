import { useEffect, useState } from "react";
import { ImageDown, Send } from "lucide-react";

const SITE = "https://wnpulse.com";

function renderTicket({ title, odds, legs, i18n }) {
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
  const top = 174 + heading.length * 42;
  canvas.height = top + cards.reduce((height, card) => height + card.height + 16, 0) + 122;
  const backdrop = ctx.createLinearGradient(0, 0, 900, canvas.height);
  backdrop.addColorStop(0, "#0b1425");
  backdrop.addColorStop(1, "#172840");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fb923c";
  ctx.fillRect(0, 0, 900, 8);
  const write = (text, x, y, size, bold, color) => {
    font(size, bold);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  write("WNPULSE", 44, 62, 28, true, "#fb923c");
  heading.forEach((line, index) => write(line, 44, 116 + index * 42, 33, true, "#fff"));
  write(`${i18n.t("Cote totale")} · ${new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format(Number(odds))}`, 44, top - 34, 30, true, "#fdba74");
  let y = top;
  cards.forEach(({ leg, teams, selection, height }, index) => {
    ctx.fillStyle = "#23364f";
    ctx.fillRect(44, y, 812, height);
    ctx.fillStyle = "#fb923c";
    ctx.fillRect(44, y, 5, height);
    write(String(index + 1).padStart(2, "0"), 62, y + 36, 20, true, "#fdba74");
    const start = new Date(leg.commence_time);
    const meta = [leg.competition || leg.sport_title, Number.isFinite(start.getTime()) ? new Intl.DateTimeFormat(i18n.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(start) : ""].filter(Boolean).join(" · ");
    font(19, false);
    const info = wrap(meta, 630)[0];
    if (info) write(info, 113, y + 36, 19, false, "#cbd5e1");
    teams.forEach((line, i) => write(line, 113, y + 73 + i * 36, 28, true, "#fff"));
    selection.forEach((line, i) => write(line, 113, y + 73 + teams.length * 36 + i * 31, 23, false, "#dbeafe"));
    write(new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format(Number(leg.pick_odds)), 113, y + height - 18, 24, true, "#fdba74");
    y += height + 16;
  });
  write("wnpulse.com", 44, y + 37, 22, true, "#fff");
  write(`18+ · ${i18n.t("Aucun gain garanti.")}`, 44, y + 72, 20, false, "#cbd5e1");
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG unavailable")), "image/png"));
}

export default function TicketShare({ title, odds, legs, message, isUsable, i18n }) {
  const [poster, setPoster] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => { if (poster) URL.revokeObjectURL(poster.url); }, [poster]);
  const ready = poster?.message === message ? poster : null;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(SITE)}&text=${encodeURIComponent(message)}`;
  async function makePoster() {
    if (!isUsable()) return;
    setFailed(false);
    try {
      const blob = await renderTicket({ title, odds, legs, i18n });
      const file = new File([blob], "wnpulse-combine.png", { type: "image/png" });
      setPoster({ file, url: URL.createObjectURL(blob), message });
    } catch {
      setFailed(true);
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
      {!ready && <button className={button} type="button" onClick={makePoster}><ImageDown size={17} aria-hidden="true" />{i18n.t("Créer l’affiche")}</button>}
      {canShareFile && <button className={button} type="button" onClick={shareImage}><Send size={17} aria-hidden="true" />{i18n.t("Partager l’image")}</button>}
      {ready && <a className={button} onClick={guard} href={ready.url} download="wnpulse-combine.png">{i18n.t("Télécharger l’image")}</a>}
      <a className={button + " text-emerald-800"} onClick={guard} href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a className={button + " text-sky-800"} onClick={guard} href={telegram} target="_blank" rel="noopener noreferrer">Telegram</a>
    </div>
    {ready && <><img className="max-h-64 w-auto rounded-lg border border-slate-200" src={ready.url} alt={i18n.t("Aperçu de l’affiche du combiné")} /><p className="text-xs text-slate-600">{i18n.t("Choisis WhatsApp ou Telegram dans le menu de partage, ou télécharge l’image pour la joindre à ton message.")}</p></>}
    {failed && <p className="text-xs text-slate-600" role="status">{i18n.t("Le partage d’image a échoué. Réessaie ou utilise les liens de partage texte.")}</p>}
  </div>;
}
