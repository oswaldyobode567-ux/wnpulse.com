import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, FileCheck2, Flame, History, Info, LayoutDashboard, RefreshCw, Search, ShieldCheck, Target, Trophy, X, XCircle, Zap } from "lucide-react";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { AdminShareProvider, AdminShareToolbar, AdminShareActions } from "@/components/MatchCard";
const SPORTS = [["all", "Tous les sports", "◉"], ["football", "Football", "⚽"], ["basketball", "Basketball", "🏀"], ["tennis", "Tennis", "🎾"], ["hockey", "Hockey", "🏒"], ["baseball", "Baseball", "⚾"], ["mma", "MMA", "🥊"]];
const RESULTS = {
  won: {
    text: "Gagné",
    icon: CheckCircle2,
    style: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500"
  },
  lost: {
    text: "Perdu",
    icon: XCircle,
    style: "bg-rose-50 text-rose-800 border-rose-200",
    dot: "bg-rose-500"
  },
  void: {
    text: "Remboursé",
    icon: RefreshCw,
    style: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400"
  },
  pending: {
    text: "En attente",
    icon: Clock,
    style: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500"
  }
};
const RISK = {
  safe: ["Prudent", "bg-teal-50 text-teal-800 border-teal-200"],
  value: ["Modéré", "bg-amber-50 text-amber-800 border-amber-200"],
  risky: ["Risqué", "bg-rose-50 text-rose-800 border-rose-200"]
};
function numeric(value) {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function normalized(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function sportName(value) {
  const key = normalized(value) === "soccer" ? "football" : normalized(value);
  return SPORTS.find(([code]) => code === key)?.[1] || String(value || "—");
}
function resultStatus(value) {
  return Object.prototype.hasOwnProperty.call(RESULTS, value) ? value : "pending";
}
function displayNumber(i18n, value, digits = 0) {
  const number = numeric(value);
  return number === null ? "—" : i18n.formatNumber(number, {
    maximumFractionDigits: digits
  });
}
function displayPercent(i18n, value) {
  const number = numeric(value);
  return number === null || number < 0 || number > 100 ? "—" : `${displayNumber(i18n, number, 1)} %`;
}
function displayDate(i18n, value) {
  return i18n.formatPattern(value, "DD/MM/YYYY") || "—";
}
const ANALYTICS_COPY = {
 fr:["Analyse des performances","Période glissante selon la date du match","7 jours","30 jours","90 jours","Pronostics départagés","Gagnés","Perdus","Remboursés","Taux de réussite","Comparer par","Sport","Marché","Tranche de cote","Version du moteur","Aucune donnée confirmée sur cette période.","Données indisponibles. Réessaie.","Actualiser","Non renseigné","Échantillon","Seuls les pronostics archivés avant le match sont comptés. Les remboursements sont exclus du taux. Les dates absentes sont exclues ; les versions manquantes restent non renseignées. Les anciens et nouveaux moteurs ne sont pas mélangés dans la comparaison par version.","Ces résultats passés ne garantissent pas les résultats futurs.","Chargement…"],
 en:["Performance analysis","Rolling period by match date","7 days","30 days","90 days","Decided picks","Won","Lost","Refunded","Win rate","Compare by","Sport","Market","Odds range","Model version","No confirmed results in this period.","Data unavailable. Try again.","Refresh","Not recorded","Sample","Only picks archived before kickoff are counted. Refunds are excluded from win rate. Missing dates are excluded; missing versions remain unspecified. Versions are compared separately.","Past results do not guarantee future results.","Loading…"],
 es:["Análisis de resultados","Período móvil según la fecha del partido","7 días","30 días","90 días","Pronósticos resueltos","Ganados","Perdidos","Reembolsados","Tasa de acierto","Comparar por","Deporte","Mercado","Rango de cuota","Versión del motor","Sin resultados confirmados en este período.","Datos no disponibles. Reinténtalo.","Actualizar","No registrado","Muestra","Solo cuentan pronósticos archivados antes del partido. Los reembolsos no cuentan para la tasa. Se excluyen fechas ausentes y las versiones desconocidas no se inventan.","Los resultados pasados no garantizan resultados futuros.","Cargando…"],
 pt:["Análise de resultados","Período móvel pela data do jogo","7 dias","30 dias","90 dias","Palpites decididos","Ganhos","Perdidos","Reembolsados","Taxa de acerto","Comparar por","Desporto","Mercado","Intervalo de cota","Versão do motor","Sem resultados confirmados neste período.","Dados indisponíveis. Tenta novamente.","Atualizar","Não registado","Amostra","Só contam palpites arquivados antes do jogo. Reembolsos excluídos da taxa. Datas em falta são excluídas e versões desconhecidas não são inventadas.","Resultados passados não garantem resultados futuros.","A carregar…"],
 de:["Leistungsanalyse","Rollierender Zeitraum nach Spieldatum","7 Tage","30 Tage","90 Tage","Entschiedene Tipps","Gewonnen","Verloren","Erstattet","Trefferquote","Vergleichen nach","Sport","Markt","Quotenbereich","Modellversion","Keine bestätigten Ergebnisse in diesem Zeitraum.","Daten nicht verfügbar. Erneut versuchen.","Aktualisieren","Nicht erfasst","Stichprobe","Nur vor Spielbeginn archivierte Tipps zählen. Erstattungen zählen nicht zur Quote. Fehlende Daten werden ausgeschlossen und Modellversionen nicht erfunden.","Vergangene Ergebnisse garantieren keine zukünftigen Ergebnisse.","Laden…"],
 ar:["تحليل النتائج","فترة متحركة حسب تاريخ المباراة","7 أيام","30 يوماً","90 يوماً","التوقعات المحسومة","فائز","خاسر","مسترد","نسبة النجاح","المقارنة حسب","الرياضة","السوق","نطاق المعامل","إصدار المحرك","لا توجد نتائج مؤكدة في هذه الفترة.","البيانات غير متاحة. حاول مجدداً.","تحديث","غير مسجل","العينة","تُحسب التوقعات المؤرشفة قبل المباراة فقط. المستردات مستبعدة من النسبة، والتواريخ المفقودة مستبعدة، ولا تُختلق إصدارات.","النتائج السابقة لا تضمن النتائج المستقبلية.","جار التحميل…"]
};
function TrackPerformance({ sport }) {
  const i18n = usePageLanguage(); const w = ANALYTICS_COPY[i18n.language] || ANALYTICS_COPY.fr;
  const [days,setDays] = useState(30); const [dimension,setDimension] = useState("sport");
  const [state,setState] = useState({ data:null, loading:true, error:false }); const [retry,setRetry] = useState(0);
  useEffect(()=>{let active=true;const controller=new AbortController();setState({data:null,loading:true,error:false});
    api.get("/track-record/analytics",{params:{days,sport},signal:controller.signal,timeout:20000}).then(r=>{
      if(active){if(!r.data || !r.data.summary || !r.data.groups)throw Error("Invalid analytics");setState({data:r.data,loading:false,error:false});}
    }).catch(()=>{if(active && !controller.signal.aborted)setState({data:null,loading:false,error:true});});
    return ()=>{active=false;controller.abort();};
  },[days,sport,retry]);
  const groups=Array.isArray(state.data?.groups?.[dimension]) ? state.data.groups[dimension] : [];
  const summary=state.data?.summary || {}; const count=v=>i18n.formatNumber(Number(v)||0); const rate=v=>v == null ? "—" : `${new Intl.NumberFormat(i18n.locale,{maximumFractionDigits:1}).format(v)} %`;
  return <section className="my-5 rounded-2xl border border-orange-200 bg-white p-4 sm:p-6" data-testid="track-performance">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold text-slate-900">{w[0]}</h2><p className="mt-1 text-sm text-slate-500">{w[1]}</p></div><div className="flex flex-wrap gap-2">{[7,30,90].map((v,i)=><button type="button" key={v} aria-pressed={days===v} onClick={()=>setDays(v)} className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${days===v?"border-orange-500 bg-orange-50 text-orange-800":"border-slate-200 text-slate-600"}`}>{w[i+2]}</button>)}</div></div>
    {state.error ? <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">{w[16]} <button className="min-h-11 font-bold text-orange-700" onClick={()=>setRetry(v=>v+1)}>{w[17]}</button></div> : state.loading ? <p role="status" className="mt-4 text-sm text-slate-500">{w[22]}</p> : <><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{[[w[5],count(summary.evaluated)],[w[6],count(summary.won)],[w[7],count(summary.lost)],[w[8],count(summary.void)],[w[9],rate(summary.win_rate)]].map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-mono text-lg font-bold text-slate-900">{value}</p></div>)}</div>
    <label className="mt-5 block text-sm font-bold text-slate-700" htmlFor="track-analytics-dimension">{w[10]}</label><select id="track-analytics-dimension" value={dimension} onChange={e=>setDimension(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 sm:w-auto">{[["sport",11],["market",12],["odds",13],["model",14]].map(([key,i])=><option key={key} value={key}>{w[i]}</option>)}</select>
    {!groups.length ? <p className="mt-4 text-sm text-slate-500">{w[15]}</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{groups.map(row=><article key={row.key} className="min-w-0 rounded-xl border border-slate-200 p-3"><h3 className="break-words font-bold text-slate-900">{row.key === "unknown" ? w[18] : dimension === "sport" ? i18n.t(sportName(row.key)) : dimension === "market" ? i18n.bet(row.key) : row.key}</h3><p className="mt-2 text-sm text-slate-600">{w[19]} : <strong>{count(row.evaluated)}</strong> · {w[9]} : <strong>{rate(row.win_rate)}</strong></p><p className="mt-1 text-xs text-slate-500">{w[6]} {count(row.won)} · {w[7]} {count(row.lost)} · {w[8]} {count(row.void)}</p></article>)}</div>}
    <p className="mt-4 text-xs leading-5 text-slate-500">{w[20]} {w[21]}</p></>}
  </section>;
}

export default function TrackRecordPage() {
  const i18n = useResultsLanguage();
  const {
    user
  } = useAuth();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [sport, setSport] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    const sportParam = sport !== "all" ? `&sport=${encodeURIComponent(sport)}` : "";
    api.get(`/track-record?page=${page}&per_page=20${sportParam}`, {
      signal: controller.signal
    }).then(response => {
      if (!active) return;
      if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) throw Error("Invalid track record");
      setData(response.data);
    }).catch(cause => {
      if (active && !controller.signal.aborted) {
        setData(null);
        setError(typeof cause?.response?.data?.detail === "string" ? cause.response.data.detail : "Impossible de charger les résultats.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, sport, refresh]);
  const stats = data?.stats || {};
  const rows = useMemo(() => Array.isArray(data?.results) ? data.results.filter(row => row && typeof row === "object") : [], [data]);
  const language = i18n.language;
  const visible = useMemo(() => rows.filter(row => (status === "all" || resultStatus(row.status) === status) && normalized([row.match, row.league, row.pick, i18n.t(sportName(row.sport)), i18n.bet(row.pick)].join(" ")).includes(normalized(query.toLocaleLowerCase(language)))), [rows, query, status, language, i18n]);
  const changeSport = value => {
    setSport(value);
    setPage(1);
    setQuery("");
    setStatus("all");
  };
  const currentPage = Math.max(1, numeric(data?.page) || page);
  const totalPages = Math.max(1, numeric(data?.total_pages) || 1);
  const rate = numeric(stats.win_rate);
  const hasRate = !loading && !error && rate !== null && rate >= 0 && rate <= 100;
  const metric = (value, digits) => loading || error ? "—" : displayNumber(i18n, value, digits);
  const resetPageFilters = () => {
    setQuery("");
    setStatus("all");
  };
  const content = <AdminShareProvider isAdmin={Boolean(user?.is_admin)} items={loading || error ? [] : visible} kind="results"><main className="wr-results mx-auto w-full min-w-0 max-w-7xl px-3 pb-24 pt-3 sm:px-6 sm:pt-7 lg:px-8" lang={i18n.language} dir={i18n.direction}>
    <style>{`.wr-results{font-size:16px}.wr-results .wr-enter{animation:wr-enter .35s ease-out both}@keyframes wr-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.wr-results .wr-enter{animation:none}}.wr-results button:focus-visible,.wr-results a:focus-visible,.wr-results select:focus-visible,.wr-results input:focus-visible{outline:3px solid #fb923c;outline-offset:3px}`}</style>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><History className="h-4 w-4 text-orange-600" />{i18n.t("Track record")}</div>
      <Link to={user ? "/app" : "/"} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-orange-300 hover:text-orange-700" data-testid="track-back-dashboard">{user ? <LayoutDashboard className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4 rtl:rotate-180" />}{i18n.t(user ? "Tableau de bord" : "Retour à l’accueil")}</Link>
    </div>
    <section className="wr-enter relative mb-4 overflow-hidden rounded-2xl bg-slate-950 p-4 text-white sm:p-6 lg:p-8" aria-labelledby="track-heading">
      <div aria-hidden="true" className="pointer-events-none absolute -end-12 -top-24 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative grid gap-4 lg:gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold tracking-wide text-slate-300"><ShieldCheck className="h-4 w-4 text-orange-300" />{i18n.t("HISTORIQUE PUBLIC")}</div>
          <h1 id="track-heading" className="font-heading text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">{i18n.t("Le bilan.")}<br /><span className="text-orange-300">{i18n.t("Tous les résultats.")}</span></h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">{i18n.t("Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.")}</p>
          <a href="#track-journal" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 hover:bg-orange-50">{i18n.t("Explorer les résultats")}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></a>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-300">{i18n.t("Taux de réussite")}</span><span className="rounded-full border border-white/10 px-2 py-1 text-xs text-slate-300">{i18n.t(sportName(sport))}</span></div>
          <div className="mt-3 flex items-center gap-3 sm:gap-6">
            <div aria-hidden="true" className="grid h-20 w-20 shrink-0 place-items-center rounded-full p-1.5 sm:h-28 sm:w-28" style={{
              background: hasRate ? `conic-gradient(#34d399 ${rate * 3.6}deg,#334155 0deg)` : "#334155"
            }}>
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950"><span className="font-mono text-xl sm:text-3xl font-black" data-testid="track-win-rate">{hasRate ? displayPercent(i18n, rate) : "—"}</span><span className="mt-1 text-xs text-slate-400">{i18n.t("réussite")}</span></div>
            </div>
            <dl className="min-w-0 flex-1 space-y-2" aria-label={i18n.t("Taux de réussite") + " : " + (hasRate ? displayPercent(i18n, rate) : "—")}>
              {[["won", stats.wins], ["lost", stats.losses], ["void", stats.voids]].map(([key, value]) => <div key={key} className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-sm text-slate-300"><span className={`h-2 w-2 rounded-full ${RESULTS[key].dot}`} />{i18n.t(RESULTS[key].text)}</dt><dd className="font-mono text-lg font-bold">{metric(value)}</dd></div>)}
            </dl>
          </div>
          <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">{i18n.t("Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.")}</p>
        </div>
      </div>
    </section>
    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="kpis">
      <Metric icon={FileCheck2} label={i18n.t("Pronostics départagés")} value={metric(stats.total)} sub={i18n.t("Gagnés et perdus")} />
      <Metric icon={Trophy} label={i18n.t("Victoires")} value={metric(stats.wins)} sub={i18n.t("Dans le sport sélectionné")} />
      <Metric icon={Target} label={i18n.t("Cote moyenne")} value={metric(stats.avg_odds, 2)} sub={i18n.t("Sur les pronostics départagés")} />
      <Metric icon={Flame} label={i18n.t("Série en cours")} value={metric(stats.current_streak)} sub={i18n.t("Victoires consécutives")} />
    </div>
    {data?.transition_mode && data.note && <div className="mb-5 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900" data-testid="transition-mode-banner"><Info className="mt-1 h-5 w-5 shrink-0" /><p>{i18n.t(data.note)}</p></div>}
    <TrackPerformance sport={sport} />
    <section id="track-journal" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="track-journal-heading">
      <header className="border-b border-slate-100 p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 id="track-journal-heading" className="font-heading text-lg sm:text-2xl font-extrabold text-slate-900">{i18n.t("Le journal des résultats")}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{i18n.t("Les derniers résultats en premier.")}</p></div><button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50" data-testid="track-refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{i18n.t("Actualiser")}</button></div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 sm:flex-wrap" aria-label={i18n.t("Filtrer par sport")} data-testid="sport-filters">{SPORTS.map(([code, name, emoji]) => <button key={code} type="button" aria-pressed={sport === code} onClick={() => changeSport(code)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${sport === code ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-orange-300"}`}><span aria-hidden="true">{emoji}</span>{i18n.t(name)}</button>)}</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="relative"><label className="sr-only" htmlFor="track-search">{i18n.t("Recherche sur cette page")}</label><Search className="pointer-events-none absolute start-4 top-3.5 h-5 w-5 text-slate-400" /><input id="track-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={i18n.t("Équipe, championnat, compétition…")} className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 ps-12 pe-12 text-base text-slate-900" />{query && <button aria-label={i18n.t("Effacer la recherche")} type="button" onClick={() => setQuery("")} className="absolute end-1 top-0 grid h-12 w-10 place-items-center text-slate-500"><X className="h-4 w-4" /></button>}</div>
          <label className="sr-only" htmlFor="track-status">{i18n.t("Résultat")}</label><select id="track-status" value={status} onChange={event => setStatus(event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-700"><option value="all">{i18n.t("Tous les résultats")}</option>{Object.entries(RESULTS).map(([key, meta]) => <option key={key} value={key}>{i18n.t(meta.text)}</option>)}</select>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{i18n.t("La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.")}</p>
      </header>
      <div className="px-3 sm:px-5"><AdminShareToolbar /></div>
      {loading ? <div role="status" aria-label={i18n.t("Chargement…")} className="space-y-3 p-5">{[0, 1, 2].map(key => <div key={key} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div> : error ? <div role="alert" className="px-6 py-12 text-center"><XCircle className="mx-auto mb-4 h-9 w-9 text-rose-500" /><h3 className="font-heading text-lg font-bold text-slate-900">{i18n.t("Erreur de chargement")}</h3><p className="mx-auto mt-2 max-w-xl text-base leading-7 text-slate-500">{i18n.t(error)}</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-5 min-h-11 rounded-xl bg-orange-600 px-5 py-3 font-bold text-white">{i18n.t("Réessayer")}</button></div> : !visible.length ? <div className="px-6 py-12 text-center"><History className="mx-auto mb-4 h-9 w-9 text-slate-300" /><h3 className="font-heading text-xl font-bold text-slate-800">{i18n.t(rows.length ? "Aucun résultat pour ces filtres" : "Aucun résultat disponible.")}</h3><p className="mt-2 text-base text-slate-500">{i18n.t(rows.length ? "Essaie une autre recherche ou réinitialise les filtres de cette page." : "Les rencontres apparaîtront ici après confirmation de leur résultat.")}</p>{rows.length > 0 && <button type="button" onClick={resetPageFilters} className="mt-5 min-h-11 rounded-xl border border-slate-200 px-4 py-2 font-semibold">{i18n.t("Réinitialiser les filtres")}</button>}</div> : <>
        <div className="lg:hidden" data-testid="results-mobile">{visible.map((row, index) => <div key={row.id || index}>
          {(index === 0 || displayDate(i18n, row.date) !== displayDate(i18n, visible[index - 1].date)) && <h3 className="border-y border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 sm:px-5" data-testid="track-date-separator">{displayDate(i18n, row.date)}</h3>}
          <ResultCard row={row} />
        </div>)}</div>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full text-start text-sm"><caption className="sr-only">{i18n.t("Le journal des résultats")}</caption><thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500"><tr>{["Date", "Rencontre", "Pronostic", "Cote", "Résultat"].map(title => <th scope="col" key={title} className="px-5 py-4 text-start font-bold">{i18n.t(title)}</th>)}</tr></thead><tbody className="divide-y divide-slate-100" data-testid="results-table">{visible.map((row, index) => <tr key={row.id || index} className="hover:bg-slate-50/60"><td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{displayDate(i18n, row.date)}</td><td className="min-w-[230px] max-w-sm px-4 py-3"><p className="break-words text-sm font-bold leading-5 text-slate-900">{row.match || "—"}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{i18n.t(sportName(row.sport))} · {row.league || "—"}</p></td><td className="max-w-xs px-4 py-3"><p className="break-words text-sm font-bold leading-6 text-orange-700">{i18n.bet(row.pick) || "—"}</p><RiskBadge label={row.label} /></td><td className="px-4 py-3 font-mono text-base font-extrabold text-slate-900">{displayNumber(i18n, row.odds, 2)}</td><td className="px-4 py-3"><ResultBadge status={row.status} /><AdminShareActions item={row} isAdmin={Boolean(user?.is_admin)} kind="results" /></td></tr>)}</tbody></table></div>
      </>}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 px-5 py-4"><div aria-live="polite" className="text-sm text-slate-500">{i18n.t("Page {{page}} sur {{total}}", {
            page: currentPage,
            total: totalPages
          })}<span className="ms-2 text-xs">· {loading ? "—" : displayNumber(i18n, visible.length)} {i18n.t("affichés")}</span></div><div className="flex gap-2"><button type="button" disabled={loading || currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))} aria-label={i18n.t("Page précédente")} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-30" data-testid="track-prev"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></button><button type="button" disabled={loading || currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label={i18n.t("Page suivante")} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-30" data-testid="track-next"><ChevronRight className="h-5 w-5 rtl:rotate-180" /></button></div></footer>
    </section>
    {!loading && !error && data && <section className="mt-6 space-y-3" aria-label={i18n.t("Comprendre les statistiques")}>
      {stats.by_sport && <details className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="by-sport-stats"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-heading text-lg font-bold text-slate-900">{i18n.t("Résultats par sport")}<ChevronDown className="h-5 w-5 shrink-0 text-slate-400" /></summary><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Object.entries(stats.by_sport).map(([key, value]) => <button key={key} type="button" onClick={() => changeSport(key)} className={`rounded-2xl border p-4 text-start hover:border-orange-300 ${sport === key ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-slate-50/50"}`}><span className="text-sm font-bold text-slate-600">{i18n.t(sportName(key))}</span><strong className="mt-2 block font-mono text-2xl text-slate-900">{displayPercent(i18n, value?.win_rate)}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{displayNumber(i18n, value?.wins)} / {displayNumber(i18n, value?.total)} · {i18n.t("Gagnés et perdus")}</span></button>)}</div></details>}
      {stats.by_label && <details className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="by-label-stats"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-heading text-lg font-bold text-slate-900">{i18n.t("Résultats par niveau de risque")}<ChevronDown className="h-5 w-5 shrink-0 text-slate-400" /></summary><div className="mt-4 grid gap-3 sm:grid-cols-3">{Object.keys(RISK).map(key => {
            const value = stats.by_label[key];
            return <div key={key} className="rounded-2xl border border-slate-200 p-4"><RiskBadge label={key} /><strong className="mt-3 block font-mono text-3xl text-slate-900">{displayPercent(i18n, value?.win_rate)}</strong><p className="mt-2 text-xs text-slate-500">{displayNumber(i18n, value?.wins)} / {displayNumber(i18n, value?.total)} · {i18n.t("Gagnés et perdus")}</p></div>;
          })}</div></details>}
    </section>}
    <div className="mt-7 flex flex-col justify-between gap-4 rounded-2xl border border-orange-100 bg-orange-50/60 p-5 sm:flex-row sm:items-center"><div><h2 className="font-heading text-lg font-extrabold text-slate-900">{i18n.t("Et pour les prochaines rencontres ?")}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{i18n.t("Consulte les sélections disponibles et leurs explications.")}</p></div><Link to={user ? "/app" : "/register"} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 font-bold text-white hover:bg-orange-700">{i18n.t(user ? "Voir les pronostics" : "Créer un compte gratuit")}<ArrowUpRight className="h-4 w-4" /></Link></div>
    <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-6 text-slate-500">{i18n.t("Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.")}</p>
  </main></AdminShareProvider>;
  return user ? <AppLayout>{content}</AppLayout> : <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6"><Link to="/" className="flex min-h-11 items-center gap-2.5 font-heading text-lg font-extrabold text-slate-900"><span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-600 text-white"><Zap className="h-5 w-5" /></span>WinPulse</Link><div className="flex flex-wrap gap-2"><Link to="/login" className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-bold text-slate-700">{i18n.t("Connexion")}</Link><Link to="/register" className="inline-flex min-h-11 items-center rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white">{i18n.t("Créer un compte gratuit")}</Link></div></div></header>{content}</div>;
}
function Metric({
  icon: Icon,
  label,
  value,
  sub
}) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-5"><Icon className="mb-2 h-4 w-4 text-orange-600" /><div className="min-h-8 text-xs font-semibold leading-4 text-slate-500">{label}</div><div className="mt-1 font-mono text-2xl font-extrabold text-slate-900 sm:text-3xl">{value}</div><p className="mt-2 text-xs leading-5 text-slate-500">{sub}</p></div>;
}
function RiskBadge({
  label
}) {
  const i18n = useResultsLanguage();
  const meta = RISK[label];
  return meta ? <span className={`mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${meta[1]}`}>{i18n.t(meta[0])}</span> : null;
}
function ResultBadge({
  status
}) {
  const i18n = useResultsLanguage();
  const meta = RESULTS[resultStatus(status)];
  const Icon = meta.icon;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-bold ${meta.style}`}><Icon className="h-3.5 w-3.5" />{i18n.t(meta.text)}</span>;
}
function ResultCard({
  row
}) {
  const i18n = useResultsLanguage();
  const { user } = useAuth();
  const result = resultStatus(row.status);
  const accent = result === "won" ? "border-s-emerald-500" : result === "lost" ? "border-s-rose-400" : result === "void" ? "border-s-slate-400" : "border-s-amber-400";
  return <article className={`min-w-0 border-b border-b-slate-100 border-s-[3px] p-3 sm:p-4 ${accent}`} data-testid="track-result-card">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p className="min-w-0 flex-1 basis-36 break-words text-xs leading-5 text-slate-500">{i18n.t(sportName(row.sport))} · {row.league || "—"}</p>
      <ResultBadge status={row.status} />
    </div>
    <h4 dir="auto" className="break-words font-heading text-sm font-bold leading-5 text-slate-900 sm:text-base sm:leading-6">{row.match || "—"}</h4>
    <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{i18n.t("Pronostic")}</p>
        <p className="mt-0.5 break-words text-sm font-bold leading-5 text-orange-700">{i18n.bet(row.pick) || "—"}</p>
        <RiskBadge label={row.label} />
      </div>
      <div className="text-end">
        <p className="text-xs text-slate-500">{i18n.t("Cote")}</p>
        <strong className="mt-0.5 block font-mono text-xl font-extrabold tabular-nums text-slate-900">{displayNumber(i18n, row.odds, 2)}</strong>
      </div>
    </div>
    <AdminShareActions item={row} isAdmin={Boolean(user?.is_admin)} kind="results" />
  </article>;
}

// Catalogue local : compatible avec le dernier AppLayout, sans fichier annexe.
const RESULTS_MESSAGES = {
  "fr": {
    "Track record": "Track record",
    "Tableau de bord": "Tableau de bord",
    "Retour à l’accueil": "Retour à l’accueil",
    "HISTORIQUE PUBLIC": "HISTORIQUE PUBLIC",
    "Le bilan.": "Le bilan.",
    "Tous les résultats.": "Tous les résultats.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.",
    "Explorer les résultats": "Explorer les résultats",
    "Taux de réussite": "Taux de réussite",
    "réussite": "réussite",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.",
    "Pronostics départagés": "Pronostics départagés",
    "Gagnés et perdus": "Gagnés et perdus",
    "Victoires": "Victoires",
    "Dans le sport sélectionné": "Dans le sport sélectionné",
    "Cote moyenne": "Cote moyenne",
    "Sur les pronostics départagés": "Sur les pronostics départagés",
    "Série en cours": "Série en cours",
    "Victoires consécutives": "Victoires consécutives",
    "Le journal des résultats": "Le journal des résultats",
    "Les derniers résultats en premier.": "Les derniers résultats en premier.",
    "Actualiser": "Actualiser",
    "Filtrer par sport": "Filtrer par sport",
    "Recherche sur cette page": "Recherche sur cette page",
    "Équipe, compétition, pronostic…": "Équipe, compétition, pronostic…",
    "Effacer la recherche": "Effacer la recherche",
    "Résultat": "Résultat",
    "Tous les résultats": "Tous les résultats",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.",
    "Chargement…": "Chargement…",
    "Erreur de chargement": "Erreur de chargement",
    "Réessayer": "Réessayer",
    "Aucun résultat pour ces filtres": "Aucun résultat pour ces filtres",
    "Aucun résultat disponible.": "Aucun résultat disponible.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Essaie une autre recherche ou réinitialise les filtres de cette page.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Les rencontres apparaîtront ici après confirmation de leur résultat.",
    "Réinitialiser les filtres": "Réinitialiser les filtres",
    "Page {{page}} sur {{total}}": "Page {{page}} sur {{total}}",
    "affichés": "affichés",
    "Page précédente": "Page précédente",
    "Page suivante": "Page suivante",
    "Comprendre les statistiques": "Comprendre les statistiques",
    "Résultats par sport": "Résultats par sport",
    "Résultats par niveau de risque": "Résultats par niveau de risque",
    "Et pour les prochaines rencontres ?": "Et pour les prochaines rencontres ?",
    "Consulte les sélections disponibles et leurs explications.": "Consulte les sélections disponibles et leurs explications.",
    "Voir les pronostics": "Voir les pronostics",
    "Créer un compte gratuit": "Créer un compte gratuit",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.",
    "Connexion": "Connexion",
    "Pronostic": "Pronostic",
    "Cote": "Cote",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Marché : {{v0}}",
    "Confiance IA : {{v0}}%": "Confiance IA : {{v0}}%",
    "WhatsApp ouvert": "WhatsApp ouvert",
    "LA SÉLECTION DU MOTEUR": "LA SÉLECTION DU MOTEUR",
    "Les picks à la une.": "Les picks à la une.",
    "Chaque détail compte.": "Chaque détail compte.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.",
    "Quel marché t’intéresse ?": "Quel marché t’intéresse ?",
    "Le classement du moteur est conservé dans chaque filtre.": "Le classement du moteur est conservé dans chaque filtre.",
    "Filtrer par marché": "Filtrer par marché",
    "{{count}} sélections à débloquer": "{{count}} sélections à débloquer",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Les détails réservés aux abonnés sont accessibles avec Pro.",
    "Découvrir Pro": "Découvrir Pro",
    "Le classement du jour": "Le classement du jour",
    "Ta sélection de marchés": "Ta sélection de marchés",
    "{{count}} pronostics affichés": "{{count}} pronostics affichés",
    "Impossible de charger les pronostics.": "Impossible de charger les pronostics.",
    "Aucun pick pour ce marché.": "Aucun pick pour ce marché.",
    "Voir tous les picks": "Voir tous les picks",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.",
    "À regarder de près": "À regarder de près",
    "Sélection du moteur": "Sélection du moteur",
    "LIVE": "LIVE",
    "vs": "vs",
    "Pronostic verrouillé": "Pronostic verrouillé",
    "Consulte les détails de cette sélection avec Pro.": "Consulte les détails de cette sélection avec Pro.",
    "Débloquer": "Débloquer",
    "La sélection": "La sélection",
    "Confiance du moteur": "Confiance du moteur",
    "Détails réservés aux abonnés": "Détails réservés aux abonnés",
    "Analyse disponible sur la fiche": "Analyse disponible sur la fiche",
    "Partager sur WhatsApp (Admin)": "Partager sur WhatsApp (Admin)",
    "Voir l’analyse du match": "Voir l’analyse du match",
    "Prudent": "Prudent",
    "Modéré": "Modéré",
    "Risqué": "Risqué",
    "Gagné": "Gagné",
    "Perdu": "Perdu",
    "Remboursé": "Remboursé",
    "En attente": "En attente",
    "Tous les sports": "Tous les sports",
    "Football": "Football",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Hockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "Impossible de charger les résultats.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.",
    "Sélections": "Sélections",
    "Accessibles": "Accessibles",
    "En direct": "En direct",
    "Date": "Date",
    "Rencontre": "Rencontre",
    "🏆 Victoire": "🏆 Victoire",
    "🔄 Double chance": "🔄 Double chance",
    "📈 Over 2.5": "📈 Over 2.5",
    "🎯 BTTS": "🎯 BTTS",
    "⚖️ Handicap": "⚖️ Handicap",
    "⚽ Over/Under": "⚽ Over/Under",
    "Équipe, championnat, compétition…": "Équipe, championnat, compétition…"
  },
  "en": {
    "Track record": "Track record",
    "Tableau de bord": "Dashboard",
    "Retour à l’accueil": "Back to home",
    "HISTORIQUE PUBLIC": "PUBLIC RECORD",
    "Le bilan.": "The record.",
    "Tous les résultats.": "Every result.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "A clear view of published predictions: wins, losses and refunds, all in one place.",
    "Explorer les résultats": "Explore the results",
    "Taux de réussite": "Win rate",
    "réussite": "win rate",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Refunds are shown separately and excluded from the win rate.",
    "Pronostics départagés": "Graded predictions",
    "Gagnés et perdus": "Wins and losses",
    "Victoires": "Wins",
    "Dans le sport sélectionné": "In the selected sport",
    "Cote moyenne": "Average odds",
    "Sur les pronostics départagés": "Across graded predictions",
    "Série en cours": "Current streak",
    "Victoires consécutives": "Consecutive wins",
    "Le journal des résultats": "The results journal",
    "Les derniers résultats en premier.": "Latest results first.",
    "Actualiser": "Refresh",
    "Filtrer par sport": "Filter by sport",
    "Recherche sur cette page": "Search this page",
    "Équipe, compétition, pronostic…": "Team, competition, prediction…",
    "Effacer la recherche": "Clear search",
    "Résultat": "Result",
    "Tous les résultats": "All results",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "Search and result filters apply only to the displayed page. Statistics remain those of the selected sport.",
    "Chargement…": "Loading…",
    "Erreur de chargement": "Loading error",
    "Réessayer": "Try again",
    "Aucun résultat pour ces filtres": "No results match these filters",
    "Aucun résultat disponible.": "No results available.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Try another search or reset this page's filters.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Matches will appear here once their results are confirmed.",
    "Réinitialiser les filtres": "Reset filters",
    "Page {{page}} sur {{total}}": "Page {{page}} of {{total}}",
    "affichés": "shown",
    "Page précédente": "Previous page",
    "Page suivante": "Next page",
    "Comprendre les statistiques": "Understanding the statistics",
    "Résultats par sport": "Results by sport",
    "Résultats par niveau de risque": "Results by risk level",
    "Et pour les prochaines rencontres ?": "What about the next matches?",
    "Consulte les sélections disponibles et leurs explications.": "Explore available selections and their explanations.",
    "Voir les pronostics": "View predictions",
    "Créer un compte gratuit": "Create a free account",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "Past performance does not guarantee future results. 18+ · Gamble responsibly.",
    "Connexion": "Sign in",
    "Pronostic": "Prediction",
    "Cote": "Odds",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Market: {{v0}}",
    "Confiance IA : {{v0}}%": "Engine confidence: {{v0}}%",
    "WhatsApp ouvert": "WhatsApp opened",
    "LA SÉLECTION DU MOTEUR": "THE ENGINE'S SELECTION",
    "Les picks à la une.": "Picks in the spotlight.",
    "Chaque détail compte.": "Every detail counts.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "The engine's ranked selections, brought together in a clear view to compare markets and open analyses.",
    "Quel marché t’intéresse ?": "Which market interests you?",
    "Le classement du moteur est conservé dans chaque filtre.": "Engine ranking is preserved within each filter.",
    "Filtrer par marché": "Filter by market",
    "{{count}} sélections à débloquer": "{{count}} selections to unlock",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Subscriber-only details are available with Pro.",
    "Découvrir Pro": "Explore Pro",
    "Le classement du jour": "Today's ranking",
    "Ta sélection de marchés": "Your selected markets",
    "{{count}} pronostics affichés": "{{count}} predictions shown",
    "Impossible de charger les pronostics.": "Unable to load predictions.",
    "Aucun pick pour ce marché.": "No picks for this market.",
    "Voir tous les picks": "View all picks",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "Confidence is an engine indicator, not a guarantee. Odds may change.",
    "À regarder de près": "Worth a closer look",
    "Sélection du moteur": "Engine selection",
    "LIVE": "LIVE",
    "vs": "vs",
    "Pronostic verrouillé": "Locked prediction",
    "Consulte les détails de cette sélection avec Pro.": "View this selection's details with Pro.",
    "Débloquer": "Unlock",
    "La sélection": "The selection",
    "Confiance du moteur": "Engine confidence",
    "Détails réservés aux abonnés": "Subscriber-only details",
    "Analyse disponible sur la fiche": "Analysis available on the match page",
    "Partager sur WhatsApp (Admin)": "Share on WhatsApp (Admin)",
    "Voir l’analyse du match": "View match analysis",
    "Prudent": "Cautious",
    "Modéré": "Moderate",
    "Risqué": "Higher risk",
    "Gagné": "Won",
    "Perdu": "LOST",
    "Remboursé": "Refunded",
    "En attente": "Pending",
    "Tous les sports": "All sports",
    "Football": "Football",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Hockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "Unable to load results.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "The Track Record preserves the continuous history of all genuinely settled predictions, including after an engine version change. Past wins, losses and refunds are never hidden.",
    "Sélections": "Selections",
    "Accessibles": "Accessible",
    "En direct": "Live",
    "Date": "Date",
    "Rencontre": "Match",
    "🏆 Victoire": "🏆 Winner",
    "🔄 Double chance": "🔄 Double chance",
    "📈 Over 2.5": "📈 Over 2.5",
    "🎯 BTTS": "🎯 Both teams score",
    "⚖️ Handicap": "⚖️ Handicap",
    "⚽ Over/Under": "⚽ Over/Under",
    "Équipe, championnat, compétition…": "Team, league, competition…"
  },
  "es": {
    "Track record": "Historial de resultados",
    "Tableau de bord": "Panel principal",
    "Retour à l’accueil": "Volver al inicio",
    "HISTORIQUE PUBLIC": "HISTORIAL PÚBLICO",
    "Le bilan.": "El balance.",
    "Tous les résultats.": "Todos los resultados.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "Una visión clara de los pronósticos publicados: aciertos, pérdidas y reembolsos en un mismo lugar.",
    "Explorer les résultats": "Explorar resultados",
    "Taux de réussite": "Tasa de acierto",
    "réussite": "aciertos",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Los reembolsos se muestran por separado y no cuentan en la tasa de acierto.",
    "Pronostics départagés": "Pronósticos decididos",
    "Gagnés et perdus": "Aciertos y pérdidas",
    "Victoires": "Aciertos",
    "Dans le sport sélectionné": "En el deporte elegido",
    "Cote moyenne": "Cuota media",
    "Sur les pronostics départagés": "En pronósticos decididos",
    "Série en cours": "Racha actual",
    "Victoires consécutives": "Victorias consecutivas",
    "Le journal des résultats": "El registro de resultados",
    "Les derniers résultats en premier.": "Los resultados más recientes primero.",
    "Actualiser": "Actualizar",
    "Filtrer par sport": "Filtrar por deporte",
    "Recherche sur cette page": "Buscar en esta página",
    "Équipe, compétition, pronostic…": "Equipo, competición, pronóstico…",
    "Effacer la recherche": "Borrar búsqueda",
    "Résultat": "Resultado",
    "Tous les résultats": "Todos los resultados",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "La búsqueda y el filtro de resultado solo afectan a la página mostrada. Las estadísticas siguen siendo las del deporte seleccionado.",
    "Chargement…": "Cargando…",
    "Erreur de chargement": "Error de carga",
    "Réessayer": "Reintentar",
    "Aucun résultat pour ces filtres": "Ningún resultado coincide con estos filtros",
    "Aucun résultat disponible.": "No hay resultados disponibles.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Prueba otra búsqueda o restablece los filtros de esta página.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Los encuentros aparecerán aquí tras confirmar sus resultados.",
    "Réinitialiser les filtres": "Restablecer filtros",
    "Page {{page}} sur {{total}}": "Página {{page}} de {{total}}",
    "affichés": "mostrados",
    "Page précédente": "Página anterior",
    "Page suivante": "Página siguiente",
    "Comprendre les statistiques": "Entender las estadísticas",
    "Résultats par sport": "Resultados por deporte",
    "Résultats par niveau de risque": "Resultados por nivel de riesgo",
    "Et pour les prochaines rencontres ?": "¿Y los próximos encuentros?",
    "Consulte les sélections disponibles et leurs explications.": "Consulta las selecciones disponibles y sus explicaciones.",
    "Voir les pronostics": "Ver pronósticos",
    "Créer un compte gratuit": "Crear una cuenta gratuita",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "El rendimiento pasado no garantiza resultados futuros. 18+ · Juega con responsabilidad.",
    "Connexion": "Iniciar sesión",
    "Pronostic": "Pronóstico",
    "Cote": "Cuota",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Mercado: {{v0}}",
    "Confiance IA : {{v0}}%": "Confianza del motor: {{v0}} %",
    "WhatsApp ouvert": "WhatsApp abierto",
    "LA SÉLECTION DU MOTEUR": "LA SELECCIÓN DEL MOTOR",
    "Les picks à la une.": "Pronósticos destacados.",
    "Chaque détail compte.": "Cada detalle cuenta.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "Las selecciones clasificadas por el motor, reunidas para comparar mercados y abrir sus análisis.",
    "Quel marché t’intéresse ?": "¿Qué mercado te interesa?",
    "Le classement du moteur est conservé dans chaque filtre.": "Se conserva el orden del motor en cada filtro.",
    "Filtrer par marché": "Filtrar por mercado",
    "{{count}} sélections à débloquer": "{{count}} selecciones por desbloquear",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Los detalles reservados a suscriptores están disponibles con Pro.",
    "Découvrir Pro": "Descubrir Pro",
    "Le classement du jour": "La clasificación del día",
    "Ta sélection de marchés": "Tus mercados seleccionados",
    "{{count}} pronostics affichés": "{{count}} pronósticos mostrados",
    "Impossible de charger les pronostics.": "No se pueden cargar los pronósticos.",
    "Aucun pick pour ce marché.": "Sin selecciones para este mercado.",
    "Voir tous les picks": "Ver todas las selecciones",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "La confianza es un indicador del motor, no una garantía. Las cuotas pueden cambiar.",
    "À regarder de près": "Para mirar de cerca",
    "Sélection du moteur": "Selección del motor",
    "LIVE": "EN DIRECTO",
    "vs": "vs",
    "Pronostic verrouillé": "Pronóstico bloqueado",
    "Consulte les détails de cette sélection avec Pro.": "Consulta los detalles de esta selección con Pro.",
    "Débloquer": "Desbloquear",
    "La sélection": "La selección",
    "Confiance du moteur": "Confianza del motor",
    "Détails réservés aux abonnés": "Detalles para suscriptores",
    "Analyse disponible sur la fiche": "Análisis disponible en la ficha",
    "Partager sur WhatsApp (Admin)": "Compartir en WhatsApp (Admin)",
    "Voir l’analyse du match": "Ver análisis del partido",
    "Prudent": "Prudente",
    "Modéré": "Moderado",
    "Risqué": "Arriesgado",
    "Gagné": "Ganado",
    "Perdu": "PERDIDO",
    "Remboursé": "Reembolsado",
    "En attente": "Pendientes",
    "Tous les sports": "Todos los deportes",
    "Football": "Fútbol",
    "Basketball": "Baloncesto",
    "Tennis": "Tenis",
    "Hockey": "Hockey",
    "Baseball": "Béisbol",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "No se pueden cargar los resultados.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "El historial conserva todos los pronósticos realmente resueltos, incluso tras un cambio de versión del motor. Nunca se ocultan los aciertos, pérdidas ni reembolsos anteriores.",
    "Sélections": "Selecciones",
    "Accessibles": "Accesibles",
    "En direct": "En directo",
    "Date": "Fecha",
    "Rencontre": "Encuentro",
    "🏆 Victoire": "🏆 Ganador",
    "🔄 Double chance": "🔄 Doble oportunidad",
    "📈 Over 2.5": "📈 Más de 2,5",
    "🎯 BTTS": "🎯 Ambos marcan",
    "⚖️ Handicap": "⚖️ Hándicap",
    "⚽ Over/Under": "⚽ Más/Menos",
    "Équipe, championnat, compétition…": "Equipo, liga, competición…"
  },
  "pt": {
    "Track record": "Histórico de resultados",
    "Tableau de bord": "Painel principal",
    "Retour à l’accueil": "Voltar ao início",
    "HISTORIQUE PUBLIC": "HISTÓRICO PÚBLICO",
    "Le bilan.": "O balanço.",
    "Tous les résultats.": "Todos os resultados.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "Uma visão clara dos prognósticos publicados: vitórias, perdas e reembolsos no mesmo lugar.",
    "Explorer les résultats": "Explorar os resultados",
    "Taux de réussite": "Taxa de sucesso",
    "réussite": "sucesso",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Os reembolsos são apresentados separadamente e não contam na taxa de sucesso.",
    "Pronostics départagés": "Prognósticos decididos",
    "Gagnés et perdus": "Vitórias e perdas",
    "Victoires": "Vitórias",
    "Dans le sport sélectionné": "No desporto selecionado",
    "Cote moyenne": "Odd média",
    "Sur les pronostics départagés": "Nos prognósticos decididos",
    "Série en cours": "Série atual",
    "Victoires consécutives": "Vitórias consecutivas",
    "Le journal des résultats": "O registo de resultados",
    "Les derniers résultats en premier.": "Os resultados mais recentes primeiro.",
    "Actualiser": "Atualizar",
    "Filtrer par sport": "Filtrar por desporto",
    "Recherche sur cette page": "Pesquisar nesta página",
    "Équipe, compétition, pronostic…": "Equipa, competição, prognóstico…",
    "Effacer la recherche": "Limpar pesquisa",
    "Résultat": "Resultado",
    "Tous les résultats": "Todos os resultados",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "A pesquisa e o filtro de resultado aplicam-se apenas à página apresentada. As estatísticas continuam a ser do desporto selecionado.",
    "Chargement…": "A carregar…",
    "Erreur de chargement": "Erro de carregamento",
    "Réessayer": "Tentar novamente",
    "Aucun résultat pour ces filtres": "Nenhum resultado corresponde aos filtros",
    "Aucun résultat disponible.": "Não há resultados disponíveis.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Experimenta outra pesquisa ou repõe os filtros desta página.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Os encontros surgirão aqui após confirmação dos resultados.",
    "Réinitialiser les filtres": "Repor filtros",
    "Page {{page}} sur {{total}}": "Página {{page}} de {{total}}",
    "affichés": "apresentados",
    "Page précédente": "Página anterior",
    "Page suivante": "Página seguinte",
    "Comprendre les statistiques": "Compreender as estatísticas",
    "Résultats par sport": "Resultados por desporto",
    "Résultats par niveau de risque": "Resultados por nível de risco",
    "Et pour les prochaines rencontres ?": "E os próximos encontros?",
    "Consulte les sélections disponibles et leurs explications.": "Consulta as seleções disponíveis e as suas explicações.",
    "Voir les pronostics": "Ver prognósticos",
    "Créer un compte gratuit": "Criar uma conta gratuita",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "O desempenho passado não garante resultados futuros. 18+ · Joga com responsabilidade.",
    "Connexion": "Iniciar sessão",
    "Pronostic": "Prognóstico",
    "Cote": "Odd",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Mercado: {{v0}}",
    "Confiance IA : {{v0}}%": "Confiança do motor: {{v0}} %",
    "WhatsApp ouvert": "WhatsApp aberto",
    "LA SÉLECTION DU MOTEUR": "A SELEÇÃO DO MOTOR",
    "Les picks à la une.": "Prognósticos em destaque.",
    "Chaque détail compte.": "Cada detalhe conta.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "As seleções classificadas pelo motor, reunidas para comparar mercados e abrir análises.",
    "Quel marché t’intéresse ?": "Que mercado te interessa?",
    "Le classement du moteur est conservé dans chaque filtre.": "A classificação do motor é mantida em cada filtro.",
    "Filtrer par marché": "Filtrar por mercado",
    "{{count}} sélections à débloquer": "{{count}} seleções por desbloquear",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Os detalhes reservados a subscritores estão disponíveis com Pro.",
    "Découvrir Pro": "Conhecer Pro",
    "Le classement du jour": "A classificação do dia",
    "Ta sélection de marchés": "Os teus mercados selecionados",
    "{{count}} pronostics affichés": "{{count}} prognósticos apresentados",
    "Impossible de charger les pronostics.": "Não foi possível carregar os prognósticos.",
    "Aucun pick pour ce marché.": "Sem seleções para este mercado.",
    "Voir tous les picks": "Ver todas as seleções",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "A confiança é um indicador do motor, não uma garantia. As odds podem mudar.",
    "À regarder de près": "Para ver com atenção",
    "Sélection du moteur": "Seleção do motor",
    "LIVE": "EM DIRETO",
    "vs": "vs",
    "Pronostic verrouillé": "Prognóstico bloqueado",
    "Consulte les détails de cette sélection avec Pro.": "Consulta os detalhes desta seleção com Pro.",
    "Débloquer": "Desbloquear",
    "La sélection": "A seleção",
    "Confiance du moteur": "Confiança do motor",
    "Détails réservés aux abonnés": "Detalhes para subscritores",
    "Analyse disponible sur la fiche": "Análise disponível na ficha",
    "Partager sur WhatsApp (Admin)": "Partilhar no WhatsApp (Admin)",
    "Voir l’analyse du match": "Ver análise do jogo",
    "Prudent": "Prudente",
    "Modéré": "Moderado",
    "Risqué": "Arriscado",
    "Gagné": "Ganho",
    "Perdu": "PERDIDO",
    "Remboursé": "Reembolsado",
    "En attente": "Pendentes",
    "Tous les sports": "Todos os desportos",
    "Football": "Futebol",
    "Basketball": "Basquetebol",
    "Tennis": "Ténis",
    "Hockey": "Hóquei",
    "Baseball": "Basebol",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "Não foi possível carregar os resultados.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "O histórico mantém todos os prognósticos realmente resolvidos, mesmo após mudar a versão do motor. Vitórias, perdas e reembolsos anteriores nunca são ocultados.",
    "Sélections": "Seleções",
    "Accessibles": "Acessíveis",
    "En direct": "Em direto",
    "Date": "Data",
    "Rencontre": "Encontro",
    "🏆 Victoire": "🏆 Vencedor",
    "🔄 Double chance": "🔄 Dupla hipótese",
    "📈 Over 2.5": "📈 Mais de 2,5",
    "🎯 BTTS": "🎯 Ambas marcam",
    "⚖️ Handicap": "⚖️ Handicap",
    "⚽ Over/Under": "⚽ Mais/Menos",
    "Équipe, championnat, compétition…": "Equipa, liga, competição…"
  },
  "de": {
    "Track record": "Ergebnisbilanz",
    "Tableau de bord": "Dashboard",
    "Retour à l’accueil": "Zur Startseite",
    "HISTORIQUE PUBLIC": "ÖFFENTLICHE BILANZ",
    "Le bilan.": "Die Bilanz.",
    "Tous les résultats.": "Alle Ergebnisse.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "Ein klarer Überblick über veröffentlichte Tipps: Gewinne, Verluste und Erstattungen an einem Ort.",
    "Explorer les résultats": "Ergebnisse ansehen",
    "Taux de réussite": "Erfolgsquote",
    "réussite": "Erfolgsquote",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "Erstattungen werden separat angezeigt und zählen nicht zur Erfolgsquote.",
    "Pronostics départagés": "Entschiedene Tipps",
    "Gagnés et perdus": "Gewinne und Verluste",
    "Victoires": "Gewinne",
    "Dans le sport sélectionné": "In der gewählten Sportart",
    "Cote moyenne": "Durchschnittsquote",
    "Sur les pronostics départagés": "Bei entschiedenen Tipps",
    "Série en cours": "Aktuelle Serie",
    "Victoires consécutives": "Siege in Folge",
    "Le journal des résultats": "Das Ergebnisjournal",
    "Les derniers résultats en premier.": "Neueste Ergebnisse zuerst.",
    "Actualiser": "Aktualisieren",
    "Filtrer par sport": "Nach Sportart filtern",
    "Recherche sur cette page": "Diese Seite durchsuchen",
    "Équipe, compétition, pronostic…": "Team, Wettbewerb, Tipp…",
    "Effacer la recherche": "Suche löschen",
    "Résultat": "Ergebnis",
    "Tous les résultats": "Alle Ergebnisse",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "Suche und Ergebnisfilter gelten nur für die angezeigte Seite. Die Statistik bezieht sich weiterhin auf die gewählte Sportart.",
    "Chargement…": "Wird geladen…",
    "Erreur de chargement": "Ladefehler",
    "Réessayer": "Erneut versuchen",
    "Aucun résultat pour ces filtres": "Keine Ergebnisse für diese Filter",
    "Aucun résultat disponible.": "Keine Ergebnisse verfügbar.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "Versuche eine andere Suche oder setze die Seitenfilter zurück.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "Begegnungen erscheinen hier nach Bestätigung ihrer Ergebnisse.",
    "Réinitialiser les filtres": "Filter zurücksetzen",
    "Page {{page}} sur {{total}}": "Seite {{page}} von {{total}}",
    "affichés": "angezeigt",
    "Page précédente": "Vorherige Seite",
    "Page suivante": "Nächste Seite",
    "Comprendre les statistiques": "Statistik verstehen",
    "Résultats par sport": "Ergebnisse nach Sportart",
    "Résultats par niveau de risque": "Ergebnisse nach Risikostufe",
    "Et pour les prochaines rencontres ?": "Und die nächsten Begegnungen?",
    "Consulte les sélections disponibles et leurs explications.": "Sieh dir verfügbare Tipps und ihre Erläuterungen an.",
    "Voir les pronostics": "Tipps ansehen",
    "Créer un compte gratuit": "Kostenloses Konto erstellen",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "Vergangene Leistungen garantieren keine künftigen Ergebnisse. 18+ · Spiele verantwortungsvoll.",
    "Connexion": "Anmelden",
    "Pronostic": "Tipp",
    "Cote": "Quote",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "Markt: {{v0}}",
    "Confiance IA : {{v0}}%": "Modellkonfidenz: {{v0}} %",
    "WhatsApp ouvert": "WhatsApp geöffnet",
    "LA SÉLECTION DU MOTEUR": "DIE AUSWAHL DER ENGINE",
    "Les picks à la une.": "Tipps im Fokus.",
    "Chaque détail compte.": "Jedes Detail zählt.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "Die Rangliste der Engine in einer klaren Übersicht zum Vergleichen von Märkten und Öffnen der Analysen.",
    "Quel marché t’intéresse ?": "Welcher Markt interessiert dich?",
    "Le classement du moteur est conservé dans chaque filtre.": "Die Engine-Reihenfolge bleibt in jedem Filter erhalten.",
    "Filtrer par marché": "Nach Markt filtern",
    "{{count}} sélections à débloquer": "{{count}} Tipps freizuschalten",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "Abonnenten-Details sind mit Pro verfügbar.",
    "Découvrir Pro": "Pro entdecken",
    "Le classement du jour": "Die heutige Rangliste",
    "Ta sélection de marchés": "Deine gewählten Märkte",
    "{{count}} pronostics affichés": "{{count}} Tipps angezeigt",
    "Impossible de charger les pronostics.": "Tipps konnten nicht geladen werden.",
    "Aucun pick pour ce marché.": "Keine Tipps für diesen Markt.",
    "Voir tous les picks": "Alle Tipps ansehen",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "Die Konfidenz ist ein Engine-Indikator, keine Garantie. Quoten können sich ändern.",
    "À regarder de près": "Einen genaueren Blick wert",
    "Sélection du moteur": "Auswahl der Engine",
    "LIVE": "LIVE",
    "vs": "vs",
    "Pronostic verrouillé": "Gesperrter Tipp",
    "Consulte les détails de cette sélection avec Pro.": "Sieh dir die Details dieses Tipps mit Pro an.",
    "Débloquer": "Freischalten",
    "La sélection": "Der Tipp",
    "Confiance du moteur": "Modellkonfidenz",
    "Détails réservés aux abonnés": "Details für Abonnenten",
    "Analyse disponible sur la fiche": "Analyse auf der Spielseite verfügbar",
    "Partager sur WhatsApp (Admin)": "Auf WhatsApp teilen (Admin)",
    "Voir l’analyse du match": "Spielanalyse ansehen",
    "Prudent": "Vorsichtig",
    "Modéré": "Moderat",
    "Risqué": "Höheres Risiko",
    "Gagné": "Gewonnen",
    "Perdu": "VERLOREN",
    "Remboursé": "Erstattet",
    "En attente": "Ausstehend",
    "Tous les sports": "Alle Sportarten",
    "Football": "Fußball",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Eishockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Impossible de charger les résultats.": "Ergebnisse konnten nicht geladen werden.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "Die Bilanz bewahrt den fortlaufenden Verlauf aller tatsächlich entschiedenen Tipps, auch nach einem Engine-Versionswechsel. Frühere Gewinne, Verluste und Erstattungen werden nie verborgen.",
    "Sélections": "Tipps",
    "Accessibles": "Zugänglich",
    "En direct": "Live",
    "Date": "Datum",
    "Rencontre": "Begegnung",
    "🏆 Victoire": "🏆 Sieger",
    "🔄 Double chance": "🔄 Doppelte Chance",
    "📈 Over 2.5": "📈 Über 2,5",
    "🎯 BTTS": "🎯 Beide treffen",
    "⚖️ Handicap": "⚖️ Handicap",
    "⚽ Over/Under": "⚽ Über/Unter",
    "Équipe, championnat, compétition…": "Team, Liga, Wettbewerb…"
  },
  "ar": {
    "Track record": "سجل النتائج",
    "Tableau de bord": "لوحة التحكم",
    "Retour à l’accueil": "العودة إلى الرئيسية",
    "HISTORIQUE PUBLIC": "سجل علني",
    "Le bilan.": "الحصيلة.",
    "Tous les résultats.": "جميع النتائج.",
    "Une vue claire sur les pronostics publiés : les victoires, les pertes et les remboursements, au même endroit.": "نظرة واضحة على التوقعات المنشورة: الفوز والخسارة والاسترداد في مكان واحد.",
    "Explorer les résultats": "استعرض النتائج",
    "Taux de réussite": "نسبة النجاح",
    "réussite": "نجاح",
    "Les remboursements sont affichés séparément et ne comptent pas dans le taux de réussite.": "تُعرض المبالغ المستردة منفصلة ولا تدخل في نسبة النجاح.",
    "Pronostics départagés": "توقعات محسومة",
    "Gagnés et perdus": "الفوز والخسارة",
    "Victoires": "مرات الفوز",
    "Dans le sport sélectionné": "في الرياضة المحددة",
    "Cote moyenne": "متوسط معامل الرهان",
    "Sur les pronostics départagés": "للتوقعات المحسومة",
    "Série en cours": "السلسلة الحالية",
    "Victoires consécutives": "انتصارات متتالية",
    "Le journal des résultats": "سجل النتائج",
    "Les derniers résultats en premier.": "النتائج الأحدث أولًا.",
    "Actualiser": "تحديث",
    "Filtrer par sport": "تصفية حسب الرياضة",
    "Recherche sur cette page": "البحث في هذه الصفحة",
    "Équipe, compétition, pronostic…": "فريق، بطولة، توقع…",
    "Effacer la recherche": "مسح البحث",
    "Résultat": "النتيجة",
    "Tous les résultats": "جميع النتائج",
    "La recherche et le filtre de résultat portent uniquement sur la page affichée. Les statistiques restent celles du sport sélectionné.": "يقتصر البحث وتصفية النتائج على الصفحة المعروضة. وتبقى الإحصاءات للرياضة المحددة.",
    "Chargement…": "جارٍ التحميل…",
    "Erreur de chargement": "خطأ في التحميل",
    "Réessayer": "إعادة المحاولة",
    "Aucun résultat pour ces filtres": "لا توجد نتائج تطابق هذه المرشحات",
    "Aucun résultat disponible.": "لا توجد نتائج متاحة.",
    "Essaie une autre recherche ou réinitialise les filtres de cette page.": "جرّب بحثًا آخر أو أعد ضبط مرشحات هذه الصفحة.",
    "Les rencontres apparaîtront ici après confirmation de leur résultat.": "ستظهر المباريات هنا بعد تأكيد نتائجها.",
    "Réinitialiser les filtres": "إعادة ضبط الفلاتر",
    "Page {{page}} sur {{total}}": "الصفحة {{page}} من {{total}}",
    "affichés": "معروضة",
    "Page précédente": "الصفحة السابقة",
    "Page suivante": "الصفحة التالية",
    "Comprendre les statistiques": "فهم الإحصاءات",
    "Résultats par sport": "النتائج حسب الرياضة",
    "Résultats par niveau de risque": "النتائج حسب مستوى المخاطرة",
    "Et pour les prochaines rencontres ?": "وماذا عن المباريات القادمة؟",
    "Consulte les sélections disponibles et leurs explications.": "اطلع على الاختيارات المتاحة وشروحها.",
    "Voir les pronostics": "عرض التوقعات",
    "Créer un compte gratuit": "إنشاء حساب مجاني",
    "Les performances passées ne garantissent pas les résultats futurs. 18+ · Joue responsable.": "النتائج السابقة لا تضمن النتائج المستقبلية. +18 · العب بمسؤولية.",
    "Connexion": "تسجيل الدخول",
    "Pronostic": "التوقع",
    "Cote": "المعامل",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "Marché : {{v0}}": "السوق: {{v0}}",
    "Confiance IA : {{v0}}%": "ثقة المحرّك: {{v0}}٪",
    "WhatsApp ouvert": "فُتح واتساب",
    "LA SÉLECTION DU MOTEUR": "اختيارات المحرك",
    "Les picks à la une.": "التوقعات البارزة.",
    "Chaque détail compte.": "كل تفصيل مهم.",
    "Les sélections classées par le moteur, réunies dans une vue claire pour comparer les marchés et ouvrir les analyses.": "اختيارات المحرك مرتبة في عرض واضح لمقارنة الأسواق وفتح التحليلات.",
    "Quel marché t’intéresse ?": "أي سوق يهمك؟",
    "Le classement du moteur est conservé dans chaque filtre.": "يبقى ترتيب المحرك محفوظًا داخل كل مرشح.",
    "Filtrer par marché": "تصفية حسب السوق",
    "{{count}} sélections à débloquer": "اختيارات لفتحها: {{count}}",
    "Les détails réservés aux abonnés sont accessibles avec Pro.": "تفاصيل المشتركين متاحة مع Pro.",
    "Découvrir Pro": "اكتشف Pro",
    "Le classement du jour": "ترتيب اليوم",
    "Ta sélection de marchés": "الأسواق التي اخترتها",
    "{{count}} pronostics affichés": "التوقعات المعروضة: {{count}}",
    "Impossible de charger les pronostics.": "تعذر تحميل التوقعات.",
    "Aucun pick pour ce marché.": "لا توجد اختيارات لهذا السوق.",
    "Voir tous les picks": "عرض جميع الاختيارات",
    "La confiance est un indicateur du moteur, pas une garantie. Les cotes peuvent évoluer.": "الثقة مؤشر من المحرك وليست ضمانًا. قد تتغير المعاملات.",
    "À regarder de près": "يستحق نظرة أقرب",
    "Sélection du moteur": "اختيار المحرك",
    "LIVE": "مباشر",
    "vs": "vs",
    "Pronostic verrouillé": "توقع مقفل",
    "Consulte les détails de cette sélection avec Pro.": "اطلع على تفاصيل هذا الاختيار مع Pro.",
    "Débloquer": "فتح",
    "La sélection": "الاختيار",
    "Confiance du moteur": "ثقة المحرّك",
    "Détails réservés aux abonnés": "التفاصيل للمشتركين",
    "Analyse disponible sur la fiche": "التحليل متاح في صفحة المباراة",
    "Partager sur WhatsApp (Admin)": "المشاركة عبر واتساب (المشرف)",
    "Voir l’analyse du match": "عرض تحليل المباراة",
    "Prudent": "حذر",
    "Modéré": "متوسط",
    "Risqué": "مرتفع المخاطر",
    "Gagné": "ناجح",
    "Perdu": "خاسر",
    "Remboursé": "مسترد",
    "En attente": "قيد الانتظار",
    "Tous les sports": "جميع الرياضات",
    "Football": "كرة القدم",
    "Basketball": "كرة السلة",
    "Tennis": "التنس",
    "Hockey": "الهوكي",
    "Baseball": "البيسبول",
    "MMA": "فنون القتال المختلطة",
    "Impossible de charger les résultats.": "تعذر تحميل النتائج.",
    "Le Track Record conserve l'historique continu de tous les pronostics réellement résolus, même après un changement de version du moteur. Les gains, pertes et remboursements passés ne sont jamais masqués.": "يحفظ سجل النتائج التاريخ المستمر لكل التوقعات المحسومة فعليًا، حتى بعد تغيير إصدار المحرك. ولا تُخفى نتائج الفوز والخسارة والاسترداد السابقة.",
    "Sélections": "الاختيارات",
    "Accessibles": "متاحة لك",
    "En direct": "مباشر",
    "Date": "التاريخ",
    "Rencontre": "المباراة",
    "🏆 Victoire": "🏆 الفائز",
    "🔄 Double chance": "🔄 فرصة مزدوجة",
    "📈 Over 2.5": "📈 أكثر من 2.5",
    "🎯 BTTS": "🎯 تسجيل الفريقين",
    "⚖️ Handicap": "⚖️ هانديكاب",
    "⚽ Over/Under": "⚽ أكثر/أقل",
    "Équipe, championnat, compétition…": "فريق، دوري، بطولة…"
  }
};
function useResultsLanguage() {
  const context = usePageLanguage();
  const current = useRef(context);
  current.current = context;
  return useMemo(() => {
    const translate = (source, values = {}) => {
      const dictionary = RESULTS_MESSAGES[current.current.language] || RESULTS_MESSAGES.fr;
      const message = typeof source === "string" && Object.prototype.hasOwnProperty.call(dictionary, source) ? dictionary[source] : current.current.t(source);
      return message.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => Object.prototype.hasOwnProperty.call(values, key) ? String(typeof values[key] === "number" ? current.current.formatNumber(values[key]) : values[key] ?? "") : placeholder);
    };
    return {
      get language() {
        return current.current.language;
      },
      get locale() {
        return current.current.locale;
      },
      get direction() {
        return current.current.direction;
      },
      t: translate,
      tx(value) {
        return typeof value === "string" ? translate(value) : current.current.tx(value);
      },
      bet(value) {
        return current.current.bet(value);
      },
      formatNumber(...args) {
        return current.current.formatNumber(...args);
      },
      formatPattern(...args) {
        return current.current.formatPattern(...args);
      }
    };
  }, []);
}

