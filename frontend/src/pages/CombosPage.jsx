import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowRight, Check, ChevronDown, Clock, Copy, Gift,
  Info, Layers, Loader2, Lock, RefreshCw, Rocket, Scale, Shield, Sparkles, X,
} from "lucide-react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const TIERS = [
  { key: "safe", label: "Sécurité", icon: Shield, accent: "emerald", description: "Le profil prudent, à examiner sélection par sélection." },
  { key: "balanced", label: "Équilibre", icon: Scale, accent: "orange", description: "Un profil intermédiaire pour comparer les cotes et la confiance." },
  { key: "jackpot", label: "Jackpot", icon: Rocket, accent: "rose", description: "Le profil offensif : une cote élevée implique davantage d’incertitude." },
];
const ACCENTS = {
  emerald: { icon: "bg-emerald-50 text-emerald-700", selected: "border-emerald-600 bg-emerald-50/50", heading: "text-emerald-800", summary: "from-emerald-800 to-emerald-950" },
  orange: { icon: "bg-orange-50 text-orange-700", selected: "border-orange-600 bg-orange-50/50", heading: "text-orange-800", summary: "from-orange-800 to-slate-950" },
  rose: { icon: "bg-rose-50 text-rose-700", selected: "border-rose-600 bg-rose-50/50", heading: "text-rose-800", summary: "from-rose-800 to-slate-950" },
};
const FRESH_FOR_MS = 5 * 60 * 1000;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\s*-?\d+(?:[.,]\d+)?\s*$/.test(value)) return null;
  const result = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(result) ? result : null;
}

function percentage(value) {
  const result = number(value);
  return result !== null && result >= 0 && result <= 100 ? result : null;
}

function odds(value) {
  const result = number(value);
  return result !== null && result > 1 ? result : null;
}

function formatNumber(value, digits = 2) {
  return value === null ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value);
}

function dateValue(value) {
  if (typeof value !== "string" || !value.includes("T")) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function dateLabel(value) {
  const date = dateValue(value);
  return date === null ? "Horaire non communiqué" : new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

function paidAccount(account, now = Date.now()) {
  if (!object(account)) return false;
  if (account.is_admin === true) return true;
  const tier = text(account.subscription, text(account.subscription_tier)).toLowerCase();
  if (!tier || ["free", "none", "expired", "inactive", "null", "undefined"].includes(tier)) return false;
  if (account.subscription_expires_at) {
    const expiration = dateValue(account.subscription_expires_at);
    if (expiration === null || expiration <= now) return false;
  }
  return true;
}

function normalizeCombos(payload) {
  if (!object(payload)) throw new Error("INVALID_COMBOS");
  if (Object.keys(payload).length && !TIERS.some((tier) => Object.prototype.hasOwnProperty.call(payload, tier.key))) throw new Error("INVALID_COMBOS");
  const result = {};
  for (const tier of TIERS) {
    const raw = payload[tier.key];
    if (raw === null || raw === undefined) { result[tier.key] = null; continue; }
    if (!object(raw) || (raw.legs !== undefined && raw.legs !== null && !Array.isArray(raw.legs))) throw new Error("INVALID_COMBOS");
    result[tier.key] = {
      label: text(raw.label, tier.label),
      tagline: text(raw.tagline),
      description: text(raw.description),
      total_odds: odds(raw.total_odds),
      avg_confidence: percentage(raw.avg_confidence),
      combined_probability: percentage(raw.combined_probability),
      unlocked_for_free: raw.unlocked_for_free === true,
      locked: raw.locked === true || payload.access?.is_paid === false && raw.unlocked_for_free !== true,
      legs: (raw.legs || []).map((row, index) => {
        const leg = object(row) ? row : {};
        const identifier = leg.match_id ?? leg.id;
        return {
          match_id: ["string", "number"].includes(typeof identifier) ? String(identifier) : "",
          key: `${identifier ?? "missing"}-${index}`,
          home_team: text(leg.home_team), away_team: text(leg.away_team),
          sport_title: text(leg.sport_title),
          league: text(leg.league_name, text(leg.league)),
          country: text(leg.country_name, text(leg.country)),
          commence_time: dateValue(leg.commence_time) === null ? null : leg.commence_time,
          completed: leg.completed === true || leg.is_finished === true,
          pick: text(leg.pick), pick_odds: odds(leg.pick_odds),
          market_label: text(leg.market_label),
          label: text(leg.label), confidence: percentage(leg.confidence),
          locked: leg.locked === true,
        };
      }),
    };
  }
  return result;
}

function unlockedTier(combo, account, now) {
  return Boolean(combo && !combo.locked && (combo.unlocked_for_free || paidAccount(account, now)));
}

function legStatus(leg, now) {
  if (leg.completed) return "finished";
  const date = dateValue(leg.commence_time);
  return date === null ? "unknown" : date <= now ? "started" : "upcoming";
}

function completeTicket(combo, account, now, loadedAt) {
  return Boolean(unlockedTier(combo, account, now) && combo.legs.length >= 2 && loadedAt !== null
    && now - loadedAt >= 0 && now - loadedAt < FRESH_FOR_MS
    && combo.legs.every((leg) => !leg.locked && leg.home_team && leg.away_team && leg.pick
      && leg.pick_odds !== null && legStatus(leg, now) === "upcoming"));
}

function ticketText(combo) {
  return [
    `WNPulse · Combiné ${combo.label}`,
    `Horaires : ${Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale du navigateur"}`,
    ...combo.legs.map((leg, index) => [
      `${index + 1}. ${leg.home_team} vs ${leg.away_team}`,
      [leg.league || leg.sport_title, leg.country].filter(Boolean).join(" · "),
      dateLabel(leg.commence_time),
      [leg.market_label, leg.pick].filter(Boolean).join(" : "),
      `Cote : ${formatNumber(leg.pick_odds)}`,
    ].filter(Boolean).join("\n")),
    combo.total_odds !== null ? `Cote totale du moteur : ${formatNumber(combo.total_odds)}` : "Cote totale non communiquée",
    "Sélections et cotes à vérifier avant le début des rencontres.",
  ].join("\n\n");
}

function loadError(failure) {
  if (failure?.message === "INVALID_COMBOS" || failure?.message === "INVALID_ACCOUNT") return "Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.";
  if (["ECONNABORTED", "ETIMEDOUT"].includes(failure?.code)) return "Le serveur met trop de temps à répondre. Tu peux réessayer.";
  if (failure?.response?.status === 429) return "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.";
  return "Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.";
}

function RiskBadge({ label }) {
  if (!label) return null;
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const style = normalized.includes("risqu") ? "border-rose-200 bg-rose-50 text-rose-800"
    : normalized.includes("modere") ? "border-amber-200 bg-amber-50 text-amber-900"
      : normalized.includes("sur") || normalized.includes("safe") ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={cn("inline-flex max-w-full break-words rounded-full border px-3 py-1.5 text-sm font-semibold", style)}>{label}</span>;
}

function SelectionCard({ leg, index, unlocked, now, onUpgrade }) {
  const visible = unlocked && !leg.locked;
  const status = legStatus(leg, now);
  const competition = leg.league || leg.sport_title || "Compétition non communiquée";
  const href = leg.match_id ? `/app/match/${encodeURIComponent(leg.match_id)}` : null;
  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border-neutral-200 bg-white p-4 shadow-sm sm:p-6" data-testid={`combo-leg-${leg.match_id || index}`}>
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-lg font-extrabold text-orange-700">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-relaxed text-slate-600 [overflow-wrap:anywhere]">{competition}{leg.country ? ` · ${leg.country}` : ""}</p>
          <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed text-slate-500"><Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span>{dateLabel(leg.commence_time)}</span></p>
        </div>
      </div>
      {(status === "started" || status === "finished") && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold leading-relaxed text-amber-900">{status === "finished" ? "Rencontre terminée · actualise le combiné" : "Rencontre commencée · actualise le combiné"}</p>}
      <div className="mt-5 space-y-1 text-lg font-extrabold leading-snug text-slate-900 [overflow-wrap:anywhere] sm:text-xl">
        <p>{leg.home_team || "Équipe non communiquée"}</p>
        <p className="text-sm font-medium text-slate-500">contre</p>
        <p>{leg.away_team || "Équipe non communiquée"}</p>
      </div>
      {visible ? (
        <>
          <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
            <p className="break-words text-sm font-semibold text-orange-800">{leg.market_label || "Pronostic sélectionné"}</p>
            <p className="mt-2 break-words text-lg font-extrabold leading-snug text-slate-900 [overflow-wrap:anywhere]">{leg.pick || "Sélection non communiquée"}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-xl bg-slate-50 p-3 sm:p-4"><p className="text-sm leading-relaxed text-slate-500">Cote du pronostic</p><p className="mt-1 break-words font-mono text-2xl font-extrabold text-slate-900 [overflow-wrap:anywhere]">{formatNumber(leg.pick_odds)}</p></div>
            <div className="min-w-0 rounded-xl bg-slate-50 p-3 sm:p-4"><p className="text-sm leading-relaxed text-slate-500">Confiance du moteur</p><p className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{leg.confidence === null ? "—" : `${formatNumber(leg.confidence, 1)} %`}</p></div>
          </div>
          {leg.label && <div className="mt-4"><RiskBadge label={leg.label} /></div>}
          <details className="group mt-5 rounded-xl border border-neutral-200">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-semibold text-slate-700 [&::-webkit-details-marker]:hidden"><span>Comprendre cette sélection</span><ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
            <div className="space-y-3 border-t border-neutral-100 px-4 py-4 text-base leading-relaxed text-slate-600">
              <p><strong className="text-slate-900">Choix du moteur :</strong> {leg.pick || "non communiqué"}{leg.market_label ? ` sur le marché « ${leg.market_label} »` : ""}.</p>
              <p>{leg.confidence === null ? "Le moteur n’a pas communiqué de score de confiance pour cette sélection." : `La confiance affichée (${formatNumber(leg.confidence, 1)} %) est l’indicateur fourni par le moteur. Elle ne représente pas un taux de réussite observé.`}</p>
              <p>La cote de cette sélection est distincte de la cote totale du combiné. Ouvre la fiche du match pour consulter les informations disponibles sur la rencontre.</p>
            </div>
          </details>
          {href && <Link to={href} className="mt-4 inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-base font-semibold text-orange-700 transition-colors hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 motion-reduce:transition-none">Ouvrir la fiche du match<ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" /></Link>}
        </>
      ) : (
        <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
          <p className="flex items-start gap-2 text-base font-semibold text-orange-900"><Lock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />Sélection réservée aux abonnés</p>
          <Button variant="outline" className="mt-4 h-auto min-h-12 w-full whitespace-normal bg-white px-4 py-3 text-base" onClick={onUpgrade}>Découvrir les abonnements</Button>
        </div>
      )}
    </Card>
  );
}

export default function CombosPage() {
  const { user, loading: authLoading = false } = useAuth();
  const navigate = useNavigate();
  const [combos, setCombos] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessState, setAccessState] = useState("waiting");
  const [error, setError] = useState("");
  const [activeTier, setActiveTier] = useState("balanced");
  const [loadedAt, setLoadedAt] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [copyNotice, setCopyNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const mountedRef = useRef(false);
  const requestRef = useRef(null);
  const snapshotRef = useRef(null);
  const tierChosenRef = useRef(false);
  const copyGenerationRef = useRef(0);
  const sessionKey = user?.id || user?.email || "anonymous";

  const fetchCombos = useCallback(async () => {
    if (!mountedRef.current || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      // Verify current access independently of the cached AuthContext profile.
      const [profile, selection] = await Promise.allSettled([
        api.get("/auth/me", { timeout: 8000, signal: controller.signal }),
        api.get("/predictions/combos", { timeout: 16000, signal: controller.signal }),
      ]);
      if (!mountedRef.current || controller.signal.aborted) return;
      const statuses = [profile, selection].filter((result) => result.status === "rejected").map((result) => result.reason?.response?.status);
      if (statuses.includes(401)) {
        snapshotRef.current = null; setCombos(null); setAccount(null); setLoadedAt(null);
        setAccessState("unauthorized"); setError(""); return;
      }
      if (profile.status === "fulfilled") {
        if (!object(profile.value.data)) throw new Error("INVALID_ACCOUNT");
        setAccount(profile.value.data);
      }
      if (selection.status === "rejected" && selection.reason?.response?.status === 403) {
        snapshotRef.current = null; setCombos(null); setLoadedAt(null);
        setAccessState("locked"); setError(""); return;
      }
      if (profile.status === "rejected") throw profile.reason;
      if (selection.status === "rejected") throw selection.reason;
      const data = normalizeCombos(selection.value.data);
      snapshotRef.current = data; setCombos(data); setLoadedAt(Date.now()); setNow(Date.now());
      setAccessState("ready"); setError("");
      if (!tierChosenRef.current && !paidAccount(profile.value.data)) {
        const free = TIERS.find((tier) => data[tier.key]?.unlocked_for_free && data[tier.key].legs.length > 0 && !data[tier.key].locked);
        if (free) setActiveTier(free.key);
      }
    } catch (failure) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(loadError(failure));
        if (!snapshotRef.current) setAccessState("error");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current && !controller.signal.aborted) { setLoading(false); setRefreshing(false); }
      }
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    mountedRef.current = true;
    snapshotRef.current = null; tierChosenRef.current = false;
    setCombos(null); setAccount(null); setLoadedAt(null); setLoading(true); setAccessState("waiting"); setError("");
    fetchCombos();
    const refreshVisible = () => { if (document.visibilityState === "visible") fetchCombos(); };
    const timer = window.setInterval(refreshVisible, 120000);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    return () => {
      mountedRef.current = false; requestRef.current?.abort(); requestRef.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
      copyGenerationRef.current += 1;
    };
  }, [authLoading, sessionKey, user?.subscription, user?.subscription_tier, fetchCombos]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    const tick = () => setNow(Date.now());
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);

  useEffect(() => {
    copyGenerationRef.current += 1; setCopyNotice(""); setManualCopy("");
  }, [activeTier, combos, accessState]);

  const tier = TIERS.find((item) => item.key === activeTier) || TIERS[1];
  const activeCombo = combos?.[tier.key];
  const unlocked = unlockedTier(activeCombo, account, now);
  const fullAccess = unlocked && activeCombo?.legs.every((leg) => !leg.locked);
  const isPaid = paidAccount(account, now);
  const freeTier = TIERS.find((item) => combos?.[item.key]?.unlocked_for_free && combos[item.key].legs.length > 0 && !combos[item.key].locked);
  const stale = loadedAt !== null && now - loadedAt >= FRESH_FOR_MS;
  const unavailable = activeCombo?.legs.some((leg) => ["started", "finished"].includes(legStatus(leg, now))) || false;
  const canCopy = completeTicket(activeCombo, account, now, loadedAt);
  const firstStart = useMemo(() => {
    const starts = (activeCombo?.legs || []).map((leg) => dateValue(leg.commence_time)).filter((value) => value !== null);
    return starts.length ? new Date(Math.min(...starts)).toISOString() : null;
  }, [activeCombo]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale", []);
  const upgrade = () => navigate("/app/abonnement");
  function chooseTier(key) { tierChosenRef.current = true; setActiveTier(key); }
  async function copyCombo() {
    if (!completeTicket(activeCombo, account, Date.now(), loadedAt)) return;
    const content = ticketText(activeCombo), generation = copyGenerationRef.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(content);
      if (mountedRef.current && generation === copyGenerationRef.current) { setCopyNotice("Combiné copié."); setManualCopy(""); }
    } catch {
      if (mountedRef.current && generation === copyGenerationRef.current) { setCopyNotice("La copie automatique est indisponible. Sélectionne le texte ci-dessous."); setManualCopy(content); }
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8" data-testid="combos-page">
        <header className="mb-7 flex flex-col gap-5 sm:mb-9 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-orange-700"><Layers aria-hidden="true" className="h-4 w-4 shrink-0" />Les combinés WNPulse</p>
            <h1 className="mt-3 font-heading text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">Tes sélections.<br /><span className="text-orange-600">Un combiné, en clair.</span></h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">Compare les profils, retrouve chaque rencontre et comprends les chiffres du moteur avant de choisir.</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">Horaires : {timeZone}{loadedAt !== null ? ` · ${stale ? "Dernier chargement" : "Actualisé"} à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(loadedAt))}` : ""}</p>
          </div>
          <Button variant="outline" onClick={() => fetchCombos()} disabled={loading || refreshing || authLoading} className="h-auto min-h-12 w-full shrink-0 whitespace-normal bg-white px-5 py-3 text-base sm:w-auto" data-testid="refresh-combos-btn"><RefreshCw aria-hidden="true" className={cn("mr-2 h-5 w-5", refreshing && "animate-spin motion-reduce:animate-none")} />{refreshing ? "Actualisation…" : "Actualiser"}</Button>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="Choisir un profil de combiné">
          {TIERS.map((item) => {
            const Icon = item.icon, combo = combos?.[item.key], selected = tier.key === item.key;
            const available = unlockedTier(combo, account, now) && combo?.legs.every((leg) => !leg.locked);
            return <button type="button" key={item.key} aria-pressed={selected} onClick={() => chooseTier(item.key)} data-testid={`tier-tab-${item.key}`} className={cn("min-w-0 rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 motion-reduce:transition-none sm:p-5", selected ? ACCENTS[item.accent].selected : "border-neutral-200 bg-white hover:border-neutral-300")}>
              <div className="flex min-w-0 items-start gap-3"><span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", ACCENTS[item.accent].icon)}><Icon aria-hidden="true" className="h-6 w-6" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-lg font-extrabold text-slate-900">{item.label}</span>{combo?.unlocked_for_free && !combo.locked && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-800">Gratuit</span>}{selected && <Check aria-hidden="true" className={cn("h-5 w-5 shrink-0", ACCENTS[item.accent].heading)} />}</div><p className="mt-1 break-words text-sm leading-relaxed text-slate-600">{combo ? `${combo.legs.length} sélection${combo.legs.length > 1 ? "s" : ""}${available && combo.total_odds !== null ? ` · Cote ${formatNumber(combo.total_odds)}` : ""}` : "Profil à découvrir"}</p></div></div>
              <p className="mt-3 text-base leading-relaxed text-slate-600">{item.description}</p>
            </button>;
          })}
        </div>

        {error && <div role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5"><div className="flex items-start gap-3"><AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div className="min-w-0"><p className="text-base leading-relaxed text-amber-900">{error}</p>{combos && <p className="mt-2 text-sm leading-relaxed text-amber-800">La dernière sélection chargée reste affichée. Elle n’a pas été remplacée par des données vides.</p>}<Button variant="outline" onClick={() => fetchCombos()} disabled={refreshing} className="mt-3 h-auto min-h-11 whitespace-normal bg-white px-4 py-3 text-base">Réessayer</Button></div></div></div>}

        {loading || authLoading ? (
          <div role="status" aria-label="Chargement des combinés" className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><div className="space-y-4"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div><Skeleton className="h-80 rounded-2xl" /><span className="sr-only">Chargement des combinés et vérification de l’accès…</span></div>
        ) : accessState === "unauthorized" ? (
          <Card className="rounded-2xl bg-white p-6 sm:p-8"><Lock aria-hidden="true" className="h-8 w-8 text-orange-600" /><h2 className="mt-4 text-2xl font-extrabold text-slate-900">Ta session doit être renouvelée</h2><p className="mt-3 text-base leading-relaxed text-slate-600">Reconnecte-toi pour retrouver l’accès correspondant à ton compte.</p><Link to="/login" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-orange-600 px-5 py-3 text-base font-semibold text-white">Se connecter</Link></Card>
        ) : accessState === "locked" ? (
          <Card className="rounded-2xl border-orange-200 bg-orange-50/40 p-6 sm:p-8" data-testid="combos-locked"><div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-100 text-orange-700"><Lock aria-hidden="true" className="h-6 w-6" /></div><h2 className="mt-4 text-2xl font-extrabold text-slate-900">Les combinés sont réservés aux abonnés</h2><p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">Ton accès actuel ne permet pas de consulter ces sélections. Découvre les formules disponibles pour retrouver les matchs, les pronostics et les cotes de chaque combiné.</p><Button onClick={upgrade} className="mt-6 h-auto min-h-12 w-full whitespace-normal bg-orange-600 px-5 py-3 text-base text-white sm:w-auto" data-testid="upgrade-from-combos-btn"><Sparkles aria-hidden="true" className="mr-2 h-5 w-5" />Découvrir les abonnements</Button></Card>
        ) : accessState === "error" ? (
          <Card className="rounded-2xl bg-white p-6 text-center sm:p-8"><h2 className="text-xl font-extrabold text-slate-900">Les combinés n’ont pas pu être chargés</h2><p className="mt-3 text-base leading-relaxed text-slate-600">Utilise le bouton Réessayer ci-dessus pour relancer la vérification.</p></Card>
        ) : (
          <>
            {!isPaid && freeTier && <Card className="mb-6 rounded-2xl border-emerald-200 bg-emerald-50 p-5" data-testid="free-combo-banner"><div className="flex items-start gap-3"><Gift aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" /><div className="min-w-0"><h2 className="text-lg font-extrabold text-emerald-900">Un combiné gratuit à découvrir</h2><p className="mt-2 text-base leading-relaxed text-emerald-900">Le profil {combos[freeTier.key].label} est accessible avec ton compte.</p></div></div><Button onClick={() => chooseTier(freeTier.key)} className="mt-4 h-auto min-h-12 w-full whitespace-normal bg-emerald-700 px-4 py-3 text-base text-white sm:w-auto" data-testid="see-free-combo-btn">Voir le combiné gratuit<ArrowRight aria-hidden="true" className="ml-2 h-5 w-5" /></Button></Card>}
            {!activeCombo?.legs.length ? (
              <Card className="rounded-2xl bg-white p-7 text-center sm:p-10"><Layers aria-hidden="true" className="mx-auto h-10 w-10 text-orange-500" /><h2 className="mt-4 text-2xl font-extrabold text-slate-900">Aucune sélection pour ce profil</h2><p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">Le moteur n’a pas fourni de combiné {tier.label.toLowerCase()} pour le moment. Consulte un autre profil ou actualise plus tard.</p></Card>
            ) : (
              <>
                {(stale || unavailable) && <div role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base leading-relaxed text-amber-900">{unavailable ? "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles." : "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier."}</div>}
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <section className="min-w-0 space-y-4" aria-labelledby="combo-selections-title" data-testid={`combo-legs-${tier.key}`}>
                    <div className="mb-5">
                      <h2 id="combo-selections-title" className="text-2xl font-extrabold text-slate-900">Les rencontres du combiné</h2>
                      <p className="mt-2 text-base leading-relaxed text-slate-600">{activeCombo.legs.length} sélection{activeCombo.legs.length > 1 ? "s" : ""} · {tier.label}</p>
                      {firstStart && <p className="mt-2 text-sm leading-relaxed text-slate-500">Première rencontre : {dateLabel(firstStart)}</p>}
                      <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/60 p-4 lg:hidden">
                        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-base font-semibold text-slate-700">Cote totale du moteur</p><p className="break-words font-mono text-2xl font-extrabold text-orange-800 [overflow-wrap:anywhere]">{fullAccess ? formatNumber(activeCombo.total_odds) : "Réservée"}</p></div>
                        <a href="#combo-summary" className="mt-2 inline-flex min-h-11 items-center gap-2 text-base font-semibold text-orange-700">Voir le récapitulatif<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" /></a>
                      </div>
                    </div>
                    {activeCombo.legs.map((leg, index) => <SelectionCard key={leg.key} leg={leg} index={index} unlocked={unlocked} now={now} onUpgrade={upgrade} />)}
                  </section>
                  <aside id="combo-summary" className="min-w-0 scroll-mt-20 space-y-5 lg:sticky lg:top-6" aria-label="Récapitulatif du combiné">
                    <Card className={cn("overflow-hidden rounded-2xl border-0 bg-gradient-to-br p-5 text-white shadow-lg sm:p-6", ACCENTS[tier.accent].summary)} data-testid={`bet-slip-${tier.key}`}>
                      <p className="text-sm font-bold uppercase tracking-wider text-white/80">Ton récapitulatif</p><h2 className="mt-2 break-words text-2xl font-extrabold [overflow-wrap:anywhere]">Combiné {activeCombo.label}</h2>
                      <div className="mt-5 rounded-xl bg-white/10 p-4"><p className="text-base text-white/80">Cote totale du moteur</p><p className="mt-2 break-words font-mono text-4xl font-black leading-tight [overflow-wrap:anywhere] sm:text-5xl">{fullAccess ? formatNumber(activeCombo.total_odds) : "Réservée"}</p><p className="mt-2 text-sm leading-relaxed text-white/80">{fullAccess ? "Cote fournie avec la sélection, susceptible d’évoluer chez le bookmaker." : "Disponible avec les sélections complètes."}</p></div>
                      <dl className="mt-5 space-y-4"><Metric label="Sélections" value={activeCombo.legs.length} /><Metric label="Confiance moyenne du moteur" value={fullAccess && activeCombo.avg_confidence !== null ? `${formatNumber(activeCombo.avg_confidence, 1)} %` : "—"} /><Metric label="Probabilité combinée estimée" value={fullAccess && activeCombo.combined_probability !== null ? `${formatNumber(activeCombo.combined_probability, 1)} %` : "—"} /></dl>
                      {fullAccess ? <Button onClick={copyCombo} disabled={!canCopy} className="mt-6 h-auto min-h-12 w-full whitespace-normal bg-white px-4 py-3 text-base font-bold text-slate-900 hover:bg-orange-50 disabled:opacity-70" data-testid="copy-combo-btn"><Copy aria-hidden="true" className="mr-2 h-5 w-5 shrink-0" />Copier les sélections</Button> : <Button onClick={upgrade} className="mt-6 h-auto min-h-12 w-full whitespace-normal bg-white px-4 py-3 text-base font-bold text-slate-900 hover:bg-orange-50" data-testid="upgrade-combo-btn"><Lock aria-hidden="true" className="mr-2 h-5 w-5 shrink-0" />Débloquer le combiné</Button>}
                      {fullAccess && !canCopy && <p className="mt-3 text-sm leading-relaxed text-white/80">{stale || unavailable ? "Actualise le combiné avant de copier ses sélections." : "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir."}</p>}
                      {copyNotice && <p role="status" className="mt-4 text-base leading-relaxed text-white">{copyNotice}</p>}
                    </Card>
                    {manualCopy && canCopy && <Card className="rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><label htmlFor="combo-manual-copy" className="text-base font-bold text-slate-900">Texte du combiné</label><button type="button" onClick={() => setManualCopy("")} aria-label="Fermer le texte à copier" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-50"><X aria-hidden="true" className="h-5 w-5" /></button></div><textarea id="combo-manual-copy" readOnly value={manualCopy} onFocus={(event) => event.target.select()} className="mt-3 min-h-64 w-full rounded-xl border border-neutral-200 p-3 text-base leading-relaxed text-slate-700" /><p className="mt-2 text-sm text-slate-500">Appuie dans le texte pour le sélectionner.</p></Card>}
                    <Card className="rounded-2xl border-neutral-200 bg-white p-5"><div className="flex items-start gap-3"><Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" /><div className="min-w-0"><h3 className="text-lg font-bold text-slate-900">Bien lire les chiffres</h3><p className="mt-3 text-base leading-relaxed text-slate-600">La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.</p><p className="mt-3 text-base leading-relaxed text-slate-600">La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.</p><p className="mt-3 text-base leading-relaxed text-slate-600">Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.</p></div></div></Card>
                  </aside>
                </div>
              </>
            )}
          </>
        )}
        {refreshing && !loading && <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Vérification des sélections et de ton accès…</p>}
      </div>
    </AppLayout>
  );
}

function Metric({ label, value }) {
  return <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1"><dt className="min-w-0 text-base leading-relaxed text-white/80">{label}</dt><dd className="shrink-0 font-mono text-lg font-bold leading-relaxed">{value}</dd></div>;
}
