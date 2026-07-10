import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Radio, Loader2, Trophy, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import dayjs from "dayjs";
import LiveDataBadge from "@/components/LiveDataBadge";

const SPORT_ICONS = {
  soccer: "⚽",
  basketball: "🏀",
  tennis: "🎾",
  americanfootball: "🏈",
  icehockey: "🏒",
  baseball: "⚾",
  mma: "🥊",
  boxing: "🥊",
  rugbyleague: "🏉",
  aussierules: "🏉",
};

function iconFor(sportKey) {
  const family = (sportKey || "").split("_")[0];
  return SPORT_ICONS[family] || "🏆";
}

export default function LivePage() {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/scores");
      setScores(Array.isArray(data) ? data : []);
      setRefreshedAt(new Date());
    } catch (e) {
      toast.error("Impossible de charger les scores en direct");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Refresh every 45s while the page is open
    const id = setInterval(load, 45000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, []);

  const { live, completed, upcoming } = useMemo(() => {
    const live = scores.filter((s) => !s.completed && (s.scores && s.scores.length));
    const completed = scores
      .filter((s) => s.completed)
      .sort((a, b) => (b.last_update || "").localeCompare(a.last_update || ""));
    const upcoming = scores
      .filter((s) => !s.completed && !(s.scores && s.scores.length))
      .sort((a, b) => (a.commence_time || "").localeCompare(b.commence_time || ""));
    return { live, completed, upcoming };
  }, [scores]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 grid place-items-center shadow-md shadow-rose-500/30">
              <Radio className="h-4 w-4 text-white animate-pulse" strokeWidth={2.5} />
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">Live &amp; Scores</h1>
            <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] ml-1 animate-pulse">
              {live.length} en direct
            </Badge>
            <div className="ml-auto"><LiveDataBadge /></div>
          </div>
          <p className="text-sm text-slate-600 max-w-2xl">
            Suivi en temps réel des matchs en cours et des résultats récents. Actualisation automatique toutes les 45 secondes.
          </p>
          {refreshedAt && (
            <p className="text-[10px] text-slate-400 mt-1">Mis à jour à {dayjs(refreshedAt).format("HH:mm:ss")}</p>
          )}
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
          </div>
        ) : (
          <Tabs defaultValue={live.length ? "live" : "completed"}>
            <TabsList className="bg-white border border-neutral-200 mb-4" data-testid="live-tabs">
              <TabsTrigger value="live" data-testid="live-tab-live">
                <Radio className={cn("h-3.5 w-3.5 mr-1.5", live.length && "text-rose-500 animate-pulse")} />
                En direct
                <span className="ml-1.5 text-[10px] opacity-70">{live.length}</span>
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="live-tab-completed">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Terminés
                <span className="ml-1.5 text-[10px] opacity-70">{completed.length}</span>
              </TabsTrigger>
              <TabsTrigger value="upcoming" data-testid="live-tab-upcoming">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                À venir
                <span className="ml-1.5 text-[10px] opacity-70">{upcoming.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              {live.length === 0 ? (
                <EmptyState msg="Aucun match en direct actuellement." icon="📡" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {live.map((s) => <MatchRow key={s.id} match={s} status="live" />)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed">
              {completed.length === 0 ? (
                <EmptyState msg="Aucun match terminé récemment." icon="✅" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {completed.map((s) => <MatchRow key={s.id} match={s} status="completed" />)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="upcoming">
              {upcoming.length === 0 ? (
                <EmptyState msg="Aucun match à venir dans les prochaines heures." icon="⏳" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcoming.slice(0, 30).map((s) => <MatchRow key={s.id} match={s} status="upcoming" />)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}

function MatchRow({ match, status }) {
  const home = match.home_team;
  const away = match.away_team;
  const homeScore = match.scores?.find((s) => s.name === home)?.score;
  const awayScore = match.scores?.find((s) => s.name === away)?.score;
  const homeWon = status === "completed" && homeScore != null && awayScore != null && Number(homeScore) > Number(awayScore);
  const awayWon = status === "completed" && homeScore != null && awayScore != null && Number(awayScore) > Number(homeScore);

  return (
    <Card
      className={cn(
        "p-3 bg-white border-neutral-200",
        status === "live" && "border-rose-300 ring-2 ring-rose-500/10"
      )}
      data-testid={`live-match-${match.id}`}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
        <span className="flex items-center gap-1">
          <span>{iconFor(match.sport_key)}</span>
          <span className="truncate max-w-[180px]">{match.sport_title || match.sport_key}</span>
        </span>
        {status === "live" && (
          <span className="flex items-center gap-1 text-rose-600 normal-case font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            LIVE
          </span>
        )}
        {status === "completed" && <span className="text-emerald-600 normal-case font-bold">Terminé</span>}
        {status === "upcoming" && (
          <span className="text-slate-500 normal-case">
            {dayjs(match.commence_time).format("DD/MM HH:mm")}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className={cn("flex items-center justify-between", homeWon && "font-bold")}>
          <span className={cn("text-sm truncate flex-1", homeWon ? "text-slate-900" : "text-slate-800")}>{home}</span>
          <span className={cn(
            "font-mono font-black text-lg ml-2",
            homeWon ? "text-emerald-600" : "text-slate-900",
            status === "upcoming" && "text-slate-300"
          )}>
            {status === "upcoming" ? "—" : (homeScore ?? "—")}
          </span>
        </div>
        <div className={cn("flex items-center justify-between", awayWon && "font-bold")}>
          <span className={cn("text-sm truncate flex-1", awayWon ? "text-slate-900" : "text-slate-800")}>{away}</span>
          <span className={cn(
            "font-mono font-black text-lg ml-2",
            awayWon ? "text-emerald-600" : "text-slate-900",
            status === "upcoming" && "text-slate-300"
          )}>
            {status === "upcoming" ? "—" : (awayScore ?? "—")}
          </span>
        </div>
      </div>

      {match.last_update && status !== "upcoming" && (
        <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-neutral-100">
          Actualisé {dayjs(match.last_update).fromNow ? dayjs(match.last_update).fromNow() : dayjs(match.last_update).format("HH:mm")}
        </div>
      )}
    </Card>
  );
}

function EmptyState({ msg, icon }) {
  return (
    <Card className="p-8 bg-white border-neutral-200 text-center">
      <div className="text-4xl mb-3 opacity-40">{icon}</div>
      <p className="text-slate-500 text-sm">{msg}</p>
    </Card>
  );
}
