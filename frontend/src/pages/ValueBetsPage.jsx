import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, Lock, Sparkles, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";
import PaymentModal from "@/components/payment/PaymentModal";

export default function ValueBetsPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });
  const isFree = !user?.subscription_tier || user.subscription_tier === "free";

  useEffect(() => {
    api.get("/value-bets").then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-orange-600 font-bold mb-1 flex items-center gap-2"><Target className="h-3.5 w-3.5" /> Détecteur de value bets</div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Là où le marché se trompe</h1>
        </div>

        <Card className="mb-6 p-5 bg-orange-50/40 border-orange-200">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 leading-relaxed">
              Un <strong>value bet</strong> = notre probabilité estimée dépasse la probabilité implicite du bookmaker. Plus l'<strong>edge</strong> est élevé, plus le pari a de la valeur à long terme.
              <div className="mt-2 text-xs text-slate-600 bg-white border border-orange-100 rounded-lg p-3 font-mono">
                💡 Exemple : edge de +16% sur 5 000 FCFA → espérance de gain ≈ <strong>+800 FCFA</strong> par mise (sur le long terme, pas garanti par pari individuel).
              </div>
            </div>
          </div>
        </Card>

        {loading ? (
          <Skeleton className="h-96" />
        ) : isFree ? (
          <Card className="p-8 bg-white border-dashed border-orange-200 text-center" data-testid="value-bets-locked">
            <Lock className="h-12 w-12 text-orange-500 mx-auto mb-3" />
            <h2 className="font-heading text-2xl font-extrabold text-slate-900 mb-2">
              <span className="text-orange-600 font-mono">{data?.count || 0}</span> value bets détectés aujourd'hui
            </h2>
            <p className="text-slate-600 mb-5">Le détail (sport, match, marché, edge %) est réservé aux abonnés Pro.</p>
            <Button className="wp-gradient-warm text-white border-0" data-testid="upgrade-value-bets-btn" onClick={() => setPayState({ isOpen: true, tier: "PRO" })}><Sparkles className="h-4 w-4 mr-2" />Débloquer dès 4 900 FCFA/mois</Button>
          </Card>
        ) : !data?.bets?.length ? (
          <Card className="p-12 text-center bg-white border-neutral-200">
            <div className="text-slate-500">Aucun value bet identifié pour l'instant. Reviens dans quelques heures.</div>
          </Card>
        ) : (
          <Card className="bg-white border-neutral-200 overflow-hidden" data-testid="value-bets-table">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="font-heading font-bold text-slate-900">{data.bets.length} value bets actifs</h2>
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Triés par edge ↓</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Sport</th>
                    <th className="px-4 py-2.5 text-left">Match</th>
                    <th className="px-4 py-2.5 text-left">Marché</th>
                    <th className="px-4 py-2.5 text-left">Pick</th>
                    <th className="px-4 py-2.5 text-center">Notre %</th>
                    <th className="px-4 py-2.5 text-center">Implied</th>
                    <th className="px-4 py-2.5 text-center">Cote</th>
                    <th className="px-4 py-2.5 text-right">Edge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.bets.map((b, i) => {
                    const edgeCls = b.edge >= 15 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : b.edge >= 8 ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-rose-100 text-rose-700 border-rose-200";
                    return (
                      <tr key={i} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-xs text-slate-600">{b.sport_title}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-900 max-w-[200px] truncate">{b.home_team} vs {b.away_team}</td>
                        <td className="px-4 py-3 text-xs"><span className="bg-slate-900 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">{b.market_label}</span></td>
                        <td className="px-4 py-3 text-xs font-bold text-orange-600">{b.pick}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{b.our_prob}%</td>
                        <td className="px-4 py-3 text-center font-mono text-xs text-slate-500">{b.implied_prob}%</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{b.pick_odds}</td>
                        <td className="px-4 py-3 text-right">
                          <Badge className={cn("font-bold", edgeCls)}>+{b.edge}%</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      <PaymentModal
        isOpen={payState.isOpen}
        onClose={() => setPayState({ isOpen: false, tier: payState.tier })}
        targetTier={payState.tier}
      />
    </AppLayout>
  );
}
