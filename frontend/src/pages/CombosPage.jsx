import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowRight, Check, ChevronDown, Clock, Copy, Gift,
  CalendarDays, Info, Layers, Loader2, Lock, RefreshCw, Rocket, Scale, Shield, Sparkles, X,
} from "lucide-react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import "./CombosPage.css";

const TIERS = [
  { key: "safe", label: "Sécurité", icon: Shield, accent: "emerald", description: "Le profil prudent, à examiner sélection par sélection." },
  { key: "balanced", label: "Équilibre", icon: Scale, accent: "orange", description: "Un profil intermédiaire pour comparer les cotes et la confiance." },
  { key: "jackpot", label: "Jackpot", icon: Rocket, accent: "rose", description: "Le profil offensif : une cote élevée implique davantage d’incertitude." },
];
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
          market: text(leg.market), pick_point: number(leg.pick_point),
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

function chronologicalLegs(combo, viewMode) {
  const rows = (combo?.legs || []).map((leg, index) => ({ leg, index }));
  return viewMode === "agenda" ? rows.sort((a, b) =>
    (dateValue(a.leg.commence_time) ?? Infinity) - (dateValue(b.leg.commence_time) ?? Infinity) || a.index - b.index) : rows;
}

function explainMarket(leg) {
  const normalized = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const market = normalized(`${leg.market} ${leg.market_label}`), pick = normalized(leg.pick);
  if (/double.?chance/.test(market)) return "Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.";
  if (/draw_no_bet|nul rembourse/.test(market)) return "Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.";
  if (/btts|equipes marquent/.test(market)) return "Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.";
  if (/handicap|spreads/.test(market)) return "Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.";
  if (/total/.test(market) || /moins de|plus de|over|under/.test(pick)) {
    const values = leg.pick.match(/\d+(?:[.,]\d+)?/g);
    const threshold = leg.pick_point ?? (values?.length ? number(values[values.length - 1]) : null);
    if (threshold !== null && threshold % 1 === 0.5) {
      if (/moins de|under/.test(pick)) return `Le total doit rester inférieur à ${formatNumber(threshold)} sur la période couverte par ce marché.`;
      if (/plus de|over/.test(pick)) return `Le total doit dépasser ${formatNumber(threshold)} sur la période couverte par ce marché.`;
    }
    return "Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.";
  }
  if (/vainqueur|victoire|h2h|1x2/.test(market)) return /^(nul|draw|match nul)$/.test(pick)
    ? "La sélection prévoit un match nul sur la période couverte par le marché."
    : `Le moteur retient ${leg.pick} comme vainqueur sur la période couverte par le marché.`;
  return "Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.";
}

function RiskBadge({ label }) {
  if (!label) return null;
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const risk = /risqu|risky/.test(normalized) ? "risky" : /modere|value/.test(normalized) ? "moderate" : /sur|safe/.test(normalized) ? "safe" : "neutral";
  return <span className={`wp3-risk wp3-risk--${risk}`}>{label}</span>;
}

function DateStamp({ value }) {
  const timestamp = dateValue(value);
  if (timestamp === null) return <div className="wp3-date-stamp"><CalendarDays aria-hidden="true" /><span>À confirmer</span></div>;
  const date = new Date(timestamp);
  return <div className="wp3-date-stamp" aria-hidden="true">
    <strong>{new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(date)}</strong>
    <span>{new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date)}</span>
    <b>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date)}</b>
  </div>;
}

function SelectionCard({ leg, index, unlocked, now, onUpgrade }) {
  const visible = unlocked && !leg.locked, status = legStatus(leg, now);
  const competition = leg.league || leg.sport_title || "Compétition non communiquée";
  const href = leg.match_id ? `/app/match/${encodeURIComponent(leg.match_id)}` : null;
  return <article className="wp3-match-card" data-testid={`combo-leg-${leg.match_id || index}`}>
    <div className="wp3-match-top">
      <div className="wp3-selection-number">{String(index + 1).padStart(2, "0")}</div>
      <div className="wp3-match-meta"><p>{competition}</p><div>{leg.country && <span className="wp3-country">{leg.country}</span>}<span><Clock aria-hidden="true" />{dateLabel(leg.commence_time)}</span></div></div>
      {visible && <RiskBadge label={leg.label} />}
    </div>
    {(status === "started" || status === "finished") && <p className="wp3-alert wp3-alert--compact">{status === "finished" ? "Rencontre terminée · actualise le combiné" : "Rencontre commencée · actualise le combiné"}</p>}
    <div className="wp3-fixture">
      <DateStamp value={leg.commence_time} />
      <div className="wp3-team-pair"><p>{leg.home_team || "Équipe non communiquée"}</p><span>contre</span><p>{leg.away_team || "Équipe non communiquée"}</p></div>
    </div>
    {visible ? <>
      <div className="wp3-pick-grid">
        <div className="wp3-pick"><span className="wp3-eyebrow">{leg.market_label || "Pronostic sélectionné"}</span><p>{leg.pick || "Sélection non communiquée"}</p></div>
        <div className="wp3-leg-odds"><span>Cote</span><strong>{formatNumber(leg.pick_odds)}</strong></div>
      </div>
      <div className="wp3-confidence"><span>Confiance du moteur</span><strong>{leg.confidence === null ? "Non communiquée" : `${formatNumber(leg.confidence, 1)} %`}</strong></div>
      <details className="wp3-explanation"><summary><span>Ce que signifie ce pronostic</span><ChevronDown aria-hidden="true" /></summary><div>
        <p>{explainMarket(leg)}</p>
        <p>{leg.confidence === null ? "Aucun score de confiance n’a été communiqué pour cette sélection." : `La confiance de ${formatNumber(leg.confidence, 1)} % est l’indicateur fourni par le moteur ; elle ne constitue pas un taux de réussite observé.`}</p>
      </div></details>
      {href && <Link to={href} className="wp3-match-link">Consulter la rencontre<ArrowRight aria-hidden="true" /></Link>}
    </> : <div className="wp3-locked-pick"><Lock aria-hidden="true" /><div><strong>Le pronostic est réservé aux abonnés</strong><p>Débloque la sélection, son marché et sa cote.</p></div><button type="button" className="wp3-button wp3-button--light" onClick={onUpgrade}>Voir les abonnements<ArrowRight aria-hidden="true" /></button></div>}
  </article>;
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
  const [viewMode, setViewMode] = useState("cards");
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
        const free = TIERS.find((tier) => data[tier.key]?.unlocked_for_free && data[tier.key].legs.length > 0 && !data[tier.key].locked && data[tier.key].legs.every((leg) => !leg.locked));
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
  const freeTier = TIERS.find((item) => combos?.[item.key]?.unlocked_for_free && combos[item.key].legs.length > 0 && !combos[item.key].locked && combos[item.key].legs.every((leg) => !leg.locked));
  const stale = loadedAt !== null && now - loadedAt >= FRESH_FOR_MS;
  const unavailable = activeCombo?.legs.some((leg) => ["started", "finished"].includes(legStatus(leg, now))) || false;
  const canCopy = completeTicket(activeCombo, account, now, loadedAt);
  const orderedLegs = useMemo(() => chronologicalLegs(activeCombo, viewMode), [activeCombo, viewMode]);
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
      <div className="wp3-combos" data-testid="combos-page" data-layout="combos-studio">
        <header className="wp3-hero">
          <div className="wp3-hero-main">
            <p className="wp3-hero-eyebrow"><Layers aria-hidden="true" />WNPULSE · LES COMBINÉS</p>
            <h1>Lis le match.<br /><span>Choisis ton combiné.</span></h1>
            <p className="wp3-hero-description">Trois profils. Chaque rencontre expliquée. Toutes les sélections réunies dans un ticket clair.</p>
            <div className="wp3-hero-meta"><span><Clock aria-hidden="true" />Horaires : {timeZone}</span>{loadedAt !== null && <span>{stale ? "Dernier chargement" : "Actualisé"} à {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(loadedAt))}</span>}</div>
          </div>
          <div className="wp3-hero-side">
            <div className="wp3-hero-profile"><span>Profil sélectionné</span><strong>{tier.label}</strong><p>{activeCombo ? `${activeCombo.legs.length} sélection${activeCombo.legs.length > 1 ? "s" : ""} dans ce ticket` : "Choisis un profil pour explorer ses sélections"}</p></div>
            <button type="button" onClick={() => fetchCombos()} disabled={loading || refreshing || authLoading} className="wp3-button wp3-button--hero" data-testid="refresh-combos-btn"><RefreshCw aria-hidden="true" className={refreshing ? "wp3-spinning" : ""} />{refreshing ? "Actualisation…" : "Actualiser les combinés"}</button>
          </div>
        </header>

        <section className="wp3-profile-section" aria-labelledby="wp3-profiles-title">
          <div className="wp3-section-heading"><div><p className="wp3-eyebrow">01 · Choisis ton profil</p><h2 id="wp3-profiles-title">Quel combiné veux-tu explorer ?</h2></div></div>
          <div className="wp3-profile-grid">
            {TIERS.map((item, index) => {
              const Icon = item.icon, combo = combos?.[item.key], selected = tier.key === item.key;
              const visible = unlockedTier(combo, account, now) && combo.legs.length > 0 && combo.legs.every((leg) => !leg.locked);
              return <button type="button" key={item.key} aria-pressed={selected} onClick={() => chooseTier(item.key)} data-testid={`tier-tab-${item.key}`} className={cn("wp3-profile", `wp3-profile--${item.accent}`, selected && "wp3-profile--selected")}>
                <div className="wp3-profile-top"><span className="wp3-profile-icon"><Icon aria-hidden="true" /></span><span className="wp3-profile-index">0{index + 1}</span>{selected && <Check aria-hidden="true" className="wp3-selected-check" />}</div>
                <div className="wp3-profile-title"><strong>{item.label}</strong>{combo?.unlocked_for_free && !combo.locked && combo.legs.length > 0 && combo.legs.every((leg) => !leg.locked) && <span className="wp3-free-label">Gratuit</span>}</div>
                <p>{item.description}</p>
                <div className="wp3-profile-stats"><span>{combo ? `${combo.legs.length} sélection${combo.legs.length > 1 ? "s" : ""}` : "Profil à découvrir"}</span><b>{visible ? combo.total_odds !== null ? `Cote ${formatNumber(combo.total_odds)}` : "Cote non fournie" : <>{combo?.legs.length > 0 && <Lock aria-hidden="true" />}{loading ? "En attente" : !combo || !combo.legs.length ? "Indisponible" : "Accès Pro"}</>}</b></div>
              </button>;
            })}
          </div>
          {combos && <details className="wp3-comparison">
            <summary><Scale aria-hidden="true" /><span>Comparer les trois profils</span><ChevronDown aria-hidden="true" /></summary>
            <div className="wp3-compare-grid">{TIERS.map((item) => {
              const combo = combos[item.key], accessible = unlockedTier(combo, account, now) && combo.legs.length > 0 && combo.legs.every((leg) => !leg.locked);
              return <div key={item.key} className="wp3-compare-card"><h3>{item.label}</h3><dl><Metric label="Sélections" value={combo ? combo.legs.length : "Non disponible"} /><Metric label="Cote totale" value={!combo?.legs.length ? "Non disponible" : accessible ? formatNumber(combo.total_odds) : "Réservée"} /><Metric label="Confiance moyenne" value={accessible && combo.avg_confidence !== null ? `${formatNumber(combo.avg_confidence, 1)} %` : "—"} /><Metric label="Probabilité combinée estimée" value={accessible && combo.combined_probability !== null ? `${formatNumber(combo.combined_probability, 1)} %` : "—"} /></dl><button type="button" className="wp3-button wp3-button--light" onClick={() => chooseTier(item.key)}>Explorer ce profil<ArrowRight aria-hidden="true" /></button></div>;
            })}</div><p className="wp3-comparison-note">Les indicateurs proviennent du moteur. La confiance moyenne et la probabilité combinée décrivent deux choses différentes.</p>
          </details>}
        </section>

        {error && <div role="alert" className="wp3-alert"><AlertCircle aria-hidden="true" /><div><p>{error}</p>{combos && <p>La dernière sélection chargée reste affichée.</p>}<button type="button" onClick={() => fetchCombos()} disabled={refreshing} className="wp3-button wp3-button--light">Réessayer</button></div></div>}

        {loading || authLoading ? <section role="status" aria-label="Chargement des combinés" className="wp3-loading"><Loader2 aria-hidden="true" className="wp3-spinning" /><h2>Préparation des sélections</h2><p>Vérification de ton accès et chargement des rencontres…</p><div className="wp3-skeleton-grid"><div /><div /><div /></div></section>
        : accessState === "unauthorized" ? <section className="wp3-state"><Lock aria-hidden="true" /><h2>Ta session doit être renouvelée</h2><p>Reconnecte-toi pour retrouver l’accès correspondant à ton compte.</p><Link to="/login" className="wp3-button wp3-button--primary">Se connecter<ArrowRight aria-hidden="true" /></Link></section>
        : accessState === "locked" ? <section className="wp3-upgrade" data-testid="combos-locked"><div className="wp3-upgrade-icon"><Lock aria-hidden="true" /></div><div><p className="wp3-eyebrow">Les sélections complètes</p><h2>Explore les trois profils avec Pro.</h2><p>Ton accès actuel ne permet pas de consulter ces combinés. Retrouve les rencontres, les marchés et les cotes en découvrant les abonnements disponibles.</p><button type="button" onClick={upgrade} className="wp3-button wp3-button--primary" data-testid="upgrade-from-combos-btn"><Sparkles aria-hidden="true" />Découvrir les abonnements<ArrowRight aria-hidden="true" /></button></div></section>
        : accessState === "error" ? <section className="wp3-state"><AlertCircle aria-hidden="true" /><h2>Les combinés n’ont pas pu être chargés</h2><p>Utilise le bouton Réessayer ci-dessus pour relancer la vérification.</p></section>
        : <>
          {!isPaid && freeTier && <div className="wp3-free-banner" data-testid="free-combo-banner"><Gift aria-hidden="true" /><div><strong>Un combiné gratuit à découvrir</strong><p>Le profil {combos[freeTier.key].label} est accessible avec ton compte.</p></div><button type="button" onClick={() => chooseTier(freeTier.key)} className="wp3-button wp3-button--light" data-testid="see-free-combo-btn">Voir le combiné<ArrowRight aria-hidden="true" /></button></div>}
          {!activeCombo?.legs.length ? <section className="wp3-state"><Layers aria-hidden="true" /><h2>Aucune sélection pour ce profil</h2><p>Le moteur n’a pas fourni de combiné {tier.label.toLowerCase()} pour le moment. Consulte un autre profil ou actualise plus tard.</p></section>
          : <>
            {(stale || unavailable) && <div role="status" className="wp3-alert"><AlertCircle aria-hidden="true" /><p>{unavailable ? "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles." : "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier."}</p></div>}
            <div className="wp3-main">
              <section className={cn("wp3-selections", viewMode === "agenda" && "wp3-agenda")} aria-labelledby="combo-selections-title" data-testid={`combo-legs-${tier.key}`}>
                <div className="wp3-section-heading"><div><p className="wp3-eyebrow">02 · Parcours les rencontres</p><h2 id="combo-selections-title">{viewMode === "agenda" ? "Le programme du combiné" : "Les sélections, une par une"}</h2><p>{activeCombo.legs.length} sélection{activeCombo.legs.length > 1 ? "s" : ""} · Profil {tier.label}</p>{firstStart && <p className="wp3-first-start">Première rencontre : {dateLabel(firstStart)}</p>}</div>
                  <div className="wp3-view-switch" aria-label="Présentation des rencontres"><button type="button" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")}><Layers aria-hidden="true" />Fiches</button><button type="button" aria-pressed={viewMode === "agenda"} onClick={() => setViewMode("agenda")}><CalendarDays aria-hidden="true" />Horaires</button></div>
                </div>
                <a href="#combo-summary" className="wp3-mobile-summary"><span>Cote totale du moteur<strong>{fullAccess ? formatNumber(activeCombo.total_odds) : "Réservée"}</strong></span><span>Voir le ticket<ChevronDown aria-hidden="true" /></span></a>
                <div className="wp3-match-list">{orderedLegs.map(({ leg, index }) => <SelectionCard key={leg.key} leg={leg} index={index} unlocked={unlocked} now={now} onUpgrade={upgrade} />)}</div>
              </section>

              <aside id="combo-summary" className="wp3-sidebar" aria-label="Récapitulatif du combiné">
                <section className="wp3-ticket" data-testid={`bet-slip-${tier.key}`}>
                  <header><p className="wp3-eyebrow">03 · Ton ticket</p><h2>Combiné {activeCombo.label}</h2><span>{activeCombo.legs.length} sélection{activeCombo.legs.length > 1 ? "s" : ""} réunies</span></header>
                  <div className="wp3-ticket-rows">{activeCombo.legs.map((leg, index) => <div key={leg.key} className="wp3-ticket-row"><b>{index + 1}</b><div><p>{leg.home_team || "Équipe à confirmer"} <span>contre</span> {leg.away_team || "Équipe à confirmer"}</p><span>{fullAccess && !leg.locked ? leg.pick || "Sélection non communiquée" : "Pronostic réservé"}</span></div></div>)}</div>
                  <div className="wp3-ticket-total"><span>Cote totale du moteur</span><strong className={!fullAccess ? "wp3-reserved" : ""}>{fullAccess ? formatNumber(activeCombo.total_odds) : "Réservée"}</strong><p>{fullAccess ? "Cote fournie avec la sélection ; elle peut évoluer chez le bookmaker." : "Disponible avec les sélections complètes."}</p></div>
                  <div className="wp3-ticket-bottom"><dl><Metric label="Confiance moyenne du moteur" value={fullAccess && activeCombo.avg_confidence !== null ? `${formatNumber(activeCombo.avg_confidence, 1)} %` : "—"} /><Metric label="Probabilité combinée estimée" value={fullAccess && activeCombo.combined_probability !== null ? `${formatNumber(activeCombo.combined_probability, 1)} %` : "—"} /></dl>
                    {fullAccess ? <button type="button" onClick={copyCombo} disabled={!canCopy} className="wp3-button wp3-button--primary" data-testid="copy-combo-btn"><Copy aria-hidden="true" />Copier le ticket</button> : <button type="button" onClick={upgrade} className="wp3-button wp3-button--primary" data-testid="upgrade-combo-btn"><Lock aria-hidden="true" />Débloquer le combiné</button>}
                    {fullAccess && !canCopy && <p className="wp3-copy-help">{stale || unavailable ? "Actualise le combiné avant de copier ses sélections." : "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir."}</p>}
                    {copyNotice && <p role="status" className="wp3-copy-help">{copyNotice}</p>}
                  </div>
                </section>
                {manualCopy && canCopy && <section className="wp3-manual-copy"><div><label htmlFor="combo-manual-copy">Texte du ticket</label><button type="button" onClick={() => setManualCopy("")} aria-label="Fermer le texte à copier"><X aria-hidden="true" /></button></div><textarea id="combo-manual-copy" readOnly value={manualCopy} onFocus={(event) => event.target.select()} /><p>Appuie dans le texte pour le sélectionner.</p></section>}
                <details className="wp3-reading" open><summary><Info aria-hidden="true" /><span>Bien lire le combiné</span><ChevronDown aria-hidden="true" /></summary><div><p>La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.</p><p>La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.</p><p>Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.</p></div></details>
              </aside>
            </div>
          </>}
        </>}
        {refreshing && !loading && <p role="status" className="wp3-refresh-note"><Loader2 aria-hidden="true" className="wp3-spinning" />Vérification des sélections et de ton accès…</p>}
      </div>
    </AppLayout>
  );
}

function Metric({ label, value }) {
  return <div className="wp3-metric"><dt>{label}</dt><dd>{value}</dd></div>;
}
