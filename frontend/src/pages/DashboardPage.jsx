import { useEffect, useMemo, useState, useCallback } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import MatchCard from "@/components/MatchCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  Trophy, Flame, ChevronRight, Activity, Lock,
  Sparkles, Radio, Send, CheckCircle2, XCircle,
  Clock, TrendingUp, RefreshCw, Filter
} from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeMatches } from "@/services/realtimeService";
import PaymentModal from "@/components/payment/PaymentModal";
import { toast } from "sonner";

const SPORT_TABS = [
  { key: "all",        label: "Tous",       icon: "🌍" },
  { key: "soccer",     label: "Football",   icon: "⚽" },
  { key: "basketball", label: "Basketball", icon: "🏀" },
  { key: "tennis",     label: "Tennis",     icon: "🎾" },
  { key: "icehockey",  label: "Hockey",     icon: "🏒" },
  { key: "baseball",   label: "Baseball",   icon: "⚾" },
  { key: "mma",        label: "MMA",        icon: "🥊" },
];

const BET_FILTERS = [
  { key: "all",           label: "Tous les marchés" },
  { key: "victoire",      label: "🏆 Victoire" },
  { key: "double_chance", label: "🔄 Double chance" },
  { key: "over_25",       label: "📈 Over 2.5" },
  { key: "btts",          label: "🎯 BTTS" },
  { key: "handicap",      label: "⚖️ Handicap" },
  { key: "cartons",       label: "🟨 Cartons" },
  { key: "corners",       label: "📐 Corners" },
  { key: "mi_temps",      label: "⏱ Mi-temps" },
];

function matchesBetFilter(pick = "", filterKey) {
  if (filterKey === "all") return true;
  const p = pick.toLowerCase();
  switch (filterKey) {
    case "victoire":      return p.includes("victoire") || p.includes("vainqueur");
    case "double_chance": return p.includes("double chance") || p.includes("1x") || p.includes("x2");
    case "over_25":       return p.includes("2.5");
    case "btts":          return p.includes("équipes marquent") || p.includes("btts");
    case "handicap":      return p.includes("handicap") || p.includes("spread") || p.includes("points");
    case "cartons":       return p.includes("carton");
    case "corners":       return p.includes("corner");
    case "mi_temps":      return p.includes("mi-temps") || p.includes("période");
    default:              return true;
  }
}

const LEAGUE_PRIORITY = [
  "FIFA World Cup","Coupe du Monde","Champions League","UEFA Champions League",
  "Premier League","La Liga","Bundesliga","Ligue 1","Serie A",
  "Europa League","CAF Champions League","Africa Cup",
  "NBA","EuroLeague","ATP","WTA","NHL","MLB",
];

function groupByLeague(matches) {
  const groups = {};
  for (const m of matches) {
    const league = m.sport_title || "Autre";
    if (!groups[league]) groups[league] = [];
    groups[league].push(m);
  }
  return Object.entries(groups).sort(([a],[b]) => {
    const ia = LEAGUE_PRIORITY.findIndex(p => a.includes(p));
    const ib = LEAGUE_PRIORITY.findIndex(p => b.includes(p));
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { matches, loading, lastUpdate, refresh } = useRealtimeMatches();
  const [topPicks,    setTopPicks]   = useState([]);
  const [topLoading,  setTopLoading] = useState(true);
  const [validated,   setValidated]  = useState([]);
  const [sport,       setSport]      = useState("all");
  const [betFilter,   setBetFilter]  = useState("all");
  const [showAll,     setShowAll]    = useState(false);
  const [payState,    setPayState]   = useState({ isOpen: false, tier: "pro" });
  const [refreshing,  setRefreshing] = useState(false);

  const isFree  = !user?.subscription_tier || user.subscription_tier === "free";
  const isAdmin = Boolean(user?.is_admin);

  useEffect(() => {
    let ok = true;
    api.get("/predictions/top")
      .then(r => { if (ok) setTopPicks(r.data || []); })
      .finally(() => ok && setTopLoading(false));
    api.get("/predictions/history")
      .then(r => { if (ok) setValidated(r.data?.predictions || []); })
      .catch(() => {});
    return () => { ok = false; };
  }, [lastUpdate]);

  const shareWA = useCallback((p, e) => {
    e.preventDefault(); e.stopPropagation();
    const text = [
      `🎯 *Pick WinPulse*`,
      `${p.sport_title} · ${dayjs(p.commence_time).format("DD/MM HH:mm")}`,
      ``,
      `*${p.home_team}* vs *${p.away_team}*`,
      `✅ ${p.pick} @ *${p.pick_odds}*`,
      `💰 Chez *${p.best_bookmaker || "1xBet"}*`,
      `🎯 Confiance : ${Math.round(p.confidence || 0)}%`,
      ``,
      `📱 wnpulse.com`,
      `💳 Pro dès 9 900 FCFA · MTN MoMo 🇧🇯`,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    toast.success("WhatsApp ouvert !");
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
    toast.success("Données mises à jour");
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = matches;
    if (sport !== "all")
      list = list.filter(m => (m.sport_key || "").toLowerCase().includes(sport));
    if (betFilter !== "all")
      list = list.filter(m => matchesBetFilter((m.prediction?.pick || ""), betFilter));
    return list;
  }, [matches, sport, betFilter]);

  const sportCounts = useMemo(() => {
    const c = {};
    matches.forEach(m => {
      SPORT_TABS.forEach(tab => {
        if (tab.key !== "all" && (m.sport_key || "").toLowerCase().includes(tab.key))
          c[tab.key] = (c[tab.key] || 0) + 1;
      });
    });
    return c;
  }, [matches]);

  const leagueGroups  = useMemo(() => groupByLeague(filtered), [filtered]);
  const visibleGroups = showAll ? leagueGroups : leagueGroups.slice(0, 6);
  const liveCount     = matches.filter(m => m.prediction?.is_live || m.is_live).length;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Hero */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950 text-white p-6 sm:p-8">
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-300 font-bold mb-1.5">
                {dayjs().format("dddd D MMMM YYYY")} · WinPulse IA
              </p>
              <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tighter">
                La machine à gagner 🎯
              </h1>
              <p className="mt-2 text-slate-300 text-sm">
                {isFree
                  ? "1 pick gratuit disponible · Passe Pro pour tout débloquer"
                  : `${(user?.subscription_tier||"pro").toUpperCase()} actif · Tous les picks disponibles`}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white/10 rounded-xl ring-1 ring-white/20 px-4 py-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-white/70 font-bold">Réussite IA</div>
                <div className="font-heading text-2xl font-black text-orange-300">90%</div>
              </div>
              <div className="bg-white/10 rounded-xl ring-1 ring-white/20 px-4 py-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-white/70 font-bold">Picks</div>
                <div className="font-heading text-2xl font-black text-white">{topPicks.length}</div>
              </div>
              {liveCount > 0 && (
                <div className="bg-rose-500/20 rounded-xl ring-1 ring-rose-400/40 px-4 py-2.5 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-rose-300 font-bold">En direct</div>
                  <div className="font-heading text-2xl font-black text-rose-300 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse inline-block" />
                    {liveCount}
                  </div>
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-white/10 rounded-xl ring-1 ring-white/20 px-3 py-2.5 text-white hover:bg-white/20 transition-all"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </Card>

        {/* Top picks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="font-heading text-lg font-bold text-slate-900">À la une</h2>
              <span className="text-xs text-slate-500">Top confiance IA</span>
            </div>
            <Link to="/app/top" className="text-sm text-orange-600 font-semibold flex items-center gap-1 hover:underline">
              Tout voir <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {topLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-36" />)}
            </div>
          ) : topPicks.length === 0 ? (
            <Card className="p-8 text-center bg-slate-50 border-dashed">
              <div className="text-2xl mb-2">🔍</div>
              <p className="text-slate-600 font-medium">Analyse en cours...</p>
              <p className="text-slate-500 text-sm mt-1">Les picks arrivent à 06h00 WAT</p>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topPicks.slice(0,3).map(p => {
                const locked = p.locked || !p.pick;
                return (
                  <Link key={p.match_id} to={`/app/match/${p.match_id}`}>
                    <Card className={`relative overflow-hidden border p-5 hover:shadow-md transition-all h-full cursor-pointer
                      ${locked ? "bg-neutral-50 border-dashed border-orange-200" : "bg-gradient-to-br from-white to-orange-50/30 border-orange-200/60"}
                      ${p.is_live ? "ring-2 ring-rose-500/40" : ""}`}>
                      <div className="absolute top-3 right-3 flex items-center gap-1.5">
                        {p.is_live && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black uppercase animate-pulse">
                            <Radio className="h-2.5 w-2.5" /> LIVE
                          </span>
                        )}
                        {locked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 text-xs font-bold">
                            <Lock className="h-3 w-3" /> PRO
                          </span>
                        ) : (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border
                            ${p.label==="safe" ? "bg-green-100 text-green-700 border-green-200"
                            : p.label==="value" ? "bg-orange-100 text-orange-700 border-orange-200"
                            : "bg-red-100 text-red-700 border-red-200"}`}>
                            {p.label==="safe" ? "🟢 SÛR" : p.label==="value" ? "🟡 MODÉRÉ" : "🔴 RISQUÉ"}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 flex items-center gap-1 flex-wrap pr-16">
                        <Flame className="h-3 w-3 text-orange-500" />
                        {p.sport_title}
                        {p.market_label && !locked && (
                          <span className="ml-1 bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-1.5 text-[9px] font-bold uppercase">
                            {p.market_label}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5 mb-3">
                        <div className="font-heading font-bold text-sm text-slate-900 truncate">{p.home_team}</div>
                        <div className="text-xs text-slate-400">vs</div>
                        <div className="font-heading font-bold text-sm text-slate-900 truncate">{p.away_team}</div>
                      </div>
                      <div className="pt-3 border-t border-slate-100 flex items-end justify-between">
                        {locked ? (
                          <div className="w-full">
                            <div className="text-[10px] uppercase tracking-wider text-orange-600 font-bold mb-1">Verrouillé</div>
                            <div className="text-xs text-slate-500">Passe Pro pour débloquer</div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] uppercase text-slate-500 font-semibold">Pronostic</div>
                              <div className="text-sm font-bold text-orange-600 truncate">{p.pick}</div>
                              {p.best_bookmaker && (
                                <div className="text-[10px] text-slate-400">chez {p.best_bookmaker}</div>
                              )}
                            </div>
                            <div className="text-right ml-2">
                              <div className="text-[10px] uppercase text-slate-500 font-semibold">Cote</div>
                              <div className="font-mono text-lg font-bold text-slate-900">{p.pick_odds}</div>
                            </div>
                          </>
                        )}
                      </div>
                      {isAdmin && !locked && (
                        <button
                          onClick={e => shareWA(p, e)}
                          className="absolute bottom-3 right-3 h-7 w-7 rounded-full bg-[#25D366] hover:bg-[#1ebe5c] text-white grid place-items-center shadow-sm"
                        >
                          <Send className="h-3 w-3" />
                        </button>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Picks validés */}
        <ValidatedSection picks={validated} />

        {/* CTA Free */}
        {isFree && (
          <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-rose-50 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 grid place-items-center text-white flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-heading font-bold text-slate-900">Tu as vu ton pick gratuit du jour.</div>
              <div className="text-sm text-slate-700">
                <strong>{Math.max(0, topPicks.length - 1)}</strong> autres picks t'attendent · Analyse complète · Combos · Super Combos
              </div>
            </div>
            <Button
              className="bg-gradient-to-r from-orange-500 to-rose-500 text-white border-0 hover:opacity-90 flex-shrink-0"
              onClick={() => setPayState({ isOpen: true, tier: "pro" })}
            >
              Passer Pro · 9 900 FCFA <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Card>
        )}

        {/* Matchs par championnat */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-600" />
              Matchs par championnat
              <span className="text-xs font-normal text-slate-500">({filtered.length})</span>
            </h2>
          </div>

          {/* Onglets sport */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-thin">
            {SPORT_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setSport(tab.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                  ${sport === tab.key
                    ? "bg-orange-600 text-white border-orange-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-600"}`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.key !== "all" && sportCounts[tab.key] > 0 && (
                  <span className={`text-[9px] rounded-full px-1.5 font-bold
                    ${sport === tab.key ? "bg-white/20 text-white" : "bg-orange-100 text-orange-600"}`}>
                    {sportCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filtres type pari */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-thin">
            {BET_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setBetFilter(f.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                  ${betFilter === f.key
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Groupes */}
          {loading ? (
            <div className="space-y-6">
              {[1,2,3].map(i => (
                <div key={i}>
                  <Skeleton className="h-6 w-48 mb-3" />
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1,2,3].map(j => <Skeleton key={j} className="h-44" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200">
              <div className="text-3xl mb-3">🔍</div>
              <div className="text-slate-700 font-semibold text-lg">Aucun match pour ce filtre</div>
              <div className="text-slate-500 text-sm mt-2">Essaie "Tous les sports" ou change le type de pari</div>
              <Button variant="outline" className="mt-4" onClick={() => { setSport("all"); setBetFilter("all"); }}>
                Réinitialiser les filtres
              </Button>
            </Card>
          ) : (
            <div className="space-y-8">
              {visibleGroups.map(([league, lMatches]) => (
                <LeagueSection
                  key={league}
                  league={league}
                  matches={lMatches}
                  isAdmin={isAdmin}
                  shareWA={shareWA}
                  isFree={isFree}
                  onUpgrade={() => setPayState({ isOpen: true, tier: "pro" })}
                />
              ))}
              {!showAll && leagueGroups.length > 6 && (
                <div className="text-center">
                  <Button variant="outline" onClick={() => setShowAll(true)} className="gap-2">
                    <Filter className="h-4 w-4" />
                    Voir {leagueGroups.length - 6} championnats supplémentaires
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <PaymentModal
        isOpen={payState.isOpen}
        onClose={() => setPayState(s => ({ ...s, isOpen: false }))}
        targetTier={payState.tier}
      />
    </AppLayout>
  );
}

function getLeagueEmoji(name = "") {
  const n = name.toLowerCase();
  if (n.includes("nba") || n.includes("basketball") || n.includes("euroleague")) return "🏀";
  if (n.includes("tennis") || n.includes("atp") || n.includes("wta") || n.includes("wimbledon")) return "🎾";
  if (n.includes("nhl") || n.includes("hockey")) return "🏒";
  if (n.includes("mlb") || n.includes("baseball")) return "⚾";
  if (n.includes("mma") || n.includes("ufc")) return "🥊";
  return "⚽";
}

function LeagueSection({ league, matches, isAdmin, shareWA, isFree, onUpgrade }) {
  const [expanded, setExpanded] = useState(true);
  const liveCount = matches.filter(m => m.prediction?.is_live || m.is_live).length;
  return (
    <div>
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-2 mb-3 group">
        <span className="text-lg">{getLeagueEmoji(league)}</span>
        <h3 className="font-heading font-bold text-slate-900 text-sm group-hover:text-orange-600 transition-colors">{league}</h3>
        {liveCount > 0 && (
          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-600 rounded-full px-2 py-0.5 text-[10px] font-bold border border-rose-200 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
            {liveCount} LIVE
          </span>
        )}
        <span className="text-xs text-slate-400 ml-1">({matches.length})</span>
        <div className="flex-1 h-px bg-slate-100 ml-2" />
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map(m => (
            <MatchCard key={m.id} match={m} isAdmin={isAdmin} onShareWA={shareWA} isFree={isFree} onUpgrade={onUpgrade} />
          ))}
        </div>
      )}
    </div>
  );
}

function ValidatedSection({ picks }) {
  const today = dayjs().format("YYYY-MM-DD");
  const weekStart = dayjs().startOf("week").format("YYYY-MM-DD");
  const todayPicks = (picks||[]).filter(p => (p.date||"").slice(0,10) === today);
  const weekPicks  = (picks||[]).filter(p => { const d=(p.date||"").slice(0,10); return d>=weekStart && d!==today; });
  const stats = arr => ({ wins:arr.filter(p=>p.won===true).length, losses:arr.filter(p=>p.won===false).length, pending:arr.filter(p=>p.won==null).length, total:arr.length });
  if (todayPicks.length + weekPicks.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-emerald-500" />
        <h2 className="font-heading font-bold text-lg text-slate-900">Picks validés</h2>
        <span className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">Track record</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ValidatedBlock title={`Aujourd'hui (${dayjs().format("DD/MM")})`} picks={todayPicks} stats={stats(todayPicks)} />
        <ValidatedBlock title="Cette semaine" picks={weekPicks} stats={stats(weekPicks)} />
      </div>
    </section>
  );
}

function ValidatedBlock({ title, picks, stats }) {
  return (
    <Card className="p-4 bg-white border-neutral-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-bold text-slate-900 text-sm">{title}</h3>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-0.5 text-emerald-600 font-bold"><CheckCircle2 className="h-3 w-3"/>{stats.wins}</span>
          <span className="flex items-center gap-0.5 text-rose-600 font-bold"><XCircle className="h-3 w-3"/>{stats.losses}</span>
          <span className="flex items-center gap-0.5 text-amber-600 font-bold"><Clock className="h-3 w-3"/>{stats.pending}</span>
          {stats.total>0 && <span className="font-bold text-slate-700 ml-1">{Math.round((stats.wins/stats.total)*100)}% win</span>}
        </div>
      </div>
      {picks.length===0 ? (
        <div className="text-xs text-slate-400 py-4 text-center">Aucun pick pour cette période.</div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {picks.slice(0,15).map((p,i) => {
            const icon = p.won===true ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0"/>
              : p.won===false ? <XCircle className="h-4 w-4 text-rose-500 shrink-0"/>
              : <Clock className="h-4 w-4 text-amber-500 shrink-0"/>;
            const bg = p.won===true ? "bg-emerald-50 border-emerald-100"
              : p.won===false ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100";
            return (
              <div key={p.id||i} className={`flex items-center gap-2 p-2 rounded-lg border ${bg} text-xs`}>
                {icon}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{p.match||`${p.home_team} vs ${p.away_team}`}</div>
                  <div className="text-slate-500 truncate"><span className="font-bold text-slate-700">{p.pick}</span> @ {p.odds}</div>
                </div>
                {p.won===true && p.profit!=null && <span className="text-[11px] font-bold text-emerald-700 shrink-0">+{Math.round(p.profit)}u</span>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
