import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Brain, AlertTriangle, Lightbulb, Loader2, Lock, Radio, Send, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";
import { toast } from "sonner";
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
  const [data, setData] = useState(null);
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
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    analysisRequest.current?.abort();
    analysisRequest.current = null;
    setData(null);
    setAnalysis(null);
    setAnalysisError("");
    setMatchError("");
    setLoadingAnalysis(false);
    setLoadingMatch(true);
    api.get(`/matches/${encodeURIComponent(matchId)}`, {
      signal: controller.signal,
      timeout: 15_000
    }).then(r => {
      if (active) setData(r.data);
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
  }, [matchId]);
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
        timeout: 20_000
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={handleBack} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-6" data-testid="back-link">
          <ChevronLeft className="h-4 w-4" />{i18n.t("Retour")}</button>
        {/* Match header */}
        <Card className={`bg-white border-slate-200 p-6 mb-6 ${data.is_live ? "ring-2 ring-rose-500/40" : ""}`} data-testid="match-header">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Badge variant="outline" className="font-mono">{i18n.tx(data.sport_title)}</Badge>
              <span>·</span>
              <span>{i18n.formatPattern(data.commence_time, "dddd D MMM · HH:mm")}</span>
            </div> {i18n.tx(data.is_live && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wider animate-pulse" data-testid="match-live-badge">
                <Radio className="h-3 w-3" />{i18n.t("LIVE")}</span>)}
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <div className="text-center">
              <div className="font-heading text-xl font-extrabold text-slate-900">{data.home_team}</div>
              <div className="text-xs text-slate-500 mt-1">{i18n.t("Domicile")}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-extrabold text-slate-300">{i18n.t("VS")}</div>
            </div>
            <div className="text-center">
              <div className="font-heading text-xl font-extrabold text-slate-900">{data.away_team}</div>
              <div className="text-xs text-slate-500 mt-1">{i18n.t("Ext\xE9rieur")}</div>
            </div>
          </div>
        </Card>
        {/* Prediction summary */}
        {i18n.tx(locked ? <Card className="border border-dashed border-orange-300 bg-gradient-to-br from-orange-50 to-rose-50 p-6 mb-6" data-testid="prediction-locked">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl wp-gradient-warm grid place-items-center text-white flex-shrink-0">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-orange-700 font-bold mb-1">{i18n.t("Pronostic verrouill\xE9")}</div>
                  <div className="font-heading text-xl font-extrabold text-slate-900">{i18n.t("Passe Pro pour voir le pick complet")}</div>
                  <div className="text-sm text-slate-700 mt-1">{i18n.t("Inclut la cote optimale, le score de confiance, l'edge value et l'analyse IA experte.")}</div>
                </div>
              </div>
            </div>
            <Button className="wp-gradient-warm text-white border-0 hover:opacity-90" data-testid="upgrade-cta-match" onClick={() => setPayState({
          isOpen: true,
          tier: "PRO"
        })}>{i18n.t("D\xE9couvrir l\u2019offre Pro")}<ChevronLeft className="h-4 w-4 ms-2 rotate-180" />
            </Button>
          </Card> : <Card className={`border ${labelColor} p-6 mb-6`} data-testid="prediction-summary">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold mb-1 flex items-center gap-2">
                <span>{i18n.t("Pronostic principal")}</span>
                {i18n.tx(p.market_label && <span className="inline-flex items-center rounded-full bg-white border border-orange-200 text-orange-700 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide">
                    {i18n.bet(p.market_label)}
                  </span>)}
              </div>
              <div className="font-heading text-3xl font-extrabold text-slate-900">
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
              <Button onClick={() => {
            const text = i18n.t("\uD83C\uDFAF *Pick WinPulse*\n{{v0}} \xB7 {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n\uD83D\uDC49 {{v4}} @ *{{v5}}*\nConfiance IA : {{v6}}%\nMarch\xE9 : {{v7}}\n\nhttps://wnpulse.com", {
              v0: data.sport_title,
              v1: i18n.formatPattern(data.commence_time, "DD/MM HH:mm"),
              v2: data.home_team,
              v3: data.away_team,
              v4: i18n.bet(p.pick),
              v5: p.pick_odds,
              v6: Math.round(p.confidence || 0),
              v7: i18n.bet(p.market_label)
            });
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
            toast.success("WhatsApp ouvert");
          }} size="sm" className="bg-[#25D366] hover:bg-[#1ebe5c] text-white h-8" data-testid="admin-share-whatsapp-detail">
                <Send className="h-3.5 w-3.5 me-1.5" />{i18n.t("Partager")}</Button>
            </div>)}
        </Card>)}
        {i18n.tx(!locked && <Card className="mb-6 border-orange-200 bg-orange-50/40 p-6" data-testid="pick-explanation">
          <h2 className="font-heading text-lg font-bold text-slate-900">{i18n.t("Comprendre ce pronostic")}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
            <p>{i18n.tx(pickExplanation(i18n, p))}</p>
            <p>{i18n.t("Le moteur compare les march\xE9s et les cotes disponibles pour classer les s\xE9lections. L\u2019estimation affich\xE9e est un indicateur calcul\xE9 ; elle ne garantit pas le r\xE9sultat du match.")}</p>
            {i18n.tx(p.num_books != null && <p>{i18n.rich("Nombre de bookmakers annonc\xE9 pour cette analyse : {{v0}}. Cote de la s\xE9lection : {{v1}}.", {
              v0: <strong>{i18n.tx(readableNumber(i18n, p.num_books))}</strong>,
              v1: <strong>{i18n.tx(readableNumber(i18n, p.pick_odds))}</strong>
            })}</p>)}
            {i18n.tx(p.reasoning?.real_data_used ? <p>{i18n.t("Des statistiques externes sont disponibles pour compl\xE9ter cette analyse. Leur d\xE9tail figure plus bas.")}</p> : <p>{i18n.t("Les informations disponibles ne permettent pas ici d\u2019ajouter une analyse v\xE9rifi\xE9e de la forme des \xE9quipes ou des absences.")}</p>)}
          </div>
        </Card>)}
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
                      <div className="font-semibold text-slate-900 truncate">
                        {i18n.bet(m.pick)} <span className="text-slate-400 font-normal font-mono text-sm ms-1">@ {i18n.tx(m.pick_odds)}</span>
                      </div>
                    </div>   <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${labelCls}`}>
                      {i18n.tx(m.confidence)}%
                    </span>
                  </div>;
          }))}
            </div>
          </Card>)}
        {/* Deep reasoning — H2H / xG / forme / absences / arbitre / météo */}
        {i18n.tx(!locked && p.reasoning && <Card className="bg-white border-slate-200 p-6 mb-6" data-testid="deep-reasoning-card">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <h2 className="font-heading text-lg font-bold text-slate-900">{i18n.t("Analyse d\xE9taill\xE9e")}</h2>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] ms-1">{i18n.t("Donn\xE9es du moteur")}</Badge>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-4">{i18n.tx(p.reasoning.summary)}</p>
            {i18n.tx(p.reasoning.real_data_used ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4" data-testid="reasoning-grid">
                {i18n.tx(p.reasoning.h2h_last_10 && <ReasonBox label={i18n.t("H2H (10 derniers)")} value={`${p.reasoning.h2h_last_10.home_wins}V-${p.reasoning.h2h_last_10.draws}N-${p.reasoning.h2h_last_10.away_wins}D`} sub={i18n.tx(`${data.home_team}`)} />)}
                {i18n.tx((p.reasoning.form_last_5?.home || p.reasoning.form_last_5?.away) && <ReasonBox label={i18n.t("Forme récente")} value={`${p.reasoning.form_last_5?.home ?? "N/D"} / ${p.reasoning.form_last_5?.away ?? "N/D"}`} mono />)}
                {i18n.tx(p.reasoning.xg && <ReasonBox label={i18n.t("xG moyens")} value={`${p.reasoning.xg.home} vs ${p.reasoning.xg.away}`} mono />)}
                {i18n.tx(p.reasoning.home_record && <ReasonBox label={i18n.t("Domicile")} value={p.reasoning.home_record} />)}
                {i18n.tx(p.reasoning.away_record && <ReasonBox label={i18n.t("Extérieur")} value={p.reasoning.away_record} />)}
                {i18n.tx(p.reasoning.key_absences && <ReasonBox label={i18n.t("Absences clés")} value={`${String(data.home_team || "Domicile").split(" ")[0]}: ${p.reasoning.key_absences.home} · ${String(data.away_team || "Extérieur").split(" ")[0]}: ${p.reasoning.key_absences.away}`} />)}
                {i18n.tx(p.reasoning.referee_yellows_avg != null && <ReasonBox label={i18n.t("Cartons arbitre")} value={`${p.reasoning.referee_yellows_avg}/match`} />)}
                {i18n.tx(p.reasoning.weather && <ReasonBox label={i18n.t("Conditions")} value={p.reasoning.weather} />)}
              </div> : <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">{i18n.t("Aucune statistique externe v\xE9rifi\xE9e disponible pour ce match \u2014 le moteur s'appuie uniquement sur le consensus des cotes bookmakers, sans donn\xE9e invent\xE9e.")}</div>)}
            <div className="text-[10px] text-slate-400 italic pt-3 border-t border-slate-100">
              {i18n.tx(p.reasoning.real_data_used ? "Forme et historique H2H réels (football-data.org) quand disponibles. Autres champs : analyse basée sur le consensus des cotes bookmakers." : "Analyse basée uniquement sur le consensus des cotes bookmakers agrégées — aucune statistique externe fabriquée.")}
            </div>
          </Card>)}
        {/* AI Analysis */}
        {i18n.tx(!locked && <Card className="bg-white border-slate-200 p-6 mb-6" data-testid="ai-analysis-card">
          <div className="flex items-center justify-between mb-4">
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
        {/* Bookmakers */}
        <Card className="bg-white border-slate-200 p-6 mb-6">
          <h2 className="font-heading text-lg font-bold text-slate-900 mb-4">{i18n.t("Cotes par bookmaker")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">{i18n.t("Bookmaker")}</th>
                  {i18n.tx(data.bookmakers?.[0]?.markets?.[0]?.outcomes?.map(o => <th key={o.name} className="py-2 px-2 text-center">{i18n.tx(o.name)}</th>))}
                </tr>
              </thead>
              <tbody>
                {i18n.tx(data.bookmakers?.map(bm => <tr key={bm.key} className="border-b border-slate-100">
                    <td className="py-2.5 pe-4 font-medium text-slate-700">{i18n.tx(bm.title)}</td>
                    {i18n.tx(bm.markets?.[0]?.outcomes?.map(o => <td key={o.name} className="py-2.5 px-2 text-center font-mono font-semibold">
                        {i18n.tx(o.price)}
                      </td>))}
                  </tr>))}
              </tbody>
            </table>
          </div>
        </Card>
        {/* Stats panel — real data only */}
        {i18n.tx(!locked && <MatchStatsPanel reasoning={p.reasoning} home={data.home_team} away={data.away_team} />)}
      </div>
      <PaymentModal isOpen={payState.isOpen} onClose={() => setPayState({
      isOpen: false,
      tier: payState.tier
    })} targetTier={payState.tier} />
    </AppLayout>;
}
function MatchStatsPanel({
  reasoning,
  home,
  away
}) {
  const i18n = usePageLanguage();
  // Le panneau n'affiche QUE des donnees reellement observees (forme reelle
  // et H2H reel via football-data.org, disponibles sur 12 grandes ligues
  // europeennes). Avant, ce composant fabriquait entierement ses chiffres
  // (xG, corners, cartons, possession, blessures, tableau H2H date par
  // date) via un generateur pseudo-aleatoire base sur l'id du match, et les
  // presentait comme des statistiques du match — ce n'etait jamais le cas.
  // Si aucune vraie donnee n'existe pour ce match, rien ne s'affiche plutot
  // que d'inventer un contenu.
  if (!reasoning || !reasoning.real_data_used) {
    return null;
  }
  const h2h = reasoning.h2h_last_10;
  const formHome = reasoning.form_last_5?.home;
  const formAway = reasoning.form_last_5?.away;
  const hasH2H = h2h && h2h.home_wins + h2h.draws + h2h.away_wins > 0;
  const hasForm = Boolean(formHome || formAway);
  if (!hasH2H && !hasForm) {
    return null;
  }
  const formColor = x => x === "W" ? "bg-emerald-500" : x === "D" ? "bg-amber-500" : "bg-rose-500";
  const formLetter = x => x === "W" ? "V" : x === "D" ? "N" : "D";
  return <div className="space-y-5" data-testid="stats-panel">
      <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg p-3">{i18n.t("Donn\xE9es r\xE9elles (football-data.org) \u2014 forme r\xE9cente et historique des confrontations directes, disponibles pour les grandes comp\xE9titions europ\xE9ennes suivies.")}</div>

      {/* === Forme réelle sur les 5 derniers matchs === */}
      {i18n.tx(hasForm && <div className="grid sm:grid-cols-2 gap-4">
          {i18n.tx([["Domicile", home, formHome], ["Extérieur", away, formAway]].map(([lbl, team, form], k) => {
        const letters = (form || "").split("");
        const wins = letters.filter(x => x === "W").length;
        const draws = letters.filter(x => x === "D").length;
        const losses = letters.filter(x => x === "L").length;
        return <div key={k} className="bg-white border border-neutral-200 rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{i18n.tx(lbl)}</div>
                <div className="font-heading font-bold text-slate-900 mb-3">{i18n.tx(team)}</div>
                {i18n.tx(letters.length > 0 ? <>
                    <div className="text-xs text-slate-500 mb-2">{i18n.rich("{{v0}} derniers matchs (r\xE9el)", {
                v0: i18n.tx(letters.length)
              })}</div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {i18n.tx(letters.map((x, i) => <span key={i} className={`h-7 w-7 rounded-full grid place-items-center text-[11px] font-bold text-white ${formColor(x)}`} title={i18n.tx(formLetter(x))}>
                          {i18n.tx(formLetter(x))}
                        </span>))}
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="flex items-center gap-1">{i18n.rich("{{v0}} {{v1}} V", {
                  v0: <span className="h-2 w-2 rounded-full bg-emerald-500" />,
                  v1: i18n.tx(wins)
                })}</span>
                      <span className="flex items-center gap-1">{i18n.rich("{{v0}} {{v1}} N", {
                  v0: <span className="h-2 w-2 rounded-full bg-amber-500" />,
                  v1: i18n.tx(draws)
                })}</span>
                      <span className="flex items-center gap-1">{i18n.rich("{{v0}} {{v1}} D", {
                  v0: <span className="h-2 w-2 rounded-full bg-rose-500" />,
                  v1: i18n.tx(losses)
                })}</span>
                    </div>
                  </> : <div className="text-xs text-slate-400 italic">{i18n.t("Forme r\xE9cente non disponible")}</div>)}
              </div>;
      }))}
        </div>)}

      {/* === H2H réel (agrégé) === */}
      {i18n.tx(hasH2H && <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h3 className="font-heading font-bold text-slate-900 mb-3">{i18n.t("\uD83D\uDCC5 Confrontations directes (historique r\xE9el)")}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-orange-50 border border-orange-200">
              <div className="text-xs text-slate-600">{i18n.tx(home)}</div>
              <div className="font-heading text-2xl font-black text-orange-700">{i18n.tx(h2h.home_wins)}</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-600">{i18n.t("Nuls")}</div>
              <div className="font-heading text-2xl font-black text-slate-700">{i18n.tx(h2h.draws)}</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-rose-50 border border-rose-200">
              <div className="text-xs text-slate-600">{i18n.tx(away)}</div>
              <div className="font-heading text-2xl font-black text-rose-700">{i18n.tx(h2h.away_wins)}</div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 italic mt-3">{i18n.t("Bilan agr\xE9g\xE9 des confrontations directes r\xE9centes. D\xE9tail match par match non disponible sur la source actuelle.")}</div>
        </div>)}
    </div>;
}
function Stat({
  label,
  value,
  mono
}) {
  const i18n = usePageLanguage();
  return <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{i18n.tx(label)}</div>
      <div className={`font-bold text-slate-900 ${mono ? "font-mono" : ""}`}>{i18n.tx(value)}</div>
    </div>;
}
function ReasonBox({
  label,
  value,
  sub,
  mono
}) {
  const i18n = usePageLanguage();
  return <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{i18n.tx(label)}</div>
      <div className={`text-sm font-bold text-slate-900 ${mono ? "font-mono" : ""}`}>{i18n.tx(value)}</div>
      {i18n.tx(sub && <div className="text-[10px] text-slate-400 mt-0.5">{i18n.tx(sub)}</div>)}
    </div>;
}
function ConfidenceBadge({
  label,
  confidence
}) {
  const i18n = usePageLanguage();
  const key = String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const color = /sur|safe/.test(key) ? "bg-green-100 text-green-700 border-green-200" : /modere|value/.test(key) ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-red-100 text-red-700 border-red-200";
  const text = /sur|safe/.test(key) ? "🟢 SÛR" : /modere|value/.test(key) ? "🟡 MODÉRÉ" : "🔴 RISQUÉ";
  return <span className={`inline-flex flex-wrap items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${color}`}>{i18n.tx(text)}{i18n.tx(confidence != null && Number.isFinite(Number(confidence)) && <bdi>{i18n.formatNumber(Number(confidence) / 100, {
        style: "percent",
        maximumFractionDigits: 0
      })}</bdi>)}</span>;
}
