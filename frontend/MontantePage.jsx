import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { RefreshCw, TrendingUp, CheckCircle2, XCircle, Clock3, ShieldCheck, Lock } from "lucide-react";
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
  const [error, setError] = useState("");
  const [days, setDays] = useState(10);
  const [bankroll, setBankroll] = useState(10000);
  const isAdmin = Boolean(user?.is_admin);
  const subscriptionTier = String(
    user?.subscription_tier || user?.subscription || "free"
  ).toLowerCase();
  const hasPremiumAccess = isAdmin || subscriptionTier !== "free";
  const picksLocked = data?.picks_locked === true || !hasPremiumAccess;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api.get("/montante");
      setData(r?.data || { status: "NONE", message: "Aucune montante active." });
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Impossible de charger la montante.";
      setError(String(detail));
      setData({ status: "NONE", message: String(detail) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      // Le refresh serveur avec réconciliation forcée reste réservé à l'admin.
      // Pour Free/Pro, un GET suffit et évite un 403 inutile.
      const r = isAdmin
        ? await api.post("/montante/refresh")
        : await api.get("/montante");
      setData(r?.data || { status: "NONE", message: "Aucune montante active." });
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Impossible d'actualiser la montante.";
      setError(String(detail));
    } finally {
      setRefreshing(false);
    }
  };

  const start = async (restart = false) => {
    const capital = Number(bankroll);
    if (!Number.isFinite(capital) || capital <= 0) {
      setError("Le capital initial doit être un nombre positif.");
      return;
    }

    setStarting(true);
    setError("");
    try {
      const endpoint = restart ? "/montante/restart" : "/montante/start";
      const r = await api.post(endpoint, null, {
        params: { days, initial_bankroll: capital },
      });
      setData(r?.data || null);
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Impossible de démarrer la montante.";
      setError(String(detail));
    } finally {
      setStarting(false);
    }
  };

  const st = statusLabel(data?.status);
  const progress = data?.status === "COMPLETED" ? 100 : Number(data?.progress || 0);
  const currentPickPreview = Array.isArray(data?.current_picks_preview)
    ? data.current_picks_preview
    : [];

  const currentPickCount = Number(
    currentPickPreview.length ||
    data?.current_pick_count ||
    (Array.isArray(data?.current_picks) ? data.current_picks.length : 0)
  );

  const historyItems = Array.isArray(data?.history) ? data.history : [];
  const latestHistoryItem = historyItems.length
    ? historyItems[historyItems.length - 1]
    : null;
  const latestHistoryPickCount = Number(
    latestHistoryItem?.pick_count ??
    (Array.isArray(latestHistoryItem?.picks_preview)
      ? latestHistoryItem.picks_preview.length
      : Array.isArray(latestHistoryItem?.picks)
        ? latestHistoryItem.picks.length
        : 0)
  );

  // Si les picks de la journée viennent juste d'être réglés, current_picks peut
  // déjà être vide alors que la dernière journée possède bien des picks.
  // Le Free doit encore voir qu'ils existent dans l'historique, toujours verrouillés.
  const lockedDisplayCount =
    currentPickCount > 0 ? currentPickCount : latestHistoryPickCount;
  const lockedDisplayIsCurrent = currentPickCount > 0;

  const currentStake = Number(
    data?.current_stake ??
    (data?.status === "ACTIVE" ? data?.theoretical_bankroll : 0) ??
    0
  );

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
                Le capital est réinvesti à 100 % : la mise suivante correspond à la mise précédente + son gain.
                Une journée perdue met fin à la série.
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

        {error && (
          <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="font-bold">Montante indisponible</div>
            <div className="mt-1">{error}</div>
          </Card>
        )}

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
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Kpi label="Jour" value={`${data.current_day}/${data.days}`} sub="progression" />
              <Kpi label="Capital initial" value={`${Number(data.initial_bankroll || 0).toLocaleString("fr-FR")} FCFA`} sub="mise de départ" />
              <Kpi
                label="Capital théorique"
                value={`${Number(data.theoretical_bankroll || 0).toLocaleString("fr-FR")} FCFA`}
                sub={data.status === "FAILED" ? "capital après perte" : "mise + gains cumulés"}
              />
              <Kpi
                label="Mise du jour"
                value={`${currentStake.toLocaleString("fr-FR")} FCFA`}
                sub={data.status === "ACTIVE" ? "100 % du capital réinvesti" : "aucune mise active"}
              />
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

              {picksLocked ? (
                lockedDisplayCount > 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-orange-200 bg-orange-50/70 px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2 text-orange-700 font-bold">
                        <Lock className="h-4 w-4" />
                        {lockedDisplayCount} {lockedDisplayCount > 1 ? "picks Montante" : "pick Montante"} {lockedDisplayIsCurrent ? "sélectionnés pour cette journée" : "dans la dernière journée"}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Les picks existent bien, mais leurs équipes, marchés, sélections et cotes sont réservés aux comptes Pro.
                      </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {Array.from({ length: lockedDisplayCount }).map((_, i) => (
                        <div
                          key={`locked-montante-pick-${i}`}
                          className="relative overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-white to-orange-50/50 p-5"
                        >
                          <div className="absolute inset-0 bg-white/35 backdrop-blur-[1px] pointer-events-none" />
                          <div className="relative z-10">
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-[10px] uppercase tracking-wider font-bold text-orange-700">
                                Pick {i + 1}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 text-[10px] font-bold">
                                <Lock className="h-3 w-3" /> PRO
                              </span>
                            </div>

                            <div className="space-y-2">
                              <div className="h-4 w-4/5 rounded bg-slate-200" />
                              <div className="h-4 w-3/5 rounded bg-slate-200" />
                              <div className="flex gap-2 pt-2">
                                <div className="h-7 w-20 rounded-full bg-orange-100" />
                                <div className="h-7 w-24 rounded-full bg-slate-100" />
                              </div>
                            </div>

                            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <Lock className="h-3.5 w-3.5 text-orange-600" />
                              Sélection verrouillée
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="text-center">
                      <Link
                        to="/app/abonnement"
                        className="inline-flex items-center justify-center rounded-md px-5 h-11 wp-gradient-warm text-white font-semibold text-sm hover:opacity-90"
                      >
                        Passer Pro pour voir les picks — 10 500 FCFA/mois
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <Clock3 className="h-7 w-7 mx-auto text-slate-400 mb-2" />
                    <p className="font-semibold text-slate-700">Aucune sélection Montante enregistrée pour le moment</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Dès qu'un ou plusieurs picks sont sélectionnés par le moteur, le compte Free verra ici les cartes verrouillées correspondantes.
                    </p>
                  </div>
                )
              ) : data.current_picks?.length ? (
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
                        {h.status === "WIN" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : h.status === "VOID" ? (
                          <Clock3 className="h-5 w-5 text-slate-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-rose-500" />
                        )}
                        <div>
                          <div className="font-semibold text-sm">
                            Jour {h.day} · {h.status === "WIN" ? "GAGNÉ" : h.status === "VOID" ? "REMBOURSÉ" : "PERDU"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {picksLocked
                              ? `${Number(h.pick_count || 0)} ${Number(h.pick_count || 0) > 1 ? "picks verrouillés" : "pick verrouillé"} · réservé aux abonnés WinPulse Pro`
                              : h.picks?.map(p => `${p.pick} @ ${p.odds}`).join(" · ")}
                          </div>

                          {(h.stake_before != null || h.bankroll_after != null) && (
                            <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                              {h.stake_before != null && (
                                <span>Mise : <strong className="text-slate-700">{Number(h.stake_before).toLocaleString("fr-FR")} FCFA</strong></span>
                              )}
                              {h.profit != null && (
                                <span>
                                  Gain : <strong className={Number(h.profit) >= 0 ? "text-emerald-700" : "text-rose-700"}>
                                    {Number(h.profit) > 0 ? "+" : ""}{Number(h.profit).toLocaleString("fr-FR")} FCFA
                                  </strong>
                                </span>
                              )}
                              {h.bankroll_after != null && (
                                <span>Capital après : <strong className="text-slate-700">{Number(h.bankroll_after).toLocaleString("fr-FR")} FCFA</strong></span>
                              )}
                            </div>
                          )}
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
