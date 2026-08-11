import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Trophy, Target, Flame, ChevronLeft, ChevronRight as ChevR, Zap } from "lucide-react";
import dayjs from "dayjs";
export default function TrackRecordPage() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/track-record?page=${page}&per_page=20`)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [page]);
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center text-white shadow-lg">
              <Zap className="h-5 w-5" fill="white" />
            </div>
            <span className="font-heading font-extrabold text-lg">WinPulse</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost">Connexion</Button></Link>
            <Link to="/register"><Button className="wp-gradient-warm text-white border-0">Démarrer gratuit</Button></Link>
          </div>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Epic hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-slate-900 to-orange-900 text-white p-8 sm:p-12 mb-10 ring-1 ring-white/10">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-orange-400/30 blur-3xl pointer-events-none" />
          <div className="relative text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/20 border border-emerald-400/40 px-3 py-1 text-xs font-bold text-emerald-200 mb-4 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 live-dot" />
              Track Record officiel · vérifiable
            </div>
            <h1 className="font-heading text-4xl sm:text-6xl font-black tracking-tighter leading-[0.95]">
              Nos résultats.<br />
              <span className="bg-gradient-to-r from-emerald-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                Sans triche.
              </span>
            </h1>
            <p className="mt-4 text-slate-300 max-w-2xl mx-auto text-base">
              Les picks officiels sont sélectionnés avant le match selon des critères fixes. Les résultats confirmés restent affichés, gagnés comme perdus.
            </p>
          </div>
        </div>
        {loading || !data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}</div>
            <Skeleton className="h-96" />
          </div>
        ) : (
          <>
            {data.stats.current_streak >= 3 && (
              <div className="mb-6 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 p-5 text-white flex items-center gap-4 shadow-lg shadow-orange-500/20" data-testid="streak-banner">
                <div className="text-4xl">🔥</div>
                <div>
                  <div className="font-heading text-2xl font-black">
                    {data.stats.current_streak} victoires d'affilée !
                  </div>
                  <div className="text-sm text-white/90">
                    Notre série en cours — vérifiable dans le tableau ci-dessous
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8" data-testid="kpis">
              <Kpi icon={Target} label="Taux de réussite" value={`${data.stats.win_rate}%`} sub={`${data.stats.wins}/${data.stats.total} picks`} accent="emerald" />
              <Kpi icon={Flame} label="Série en cours" value={`${data.stats.current_streak}`} sub="picks gagnants" accent="orange" />
              <Kpi icon={Trophy} label="Cote moyenne" value={data.stats.avg_odds} sub="par pick" accent="amber" mono />
            </div>
            <Card className="bg-white border-neutral-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
                <h2 className="font-heading font-bold text-slate-900 flex items-center gap-2"><Activity className="h-5 w-5 text-orange-600" /> Track Record officiel</h2>
                <Badge variant="outline" className="text-xs">Sélection pré-match · résultats non modifiés</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Compétition</th>
                      <th className="px-4 py-2.5 text-left">Match</th>
                      <th className="px-4 py-2.5 text-left">Pick</th>
                      <th className="px-4 py-2.5 text-center">Cote</th>
                      <th className="px-4 py-2.5 text-center">Résultat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100" data-testid="results-table">
                    {data.results.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{dayjs(r.date).format("DD/MM")}</td>
                        <td className="px-4 py-3 text-slate-700 text-xs">{r.league}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 text-xs">{r.match}</td>
                        <td className="px-4 py-3 font-bold text-orange-600 text-xs">{r.pick}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{r.odds}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={r.status === "won" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-rose-100 text-rose-700 border-rose-200"}>
                            {r.status === "won" ? "GAGNÉ" : "PERDU"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">Page {data.page} sur {data.total_pages}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>    <Button size="sm" variant="outline" disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}>
                    <ChevR className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
            <div className="mt-10 text-center">
              <h3 className="font-heading text-2xl font-extrabold text-slate-900 mb-2">Découvre les picks officiels</h3>
              <p className="text-slate-600 mb-4">Rejoins les abonnés Pro pour avoir tous nos picks chaque jour.</p>
              <Link to="/register"><Button className="wp-gradient-warm text-white border-0 h-12 px-8 text-base">Démarrer gratuit</Button></Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function Kpi({ icon: Icon, label, value, sub, accent, mono }) {
  const cls = { emerald: "bg-emerald-50 text-emerald-700 border-emerald-200", rose: "bg-rose-50 text-rose-700 border-rose-200", orange: "bg-orange-50 text-orange-700 border-orange-200", amber: "bg-amber-50 text-amber-700 border-amber-200" }[accent];
  return (
    <Card className="bg-white border-neutral-200 p-4">
      <div className={`h-8 w-8 rounded-lg grid place-items-center border ${cls} mb-3`}><Icon className="h-4 w-4" /></div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">{label}</div>
      <div className={`font-heading text-2xl font-extrabold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </Card>
  );
}
