import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Lock,
  Play,
  Radar,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  WalletCards,
  XCircle,
} from "lucide-react";
import dayjs from "dayjs";

const MONEY = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function money(value) {
  return `${MONEY.format(Number(value || 0))} FCFA`;
}

function statusLabel(status) {
  if (status === "ACTIVE") {
    return {
      text: "EN COURS",
      cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    };
  }
  if (status === "FAILED") {
    return {
      text: "ÉCHOUÉE",
      cls: "border-rose-400/30 bg-rose-400/10 text-rose-200",
    };
  }
  if (status === "COMPLETED") {
    return {
      text: "TERMINÉE",
      cls: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    };
  }
  return {
    text: "EN ATTENTE",
    cls: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  };
}

function pickStatusLabel(status) {
  if (status === "WIN") {
    return {
      text: "GAGNÉ",
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  }
  if (status === "LOSS") {
    return {
      text: "PERDU",
      cls: "border-rose-200 bg-rose-50 text-rose-700",
      icon: XCircle,
    };
  }
  if (status === "VOID") {
    return {
      text: "REMBOURSÉ",
      cls: "border-slate-200 bg-slate-50 text-slate-600",
      icon: Clock3,
    };
  }
  return {
    text: "EN ATTENTE",
    cls: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock3,
  };
}

function sportLabel(pick) {
  const raw = `${pick?.sport_key || ""} ${pick?.sport_title || ""} ${pick?.league || ""}`.toLowerCase();
  if (raw.includes("american") || raw.includes("nfl") || raw.includes("ncaaf") || raw.includes("cfl")) {
    return { emoji: "🏈", text: "American Football" };
  }
  if (raw.includes("basket")) return { emoji: "🏀", text: "Basketball" };
  if (raw.includes("tennis") || raw.includes("atp") || raw.includes("wta")) return { emoji: "🎾", text: "Tennis" };
  if (raw.includes("hockey") || raw.includes("nhl")) return { emoji: "🏒", text: "Hockey" };
  if (raw.includes("baseball") || raw.includes("mlb")) return { emoji: "⚾", text: "Baseball" };
  if (raw.includes("mma") || raw.includes("ufc")) return { emoji: "🥊", text: "MMA" };
  return { emoji: "⚽", text: "Football" };
}

function confidencePercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n > 1 ? n : n * 100);
}

function dayStatus(historyItems, day, currentDay, overallStatus) {
  const settled = historyItems.find((item) => Number(item?.day) === day);
  if (settled?.status) return settled.status;
  if (overallStatus === "ACTIVE" && day === currentDay) return "ACTIVE";
  return "FUTURE";
}

function TimelineDot({ day, status, current }) {
  let cls = "border-slate-200 bg-white text-slate-400";
  let content = day;

  if (status === "WIN") {
    cls = "border-emerald-500 bg-emerald-500 text-white";
    content = "✓";
  } else if (status === "LOSS") {
    cls = "border-rose-500 bg-rose-500 text-white";
    content = "×";
  } else if (status === "VOID") {
    cls = "border-slate-500 bg-slate-500 text-white";
    content = "↺";
  } else if (status === "ACTIVE") {
    cls = "border-orange-500 bg-orange-50 text-orange-700 ring-4 ring-orange-100";
  }

  return (
    <div className="flex min-w-[46px] flex-col items-center gap-1.5">
      <div
        className={`grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-black transition ${cls}`}
        aria-current={current ? "step" : undefined}
      >
        {content}
      </div>
      <span className={`text-[10px] font-bold ${current ? "text-orange-700" : "text-slate-400"}`}>
        J{day}
      </span>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent = "slate" }) {
  const iconClass = {
    orange: "bg-orange-50 text-orange-600 border-orange-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    blue: "bg-sky-50 text-sky-600 border-sky-100",
    slate: "bg-slate-50 text-slate-600 border-slate-100",
  }[accent] || "bg-slate-50 text-slate-600 border-slate-100";

  return (
    <Card className="border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
          <div className="mt-1 truncate font-heading text-xl font-black text-slate-950 sm:text-2xl">{value}</div>
          <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
        </div>
      </div>
    </Card>
  );
}

export default function MontantePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [days, setDays] = useState(10);
  const [bankroll, setBankroll] = useState(10000);

  // Double verrou : le rôle local ET le rôle relu côté serveur doivent être Admin.
  // Cela empêche tout flash/affichage du contrôle Admin sur un compte normal.
  const isAdmin = Boolean(user?.is_admin) && data?.viewer?.is_admin === true;
  const hasPremiumAccess = data?.viewer?.has_premium_access === true;
  const picksLocked = data?.picks_locked === true || !hasPremiumAccess;

  const fetchMontante = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const response = await api.get("/montante");
      setData(response?.data || { status: "NONE", message: "Aucune montante active." });
      if (showLoader) setError("");
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Impossible de charger la Montante.";
      if (showLoader) setError(String(detail));
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMontante(true);

    // La page reste alignée avec la progression serveur sans action utilisateur.
    const timer = window.setInterval(() => {
      fetchMontante(false);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [fetchMontante]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    setSuccess("");
    try {
      const response = await api.get("/montante");
      setData(response?.data || null);
    } catch (e) {
      setError(String(e?.response?.data?.detail || e?.message || "Actualisation impossible."));
    } finally {
      setRefreshing(false);
    }
  };

  const syncResults = async () => {
    if (!isAdmin) return;
    setSyncing(true);
    setError("");
    setSuccess("");
    try {
      const response = await api.post("/montante/sync-results");
      const next = response?.data || null;
      setData(next);
      const diagnostic = next?.sync_diagnostic;
      if (diagnostic?.progressed) {
        setSuccess("Résultat pris en compte : la Montante a été mise à jour immédiatement.");
      } else if (Number(diagnostic?.updated || 0) > 0) {
        setSuccess("Score final synchronisé. La Montante a été recalculée.");
      } else {
        setSuccess("Synchronisation terminée : aucun nouveau résultat final disponible pour le moment.");
      }
    } catch (e) {
      setError(String(e?.response?.data?.detail || e?.message || "Synchronisation des résultats impossible."));
    } finally {
      setSyncing(false);
    }
  };

  const start = async (restart = false) => {
    if (!isAdmin) return;
    const capital = Number(bankroll);
    if (!Number.isFinite(capital) || capital <= 0) {
      setError("Le capital initial doit être un nombre positif.");
      return;
    }

    setStarting(true);
    setError("");
    setSuccess("");
    try {
      const endpoint = restart ? "/montante/restart" : "/montante/start";
      const response = await api.post(endpoint, null, {
        params: { days, initial_bankroll: capital },
      });
      setData(response?.data || null);
      setSuccess(restart ? "Nouvelle série Montante lancée." : "Montante démarrée.");
    } catch (e) {
      setError(String(e?.response?.data?.detail || e?.message || "Impossible de démarrer la Montante."));
    } finally {
      setStarting(false);
    }
  };

  const historyItems = useMemo(
    () => (Array.isArray(data?.history) ? data.history : []),
    [data?.history]
  );

  const currentPickPreview = Array.isArray(data?.current_picks_preview)
    ? data.current_picks_preview
    : [];
  const currentPickCount = Number(
    currentPickPreview.length ||
      data?.current_pick_count ||
      (Array.isArray(data?.current_picks) ? data.current_picks.length : 0)
  );

  const currentDay = Number(data?.current_day || 1);
  const totalDays = Number(data?.days || 10);
  const completedDays = Number(data?.completed_days ?? historyItems.length);
  const progress = data?.status === "COMPLETED"
    ? 100
    : Number(data?.progress || 0);
  const currentStake = Number(data?.current_stake || 0);
  const theoretical = Number(data?.theoretical_bankroll || 0);
  const initial = Number(data?.initial_bankroll || 0);
  const accumulatedGain = theoretical - initial;
  const st = statusLabel(data?.status);

  const settlementDetails = data?.last_settlement_check?.day === currentDay
    ? data?.last_settlement_check?.details || []
    : [];

  const settlementStatusFor = (pick, index) => {
    const signature = String(pick?.history_signature || "");
    const matchId = String(pick?.match_id || "");
    const exact = settlementDetails.find((detail) =>
      (signature && String(detail?.history_signature || "") === signature) ||
      (matchId && String(detail?.match_id || "") === matchId)
    );
    return exact?.status || settlementDetails[index]?.status || "PENDING";
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-7xl space-y-5 px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
        <Card className="relative overflow-hidden border-0 bg-slate-950 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(249,115,22,0.30),transparent_34%),radial-gradient(circle_at_90%_20%,rgba(244,63,94,0.18),transparent_28%)]" />
          <div className="absolute -bottom-20 -right-16 h-64 w-64 rounded-full border border-orange-400/10" />
          <div className="relative p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge className="border border-orange-400/30 bg-orange-400/10 text-orange-200">
                    <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Montante WnPulse
                  </Badge>
                  <Badge className="border border-white/10 bg-white/5 text-slate-200">
                    1–2 picks / jour
                  </Badge>
                  <Badge className="border border-white/10 bg-white/5 text-slate-200">
                    Réinvestissement 100 %
                  </Badge>
                </div>

                <h1 className="font-heading text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                  Une série. Un capital. <span className="text-orange-400">Une progression réelle.</span>
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Les mêmes picks Montante sont utilisés pour toute la plateforme. Les abonnés Pro et l’administrateur voient les sélections complètes ; les comptes Free voient les mêmes emplacements, verrouillés jusqu’au passage à Pro.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`border px-3 py-1.5 text-xs font-black ${st.cls}`}>{st.text}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  onClick={refresh}
                  disabled={refreshing}
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Actualiser
                </Button>
              </div>
            </div>

            {data?.status !== "NONE" && (
              <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
                <HeroStat label="Jour" value={`${currentDay}/${totalDays}`} />
                <HeroStat label="Jours validés" value={`${completedDays}`} />
                <HeroStat label="Mise actuelle" value={money(currentStake)} />
                <HeroStat label="Synchronisation" value={`~${data?.result_sync_interval_minutes || 5} min`} />
              </div>
            )}
          </div>
        </Card>

        {error && (
          <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="font-black">Action impossible</div>
            <div className="mt-1">{error}</div>
          </Card>
        )}

        {success && (
          <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4" /> {success}
            </div>
          </Card>
        )}

        {isAdmin && (
          <Card className="overflow-hidden border-orange-200 bg-white shadow-sm">
            <div className="border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                    <ShieldCheck className="h-5 w-5 text-orange-600" />
                    Pilotage administrateur
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Ce panneau est exclusivement visible sur le compte administrateur.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={syncResults}
                  disabled={syncing || data?.status === "NONE"}
                  className="bg-slate-950 text-white hover:bg-slate-800"
                >
                  <Radar className={`mr-2 h-4 w-4 ${syncing ? "animate-pulse" : ""}`} />
                  {syncing ? "Synchronisation…" : "Synchroniser & faire progresser"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 p-5 lg:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Durée de la série</span>
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-orange-400"
                >
                  <option value={10}>10 jours</option>
                  <option value={15}>15 jours</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Capital initial</span>
                <input
                  type="number"
                  min="1"
                  value={bankroll}
                  onChange={(e) => setBankroll(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-orange-400"
                />
              </label>

              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  onClick={() => start(false)}
                  disabled={starting || data?.status !== "NONE"}
                  className="h-11 bg-orange-600 text-white hover:bg-orange-700"
                >
                  <Play className="mr-2 h-4 w-4" /> Démarrer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => start(true)}
                  disabled={starting}
                  className="h-11"
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Recommencer
                </Button>
              </div>
            </div>

            {data?.last_result_sync && (
              <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                Dernier contrôle fournisseur : {data.last_result_sync.checked_at
                  ? dayjs(data.last_result_sync.checked_at).format("DD/MM/YYYY HH:mm:ss")
                  : "—"}
                {Number(data.last_result_sync.updated || 0) > 0
                  ? ` · ${data.last_result_sync.updated} résultat(s) mis à jour`
                  : " · aucun nouveau résultat"}
              </div>
            )}
          </Card>
        )}

        {loading ? (
          <Card className="grid min-h-[260px] place-items-center border-neutral-200 bg-white">
            <div className="text-center">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-orange-500" />
              <p className="mt-3 text-sm font-semibold text-slate-600">Chargement de la Montante…</p>
            </div>
          </Card>
        ) : !data || data.status === "NONE" ? (
          <Card className="border-neutral-200 bg-white p-8 text-center sm:p-12">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-orange-50 text-orange-600">
              <TrendingUp className="h-8 w-8" />
            </div>
            <h2 className="mt-4 font-heading text-2xl font-black text-slate-950">Nouvelle série à venir</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
              La prochaine Montante apparaîtra ici dès son lancement. Tous les comptes suivront alors exactement la même série.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={WalletCards}
                label="Capital initial"
                value={money(initial)}
                sub="mise de départ de la série"
                accent="slate"
              />
              <MetricCard
                icon={Activity}
                label="Mise du jour"
                value={money(currentStake)}
                sub={data.status === "ACTIVE" ? "capital réinvesti à 100 %" : "aucune mise active"}
                accent="orange"
              />
              <MetricCard
                icon={TrendingUp}
                label="Capital théorique"
                value={money(theoretical)}
                sub="mise + gains cumulés"
                accent="blue"
              />
              <MetricCard
                icon={Trophy}
                label="Évolution"
                value={`${accumulatedGain >= 0 ? "+" : ""}${money(accumulatedGain)}`}
                sub="écart avec le capital initial"
                accent={accumulatedGain >= 0 ? "emerald" : "slate"}
              />
            </div>

            <Card className="border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Parcours de la série</div>
                  <h2 className="mt-1 font-heading text-xl font-black text-slate-950">
                    {completedDays} journée{completedDays > 1 ? "s" : ""} validée{completedDays > 1 ? "s" : ""} sur {totalDays}
                  </h2>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-slate-950">{progress}%</div>
                  <div className="text-[11px] font-semibold text-slate-400">progression</div>
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500 transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
                />
              </div>

              <div className="mt-6 overflow-x-auto pb-2">
                <div className="flex min-w-max items-start gap-1 sm:gap-2">
                  {Array.from({ length: totalDays }).map((_, index) => {
                    const day = index + 1;
                    const status = dayStatus(historyItems, day, currentDay, data.status);
                    return (
                      <TimelineDot
                        key={day}
                        day={day}
                        status={status}
                        current={data.status === "ACTIVE" && day === currentDay}
                      />
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden border-neutral-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-neutral-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-orange-500" />
                    <h2 className="font-heading text-lg font-black text-slate-950">
                      Picks Montante · Jour {currentDay}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Une sélection unique, identique pour Admin, Pro et Free. Seul le niveau de visibilité change.
                  </p>
                </div>

                {data?.last_settlement_check?.checked_at && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Contrôlé {dayjs(data.last_settlement_check.checked_at).format("DD/MM HH:mm")}
                  </div>
                )}
              </div>

              <div className="p-5 sm:p-6">
                {picksLocked ? (
                  currentPickCount > 0 ? (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2 font-black text-slate-950">
                              <Lock className="h-4 w-4 text-orange-600" />
                              {currentPickCount} {currentPickCount > 1 ? "picks sont disponibles" : "pick est disponible"}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              Tu suis exactement la même Montante que les comptes Pro. Les équipes, le marché, la sélection et la cote restent verrouillés en Free.
                            </p>
                          </div>
                          <Link
                            to="/app/abonnement"
                            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
                          >
                            Débloquer Pro <ChevronRight className="ml-1 h-4 w-4" />
                          </Link>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {Array.from({ length: currentPickCount }).map((_, index) => {
                          const lockedStatus = data?.last_settlement_check?.day === currentDay
                            ? data?.last_settlement_check?.statuses?.[index] || "PENDING"
                            : "PENDING";
                          const statusInfo = pickStatusLabel(lockedStatus);
                          const StatusIcon = statusInfo.icon;

                          return (
                            <div
                              key={`locked-pick-${index}`}
                              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                  Pick {index + 1}
                                </span>
                                <Badge className={`border ${statusInfo.cls}`}>
                                  <StatusIcon className="mr-1 h-3 w-3" /> {statusInfo.text}
                                </Badge>
                              </div>

                              <div className="mt-5 space-y-3">
                                <div className="h-4 w-4/5 rounded-full bg-slate-200" />
                                <div className="h-4 w-3/5 rounded-full bg-slate-200" />
                                <div className="flex gap-2 pt-1">
                                  <div className="h-8 w-24 rounded-lg bg-orange-100" />
                                  <div className="h-8 w-20 rounded-lg bg-slate-200" />
                                </div>
                              </div>

                              <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
                                <Lock className="h-3.5 w-3.5 text-orange-600" />
                                Contenu réservé aux abonnés Pro
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <WaitingCard reason={data?.waiting_reason} />
                  )
                ) : Array.isArray(data?.current_picks) && data.current_picks.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {data.current_picks.map((pick, index) => {
                      const status = settlementStatusFor(pick, index);
                      const statusInfo = pickStatusLabel(status);
                      const StatusIcon = statusInfo.icon;
                      const sport = sportLabel(pick);

                      return (
                        <div
                          key={`${pick?.history_signature || pick?.event_id || pick?.match_id || index}-${index}`}
                          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{sport.emoji}</span>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Pick {index + 1}</div>
                                <div className="text-xs font-bold text-slate-700">{sport.text}</div>
                              </div>
                            </div>
                            <Badge className={`border ${statusInfo.cls}`}>
                              <StatusIcon className="mr-1 h-3 w-3" /> {statusInfo.text}
                            </Badge>
                          </div>

                          <div className="p-5">
                            <div className="text-xs font-semibold text-slate-400">
                              {pick?.league || pick?.sport_title || "Compétition"}
                            </div>
                            <div className="mt-1 text-base font-black leading-6 text-slate-950">
                              {pick?.home_team} <span className="font-medium text-slate-400">vs</span> {pick?.away_team}
                            </div>

                            <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
                              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-500">Sélection WnPulse</div>
                              <div className="mt-1 flex items-end justify-between gap-3">
                                <div className="text-sm font-black text-orange-800">{pick?.pick}</div>
                                <div className="shrink-0 font-mono text-lg font-black text-orange-600">@ {pick?.odds}</div>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="text-slate-400">Confiance</div>
                                <div className="mt-0.5 font-black text-slate-800">{confidencePercent(pick?.confidence)}%</div>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="text-slate-400">Marché</div>
                                <div className="mt-0.5 truncate font-black text-slate-800">{pick?.market || "—"}</div>
                              </div>
                            </div>

                            {pick?.start_time && (
                              <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                                <CalendarClock className="h-3.5 w-3.5" />
                                {dayjs(pick.start_time).format("DD/MM/YYYY · HH:mm")}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <WaitingCard reason={data?.waiting_reason} />
                )}
              </div>
            </Card>

            <Card className="border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-orange-400">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-black text-slate-950">Comment le capital progresse</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    À chaque journée gagnée, <strong>la mise du jour + le gain deviennent intégralement la mise du jour suivant</strong>. Il n’y a donc pas de remise à la mise initiale entre deux étapes.
                  </p>
                  <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 font-mono text-xs font-bold text-slate-700">
                    Capital suivant = capital actuel × cote combinée gagnante
                  </div>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden border-neutral-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                <div>
                  <h2 className="font-heading text-lg font-black text-slate-950">Historique de la série</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Chaque journée réglée reste traçable.</p>
                </div>
                <Badge variant="outline">{historyItems.length} étape{historyItems.length > 1 ? "s" : ""}</Badge>
              </div>

              {!historyItems.length ? (
                <div className="p-7 text-center text-sm text-slate-500">Aucune journée n’est encore terminée.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {[...historyItems].reverse().map((item, index) => {
                    const statusInfo = pickStatusLabel(item?.status);
                    const StatusIcon = statusInfo.icon;
                    const pickCount = Number(
                      item?.pick_count ??
                        (Array.isArray(item?.picks_preview)
                          ? item.picks_preview.length
                          : Array.isArray(item?.picks)
                            ? item.picks.length
                            : 0)
                    );

                    return (
                      <div key={`${item?.day}-${index}`} className="px-5 py-4 sm:px-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border ${statusInfo.cls}`}>
                              <StatusIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-black text-slate-950">
                                Jour {item?.day} · {statusInfo.text}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {picksLocked
                                  ? `${pickCount} ${pickCount > 1 ? "picks" : "pick"} · détails verrouillés en Free`
                                  : (item?.picks || []).map((pick) => `${pick.pick} @ ${pick.odds}`).join(" · ") || "—"}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {item?.stake_before != null && (
                              <HistoryChip label="Mise" value={money(item.stake_before)} />
                            )}
                            {item?.profit != null && (
                              <HistoryChip
                                label="Gain"
                                value={`${Number(item.profit) > 0 ? "+" : ""}${money(item.profit)}`}
                                positive={Number(item.profit) >= 0}
                              />
                            )}
                            {item?.bankroll_after != null && (
                              <HistoryChip label="Capital après" value={money(item.bankroll_after)} />
                            )}
                            {item?.combined_odds && (
                              <HistoryChip label="Cote" value={`×${item.combined_odds}`} accent />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <p className="px-2 text-center text-[11px] leading-5 text-slate-400">
              18+ · Joue responsable. Aucun pronostic n’est garanti et les performances passées ne garantissent pas les résultats futurs.
            </p>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function HeroStat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-black text-white sm:text-base">{value}</div>
    </div>
  );
}

function WaitingCard({ reason }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-slate-400 shadow-sm">
        <Clock3 className="h-5 w-5" />
      </div>
      <div className="mt-3 font-black text-slate-800">Recherche de la prochaine sélection</div>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-slate-500">
        {reason || "Le moteur attend un pick qui respecte les critères de la Montante. Aucun pronostic n’est forcé."}
      </p>
    </div>
  );
}

function HistoryChip({ label, value, positive, accent }) {
  const cls = accent
    ? "border-orange-100 bg-orange-50 text-orange-700"
    : positive === true
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : "border-slate-100 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${cls}`}>
      <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">{label}</span>
      <span className="ml-1.5 font-black">{value}</span>
    </div>
  );
}
