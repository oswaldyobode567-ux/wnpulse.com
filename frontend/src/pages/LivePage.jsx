import {
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
RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import dayjs from "dayjs";
import LiveDataBadge from "@/components/LiveDataBadge";

const REFRESH_INTERVAL_MS = 45_000;
const LIVE_CACHE_KEY = "winpulse_live_scores_v2";
const LIVE_CACHE_MAX_AGE_MS = 5 * 60_000;

function readCachedScores() {
try {
  const cached = JSON.parse(window.sessionStorage.getItem(LIVE_CACHE_KEY));
  const updated = Date.parse(cached?.updated_at);
  const age = Date.now() - updated;
  if (!Array.isArray(cached?.scores) || !Number.isFinite(updated) || age < 0 || age > LIVE_CACHE_MAX_AGE_MS) return null;
  return cached;
} catch {
  return null;
}
}

function writeCachedScores(scores, updatedAt) {
try {
  window.sessionStorage.setItem(LIVE_CACHE_KEY, JSON.stringify({ scores, updated_at: updatedAt }));
} catch {
  // Le cache est facultatif : stockage bloqué ou quota dépassé.
}
}

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

export default function LivePage() {
const [initialCache] = useState(readCachedScores);
const [scores, setScores] = useState(initialCache?.scores || []);
const [loading, setLoading] = useState(!initialCache);
const [refreshedAt, setRefreshedAt] = useState(initialCache?.updated_at || null);
const [cached, setCached] = useState(Boolean(initialCache));
const [refreshing, setRefreshing] = useState(false);
const [awaitingRefresh, setAwaitingRefresh] = useState(false);
const [error, setError] = useState("");

const mountedRef = useRef(false);
const requestRef = useRef(null);
const errorToastShownRef = useRef(false);

const load = useCallback(async ({ silent = false } = {}) => {
if (requestRef.current) return;

const controller = new AbortController();
requestRef.current = controller;
setRefreshing(true);

try {
  const { data } = await api.get("/scores", {
    params: { snapshot: true },
    timeout: 12_000,
    signal: controller.signal,
  });

  if (!mountedRef.current || controller.signal.aborted) return;
  // Compatibilité si le frontend est déployé avant le nouveau serveur.
  const legacy = Array.isArray(data);
  const status = legacy ? "ready" : data?.status;
  if (status === "warming") {
    setAwaitingRefresh(true);
    setCached(true);
    setError("");
    return;
  }
  if (status !== "ready" || !Array.isArray(legacy ? data : data?.scores)) {
    throw new Error("Réponse des scores invalide");
  }
  const nextScores = legacy ? data : data.scores;
  const updatedAt = legacy ? null : data.updated_at;

  setScores(nextScores);
  setRefreshedAt(updatedAt);
  setCached(legacy || Boolean(data.stale));
  setAwaitingRefresh(!legacy && Boolean(data.refreshing));
  setError("");
  if (updatedAt) writeCachedScores(nextScores, updatedAt);
  errorToastShownRef.current = false;
} catch (requestError) {
  if (!mountedRef.current || controller.signal.aborted) return;

  setAwaitingRefresh(false);
  setCached(true);
  setError("Les scores ne peuvent pas être actualisés pour le moment. Réessayez.");
  if (!silent || !errorToastShownRef.current) {
    toast.error("Impossible de charger les scores en direct");
    errorToastShownRef.current = true;
  }
} finally {
  if (requestRef.current === controller) {
    requestRef.current = null;
    if (mountedRef.current && !controller.signal.aborted) {
      setRefreshing(false);
      setLoading(false);
    }
  }
}

}, []);

useEffect(() => {
mountedRef.current = true;

load();

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

document.addEventListener("visibilitychange", handleVisibilityChange);

return () => {
  mountedRef.current = false;
  requestRef.current?.abort();
  requestRef.current = null;
  window.clearInterval(intervalId);
  document.removeEventListener(
    "visibilitychange",
    handleVisibilityChange
  );
};

}, [load]);

useEffect(() => {
if (!awaitingRefresh) return;
const timer = window.setInterval(() => {
  if (document.visibilityState === "visible") load({ silent: true });
}, 3_000);
return () => window.clearInterval(timer);
}, [awaitingRefresh, load]);

// Ne pas continuer à présenter un vieux cache comme un score en direct.
useEffect(() => {
if (!refreshedAt) return;
const expiresIn = Date.parse(refreshedAt) + LIVE_CACHE_MAX_AGE_MS - Date.now();
const timer = window.setTimeout(() => {
  setScores([]);
  setRefreshedAt(null);
  setCached(true);
  setError("Les derniers scores sont trop anciens. Actualisez pour les recharger.");
}, Math.max(0, expiresIn));
return () => window.clearTimeout(timer);
}, [refreshedAt]);

const { live, completed, upcoming } = useMemo(() => {
const liveMatches = scores
.filter((match) => !match?.completed && hasScores(match))
.sort((a, b) =>
String(a?.commence_time || "").localeCompare(
String(b?.commence_time || "")
)
);

const completedMatches = scores
  .filter((match) => Boolean(match?.completed))
  .sort((a, b) => {
    const aTime = a?.last_update || a?.commence_time || "";
    const bTime = b?.last_update || b?.commence_time || "";
    return String(bTime).localeCompare(String(aTime));
  });

const upcomingMatches = scores
  .filter((match) => !match?.completed && !hasScores(match))
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
          {cached ? "Derniers scores connus" : `${live.length} en direct`}
        </Badge>

        <div className="ml-auto">
          <LiveDataBadge />
        </div>
      </div>

      <p className="text-sm text-slate-600 max-w-2xl">
        Suivi en temps réel des matchs en cours et des résultats récents.
        Actualisation automatique toutes les 45 secondes.
      </p>

      {refreshedAt && (
        <p className="text-[10px] text-slate-400 mt-1">
          Scores du {dayjs(refreshedAt).format("DD/MM à HH:mm:ss")}
        </p>
      )}
      <button
        type="button"
        onClick={() => load()}
        disabled={refreshing}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
        data-testid="live-refresh-btn"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        {refreshing || awaitingRefresh ? "Actualisation en cours…" : "Actualiser"}
      </button>
      {awaitingRefresh && (
        <p className="mt-2 text-xs text-slate-500" role="status">
          Le fournisseur prépare les scores. La page se mettra à jour automatiquement.
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-amber-700" role="alert">{error}</p>
      )}
    </div>

    {loading || (awaitingRefresh && !refreshedAt && !scores.length) ? (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
      </div>
    ) : error && !scores.length ? (
      <Card className="p-8 bg-white border-neutral-200 text-center">
        <p className="text-sm text-slate-600">Les scores sont temporairement indisponibles.</p>
      </Card>
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
                  cached={cached}
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
              {completed.map((match, index) => (
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

function MatchRow({ match, status, cached = false }) {
const home = match?.home_team || "Équipe domicile";
const away = match?.away_team || "Équipe extérieure";

const homeScore = match?.scores?.find(
(score) => score?.name === home
)?.score;

const awayScore = match?.scores?.find(
(score) => score?.name === away
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
"DD/MM HH"
);

const updateLabel = formatTime(
match?.last_update,
"HH"
);

return (
<Card
className={cn(
"p-3 bg-white border-neutral-200",
status === "live" &&
"border-rose-300 ring-2 ring-rose-500/10"
)}
data-testid={`live-match-${match?.id || match?.match_id || "unknown"}`}
>
<div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
<span className="flex items-center gap-1 min-w-0">
<span>{iconFor(match?.sport_key)}</span>
<span className="truncate max-w-[180px]">
{match?.sport_title ||
match?.sport_key ||
"Compétition"}
</span>
</span>

    {status === "live" && (
      <span className="flex items-center gap-1 text-rose-600 normal-case font-bold shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
        {cached ? "Dernier score" : "LIVE"}
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

  {updateLabel && status !== "upcoming" && (
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
