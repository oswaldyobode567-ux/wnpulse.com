import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, CalendarDays, ChevronDown, Clock, Flame,
  Info, Layers, Lock, RefreshCw, Rocket, Search, Send,
  Shield, ShieldCheck, SlidersHorizontal, Sparkles, X, Zap,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PaymentModal from "@/components/payment/PaymentModal";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LEVELS = {
  ultra_safe: { label: "Sélection prudente", icon: ShieldCheck, color: "text-teal-700", tint: "bg-teal-50", border: "border-teal-200", gradient: "from-teal-600 to-cyan-700", description: "Les favoris retenus par le moteur, réunis dans une sélection dédiée." },
  sure: { label: "Essentiel", icon: Shield, color: "text-emerald-700", tint: "bg-emerald-50", border: "border-emerald-200", gradient: "from-emerald-600 to-teal-700", description: "Un format court pour parcourir les sélections et comprendre chaque rencontre." },
  booster: { label: "Booster", icon: Zap, color: "text-orange-700", tint: "bg-orange-50", border: "border-orange-200", gradient: "from-orange-500 to-amber-600", description: "Des sélections regroupées autour d’une cible de cote plus élevée." },
  extra: { label: "Extra", icon: Flame, color: "text-rose-700", tint: "bg-rose-50", border: "border-rose-200", gradient: "from-rose-500 to-pink-600", description: "Un combiné plus fourni : prends le temps de lire chacun de ses marchés." },
  jackpot: { label: "Jackpot", icon: Rocket, color: "text-violet-700", tint: "bg-violet-50", border: "border-violet-200", gradient: "from-violet-600 to-purple-700", description: "Les cotes cumulées les plus ambitieuses, avec davantage d’incertitude." },
};
const LEVEL_ORDER = Object.keys(LEVELS);
const RISK_META = {
  safe: { label: "Sûr", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  value: { label: "Modéré", className: "border-amber-200 bg-amber-50 text-amber-700" },
  risky: { label: "Risqué", className: "border-rose-200 bg-rose-50 text-rose-700" },
};
const COUNTRY_ALIASES = [
  [/\bspain\b|\bespagne\b|la liga/i, "Espagne"], [/germany|allemagne|bundesliga/i, "Allemagne"],
  [/\bfrance\b|ligue 1|ligue 2/i, "France"], [/\bitaly\b|italie|serie a|serie b/i, "Italie"],
  [/england|angleterre|premier league|championship/i, "Angleterre"], [/\bpoland\b|pologne|ekstraklasa/i, "Pologne"],
  [/finland|finlande|veikkausliiga/i, "Finlande"], [/\bjapan\b|japon|j league/i, "Japon"],
  [/south korea|korea|corée|k league/i, "Corée du Sud"], [/\bchina\b|chine/i, "Chine"],
  [/\bportugal\b|primeira liga/i, "Portugal"], [/netherlands|pays.bas|eredivisie/i, "Pays-Bas"],
];

function number(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim()) || !["number", "string"].includes(typeof value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function text(value, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function formatNumber(value, digits = 1) {
  const n = number(value);
  return n === null ? "Non disponible" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(n);
}
function percent(value) {
  const n = number(value);
  return n !== null && n >= 0 && n <= 100 ? `${formatNumber(n)} %` : "Non disponible";
}
function dateValue(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  // Accept legacy ISO timestamps without a zone as UTC, like the server.
  const raw = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}
function formatDate(value, options) {
  const date = dateValue(value);
  if (!date) return "Horaire non communiqué";
  try { return new Intl.DateTimeFormat("fr-FR", options).format(date); }
  catch { return "Horaire non communiqué"; }
}
function normalize(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function country(leg) {
  const supplied = text(leg.country_name) || text(leg.country);
  if (supplied) return supplied;
  const competition = text(leg.sport_title) || text(leg.league_name) || text(leg.league);
  // Avoid attributing international tournaments to a country from a name guess.
  if (/uefa|fifa|champions league|europa league|nations league|world cup/i.test(competition)) return "International";
  return COUNTRY_ALIASES.find(([pattern]) => pattern.test(competition))?.[1] || "";
}
function legSearch(leg) {
  return normalize([leg.home_team, leg.away_team, leg.sport_title, leg.league_name, leg.league, country(leg)].filter(Boolean).join(" "));
}
function matchesQuery(leg, query) {
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(word => legSearch(leg).includes(word));
}
function normalizeData(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.error) throw new Error("Invalid combos response");
  if (!payload.families || typeof payload.families !== "object" || Array.isArray(payload.families)) throw new Error("Missing families");
  const families = Object.entries(payload.families).flatMap(([key, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return [{ ...value, family_key: text(value.family_key, key), family_label: text(value.family_label, key),
      tiers: value.tiers && typeof value.tiers === "object" && !Array.isArray(value.tiers) ? value.tiers : {} }];
  }).sort((a, b) => a.family_key === "all" ? -1 : b.family_key === "all" ? 1 : 0);
  if (Object.keys(payload.families).length && !families.length) throw new Error("Invalid families");
  return { ...payload, normalizedFamilies: families };
}
function tierLegs(tier) { return Array.isArray(tier?.legs) ? tier.legs.filter(p => p && typeof p === "object" && !Array.isArray(p)) : []; }
function tierCount(tier) { return Math.max(tierLegs(tier).length, Math.max(0, Math.floor(number(tier?.leg_count) ?? 0))); }
function isLegLocked(leg, tier, key, isFree, index) {
  if (leg.locked === true) return true;
  // Older responses omit locks on Ultra-Safe. Never reveal it by client default.
  if (isFree && key !== "sure") return true;
  if (tier.locked === true) return leg.locked !== false;
  return isFree && key === "sure" && index > 0;
}
function isTierLocked(tier, key, isFree) {
  return tier.locked === true || (isFree && (key !== "sure" || tierCount(tier) > 1)) || tierLegs(tier).some(leg => leg.locked === true);
}
function availability(tier, now) {
  const legs = tierLegs(tier);
  if (legs.some(p => p.completed || p.is_finished || p.finished || (dateValue(p.commence_time)?.getTime() ?? Infinity) <= now)) return "started";
  return tierCount(tier) >= 2 ? "ready" : "incomplete";
}
function canShare(tier, key, isFree, now) {
  const legs = tierLegs(tier);
  return availability(tier, now) === "ready" && !isTierLocked(tier, key, isFree) && legs.length === tierCount(tier) &&
    legs.every((p, i) => !isLegLocked(p, tier, key, isFree, i) && text(p.pick) && number(p.pick_odds) > 1);
}
function explainPick(leg) {
  const pick = text(leg.pick);
  const market = normalize(`${text(leg.market)} ${text(leg.market_label)}`);
  if (/double.?chance/.test(market)) return "Deux issues sont couvertes : celles indiquées par la sélection.";
  if (/draw_no_bet|nul rembours/.test(market)) return "La sélection porte sur une victoire ; le nul relève du règlement spécifique de ce marché.";
  if (/btts|equipes marquent/.test(market)) return "Le marché concerne le fait que les deux équipes marquent, ou non, pendant la période indiquée.";
  if (/handicap|spreads/.test(market)) return "Le résultat est évalué après application du handicap indiqué pour l’équipe sélectionnée.";
  if (/total/.test(market) || /plus de|moins de|over|under/.test(normalize(pick))) {
    const values = pick.match(/\d+(?:[.,]\d+)?/g);
    const threshold = number(leg.pick_point) ?? (values ? number(values[values.length - 1].replace(",", ".")) : null);
    if (threshold !== null && threshold % 1 === 0.5) {
      if (/moins de|under/.test(normalize(pick))) return `Le total doit rester inférieur à ${formatNumber(threshold)} sur la période couverte par ce marché.`;
      if (/plus de|over/.test(normalize(pick))) return `Le total doit dépasser ${formatNumber(threshold)} sur la période couverte par ce marché.`;
    }
    return "Le pari porte sur le total indiqué, avec les règles de règlement propres à cette ligne.";
  }
  if (/h2h|vainqueur|victoire|1x2/.test(market)) return /^(nul|draw|match nul)$/i.test(pick) ? "La sélection prévoit un match nul pendant la période couverte." : `La sélection prévoit la victoire de ${pick}, selon la période couverte par le marché.`;
  return "Cette sélection porte sur l’événement indiqué par son marché ; la période couverte doit être vérifiée.";
}
function errorMessage(error) {
  const status = error?.response?.status;
  if (status === 401) return "Ta session a expiré. Reconnecte-toi pour retrouver tes combinés.";
  if (status === 403) return "Tes droits d’accès doivent être actualisés. Vérifie ton abonnement ou réessaie.";
  if (status === 504 || error?.code === "ECONNABORTED") return "Le chargement a pris trop de temps. Réessaie dans un instant.";
  return "Impossible de charger les combinés pour le moment. Réessaie dans un instant.";
}

export default function TodayCombosPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sportKey, setSportKey] = useState("all");
  const [levelKey, setLevelKey] = useState("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now());
  const [receivedAt, setReceivedAt] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const request = useRef(null);
  const lastAttempt = useRef(0);
  const mounted = useRef(false);
  const dataRef = useRef(null);
  const refreshAuthRef = useRef(refreshAuth);
  refreshAuthRef.current = refreshAuth;
  const clientTier = normalize(user?.subscription_tier || user?.subscription || "free");
  const authKey = `${user?.id || "anonymous"}|${clientTier}|${user?.subscription_expires_at || ""}|${Boolean(user?.is_admin)}`;
  const isFree = typeof data?.access?.is_paid === "boolean" ? !data.access.is_paid : !user?.is_admin && clientTier === "free";

  const load = useCallback(async (background = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    lastAttempt.current = Date.now();
    setError("");
    if (background && dataRef.current) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await api.get("/predictions/today-combos", { signal: controller.signal, timeout: 20_000 });
      const normalized = normalizeData(response.data);
      if (controller.signal.aborted || !mounted.current) return;
      dataRef.current = normalized;
      setData(normalized);
      setReceivedAt(new Date().toISOString());
      setNow(Date.now());
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setError(errorMessage(cause));
    } finally {
      if (!controller.signal.aborted && mounted.current) {
        setLoading(false); setRefreshing(false); request.current = null;
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    dataRef.current = null;
    setData(null); setReceivedAt(null); setRefreshing(false);
    load();
    return () => { mounted.current = false; request.current?.abort(); };
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
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [load]);

  const families = data?.normalizedFamilies || [];
  useEffect(() => {
    if (families.length && !families.some(f => f.family_key === sportKey)) setSportKey(families[0].family_key);
  }, [data, sportKey]);
  const family = families.find(f => f.family_key === sportKey);
  const tiers = useMemo(() => {
    const result = Object.entries(family?.tiers || {}).filter(([, tier]) => tier && typeof tier === "object" && !Array.isArray(tier));
    if (sportKey === "all" && data?.ultra_safe && typeof data.ultra_safe === "object" && !Array.isArray(data.ultra_safe)) {
      const index = result.findIndex(([key]) => key === "ultra_safe");
      if (index >= 0) result.splice(index, 1);
      result.unshift(["ultra_safe", data.ultra_safe]);
    }
    return result.sort(([a], [b]) => (LEVEL_ORDER.indexOf(a) < 0 ? 99 : LEVEL_ORDER.indexOf(a)) - (LEVEL_ORDER.indexOf(b) < 0 ? 99 : LEVEL_ORDER.indexOf(b)));
  }, [data, family, sportKey]);
  const filtered = useMemo(() => tiers.filter(([key, tier]) => (levelKey === "all" || key === levelKey) &&
    (!query.trim() || tierLegs(tier).some(leg => matchesQuery(leg, query)))), [tiers, levelKey, query]);
  useEffect(() => {
    if (tiers.length && levelKey !== "all" && !tiers.some(([key]) => key === levelKey)) setLevelKey("all");
  }, [tiers, levelKey]);
  const available = tiers.filter(([, tier]) => availability(tier, now) === "ready").length;
  const accessible = tiers.filter(([key, tier]) => canShare(tier, key, isFree, now)).length;
  const upcoming = number(family?.matches_today);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale";
  const generatedLabel = formatDate(data?.generated_at, { day: "numeric", month: "long", timeZone: data?.schedule_timezone || "UTC" });

  const shareWhatsApp = (tier, key) => {
    if (!canShare(tier, key, isFree, Date.now())) { toast.error("Ce combiné ne peut pas être partagé dans son état actuel."); return; }
    const lines = [`🎯 *WinPulse · ${LEVELS[key]?.label || text(tier.label, "Combiné du jour")}*`,
      `Cote totale : ${formatNumber(tier.total_odds, 2)}`, ""];
    tierLegs(tier).forEach((p, index) => {
      lines.push(`${index + 1}. *${text(p.home_team, "Domicile")} vs ${text(p.away_team, "Extérieur")}*`,
        `🏟 ${text(p.sport_title, text(p.league_name, "Compétition non communiquée"))}${country(p) ? ` · ${country(p)}` : ""}`,
        `📅 ${formatDate(p.commence_time, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} (${localZone})`,
        `👉 ${text(p.market_label, "Marché")} : ${p.pick} · cote ${formatNumber(p.pick_odds, 2)}`, "");
    });
    lines.push("Toutes les sélections doivent réussir. Aucun résultat garanti.", "Les cotes peuvent évoluer.", "Découvrir les analyses : https://wnpulse.com");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  };

  return (
    <AppLayout>
      <style>{`
        .wn-combo-in { animation: wn-combo-in .35s ease-out both; }
        @keyframes wn-combo-in { from { opacity: .5; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .wn-combo-in { animation: none; } }
      `}</style>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 pb-24">
        <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white sm:p-10 mb-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute bottom-0 right-20 h-40 w-40 rounded-full bg-teal-400/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Layers className="h-3.5 w-3.5" /> COMBINÉS DU JOUR</span>
                {!loading && data && <span className="rounded-full border border-white/15 px-3 py-1.5 text-slate-300">{generatedLabel}</span>}
              </div>
              <h1 className="font-heading text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Un combiné.<br /><span className="text-orange-400">Chaque match compte.</span></h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">Explore les rencontres, comprends les sélections et choisis le format qui te correspond.</p>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Horaires : {localZone}</span>
                {receivedAt && <span>Chargé à {formatDate(receivedAt, { hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 lg:min-w-[320px]">
              <HeroStat value={loading ? "—" : formatNumber(upcoming, 0)} label="Matchs à venir" />
              <HeroStat value={loading ? "—" : available} label="Combinés prêts" />
              <HeroStat value={loading ? "—" : accessible} label="Accessibles" />
            </div>
          </div>
        </section>

        {error && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-rose-800">{error}{data && " Les dernières données chargées restent affichées ; leur actualisation a échoué."}</p>
          <Button variant="outline" size="sm" onClick={() => load(Boolean(data))} disabled={loading || refreshing}><RefreshCw className="mr-2 h-4 w-4" />Réessayer</Button>
        </div>}

        <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><SlidersHorizontal className="h-4 w-4 text-orange-600" />Trouve ton combiné</div>
            <Button variant="outline" size="sm" onClick={() => load(Boolean(data))} disabled={loading || refreshing} className="self-start sm:self-auto">
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />{refreshing ? "Actualisation…" : "Actualiser"}
            </Button>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrer par sport">
            {families.map(f => <button type="button" key={f.family_key} aria-pressed={sportKey === f.family_key} onClick={() => setSportKey(f.family_key)}
              className={cn("shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500", sportKey === f.family_key ? "border-slate-900 bg-slate-900 text-white" : "border-neutral-200 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50")}>
              {f.family_label}<span className="ml-2 text-xs opacity-60">{formatNumber(f.matches_today, 0)}</span>
            </button>)}
            {loading && !families.length && <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-100" />}
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <label htmlFor="wn-combo-search" className="sr-only">Rechercher une équipe, un pays ou un championnat</label>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input id="wn-combo-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Équipe, pays, championnat…" className="h-10 w-full rounded-xl border border-neutral-200 bg-slate-50 pl-9 pr-10 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche" className="absolute right-3 top-3 text-slate-500"><X className="h-4 w-4" /></button>}
            </div>
            <div className="relative md:w-56">
              <label htmlFor="wn-combo-level" className="sr-only">Choisir un niveau de combiné</label>
              <select id="wn-combo-level" value={levelKey} onChange={e => setLevelKey(e.target.value)} className="h-10 w-full appearance-none rounded-xl border border-neutral-200 bg-white px-3 pr-9 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="all">Tous les formats</option>
                {LEVEL_ORDER.map(key => <option key={key} value={key}>{LEVELS[key].label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>
        </div>

        <details className="mb-6 rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-sm text-slate-700">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-slate-800"><Info className="h-4 w-4 text-orange-600" />Comment lire ces combinés ?</summary>
          <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
            <p>Toutes les sélections doivent réussir pour que le combiné soit gagnant. Une cote plus élevée ne signifie pas une meilleure chance de réussite.</p>
            <p>La confiance moyenne concerne les sélections individuelles. L’estimation combinée, si le moteur la fournit, est indicative et dépend de ses hypothèses et des corrélations entre événements.</p>
            <p>Les sélections viennent du moteur statistique WinPulse. Les explications décrivent les marchés et les données disponibles ; elles ne garantissent aucun résultat.</p>
            <p>La journée du flux est définie en {data?.schedule_timezone || "UTC"}. Les dates et horaires des rencontres sont affichés dans ton fuseau : {localZone}.</p>
          </div>
        </details>

        {loading ? <LoadingCards /> : !data ? <EmptyState title="Les combinés ne sont pas encore chargés" description="Utilise Réessayer pour récupérer les données du jour." /> : !tiers.length ?
          <EmptyState title="Aucun combiné disponible pour ce sport" description="De nouvelles sélections apparaîtront lorsque les matchs et les marchés seront disponibles." /> : !filtered.length ?
          <EmptyState title="Aucun combiné ne correspond à ta recherche" description="Essaie un autre championnat, une autre équipe ou un autre format." action={() => { setQuery(""); setLevelKey("all"); }} /> : <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" aria-live="polite">
              <span>{filtered.length} format{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""} · {family?.family_label}</span>
              {query.trim() && <span>Le combiné entier est conservé lorsqu’une rencontre correspond.</span>}
            </div>
            <div className="grid items-start gap-5 lg:grid-cols-2">
              {filtered.map(([key, tier], index) => <TierCard key={`${sportKey}-${key}`} tier={tier} tierKey={key} isFree={isFree} now={now} query={query}
                featured={key === "ultra_safe"} index={index} onUpgrade={() => setPayOpen(true)} onShare={() => shareWhatsApp(tier, key)} />)}
            </div>
          </>}
        {!loading && isFree && data && <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 shrink-0 text-orange-600" /><div><p className="font-heading font-bold text-slate-900">Passe de l’aperçu à l’analyse complète.</p><p className="mt-1 text-sm text-slate-600">Débloque les sélections de chaque rencontre et les différents formats de combinés.</p></div></div>
          <Button onClick={() => setPayOpen(true)} className="shrink-0 bg-orange-600 text-white hover:bg-orange-700">Découvrir Pro<ArrowRight className="ml-2 h-4 w-4" /></Button>
        </div>}
      </div>
      <PaymentModal isOpen={payOpen} onClose={() => {
        setPayOpen(false); load(true);
        // The API response controls access immediately; also refresh global auth.
        Promise.resolve().then(() => refreshAuthRef.current?.()).catch(() => {});
      }} targetTier="PRO" />
    </AppLayout>
  );
}

function HeroStat({ value, label }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center"><div className="font-mono text-2xl font-bold text-white">{value}</div><div className="mt-2 text-[10px] font-medium leading-relaxed text-slate-400 sm:text-xs">{label}</div></div>;
}
function LoadingCards() {
  return <div role="status" aria-label="Chargement des combinés" className="grid gap-5 lg:grid-cols-2">{[0, 1, 2, 3].map(i => <Card key={i} className="overflow-hidden rounded-2xl border-neutral-200 p-5"><div className="mb-6 flex items-center gap-3"><div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-100" /><div className="h-5 w-36 animate-pulse rounded-lg bg-slate-100" /></div>{[0, 1].map(n => <div key={n} className="mb-3 h-24 animate-pulse rounded-xl bg-slate-50" />)}</Card>)}</div>;
}
function EmptyState({ title, description, action }) {
  return <Card className="rounded-2xl border-dashed border-neutral-200 bg-white px-6 py-12 text-center"><CalendarDays className="mx-auto mb-4 h-9 w-9 text-slate-300" /><h2 className="font-heading text-lg font-bold text-slate-800">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{description}</p>{action && <Button variant="outline" onClick={action} className="mt-5">Réinitialiser les filtres</Button>}</Card>;
}
function TierCard({ tier, tierKey, isFree, now, query, featured, index, onUpgrade, onShare }) {
  const meta = LEVELS[tierKey] || { ...LEVELS.sure, label: text(tier.label, "Combiné") };
  const Icon = meta.icon;
  const legs = tierLegs(tier);
  const count = tierCount(tier);
  const locked = isTierLocked(tier, tierKey, isFree);
  const state = availability(tier, now);
  const hidden = legs.filter((p, i) => isLegLocked(p, tier, tierKey, isFree, i)).length + Math.max(0, count - legs.length);
  const odds = number(tier.total_odds);
  const combined = number(tier.combined_probability);
  const statsVisible = !locked && state === "ready";
  return <Card className={cn("wn-combo-in overflow-hidden rounded-2xl bg-white shadow-sm", featured ? "border-teal-200 ring-2 ring-teal-500/10" : "border-neutral-200")} style={{ animationDelay: `${Math.min(index, 5) * 45}ms` }} data-testid={`today-tier-${tierKey}`}>
    <div className="border-b border-neutral-100 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm", meta.gradient)}><Icon className="h-6 w-6" /></div><div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-xl font-extrabold text-slate-900">{meta.label}</h2>{featured && <Badge className="border-teal-200 bg-teal-50 text-[9px] text-teal-700">TOUS SPORTS</Badge>}</div>
          <p className="mt-1 text-xs text-slate-500">{count} sélection{count > 1 ? "s" : ""}{locked ? ` · ${hidden || count} à débloquer` : ""}</p>
        </div></div>
        <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cote totale</p><p className={cn("mt-1 font-mono text-2xl font-extrabold", meta.color)}>{locked ? "PRO" : statsVisible && odds > 1 ? formatNumber(odds, 2) : "—"}</p></div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">{meta.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge className={cn("text-[10px]", state === "started" ? "border-amber-200 bg-amber-50 text-amber-800" : state === "incomplete" ? "border-neutral-200 bg-slate-50 text-slate-500" : locked ? "border-orange-200 bg-orange-50 text-orange-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {state === "started" ? "À actualiser · rencontre commencée" : state === "incomplete" ? "En préparation" : locked ? "Aperçu Pro" : "Disponible"}
        </Badge>
        {statsVisible && <Badge className="border-neutral-200 bg-slate-50 text-[10px] text-slate-600">Confiance moyenne : {percent(tier.avg_confidence)}</Badge>}
      </div>
      {statsVisible && combined !== null && combined >= 0 && combined <= 100 && <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">Estimation combinée du moteur</span><span className="font-mono font-semibold text-slate-800">{percent(combined)}</span></div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Indicative ; différente de la moyenne des confiances. Les hypothèses du moteur restent à valider.</p>
      </div>}
    </div>
    <div className="space-y-3 p-4 sm:p-5">
      {state === "started" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">Une rencontre a commencé ou est terminée. Ce combiné ne peut plus être partagé ; actualise pour retrouver les sélections à venir.</p>}
      {legs.map((leg, legIndex) => <LegCard key={`${leg.match_id || leg.id || legIndex}-${legIndex}`} leg={leg} index={legIndex} locked={isLegLocked(leg, tier, tierKey, isFree, legIndex)} allowAnalysis={!isFree} query={query} now={now} />)}
      {!legs.length && <div className={cn("rounded-xl border border-dashed p-6 text-center", meta.border, meta.tint)}>
        {locked ? <Lock className={cn("mx-auto mb-2 h-6 w-6", meta.color)} /> : <Clock className="mx-auto mb-2 h-6 w-6 text-slate-400" />}
        <p className="text-sm font-semibold text-slate-700">{locked && count > 0 ? `${count} sélections à découvrir` : "Le moteur attend davantage de sélections"}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{locked && count > 0 ? "Le détail de ce format est disponible avec Pro." : "Un combiné complet nécessite au moins deux rencontres. Aucun match n’est ajouté artificiellement."}</p>
      </div>}
      {state === "incomplete" && legs.length > 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Cette sélection ne constitue pas encore un combiné complet. Le partage sera disponible dès qu’au moins deux rencontres seront retenues.</p>}
      {locked && count >= 2 ? <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4"><p className="text-sm font-bold text-slate-900">Découvre toutes les sélections</p><p className="mb-3 mt-1 text-xs leading-relaxed text-slate-500">Les rencontres sont visibles. Les marchés, les cotes et les analyses complètes se débloquent avec Pro.</p><Button className="w-full bg-orange-600 text-white hover:bg-orange-700" onClick={onUpgrade} data-testid={`today-upgrade-${tierKey}`}><Lock className="mr-2 h-4 w-4" />Découvrir Pro<ArrowRight className="ml-2 h-4 w-4" /></Button></div> :
        <Button onClick={onShare} disabled={!canShare(tier, tierKey, isFree, now)} size="sm" className="h-10 w-full rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5c]" data-testid={`today-share-${tierKey}`}><Send className="mr-2 h-4 w-4" />Partager le combiné sur WhatsApp</Button>}
      {count > 0 && <p className="px-1 text-center text-[10px] leading-relaxed text-slate-400">Les cotes peuvent évoluer. Aucun format ne garantit un résultat.</p>}
    </div>
  </Card>;
}
function LegCard({ leg, index, locked, allowAnalysis, query, now }) {
  const start = dateValue(leg.commence_time);
  const started = Boolean(leg.completed || leg.is_finished || leg.finished || (start && start.getTime() <= now));
  const highlight = query.trim() && matchesQuery(leg, query);
  const id = leg.match_id ?? leg.id;
  const competition = text(leg.sport_title, text(leg.league_name, text(leg.league, "Compétition non communiquée")));
  const location = country(leg);
  const probability = leg.model_probability ?? leg.estimated_win_probability;
  const risk = RISK_META[normalize(leg.label)];
  return <div className={cn("rounded-xl border p-3.5", highlight ? "border-orange-300 bg-orange-50/40" : "border-neutral-200 bg-slate-50/50")}>
    <div className="mb-2 flex items-start gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white text-[10px] font-bold text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="break-words text-[10px] font-semibold uppercase tracking-wide text-slate-500">{competition}{location && !normalize(competition).includes(normalize(location)) ? ` · ${location}` : ""}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><CalendarDays className="h-3 w-3 shrink-0" /><span>{formatDate(leg.commence_time, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>{started && <span className="ml-1 font-semibold text-amber-700">Commencée / terminée</span>}</p></div></div>
    <p className="break-words text-sm font-bold leading-relaxed text-slate-900">{text(leg.home_team, "Domicile")} <span className="px-1 font-normal text-slate-400">vs</span> {text(leg.away_team, "Extérieur")}</p>
    {locked ? <div className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5 shrink-0 text-orange-500" />Sélection et cote réservées aux abonnés</div> : <>
      <div className="mt-3 flex items-start justify-between gap-2 rounded-lg border border-orange-100 bg-white p-3"><div className="min-w-0"><p className="text-[10px] text-slate-400">{text(leg.market_label, "Marché non communiqué")}</p><p className="mt-1 break-words text-xs font-bold text-orange-700">{text(leg.pick, "Sélection non communiquée")}</p></div><span className="shrink-0 rounded-lg bg-orange-50 px-2 py-1 font-mono text-sm font-bold text-orange-700">{number(leg.pick_odds) > 1 ? formatNumber(leg.pick_odds, 2) : "—"}</span></div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>Confiance fournie : <strong className="text-slate-700">{percent(leg.confidence)}</strong></span>{number(probability) !== null && <span>Estimation du moteur : <strong className="text-slate-700">{percent(probability)}</strong></span>}</div>
      {risk && <Badge className={cn("mt-2 text-[10px]", risk.className)}>Niveau du moteur : {risk.label}</Badge>}
      <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Comprendre cette sélection</summary><div className="mt-2 rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-500"><p>{explainPick(leg)}</p><p className="mt-2">Cette explication décrit le marché. Elle ne suppose aucune forme récente, blessure ou statistique absente des données.</p></div></details>
      {allowAnalysis && id !== null && id !== undefined && String(id) && <Link to={`/app/match/${encodeURIComponent(String(id))}`} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Voir l’analyse du match<ArrowRight className="h-3.5 w-3.5" /></Link>}
    </>}
  </div>;
}
