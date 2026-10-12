import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, Clock, Info, Layers, Lock, Play, Radar, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Target, XCircle } from "lucide-react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PaymentModal from "@/components/payment/PaymentModal";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const RESULT = {
  WIN: { text: "Gagné", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  LOSS: { text: "Perdu", cls: "border-rose-200 bg-rose-50 text-rose-700", icon: XCircle },
  VOID: { text: "Annulé", cls: "border-slate-200 bg-slate-50 text-slate-600", icon: RotateCcw },
  PENDING: { text: "Résultat en attente", cls: "border-amber-200 bg-amber-50 text-amber-700", icon: Clock },
};
function numeric(value) {
  if (!["number", "string"].includes(typeof value) || typeof value === "string" && !value.trim()) return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
function format(value, digits = 1) { const n = numeric(value); return n === null ? "Non communiqué" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(n); }
function fractionPercent(value) { const n = numeric(value); return n !== null && n >= 0 && n <= 1 ? `${format(n * 100)} %` : "Non communiqué"; }
function str(value, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function list(value) { return Array.isArray(value) ? value.filter(x => x && typeof x === "object" && !Array.isArray(x)) : []; }
function date(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const d = new Date(raw); return Number.isFinite(d.getTime()) ? d : null;
}
function dateLabel(value) { const d = date(value); return d ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d) : "Horaire non communiqué"; }
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
function explain(pick) {
  const key = str(pick.market).toLowerCase();
  if (key === "h2h") return /^(draw|nul|match nul)$/i.test(str(pick.pick)) ? "La sélection prévoit un match nul dans la période couverte." : `La sélection prévoit la victoire de ${str(pick.pick, "l’équipe indiquée")}, selon les règles de ce marché.`;
  if (key === "totals") return `« ${str(pick.pick)} » porte sur le total de buts ou de points. Le seuil et la période du marché déterminent le résultat.`;
  if (key === "spreads") return "Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.";
  return "La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.";
}
function responseData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !["NONE", "ACTIVE", "FAILED", "COMPLETED"].includes(value.status)) throw Error("Réponse Montante invalide");
  return value;
}
function errorLabel(error) {
  if (error?.response?.status === 401) return "Ta session a expiré. Reconnecte-toi pour retrouver la montante.";
  if (error?.response?.status === 403) return "Cette action est réservée à l’administrateur ou à ton niveau d’accès.";
  if (error?.code === "ECONNABORTED") return "Le chargement a pris trop de temps. Réessaie dans un instant.";
  return "Le service Montante est temporairement indisponible. Réessaie dans un instant.";
}

export default function MontantePage() {
  const { user, refresh: refreshAuth } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [days, setDays] = useState(10);
  const [payOpen, setPayOpen] = useState(false);
  const [restartConfirmed, setRestartConfirmed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const controller = useRef(null);
  const actionController = useRef(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const activeData = useRef(null);
  const refreshAuthRef = useRef(refreshAuth);
  refreshAuthRef.current = refreshAuth;
  const authKey = `${user?.id || "anonymous"}|${user?.subscription_tier || user?.subscription || "free"}|${Boolean(user?.is_admin)}|${user?.subscription_expires_at || ""}`;
  const isAdmin = Boolean(user?.is_admin) && data?.viewer?.is_admin === true;
  const premium = data?.viewer?.has_premium_access === true && data?.picks_locked !== true;
  const load = useCallback(async (background = false) => {
    if (actionController.current) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const requestGeneration = generation.current;
    if (background && activeData.current) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const result = await api.get("/montante", { signal: request.signal, timeout: 30_000 });
      const payload = responseData(result.data);
      if (request.signal.aborted || !mounted.current || requestGeneration !== generation.current) return;
      setData(payload); activeData.current = payload; setNow(Date.now());
    } catch (cause) {
      if (!request.signal.aborted && mounted.current && requestGeneration === generation.current) setError(errorLabel(cause));
    } finally {
      if (!request.signal.aborted && mounted.current && requestGeneration === generation.current) { setLoading(false); setRefreshing(false); controller.current = null; }
    }
  }, []);
  useEffect(() => {
    mounted.current = true; generation.current += 1; activeData.current = null;
    setData(null); setSuccess(""); setBusy(""); setRefreshing(false); load();
    return () => { mounted.current = false; controller.current?.abort(); actionController.current?.abort(); actionController.current = null; };
  }, [authKey, load]);
  useEffect(() => {
    const tick = () => { setNow(Date.now()); if (!document.hidden && !controller.current && !actionController.current) load(true); };
    const timer = window.setInterval(tick, 60_000);
    const focus = () => { if (!document.hidden && !controller.current && !actionController.current) load(true); };
    window.addEventListener("focus", focus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [load]);
  const adminAction = async (kind) => {
    if (!isAdmin || actionController.current || kind === "restart" && !restartConfirmed) return;
    controller.current?.abort(); controller.current = null; generation.current += 1;
    const requestGeneration = generation.current;
    const request = new AbortController(); actionController.current = request;
    setBusy(kind); setError(""); setSuccess(""); setRefreshing(false);
    try {
      const endpoint = kind === "sync" ? "/montante/sync-results" : `/montante/${kind}`;
      const result = await api.post(endpoint, null, { signal: request.signal, timeout: 60_000, ...(kind !== "sync" ? { params: { days, initial_bankroll: 10000 } } : {}) });
      const payload = responseData(result.data);
      if (!mounted.current || request.signal.aborted || requestGeneration !== generation.current) return;
      setData(payload); activeData.current = payload; setRestartConfirmed(false);
      setSuccess(kind === "sync" ? "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte." : "La série est lancée. La sélection attendra deux matchs admissibles.");
    } catch (cause) {
      if (mounted.current && !request.signal.aborted && requestGeneration === generation.current) setError(errorLabel(cause));
    } finally {
      if (actionController.current === request) actionController.current = null;
      if (mounted.current && requestGeneration === generation.current) { setBusy(""); setLoading(false); }
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
    <style>{`.wn-montante-in{animation:wn-montante-in .35s ease-out both}@keyframes wn-montante-in{from{opacity:.5;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.wn-montante-in{animation:none}}`}</style>
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl"><div className="mb-4 flex flex-wrap gap-2"><Badge className="border-orange-400/30 bg-orange-400/10 text-orange-200"><Layers className="mr-1.5 h-3.5 w-3.5" />MONTANTE WNPULSE</Badge><Badge className="border-white/15 bg-white/5 text-slate-300">2 matchs distincts par étape</Badge></div>
            <h1 className="font-heading text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Deux rencontres.<br /><span className="text-orange-400">Des choix expliqués.</span></h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300">Les sélections sont comparées selon les estimations et la qualité des données. Une petite cote ne suffit pas à faire un bon choix.</p><p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" />Horaires : {zone}</p>
          </div>
          <div className="flex flex-col gap-3"><span className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-center text-sm font-semibold">{stageLabel}</span><Button variant="outline" onClick={() => load(Boolean(data))} disabled={loading || refreshing || Boolean(busy)} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />{refreshing ? "Actualisation…" : "Actualiser"}</Button></div>
        </div>
        {!loading && data && data.status !== "NONE" && <div className="relative mt-7 grid grid-cols-3 gap-3 border-t border-white/10 pt-5"><HeroStat label="Étape" value={`${stage} / ${total}`} /><HeroStat label="Étapes gagnées" value={wins} /><HeroStat label="Matchs publiés" value={count} /></div>}
      </section>
      {error && <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-rose-800">{error}{data && " Les dernières données chargées restent affichées."}</p><Button size="sm" variant="outline" disabled={loading || refreshing || Boolean(busy)} onClick={() => load(Boolean(data))}>Réessayer</Button></div>}
      {success && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
      <div className="grid gap-3 sm:grid-cols-3"><PolicyCard icon={Target} title="Toutes les cotes comparées" text="Le classement n’ajoute aucun bonus aux petites cotes." /><PolicyCard icon={ShieldCheck} title="Sources vérifiées" text="Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes." /><PolicyCard icon={Clock} title="Le droit d’attendre" text="Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée." /></div>
      {isAdmin && <Card className="rounded-2xl border-orange-200 p-5"><p className="mb-4 flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-orange-600" />Pilotage administrateur</p><div className="flex flex-wrap items-center gap-3"><label className="text-xs text-slate-500">Parcours <select value={days} onChange={e => setDays(Number(e.target.value))} className="ml-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value={10}>10 étapes</option><option value={15}>15 étapes</option></select></label>
        {data?.status === "NONE" ? <Button onClick={() => adminAction("start")} disabled={Boolean(busy)} className="bg-orange-600 text-white hover:bg-orange-700"><Play className="mr-2 h-4 w-4" />Démarrer</Button> : <Button onClick={() => adminAction("sync")} disabled={Boolean(busy)} className="bg-slate-900 text-white hover:bg-slate-800"><Radar className="mr-2 h-4 w-4" />{busy === "sync" ? "Contrôle…" : "Synchroniser les résultats"}</Button>}
        {data?.status !== "NONE" && <details className="w-full rounded-xl border border-neutral-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Lancer une nouvelle série</summary><p className="mt-2 text-xs text-slate-500">La série actuelle sera archivée sur le serveur et remplacée.</p><label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={restartConfirmed} onChange={e => setRestartConfirmed(e.target.checked)} />Remplacer la série actuelle</label><Button onClick={() => adminAction("restart")} disabled={!restartConfirmed || Boolean(busy)} variant="outline" size="sm" className="mt-3"><RotateCcw className="mr-2 h-4 w-4" />Nouvelle série</Button></details>}
      </div>{data?.diagnostic && <details className="mt-4 border-t border-neutral-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-500">Diagnostic de sélection</summary><div className="mt-2 space-y-1 text-xs text-slate-500"><p>{format(data.diagnostic.matches_received, 0)} matchs reçus · {format(data.diagnostic.eligible, 0)} événements admissibles</p>{Object.entries(data.diagnostic.rejections || {}).map(([reason, n]) => <p key={reason}>{reason} : {format(n, 0)}</p>)}</div></details>}</Card>}
      {loading ? <Card role="status" className="grid h-64 place-items-center rounded-2xl border-neutral-200"><div className="text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-orange-500" /><p className="mt-3 text-sm text-slate-500">Chargement de la montante…</p></div></Card> : !data || data.status === "NONE" ? <WaitingCard reason="La prochaine série apparaîtra ici dès son lancement par l’administrateur." title="Nouvelle montante à venir" /> : <>
        <Card className="rounded-2xl border-neutral-200 p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Parcours de la série</p><h2 className="mt-1 font-heading text-xl font-bold text-slate-900">{wins} étape{wins > 1 ? "s" : ""} gagnée{wins > 1 ? "s" : ""} sur {total}</h2></div><span className="font-mono text-xl font-bold text-slate-800">{format(progress)} %</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500" style={{ width: `${progress}%` }} /></div><div className="mt-5 flex gap-2 overflow-x-auto pb-2">{Array.from({ length: total }, (_, i) => <StageDot key={i} stage={i + 1} status={stageStatus(history, i + 1, stage, data.status)} />)}</div><p className="mt-2 text-[10px] text-slate-400">Une étape annulée n’est pas une victoire. Les jours sans sélection ne font pas avancer le parcours.</p></Card>
        <section><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-heading text-xl font-bold text-slate-900"><Sparkles className="h-5 w-5 text-orange-600" />Sélections · Étape {stage}</h2>{premium && numeric(data.selection_summary?.combined_odds) !== null && <Badge className="border-orange-200 bg-orange-50 text-orange-700">Cote combinée : {format(data.selection_summary.combined_odds, 2)}</Badge>}</div>
          {data.selection_version === "legacy" && count > 0 && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Sélection publiée avant cette mise à jour : elle reste suivie jusqu’à son règlement. Les nouvelles étapes exigent deux matchs.</p>}
          {count === 0 ? <WaitingCard reason={str(data.waiting_reason, "Deux matchs suffisamment documentés ne sont pas encore disponibles.")} /> : !premium ? <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2">{Array.from({ length: Math.min(count, 10) }, (_, i) => <LockedPick key={i} index={i} status={pickStatus(null, i, data)} />)}</div><div className="flex flex-col justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:flex-row sm:items-center"><div><p className="font-bold text-slate-900">Les mêmes sélections que les abonnés</p><p className="mt-1 text-sm text-slate-600">Débloque les rencontres, les marchés et les raisons de chaque choix.</p></div><Button onClick={() => setPayOpen(true)} className="shrink-0 bg-orange-600 text-white hover:bg-orange-700">Découvrir Pro<ArrowRight className="ml-2 h-4 w-4" /></Button></div></div> : <div className="grid items-start gap-5 md:grid-cols-2">{picks.map((pick, i) => <PickCard key={`${pick.history_signature || pick.match_id || i}-${i}`} pick={pick} index={i} status={pickStatus(pick, i, data)} now={now} />)}</div>}
          {premium && estimate !== null && count === 2 && <details className="mt-4 rounded-xl border border-neutral-200 bg-white p-4"><summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600"><Info className="h-4 w-4" />Lire l’estimation de la paire</summary><p className="mt-3 text-sm text-slate-700">Approximation théorique : <strong>{format(estimate)} %</strong>, sous hypothèse d’indépendance.</p><p className="mt-2 text-xs leading-relaxed text-slate-500">Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de réussite constaté. Des événements distincts peuvent encore être corrélés.</p></details>}
        </section>
        <Card className="overflow-hidden rounded-2xl border-neutral-200"><div className="border-b border-neutral-100 p-5"><h2 className="font-heading text-lg font-bold text-slate-900">Historique de la série</h2><p className="mt-1 text-xs text-slate-500">Les victoires, pertes et annulations restent visibles.</p></div>{!history.length ? <p className="p-7 text-center text-sm text-slate-400">Aucune étape réglée pour le moment.</p> : <div className="divide-y divide-neutral-100">{[...history].reverse().map((row, i) => <details key={`${row.day}-${row.settled_at || i}`} className="p-4 sm:px-5"><summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-slate-800">Étape {row.day}</span><div className="flex items-center gap-3"><span className="text-[10px] text-slate-400">{dateLabel(row.settled_at)}</span><ResultBadge status={row.status} /></div></summary><div className="mt-3 space-y-2">{premium ? list(row.picks).map((pick, n) => <p key={n} className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600"><strong>{str(pick.home_team)} vs {str(pick.away_team)}</strong><br />{str(pick.pick)} · cote {format(pick.odds, 2)}</p>) : <p className="text-xs text-slate-500">{numeric(row.pick_count) ?? list(row.picks).length} sélections · détails réservés aux abonnés.</p>}</div></details>)}</div>}</Card>
      </>}
      <details className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><Info className="h-4 w-4 text-orange-600" />Ce que la sélection permet de comprendre</summary><div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500"><p>Les petites cotes ne reçoivent aucun bonus. Le sélecteur compare la probabilité estimée, l’accord entre les sources et leur nombre. Ce score de classement n’est pas une probabilité.</p><p>Les deux matchs doivent être distincts, avec des équipes différentes, des marchés complets et des cotes récentes. Cette vérification ne supprime pas l’incertitude sportive.</p><p>Les probabilités viennent du moteur existant, souvent du consensus des cotes. L’efficacité de ce nouveau filtrage devra être mesurée sur des résultats futurs, pas uniquement sur les gagnants déjà connus.</p><p>Une seule sélection perdante arrête la série. Aucun pari ni aucune montante ne garantit un résultat.</p></div></details>
    </div>
    <PaymentModal isOpen={payOpen} targetTier="PRO" onClose={() => { setPayOpen(false); load(true); Promise.resolve().then(() => refreshAuthRef.current?.()).catch(() => {}); }} />
  </AppLayout>;
}
function HeroStat({ label, value }) { return <div className="text-center"><p className="font-mono text-2xl font-bold text-white">{value}</p><p className="mt-1 text-[10px] text-slate-400">{label}</p></div>; }
function PolicyCard({ icon: Icon, title, text }) { return <Card className="rounded-2xl border-neutral-200 p-4"><Icon className="mb-3 h-5 w-5 text-orange-600" /><p className="text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p></Card>; }
function StageDot({ stage, status }) { const cls = status === "WIN" ? "border-emerald-500 bg-emerald-500 text-white" : status === "LOSS" ? "border-rose-500 bg-rose-500 text-white" : status === "ACTIVE" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-neutral-200 bg-white text-slate-400";return <div className="min-w-[42px] text-center"><div className={cn("mx-auto grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold", cls)} aria-current={status === "ACTIVE" ? "step" : undefined}>{status === "WIN" ? "✓" : status === "LOSS" ? "×" : status === "VOID" ? "↺" : stage}</div><p className="mt-1 text-[9px] text-slate-400">Étape {stage}</p></div>; }
function ResultBadge({ status }) { const meta = RESULT[status] || RESULT.PENDING;const Icon = meta.icon;return <Badge className={cn("text-[10px]", meta.cls)}><Icon className="mr-1 h-3 w-3" />{meta.text}</Badge>; }
function WaitingCard({ reason, title = "Le sélecteur attend deux matchs" }) { return <Card className="rounded-2xl border-dashed border-neutral-200 bg-white p-8 text-center"><Radar className="mx-auto mb-4 h-8 w-8 text-orange-500" /><h2 className="font-heading text-lg font-bold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{reason}</p></Card>; }
function LockedPick({ index, status }) { return <Card className="rounded-2xl border-neutral-200 bg-slate-50 p-5"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-500">RENCONTRE {index + 1}</p><ResultBadge status={status} /></div><div className="my-6 space-y-3" aria-hidden="true"><div className="h-4 w-4/5 rounded bg-slate-200" /><div className="h-4 w-3/5 rounded bg-slate-200" /><div className="h-10 rounded-xl bg-orange-100/60" /></div><p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Lock className="h-4 w-4 text-orange-500" />Sélection réservée aux abonnés</p></Card>; }
function PickCard({ pick, index, status, now }) {
  const started = date(pick.start_time)?.getTime() <= now;
  const factors = Array.isArray(pick.selection_factors) ? pick.selection_factors.filter(x => typeof x === "string").slice(0, 3) : [];
  return <Card className="wn-montante-in overflow-hidden rounded-2xl border-neutral-200 shadow-sm"><div className="flex items-center justify-between border-b border-neutral-100 bg-slate-50 px-5 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">RENCONTRE {index + 1}</p><ResultBadge status={status} /></div><div className="p-5"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{str(pick.league, str(pick.sport_title, "Compétition non communiquée"))}</p><h3 className="mt-2 break-words font-heading text-lg font-extrabold leading-relaxed text-slate-900">{str(pick.home_team, "Domicile")} <span className="font-normal text-slate-400">vs</span> {str(pick.away_team, "Extérieur")}</h3><p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><CalendarDays className="h-3.5 w-3.5" />{dateLabel(pick.start_time)}</p>
    <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50 p-4"><div><p className="text-[10px] text-orange-500">{str(pick.market_label, str(pick.market, "Marché"))}</p><p className="mt-1 break-words text-sm font-bold text-orange-800">{str(pick.pick, "Sélection non communiquée")}</p></div><span className="font-mono text-xl font-extrabold text-orange-700">{numeric(pick.odds) > 1 ? format(pick.odds, 2) : "—"}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{pick.probability_source === "bookmaker_consensus" ? "Estimation du marché vérifié" : "Estimation du moteur"}</p><p className="mt-1 font-mono text-sm font-bold text-slate-800">{fractionPercent(pick.model_probability)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">Sources complètes</p><p className="mt-1 font-mono text-sm font-bold text-slate-800">{format(pick.num_books, 0)}</p></div></div>
    {pick.probability_source === "bookmaker_consensus" && <p className="mt-2 text-[10px] text-slate-400">Estimation issue du consensus des cotes, distincte d’une mesure de réussite réelle.</p>}
    {started && status === "PENDING" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Rencontre commencée : la sélection reste figée en attendant son résultat.</p>}
    <div className="mt-5 border-t border-neutral-100 pt-4"><p className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><ShieldCheck className="h-4 w-4 text-teal-600" />Pourquoi cette sélection ?</p>{factors.length ? <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500">{factors.map((factor, n) => <li key={n} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-400" /><span>{factor}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-400">Les critères détaillés n’ont pas été enregistrés pour cette ancienne sélection.</p>}<p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">{explain(pick)}</p></div>
    {pick.odds_verified_at && <p className="mt-3 text-[10px] text-slate-400">Cotes vérifiées : {dateLabel(pick.odds_verified_at)}. Elles peuvent évoluer.</p>}
    {pick.match_id && <Link to={`/app/match/${encodeURIComponent(String(pick.match_id))}`} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-900">Voir l’analyse du match<ArrowRight className="h-3.5 w-3.5" /></Link>}
  </div></Card>;
}
