import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Lock, Sparkles, Info, CalendarDays, Clock, RefreshCw, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const oddsFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function finiteNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function matchTimestamp(value) {
  // Sans fuseau explicite, ne pas inventer une heure locale de coup d'envoi.
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : null;
}

function dayKey(stamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(stamp));
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key).value).join("-");
}

function tomorrowKey(stamp) {
  const today = dayKey(stamp);
  return new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function kickoffLabels(stamp) {
  if (stamp === null) return null;
  const date = new Date(stamp);
  return {
    date: new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date),
  };
}

function probabilityDetails(bet) {
  const rawOdds = finiteNumber(bet.pick_odds);
  const odds = rawOdds !== null && rawOdds > 1 ? rawOdds : null;
  const rawProbability = finiteNumber(bet.our_prob);
  const probability = rawProbability !== null && rawProbability >= 0 && rawProbability <= 100 ? rawProbability : null;
  // Seuil implicite calculé à partir de la cote réellement affichée.
  const implied = odds === null ? null : 100 / odds;
  const edge = probability === null || implied === null ? null : probability - implied;
  return { odds, probability, implied, edge };
}

function marketExplanation(bet) {
  const pick = String(bet.pick || "");
  const text = `${bet.market || ""} ${bet.market_label || ""} ${pick}`.toLowerCase();
  if (/double.chance/.test(text)) return "La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.";
  if (/draw_no_bet|nul rembours/.test(text)) return "La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.";
  if (/btts|équipes marquent/.test(text)) return "Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.";
  if (/handicap|spreads/.test(text)) return "Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.";
  if (/total|plus de|moins de/.test(text)) {
    const threshold = pick.match(/(plus|moins) de\s+(\d+(?:[.,]\d+)?)/i);
    if (threshold) return `La sélection porte sur un total ${threshold[1].toLowerCase() === "plus" ? "supérieur" : "inférieur"} à ${threshold[2].replace(".", ",")} pour les buts ou points et la période indiqués dans le marché. Le vainqueur peut être différent de l’équipe favorite.`;
    return "Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.";
  }
  if (/h2h|vainqueur|1x2|victoire/.test(text)) return /nul|draw/i.test(pick)
    ? "Le pronostic porte sur un match nul pendant la période indiquée par le marché."
    : `Le pronostic porte sur la victoire de ${pick || "l’équipe indiquée"}, selon la période et les règles du marché.`;
  return "La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.";
}

function readBets(payload) {
  if (!payload || !Array.isArray(payload.bets)) throw new Error("Invalid value bets response");
  return payload.bets.filter(bet => bet && typeof bet === "object" && !Array.isArray(bet));
}

function filterBets(bets, dateFilter, sortOrder, now) {
  const selectedDay = dateFilter === "today" ? dayKey(now) : dateFilter === "tomorrow" ? tomorrowKey(now) : null;
  return bets.filter(bet => {
    const stamp = matchTimestamp(bet.commence_time || bet.start_time);
    if (stamp !== null && stamp <= now) return false;
    return selectedDay === null || (stamp !== null && dayKey(stamp) === selectedDay);
  }).sort((a, b) => {
    const aTime = matchTimestamp(a.commence_time || a.start_time) ?? Infinity;
    const bTime = matchTimestamp(b.commence_time || b.start_time) ?? Infinity;
    if (sortOrder === "date") return aTime - bTime || 0;
    const aEdge = probabilityDetails(a).edge ?? -Infinity;
    const bEdge = probabilityDetails(b).edge ?? -Infinity;
    return (bEdge - aEdge || 0) || (aTime - bTime || 0);
  });
}

function metric(value, suffix = " %") {
  return value === null ? "Non communiqué" : `${numberFormat.format(value)}${suffix}`;
}

function ValueBetCard({ bet }) {
  const kickoff = kickoffLabels(matchTimestamp(bet.commence_time || bet.start_time));
  const { odds, probability, implied, edge } = probabilityDetails(bet);
  const positive = edge !== null && edge > 0;
  return (
    <Card className="min-w-0 overflow-hidden border-neutral-200 bg-white" data-testid="value-bet-card">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 break-words">{bet.sport_title || "Compétition non communiquée"}</p>
            {bet.country && <p className="mt-1 text-xs text-slate-500">{bet.country}</p>}
          </div>
          <Badge className={positive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}>
            {edge === null ? "Écart non communiqué" : `${positive ? "+" : ""}${numberFormat.format(edge)} points`}
          </Badge>
        </div>
        <h2 className="mt-4 break-words font-heading text-xl font-extrabold leading-snug text-slate-900">
          {bet.home_team || "Équipe domicile"}<span className="mx-2 font-normal text-slate-400">vs</span>{bet.away_team || "Équipe extérieure"}
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
          {kickoff ? <>
            <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />{kickoff.date}</span>
            <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 shrink-0" aria-hidden="true" />{kickoff.time}</span>
          </> : <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" aria-hidden="true" />Date et heure à confirmer</span>}
        </div>
        <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
          <p className="text-xs font-semibold text-slate-600">{bet.market_label || "Marché non communiqué"}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 break-words text-base font-bold text-orange-700">{bet.pick || "Sélection non communiquée"}</p>
            <span className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800">Cote <strong className="ml-1 font-mono text-lg">{odds === null ? "—" : oddsFormat.format(odds)}</strong></span>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-600">Estimation WinPulse</dt><dd className="mt-1 font-mono text-base font-bold text-slate-900">{metric(probability)}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-600">Probabilité implicite de la cote</dt><dd className="mt-1 font-mono text-base font-bold text-slate-900">{metric(implied)}</dd></div>
        </dl>
        <details className="group mt-5 border-t border-neutral-100 pt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
            Comprendre ce pronostic<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">
            <p>{marketExplanation(bet)}</p>
            {edge !== null ? <p>WinPulse affiche une estimation de <strong>{metric(probability)}</strong>. La cote de <strong>{oddsFormat.format(odds)}</strong> correspond à <strong>{metric(implied)}</strong> en probabilité implicite : l’écart est de <strong>{metric(edge, " points")}</strong>. {positive ? "Cela signale une opportunité possible si l’estimation est fiable." : "Ces chiffres ne montrent pas d’avantage positif à cette cote."}</p> : <p>Il manque une cote ou une probabilité valide pour expliquer l’écart de cette sélection.</p>}
            <p className="text-xs text-slate-500">L’écart de probabilité n’est pas un pourcentage de gain. Les cotes évoluent et l’estimation peut être erronée. Pour un marché avec remboursement, la probabilité implicite ne décrit pas à elle seule toutes les issues de règlement.</p>
          </div>
        </details>
      </div>
    </Card>
  );
}

export default function ValueBetsPage() {
  const { user, loading: authLoading = false } = useAuth();
  const [now, setNow] = useState(Date.now);
  const [request, setRequest] = useState({ key: null, status: "idle", bets: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [dateFilter, setDateFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("edge");
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });
  const tier = String(user?.subscription || user?.subscription_tier || "free").trim().toLowerCase();
  const expiry = matchTimestamp(user?.subscription_expires_at);
  const isFree = !user || (!user.is_admin && (tier === "free" || (expiry !== null && expiry <= now)));
  const accessKey = `${user?.id || "guest"}:${tier}:${Boolean(user?.is_admin)}:${isFree}`;
  const current = request.key === accessKey ? request : { status: "loading", bets: [] };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (authLoading || isFree) return;
    const controller = new AbortController();
    let active = true;
    setRequest({ key: accessKey, status: "loading", bets: [] });
    api.get("/value-bets", { signal: controller.signal, timeout: 15_000 })
      .then(({ data }) => {
        const bets = readBets(data);
        if (active) setRequest({ key: accessKey, status: "ready", bets });
      })
      .catch(error => {
        if (!active || controller.signal.aborted) return;
        const status = error?.response?.status;
        setRequest({ key: accessKey, status: status === 403 ? "locked" : "error", bets: [],
          message: status === 401 ? "Ta session a expiré. Reconnecte-toi pour consulter les sélections." : "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.",
          sessionExpired: status === 401 });
      });
    return () => { active = false; controller.abort(); };
  }, [authLoading, isFree, accessKey, reloadKey]);

  const visibleBets = useMemo(() => filterBets(current.bets, dateFilter, sortOrder, now), [current.bets, dateFilter, sortOrder, now]);
  const startedCount = current.bets.filter(bet => {
    const start = matchTimestamp(bet.commence_time || bet.start_time);
    return start !== null && start <= now;
  }).length;
  const locked = isFree || current.status === "locked";

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-600"><Target className="h-4 w-4" aria-hidden="true" />Détecteur de value bets</div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Des opportunités à examiner</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">Retrouve la rencontre, son horaire, le marché conseillé et les chiffres qui expliquent chaque sélection.</p>
          </div>
          {!authLoading && !locked && <Button variant="outline" onClick={() => setReloadKey(value => value + 1)} disabled={current.status === "loading"} data-testid="value-bets-refresh"><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Actualiser</Button>}
        </div>

        <Card className="mb-6 border-orange-200 bg-orange-50/40 p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
            <div className="text-sm leading-relaxed text-slate-700">
              <p>Une <strong>value bet</strong> est une sélection dont la probabilité estimée dépasse le seuil implicite de la cote. L’écart, appelé <strong>edge</strong>, est exprimé ici en <strong>points de probabilité</strong>. Il dépend de la fiabilité de l’estimation.</p>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer font-semibold text-orange-800">Voir un exemple de calcul</summary>
                <p className="mt-2 rounded-lg border border-orange-100 bg-white p-3 text-xs leading-relaxed">Exemple hypothétique, pour un pari sans remboursement : à cote 2,00, le seuil implicite est 50 %. Si la probabilité réelle était 60 %, l’écart serait de 10 points et le rendement moyen théorique serait de 20 % (0,60 × 2 − 1). Cela ne garantit aucun gain et suppose une estimation correcte.</p>
              </details>
            </div>
          </div>
        </Card>

        {authLoading || (!locked && current.status === "loading") ? (
          <div className="grid gap-5 md:grid-cols-2" role="status" aria-label="Chargement des sélections"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
        ) : locked ? (
          <Card className="border-dashed border-orange-200 bg-white p-8 text-center" data-testid="value-bets-locked">
            <Lock className="mx-auto mb-3 h-10 w-10 text-orange-500" aria-hidden="true" />
            <h2 className="mb-2 font-heading text-2xl font-extrabold text-slate-900">Les value bets sont réservés à Pro</h2>
            <p className="mx-auto mb-5 max-w-xl text-sm leading-relaxed text-slate-600">Accède aux rencontres, dates, marchés et explications des sélections avec ton abonnement Pro.</p>
            {user ? <Button className="wp-gradient-warm border-0 text-white" data-testid="upgrade-value-bets-btn" onClick={() => setPayState({ isOpen: true, tier: "PRO" })}><Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />Découvrir l’offre Pro</Button> : <Button asChild className="wp-gradient-warm border-0 text-white"><Link to="/register">Créer mon compte</Link></Button>}
          </Card>
        ) : current.status === "error" ? (
          <Card className="border-amber-200 bg-white p-8 text-center" role="alert">
            <p className="mb-4 text-sm text-slate-700">{current.message}</p>
            {current.sessionExpired ? <Button asChild variant="outline"><Link to="/login">Se reconnecter</Link></Button> : <Button variant="outline" onClick={() => setReloadKey(value => value + 1)}>Réessayer</Button>}
          </Card>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900" aria-live="polite">{visibleBets.length} sélection{visibleBets.length === 1 ? "" : "s"} affichée{visibleBets.length === 1 ? "" : "s"}</p>
                <p className="mt-1 break-words text-xs text-slate-500">Horaires dans ton fuseau : {TIME_ZONE}.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="text-xs font-semibold text-slate-600">Date<select className="mt-1 block min-h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal text-slate-800" value={dateFilter} onChange={event => setDateFilter(event.target.value)}><option value="all">Toutes les dates à venir</option><option value="today">Aujourd’hui</option><option value="tomorrow">Demain</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Tri<select className="mt-1 block min-h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal text-slate-800" value={sortOrder} onChange={event => setSortOrder(event.target.value)}><option value="edge">Écart estimé décroissant</option><option value="date">Date et heure</option></select></label>
              </div>
            </div>
            {startedCount > 0 && <p className="mb-4 text-xs text-slate-500">{startedCount} sélection{startedCount === 1 ? "" : "s"} dont le match a déjà commencé {startedCount === 1 ? "n’est" : "ne sont"} plus proposée{startedCount === 1 ? "" : "s"} ici.</p>}
            {!visibleBets.length ? <Card className="border-neutral-200 bg-white p-10 text-center"><p className="font-semibold text-slate-800">{dateFilter === "all" ? "Aucune sélection à venir disponible pour le moment." : "Aucune sélection disponible pour cette date."}</p><p className="mt-2 text-sm text-slate-500">{dateFilter === "all" ? "Reviens plus tard ou actualise les données." : "Essaie toutes les dates à venir."}</p>{dateFilter !== "all" && <Button variant="outline" className="mt-4" onClick={() => setDateFilter("all")}>Voir toutes les dates</Button>}</Card> : <div className="grid gap-5 md:grid-cols-2" data-testid="value-bets-list">{visibleBets.map((bet, index) => <ValueBetCard key={`${bet.match_id || bet.id || `${bet.home_team}-${bet.away_team}`}:${bet.commence_time || bet.start_time || "unknown"}:${bet.market_label}:${bet.pick}:${index}`} bet={bet} />)}</div>}
          </>
        )}
        <p className="mt-6 text-xs leading-relaxed text-slate-500">Les estimations ne garantissent aucun résultat. Vérifie les cotes et les règles du marché avant utilisation. 18+.</p>
      </div>
      {user && <PaymentModal isOpen={payState.isOpen} onClose={() => setPayState(state => ({ ...state, isOpen: false }))} targetTier={payState.tier} />}
    </AppLayout>
  );
}
