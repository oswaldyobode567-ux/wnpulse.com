import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";

const SPORTS = [
  ["all", "Tous"],
  ["football", "Football"],
  ["basketball", "Basketball"],
  ["tennis", "Tennis"],
  ["hockey", "Hockey"],
  ["baseball", "Baseball"],
  ["mma", "MMA"],
  ["american_football", "Football américain"],
];

const SPORT_LABELS = Object.fromEntries(SPORTS);

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  } catch {
    return "—";
  }
}

function fmtOdds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "—";
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export default function TrackRecordPage() {
  const [data, setData] = useState({ stats: {}, results: [], page: 1, total_pages: 1 });
  const [page, setPage] = useState(1);
  const [sport, setSport] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = { page, per_page: 20 };
        if (sport !== "all") params.sport = sport;
        const response = await api.get("/track-record", { params });
        if (cancelled) return;

        const payload = safeObject(response?.data);
        setData({
          ...payload,
          stats: safeObject(payload.stats),
          results: Array.isArray(payload.results) ? payload.results : [],
          page: Math.max(1, Number(payload.page) || 1),
          total_pages: Math.max(1, Number(payload.total_pages) || 1),
        });
      } catch (e) {
        if (cancelled) return;
        const detail = e?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : (e?.message || "Impossible de charger le Track Record."));
        setData({ stats: {}, results: [], page: 1, total_pages: 1 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [page, sport]);

  const stats = safeObject(data.stats);
  const bySport = safeObject(stats.by_sport);
  const byLabel = safeObject(stats.by_label);
  const results = Array.isArray(data.results) ? data.results : [];

  const sportCards = useMemo(() => Object.entries(bySport), [bySport]);

  const selectSport = (value) => {
    setSport(value);
    setPage(1);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="rounded-3xl bg-slate-950 text-white p-7 sm:p-10 mb-7 shadow-xl">
          <p className="text-sm font-bold text-orange-300 uppercase tracking-wider">WinPulse · Track Record officiel</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-black">Nos résultats, gagnés comme perdus.</h1>
          <p className="mt-3 text-slate-300 max-w-3xl">Les résultats résolus restent visibles. Si aucune donnée officielle n'est encore disponible, la page doit afficher un état vide explicite et jamais un écran blanc.</p>
        </div>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="text-lg font-bold">Chargement du Track Record…</div>
            <div className="text-sm text-slate-500 mt-2">Lecture de l'historique des picks résolus.</div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 mb-6">
            <div className="font-black text-rose-800">Le Track Record n'a pas pu être chargé</div>
            <p className="mt-2 text-sm text-rose-700 break-words">{error}</p>
            <button className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white" onClick={() => window.location.reload()}>Réessayer</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {data.note && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 mb-6 text-sm text-blue-900">{String(data.note)}</div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-6 shadow-sm">
              <div className="font-black mb-3">Filtrer par sport</div>
              <div className="flex flex-wrap gap-2">
                {SPORTS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectSport(value)}
                    className={`rounded-xl border px-3 py-2 text-sm font-bold ${sport === value ? "border-orange-500 bg-orange-500 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Stat label="Taux de réussite" value={`${Number(stats.win_rate || 0).toFixed(1)}%`} sub={`${Number(stats.wins || 0)}/${Number(stats.total || 0)} picks`} />
              <Stat label="Série en cours" value={String(Number(stats.current_streak || 0))} sub="victoires" />
              <Stat label="Cote moyenne" value={fmtOdds(stats.avg_odds)} sub="par pick" />
              <Stat label="ROI 30 jours" value={`${Number(stats.roi_percent || 0).toFixed(1)}%`} sub={`${Number(stats.profit_units_30d || 0).toFixed(2)} unités`} />
            </div>

            {sportCards.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-6 shadow-sm">
                <h2 className="font-black mb-4">Résultats par sport</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {sportCards.map(([key, raw]) => {
                    const item = safeObject(raw);
                    return (
                      <button key={key} type="button" onClick={() => selectSport(key)} className="rounded-xl border border-slate-200 p-3 text-left hover:border-orange-300">
                        <div className="text-xs uppercase font-black text-slate-500">{SPORT_LABELS[key] || key}</div>
                        <div className="text-2xl font-black mt-1">{item.win_rate == null ? "—" : `${Number(item.win_rate).toFixed(1)}%`}</div>
                        <div className="text-xs text-slate-500">{Number(item.wins || 0)}/{Number(item.total || 0)} picks</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-6 shadow-sm">
              <h2 className="font-black mb-4">Résultats par niveau</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                {[['safe','SÛR'],['value','MODÉRÉ'],['risky','RISQUÉ']].map(([key,label]) => {
                  const item = safeObject(byLabel[key]);
                  return <Stat key={key} label={label} value={item.win_rate == null ? "—" : `${Number(item.win_rate).toFixed(1)}%`} sub={`${Number(item.wins || 0)}/${Number(item.total || 0)} picks`} />;
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="p-5 border-b border-slate-200">
                <h2 className="font-black text-lg">Historique officiel</h2>
                <p className="text-sm text-slate-500 mt-1">{results.length ? `${results.length} résultat(s) affiché(s)` : `Aucun résultat résolu pour ${SPORT_LABELS[sport] || sport}.`}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="p-3 text-left">Date</th><th className="p-3 text-left">Sport</th><th className="p-3 text-left">Compétition</th><th className="p-3 text-left">Match</th><th className="p-3 text-left">Pick</th><th className="p-3 text-center">Cote</th><th className="p-3 text-center">Résultat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.length === 0 ? (
                      <tr><td colSpan={7} className="p-10 text-center text-slate-500">Aucun résultat disponible pour le moment. Le prochain pick réconcilié apparaîtra ici automatiquement.</td></tr>
                    ) : results.map((r, i) => {
                      const status = String(r?.status || "").toLowerCase();
                      return (
                        <tr key={r?.id || `${r?.date || 'row'}-${i}`}>
                          <td className="p-3 whitespace-nowrap">{fmtDate(r?.date)}</td>
                          <td className="p-3 whitespace-nowrap font-bold">{SPORT_LABELS[r?.sport] || r?.sport || "—"}</td>
                          <td className="p-3">{r?.league || "—"}</td>
                          <td className="p-3 font-semibold">{r?.match || "—"}</td>
                          <td className="p-3 text-orange-600 font-black">{r?.pick || "—"}</td>
                          <td className="p-3 text-center">{fmtOdds(r?.odds)}</td>
                          <td className="p-3 text-center"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${status === 'won' ? 'bg-emerald-100 text-emerald-700' : status === 'void' ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-700'}`}>{status === 'won' ? 'GAGNÉ' : status === 'void' ? 'REMBOURSÉ' : 'PERDU'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-slate-500">Page {Number(data.page || 1)} / {Number(data.total_pages || 1)}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={Number(data.page || 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Précédent</button>
                  <button type="button" disabled={Number(data.page || 1) >= Number(data.total_pages || 1)} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Suivant</button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide font-black text-slate-500">{label}</div>
      <div className="mt-1 text-2xl sm:text-3xl font-black text-slate-950">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}
