
import api from "@/lib/api";

const SPORTS = [
  ["all", "Tous les sports"],
  ["football", "Football"],
  ["basketball", "Basketball"],
  ["tennis", "Tennis"],
  ["hockey", "Hockey"],
  ["baseball", "Baseball"],
  ["mma", "MMA"],
  ["american_football", "Football américain"],
];

const LEVELS = [
  ["all", "Tous les niveaux", "Ensemble des picks résolus"],
  ["safe", "SÛR", "Sélections les plus prudentes"],
  ["value", "MODÉRÉ", "Équilibre rendement / risque"],
  ["risky", "RISQUÉ", "Sélections à volatilité élevée"],
];

const SPORT_LABELS = Object.fromEntries(SPORTS);
const LEVEL_LABELS = Object.fromEntries(LEVELS.map(([key, label]) => [key, label]));

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function fmtOdds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "—";
}

function fmtPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
}

function levelClass(level, active = false) {
  const map = {
    safe: active
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-emerald-200 bg-emerald-50 text-emerald-800",
    value: active
      ? "border-amber-500 bg-amber-500 text-white"
      : "border-amber-200 bg-amber-50 text-amber-800",
    risky: active
      ? "border-rose-600 bg-rose-600 text-white"
      : "border-rose-200 bg-rose-50 text-rose-800",
    all: active
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-200 bg-white text-slate-800",
  };
  return map[level] || map.all;
}

function resultBadge(status) {
  if (status === "won") return ["GAGNÉ", "bg-emerald-100 text-emerald-800 border-emerald-200"];
  if (status === "void") return ["REMBOURSÉ", "bg-slate-100 text-slate-700 border-slate-200"];
  return ["PERDU", "bg-rose-100 text-rose-800 border-rose-200"];
}

export default function TrackRecordPage() {
  const [data, setData] = useState({
    stats: {},
    sync: {},
    results: [],
    page: 1,
    total_pages: 1,
    total_results: 0,
  });
  const [page, setPage] = useState(1);
  const [sport, setSport] = useState("all");
  const [level, setLevel] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const params = { page, per_page: 20 };
        if (sport !== "all") params.sport = sport;
        if (level !== "all") params.label = level;

        const response = await api.get("/track-record", { params });
        if (cancelled) return;

        const payload = safeObject(response?.data);
        setData({
          ...payload,
          stats: safeObject(payload.stats),
          sync: safeObject(payload.sync),
          results: safeArray(payload.results),
          page: Math.max(1, toNumber(payload.page, 1)),
          total_pages: Math.max(1, toNumber(payload.total_pages, 1)),
          total_results: Math.max(0, toNumber(payload.total_results, 0)),
        });
      } catch (e) {
        if (cancelled) return;
        const detail = e?.response?.data?.detail;
        setError(
          typeof detail === "string"
            ? detail
            : e?.message || "Impossible de charger le Track Record."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, sport, level, reloadKey]);

  const stats = safeObject(data.stats);
  const sync = safeObject(data.sync);
  const bySport = safeObject(stats.by_sport);
  const byLabel = safeObject(stats.by_label);
  const results = safeArray(data.results);

  const sportCards = useMemo(() => {
    const entries = Object.entries(bySport);
    return entries.sort((a, b) => toNumber(b[1]?.total) - toNumber(a[1]?.total));
  }, [bySport]);

  const changeSport = (value) => {
    setSport(value);
    setLevel("all");
    setPage(1);
  };

  const changeLevel = (value) => {
    setLevel(value);
    setPage(1);
  };

  const overduePending = toNumber(sync.overdue_pending);
  const pendingTotal = toNumber(sync.pending_total);
  const totalPages = Math.max(1, toNumber(data.total_pages, 1));
  const currentPage = Math.min(totalPages, Math.max(1, toNumber(data.page, page)));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-7 overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
          <div className="p-7 sm:p-10">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">
              WinPulse · Track Record officiel
            </p>
            <h1 className="mt-3 max-w-4xl text-3xl font-black leading-tight sm:text-5xl">
              Performance vérifiable, sport par sport et niveau par niveau.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Chaque pronostic résolu reste visible, qu'il soit gagné, perdu ou remboursé.
              Les statistiques se recalculent automatiquement selon le sport et l'indice de réussite sélectionnés.
            </p>
          </div>

          <div className="grid border-t border-white/10 bg-white/5 sm:grid-cols-3">
            <HeaderMeta
              label="Dernier résultat concilié"
              value={fmtDate(sync.last_reconciled_at, true)}
            />
            <HeaderMeta
              label="Pronostics en attente"
              value={String(pendingTotal)}
              alert={overduePending > 0}
            />
            <HeaderMeta
              label="Dernier événement résolu"
              value={fmtDate(sync.latest_resolved_event_at, true)}
            />
          </div>
        </header>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="text-lg font-black">Chargement du Track Record…</div>
            <div className="mt-2 text-sm text-slate-500">
              Lecture des résultats résolus et recalcul des statistiques.
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <div className="font-black text-rose-900">Le Track Record n'a pas pu être chargé</div>
            <p className="mt-2 break-words text-sm text-rose-700">{error}</p>
            <button
              type="button"
              className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-black text-white"
              onClick={() => setReloadKey((v) => v + 1)}
            >
              Réessayer
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {data.note && (
              <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                {String(data.note)}
              </div>
            )}

            {overduePending > 0 && (
              <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <div className="font-black text-amber-950">Conciliation en cours de rattrapage</div>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  {overduePending} pronostic(s) dont l'événement a commencé depuis plus de 6 heures sont encore en attente de résultat.
                  Le serveur les resynchronise automatiquement ; ils rejoindront l'historique dès qu'un score final sera confirmé.
                </p>
              </div>
            )}

            <section className="mb-7">
              <SectionTitle
                eyebrow="Vue générale"
                title="Indicateurs du filtre actuel"
                description={`${SPORT_LABELS[sport] || sport} · ${LEVEL_LABELS[level] || level}`}
              />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <StatCard
                  label="Taux de réussite"
                  value={stats.win_rate == null ? "—" : fmtPercent(stats.win_rate)}
                  sub={`${toNumber(stats.wins)}/${toNumber(stats.total)} décisions`}
                />
                <StatCard
                  label="Gagnés"
                  value={String(toNumber(stats.wins))}
                  sub={`${toNumber(stats.losses)} perdu(s)`}
                />
                <StatCard
                  label="Remboursés"
                  value={String(toNumber(stats.voids))}
                  sub="hors taux de réussite"
                />
                <StatCard
                  label="ROI 30 jours"
                  value={fmtPercent(stats.roi_percent)}
                  sub={`${toNumber(stats.profit_units_30d).toFixed(2)} unité(s)`}
                />
                <StatCard
                  label="Cote moyenne"
                  value={fmtOdds(stats.avg_odds)}
                  sub="picks gagnés/perdus"
                />
                <StatCard
                  label="Série actuelle"
                  value={String(toNumber(stats.current_streak))}
                  sub="victoire(s) consécutive(s)"
                />
              </div>
            </section>

            <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionTitle
                eyebrow="Étape 1"
                title="Choisir un sport"
                description="Les niveaux de réussite se recalculent ensuite dans le sport sélectionné."
              />

              <div className="mb-4 flex flex-wrap gap-2">
                {SPORTS.map(([value, labelText]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeSport(value)}
                    className={`rounded-xl border px-3 py-2 text-sm font-black transition ${
                      sport === value
                        ? "border-orange-500 bg-orange-500 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-orange-300"
                    }`}
                  >
                    {labelText}
                  </button>
                ))}
              </div>

              {sportCards.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {sportCards.map(([key, raw]) => {
                    const item = safeObject(raw);
                    const active = sport === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => changeSport(key)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          active
                            ? "border-orange-500 bg-orange-50 ring-1 ring-orange-200"
                            : "border-slate-200 bg-slate-50 hover:border-orange-300"
                        }`}
                      >
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                          {SPORT_LABELS[key] || key}
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div className="text-2xl font-black text-slate-950">
                            {item.win_rate == null ? "—" : fmtPercent(item.win_rate)}
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <div>{toNumber(item.wins)}/{toNumber(item.total)}</div>
                            {toNumber(item.voids) > 0 && <div>{toNumber(item.voids)} remb.</div>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucune statistique par sport n'est encore disponible.</p>
              )}
            </section>

            <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionTitle
                eyebrow="Étape 2"
                title="Choisir l'indice de réussite"
                description={`Résultats calculés dans ${SPORT_LABELS[sport] || sport}.`}
              />

              <div className="grid gap-3 md:grid-cols-4">
                {LEVELS.map(([key, title, description]) => {
                  const item = key === "all" ? null : safeObject(byLabel[key]);
                  const active = level === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => changeLevel(key)}
                      className={`rounded-2xl border p-4 text-left transition ${levelClass(key, active)}`}
                    >
                      <div className="text-xs font-black uppercase tracking-wide">{title}</div>
                      {key === "all" ? (
                        <>
                          <div className="mt-2 text-2xl font-black">{toNumber(stats.resolved_total)}</div>
                          <div className={`mt-1 text-xs ${active ? "text-white/80" : "text-slate-500"}`}>résultat(s) du filtre courant</div>
                        </>
                      ) : (
                        <>
                          <div className="mt-2 text-2xl font-black">
                            {item.win_rate == null ? "—" : fmtPercent(item.win_rate)}
                          </div>
                          <div className={`mt-1 text-xs ${active ? "text-white/80" : "opacity-75"}`}>
                            {toNumber(item.wins)}/{toNumber(item.total)} décisions · {description}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5 sm:flex sm:items-end sm:justify-between sm:gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">Historique officiel</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    {SPORT_LABELS[sport] || sport} · {LEVEL_LABELS[level] || level}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {toNumber(data.total_results)} résultat(s) correspondant aux filtres.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReloadKey((v) => v + 1)}
                  className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:border-orange-300 sm:mt-0"
                >
                  Actualiser l'affichage
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1050px] w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Sport</th>
                      <th className="p-3 text-center">Indice</th>
                      <th className="p-3 text-left">Compétition</th>
                      <th className="p-3 text-left">Match</th>
                      <th className="p-3 text-left">Pick</th>
                      <th className="p-3 text-center">Cote</th>
                      <th className="p-3 text-center">Score</th>
                      <th className="p-3 text-center">Résultat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-10 text-center text-slate-500">
                          Aucun résultat résolu pour ces filtres. Les pronostics encore en attente de conciliation n'entrent pas dans les statistiques tant que leur score final n'est pas confirmé.
                        </td>
                      </tr>
                    ) : (
                      results.map((row, index) => {
                        const status = String(row?.status || "").toLowerCase();
                        const labelKey = String(row?.label || "").toLowerCase();
                        const [statusText, statusClass] = resultBadge(status);
                        return (
                          <tr key={row?.id || `${row?.date || "row"}-${index}`} className="hover:bg-slate-50/70">
                            <td className="p-3 whitespace-nowrap">{fmtDate(row?.date)}</td>
                            <td className="p-3 whitespace-nowrap font-bold">{SPORT_LABELS[row?.sport] || row?.sport || "—"}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${levelClass(labelKey, false)}`}>
                                {LEVEL_LABELS[labelKey] || "—"}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600">{row?.league || "—"}</td>
                            <td className="p-3 font-semibold">{row?.match || "—"}</td>
                            <td className="p-3 font-black text-orange-600">{row?.pick || "—"}</td>
                            <td className="p-3 text-center font-mono">{fmtOdds(row?.odds)}</td>
                            <td className="p-3 text-center font-semibold">{row?.final_score || "—"}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass}`}>
                                {statusText}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 p-4">
                <span className="text-sm text-slate-500">
                  Page {currentPage} / {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-40"
                  >
                    Précédent
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-40"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function HeaderMeta({ label, value, alert = false }) {
  return (
    <div className="border-white/10 px-6 py-4 sm:border-r last:border-r-0">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-sm font-black ${alert ? "text-amber-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-600">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}
