
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Clock, Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import dayjs from "dayjs";
import LiveDataBadge from "@/components/LiveDataBadge";

const REFRESH_INTERVAL_MS = 45000;
const LIVE_CACHE_KEY = "winpulse_live_scores_v1";

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
  const family = String(sportKey || "").split("_")[0];
  return SPORT_ICONS[family] || "🏆";
}

function hasScores(match) {
  return Array.isArray(match && match.scores) && match.scores.length > 0;
}

function matchKey(match, index) {
  if (match && match.id) return match.id;
  if (match && match.match_id) return match.match_id;

  return [
    (match && match.sport_key) || "sport",
    (match && match.home_team) || "home",
    (match && match.away_team) || "away",
    (match && match.commence_time) || index,
  ].join("-");
}

function formatTime(value, format) {
  if (!value) return "";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(format) : "";
}

function readCachedScores() {
  try {
    const raw = window.sessionStorage.getItem(LIVE_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed && parsed.data) ? parsed.data : [];
  } catch (error) {
    return [];
  }
}

function writeCachedScores(scores) {
  try {
    window.sessionStorage.setItem(
      LIVE_CACHE_KEY,
      JSON.stringify({
        data: scores,
        savedAt: Date.now(),
      })
    );
  } catch (error) {
    // Cache local facultatif.
  }
}

export default function LivePage() {
  const initialScores = readCachedScores();

  const [scores, setScores] = useState(initialScores);
  const [loading, setLoading] = useState(initialScores.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const mountedRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const errorToastShownRef = useRef(false);

  const load = useCallback(async function loadScores(silent) {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;

    if (silent && mountedRef.current) {
      setRefreshing(true);
    }

    try {
      const response = await api.get("/scores");
      const nextScores = Array.isArray(response.data) ? response.data : [];

      if (!mountedRef.current) return;

      setScores(nextScores);
      setRefreshedAt(new Date());
      writeCachedScores(nextScores);
      errorToastShownRef.current = false;
    } catch (error) {
      if (!mountedRef.current) return;

      if (!silent || !errorToastShownRef.current) {
        toast.error("Impossible de charger les scores en direct");
        errorToastShownRef.current = true;
      }
    } finally {
      requestInFlightRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(function setupLiveRefresh() {
    mountedRef.current = true;

    load(initialScores.length > 0);

    const intervalId = window.setInterval(function refreshScores() {
      if (document.visibilityState === "visible") {
        load(true);
      }
    }, REFRESH_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        load(true);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return function cleanup() {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  const groups = useMemo(function buildGroups() {
    const live = scores
      .filter(function filterLive(match) {
        return !match.completed && hasScores(match);
      })
      .sort(function sortLive(a, b) {
        return String(a.commence_time || "").localeCompare(
          String(b.commence_time || "")
        );
      });

    const completed = scores
      .filter(function filterCompleted(match) {
        return Boolean(match.completed);
      })
      .sort(function sortCompleted(a, b) {
        const aTime = a.last_update || a.commence_time || "";
        const bTime = b.last_update || b.commence_time || "";
        return String(bTime).localeCompare(String(aTime));
      });

    const upcoming = scores
      .filter(function filterUpcoming(match) {
        return !match.completed && !hasScores(match);
      })
      .sort(function sortUpcoming(a, b) {
        return String(a.commence_time || "").localeCompare(
          String(b.commence_time || "")
        );
      });

    return { live: live, completed: completed, upcoming: upcoming };
  }, [scores]);

  const live = groups.live;
  const completed = groups.completed;
  const upcoming = groups.upcoming;

  const defaultTab = live.length
    ? "live"
    : completed.length
      ? "completed"
      : "upcoming";

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 grid place-items-center shadow-md shadow-rose-500/30">
              <Radio className="h-4 w-4 text-white animate-pulse" strokeWidth={2.5} />
            </div>

            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">
              Live &amp; Scores
            </h1>

            <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] ml-1">
              {live.length} en direct
            </Badge>

            <div className="ml-auto flex items-center gap-2">
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
              ) : null}
              <LiveDataBadge />
            </div>
          </div>

          <p className="text-sm text-slate-600 max-w-2xl">
            Suivi en temps réel des matchs en cours et des résultats récents.
            Actualisation automatique toutes les 45 secondes.
          </p>

          {refreshedAt ? (
            <p className="text-[10px] text-slate-400 mt-1">
              Mis à jour à {dayjs(refreshedAt).format("HH:mm:ss")}
            </p>
          ) : null}
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
          </div>
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList className="bg-white border border-neutral-200 mb-4" data-testid="live-tabs">
              <TabsTrigger value="live" data-testid="live-tab-live">
                <Radio
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    live.length > 0 ? "text-rose-500 animate-pulse" : ""
                  )}
                />
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
                  {live.map(function renderLive(match, index) {
                    return (
                      <MatchRow
                        key={matchKey(match, index)}
                        match={match}
                        status="live"
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed">
              {completed.length === 0 ? (
                <EmptyState msg="Aucun match terminé récemment." icon="✅" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {completed.slice(0, 40).map(function renderCompleted(match, index) {
                    return (
                      <MatchRow
                        key={matchKey(match, index)}
                        match={match}
                        status="completed"
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="upcoming">
              {upcoming.length === 0 ? (
                <EmptyState msg="Aucun match à venir dans les prochaines heures." icon="⏳" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcoming.slice(0, 30).map(function renderUpcoming(match, index) {
                    return (
                      <MatchRow
                        key={matchKey(match, index)}
                        match={match}
                        status="upcoming"
                      />
                    );
                  })}
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
  const home = match.home_team || "Équipe domicile";
  const away = match.away_team || "Équipe extérieure";
  const scores = Array.isArray(match.scores) ? match.scores : [];

  const homeEntry = scores.find(function findHome(score) {
    return score.name === home;
  });
  const awayEntry = scores.find(function findAway(score) {
    return score.name === away;
  });

  const homeScore = homeEntry ? homeEntry.score : null;
  const awayScore = awayEntry ? awayEntry.score : null;

  const scoresAreNumeric =
    homeScore !== null &&
    awayScore !== null &&
    Number.isFinite(Number(homeScore)) &&
    Number.isFinite(Number(awayScore));

  const homeWon =
    status === "completed" &&
    scoresAreNumeric &&
    Number(homeScore) > Number(awayScore);

  const awayWon =
    status === "completed" &&
    scoresAreNumeric &&
    Number(awayScore) > Number(homeScore);

  const commenceLabel = formatTime(match.commence_time, "DD/MM HH:mm");
  const updateLabel = formatTime(match.last_update, "HH:mm");

  return (
    <Card
      className={cn(
        "p-3 bg-white border-neutral-200",
        status === "live" ? "border-rose-300 ring-2 ring-rose-500/10" : ""
      )}
      data-testid={`live-match-${match.id || match.match_id || "unknown"}`}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
        <span className="flex items-center gap-1 min-w-0">
          <span>{iconFor(match.sport_key)}</span>
          <span className="truncate max-w-[180px]">
            {match.sport_title || match.sport_key || "Compétition"}
          </span>
        </span>

        {status === "live" ? (
          <span className="flex items-center gap-1 text-rose-600 normal-case font-bold shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE
          </span>
        ) : null}

        {status === "completed" ? (
          <span className="text-emerald-600 normal-case font-bold shrink-0">
            Terminé
          </span>
        ) : null}

        {status === "upcoming" ? (
          <span className="text-slate-500 normal-case shrink-0">
            {commenceLabel || "À venir"}
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className={cn("flex items-center justify-between", homeWon ? "font-bold" : "")}>
          <span className="text-sm truncate flex-1 text-slate-800">{home}</span>
          <span
            className={cn(
              "font-mono font-black text-lg ml-2",
              homeWon ? "text-emerald-600" : "text-slate-900",
              status === "upcoming" ? "text-slate-300" : ""
            )}
          >
            {status === "upcoming" ? "—" : homeScore !== null ? homeScore : "—"}
          </span>
        </div>

        <div className={cn("flex items-center justify-between", awayWon ? "font-bold" : "")}>
          <span className="text-sm truncate flex-1 text-slate-800">{away}</span>
          <span
            className={cn(
              "font-mono font-black text-lg ml-2",
              awayWon ? "text-emerald-600" : "text-slate-900",
              status === "upcoming" ? "text-slate-300" : ""
            )}
          >
            {status === "upcoming" ? "—" : awayScore !== null ? awayScore : "—"}
          </span>
        </div>
      </div>

      {updateLabel && status !== "upcoming" ? (
        <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-neutral-100">
          Actualisé à {updateLabel}
        </div>
      ) : null}
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
