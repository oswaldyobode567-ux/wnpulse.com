import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Lock, Sparkles, Info, CalendarDays, Clock, RefreshCw, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
function numberFormat(i18n) {
  return new Intl.NumberFormat(i18n.locale, {
    maximumFractionDigits: 1
  });
}
function oddsFormat(i18n) {
  return new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
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
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(stamp));
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key).value).join("-");
}
function tomorrowKey(stamp) {
  const today = dayKey(stamp);
  return new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
function kickoffLabels(i18n, stamp) {
  if (stamp === null) return null;
  const date = new Date(stamp);
  return {
    date: new Intl.DateTimeFormat(i18n.locale, {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date),
    time: new Intl.DateTimeFormat(i18n.locale, {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date)
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
  return {
    odds,
    probability,
    implied,
    edge
  };
}
function marketExplanation(i18n, bet) {
  const pick = String(bet.pick || "");
  const text = `${bet.market || ""} ${bet.market_label || ""} ${pick}`.toLowerCase();
  if (/double.chance/.test(text)) return i18n.t("La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.");
  if (/draw_no_bet|nul rembours/.test(text)) return i18n.t("La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.");
  if (/btts|équipes marquent/.test(text)) return i18n.t("Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.");
  if (/handicap|spreads/.test(text)) return i18n.t("Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.");
  if (/total|plus de|moins de/.test(text)) {
    const threshold = pick.match(/(plus|moins) de\s+(\d+(?:[.,]\d+)?)/i);
    if (threshold) return i18n.t("La s\xE9lection porte sur un total {{v0}} \xE0 {{v1}} pour les buts ou points et la p\xE9riode indiqu\xE9s dans le march\xE9. Le vainqueur peut \xEAtre diff\xE9rent de l\u2019\xE9quipe favorite.", {
      v0: threshold[1].toLowerCase() === "plus" ? i18n.t("supérieur") : i18n.t("inférieur"),
      v1: i18n.formatNumber(Number(threshold[2].replace(",", ".")))
    });
    return i18n.t("Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.");
  }
  if (/h2h|vainqueur|1x2|victoire/.test(text)) return /nul|draw/i.test(pick) ? i18n.t("Le pronostic porte sur un match nul pendant la période indiquée par le marché.") : i18n.t("Le pronostic porte sur la victoire de {{v0}}, selon la p\xE9riode et les r\xE8gles du march\xE9.", {
    v0: pick || i18n.t("l’équipe indiquée")
  });
  return i18n.t("La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.");
}
function readBets(payload) {
  if (!payload || !Array.isArray(payload.bets)) throw new Error("Invalid value bets response");
  return payload.bets.filter(bet => bet && typeof bet === "object" && !Array.isArray(bet));
}
function filterBets(bets, dateFilter, sortOrder, now) {
  const selectedDay = dateFilter === "today" ? dayKey(now) : dateFilter === "tomorrow" ? tomorrowKey(now) : null;
  return bets.filter(bet => {
    const stamp = matchTimestamp(bet.commence_time || bet.start_time);
    if (["finished", "cancelled", "canceled"].includes(bet.state) || bet.completed === true) return false;
    return selectedDay === null || stamp !== null && dayKey(stamp) === selectedDay;
  }).sort((a, b) => {
    const aTime = matchTimestamp(a.commence_time || a.start_time) ?? Infinity;
    const bTime = matchTimestamp(b.commence_time || b.start_time) ?? Infinity;
    if (sortOrder === "date") return aTime - bTime || 0;
    const aEdge = probabilityDetails(a).edge ?? -Infinity;
    const bEdge = probabilityDetails(b).edge ?? -Infinity;
    return bEdge - aEdge || 0 || aTime - bTime || 0;
  });
}
function metric(i18n, value, suffix = " %") {
  return value === null ? "Non communiqué" : `${numberFormat(i18n).format(value)}${suffix}`;
}
const RETENTION = {
 fr: ["Sélections conservées jusqu’à la fin ou l’annulation confirmée du match. Les chiffres affichés sont ceux de la détection, pas une garantie de valeur actuelle.", "Actualisation indisponible : les dernières sélections restent affichées.", "Cote à la détection", "À venir", "En direct", "Match commencé · fin à confirmer", "Dernière cote observée", "Cote actuelle non confirmée", "L’avantage initial n’est plus détecté", "Détecté le"],
 en: ["Selections remain until the match is confirmed finished or cancelled. Figures refer to detection, not guaranteed current value.", "Refresh unavailable: previous selections remain visible.", "Odds at detection", "Upcoming", "Live", "Started · finish unconfirmed", "Last observed odds", "Current odds unconfirmed", "Initial edge no longer detected", "Detected on"],
 es: ["Las selecciones se conservan hasta el final o cancelación confirmados. Las cifras corresponden a la detección, no al valor actual garantizado.", "Sin actualización: se mantienen las últimas selecciones.", "Cuota al detectar", "Próximo", "En directo", "Iniciado · final sin confirmar", "Última cuota observada", "Cuota actual sin confirmar", "Ventaja inicial ya no detectada", "Detectado el"],
 pt: ["Seleções mantidas até ao fim ou cancelamento confirmado. Os números são da deteção e não garantem valor atual.", "Atualização indisponível: últimas seleções mantidas.", "Cotação na deteção", "Por começar", "Ao vivo", "Iniciado · fim por confirmar", "Última cotação observada", "Cotação atual não confirmada", "Vantagem inicial já não detetada", "Detetado em"],
 de: ["Auswahlen bleiben bis zum bestätigten Spielende oder zur Absage. Zahlen gelten zum Erkennungszeitpunkt, nicht als Zusage eines aktuellen Vorteils.", "Aktualisierung nicht verfügbar: letzte Auswahlen bleiben sichtbar.", "Quote bei Erkennung", "Bevorstehend", "Live", "Begonnen · Ende unbestätigt", "Zuletzt beobachtete Quote", "Aktuelle Quote unbestätigt", "Ursprünglicher Vorteil nicht mehr erkannt", "Erkannt am"],
 ar: ["تبقى الاختيارات حتى تأكيد نهاية المباراة أو إلغائها. الأرقام تخص وقت الاكتشاف ولا تضمن قيمة حالية.", "التحديث غير متاح: تبقى آخر الاختيارات ظاهرة.", "السعر عند الاكتشاف", "قادمة", "مباشر", "بدأت · النهاية غير مؤكدة", "آخر سعر مرصود", "السعر الحالي غير مؤكد", "لم تعد الأفضلية الأصلية مرصودة", "اكتُشف في"]
};
function retentionCopy(i18n) {
 const code = String(i18n.language || i18n.lang || i18n.locale || "fr").slice(0,2);
 const [retained, stale, original, upcoming, live, started, lastOdds, missing, lostEdge, detected] = RETENTION[code] || RETENTION.fr;
 return {retained, stale, original, upcoming, live, started, lastOdds, missing, lostEdge, detected};
}
function ValueBetCard({
  bet
}) {
  const i18n = usePageLanguage();
  const copy = retentionCopy(i18n);
  const kickoff = kickoffLabels(i18n, matchTimestamp(bet.commence_time || bet.start_time));
  const {
    odds,
    probability,
    implied,
    edge
  } = probabilityDetails(bet);
  const positive = edge !== null && edge > 0;
  return <Card className="min-w-0 overflow-hidden border-neutral-200 bg-white" data-testid="value-bet-card">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 break-words">{i18n.tx(bet.sport_title || "Compétition non communiquée")}</p>
            {i18n.tx(bet.country && <p className="mt-1 text-xs text-slate-500">{i18n.tx(bet.country)}</p>)}
          </div>
          <Badge className={positive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}>
            {i18n.tx(edge === null ? "Écart non communiqué" : i18n.t("{{v0}}{{v1}} points", {
            v0: positive ? "+" : "",
            v1: numberFormat(i18n).format(edge)
          }))}
          </Badge>
        </div>
        <div className="mt-3 text-xs font-semibold text-slate-600">{bet.phase === "live" ? copy.live : matchTimestamp(bet.commence_time) !== null && matchTimestamp(bet.commence_time) <= Date.now() ? copy.started : copy.upcoming}</div>
        <h2 className="mt-4 break-words font-heading text-xl font-extrabold leading-snug text-slate-900">
          {i18n.tx(bet.home_team || "Équipe domicile")}<span className="mx-2 font-normal text-slate-400">{i18n.t("vs")}</span>{i18n.tx(bet.away_team || "Équipe extérieure")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
          {i18n.tx(kickoff ? <>
            <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />{i18n.tx(kickoff.date)}</span>
            <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 shrink-0" aria-hidden="true" />{i18n.tx(kickoff.time)}</span>
          </> : <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" aria-hidden="true" />{i18n.t("Date et heure \xE0 confirmer")}</span>)}
        </div>
        <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
          <p className="text-xs font-semibold text-slate-600">{i18n.tx(bet.market_label || "Marché non communiqué")}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 break-words text-base font-bold text-orange-700">{i18n.tx(bet.pick || "Sélection non communiquée")}</p>
            <span className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800">{i18n.rich(`${bet.historical_quote ? copy.original : i18n.t("Cote")} {{v0}}`, {
              v0: <strong className="ms-1 font-mono text-lg">{i18n.tx(odds === null ? "—" : oddsFormat(i18n).format(odds))}</strong>
            })}</span>
          </div>
        </div>
        {bet.historical_quote && <div className="mt-3 space-y-1 text-xs leading-relaxed text-slate-500">
          {bet.detected_at && <p>{copy.detected} {new Intl.DateTimeFormat(i18n.locale, {dateStyle:"short", timeStyle:"short"}).format(new Date(bet.detected_at))}</p>}
          <p>{bet.quote_available && finiteNumber(bet.current_odds) > 1 ? `${copy.lastOdds} : ${oddsFormat(i18n).format(bet.current_odds)}` : copy.missing}</p>
          {bet.quote_available && !bet.value_currently_detected && <p className="text-amber-700">{copy.lostEdge}</p>}
        </div>}
        <dl className="mt-5 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-600">{i18n.t("Estimation WinPulse")}</dt><dd className="mt-1 font-mono text-base font-bold text-slate-900">{i18n.tx(metric(i18n, probability))}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-600">{i18n.t("Probabilit\xE9 implicite de la cote")}</dt><dd className="mt-1 font-mono text-base font-bold text-slate-900">{i18n.tx(metric(i18n, implied))}</dd></div>
        </dl>
        <details className="group mt-5 border-t border-neutral-100 pt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">{i18n.t("Comprendre ce pronostic")}<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">
            <p>{i18n.tx(marketExplanation(i18n, bet))}</p>
            {i18n.tx(edge !== null ? <p>{i18n.rich("WinPulse affiche une estimation de {{v0}}. La cote de {{v1}} correspond \xE0 {{v2}} en probabilit\xE9 implicite : l\u2019\xE9cart est de {{v3}}. {{v4}}", {
              v0: <strong>{i18n.tx(metric(i18n, probability))}</strong>,
              v1: <strong>{i18n.tx(oddsFormat(i18n).format(odds))}</strong>,
              v2: <strong>{i18n.tx(metric(i18n, implied))}</strong>,
              v3: <strong>{i18n.tx(metric(i18n, edge, " points"))}</strong>,
              v4: i18n.tx(positive ? "Cela signale une opportunité possible si l’estimation est fiable." : "Ces chiffres ne montrent pas d’avantage positif à cette cote.")
            })}</p> : <p>{i18n.t("Il manque une cote ou une probabilit\xE9 valide pour expliquer l\u2019\xE9cart de cette s\xE9lection.")}</p>)}
            <p className="text-xs text-slate-500">{i18n.t("L\u2019\xE9cart de probabilit\xE9 n\u2019est pas un pourcentage de gain. Les cotes \xE9voluent et l\u2019estimation peut \xEAtre erron\xE9e. Pour un march\xE9 avec remboursement, la probabilit\xE9 implicite ne d\xE9crit pas \xE0 elle seule toutes les issues de r\xE8glement.")}</p>
          </div>
        </details>
      </div>
    </Card>;
}
export default function ValueBetsPage() {
  const i18n = usePageLanguage();
  const copy = retentionCopy(i18n);
  const {
    user,
    loading: authLoading = false
  } = useAuth();
  const [now, setNow] = useState(Date.now);
  const [request, setRequest] = useState({
    key: null,
    status: "idle",
    bets: []
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [dateFilter, setDateFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("edge");
  const tier = String(user?.subscription || user?.subscription_tier || "free").trim().toLowerCase();
  const expiry = matchTimestamp(user?.subscription_expires_at);
  const isFree = !user || !user.is_admin && (tier === "free" || expiry !== null && expiry <= now);
  const accessKey = `${user?.id || "guest"}:${tier}:${Boolean(user?.is_admin)}:${isFree}`;
  const current = request.key === accessKey ? request : {
    status: "loading",
    bets: []
  };
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()); if (document.visibilityState === "visible") setReloadKey(value => value + 1); }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (authLoading || isFree) return;
    const controller = new AbortController();
    let active = true;
    setRequest(previous => ({ key: accessKey, status: "loading", bets: previous.key === accessKey ? previous.bets : [] }));
    api.get("/value-bets", {
      signal: controller.signal,
      timeout: 15_000
    }).then(({
      data
    }) => {
      const bets = readBets(data);
      if (active) setRequest({
        key: accessKey,
        status: "ready",
        bets, stale: Boolean(data.stale)
      });
    }).catch(error => {
      if (!active || controller.signal.aborted) return;
      const status = error?.response?.status;
      setRequest(previous => ({
        key: accessKey,
        status: status === 403 ? "locked" : "error",
        bets: status === 401 || status === 403 || previous.key !== accessKey ? [] : previous.bets,
        message: status === 401 ? "Ta session a expiré. Reconnecte-toi pour consulter les sélections." : "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.",
        sessionExpired: status === 401
      }));
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [authLoading, isFree, accessKey, reloadKey]);
  const visibleBets = useMemo(() => filterBets(current.bets, dateFilter, sortOrder, now), [current.bets, dateFilter, sortOrder, now]);
  const locked = isFree || current.status === "locked";
  return <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-600"><Target className="h-4 w-4" aria-hidden="true" />{i18n.t("D\xE9tecteur de value bets")}</div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{i18n.t("Des opportunit\xE9s \xE0 examiner")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{i18n.t("Retrouve la rencontre, son horaire, le march\xE9 conseill\xE9 et les chiffres qui expliquent chaque s\xE9lection.")}</p>
          </div>
          {i18n.tx(!authLoading && !locked && <Button variant="outline" onClick={() => setReloadKey(value => value + 1)} disabled={current.status === "loading"} data-testid="value-bets-refresh"><RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />{i18n.t("Actualiser")}</Button>)}
        </div>

        <Card className="mb-6 border-orange-200 bg-orange-50/40 p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
            <div className="text-sm leading-relaxed text-slate-700">
              <p>{i18n.rich("Une {{v0}} est une s\xE9lection dont la probabilit\xE9 estim\xE9e d\xE9passe le seuil implicite de la cote. L\u2019\xE9cart, appel\xE9 {{v1}}, est exprim\xE9 ici en {{v2}}. Il d\xE9pend de la fiabilit\xE9 de l\u2019estimation.", {
                v0: <strong>{i18n.t("value bet")}</strong>,
                v1: <strong>{i18n.t("edge")}</strong>,
                v2: <strong>{i18n.t("points de probabilit\xE9")}</strong>
              })}</p>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer font-semibold text-orange-800">{i18n.t("Voir un exemple de calcul")}</summary>
                <p className="mt-2 rounded-lg border border-orange-100 bg-white p-3 text-xs leading-relaxed">{i18n.t("Exemple hypoth\xE9tique, pour un pari sans remboursement : \xE0 cote 2,00, le seuil implicite est 50 %. Si la probabilit\xE9 r\xE9elle \xE9tait 60 %, l\u2019\xE9cart serait de 10 points et le rendement moyen th\xE9orique serait de 20 % (0,60 \xD7 2 \u2212 1). Cela ne garantit aucun gain et suppose une estimation correcte.")}</p>
              </details>
            </div>
          </div>
        </Card>

        {i18n.tx(authLoading || !locked && current.status === "loading" && !current.bets.length ? <div className="grid gap-5 md:grid-cols-2" role="status" aria-label={i18n.t("Chargement des sélections")}><Skeleton className="h-80" /><Skeleton className="h-80" /></div> : locked ? <Card className="border-dashed border-orange-200 bg-white p-8 text-center" data-testid="value-bets-locked">
            <Lock className="mx-auto mb-3 h-10 w-10 text-orange-500" aria-hidden="true" />
            <h2 className="mb-2 font-heading text-2xl font-extrabold text-slate-900">{i18n.t("Les value bets sont r\xE9serv\xE9s \xE0 Pro")}</h2>
            <p className="mx-auto mb-5 max-w-xl text-sm leading-relaxed text-slate-600">{i18n.t("Acc\xE8de aux rencontres, dates, march\xE9s et explications des s\xE9lections avec ton abonnement Pro.")}</p>
            {i18n.tx(user ? <Button asChild className="wp-gradient-warm border-0 text-white" data-testid="upgrade-value-bets-btn"><Link to="/app/abonnement"><Sparkles className="me-2 h-4 w-4" aria-hidden="true" />{i18n.t("Découvrir l’offre Pro")}</Link></Button> : <Button asChild className="wp-gradient-warm border-0 text-white"><Link to="/register">{i18n.t("Cr\xE9er mon compte")}</Link></Button>)}
          </Card> : current.status === "error" && !current.bets.length ? <Card className="border-amber-200 bg-white p-8 text-center" role="alert">
            <p className="mb-4 text-sm text-slate-700">{i18n.tx(current.message)}</p>
            {i18n.tx(current.sessionExpired ? <Button asChild variant="outline"><Link to="/login">{i18n.t("Se reconnecter")}</Link></Button> : <Button variant="outline" onClick={() => setReloadKey(value => value + 1)}>{i18n.t("R\xE9essayer")}</Button>)}
          </Card> : <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900" aria-live="polite">{i18n.rich("{{v0}} s\xE9lection{{v1}} affich\xE9e{{v2}}", {
                v0: i18n.tx(visibleBets.length),
                v1: i18n.tx(visibleBets.length === 1 ? "" : "s"),
                v2: i18n.tx(visibleBets.length === 1 ? "" : "s")
              })}</p>
                <p className="mt-1 break-words text-xs text-slate-500">{i18n.rich("Horaires dans ton fuseau : {{v0}}.", {
                v0: i18n.tx(TIME_ZONE)
              })}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="text-xs font-semibold text-slate-600">{i18n.rich("Date{{v0}}", {
                v0: <select className="mt-1 block min-h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal text-slate-800" value={dateFilter} onChange={event => setDateFilter(event.target.value)}><option value="all">{i18n.t("Toutes les dates")}</option><option value="today">{i18n.t("Aujourd\u2019hui")}</option><option value="tomorrow">{i18n.t("Demain")}</option></select>
              })}</label>
                <label className="text-xs font-semibold text-slate-600">{i18n.rich("Tri{{v0}}", {
                v0: <select className="mt-1 block min-h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal text-slate-800" value={sortOrder} onChange={event => setSortOrder(event.target.value)}><option value="edge">{i18n.t("\xC9cart estim\xE9 d\xE9croissant")}</option><option value="date">{i18n.t("Date et heure")}</option></select>
              })}</label>
              </div>
            </div>
            <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">{copy.retained}</p>
            {(current.status === "error" || current.stale) && <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{copy.stale}</p>}
            {i18n.tx(!visibleBets.length ? <Card className="border-neutral-200 bg-white p-10 text-center"><p className="font-semibold text-slate-800">{i18n.tx(dateFilter === "all" ? "Aucune sélection disponible pour le moment." : "Aucune sélection disponible pour cette date.")}</p><p className="mt-2 text-sm text-slate-500">{i18n.tx(dateFilter === "all" ? "Reviens plus tard ou actualise les données." : "Essaie toutes les dates.")}</p>{i18n.tx(dateFilter !== "all" && <Button variant="outline" className="mt-4" onClick={() => setDateFilter("all")}>{i18n.t("Voir toutes les dates")}</Button>)}</Card> : <div className="grid gap-5 md:grid-cols-2" data-testid="value-bets-list">{i18n.tx(visibleBets.map((bet) => <ValueBetCard key={bet.id || `${bet.match_id || `${bet.home_team}-${bet.away_team}`}:${bet.commence_time}:${bet.market}:${bet.pick}:${bet.pick_point}`} bet={bet} />))}</div>)}
          </>)}
        <p className="mt-6 text-xs leading-relaxed text-slate-500">{i18n.t("Les estimations ne garantissent aucun r\xE9sultat. V\xE9rifie les cotes et les r\xE8gles du march\xE9 avant utilisation. 18+.")}</p>
      </div>
    </AppLayout>;
}
