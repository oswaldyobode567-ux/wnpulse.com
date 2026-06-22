import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Link } from "react-router-dom";
import { Trophy, Flame } from "lucide-react";
import dayjs from "dayjs";

export default function TopPicksPage() {
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);

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

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4" data-testid="top-picks-grid">
            {picks.map((p, i) => (
              <Link key={p.match_id} to={`/app/match/${p.match_id}`} data-testid={`top-pick-card-${p.match_id}`}>
                <Card className="bg-white border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all h-full relative">
                  <div className="absolute top-3 right-3">
                    <ConfidenceBadge label={p.label} confidence={p.confidence} />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
                    <span className="bg-slate-900 text-white rounded-md px-1.5 py-0.5 font-mono">#{i+1}</span>
                    <Flame className="h-3 w-3 text-orange-500" />
                    {p.sport_title}
                    <span>·</span>
                    <span className="font-mono">{dayjs(p.commence_time).format("HH:mm")}</span>
                  </div>
                  <div className="font-heading font-bold text-lg text-slate-900 mb-1">{p.home_team}</div>
                  <div className="text-xs text-slate-400 mb-1">vs</div>
                  <div className="font-heading font-bold text-lg text-slate-900 mb-4">{p.away_team}</div>
                  <div className="pt-3 border-t border-slate-100 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Pronostic</div>
                      <div className="text-base font-bold text-blue-600">{p.pick}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cote</div>
                      <div className="font-mono text-xl font-bold text-slate-900">{p.pick_odds}</div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
