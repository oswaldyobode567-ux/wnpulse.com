import { MatchInsights, TeamBadge, badgeUrl, MarketQuotes } from "@/components/MatchCard";
import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import AppLayout, { StadiumBackdrop, usePageLanguage, FollowPickButton } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Brain, AlertTriangle, Lightbulb, Loader2, Lock, Radio, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";
import { AdminShareActions } from "@/components/MatchCard";

const DISCOVERY_COPY = {
  fr: {title:"Découvre WinPulse : jusqu’à 3 picks gratuits par jour",intro:"Les mêmes sélections pour tous, avec leur explication et leur suivi. Disponibilité selon les rencontres du jour.",pro:"À découvrir avec Pro",reserved:"pronostics réservés actuellement",cta:"Débloquer les pronostics et leurs analyses",offer:"Tu viens de découvrir une analyse WinPulse",offerText:"Accède aux autres sélections et aux marchés analysés inclus dans ton abonnement.",empty:"Les sélections du jour ne sont pas encore disponibles. Reviens un peu plus tard.",error:"Impossible de charger la sélection découverte.",retry:"Réessayer",pending:"Résultat non confirmé",won:"Gagné",lost:"Perdu",void:"Remboursé",count:"sélection(s) disponible(s)",note:"Heures affichées dans ton fuseau. Journée découverte : Africa/Porto-Novo.",noGuarantee:"Aucun gain garanti. Les résultats gagnés et perdus restent visibles.",follow:"Suis ces sélections depuis leur carte pour retrouver leurs résultats.",unavailable:"Aucune sélection exploitable pour cette rencontre actuellement."},
  en: {title:"Discover WinPulse: up to 3 free picks a day",intro:"The same selections for everyone, with explanations and tracking. Subject to today's fixtures.",pro:"Discover with Pro",reserved:"predictions currently reserved",cta:"Unlock predictions and their analysis",offer:"You have explored a WinPulse analysis",offerText:"Access the other selections and analysed markets included in your subscription.",empty:"Today's selections are not available yet. Check back later.",error:"Unable to load the discovery selection.",retry:"Try again",pending:"Result unconfirmed",won:"Won",lost:"Lost",void:"Refunded",count:"selection(s) available",note:"Times shown in your time zone. Discovery day: Africa/Porto-Novo.",noGuarantee:"No guaranteed winnings. Both wins and losses remain visible.",follow:"Follow these selections from their cards to find their results.",unavailable:"No usable selection is currently available for this fixture."},
  es: {title:"Descubre WinPulse: hasta 3 pronósticos gratis al día",intro:"Las mismas selecciones para todos, con explicación y seguimiento. Según los partidos del día.",pro:"Descubre Pro",reserved:"pronósticos reservados actualmente",cta:"Desbloquear pronósticos y análisis",offer:"Has descubierto un análisis WinPulse",offerText:"Accede a las demás selecciones y mercados analizados incluidos en tu suscripción.",empty:"Las selecciones de hoy aún no están disponibles. Vuelve más tarde.",error:"No se pudo cargar la selección gratuita.",retry:"Reintentar",pending:"Resultado sin confirmar",won:"Ganado",lost:"Perdido",void:"Reembolsado",count:"selección(es) disponible(s)",note:"Horarios en tu zona. Día de selección: Africa/Porto-Novo.",noGuarantee:"Sin ganancias garantizadas. Aciertos y pérdidas siguen visibles.",follow:"Sigue las selecciones desde sus tarjetas para consultar los resultados.",unavailable:"No hay ninguna selección disponible para este partido actualmente."},
  pt: {title:"Descobre a WinPulse: até 3 palpites grátis por dia",intro:"As mesmas seleções para todos, com explicação e acompanhamento. Conforme os jogos do dia.",pro:"Descobre o Pro",reserved:"palpites reservados atualmente",cta:"Desbloquear palpites e análises",offer:"Acabaste de descobrir uma análise WinPulse",offerText:"Acede às outras seleções e mercados analisados incluídos na tua subscrição.",empty:"As seleções de hoje ainda não estão disponíveis. Volta mais tarde.",error:"Não foi possível carregar a seleção gratuita.",retry:"Tentar novamente",pending:"Resultado não confirmado",won:"Ganho",lost:"Perdido",void:"Reembolsado",count:"seleção(ões) disponível(is)",note:"Horários no teu fuso. Dia de seleção: Africa/Porto-Novo.",noGuarantee:"Sem ganhos garantidos. Ganhos e perdas continuam visíveis.",follow:"Segue as seleções nos cartões para consultar os resultados.",unavailable:"Não existe uma seleção disponível para este jogo neste momento."},
  de: {title:"WinPulse entdecken: bis zu 3 kostenlose Tipps täglich",intro:"Dieselben Tipps für alle, mit Erklärung und Ergebnisverfolgung. Abhängig von den heutigen Spielen.",pro:"Mit Pro entdecken",reserved:"derzeit reservierte Tipps",cta:"Tipps und Analysen freischalten",offer:"Du hast eine WinPulse-Analyse entdeckt",offerText:"Erhalte die weiteren Tipps und analysierten Märkte deines Abonnements.",empty:"Die heutigen Tipps sind noch nicht verfügbar. Schau später wieder vorbei.",error:"Die kostenlose Auswahl konnte nicht geladen werden.",retry:"Erneut versuchen",pending:"Ergebnis unbestätigt",won:"Gewonnen",lost:"Verloren",void:"Erstattet",count:"verfügbare Tipps",note:"Zeiten in deiner Zeitzone. Auswahltag: Africa/Porto-Novo.",noGuarantee:"Keine garantierten Gewinne. Gewinne und Verluste bleiben sichtbar.",follow:"Verfolge die Tipps über ihre Karten, um Ergebnisse zu sehen.",unavailable:"Für dieses Spiel ist derzeit kein nutzbarer Tipp verfügbar."},
  ar: {title:"اكتشف WinPulse: حتى 3 توقعات مجانية يوميًا",intro:"اختيارات موحدة للجميع مع الشرح والمتابعة، حسب مباريات اليوم.",pro:"اكتشف اشتراك Pro",reserved:"توقعات متاحة للمشتركين حاليًا",cta:"افتح التوقعات وتحليلاتها",offer:"لقد اكتشفت تحليلًا من WinPulse",offerText:"اطلع على الاختيارات الأخرى والأسواق المحللة ضمن اشتراكك.",empty:"اختيارات اليوم غير متاحة بعد. عد لاحقًا.",error:"تعذر تحميل الاختيارات المجانية.",retry:"إعادة المحاولة",pending:"النتيجة غير مؤكدة",won:"فائز",lost:"خاسر",void:"مسترد",count:"اختيارات متاحة",note:"الأوقات بتوقيتك المحلي. يوم الاختيارات: Africa/Porto-Novo.",noGuarantee:"لا توجد أرباح مضمونة. تبقى النتائج الفائزة والخاسرة ظاهرة.",follow:"تابع الاختيارات من بطاقاتها لعرض نتائجها.",unavailable:"لا يوجد توقع متاح لهذه المباراة حاليًا."}
};
function discoveryCopy(language) { return DISCOVERY_COPY[language] || DISCOVERY_COPY.fr; }
const DETAIL_VISUAL_COPY = {
  fr: {riskTitle:"Point de vigilance", risk:"Les cotes et les estimations peuvent évoluer. Vérifie la période et les règles de règlement du marché ; aucun résultat n’est garanti.", source:"Les statistiques ci-dessous sont affichées uniquement lorsqu’elles sont disponibles."},
  en: {riskTitle:"What to watch", risk:"Odds and estimates can change. Check the market period and settlement rules; no outcome is guaranteed.", source:"The statistics below are shown only when available."},
  es: {riskTitle:"Punto de atención", risk:"Las cuotas y estimaciones pueden cambiar. Comprueba el periodo y las reglas del mercado; ningún resultado está garantizado.", source:"Las estadísticas siguientes solo se muestran cuando están disponibles."},
  pt: {riskTitle:"Ponto de atenção", risk:"As cotas e estimativas podem mudar. Confirma o período e as regras do mercado; nenhum resultado é garantido.", source:"As estatísticas abaixo só são apresentadas quando disponíveis."},
  de: {riskTitle:"Worauf du achten solltest", risk:"Quoten und Schätzungen können sich ändern. Prüfe Zeitraum und Marktregeln; kein Ergebnis ist garantiert.", source:"Die folgenden Statistiken werden nur angezeigt, wenn sie verfügbar sind."},
  ar: {riskTitle:"نقطة انتباه", risk:"قد تتغير المعاملات والتقديرات. تحقق من فترة السوق وقواعد التسوية؛ لا توجد نتيجة مضمونة.", source:"تُعرض الإحصاءات أدناه فقط عند توفرها."}
};

function discoveryEvent(event, surface) {
  api.post("/discovery/events", { event, surface }).catch(() => {});
}


function analysisPayload(response) {
  const value = response?.ai_analysis ?? response?.analysis;
  if (typeof value === "string" && value.trim()) {
    return {
      verdict: value.trim(),
      key_factors: [],
      source: "unknown"
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const verdict = typeof value.verdict === "string" ? value.verdict : typeof value.summary === "string" ? value.summary : "";
  const factors = Array.isArray(value.key_factors) ? value.key_factors.filter(item => typeof item === "string" && item.trim()) : [];
  if (!verdict.trim() && !factors.length) return null;
  return {
    ...value,
    verdict,
    key_factors: factors,
    risk_alert: typeof value.risk_alert === "string" ? value.risk_alert : "",
    alternative_bet: typeof value.alternative_bet === "string" ? value.alternative_bet : ""
  };
}
function readableNumber(i18n, value, suffix = "") {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return "Non communiqué";
  const number = Number(value);
  return Number.isFinite(number) ? `${new Intl.NumberFormat(i18n.locale, {
    maximumFractionDigits: 1
  }).format(number)}${suffix}` : "Non communiqué";
}
function pickExplanation(i18n, prediction) {
  const pick = String(prediction?.pick || "");
  const market = `${prediction?.market || ""} ${prediction?.market_label || ""} ${pick}`.toLowerCase();
  if (/double.chance/.test(market)) return i18n.t("Cette sélection couvre deux issues du match : celles indiquées dans le pronostic. Elle ne désigne pas nécessairement un vainqueur unique.");
  if (/draw_no_bet|nul rembours/.test(market)) return i18n.t("L’équipe indiquée doit gagner. Si la rencontre se termine sur un nul, la mise est remboursée selon les règles du marché.");
  if (/btts|équipes marquent/.test(market)) return i18n.t("Le pronostic porte sur le fait que les deux équipes marquent ou non pendant la période indiquée par le marché.");
  if (/handicap|spreads/.test(market)) return i18n.t("Le résultat est évalué après application du handicap indiqué dans la sélection. La période et les règles de règlement du bookmaker sont à vérifier.");
  if (/total|plus de|moins de/.test(market)) return i18n.t("La s\xE9lection \xAB {{v0}} \xBB porte sur le total de buts ou de points pour les \xE9quipes et la p\xE9riode indiqu\xE9es par le march\xE9. Elle ne d\xE9pend pas uniquement du vainqueur de la rencontre.", {
    v0: pick
  });
  if (/h2h|vainqueur|1x2|victoire/.test(market)) return /nul|draw/i.test(pick) ? i18n.t("La sélection prévoit un match nul pendant la période indiquée par le marché.") : i18n.t("La s\xE9lection pr\xE9voit la victoire de {{v0}}, selon la p\xE9riode et les r\xE8gles du march\xE9.", {
    v0: pick
  });
  return i18n.t("La s\xE9lection \xAB {{v0}} \xBB d\xE9crit l\u2019\xE9v\xE9nement attendu dans le march\xE9 indiqu\xE9. V\xE9rifie la p\xE9riode et les r\xE8gles de r\xE8glement du bookmaker.", {
    v0: pick
  });
}
export default function MatchDetailPage() {
  const i18n = usePageLanguage();
  const {
    matchId
  } = useParams();
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const [responseState, setResponseState] = useState({ owner: null, data: null });
  const owner = user?.id || "anonymous";
  const data = responseState.owner === owner ? responseState.data : null;
  const [analysis, setAnalysis] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const analysisRequest = useRef(null);
  const [payState, setPayState] = useState({
    isOpen: false,
    tier: "PRO"
  });
  const isAdmin = Boolean(user?.is_admin);
  const freeWords = discoveryCopy(i18n.language);
  const detailWords = DETAIL_VISUAL_COPY[i18n.language] || DETAIL_VISUAL_COPY.fr;
  useEffect(() => {
    if (data?.prediction?.free_daily_pick && !data.prediction.locked && user?.id) discoveryEvent("analysis_view", "match_detail");
  }, [data, user?.id]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    analysisRequest.current?.abort();
    analysisRequest.current = null;
    setResponseState({ owner: user?.id || "anonymous", data: null });
    setAnalysis(null);
    setAnalysisError("");
    setMatchError("");
    setLoadingAnalysis(false);
    setLoadingMatch(true);
    api.get(`/matches/${encodeURIComponent(matchId)}`, {
      signal: controller.signal,
      timeout: 15_000
    }).then(r => {
      if (active) setResponseState({ owner: user?.id || "anonymous", data: r.data });
    }).catch(error => {
      if (!active || controller.signal.aborted) return;
      setMatchError(error?.response?.status === 404 ? "Cette rencontre n’est plus disponible dans les matchs actuels." : "La rencontre ne peut pas être chargée pour le moment. Réessaie depuis le dashboard.");
    }).finally(() => {
      if (active) setLoadingMatch(false);
    });
    return () => {
      active = false;
      controller.abort();
      analysisRequest.current?.abort();
      analysisRequest.current = null;
    };
  }, [matchId, user?.id]);
  const fetchAnalysis = async () => {
    if (analysisRequest.current) return;
    const controller = new AbortController();
    analysisRequest.current = controller;
    setAnalysisError("");
    setLoadingAnalysis(true);
    try {
      const {
        data: a
      } = await api.get(`/matches/${encodeURIComponent(matchId)}/analysis`, {
        signal: controller.signal,
        timeout: 20_000,
        params: { lang: i18n.language || "fr" }
      });
      if (controller.signal.aborted || analysisRequest.current !== controller) return;
      const content = analysisPayload(a);
      if (!content) throw new Error("EMPTY_ANALYSIS");
      setAnalysis(content);
    } catch (e) {
      if (controller.signal.aborted || analysisRequest.current !== controller) return;
      setAnalysisError(e?.response?.status === 403 ? "Le serveur réserve cette analyse à Pro. L’explication du pronostic reste disponible ci-dessus." : "L’explication complémentaire est indisponible pour le moment. Les informations du pronostic restent affichées.");
    } finally {
      if (analysisRequest.current === controller) {
        analysisRequest.current = null;
        if (!controller.signal.aborted) setLoadingAnalysis(false);
      }
    }
  };
  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/app");
    }
  };
  if (loadingMatch) {
    return <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </AppLayout>;
  }
  if (!data) {
    return <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-8"><p role="alert">{i18n.tx(matchError || "Match introuvable.")}</p><Button asChild variant="outline" className="mt-4"><Link to="/app">{i18n.t("Retour au dashboard")}</Link></Button></div>
      </AppLayout>;
  }
  const p = data.prediction || {};
  const locked = p.locked || !p.pick;
  const labelColor = {
    safe: "bg-emerald-50 border-emerald-200",
    value: "bg-amber-50 border-amber-200",
    risky: "bg-rose-50 border-rose-200"
  }[p.label] || "bg-orange-50 border-orange-200";
  const isPaid = Boolean(user?.is_admin || user && String(user.subscription || user.subscription_tier || "free").toLowerCase() !== "free");
  return <AppLayout>
      <div className="wp-match-detail min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 [overflow-wrap:anywhere]">
        <button onClick={handleBack} className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" data-testid="back-link">
          <ChevronLeft className="h-4 w-4" />{i18n.t("Retour")}</button>
        {/* Match header */}
        <Card className={`wp-detail-header relative mb-5 overflow-hidden rounded-3xl border-slate-200 bg-gradient-to-br from-white via-white to-orange-50 p-5 shadow-sm sm:p-9 ${data.is_live ? "ring-2 ring-rose-500/40" : ""}`} data-testid="match-header"><StadiumBackdrop/><div className="wp-detail-header-content">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-600">
              <Badge variant="outline" className="max-w-full whitespace-normal break-words bg-white font-semibold">{i18n.tx(data.sport_title)}</Badge>
              <span>·</span>
              <span>{i18n.formatPattern(data.commence_time, "dddd D MMM · HH:mm")}</span>
            </div> {i18n.tx(data.is_live && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider animate-pulse" data-testid="match-live-badge">
                <Radio className="h-3 w-3" />{i18n.t("LIVE")}</span>)}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-center sm:items-center sm:gap-5">
            <div className="text-center">
              <div className="mb-3 flex justify-center"><TeamBadge name={data.home_team} src={badgeUrl(data,"home")} size="large" /></div><div className="break-words font-heading text-base font-extrabold leading-6 text-slate-900 sm:text-xl">{data.home_team}</div>
              <div className="text-xs text-slate-500 mt-1">{i18n.t("Domicile")}</div>
            </div>
            <div className="text-center">
              <div className="mt-5 grid h-10 w-10 place-items-center rounded-full border border-orange-100 bg-white text-xs font-extrabold text-slate-400 sm:mt-0 sm:h-12 sm:w-12">{i18n.t("VS")}</div>
            </div>
            <div className="text-center">
              <div className="mb-3 flex justify-center"><TeamBadge name={data.away_team} src={badgeUrl(data,"away")} size="large" /></div><div className="break-words font-heading text-base font-extrabold leading-6 text-slate-900 sm:text-xl">{data.away_team}</div>
              <div className="text-xs text-slate-500 mt-1">{i18n.t("Ext\xE9rieur")}</div>
            </div>
          </div>
          </div>
        </Card>
        <div className="wp-detail-grid"><aside className="wp-detail-pick" id="match-prediction">
        {/* Prediction summary */}
        {i18n.tx(!p.pick && !p.locked ? <Card className="mb-6 p-5 text-sm text-slate-600" data-testid="prediction-unavailable">{freeWords.unavailable}</Card> : locked ? <Card className="border border-dashed border-orange-300 bg-gradient-to-br from-orange-50 to-rose-50 p-6 mb-6" data-testid="prediction-locked">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl wp-gradient-warm grid place-items-center text-white flex-shrink-0">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-orange-700 font-bold mb-1">{i18n.t("Pronostic verrouill\xE9")}</div>
                  <div className="font-heading text-xl font-extrabold text-slate-900">{i18n.t("Passe Pro pour voir le pick complet")}</div>
                  <div className="text-sm text-slate-700 mt-1">{freeWords.offerText}</div>
                </div>
              </div>
            </div>
            <Button className="wp-gradient-warm text-white border-0 hover:opacity-90" data-testid="upgrade-cta-match" onClick={() => setPayState({
          isOpen: true,
          tier: "PRO"
        })}>{i18n.t("D\xE9couvrir l\u2019offre Pro")}<ChevronLeft className="h-4 w-4 ms-2 rotate-180" />
            </Button>
          </Card> : <Card className={`mb-5 rounded-3xl border ${labelColor} p-4 shadow-sm sm:p-6`} data-testid="prediction-summary">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold mb-1 flex items-center gap-2">
                <span>{i18n.t("Pronostic principal")}</span>
                {i18n.tx(p.market_label && <span className="inline-flex items-center rounded-full bg-white border border-orange-200 text-orange-700 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide">
                    {i18n.bet(p.market_label)}
                  </span>)}
              </div>
              <div className="font-heading text-2xl font-extrabold leading-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">
                {i18n.bet(p.pick)}
                <span className="text-slate-500 text-xl font-mono font-semibold ms-2">@ {i18n.tx(p.pick_odds)}</span>
              </div>
            </div>  <ConfidenceBadge label={i18n.tx(p.label)} confidence={p.confidence} size="md" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200/60">
            <Stat label={i18n.t("Bookmakers")} value={p.num_books} />
            <Stat label={i18n.t("Écart estimé")} value={readableNumber(i18n, p.edge, " points")} />
            <Stat label={i18n.t("Estimation du moteur")} value={readableNumber(i18n, p.model_probability ?? p.confidence, " %")} />
            <Stat label={i18n.t("Cote optimale")} value={p.pick_odds} mono />
          </div>
          {i18n.tx(isAdmin && <div className="mt-4 pt-4 border-t border-slate-200/60 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                <strong className="text-slate-700">{i18n.t("Bookmakers utilis\xE9s :")}</strong>{i18n.tx(" ")}
                {i18n.tx((p.bookmakers_used || []).slice(0, 5).map(b => b.title || b.key).join(", ") || "—")}
              </div>
              <AdminShareActions isAdmin={isAdmin} item={{ ...data, prediction: p }} />
            </div>)}
        </Card>)}
        {!locked && <DecisionReport matchId={matchId} owner={owner} match={data} />}
        {i18n.tx(!locked && <Card className="mb-5 rounded-3xl border-orange-200 bg-orange-50/40 p-4 sm:p-6" data-testid="pick-explanation">
          <details><summary className="min-h-11 cursor-pointer py-2 font-heading text-lg font-bold text-slate-900">{i18n.t("Comprendre ce pronostic")}</summary>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
            <p>{i18n.tx(pickExplanation(i18n, p))}</p>
            <p>{i18n.t("Le moteur compare les march\xE9s et les cotes disponibles pour classer les s\xE9lections. L\u2019estimation affich\xE9e est un indicateur calcul\xE9 ; elle ne garantit pas le r\xE9sultat du match.")}</p>
            {i18n.tx(p.num_books != null && <p>{i18n.rich("Nombre de bookmakers annonc\xE9 pour cette analyse : {{v0}}. Cote de la s\xE9lection : {{v1}}.", {
              v0: <strong>{i18n.tx(readableNumber(i18n, p.num_books))}</strong>,
              v1: <strong>{i18n.tx(readableNumber(i18n, p.pick_odds))}</strong>
            })}</p>)}
            {i18n.tx(p.reasoning?.real_data_used ? <p>{i18n.t("Des statistiques externes sont disponibles pour compl\xE9ter cette analyse. Leur d\xE9tail figure plus bas.")}</p> : <p>{i18n.t("Les informations disponibles ne permettent pas ici d\u2019ajouter une analyse v\xE9rifi\xE9e de la forme des \xE9quipes ou des absences.")}</p>)}
          </div>
        </details></Card>)}
        {!locked && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="match-risk-note">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div><h2 className="text-sm font-extrabold text-amber-950">{detailWords.riskTitle}</h2><p className="mt-1 text-sm leading-6 text-amber-900">{detailWords.risk}</p></div>
        </div>}
        <div className="mb-2 text-sm leading-6 text-slate-500">{detailWords.source}</div>
        </aside><section className="wp-detail-analysis" id="match-statistics">
        <MatchInsights key={`${owner}:${matchId}`} match={data} />
        {!locked && p.free_daily_pick && <Card className="mb-6 space-y-3 rounded-2xl border-orange-200 bg-gradient-to-br from-slate-950 to-slate-900 p-5 text-white" data-testid="free-analysis-upgrade">
          <h2 className="font-heading text-lg font-bold">{freeWords.offer}</h2>
          <p className="text-sm leading-6 text-slate-200">{freeWords.offerText}</p>
          <FollowPickButton matchId={matchId} pick={p.pick} market={p.market} disabled={p.is_live || p.is_finished} />
          <Button className="h-auto min-h-11 w-full whitespace-normal bg-orange-600 px-4 py-3 text-white hover:bg-orange-700 sm:w-auto" onClick={()=>{discoveryEvent("upgrade_click", "match_detail");setPayState({isOpen:true,tier:"PRO"});}}>{freeWords.cta}</Button>
        </Card>}
        {/* All markets analyzed (Pro feature) */}
        {i18n.tx(!locked && p.markets && p.markets.length > 1 && <Card className="bg-white border-neutral-200 p-6 mb-6" data-testid="all-markets-card">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-rose-600" />
              <h2 className="font-heading text-lg font-bold text-slate-900">{i18n.t("Tous les march\xE9s analys\xE9s")}</h2>
              <span className="text-xs text-slate-500">({i18n.tx(p.markets.length)})</span>
            </div>
            <div className="space-y-2">
              {i18n.tx(p.markets.map((m, i) => {
            const labelCls = m.label === "safe" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : m.label === "value" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200";
            return <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                        <span className="bg-slate-900 text-white px-1.5 rounded">{i18n.bet(m.market_label)}</span>
                        <span>{i18n.rich("\xB7 {{v0}} books", {
                      v0: i18n.tx(m.num_books)
                    })}</span>
                        {i18n.tx(m.edge > 0 && <span className="text-emerald-600">{i18n.rich("\xB7 edge +{{v0}}%", {
                      v0: i18n.tx(m.edge)
                    })}</span>)}
                      </div>
                      <div className="font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]">
                        {i18n.bet(m.pick)} <span className="text-slate-400 font-normal font-mono text-sm ms-1">@ {i18n.tx(m.pick_odds)}</span>
                      </div>
                    </div>   <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${labelCls}`}>
                      {i18n.tx(m.confidence)}%
                    </span>
                  </div>;
          }))}
            </div>
          </Card>)}
        {/* AI Analysis */}
        {i18n.tx(!locked && <Card className="bg-white border-slate-200 p-6 mb-6" data-testid="ai-analysis-card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-orange-600" />
              <h2 className="font-heading text-lg font-bold text-slate-900">{i18n.t("Explication compl\xE9mentaire")}</h2>
            </div>
            {i18n.tx(!analysis && !locked && <Button size="sm" className="wp-gradient-warm text-white border-0 hover:opacity-90" onClick={fetchAnalysis} disabled={loadingAnalysis} data-testid="run-analysis-btn">
                {i18n.tx(loadingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : analysisError ? "Réessayer" : "Enrichir l’explication")}
              </Button>)}
          </div>
          {i18n.tx(!analysis && !loadingAnalysis && <div className="text-sm text-slate-500">{i18n.rich("Demande une pr\xE9sentation compl\xE9mentaire des \xE9l\xE9ments disponibles. Selon la configuration du service, le texte peut \xEAtre r\xE9dig\xE9 avec l\u2019aide d\u2019une IA ou par le moteur statistique.{{v0}}", {
            v0: i18n.tx(!isPaid && <div className="mt-3 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <Lock className="h-4 w-4" />
                  <span className="text-xs">{i18n.rich("Certaines analyses compl\xE9mentaires sont r\xE9serv\xE9es \xE0 Pro. {{v0}}.", {
                  v0: <Link to="/app/abonnement" className="font-semibold underline">{i18n.t("D\xE9couvrir l\u2019offre Pro")}</Link>
                })}</span>
                </div>)
          })}
            </div>)}
          {i18n.tx(analysisError && <p className="mb-3 text-sm text-amber-800" role="alert">{i18n.tx(analysisError)}</p>)}
          {i18n.tx(analysis && <div className="space-y-4" data-testid="analysis-content">
{i18n.tx(i18n.language !== "fr" && <p className="text-xs leading-relaxed text-slate-500">{i18n.t("Le texte libre fourni par le serveur reste affich\xE9 dans sa langue d\u2019origine.")}</p>)}
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-4">
                <div className="text-xs uppercase tracking-wider text-orange-700 font-bold mb-1">{i18n.t("Verdict")}</div>
                <div className="text-sm text-slate-900 font-medium">{i18n.tx(analysis.verdict)}</div>
              </div>
              {i18n.tx(analysis.key_factors?.length > 0 && <div>
                  <div className="text-xs uppercase tracking-wider text-slate-600 font-bold mb-2">{i18n.t("Facteurs cl\xE9s")}</div>
                  <ul className="space-y-1.5">
                    {i18n.tx(analysis.key_factors.map((f, i) => <li key={i} className="text-sm text-slate-700 flex gap-2">
                        <span className="text-orange-600 font-bold">·</span>
                        <span>{i18n.tx(f)}</span>
                      </li>))}
                  </ul>
                </div>)}
              {i18n.tx(analysis.risk_alert && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-rose-900">{i18n.tx(analysis.risk_alert)}</div>
                </div>)}
              {i18n.tx(analysis.alternative_bet && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex gap-2">
                  <Lightbulb className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-emerald-900">
                    <span className="font-semibold">{i18n.t("Alternative :")}</span>{i18n.tx(analysis.alternative_bet)}
                  </div>
                </div>)}
              <div className="text-[10px] text-slate-400 pt-2">{i18n.rich("Source : {{v0}}", {
              v0: i18n.tx(["gemini", "anthropic", "openai"].includes(analysis.source) ? i18n.t("R\xE9daction assist\xE9e par IA ({{v0}})", {
                v0: analysis.source === "gemini" ? "Gemini" : analysis.source === "anthropic" ? "Claude" : "OpenAI"
              }) : analysis.source === "unknown" || !analysis.source ? "Source non précisée par le service" : "Moteur statistique")
            })}
              </div>
            </div>)}
        </Card>)}
        {!locked && <MarketQuotes match={data} />}
        </section></div>
      </div>
      <PaymentModal isOpen={payState.isOpen} onClose={() => setPayState({
      isOpen: false,
      tier: payState.tier
    })} targetTier={payState.tier} />
    </AppLayout>;
}
function Stat({ label, value, mono }) {
  const i18n = usePageLanguage();
  return <div className="min-w-0">
    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{i18n.tx(label)}</div>
    <div className={`break-words font-bold text-slate-900 ${mono ? "font-mono" : ""}`}>{value == null || value === "" ? "—" : i18n.tx(value)}</div>
  </div>;
}

function ConfidenceBadge({
  label,
  confidence
}) {
  const i18n = usePageLanguage();
  const key = String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const color = /sur|safe/.test(key) ? "bg-green-100 text-green-700 border-green-200" : /modere|value/.test(key) ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-red-100 text-red-700 border-red-200";
  const labels = { fr: ["🟢 PRUDENT", "🟡 MODÉRÉ", "🔴 RISQUÉ"], en: ["🟢 LOWER RISK", "🟡 MODERATE", "🔴 HIGHER RISK"], es: ["🟢 PRUDENTE", "🟡 MODERADO", "🔴 ARRIESGADO"], pt: ["🟢 PRUDENTE", "🟡 MODERADO", "🔴 ARRISCADO"], de: ["🟢 VORSICHTIG", "🟡 MITTEL", "🔴 RISKANT"], ar: ["🟢 حذر", "🟡 متوسط", "🔴 مرتفع المخاطرة"] };
  const words = labels[i18n.language] || labels.fr;
  const text = /sur|safe/.test(key) ? words[0] : /modere|value/.test(key) ? words[1] : words[2];
  return <span className={`inline-flex flex-wrap items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${color}`}>{i18n.tx(text)}{i18n.tx(confidence != null && Number.isFinite(Number(confidence)) && <bdi>{i18n.formatNumber(Number(confidence) / 100, {
        style: "percent",
        maximumFractionDigits: 0
      })}</bdi>)}</span>;
}


const DECISION_COPY = {
  "fr": {
    "title": "La fiche de décision",
    "intro": "Les données qui accompagnent ce choix, leurs limites et leur historique.",
    "evidence": "Données du moteur",
    "cautions": "Points de vigilance",
    "engine_estimate": "Indicateur du moteur : {value} % (non garanti).",
    "source_count": "Bookmakers annoncés par le moteur : {value}.",
    "uncertain_estimate": "Le signal du moteur reste incertain.",
    "few_sources": "Peu de bookmakers annoncés pour cette sélection.",
    "unknown_sources": "Le nombre de sources n’est pas communiqué.",
    "unknown_freshness": "La date de collecte des cotes n’est pas communiquée.",
    "old_odds": "Les cotes disponibles ont plus de 24 heures.",
    "missing_history": "Aucun historique récent vérifié disponible ici.",
    "partial_history": "L’historique récent ne couvre qu’une des deux équipes.",
    "old_history": "Les statistiques disponibles datent de plus de 24 heures.",
    "alwaysRisk": "Une sélection peut perdre, même avec des données complètes.",
    "coverage": "Couverture des données",
    "complete": "Historique des deux équipes",
    "partial": "Historique partiel",
    "unavailable": "Données indisponibles",
    "games": "Matchs observés : domicile {home} · extérieur {away}",
    "collected": "Cotes collectées",
    "source": "Source des statistiques",
    "cohort": "Sélections historiques comparables",
    "basis": "Même compétition, marché, version du moteur, tranche de cote et tranche de confiance, sur les 90 jours précédents.",
    "wins": "Gagnées",
    "losses": "Perdues",
    "voids": "Remboursées",
    "rate": "Taux observé",
    "limited": "Moins de 30 sélections départagées : échantillon limité. Ce taux ne prédit pas l’issue du match.",
    "historical": "Résultats passés, pas une probabilité pour cette rencontre. Plusieurs sélections peuvent concerner un même match.",
    "none": "Aucun résultat comparable exploitable.",
    "frozen": "Première fiche enregistrée avant le coup d’envoi",
    "frozenNote": "Cette copie conserve la cote et l’indicateur lors de la première consultation ; elle n’est pas réécrite lorsque les cotes changent.",
    "notFrozen": "Aucune copie avant-match disponible. La date d’enregistrement n’est jamais reconstituée.",
    "initialOdds": "Cote enregistrée",
    "initialEstimate": "Indicateur enregistré",
    "recorded": "Enregistrée le",
    "result": "Résultat confirmé",
    "won": "Gagné",
    "lost": "Perdu",
    "void": "Remboursé",
    "retry": "Réessayer",
    "error": "La fiche ne peut pas être chargée. Le pronostic et les autres détails restent disponibles.",
    "loading": "Préparation de la fiche…",
    "unknown": "Non communiqué",
    "model": "Version du moteur",
    "contextTitle": "Forme récente observée",
    "contextNote": "Ces statistiques décrivent les matchs observés. Elles ne sont pas nécessairement utilisées par le moteur actuel ; adversaires et périodes peuvent différer.",
    "winsGames": "victoires / matchs",
    "history_against_pick": "Le taux de victoires récent de l’équipe choisie est inférieur à celui de l’adversaire dans les échantillons disponibles."
  },
  "en": {
    "title": "Decision report",
    "intro": "The evidence behind this selection, its limits and its history.",
    "evidence": "Engine data",
    "cautions": "Points to consider",
    "engine_estimate": "Engine indicator: {value}% (not guaranteed).",
    "source_count": "Bookmakers reported by the engine: {value}.",
    "uncertain_estimate": "The engine signal remains uncertain.",
    "few_sources": "Few bookmakers reported for this selection.",
    "unknown_sources": "The source count is not provided.",
    "unknown_freshness": "The odds collection time is not provided.",
    "old_odds": "Available odds are more than 24 hours old.",
    "missing_history": "No verified recent history is available here.",
    "partial_history": "Recent history covers only one team.",
    "old_history": "Available statistics are over 24 hours old.",
    "alwaysRisk": "A selection may lose even with complete data.",
    "coverage": "Data coverage",
    "complete": "History for both teams",
    "partial": "Partial history",
    "unavailable": "Data unavailable",
    "games": "Observed games: home {home} · away {away}",
    "collected": "Odds collected",
    "source": "Statistics source",
    "cohort": "Comparable historical selections",
    "basis": "Same competition, market, engine version, odds band and confidence band over the preceding 90 days.",
    "wins": "Won",
    "losses": "Lost",
    "voids": "Refunded",
    "rate": "Observed win rate",
    "limited": "Fewer than 30 graded selections: limited sample. This rate does not predict this match.",
    "historical": "Past results, not a probability for this fixture. Multiple selections may concern one match.",
    "none": "No usable comparable results.",
    "frozen": "First report recorded before kickoff",
    "frozenNote": "This copy preserves the odds and indicator at the first visit; later odds changes do not rewrite it.",
    "notFrozen": "No pre-match copy available. Recording dates are never reconstructed.",
    "initialOdds": "Recorded odds",
    "initialEstimate": "Recorded indicator",
    "recorded": "Recorded on",
    "result": "Confirmed result",
    "won": "Won",
    "lost": "Lost",
    "void": "Refunded",
    "retry": "Retry",
    "error": "Unable to load this report. The prediction and other details remain available.",
    "loading": "Preparing report…",
    "unknown": "Not provided",
    "model": "Engine version",
    "contextTitle": "Observed recent form",
    "contextNote": "These statistics describe observed games. The current engine may not use them; opponents and periods may differ.",
    "winsGames": "wins / games",
    "history_against_pick": "The selected team has a lower recent win rate than its opponent in the available samples."
  },
  "es": {
    "title": "Ficha de decisión",
    "intro": "Datos que acompañan la selección, sus límites e historial.",
    "evidence": "Datos del motor",
    "cautions": "Puntos de atención",
    "engine_estimate": "Indicador del motor: {value}% (sin garantía).",
    "source_count": "Casas indicadas por el motor: {value}.",
    "uncertain_estimate": "La señal del motor sigue siendo incierta.",
    "few_sources": "Pocas casas indicadas para esta selección.",
    "unknown_sources": "No se indica el número de fuentes.",
    "unknown_freshness": "No se indica cuándo se recogieron las cuotas.",
    "old_odds": "Las cuotas disponibles tienen más de 24 horas.",
    "missing_history": "No hay historial reciente verificado disponible.",
    "partial_history": "El historial reciente solo cubre un equipo.",
    "old_history": "Las estadísticas tienen más de 24 horas.",
    "alwaysRisk": "Una selección puede perder incluso con datos completos.",
    "coverage": "Cobertura de datos",
    "complete": "Historial de ambos equipos",
    "partial": "Historial parcial",
    "unavailable": "Datos no disponibles",
    "games": "Partidos observados: local {home} · visitante {away}",
    "collected": "Cuotas recogidas",
    "source": "Fuente estadística",
    "cohort": "Selecciones históricas comparables",
    "basis": "Misma competición, mercado, versión del motor, rango de cuota y confianza en los 90 días anteriores.",
    "wins": "Ganadas",
    "losses": "Perdidas",
    "voids": "Reembolsadas",
    "rate": "Tasa observada",
    "limited": "Menos de 30 selecciones evaluadas: muestra limitada. No predice este partido.",
    "historical": "Resultados pasados, no una probabilidad para este partido. Puede haber varias selecciones del mismo encuentro.",
    "none": "No hay resultados comparables utilizables.",
    "frozen": "Primera ficha registrada antes del inicio",
    "frozenNote": "Conserva la cuota y el indicador de la primera consulta, sin reescribirlos cuando cambian las cuotas.",
    "notFrozen": "No hay copia previa al partido. Nunca se reconstruye la fecha.",
    "initialOdds": "Cuota registrada",
    "initialEstimate": "Indicador registrado",
    "recorded": "Registrada el",
    "result": "Resultado confirmado",
    "won": "Ganado",
    "lost": "Perdido",
    "void": "Reembolsado",
    "retry": "Reintentar",
    "error": "No se pudo cargar la ficha. El pronóstico y otros detalles siguen disponibles.",
    "loading": "Preparando ficha…",
    "unknown": "No indicado",
    "model": "Versión del motor",
    "contextTitle": "Forma reciente observada",
    "contextNote": "Estas estadísticas describen partidos observados. El motor actual puede no usarlas; rivales y periodos pueden diferir.",
    "winsGames": "victorias / partidos",
    "history_against_pick": "El equipo elegido tiene una tasa reciente de victorias inferior a la del rival en las muestras disponibles."
  },
  "pt": {
    "title": "Ficha de decisão",
    "intro": "Os dados desta seleção, as suas limitações e o histórico.",
    "evidence": "Dados do motor",
    "cautions": "Pontos de atenção",
    "engine_estimate": "Indicador do motor: {value}% (sem garantia).",
    "source_count": "Casas indicadas pelo motor: {value}.",
    "uncertain_estimate": "O sinal do motor continua incerto.",
    "few_sources": "Poucas casas indicadas para esta seleção.",
    "unknown_sources": "O número de fontes não é comunicado.",
    "unknown_freshness": "A data de recolha das cotas não é comunicada.",
    "old_odds": "As cotas disponíveis têm mais de 24 horas.",
    "missing_history": "Não existe histórico recente verificado disponível.",
    "partial_history": "O histórico recente cobre apenas uma equipa.",
    "old_history": "As estatísticas têm mais de 24 horas.",
    "alwaysRisk": "Uma seleção pode perder mesmo com dados completos.",
    "coverage": "Cobertura dos dados",
    "complete": "Histórico das duas equipas",
    "partial": "Histórico parcial",
    "unavailable": "Dados indisponíveis",
    "games": "Jogos observados: casa {home} · fora {away}",
    "collected": "Cotas recolhidas",
    "source": "Fonte estatística",
    "cohort": "Seleções históricas comparáveis",
    "basis": "Mesma competição, mercado, versão, faixa de cota e confiança nos 90 dias anteriores.",
    "wins": "Ganhas",
    "losses": "Perdidas",
    "voids": "Reembolsadas",
    "rate": "Taxa observada",
    "limited": "Menos de 30 seleções avaliadas: amostra limitada. Não prevê este jogo.",
    "historical": "Resultados passados, não uma probabilidade para este encontro. Pode haver várias seleções do mesmo jogo.",
    "none": "Sem resultados comparáveis utilizáveis.",
    "frozen": "Primeira ficha registada antes do início",
    "frozenNote": "Preserva a cota e o indicador da primeira consulta, sem os alterar quando as cotas mudam.",
    "notFrozen": "Sem cópia anterior ao jogo. A data nunca é reconstruída.",
    "initialOdds": "Cota registada",
    "initialEstimate": "Indicador registado",
    "recorded": "Registada em",
    "result": "Resultado confirmado",
    "won": "Ganho",
    "lost": "Perdido",
    "void": "Reembolsado",
    "retry": "Tentar novamente",
    "error": "Não foi possível carregar a ficha. O palpite e outros detalhes continuam disponíveis.",
    "loading": "A preparar ficha…",
    "unknown": "Não comunicado",
    "model": "Versão do motor",
    "contextTitle": "Forma recente observada",
    "contextNote": "Estas estatísticas descrevem jogos observados. O motor atual pode não as utilizar; adversários e períodos podem variar.",
    "winsGames": "vitórias / jogos",
    "history_against_pick": "A equipa escolhida tem uma taxa recente de vitórias inferior à do adversário nas amostras disponíveis."
  },
  "de": {
    "title": "Entscheidungsbericht",
    "intro": "Daten zu diesem Tipp, ihre Grenzen und ihre Historie.",
    "evidence": "Modelldaten",
    "cautions": "Wichtige Einschränkungen",
    "engine_estimate": "Modellindikator: {value}% (ohne Garantie).",
    "source_count": "Vom Modell gemeldete Buchmacher: {value}.",
    "uncertain_estimate": "Das Modellsignal bleibt unsicher.",
    "few_sources": "Wenige gemeldete Buchmacher für diesen Tipp.",
    "unknown_sources": "Die Quellenanzahl wird nicht angegeben.",
    "unknown_freshness": "Die Erfassungszeit der Quoten wird nicht angegeben.",
    "old_odds": "Die verfügbaren Quoten sind älter als 24 Stunden.",
    "missing_history": "Keine verifizierte jüngere Historie verfügbar.",
    "partial_history": "Die jüngere Historie umfasst nur ein Team.",
    "old_history": "Die Statistiken sind älter als 24 Stunden.",
    "alwaysRisk": "Auch bei vollständigen Daten kann ein Tipp verlieren.",
    "coverage": "Datenabdeckung",
    "complete": "Historie beider Teams",
    "partial": "Teilweise Historie",
    "unavailable": "Daten nicht verfügbar",
    "games": "Beobachtete Spiele: Heim {home} · Gast {away}",
    "collected": "Quoten erfasst",
    "source": "Statistikquelle",
    "cohort": "Vergleichbare historische Tipps",
    "basis": "Gleicher Wettbewerb, Markt, Modellversion, Quoten- und Konfidenzbereich in den vorherigen 90 Tagen.",
    "wins": "Gewonnen",
    "losses": "Verloren",
    "voids": "Erstattet",
    "rate": "Beobachtete Trefferquote",
    "limited": "Weniger als 30 bewertete Tipps: begrenzte Stichprobe. Keine Vorhersage für dieses Spiel.",
    "historical": "Vergangene Ergebnisse, keine Wahrscheinlichkeit für diese Partie. Mehrere Tipps können dasselbe Spiel betreffen.",
    "none": "Keine nutzbaren vergleichbaren Ergebnisse.",
    "frozen": "Erster Bericht vor Spielbeginn",
    "frozenNote": "Quote und Indikator der ersten Abfrage bleiben erhalten; spätere Änderungen überschreiben sie nicht.",
    "notFrozen": "Keine Kopie vor Spielbeginn. Erfassungsdaten werden nie rekonstruiert.",
    "initialOdds": "Erfasste Quote",
    "initialEstimate": "Erfasster Indikator",
    "recorded": "Erfasst am",
    "result": "Bestätigtes Ergebnis",
    "won": "Gewonnen",
    "lost": "Verloren",
    "void": "Erstattet",
    "retry": "Erneut versuchen",
    "error": "Bericht nicht verfügbar. Tipp und andere Details bleiben zugänglich.",
    "loading": "Bericht wird vorbereitet…",
    "unknown": "Nicht angegeben",
    "model": "Modellversion",
    "contextTitle": "Beobachtete jüngste Form",
    "contextNote": "Diese Statistiken beschreiben beobachtete Spiele. Das aktuelle Modell nutzt sie nicht unbedingt; Gegner und Zeiträume können abweichen.",
    "winsGames": "Siege / Spiele",
    "history_against_pick": "Das ausgewählte Team hat in den verfügbaren Stichproben eine niedrigere jüngste Siegquote als sein Gegner."
  },
  "ar": {
    "title": "تقرير القرار",
    "intro": "بيانات هذا الاختيار وحدودها وسجلها.",
    "evidence": "بيانات المحرك",
    "cautions": "نقاط الانتباه",
    "engine_estimate": "مؤشر المحرك: {value}% (دون ضمان).",
    "source_count": "عدد المراهنين المعلن من المحرك: {value}.",
    "uncertain_estimate": "إشارة المحرك لا تزال غير مؤكدة.",
    "few_sources": "عدد المصادر المعلنة محدود.",
    "unknown_sources": "عدد المصادر غير مذكور.",
    "unknown_freshness": "وقت جمع المعاملات غير مذكور.",
    "old_odds": "المعاملات المتاحة أقدم من 24 ساعة.",
    "missing_history": "لا يوجد سجل حديث موثق متاح.",
    "partial_history": "السجل الحديث يغطي فريقاً واحداً فقط.",
    "old_history": "الإحصاءات أقدم من 24 ساعة.",
    "alwaysRisk": "قد يخسر الاختيار حتى مع اكتمال البيانات.",
    "coverage": "تغطية البيانات",
    "complete": "سجل الفريقين",
    "partial": "سجل جزئي",
    "unavailable": "البيانات غير متاحة",
    "games": "المباريات المرصودة: المضيف {home} · الضيف {away}",
    "collected": "جمع المعاملات",
    "source": "مصدر الإحصاءات",
    "cohort": "اختيارات تاريخية مشابهة",
    "basis": "نفس المسابقة والسوق وإصدار المحرك وفئة المعامل والثقة خلال التسعين يوماً السابقة.",
    "wins": "فائزة",
    "losses": "خاسرة",
    "voids": "مستردة",
    "rate": "النسبة المرصودة",
    "limited": "أقل من 30 اختياراً مقيماً: عينة محدودة لا تتنبأ بهذه المباراة.",
    "historical": "نتائج سابقة وليست احتمالاً لهذه المباراة. قد تخص عدة اختيارات مباراة واحدة.",
    "none": "لا توجد نتائج مشابهة قابلة للاستخدام.",
    "frozen": "أول تقرير مسجل قبل البداية",
    "frozenNote": "يحفظ المعامل والمؤشر عند أول عرض ولا يُعدل مع تغير المعاملات.",
    "notFrozen": "لا توجد نسخة قبل المباراة. لا يُختلق تاريخ التسجيل.",
    "initialOdds": "المعامل المسجل",
    "initialEstimate": "المؤشر المسجل",
    "recorded": "تاريخ التسجيل",
    "result": "نتيجة مؤكدة",
    "won": "فائز",
    "lost": "خاسر",
    "void": "مسترد",
    "retry": "إعادة المحاولة",
    "error": "تعذر تحميل التقرير. يبقى التوقع والتفاصيل الأخرى متاحة.",
    "loading": "جارٍ إعداد التقرير…",
    "unknown": "غير مذكور",
    "model": "إصدار المحرك",
    "contextTitle": "المستوى الحديث المرصود",
    "contextNote": "تصف الإحصاءات مباريات مرصودة. قد لا يستخدمها المحرك الحالي وقد يختلف الخصوم والفترات.",
    "winsGames": "انتصارات / مباريات",
    "history_against_pick": "نسبة الانتصارات الحديثة للفريق المختار أقل من خصمه في العينات المتاحة."
  }
};

function DecisionReport({
  matchId,
  owner,
  match
}) {
  const i18n = usePageLanguage();
  const w = DECISION_COPY[i18n.language] || DECISION_COPY.fr;
  const [state, setState] = useState({
    key: null,
    data: null,
    error: false,
    loading: true
  });
  const [retry, setRetry] = useState(0);
  const key = `${owner}:${matchId}`;
  const stateRef = useRef(null);
  stateRef.current = key;
  useEffect(() => {
    const controller = new AbortController();
    setState({
      key,
      data: null,
      error: false,
      loading: true
    });
    api.get(`/matches/${encodeURIComponent(matchId)}/decision`, {
      signal: controller.signal,
      timeout: 23000
    }).then(({
      data
    }) => {
      if (!controller.signal.aborted && stateRef.current === key) {
        if (data?.version !== 1 || data.status !== 'ready') throw new Error('Unavailable report');
        setState({
          key,
          data,
          error: false,
          loading: false
        });
      }
    }).catch(() => {
      if (!controller.signal.aborted && stateRef.current === key) setState({
        key,
        data: null,
        error: true,
        loading: false
      });
    });
    return () => controller.abort();
  }, [key, matchId, retry]);
  const data = state.key === key ? state.data : null;
  const failed = state.key === key && state.error;
  const text = (code, values = {}) => (w[code] || w.unknown).replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? '—'));
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? i18n.formatDate(value, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }) : w.unknown;
  const number = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? i18n.formatNumber(Number(value), {
    maximumFractionDigits: 2
  }) : '—';
  const c = data?.comparable || {};
  const frozen = data?.initial_snapshot;
  return <section className="wp-decision mb-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="decision-report" dir={i18n.direction}>
  <p className="wp-eyebrow">WinPulse / Insights</p><h2 className="mt-2 text-2xl font-bold text-slate-900">{w.title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{w.intro}</p>
  {!data ? failed ? <div role="alert" className="mt-4 text-sm leading-6 text-slate-600"><p>{w.error}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="mt-2 min-h-11 rounded-xl border px-4 font-bold text-orange-700">{w.retry}</button></div> : <p role="status" className="mt-4 text-sm text-slate-500">{w.loading}</p> : <>
   <div className="mt-5"><h3 className="text-base font-bold text-slate-900">{w.evidence}</h3><ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">{(data.support || []).map((fact, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><span>{text(fact.code, {
                value: number(fact.value)
              })}</span></li>)}</ul></div>
   <div className="mt-4 rounded-xl bg-amber-50 p-3"><h3 className="text-sm font-bold text-amber-900">{w.cautions}</h3><ul className="mt-2 space-y-2 text-sm leading-6 text-amber-900">{(data.cautions || []).map((fact, i) => <li key={i}>• {text(fact.code)}</li>)}<li>• {w.alwaysRisk}</li></ul></div>
   {data.context && (data.coverage?.home_games > 0 || data.coverage?.away_games > 0) && <details className="mt-4 border-t border-slate-200 pt-3" data-testid="decision-context"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-800">{w.contextTitle}</summary><div className="mt-3 grid grid-cols-2 gap-3">{['home', 'away'].map(side => <div key={side} className="min-w-0 rounded-xl bg-slate-50 p-3"><p className="break-words text-xs font-bold">{match?.[`${side}_team`]}</p><strong className="mt-2 block font-mono text-lg">{number(data.context[side]?.wins)} / {number(data.context[side]?.played)}</strong><p className="text-xs text-slate-500">{w.winsGames}</p></div>)}</div><p className="mt-3 text-xs leading-6 text-slate-500">{w.contextNote}</p></details>}
   <details className="mt-4 border-t border-slate-200 pt-3" data-testid="decision-coverage"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-800">{w.coverage} · {w[data.coverage?.status] || w.unknown}</summary><p className="mt-2 text-sm leading-6 text-slate-600">{text('games', {
            home: number(data.coverage?.home_games),
            away: number(data.coverage?.away_games)
          })}</p><p className="mt-2 text-xs leading-6 text-slate-500">{w.collected} : {date(data.source_updated_at)}<br />{w.source} : {data.coverage?.source || w.unknown}</p></details>
   <details className="mt-3 border-t border-slate-200 pt-3" data-testid="decision-cohort"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-800">{w.cohort} <span className="text-slate-500">({number(c.evaluated ?? 0)})</span></summary><p className="mt-2 text-xs leading-6 text-slate-500">{w.basis}</p><div className="mt-3 grid grid-cols-3 gap-2">{[[w.wins, c.won], [w.losses, c.lost], [w.voids, c.void]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><strong className="font-mono text-lg">{number(value ?? 0)}</strong><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}</div><p className="mt-3 text-sm font-bold">{w.rate} : {c.win_rate == null ? '—' : `${number(c.win_rate)} %`}</p><p className="mt-2 text-xs leading-6 text-slate-500">{c.evaluated ? c.evaluated < 30 ? w.limited : w.historical : w.none}</p><p className="mt-2 text-xs leading-6 text-slate-500">{w.model} : {c.model_version || w.unknown}</p></details>
   <details className="mt-3 border-t border-slate-200 pt-3" data-testid="decision-frozen"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-800">{w.frozen}</summary>{frozen ? <><div className="mt-2 grid grid-cols-2 gap-3 text-sm"><div>{w.initialOdds}<strong className="mt-1 block font-mono">{number(frozen.pick_odds)}</strong></div><div>{w.initialEstimate}<strong className="mt-1 block font-mono">{number(frozen.confidence)} %</strong></div></div><p className="mt-3 text-xs text-slate-500">{w.recorded} : {date(frozen.captured_at)}</p><p className="mt-2 text-xs leading-6 text-slate-500">{w.frozenNote}</p></> : <p className="mt-2 text-xs leading-6 text-slate-500">{w.notFrozen}</p>}</details>
   {data.result && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-bold">{w.result} : {w[data.result.result] || w.unknown} {data.result.final_score && <bdi>· {data.result.final_score}</bdi>}</p>}
  </>}
 </section>;
}
