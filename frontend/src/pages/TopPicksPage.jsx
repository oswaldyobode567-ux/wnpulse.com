import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Flame, Info, Lock, Radio, RefreshCw, Sparkles, Target, Trophy } from "lucide-react";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import PaymentModal from "@/components/payment/PaymentModal";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { AdminShareProvider, AdminShareToolbar, AdminShareActions } from "@/components/MatchCard";
const BET_FILTERS = [{
  key: "all",
  label: "Tous"
}, {
  key: "Vainqueur",
  label: "🏆 Victoire"
}, {
  key: "Double chance",
  label: "🔄 Double chance"
}, {
  key: "over_2_5",
  label: "📈 Over 2.5"
}, {
  key: "BTTS",
  label: "🎯 BTTS"
}, {
  key: "Handicap",
  label: "⚖️ Handicap"
}, {
  key: "Over/Under",
  label: "⚽ Over/Under"
}];
function matchesBetFilter(pick, filterKey) {
  if (filterKey === "all") return true;
  const label = (pick?.market_label || "").toLowerCase();
  const pickStr = (pick?.pick || "").toLowerCase();
  switch (filterKey) {
    case "Vainqueur":
      return label.includes("vainqueur") || label.includes("1x2") || label.includes("h2h");
    case "Double chance":
      return label.includes("double");
    case "over_2_5":
      return label.includes("over") && (pickStr.includes("2.5") || pickStr.includes("over 2"));
    case "BTTS":
      return label.includes("btts") || label.includes("les deux") || label.includes("both");
    case "Handicap":
      return label.includes("handicap") || label.includes("spread");
    case "Over/Under":
      return label.includes("over") || label.includes("under") || label.includes("total");
    default:
      return true;
  }
}
function marketColor(label = "") {
  const l = label.toLowerCase();
  if (l.includes("over") && l.includes("2.5")) return "bg-blue-100 text-blue-700 border-blue-200";
  if (l.includes("btts") || l.includes("les deux")) return "bg-purple-100 text-purple-700 border-purple-200";
  if (l.includes("double")) return "bg-teal-100 text-teal-700 border-teal-200";
  if (l.includes("handicap")) return "bg-amber-100 text-amber-700 border-amber-200";
  if (l.includes("over") || l.includes("under")) return "bg-indigo-100 text-indigo-700 border-indigo-200";
  return "bg-orange-100 text-orange-700 border-orange-200";
}
export default function TopPicksPage() {
  const i18n = useResultsLanguage();
  const {
    user
  } = useAuth();
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [betFilter, setBetFilter] = useState("all");
  const [payState, setPayState] = useState({
    isOpen: false,
    tier: "PRO"
  });
  const isFree = !user?.subscription_tier || user.subscription_tier === "free";
  const isAdmin = Boolean(user?.is_admin);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    api.get("/predictions/top").then(response => {
      if (active) setPicks(Array.isArray(response.data) ? response.data : []);
    }).catch(() => {
      if (active) {
        setPicks([]);
        setError(true);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  const filtered = useMemo(() => picks.filter(pick => matchesBetFilter(pick, betFilter)), [picks, betFilter]);
  const visibleCount = picks.filter(pick => !pick.locked && Boolean(pick.pick)).length;
  const lockedCount = picks.length - visibleCount;
  const liveCount = picks.filter(pick => pick.is_live).length;
  return <AppLayout><AdminShareProvider isAdmin={isAdmin} items={loading || error ? [] : filtered} kind="picks"><main className="wp-top mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8" lang={i18n.language} dir={i18n.direction}>
    <style>{`.wp-top{font-size:16px}.wp-top .wp-pick-in{animation:wp-pick-in .35s ease-out both}@keyframes wp-pick-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.wp-top .wp-pick-in{animation:none}}.wp-top a:focus-visible,.wp-top button:focus-visible{outline:3px solid #fb923c;outline-offset:3px}`}</style>
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-8 lg:p-10" aria-labelledby="top-picks-title">
      <div className="pointer-events-none absolute -end-20 -top-16 h-80 w-80 rounded-full bg-orange-500/15 blur-3xl" aria-hidden="true" />
      <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-end"><div>
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-300/25 bg-orange-400/10 px-3 py-2 text-xs font-bold tracking-wide text-orange-200"><Trophy className="h-4 w-4" />{i18n.t("LA SÉLECTION DU MOTEUR")}</div>
        <h1 id="top-picks-title" className="font-heading text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">{i18n.t("Les picks à la une.")}<br /><span className="text-orange-300">{i18n.t("Chaque détail compte.")}</span></h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">{i18n.t("Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.")}</p>
      </div><div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[[picks.length, "Sélections", Trophy], [visibleCount, "Accessibles", CheckCircle2], [liveCount, "En direct", Radio]].map(([value, label, Icon]) => <div key={label} className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-4"><Icon className="mb-3 h-4 w-4 text-orange-300" /><strong className="font-mono text-3xl font-bold">{loading ? "—" : i18n.formatNumber(value)}</strong><span className="mt-2 block break-words text-[11px] leading-5 text-slate-300 sm:text-xs">{i18n.t(label)}</span></div>)}
      </div></div>
    </section>
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="top-market-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="top-market-heading" className="font-heading text-lg font-extrabold text-slate-900">{i18n.t("Quel marché t’intéresse ?")}</h2><p className="mt-1 text-sm text-slate-500">{i18n.t("Le classement du moteur est conservé dans chaque filtre.")}</p></div><button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50" data-testid="top-refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{i18n.t("Actualiser")}</button></div>
      <div className="flex flex-wrap gap-2" aria-label={i18n.t("Filtrer par marché")}>{BET_FILTERS.map(filter => <button key={filter.key} type="button" aria-pressed={betFilter === filter.key} onClick={() => setBetFilter(filter.key)} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${betFilter === filter.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-orange-300"}`}>{i18n.tx(filter.label)}<span className={`rounded-md px-1.5 py-0.5 font-mono text-xs ${betFilter === filter.key ? "bg-white/15" : "bg-slate-100"}`}>{loading ? "—" : i18n.formatNumber(filter.key === "all" ? picks.length : picks.filter(pick => matchesBetFilter(pick, filter.key)).length)}</span></button>)}</div>
    </section>
    {!loading && isFree && lockedCount > 0 && <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:flex-row sm:items-center" data-testid="upgrade-banner-top"><div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 shrink-0 text-orange-600" /><div><h2 className="text-base font-extrabold text-slate-900">{i18n.t("{{count}} sélections à débloquer", {
                count: lockedCount
              })}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{i18n.t("Les détails réservés aux abonnés sont accessibles avec Pro.")}</p></div></div><Link to="/app/abonnement" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white hover:bg-orange-700" data-testid="upgrade-cta-top">{i18n.t("Découvrir Pro")}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></div>}
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><h2 className="font-heading text-xl font-extrabold text-slate-900">{i18n.t(betFilter === "all" ? "Le classement du jour" : "Ta sélection de marchés")}</h2><p className="text-sm text-slate-500" aria-live="polite">{!loading && i18n.t("{{count}} pronostics affichés", {
            count: filtered.length
          })}</p></div>
    <AdminShareToolbar />
    {loading ? <div className="grid gap-5 md:grid-cols-2" role="status" aria-label={i18n.t("Chargement…")}>{[0, 1, 2, 3].map(index => <div key={index} className="h-80 animate-pulse rounded-3xl border border-slate-200 bg-white p-5"><div className="mb-8 h-5 w-24 rounded-lg bg-slate-100" /><div className="mb-3 h-7 w-4/5 rounded-lg bg-slate-100" /><div className="mb-8 h-7 w-3/5 rounded-lg bg-slate-100" /><div className="h-24 rounded-2xl bg-slate-100" /></div>)}</div> : error ? <div role="alert" className="rounded-3xl border border-rose-200 bg-white px-6 py-14 text-center"><Info className="mx-auto mb-4 h-9 w-9 text-rose-500" /><h3 className="font-heading text-xl font-extrabold text-slate-900">{i18n.t("Impossible de charger les pronostics.")}</h3><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-5 min-h-11 rounded-xl bg-orange-600 px-5 py-3 font-bold text-white">{i18n.t("Réessayer")}</button></div> : !filtered.length ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Target className="mx-auto mb-4 h-9 w-9 text-slate-300" /><h3 className="font-heading text-xl font-extrabold text-slate-900">{i18n.t("Aucun pick pour ce marché.")}</h3><button type="button" onClick={() => setBetFilter("all")} className="mt-5 min-h-11 rounded-xl border border-slate-200 px-5 py-2 font-bold text-slate-700">{i18n.t("Voir tous les picks")}</button></div> : <div className="grid items-stretch gap-5 md:grid-cols-2" data-testid="top-picks-grid">{filtered.map(pick => <PickCard key={pick.match_id} pick={pick} rank={picks.indexOf(pick) + 1} featured={picks.indexOf(pick) === 0 && !pick.locked && Boolean(pick.pick)} isAdmin={isAdmin} onUpgrade={() => setPayState({
          isOpen: true,
          tier: "PRO"
        })} />)}</div>}
    <p className="mx-auto mt-7 flex max-w-2xl items-start justify-center gap-2 text-center text-xs leading-6 text-slate-500"><Info className="mt-1 h-4 w-4 shrink-0" />{i18n.t("La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.")}</p>
    <PaymentModal isOpen={payState.isOpen} onClose={() => setPayState({
        isOpen: false,
        tier: payState.tier
      })} targetTier={payState.tier} />
  </main></AdminShareProvider></AppLayout>;
}
function PickCard({
  pick,
  rank,
  featured,
  isAdmin,
  onUpgrade
}) {
  const i18n = useResultsLanguage();
  const locked = pick.locked || !pick.pick;
  const confidence = pick.confidence === null || pick.confidence === undefined ? null : Number(pick.confidence);
  const validConfidence = !locked && confidence !== null && Number.isFinite(confidence) && confidence >= 0 && confidence <= 100;
  const risk = {
    safe: "Prudent",
    value: "Modéré",
    risky: "Risqué"
  }[pick.label];
  const odds = pick.pick_odds === null || pick.pick_odds === undefined ? null : Number(pick.pick_odds);
  const target = `/app/match/${pick.match_id}`;
  return <article className={`wp-pick-in flex min-w-0 flex-col overflow-hidden rounded-3xl border bg-white transition-shadow hover:shadow-lg ${featured ? "border-orange-300 md:col-span-2" : locked ? "border-dashed border-slate-300" : "border-slate-200"}`} data-testid={`top-pick-card-${pick.match_id}`}>
    <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 ${featured ? "border-orange-100 bg-orange-50/70" : "border-slate-100 bg-slate-50/60"}`}><div className="flex min-w-0 items-center gap-2"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-mono text-sm font-black ${featured ? "bg-orange-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>#{i18n.formatNumber(rank)}</span><span className="text-xs font-bold text-slate-600">{i18n.t(featured ? "À regarder de près" : "Sélection du moteur")}</span></div><div className="flex flex-wrap items-center gap-2">{pick.is_live && <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-700"><Radio className="h-3.5 w-3.5" />{i18n.t("LIVE")}</span>}{locked ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5 text-xs font-bold text-orange-700"><Lock className="h-3.5 w-3.5" />PRO</span> : risk && <span className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600">{i18n.t(risk)}</span>}</div></header>
    <div className={`flex-1 p-5 sm:p-6 ${featured ? "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-8" : ""}`}>
      <Link to={target} className="block min-w-0 rounded-lg"><div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold leading-5 text-slate-500"><span className="inline-flex items-center gap-1.5"><Flame className="h-3.5 w-3.5 text-orange-500" />{pick.sport_title || "—"}</span><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{i18n.formatPattern(pick.commence_time, "DD/MM HH:mm") || "—"}</span></div><h3 className={`break-words font-heading font-extrabold leading-snug text-slate-900 ${featured ? "text-2xl sm:text-3xl" : "text-2xl"}`}>{pick.home_team || "—"}<span className="my-1 block text-xs font-medium text-slate-400">{i18n.t("vs")}</span>{pick.away_team || "—"}</h3></Link>
      {locked ? <div className="mt-5 rounded-2xl border border-dashed border-orange-200 bg-orange-50/60 p-5"><Lock className="mb-3 h-6 w-6 text-orange-500" /><p className="text-base font-extrabold text-slate-900">{i18n.t("Pronostic verrouillé")}</p><p className="mt-2 text-sm leading-6 text-slate-600">{i18n.t("Consulte les détails de cette sélection avec Pro.")}</p><button type="button" onClick={onUpgrade} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white">{i18n.t("Débloquer")}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></button></div> : <div className={`mt-5 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 sm:p-5 ${featured ? "md:mt-0" : ""}`}><p className="mb-3 text-xs font-bold uppercase tracking-wide text-orange-800"><span className={`inline-flex rounded-md border px-2 py-1 ${marketColor(pick.market_label || "")}`}>{i18n.bet(pick.market_label || "Pronostic")}</span></p><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs text-slate-500">{i18n.t("La sélection")}</p><p className="mt-1 break-words text-lg font-extrabold leading-7 text-slate-900">{i18n.bet(pick.pick)}</p></div><div className="shrink-0 rounded-xl border border-orange-100 bg-white px-3 py-2 text-end"><span className="text-xs text-slate-500">{i18n.t("Cote")}</span><strong className="mt-1 block font-mono text-3xl font-black text-orange-700">{Number.isFinite(odds) && odds > 1 ? i18n.formatNumber(odds, {
                maximumFractionDigits: 2
              }) : "—"}</strong></div></div></div>}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 px-5 py-4 sm:px-6"><div className="min-w-0 flex-1">{validConfidence ? <div className="max-w-xs"><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-500">{i18n.t("Confiance du moteur")}</span><strong className="font-mono text-slate-800">{i18n.formatNumber(confidence, {
                maximumFractionDigits: 0
              })} %</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500" style={{
              width: `${confidence}%`
            }} /></div></div> : <span className="text-xs text-slate-400">{i18n.t(locked ? "Détails réservés aux abonnés" : "Analyse disponible sur la fiche")}</span>}</div><div className="flex items-center gap-2"><Link to={target} aria-label={i18n.t("Voir l’analyse du match")} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"><ChevronRight className="h-5 w-5 rtl:rotate-180" /></Link></div></footer>
    {!locked && <div className="px-5 pb-3 sm:px-6"><AdminShareActions item={pick} isAdmin={isAdmin} /></div>}
  </article>;
}

// Catalogue local : compatible avec le dernier AppLayout, sans fichier annexe.
const RESULTS_MESSAGES = {
  "fr": {
    "Track record": "Track record",
    "Tableau de bord": "Tableau de bord",
    "Retour à l’accueil": "Retour à l’accueil",
    "HISTORIQUE PUBLIC": "HISTORIQUE PUBLIC",
    "Le bilan.": "Le bilan.",
    "Tous les résultats.": "Tous les résultats.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.",
    "Explorer les résultats": "Explorer les résultats",
    "Taux de réussite": "Taux de réussite",
    "réussite": "réussite",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.",
    "Pronostics départagés": "Pronostics départagés",
    "Gagnés et perdus": "Gagnés et perdus",
    "Victoires": "Victoires",
    "Dans le sport sélectionné": "Dans le sport sélectionné",
    "Cote moyenne": "Cote moyenne",
    "Sur les pronostics départagés": "Sur les pronostics départagés",
    "Série en cours": "Série en cours",
    "Victoires consécutives": "Victoires consécutives",
    "Le journal des résultats": "Le journal des résultats",
    "Les derniers résultats en premier.": "Les derniers résultats en premier.",
    "Actualiser": "Actualiser",
    "Filtrer par sport": "Filtrer par sport",
    "Recherche sur cette page": "Recherche sur cette page",
    "Équipe, compétition, pronostic…": "Équipe, compétition, pronostic…",
    "Effacer la recherche": "Effacer la recherche",
    "Résultat": "Résultat",
    "Tous les résultats": "Tous les résultats",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.",
    "Chargement…": "Chargement…",
    "Erreur de chargement": "Erreur de chargement",
    "Réessayer": "Réessayer",
    "Aucun résultat pour ces filtres": "Aucun résultat pour ces filtres",
    "Aucun résultat disponible.": "Aucun résultat disponible.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Essaie une autre recherche ou réinitialise les filtres de cette page.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Les rencontres apparaîtront ici après confirmation de leur résultat.",
    "Réinitialiser les filtres": "Réinitialiser les filtres",
    "Page {{page}} sur {{total}}": "Page {{page}} sur {{total}}",
    "affichés": "affichés",
    "Page précédente": "Page précédente",
    "Page suivante": "Page suivante",
    "Comprendre les statistiques": "Comprendre les statistiques",
    "Résultats par sport": "Résultats par sport",
    "Résultats par niveau de risque": "Résultats par niveau de risque",
    "Et pour les prochaines rencontres ?": "Et pour les prochaines rencontres ?",
    "Consulte les sélections disponibles et leurs explications.": "Consulte les sélections disponibles et leurs explications.",
    "Voir les pronostics": "Voir les pronostics",
    "Créer un compte gratuit": "Créer un compte gratuit",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.",
    "Connexion": "Connexion",
    "Pronostic": "Pronostic",
    "Cote": "Cote",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Marché : {{v0}}",
    "Confiance IA : {{v0}}%": "Confiance IA : {{v0}}%",
    "WhatsApp ouvert": "WhatsApp ouvert",
    "LA SÉLECTION DU MOTEUR": "LA SÉLECTION DU MOTEUR",
    "Les picks à la une.": "Les picks à la une.",
    "Chaque détail compte.": "Chaque détail compte.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.",
    "Quel marché t’intéresse ?": "Quel marché t’intéresse ?",
    "Le classement du moteur est conservé dans chaque filtre.": "Le classement du moteur est conservé dans chaque filtre.",
    "Filtrer par marché": "Filtrer par marché",
    "{{count}} sélections à débloquer": "{{count}} sélections à débloquer",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Les détails réservés aux abonnés sont accessibles avec Pro.",
    "Découvrir Pro": "Découvrir Pro",
    "Le classement du jour": "Le classement du jour",
    "Ta sélection de marchés": "Ta sélection de marchés",
    "{{count}} pronostics affichés": "{{count}} pronostics affichés",
    "Impossible de charger les pronostics.": "Impossible de charger les pronostics.",
    "Aucun pick pour ce marché.": "Aucun pick pour ce marché.",
    "Voir tous les picks": "Voir tous les picks",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.",
    "À regarder de près": "À regarder de près",
    "Sélection du moteur": "Sélection du moteur",
    "LIVE": "LIVE",
    "vs": "vs",
    "Pronostic verrouillé": "Pronostic verrouillé",
    "Consulte les détails de cette sélection avec Pro.": "Consulte les détails de cette sélection avec Pro.",
    "Débloquer": "Débloquer",
    "La sélection": "La sélection",
    "Confiance du moteur": "Confiance du moteur",
    "Détails réservés aux abonnés": "Détails réservés aux abonnés",
    "Analyse disponible sur la fiche": "Analyse disponible sur la fiche",
    "Partager sur WhatsApp (Admin)": "Partager sur WhatsApp (Admin)",
    "Voir l’analyse du match": "Voir l’analyse du match",
    "Prudent": "Prudent",
    "Modéré": "Modéré",
    "Risqué": "Risqué",
    "Gagné": "Gagné",
    "Perdu": "Perdu",
    "Remboursé": "Remboursé",
    "En attente": "En attente",
    "Tous les sports": "Tous les sports",
    "Football": "Football",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Hockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "Impossible de charger les résultats.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.",
    "Sélections": "Sélections",
    "Accessibles": "Accessibles",
    "En direct": "En direct",
    "Date": "Date",
    "Rencontre": "Rencontre",
    "🏆 Victoire": "🏆 Victoire",
    "🔄 Double chance": "🔄 Double chance",
    "📈 Over 2.5": "📈 Over 2.5",
    "🎯 BTTS": "🎯 BTTS",
    "⚖️ Handicap": "⚖️ Handicap",
    "⚽ Over/Under": "⚽ Over/Under",
    "Équipe, championnat, compétition…": "Équipe, championnat, compétition…"
  },
  "en": {
    "Track record": "Track record",
    "Tableau de bord": "Dashboard",
    "Retour à l’accueil": "Back to home",
    "HISTORIQUE PUBLIC": "PUBLIC RECORD",
    "Le bilan.": "The record.",
    "Tous les résultats.": "Every result.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "A clear view of published predictions: wins, losses and refunds, all in one place.",
    "Explorer les résultats": "Explore the results",
    "Taux de réussite": "Win rate",
    "réussite": "win rate",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Refunds are shown separately and excluded from the win rate.",
    "Pronostics départagés": "Graded predictions",
    "Gagnés et perdus": "Wins and losses",
    "Victoires": "Wins",
    "Dans le sport sélectionné": "In the selected sport",
    "Cote moyenne": "Average odds",
    "Sur les pronostics départagés": "Across graded predictions",
    "Série en cours": "Current streak",
    "Victoires consécutives": "Consecutive wins",
    "Le journal des résultats": "The results journal",
    "Les derniers résultats en premier.": "Latest results first.",
    "Actualiser": "Refresh",
    "Filtrer par sport": "Filter by sport",
    "Recherche sur cette page": "Search this page",
    "Équipe, compétition, pronostic…": "Team, competition, prediction…",
    "Effacer la recherche": "Clear search",
    "Résultat": "Result",
    "Tous les résultats": "All results",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "Search and result filters apply only to the displayed page. Statistics remain those of the selected sport.",
    "Chargement…": "Loading…",
    "Erreur de chargement": "Loading error",
    "Réessayer": "Try again",
    "Aucun résultat pour ces filtres": "No results match these filters",
    "Aucun résultat disponible.": "No results available.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Try another search or reset this page's filters.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Matches will appear here once their results are confirmed.",
    "Réinitialiser les filtres": "Reset filters",
    "Page {{page}} sur {{total}}": "Page {{page}} of {{total}}",
    "affichés": "shown",
    "Page précédente": "Previous page",
    "Page suivante": "Next page",
    "Comprendre les statistiques": "Understanding the statistics",
    "Résultats par sport": "Results by sport",
    "Résultats par niveau de risque": "Results by risk level",
    "Et pour les prochaines rencontres ?": "What about the next matches?",
    "Consulte les sélections disponibles et leurs explications.": "Explore available selections and their explanations.",
    "Voir les pronostics": "View predictions",
    "Créer un compte gratuit": "Create a free account",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "Past performance does not guarantee future results. 18+ · Gamble responsibly.",
    "Connexion": "Sign in",
    "Pronostic": "Prediction",
    "Cote": "Odds",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Market: {{v0}}",
    "Confiance IA : {{v0}}%": "Engine confidence: {{v0}}%",
    "WhatsApp ouvert": "WhatsApp opened",
    "LA SÉLECTION DU MOTEUR": "THE ENGINE'S SELECTION",
    "Les picks à la une.": "Picks in the spotlight.",
    "Chaque détail compte.": "Every detail counts.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "The engine's ranked selections, brought together in a clear view to compare markets and open analyses.",
    "Quel marché t’intéresse ?": "Which market interests you?",
    "Le classement du moteur est conservé dans chaque filtre.": "Engine ranking is preserved within each filter.",
    "Filtrer par marché": "Filter by market",
    "{{count}} sélections à débloquer": "{{count}} selections to unlock",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Subscriber-only details are available with Pro.",
    "Découvrir Pro": "Explore Pro",
    "Le classement du jour": "Today's ranking",
    "Ta sélection de marchés": "Your selected markets",
    "{{count}} pronostics affichés": "{{count}} predictions shown",
    "Impossible de charger les pronostics.": "Unable to load predictions.",
    "Aucun pick pour ce marché.": "No picks for this market.",
    "Voir tous les picks": "View all picks",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "Confidence is an engine indicator, not a guarantee. Odds may change.",
    "À regarder de près": "Worth a closer look",
    "Sélection du moteur": "Engine selection",
    "LIVE": "LIVE",
    "vs": "vs",
    "Pronostic verrouillé": "Locked prediction",
    "Consulte les détails de cette sélection avec Pro.": "View this selection's details with Pro.",
    "Débloquer": "Unlock",
    "La sélection": "The selection",
    "Confiance du moteur": "Engine confidence",
    "Détails réservés aux abonnés": "Subscriber-only details",
    "Analyse disponible sur la fiche": "Analysis available on the match page",
    "Partager sur WhatsApp (Admin)": "Share on WhatsApp (Admin)",
    "Voir l’analyse du match": "View match analysis",
    "Prudent": "Cautious",
    "Modéré": "Moderate",
    "Risqué": "Higher risk",
    "Gagné": "Won",
    "Perdu": "LOST",
    "Remboursé": "Refunded",
    "En attente": "Pending",
    "Tous les sports": "All sports",
    "Football": "Football",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Hockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "Unable to load results.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "The Track Record preserves the continuous history of all genuinely settled predictions, including after an engine version change. Past wins, losses and refunds are never hidden.",
    "Sélections": "Selections",
    "Accessibles": "Accessible",
    "En direct": "Live",
    "Date": "Date",
    "Rencontre": "Match",
    "🏆 Victoire": "🏆 Winner",
    "🔄 Double chance": "🔄 Double chance",
    "📈 Over 2.5": "📈 Over 2.5",
    "🎯 BTTS": "🎯 Both teams score",
    "⚖️ Handicap": "⚖️ Handicap",
    "⚽ Over/Under": "⚽ Over/Under",
    "Équipe, championnat, compétition…": "Team, league, competition…"
  },
  "es": {
    "Track record": "Historial de resultados",
    "Tableau de bord": "Panel principal",
    "Retour à l’accueil": "Volver al inicio",
    "HISTORIQUE PUBLIC": "HISTORIAL PÚBLICO",
    "Le bilan.": "El balance.",
    "Tous les résultats.": "Todos los resultados.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "Una visión clara de los pronósticos publicados: aciertos, pérdidas y reembolsos en un mismo lugar.",
    "Explorer les résultats": "Explorar resultados",
    "Taux de réussite": "Tasa de acierto",
    "réussite": "aciertos",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Los reembolsos se muestran por separado y no cuentan en la tasa de acierto.",
    "Pronostics départagés": "Pronósticos decididos",
    "Gagnés et perdus": "Aciertos y pérdidas",
    "Victoires": "Aciertos",
    "Dans le sport sélectionné": "En el deporte elegido",
    "Cote moyenne": "Cuota media",
    "Sur les pronostics départagés": "En pronósticos decididos",
    "Série en cours": "Racha actual",
    "Victoires consécutives": "Victorias consecutivas",
    "Le journal des résultats": "El registro de resultados",
    "Les derniers résultats en premier.": "Los resultados más recientes primero.",
    "Actualiser": "Actualizar",
    "Filtrer par sport": "Filtrar por deporte",
    "Recherche sur cette page": "Buscar en esta página",
    "Équipe, compétition, pronostic…": "Equipo, competición, pronóstico…",
    "Effacer la recherche": "Borrar búsqueda",
    "Résultat": "Resultado",
    "Tous les résultats": "Todos los resultados",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "La búsqueda y el filtro de resultado solo afectan a la página mostrada. Las estadísticas siguen siendo las del deporte seleccionado.",
    "Chargement…": "Cargando…",
    "Erreur de chargement": "Error de carga",
    "Réessayer": "Reintentar",
    "Aucun résultat pour ces filtres": "Ningún resultado coincide con estos filtros",
    "Aucun résultat disponible.": "No hay resultados disponibles.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Prueba otra búsqueda o restablece los filtros de esta página.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Los encuentros aparecerán aquí tras confirmar sus resultados.",
    "Réinitialiser les filtres": "Restablecer filtros",
    "Page {{page}} sur {{total}}": "Página {{page}} de {{total}}",
    "affichés": "mostrados",
    "Page précédente": "Página anterior",
    "Page suivante": "Página siguiente",
    "Comprendre les statistiques": "Entender las estadísticas",
    "Résultats par sport": "Resultados por deporte",
    "Résultats par niveau de risque": "Resultados por nivel de riesgo",
    "Et pour les prochaines rencontres ?": "¿Y los próximos encuentros?",
    "Consulte les sélections disponibles et leurs explications.": "Consulta las selecciones disponibles y sus explicaciones.",
    "Voir les pronostics": "Ver pronósticos",
    "Créer un compte gratuit": "Crear una cuenta gratuita",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "El rendimiento pasado no garantiza resultados futuros. 18+ · Juega con responsabilidad.",
    "Connexion": "Iniciar sesión",
    "Pronostic": "Pronóstico",
    "Cote": "Cuota",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Mercado: {{v0}}",
    "Confiance IA : {{v0}}%": "Confianza del motor: {{v0}} %",
    "WhatsApp ouvert": "WhatsApp abierto",
    "LA SÉLECTION DU MOTEUR": "LA SELECCIÓN DEL MOTOR",
    "Les picks à la une.": "Pronósticos destacados.",
    "Chaque détail compte.": "Cada detalle cuenta.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "Las selecciones clasificadas por el motor, reunidas para comparar mercados y abrir sus análisis.",
    "Quel marché t’intéresse ?": "¿Qué mercado te interesa?",
    "Le classement du moteur est conservé dans chaque filtre.": "Se conserva el orden del motor en cada filtro.",
    "Filtrer par marché": "Filtrar por mercado",
    "{{count}} sélections à débloquer": "{{count}} selecciones por desbloquear",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Los detalles reservados a suscriptores están disponibles con Pro.",
    "Découvrir Pro": "Descubrir Pro",
    "Le classement du jour": "La clasificación del día",
    "Ta sélection de marchés": "Tus mercados seleccionados",
    "{{count}} pronostics affichés": "{{count}} pronósticos mostrados",
    "Impossible de charger les pronostics.": "No se pueden cargar los pronósticos.",
    "Aucun pick pour ce marché.": "Sin selecciones para este mercado.",
    "Voir tous les picks": "Ver todas las selecciones",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "La confianza es un indicador del motor, no una garantía. Las cuotas pueden cambiar.",
    "À regarder de près": "Para mirar de cerca",
    "Sélection du moteur": "Selección del motor",
    "LIVE": "EN DIRECTO",
    "vs": "vs",
    "Pronostic verrouillé": "Pronóstico bloqueado",
    "Consulte les détails de cette sélection avec Pro.": "Consulta los detalles de esta selección con Pro.",
    "Débloquer": "Desbloquear",
    "La sélection": "La selección",
    "Confiance du moteur": "Confianza del motor",
    "Détails réservés aux abonnés": "Detalles para suscriptores",
    "Analyse disponible sur la fiche": "Análisis disponible en la ficha",
    "Partager sur WhatsApp (Admin)": "Compartir en WhatsApp (Admin)",
    "Voir l’analyse du match": "Ver análisis del partido",
    "Prudent": "Prudente",
    "Modéré": "Moderado",
    "Risqué": "Arriesgado",
    "Gagné": "Ganado",
    "Perdu": "PERDIDO",
    "Remboursé": "Reembolsado",
    "En attente": "Pendientes",
    "Tous les sports": "Todos los deportes",
    "Football": "Fútbol",
    "Basketball": "Baloncesto",
    "Tennis": "Tenis",
    "Hockey": "Hockey",
    "Baseball": "Béisbol",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "No se pueden cargar los resultados.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "El historial conserva todos los pronósticos realmente resueltos, incluso tras un cambio de versión del motor. Nunca se ocultan los aciertos, pérdidas ni reembolsos anteriores.",
    "Sélections": "Selecciones",
    "Accessibles": "Accesibles",
    "En direct": "En directo",
    "Date": "Fecha",
    "Rencontre": "Encuentro",
    "🏆 Victoire": "🏆 Ganador",
    "🔄 Double chance": "🔄 Doble oportunidad",
    "📈 Over 2.5": "📈 Más de 2,5",
    "🎯 BTTS": "🎯 Ambos marcan",
    "⚖️ Handicap": "⚖️ Hándicap",
    "⚽ Over/Under": "⚽ Más/Menos",
    "Équipe, championnat, compétition…": "Equipo, liga, competición…"
  },
  "pt": {
    "Track record": "Histórico de resultados",
    "Tableau de bord": "Painel principal",
    "Retour à l’accueil": "Voltar ao início",
    "HISTORIQUE PUBLIC": "HISTÓRICO PÚBLICO",
    "Le bilan.": "O balanço.",
    "Tous les résultats.": "Todos os resultados.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "Uma visão clara dos prognósticos publicados: vitórias, perdas e reembolsos no mesmo lugar.",
    "Explorer les résultats": "Explorar os resultados",
    "Taux de réussite": "Taxa de sucesso",
    "réussite": "sucesso",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Os reembolsos são apresentados separadamente e não contam na taxa de sucesso.",
    "Pronostics départagés": "Prognósticos decididos",
    "Gagnés et perdus": "Vitórias e perdas",
    "Victoires": "Vitórias",
    "Dans le sport sélectionné": "No desporto selecionado",
    "Cote moyenne": "Odd média",
    "Sur les pronostics départagés": "Nos prognósticos decididos",
    "Série en cours": "Série atual",
    "Victoires consécutives": "Vitórias consecutivas",
    "Le journal des résultats": "O registo de resultados",
    "Les derniers résultats en premier.": "Os resultados mais recentes primeiro.",
    "Actualiser": "Atualizar",
    "Filtrer par sport": "Filtrar por desporto",
    "Recherche sur cette page": "Pesquisar nesta página",
    "Équipe, compétition, pronostic…": "Equipa, competição, prognóstico…",
    "Effacer la recherche": "Limpar pesquisa",
    "Résultat": "Resultado",
    "Tous les résultats": "Todos os resultados",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "A pesquisa e o filtro de resultado aplicam-se apenas à página apresentada. As estatísticas continuam a ser do desporto selecionado.",
    "Chargement…": "A carregar…",
    "Erreur de chargement": "Erro de carregamento",
    "Réessayer": "Tentar novamente",
    "Aucun résultat pour ces filtres": "Nenhum resultado corresponde aos filtros",
    "Aucun résultat disponible.": "Não há resultados disponíveis.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Experimenta outra pesquisa ou repõe os filtros desta página.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Os encontros surgirão aqui após confirmação dos resultados.",
    "Réinitialiser les filtres": "Repor filtros",
    "Page {{page}} sur {{total}}": "Página {{page}} de {{total}}",
    "affichés": "apresentados",
    "Page précédente": "Página anterior",
    "Page suivante": "Página seguinte",
    "Comprendre les statistiques": "Compreender as estatísticas",
    "Résultats par sport": "Resultados por desporto",
    "Résultats par niveau de risque": "Resultados por nível de risco",
    "Et pour les prochaines rencontres ?": "E os próximos encontros?",
    "Consulte les sélections disponibles et leurs explications.": "Consulta as seleções disponíveis e as suas explicações.",
    "Voir les pronostics": "Ver prognósticos",
    "Créer un compte gratuit": "Criar uma conta gratuita",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "O desempenho passado não garante resultados futuros. 18+ · Joga com responsabilidade.",
    "Connexion": "Iniciar sessão",
    "Pronostic": "Prognóstico",
    "Cote": "Odd",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Mercado: {{v0}}",
    "Confiance IA : {{v0}}%": "Confiança do motor: {{v0}} %",
    "WhatsApp ouvert": "WhatsApp aberto",
    "LA SÉLECTION DU MOTEUR": "A SELEÇÃO DO MOTOR",
    "Les picks à la une.": "Prognósticos em destaque.",
    "Chaque détail compte.": "Cada detalhe conta.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "As seleções classificadas pelo motor, reunidas para comparar mercados e abrir análises.",
    "Quel marché t’intéresse ?": "Que mercado te interessa?",
    "Le classement du moteur est conservé dans chaque filtre.": "A classificação do motor é mantida em cada filtro.",
    "Filtrer par marché": "Filtrar por mercado",
    "{{count}} sélections à débloquer": "{{count}} seleções por desbloquear",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Os detalhes reservados a subscritores estão disponíveis com Pro.",
    "Découvrir Pro": "Conhecer Pro",
    "Le classement du jour": "A classificação do dia",
    "Ta sélection de marchés": "Os teus mercados selecionados",
    "{{count}} pronostics affichés": "{{count}} prognósticos apresentados",
    "Impossible de charger les pronostics.": "Não foi possível carregar os prognósticos.",
    "Aucun pick pour ce marché.": "Sem seleções para este mercado.",
    "Voir tous les picks": "Ver todas as seleções",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "A confiança é um indicador do motor, não uma garantia. As odds podem mudar.",
    "À regarder de près": "Para ver com atenção",
    "Sélection du moteur": "Seleção do motor",
    "LIVE": "EM DIRETO",
    "vs": "vs",
    "Pronostic verrouillé": "Prognóstico bloqueado",
    "Consulte les détails de cette sélection avec Pro.": "Consulta os detalhes desta seleção com Pro.",
    "Débloquer": "Desbloquear",
    "La sélection": "A seleção",
    "Confiance du moteur": "Confiança do motor",
    "Détails réservés aux abonnés": "Detalhes para subscritores",
    "Analyse disponible sur la fiche": "Análise disponível na ficha",
    "Partager sur WhatsApp (Admin)": "Partilhar no WhatsApp (Admin)",
    "Voir l’analyse du match": "Ver análise do jogo",
    "Prudent": "Prudente",
    "Modéré": "Moderado",
    "Risqué": "Arriscado",
    "Gagné": "Ganho",
    "Perdu": "PERDIDO",
    "Remboursé": "Reembolsado",
    "En attente": "Pendentes",
    "Tous les sports": "Todos os desportos",
    "Football": "Futebol",
    "Basketball": "Basquetebol",
    "Tennis": "Ténis",
    "Hockey": "Hóquei",
    "Baseball": "Basebol",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "Não foi possível carregar os resultados.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "O histórico mantém todos os prognósticos realmente resolvidos, mesmo após mudar a versão do motor. Vitórias, perdas e reembolsos anteriores nunca são ocultados.",
    "Sélections": "Seleções",
    "Accessibles": "Acessíveis",
    "En direct": "Em direto",
    "Date": "Data",
    "Rencontre": "Encontro",
    "🏆 Victoire": "🏆 Vencedor",
    "🔄 Double chance": "🔄 Dupla hipótese",
    "📈 Over 2.5": "📈 Mais de 2,5",
    "🎯 BTTS": "🎯 Ambas marcam",
    "⚖️ Handicap": "⚖️ Handicap",
    "⚽ Over/Under": "⚽ Mais/Menos",
    "Équipe, championnat, compétition…": "Equipa, liga, competição…"
  },
  "de": {
    "Track record": "Ergebnisbilanz",
    "Tableau de bord": "Dashboard",
    "Retour à l’accueil": "Zur Startseite",
    "HISTORIQUE PUBLIC": "ÖFFENTLICHE BILANZ",
    "Le bilan.": "Die Bilanz.",
    "Tous les résultats.": "Alle Ergebnisse.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "Ein klarer Überblick über veröffentlichte Tipps: Gewinne, Verluste und Erstattungen an einem Ort.",
    "Explorer les résultats": "Ergebnisse ansehen",
    "Taux de réussite": "Erfolgsquote",
    "réussite": "Erfolgsquote",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Erstattungen werden separat angezeigt und zählen nicht zur Erfolgsquote.",
    "Pronostics départagés": "Entschiedene Tipps",
    "Gagnés et perdus": "Gewinne und Verluste",
    "Victoires": "Gewinne",
    "Dans le sport sélectionné": "In der gewählten Sportart",
    "Cote moyenne": "Durchschnittsquote",
    "Sur les pronostics départagés": "Bei entschiedenen Tipps",
    "Série en cours": "Aktuelle Serie",
    "Victoires consécutives": "Siege in Folge",
    "Le journal des résultats": "Das Ergebnisjournal",
    "Les derniers résultats en premier.": "Neueste Ergebnisse zuerst.",
    "Actualiser": "Aktualisieren",
    "Filtrer par sport": "Nach Sportart filtern",
    "Recherche sur cette page": "Diese Seite durchsuchen",
    "Équipe, compétition, pronostic…": "Team, Wettbewerb, Tipp…",
    "Effacer la recherche": "Suche löschen",
    "Résultat": "Ergebnis",
    "Tous les résultats": "Alle Ergebnisse",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "Suche und Ergebnisfilter gelten nur für die angezeigte Seite. Die Statistik bezieht sich weiterhin auf die gewählte Sportart.",
    "Chargement…": "Wird geladen…",
    "Erreur de chargement": "Ladefehler",
    "Réessayer": "Erneut versuchen",
    "Aucun résultat pour ces filtres": "Keine Ergebnisse für diese Filter",
    "Aucun résultat disponible.": "Keine Ergebnisse verfügbar.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Versuche eine andere Suche oder setze die Seitenfilter zurück.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Begegnungen erscheinen hier nach Bestätigung ihrer Ergebnisse.",
    "Réinitialiser les filtres": "Filter zurücksetzen",
    "Page {{page}} sur {{total}}": "Seite {{page}} von {{total}}",
    "affichés": "angezeigt",
    "Page précédente": "Vorherige Seite",
    "Page suivante": "Nächste Seite",
    "Comprendre les statistiques": "Statistik verstehen",
    "Résultats par sport": "Ergebnisse nach Sportart",
    "Résultats par niveau de risque": "Ergebnisse nach Risikostufe",
    "Et pour les prochaines rencontres ?": "Und die nächsten Begegnungen?",
    "Consulte les sélections disponibles et leurs explications.": "Sieh dir verfügbare Tipps und ihre Erläuterungen an.",
    "Voir les pronostics": "Tipps ansehen",
    "Créer un compte gratuit": "Kostenloses Konto erstellen",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "Vergangene Leistungen garantieren keine künftigen Ergebnisse. 18+ · Spiele verantwortungsvoll.",
    "Connexion": "Anmelden",
    "Pronostic": "Tipp",
    "Cote": "Quote",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Markt: {{v0}}",
    "Confiance IA : {{v0}}%": "Modellkonfidenz: {{v0}} %",
    "WhatsApp ouvert": "WhatsApp geöffnet",
    "LA SÉLECTION DU MOTEUR": "DIE AUSWAHL DER ENGINE",
    "Les picks à la une.": "Tipps im Fokus.",
    "Chaque détail compte.": "Jedes Detail zählt.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "Die Rangliste der Engine in einer klaren Übersicht zum Vergleichen von Märkten und Öffnen der Analysen.",
    "Quel marché t’intéresse ?": "Welcher Markt interessiert dich?",
    "Le classement du moteur est conservé dans chaque filtre.": "Die Engine-Reihenfolge bleibt in jedem Filter erhalten.",
    "Filtrer par marché": "Nach Markt filtern",
    "{{count}} sélections à débloquer": "{{count}} Tipps freizuschalten",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Abonnenten-Details sind mit Pro verfügbar.",
    "Découvrir Pro": "Pro entdecken",
    "Le classement du jour": "Die heutige Rangliste",
    "Ta sélection de marchés": "Deine gewählten Märkte",
    "{{count}} pronostics affichés": "{{count}} Tipps angezeigt",
    "Impossible de charger les pronostics.": "Tipps konnten nicht geladen werden.",
    "Aucun pick pour ce marché.": "Keine Tipps für diesen Markt.",
    "Voir tous les picks": "Alle Tipps ansehen",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "Die Konfidenz ist ein Engine-Indikator, keine Garantie. Quoten können sich ändern.",
    "À regarder de près": "Einen genaueren Blick wert",
    "Sélection du moteur": "Auswahl der Engine",
    "LIVE": "LIVE",
    "vs": "vs",
    "Pronostic verrouillé": "Gesperrter Tipp",
    "Consulte les détails de cette sélection avec Pro.": "Sieh dir die Details dieses Tipps mit Pro an.",
    "Débloquer": "Freischalten",
    "La sélection": "Der Tipp",
    "Confiance du moteur": "Modellkonfidenz",
    "Détails réservés aux abonnés": "Details für Abonnenten",
    "Analyse disponible sur la fiche": "Analyse auf der Spielseite verfügbar",
    "Partager sur WhatsApp (Admin)": "Auf WhatsApp teilen (Admin)",
    "Voir l’analyse du match": "Spielanalyse ansehen",
    "Prudent": "Vorsichtig",
    "Modéré": "Moderat",
    "Risqué": "Höheres Risiko",
    "Gagné": "Gewonnen",
    "Perdu": "VERLOREN",
    "Remboursé": "Erstattet",
    "En attente": "Ausstehend",
    "Tous les sports": "Alle Sportarten",
    "Football": "Fußball",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Eishockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "Ergebnisse konnten nicht geladen werden.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "Die Bilanz bewahrt den fortlaufenden Verlauf aller tatsächlich entschiedenen Tipps, auch nach einem Engine-Versionswechsel. Frühere Gewinne, Verluste und Erstattungen werden nie verborgen.",
    "Sélections": "Tipps",
    "Accessibles": "Zugänglich",
    "En direct": "Live",
    "Date": "Datum",
    "Rencontre": "Begegnung",
    "🏆 Victoire": "🏆 Sieger",
    "🔄 Double chance": "🔄 Doppelte Chance",
    "📈 Over 2.5": "📈 Über 2,5",
    "🎯 BTTS": "🎯 Beide treffen",
    "⚖️ Handicap": "⚖️ Handicap",
    "⚽ Over/Under": "⚽ Über/Unter",
    "Équipe, championnat, compétition…": "Team, Liga, Wettbewerb…"
  },
  "ar": {
    "Track record": "سجل النتائج",
    "Tableau de bord": "لوحة التحكم",
    "Retour à l’accueil": "العودة إلى الرئيسية",
    "HISTORIQUE PUBLIC": "سجل علني",
    "Le bilan.": "الحصيلة.",
    "Tous les résultats.": "جميع النتائج.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "نظرة واضحة على التوقعات المنشورة: الفوز والخسارة والاسترداد في مكان واحد.",
    "Explorer les résultats": "استعرض النتائج",
    "Taux de réussite": "نسبة النجاح",
    "réussite": "نجاح",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "تُعرض المبالغ المستردة منفصلة ولا تدخل في نسبة النجاح.",
    "Pronostics départagés": "توقعات محسومة",
    "Gagnés et perdus": "الفوز والخسارة",
    "Victoires": "مرات الفوز",
    "Dans le sport sélectionné": "في الرياضة المحددة",
    "Cote moyenne": "متوسط معامل الرهان",
    "Sur les pronostics départagés": "للتوقعات المحسومة",
    "Série en cours": "السلسلة الحالية",
    "Victoires consécutives": "انتصارات متتالية",
    "Le journal des résultats": "سجل النتائج",
    "Les derniers résultats en premier.": "النتائج الأحدث أولًا.",
    "Actualiser": "تحديث",
    "Filtrer par sport": "تصفية حسب الرياضة",
    "Recherche sur cette page": "البحث في هذه الصفحة",
    "Équipe, compétition, pronostic…": "فريق، بطولة، توقع…",
    "Effacer la recherche": "مسح البحث",
    "Résultat": "النتيجة",
    "Tous les résultats": "جميع النتائج",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "يقتصر البحث وتصفية النتائج على الصفحة المعروضة. وتبقى الإحصاءات للرياضة المحددة.",
    "Chargement…": "جارٍ التحميل…",
    "Erreur de chargement": "خطأ في التحميل",
    "Réessayer": "إعادة المحاولة",
    "Aucun résultat pour ces filtres": "لا توجد نتائج تطابق هذه المرشحات",
    "Aucun résultat disponible.": "لا توجد نتائج متاحة.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "جرّب بحثًا آخر أو أعد ضبط مرشحات هذه الصفحة.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "ستظهر المباريات هنا بعد تأكيد نتائجها.",
    "Réinitialiser les filtres": "إعادة ضبط الفلاتر",
    "Page {{page}} sur {{total}}": "الصفحة {{page}} من {{total}}",
    "affichés": "معروضة",
    "Page précédente": "الصفحة السابقة",
    "Page suivante": "الصفحة التالية",
    "Comprendre les statistiques": "فهم الإحصاءات",
    "Résultats par sport": "النتائج حسب الرياضة",
    "Résultats par niveau de risque": "النتائج حسب مستوى المخاطرة",
    "Et pour les prochaines rencontres ?": "وماذا عن المباريات القادمة؟",
    "Consulte les sélections disponibles et leurs explications.": "اطلع على الاختيارات المتاحة وشروحها.",
    "Voir les pronostics": "عرض التوقعات",
    "Créer un compte gratuit": "إنشاء حساب مجاني",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "النتائج السابقة لا تضمن النتائج المستقبلية. +18 · العب بمسؤولية.",
    "Connexion": "تسجيل الدخول",
    "Pronostic": "التوقع",
    "Cote": "المعامل",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "السوق: {{v0}}",
    "Confiance IA : {{v0}}%": "ثقة المحرّك: {{v0}}٪",
    "WhatsApp ouvert": "فُتح واتساب",
    "LA SÉLECTION DU MOTEUR": "اختيارات المحرك",
    "Les picks à la une.": "التوقعات البارزة.",
    "Chaque détail compte.": "كل تفصيل مهم.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "اختيارات المحرك مرتبة في عرض واضح لمقارنة الأسواق وفتح التحليلات.",
    "Quel marché t’intéresse ?": "أي سوق يهمك؟",
    "Le classement du moteur est conservé dans chaque filtre.": "يبقى ترتيب المحرك محفوظًا داخل كل مرشح.",
    "Filtrer par marché": "تصفية حسب السوق",
    "{{count}} sélections à débloquer": "اختيارات لفتحها: {{count}}",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "تفاصيل المشتركين متاحة مع Pro.",
    "Découvrir Pro": "اكتشف Pro",
    "Le classement du jour": "ترتيب اليوم",
    "Ta sélection de marchés": "الأسواق التي اخترتها",
    "{{count}} pronostics affichés": "التوقعات المعروضة: {{count}}",
    "Impossible de charger les pronostics.": "تعذر تحميل التوقعات.",
    "Aucun pick pour ce marché.": "لا توجد اختيارات لهذا السوق.",
    "Voir tous les picks": "عرض جميع الاختيارات",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "الثقة مؤشر من المحرك وليست ضمانًا. قد تتغير المعاملات.",
    "À regarder de près": "يستحق نظرة أقرب",
    "Sélection du moteur": "اختيار المحرك",
    "LIVE": "مباشر",
    "vs": "vs",
    "Pronostic verrouillé": "توقع مقفل",
    "Consulte les détails de cette sélection avec Pro.": "اطلع على تفاصيل هذا الاختيار مع Pro.",
    "Débloquer": "فتح",
    "La sélection": "الاختيار",
    "Confiance du moteur": "ثقة المحرّك",
    "Détails réservés aux abonnés": "التفاصيل للمشتركين",
    "Analyse disponible sur la fiche": "التحليل متاح في صفحة المباراة",
    "Partager sur WhatsApp (Admin)": "المشاركة عبر واتساب (المشرف)",
    "Voir l’analyse du match": "عرض تحليل المباراة",
    "Prudent": "حذر",
    "Modéré": "متوسط",
    "Risqué": "مرتفع المخاطر",
    "Gagné": "ناجح",
    "Perdu": "خاسر",
    "Remboursé": "مسترد",
    "En attente": "قيد الانتظار",
    "Tous les sports": "جميع الرياضات",
    "Football": "كرة القدم",
    "Basketball": "كرة السلة",
    "Tennis": "التنس",
    "Hockey": "الهوكي",
    "Baseball": "البيسبول",
    "MMA": "فنون القتال المختلطة",
    "Impossible de charger les résultats.": "تعذر تحميل النتائج.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "يحفظ سجل النتائج التاريخ المستمر لكل التوقعات المحسومة فعليًا، حتى بعد تغيير إصدار المحرك. ولا تُخفى نتائج الفوز والخسارة والاسترداد السابقة.",
    "Sélections": "الاختيارات",
    "Accessibles": "متاحة لك",
    "En direct": "مباشر",
    "Date": "التاريخ",
    "Rencontre": "المباراة",
    "🏆 Victoire": "🏆 الفائز",
    "🔄 Double chance": "🔄 فرصة مزدوجة",
    "📈 Over 2.5": "📈 أكثر من 2.5",
    "🎯 BTTS": "🎯 تسجيل الفريقين",
    "⚖️ Handicap": "⚖️ هانديكاب",
    "⚽ Over/Under": "⚽ أكثر/أقل",
    "Équipe, championnat, compétition…": "فريق، دوري، بطولة…"
  }
};
function useResultsLanguage() {
  const context = usePageLanguage();
  const current = useRef(context);
  current.current = context;
  return useMemo(() => {
    const translate = (source, values = {}) => {
      const dictionary = RESULTS_MESSAGES[current.current.language] || RESULTS_MESSAGES.fr;
      const message = typeof source === "string" && Object.prototype.hasOwnProperty.call(dictionary, source) ? dictionary[source] : current.current.t(source);
      return message.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => Object.prototype.hasOwnProperty.call(values, key) ? String(typeof values[key] === "number" ? current.current.formatNumber(values[key]) : values[key] ?? "") : placeholder);
    };
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
      t: translate,
      tx(value) {
        return typeof value === "string" ? translate(value) : current.current.tx(value);
      },
      bet(value) {
        return current.current.bet(value);
      },
      formatNumber(...args) {
        return current.current.formatNumber(...args);
      },
      formatPattern(...args) {
        return current.current.formatPattern(...args);
      }
    };
  }, []);
}
