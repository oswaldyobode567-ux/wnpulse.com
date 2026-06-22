import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import MatchCard from "@/components/MatchCard";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Trophy, Flame, ChevronRight, Activity } from "lucide-react";
import dayjs from "dayjs";

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
  const [matches, setMatches] = useState([]);
  const [topPicks, setTopPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState("all");

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.get("/matches"),
      api.get("/predictions/top"),
    ])
      .then(([m, t]) => {
        if (!mounted) return;
        setMatches(m.data);
        setTopPicks(t.data);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    if (sport === "all") return matches;
    return matches.filter((m) => (m.sport_key || "").includes(sport));
  }, [matches, sport]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">
              {dayjs().format("dddd D MMMM YYYY")}
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Pronostics du jour
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-emerald-700 font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 live-dot" />
            Données live
          </div>
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
              {topPicks.slice(0,3).map((p) => (
                <Link key={p.match_id} to={`/app/match/${p.match_id}`} data-testid={`top-pick-${p.match_id}`}>
                  <Card className="relative overflow-hidden bg-gradient-to-br from-white to-slate-50 border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all h-full">
                    <div className="absolute top-3 right-3">
                      <ConfidenceBadge label={p.label} confidence={p.confidence} />
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 flex items-center gap-1">
                      <Flame className="h-3 w-3 text-orange-500" />
                      {p.sport_title}
                    </div>
                    <div className="space-y-1 mb-4">
                      <div className="font-heading font-bold text-base text-slate-900">{p.home_team}</div>
                      <div className="text-xs text-slate-400">vs</div>
                      <div className="font-heading font-bold text-base text-slate-900">{p.away_team}</div>
                    </div>
                    <div className="pt-3 border-t border-slate-100 flex items-end justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Pronostic</div>
                        <div className="text-base font-bold text-orange-600">{p.pick}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cote</div>
                        <div className="font-mono text-lg font-bold text-slate-900">{p.pick_odds}</div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

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
    </AppLayout>
  );
}
