import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, ChevronDown, Clock, Info, Layers, Lock, RefreshCw, Rocket, Search, Send, Shield, SlidersHorizontal, Sparkles, X, Zap } from "lucide-react";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
const LEVELS = {
 sure: { label:"Safe", icon:Shield, color:"text-emerald-700", tint:"bg-emerald-50", border:"border-emerald-200", gradient:"from-emerald-700 to-teal-800", description:"2 à 3 rencontres au maximum. Le nom Safe ne garantit aucun résultat." },
 booster: { label:"Équilibré", icon:Zap, color:"text-orange-700", tint:"bg-orange-50", border:"border-orange-200", gradient:"from-orange-700 to-amber-800", description:"Objectif de 4 rencontres, jusqu’à 6 si la qualité le permet. Plus court si nécessaire." },
 jackpot: { label:"Jackpot", icon:Rocket, color:"text-violet-700", tint:"bg-violet-50", border:"border-violet-200", gradient:"from-violet-600 to-purple-700", description:"Objectif de 5 rencontres, jusqu’à 8 si la qualité le permet. Aucun ajout pour atteindre une cote cible." }
};
const LEVEL_ORDER = Object.keys(LEVELS);
const RISK_META = {
  safe: {
    label: "Sûr",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  value: {
    label: "Modéré",
    className: "border-amber-200 bg-amber-50 text-amber-700"
  },
  risky: {
    label: "Risqué",
    className: "border-rose-200 bg-rose-50 text-rose-700"
  }
};
const COUNTRY_ALIASES = [[/\bspain\b|\bespagne\b|la liga/i, "Espagne"], [/germany|allemagne|bundesliga/i, "Allemagne"], [/\bfrance\b|ligue 1|ligue 2/i, "France"], [/\bitaly\b|italie|serie a|serie b/i, "Italie"], [/england|angleterre|premier league|championship/i, "Angleterre"], [/\bpoland\b|pologne|ekstraklasa/i, "Pologne"], [/finland|finlande|veikkausliiga/i, "Finlande"], [/\bjapan\b|japon|j league/i, "Japon"], [/south korea|korea|corée|k league/i, "Corée du Sud"], [/\bchina\b|chine/i, "Chine"], [/\bportugal\b|primeira liga/i, "Portugal"], [/netherlands|pays.bas|eredivisie/i, "Pays-Bas"]];
function number(value) {
  if (value === null || value === undefined || typeof value === "string" && !value.trim() || !["number", "string"].includes(typeof value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function formatNumber(i18n, value, digits = 1) {
  const n = number(value);
  return n === null ? i18n.t("Non disponible") : new Intl.NumberFormat(i18n.locale, {
    maximumFractionDigits: digits
  }).format(n);
}
function percent(i18n, value) {
  const n = number(value);
  return n !== null && n >= 0 && n <= 100 ? `${formatNumber(i18n, n)} %` : i18n.t("Non disponible");
}
function dateValue(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  // Accept legacy ISO timestamps without a zone as UTC, like the server.
  const raw = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}
function formatDate(i18n, value, options) {
  const date = dateValue(value);
  if (!date) return i18n.t("Horaire non communiqué");
  try {
    return new Intl.DateTimeFormat(i18n.locale, options).format(date);
  } catch {
    return i18n.t("Horaire non communiqué");
  }
}
function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function country(leg) {
  const supplied = text(leg.country_name) || text(leg.country);
  if (supplied) return supplied;
  const competition = text(leg.sport_title) || text(leg.league_name) || text(leg.league);
  // Avoid attributing international tournaments to a country from a name guess.
  if (/uefa|fifa|champions league|europa league|nations league|world cup/i.test(competition)) return "International";
  return COUNTRY_ALIASES.find(([pattern]) => pattern.test(competition))?.[1] || "";
}
function legSearch(i18n, leg) {
  return normalize([leg.home_team, leg.away_team, leg.sport_title, leg.league_name, leg.league, country(leg), i18n.tx(country(leg))].filter(Boolean).join(" "));
}
function matchesQuery(i18n, leg, query) {
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(word => legSearch(i18n, leg).includes(word));
}
function normalizeData(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.error) throw new Error("Invalid combos response");
  if (!payload.families || typeof payload.families !== "object" || Array.isArray(payload.families)) throw new Error("Missing families");
  const families = Object.entries(payload.families).flatMap(([key, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return [{
      ...value,
      family_key: text(value.family_key, key),
      family_label: text(value.family_label, key),
      tiers: value.tiers && typeof value.tiers === "object" && !Array.isArray(value.tiers) ? value.tiers : {}
    }];
  }).sort((a, b) => a.family_key === "all" ? -1 : b.family_key === "all" ? 1 : 0);
  if (Object.keys(payload.families).length && !families.length) throw new Error("Invalid families");
  return {
    ...payload,
    normalizedFamilies: families
  };
}
function tierLegs(tier) {
  return Array.isArray(tier?.legs) ? tier.legs.filter(p => p && typeof p === "object" && !Array.isArray(p)) : [];
}
function tierCount(tier) {
  return Math.max(tierLegs(tier).length, Math.max(0, Math.floor(number(tier?.leg_count) ?? 0)));
}
function isLegLocked(leg, tier, key, isFree, index) {
  if (leg.locked === true) return true;
  // Older responses omit locks on Ultra-Safe. Never reveal it by client default.
  if (isFree && key !== "sure") return true;
  if (tier.locked === true) return leg.locked !== false;
  return isFree && key === "sure" && index > 0;
}
function isTierLocked(tier, key, isFree) {
  return tier.locked === true || isFree && (key !== "sure" || tierCount(tier) > 1) || tierLegs(tier).some(leg => leg.locked === true);
}
function availability(tier, now) {
  const legs = tierLegs(tier);
  if (legs.some(p => p.completed || p.is_finished || p.finished || (dateValue(p.commence_time)?.getTime() ?? Infinity) <= now)) return "started";
  return tierCount(tier) >= 2 ? "ready" : "incomplete";
}
function canShare(tier, key, isFree, now) {
  const legs = tierLegs(tier);
  return availability(tier, now) === "ready" && !isTierLocked(tier, key, isFree) && legs.length === tierCount(tier) && legs.every((p, i) => !isLegLocked(p, tier, key, isFree, i) && text(p.pick) && number(p.pick_odds) > 1);
}
function explainPick(i18n, leg) {
  const pick = text(leg.pick);
  const market = normalize(`${text(leg.market)} ${text(leg.market_label)}`);
  if (/double.?chance/.test(market)) return i18n.t("Deux issues sont couvertes : celles indiquées par la sélection.");
  if (/draw_no_bet|nul rembours/.test(market)) return "La sélection porte sur une victoire ; le nul relève du règlement spécifique de ce marché.";
  if (/btts|equipes marquent/.test(market)) return i18n.t("Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.");
  if (/handicap|spreads/.test(market)) return i18n.t("Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.");
  if (/total/.test(market) || /plus de|moins de|over|under/.test(normalize(pick))) {
    const values = pick.match(/\d+(?:[.,]\d+)?/g);
    const threshold = number(leg.pick_point) ?? (values ? number(values[values.length - 1].replace(",", ".")) : null);
    if (threshold !== null && threshold % 1 === 0.5) {
      if (/moins de|under/.test(normalize(pick))) return i18n.t("Le total doit rester inf\xE9rieur \xE0 {{v0}} sur la p\xE9riode couverte par ce march\xE9.", {
        v0: formatNumber(i18n, threshold)
      });
      if (/plus de|over/.test(normalize(pick))) return i18n.t("Le total doit d\xE9passer {{v0}} sur la p\xE9riode couverte par ce march\xE9.", {
        v0: formatNumber(i18n, threshold)
      });
    }
    return i18n.t("Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.");
  }
  if (/h2h|vainqueur|victoire|1x2/.test(market)) return /^(nul|draw|match nul)$/i.test(pick) ? i18n.t("La sélection prévoit un match nul pendant la période couverte.") : i18n.t("La s\xE9lection pr\xE9voit la victoire de {{v0}}, selon la p\xE9riode couverte par le march\xE9.", {
    v0: pick
  });
  return "Cette sélection porte sur l’événement indiqué par son marché ; la période couverte doit être vérifiée.";
}
function errorMessage(i18n, error) {
  const status = error?.response?.status;
  if (status === 401) return i18n.t("Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.");
  if (status === 403) return i18n.t("Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.");
  if (status === 504 || error?.code === "ECONNABORTED") return i18n.t("Le chargement a pris trop de temps. Réessaie dans un instant.");
  return i18n.t("Impossible de charger les combinés pour le moment. Réessaie dans un instant.");
}
export default function TodayCombosPage() {
  const i18n = useTodayLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sportKey, setSportKey] = useState("all");
  const [levelKey, setLevelKey] = useState("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now());
  const [receivedAt, setReceivedAt] = useState(null);

  const request = useRef(null);
  const lastAttempt = useRef(0);
  const mounted = useRef(false);
  const dataRef = useRef(null);

  const clientTier = normalize(user?.subscription_tier || user?.subscription || "free");
  const authKey = `${user?.id || "anonymous"}|${clientTier}|${user?.subscription_expires_at || ""}|${Boolean(user?.is_admin)}`;
  const isFree = typeof data?.access?.is_paid === "boolean" ? !data.access.is_paid : !user?.is_admin && clientTier === "free";
  const load = useCallback(async (background = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    lastAttempt.current = Date.now();
    setError("");
    if (background && dataRef.current) setRefreshing(true);else setLoading(true);
    try {
      const response = await api.get("/predictions/today-combos", {
        signal: controller.signal,
        timeout: 20_000
      });
      const normalized = normalizeData(response.data);
      if (controller.signal.aborted || !mounted.current) return;
      dataRef.current = normalized;
      setData(normalized);
      setReceivedAt(new Date().toISOString());
      setNow(Date.now());
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) {
        if ([401,403].includes(cause?.response?.status)) { dataRef.current=null; setData(null); }
        setError(errorMessage(i18n, cause));
      }
    } finally {
      if (!controller.signal.aborted && mounted.current) {
        setLoading(false);
        setRefreshing(false);
        request.current = null;
      }
    }
  }, [i18n]);
  useEffect(() => {
    mounted.current = true;
    dataRef.current = null;
    setData(null);
    setReceivedAt(null);
    setRefreshing(false);
    load();
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, [authKey, load]);
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      if (!document.hidden && !request.current && Date.now() - lastAttempt.current >= 60_000) load(true);
    };
    const focus = () => {
      if (!document.hidden && !request.current && Date.now() - lastAttempt.current >= 10_000) load(true);
    };
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [load]);
  const families = useMemo(() => data?.normalizedFamilies || [], [data]);
  useEffect(() => {
    if (families.length && !families.some(f => f.family_key === sportKey)) setSportKey(families[0].family_key);
  }, [families, sportKey]);
  const family = families.find(f => f.family_key === sportKey);
  const tiers = useMemo(() => {
    const result = Object.entries(family?.tiers || {}).filter(([key, tier]) => LEVEL_ORDER.includes(key) && tier && typeof tier === "object" && !Array.isArray(tier));
    return result.sort(([a], [b]) => (LEVEL_ORDER.indexOf(a) < 0 ? 99 : LEVEL_ORDER.indexOf(a)) - (LEVEL_ORDER.indexOf(b) < 0 ? 99 : LEVEL_ORDER.indexOf(b)));
  }, [data, family, sportKey]);
  const searchLanguage = i18n.language;
  const filtered = useMemo(() => tiers.filter(([key, tier]) => (levelKey === "all" || key === levelKey) && (!query.trim() || tierLegs(tier).some(leg => matchesQuery(i18n, leg, query.toLocaleLowerCase(searchLanguage))))), [tiers, levelKey, query, i18n, searchLanguage]);
  useEffect(() => {
    if (tiers.length && levelKey !== "all" && !tiers.some(([key]) => key === levelKey)) setLevelKey("all");
  }, [tiers, levelKey]);
  const available = tiers.filter(([, tier]) => availability(tier, now) === "ready").length;
  const accessible = tiers.filter(([key, tier]) => canShare(tier, key, isFree, now)).length;
  const upcoming = number(family?.matches_today);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale";
  const generatedLabel = formatDate(i18n, data?.generated_at, {
    day: "numeric",
    month: "long",
    timeZone: data?.schedule_timezone || "UTC"
  });
  const shareWhatsApp = (tier, key) => {
    if (!canShare(tier, key, isFree, Date.now())) {
      toast.error(i18n.t("Ce combiné ne peut pas être partagé dans son état actuel."));
      return;
    }
    const lines = [i18n.t("\uD83C\uDFAF *WinPulse \xB7 {{v0}}*", {
      v0: i18n.tx(LEVELS[key]?.label || text(tier.label, "Combiné du jour"))
    }), i18n.t("Cote totale : {{v0}}", {
      v0: formatNumber(i18n, tier.total_odds, 2)
    }), ""];
    tierLegs(tier).forEach((p, index) => {
      lines.push(i18n.t("{{v0}}. *{{v1}} vs {{v2}}*", {
        v0: index + 1,
        v1: text(p.home_team, i18n.t("Domicile")),
        v2: text(p.away_team, i18n.t("Extérieur"))
      }), `🏟 ${text(p.sport_title, text(p.league_name, i18n.t("Compétition non communiquée")))}${country(p) ? ` · ${i18n.tx(country(p))}` : ""}`, `📅 ${formatDate(i18n, p.commence_time, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })} (${localZone})`, i18n.t("\uD83D\uDC49 {{v0}} : {{v1}} \xB7 cote {{v2}}", {
        v0: i18n.bet(text(p.market_label, "Marché")),
        v1: i18n.bet(p.pick),
        v2: formatNumber(i18n, p.pick_odds, 2)
      }), "");
    });
    lines.push(i18n.t("Toutes les sélections doivent réussir. Aucun résultat garanti."), i18n.t("Les cotes peuvent évoluer."), i18n.t("Découvrir les analyses : https://wnpulse.com"));
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  };
  return <AppLayout>
      <style>{i18n.tx(`
        .wn-combo-in { animation: wn-combo-in .35s ease-out both; }
        .wn-today-readable { font-size: 16px; line-height: 1.6; }
        .wn-today-readable summary { min-height: 44px; display: flex; align-items: center; }
        .wn-today-readable button, .wn-today-readable select { min-height: 44px; }
        .wn-today-readable button:focus-visible, .wn-today-readable summary:focus-visible { outline: 3px solid #fb923c; outline-offset: 3px; }
        .wn-today-readable .wn-team { overflow-wrap: anywhere; }
        @keyframes wn-combo-in { from { opacity: .5; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .wn-combo-in { animation: none; } }
      `)}</style>
      <div className="wn-today-readable mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 pb-24">
        <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white sm:p-10 mb-7">
          <div className="pointer-events-none absolute -end-16 -top-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute bottom-0 end-20 h-40 w-40 rounded-full bg-teal-400/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[14px] font-semibold tracking-wide">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Layers className="h-3.5 w-3.5" />{i18n.t("COMBIN\xC9S DU JOUR")}</span>
                {i18n.tx(!loading && data && <span className="rounded-full border border-white/15 px-3 py-1.5 text-slate-300">{i18n.tx(generatedLabel)}</span>)}
              </div>
              <h1 className="font-heading text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">{i18n.rich("Un combin\xE9.{{v0}}{{v1}}", {
                v0: <br />,
                v1: <span className="text-orange-400">{i18n.t("Chaque match compte.")}</span>
              })}</h1>
              <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-slate-300 sm:text-base">{i18n.t("Explore les rencontres, comprends les s\xE9lections et choisis le format qui te correspond.")}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-[14px] text-slate-400">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{i18n.rich("Horaires : {{v0}}", {
                  v0: i18n.tx(localZone)
                })}</span>
                {i18n.tx(receivedAt && <span>{i18n.rich("Charg\xE9 \xE0 {{v0}}", {
                  v0: i18n.tx(formatDate(i18n, receivedAt, {
                    hour: "2-digit",
                    minute: "2-digit"
                  }))
                })}</span>)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
              <HeroStat value={loading || upcoming === null ? "—" : formatNumber(i18n, upcoming, 0)} label={i18n.t("Matchs à venir")} />
              <HeroStat value={loading ? "—" : available} label={i18n.t("Combinés prêts")} />
              <HeroStat value={loading ? "—" : accessible} label={i18n.t("Accessibles")} />
            </div>
          </div>
        </section>

        {i18n.tx(error && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[16px] text-rose-800">{i18n.tx(error)}{i18n.tx(data && " Les dernières données chargées restent affichées ; leur actualisation a échoué.")}</p>
          <Button variant="outline" size="sm" onClick={() => load(Boolean(data))} disabled={loading || refreshing}><RefreshCw className="me-2 h-4 w-4" />{i18n.t("R\xE9essayer")}</Button>
        </div>)}

        <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[16px] font-bold text-slate-900"><SlidersHorizontal className="h-4 w-4 text-orange-600" />{i18n.t("Trouve ton combin\xE9")}</div>
            <Button variant="outline" size="sm" onClick={() => load(Boolean(data))} disabled={loading || refreshing} className="self-start sm:self-auto">
              <RefreshCw className={cn("me-2 h-4 w-4", refreshing && "animate-spin")} />{i18n.tx(refreshing ? "Actualisation…" : "Actualiser")}
            </Button>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label={i18n.t("Filtrer par sport")}>
            {i18n.tx(families.map(f => <button type="button" key={f.family_key} aria-pressed={sportKey === f.family_key} onClick={() => setSportKey(f.family_key)} className={cn("shrink-0 min-h-[48px] rounded-xl border px-5 py-3 text-[16px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500", sportKey === f.family_key ? "border-slate-900 bg-slate-900 text-white" : "border-neutral-200 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50")}>
              {i18n.tx(f.family_label)}<span className="ms-2 text-[14px] opacity-60">{i18n.tx(formatNumber(i18n, f.matches_today, 0))}</span>
            </button>))}
            {i18n.tx(loading && !families.length && <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <label htmlFor="wn-combo-search" className="sr-only">{i18n.t("Rechercher une \xE9quipe, un pays ou un championnat")}</label>
              <Search className="pointer-events-none absolute start-4 top-4 h-4 w-4 text-slate-400" />
              <input id="wn-combo-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("Équipe, pays, championnat…")} className="h-12 w-full rounded-xl border border-neutral-200 bg-slate-50 ps-11 pe-12 text-[16px] text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
              {i18n.tx(query && <button type="button" onClick={() => setQuery("")} aria-label={i18n.t("Effacer la recherche")} className="absolute end-1 top-0 flex h-12 w-10 items-center justify-center rounded-lg text-slate-600"><X className="h-5 w-5" /></button>)}
            </div>
            <div className="relative md:w-56">
              <label htmlFor="wn-combo-level" className="sr-only">{i18n.t("Choisir un niveau de combin\xE9")}</label>
              <select id="wn-combo-level" value={levelKey} onChange={e => setLevelKey(e.target.value)} className="h-12 w-full appearance-none rounded-xl border border-neutral-200 bg-white px-3 pe-9 text-[16px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="all">{i18n.t("Tous les formats")}</option>
                {i18n.tx(LEVEL_ORDER.map(key => <option key={key} value={key}>{i18n.tx(LEVELS[key].label)}</option>))}
              </select>
              <ChevronDown className="pointer-events-none absolute end-4 top-4 h-4 w-4 text-slate-400" />
            </div>
          </div>
        </div>

        <details className="mb-6 rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-[16px] text-slate-700">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-slate-800"><Info className="h-5 w-5 text-orange-700" />{i18n.t("Comment lire ces combin\xE9s ?")}<ChevronDown className="ms-auto h-5 w-5" /></summary>
          <div className="mt-3 space-y-2 text-[14px] leading-relaxed text-slate-600">
            <p>{i18n.t("Toutes les s\xE9lections doivent r\xE9ussir pour que le combin\xE9 soit gagnant. Une cote plus \xE9lev\xE9e ne signifie pas une meilleure chance de r\xE9ussite.")}</p>
            <p>{i18n.t("La confiance moyenne concerne les s\xE9lections individuelles. L\u2019estimation combin\xE9e, si le moteur la fournit, est indicative et d\xE9pend de ses hypoth\xE8ses et des corr\xE9lations entre \xE9v\xE9nements.")}</p>
            <p>{i18n.t("Les s\xE9lections viennent du moteur statistique WinPulse. Les explications d\xE9crivent les march\xE9s et les donn\xE9es disponibles ; elles ne garantissent aucun r\xE9sultat.")}</p>
            <p>{i18n.rich("La journ\xE9e du flux est d\xE9finie en {{v0}}. Les dates et horaires des rencontres sont affich\xE9s dans ton fuseau : {{v1}}.", {
              v0: i18n.tx(data?.schedule_timezone || "UTC"),
              v1: i18n.tx(localZone)
            })}</p>
          </div>
        </details>

        {i18n.tx(loading ? <LoadingCards /> : !data ? <EmptyState title={i18n.t("Les combinés ne sont pas encore chargés")} description={i18n.t("Utilise Réessayer pour récupérer les données du jour.")} /> : !tiers.length ? <EmptyState title={i18n.t("Aucun combiné disponible pour ce sport")} description={i18n.t("De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles.")} /> : !filtered.length ? <EmptyState title={i18n.t("Aucun combiné ne correspond à ta recherche")} description={i18n.t("Essaie un autre championnat, une autre équipe ou un autre format.")} action={() => {
        setQuery("");
        setLevelKey("all");
      }} /> : <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[14px] text-slate-500" aria-live="polite">
              <span>{i18n.t(filtered.length === 1 ? "{{count}} format affiché" : "{{count}} formats affichés", {
              count: filtered.length
            })} · {i18n.tx(family?.family_label)}</span>
              {i18n.tx(query.trim() && <span>{i18n.t("Le combin\xE9 entier est conserv\xE9 lorsqu\u2019une rencontre correspond.")}</span>)}
            </div>
            <div className="mb-5">
              <h2 className="font-heading text-[24px] font-extrabold text-slate-900">{i18n.t("Choisis ton format")}</h2>
              <p className="mt-1 text-[16px] text-slate-600">{i18n.t("Un format par couleur, puis les rencontres dans l\u2019ordre. Ouvre une explication quand tu veux en savoir plus.")}</p>
            </div>
            <div className="grid items-start gap-7 xl:grid-cols-2">
              {i18n.tx(filtered.map(([key, tier], index) => <TierCard key={`${sportKey}-${key}`} tier={tier} tierKey={key} isFree={isFree} now={now} query={query} featured={key === "sure"} index={index} onUpgrade={() => navigate("/app/abonnement")} onShare={() => shareWhatsApp(tier, key)} />))}
            </div>
          </>)}
        {i18n.tx(!loading && isFree && data && <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 shrink-0 text-orange-600" /><div><p className="font-heading font-bold text-slate-900">{i18n.t("Passe de l\u2019aper\xE7u \xE0 l\u2019analyse compl\xE8te.")}</p><p className="mt-1 text-[16px] text-slate-600">{i18n.t("D\xE9bloque les s\xE9lections de chaque rencontre et les diff\xE9rents formats de combin\xE9s.")}</p></div></div>
          <Button onClick={() => navigate("/app/abonnement")} className="shrink-0 bg-orange-600 text-white hover:bg-orange-700">{i18n.t("D\xE9couvrir Pro")}<ArrowRight className="ms-2 h-4 w-4" /></Button>
        </div>)}
      </div>
    </AppLayout>;
}
function HeroStat({
  value,
  label
}) {
  const i18n = useTodayLanguage();
  return <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center"><div className="font-mono text-[30px] font-bold text-white">{i18n.tx(value)}</div><div className="mt-2 text-[14px] font-medium leading-relaxed text-slate-300">{i18n.tx(label)}</div></div>;
}
function LoadingCards() {
  const i18n = useTodayLanguage();
  return <div role="status" aria-label={i18n.t("Chargement des combinés")} className="grid gap-7 xl:grid-cols-2">{i18n.tx([0, 1, 2, 3].map(i => <Card key={i} className="overflow-hidden rounded-2xl border-neutral-200 p-5"><div className="mb-6 flex items-center gap-3"><div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-100" /><div className="h-5 w-36 animate-pulse rounded-lg bg-slate-100" /></div>{i18n.tx([0, 1].map(n => <div key={n} className="mb-3 h-24 animate-pulse rounded-xl bg-slate-50" />))}</Card>))}</div>;
}
function EmptyState({
  title,
  description,
  action
}) {
  const i18n = useTodayLanguage();
  return <Card className="rounded-2xl border-dashed border-neutral-200 bg-white px-6 py-12 text-center"><CalendarDays className="mx-auto mb-4 h-9 w-9 text-slate-300" /><h2 className="font-heading text-lg font-bold text-slate-800">{i18n.tx(title)}</h2><p className="mx-auto mt-2 max-w-md text-[16px] leading-relaxed text-slate-500">{i18n.tx(description)}</p>{i18n.tx(action && <Button variant="outline" onClick={action} className="mt-5">{i18n.t("R\xE9initialiser les filtres")}</Button>)}</Card>;
}
function TierCard({
  tier,
  tierKey,
  isFree,
  now,
  query,
  featured,
  index,
  onUpgrade,
  onShare
}) {
  const i18n = useTodayLanguage();
  const meta = LEVELS[tierKey] || {
    ...LEVELS.sure,
    label: text(tier.label, "Combiné")
  };
  const Icon = meta.icon;
  const legs = tierLegs(tier);
  const count = tierCount(tier);
  const locked = isTierLocked(tier, tierKey, isFree);
  const state = availability(tier, now);
  const hidden = legs.filter((p, i) => isLegLocked(p, tier, tierKey, isFree, i)).length + Math.max(0, count - legs.length);
  const odds = number(tier.total_odds);
  const combined = number(tier.independence_estimate);
  const statsVisible = !locked && state === "ready";
  return <Card className={cn("wn-combo-in overflow-hidden rounded-3xl bg-white shadow-md", featured ? "border-teal-200 ring-2 ring-teal-500/10" : "border-neutral-200")} style={{
    animationDelay: `${Math.min(index, 5) * 45}ms`
  }} data-testid={`today-tier-${tierKey}`}>
    <div className={cn("relative overflow-hidden bg-gradient-to-br p-5 text-white sm:p-7", meta.gradient)}>
      <div aria-hidden="true" className="pointer-events-none absolute -end-8 -top-12 h-40 w-40 rounded-full border-[18px] border-white/10" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/15"><Icon className="h-7 w-7" /></div>
          <div className="min-w-0"><h2 className="font-heading text-[25px] font-extrabold leading-tight sm:text-[28px]">{i18n.tx(meta.label)}</h2><p className="mt-2 text-[16px] text-white/90">{i18n.t(count === 1 ? "{{count}} sélection" : "{{count}} sélections", {
                count
              })}{i18n.tx(locked ? i18n.t(" \xB7 {{v0}} \xE0 d\xE9bloquer", {
                v0: hidden || count
              }) : "")}</p></div>
        </div>
        <div className="shrink-0 rounded-2xl border border-white/20 bg-black/15 px-4 py-3 text-end"><p className="text-[14px] font-medium text-white/90">{i18n.t("Cote totale")}</p><p className="mt-1 font-mono text-[32px] font-extrabold leading-none sm:text-[36px]">{i18n.tx(locked ? "PRO" : statsVisible && odds > 1 ? formatNumber(i18n, odds, 2) : "—")}</p></div>
      </div>
      <div className="relative mt-5 flex flex-wrap items-center gap-2">
        {i18n.tx(featured && <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-[14px] font-semibold">{i18n.t("Format court")}</span>)}
        <span className="rounded-full border border-white/20 bg-black/15 px-3 py-1.5 text-[14px] font-semibold">{i18n.tx(state === "started" ? "À actualiser · rencontre commencée" : state === "incomplete" ? "En préparation" : locked ? "Aperçu Pro" : "Disponible")}</span>
      </div>
    </div>
    <div className="space-y-5 p-4 sm:p-6">
      <p className="text-[16px] leading-relaxed text-slate-600">{i18n.tx(meta.description)}</p>
      {count>=2 && tier.shortened && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{i18n.t("Format raccourci : aucune rencontre ajoutée pour remplir le ticket.")}</p>}
      {tier.shared_matches?.length>0 && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{i18n.t("Ce ticket partage des rencontres avec un autre format : les résultats sont liés.")}</p>}
      {!locked && count>=2 && tier.bookmaker && <p className="text-sm text-slate-600">{i18n.t("Cotes observées chez un même bookmaker")} : <strong>{tier.bookmaker}</strong>. {i18n.t("Disponibilité et acceptation à vérifier avant utilisation.")}</p>}
      {tier.unavailable_reason === "duplicate" && <p className="text-sm text-slate-600">{i18n.t("Aucun ticket distinct suffisamment qualifié : pas de doublon publié.")}</p>}
      {i18n.tx(statsVisible && <div className={cn("rounded-2xl border p-4", meta.border, meta.tint)}>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[15px] font-semibold text-slate-700">{i18n.t("Confiance moyenne des s\xE9lections")}</span><strong className={cn("font-mono text-[22px]", meta.color)}>{i18n.tx(percent(i18n, tier.avg_confidence))}</strong></div>
        {i18n.tx(combined !== null && combined >= 0 && combined <= 100 && <details className="mt-2 border-t border-black/5 pt-2"><summary className="cursor-pointer gap-2 text-[14px] font-semibold text-slate-700"><Info className="h-4 w-4" />{i18n.rich("Estimation sous indépendance : {{v0}}", {
              v0: i18n.tx(percent(i18n, combined))
            })}</summary><p className="mt-2 text-[15px] leading-relaxed text-slate-600">{i18n.t("Cette approximation multiplie les probabilités individuelles. Elle n’est pas un taux de réussite mesuré et ne corrige pas les dépendances entre matchs.")}</p></details>)}
      </div>)}
      {i18n.tx(state === "started" && <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[16px] leading-relaxed text-amber-900">{i18n.t("Une rencontre a commenc\xE9 ou est termin\xE9e. Ce combin\xE9 ne peut plus \xEAtre partag\xE9 ; actualise pour retrouver les s\xE9lections \xE0 venir.")}</p>)}
      {i18n.tx(legs.length > 0 && <div><div className="mb-3 flex items-center gap-2 text-[15px] font-bold text-slate-700"><Layers className="h-4 w-4" />{i18n.t("Les rencontres")}</div><div className="space-y-4">{i18n.tx(legs.map((leg, legIndex) => <LegCard key={`${leg.match_id || leg.id || legIndex}-${legIndex}`} leg={leg} index={legIndex} locked={isLegLocked(leg, tier, tierKey, isFree, legIndex)} allowAnalysis={!isFree} query={query} now={now} />))}</div></div>)}
      {i18n.tx(!legs.length && <div className={cn("rounded-2xl border border-dashed p-6 text-center", meta.border, meta.tint)}>
        {i18n.tx(locked ? <Lock className={cn("mx-auto mb-3 h-8 w-8", meta.color)} /> : <Clock className="mx-auto mb-3 h-8 w-8 text-slate-500" />)}
        <p className="text-[18px] font-bold text-slate-800">{i18n.tx(locked && count > 0 ? i18n.t("{{v0}} s\xE9lections \xE0 d\xE9couvrir", {
            v0: count
          }) : "Le moteur attend davantage de sélections")}</p><p className="mt-2 text-[16px] leading-relaxed text-slate-600">{i18n.tx(locked && count > 0 ? "Le détail de ce format est disponible avec Pro." : "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement.")}</p>
      </div>)}
      {i18n.tx(state === "incomplete" && legs.length > 0 && <p className="rounded-2xl bg-slate-50 p-4 text-[16px] leading-relaxed text-slate-600">{i18n.t("Cette s\xE9lection ne constitue pas encore un combin\xE9 complet. Le partage sera disponible d\xE8s qu\u2019au moins deux rencontres seront retenues.")}</p>)}
      {i18n.tx(locked && count >= 2 ? <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5"><p className="text-[19px] font-bold text-slate-900">{i18n.t("D\xE9couvre toutes les s\xE9lections")}</p><p className="mb-4 mt-2 text-[16px] leading-relaxed text-slate-600">{i18n.t("Les rencontres sont visibles. Les march\xE9s, les cotes et les analyses compl\xE8tes se d\xE9bloquent avec Pro.")}</p><Button className="h-12 w-full rounded-xl bg-orange-700 text-[16px] text-white hover:bg-orange-800" onClick={onUpgrade} data-testid={`today-upgrade-${tierKey}`}><Lock className="me-2 h-5 w-5" />{i18n.t("D\xE9couvrir Pro")}<ArrowRight className="ms-2 h-5 w-5" /></Button></div> : <Button onClick={onShare} disabled={!canShare(tier, tierKey, isFree, now)} className="h-12 w-full rounded-xl bg-emerald-700 text-[16px] text-white hover:bg-emerald-800" data-testid={`today-share-${tierKey}`}><Send className="me-2 h-5 w-5" />{i18n.t("Partager sur WhatsApp")}</Button>)}
      {i18n.tx(count > 0 && <p className="text-center text-[14px] leading-relaxed text-slate-500">{i18n.t("Les cotes peuvent \xE9voluer. Aucun format ne garantit un r\xE9sultat.")}</p>)}
    </div>
  </Card>;
}
function LegCard({
  leg,
  index,
  locked,
  allowAnalysis,
  query,
  now
}) {
  const i18n = useTodayLanguage();
  const start = dateValue(leg.commence_time);
  const started = Boolean(leg.completed || leg.is_finished || leg.finished || start && start.getTime() <= now);
  const highlight = query.trim() && matchesQuery(i18n, leg, query);
  const id = leg.match_id ?? leg.id;
  const competition = text(leg.sport_title, text(leg.league_name, text(leg.league, "Compétition non communiquée")));
  const location = i18n.tx(country(leg));
  const probability = leg.model_probability ?? leg.estimated_win_probability;
  const risk = RISK_META[normalize(leg.label)];
  return <div className={cn("overflow-hidden rounded-2xl border-2 bg-white", highlight ? "border-orange-400" : "border-slate-200")}>
    <div className={cn("flex items-start gap-3 border-b border-slate-100 px-4 py-3.5", highlight ? "bg-orange-50" : "bg-slate-50")}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-orange-200 bg-white text-[15px] font-bold text-orange-700">{i18n.tx(index + 1)}</span>
      <div className="min-w-0 flex-1"><p className="break-words text-[15px] font-semibold leading-relaxed text-slate-700">{i18n.tx(competition)}{i18n.tx(location && !normalize(competition).includes(normalize(location)) ? ` · ${location}` : "")}</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-[14px] leading-relaxed text-slate-600"><CalendarDays className="h-4 w-4 shrink-0" /><span>{i18n.tx(formatDate(i18n, leg.commence_time, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            }))}</span>{i18n.tx(started && <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">{i18n.t("Commenc\xE9e / termin\xE9e")}</span>)}</p></div>
    </div>
    <div className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-heading text-[21px] font-extrabold leading-snug text-slate-900 sm:text-[23px]"><span className="wn-team">{i18n.tx(text(leg.home_team, "Domicile"))}</span><span className="text-[15px] font-medium text-slate-500">{i18n.t("vs")}</span><span className="wn-team">{i18n.tx(text(leg.away_team, "Extérieur"))}</span></div>
      {i18n.tx(locked ? <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[16px] leading-relaxed text-slate-600"><Lock className="h-5 w-5 shrink-0 text-orange-700" />{i18n.t("S\xE9lection et cote r\xE9serv\xE9es aux abonn\xE9s")}</div> : <>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4"><div className="min-w-0"><p className="text-[14px] font-medium text-orange-800">{i18n.bet(text(leg.market_label, "Marché non communiqué"))}</p><p className="mt-1.5 break-words text-[18px] font-bold leading-relaxed text-orange-950">{i18n.bet(text(leg.pick, "Sélection non communiquée"))}</p></div><div className="shrink-0 rounded-xl bg-white px-3 py-2.5 text-center shadow-sm"><span className="block text-[14px] text-slate-600">{i18n.t("Cote")}</span><strong className="block font-mono text-[27px] font-extrabold text-orange-800">{i18n.tx(number(leg.pick_odds) > 1 ? formatNumber(i18n, leg.pick_odds, 2) : "—")}</strong></div></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-100 px-3 py-2 text-[14px] text-slate-700">{i18n.rich("Confiance fournie : {{v0}}", {
              v0: <strong>{i18n.tx(percent(i18n, leg.confidence))}</strong>
            })}</span>{i18n.tx(risk && <Badge className={cn("px-3 py-2 text-[14px]", risk.className)}>{i18n.rich("Niveau du moteur : {{v0}}", {
              v0: i18n.tx(risk.label)
            })}</Badge>)}</div>
        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-1"><summary className="cursor-pointer gap-2 text-[15px] font-semibold text-slate-700"><Info className="h-4 w-4 shrink-0 text-orange-700" />{i18n.t("Comprendre cette s\xE9lection")}<ChevronDown className="ms-auto h-4 w-4 shrink-0" /></summary><div className="space-y-3 border-t border-slate-200 pb-3 pt-3 text-[16px] leading-relaxed text-slate-600"><p>{i18n.tx(explainPick(i18n, leg))}</p>
        {leg.selection_reason && <div className="space-y-1 rounded-lg bg-white p-3">
          <p className="font-semibold text-slate-800">{i18n.t("Pourquoi cette sélection ?")}</p>
          <p>{i18n.t("Stabilité des probabilités entre sources")} : {percent(i18n,leg.selection_reason.stability)}</p>
          <p>{i18n.t("Bookmakers analysés")} : {formatNumber(i18n,leg.selection_reason.bookmakers,0)}</p>
          <p>{i18n.t("Indice de classement")} : {formatNumber(i18n,leg.selection_reason.quality)} / 100</p>
          <p className="text-xs">{i18n.t("Cet indice sert au tri ; il ne représente pas une chance de gagner.")}</p>
        </div>}{i18n.tx(number(probability) !== null && <p>{i18n.rich("Estimation du moteur pour ce pari : {{v0}}.", {
                v0: <strong className="text-slate-800">{i18n.tx(percent(i18n, probability))}</strong>
              })}</p>)}<p>{i18n.t("Cette explication d\xE9crit le march\xE9. Elle ne suppose aucune forme r\xE9cente, blessure ou statistique absente des donn\xE9es.")}</p></div></details>
        {i18n.tx(allowAnalysis && id !== null && id !== undefined && String(id) && <Link to={`/app/match/${encodeURIComponent(String(id))}`} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-1 text-[16px] font-bold text-orange-800 hover:text-orange-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{i18n.t("Voir l\u2019analyse du match")}<ArrowRight className="h-4 w-4" /></Link>)}
      </>)}
    </div>
  </div>;
}

// Catalogue propre à cet onglet : aucune mise à jour du serveur n'est requise.
const TODAY_MESSAGES = {
  "fr": {
    "/mois": "/mois",
    "Sélection prudente": "Sélection prudente",
    "from-teal-700 to-cyan-800": "from-teal-700 to-cyan-800",
    "Les favoris retenus par le moteur, réunis dans une sélection dédiée.": "Les favoris retenus par le moteur, réunis dans une sélection dédiée.",
    "Essentiel": "Essentiel",
    "from-emerald-700 to-teal-800": "from-emerald-700 to-teal-800",
    "Un format court pour parcourir les sélections et comprendre chaque rencontre.": "Un format court pour parcourir les sélections et comprendre chaque rencontre.",
    "Booster": "Booster",
    "from-orange-700 to-amber-800": "from-orange-700 to-amber-800",
    "Des sélections regroupées autour d’une cible de cote plus élevée.": "Des sélections regroupées autour d’une cible de cote plus élevée.",
    "Extra": "Extra",
    "from-rose-700 to-pink-800": "from-rose-700 to-pink-800",
    "Un combiné plus fourni : prends le temps de lire chacun de ses marchés.": "Un combiné plus fourni : prends le temps de lire chacun de ses marchés.",
    "Jackpot": "Jackpot",
    "from-violet-600 to-purple-700": "from-violet-600 to-purple-700",
    "Les cotes cumulées les plus ambitieuses, avec davantage d’incertitude.": "Les cotes cumulées les plus ambitieuses, avec davantage d’incertitude.",
    "Sûr": "Sûr",
    "Modéré": "Modéré",
    "Risqué": "Risqué",
    "Espagne": "Espagne",
    "Allemagne": "Allemagne",
    "France": "France",
    "Italie": "Italie",
    "Angleterre": "Angleterre",
    "Pologne": "Pologne",
    "Finlande": "Finlande",
    "Japon": "Japon",
    "Corée du Sud": "Corée du Sud",
    "Chine": "Chine",
    "Portugal": "Portugal",
    "Non disponible": "Non disponible",
    "Horaire non communiqué": "Horaire non communiqué",
    "International": "International",
    "Invalid combos response": "Invalid combos response",
    "Missing families": "Missing families",
    "Invalid families": "Invalid families",
    "Deux issues sont couvertes : celles indiquées par la sélection.": "Deux issues sont couvertes : celles indiquées par la sélection.",
    "Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.",
    "Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.": "Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.",
    "Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.": "Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.",
    "La sélection prévoit un match nul pendant la période couverte.": "La sélection prévoit un match nul pendant la période couverte.",
    "Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.": "Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.",
    "Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.": "Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "Le chargement a pris trop de temps. Réessaie dans un instant.",
    "Impossible de charger les combinés pour le moment. Réessaie dans un instant.": "Impossible de charger les combinés pour le moment. Réessaie dans un instant.",
    "heure locale": "heure locale",
    "Ce combiné ne peut pas être partagé dans son état actuel.": "Ce combiné ne peut pas être partagé dans son état actuel.",
    "Domicile": "Domicile",
    "Extérieur": "Extérieur",
    "Compétition non communiquée": "Compétition non communiquée",
    "Toutes les sélections doivent réussir. Aucun résultat garanti.": "Toutes les sélections doivent réussir. Aucun résultat garanti.",
    "Les cotes peuvent évoluer.": "Les cotes peuvent évoluer.",
    "Découvrir les analyses : https://wnpulse.com": "Découvrir les analyses : https://wnpulse.com",
    "Matchs à venir": "Matchs à venir",
    "Combinés prêts": "Combinés prêts",
    "Accessibles": "Accessibles",
    "Actualiser": "Actualiser",
    "Filtrer par sport": "Filtrer par sport",
    "Équipe, pays, championnat…": "Équipe, pays, championnat…",
    "Effacer la recherche": "Effacer la recherche",
    "Les combinés ne sont pas encore chargés": "Les combinés ne sont pas encore chargés",
    "Utilise Réessayer pour récupérer les données du jour.": "Utilise Réessayer pour récupérer les données du jour.",
    "Aucun combiné disponible pour ce sport": "Aucun combiné disponible pour ce sport",
    "De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles.": "De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles.",
    "Aucun combiné ne correspond à ta recherche": "Aucun combiné ne correspond à ta recherche",
    "Essaie un autre championnat, une autre équipe ou un autre format.": "Essaie un autre championnat, une autre équipe ou un autre format.",
    "Chargement des combinés": "Chargement des combinés",
    "Combiné": "Combiné",
    "À actualiser · rencontre commencée": "À actualiser · rencontre commencée",
    "En préparation": "En préparation",
    "Aperçu Pro": "Aperçu Pro",
    "Disponible": "Disponible",
    "Le moteur attend davantage de sélections": "Le moteur attend davantage de sélections",
    "Le détail de ce format est disponible avec Pro.": "Le détail de ce format est disponible avec Pro.",
    "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement.": "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement.",
    "Marché non communiqué": "Marché non communiqué",
    "Sélection non communiquée": "Sélection non communiquée",
    "COMBINÉS DU JOUR": "COMBINÉS DU JOUR",
    "Un combiné.{{v0}}{{v1}}": "Un combiné.{{v0}}{{v1}}",
    "Chaque match compte.": "Chaque match compte.",
    "Explore les rencontres, comprends les sélections et choisis le format qui te correspond.": "Explore les rencontres, comprends les sélections et choisis le format qui te correspond.",
    "Horaires : {{v0}}": "Horaires : {{v0}}",
    "Chargé à {{v0}}": "Chargé à {{v0}}",
    "Réessayer": "Réessayer",
    "Trouve ton combiné": "Trouve ton combiné",
    "Rechercher une équipe, un pays ou un championnat": "Rechercher une équipe, un pays ou un championnat",
    "Choisir un niveau de combiné": "Choisir un niveau de combiné",
    "Tous les formats": "Tous les formats",
    "Comment lire ces combinés ?": "Comment lire ces combinés ?",
    "Toutes les sélections doivent réussir pour que le combiné soit gagnant. Une cote plus élevée ne signifie pas une meilleure chance de réussite.": "Toutes les sélections doivent réussir pour que le combiné soit gagnant. Une cote plus élevée ne signifie pas une meilleure chance de réussite.",
    "La confiance moyenne concerne les sélections individuelles. L’estimation combinée, si le moteur la fournit, est indicative et dépend de ses hypothèses et des corrélations entre événements.": "La confiance moyenne concerne les sélections individuelles. L’estimation combinée, si le moteur la fournit, est indicative et dépend de ses hypothèses et des corrélations entre événements.",
    "Les sélections viennent du moteur statistique WinPulse. Les explications décrivent les marchés et les données disponibles ; elles ne garantissent aucun résultat.": "Les sélections viennent du moteur statistique WinPulse. Les explications décrivent les marchés et les données disponibles ; elles ne garantissent aucun résultat.",
    "La journée du flux est définie en {{v0}}. Les dates et horaires des rencontres sont affichés dans ton fuseau : {{v1}}.": "La journée du flux est définie en {{v0}}. Les dates et horaires des rencontres sont affichés dans ton fuseau : {{v1}}.",
    "Le combiné entier est conservé lorsqu’une rencontre correspond.": "Le combiné entier est conservé lorsqu’une rencontre correspond.",
    "Choisis ton format": "Choisis ton format",
    "Un format par couleur, puis les rencontres dans l’ordre. Ouvre une explication quand tu veux en savoir plus.": "Un format par couleur, puis les rencontres dans l’ordre. Ouvre une explication quand tu veux en savoir plus.",
    "Passe de l’aperçu à l’analyse complète.": "Passe de l’aperçu à l’analyse complète.",
    "Débloque les sélections de chaque rencontre et les différents formats de combinés.": "Débloque les sélections de chaque rencontre et les différents formats de combinés.",
    "Découvrir Pro": "Découvrir Pro",
    "Réinitialiser les filtres": "Réinitialiser les filtres",
    "Cote totale": "Cote totale",
    "Tous sports": "Tous sports",
    "Confiance moyenne des sélections": "Confiance moyenne des sélections",
    "Estimation combinée du moteur : {{v0}}": "Estimation combinée du moteur : {{v0}}",
    "Cette estimation est indicative et différente de la moyenne des confiances. Les hypothèses du moteur restent à valider.": "Cette estimation est indicative et différente de la moyenne des confiances. Les hypothèses du moteur restent à valider.",
    "Une rencontre a commencé ou est terminée. Ce combiné ne peut plus être partagé ; actualise pour retrouver les sélections à venir.": "Une rencontre a commencé ou est terminée. Ce combiné ne peut plus être partagé ; actualise pour retrouver les sélections à venir.",
    "Les rencontres": "Les rencontres",
    "Cette sélection ne constitue pas encore un combiné complet. Le partage sera disponible dès qu’au moins deux rencontres seront retenues.": "Cette sélection ne constitue pas encore un combiné complet. Le partage sera disponible dès qu’au moins deux rencontres seront retenues.",
    "Découvre toutes les sélections": "Découvre toutes les sélections",
    "Les rencontres sont visibles. Les marchés, les cotes et les analyses complètes se débloquent avec Pro.": "Les rencontres sont visibles. Les marchés, les cotes et les analyses complètes se débloquent avec Pro.",
    "Partager sur WhatsApp": "Partager sur WhatsApp",
    "Les cotes peuvent évoluer. Aucun format ne garantit un résultat.": "Les cotes peuvent évoluer. Aucun format ne garantit un résultat.",
    "Commencée / terminée": "Commencée / terminée",
    "vs": "vs",
    "Sélection et cote réservées aux abonnés": "Sélection et cote réservées aux abonnés",
    "Cote": "Cote",
    "Confiance fournie : {{v0}}": "Confiance fournie : {{v0}}",
    "Niveau du moteur : {{v0}}": "Niveau du moteur : {{v0}}",
    "Comprendre cette sélection": "Comprendre cette sélection",
    "Estimation du moteur pour ce pari : {{v0}}.": "Estimation du moteur pour ce pari : {{v0}}.",
    "Cette explication décrit le marché. Elle ne suppose aucune forme récente, blessure ou statistique absente des données.": "Cette explication décrit le marché. Elle ne suppose aucune forme récente, blessure ou statistique absente des données.",
    "Voir l’analyse du match": "Voir l’analyse du match",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "Le total doit dépasser {{v0}} sur la période couverte par ce marché.",
    "La sélection prévoit la victoire de {{v0}}, selon la période couverte par le marché.": "La sélection prévoit la victoire de {{v0}}, selon la période couverte par le marché.",
    "🎯 *WinPulse · {{v0}}*": "🎯 *WinPulse · {{v0}}*",
    "Cote totale : {{v0}}": "Cote totale : {{v0}}",
    "{{v0}}. *{{v1}} vs {{v2}}*": "{{v0}}. *{{v1}} vs {{v2}}*",
    "👉 {{v0}} : {{v1}} · cote {{v2}}": "👉 {{v0}} : {{v1}} · cote {{v2}}",
    " · {{v0}} à débloquer": " · {{v0}} à débloquer",
    "{{v0}} sélections à découvrir": "{{v0}} sélections à découvrir",
    "{{count}} format affiché": "{{count}} format affiché",
    "{{count}} formats affichés": "{{count}} formats affichés",
    "{{count}} sélection": "{{count}} sélection",
    "{{count}} sélections": "{{count}} sélections",
    "Mixte": "Mixte",
    "Spain": "Espagne",
    "Germany": "Allemagne",
    "Italy": "Italie",
    "England": "Angleterre",
    "Poland": "Pologne",
    "Finland": "Finlande",
    "Japan": "Japon",
    "South Korea": "Corée du Sud",
    "China": "Chine",
    "Pays-Bas": "Pays-Bas",
    "Netherlands": "Pays-Bas",
    "Safe": "Safe",
    "Équilibré": "Équilibré",
    "2 à 3 rencontres au maximum. Le nom Safe ne garantit aucun résultat.": "2 à 3 rencontres au maximum. Le nom Safe ne garantit aucun résultat.",
    "Objectif de 4 rencontres, jusqu’à 6 si la qualité le permet. Plus court si nécessaire.": "Objectif de 4 rencontres, jusqu’à 6 si la qualité le permet. Plus court si nécessaire.",
    "Objectif de 5 rencontres, jusqu’à 8 si la qualité le permet. Aucun ajout pour atteindre une cote cible.": "Objectif de 5 rencontres, jusqu’à 8 si la qualité le permet. Aucun ajout pour atteindre une cote cible.",
    "Format court": "Format court",
    "Format raccourci : aucune rencontre ajoutée pour remplir le ticket.": "Format raccourci : aucune rencontre ajoutée pour remplir le ticket.",
    "Ce ticket partage des rencontres avec un autre format : les résultats sont liés.": "Ce ticket partage des rencontres avec un autre format : les résultats sont liés.",
    "Cotes observées chez un même bookmaker": "Cotes observées chez un même bookmaker",
    "Disponibilité et acceptation à vérifier avant utilisation.": "Disponibilité et acceptation à vérifier avant utilisation.",
    "Aucun ticket distinct suffisamment qualifié : pas de doublon publié.": "Aucun ticket distinct suffisamment qualifié : pas de doublon publié.",
    "Estimation sous indépendance : {{v0}}": "Estimation sous indépendance : {{v0}}",
    "Cette approximation multiplie les probabilités individuelles. Elle n’est pas un taux de réussite mesuré et ne corrige pas les dépendances entre matchs.": "Cette approximation multiplie les probabilités individuelles. Elle n’est pas un taux de réussite mesuré et ne corrige pas les dépendances entre matchs.",
    "Pourquoi cette sélection ?": "Pourquoi cette sélection ?",
    "Stabilité des probabilités entre sources": "Stabilité des probabilités entre sources",
    "Bookmakers analysés": "Bookmakers analysés",
    "Indice de classement": "Indice de classement",
    "Cet indice sert au tri ; il ne représente pas une chance de gagner.": "Cet indice sert au tri ; il ne représente pas une chance de gagner."
  },
  "en": {
    "/mois": "/month",
    "Sélection prudente": "Cautious selection",
    "from-teal-700 to-cyan-800": "from-teal-700 to-cyan-800",
    "Les favoris retenus par le moteur, réunis dans une sélection dédiée.": "The engine's selected favourites, brought together in a dedicated selection.",
    "Essentiel": "Essential",
    "from-emerald-700 to-teal-800": "from-emerald-700 to-teal-800",
    "Un format court pour parcourir les sélections et comprendre chaque rencontre.": "A short format to review selections and understand each match.",
    "Booster": "Booster",
    "from-orange-700 to-amber-800": "from-orange-700 to-amber-800",
    "Des sélections regroupées autour d’une cible de cote plus élevée.": "Selections grouped around a higher odds target.",
    "Extra": "Extra",
    "from-rose-700 to-pink-800": "from-rose-700 to-pink-800",
    "Un combiné plus fourni : prends le temps de lire chacun de ses marchés.": "A larger accumulator: take time to read each market.",
    "Jackpot": "Jackpot",
    "from-violet-600 to-purple-700": "from-violet-600 to-purple-700",
    "Les cotes cumulées les plus ambitieuses, avec davantage d’incertitude.": "The most ambitious combined odds, with greater uncertainty.",
    "Sûr": "Safe",
    "Modéré": "Moderate",
    "Risqué": "Higher risk",
    "Espagne": "Spain",
    "Allemagne": "Germany",
    "France": "France",
    "Italie": "Italy",
    "Angleterre": "England",
    "Pologne": "Poland",
    "Finlande": "Finland",
    "Japon": "Japan",
    "Corée du Sud": "South Korea",
    "Chine": "China",
    "Portugal": "Portugal",
    "Non disponible": "Unavailable",
    "Horaire non communiqué": "Time not provided",
    "International": "International",
    "Invalid combos response": "Invalid combos response",
    "Missing families": "Missing families",
    "Invalid families": "Invalid families",
    "Deux issues sont couvertes : celles indiquées par la sélection.": "Two outcomes are covered: those specified by the selection.",
    "Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "This market concerns whether both teams score during the specified period.",
    "Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.": "The result is assessed after applying the stated handicap to the selected team.",
    "Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.": "The bet concerns the stated total, under the settlement rules for that line.",
    "La sélection prévoit un match nul pendant la période couverte.": "The selection predicts a draw during the covered period.",
    "Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.": "Your session has expired. Sign in again to view your accumulators.",
    "Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.": "Your access rights need updating. Check your subscription or try again.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "Loading timed out. Try again shortly.",
    "Impossible de charger les combinés pour le moment. Réessaie dans un instant.": "Unable to load accumulators right now. Try again shortly.",
    "heure locale": "local time",
    "Ce combiné ne peut pas être partagé dans son état actuel.": "This accumulator cannot be shared in its current state.",
    "Domicile": "Home",
    "Extérieur": "Away",
    "Compétition non communiquée": "Competition not provided",
    "Toutes les sélections doivent réussir. Aucun résultat garanti.": "Every selection must win. No result is guaranteed.",
    "Les cotes peuvent évoluer.": "Odds may change.",
    "Découvrir les analyses : https://wnpulse.com": "Explore the analyses: https://wnpulse.com",
    "Matchs à venir": "Upcoming matches",
    "Combinés prêts": "Ready accumulators",
    "Accessibles": "Accessible",
    "Actualiser": "Refresh",
    "Filtrer par sport": "Filter by sport",
    "Équipe, pays, championnat…": "Team, country, competition…",
    "Effacer la recherche": "Clear search",
    "Les combinés ne sont pas encore chargés": "Accumulators have not loaded yet",
    "Utilise Réessayer pour récupérer les données du jour.": "Use Retry to retrieve today's data.",
    "Aucun combiné disponible pour ce sport": "No accumulator available for this sport",
    "De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles.": "New selections will appear when matches and markets become available.",
    "Aucun combiné ne correspond à ta recherche": "No accumulator matches your search",
    "Essaie un autre championnat, une autre équipe ou un autre format.": "Try another competition, team or format.",
    "Chargement des combinés": "Loading combos",
    "Combiné": "Accumulator",
    "À actualiser · rencontre commencée": "Refresh needed · match started",
    "En préparation": "Being prepared",
    "Aperçu Pro": "Pro preview",
    "Disponible": "Available",
    "Le moteur attend davantage de sélections": "The engine is waiting for more selections",
    "Le détail de ce format est disponible avec Pro.": "This format's details are available with Pro.",
    "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement.": "A complete accumulator needs at least two matches. No match is added artificially.",
    "Marché non communiqué": "Market not provided",
    "Sélection non communiquée": "Pick not provided",
    "COMBINÉS DU JOUR": "TODAY'S ACCUMULATORS",
    "Un combiné.{{v0}}{{v1}}": "One accumulator.{{v0}}{{v1}}",
    "Chaque match compte.": "Every match counts.",
    "Explore les rencontres, comprends les sélections et choisis le format qui te correspond.": "Explore matches, understand the selections and choose your format.",
    "Horaires : {{v0}}": "Times: {{v0}}",
    "Chargé à {{v0}}": "Loaded at {{v0}}",
    "Réessayer": "Try again",
    "Trouve ton combiné": "Find your accumulator",
    "Rechercher une équipe, un pays ou un championnat": "Search for a team, country or competition",
    "Choisir un niveau de combiné": "Choose an accumulator level",
    "Tous les formats": "All formats",
    "Comment lire ces combinés ?": "How to read these accumulators",
    "Toutes les sélections doivent réussir pour que le combiné soit gagnant. Une cote plus élevée ne signifie pas une meilleure chance de réussite.": "Every selection must win for the accumulator to win. Higher odds do not mean a better chance of success.",
    "La confiance moyenne concerne les sélections individuelles. L’estimation combinée, si le moteur la fournit, est indicative et dépend de ses hypothèses et des corrélations entre événements.": "Average confidence concerns individual selections. The combined estimate, if supplied by the engine, is indicative and depends on its assumptions and correlations between events.",
    "Les sélections viennent du moteur statistique WinPulse. Les explications décrivent les marchés et les données disponibles ; elles ne garantissent aucun résultat.": "Selections come from the WinPulse statistical engine. Explanations describe markets and available data; they guarantee no result.",
    "La journée du flux est définie en {{v0}}. Les dates et horaires des rencontres sont affichés dans ton fuseau : {{v1}}.": "The feed day uses {{v0}}. Match dates and times are shown in your time zone: {{v1}}.",
    "Le combiné entier est conservé lorsqu’une rencontre correspond.": "The whole accumulator is kept when a match fits your search.",
    "Choisis ton format": "Choose your format",
    "Un format par couleur, puis les rencontres dans l’ordre. Ouvre une explication quand tu veux en savoir plus.": "One colour per format, then matches in order. Open an explanation whenever you want more detail.",
    "Passe de l’aperçu à l’analyse complète.": "Move from a preview to the full analysis.",
    "Débloque les sélections de chaque rencontre et les différents formats de combinés.": "Unlock selections for every match and the different accumulator formats.",
    "Découvrir Pro": "Explore Pro",
    "Réinitialiser les filtres": "Reset filters",
    "Cote totale": "Combined odds",
    "Tous sports": "All sports",
    "Confiance moyenne des sélections": "Average selection confidence",
    "Estimation combinée du moteur : {{v0}}": "Engine combined estimate: {{v0}}",
    "Cette estimation est indicative et différente de la moyenne des confiances. Les hypothèses du moteur restent à valider.": "This estimate is indicative and differs from average confidence. The engine's assumptions still need validation.",
    "Une rencontre a commencé ou est terminée. Ce combiné ne peut plus être partagé ; actualise pour retrouver les sélections à venir.": "A match has started or finished. This accumulator can no longer be shared; refresh to find upcoming selections.",
    "Les rencontres": "The matches",
    "Cette sélection ne constitue pas encore un combiné complet. Le partage sera disponible dès qu’au moins deux rencontres seront retenues.": "This selection is not a complete accumulator yet. Sharing will become available once at least two matches are selected.",
    "Découvre toutes les sélections": "Discover every selection",
    "Les rencontres sont visibles. Les marchés, les cotes et les analyses complètes se débloquent avec Pro.": "Matches are visible. Markets, odds and full analyses unlock with Pro.",
    "Partager sur WhatsApp": "Share on WhatsApp",
    "Les cotes peuvent évoluer. Aucun format ne garantit un résultat.": "Odds may change. No format guarantees a result.",
    "Commencée / terminée": "Started / finished",
    "vs": "vs",
    "Sélection et cote réservées aux abonnés": "Selection and odds reserved for subscribers",
    "Cote": "Odds",
    "Confiance fournie : {{v0}}": "Provided confidence: {{v0}}",
    "Niveau du moteur : {{v0}}": "Engine level: {{v0}}",
    "Comprendre cette sélection": "Understand this selection",
    "Estimation du moteur pour ce pari : {{v0}}.": "Engine estimate for this bet: {{v0}}.",
    "Cette explication décrit le marché. Elle ne suppose aucune forme récente, blessure ou statistique absente des données.": "This explanation describes the market. It assumes no recent form, injury or statistic absent from the data.",
    "Voir l’analyse du match": "View match analysis",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "The total must stay below {{v0}} during the covered period.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "The total must exceed {{v0}} during the covered period.",
    "La sélection prévoit la victoire de {{v0}}, selon la période couverte par le marché.": "The selection predicts a win for {{v0}}, within the market's covered period.",
    "🎯 *WinPulse · {{v0}}*": "🎯 *WinPulse · {{v0}}*",
    "Cote totale : {{v0}}": "Total odds: {{v0}}",
    "{{v0}}. *{{v1}} vs {{v2}}*": "{{v0}}. *{{v1}} vs {{v2}}*",
    "👉 {{v0}} : {{v1}} · cote {{v2}}": "👉 {{v0}}: {{v1}} · odds {{v2}}",
    " · {{v0}} à débloquer": " · {{v0}} to unlock",
    "{{v0}} sélections à découvrir": "{{v0}} selections to discover",
    "{{count}} format affiché": "{{count}} format shown",
    "{{count}} formats affichés": "{{count}} formats shown",
    "{{count}} sélection": "{{count}} selection",
    "{{count}} sélections": "{{count}} selections",
    "Mixte": "Mixed sports",
    "Spain": "Spain",
    "Germany": "Germany",
    "Italy": "Italy",
    "England": "England",
    "Poland": "Poland",
    "Finland": "Finland",
    "Japan": "Japan",
    "South Korea": "South Korea",
    "China": "China",
    "Pays-Bas": "Pays-Bas",
    "Netherlands": "Pays-Bas",
    "Safe": "Safe",
    "Équilibré": "Balanced",
    "2 à 3 rencontres au maximum. Le nom Safe ne garantit aucun résultat.": "2–3 matches maximum. The name Safe guarantees no outcome.",
    "Objectif de 4 rencontres, jusqu’à 6 si la qualité le permet. Plus court si nécessaire.": "Aim: 4 matches, up to 6 when quality permits. Shorter when needed.",
    "Objectif de 5 rencontres, jusqu’à 8 si la qualité le permet. Aucun ajout pour atteindre une cote cible.": "Aim: 5 matches, up to 8 when quality permits. No additions to reach target odds.",
    "Format court": "Short format",
    "Format raccourci : aucune rencontre ajoutée pour remplir le ticket.": "Shorter format: no matches added just to fill the ticket.",
    "Ce ticket partage des rencontres avec un autre format : les résultats sont liés.": "This ticket shares matches with another format: outcomes overlap.",
    "Cotes observées chez un même bookmaker": "Odds observed at one bookmaker",
    "Disponibilité et acceptation à vérifier avant utilisation.": "Check availability and acceptance before use.",
    "Aucun ticket distinct suffisamment qualifié : pas de doublon publié.": "No qualifying distinct ticket: no duplicate published.",
    "Estimation sous indépendance : {{v0}}": "Independence estimate: {{v0}}",
    "Cette approximation multiplie les probabilités individuelles. Elle n’est pas un taux de réussite mesuré et ne corrige pas les dépendances entre matchs.": "This approximation multiplies individual probabilities. It is not a measured success rate and does not adjust for dependencies.",
    "Pourquoi cette sélection ?": "Why this selection?",
    "Stabilité des probabilités entre sources": "Probability stability across sources",
    "Bookmakers analysés": "Bookmakers analysed",
    "Indice de classement": "Ranking score",
    "Cet indice sert au tri ; il ne représente pas une chance de gagner.": "This score is for ranking; it is not a win probability."
  },
  "es": {
    "/mois": "/mes",
    "Sélection prudente": "Selección prudente",
    "from-teal-700 to-cyan-800": "from-teal-700 to-cyan-800",
    "Les favoris retenus par le moteur, réunis dans une sélection dédiée.": "Los favoritos elegidos por el motor, reunidos en una selección específica.",
    "Essentiel": "Esencial",
    "from-emerald-700 to-teal-800": "from-emerald-700 to-teal-800",
    "Un format court pour parcourir les sélections et comprendre chaque rencontre.": "Un formato breve para revisar las selecciones y entender cada encuentro.",
    "Booster": "Booster",
    "from-orange-700 to-amber-800": "from-orange-700 to-amber-800",
    "Des sélections regroupées autour d’une cible de cote plus élevée.": "Selecciones agrupadas con una cuota objetivo más alta.",
    "Extra": "Extra",
    "from-rose-700 to-pink-800": "from-rose-700 to-pink-800",
    "Un combiné plus fourni : prends le temps de lire chacun de ses marchés.": "Una combinada más amplia: dedica tiempo a leer cada mercado.",
    "Jackpot": "Jackpot",
    "from-violet-600 to-purple-700": "from-violet-600 to-purple-700",
    "Les cotes cumulées les plus ambitieuses, avec davantage d’incertitude.": "Las cuotas acumuladas más ambiciosas, con mayor incertidumbre.",
    "Sûr": "Bajo riesgo",
    "Modéré": "Moderado",
    "Risqué": "Arriesgado",
    "Espagne": "España",
    "Allemagne": "Alemania",
    "France": "Francia",
    "Italie": "Italia",
    "Angleterre": "Inglaterra",
    "Pologne": "Polonia",
    "Finlande": "Finlandia",
    "Japon": "Japón",
    "Corée du Sud": "Corea del Sur",
    "Chine": "China",
    "Portugal": "Portugal",
    "Non disponible": "No disponible",
    "Horaire non communiqué": "Horario no comunicado",
    "International": "Internacional",
    "Invalid combos response": "Invalid combos response",
    "Missing families": "Missing families",
    "Invalid families": "Invalid families",
    "Deux issues sont couvertes : celles indiquées par la sélection.": "Se cubren dos resultados: los indicados en la selección.",
    "Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "El mercado trata de si ambos equipos marcan durante el periodo indicado.",
    "Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.": "El resultado se evalúa tras aplicar el hándicap indicado al equipo elegido.",
    "Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.": "La apuesta se refiere al total indicado, según las reglas de liquidación de esa línea.",
    "La sélection prévoit un match nul pendant la période couverte.": "La selección prevé un empate durante el periodo cubierto.",
    "Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.": "Tu sesión ha caducado. Vuelve a iniciar sesión para ver tus combinadas.",
    "Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.": "Es necesario actualizar tus permisos. Comprueba tu suscripción o inténtalo de nuevo.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "La carga tardó demasiado. Reinténtalo en breve.",
    "Impossible de charger les combinés pour le moment. Réessaie dans un instant.": "No se pueden cargar las combinadas ahora. Inténtalo en un momento.",
    "heure locale": "hora local",
    "Ce combiné ne peut pas être partagé dans son état actuel.": "Esta combinada no puede compartirse en su estado actual.",
    "Domicile": "Local",
    "Extérieur": "Visitante",
    "Compétition non communiquée": "Competición no comunicada",
    "Toutes les sélections doivent réussir. Aucun résultat garanti.": "Todas las selecciones deben acertar. Ningún resultado está garantizado.",
    "Les cotes peuvent évoluer.": "Las cuotas pueden cambiar.",
    "Découvrir les analyses : https://wnpulse.com": "Descubre los análisis: https://wnpulse.com",
    "Matchs à venir": "Partidos próximos",
    "Combinés prêts": "Combinadas listas",
    "Accessibles": "Accesibles",
    "Actualiser": "Actualizar",
    "Filtrer par sport": "Filtrar por deporte",
    "Équipe, pays, championnat…": "Equipo, país, campeonato…",
    "Effacer la recherche": "Borrar búsqueda",
    "Les combinés ne sont pas encore chargés": "Las combinadas aún no se han cargado",
    "Utilise Réessayer pour récupérer les données du jour.": "Pulsa Reintentar para obtener los datos del día.",
    "Aucun combiné disponible pour ce sport": "No hay combinadas para este deporte",
    "De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles.": "Aparecerán nuevas selecciones cuando haya partidos y mercados disponibles.",
    "Aucun combiné ne correspond à ta recherche": "Ninguna combinada coincide con tu búsqueda",
    "Essaie un autre championnat, une autre équipe ou un autre format.": "Prueba otro campeonato, equipo o formato.",
    "Chargement des combinés": "Cargando combinadas",
    "Combiné": "Combinada",
    "À actualiser · rencontre commencée": "Actualizar · encuentro iniciado",
    "En préparation": "En preparación",
    "Aperçu Pro": "Vista previa Pro",
    "Disponible": "Disponible",
    "Le moteur attend davantage de sélections": "El motor espera más selecciones",
    "Le détail de ce format est disponible avec Pro.": "Los detalles de este formato están disponibles con Pro.",
    "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement.": "Una combinada completa necesita al menos dos encuentros. No se añaden partidos artificialmente.",
    "Marché non communiqué": "Mercado no comunicado",
    "Sélection non communiquée": "Selección no comunicada",
    "COMBINÉS DU JOUR": "COMBINADAS DEL DÍA",
    "Un combiné.{{v0}}{{v1}}": "Una combinada.{{v0}}{{v1}}",
    "Chaque match compte.": "Cada partido cuenta.",
    "Explore les rencontres, comprends les sélections et choisis le format qui te correspond.": "Explora encuentros, entiende las selecciones y elige tu formato.",
    "Horaires : {{v0}}": "Horarios: {{v0}}",
    "Chargé à {{v0}}": "Cargado a las {{v0}}",
    "Réessayer": "Reintentar",
    "Trouve ton combiné": "Encuentra tu combinada",
    "Rechercher une équipe, un pays ou un championnat": "Buscar equipo, país o campeonato",
    "Choisir un niveau de combiné": "Elegir nivel de combinada",
    "Tous les formats": "Todos los formatos",
    "Comment lire ces combinés ?": "¿Cómo leer estas combinadas?",
    "Toutes les sélections doivent réussir pour que le combiné soit gagnant. Une cote plus élevée ne signifie pas une meilleure chance de réussite.": "Todas las selecciones deben acertar para ganar la combinada. Una cuota mayor no implica más posibilidades de éxito.",
    "La confiance moyenne concerne les sélections individuelles. L’estimation combinée, si le moteur la fournit, est indicative et dépend de ses hypothèses et des corrélations entre événements.": "La confianza media se refiere a selecciones individuales. La estimación combinada, si la proporciona el motor, es orientativa y depende de sus hipótesis y de las correlaciones entre eventos.",
    "Les sélections viennent du moteur statistique WinPulse. Les explications décrivent les marchés et les données disponibles ; elles ne garantissent aucun résultat.": "Las selecciones proceden del motor estadístico WinPulse. Las explicaciones describen mercados y datos disponibles; no garantizan resultados.",
    "La journée du flux est définie en {{v0}}. Les dates et horaires des rencontres sont affichés dans ton fuseau : {{v1}}.": "El día del flujo se define en {{v0}}. Los encuentros se muestran en tu zona horaria: {{v1}}.",
    "Le combiné entier est conservé lorsqu’une rencontre correspond.": "Se conserva la combinada completa cuando un encuentro coincide.",
    "Choisis ton format": "Elige tu formato",
    "Un format par couleur, puis les rencontres dans l’ordre. Ouvre une explication quand tu veux en savoir plus.": "Un color por formato y los encuentros en orden. Abre una explicación cuando quieras más detalles.",
    "Passe de l’aperçu à l’analyse complète.": "Pasa de la vista previa al análisis completo.",
    "Débloque les sélections de chaque rencontre et les différents formats de combinés.": "Desbloquea las selecciones de cada encuentro y los distintos formatos.",
    "Découvrir Pro": "Descubrir Pro",
    "Réinitialiser les filtres": "Restablecer filtros",
    "Cote totale": "Cuota total",
    "Tous sports": "Todos los deportes",
    "Confiance moyenne des sélections": "Confianza media de las selecciones",
    "Estimation combinée du moteur : {{v0}}": "Estimación combinada del motor: {{v0}}",
    "Cette estimation est indicative et différente de la moyenne des confiances. Les hypothèses du moteur restent à valider.": "Esta estimación es orientativa y distinta de la confianza media. Las hipótesis del motor aún deben validarse.",
    "Une rencontre a commencé ou est terminée. Ce combiné ne peut plus être partagé ; actualise pour retrouver les sélections à venir.": "Un encuentro ha empezado o terminado. Ya no puede compartirse esta combinada; actualiza para ver selecciones próximas.",
    "Les rencontres": "Los encuentros",
    "Cette sélection ne constitue pas encore un combiné complet. Le partage sera disponible dès qu’au moins deux rencontres seront retenues.": "Esta selección aún no forma una combinada completa. Podrá compartirse al incluir al menos dos encuentros.",
    "Découvre toutes les sélections": "Descubre todas las selecciones",
    "Les rencontres sont visibles. Les marchés, les cotes et les analyses complètes se débloquent avec Pro.": "Los encuentros son visibles. Pro desbloquea mercados, cuotas y análisis completos.",
    "Partager sur WhatsApp": "Compartir en WhatsApp",
    "Les cotes peuvent évoluer. Aucun format ne garantit un résultat.": "Las cuotas pueden cambiar. Ningún formato garantiza resultados.",
    "Commencée / terminée": "Iniciado / terminado",
    "vs": "vs",
    "Sélection et cote réservées aux abonnés": "Selección y cuota reservadas a suscriptores",
    "Cote": "Cuota",
    "Confiance fournie : {{v0}}": "Confianza indicada: {{v0}}",
    "Niveau du moteur : {{v0}}": "Nivel del motor: {{v0}}",
    "Comprendre cette sélection": "Comprender esta selección",
    "Estimation du moteur pour ce pari : {{v0}}.": "Estimación del motor para esta apuesta: {{v0}}.",
    "Cette explication décrit le marché. Elle ne suppose aucune forme récente, blessure ou statistique absente des données.": "Esta explicación describe el mercado. No supone forma reciente, lesiones ni estadísticas ausentes de los datos.",
    "Voir l’analyse du match": "Ver análisis del partido",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "El total debe ser inferior a {{v0}} durante el periodo cubierto.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "El total debe superar {{v0}} durante el periodo cubierto.",
    "La sélection prévoit la victoire de {{v0}}, selon la période couverte par le marché.": "La selección prevé la victoria de {{v0}} en el periodo del mercado.",
    "🎯 *WinPulse · {{v0}}*": "🎯 *WinPulse · {{v0}}*",
    "Cote totale : {{v0}}": "Cuota total: {{v0}}",
    "{{v0}}. *{{v1}} vs {{v2}}*": "{{v0}}. *{{v1}} vs {{v2}}*",
    "👉 {{v0}} : {{v1}} · cote {{v2}}": "👉 {{v0}}: {{v1}} · cuota {{v2}}",
    " · {{v0}} à débloquer": " · {{v0}} por desbloquear",
    "{{v0}} sélections à découvrir": "{{v0}} selecciones por descubrir",
    "{{count}} format affiché": "{{count}} formato mostrado",
    "{{count}} formats affichés": "{{count}} formatos mostrados",
    "{{count}} sélection": "{{count}} selección",
    "{{count}} sélections": "{{count}} selecciones",
    "Mixte": "Deportes mixtos",
    "Spain": "España",
    "Germany": "Alemania",
    "Italy": "Italia",
    "England": "Inglaterra",
    "Poland": "Polonia",
    "Finland": "Finlandia",
    "Japan": "Japón",
    "South Korea": "Corea del Sur",
    "China": "China",
    "Pays-Bas": "Pays-Bas",
    "Netherlands": "Pays-Bas",
    "Safe": "Safe",
    "Équilibré": "Equilibrado",
    "2 à 3 rencontres au maximum. Le nom Safe ne garantit aucun résultat.": "Máximo 2–3 partidos. El nombre Safe no garantiza resultados.",
    "Objectif de 4 rencontres, jusqu’à 6 si la qualité le permet. Plus court si nécessaire.": "Objetivo: 4 partidos, hasta 6 si la calidad lo permite. Menos si es necesario.",
    "Objectif de 5 rencontres, jusqu’à 8 si la qualité le permet. Aucun ajout pour atteindre une cote cible.": "Objetivo: 5 partidos, hasta 8 si la calidad lo permite. Sin añadir para alcanzar una cuota.",
    "Format court": "Formato corto",
    "Format raccourci : aucune rencontre ajoutée pour remplir le ticket.": "Formato reducido: sin partidos añadidos para rellenar.",
    "Ce ticket partage des rencontres avec un autre format : les résultats sont liés.": "Comparte partidos con otro formato: los resultados están vinculados.",
    "Cotes observées chez un même bookmaker": "Cuotas observadas en una misma casa",
    "Disponibilité et acceptation à vérifier avant utilisation.": "Comprueba disponibilidad y aceptación antes de usar.",
    "Aucun ticket distinct suffisamment qualifié : pas de doublon publié.": "Sin boleto distinto apto: no se publica un duplicado.",
    "Estimation sous indépendance : {{v0}}": "Estimación bajo independencia: {{v0}}",
    "Cette approximation multiplie les probabilités individuelles. Elle n’est pas un taux de réussite mesuré et ne corrige pas les dépendances entre matchs.": "Multiplica probabilidades individuales. No es una tasa de acierto medida ni corrige dependencias.",
    "Pourquoi cette sélection ?": "¿Por qué esta selección?",
    "Stabilité des probabilités entre sources": "Estabilidad de probabilidades entre fuentes",
    "Bookmakers analysés": "Casas analizadas",
    "Indice de classement": "Índice de clasificación",
    "Cet indice sert au tri ; il ne représente pas une chance de gagner.": "Este índice ordena; no representa probabilidad de ganar."
  },
  "pt": {
    "/mois": "/mês",
    "Sélection prudente": "Seleção prudente",
    "from-teal-700 to-cyan-800": "from-teal-700 to-cyan-800",
    "Les favoris retenus par le moteur, réunis dans une sélection dédiée.": "Os favoritos escolhidos pelo motor, reunidos numa seleção dedicada.",
    "Essentiel": "Essencial",
    "from-emerald-700 to-teal-800": "from-emerald-700 to-teal-800",
    "Un format court pour parcourir les sélections et comprendre chaque rencontre.": "Um formato curto para explorar as seleções e compreender cada encontro.",
    "Booster": "Booster",
    "from-orange-700 to-amber-800": "from-orange-700 to-amber-800",
    "Des sélections regroupées autour d’une cible de cote plus élevée.": "Seleções agrupadas com uma odd-alvo mais elevada.",
    "Extra": "Extra",
    "from-rose-700 to-pink-800": "from-rose-700 to-pink-800",
    "Un combiné plus fourni : prends le temps de lire chacun de ses marchés.": "Uma combinada mais extensa: lê cada mercado com atenção.",
    "Jackpot": "Jackpot",
    "from-violet-600 to-purple-700": "from-violet-600 to-purple-700",
    "Les cotes cumulées les plus ambitieuses, avec davantage d’incertitude.": "As odds acumuladas mais ambiciosas, com maior incerteza.",
    "Sûr": "Baixo risco",
    "Modéré": "Moderado",
    "Risqué": "Arriscado",
    "Espagne": "Espanha",
    "Allemagne": "Alemanha",
    "France": "França",
    "Italie": "Itália",
    "Angleterre": "Inglaterra",
    "Pologne": "Polónia",
    "Finlande": "Finlândia",
    "Japon": "Japão",
    "Corée du Sud": "Coreia do Sul",
    "Chine": "China",
    "Portugal": "Portugal",
    "Non disponible": "Indisponível",
    "Horaire non communiqué": "Horário não indicado",
    "International": "Internacional",
    "Invalid combos response": "Invalid combos response",
    "Missing families": "Missing families",
    "Invalid families": "Invalid families",
    "Deux issues sont couvertes : celles indiquées par la sélection.": "São cobertos dois resultados: os indicados na seleção.",
    "Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "O mercado diz respeito a ambas as equipas marcarem ou não no período indicado.",
    "Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.": "O resultado é avaliado após aplicar o handicap indicado à equipa selecionada.",
    "Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.": "A aposta refere-se ao total indicado, segundo as regras de liquidação dessa linha.",
    "La sélection prévoit un match nul pendant la période couverte.": "A seleção prevê um empate no período abrangido.",
    "Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.": "A tua sessão expirou. Inicia sessão novamente para veres as combinadas.",
    "Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.": "Os teus acessos precisam de atualização. Verifica a subscrição ou tenta novamente.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "O carregamento demorou demasiado. Tenta novamente em breve.",
    "Impossible de charger les combinés pour le moment. Réessaie dans un instant.": "Não foi possível carregar as combinadas. Tenta dentro de instantes.",
    "heure locale": "hora local",
    "Ce combiné ne peut pas être partagé dans son état actuel.": "Esta combinada não pode ser partilhada no estado atual.",
    "Domicile": "Casa",
    "Extérieur": "Fora",
    "Compétition non communiquée": "Competição não indicada",
    "Toutes les sélections doivent réussir. Aucun résultat garanti.": "Todas as seleções têm de vencer. Nenhum resultado é garantido.",
    "Les cotes peuvent évoluer.": "As odds podem mudar.",
    "Découvrir les analyses : https://wnpulse.com": "Descobre as análises: https://wnpulse.com",
    "Matchs à venir": "Jogos por disputar",
    "Combinés prêts": "Combinadas prontas",
    "Accessibles": "Acessíveis",
    "Actualiser": "Atualizar",
    "Filtrer par sport": "Filtrar por desporto",
    "Équipe, pays, championnat…": "Equipa, país, campeonato…",
    "Effacer la recherche": "Limpar pesquisa",
    "Les combinés ne sont pas encore chargés": "As combinadas ainda não foram carregadas",
    "Utilise Réessayer pour récupérer les données du jour.": "Usa Tentar novamente para obter os dados do dia.",
    "Aucun combiné disponible pour ce sport": "Não há combinadas para este desporto",
    "De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles.": "Surgirão novas seleções quando houver jogos e mercados disponíveis.",
    "Aucun combiné ne correspond à ta recherche": "Nenhuma combinada corresponde à pesquisa",
    "Essaie un autre championnat, une autre équipe ou un autre format.": "Experimenta outro campeonato, equipa ou formato.",
    "Chargement des combinés": "A carregar combinadas",
    "Combiné": "Combinada",
    "À actualiser · rencontre commencée": "Atualizar · encontro iniciado",
    "En préparation": "Em preparação",
    "Aperçu Pro": "Pré-visualização Pro",
    "Disponible": "Disponível",
    "Le moteur attend davantage de sélections": "O motor aguarda mais seleções",
    "Le détail de ce format est disponible avec Pro.": "Os detalhes deste formato estão disponíveis com Pro.",
    "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement.": "Uma combinada completa requer pelo menos dois encontros. Nenhum jogo é acrescentado artificialmente.",
    "Marché non communiqué": "Mercado não indicado",
    "Sélection non communiquée": "Seleção não indicada",
    "COMBINÉS DU JOUR": "COMBINADAS DO DIA",
    "Un combiné.{{v0}}{{v1}}": "Uma combinada.{{v0}}{{v1}}",
    "Chaque match compte.": "Cada jogo conta.",
    "Explore les rencontres, comprends les sélections et choisis le format qui te correspond.": "Explora os encontros, compreende as seleções e escolhe o teu formato.",
    "Horaires : {{v0}}": "Horários: {{v0}}",
    "Chargé à {{v0}}": "Carregado às {{v0}}",
    "Réessayer": "Tentar novamente",
    "Trouve ton combiné": "Encontra a tua combinada",
    "Rechercher une équipe, un pays ou un championnat": "Pesquisar equipa, país ou campeonato",
    "Choisir un niveau de combiné": "Escolher nível de combinada",
    "Tous les formats": "Todos os formatos",
    "Comment lire ces combinés ?": "Como interpretar estas combinadas?",
    "Toutes les sélections doivent réussir pour que le combiné soit gagnant. Une cote plus élevée ne signifie pas une meilleure chance de réussite.": "Todas as seleções têm de vencer para a combinada ganhar. Uma odd mais alta não significa maior probabilidade de sucesso.",
    "La confiance moyenne concerne les sélections individuelles. L’estimation combinée, si le moteur la fournit, est indicative et dépend de ses hypothèses et des corrélations entre événements.": "A confiança média refere-se a seleções individuais. A estimativa combinada, se fornecida pelo motor, é indicativa e depende das hipóteses e correlações entre eventos.",
    "Les sélections viennent du moteur statistique WinPulse. Les explications décrivent les marchés et les données disponibles ; elles ne garantissent aucun résultat.": "As seleções vêm do motor estatístico WinPulse. As explicações descrevem mercados e dados disponíveis; não garantem resultados.",
    "La journée du flux est définie en {{v0}}. Les dates et horaires des rencontres sont affichés dans ton fuseau : {{v1}}.": "O dia do fluxo é definido em {{v0}}. As datas e horas são apresentadas no teu fuso: {{v1}}.",
    "Le combiné entier est conservé lorsqu’une rencontre correspond.": "A combinada inteira é mantida quando um encontro corresponde.",
    "Choisis ton format": "Escolhe o teu formato",
    "Un format par couleur, puis les rencontres dans l’ordre. Ouvre une explication quand tu veux en savoir plus.": "Uma cor por formato e os encontros por ordem. Abre uma explicação quando quiseres saber mais.",
    "Passe de l’aperçu à l’analyse complète.": "Passa da pré-visualização à análise completa.",
    "Débloque les sélections de chaque rencontre et les différents formats de combinés.": "Desbloqueia as seleções de cada encontro e os diferentes formatos.",
    "Découvrir Pro": "Conhecer Pro",
    "Réinitialiser les filtres": "Repor filtros",
    "Cote totale": "Odd total",
    "Tous sports": "Todos os desportos",
    "Confiance moyenne des sélections": "Confiança média das seleções",
    "Estimation combinée du moteur : {{v0}}": "Estimativa combinada do motor: {{v0}}",
    "Cette estimation est indicative et différente de la moyenne des confiances. Les hypothèses du moteur restent à valider.": "Esta estimativa é indicativa e difere da confiança média. As hipóteses do motor ainda precisam de validação.",
    "Une rencontre a commencé ou est terminée. Ce combiné ne peut plus être partagé ; actualise pour retrouver les sélections à venir.": "Um encontro começou ou terminou. Já não podes partilhar esta combinada; atualiza para veres seleções futuras.",
    "Les rencontres": "Os encontros",
    "Cette sélection ne constitue pas encore un combiné complet. Le partage sera disponible dès qu’au moins deux rencontres seront retenues.": "Esta seleção ainda não constitui uma combinada completa. A partilha ficará disponível quando houver pelo menos dois encontros.",
    "Découvre toutes les sélections": "Descobre todas as seleções",
    "Les rencontres sont visibles. Les marchés, les cotes et les analyses complètes se débloquent avec Pro.": "Os encontros estão visíveis. Pro desbloqueia mercados, odds e análises completas.",
    "Partager sur WhatsApp": "Partilhar no WhatsApp",
    "Les cotes peuvent évoluer. Aucun format ne garantit un résultat.": "As odds podem mudar. Nenhum formato garante resultados.",
    "Commencée / terminée": "Iniciado / terminado",
    "vs": "vs",
    "Sélection et cote réservées aux abonnés": "Seleção e odd reservadas a subscritores",
    "Cote": "Odd",
    "Confiance fournie : {{v0}}": "Confiança fornecida: {{v0}}",
    "Niveau du moteur : {{v0}}": "Nível do motor: {{v0}}",
    "Comprendre cette sélection": "Compreender esta seleção",
    "Estimation du moteur pour ce pari : {{v0}}.": "Estimativa do motor para esta aposta: {{v0}}.",
    "Cette explication décrit le marché. Elle ne suppose aucune forme récente, blessure ou statistique absente des données.": "Esta explicação descreve o mercado. Não presume forma recente, lesões ou estatísticas ausentes dos dados.",
    "Voir l’analyse du match": "Ver análise do jogo",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "O total deve ficar abaixo de {{v0}} no período abrangido.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "O total deve ultrapassar {{v0}} no período abrangido.",
    "La sélection prévoit la victoire de {{v0}}, selon la période couverte par le marché.": "A seleção prevê a vitória de {{v0}} no período abrangido pelo mercado.",
    "🎯 *WinPulse · {{v0}}*": "🎯 *WinPulse · {{v0}}*",
    "Cote totale : {{v0}}": "Odd total: {{v0}}",
    "{{v0}}. *{{v1}} vs {{v2}}*": "{{v0}}. *{{v1}} vs {{v2}}*",
    "👉 {{v0}} : {{v1}} · cote {{v2}}": "👉 {{v0}}: {{v1}} · odd {{v2}}",
    " · {{v0}} à débloquer": " · {{v0}} por desbloquear",
    "{{v0}} sélections à découvrir": "{{v0}} seleções por descobrir",
    "{{count}} format affiché": "{{count}} formato apresentado",
    "{{count}} formats affichés": "{{count}} formatos apresentados",
    "{{count}} sélection": "{{count}} seleção",
    "{{count}} sélections": "{{count}} seleções",
    "Mixte": "Desportos mistos",
    "Spain": "Espanha",
    "Germany": "Alemanha",
    "Italy": "Itália",
    "England": "Inglaterra",
    "Poland": "Polónia",
    "Finland": "Finlândia",
    "Japan": "Japão",
    "South Korea": "Coreia do Sul",
    "China": "China",
    "Pays-Bas": "Pays-Bas",
    "Netherlands": "Pays-Bas",
    "Safe": "Safe",
    "Équilibré": "Equilibrado",
    "2 à 3 rencontres au maximum. Le nom Safe ne garantit aucun résultat.": "Máximo de 2–3 jogos. O nome Safe não garante resultados.",
    "Objectif de 4 rencontres, jusqu’à 6 si la qualité le permet. Plus court si nécessaire.": "Objetivo: 4 jogos, até 6 se a qualidade permitir. Menos se necessário.",
    "Objectif de 5 rencontres, jusqu’à 8 si la qualité le permet. Aucun ajout pour atteindre une cote cible.": "Objetivo: 5 jogos, até 8 se a qualidade permitir. Sem acrescentar para atingir uma cotação.",
    "Format court": "Formato curto",
    "Format raccourci : aucune rencontre ajoutée pour remplir le ticket.": "Formato reduzido: sem jogos acrescentados para preencher.",
    "Ce ticket partage des rencontres avec un autre format : les résultats sont liés.": "Partilha jogos com outro formato: resultados relacionados.",
    "Cotes observées chez un même bookmaker": "Cotações observadas numa mesma casa",
    "Disponibilité et acceptation à vérifier avant utilisation.": "Verifique disponibilidade e aceitação antes de usar.",
    "Aucun ticket distinct suffisamment qualifié : pas de doublon publié.": "Sem bilhete distinto qualificado: nenhum duplicado publicado.",
    "Estimation sous indépendance : {{v0}}": "Estimativa sob independência: {{v0}}",
    "Cette approximation multiplie les probabilités individuelles. Elle n’est pas un taux de réussite mesuré et ne corrige pas les dépendances entre matchs.": "Multiplica probabilidades individuais. Não é uma taxa de sucesso medida nem ajusta dependências.",
    "Pourquoi cette sélection ?": "Porquê esta seleção?",
    "Stabilité des probabilités entre sources": "Estabilidade das probabilidades entre fontes",
    "Bookmakers analysés": "Casas analisadas",
    "Indice de classement": "Índice de classificação",
    "Cet indice sert au tri ; il ne représente pas une chance de gagner.": "Este índice ordena; não representa probabilidade de vitória."
  },
  "de": {
    "/mois": "/Monat",
    "Sélection prudente": "Vorsichtige Auswahl",
    "from-teal-700 to-cyan-800": "from-teal-700 to-cyan-800",
    "Les favoris retenus par le moteur, réunis dans une sélection dédiée.": "Die Favoriten der Engine in einer eigenen Auswahl.",
    "Essentiel": "Basis",
    "from-emerald-700 to-teal-800": "from-emerald-700 to-teal-800",
    "Un format court pour parcourir les sélections et comprendre chaque rencontre.": "Ein kurzes Format zum Prüfen der Tipps und Verstehen jeder Begegnung.",
    "Booster": "Booster",
    "from-orange-700 to-amber-800": "from-orange-700 to-amber-800",
    "Des sélections regroupées autour d’une cible de cote plus élevée.": "Tipps mit einer höheren angestrebten Gesamtquote.",
    "Extra": "Extra",
    "from-rose-700 to-pink-800": "from-rose-700 to-pink-800",
    "Un combiné plus fourni : prends le temps de lire chacun de ses marchés.": "Eine umfangreichere Kombiwette: Prüfe jeden Markt in Ruhe.",
    "Jackpot": "Jackpot",
    "from-violet-600 to-purple-700": "from-violet-600 to-purple-700",
    "Les cotes cumulées les plus ambitieuses, avec davantage d’incertitude.": "Die höchsten angestrebten Gesamtquoten bei größerer Unsicherheit.",
    "Sûr": "Geringes Risiko",
    "Modéré": "Moderat",
    "Risqué": "Höheres Risiko",
    "Espagne": "Spanien",
    "Allemagne": "Deutschland",
    "France": "Frankreich",
    "Italie": "Italien",
    "Angleterre": "England",
    "Pologne": "Polen",
    "Finlande": "Finnland",
    "Japon": "Japan",
    "Corée du Sud": "Südkorea",
    "Chine": "China",
    "Portugal": "Portugal",
    "Non disponible": "Nicht verfügbar",
    "Horaire non communiqué": "Uhrzeit nicht angegeben",
    "International": "International",
    "Invalid combos response": "Invalid combos response",
    "Missing families": "Missing families",
    "Invalid families": "Invalid families",
    "Deux issues sont couvertes : celles indiquées par la sélection.": "Zwei Ergebnisse sind abgedeckt: die in der Auswahl genannten.",
    "Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "Dieser Markt betrifft, ob beide Teams im angegebenen Zeitraum treffen.",
    "Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.": "Das Ergebnis wird nach Anwendung des angegebenen Handicaps auf das gewählte Team bewertet.",
    "Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.": "Die Wette betrifft die angegebene Gesamtzahl mit den Abrechnungsregeln dieser Linie.",
    "La sélection prévoit un match nul pendant la période couverte.": "Die Auswahl erwartet ein Unentschieden im abgedeckten Zeitraum.",
    "Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.": "Deine Sitzung ist abgelaufen. Melde dich erneut an, um deine Kombiwetten zu sehen.",
    "Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.": "Deine Zugriffsrechte müssen aktualisiert werden. Prüfe dein Abonnement oder versuche es erneut.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "Laden hat zu lange gedauert. Versuche es gleich erneut.",
    "Impossible de charger les combinés pour le moment. Réessaie dans un instant.": "Kombiwetten können gerade nicht geladen werden. Versuche es gleich erneut.",
    "heure locale": "Ortszeit",
    "Ce combiné ne peut pas être partagé dans son état actuel.": "Diese Kombiwette kann im aktuellen Zustand nicht geteilt werden.",
    "Domicile": "Heim",
    "Extérieur": "Auswärts",
    "Compétition non communiquée": "Wettbewerb nicht angegeben",
    "Toutes les sélections doivent réussir. Aucun résultat garanti.": "Jeder Tipp muss gewinnen. Kein Ergebnis ist garantiert.",
    "Les cotes peuvent évoluer.": "Quoten können sich ändern.",
    "Découvrir les analyses : https://wnpulse.com": "Analysen entdecken: https://wnpulse.com",
    "Matchs à venir": "Bevorstehende Spiele",
    "Combinés prêts": "Bereite Kombiwetten",
    "Accessibles": "Zugänglich",
    "Actualiser": "Aktualisieren",
    "Filtrer par sport": "Nach Sportart filtern",
    "Équipe, pays, championnat…": "Team, Land, Wettbewerb…",
    "Effacer la recherche": "Suche löschen",
    "Les combinés ne sont pas encore chargés": "Kombiwetten sind noch nicht geladen",
    "Utilise Réessayer pour récupérer les données du jour.": "Mit Erneut versuchen lädst du die heutigen Daten.",
    "Aucun combiné disponible pour ce sport": "Keine Kombiwette für diese Sportart verfügbar",
    "De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles.": "Neue Tipps erscheinen, sobald Spiele und Märkte verfügbar sind.",
    "Aucun combiné ne correspond à ta recherche": "Keine Kombiwette entspricht deiner Suche",
    "Essaie un autre championnat, une autre équipe ou un autre format.": "Versuche einen anderen Wettbewerb, ein anderes Team oder Format.",
    "Chargement des combinés": "Kombis werden geladen",
    "Combiné": "Kombiwette",
    "À actualiser · rencontre commencée": "Aktualisieren · Begegnung begonnen",
    "En préparation": "In Vorbereitung",
    "Aperçu Pro": "Pro-Vorschau",
    "Disponible": "Verfügbar",
    "Le moteur attend davantage de sélections": "Die Engine wartet auf weitere Tipps",
    "Le détail de ce format est disponible avec Pro.": "Details dieses Formats sind mit Pro verfügbar.",
    "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement.": "Eine vollständige Kombiwette benötigt mindestens zwei Begegnungen. Es werden keine Spiele künstlich ergänzt.",
    "Marché non communiqué": "Wettmarkt nicht angegeben",
    "Sélection non communiquée": "Tipp nicht angegeben",
    "COMBINÉS DU JOUR": "HEUTIGE KOMBIWETTEN",
    "Un combiné.{{v0}}{{v1}}": "Eine Kombiwette.{{v0}}{{v1}}",
    "Chaque match compte.": "Jedes Spiel zählt.",
    "Explore les rencontres, comprends les sélections et choisis le format qui te correspond.": "Entdecke Begegnungen, verstehe die Tipps und wähle dein Format.",
    "Horaires : {{v0}}": "Uhrzeiten: {{v0}}",
    "Chargé à {{v0}}": "Geladen um {{v0}}",
    "Réessayer": "Erneut versuchen",
    "Trouve ton combiné": "Finde deine Kombiwette",
    "Rechercher une équipe, un pays ou un championnat": "Team, Land oder Wettbewerb suchen",
    "Choisir un niveau de combiné": "Kombiwetten-Stufe wählen",
    "Tous les formats": "Alle Formate",
    "Comment lire ces combinés ?": "Wie liest du diese Kombiwetten?",
    "Toutes les sélections doivent réussir pour que le combiné soit gagnant. Une cote plus élevée ne signifie pas une meilleure chance de réussite.": "Alle Tipps müssen gewinnen, damit die Kombiwette gewinnt. Eine höhere Quote bedeutet keine höhere Erfolgschance.",
    "La confiance moyenne concerne les sélections individuelles. L’estimation combinée, si le moteur la fournit, est indicative et dépend de ses hypothèses et des corrélations entre événements.": "Die mittlere Konfidenz betrifft einzelne Tipps. Die kombinierte Schätzung der Engine ist, falls vorhanden, ein Richtwert und hängt von Annahmen und Zusammenhängen zwischen Ereignissen ab.",
    "Les sélections viennent du moteur statistique WinPulse. Les explications décrivent les marchés et les données disponibles ; elles ne garantissent aucun résultat.": "Die Tipps stammen aus der statistischen WinPulse-Engine. Erläuterungen beschreiben Märkte und verfügbare Daten, ohne Ergebnisgarantie.",
    "La journée du flux est définie en {{v0}}. Les dates et horaires des rencontres sont affichés dans ton fuseau : {{v1}}.": "Der Feed-Tag richtet sich nach {{v0}}. Begegnungen werden in deiner Zeitzone angezeigt: {{v1}}.",
    "Le combiné entier est conservé lorsqu’une rencontre correspond.": "Bei einem passenden Spiel bleibt die gesamte Kombiwette sichtbar.",
    "Choisis ton format": "Wähle dein Format",
    "Un format par couleur, puis les rencontres dans l’ordre. Ouvre une explication quand tu veux en savoir plus.": "Jedes Format hat eine Farbe, die Spiele folgen der Reihe nach. Öffne Erläuterungen für mehr Details.",
    "Passe de l’aperçu à l’analyse complète.": "Von der Vorschau zur vollständigen Analyse.",
    "Débloque les sélections de chaque rencontre et les différents formats de combinés.": "Schalte Tipps jeder Begegnung und die verschiedenen Kombiformate frei.",
    "Découvrir Pro": "Pro entdecken",
    "Réinitialiser les filtres": "Filter zurücksetzen",
    "Cote totale": "Gesamtquote",
    "Tous sports": "Alle Sportarten",
    "Confiance moyenne des sélections": "Mittlere Konfidenz der Tipps",
    "Estimation combinée du moteur : {{v0}}": "Kombinierte Engine-Schätzung: {{v0}}",
    "Cette estimation est indicative et différente de la moyenne des confiances. Les hypothèses du moteur restent à valider.": "Diese Schätzung ist ein Richtwert und unterscheidet sich von der mittleren Konfidenz. Die Engine-Annahmen müssen noch bestätigt werden.",
    "Une rencontre a commencé ou est terminée. Ce combiné ne peut plus être partagé ; actualise pour retrouver les sélections à venir.": "Eine Begegnung hat begonnen oder ist beendet. Teilen ist nicht mehr möglich; aktualisiere für bevorstehende Tipps.",
    "Les rencontres": "Die Begegnungen",
    "Cette sélection ne constitue pas encore un combiné complet. Le partage sera disponible dès qu’au moins deux rencontres seront retenues.": "Diese Auswahl ist noch keine vollständige Kombiwette. Teilen wird ab mindestens zwei ausgewählten Begegnungen verfügbar.",
    "Découvre toutes les sélections": "Alle Tipps entdecken",
    "Les rencontres sont visibles. Les marchés, les cotes et les analyses complètes se débloquent avec Pro.": "Begegnungen sind sichtbar. Pro schaltet Märkte, Quoten und vollständige Analysen frei.",
    "Partager sur WhatsApp": "Auf WhatsApp teilen",
    "Les cotes peuvent évoluer. Aucun format ne garantit un résultat.": "Quoten können sich ändern. Kein Format garantiert ein Ergebnis.",
    "Commencée / terminée": "Begonnen / beendet",
    "vs": "vs",
    "Sélection et cote réservées aux abonnés": "Tipp und Quote nur für Abonnenten",
    "Cote": "Quote",
    "Confiance fournie : {{v0}}": "Angegebene Konfidenz: {{v0}}",
    "Niveau du moteur : {{v0}}": "Engine-Stufe: {{v0}}",
    "Comprendre cette sélection": "Diesen Tipp verstehen",
    "Estimation du moteur pour ce pari : {{v0}}.": "Engine-Schätzung für diese Wette: {{v0}}.",
    "Cette explication décrit le marché. Elle ne suppose aucune forme récente, blessure ou statistique absente des données.": "Diese Erklärung beschreibt den Markt. Sie unterstellt keine aktuelle Form, Verletzungen oder Statistiken ohne Datengrundlage.",
    "Voir l’analyse du match": "Spielanalyse ansehen",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "Die Gesamtsumme muss im Marktzeitraum unter {{v0}} bleiben.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "Die Gesamtsumme muss im Marktzeitraum über {{v0}} liegen.",
    "La sélection prévoit la victoire de {{v0}}, selon la période couverte par le marché.": "Die Auswahl erwartet einen Sieg von {{v0}} im Marktzeitraum.",
    "🎯 *WinPulse · {{v0}}*": "🎯 *WinPulse · {{v0}}*",
    "Cote totale : {{v0}}": "Gesamtquote: {{v0}}",
    "{{v0}}. *{{v1}} vs {{v2}}*": "{{v0}}. *{{v1}} vs {{v2}}*",
    "👉 {{v0}} : {{v1}} · cote {{v2}}": "👉 {{v0}}: {{v1}} · Quote {{v2}}",
    " · {{v0}} à débloquer": " · {{v0}} freizuschalten",
    "{{v0}} sélections à découvrir": "{{v0}} Tipps zu entdecken",
    "{{count}} format affiché": "{{count}} Format angezeigt",
    "{{count}} formats affichés": "{{count}} Formate angezeigt",
    "{{count}} sélection": "{{count}} Tipp",
    "{{count}} sélections": "{{count}} Tipps",
    "Mixte": "Gemischte Sportarten",
    "Spain": "Spanien",
    "Germany": "Deutschland",
    "Italy": "Italien",
    "England": "England",
    "Poland": "Polen",
    "Finland": "Finnland",
    "Japan": "Japan",
    "South Korea": "Südkorea",
    "China": "China",
    "Pays-Bas": "Pays-Bas",
    "Netherlands": "Pays-Bas",
    "Safe": "Safe",
    "Équilibré": "Ausgewogen",
    "2 à 3 rencontres au maximum. Le nom Safe ne garantit aucun résultat.": "Höchstens 2–3 Spiele. Der Name Safe garantiert kein Ergebnis.",
    "Objectif de 4 rencontres, jusqu’à 6 si la qualité le permet. Plus court si nécessaire.": "Ziel: 4 Spiele, bei ausreichender Qualität bis zu 6. Bei Bedarf kürzer.",
    "Objectif de 5 rencontres, jusqu’à 8 si la qualité le permet. Aucun ajout pour atteindre une cote cible.": "Ziel: 5 Spiele, bei ausreichender Qualität bis zu 8. Keine Ergänzung für eine Zielquote.",
    "Format court": "Kurzes Format",
    "Format raccourci : aucune rencontre ajoutée pour remplir le ticket.": "Verkürztes Format: keine Spiele nur zum Auffüllen.",
    "Ce ticket partage des rencontres avec un autre format : les résultats sont liés.": "Gemeinsame Spiele mit einem anderen Format: Ergebnisse hängen zusammen.",
    "Cotes observées chez un même bookmaker": "Quoten bei demselben Anbieter beobachtet",
    "Disponibilité et acceptation à vérifier avant utilisation.": "Verfügbarkeit und Annahme vor Nutzung prüfen.",
    "Aucun ticket distinct suffisamment qualifié : pas de doublon publié.": "Kein ausreichend qualifizierter anderer Schein: kein Duplikat veröffentlicht.",
    "Estimation sous indépendance : {{v0}}": "Schätzung bei Unabhängigkeit: {{v0}}",
    "Cette approximation multiplie les probabilités individuelles. Elle n’est pas un taux de réussite mesuré et ne corrige pas les dépendances entre matchs.": "Multipliziert Einzelwahrscheinlichkeiten. Keine gemessene Erfolgsquote und keine Korrektur von Abhängigkeiten.",
    "Pourquoi cette sélection ?": "Warum diese Auswahl?",
    "Stabilité des probabilités entre sources": "Stabilität der Wahrscheinlichkeiten zwischen Quellen",
    "Bookmakers analysés": "Analysierte Anbieter",
    "Indice de classement": "Rangwert",
    "Cet indice sert au tri ; il ne représente pas une chance de gagner.": "Dieser Wert dient der Rangfolge, nicht als Gewinnwahrscheinlichkeit."
  },
  "ar": {
    "/mois": "/شهر",
    "Sélection prudente": "اختيار حذر",
    "from-teal-700 to-cyan-800": "from-teal-700 to-cyan-800",
    "Les favoris retenus par le moteur, réunis dans une sélection dédiée.": "الفرق المرشحة التي اختارها المحرك، ضمن مجموعة مخصصة.",
    "Essentiel": "الأساسي",
    "from-emerald-700 to-teal-800": "from-emerald-700 to-teal-800",
    "Un format court pour parcourir les sélections et comprendre chaque rencontre.": "صيغة مختصرة لاستعراض الاختيارات وفهم كل مباراة.",
    "Booster": "Booster",
    "from-orange-700 to-amber-800": "from-orange-700 to-amber-800",
    "Des sélections regroupées autour d’une cible de cote plus élevée.": "اختيارات مجمعة حول معامل رهان مستهدف أعلى.",
    "Extra": "Extra",
    "from-rose-700 to-pink-800": "from-rose-700 to-pink-800",
    "Un combiné plus fourni : prends le temps de lire chacun de ses marchés.": "رهان مجمع أوسع: خذ وقتك لقراءة كل سوق.",
    "Jackpot": "Jackpot",
    "from-violet-600 to-purple-700": "from-violet-600 to-purple-700",
    "Les cotes cumulées les plus ambitieuses, avec davantage d’incertitude.": "معاملات مجمعة أكثر طموحًا، مع قدر أكبر من عدم اليقين.",
    "Sûr": "مخاطر منخفضة",
    "Modéré": "متوسط",
    "Risqué": "مرتفع المخاطر",
    "Espagne": "إسبانيا",
    "Allemagne": "ألمانيا",
    "France": "فرنسا",
    "Italie": "إيطاليا",
    "Angleterre": "إنجلترا",
    "Pologne": "بولندا",
    "Finlande": "فنلندا",
    "Japon": "اليابان",
    "Corée du Sud": "كوريا الجنوبية",
    "Chine": "الصين",
    "Portugal": "البرتغال",
    "Non disponible": "غير متاح",
    "Horaire non communiqué": "الموعد غير مُعلن",
    "International": "دولي",
    "Invalid combos response": "Invalid combos response",
    "Missing families": "Missing families",
    "Invalid families": "Invalid families",
    "Deux issues sont couvertes : celles indiquées par la sélection.": "يشمل الرهان نتيجتين، وهما المحددتان في الاختيار.",
    "Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "يتعلق السوق بما إذا كان الفريقان يسجلان خلال الفترة المحددة أم لا.",
    "Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.": "تُقيّم النتيجة بعد تطبيق الهانديكاب المحدد على الفريق المختار.",
    "Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.": "يتعلق الرهان بالإجمالي المحدد، وفق قواعد التسوية لهذا الخط.",
    "La sélection prévoit un match nul pendant la période couverte.": "يتوقع الاختيار تعادلًا خلال الفترة المشمولة.",
    "Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.": "انتهت جلستك. سجّل الدخول مجددًا لعرض رهاناتك المجمعة.",
    "Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.": "تحتاج صلاحياتك إلى تحديث. تحقق من اشتراكك أو أعد المحاولة.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "استغرق التحميل وقتاً طويلاً. حاول مجدداً بعد قليل.",
    "Impossible de charger les combinés pour le moment. Réessaie dans un instant.": "تعذر تحميل الرهانات المجمعة حاليًا. حاول بعد قليل.",
    "heure locale": "التوقيت المحلي",
    "Ce combiné ne peut pas être partagé dans son état actuel.": "لا يمكن مشاركة هذا الرهان المجمع في حالته الحالية.",
    "Domicile": "المضيف",
    "Extérieur": "الضيف",
    "Compétition non communiquée": "البطولة غير مُعلنة",
    "Toutes les sélections doivent réussir. Aucun résultat garanti.": "يجب أن تنجح جميع الاختيارات. لا توجد نتيجة مضمونة.",
    "Les cotes peuvent évoluer.": "قد تتغير معاملات الرهان.",
    "Découvrir les analyses : https://wnpulse.com": "اكتشف التحليلات: https://wnpulse.com",
    "Matchs à venir": "المباريات القادمة",
    "Combinés prêts": "رهانات مجمعة جاهزة",
    "Accessibles": "متاحة لك",
    "Actualiser": "تحديث",
    "Filtrer par sport": "تصفية حسب الرياضة",
    "Équipe, pays, championnat…": "فريق، بلد، بطولة…",
    "Effacer la recherche": "مسح البحث",
    "Les combinés ne sont pas encore chargés": "لم تُحمّل الرهانات المجمعة بعد",
    "Utilise Réessayer pour récupérer les données du jour.": "استخدم إعادة المحاولة لجلب بيانات اليوم.",
    "Aucun combiné disponible pour ce sport": "لا تتوفر رهانات مجمعة لهذه الرياضة",
    "De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles.": "ستظهر اختيارات جديدة عند توفر المباريات والأسواق.",
    "Aucun combiné ne correspond à ta recherche": "لا يوجد رهان مجمع يطابق بحثك",
    "Essaie un autre championnat, une autre équipe ou un autre format.": "جرّب بطولة أو فريقًا أو صيغة أخرى.",
    "Chargement des combinés": "جارٍ تحميل الرهانات المركبة",
    "Combiné": "رهان مجمع",
    "À actualiser · rencontre commencée": "يلزم تحديث · بدأت المباراة",
    "En préparation": "قيد الإعداد",
    "Aperçu Pro": "معاينة Pro",
    "Disponible": "متاح",
    "Le moteur attend davantage de sélections": "ينتظر المحرك مزيدًا من الاختيارات",
    "Le détail de ce format est disponible avec Pro.": "تفاصيل هذه الصيغة متاحة مع Pro.",
    "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement.": "يتطلب الرهان المجمع الكامل مباراتين على الأقل. لا تُضاف مباريات بشكل مصطنع.",
    "Marché non communiqué": "السوق غير مُعلن",
    "Sélection non communiquée": "الاختيار غير مُعلن",
    "COMBINÉS DU JOUR": "رهانات اليوم المجمعة",
    "Un combiné.{{v0}}{{v1}}": "رهان مجمع واحد.{{v0}}{{v1}}",
    "Chaque match compte.": "كل مباراة مهمة.",
    "Explore les rencontres, comprends les sélections et choisis le format qui te correspond.": "استكشف المباريات وافهم الاختيارات واختر الصيغة المناسبة لك.",
    "Horaires : {{v0}}": "المواعيد: {{v0}}",
    "Chargé à {{v0}}": "تم التحميل عند {{v0}}",
    "Réessayer": "إعادة المحاولة",
    "Trouve ton combiné": "اعثر على رهانك المجمع",
    "Rechercher une équipe, un pays ou un championnat": "ابحث عن فريق أو بلد أو بطولة",
    "Choisir un niveau de combiné": "اختر مستوى الرهان المجمع",
    "Tous les formats": "جميع الصيغ",
    "Comment lire ces combinés ?": "كيف تقرأ هذه الرهانات المجمعة؟",
    "Toutes les sélections doivent réussir pour que le combiné soit gagnant. Une cote plus élevée ne signifie pas une meilleure chance de réussite.": "يجب أن تنجح جميع الاختيارات ليفوز الرهان المجمع. المعامل الأعلى لا يعني فرصة نجاح أكبر.",
    "La confiance moyenne concerne les sélections individuelles. L’estimation combinée, si le moteur la fournit, est indicative et dépend de ses hypothèses et des corrélations entre événements.": "يتعلق متوسط الثقة بالاختيارات الفردية. والتقدير المجمع، إن وفره المحرك، إرشادي ويعتمد على افتراضاته والارتباطات بين الأحداث.",
    "Les sélections viennent du moteur statistique WinPulse. Les explications décrivent les marchés et les données disponibles ; elles ne garantissent aucun résultat.": "تأتي الاختيارات من محرك WinPulse الإحصائي. تصف الشروح الأسواق والبيانات المتاحة ولا تضمن أي نتيجة.",
    "La journée du flux est définie en {{v0}}. Les dates et horaires des rencontres sont affichés dans ton fuseau : {{v1}}.": "يُحدد يوم البيانات بحسب {{v0}}. وتُعرض مواعيد المباريات بمنطقتك الزمنية: {{v1}}.",
    "Le combiné entier est conservé lorsqu’une rencontre correspond.": "يبقى الرهان المجمع كاملًا ظاهرًا عند مطابقة إحدى مبارياته.",
    "Choisis ton format": "اختر صيغتك",
    "Un format par couleur, puis les rencontres dans l’ordre. Ouvre une explication quand tu veux en savoir plus.": "لون لكل صيغة، ثم المباريات بالترتيب. افتح الشرح عندما تريد تفاصيل أكثر.",
    "Passe de l’aperçu à l’analyse complète.": "انتقل من المعاينة إلى التحليل الكامل.",
    "Débloque les sélections de chaque rencontre et les différents formats de combinés.": "افتح اختيارات كل مباراة وصيغ الرهانات المجمعة المختلفة.",
    "Découvrir Pro": "اكتشف Pro",
    "Réinitialiser les filtres": "إعادة ضبط الفلاتر",
    "Cote totale": "المعامل الإجمالي",
    "Tous sports": "جميع الرياضات",
    "Confiance moyenne des sélections": "متوسط ثقة الاختيارات",
    "Estimation combinée du moteur : {{v0}}": "التقدير المجمع للمحرك: {{v0}}",
    "Cette estimation est indicative et différente de la moyenne des confiances. Les hypothèses du moteur restent à valider.": "هذا التقدير إرشادي ويختلف عن متوسط الثقة. لا تزال افتراضات المحرك بحاجة إلى التحقق.",
    "Une rencontre a commencé ou est terminée. Ce combiné ne peut plus être partagé ; actualise pour retrouver les sélections à venir.": "بدأت مباراة أو انتهت. لم تعد مشاركة هذا الرهان متاحة؛ حدّث لعرض الاختيارات القادمة.",
    "Les rencontres": "المباريات",
    "Cette sélection ne constitue pas encore un combiné complet. Le partage sera disponible dès qu’au moins deux rencontres seront retenues.": "لم يصبح هذا الاختيار رهانًا مجمعًا كاملًا بعد. تتاح المشاركة عند اختيار مباراتين على الأقل.",
    "Découvre toutes les sélections": "اكتشف جميع الاختيارات",
    "Les rencontres sont visibles. Les marchés, les cotes et les analyses complètes se débloquent avec Pro.": "المباريات ظاهرة. تُفتح الأسواق والمعاملات والتحليلات الكاملة مع Pro.",
    "Partager sur WhatsApp": "المشاركة عبر واتساب",
    "Les cotes peuvent évoluer. Aucun format ne garantit un résultat.": "قد تتغير المعاملات. لا تضمن أي صيغة نتيجة.",
    "Commencée / terminée": "بدأت / انتهت",
    "vs": "vs",
    "Sélection et cote réservées aux abonnés": "الاختيار والمعامل للمشتركين فقط",
    "Cote": "معامل الربح",
    "Confiance fournie : {{v0}}": "الثقة المقدمة: {{v0}}",
    "Niveau du moteur : {{v0}}": "تصنيف المحرك: {{v0}}",
    "Comprendre cette sélection": "افهم هذا الاختيار",
    "Estimation du moteur pour ce pari : {{v0}}.": "تقدير المحرك لهذا الرهان: {{v0}}.",
    "Cette explication décrit le marché. Elle ne suppose aucune forme récente, blessure ou statistique absente des données.": "يصف هذا الشرح السوق، ولا يفترض أداءً حديثًا أو إصابة أو إحصاءً غير وارد في البيانات.",
    "Voir l’analyse du match": "عرض تحليل المباراة",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "يجب أن يبقى الإجمالي أقل من {{v0}} خلال الفترة المشمولة.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "يجب أن يتجاوز الإجمالي {{v0}} خلال الفترة المشمولة.",
    "La sélection prévoit la victoire de {{v0}}, selon la période couverte par le marché.": "يتوقع الاختيار فوز {{v0}} خلال الفترة التي يشملها السوق.",
    "🎯 *WinPulse · {{v0}}*": "🎯 *WinPulse · {{v0}}*",
    "Cote totale : {{v0}}": "المعامل الإجمالي: {{v0}}",
    "{{v0}}. *{{v1}} vs {{v2}}*": "{{v0}}. *{{v1}} vs {{v2}}*",
    "👉 {{v0}} : {{v1}} · cote {{v2}}": "👉 {{v0}}: {{v1}} · المعامل {{v2}}",
    " · {{v0}} à débloquer": " · عدد الاختيارات المقفلة: {{v0}}",
    "{{v0}} sélections à découvrir": "اختيارات لاكتشافها: {{v0}}",
    "{{count}} format affiché": "عدد الصيغ المعروضة: {{count}}",
    "{{count}} formats affichés": "عدد الصيغ المعروضة: {{count}}",
    "{{count}} sélection": "عدد الاختيارات: {{count}}",
    "{{count}} sélections": "عدد الاختيارات: {{count}}",
    "Mixte": "رياضات متنوعة",
    "Spain": "إسبانيا",
    "Germany": "ألمانيا",
    "Italy": "إيطاليا",
    "England": "إنجلترا",
    "Poland": "بولندا",
    "Finland": "فنلندا",
    "Japan": "اليابان",
    "South Korea": "كوريا الجنوبية",
    "China": "الصين",
    "Pays-Bas": "Pays-Bas",
    "Netherlands": "Pays-Bas",
    "Safe": "Safe",
    "Équilibré": "متوازن",
    "2 à 3 rencontres au maximum. Le nom Safe ne garantit aucun résultat.": "مباراتان إلى ثلاث كحد أقصى. اسم Safe لا يضمن أي نتيجة.",
    "Objectif de 4 rencontres, jusqu’à 6 si la qualité le permet. Plus court si nécessaire.": "الهدف 4 مباريات وحتى 6 إذا سمحت الجودة. أقل عند الحاجة.",
    "Objectif de 5 rencontres, jusqu’à 8 si la qualité le permet. Aucun ajout pour atteindre une cote cible.": "الهدف 5 مباريات وحتى 8 إذا سمحت الجودة. دون إضافة لبلوغ معامل مستهدف.",
    "Format court": "صيغة قصيرة",
    "Format raccourci : aucune rencontre ajoutée pour remplir le ticket.": "صيغة مختصرة: لا تُضاف مباريات لمجرد ملء التذكرة.",
    "Ce ticket partage des rencontres avec un autre format : les résultats sont liés.": "تشترك التذكرة في مباريات مع صيغة أخرى: النتائج مترابطة.",
    "Cotes observées chez un même bookmaker": "الأسعار مرصودة لدى مقدم واحد",
    "Disponibilité et acceptation à vérifier avant utilisation.": "تحقق من التوفر والقبول قبل الاستخدام.",
    "Aucun ticket distinct suffisamment qualifié : pas de doublon publié.": "لا توجد تذكرة مختلفة مؤهلة: لن يُنشر تكرار.",
    "Estimation sous indépendance : {{v0}}": "تقدير بافتراض الاستقلال: {{v0}}",
    "Cette approximation multiplie les probabilités individuelles. Elle n’est pas un taux de réussite mesuré et ne corrige pas les dépendances entre matchs.": "يضرب الاحتمالات الفردية. ليس معدل نجاح مقاساً ولا يصحح الترابط بين المباريات.",
    "Pourquoi cette sélection ?": "لماذا هذا الاختيار؟",
    "Stabilité des probabilités entre sources": "استقرار الاحتمالات بين المصادر",
    "Bookmakers analysés": "مقدمو الأسعار المحللون",
    "Indice de classement": "مؤشر الترتيب",
    "Cet indice sert au tri ; il ne représente pas une chance de gagner.": "يستخدم المؤشر للترتيب ولا يمثل احتمال الفوز."
  }
};
function useTodayLanguage() {
  const context = usePageLanguage();
  const current = useRef(context);
  current.current = context;
  return useMemo(() => {
    const message = source => {
      const dictionary = TODAY_MESSAGES[current.current.language] || TODAY_MESSAGES.fr;
      return typeof source === "string" && Object.prototype.hasOwnProperty.call(dictionary, source) ? dictionary[source] : current.current.t(source);
    };
    const value = item => typeof item === "number" ? current.current.formatNumber(item) : item;
    return {
      get language() {
        return current.current.language;
      },
      get locale() {
        return current.current.locale;
      },
      get direction() {
        return current.current.direction;
      },
      t(source, values = {}) {
        return message(source).replace(/\{\{(\w+)\}\}/g, (placeholder, key) => Object.prototype.hasOwnProperty.call(values, key) ? String(value(values[key]) ?? "") : placeholder);
      },
      tx(item) {
        return typeof item === "string" ? message(item) : current.current.tx(item);
      },
      bet(item) {
        return message(current.current.bet(item));
      },
      rich(source, values = {}) {
        return <>{message(source).split(/(\{\{\w+\}\})/g).map((part, index) => {
            const key = part.match(/^\{\{(\w+)\}\}$/)?.[1];
            return <Fragment key={index}>{key && Object.prototype.hasOwnProperty.call(values, key) ? value(values[key]) : part}</Fragment>;
          })}</>;
      }
    };
  }, []);
}
