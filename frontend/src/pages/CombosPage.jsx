import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Layers, RefreshCw, TrendingUp } from "lucide-react";
import dayjs from "dayjs";

export default function CombosPage() {
  const [legs, setLegs] = useState(3);
  const [combo, setCombo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCombo = async (n = legs) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/predictions/combo?legs=${n}&min_confidence=60`);
      setCombo(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCombo(legs); /* eslint-disable-next-line */ }, []);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1 flex items-center gap-2">
            <Layers className="h-3.5 w-3.5" /> Combinés gagnants
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Le combiné du jour
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Parlay généré à partir des matchs les plus fiables du jour, diversifié sur plusieurs sports pour minimiser les corrélations.
          </p>
        </div>

        {/* Controls */}
        <Card className="bg-white border-slate-200 p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700">
                  Nombre de sélections : <span className="font-mono text-blue-600">{legs}</span>
                </label>
              </div>
              <Slider
                value={[legs]}
                min={2}
                max={5}
                step={1}
                onValueChange={(v) => setLegs(v[0])}
                onValueCommit={(v) => fetchCombo(v[0])}
                data-testid="legs-slider"
                className="w-full"
              />
            </div>
            <Button
              onClick={() => fetchCombo(legs)}
              variant="outline"
              data-testid="refresh-combo-btn"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Regénérer
            </Button>
          </div>
        </Card>

        {/* Combo result */}
        {loading ? (
          <Skeleton className="h-96" />
        ) : !combo || combo.legs?.length === 0 ? (
          <Card className="p-12 text-center bg-white border-slate-200">
            <div className="text-slate-500">Pas assez de matchs de haute confiance aujourd'hui pour un combiné.</div>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3" data-testid="combo-legs">
              {combo.legs.map((p, i) => (
                <Card key={p.match_id} className="bg-white border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 grid place-items-center font-bold text-sm flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500 mb-1">{p.sport_title} · {dayjs(p.commence_time).format("HH:mm")}</div>
                        <div className="font-semibold text-slate-900 truncate">{p.home_team} <span className="text-slate-400">vs</span> {p.away_team}</div>
                        <div className="text-sm mt-1">
                          <span className="font-bold text-blue-600">{p.pick}</span>
                          <span className="text-slate-500 font-mono ml-2">@ {p.pick_odds}</span>
                        </div>
                      </div>
                    </div>
                    <ConfidenceBadge label={p.label} confidence={p.confidence} />
                  </div>
                </Card>
              ))}
            </div>

            {/* Sticky bet slip */}
            <div className="lg:col-span-1">
              <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-slate-900 p-6 sticky top-6" data-testid="bet-slip">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">
                  <TrendingUp className="h-3.5 w-3.5" /> Ticket combiné
                </div>
                <div className="space-y-3 mb-6">
                  <Row label="Sélections" value={combo.legs.length} />
                  <Row label="Confiance moy." value={`${combo.avg_confidence}%`} />
                  <Row label="Prob. combinée" value={`${combo.combined_probability}%`} />
                </div>
                <div className="pt-4 border-t border-slate-700">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Cote totale</div>
                  <div className="font-heading text-5xl font-black tracking-tighter text-white">
                    {combo.total_odds}
                  </div>
                  <div className="mt-4 p-3 rounded-lg bg-slate-700/50 border border-slate-600 text-xs text-slate-300">
                    💡 Mise 1 000 FCFA → <span className="font-mono font-bold text-emerald-400">{(combo.total_odds * 1000).toFixed(0)} FCFA</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-bold font-mono">{value}</span>
    </div>
  );
}
