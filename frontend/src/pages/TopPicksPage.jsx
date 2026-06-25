import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Link } from "react-router-dom";
import { Trophy, Flame, Lock, Sparkles, ChevronRight } from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";

export default function TopPicksPage() {
  const { user } = useAuth();
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });
  const isFree = !user?.subscription_tier || user.subscription_tier === "free";

  useEffect(() => {
    api.get("/predictions/top").then((r) => setPicks(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5" /> Sélection éditoriale automatique
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            À la une — Top picks du jour
          </h1>
          <p className="mt-2 text-sm text-slate-600">Les pronostics avec la plus haute confiance, tous sports confondus.</p>
        </div>

        {isFree && (
          <Card className="mb-6 border-orange-200 bg-gradient-to-r from-orange-50 to-rose-50 p-4 flex items-center gap-3" data-testid="upgrade-banner-top">
            <div className="h-10 w-10 rounded-xl wp-gradient-warm grid place-items-center text-white flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-slate-900 text-sm">1 pick visible · {Math.max(0, picks.length - 1)} verrouillés</div>
              <div className="text-xs text-slate-700">Passe Pro pour voir tous les picks et les 3 combinés du jour.</div>
            </div>
            <Link to="/app/abonnement">
              <Button size="sm" className="wp-gradient-warm text-white border-0" data-testid="upgrade-cta-top">Débloquer</Button>
            </Link>
          </Card>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4" data-testid="top-picks-grid">
            {picks.map((p, i) => {
              const locked = p.locked || !p.pick;
              return (
              <Link key={p.match_id} to={`/app/match/${p.match_id}`} data-testid={`top-pick-card-${p.match_id}`}>
                <Card className={`border p-5 hover:shadow-md transition-all h-full relative ${locked ? "bg-neutral-50 border-dashed border-orange-200" : "bg-white border-orange-200/60"}`}>
                  <div className="absolute top-3 right-3">
                    {locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 text-xs font-bold">
                        <Lock className="h-3 w-3" /> PRO
                      </span>
                    ) : (
                      <ConfidenceBadge label={p.label} confidence={p.confidence} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
                    <span className="bg-slate-900 text-white rounded-md px-1.5 py-0.5 font-mono">#{i+1}</span>
                    <Flame className="h-3 w-3 text-orange-500" />
                    {p.sport_title}
                    <span>·</span>
                    <span className="font-mono">{dayjs(p.commence_time).format("DD/MM HH:mm")}</span>
                  </div>
                  <div className="font-heading font-bold text-lg text-slate-900 mb-1">{p.home_team}</div>
                  <div className="text-xs text-slate-400 mb-1">vs</div>
                  <div className="font-heading font-bold text-lg text-slate-900 mb-4">{p.away_team}</div>
                  <div className="pt-3 border-t border-slate-100 flex items-end justify-between">
                    {locked ? (
                      <div className="w-full">
                        <div className="text-[10px] uppercase tracking-wider text-orange-600 font-bold mb-1">Pronostic verrouillé</div>
                        <div className="text-xs text-slate-500">Passe Pro pour débloquer</div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Pronostic</div>
                          <div className="text-base font-bold text-orange-600">{p.pick}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cote</div>
                          <div className="font-mono text-xl font-bold text-slate-900">{p.pick_odds}</div>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              </Link>
              );
            })}
          </div>
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
