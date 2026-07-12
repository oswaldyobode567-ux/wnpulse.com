
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import MatchCard from "@/components/MatchCard";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Trophy, Flame, ChevronRight, Activity, Lock, Sparkles, Radio, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { RealtimeBar, FreshnessStamp } from "@/components/RealtimeBar";
import { useRealtimeMatches, useDataStatus } from "@/services/realtimeService";
import PaymentModal from "@/components/payment/PaymentModal";
import LiveDataBadge from "@/components/LiveDataBadge";
import { toast } from "sonner";

const SPORT_FILTERS = [
  { key: "all",        label: "Tous" },
  { key: "soccer",     label: "⚽ Football" },
  { key: "basketball", label: "🏀 Basket" },
  { key: "tennis",     label: "🎾 Tennis" },
  { key: "football",   label: "🏈 NFL" },
  { key: "hockey",     label: "🏒 Hockey" },
  { key: "baseball",   label: "⚾ Baseball" },
  { key: "mma",        label: "🥊 MMA" },
];

const BET_TYPE_FILTERS = [
  { key: "all",           label: "Tous les marchés" },
  { key: "Vainqueur",     label: "🏆 Victoire" },
  { key: "Double chance", label: "🔄 Double chance" },
  { key: "over_2_5",      label: "📈 Over 2.5" },
  { key: "BTTS",          label: "🎯 BTTS" },
  { key: "Handicap",      label: "⚖️ Handicap" },
  { key: "Over/Under",    label: "⚽ Over/Under" },
];

function matchesBetType(pick, filterKey) {
  if (filterKey === "all") return true;
  const label = (pick?.market_label || pick?.prediction?.market_label || "").toLowerCase();
  const pickStr = (pick?.pick || pick?.prediction?.pick || "").toLowerCase();
  switch (filterKey) {
    case "Vainqueur":     return label.includes("vainqueur") || label.includes("1x2") || label.includes("h2h");
    case "Double chance": return label.includes("double");
    case "over_2_5":      return label.includes("over") && (pickStr.includes("2.5") || pickStr.includes("over 2"));
    case "BTTS":          return label.includes("btts") || label.includes("les deux") || label.includes("both");
    case "Handicap":      return label.includes("handicap") || label.includes("spread");
    case "Over/Under":    return label.includes("over") || label.includes("under") || label.includes("total");
    default:              return true;
  }
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { matches, loading, lastUpdate, refresh: refreshMatches } = useRealtimeMatches();
  const { status } = useDataStatus();
  const [topPicks, setTopPicks] = useState([]);
  const [topLoading, setTopLoading] = useState(true);
  const [sport, setSport] = useState("all");
  const [betType, setBetType] = useState("all");
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });
  const [validatedPicks, setValidatedPicks] = useState([]);
  const isFree = !user?.subscription_tier || user.subscription_tier === "free";
  const isAdmin = Boolean(user?.is_admin);

  useEffect(() => {
    let mounted = true;
    api.get("/predictions/top")
      .then((t) => { if (mounted) setTopPicks(t.data); })
      .finally(() => mounted && setTopLoading(false));
    api.get("/predictions/history")
      .then((r) => { if (mounted) setValidatedPicks(r.data?.predictions || []); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [lastUpdate]);

  const shareWhatsAppPick = (p, e) => {
    e.preventDefault();
    e.stopPropagation();
    const lines = [
      `🎯 *Pick WinPulse*`,
      `${p.sport_title || "Sport"} · ${dayjs(p.commence_time).format("DD/MM HH:mm")}`,
      "",
      `*${p.home_team}* vs *${p.away_team}*`,
      `👉 ${p.pick} @ *${p.pick_odds}*`,
      `Marché : ${p.market_label || "—"}`,
      `Confiance IA : ${Math.round(p.confidence || 0)}%`,
      "",
      "Analyse complète : https://wnpulse.com",
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
    toast.success("Ouvre WhatsApp pour partager");
  };

  const filtered = useMemo(() => {
    let list = matches;
    if (sport !== "all") {
      list = list.filter((m) => (m.sport_key || "").toLowerCase().includes(sport));
    }
    if (betType !== "all") {
      list = list.filter((m) => matchesBetType(m.prediction || m, betType));
    }
    return [...list].sort((a, b) => {
      const order = { live: 0, upcoming: 1, finished: 2 };
      const ao = order[a.match_status] ?? 1;
      const bo = order[b.match_status] ?? 1;
      if (ao !== bo) return ao - bo;
      return new Date(a.commence_time) - new Date(b.commence_time);
    });
  }, [matches, sport, betType]);

  const sportCounts = useMemo(() => {
    const counts = {};
    matches.forEach((m) => {
      const key = m.sport_key || "";
      SPORT_FILTERS.forEach((f) => {
        if (f.key !== "all" && key.toLowerCase().includes(f.key)) {
          counts[f.key] = (counts[f.key] || 0) + 1;
        }
      });
    });
    return counts;
  }, [matches]);

  const liveCount = matches.filter(m => m.is_live || m.prediction?.is_live).length;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950 text-white p-6 sm:p-8 mb-6">
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-orange-300 font-bold mb-1.5 flex items-center gap-2 flex-wrap">
                <span>{dayjs().format("dddd D MMMM YYYY")}</span>
                <LiveDataBadge compact />
              </div>
              <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter leading-[1]">
                Salut {user?.full_name?.split(" ")[0] || "champion"} 👋
              </h1>
              <p className="mt-2 text-slate-300 text-sm sm:text-base">
                {isFree
                  ? "Aujourd'hui, on a sélectionné les meilleurs picks. Passe Pro pour tout débloquer."
                  : `${(user?.subscription_tier || "pro").toUpperCase()} actif — bonne stratégie aujourd'hui.`}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl ring-1 ring-white/20 px-4 py-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-white/70 font-bold">Confiance moy.</div>
                <div className="font-heading text-2xl font-black mt-0.5 bg-gradient-to-r from-orange-300 to-rose-300 bg-clip-text text-transparent">
                  {topPicks.length ? Math.round(topPicks.reduce((a, p) => a + (p.confidence || 0), 0) / topPicks.length) : "—"}%
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl ring-1 ring-white/20 px-4 py-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-white/70 font-bold">Picks dispo</div>
                <div className="font-heading text-2xl font-black mt-0.5 text-white">{topPicks.length}</div>
              </div>
              {liveCount > 0 && (
                <div className="bg-rose-500/20 rounded-xl ring-1 ring-rose-400/40 px-4 py-2.5 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-rose-300 font-bold">En direct</div>
                  <div className="font-heading text-2xl font-black mt-0.5 text-rose-300 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse inline-block" />
                    {liveCount}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="mb-8">
          <RealtimeBar onRefresh={refreshMatches} />
          <FreshnessStamp label="Cotes mises à jour" ts={lastUpdate} />
        </div>

        {/* À la une */}
        <section className="mb-10" data-testid="featured-section">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="font-heading text-xl font-bold text-slate-900">À la une</h2>
              <span className="text-xs text-slate-500">Top confiance</span>
            </div>
            <Link to="/app/top" className="text-sm text-orange-600 font-semibold flex items-center gap-1 hover:underline">
              Tout voir <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {topLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topPicks.slice(0,3).map((p) => {
                const locked = p.locked || !p.pick;
                return (
                  <Link key={p.match_id} to={`/app/match/${p.match_id}`}>
                    <Card className={`relative overflow-hidden border p-5 hover:shadow-md transition-all h-full ${locked ? "bg-neutral-50 border-dashed border-orange-200" : "bg-gradient-to-br from-white to-orange-50/30 border-orange-200/60"} ${p.is_live ? "ring-2 ring-rose-500/40" : ""}`}>
                      <div className="absolute top-3 right-3 flex items-center gap-1.5">
                        {p.is_live && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider animate-pulse">
                            <Radio className="h-2.5 w-2.5" /> LIVE
                          </span>
                        )}
                        {locked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 text-xs font-bold">
                            <Lock className="h-3 w-3" /> PRO
                          </span>
                        ) : (
                          <ConfidenceBadge label={p.label} confidence={p.confidence} />
                        )}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 flex items-center gap-1 flex-wrap">
                        <Flame className="h-3 w-3 text-orange-500" />
                        {p.sport_title}
                        {p.market_label && !locked && (
                          <span className="ml-1 bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-1.5 text-[9px] font-bold uppercase">
                            {p.market_label}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 mb-4">
                        <div className="font-heading font-bold text-base text-slate-900">{p.home_team}</div>
                        <div className="text-xs text-slate-400">vs</div>
                        <div className="font-heading font-bold text-base text-slate-900">{p.away_team}</div>
                      </div>
                      <div className="pt-3 border-t border-slate-100 flex items-end justify-between">
                        {locked ? (
                          <div className="w-full">
                            <div className="text-[10px] uppercase tracking-wider text-orange-600 font-bold mb-1">Pronostic verrouillé</div>
                            <div className="text-xs text-slate-500">Passe Pro pour débloquer</div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Pronostic</div>
                              <div className="text-base font-bold text-orange-600">{p.pick}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cote</div>
                              <div className="font-mono text-lg font-bold text-slate-900">{p.pick_odds}</div>
                            </div>
                          </>
                        )}
                      </div>
                      {isAdmin && !locked && (
                        <button
                          onClick={(e) => shareWhatsAppPick(p, e)}
                          className="absolute bottom-3 right-3 h-7 w-7 rounded-full bg-[#25D366] hover:bg-[#1ebe5c] text-white grid place-items-center shadow-sm"
                          title="Partager sur WhatsApp (Admin)"
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
        <ValidatedPicksSection picks={validatedPicks} />

        {/* Free CTA */}
        {isFree && (
          <Card className="mb-8 border-orange-200 bg-gradient-to-r from-orange-50 to-rose-50 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-11 w-11 rounded-xl wp-gradient-warm grid place-items-center text-white flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-bold text-slate-900">Tu n'as accès qu'au pick gratuit du jour.</div>
              <div className="text-sm text-slate-700">
                Débloque <strong>tous les pronostics</strong>, les <strong>3 combinés</strong> et l'<strong>analyse IA</strong> dès <strong>4 900 FCFA / mois</strong>.
              </div>
            </div>
            <Button className="wp-gradient-warm text-white border-0 hover:opacity-90" onClick={() => setPayState({ isOpen: true, tier: "PRO" })}>
              Passer Pro <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Card>
        )}

        {/* Matchs */}
        <section data-testid="matches-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-600" />
              Matchs du jour
              <span className="text-xs font-normal text-slate-500">({filtered.length})</span>
            </h2>
          </div>

          {/* Filtre sport */}
          <Tabs value={sport} onValueChange={setSport} className="mb-3">
            <TabsList className="bg-slate-100 overflow-x-auto scrollbar-thin h-auto flex-wrap gap-1 p-1">
              {SPORT_FILTERS.map((s) => (
                <TabsTrigger key={s.key} value={s.key} className="data-[state=active]:bg-white text-xs">
                  {s.label}
                  {s.key !== "all" && sportCounts[s.key] > 0 && (
                    <span className="ml-1 text-[9px] bg-orange-100 text-orange-600 rounded-full px-1.5 font-bold">
                      {sportCounts[s.key]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Filtre type de pari */}
          <div className="flex flex-wrap gap-2 mb-5">
            {BET_TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setBetType(f.key)}
                className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                  betType === f.key
                    ? "bg-orange-600 text-white border-orange-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200">
              <div className="text-2xl mb-2">🔍</div>
              <div className="text-slate-700 font-semibold">Aucun match pour ce filtre.</div>
              <div className="text-slate-500 text-sm mt-1">Essaie "Tous les sports" ou change le type de pari.</div>
              <Button variant="outline" className="mt-4" onClick={() => { setSport("all"); setBetType("all"); }}>
                Réinitialiser les filtres
              </Button>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          )}
        </section>
      </div>

      <PaymentModal
        isOpen={payState.isOpen}
        onClose={() => setPayState({ isOpen: false, tier: payState.tier })}
        targetTier={payState.tier}
      />
    </AppLayout>
  );
}

function ValidatedPicksSection({ picks }) {
  const today = dayjs().format("YYYY-MM-DD");
  const startOfWeek = dayjs().startOf("week").format("YYYY-MM-DD");
  const todayPicks = (picks || []).filter((p) => (p.date || p.datetime || "").slice(0, 10) === today);
  const weekPicks  = (picks || []).filter((p) => {
    const d = (p.date || p.datetime || "").slice(0, 10);
    return d >= startOfWeek && d !== today;
  });
  const statsFor = (arr) => ({
    wins:    arr.filter((p) => p.won === true).length,
    losses:  arr.filter((p) => p.won === false).length,
    pending: arr.filter((p) => p.won == null).length,
    total:   arr.length,
  });
  if (todayPicks.length + weekPicks.length === 0) return null;
  return (
    <section className="mb-8" data-testid="validated-picks-section">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-5 w-5 text-emerald-500" />
        <h2 className="font-heading font-bold text-lg text-slate-900">Picks validés</h2>
        <span className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">Track record vivant</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ValidatedPicksBlock title={`Aujourd'hui (${dayjs().format("DD/MM")})`} picks={todayPicks} stats={statsFor(todayPicks)} testId="validated-today" />
        <ValidatedPicksBlock title="Cette semaine" picks={weekPicks} stats={statsFor(weekPicks)} testId="validated-week" />
      </div>
    </section>
  );
}

function ValidatedPicksBlock({ title, picks, stats, testId }) {
  return (
    <Card className="p-4 bg-white border-neutral-200" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-bold text-slate-900 text-sm">{title}</h3>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-0.5 text-emerald-600 font-bold"><CheckCircle2 className="h-3 w-3" /> {stats.wins}</span>
          <span className="flex items-center gap-0.5 text-rose-600 font-bold"><XCircle className="h-3 w-3" /> {stats.losses}</span>
          <span className="flex items-center gap-0.5 text-amber-600 font-bold"><Clock className="h-3 w-3" /> {stats.pending}</span>
          {stats.total > 0 && <span className="font-bold text-slate-700 ml-1">{Math.round((stats.wins / stats.total) * 100)}% win</span>}
        </div>
      </div>
      {picks.length === 0 ? (
        <div className="text-xs text-slate-400 py-3 text-center">Aucun pick pour cette période.</div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {picks.slice(0, 20).map((p, i) => {
            const won = p.won;
            const icon = won === true ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              : won === false ? <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
              : <Clock className="h-4 w-4 text-amber-500 shrink-0" />;
            const bg = won === true ? "bg-emerald-50 border-emerald-100"
              : won === false ? "bg-rose-50 border-rose-100"
              : "bg-amber-50 border-amber-100";
            return (
              <div key={p.match_id || i} className={`flex items-center gap-2 p-2 rounded-lg border ${bg} text-xs`}>
                {icon}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{p.match || `${p.home_team} vs ${p.away_team}`}</div>
                  <div className="text-slate-500 truncate">
                    <span className="font-bold text-slate-700">{p.pick}</span> @ {p.odds}
                    {p.score_home != null && p.score_away != null && <span className="ml-2 font-mono">· {p.score_home}-{p.score_away}</span>}
                  </div>
                </div>
                {won === true && p.profit != null && (
                  <span className="text-[11px] font-bold text-emerald-700 shrink-0">+{Math.round(p.profit)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
