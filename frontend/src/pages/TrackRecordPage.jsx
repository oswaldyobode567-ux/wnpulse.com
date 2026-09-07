import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Trophy,
  Target,
  Flame,
  ChevronLeft,
  ChevronRight as ChevR,
  Zap,
  Info,
  CircleDot,
  TrendingUp,
} from "lucide-react";
import dayjs from "dayjs";

const LABEL_META = {
  safe: { text: "SÛR", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  value: { text: "MODÉRÉ", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  risky: { text: "RISQUÉ", cls: "bg-rose-100 text-rose-700 border-rose-200" },
};

const RESULT_META = {
  won: { text: "GAGNÉ", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  lost: { text: "PERDU", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  void: { text: "REMBOURSÉ", cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

export default function TrackRecordPage() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sport, setSport] = useState("all");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    const sportParam = sport !== "all" ? `&sport=${encodeURIComponent(sport)}` : "";

    api.get(`/track-record?page=${page}&per_page=20${sportParam}`)
      .then((r) => {
        if (mounted) setData(r.data);
      })
      .catch((err) => {
        if (mounted) {
          setData(null);
          setError(err?.response?.data?.detail || "Impossible de charger le Track Record.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [page, sport]);

  const changeSport = (value) => {
    setSport(value);
    setPage(1);
  };

  const sportOptions = useMemo(() => {
    const keys = Object.keys(data?.stats?.by_sport || {});
    return [["all", "Tous"], ...keys.map((key) => [key, formatSport(key)])];
  }, [data]);

  const currentPage = data?.page || page;
  const totalPages = data?.total_pages || 1;
  const selectedSportLabel = sport === "all" ? "Tous les sports" : formatSport(sport);

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
            <Link to="/login">
              <Button variant="ghost">Connexion</Button>
            </Link>
            <Link to="/register">
              <Button className="wp-gradient-warm text-white border-0">Démarrer gratuit</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
                Sans sélection a posteriori.
              </span>
            </h1>
            <p className="mt-4 text-slate-300 max-w-2xl mx-auto text-base">
              Les picks officiels sont enregistrés avant le match selon des critères fixes. Les résultats confirmés restent affichés, gagnés comme perdus.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
            </div>
            <Skeleton className="h-96" />
          </div>
        ) : error ? (
          <Card className="p-8 text-center border-rose-200 bg-rose-50">
            <div className="font-heading font-bold text-rose-800 mb-2">Erreur de chargement</div>
            <p className="text-sm text-rose-700">{error}</p>
            <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
              Réessayer
            </Button>
          </Card>
        ) : !data ? (
          <Card className="p-8 text-center">
            <p className="text-slate-500">Aucun résultat disponible.</p>
          </Card>
        ) : (
          <>
            {data.transition_mode && data.note && (
              <div
                className="mb-6 rounded-2xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3"
                data-testid="transition-mode-banner"
              >
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-900">{data.note}</p>
              </div>
            )}

            {data.stats?.current_streak >= 3 && (
              <div
                className="mb-6 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 p-5 text-white flex items-center gap-4 shadow-lg shadow-orange-500/20"
                data-testid="streak-banner"
              >
                <div className="text-4xl" aria-hidden="true">🔥</div>
                <div>
                  <div className="font-heading text-2xl font-black">
                    {data.stats.current_streak} victoires d&apos;affilée !
                  </div>
                  <div className="text-sm text-white/90">
                    Série calculée uniquement à partir des résultats du filtre actif.
                  </div>
                </div>
              </div>
            )}

            <Card className="bg-white border-neutral-200 p-4 mb-6" data-testid="sport-filters">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <CircleDot className="h-4 w-4 text-orange-600" />
                  <h2 className="font-heading font-bold text-slate-900">Filtrer par sport</h2>
                </div>
                <span className="text-xs text-slate-500">{selectedSportLabel}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sportOptions.map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={sport === value ? "default" : "outline"}
                    onClick={() => changeSport(value)}
                    className={sport === value ? "wp-gradient-warm text-white border-0" : ""}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </Card>

            {Object.keys(data.stats?.by_sport || {}).length > 0 && (
              <Card className="bg-white border-neutral-200 p-5 mb-6" data-testid="by-sport-stats">
                <h2 className="font-heading font-bold text-slate-900 mb-4">Résultats par sport</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                  {Object.entries(data.stats.by_sport).map(([key, d]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => changeSport(key)}
                      className={`text-left rounded-xl border p-3 transition ${
                        sport === key
                          ? "border-orange-400 ring-2 ring-orange-100"
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                    >
                      <div className="text-xs font-bold uppercase text-slate-500">{formatSport(key)}</div>
                      <div className="font-heading text-2xl font-black text-slate-900 mt-1">
                        {d?.win_rate != null ? `${d.win_rate}%` : "—"}
                      </div>
                      <div className="text-xs text-slate-500">{d?.wins ?? 0}/{d?.total ?? 0} picks</div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="kpis">
              <Kpi
                icon={Target}
                label="Taux de réussite"
                value={`${data.stats?.win_rate ?? 0}%`}
                sub={`${data.stats?.wins ?? 0}/${data.stats?.total ?? 0} picks · ${selectedSportLabel}`}
                accent="emerald"
              />
              <Kpi
                icon={Flame}
                label="Série en cours"
                value={`${data.stats?.current_streak ?? 0}`}
                sub="picks gagnants consécutifs"
                accent="orange"
              />
              <Kpi
                icon={Trophy}
                label="Cote moyenne"
                value={formatOdds(data.stats?.avg_odds)}
                sub="par pick résolu"
                accent="amber"
                mono
              />
              <Kpi
                icon={TrendingUp}
                label="ROI · 30 jours"
                value={formatPercent(data.stats?.roi_percent)}
                sub={`${formatSignedNumber(data.stats?.profit_units_30d)} unité(s)`}
                accent={(data.stats?.roi_percent ?? 0) >= 0 ? "emerald" : "rose"}
              />
            </div>

            {data.stats?.by_label && (
              <Card className="bg-white border-neutral-200 p-5 mb-8" data-testid="by-label-stats">
                <h2 className="font-heading font-bold text-slate-900 mb-4">
                  Taux de réussite par niveau de confiance
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {Object.keys(LABEL_META).map((lbl) => {
                    const d = data.stats.by_label[lbl] || { wins: 0, total: 0, win_rate: null };
                    const meta = LABEL_META[lbl];
                    return (
                      <div key={lbl} className="rounded-xl border border-neutral-200 p-4">
                        <Badge className={`text-[10px] font-bold border mb-2 ${meta.cls}`}>{meta.text}</Badge>
                        <div className="font-heading text-3xl font-black text-slate-900">
                          {d.win_rate != null ? `${d.win_rate}%` : "—"}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {d.total > 0 ? `${d.wins}/${d.total} picks résolus` : "Pas encore de résultat"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-4">
                  Le niveau Sûr / Modéré / Risqué est fixé avant le match. Les statistiques sont donc affichées séparément pour éviter de mélanger des niveaux de risque différents.
                </p>
              </Card>
            )}

            <Card className="bg-white border-neutral-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 className="font-heading font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-orange-600" />
                  Track Record officiel
                </h2>
                <Badge variant="outline" className="text-xs w-fit">
                  Sélection pré-match · résultats conservés
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Sport</th>
                      <th className="px-4 py-2.5 text-left">Compétition</th>
                      <th className="px-4 py-2.5 text-left">Match</th>
                      <th className="px-4 py-2.5 text-left">Pick</th>
                      <th className="px-4 py-2.5 text-center">Niveau</th>
                      <th className="px-4 py-2.5 text-center">Cote</th>
                      <th className="px-4 py-2.5 text-center">Résultat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100" data-testid="results-table">
                    {data.results?.length > 0 ? data.results.map((r) => {
                      const labelMeta = LABEL_META[r.label] || null;
                      const resultMeta = RESULT_META[r.status] || RESULT_META.lost;
                      return (
                        <tr key={`${r.id || r.match}-${r.date}`} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                            {r.date ? dayjs(r.date).format("DD/MM/YYYY") : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-700 text-xs font-semibold whitespace-nowrap">
                            {formatSport(r.sport)}
                          </td>
                          <td className="px-4 py-3 text-slate-700 text-xs">{r.league || "—"}</td>
                          <td className="px-4 py-3 font-medium text-slate-900 text-xs min-w-48">{r.match || "—"}</td>
                          <td className="px-4 py-3 font-bold text-orange-600 text-xs min-w-40">{r.pick || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            {labelMeta ? (
                              <Badge className={`text-[10px] font-bold border ${labelMeta.cls}`}>{labelMeta.text}</Badge>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs">{formatOdds(r.odds)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`border ${resultMeta.cls}`}>{resultMeta.text}</Badge>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                          Aucun résultat résolu pour {selectedSportLabel.toLowerCase()}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">Page {currentPage} sur {totalPages}</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Page précédente"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Page suivante"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  >
                    <ChevR className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>

            <div className="mt-10 text-center">
              <h3 className="font-heading text-2xl font-extrabold text-slate-900 mb-2">Découvre les picks officiels</h3>
              <p className="text-slate-600 mb-4">Rejoins les abonnés Pro pour accéder à toutes les analyses et sélections du jour.</p>
              <Link to="/register">
                <Button className="wp-gradient-warm text-white border-0 h-12 px-8 text-base">Démarrer gratuit</Button>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function formatSport(value) {
  const key = String(value || "").toLowerCase().trim();
  const labels = {
    football: "⚽ Football",
    soccer: "⚽ Football",
    basketball: "🏀 Basketball",
    tennis: "🎾 Tennis",
    hockey: "🏒 Hockey",
    baseball: "⚾ Baseball",
    mma: "🥊 MMA",
    american_football: "🏈 Football américain",
    americanfootball: "🏈 Football américain",
  };
  return labels[key] || (value ? String(value) : "—");
}

function formatOdds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "—";
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function formatSignedNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
}

function Kpi({ icon: Icon, label, value, sub, accent = "emerald", mono = false }) {
  const classes = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const cls = classes[accent] || classes.emerald;

  return (
    <Card className="bg-white border-neutral-200 p-4">
      <div className={`h-8 w-8 rounded-lg grid place-items-center border ${cls} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">{label}</div>
      <div className={`font-heading text-2xl font-extrabold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </Card>
  );
}
