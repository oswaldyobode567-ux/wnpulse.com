import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import MatchDetailPage from "@/pages/MatchDetailPage";
import CombosPage from "@/pages/CombosPage";
import HistoryPage from "@/pages/HistoryPage";
import SubscriptionPage from "@/pages/SubscriptionPage";
import TopPicksPage from "@/pages/TopPicksPage";
import AdminPage from "@/pages/AdminPage";
import TrackRecordPage from "@/pages/TrackRecordPage";
import ValueBetsPage from "@/pages/ValueBetsPage";
import ProfilePage from "@/pages/ProfilePage";
import ParrainagePage from "@/pages/ParrainagePage";
import ComboBuilderPage from "@/pages/ComboBuilderPage";
import TodayCombosPage from "@/pages/TodayCombosPage";
import LivePage from "@/pages/LivePage";
import BlogPage from "@/pages/BlogPage";
import BlogPostPage from "@/pages/BlogPostPage";
import LegalPage from "@/pages/LegalPage";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import PageTracker from "@/components/PageTracker";

import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import dayjs from "dayjs";

function statusLabel(status) {
  if (status === "ACTIVE") {
    return {
      text: "EN COURS",
      cls: "bg-emerald-100 text-emerald-700 border-emerald-200",
    };
  }

  if (status === "FAILED") {
    return {
      text: "ÉCHOUÉE",
      cls: "bg-rose-100 text-rose-700 border-rose-200",
    };
  }

  if (status === "COMPLETED") {
    return {
      text: "TERMINÉE",
      cls: "bg-blue-100 text-blue-700 border-blue-200",
    };
  }

  return {
    text: "AUCUNE",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  };
}

function MontantePage() {
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState(10);
  const [bankroll, setBankroll] = useState(10000);

  const isAdmin = Boolean(user?.is_admin);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/montante");

      setData(
        response?.data || {
          status: "NONE",
          message: "Aucune montante active.",
        }
      );
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Impossible de charger la montante.";

      setError(String(detail));
      setData({
        status: "NONE",
        message: String(detail),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");

    try {
      const response = await api.post("/montante/refresh");

      setData(
        response?.data || {
          status: "NONE",
          message: "Aucune montante active.",
        }
      );
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Impossible d'actualiser la montante.";

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

    if (![10, 15].includes(Number(days))) {
      setError("La montante doit durer 10 ou 15 jours.");
      return;
    }

    setStarting(true);
    setError("");

    try {
      const endpoint = restart
        ? "/montante/restart"
        : "/montante/start";

      const response = await api.post(endpoint, null, {
        params: {
          days: Number(days),
          initial_bankroll: capital,
        },
      });

      setData(response?.data || null);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Impossible de démarrer la montante.";

      setError(String(detail));
    } finally {
      setStarting(false);
    }
  };

  const status = statusLabel(data?.status);
  const progress =
    data?.status === "COMPLETED"
      ? 100
      : Number(data?.progress || 0);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white p-6 sm:p-8">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-orange-300 text-xs font-bold uppercase tracking-[0.18em]">
                <TrendingUp className="h-4 w-4" />
                Montante WinPulse
              </div>

              <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-2">
                10 → 15 jours
              </h1>

              <p className="text-slate-300 text-sm mt-2 max-w-2xl">
                Chaque jour, le moteur sélectionne 1 ou 2 pronostics existants
                répondant aux critères de la montante. Une journée gagnée fait
                avancer la progression ; une journée perdue met fin à la série.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge className={`border ${status.cls}`}>
                {status.text}
              </Badge>

              <Button
                type="button"
                variant="outline"
                onClick={refresh}
                disabled={refreshing || loading}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />
                Actualiser
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

              <h2 className="font-heading font-bold text-slate-900">
                Contrôle administrateur
              </h2>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <select
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value={10}>Montante 10 jours</option>
                <option value={15}>Montante 15 jours</option>
              </select>

              <input
                type="number"
                min="1"
                value={bankroll}
                onChange={(event) => setBankroll(event.target.value)}
                className="h-10 rounded-md border border-slate-200 px-3 text-sm"
                placeholder="Capital initial"
              />

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => start(false)}
                  disabled={starting}
                  className="wp-gradient-warm text-white border-0 flex-1"
                >
                  Démarrer
                </Button>

                <Button
                  type="button"
                  onClick={() => start(true)}
                  disabled={starting}
                  variant="outline"
                  className="flex-1"
                >
                  Recommencer
                </Button>
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-3">
              Le démarrage et le redémarrage sont réservés à l'administrateur
              afin d'éviter qu'un utilisateur ne réinitialise la série.
            </p>
          </Card>
        )}

        {loading ? (
          <Card className="p-10 text-center">
            Chargement de la montante…
          </Card>
        ) : !data || data.status === "NONE" ? (
          <Card className="p-10 text-center bg-white">
            <TrendingUp className="h-9 w-9 mx-auto text-orange-500 mb-3" />

            <h2 className="font-heading text-xl font-bold text-slate-900">
              Aucune montante active
            </h2>

            <p className="text-sm text-slate-500 mt-2">
              L'administrateur doit lancer une montante de 10 ou 15 jours.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                label="Jour"
                value={`${data.current_day}/${data.days}`}
                sub="progression"
              />

              <Kpi
                label="Capital initial"
                value={`${Number(
                  data.initial_bankroll || 0
                ).toLocaleString()} FCFA`}
                sub="mise de départ"
              />

              <Kpi
                label="Capital théorique"
                value={`${Number(
                  data.theoretical_bankroll || 0
                ).toLocaleString()} FCFA`}
                sub="si les journées passent"
              />

              <Kpi
                label="Progression"
                value={`${progress}%`}
                sub="de la série"
              />
            </div>

            <Card className="p-5 bg-white border-neutral-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-800">
                  Progression de la série
                </span>

                <span className="text-xs text-slate-500">
                  Jour {data.current_day} sur {data.days}
                </span>
              </div>

              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-rose-500 rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, Number(progress) || 0)
                    )}%`,
                  }}
                />
              </div>
            </Card>

            <Card className="p-5 bg-white border-neutral-200">
              <div className="flex items-center justify-between mb-4 gap-3">
                <div>
                  <h2 className="font-heading text-xl font-bold text-slate-900">
                    Pronostics du jour
                  </h2>

                  <p className="text-xs text-slate-500 mt-1">
                    Confiance ≥ 70% · cote 1.20–1.50 · marchés réellement
                    présents dans le moteur.
                  </p>
                </div>

                {data.waiting_reason && (
                  <Badge variant="outline">
                    {data.waiting_reason}
                  </Badge>
                )}
              </div>

              {Array.isArray(data.current_picks) &&
              data.current_picks.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {data.current_picks.map((pick, index) => (
                    <div
                      key={`${pick.event_id || pick.match_id || "pick"}-${index}`}
                      className="rounded-xl border border-orange-200 bg-orange-50/40 p-5"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-orange-700">
                          Pick {index + 1}
                        </span>

                        <span className="font-mono font-black text-orange-600">
                          @ {pick.odds}
                        </span>
                      </div>

                      <div className="font-bold text-slate-900">
                        {pick.home_team}{" "}
                        <span className="text-slate-400">vs</span>{" "}
                        {pick.away_team}
                      </div>

                      <div className="text-sm text-orange-700 font-semibold mt-2">
                        {pick.pick}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-4 text-xs text-slate-500">
                        <span>{pick.market}</span>
                        <span>·</span>
                        <span>
                          Confiance{" "}
                          {Math.round(Number(pick.confidence || 0) * 100)}%
                        </span>

                        {(pick.league || pick.sport_title) && (
                          <>
                            <span>·</span>
                            <span>
                              {pick.league || pick.sport_title}
                            </span>
                          </>
                        )}
                      </div>

                      {(pick.start_time || pick.commence_time) && (
                        <div className="text-xs text-slate-400 mt-2">
                          Début :{" "}
                          {dayjs(
                            pick.start_time || pick.commence_time
                          ).format("DD/MM/YYYY HH:mm")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                  <Clock3 className="h-7 w-7 mx-auto text-slate-400 mb-2" />

                  <p className="font-semibold text-slate-700">
                    En attente d'un pick qualifié
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    Le module ne force jamais un pronostic s'il ne respecte pas
                    ses critères.
                  </p>
                </div>
              )}
            </Card>

            <Card className="bg-white border-neutral-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100">
                <h2 className="font-heading font-bold text-slate-900">
                  Historique
                </h2>
              </div>

              {!Array.isArray(data.history) || data.history.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  Aucune journée terminée.
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {[...data.history].reverse().map((historyItem, index) => (
                    <div
                      key={`${historyItem.day}-${index}`}
                      className="px-5 py-4 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {historyItem.status === "WIN" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : historyItem.status === "VOID" ? (
                          <Clock3 className="h-5 w-5 text-slate-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-rose-500" />
                        )}

                        <div>
                          <div className="font-semibold text-sm">
                            Jour {historyItem.day} ·{" "}
                            {historyItem.status === "WIN"
                              ? "GAGNÉ"
                              : historyItem.status === "VOID"
                                ? "REMBOURSÉ"
                                : "PERDU"}
                          </div>

                          <div className="text-xs text-slate-500">
                            {Array.isArray(historyItem.picks)
                              ? historyItem.picks
                                  .map(
                                    (pick) =>
                                      `${pick.pick} @ ${pick.odds}`
                                  )
                                  .join(" · ")
                              : ""}
                          </div>
                        </div>
                      </div>

                      {historyItem.combined_odds ? (
                        <span className="font-mono font-bold text-orange-600">
                          x{historyItem.combined_odds}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <p className="text-xs text-slate-400 text-center">
              Aucun pari sportif n'est garanti. La montante réduit le nombre de
              sélections mais n'élimine pas le risque. 18+ · Jeu responsable.
            </p>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <Card className="bg-white border-neutral-200 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
        {label}
      </div>

      <div className="font-heading text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
        {value}
      </div>

      <div className="text-xs text-slate-500 mt-1">
        {sub}
      </div>
    </Card>
  );
}

function RequireAuth({ children, admin = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50">
        <div className="text-slate-500 text-sm">
          Chargement…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (admin && !user.is_admin) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/reset-password/:token"
            element={<ResetPasswordPage />}
          />

          <Route path="/resultats" element={<TrackRecordPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/legal/:slug" element={<LegalPage />} />

          <Route
            path="/legal"
            element={
              <Navigate
                to="/legal/mentions-legales"
                replace
              />
            }
          />

          <Route
            path="/app"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/top"
            element={
              <RequireAuth>
                <TopPicksPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/value-bets"
            element={
              <RequireAuth>
                <ValueBetsPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/montante"
            element={
              <RequireAuth>
                <MontantePage />
              </RequireAuth>
            }
          />

          <Route
            path="/montante"
            element={
              <Navigate
                to="/app/montante"
                replace
              />
            }
          />

          <Route
            path="/app/profil"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/parrainage"
            element={
              <RequireAuth>
                <ParrainagePage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/match/:matchId"
            element={
              <RequireAuth>
                <MatchDetailPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/combines"
            element={
              <RequireAuth>
                <CombosPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/builder"
            element={
              <RequireAuth>
                <ComboBuilderPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/aujourdhui"
            element={
              <RequireAuth>
                <TodayCombosPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/live"
            element={
              <RequireAuth>
                <LivePage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/historique"
            element={
              <RequireAuth>
                <HistoryPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/abonnement"
            element={
              <RequireAuth>
                <SubscriptionPage />
              </RequireAuth>
            }
          />

          <Route
            path="/app/admin"
            element={
              <RequireAuth admin>
                <AdminPage />
              </RequireAuth>
            }
          />

          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>

        <PageTracker />
        <WhatsAppWidget />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
