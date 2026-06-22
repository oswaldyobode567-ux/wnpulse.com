import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { ChevronLeft, Brain, AlertTriangle, Lightbulb, Loader2, Lock } from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";

export default function MatchDetailPage() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    setLoadingMatch(true);
    api.get(`/matches/${matchId}`)
      .then((r) => setData(r.data))
      .finally(() => setLoadingMatch(false));
  }, [matchId]);

  const fetchAnalysis = async () => {
    setLoadingAnalysis(true);
    try {
      const { data: a } = await api.get(`/matches/${matchId}/analysis`);
      setAnalysis(a.analysis);
    } catch (e) {
      // ignore
    } finally {
      setLoadingAnalysis(false);
    }
  };

  if (loadingMatch) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-8">Match introuvable.</div>
      </AppLayout>
    );
  }

  const p = data.prediction;
  const locked = p.locked || !p.pick;
  const labelColor = {
    safe: "bg-emerald-50 border-emerald-200",
    value: "bg-amber-50 border-amber-200",
    risky: "bg-rose-50 border-rose-200",
  }[p.label] || "bg-orange-50 border-orange-200";

  const isPaid = user?.subscription_tier && user.subscription_tier !== "free";

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/app" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-6" data-testid="back-link">
          <ChevronLeft className="h-4 w-4" /> Retour
        </Link>

        {/* Match header */}
        <Card className="bg-white border-slate-200 p-6 mb-6" data-testid="match-header">
          <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
            <Badge variant="outline" className="font-mono">{data.sport_title}</Badge>
            <span>·</span>
            <span>{dayjs(data.commence_time).format("dddd D MMM · HH:mm")}</span>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <div className="text-center">
              <div className="font-heading text-xl font-extrabold text-slate-900">{data.home_team}</div>
              <div className="text-xs text-slate-500 mt-1">Domicile</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-extrabold text-slate-300">VS</div>
            </div>
            <div className="text-center">
              <div className="font-heading text-xl font-extrabold text-slate-900">{data.away_team}</div>
              <div className="text-xs text-slate-500 mt-1">Extérieur</div>
            </div>
          </div>
        </Card>

        {/* Prediction summary */}
        {locked ? (
          <Card className="border border-dashed border-orange-300 bg-gradient-to-br from-orange-50 to-rose-50 p-6 mb-6" data-testid="prediction-locked">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl wp-gradient-warm grid place-items-center text-white flex-shrink-0">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-orange-700 font-bold mb-1">Pronostic verrouillé</div>
                  <div className="font-heading text-xl font-extrabold text-slate-900">Passe Pro pour voir le pick complet</div>
                  <div className="text-sm text-slate-700 mt-1">Inclut la cote optimale, le score de confiance, l'edge value et l'analyse IA experte.</div>
                </div>
              </div>
            </div>
            <Link to="/app/abonnement">
              <Button className="wp-gradient-warm text-white border-0 hover:opacity-90" data-testid="upgrade-cta-match">
                Débloquer dès 4 900 FCFA / mois <ChevronLeft className="h-4 w-4 ml-2 rotate-180" />
              </Button>
            </Link>
          </Card>
        ) : (
        <Card className={`border ${labelColor} p-6 mb-6`} data-testid="prediction-summary">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold mb-1 flex items-center gap-2">
                <span>Pronostic principal</span>
                {p.market_label && (
                  <span className="inline-flex items-center rounded-full bg-white border border-orange-200 text-orange-700 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide">
                    {p.market_label}
                  </span>
                )}
              </div>
              <div className="font-heading text-3xl font-extrabold text-slate-900">
                {p.pick}
                <span className="text-slate-500 text-xl font-mono font-semibold ml-2">@ {p.pick_odds}</span>
              </div>
            </div>
            <ConfidenceBadge label={p.label} confidence={p.confidence} size="md" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200/60">
            <Stat label="Bookmakers" value={p.num_books} />
            <Stat label="Edge value" value={`${p.edge >= 0 ? "+" : ""}${p.edge}%`} />
            <Stat label="Prob. pick" value={`${(p.implied_probs?.[p.pick] || 0).toFixed(1)}%`} />
            <Stat label="Cote optimale" value={p.pick_odds} mono />
          </div>
        </Card>
        )}

        {/* All markets analyzed (Pro feature) */}
        {!locked && p.markets && p.markets.length > 1 && (
          <Card className="bg-white border-neutral-200 p-6 mb-6" data-testid="all-markets-card">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-rose-600" />
              <h2 className="font-heading text-lg font-bold text-slate-900">Tous les marchés analysés</h2>
              <span className="text-xs text-slate-500">({p.markets.length})</span>
            </div>
            <div className="space-y-2">
              {p.markets.map((m, i) => {
                const labelCls = m.label === "safe" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : m.label === "value" ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-rose-50 text-rose-700 border-rose-200";
                return (
                  <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                        <span className="bg-slate-900 text-white px-1.5 rounded">{m.market_label}</span>
                        <span>· {m.num_books} books</span>
                        {m.edge > 0 && <span className="text-emerald-600">· edge +{m.edge}%</span>}
                      </div>
                      <div className="font-semibold text-slate-900 truncate">
                        {m.pick} <span className="text-slate-400 font-normal font-mono text-sm ml-1">@ {m.pick_odds}</span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${labelCls}`}>
                      {m.confidence}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* AI Analysis */}
        <Card className="bg-white border-slate-200 p-6 mb-6" data-testid="ai-analysis-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-orange-600" />
              <h2 className="font-heading text-lg font-bold text-slate-900">Analyse experte IA</h2>
            </div>
            {!analysis && !locked && (
              <Button
                size="sm"
                className="wp-gradient-warm text-white border-0 hover:opacity-90"
                onClick={fetchAnalysis}
                disabled={loadingAnalysis}
                data-testid="run-analysis-btn"
              >
                {loadingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lancer l'analyse"}
              </Button>
            )}
          </div>

          {!analysis && !loadingAnalysis && (
            <div className="text-sm text-slate-500">
              Cliquez sur "Lancer l'analyse" pour obtenir une analyse complète : facteurs clés, alertes risque et pari alternatif suggéré.
              {!isPaid && (
                <div className="mt-3 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <Lock className="h-4 w-4" />
                  <span className="text-xs">Compte Free : analyse statistique uniquement. <Link to="/app/abonnement" className="font-semibold underline">Passe Pro</Link> pour l'analyse IA complète.</span>
                </div>
              )}
            </div>
          )}

          {analysis && (
            <div className="space-y-4" data-testid="analysis-content">
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-4">
                <div className="text-xs uppercase tracking-wider text-orange-700 font-bold mb-1">Verdict</div>
                <div className="text-sm text-slate-900 font-medium">{analysis.verdict}</div>
              </div>

              {analysis.key_factors?.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-600 font-bold mb-2">Facteurs clés</div>
                  <ul className="space-y-1.5">
                    {analysis.key_factors.map((f, i) => (
                      <li key={i} className="text-sm text-slate-700 flex gap-2">
                        <span className="text-orange-600 font-bold">·</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.risk_alert && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-rose-900">{analysis.risk_alert}</div>
                </div>
              )}

              {analysis.alternative_bet && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex gap-2">
                  <Lightbulb className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-emerald-900">
                    <span className="font-semibold">Alternative : </span>{analysis.alternative_bet}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-400 pt-2">
                Source : {analysis.source === "ai" ? "Analyse IA experte" : "Moteur statistique"}
              </div>
            </div>
          )}
        </Card>

        {/* Bookmakers */}
        <Card className="bg-white border-slate-200 p-6">
          <h2 className="font-heading text-lg font-bold text-slate-900 mb-4">Cotes par bookmaker</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Bookmaker</th>
                  {data.bookmakers?.[0]?.markets?.[0]?.outcomes?.map((o) => (
                    <th key={o.name} className="py-2 px-2 text-center">{o.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bookmakers?.map((bm) => (
                  <tr key={bm.key} className="border-b border-slate-100">
                    <td className="py-2.5 pr-4 font-medium text-slate-700">{bm.title}</td>
                    {bm.markets?.[0]?.outcomes?.map((o) => (
                      <td key={o.name} className="py-2.5 px-2 text-center font-mono font-semibold">
                        {o.price}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{label}</div>
      <div className={`font-bold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
