import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, TrendingUp, Target, Trophy } from "lucide-react";
import dayjs from "dayjs";

export default function HistoryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/predictions/history")
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5" /> Transparence totale
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Track record
          </h1>
          <p className="mt-2 text-sm text-slate-600">Historique vérifiable de toutes nos prédictions. On gagne, on perd, on assume.</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-96" />
          </div>
        ) : (
          <>
            {/* Stats KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8" data-testid="stats-grid">
              <KpiCard icon={Target} label="Taux de réussite" value={`${data.stats.win_rate}%`} accent="emerald" />
              <KpiCard icon={TrendingUp} label="ROI" value={`${data.stats.roi_percent >= 0 ? "+" : ""}${data.stats.roi_percent}%`} accent={data.stats.roi_percent >= 0 ? "emerald" : "rose"} />
              <KpiCard icon={CheckCircle2} label="Pronostics gagnés" value={`${data.stats.wins}/${data.stats.total}`} accent="blue" />
              <KpiCard icon={Trophy} label="Cote moyenne" value={data.stats.avg_odds} accent="amber" mono />
            </div>

            {/* History list */}
            <Card className="bg-white border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-heading font-bold text-slate-900">Derniers pronostics</h2>
                <span className="text-xs text-slate-500">{data.predictions.length} entrées</span>
              </div>
              <div className="divide-y divide-slate-100">
                {data.predictions.map((row) => (
                  <div key={row.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50" data-testid={`history-row-${row.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 rounded-full grid place-items-center flex-shrink-0 ${row.won ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                        {row.won ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 text-sm truncate">{row.match}</div>
                        <div className="text-xs text-slate-500">
                          {dayjs(row.date).format("DD MMM")} · {row.league} · Pick: <span className="font-semibold text-slate-700">{row.pick}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <Badge variant="outline" className="font-mono">@{row.odds}</Badge>
                      <span className="text-xs text-slate-500 hidden sm:inline">{row.confidence}%</span>
                      <span className={`text-sm font-bold ${row.won ? "text-emerald-600" : "text-rose-600"}`}>
                        {row.won ? `+${(row.odds - 1).toFixed(2)}` : "-1.00"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function KpiCard({ icon: Icon, label, value, accent, mono }) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  }[accent];
  return (
    <Card className="bg-white border-slate-200 p-4">
      <div className={`h-8 w-8 rounded-lg grid place-items-center border ${colors} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{label}</div>
      <div className={`font-heading text-2xl font-extrabold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</div>
    </Card>
  );
}
