import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarDays, Check, ChevronDown, Clock, Copy, Info, Loader2, Lock, Plus, RefreshCw, Save, Search, Send, SlidersHorizontal, Sparkles, Trash2, Trophy, X } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const FRESH_MS = 5 * 60 * 1000;
const SPORT_TABS = [
  { key: "all", label: "Tous les sports" }, { key: "soccer", label: "Football" },
  { key: "basketball", label: "Basketball" }, { key: "tennis", label: "Tennis" },
  { key: "americanfootball", label: "Foot US" }, { key: "icehockey", label: "Hockey" },
  { key: "mma", label: "MMA" }, { key: "other", label: "Autres" },
];
const GROUPS = { all: "Tous les marchés", winner: "Vainqueur", totals: "Buts / points", other: "Autres marchés" };
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function string(value, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function numeric(value) {
  if (!["number", "string"].includes(typeof value) || typeof value === "string" && !/^\s*-?\d+(?:[.,]\d+)?\s*$/.test(value)) return null;
  const result = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(result) ? result : null;
}
function percent(value) { const n = numeric(value); return n !== null && n >= 0 && n <= 100 ? n : null; }
function price(value) { const n = numeric(value); return n !== null && n > 1 ? n : null; }
function format(value, digits = 2) { return value === null || value === undefined ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value); }
function normalize(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function dateValue(value) {
  if (typeof value !== "string" || !value.includes("T")) return null;
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const n = Date.parse(iso); return Number.isFinite(n) ? n : null;
}
function dateLabel(value) { const n = dateValue(value); return n === null ? "Horaire non communiqué" : new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(n)); }
function paidAccount(user, now = Date.now()) {
  if (!record(user)) return false;
  if (user.is_admin === true) return true;
  const tier = string(user.subscription, string(user.subscription_tier)).toLowerCase();
  if (!tier || ["free", "none", "expired", "inactive", "null", "undefined"].includes(tier)) return false;
  if (user.subscription_expires_at) { const expiration = dateValue(user.subscription_expires_at); if (expiration === null || expiration <= now) return false; }
  return true;
}
function sportKey(match) {
  const value = normalize(`${match.sport_key || ""} ${match.sport_title || ""}`);
  if (/american.?football|nfl|ncaaf|football americain/.test(value)) return "americanfootball";
  if (/soccer|football/.test(value)) return "soccer";
  if (/basket|nba|wnba/.test(value)) return "basketball";
  if (/tennis|\batp\b|\bwta\b/.test(value)) return "tennis";
  if (/hockey|\bnhl\b/.test(value)) return "icehockey";
  if (/\bmma\b|\bufc\b/.test(value)) return "mma";
  return "other";
}
function countryName(match) {
  const supplied = string(match.country_name, string(match.country));
  if (supplied) return supplied;
  const title = string(match.league_name, string(match.league, string(match.sport_title)));
  if (/uefa|fifa|world cup|champions league|europa league/i.test(title)) return "International";
  const aliases = { Spain: "Espagne", Germany: "Allemagne", France: "France", Italy: "Italie", England: "Angleterre", Poland: "Pologne", Finland: "Finlande", Japan: "Japon", China: "Chine", Portugal: "Portugal", Netherlands: "Pays-Bas", Brazil: "Brésil", Argentina: "Argentine" };
  return Object.entries(aliases).find(([source]) => new RegExp(`\\b${source}\\b`, "i").test(title))?.[1] || "";
}
function pickKey(matchId, pick) { return JSON.stringify([String(matchId), string(pick.market), string(pick.pick), numeric(pick.pick_point)]); }
function marketGroup(pick) {
  const value = normalize(`${pick.market} ${pick.market_label}`);
  if (/total|over|under|btts|equipes marquent/.test(value)) return "totals";
  if (/h2h|1x2|vainqueur|double.?chance|draw_no_bet|nul rembourse/.test(value)) return "winner";
  return "other";
}
function explainMarket(pick) {
  const market = normalize(`${pick.market} ${pick.market_label}`), choice = normalize(pick.pick);
  if (/double.?chance/.test(market)) return "Deux issues sont couvertes : celles indiquées dans la sélection, sur la période du marché.";
  if (/draw_no_bet|nul rembourse/.test(market)) return "Le choix porte sur une victoire ; le nul relève de la règle de remboursement propre à ce marché.";
  if (/btts|equipes marquent/.test(market)) return "Le marché porte sur le fait que les deux équipes marquent, ou non, pendant la période indiquée.";
  if (/handicap|spreads/.test(market)) return "Le résultat est évalué après application du handicap affiché. La ligne et la période du marché déterminent son règlement.";
  if (/total/.test(market) || /moins de|plus de|over|under/.test(choice)) {
    const values = pick.pick.match(/\d+(?:[.,]\d+)?/g), threshold = pick.pick_point ?? (values?.length ? numeric(values[values.length - 1]) : null);
    if (threshold !== null && threshold % 1 === 0.5) {
      if (/moins de|under/.test(choice)) return `Le total doit rester inférieur à ${format(threshold)} sur la période couverte.`;
      if (/plus de|over/.test(choice)) return `Le total doit dépasser ${format(threshold)} sur la période couverte.`;
    }
    return "Le pari porte sur le total indiqué. Vérifie les règles de la ligne et de la période choisies.";
  }
  if (/vainqueur|victoire|h2h|1x2/.test(market)) return /^(nul|draw|match nul)$/.test(choice) ? "La sélection prévoit un match nul sur la période couverte." : `Le moteur retient ${pick.pick} comme vainqueur sur la période couverte.`;
  return "Lis cette sélection avec son marché et sa période. La fiche du match présente les informations disponibles.";
}
function normalizeCatalogue(payload) {
  if (!record(payload) || !Array.isArray(payload.matches)) throw new Error("INVALID_CATALOGUE");
  const seen = new Set(); let skipped = 0;
  const matches = payload.matches.flatMap((raw) => {
    const id = record(raw) && ["number", "string"].includes(typeof (raw.match_id ?? raw.id)) ? String(raw.match_id ?? raw.id) : "";
    if (!id || !record(raw) || !Array.isArray(raw.picks) || seen.has(id)) { skipped += 1; return []; }
    seen.add(id);
    const pickIds = new Set();
    const picks = raw.picks.flatMap((value, index) => {
      if (!record(value)) return [];
      const locked = value.locked === true;
      const pick = { market: string(value.market), market_label: string(value.market_label, locked ? "Marché réservé" : "Marché non communiqué"), pick: locked ? "" : string(value.pick),
        pick_odds: locked ? null : price(value.pick_odds), confidence: locked ? null : percent(value.confidence), label: locked ? "" : string(value.label),
        synthetic: value.synthetic === true, pick_point: numeric(value.pick_point), locked };
      pick._key = locked ? `${id}:locked:${index}` : pickKey(id, pick);
      if (pickIds.has(pick._key)) return []; pickIds.add(pick._key);
      return [pick];
    });
    return [{ match_id: id, home_team: string(raw.home_team), away_team: string(raw.away_team),
      sport_key: string(raw.sport_key), sport_title: string(raw.sport_title), sport: sportKey(raw),
      competition: string(raw.league_name, string(raw.league, string(raw.sport_title, "Compétition non communiquée"))),
      country: countryName(raw), commence_time: dateValue(raw.commence_time) === null ? null : raw.commence_time,
      completed: raw.completed === true || raw.is_finished === true, picks }];
  });
  if (payload.matches.length && !matches.length) throw new Error("INVALID_CATALOGUE");
  return { matches, skipped };
}
function upcoming(match, now) { const start = dateValue(match.commence_time); return !match.completed && start !== null && start > now; }
function selectable(match, pick, now) { return Boolean(upcoming(match, now) && match.home_team && match.away_team && !pick.locked && pick.pick && pick.pick_odds !== null); }
function toSelection(match, pick) {
  return { _key: pick._key, match_id: match.match_id, home_team: match.home_team, away_team: match.away_team,
    sport_title: match.sport_title, sport: match.sport, competition: match.competition, country: match.country,
    commence_time: match.commence_time, pick: pick.pick, pick_odds: pick.pick_odds, confidence: pick.confidence,
    market: pick.market, market_label: pick.market_label, pick_point: pick.pick_point, synthetic: pick.synthetic,
    _available: true, _issue: "", _previous_odds: null };
}
function reconcileSelections(previous, matches, now) {
  const byId = new Map(matches.map((match) => [match.match_id, match]));
  return previous.map((old) => {
    const match = byId.get(old.match_id), pick = match?.picks.find((p) => p._key === old._key);
    if (!match || !pick || !selectable(match, pick, now)) return { ...old, _available: false, _issue: match && !upcoming(match, now) ? "Rencontre commencée ou horaire à vérifier" : "Sélection à vérifier : elle n’est plus proposée avec une cote disponible" };
    return { ...toSelection(match, pick), _previous_odds: old.pick_odds !== pick.pick_odds ? old.pick_odds : null };
  });
}
function applyPick(previous, match, pick, now) {
  if (!selectable(match, pick, now)) return previous;
  if (previous.some((p) => p._key === pick._key)) return previous.filter((p) => p._key !== pick._key);
  return [...previous.filter((p) => p.match_id !== match.match_id), toSelection(match, pick)];
}
function ticketMetrics(picks) {
  if (!picks.length) return { totalOdds: null, confidence: null, sports: 0 };
  const product = picks.every((p) => price(p.pick_odds) !== null) ? picks.reduce((total, p) => total * p.pick_odds, 1) : null;
  return { totalOdds: product !== null && Number.isFinite(product) ? product : null,
    confidence: picks.every((p) => percent(p.confidence) !== null) ? picks.reduce((total, p) => total + p.confidence, 0) / picks.length : null,
    sports: new Set(picks.map((p) => p.sport).filter(Boolean)).size };
}
function ticketUsable(picks, loadedAt, now) {
  return Boolean(picks.length && loadedAt !== null && now >= loadedAt && now - loadedAt < FRESH_MS && ticketMetrics(picks).totalOdds !== null
    && picks.every((p) => p._available && p.pick && price(p.pick_odds) !== null && dateValue(p.commence_time) !== null && dateValue(p.commence_time) > now));
}
function savePayload(name, picks) {
  return { name: name.trim().slice(0, 100), legs: picks.map((p) => ({ match_id: p.match_id, home_team: p.home_team, away_team: p.away_team, sport_title: p.sport_title,
    commence_time: p.commence_time, pick: p.pick, pick_odds: p.pick_odds, confidence: p.confidence, market: p.market, market_label: p.market_label,
    synthetic: p.synthetic, ...(p.pick_point !== null ? { pick_point: p.pick_point } : {}) })) };
}
function ticketMessage(name, picks) {
  const metrics = ticketMetrics(picks);
  return [`🎯 ${name.trim() || "Mon ticket WNPulse"}`, `Horaires : ${Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale du navigateur"}`,
    ...picks.map((p, index) => `${index + 1}. ${p.home_team} vs ${p.away_team}\n${p.competition || p.sport_title}${p.country ? ` · ${p.country}` : ""}\n${dateLabel(p.commence_time)}\n${p.market_label} : ${p.pick}\nCote : ${format(p.pick_odds)}${p.synthetic ? " · Marché estimé, cote à confirmer" : ""}`),
    `Cote cumulée : ${format(metrics.totalOdds)}`, metrics.confidence !== null ? `Confiance moyenne du moteur : ${format(metrics.confidence, 1)} % (indicateur, pas un taux de réussite)` : "Confiance moyenne non disponible",
    "Sélections et cotes à vérifier avant les rencontres.", "https://wnpulse.com"].join("\n\n");
}
function normalizeSaved(payload) {
  if (!record(payload) || !Array.isArray(payload.combos)) throw new Error("INVALID_SAVED");
  const ids = new Set();
  return payload.combos.flatMap((raw) => {
    if (!record(raw) || !["number", "string"].includes(typeof raw.id) || ids.has(String(raw.id))) return [];
    ids.add(String(raw.id));
    return [{ id: String(raw.id), name: string(raw.name, "Ticket enregistré"), total_odds: price(raw.total_odds),
      num_legs: Number.isInteger(raw.num_legs) && raw.num_legs >= 0 ? raw.num_legs : Array.isArray(raw.legs) ? raw.legs.length : null,
      created_at: raw.created_at, legs: Array.isArray(raw.legs) ? raw.legs.filter(record) : [] }];
  });
}
function statsValues(payload, sport) {
  if (!record(payload)) throw new Error("INVALID_STATS");
  const fields = [["home_win", "Domicile", payload.probs], ["draw", "Nul", payload.probs], ["away_win", "Extérieur", payload.probs]];
  if (sport === "soccer") fields.push(["btts_yes_pct", "Les deux équipes marquent", payload.expectations], ["over_2_5_pct", "Plus de 2,5 buts", payload.expectations], ["over_1_5_pct", "Plus de 1,5 but", payload.expectations], ["clean_sheet_home_pct", "Domicile : aucun but encaissé", payload.expectations], ["clean_sheet_away_pct", "Extérieur : aucun but encaissé", payload.expectations]);
  // This server uses zero for missing market estimates. Do not present its
  // placeholders as measured probabilities.
  return fields.flatMap(([key, label, values]) => { const n = percent(values?.[key]); return n !== null && n > 0 ? [{ label, value: n }] : []; });
}
function requestError(error, fallback) {
  if (error?.response?.status === 401) return "Ta session a expiré. Reconnecte-toi.";
  if (error?.response?.status === 403) return "Cette fonction est réservée aux abonnés. Vérifie ton accès.";
  if (error?.response?.status === 429) return "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.";
  if (["ECONNABORTED", "ETIMEDOUT"].includes(error?.code)) return "Le serveur met trop de temps à répondre. Réessaie.";
  return fallback;
}

const BUILDER_CSS = `.cb-page { --cb-ink:#162338; --cb-muted:#526176; --cb-line:#e1e7ef; width:100%; max-width:1320px; margin:0 auto; padding:28px 24px 48px; color:var(--cb-ink); font-size:16px; line-height:1.6; }
.cb-page *, .cb-page *::before, .cb-page *::after { box-sizing:border-box; }
.cb-page :is(h1,h2,h3,p,dl,dd) { margin:0; }
.cb-page :is(h1,h2,h3,p,span,strong,b,dt,dd,label) { overflow-wrap:anywhere; }
.cb-page :is(button,input,select,textarea) { font:inherit; }
.cb-page svg { width:20px; height:20px; flex-shrink:0; }
.cb-page button { cursor:pointer; }
.cb-page a { text-decoration:none; }
.cb-page [hidden] { display:none !important; }
.cb-page :is(button,a,input,select,summary,textarea):focus-visible { outline:3px solid #ea580c; outline-offset:3px; }
.cb-page .cb-hero { display:grid; grid-template-columns:minmax(0,1fr) 290px; gap:36px; padding:38px; border-radius:28px; background:radial-gradient(ellipse at 100% 0%,#754023,transparent 60%),linear-gradient(130deg,#142033,#1c2d45); color:white; box-shadow:0 16px 34px rgb(20 32 51 / 10%); }
.cb-page .cb-eyebrow { display:flex; align-items:center; flex-wrap:wrap; gap:9px; color:#fdba74; font-size:14px; font-weight:800; letter-spacing:.08em; }
.cb-page .cb-hero h1 { font-size:clamp(36px,4.5vw,58px); line-height:1.08; letter-spacing:-.045em; font-weight:850; margin-top:20px; }
.cb-page .cb-hero h1 span { color:#ffad67; }
.cb-page .cb-intro { max-width:630px; margin-top:22px; font-size:18px; line-height:1.65; color:#e0e7f0; }
.cb-page .cb-time { display:flex; align-items:flex-start; gap:8px; margin-top:24px; color:#d7e1ee; font-size:14px; line-height:1.6; }
.cb-page .cb-time svg { width:17px; height:17px; margin-top:3px; }
.cb-page .cb-hero-aside { display:grid; grid-template-columns:1fr 1fr; align-content:center; gap:12px; min-width:0; }
.cb-page .cb-hero-aside > div { display:flex; flex-direction:column; padding:18px 14px; border:1px solid #ffffff30; background:#ffffff0a; border-radius:16px; min-width:0; }
.cb-page .cb-hero-aside strong { font-size:34px; font-weight:850; line-height:1.2; }
.cb-page .cb-hero-aside span { font-size:14px; color:#e0e7f0; margin-top:9px; }
.cb-page .cb-hero-aside .cb-button { grid-column:1/-1; }
.cb-page .cb-button { display:inline-flex; justify-content:center; align-items:center; gap:9px; min-height:48px; height:auto; max-width:100%; padding:12px 16px; border:1px solid transparent; border-radius:12px; font-size:16px; line-height:1.5; font-weight:750; white-space:normal; text-align:center; transition:background-color .15s,border-color .15s; }
.cb-page .cb-button:disabled { opacity:.6; cursor:not-allowed; }
.cb-page .cb-button--primary { background:#c2410c; color:#fff; }
.cb-page .cb-button--primary:hover:not(:disabled) { background:#9a3412; }
.cb-page .cb-button--outline { background:#fff; color:#162338; border-color:#d6dee8; }
.cb-page .cb-button--outline:hover:not(:disabled) { border-color:#fb923c; background:#fff7ed; }
.cb-page .cb-button--hero { color:#142033; background:#ffad67; }
.cb-page .cb-button--selected { color:#065f46; background:#ecfdf5; border-color:#6ee7b7; }
.cb-page .cb-button--whatsapp { color:#065f46; background:#ecfdf5; border-color:#a7f3d0; }
.cb-page .cb-wide { width:100%; }
.cb-page .cb-alert { display:flex; align-items:flex-start; gap:12px; padding:16px 18px; margin:20px 0; border:1px solid #fcd34d; background:#fffbeb; color:#854d0e; border-radius:14px; font-size:16px; line-height:1.65; }
.cb-page .cb-alert > div { min-width:0; }
.cb-page .cb-alert svg { margin-top:3px; }
.cb-page .cb-alert p + p { margin-top:8px; }
.cb-page .cb-alert .cb-button { margin-top:12px; }
.cb-page .cb-controls { display:grid; grid-template-columns:minmax(0,1fr) 180px 180px; gap:16px; margin:28px 0 18px; padding:20px; background:#fff; border:1px solid var(--cb-line); border-radius:20px; }
.cb-page .cb-search, .cb-page .cb-filter { min-width:0; }
.cb-page .cb-search label, .cb-page .cb-filter { font-size:15px; font-weight:700; color:#43536a; }
.cb-page .cb-search label { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.cb-page .cb-search > div { display:flex; border:1px solid #cbd5e1; border-radius:11px; background:#fff; }
.cb-page input, .cb-page select { width:100%; min-width:0; height:auto; min-height:50px; font-size:16px; line-height:1.5; background:#fff; color:#162338; border:1px solid #cbd5e1; border-radius:11px; padding:12px; }
.cb-page .cb-search input { border:0; background:transparent; }
.cb-page .cb-search button { display:grid; place-items:center; min-width:44px; border:0; border-radius:10px; color:#526176; background:#fff; }
.cb-page .cb-filter select { display:block; margin-top:8px; }
.cb-page .cb-sports { display:flex; flex-wrap:wrap; gap:9px; margin-bottom:26px; }
.cb-page .cb-sports button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:10px 15px; border:1px solid #dbe2eb; border-radius:24px; background:#fff; color:#43536a; font-size:15px; font-weight:700; }
.cb-page .cb-sports button[aria-pressed="true"] { color:#fff; background:#142033; border-color:#142033; }
.cb-page .cb-sports button span { font-size:14px; opacity:.85; }
.cb-page .cb-main { display:grid; grid-template-columns:minmax(0,1fr) 350px; gap:26px; align-items:start; }
.cb-page .cb-catalogue, .cb-page .cb-sidebar { min-width:0; }
.cb-page .cb-sidebar { position:sticky; top:20px; }
.cb-page .cb-section-title { display:flex; flex-wrap:wrap; gap:15px; margin-bottom:20px; }
.cb-page .cb-kicker { color:#9a3412; font-size:14px; font-weight:800; letter-spacing:.05em; }
.cb-page .cb-section-title h2 { font-size:26px; line-height:1.3; font-weight:800; letter-spacing:-.02em; margin:6px 0 10px; }
.cb-page .cb-section-title p:not(.cb-kicker) { color:#526176; font-size:16px; }
.cb-page .cb-matches { display:grid; gap:20px; }
.cb-page .cb-match { min-width:0; border:1px solid var(--cb-line); border-radius:22px; background:#fff; box-shadow:0 5px 16px rgb(20 32 51 / 4%); }
.cb-page .cb-match--selected { border-color:#ea580c; box-shadow:0 0 0 1px #ea580c; }
.cb-page .cb-match-header { display:flex; flex-direction:column; align-items:stretch; width:100%; min-width:0; padding:23px; border:0; border-radius:22px 22px 0 0; background:transparent; text-align:left; color:#162338; }
.cb-page .cb-match-competition { display:flex; align-items:flex-start; flex-wrap:wrap; gap:8px; font-size:16px; font-weight:700; line-height:1.55; }
.cb-page .cb-country { display:inline-flex; padding:2px 9px; border-radius:20px; border:1px solid #dce4ed; background:#f8fafc; color:#526176; font-size:14px; font-weight:600; }
.cb-page .cb-match-date { display:flex; align-items:flex-start; gap:8px; color:#526176; font-size:15px; margin-top:9px; }
.cb-page .cb-match-date svg { width:17px; height:17px; margin-top:3px; }
.cb-page .cb-team-pair { display:flex; flex-direction:column; gap:3px; margin-top:20px; }
.cb-page .cb-team-pair strong { font-size:24px; line-height:1.3; font-weight:800; letter-spacing:-.015em; }
.cb-page .cb-team-pair > span { font-size:14px; color:#526176; }
.cb-page .cb-market-count { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; font-size:14px; color:#526176; margin-top:19px; }
.cb-page .cb-market-count > span:last-child { display:flex; align-items:center; gap:7px; font-size:15px; color:#9a3412; font-weight:750; }
.cb-page .cb-primary { display:flex; flex-wrap:wrap; align-items:center; gap:16px; margin:0 23px 23px; padding:17px; border:1px solid #fed7aa; border-left:4px solid #ea580c; border-radius:14px; background:#fff7ed; }
.cb-page .cb-primary > div { flex:1 1 180px; min-width:0; }
.cb-page .cb-label { display:block; font-size:14px; font-weight:700; color:#9a3412; }
.cb-page .cb-primary > div > strong { display:block; font-size:21px; font-weight:800; line-height:1.4; margin-top:6px; }
.cb-page .cb-primary > div > div { display:flex; flex-wrap:wrap; gap:7px 16px; margin-top:8px; font-size:15px; color:#526176; }
.cb-page .cb-primary b { color:#9a3412; font-size:19px; }
.cb-page .cb-estimated { display:block; font-size:14px; color:#854d0e; line-height:1.6; margin-top:8px; }
.cb-page .cb-no-pick { display:flex; align-items:flex-start; flex-wrap:wrap; gap:10px; margin:0 23px 23px; padding:16px; border:1px solid #e3e8ef; border-radius:12px; background:#f8fafc; font-size:16px; color:#526176; }
.cb-page .cb-no-pick p { flex:1 1 200px; }
.cb-page .cb-no-pick a { display:flex; align-items:center; gap:7px; color:#c2410c; min-height:44px; font-weight:700; }
.cb-page .cb-other-selected { display:flex; align-items:flex-start; gap:8px; font-size:15px; margin:0 23px 20px; color:#047857; }
.cb-page .cb-expanded { border-top:1px solid var(--cb-line); padding:22px; background:#f8fafc; border-radius:0 0 22px 22px; }
.cb-page .cb-market-filters { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.cb-page .cb-market-filters > svg { color:#526176; }
.cb-page .cb-market-filters button { min-height:44px; padding:8px 12px; border:1px solid #d6dee8; border-radius:11px; background:#fff; color:#43536a; font-size:15px; font-weight:700; }
.cb-page .cb-market-filters button[aria-pressed="true"] { background:#142033; color:white; border-color:#142033; }
.cb-page .cb-small-note { font-size:14px; line-height:1.65; color:#526176; margin:14px 0; }
.cb-page .cb-option-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:17px 0; }
.cb-page .cb-option { min-width:0; border:1px solid #dce3ec; border-radius:14px; background:#fff; }
.cb-page .cb-option--selected { border-color:#ea580c; box-shadow:0 0 0 1px #ea580c; }
.cb-page .cb-option--locked { background:#f1f5f9; }
.cb-page .cb-option-select { width:100%; display:flex; flex-direction:column; align-items:stretch; gap:12px; padding:16px; border:0; border-radius:14px; background:transparent; color:#162338; text-align:left; }
.cb-page .cb-option-select:disabled { cursor:not-allowed; }
.cb-page .cb-option-market { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; font-size:14px; font-weight:700; color:#526176; }
.cb-page .cb-option-pick { font-size:18px; line-height:1.45; font-weight:800; }
.cb-page .cb-option-metrics { display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; font-size:14px; color:#526176; }
.cb-page .cb-option-metrics > span { display:flex; flex-direction:column; gap:4px; }
.cb-page .cb-option-metrics b { font-size:21px; color:#9a3412; }
.cb-page .cb-option-metrics > span:last-child b { color:#162338; }
.cb-page .cb-risk { display:inline-flex; align-self:flex-start; border:1px solid #d6dee8; border-radius:20px; padding:3px 10px; font-size:14px; font-weight:700; color:#43536a; background:#f8fafc; }
.cb-page .cb-risk--safe { border-color:#a7f3d0; background:#ecfdf5; color:#065f46; }
.cb-page .cb-risk--moderate { border-color:#fde68a; background:#fffbeb; color:#854d0e; }
.cb-page .cb-risk--risky { border-color:#fecdd3; background:#fff1f2; color:#9f1239; }
.cb-page details > summary { list-style:none; cursor:pointer; }
.cb-page summary::-webkit-details-marker { display:none; }
.cb-page .cb-pick-explanation { border-top:1px solid #e1e7ef; }
.cb-page .cb-pick-explanation summary { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:12px 14px; min-height:48px; font-size:14px; font-weight:700; color:#43536a; }
.cb-page .cb-pick-explanation p { padding:0 14px 16px; font-size:16px; line-height:1.65; color:#526176; }
.cb-page details[open] > summary > svg:last-child, .cb-page .cb-rotated { transform:rotate(180deg); }
.cb-page .cb-unlock-link, .cb-page .cb-match-link { display:flex; align-items:center; gap:9px; min-height:48px; font-size:16px; font-weight:700; color:#c2410c; padding:12px 0; }
.cb-page .cb-match-link { justify-content:space-between; }
.cb-page .cb-stats-block { border:1px solid var(--cb-line); background:#fff; border-radius:13px; margin-top:18px; }
.cb-page .cb-stats-toggle { display:flex; align-items:center; gap:9px; width:100%; min-height:50px; border:0; border-radius:13px; padding:14px; color:#43536a; background:transparent; text-align:left; font-size:16px; font-weight:700; }
.cb-page .cb-stats-toggle > svg:last-child { margin-left:auto; }
.cb-page .cb-stats-content { padding:0 16px 18px; color:#526176; font-size:16px; line-height:1.65; }
.cb-page .cb-stats-content a { color:#c2410c; font-weight:700; }
.cb-page .cb-stats-content dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:15px; }
.cb-page .cb-stats-content dl > div { padding:12px; border-radius:10px; background:#f1f5f9; min-width:0; }
.cb-page .cb-stats-content dt { font-size:14px; }
.cb-page .cb-stats-content dd { font-size:21px; font-weight:800; color:#162338; }
.cb-page .cb-empty { padding:34px 24px; border:1px solid var(--cb-line); border-radius:20px; background:#fff; text-align:center; }
.cb-page .cb-empty > svg { display:block; width:34px; height:34px; margin:0 auto 16px; color:#c2410c; }
.cb-page .cb-empty :is(h2,h3) { font-size:23px; line-height:1.35; font-weight:800; }
.cb-page .cb-empty p { color:#526176; margin-top:12px; font-size:16px; }
.cb-page .cb-empty .cb-button { margin-top:20px; }
.cb-page .cb-results-count { margin-top:20px; font-size:15px; color:#526176; text-align:center; }
.cb-page .cb-show-more { width:100%; margin-top:14px; }
.cb-page .cb-ticket { border:1px solid #dce3ec; border-radius:22px; background:#fff; box-shadow:0 10px 26px rgb(20 32 51 / 8%); scroll-margin-top:80px; }
.cb-page .cb-ticket > header { display:flex; align-items:flex-start; justify-content:space-between; gap:15px; padding:24px; border-radius:21px 21px 0 0; background:#142033; color:#fff; }
.cb-page .cb-ticket > header > div { min-width:0; }
.cb-page .cb-ticket header .cb-kicker { color:#fdba74; }
.cb-page .cb-ticket header h2 { font-size:25px; line-height:1.3; font-weight:800; margin-top:6px; }
.cb-page .cb-ticket header p:last-child { font-size:15px; color:#d7e1ee; margin-top:10px; }
.cb-page .cb-ticket header > svg { width:27px; height:27px; color:#fdba74; margin-top:8px; }
.cb-page .cb-ticket-toggle { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:50px; padding:14px 20px; border:0; border-bottom:1px solid var(--cb-line); background:#fff7ed; color:#9a3412; font-size:16px; font-weight:750; border-radius:0 0 20px 20px; }
.cb-page .cb-ticket-toggle[aria-expanded="true"] { border-radius:0; }
.cb-page .cb-ticket-content { padding:22px; }
.cb-page .cb-ticket-empty { padding:24px 0; text-align:center; }
.cb-page .cb-ticket-empty > svg { width:32px; height:32px; color:#c2410c; margin:0 auto 12px; }
.cb-page .cb-ticket-empty h3 { font-size:20px; font-weight:800; }
.cb-page .cb-ticket-empty p { margin-top:12px; font-size:16px; color:#526176; }
.cb-page .cb-ticket-total { padding:18px; border-radius:14px; background:#fff7ed; border:1px solid #fed7aa; }
.cb-page .cb-ticket-total > span { color:#9a3412; font-size:16px; font-weight:700; }
.cb-page .cb-ticket-total strong { display:block; font-size:44px; line-height:1.2; font-weight:850; color:#9a3412; margin-top:5px; }
.cb-page .cb-ticket-total p { color:#78513a; font-size:14px; margin-top:8px; }
.cb-page .cb-ticket-metrics { display:grid; gap:13px; margin-top:18px; }
.cb-page .cb-ticket-metrics > div { display:flex; flex-wrap:wrap; justify-content:space-between; gap:7px 12px; }
.cb-page .cb-ticket-metrics dt { color:#526176; font-size:15px; flex:1 1 150px; }
.cb-page .cb-ticket-metrics dd { font-size:18px; font-weight:800; }
.cb-page .cb-ticket-list { border-top:2px dashed #dce3ec; margin-top:20px; padding-top:18px; display:grid; gap:14px; }
.cb-page .cb-ticket-leg { display:flex; align-items:flex-start; gap:10px; padding-bottom:14px; border-bottom:1px solid #e6ebf1; }
.cb-page .cb-ticket-leg > div:nth-child(2) { flex:1; min-width:0; }
.cb-page .cb-ticket-leg p { font-size:15px; line-height:1.65; }
.cb-page .cb-ticket-leg p + p { margin-top:5px; }
.cb-page .cb-ticket-leg p:first-child { font-size:16px; font-weight:750; }
.cb-page .cb-ticket-leg p:first-child > span { color:#526176; font-weight:500; }
.cb-page .cb-ticket-leg strong { color:#9a3412; }
.cb-page .cb-leg-number { min-width:24px; height:24px; display:grid; place-items:center; background:#fff2e8; color:#9a3412; border-radius:50%; font-size:14px; font-weight:800; margin-top:3px; }
.cb-page .cb-icon-button { display:inline-grid; place-items:center; min-width:44px; min-height:44px; height:auto; border:1px solid #dce3ec; border-radius:10px; background:#fff; color:#526176; }
.cb-page .cb-icon-button:hover:not(:disabled) { background:#fff1f2; color:#be123c; }
.cb-page .cb-icon-button:disabled { opacity:.6; cursor:not-allowed; }
.cb-page .cb-leg-warning, .cb-page .cb-action-help { color:#854d0e; font-size:15px; line-height:1.65; background:#fffbeb; padding:10px; border-radius:9px; }
.cb-page .cb-ticket-leg--warning { border-color:#fcd34d; }
.cb-page .cb-clear { display:flex; align-items:center; gap:8px; min-height:44px; border:0; background:transparent; color:#9f1239; font-size:15px; font-weight:700; margin:12px 0; padding:8px 0; }
.cb-page .cb-name { display:block; font-size:16px; font-weight:700; margin:16px 0; }
.cb-page .cb-name > span { font-weight:400; color:#526176; }
.cb-page .cb-name input { margin-top:8px; }
.cb-page .cb-action-help { margin-bottom:14px; }
.cb-page .cb-share-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
.cb-page .cb-share-actions > button { flex:1 1 110px; }
.cb-page .cb-free-note { display:flex; flex-wrap:wrap; align-items:flex-start; gap:9px; padding:16px; border:1px solid #fed7aa; border-radius:12px; background:#fff7ed; margin-top:20px; }
.cb-page .cb-free-note > p { flex:1 1 150px; font-size:15px; color:#78513a; }
.cb-page .cb-free-note > svg { color:#9a3412; margin-top:2px; }
.cb-page .cb-free-note a { display:flex; align-items:center; gap:8px; min-height:44px; color:#9a3412; font-size:16px; font-weight:750; }
.cb-page .cb-notice { margin-top:16px; padding:14px; border:1px solid #cbd5e1; border-radius:12px; font-size:16px; color:#162338; background:#f8fafc; }
.cb-page .cb-manual-copy { margin-top:18px; }
.cb-page .cb-manual-copy label { font-size:16px; font-weight:700; }
.cb-page .cb-manual-copy textarea { width:100%; min-height:260px; font-size:16px; line-height:1.65; padding:12px; border:1px solid #cbd5e1; border-radius:11px; margin:10px 0; color:#162338; resize:vertical; }
.cb-page .cb-saved { margin-top:20px; background:#fff; border:1px solid var(--cb-line); border-radius:18px; padding:20px; }
.cb-page .cb-saved-drawer > summary { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:44px; font-size:20px; font-weight:800; }
.cb-page .cb-saved-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:12px 0 16px; }
.cb-page .cb-saved-heading > p { color:#526176; font-size:15px; }
.cb-page .cb-saved-body > p { color:#526176; font-size:16px; }
.cb-page .cb-saved-item { display:flex; align-items:flex-start; gap:8px; border-top:1px solid #e1e7ef; padding:14px 0; }
.cb-page .cb-saved-item > details { flex:1; min-width:0; }
.cb-page .cb-saved-item summary { display:flex; align-items:flex-start; gap:8px; min-height:44px; }
.cb-page .cb-saved-item summary > span { flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }
.cb-page .cb-saved-item summary > span > strong { font-size:16px; font-weight:750; }
.cb-page .cb-saved-item summary > span > span { font-size:14px; color:#526176; }
.cb-page .cb-saved-legs p { font-size:14px; color:#526176; margin-top:12px; }
.cb-page .cb-saved-legs p :is(strong,span) { display:block; }
.cb-page .cb-saved-legs strong { color:#162338; font-size:15px; }
.cb-page .cb-ticket-jump { display:none; }
.cb-page .cb-spin { animation:cb-spin 1s linear infinite; }
@keyframes cb-spin { to { transform:rotate(360deg); } }
@media (max-width:1120px) {
  .cb-page .cb-main { grid-template-columns:minmax(0,1fr) 320px; gap:20px; }
  .cb-page .cb-hero { padding:30px; gap:25px; grid-template-columns:minmax(0,1fr) 260px; }
}
@media (max-width:980px) {
  .cb-page .cb-main { grid-template-columns:minmax(0,1fr); }
  .cb-page .cb-sidebar { position:static; order:-1; }
  .cb-page .cb-ticket-jump { position:sticky; top:calc(80px + env(safe-area-inset-top, 0px)); z-index:15; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 14px; padding:14px 16px; margin-bottom:18px; border:1px solid #fdba74; border-radius:14px; background:#fff7ed; color:#9a3412; box-shadow:0 4px 12px rgb(20 32 51 / 8%); font-size:15px; }
  .cb-page .cb-ticket-jump > span { display:flex; align-items:center; flex-wrap:wrap; gap:8px; min-width:0; }
  .cb-page .cb-ticket-jump > strong { display:flex; align-items:center; gap:8px; font-size:16px; }
  .cb-page .cb-controls { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .cb-page .cb-search { grid-column:1/-1; }
}
@media (max-width:760px) {
  .cb-page { padding:20px 16px 40px; }
  .cb-page .cb-hero { grid-template-columns:minmax(0,1fr); padding:28px 24px; gap:24px; }
  .cb-page .cb-hero h1 { font-size:40px; }
  .cb-page .cb-intro { font-size:17px; }
  .cb-page .cb-hero-aside { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .cb-page .cb-option-grid { grid-template-columns:minmax(0,1fr); }
  .cb-page .cb-sports button { flex:1 1 130px; }
}
@media (max-width:480px) {
  .cb-page { padding:16px 12px 32px; }
  .cb-page .cb-hero { padding:26px 20px; border-radius:23px; }
  .cb-page .cb-hero h1 { font-size:36px; }
  .cb-page .cb-intro { font-size:16px; }
  .cb-page .cb-controls { padding:16px; gap:12px; }
  .cb-page .cb-match-header { padding:19px; }
  .cb-page .cb-team-pair strong { font-size:22px; }
  .cb-page .cb-primary { margin-left:19px; margin-right:19px; padding:15px; }
  .cb-page .cb-primary > .cb-button { width:100%; }
  .cb-page .cb-primary > div > strong { font-size:21px; }
  .cb-page .cb-expanded { padding:16px; }
  .cb-page .cb-ticket-content { padding:19px; }
  .cb-page .cb-ticket > header { padding:21px; }
  .cb-page .cb-ticket-leg { gap:8px; flex-wrap:wrap; }
  .cb-page .cb-ticket-leg > div:nth-child(2) { flex:1 1 130px; }
  .cb-page .cb-ticket-leg > .cb-icon-button { margin-left:auto; }
  .cb-page .cb-share-actions > button { flex-basis:100%; }
  .cb-page .cb-stats-content dl { grid-template-columns:minmax(0,1fr); }
}
@media (max-width:350px) {
  .cb-page .cb-controls { grid-template-columns:minmax(0,1fr); }
  .cb-page .cb-filter { grid-column:1/-1; }
  .cb-page .cb-hero-aside { grid-template-columns:minmax(0,1fr); }
}
@media (max-width:980px) {
  .cb-page { padding-bottom:calc(110px + env(safe-area-inset-bottom, 0px)); }
}
@media (prefers-reduced-motion:reduce) {
  .cb-page *, .cb-page *::before, .cb-page *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; }
}
`;

export default function ComboBuilderPage() {
  const { user, loading: authLoading = false } = useAuth();
  const [matches, setMatches] = useState([]), [loadedAt, setLoadedAt] = useState(null);
  const [account, setAccount] = useState(null), [verifiedAt, setVerifiedAt] = useState(null);
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(""), [accessError, setAccessError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false), [skipped, setSkipped] = useState(0);
  const [sport, setSport] = useState("all"), [query, setQuery] = useState(""), [day, setDay] = useState("all");
  const [order, setOrder] = useState("time"), [limit, setLimit] = useState(12);
  const [selectedPicks, setSelectedPicks] = useState([]), [comboName, setComboName] = useState("");
  const [expandedMatchId, setExpandedMatchId] = useState(null), [matchStats, setMatchStats] = useState({});
  const [saving, setSaving] = useState(false), [lastSaved, setLastSaved] = useState("");
  const [savedCombos, setSavedCombos] = useState([]), [savedStatus, setSavedStatus] = useState("idle"), [savedError, setSavedError] = useState("");
  const [deleting, setDeleting] = useState([]), [notice, setNotice] = useState(""), [manualCopy, setManualCopy] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 980px)").matches : false);
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(false), epoch = useRef(0), mainRequest = useRef(null), savedRequest = useRef(null);
  const statsRequests = useRef(new Map()), statsCache = useRef({}), accountRef = useRef(null), verifiedRef = useRef(null);
  const catalogueStamp = useRef(null), savingRef = useRef(null), deletingRef = useRef(new Set()), copyGeneration = useRef(0);
  const sessionKey = user?.id || user?.email || "anonymous";
  const active = (token) => mounted.current && epoch.current === token;
  const isPaid = paidAccount(account, now);
  const accessFresh = verifiedAt !== null && now >= verifiedAt && now - verifiedAt < FRESH_MS;
  const canPersist = isPaid && accessFresh;
  const fresh = loadedAt !== null && now >= loadedAt && now - loadedAt < FRESH_MS;
  const metrics = useMemo(() => ticketMetrics(selectedPicks), [selectedPicks]);
  const usable = ticketUsable(selectedPicks, loadedAt, now);
  const fingerprint = useMemo(() => JSON.stringify(savePayload(comboName, selectedPicks)), [comboName, selectedPicks]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale du navigateur", []);

  const loadSaved = useCallback(async () => {
    if (!mounted.current || savedRequest.current || !paidAccount(accountRef.current)) return;
    const token = epoch.current, controller = new AbortController(); savedRequest.current = controller;
    setSavedStatus("loading"); setSavedError("");
    try {
      const response = await api.get("/builder/my-combos", { timeout: 10000, signal: controller.signal });
      const items = normalizeSaved(response.data);
      if (mounted.current && epoch.current === token && !controller.signal.aborted) { setSavedCombos(items); setSavedStatus("ready"); }
    } catch (error) {
      if (mounted.current && epoch.current === token && !controller.signal.aborted) {
        if ([401, 403].includes(error?.response?.status)) setSavedCombos([]);
        setSavedError(requestError(error, "Impossible de charger les tickets enregistrés.")); setSavedStatus("error");
      }
    } finally { if (savedRequest.current === controller) savedRequest.current = null; }
  }, []);

  const loadCatalogue = useCallback(async () => {
    if (!mounted.current || mainRequest.current) return;
    const token = epoch.current, controller = new AbortController(); mainRequest.current = controller;
    setRefreshing(true);
    try {
      const [profile, catalogue] = await Promise.allSettled([
        api.get("/auth/me", { timeout: 8000, signal: controller.signal }),
        api.get("/builder/matches", { timeout: 20000, signal: controller.signal }),
      ]);
      if (!mounted.current || epoch.current !== token || controller.signal.aborted) return;
      if ([profile, catalogue].some((result) => result.status === "rejected" && result.reason?.response?.status === 401)) {
        accountRef.current = null; verifiedRef.current = null; catalogueStamp.current = null;
        setAccount(null); setVerifiedAt(null); setMatches([]); setSelectedPicks([]); setSavedCombos([]); setLoadedAt(null);
        setUnauthorized(true); setLoadError(""); setAccessError(""); return;
      }
      setUnauthorized(false);
      if (profile.status === "fulfilled" && record(profile.value.data)) {
        const stamp = Date.now(); accountRef.current = profile.value.data; verifiedRef.current = stamp;
        setAccount(profile.value.data); setVerifiedAt(stamp); setAccessError("");
      } else { verifiedRef.current = null; setVerifiedAt(null); setAccessError("Ton accès n’a pas pu être actualisé. L’enregistrement sera disponible après vérification."); }
      if (catalogue.status === "rejected") throw catalogue.reason;
      const data = normalizeCatalogue(catalogue.value.data), stamp = Date.now();
      catalogueStamp.current = stamp; setMatches(data.matches); setLoadedAt(stamp); setNow(stamp); setSkipped(data.skipped);
      setSelectedPicks((previous) => reconcileSelections(previous, data.matches, stamp)); setLoadError("");
    } catch (error) {
      if (mounted.current && epoch.current === token && !controller.signal.aborted) setLoadError(requestError(error, "Impossible d’actualiser les rencontres. La dernière liste chargée reste disponible."));
    } finally {
      if (mainRequest.current === controller) {
        mainRequest.current = null;
        if (mounted.current && epoch.current === token && !controller.signal.aborted) { setLoading(false); setRefreshing(false); }
      }
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    mounted.current = true; epoch.current += 1;
    accountRef.current = null; verifiedRef.current = null; catalogueStamp.current = null;
    statsCache.current = {}; savingRef.current = null; deletingRef.current = new Set();
    setMatches([]); setLoadedAt(null); setAccount(null); setVerifiedAt(null); setSelectedPicks([]); setComboName("");
    setSavedCombos([]); setSavedStatus("idle"); setSavedError(""); setMatchStats({}); setExpandedMatchId(null);
    setLoading(true); setRefreshing(false); setSaving(false); setDeleting([]); setLastSaved(""); setNotice(""); setManualCopy("");
    loadCatalogue();
    const poll = () => { if (document.visibilityState === "visible") { setNow(Date.now()); if (catalogueStamp.current === null || Date.now() - catalogueStamp.current >= 120000) loadCatalogue(); } };
    const timer = window.setInterval(poll, 120000);
    document.addEventListener("visibilitychange", poll); window.addEventListener("focus", poll);
    return () => {
      mounted.current = false; epoch.current += 1; copyGeneration.current += 1;
      mainRequest.current?.abort(); mainRequest.current = null;
      savedRequest.current?.abort(); savedRequest.current = null;
      statsRequests.current.forEach((controller) => controller.abort()); statsRequests.current.clear();
      window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); window.removeEventListener("focus", poll);
    };
  }, [authLoading, sessionKey, loadCatalogue]);

  useEffect(() => { if (mounted.current) loadCatalogue(); }, [user?.subscription, user?.subscription_tier, loadCatalogue]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 980px)"), change = () => setMobile(media.matches);
    change();
    if (media.addEventListener) { media.addEventListener("change", change); return () => media.removeEventListener("change", change); }
    media.addListener(change); return () => media.removeListener(change);
  }, []);
  useEffect(() => {
    if (isPaid && account) loadSaved();
    else { savedRequest.current?.abort(); savedRequest.current = null; setSavedCombos([]); setSavedStatus("idle"); setSavedError(""); }
  }, [account, isPaid, loadSaved]);
  useEffect(() => { setLimit(12); }, [sport, query, day, order]);
  useEffect(() => { copyGeneration.current += 1; setManualCopy(""); setNotice(""); }, [fingerprint]);

  const eligible = useMemo(() => matches.filter((match) => !match.completed && (dateValue(match.commence_time) === null || dateValue(match.commence_time) > now)), [matches, now]);
  const sportCounts = useMemo(() => {
    const counts = { all: eligible.length }; eligible.forEach((match) => { counts[match.sport] = (counts[match.sport] || 0) + 1; }); return counts;
  }, [eligible]);
  const filtered = useMemo(() => {
    const wanted = normalize(query).trim().split(/\s+/).filter(Boolean), today = new Date(now), tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    return eligible.filter((match) => {
      if (sport !== "all" && match.sport !== sport) return false;
      const haystack = normalize([match.home_team, match.away_team, match.competition, match.country, match.sport_title, SPORT_TABS.find((s) => s.key === match.sport)?.label].join(" "));
      if (!wanted.every((word) => haystack.includes(word))) return false;
      const start = dateValue(match.commence_time);
      return day === "all" || start !== null && sameDay(new Date(start), day === "today" ? today : tomorrow);
    }).sort((a, b) => order === "competition" ? a.competition.localeCompare(b.competition, "fr") || (dateValue(a.commence_time) ?? Infinity) - (dateValue(b.commence_time) ?? Infinity)
      : (dateValue(a.commence_time) ?? Infinity) - (dateValue(b.commence_time) ?? Infinity) || a.match_id.localeCompare(b.match_id));
  }, [eligible, sport, query, day, order, now]);
  const selectedKeys = useMemo(() => new Set(selectedPicks.map((p) => p._key)), [selectedPicks]);
  const availableOptions = useMemo(() => eligible.reduce((sum, match) => sum + match.picks.filter((p) => selectable(match, p, now)).length, 0), [eligible, now]);

  function togglePick(match, pick) {
    if (!fresh || !selectable(match, pick, Date.now())) { setNotice("Cette sélection n’est pas disponible avec une cote et un horaire utilisables. Actualise le catalogue."); return; }
    setSelectedPicks((previous) => applyPick(previous, match, pick, Date.now()));
  }
  async function loadStats(match) {
    if (!paidAccount(accountRef.current) || verifiedRef.current === null || Date.now() - verifiedRef.current >= FRESH_MS) { setMatchStats((previous) => ({ ...previous, [match.match_id]: { status: "error", error: "Actualise le catalogue pour vérifier ton accès aux repères." } })); return; }
    if (statsRequests.current.has(match.match_id)) return;
    const cached = statsCache.current[match.match_id];
    if (cached && Date.now() - cached.timestamp < FRESH_MS) { setMatchStats((previous) => ({ ...previous, [match.match_id]: cached })); return; }
    const token = epoch.current, controller = new AbortController(); statsRequests.current.set(match.match_id, controller);
    setMatchStats((previous) => ({ ...previous, [match.match_id]: { status: "loading" } }));
    try {
      const response = await api.get(`/builder/stats/${encodeURIComponent(match.match_id)}`, { timeout: 12000, signal: controller.signal });
      const entry = { status: "ready", values: statsValues(response.data, match.sport), timestamp: Date.now() };
      if (active(token) && !controller.signal.aborted) { statsCache.current[match.match_id] = entry; setMatchStats((previous) => ({ ...previous, [match.match_id]: entry })); }
    } catch (error) {
      if (active(token) && !controller.signal.aborted) setMatchStats((previous) => ({ ...previous, [match.match_id]: { status: "error", error: requestError(error, "Les repères de marché ne sont pas disponibles. Réessaie.") } }));
    } finally { if (statsRequests.current.get(match.match_id) === controller) statsRequests.current.delete(match.match_id); }
  }
  async function saveCombo() {
    if (savingRef.current) return;
    if (!paidAccount(accountRef.current) || verifiedRef.current === null || Date.now() - verifiedRef.current >= FRESH_MS) { setNotice("Actualise le catalogue pour vérifier ton accès à l’enregistrement."); return; }
    if (!ticketUsable(selectedPicks, catalogueStamp.current, Date.now())) { setNotice("Actualise les rencontres et vérifie les sélections signalées avant d’enregistrer."); return; }
    const payload = savePayload(comboName, selectedPicks), signature = JSON.stringify(payload);
    if (signature === lastSaved) { setNotice("Ce ticket est déjà enregistré."); return; }
    const token = epoch.current, operation = {}; savingRef.current = operation; setSaving(true); setNotice("");
    try {
      const response = await api.post("/builder/save", payload, { timeout: 15000 });
      if (response.data?.ok !== true) throw new Error("INVALID_SAVE");
      if (active(token)) { setLastSaved(signature); setNotice("Ticket enregistré dans tes combinés."); loadSaved(); }
    } catch (error) { if (active(token)) setNotice(requestError(error, "L’enregistrement n’a pas été confirmé. Vérifie la liste des tickets avant de réessayer.")); }
    finally { if (savingRef.current === operation) { savingRef.current = null; if (active(token)) setSaving(false); } }
  }
  async function copyTicket() {
    if (!ticketUsable(selectedPicks, catalogueStamp.current, Date.now())) return;
    const content = ticketMessage(comboName, selectedPicks), token = epoch.current, generation = copyGeneration.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("NO_CLIPBOARD");
      await navigator.clipboard.writeText(content);
      if (active(token) && generation === copyGeneration.current) { setNotice("Ticket copié."); setManualCopy(""); }
    } catch { if (active(token) && generation === copyGeneration.current) { setNotice("Sélectionne le texte ci-dessous pour le copier."); setManualCopy(content); } }
  }
  function shareWhatsApp() {
    if (!ticketUsable(selectedPicks, catalogueStamp.current, Date.now())) return;
    const content = ticketMessage(comboName, selectedPicks), url = `https://wa.me/?text=${encodeURIComponent(content)}`;
    if (url.length > 8000) { setManualCopy(content); setNotice("Ce ticket est long. Copie le texte ci-dessous pour le partager sans couper les sélections."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  }
  async function deleteSaved(id) {
    if (deletingRef.current.has(id) || !paidAccount(accountRef.current)) return;
    const token = epoch.current; deletingRef.current.add(id); setDeleting((previous) => [...previous, id]);
    try {
      await api.delete(`/builder/my-combos/${encodeURIComponent(id)}`, { timeout: 10000 });
      if (active(token)) { setSavedCombos((previous) => previous.filter((combo) => combo.id !== id)); setNotice("Ticket supprimé."); setLastSaved(""); }
    } catch (error) { if (active(token)) setNotice(requestError(error, "La suppression n’a pas été confirmée. Actualise la liste.")); }
    finally { deletingRef.current.delete(id); if (active(token)) setDeleting((previous) => previous.filter((value) => value !== id)); }
  }

  return <AppLayout>
    <style>{BUILDER_CSS}</style>
    <div className="cb-page" data-testid="builder-page">
      <header className="cb-hero"><div><p className="cb-eyebrow"><Sparkles aria-hidden="true" />WNPULSE · COMBO BUILDER</p><h1>Ton combiné.<br /><span>Tes choix.</span></h1><p className="cb-intro">Explore les rencontres, compare les marchés et réunis tes sélections dans un ticket qui se lit en un coup d’œil.</p><p className="cb-time"><Clock aria-hidden="true" />Horaires : {timeZone}{loadedAt !== null ? ` · Chargé à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(loadedAt))}` : ""}</p></div><div className="cb-hero-aside"><div><strong>{loading ? "—" : eligible.length}</strong><span>rencontres au catalogue</span></div><div><strong>{loading ? "—" : availableOptions}</strong><span>options sélectionnables</span></div><button type="button" className="cb-button cb-button--hero" onClick={loadCatalogue} disabled={loading || refreshing || authLoading} data-testid="builder-refresh-btn"><RefreshCw aria-hidden="true" className={refreshing ? "cb-spin" : ""} />{refreshing ? "Actualisation…" : "Actualiser"}</button></div></header>
      {(loadError || accessError) && <div role="alert" className="cb-alert"><Info aria-hidden="true" /><div>{loadError && <p>{loadError}</p>}{accessError && <p>{accessError}</p>}<button type="button" className="cb-button cb-button--outline" onClick={loadCatalogue} disabled={refreshing}>Réessayer</button></div></div>}
      {unauthorized ? <section className="cb-empty"><Lock aria-hidden="true" /><h2>Reconnecte-toi pour continuer</h2><p>Ta session a expiré. Les sélections de la session précédente ont été retirées.</p><Link to="/login" className="cb-button cb-button--primary">Se connecter</Link></section> : <>
        <section className="cb-controls" aria-label="Rechercher et filtrer les rencontres"><div className="cb-search"><label htmlFor="cb-search"><Search aria-hidden="true" />Quelle rencontre cherches-tu ?</label><div><input id="cb-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Équipe, championnat ou pays…" type="search" data-testid="builder-search" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche"><X aria-hidden="true" /></button>}</div></div><label className="cb-filter" htmlFor="cb-day">Date<select id="cb-day" value={day} onChange={(event) => setDay(event.target.value)}><option value="all">Toutes les dates</option><option value="today">Aujourd’hui</option><option value="tomorrow">Demain</option></select></label><label className="cb-filter" htmlFor="cb-order">Classer par<select id="cb-order" value={order} onChange={(event) => setOrder(event.target.value)}><option value="time">Horaire</option><option value="competition">Compétition</option></select></label></section>
        <div className="cb-sports" aria-label="Choisir un sport" data-testid="builder-sport-tabs">{SPORT_TABS.filter((tab) => tab.key !== "other" || sportCounts.other).map((tab) => <button key={tab.key} type="button" onClick={() => setSport(tab.key)} aria-pressed={sport === tab.key} data-testid={`builder-tab-${tab.key}`}>{tab.label}<span>{loading ? "—" : sportCounts[tab.key] || 0}</span></button>)}</div>
        <div className="cb-main">
          <section className="cb-catalogue" aria-labelledby="cb-matches-heading"><div className="cb-section-title"><div><p className="cb-kicker">01 · Compose ton ticket</p><h2 id="cb-matches-heading">Les rencontres à explorer</h2><p>{loading ? "Chargement du programme…" : `${filtered.length} rencontre${filtered.length > 1 ? "s" : ""} correspond${filtered.length > 1 ? "ent" : ""} à tes filtres`}</p></div></div>
            {selectedPicks.length > 0 && <a href="#builder-ticket" onClick={() => setTicketOpen(true)} className="cb-ticket-jump"><span><Trophy aria-hidden="true" />{selectedPicks.length} sélection{selectedPicks.length > 1 ? "s" : ""}<b>Cote {format(metrics.totalOdds)}</b></span><strong>Voir le ticket<ArrowRight aria-hidden="true" /></strong></a>}
            {loadedAt !== null && !fresh && <p className="cb-alert" role="status">Le catalogue n’a pas été vérifié depuis plus de cinq minutes. Actualise avant d’ajouter ou de partager une sélection.</p>}
            {skipped > 0 && <p className="cb-small-note">Certaines données incomplètes n’ont pas pu être affichées.</p>}
            {loading || authLoading ? <div className="cb-empty" role="status"><Loader2 aria-hidden="true" className="cb-spin" /><h3>Chargement des rencontres</h3><p>Les options disponibles apparaîtront ici.</p></div> : !filtered.length ? <div className="cb-empty"><Search aria-hidden="true" /><h3>{eligible.length ? "Aucune rencontre pour ces filtres" : "Aucune rencontre disponible actuellement"}</h3><p>{eligible.length ? "Essaie une autre équipe ou élargis les filtres." : "Actualise plus tard pour retrouver les prochains marchés proposés."}</p>{eligible.length > 0 && <button type="button" className="cb-button cb-button--outline" onClick={() => { setSport("all"); setDay("all"); setQuery(""); }}>Réinitialiser les filtres</button>}</div> : <><div className="cb-matches">{filtered.slice(0, limit).map((match) => <MatchCard key={match.match_id} match={match} expanded={expandedMatchId === match.match_id} onToggle={() => setExpandedMatchId((value) => value === match.match_id ? null : match.match_id)} onPickToggle={togglePick} selectedKeys={selectedKeys} now={now} fresh={fresh} canStats={canPersist} stats={canPersist ? matchStats[match.match_id] : null} onStats={() => loadStats(match)} />)}</div><p className="cb-results-count">{Math.min(limit, filtered.length)} sur {filtered.length} rencontres affichées</p>{limit < filtered.length && <button type="button" className="cb-button cb-button--outline cb-show-more" onClick={() => setLimit((value) => value + 12)}>Afficher les rencontres suivantes<Plus aria-hidden="true" /></button>}</>}
          </section>
          <aside className="cb-sidebar" aria-label="Ton ticket et tes sauvegardes">
            <section className="cb-ticket" id="builder-ticket" data-testid="builder-panel"><header><div><p className="cb-kicker">02 · Ton ticket</p><h2>Mon combiné</h2><p>{selectedPicks.length ? `${selectedPicks.length} sélection${selectedPicks.length > 1 ? "s" : ""} · Cote ${format(metrics.totalOdds)}` : "Une sélection par rencontre"}</p></div><Trophy aria-hidden="true" /></header>
              {mobile && <button type="button" className="cb-ticket-toggle" aria-expanded={ticketOpen} aria-controls="cb-ticket-content" onClick={() => setTicketOpen((value) => !value)}>{ticketOpen ? "Replier le ticket" : "Ouvrir mon ticket"}<ChevronDown aria-hidden="true" className={ticketOpen ? "cb-rotated" : ""} /></button>}
              <div id="cb-ticket-content" hidden={mobile && !ticketOpen} className="cb-ticket-content">
                {!selectedPicks.length ? <div className="cb-ticket-empty"><Plus aria-hidden="true" /><h3>Ton ticket commence ici</h3><p>Ajoute une option sur une rencontre. Tu peux remplacer ton choix sans ajouter deux paris sur le même match.</p></div> : <>
                  <div className="cb-ticket-total"><span>Cote cumulée</span><strong data-testid="builder-total-odds">{format(metrics.totalOdds)}</strong><p>Produit des cotes des sélections du ticket.</p></div>
                  <dl className="cb-ticket-metrics"><div><dt>Confiance moyenne du moteur</dt><dd>{metrics.confidence === null ? "Non disponible" : `${format(metrics.confidence, 1)} %`}</dd></div><div><dt>Sports représentés</dt><dd>{metrics.sports}</dd></div></dl><p className="cb-small-note">La confiance moyenne ne représente pas la probabilité que le combiné passe.</p>
                  <div className="cb-ticket-list" data-testid="builder-legs-list">{selectedPicks.map((pick, index) => {
                    const outdated = !pick._available || dateValue(pick.commence_time) === null || dateValue(pick.commence_time) <= now;
                    return <div key={pick._key} className={`cb-ticket-leg${outdated ? " cb-ticket-leg--warning" : ""}`}><div className="cb-leg-number">{index + 1}</div><div><p>{pick.home_team} <span>contre</span> {pick.away_team}</p><p>{pick.market_label} · <strong>{pick.pick}</strong></p><p>{dateLabel(pick.commence_time)} · Cote {format(pick.pick_odds)}</p>{pick.synthetic && <p className="cb-estimated">Marché estimé · cote à confirmer</p>}{pick._previous_odds !== null && <p className="cb-estimated">Cote actualisée : {format(pick._previous_odds)} → {format(pick.pick_odds)}</p>}{outdated && <p className="cb-leg-warning">{pick._issue || "Rencontre commencée ou horaire à vérifier"}</p>}</div><button type="button" className="cb-icon-button" onClick={() => setSelectedPicks((previous) => previous.filter((item) => item._key !== pick._key))} aria-label={`Retirer ${pick.home_team} contre ${pick.away_team}`} data-testid={`builder-remove-${index}`}><Trash2 aria-hidden="true" /></button></div>;
                  })}</div>
                  <button type="button" className="cb-clear" onClick={() => setSelectedPicks([])} data-testid="builder-clear-btn"><Trash2 aria-hidden="true" />Vider le ticket</button>
                  <label className="cb-name" htmlFor="cb-name">Nom du ticket <span>(facultatif)</span><input id="cb-name" maxLength={100} value={comboName} onChange={(event) => setComboName(event.target.value)} placeholder="Mon combiné du week-end" data-testid="builder-name-input" /></label>
                  {!usable && <p className="cb-action-help">Actualise le catalogue et retire ou remplace les sélections signalées pour enregistrer ou partager le ticket.</p>}
                  {canPersist ? <button type="button" className="cb-button cb-button--primary cb-wide" onClick={saveCombo} disabled={saving || !usable || fingerprint === lastSaved} data-testid="builder-save-btn">{saving ? <Loader2 aria-hidden="true" className="cb-spin" /> : fingerprint === lastSaved ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}{saving ? "Enregistrement…" : fingerprint === lastSaved ? "Ticket enregistré" : "Enregistrer le ticket"}</button> : account && !isPaid && accessFresh ? <Link to="/app/abonnement" className="cb-button cb-button--primary cb-wide"><Lock aria-hidden="true" />Enregistrer avec Pro</Link> : <button type="button" className="cb-button cb-button--outline cb-wide" onClick={loadCatalogue} disabled={refreshing}>Vérifier mon accès<RefreshCw aria-hidden="true" /></button>}
                  <div className="cb-share-actions"><button type="button" className="cb-button cb-button--outline" onClick={copyTicket} disabled={!usable} data-testid="builder-copy-btn"><Copy aria-hidden="true" />Copier</button><button type="button" className="cb-button cb-button--whatsapp" onClick={shareWhatsApp} disabled={!usable} data-testid="builder-whatsapp-btn"><Send aria-hidden="true" />WhatsApp</button></div>
                </>}
                {account && !isPaid && <div className="cb-free-note"><Lock aria-hidden="true" /><p>Les options avec un cadenas demandent un abonnement. L’enregistrement des tickets est réservé aux abonnés.</p><Link to="/app/abonnement">Voir les formules<ArrowRight aria-hidden="true" /></Link></div>}
                {notice && <p className="cb-notice" role="status">{notice}</p>}
                {manualCopy && usable && <div className="cb-manual-copy"><label htmlFor="cb-copy-text">Texte du ticket</label><textarea id="cb-copy-text" readOnly value={manualCopy} onFocus={(event) => event.target.select()} /><button type="button" className="cb-button cb-button--outline" onClick={() => setManualCopy("")}>Fermer<X aria-hidden="true" /></button></div>}
              </div>
            </section>
            <section className="cb-saved" data-testid="builder-saved-list"><details className="cb-saved-drawer" open={!mobile}><summary><span>Mes tickets enregistrés</span><ChevronDown aria-hidden="true" /></summary><div className="cb-saved-body"><div className="cb-saved-heading"><p>Historique de tes tickets</p>{isPaid && <button type="button" className="cb-icon-button" onClick={loadSaved} disabled={savedStatus === "loading"} aria-label="Actualiser les tickets enregistrés"><RefreshCw aria-hidden="true" className={savedStatus === "loading" ? "cb-spin" : ""} /></button>}</div>
              {!account || !accessFresh ? <p>Ton accès est en cours de vérification.</p> : !isPaid ? <p>Retrouve tes tickets enregistrés avec un abonnement.</p> : <>
                {savedStatus === "loading" && <p role="status">Chargement des sauvegardes…</p>}{savedError && <p role="alert">{savedError}</p>}
                {savedStatus === "ready" && !savedCombos.length && <p>Aucun ticket enregistré pour le moment.</p>}
                {savedCombos.map((combo) => <div key={combo.id} className="cb-saved-item"><details><summary><span><strong>{combo.name}</strong><span>Cote {format(combo.total_odds)} · {combo.num_legs ?? "—"} sélection{combo.num_legs > 1 ? "s" : ""}</span><span>{dateLabel(combo.created_at)}</span></span><ChevronDown aria-hidden="true" /></summary><div className="cb-saved-legs">{combo.legs.length ? combo.legs.map((leg, index) => <p key={index}><strong>{string(leg.home_team, "Équipe à confirmer")} contre {string(leg.away_team, "Équipe à confirmer")}</strong><span>{string(leg.pick, "Sélection non communiquée")} · Cote {format(price(leg.pick_odds))}</span></p>) : <p>Le détail de ce ticket n’est pas disponible.</p>}<p>Ticket archivé : les horaires et cotes ne sont pas actualisés ici.</p></div></details><button type="button" className="cb-icon-button" disabled={deleting.includes(combo.id)} onClick={() => deleteSaved(combo.id)} aria-label={`Supprimer le ticket ${combo.name}`} data-testid={`saved-delete-${combo.id}`}>{deleting.includes(combo.id) ? <Loader2 aria-hidden="true" className="cb-spin" /> : <Trash2 aria-hidden="true" />}</button></div>)}
              </>}
              </div></details>
            </section>
          </aside>
        </div>
      </>}
    </div>
  </AppLayout>;
}


function RiskLabel({ value }) {
  if (!value) return null;
  const label = normalize(value), kind = /risqu|risky/.test(label) ? "risky" : /modere|value/.test(label) ? "moderate" : /safe|sur/.test(label) ? "safe" : "neutral";
  const labels = { safe: "Prudent", value: "Modéré", risky: "Risqué" };
  return <span className={`cb-risk cb-risk--${kind}`}>{labels[value] || value}</span>;
}

function MatchCard({ match, expanded, onToggle, onPickToggle, selectedKeys, now, fresh, canStats, stats, onStats }) {
  const [group, setGroup] = useState("all"), [visible, setVisible] = useState(6), [statsOpen, setStatsOpen] = useState(false);
  const available = match.picks.filter((pick) => selectable(match, pick, now));
  const primary = available[0], selected = match.picks.find((pick) => selectedKeys.has(pick._key));
  const options = match.picks.filter((pick) => group === "all" || marketGroup(pick) === group);
  const selectedPrimary = primary && selectedKeys.has(primary._key);
  return <article className={`cb-match${selected ? " cb-match--selected" : ""}`} data-testid={`builder-match-${match.match_id}`}>
    <button type="button" className="cb-match-header" onClick={onToggle} aria-expanded={expanded} aria-controls={`cb-markets-${encodeURIComponent(match.match_id)}`}>
      <span className="cb-match-competition"><span>{match.competition}</span>{match.country && <span className="cb-country">{match.country}</span>}</span>
      <span className="cb-match-date"><CalendarDays aria-hidden="true" />{dateLabel(match.commence_time)}</span>
      <span className="cb-team-pair"><strong>{match.home_team || "Équipe à confirmer"}</strong><span>contre</span><strong>{match.away_team || "Équipe à confirmer"}</strong></span>
      <span className="cb-market-count"><span>{available.length} option{available.length > 1 ? "s" : ""} sélectionnable{available.length > 1 ? "s" : ""} · {match.picks.length} proposée{match.picks.length > 1 ? "s" : ""}</span><span>{expanded ? "Replier" : "Voir les marchés"}<ChevronDown aria-hidden="true" className={expanded ? "cb-rotated" : ""} /></span></span>
    </button>
    {primary ? <div className="cb-primary"><div><span className="cb-label">Choix proposé · {primary.market_label}</span><strong>{primary.pick}</strong><div><span>Cote <b>{format(primary.pick_odds)}</b></span><span>Confiance {primary.confidence === null ? "non fournie" : `${format(primary.confidence, 1)} %`}</span></div>{primary.synthetic && <span className="cb-estimated">Marché estimé · cote à confirmer</span>}</div><button type="button" className={`cb-button ${selectedPrimary ? "cb-button--selected" : "cb-button--primary"}`} disabled={!fresh} aria-pressed={Boolean(selectedPrimary)} onClick={() => onPickToggle(match, primary)} data-testid={`builder-quick-${match.match_id}`}>{selectedPrimary ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{selectedPrimary ? "Retirer" : "Ajouter"}</button></div> : <div className="cb-no-pick"><Lock aria-hidden="true" /><p>{match.picks.some((pick) => pick.locked) ? "Des marchés de cette rencontre sont réservés aux abonnés." : "Aucune option avec une cote et un horaire disponibles."}</p>{match.picks.some((pick) => pick.locked) && <Link to="/app/abonnement">Voir les formules<ArrowRight aria-hidden="true" /></Link>}</div>}
    {selected && selected._key !== primary?._key && <p className="cb-other-selected"><Check aria-hidden="true" />Une autre option de cette rencontre est dans ton ticket.</p>}
    {expanded && <div className="cb-expanded" id={`cb-markets-${encodeURIComponent(match.match_id)}`}>
      <div className="cb-market-filters" aria-label={`Filtrer les marchés de ${match.home_team}`}><SlidersHorizontal aria-hidden="true" />{Object.entries(GROUPS).filter(([key]) => key === "all" || match.picks.some((pick) => marketGroup(pick) === key)).map(([key, label]) => <button type="button" key={key} aria-pressed={group === key} onClick={() => { setGroup(key); setVisible(6); }}>{label}</button>)}</div>
      <p className="cb-small-note">Un seul choix par rencontre : ajouter une autre option remplace la précédente.</p>
      <div className="cb-option-grid">{options.slice(0, visible).map((pick, index) => {
        const picked = selectedKeys.has(pick._key), allowed = selectable(match, pick, now), disabled = !allowed || !fresh;
        return <div className={`cb-option${picked ? " cb-option--selected" : ""}${pick.locked ? " cb-option--locked" : ""}`} key={pick._key}>
          <button type="button" className="cb-option-select" disabled={disabled} aria-pressed={picked} onClick={() => onPickToggle(match, pick)} data-testid={`builder-pick-${match.match_id}-${pick.market}-${index}`}>
            <span className="cb-option-market">{pick.market_label}{pick.locked ? <Lock aria-hidden="true" /> : picked ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}</span>
            <strong className="cb-option-pick">{pick.locked ? "Sélection réservée" : pick.pick || "Sélection non communiquée"}</strong>
            <span className="cb-option-metrics"><span>Cote <b>{pick.locked ? "Réservée" : format(pick.pick_odds)}</b></span>{!pick.locked && <span>Confiance <b>{pick.confidence === null ? "—" : `${format(pick.confidence, 1)} %`}</b></span>}</span>
            {!pick.locked && <RiskLabel value={pick.label} />}{pick.synthetic && <span className="cb-estimated">Marché estimé · cote à confirmer</span>}
          </button>
          {!pick.locked && pick.pick && <details className="cb-pick-explanation"><summary>Comprendre ce marché<ChevronDown aria-hidden="true" /></summary><p>{explainMarket(pick)}</p></details>}
        </div>;
      })}</div>
      {visible < options.length && <button type="button" className="cb-button cb-button--outline cb-wide" onClick={() => setVisible((value) => value + 8)}>Afficher plus de marchés ({options.length - visible})<Plus aria-hidden="true" /></button>}
      {match.picks.some((pick) => pick.locked) && <Link className="cb-unlock-link" to="/app/abonnement"><Lock aria-hidden="true" />Débloquer les marchés réservés<ArrowRight aria-hidden="true" /></Link>}
      <div className="cb-stats-block"><button type="button" className="cb-stats-toggle" aria-expanded={statsOpen} onClick={() => { setStatsOpen((value) => !value); if (!statsOpen && canStats) onStats(); }}><BarChart3 aria-hidden="true" />Repères de marché<ChevronDown aria-hidden="true" className={statsOpen ? "cb-rotated" : ""} /></button>
        {statsOpen && <div className="cb-stats-content">{!canStats ? <p>Les repères supplémentaires demandent un accès abonné vérifié. <Link to="/app/abonnement">Voir les formules</Link></p> : !stats || stats.status === "loading" ? <p role="status">Chargement des repères…</p> : stats.status === "error" ? <div><p role="alert">{stats.error}</p><button type="button" className="cb-button cb-button--outline" onClick={onStats}>Réessayer</button></div> : stats.values.length ? <><p>Estimations de marché disponibles pour cette rencontre. Les données insuffisantes ne sont pas affichées.</p><dl>{stats.values.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{format(item.value, 1)} %</dd></div>)}</dl></> : <p>Les repères ne sont pas renseignés pour cette rencontre.</p>}</div>}
      </div>
      <Link className="cb-match-link" to={`/app/match/${encodeURIComponent(match.match_id)}`}>Ouvrir la fiche de la rencontre<ArrowRight aria-hidden="true" /></Link>
    </div>}
  </article>;
}
