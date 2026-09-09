
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Radio,
  Loader2,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import dayjs from "dayjs";
import LiveDataBadge from "@/components/LiveDataBadge";

const REFRESH_INTERVAL_MS = 45_000;
const LIVE_CACHE_KEY = "winpulse_live_scores_v1";
const LIVE_CACHE_MAX_AGE_MS = 5 * 60_000;

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
  return Array.isArray(match?.scores) && match.scores.length > 0;
}

function matchKey(match, index) {
  return (
    match?.id ||
    match?.match_id ||
    `${match?.sport_key || "sport"}-${match?.home_team || "home"}-${match?.away_team || "away"}-${match?.commence_time || index}`
  );
}

function formatTime(value, format) {
  if (!value) return "";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(format) : "";
}

function readLiveCache() {
  try {
    const raw = sessionStorage.getItem(LIVE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    const data = Array.isArray(parsed?.data) ? parsed.data : null;

    if (!data) return null;

    return {
      data,
      savedAt,
      fresh: Date.now() - savedAt <= LIVE_CACHE_MAX_AGE_MS,
    };
  } catch {
    return null;
  }
}

function writeLiveCache(data) {
  try {
    sessionStorage.setItem(
      LIVE_CACHE_KEY,
      JSON.stringify({
        data,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Le cache local est optionnel.
  }
}

export default function LivePage() {
  const cached = readLiveCache();

  const [scores, setScores] = useState(
    () => cached?.data || []
  );
  const [loading, setLoading] = useState(
    () => !cached?.data?.length
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(
    () => (cached?.savedAt ? new Date(cached.savedAt) : null)
  );

  const mountedRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const errorToastShownRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;

    if (silent && mountedRef.current) {
      setRefreshing(true);
    }

    try {
      const { data } = await api.get("/scores");
      const nextScores = Array.isArray(data) ? data : [];

      if (!mountedRef.current) return;

      setScores(nextScores);
      setRefreshedAt(new Date());
      writeLiveCache(nextScores);
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

  useEffect(() => {
    mountedRef.current = true;

    load({ silent: Boolean(cached?.data?.length) });

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        load({ silent: true });
      }
    }, REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        load({ silent: true });
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [load]);

  const { live, completed, upcoming } = useMemo(() => {
    const liveMatches = scores
      .filter(
        (match) =>
          !match?.completed &&
          hasScores(match)
      )
      .sort((a, b) =>
        String(a?.commence_time || "").localeCompare(
          String(b?.commence_time || "")
        )
      );

    const completedMatches = scores
      .filter((match) => Boolean(match?.completed))
      .sort((a, b) => {
        const aTime =
          a?.last_update ||
          a?.commence_time ||
          "";
        const bTime =
          b?.last_update ||
          b?.commence_time ||
          "";

        return String(bTime).localeCompare(
          String(aTime)
        );
      });

    const upcomingMatches = scores
      .filter(
        (match) =>
          !match?.completed &&
          !hasScores(match)
      )
      .sort((a, b) =>
        String(a?.commence_time || "").localeCompare(
          String(b?.commence_time || "")
        )
      );

    return {
      live: liveMatches,
      completed: completedMatches,
      upcoming: upcomingMatches,
    };
  }, [scores]);

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
              <Radio
                className="h-4 w-4 text-white animate-pulse"
                strokeWidth={2.5}
              />
            </div>

            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">
              Live &amp; Scores
            </h1>

            <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] ml-1">
              {live.length} en direct
            </Badge>

            <div className="ml-auto flex items-center gap-2">
              {refreshing && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
              )}
              <LiveDataBadge />
            </div>
          </div>

          <p className="text-sm text-slate-600 max-w-2xl">
            Suivi en temps réel des matchs en cours et des résultats récents.
            Actualisation automatique toutes les 45 secondes.
          </p>

          {refreshedAt && (
            <p className="text-[10px] text-slate-400 mt-1">
              Mis à jour à{" "}
              {dayjs(refreshedAt).format("HH:mm:ss")}
            </p>
          )}
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
          </div>
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList
              className="bg-white border border-neutral-200 mb-4"
              data-testid="live-tabs"
            >
              <TabsTrigger
                value="live"
                data-testid="live-tab-live"
              >
                <Radio
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    live.length > 0 &&
                      "text-rose-500 animate-pulse"
                  )}
                />
                En direct
                <span className="ml-1.5 text-[10px] opacity-70">
                  {live.length}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="completed"
                data-testid="live-tab-completed"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Terminés
                <span className="ml-1.5 text-[10px] opacity-70">
                  {completed.length}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="upcoming"
                data-testid="live-tab-upcoming"
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                À venir
                <span className="ml-1.5 text-[10px] opacity-70">
                  {upcoming.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              {live.length === 0 ? (
                <EmptyState
                  msg="Aucun match en direct actuellement."
                  icon="📡"
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {live.map((match, index) => (
                    <MatchRow
                      key={matchKey(match, index)}
                      match={match}
                      status="live"
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed">
              {completed.length === 0 ? (
                <EmptyState
                  msg="Aucun match terminé récemment."
                  icon="✅"
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {completed.slice(0, 40).map((match, index) => (
                    <MatchRow
                      key={matchKey(match, index)}
                      match={match}
                      status="completed"
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="upcoming">
              {upcoming.length === 0 ? (
                <EmptyState
                  msg="Aucun match à venir dans les prochaines heures."
                  icon="⏳"
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcoming.slice(0, 30).map((match, index) => (
                    <MatchRow
                      key={matchKey(match, index)}
                      match={match}
                      status="upcoming"
                    />
                  ))}
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
  const home =
    match?.home_team ||
    "Équipe domicile";
  const away =
    match?.away_team ||
    "Équipe extérieure";

  const homeScore =
    match?.scores?.find(
      (score) =>
        score?.name === home
    )?.score;

  const awayScore =
    match?.scores?.find(
      (score) =>
        score?.name === away
    )?.score;

  const scoresAreNumeric =
    homeScore != null &&
    awayScore != null &&
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

  const commenceLabel = formatTime(
    match?.commence_time,
    "DD/MM HH:mm"
  );

  const updateLabel = formatTime(
    match?.last_update,
    "HH:mm"
  );

  return (
    <Card
      className={cn(
        "p-3 bg-white border-neutral-200",
        status === "live" &&
          "border-rose-300 ring-2 ring-rose-500/10"
      )}
      data-testid={`live-match-${
        match?.id ||
        match?.match_id ||
        "unknown"
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
        <span className="flex items-center gap-1 min-w-0">
          <span>
            {iconFor(match?.sport_key)}
          </span>

          <span className="truncate max-w-[180px]">
            {match?.sport_title ||
              match?.sport_key ||
              "Compétition"}
          </span>
        </span>

        {status === "live" && (
          <span className="flex items-center gap-1 text-rose-600 normal-case font-bold shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE
          </span>
        )}

        {status === "completed" && (
          <span className="text-emerald-600 normal-case font-bold shrink-0">
            Terminé
          </span>
        )}

        {status === "upcoming" && (
          <span className="text-slate-500 normal-case shrink-0">
            {commenceLabel || "À venir"}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div
          className={cn(
            "flex items-center justify-between",
            homeWon && "font-bold"
          )}
        >
          <span
            className={cn(
              "text-sm truncate flex-1",
              homeWon
                ? "text-slate-900"
                : "text-slate-800"
            )}
          >
            {home}
          </span>

          <span
            className={cn(
              "font-mono font-black text-lg ml-2",
              homeWon
                ? "text-emerald-600"
                : "text-slate-900",
              status === "upcoming" &&
                "text-slate-300"
            )}
          >
            {status === "upcoming"
              ? "—"
              : homeScore ?? "—"}
          </span>
        </div>

        <div
          className={cn(
            "flex items-center justify-between",
            awayWon && "font-bold"
          )}
        >
          <span
            className={cn(
              "text-sm truncate flex-1",
              awayWon
                ? "text-slate-900"
                : "text-slate-800"
            )}
          >
            {away}
          </span>

          <span
            className={cn(
              "font-mono font-black text-lg ml-2",
              awayWon
                ? "text-emerald-600"
                : "text-slate-900",
              status === "upcoming" &&
                "text-slate-300"
            )}
          >
            {status === "upcoming"
              ? "—"
              : awayScore ?? "—"}
          </span>
        </div>
      </div>

      {updateLabel &&
        status !== "upcoming" && (
          <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-neutral-100">
            Actualisé à {updateLabel}
          </div>
        )}
    </Card>
  );
}

function EmptyState({ msg, icon }) {
  return (
    <Card className="p-8 bg-white border-neutral-200 text-center">
      <div className="text-4xl mb-3 opacity-40">
        {icon}
      </div>

      <p className="text-slate-500 text-sm">
        {msg}
      </p>
    </Card>
  );
}
