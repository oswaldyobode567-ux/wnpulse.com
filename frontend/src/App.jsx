import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from "react-router-dom";
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
import AppLayout, { LanguageProvider, LanguageSwitcher, useLanguage, usePageLanguage, FollowedPicksPage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock, Info, Layers, Lock, Play, Radar, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Target, XCircle } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Page Montante intégrée : aucun import de fichier MontantePage séparé.
const RESULT = {
  WIN: {
    text: "Gagné",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2
  },
  LOSS: {
    text: "Perdu",
    cls: "border-rose-200 bg-rose-50 text-rose-700",
    icon: XCircle
  },
  VOID: {
    text: "Annulé",
    cls: "border-slate-200 bg-slate-50 text-slate-600",
    icon: RotateCcw
  },
  PENDING: {
    text: "Résultat en attente",
    cls: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock
  }
};

function numeric(value) {
  if (!["number", "string"].includes(typeof value) || typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function format(i18n, value, digits = 1) {
  const n = numeric(value);
  return n === null ? "Non communiqué" : new Intl.NumberFormat(i18n.locale, {
    maximumFractionDigits: digits
  }).format(n);
}

function fractionPercent(i18n, value) {
  const n = numeric(value);
  return n !== null && n >= 0 && n <= 1 ? `${format(i18n, n * 100)} %` : "Non communiqué";
}

function str(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(x => x && typeof x === "object" && !Array.isArray(x)) : [];
}

function date(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dateLabel(i18n, value) {
  const d = date(value);
  return d ? new Intl.DateTimeFormat(i18n.locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d) : "Horaire non communiqué";
}

function stageStatus(history, stage, currentStage, status) {
  const entries = history.filter(row => Number(row.day) === stage);
  if (entries.some(row => row.status === "WIN")) return "WIN";
  if (entries.some(row => row.status === "LOSS")) return "LOSS";
  if (status === "ACTIVE" && stage === currentStage) return "ACTIVE";
  return entries.length ? "VOID" : "FUTURE";
}

function pickStatus(pick, index, data) {
  const settlement = data?.last_settlement_check;
  if (Number(settlement?.day) !== Number(data?.current_day)) return "PENDING";
  const exact = list(settlement?.details).find(row => pick?.history_signature && row.history_signature === pick.history_signature || pick?.match_id && String(row.match_id) === String(pick.match_id));
  const status = exact?.status || settlement?.statuses?.[index];
  return RESULT[status] ? status : "PENDING";
}

function explain(i18n, pick) {
  const key = str(pick.market).toLowerCase();
  if (key === "h2h") return /^(draw|nul|match nul)$/i.test(str(pick.pick)) ? i18n.t("La sélection prévoit un match nul dans la période couverte.") : i18n.t("La s\xE9lection pr\xE9voit la victoire de {{v0}}, selon les r\xE8gles de ce march\xE9.", {
    v0: str(pick.pick, i18n.t("l’équipe indiquée"))
  });
  if (key === "totals") return i18n.t("\xAB {{v0}} \xBB porte sur le total de buts ou de points. Le seuil et la p\xE9riode du march\xE9 d\xE9terminent le r\xE9sultat.", {
    v0: str(pick.pick)
  });
  if (key === "spreads") return i18n.t("Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.");
  return i18n.t("La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.");
}

function responseData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !["NONE", "ACTIVE", "FAILED", "COMPLETED"].includes(value.status)) throw Error("Réponse Montante invalide");
  return value;
}

function errorLabel(i18n, error) {
  if (error?.response?.status === 401) return i18n.t("Ta session a expiré. Reconnecte-toi pour retrouver la montante.");
  if (error?.response?.status === 403) return i18n.t("Cette action est réservée à l’administrateur ou à ton niveau d’accès.");
  if (error?.code === "ECONNABORTED") return i18n.t("Le chargement a pris trop de temps. Réessaie dans un instant.");
  return i18n.t("Le service Montante est temporairement indisponible. Réessaie dans un instant.");
}

function MontantePage() {
  const i18n = usePageLanguage();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [days, setDays] = useState(10);
  const [restartConfirmed, setRestartConfirmed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const controller = useRef(null);
  const actionController = useRef(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const activeData = useRef(null);
  const authKey = `${user?.id || "anonymous"}|${user?.subscription_tier || user?.subscription || "free"}|${Boolean(user?.is_admin)}|${user?.subscription_expires_at || ""}`;
  const isAdmin = Boolean(user?.is_admin) && data?.viewer?.is_admin === true;
  const premium = data?.viewer?.has_premium_access === true && data?.picks_locked !== true;
  const load = useCallback(async (background = false) => {
    if (actionController.current) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const requestGeneration = generation.current;
    if (background && activeData.current) setRefreshing(true);else setLoading(true);
    setError("");
    try {
      const result = await api.get("/montante", {
        signal: request.signal,
        timeout: 30_000
      });
      const payload = responseData(result.data);
      if (request.signal.aborted || !mounted.current || requestGeneration !== generation.current) return;
      setData(payload);
      activeData.current = payload;
      setNow(Date.now());
    } catch (cause) {
      if (!request.signal.aborted && mounted.current && requestGeneration === generation.current) setError(errorLabel(i18n, cause));
    } finally {
      if (!request.signal.aborted && mounted.current && requestGeneration === generation.current) {
        setLoading(false);
        setRefreshing(false);
        controller.current = null;
      }
    }
  }, [i18n]);
  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    activeData.current = null;
    setData(null);
    setSuccess("");
    setBusy("");
    setRefreshing(false);
    load();
    return () => {
      mounted.current = false;
      controller.current?.abort();
      actionController.current?.abort();
      actionController.current = null;
    };
  }, [authKey, load]);
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      if (!document.hidden && !controller.current && !actionController.current) load(true);
    };
    const timer = window.setInterval(tick, 60_000);
    const focus = () => {
      if (!document.hidden && !controller.current && !actionController.current) load(true);
    };
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  const adminAction = async kind => {
    if (!isAdmin || actionController.current || kind === "restart" && !restartConfirmed) return;
    controller.current?.abort();
    controller.current = null;
    generation.current += 1;
    const requestGeneration = generation.current;
    const request = new AbortController();
    actionController.current = request;
    setBusy(kind);
    setError("");
    setSuccess("");
    setRefreshing(false);
    try {
      const endpoint = kind === "sync" ? "/montante/sync-results" : `/montante/${kind}`;
      const result = await api.post(endpoint, null, {
        signal: request.signal,
        timeout: 60_000,
        ...(kind !== "sync" ? {
          params: {
            days,
            initial_bankroll: 10000
          }
        } : {})
      });
      const payload = responseData(result.data);
      if (!mounted.current || request.signal.aborted || requestGeneration !== generation.current) return;
      setData(payload);
      activeData.current = payload;
      setRestartConfirmed(false);
      setSuccess(kind === "sync" ? "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte." : "La série est lancée. La sélection attendra deux matchs admissibles.");
    } catch (cause) {
      if (mounted.current && !request.signal.aborted && requestGeneration === generation.current) setError(errorLabel(i18n, cause));
    } finally {
      if (actionController.current === request) actionController.current = null;
      if (mounted.current && requestGeneration === generation.current) {
        setBusy("");
        setLoading(false);
      }
    }
  };
  const history = useMemo(() => list(data?.history), [data]);
  const picks = premium ? list(data?.current_picks) : [];
  const count = Math.max(0, Math.floor(numeric(data?.current_pick_count) ?? picks.length));
  const total = Math.min(15, Math.max(1, Math.floor(numeric(data?.days) ?? 10)));
  const stage = Math.min(total, Math.max(1, Math.floor(numeric(data?.current_day) ?? 1)));
  const wins = new Set(history.filter(row => row.status === "WIN").map(row => Number(row.day))).size;
  const progress = data?.status === "COMPLETED" ? 100 : Math.min(100, wins / total * 100);
  const stageLabel = loading ? "Chargement…" : data?.status === "COMPLETED" ? "Série terminée" : data?.status === "FAILED" ? "Série arrêtée" : count >= 2 ? "Sélections publiées" : data?.status === "ACTIVE" ? "Recherche de deux matchs" : "Nouvelle série à venir";
  const estimate = numeric(data?.selection_summary?.independence_estimate);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale";
  return <AppLayout>
    <style>{i18n.tx(`.wn-montante-in{animation:wn-montante-in .35s ease-out both}@keyframes wn-montante-in{from{opacity:.5;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.wn-montante-in{animation:none}}`)}</style>
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-9">
        <div aria-hidden="true" className="pointer-events-none absolute -end-10 -top-10 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl"><div className="mb-4 flex flex-wrap gap-2"><Badge className="border-orange-400/30 bg-orange-400/10 text-orange-200"><Layers className="me-1.5 h-3.5 w-3.5" />{i18n.t("MONTANTE WNPULSE")}</Badge><Badge className="border-white/15 bg-white/5 text-slate-300">{i18n.t("2 matchs distincts par \xE9tape")}</Badge></div>
            <h1 className="font-heading text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{i18n.rich("Deux rencontres.{{v0}}{{v1}}", {
                v0: <br />,
                v1: <span className="text-orange-400">{i18n.t("Des choix expliqu\xE9s.")}</span>
              })}</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300">{i18n.t("Les s\xE9lections sont compar\xE9es selon les estimations et la qualit\xE9 des donn\xE9es. Une petite cote ne suffit pas \xE0 faire un bon choix.")}</p><p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" />{i18n.rich("Horaires : {{v0}}", {
                v0: i18n.tx(zone)
              })}</p>
          </div>
          <div className="flex flex-col gap-3"><span className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-center text-sm font-semibold">{i18n.tx(stageLabel)}</span><Button variant="outline" onClick={() => load(Boolean(data))} disabled={loading || refreshing || Boolean(busy)} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw className={cn("me-2 h-4 w-4", refreshing && "animate-spin")} />{i18n.tx(refreshing ? "Actualisation…" : "Actualiser")}</Button></div>
        </div>
        {i18n.tx(!loading && data && data.status !== "NONE" && <div className="relative mt-7 grid grid-cols-3 gap-3 border-t border-white/10 pt-5"><HeroStat label={i18n.t("Étape")} value={`${stage} / ${total}`} /><HeroStat label={i18n.t("Étapes gagnées")} value={wins} /><HeroStat label={i18n.t("Matchs publiés")} value={count} /></div>)}
      </section>
      {i18n.tx(error && <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-rose-800">{i18n.tx(error)}{i18n.tx(data && " Les dernières données chargées restent affichées.")}</p><Button size="sm" variant="outline" disabled={loading || refreshing || Boolean(busy)} onClick={() => load(Boolean(data))}>{i18n.t("R\xE9essayer")}</Button></div>)}
      {i18n.tx(success && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{i18n.tx(success)}</p>)}
      <div className="grid gap-3 sm:grid-cols-3"><PolicyCard icon={Target} title={i18n.t("Toutes les cotes comparées")} text={i18n.t("Le classement n’ajoute aucun bonus aux petites cotes.")} /><PolicyCard icon={ShieldCheck} title={i18n.t("Sources vérifiées")} text={i18n.t("Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes.")} /><PolicyCard icon={Clock} title={i18n.t("Le droit d’attendre")} text={i18n.t("Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée.")} /></div>
      {i18n.tx(isAdmin && <Card className="rounded-2xl border-orange-200 p-5"><p className="mb-4 flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-orange-600" />{i18n.t("Pilotage administrateur")}</p><div className="flex flex-wrap items-center gap-3"><label className="text-xs text-slate-500">{i18n.rich("Parcours {{v0}}", {
              v0: <select value={days} onChange={e => setDays(Number(e.target.value))} className="ms-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value={10}>{i18n.t("10 \xE9tapes")}</option><option value={15}>{i18n.t("15 \xE9tapes")}</option></select>
            })}</label>
        {i18n.tx(data?.status === "NONE" ? <Button onClick={() => adminAction("start")} disabled={Boolean(busy)} className="bg-orange-600 text-white hover:bg-orange-700"><Play className="me-2 h-4 w-4" />{i18n.t("D\xE9marrer")}</Button> : <Button onClick={() => adminAction("sync")} disabled={Boolean(busy)} className="bg-slate-900 text-white hover:bg-slate-800"><Radar className="me-2 h-4 w-4" />{i18n.tx(busy === "sync" ? "Contrôle…" : "Synchroniser les résultats")}</Button>)}
        {i18n.tx(data?.status !== "NONE" && <details className="w-full rounded-xl border border-neutral-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">{i18n.t("Lancer une nouvelle s\xE9rie")}</summary><p className="mt-2 text-xs text-slate-500">{i18n.t("La s\xE9rie actuelle sera archiv\xE9e sur le serveur et remplac\xE9e.")}</p><label className="mt-3 flex items-center gap-2 text-xs text-slate-600">{i18n.rich("{{v0}}Remplacer la s\xE9rie actuelle", {
                v0: <input type="checkbox" checked={restartConfirmed} onChange={e => setRestartConfirmed(e.target.checked)} />
              })}</label><Button onClick={() => adminAction("restart")} disabled={!restartConfirmed || Boolean(busy)} variant="outline" size="sm" className="mt-3"><RotateCcw className="me-2 h-4 w-4" />{i18n.t("Nouvelle s\xE9rie")}</Button></details>)}
      </div>{i18n.tx(data?.diagnostic && <details className="mt-4 border-t border-neutral-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-500">{i18n.t("Diagnostic de s\xE9lection")}</summary><div className="mt-2 space-y-1 text-xs text-slate-500"><p>{i18n.rich("{{v0}} matchs re\xE7us \xB7 {{v1}} \xE9v\xE9nements admissibles", {
                v0: i18n.tx(format(i18n, data.diagnostic.matches_received, 0)),
                v1: i18n.tx(format(i18n, data.diagnostic.eligible, 0))
              })}</p>{i18n.tx(Object.entries(data.diagnostic.rejections || {}).map(([reason, n]) => <p key={reason}>{i18n.tx(reason)} : {i18n.tx(format(i18n, n, 0))}</p>))}</div></details>)}</Card>)}
      {i18n.tx(loading ? <Card role="status" className="grid h-64 place-items-center rounded-2xl border-neutral-200"><div className="text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-orange-500" /><p className="mt-3 text-sm text-slate-500">{i18n.t("Chargement de la montante\u2026")}</p></div></Card> : !data || data.status === "NONE" ? <WaitingCard reason="La prochaine série apparaîtra ici dès son lancement par l’administrateur." title={i18n.t("Nouvelle montante à venir")} /> : <>
        <Card className="rounded-2xl border-neutral-200 p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">{i18n.t("Parcours de la s\xE9rie")}</p><h2 className="mt-1 font-heading text-xl font-bold text-slate-900">{i18n.rich("{{v0}} \xE9tape{{v1}} gagn\xE9e{{v2}} sur {{v3}}", {
                  v0: i18n.tx(wins),
                  v1: i18n.tx(wins > 1 ? "s" : ""),
                  v2: i18n.tx(wins > 1 ? "s" : ""),
                  v3: i18n.tx(total)
                })}</h2></div><span className="font-mono text-xl font-bold text-slate-800">{i18n.tx(format(i18n, progress))} %</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500" style={{
              width: `${progress}%`
            }} /></div><div className="mt-5 flex gap-2 overflow-x-auto pb-2">{i18n.tx(Array.from({
              length: total
            }, (_, i) => <StageDot key={i} stage={i + 1} status={stageStatus(history, i + 1, stage, data.status)} />))}</div><p className="mt-2 text-[10px] text-slate-400">{i18n.t("Une \xE9tape annul\xE9e n\u2019est pas une victoire. Les jours sans s\xE9lection ne font pas avancer le parcours.")}</p></Card>
        <section><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-heading text-xl font-bold text-slate-900"><Sparkles className="h-5 w-5 text-orange-600" />{i18n.rich("S\xE9lections \xB7 \xC9tape {{v0}}", {
                v0: i18n.tx(stage)
              })}</h2>{i18n.tx(premium && numeric(data.selection_summary?.combined_odds) !== null && <Badge className="border-orange-200 bg-orange-50 text-orange-700">{i18n.rich("Cote combin\xE9e : {{v0}}", {
                v0: i18n.tx(format(i18n, data.selection_summary.combined_odds, 2))
              })}</Badge>)}</div>
          {i18n.tx(data.selection_version === "legacy" && count > 0 && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{i18n.t("S\xE9lection publi\xE9e avant cette mise \xE0 jour : elle reste suivie jusqu\u2019\xE0 son r\xE8glement. Les nouvelles \xE9tapes exigent deux matchs.")}</p>)}
          {i18n.tx(count === 0 ? <WaitingCard reason={str(data.waiting_reason, "Deux matchs suffisamment documentés ne sont pas encore disponibles.")} /> : !premium ? <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2">{i18n.tx(Array.from({
                length: Math.min(count, 10)
              }, (_, i) => <LockedPick key={i} index={i} status={pickStatus(null, i, data)} />))}</div><div className="flex flex-col justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:flex-row sm:items-center"><div><p className="font-bold text-slate-900">{i18n.t("Les m\xEAmes s\xE9lections que les abonn\xE9s")}</p><p className="mt-1 text-sm text-slate-600">{i18n.t("D\xE9bloque les rencontres, les march\xE9s et les raisons de chaque choix.")}</p></div><Button asChild className="h-auto min-h-11 shrink-0 whitespace-normal bg-orange-600 text-white hover:bg-orange-700"><Link to="/app/abonnement" data-testid="montante-upgrade-link">{i18n.t("D\xE9couvrir Pro")}<ArrowRight className="ms-2 h-4 w-4" /></Link></Button></div></div> : <div className="grid items-start gap-5 md:grid-cols-2">{i18n.tx(picks.map((pick, i) => <PickCard key={`${pick.history_signature || pick.match_id || i}-${i}`} pick={pick} index={i} status={pickStatus(pick, i, data)} now={now} />))}</div>)}
          {i18n.tx(premium && estimate !== null && count === 2 && <details className="mt-4 rounded-xl border border-neutral-200 bg-white p-4"><summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600"><Info className="h-4 w-4" />{i18n.t("Lire l\u2019estimation de la paire")}</summary><p className="mt-3 text-sm text-slate-700">{i18n.rich("Approximation th\xE9orique : {{v0}}, sous hypoth\xE8se d\u2019ind\xE9pendance.", {
                v0: <strong>{i18n.tx(format(i18n, estimate))} %</strong>
              })}</p><p className="mt-2 text-xs leading-relaxed text-slate-500">{i18n.t("Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de r\xE9ussite constat\xE9. Des \xE9v\xE9nements distincts peuvent encore \xEAtre corr\xE9l\xE9s.")}</p></details>)}
        </section>
        <Card className="overflow-hidden rounded-2xl border-neutral-200"><div className="border-b border-neutral-100 p-5"><h2 className="font-heading text-lg font-bold text-slate-900">{i18n.t("Historique de la s\xE9rie")}</h2><p className="mt-1 text-xs text-slate-500">{i18n.t("Les victoires, pertes et annulations restent visibles.")}</p></div>{i18n.tx(!history.length ? <p className="p-7 text-center text-sm text-slate-400">{i18n.t("Aucune \xE9tape r\xE9gl\xE9e pour le moment.")}</p> : <div className="divide-y divide-neutral-100">{i18n.tx([...history].reverse().map((row, i) => <details key={`${row.day}-${row.settled_at || i}`} className="p-4 sm:px-5"><summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-slate-800">{i18n.rich("\xC9tape {{v0}}", {
                    v0: i18n.tx(row.day)
                  })}</span><div className="flex items-center gap-3"><span className="text-[10px] text-slate-400">{i18n.tx(dateLabel(i18n, row.settled_at))}</span><ResultBadge status={row.status} /></div></summary><div className="mt-3 space-y-2">{i18n.tx(premium ? list(row.picks).map((pick, n) => <p key={n} className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{i18n.rich("{{v0}}{{v1}}{{v2}} \xB7 cote {{v3}}", {
                    v0: <strong>{i18n.rich("{{v0}} vs {{v1}}", {
                        v0: i18n.tx(str(pick.home_team)),
                        v1: i18n.tx(str(pick.away_team))
                      })}</strong>,
                    v1: <br />,
                    v2: i18n.bet(str(pick.pick)),
                    v3: i18n.tx(format(i18n, pick.odds, 2))
                  })}</p>) : <p className="text-xs text-slate-500">{i18n.rich("{{v0}} s\xE9lections \xB7 d\xE9tails r\xE9serv\xE9s aux abonn\xE9s.", {
                    v0: i18n.tx(numeric(row.pick_count) ?? list(row.picks).length)
                  })}</p>)}</div></details>))}</div>)}</Card>
      </>)}
      <details className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><Info className="h-4 w-4 text-orange-600" />{i18n.t("Ce que la s\xE9lection permet de comprendre")}</summary><div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500"><p>{i18n.t("Les petites cotes ne re\xE7oivent aucun bonus. Le s\xE9lecteur compare la probabilit\xE9 estim\xE9e, l\u2019accord entre les sources et leur nombre. Ce score de classement n\u2019est pas une probabilit\xE9.")}</p><p>{i18n.t("Les deux matchs doivent \xEAtre distincts, avec des \xE9quipes diff\xE9rentes, des march\xE9s complets et des cotes r\xE9centes. Cette v\xE9rification ne supprime pas l\u2019incertitude sportive.")}</p><p>{i18n.t("Les probabilit\xE9s viennent du moteur existant, souvent du consensus des cotes. L\u2019efficacit\xE9 de ce nouveau filtrage devra \xEAtre mesur\xE9e sur des r\xE9sultats futurs, pas uniquement sur les gagnants d\xE9j\xE0 connus.")}</p><p>{i18n.t("Une seule s\xE9lection perdante arr\xEAte la s\xE9rie. Aucun pari ni aucune montante ne garantit un r\xE9sultat.")}</p></div></details>
    </div>
  </AppLayout>;
}

function HeroStat({
  label,
  value
}) {
  const i18n = usePageLanguage();
  return <div className="text-center"><p className="font-mono text-2xl font-bold text-white">{i18n.tx(value)}</p><p className="mt-1 text-[10px] text-slate-400">{i18n.tx(label)}</p></div>;
}

function PolicyCard({
  icon: Icon,
  title,
  text
}) {
  const i18n = usePageLanguage();
  return <Card className="rounded-2xl border-neutral-200 p-4"><Icon className="mb-3 h-5 w-5 text-orange-600" /><p className="text-sm font-bold text-slate-900">{i18n.tx(title)}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{i18n.tx(text)}</p></Card>;
}

function StageDot({
  stage,
  status
}) {
  const i18n = usePageLanguage();
  const cls = status === "WIN" ? "border-emerald-500 bg-emerald-500 text-white" : status === "LOSS" ? "border-rose-500 bg-rose-500 text-white" : status === "ACTIVE" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-neutral-200 bg-white text-slate-400";
  return <div className="min-w-[42px] text-center"><div className={cn("mx-auto grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold", cls)} aria-current={status === "ACTIVE" ? "step" : undefined}>{i18n.tx(status === "WIN" ? "✓" : status === "LOSS" ? "×" : status === "VOID" ? "↺" : stage)}</div><p className="mt-1 text-[9px] text-slate-400">{i18n.rich("\xC9tape {{v0}}", {
        v0: i18n.tx(stage)
      })}</p></div>;
}

function ResultBadge({
  status
}) {
  const i18n = usePageLanguage();
  const meta = RESULT[status] || RESULT.PENDING;
  const Icon = meta.icon;
  return <Badge className={cn("text-[10px]", meta.cls)}><Icon className="me-1 h-3 w-3" />{i18n.tx(meta.text)}</Badge>;
}

function WaitingCard({
  reason,
  title = "Le sélecteur attend deux matchs"
}) {
  const i18n = usePageLanguage();
  return <Card className="rounded-2xl border-dashed border-neutral-200 bg-white p-8 text-center"><Radar className="mx-auto mb-4 h-8 w-8 text-orange-500" /><h2 className="font-heading text-lg font-bold text-slate-900">{i18n.tx(title)}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{i18n.tx(reason)}</p></Card>;
}

function LockedPick({
  index,
  status
}) {
  const i18n = usePageLanguage();
  return <Card className="rounded-2xl border-neutral-200 bg-slate-50 p-5"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-500">{i18n.rich("RENCONTRE {{v0}}", {
          v0: i18n.tx(index + 1)
        })}</p><ResultBadge status={status} /></div><div className="my-6 space-y-3" aria-hidden="true"><div className="h-4 w-4/5 rounded bg-slate-200" /><div className="h-4 w-3/5 rounded bg-slate-200" /><div className="h-10 rounded-xl bg-orange-100/60" /></div><p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Lock className="h-4 w-4 text-orange-500" />{i18n.t("S\xE9lection r\xE9serv\xE9e aux abonn\xE9s")}</p></Card>;
}

function PickCard({
  pick,
  index,
  status,
  now
}) {
  const i18n = usePageLanguage();
  const started = date(pick.start_time)?.getTime() <= now;
  const factors = Array.isArray(pick.selection_factors) ? pick.selection_factors.filter(x => typeof x === "string").slice(0, 3) : [];
  return <Card className="wn-montante-in overflow-hidden rounded-2xl border-neutral-200 shadow-sm"><div className="flex items-center justify-between border-b border-neutral-100 bg-slate-50 px-5 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{i18n.rich("RENCONTRE {{v0}}", {
          v0: i18n.tx(index + 1)
        })}</p><ResultBadge status={status} /></div><div className="p-5"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{i18n.tx(str(pick.league, str(pick.sport_title, "Compétition non communiquée")))}</p><h3 className="mt-2 break-words font-heading text-lg font-extrabold leading-relaxed text-slate-900">{i18n.tx(str(pick.home_team, "Domicile"))} <span className="font-normal text-slate-400">{i18n.t("vs")}</span> {i18n.tx(str(pick.away_team, "Extérieur"))}</h3><p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><CalendarDays className="h-3.5 w-3.5" />{i18n.tx(dateLabel(i18n, pick.start_time))}</p>
    <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50 p-4"><div><p className="text-[10px] text-orange-500">{i18n.bet(str(pick.market_label, str(pick.market, "Marché")))}</p><p className="mt-1 break-words text-sm font-bold text-orange-800">{i18n.bet(str(pick.pick, "Sélection non communiquée"))}</p></div><span className="font-mono text-xl font-extrabold text-orange-700">{i18n.tx(numeric(pick.odds) > 1 ? format(i18n, pick.odds, 2) : "—")}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{i18n.tx(pick.probability_source === "bookmaker_consensus" ? "Estimation du marché vérifié" : "Estimation du moteur")}</p><p className="mt-1 font-mono text-sm font-bold text-slate-800">{i18n.tx(fractionPercent(i18n, pick.model_probability))}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{i18n.t("Sources compl\xE8tes")}</p><p className="mt-1 font-mono text-sm font-bold text-slate-800">{i18n.tx(format(i18n, pick.num_books, 0))}</p></div></div>
    {i18n.tx(pick.probability_source === "bookmaker_consensus" && <p className="mt-2 text-[10px] text-slate-400">{i18n.t("Estimation issue du consensus des cotes, distincte d\u2019une mesure de r\xE9ussite r\xE9elle.")}</p>)}
    {i18n.tx(started && status === "PENDING" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{i18n.t("Rencontre commenc\xE9e : la s\xE9lection reste fig\xE9e en attendant son r\xE9sultat.")}</p>)}
    <div className="mt-5 border-t border-neutral-100 pt-4"><p className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><ShieldCheck className="h-4 w-4 text-teal-600" />{i18n.t("Pourquoi cette s\xE9lection ?")}</p>{i18n.tx(factors.length ? <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500">{i18n.tx(factors.map((factor, n) => <li key={n} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-400" /><span>{i18n.tx(factor)}</span></li>))}</ul> : <p className="mt-2 text-xs text-slate-400">{i18n.t("Les crit\xE8res d\xE9taill\xE9s n\u2019ont pas \xE9t\xE9 enregistr\xE9s pour cette ancienne s\xE9lection.")}</p>)}<p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">{i18n.tx(explain(i18n, pick))}</p></div>
    {i18n.tx(pick.odds_verified_at && <p className="mt-3 text-[10px] text-slate-400">{i18n.rich("Cotes v\xE9rifi\xE9es : {{v0}}. Elles peuvent \xE9voluer.", {
          v0: i18n.tx(dateLabel(i18n, pick.odds_verified_at))
        })}</p>)}
    {i18n.tx(pick.match_id && <Link to={`/app/match/${encodeURIComponent(String(pick.match_id))}`} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-900">{i18n.t("Voir l\u2019analyse du match")}<ArrowRight className="h-3.5 w-3.5" /></Link>)}
  </div></Card>;
}

function RequireAuth({
  children,
  admin = false
}) {
  const {
    t
  } = useLanguage();
  const {
    user,
    loading
  } = useAuth();
  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-neutral-50">
        <div className="text-slate-500 text-sm">
          {t("Chargement…")}
        </div>
      </div>;
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
  return <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <PublicLanguageBar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          <Route path="/resultats" element={<TrackRecordPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/legal/:slug" element={<LegalPage />} />

          <Route path="/legal" element={<Navigate to="/legal/mentions-legales" replace />} />

          <Route path="/app" element={<RequireAuth>
                <DashboardPage />
              </RequireAuth>} />

          <Route path="/app/suivi" element={<RequireAuth><FollowedPicksPage /></RequireAuth>} />

          <Route path="/app/top" element={<RequireAuth>
                <TopPicksPage />
              </RequireAuth>} />

          <Route path="/app/value-bets" element={<RequireAuth>
                <ValueBetsPage />
              </RequireAuth>} />

          <Route path="/app/montante" element={<RequireAuth>
                <MontantePage />
              </RequireAuth>} />

          <Route path="/montante" element={<Navigate to="/app/montante" replace />} />

          <Route path="/app/profil" element={<RequireAuth>
                <ProfilePage />
              </RequireAuth>} />

          <Route path="/app/parrainage" element={<RequireAuth>
                <ParrainagePage />
              </RequireAuth>} />

          <Route path="/app/match/:matchId" element={<RequireAuth>
                <MatchDetailPage />
              </RequireAuth>} />

          <Route path="/app/combines" element={<RequireAuth>
                <CombosPage />
              </RequireAuth>} />

          <Route path="/app/builder" element={<RequireAuth>
                <ComboBuilderPage />
              </RequireAuth>} />

          <Route path="/app/aujourdhui" element={<RequireAuth>
                <TodayCombosPage />
              </RequireAuth>} />

          <Route path="/app/live" element={<RequireAuth>
                <LivePage />
              </RequireAuth>} />

          <Route path="/app/historique" element={<RequireAuth>
                <HistoryPage />
              </RequireAuth>} />

          <Route path="/app/abonnement" element={<RequireAuth>
                <SubscriptionPage />
              </RequireAuth>} />

          <Route path="/app/admin" element={<RequireAuth admin>
                <AdminPage />
              </RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <PageTracker />
        <WhatsAppWidget />
        <LocalizedToaster />
      </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>;
}

function PublicLanguageBar() {
  const {
    pathname
  } = useLocation();
  const {
    t
  } = useLanguage();
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;
  return <div className="border-b border-neutral-200 bg-white px-4 py-2" data-testid="public-language-bar">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3">
      <span className="text-sm font-semibold text-slate-600">{t("Langue de l’interface")}</span>
      <LanguageSwitcher compact />
    </div>
  </div>;
}

function LocalizedToaster() {
  const {
    direction
  } = useLanguage();
  return <Toaster position={direction === "rtl" ? "top-left" : "top-right"} richColors />;
}


