
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { RefreshCw, TrendingUp, CheckCircle2, XCircle, Clock3, ShieldCheck } from "lucide-react";
import dayjs from "dayjs";

function statusLabel(status) {
  if (status === "ACTIVE") return { text: "EN COURS", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "FAILED") return { text: "ÉCHOUÉE", cls: "bg-rose-100 text-rose-700 border-rose-200" };
  if (status === "COMPLETED") return { text: "TERMINÉE", cls: "bg-blue-100 text-blue-700 border-blue-200" };
  return { text: "AUCUNE", cls: "bg-slate-100 text-slate-600 border-slate-200" };
}

export default function MontantePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [days, setDays] = useState(10);
  const [bankroll, setBankroll] = useState(10000);
  const isAdmin = Boolean(user?.is_admin);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/montante");
      setData(r.data);
    } catch (e) {
      setData({ status: "NONE", message: "Impossible de charger la montante." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await api.post("/montante/refresh");
      setData(r.data);
    } finally {
      setRefreshing(false);
    }
  };

  const start = async (restart = false) => {
    setStarting(true);
    try {
      const endpoint = restart ? "/montante/restart" : "/montante/start";
      const r = await api.post(endpoint, null, { params: { days, initial_bankroll: Number(bankroll) } });
      setData(r.data);
    } catch (e) {
      const detail = e?.response?.data?.detail || "Impossible de démarrer la montante.";
      alert(detail);
    } finally {
      setStarting(false);
    }
  };

  const st = statusLabel(data?.status);
  const progress = Number(data?.progress || 0);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white p-6 sm:p-8">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-orange-300 text-xs font-bold uppercase tracking-[0.18em]">
                <TrendingUp className="h-4 w-4" /> Montante WinPulse
              </div>
              <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-2">10 → 15 jours</h1>
              <p className="text-slate-300 text-sm mt-2 max-w-2xl">
                Chaque jour, le moteur sélectionne 1 ou 2 pronostics existants répondant aux critères de la montante.
                Une journée gagnée fait avancer la progression ; une journée perdue remet la série à l'état échoué.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`border ${st.cls}`}>{st.text}</Badge>
              <Button variant="outline" onClick={refresh} disabled={refreshing} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Actualiser
              </Button>
            </div>
          </div>
        </Card>

        {isAdmin && (
          <Card className="p-5 bg-white border-neutral-200">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="h-5 w-5 text-orange-600" />
              <h2 className="font-heading font-bold text-slate-900">Contrôle administrateur</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <select value={days} onChange={e => setDays(Number(e.target.value))} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
                <option value={10}>Montante 10 jours</option>
                <option value={15}>Montante 15 jours</option>
              </select>
              <input type="number" min="1" value={bankroll} onChange={e => setBankroll(e.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm" placeholder="Capital initial" />
              <div className="flex gap-2">
                <Button onClick={() => start(false)} disabled={starting} className="wp-gradient-warm text-white border-0 flex-1">Démarrer</Button>
                <Button onClick={() => start(true)} disabled={starting} variant="outline" className="flex-1">Recommencer</Button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Le démarrage/restart est volontairement réservé à l'administrateur pour éviter qu'un utilisateur ne réinitialise la série.</p>
          </Card>
        )}

        {loading ? (
          <Card className="p-10 text-center">Chargement de la montante…</Card>
        ) : !data || data.status === "NONE" ? (
          <Card className="p-10 text-center bg-white">
            <div className="text-4xl mb-3">📈</div>
            <h2 className="font-heading text-xl font-bold text-slate-900">Aucune montante active</h2>
            <p className="text-sm text-slate-500 mt-2">L'administrateur doit lancer une montante de 10 ou 15 jours.</p>
          </Card>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi label="Jour" value={`${data.current_day}/${data.days}`} sub="progression" />
              <Kpi label="Capital initial" value={`${Number(data.initial_bankroll || 0).toLocaleString()} FCFA`} sub="mise de départ" />
              <Kpi label="Capital théorique" value={`${Number(data.theoretical_bankroll || 0).toLocaleString()} FCFA`} sub="si les journées passent" />
              <Kpi label="Progression" value={`${progress}%`} sub="de la série" />
            </div>

            <Card className="p-5 bg-white border-neutral-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-800">Progression de la série</span>
                <span className="text-xs text-slate-500">Jour {data.current_day} sur {data.days}</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-orange-500 to-rose-500 rounded-full transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
              </div>
            </Card>

            <Card className="p-5 bg-white border-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-heading text-xl font-bold text-slate-900">Pronostics du jour</h2>
                  <p className="text-xs text-slate-500 mt-1">Confiance ≥ 70% · cote 1.20–1.50 · marchés réellement présents dans le moteur.</p>
                </div>
                {data.waiting_reason && <Badge variant="outline">{data.waiting_reason}</Badge>}
              </div>

              {data.current_picks?.length ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {data.current_picks.map((p, i) => (
                    <div key={`${p.event_id}-${i}`} className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-orange-700">Pick {i + 1}</span>
                        <span className="font-mono font-black text-orange-600">@ {p.odds}</span>
                      </div>
                      <div className="font-bold text-slate-900">{p.home_team} <span className="text-slate-400">vs</span> {p.away_team}</div>
                      <div className="text-sm text-orange-700 font-semibold mt-2">{p.pick}</div>
                      <div className="flex items-center gap-3 mt-4 text-xs text-slate-500">
                        <span>{p.market}</span>
                        <span>·</span>
                        <span>Confiance {Math.round((p.confidence || 0) * 100)}%</span>
                        <span>·</span>
                        <span>{p.league || p.sport_title || ""}</span>
                      </div>
                      {p.start_time && <div className="text-xs text-slate-400 mt-2">Début : {dayjs(p.start_time).format("DD/MM/YYYY HH:mm")}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                  <Clock3 className="h-7 w-7 mx-auto text-slate-400 mb-2" />
                  <p className="font-semibold text-slate-700">En attente d'un pick qualifié</p>
                  <p className="text-xs text-slate-500 mt-1">Le module ne force jamais un pronostic s'il ne respecte pas ses critères.</p>
                </div>
              )}
            </Card>

            <Card className="bg-white border-neutral-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100">
                <h2 className="font-heading font-bold text-slate-900">Historique</h2>
              </div>
              {!data.history?.length ? (
                <div className="p-6 text-sm text-slate-500">Aucune journée terminée.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {[...data.history].reverse().map((h, i) => (
                    <div key={`${h.day}-${i}`} className="px-5 py-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {h.status === "WIN" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-rose-500" />}
                        <div>
                          <div className="font-semibold text-sm">Jour {h.day} · {h.status === "WIN" ? "GAGNÉ" : "PERDU"}</div>
                          <div className="text-xs text-slate-500">{h.picks?.map(p => `${p.pick} @ ${p.odds}`).join(" · ")}</div>
                        </div>
                      </div>
                      {h.combined_odds && <span className="font-mono font-bold text-orange-600">x{h.combined_odds}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <p className="text-xs text-slate-400 text-center">Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.</p>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <Card className="bg-white border-neutral-200 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className="font-heading text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </Card>
  );
}
