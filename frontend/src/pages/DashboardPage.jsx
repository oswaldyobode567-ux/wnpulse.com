import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import MatchCard from "@/components/MatchCard";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Trophy, Flame, ChevronRight, Activity, Lock, Sparkles } from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { RealtimeBar, FreshnessStamp } from "@/components/RealtimeBar";
import { useRealtimeMatches, useDataStatus } from "@/services/realtimeService";
import PaymentModal from "@/components/payment/PaymentModal";

const SPORT_FILTERS = [
  { key: "all", label: "Tous" },
  { key: "soccer", label: "Football" },
  { key: "basketball", label: "Basket" },
  { key: "tennis", label: "Tennis" },
  { key: "football", label: "NFL" },
  { key: "hockey", label: "Hockey" },
  { key: "mma", label: "MMA" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { matches, loading, lastUpdate, refresh: refreshMatches } = useRealtimeMatches();
  const { status } = useDataStatus();
  const [topPicks, setTopPicks] = useState([]);
  const [topLoading, setTopLoading] = useState(true);
  const [sport, setSport] = useState("all");
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });
  const isFree = !user?.subscription_tier || user.subscription_tier === "free";

  useEffect(() => {
    let mounted = true;
    api.get("/predictions/top")
      .then((t) => { if (mounted) setTopPicks(t.data); })
      .finally(() => mounted && setTopLoading(false));
    return () => { mounted = false; };
  }, [lastUpdate]);

  const filtered = useMemo(() => {
    if (sport === "all") return matches;
    return matches.filter((m) => (m.sport_key || "").includes(sport));
  }, [matches, sport]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">
              {dayjs().format("dddd D MMMM YYYY")}
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Pronostics du jour
            </h1>
          </div>
        </div>
        <div className="mb-8">
          <RealtimeBar onRefresh={refreshMatches} />
          <FreshnessStamp label="Cotes mises à jour" ts={lastUpdate} />
        </div>

        {/* À la une */}
        <section className="mb-10" data-testid="featured-section">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="font-heading text-xl font-bold text-slate-900">À la une</h2>
              <span className="text-xs text-slate-500">Top confiance</span>
            </div>
            <Link to="/app/top" className="text-sm text-orange-600 font-semibold flex items-center gap-1 hover:underline" data-testid="see-all-top-link">
              Tout voir <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topPicks.slice(0,3).map((p) => {
                const locked = p.locked || !p.pick;
                return (
                <Link key={p.match_id} to={`/app/match/${p.match_id}`} data-testid={`top-pick-${p.match_id}`}>
                  <Card className={`relative overflow-hidden border p-5 hover:shadow-md transition-all h-full ${locked ? "bg-neutral-50 border-dashed border-orange-200" : "bg-gradient-to-br from-white to-orange-50/30 border-orange-200/60"}`}>
                    <div className="absolute top-3 right-3">
                      {locked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 text-xs font-bold">
                          <Lock className="h-3 w-3" /> PRO
                        </span>
                      ) : (
                        <ConfidenceBadge label={p.label} confidence={p.confidence} />
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 flex items-center gap-1">
                      <Flame className="h-3 w-3 text-orange-500" />
                      {p.sport_title}
                    </div>
                    <div className={`space-y-1 mb-4 ${locked ? "" : ""}`}>
                      <div className="font-heading font-bold text-base text-slate-900">{p.home_team}</div>
                      <div className="text-xs text-slate-400">vs</div>
                      <div className="font-heading font-bold text-base text-slate-900">{p.away_team}</div>
                    </div>
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
                            <div className="font-mono text-lg font-bold text-slate-900">{p.pick_odds}</div>
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
        </section>

        {/* Free tier upgrade CTA */}
        {isFree && (
          <Card className="mb-8 border-orange-200 bg-gradient-to-r from-orange-50 to-rose-50 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4" data-testid="upgrade-banner">
            <div className="h-11 w-11 rounded-xl wp-gradient-warm grid place-items-center text-white flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-bold text-slate-900">Tu n'as accès qu'au pick gratuit du jour.</div>
              <div className="text-sm text-slate-700">
                Débloque <strong>tous les pronostics</strong>, les <strong>3 combinés</strong> (Sécurité / Équilibre / Jackpot) et l'<strong>analyse IA</strong> dès <strong>4 900 FCFA / mois</strong>.
              </div>
            </div>
            <Button
              className="wp-gradient-warm text-white border-0 hover:opacity-90"
              data-testid="upgrade-cta-dashboard"
              onClick={() => setPayState({ isOpen: true, tier: "PRO" })}
            >
              Passer Pro <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Card>
        )}

        {/* Filters */}
        <section data-testid="matches-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-600" />
              Matchs du jour
              <span className="text-xs font-normal text-slate-500">({filtered.length})</span>
            </h2>
          </div>

          <Tabs value={sport} onValueChange={setSport} className="mb-6">
            <TabsList className="bg-slate-100 overflow-x-auto scrollbar-thin">
              {SPORT_FILTERS.map((s) => (
                <TabsTrigger
                  key={s.key}
                  value={s.key}
                  data-testid={`sport-filter-${s.key}`}
                  className="data-[state=active]:bg-white"
                >
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200">
              <div className="text-slate-500">Aucun match pour ce sport aujourd'hui.</div>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          )}
        </section>
      </div>
      <PaymentModal
        isOpen={payState.isOpen}
        onClose={() => setPayState({ isOpen: false, tier: payState.tier })}
        targetTier={payState.tier}
      />
    </AppLayout>
  );
}
