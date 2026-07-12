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
import { Trophy, Flame, ChevronRight, Activity, Lock, Sparkles, Radio, Send, CheckCircle2, XCircle, Clock, TrendingUp } from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { RealtimeBar, FreshnessStamp } from "@/components/RealtimeBar";
import { useRealtimeMatches, useDataStatus } from "@/services/realtimeService";
import PaymentModal from "@/components/payment/PaymentModal";
import LiveDataBadge from "@/components/LiveDataBadge";
import { toast } from "sonner";

const SPORT_FILTERS = [
  { key: "all", label: "Tous" },
  { key: "soccer", label: "Football" },
  { key: "basketball", label: "Basket" },
  { key: "tennis", label: "Tennis" },
  { key: "football", label: "NFL" },
  { key: "hockey", label: "Hockey" },
  { key: "mma", label: "MMA" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { matches, loading, lastUpdate, refresh: refreshMatches } = useRealtimeMatches();
  const { status } = useDataStatus();
  const [topPicks, setTopPicks] = useState([]);
  const [topLoading, setTopLoading] = useState(true);
  const [sport, setSport] = useState("all");
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });
  const [validatedPicks, setValidatedPicks] = useState([]);
  const isFree = !user?.subscription_tier || user.subscription_tier === "free";
  const isAdmin = Boolean(user?.is_admin);

  useEffect(() => {
    let mounted = true;
    api.get("/predictions/top")
      .then((t) => { if (mounted) setTopPicks(t.data); })
      .finally(() => mounted && setTopLoading(false));
    // Load validated picks (today + week) — endpoint returns {predictions, stats}
    api.get("/predictions/history")
      .then((r) => { if (mounted) setValidatedPicks(r.data?.predictions || []); })
      .catch(() => { /* silent */ });
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
      `Confiance IA : ${Math.round(p.confidence || 0)}%`,
      "",
      "Analyse complète : https://wnpulse.com",
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
    toast.success("Ouvre WhatsApp pour partager");
  };

  const filtered = useMemo(() => {
    if (sport === "all") return matches;
    return matches.filter((m) => (m.sport_key || "").includes(sport));
  }, [matches, sport]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero greeting */}
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
            <div className="flex items-center gap-3">
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
            <Link to="/app/top" className="text-sm text-orange-600 font-semibold flex items-center gap-1 hover:underline" data-testid="see-all-top-link">
              Tout voir <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topPicks.slice(0,3).map((p) => {
                const locked = p.locked || !p.pick;
                return (
                <Link key={p.match_id} to={`/app/match/${p.match_id}`} data-testid={`top-pick-${p.match_id}`}>
                  <Card className={`relative overflow-hidden border p-5 hover:shadow-md transition-all h-full ${locked ? "bg-neutral-50 border-dashed border-orange-200" : "bg-gradient-to-br from-white to-orange-50/30 border-orange-200/60"} ${p.is_live ? "ring-2 ring-rose-500/40" : ""}`}>
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {p.is_live && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider animate-pulse" data-testid={`live-badge-${p.match_id}`}>
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
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 flex items-center gap-1">
                      <Flame className="h-3 w-3 text-orange-500" />
                      {p.sport_title}
                    </div>
                    <div className={`space-y-1 mb-4 ${locked ? "" : ""}`}>
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
                        title="Partager sur WhatsApp"
                        data-testid={`admin-share-whatsapp-${p.match_id}`}
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

        {/* Picks validés — historique aujourd'hui + semaine */}
        <ValidatedPicksSection picks={validatedPicks} />

        {/* Free tier upgrade CTA */}
        {isFree && (
          <Card className="mb-8 border-orange-200 bg-gradient-to-r from-orange-50 to-rose-50 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4" data-testid="upgrade-banner">
            <div className="h-11 w-11 rounded-xl wp-gradient-warm grid place-items-center text-white flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-bold text-slate-900">Tu n'as accès qu'au pick gratuit du jour.</div>
              <div className="text-sm text-slate-700">
                Débloque <strong>tous les pronostics</strong>, les <strong>3 combinés</strong> (Sécurité / Équilibre / Jackpot) et l'<strong>analyse IA</strong> dès <strong>4 900 FCFA / mois</strong>.
              </div>
            </div>
            <Button
              className="wp-gradient-warm text-white border-0 hover:opacity-90"
              data-testid="upgrade-cta-dashboard"
              onClick={() => setPayState({ isOpen: true, tier: "PRO" })}
            >
              Passer Pro <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Card>
        )}

        {/* Filters */}
        <section data-testid="matches-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-600" />
              Matchs du jour
              <span className="text-xs font-normal text-slate-500">({filtered.length})</span>
            </h2>
          </div>

          <Tabs value={sport} onValueChange={setSport} className="mb-6">
            <TabsList className="bg-slate-100 overflow-x-auto scrollbar-thin">
              {SPORT_FILTERS.map((s) => (
                <TabsTrigger
                  key={s.key}
                  value={s.key}
                  data-testid={`sport-filter-${s.key}`}
                  className="data-[state=active]:bg-white"
                >
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center bg-white border-slate-200">
              <div className="text-slate-500">Aucun match pour ce sport aujourd'hui.</div>
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
  const weekPicks = (picks || []).filter((p) => {
    const d = (p.date || p.datetime || "").slice(0, 10);
    return d >= startOfWeek && d !== today;
  });

  const statsFor = (arr) => {
    const wins = arr.filter((p) => p.won === true).length;
    const losses = arr.filter((p) => p.won === false).length;
    const pending = arr.filter((p) => p.won == null).length;
    return { wins, losses, pending, total: arr.length };
  };
  const tStats = statsFor(todayPicks);
  const wStats = statsFor(weekPicks);
  const total = todayPicks.length + weekPicks.length;

  if (total === 0) return null;

  return (
    <section className="mb-8" data-testid="validated-picks-section">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-emerald-500" />
          <h2 className="font-heading font-bold text-lg text-slate-900">Picks validés</h2>
          <span className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">Track record vivant</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ValidatedPicksBlock title={`Aujourd'hui (${dayjs().format("DD/MM")})`} picks={todayPicks} stats={tStats} testId="validated-today" />
        <ValidatedPicksBlock title="Cette semaine" picks={weekPicks} stats={wStats} testId="validated-week" />
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
        </div>
      </div>
      {picks.length === 0 ? (
        <div className="text-xs text-slate-400 py-3 text-center">Aucun pick pour cette période.</div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {picks.slice(0, 20).map((p, i) => {
            const won = p.won;
            const icon = won === true ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : won === false ? <XCircle className="h-4 w-4 text-rose-500 shrink-0" /> : <Clock className="h-4 w-4 text-amber-500 shrink-0" />;
            const bg = won === true ? "bg-emerald-50 border-emerald-100" : won === false ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100";
            return (
              <div key={p.match_id || i} className={`flex items-center gap-2 p-2 rounded-lg border ${bg} text-xs`} data-testid={`validated-pick-${i}`}>
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
