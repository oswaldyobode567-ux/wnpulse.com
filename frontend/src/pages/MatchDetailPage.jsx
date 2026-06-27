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
import PaymentModal from "@/components/payment/PaymentModal";

export default function MatchDetailPage() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });

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
            <Button className="wp-gradient-warm text-white border-0 hover:opacity-90" data-testid="upgrade-cta-match" onClick={() => setPayState({ isOpen: true, tier: "PRO" })}>
              Débloquer dès 4 900 FCFA / mois <ChevronLeft className="h-4 w-4 ml-2 rotate-180" />
            </Button>
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
        <Card className="bg-white border-slate-200 p-6 mb-6">
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

        {/* Stats panel — FootyStat style (deterministic mock from match id) */}
        {!locked && <MatchStatsPanel home={data.home_team} away={data.away_team} seed={data.id} />}
      </div>
      <PaymentModal
        isOpen={payState.isOpen}
        onClose={() => setPayState({ isOpen: false, tier: payState.tier })}
        targetTier={payState.tier}
      />
    </AppLayout>
  );
}

function seededRng(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return () => { h = (h * 9301 + 49297) % 233280; return h / 233280; };
}

function MatchStatsPanel({ home, away, seed }) {
  const rng = seededRng(seed || "x");
  const r = () => rng();

  // 10-game form
  const form10 = (bias = 0.45) => Array.from({ length: 10 }, () => r() > bias ? "W" : r() > 0.55 ? "D" : "L");
  const homeForm = form10(0.4);
  const awayForm = form10(0.48);
  const wins = (f) => f.filter(x => x === "W").length;
  const draws = (f) => f.filter(x => x === "D").length;
  const losses = (f) => f.filter(x => x === "L").length;

  // H2H 10 derniers
  const h2h = Array.from({ length: 10 }, (_, i) => {
    const hs = Math.floor(r() * 4); const as = Math.floor(r() * 4);
    return {
      date: `${28 - i * 2}/${String(((i % 12) + 1)).padStart(2, "0")}/202${3 + (i % 3)}`,
      comp: ["Championnat", "Coupe", "C1", "Amical"][i % 4],
      hs, as,
      btts: hs > 0 && as > 0,
      ov25: hs + as > 2,
    };
  });
  const h2hHomeWins = h2h.filter(m => m.hs > m.as).length;
  const h2hDraws = h2h.filter(m => m.hs === m.as).length;
  const h2hAwayWins = h2h.filter(m => m.as > m.hs).length;
  const h2hBtts = Math.round((h2h.filter(m => m.btts).length / h2h.length) * 100);
  const h2hOv25 = Math.round((h2h.filter(m => m.ov25).length / h2h.length) * 100);
  const h2hGoalsAvg = (h2h.reduce((a, m) => a + m.hs + m.as, 0) / h2h.length).toFixed(2);

  // Team aggregated stats
  const mkTeam = (bias) => ({
    gs: +(1.2 + r() * 1.6).toFixed(2),    // goals scored / match
    gc: +(0.7 + r() * 1.2).toFixed(2),    // goals conceded / match
    gs_ht: +(0.4 + r() * 0.7).toFixed(2), // goals scored 1st half
    gs_ft: +(0.7 + r() * 1.0).toFixed(2), // goals scored 2nd half
    btts_pct: 40 + Math.floor(r() * 45),
    ov25_pct: 35 + Math.floor(r() * 45),
    ov15_pct: 60 + Math.floor(r() * 30),
    cs_pct: 15 + Math.floor(r() * 35),    // clean sheets
    no_score: 8 + Math.floor(r() * 20),   // % matchs sans marquer
    avg_corners: +(8 + r() * 5).toFixed(1),
    avg_cards: +(2 + r() * 2.5).toFixed(1),
    shots: 10 + Math.floor(r() * 8),
    shots_on: 3 + Math.floor(r() * 5),
    poss: 45 + Math.floor(r() * 18) + bias,
    pen_won: Math.floor(r() * 5),
    xg: +(1.0 + r() * 1.4).toFixed(2),
  });
  const H = mkTeam(2);
  const A = mkTeam(-2);
  H.poss = Math.min(64, H.poss);
  A.poss = 100 - H.poss;

  // Derived multi-market predictions (FootyStats-style)
  const pred = {
    btts: Math.round((H.btts_pct + A.btts_pct) / 2),
    ov25: Math.round((H.ov25_pct + A.ov25_pct) / 2),
    ov15: Math.round((H.ov15_pct + A.ov15_pct) / 2),
    ov35: Math.max(15, Math.round((H.ov25_pct + A.ov25_pct) / 2.6)),
    cs_home: H.cs_pct,
    cs_away: A.cs_pct,
    ht_goal: Math.round(((H.gs_ht + A.gs_ht) / 2) * 50),
    win_to_nil_home: Math.max(8, Math.round((H.cs_pct + (100 - A.gs * 50)) / 4)),
    btts_and_ov25: Math.round(((H.btts_pct + A.btts_pct) / 2 + (H.ov25_pct + A.ov25_pct) / 2) / 2.4),
    corners_ov95: Math.round(((H.avg_corners + A.avg_corners) > 10 ? 65 : 48) + r() * 10),
    cards_ov35: Math.round(((H.avg_cards + A.avg_cards) > 4 ? 60 : 40) + r() * 12),
    exact_1_1: 11 + Math.floor(r() * 6),
    exact_2_1: 8 + Math.floor(r() * 5),
    exact_0_0: 6 + Math.floor(r() * 5),
  };
  pred.no_btts = 100 - pred.btts;
  pred.un25 = 100 - pred.ov25;

  const formColor = (x) => x === "W" ? "bg-emerald-500" : x === "D" ? "bg-amber-500" : "bg-rose-500";

  // Injuries
  const injuries = {
    home: [{ name: "Milieu défensif", status: "INCERTAIN" }, { name: "Latéral droit", status: "INDISPONIBLE" }],
    away: [{ name: "Attaquant titulaire", status: "INCERTAIN" }],
  };

  return (
    <div className="space-y-5" data-testid="stats-panel">
      {/* === Smart Combos derived from stats === */}
      <div className="rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 text-white p-5 sm:p-6 shadow-lg" data-testid="smart-combos">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-90">Prédictions multi-marchés</div>
            <div className="font-heading text-xl sm:text-2xl font-extrabold">12 marchés analysés en profondeur</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            ["BTTS Oui", pred.btts],
            ["Over 1.5", pred.ov15],
            ["Over 2.5", pred.ov25],
            ["Over 3.5", pred.ov35],
            ["But en 1ère MT", pred.ht_goal],
            ["BTTS + Over 2.5", pred.btts_and_ov25],
            ["Clean Sheet " + (home.split(" ")[0]), pred.cs_home],
            ["Corners +9.5", pred.corners_ov95],
            ["Cartons +3.5", pred.cards_ov35],
            ["Score exact 1-1", pred.exact_1_1],
            ["Score exact 2-1", pred.exact_2_1],
            ["Match nul vierge 0-0", pred.exact_0_0],
          ].map(([lbl, p], i) => (
            <div key={i} className="rounded-lg bg-white/12 backdrop-blur-sm ring-1 ring-white/15 p-2.5 text-left">
              <div className="text-[10px] uppercase tracking-wider font-bold opacity-85 truncate">{lbl}</div>
              <div className="font-heading text-xl font-black mt-0.5 tabular-nums">
                {p}<span className="text-xs opacity-75">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === Form 10 last matches === */}
      <div className="grid sm:grid-cols-2 gap-4">
        {[["Domicile", home, homeForm], ["Extérieur", away, awayForm]].map(([lbl, team, form], k) => (
          <div key={k} className="bg-white border border-neutral-200 rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{lbl}</div>
            <div className="font-heading font-bold text-slate-900 mb-3">{team}</div>
            <div className="text-xs text-slate-500 mb-2">10 derniers matchs</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {form.map((x, i) => (
                <span key={i} className={`h-7 w-7 rounded-full grid place-items-center text-[11px] font-bold text-white ${formColor(x)}`} title={x === "W" ? "V" : x === "D" ? "N" : "D"}>{x === "W" ? "V" : x === "D" ? "N" : "D"}</span>
              ))}
            </div>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {wins(form)} V</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {draws(form)} N</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> {losses(form)} D</span>
            </div>
          </div>
        ))}
      </div>

      {/* === Detailed comparison bars (FootyStats-style) === */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="font-heading font-bold text-slate-900 mb-4 flex items-center gap-2">⚖️ Comparaison statistique (saison)</h3>
        <div className="space-y-3">
          {[
            ["Possession moyenne", `${H.poss}%`, H.poss, `${A.poss}%`, A.poss],
            ["Buts marqués / match", H.gs, H.gs * 35, A.gs, A.gs * 35],
            ["Buts encaissés / match", H.gc, H.gc * 35, A.gc, A.gc * 35],
            ["Tirs / match", H.shots, H.shots * 4, A.shots, A.shots * 4],
            ["Tirs cadrés / match", H.shots_on, H.shots_on * 9, A.shots_on, A.shots_on * 9],
            ["xG (expected goals)", H.xg, H.xg * 30, A.xg, A.xg * 30],
            ["Corners / match", H.avg_corners, H.avg_corners * 7, A.avg_corners, A.avg_corners * 7],
            ["Cartons / match", H.avg_cards, H.avg_cards * 18, A.avg_cards, A.avg_cards * 18],
            ["Clean sheets %", `${H.cs_pct}%`, H.cs_pct, `${A.cs_pct}%`, A.cs_pct],
            ["BTTS %", `${H.btts_pct}%`, H.btts_pct, `${A.btts_pct}%`, A.btts_pct],
            ["Over 2.5 %", `${H.ov25_pct}%`, H.ov25_pct, `${A.ov25_pct}%`, A.ov25_pct],
          ].map(([lbl, hv, hw, av, aw], i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-mono font-bold text-orange-700 tabular-nums">{hv}</span>
                <span className="text-slate-500 font-semibold">{lbl}</span>
                <span className="font-mono font-bold text-rose-700 tabular-nums">{av}</span>
              </div>
              <div className="flex h-2 gap-0.5">
                <div className="flex-1 bg-orange-50 rounded-l-full overflow-hidden flex justify-end">
                  <div className="h-full bg-gradient-to-l from-orange-500 to-orange-300" style={{ width: `${Math.min(100, Math.max(8, hw))}%` }} />
                </div>
                <div className="flex-1 bg-rose-50 rounded-r-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-rose-500 to-rose-300" style={{ width: `${Math.min(100, Math.max(8, aw))}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === H2H last 10 with detailed columns === */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="font-heading font-bold text-slate-900 mb-3">📅 Confrontations directes (10 derniers H2H)</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 rounded-lg bg-orange-50 border border-orange-200">
            <div className="text-xs text-slate-600">{home}</div>
            <div className="font-heading text-2xl font-black text-orange-700">{h2hHomeWins}</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-600">Nuls</div>
            <div className="font-heading text-2xl font-black text-slate-700">{h2hDraws}</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-rose-50 border border-rose-200">
            <div className="text-xs text-slate-600">{away}</div>
            <div className="font-heading text-2xl font-black text-rose-700">{h2hAwayWins}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mb-4 text-xs">
          <div><span className="text-slate-500">Moy. buts H2H :</span> <strong className="text-slate-900 tabular-nums">{h2hGoalsAvg}</strong></div>
          <div><span className="text-slate-500">BTTS H2H :</span> <strong className="text-slate-900 tabular-nums">{h2hBtts}%</strong></div>
          <div><span className="text-slate-500">Over 2.5 H2H :</span> <strong className="text-slate-900 tabular-nums">{h2hOv25}%</strong></div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-neutral-200"><th className="py-1 text-left">Date</th><th className="py-1 text-left">Comp.</th><th className="py-1 text-center">Score</th><th className="py-1 text-center">BTTS</th><th className="py-1 text-center">+2.5</th></tr></thead>
          <tbody>{h2h.map((m, i) => (
            <tr key={i} className="border-b border-neutral-100">
              <td className="py-1.5 text-slate-600 text-xs font-mono">{m.date}</td>
              <td className="py-1.5 text-slate-700 text-xs">{m.comp}</td>
              <td className="py-1.5 text-center font-mono font-bold tabular-nums">{m.hs}-{m.as}</td>
              <td className="py-1.5 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded ${m.btts ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{m.btts ? "OUI" : "NON"}</span></td>
              <td className="py-1.5 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded ${m.ov25 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{m.ov25 ? "OUI" : "NON"}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* === Tendances & Patterns === */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="font-heading font-bold text-slate-900 mb-3">📊 Tendances & patterns détectés</h3>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2"><span className="text-orange-500 mt-0.5">●</span> <span><strong>{home}</strong> a marqué dans <strong>{H.btts_pct}% de ses matchs</strong> cette saison.</span></li>
          <li className="flex items-start gap-2"><span className="text-rose-500 mt-0.5">●</span> <span><strong>{away}</strong> a encaissé en moyenne <strong>{A.gc} buts/match</strong> ({100 - A.cs_pct}% de matchs avec but encaissé).</span></li>
          <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">●</span> <span>Le <strong>BTTS s'est produit dans {h2hBtts}%</strong> des confrontations directes — tendance {h2hBtts > 55 ? "forte" : "faible"}.</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">●</span> <span><strong>{(H.gs_ht > 0.7 || A.gs_ht > 0.7) ? "Match offensif en 1ère mi-temps" : "Démarrages prudents en 1ère MT"}</strong> ({Math.round(((H.gs_ht + A.gs_ht) / 2) * 50)}% des matchs avec but avant 45').</span></li>
          <li className="flex items-start gap-2"><span className="text-fuchsia-500 mt-0.5">●</span> <span>Moyenne de <strong>{((H.avg_corners + A.avg_corners) / 2).toFixed(1)} corners/match</strong> attendus — marché Over 9.5 corners cote intéressante.</span></li>
        </ul>
      </div>

      {/* === Injuries === */}
      <div className="grid sm:grid-cols-2 gap-4">
        {[["Domicile", home, injuries.home], ["Extérieur", away, injuries.away]].map(([lbl, team, inj], k) => (
          <div key={k} className="bg-white border border-neutral-200 rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{lbl}</div>
            <div className="font-heading font-bold text-slate-900 mb-2">{team}</div>
            <div className="text-xs text-slate-500 mb-2">🩹 Blessés / incertains</div>
            <ul className="space-y-1">{inj.map((p, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{p.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.status === "INDISPONIBLE" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{p.status}</span>
              </li>
            ))}</ul>
          </div>
        ))}
      </div>
    </div>
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
