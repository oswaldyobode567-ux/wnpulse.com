// WNPulse Live : scores et diffusions vidéo réunis dans ce fichier.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Radio, Loader2, Clock, CheckCircle2, RefreshCw, Play, ExternalLink, X, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import LiveDataBadge from "@/components/LiveDataBadge";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
const REFRESH_INTERVAL_MS = 45_000;
const LIVE_CACHE_KEY = "winpulse_live_scores_v2";
const LIVE_CACHE_MAX_AGE_MS = 5 * 60_000;
const LIVE_WARMUP_MAX_MS = 90_000;
function scoresErrorMessage(i18n, code, status) {
  const messages = {
    provider_not_configured: i18n.t("Le service de scores n’est pas configuré. Contactez l’équipe WinPulse."),
    provider_access_denied: i18n.t("Le fournisseur refuse l’accès aux scores. L’équipe WinPulse doit vérifier sa configuration."),
    provider_quota_exhausted: i18n.t("Le quota du fournisseur de scores est épuisé. L’équipe WinPulse doit rétablir le service."),
    provider_rate_limited: i18n.t("Le fournisseur limite les demandes. Une nouvelle tentative sera effectuée automatiquement."),
    provider_timeout: i18n.t("Le fournisseur de scores met trop de temps à répondre. Nouvelle tentative automatique à venir."),
    scores_cache_unavailable: i18n.t("Le service de scores est temporairement indisponible. Nouvelle tentative automatique à venir."),
    sport_not_supported: i18n.t("Les scores de ces compétitions ne sont pas disponibles auprès du fournisseur.")
  };
  if (messages[code]) return messages[code];
  if (status === 401 || status === 403) return i18n.t("Votre session a expiré ou l’accès est refusé. Reconnectez-vous pour réessayer.");
  if (status === 404) return i18n.t("Le service de scores n’est pas disponible sur cette version du serveur.");
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return i18n.t("Le serveur met trop de temps à répondre. Nouvelle tentative automatique à venir.");
  return i18n.t("Les scores ne peuvent pas être actualisés pour le moment. Nouvelle tentative automatique à venir.");
}
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
    window.sessionStorage.setItem(LIVE_CACHE_KEY, JSON.stringify({
      scores,
      updated_at: updatedAt
    }));
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
  aussierules: "🏉"
};
function iconFor(sportKey) {
  const family = String(sportKey || "").split("_")[0];
  return SPORT_ICONS[family] || "🏆";
}
function hasScores(match) {
  return Array.isArray(match?.scores) && match.scores.length > 0;
}
function matchKey(match, index) {
  return match?.id || match?.match_id || `${match?.sport_key || "sport"}-${match?.home_team || "home"}-${match?.away_team || "away"}-${match?.commence_time || index}`;
}
function formatTime(i18n, value, format) {
  return value ? i18n.formatPattern(value, format) : "";
}
export default function LivePage() {
  const i18n = usePageLanguage();
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
  const warmupStartedRef = useRef(null);
  const load = useCallback(async ({
    silent = false
  } = {}) => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      const response = await api.get("/scores", {
        params: {
          snapshot: true
        },
        timeout: 12_000,
        signal: controller.signal
      });
      const {
        data
      } = response;
      if (!mountedRef.current || controller.signal.aborted) return;
      // Compatibilité si le frontend est déployé avant le nouveau serveur.
      const legacy = Array.isArray(data);
      const status = legacy ? response.status === 202 ? "warming" : "ready" : data?.status;
      if (status === "warming") {
        if (warmupStartedRef.current === null) warmupStartedRef.current = Date.now();
        if (Date.now() - warmupStartedRef.current >= LIVE_WARMUP_MAX_MS) {
          setAwaitingRefresh(false);
          setCached(true);
          setError("La préparation des scores prend plus de temps que prévu. Une nouvelle tentative sera effectuée automatiquement.");
          return;
        }
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
      warmupStartedRef.current = null;
      const validScores = nextScores.filter(match => match && typeof match === "object" && !Array.isArray(match));
      setScores(validScores);
      setRefreshedAt(updatedAt);
      setCached(legacy || Boolean(data.stale) || Boolean(data.partial));
      setAwaitingRefresh(!legacy && Boolean(data.refreshing));
      setError(!legacy && data.error_code ? scoresErrorMessage(i18n, data.error_code) : !legacy && data.partial ? "Certaines compétitions ne sont pas disponibles. Les scores reçus restent affichés." : "");
      if (updatedAt) writeCachedScores(validScores, updatedAt);
      errorToastShownRef.current = false;
    } catch (requestError) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setAwaitingRefresh(false);
      warmupStartedRef.current = null;
      setCached(true);
      const message = scoresErrorMessage(i18n, requestError?.response?.data?.error_code || requestError?.code, requestError?.response?.status);
      setError(message);
      if (!silent || !errorToastShownRef.current) {
        toast.error(message);
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
  }, [i18n]);
  useEffect(() => {
    mountedRef.current = true;
    load();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        load({
          silent: true
        });
      }
    }, REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        load({
          silent: true
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);
  useEffect(() => {
    if (!awaitingRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load({
        silent: true
      });
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
  const {
    live,
    completed,
    upcoming
  } = useMemo(() => {
    const liveMatches = scores.filter(match => !match?.completed && hasScores(match)).sort((a, b) => String(a?.commence_time || "").localeCompare(String(b?.commence_time || "")));
    const completedMatches = scores.filter(match => Boolean(match?.completed)).sort((a, b) => {
      const aTime = a?.last_update || a?.commence_time || "";
      const bTime = b?.last_update || b?.commence_time || "";
      return String(bTime).localeCompare(String(aTime));
    });
    const upcomingMatches = scores.filter(match => !match?.completed && !hasScores(match)).sort((a, b) => String(a?.commence_time || "").localeCompare(String(b?.commence_time || "")));
    return {
      live: liveMatches,
      completed: completedMatches,
      upcoming: upcomingMatches
    };
  }, [scores]);
  const defaultTab = live.length ? "live" : completed.length ? "completed" : "upcoming";
  return <AppLayout>
<div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24">
<div className="mb-6">
<div className="flex items-center gap-2 mb-1 flex-wrap">
<div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 grid place-items-center shadow-md shadow-rose-500/30">
<Radio className="h-4 w-4 text-white animate-pulse" strokeWidth={2.5} />
</div>

        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">{i18n.t("Live & Scores")}</h1>

        <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] ms-1">
          {i18n.tx(cached ? "Derniers scores connus" : i18n.t("{{v0}} en direct", {
              v0: live.length
            }))}
        </Badge>

        <div className="ms-auto">
          <LiveDataBadge />
        </div>
      </div>

      <p className="text-sm text-slate-600 max-w-2xl">{i18n.t("Suivi en temps r\xE9el des matchs en cours et des r\xE9sultats r\xE9cents. Actualisation automatique toutes les 45 secondes.")}</p>

      {i18n.tx(refreshedAt && <p className="text-[10px] text-slate-400 mt-1">{i18n.rich("Scores du {{v0}}", {
            v0: i18n.formatPattern(refreshedAt, "DD/MM à HH:mm:ss")
          })}
        </p>)}
      <button type="button" onClick={() => load()} disabled={refreshing} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50" data-testid="live-refresh-btn">
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        {i18n.tx(refreshing || awaitingRefresh ? "Actualisation en cours…" : "Actualiser")}
      </button>
      {i18n.tx(awaitingRefresh && <p className="mt-2 text-xs text-slate-500" role="status">{i18n.t("Le fournisseur pr\xE9pare les scores. La page se mettra \xE0 jour automatiquement.")}</p>)}
      {i18n.tx(error && <p className="mt-2 text-sm text-amber-700" role="alert">{i18n.tx(error)}</p>)}
    </div>

    <LiveStreamsPanel scores={scores} scoresCached={cached} />

    {i18n.tx(loading || awaitingRefresh && !refreshedAt && !scores.length ? <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
      </div> : error && !scores.length ? <Card className="p-8 bg-white border-neutral-200 text-center">
        <p className="text-sm text-slate-600">{i18n.t("Les scores sont temporairement indisponibles.")}</p>
      </Card> : <Tabs defaultValue={defaultTab}>
        <TabsList className="bg-white border border-neutral-200 mb-4" data-testid="live-tabs">
          <TabsTrigger value="live" data-testid="live-tab-live">
            <Radio className={cn("h-3.5 w-3.5 me-1.5", live.length > 0 && "text-rose-500 animate-pulse")} />{i18n.rich("En direct{{v0}}", {
              v0: <span className="ms-1.5 text-[10px] opacity-70">
              {i18n.tx(live.length)}
            </span>
            })}
          </TabsTrigger>

          <TabsTrigger value="completed" data-testid="live-tab-completed">
            <CheckCircle2 className="h-3.5 w-3.5 me-1.5" />{i18n.rich("Termin\xE9s{{v0}}", {
              v0: <span className="ms-1.5 text-[10px] opacity-70">
              {i18n.tx(completed.length)}
            </span>
            })}
          </TabsTrigger>

          <TabsTrigger value="upcoming" data-testid="live-tab-upcoming">
            <Clock className="h-3.5 w-3.5 me-1.5" />{i18n.rich("\xC0 venir{{v0}}", {
              v0: <span className="ms-1.5 text-[10px] opacity-70">
              {i18n.tx(upcoming.length)}
            </span>
            })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          {i18n.tx(live.length === 0 ? <EmptyState msg={i18n.t("Aucun match en direct actuellement.")} icon="📡" /> : <div className="grid gap-3 sm:grid-cols-2">
              {i18n.tx(live.map((match, index) => <MatchRow key={matchKey(match, index)} match={match} status="live" cached={cached} />))}
            </div>)}
        </TabsContent>

        <TabsContent value="completed">
          {i18n.tx(completed.length === 0 ? <EmptyState msg={i18n.t("Aucun match terminé récemment.")} icon="✅" /> : <div className="grid gap-3 sm:grid-cols-2">
              {i18n.tx(completed.map((match, index) => <MatchRow key={matchKey(match, index)} match={match} status="completed" />))}
            </div>)}
        </TabsContent>

        <TabsContent value="upcoming">
          {i18n.tx(upcoming.length === 0 ? <EmptyState msg={i18n.t("Aucun match à venir dans les prochaines heures.")} icon="⏳" /> : <div className="grid gap-3 sm:grid-cols-2">
              {i18n.tx(upcoming.slice(0, 30).map((match, index) => <MatchRow key={matchKey(match, index)} match={match} status="upcoming" />))}
            </div>)}
        </TabsContent>
      </Tabs>)}
  </div>
</AppLayout>;
}
function MatchRow({
  match,
  status,
  cached = false
}) {
  const i18n = usePageLanguage();
  const home = match?.home_team || "Équipe domicile";
  const away = match?.away_team || "Équipe extérieure";
  const homeScore = match?.scores?.find(score => score?.name === home)?.score;
  const awayScore = match?.scores?.find(score => score?.name === away)?.score;
  const scoresAreNumeric = homeScore != null && awayScore != null && Number.isFinite(Number(homeScore)) && Number.isFinite(Number(awayScore));
  const homeWon = status === "completed" && scoresAreNumeric && Number(homeScore) > Number(awayScore);
  const awayWon = status === "completed" && scoresAreNumeric && Number(awayScore) > Number(homeScore);
  const commenceLabel = formatTime(i18n, match?.commence_time, "DD/MM HH");
  const updateLabel = formatTime(i18n, match?.last_update, "HH");
  return <Card className={cn("p-3 bg-white border-neutral-200", status === "live" && "border-rose-300 ring-2 ring-rose-500/10")} data-testid={`live-match-${match?.id || match?.match_id || "unknown"}`}>
<div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
<span className="flex items-center gap-1 min-w-0">
<span>{i18n.tx(iconFor(match?.sport_key))}</span>
<span className="truncate max-w-[180px]">
{i18n.tx(match?.sport_title || match?.sport_key || "Compétition")}
</span>
</span>

    {i18n.tx(status === "live" && <span className="flex items-center gap-1 text-rose-600 normal-case font-bold shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
        {i18n.tx(cached ? "Dernier score" : "LIVE")}
      </span>)}

    {i18n.tx(status === "completed" && <span className="text-emerald-600 normal-case font-bold shrink-0">{i18n.t("Termin\xE9")}</span>)}

    {i18n.tx(status === "upcoming" && <span className="text-slate-500 normal-case shrink-0">
        {i18n.tx(commenceLabel || "À venir")}
      </span>)}
  </div>

  <div className="space-y-1.5">
    <div className={cn("flex items-center justify-between", homeWon && "font-bold")}>
      <span className={cn("text-sm truncate flex-1", homeWon ? "text-slate-900" : "text-slate-800")}>
        {i18n.tx(home)}
      </span>

      <span className={cn("font-mono font-black text-lg ms-2", homeWon ? "text-emerald-600" : "text-slate-900", status === "upcoming" && "text-slate-300")}>
        {i18n.tx(status === "upcoming" ? "—" : homeScore ?? "—")}
      </span>
    </div>

    <div className={cn("flex items-center justify-between", awayWon && "font-bold")}>
      <span className={cn("text-sm truncate flex-1", awayWon ? "text-slate-900" : "text-slate-800")}>
        {i18n.tx(away)}
      </span>

      <span className={cn("font-mono font-black text-lg ms-2", awayWon ? "text-emerald-600" : "text-slate-900", status === "upcoming" && "text-slate-300")}>
        {i18n.tx(status === "upcoming" ? "—" : awayScore ?? "—")}
      </span>
    </div>
  </div>

  {i18n.tx(updateLabel && status !== "upcoming" && <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-neutral-100">{i18n.rich("Actualis\xE9 \xE0 {{v0}}", {
        v0: i18n.tx(updateLabel)
      })}
    </div>)}
</Card>;
}
function EmptyState({
  msg,
  icon
}) {
  const i18n = usePageLanguage();
  return <Card className="p-8 bg-white border-neutral-200 text-center">
<div className="text-4xl mb-3 opacity-40">
{i18n.tx(icon)}
</div>
<p className="text-slate-500 text-sm">
{i18n.tx(msg)}
</p>
</Card>;
}

// ─── Diffusions vidéo intégrées ───

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const MAX_VIDEO_CACHE_AGE = 600000;
const SPORT_NAMES = {
  soccer: "Football",
  basketball: "Basketball",
  tennis: "Tennis",
  rugby: "Rugby",
  other: "Autres sports"
};
const COUNTRIES = [["", "Tous les pays"], ["BJ", "Bénin"], ["CI", "Côte d’Ivoire"], ["SN", "Sénégal"], ["CM", "Cameroun"], ["ML", "Mali"], ["FR", "France"], ["BE", "Belgique"], ["LU", "Luxembourg"], ["CH", "Suisse"], ["CA", "Canada"], ["MA", "Maroc"], ["NG", "Nigeria"], ["ZA", "Afrique du Sud"]];
function timestamp(value) {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}
function validStream(stream, now = Date.now()) {
  const verified = timestamp(stream?.verified_at);
  const start = timestamp(stream?.status === "live" ? stream.actual_start : stream?.scheduled_start);
  return Boolean(stream && ID_PATTERN.test(stream.video_id || "") && CHANNEL_PATTERN.test(stream.channel_id || "") && typeof stream.title === "string" && typeof stream.channel_title === "string" && verified !== null && verified <= now && now - verified <= MAX_VIDEO_CACHE_AGE && start !== null && (stream.status === "live" ? start <= now + 120000 && start >= now - 86400000 : stream.status === "upcoming" && start >= now - 900000 && start <= now + 172800000));
}
function normalizeStreams(data, now = Date.now()) {
  if (!data || !Array.isArray(data.items)) throw new Error("Réponse vidéo invalide");
  const seen = new Set();
  return {
    ...data,
    items: data.items.filter(item => {
      if (!validStream(item, now) || seen.has(item.video_id)) return false;
      seen.add(item.video_id);
      return true;
    }).map(item => ({
      ...item,
      watch_url: `https://www.youtube.com/watch?v=${item.video_id}`
    }))
  };
}
function dateLabel(i18n, value) {
  const date = timestamp(value);
  return date === null ? "Horaire à confirmer" : new Intl.DateTimeFormat(i18n.locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}
function videoError(i18n, code) {
  const errors = {
    video_quota_exhausted: i18n.t("Le programme vidéo ne peut pas être actualisé pour le moment. Les scores restent accessibles."),
    video_rate_limited: i18n.t("L’actualisation des diffusions est temporairement limitée. Une nouvelle tentative est prévue."),
    video_access_denied: i18n.t("Le programme vidéo est temporairement indisponible. Les scores restent accessibles."),
    video_search_budget: i18n.t("La recherche de nouveaux directs reprendra automatiquement. Les diffusions déjà connues continuent d’être vérifiées.")
  };
  return errors[code] || i18n.t("Les diffusions ne peuvent pas être actualisées pour le moment. Les scores restent accessibles.");
}
let youtubePromise = null;
function loadYoutubePlayer() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubePromise) return youtubePromise;
  youtubePromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    let finished = false;
    const end = failure => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
      if (failure) {
        script.remove();
        youtubePromise = null;
        reject(failure);
      } else resolve(window.YT);
    };
    const ready = () => {
      try {
        if (typeof previous === "function") previous();
      } catch {/* Another player callback must not break this player. */}
      end(window.YT?.Player ? null : new Error("Lecteur indisponible"));
    };
    const timer = window.setTimeout(() => end(new Error("Le lecteur met trop de temps à répondre")), 12000);
    window.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.onerror = () => end(new Error("Chargement du lecteur impossible"));
    document.head.appendChild(script);
  });
  return youtubePromise;
}
function OfficialPlayer({
  stream
}) {
  const i18n = usePageLanguage();
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  useEffect(() => {
    let active = true,
      player = null,
      readyTimer = null;
    const container = containerRef.current;
    setLoading(true);
    setError("");
    setHint("");
    if (!container || !ID_PATTERN.test(stream.video_id || "")) return;
    loadYoutubePlayer().then(YT => {
      if (!active) return;
      const iframe = document.createElement("iframe");
      iframe.title = stream.title;
      iframe.className = "h-full w-full";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      iframe.allowFullscreen = true;
      const options = new URLSearchParams({
        enablejsapi: "1",
        origin: window.location.origin,
        autoplay: "1",
        playsinline: "1",
        controls: "1",
        rel: "0"
      });
      iframe.src = `https://www.youtube-nocookie.com/embed/${stream.video_id}?${options}`;
      container.replaceChildren(iframe);
      readyTimer = window.setTimeout(() => {
        if (active) {
          setLoading(false);
          setError("Le lecteur ne répond pas. Tu peux consulter la diffusion sur YouTube.");
        }
      }, 15000);
      player = new YT.Player(iframe, {
        events: {
          onReady: () => {
            window.clearTimeout(readyTimer);
            if (active) {
              setLoading(false);
              setError("");
            }
          },
          onError: event => {
            if (!active) return;
            window.clearTimeout(readyTimer);
            setLoading(false);
            setError([100, 101, 150].includes(event.data) ? "Cette vidéo n’est pas disponible dans ce lecteur, selon les conditions du diffuseur ou ton pays." : "Le lecteur n’a pas pu démarrer. Tu peux essayer directement sur YouTube.");
          },
          onStateChange: event => {
            if (active && event.data === 0) setHint("Cette diffusion est terminée.");
          },
          onAutoplayBlocked: () => {
            if (active) setHint("Appuie sur le bouton Lecture du lecteur pour démarrer la vidéo.");
          }
        }
      });
    }).catch(() => {
      if (active) {
        setLoading(false);
        setError("Le lecteur ne peut pas être chargé. Tu peux consulter la diffusion sur YouTube.");
      }
    });
    return () => {
      active = false;
      window.clearTimeout(readyTimer);
      if (player) {
        try {
          player.destroy();
        } catch {/* Navigation after provider removal. */}
      }
      container?.replaceChildren();
    };
  }, [stream.video_id, stream.title]);
  return <div>
    <div className="relative aspect-video min-h-[220px] sm:min-h-0 bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      {i18n.tx(loading && <div role="status" className="absolute inset-0 grid place-items-center bg-slate-950 text-white"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-3 text-base">{i18n.t("Ouverture du lecteur\u2026")}</p></div></div>)}
    </div>
    {i18n.tx((error || hint) && <p role={error ? "alert" : "status"} className="bg-orange-50 px-5 py-4 text-base leading-relaxed text-orange-900">{i18n.tx(error || hint)}</p>)}
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 px-5 py-4 text-white"><p className="text-sm">{i18n.rich("Lecture via YouTube \xB7 {{v0}}", {
          v0: stream.channel_title
        })}</p><a href={`https://www.youtube.com/watch?v=${stream.video_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-300">{i18n.t("Consulter sur YouTube")}<ExternalLink className="h-4 w-4" /></a></div>
  </div>;
}
function scoreKey(match) {
  return String(match?.id || match?.match_id || `${match?.home_team}-${match?.away_team}-${match?.commence_time}`);
}
function FollowedScore({
  match,
  cached
}) {
  const i18n = usePageLanguage();
  const score = name => (Array.isArray(match.scores) ? match.scores.find(entry => entry?.name === name)?.score : null) ?? "—";
  return <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
    <p className="text-sm font-semibold text-orange-700">{i18n.tx(cached ? "Dernier score connu" : match.completed ? "Rencontre terminée" : Array.isArray(match.scores) && match.scores.length ? "Score suivi" : "Rencontre à venir")}</p>
    <p className="mt-2 text-sm text-slate-500">{i18n.tx(match.sport_title || "Compétition")}</p>
    {i18n.tx([match.home_team, match.away_team].map((name, index) => <div key={`${index}-${name}`} className="mt-3 flex items-center justify-between gap-3"><span className="min-w-0 text-base font-semibold text-slate-900">{i18n.tx(name)}</span><span className="shrink-0 font-mono text-2xl font-black text-slate-900">{i18n.tx(score(name))}</span></div>))}
    <p className="mt-4 text-sm text-slate-500">{i18n.t("Les scores se mettent \xE0 jour ind\xE9pendamment de la vid\xE9o.")}</p>
  </div>;
}
function LiveStreamsPanel({
  scores = [],
  scoresCached = false
}) {
  const i18n = usePageLanguage();
  const {
    user
  } = useAuth();
  const isAdmin = Boolean(user?.is_admin);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [region, setRegion] = useState("");
  const [sport, setSport] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [followedId, setFollowedId] = useState("");
  const [diagnostic, setDiagnostic] = useState(null);
  const [adminMessage, setAdminMessage] = useState("");
  const mountedRef = useRef(false);
  const requestRef = useRef(null);
  const load = useCallback(async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      const response = await api.get("/live/streams", {
        params: {
          region
        },
        timeout: 8000,
        signal: controller.signal
      });
      const snapshot = normalizeStreams(response.data);
      if (!mountedRef.current || controller.signal.aborted) return;
      setData(snapshot);
      setError(snapshot.error_code && snapshot.error_code !== "video_not_configured" ? videoError(i18n, snapshot.error_code) : "");
    } catch (failure) {
      if (mountedRef.current && !controller.signal.aborted) setError(failure?.response?.status === 404 ? "La rubrique vidéo est en préparation. Les scores restent accessibles." : videoError(i18n, failure?.response?.data?.error_code));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current && !controller.signal.aborted) {
          setRefreshing(false);
          setLoading(false);
        }
      }
    }
  }, [region, i18n]);
  useEffect(() => {
    mountedRef.current = true;
    setData(null);
    setLoading(true);
    setSelected(null);
    setFollowedId("");
    load();
    const poll = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = window.setInterval(poll, 60000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [load]);
  useEffect(() => {
    if (!data?.items?.length) return;
    const expires = Math.min(...data.items.map(item => timestamp(item.verified_at) + MAX_VIDEO_CACHE_AGE));
    const timer = window.setTimeout(() => setData(previous => previous ? {
      ...previous,
      items: previous.items.filter(item => validStream(item))
    } : previous), Math.max(1, expires - Date.now() + 10));
    return () => window.clearTimeout(timer);
  }, [data]);
  useEffect(() => {
    if (!isAdmin) {
      setDiagnostic(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const read = () => api.get("/admin/live-streams/status", {
      timeout: 8000,
      signal: controller.signal
    }).then(response => {
      if (active) setDiagnostic(response.data);
    }).catch(() => {});
    read();
    const timer = window.setInterval(read, 60000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [isAdmin]);
  const items = data?.items || [];
  const filtered = useMemo(() => items.filter(item => (sport === "all" || item.sport === sport) && `${item.title} ${item.channel_title}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr"))), [items, sport, query]);
  const scoreOptions = useMemo(() => Array.isArray(scores) ? scores.filter(match => match?.home_team && match?.away_team).slice(0, 100) : [], [scores]);
  const followed = scoreOptions.find(match => scoreKey(match) === followedId);
  async function refreshProvider() {
    try {
      const response = await api.post("/admin/live-streams/refresh", {}, {
        timeout: 8000
      });
      setAdminMessage(response.data.configured ? "La collecte suit son calendrier. Le programme s’actualisera automatiquement." : "Ajoute YOUTUBE_API_KEY dans les variables du backend et active YouTube Data API v3 dans le projet Google.");
      load();
    } catch {
      setAdminMessage("Impossible de demander l’actualisation des diffusions.");
    }
  }
  return <section aria-labelledby="live-video-title" className="mb-10" data-testid="live-streams-panel">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div className="max-w-2xl"><p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-orange-700"><Tv className="h-5 w-5" />{i18n.t("\xC0 regarder sur WinPulse")}</p><h2 id="live-video-title" className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">{i18n.t("Le match, sur ton \xE9cran.")}</h2><p className="mt-3 text-base leading-relaxed text-slate-600">{i18n.t("Retrouve les directs int\xE9grables des diffuseurs s\xE9lectionn\xE9s et suis les scores sur la m\xEAme page.")}</p></div><Button variant="outline" onClick={load} disabled={refreshing} className="min-h-12 bg-white"><RefreshCw className={`me-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{i18n.t("Actualiser les diffusions")}</Button></div>
    {i18n.tx(isAdmin && <Card className="mb-6 rounded-2xl border-orange-200 bg-orange-50/40 p-5"><p className="text-base font-bold text-slate-900">{i18n.t("Configuration vid\xE9o \xB7 Administrateur")}</p><p className="mt-2 text-sm leading-relaxed text-slate-600">{i18n.tx(diagnostic?.configured ? i18n.t("{{v0}} recherches aujourd\u2019hui \xB7 Sources : {{v1}} \xB7 Derni\xE8re v\xE9rification : {{v2}}.", {
          v0: diagnostic.search_calls_today || 0,
          v1: (diagnostic.handles || []).join(", "),
          v2: diagnostic.last_success_at ? dateLabel(i18n, diagnostic.last_success_at) : "en attente"
        }) : "La recherche automatique nécessite YOUTUBE_API_KEY dans le backend. Les chaînes FIFA et FIBA sont sélectionnées par défaut.")}</p>{i18n.tx(diagnostic?.configured && !diagnostic.scheduler_active && <p className="mt-3 text-sm text-amber-800">{i18n.t("La t\xE2che vid\xE9o n\u2019est pas active. V\xE9rifie les logs d\u2019initialisation du backend.")}</p>)}{i18n.tx(diagnostic?.error_code && <p className="mt-3 text-sm text-amber-800">{i18n.rich("\xC9tat fournisseur : {{v0}}", {
          v0: i18n.tx(diagnostic.error_code)
        })}</p>)}<Button variant="outline" className="mt-4 min-h-11 bg-white" onClick={refreshProvider}>{i18n.t("V\xE9rifier la collecte")}</Button>{i18n.tx(adminMessage && <p role="status" className="mt-3 text-sm text-slate-700">{i18n.tx(adminMessage)}</p>)}</Card>)}
    {i18n.tx(error && <p role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">{i18n.tx(error)}</p>)}
    {i18n.tx(selected && <Card className="mb-7 overflow-hidden rounded-3xl border-orange-200 bg-white shadow-lg">
      <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-7"><div><Badge className="bg-orange-50 text-orange-700 border-orange-100 text-sm">{selected.channel_title}</Badge><h3 className="mt-3 text-xl sm:text-2xl font-extrabold text-slate-900">{i18n.tx(selected.title)}</h3></div><Button variant="ghost" onClick={() => setSelected(null)} aria-label={i18n.t("Fermer le lecteur")} className="min-h-11 min-w-11"><X className="h-5 w-5" /></Button></div>
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]"><OfficialPlayer key={selected.video_id} stream={selected} /><aside className="p-5 sm:p-7"><p className="text-lg font-bold text-slate-900">{i18n.t("Un score \xE0 suivre")}</p><p className="mt-2 text-base text-slate-600">{i18n.t("Choisis la rencontre dont tu veux suivre le score pendant la vid\xE9o.")}</p><label className="mt-5 block"><span className="sr-only">{i18n.t("Rencontre \xE0 suivre")}</span><select value={followedId} onChange={event => setFollowedId(event.target.value)} className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base"><option value="">{i18n.t("Choisir une rencontre")}</option>{i18n.tx(scoreOptions.map((match, i) => <option key={`${scoreKey(match)}-${i}`} value={scoreKey(match)}>{match.home_team} — {match.away_team}</option>))}</select></label>{i18n.tx(followed ? <FollowedScore match={followed} cached={scoresCached} /> : <p className="mt-4 text-sm leading-relaxed text-slate-500">{i18n.tx(scoreOptions.length ? "Le score sélectionné s’affichera ici." : "Les scores disponibles apparaîtront dans cette liste dès leur chargement.")}</p>)}<a href={`https://www.youtube.com/channel/${selected.channel_id}`} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-700">{i18n.t("Cha\xEEne du diffuseur")}<ExternalLink className="h-4 w-4" /></a></aside></div>
    </Card>)}
    <div className="mb-5 flex flex-wrap items-end gap-4"><label className="flex-1 min-w-[180px] text-sm font-semibold text-slate-600">{i18n.rich("Rechercher une diffusion{{v0}}", {
          v0: <input value={query} onChange={event => setQuery(event.target.value)} placeholder={i18n.t("Équipe, rencontre ou diffuseur…")} className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-slate-900" />
        })}</label><label className="min-w-[160px] text-sm font-semibold text-slate-600">{i18n.rich("Pays de visionnage{{v0}}", {
          v0: <select value={region} onChange={event => setRegion(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-slate-900">{i18n.tx(COUNTRIES.map(([code, name]) => <option key={code} value={code}>{i18n.tx(name)}</option>))}</select>
        })}</label></div>
    <div className="mb-6 flex flex-wrap gap-2" aria-label={i18n.t("Filtrer les diffusions par sport")}>{i18n.tx([["all", "Tous les sports"], ...Object.entries(SPORT_NAMES)].map(([code, name]) => <button key={code} type="button" aria-pressed={sport === code} onClick={() => setSport(code)} className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold ${sport === code ? "bg-orange-600 text-white" : "border border-neutral-200 bg-white text-slate-600"}`}>{i18n.tx(name)}</button>))}</div>
    {i18n.tx(loading ? <Card className="grid min-h-52 place-items-center rounded-3xl bg-white p-8" aria-busy="true"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-orange-600" /><p className="mt-3 text-base text-slate-500">{i18n.t("Chargement du programme vid\xE9o\u2026")}</p></div></Card> : filtered.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{i18n.tx(filtered.map(item => <Card key={item.video_id} className="flex flex-col overflow-hidden rounded-3xl border-neutral-200 bg-white shadow-sm"><div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-800 to-orange-800 p-6 text-white"><div aria-hidden="true" className="absolute -end-10 -top-14 h-48 w-48 rounded-full border-[25px] border-white/10" /><div className="relative flex items-center justify-between gap-3"><Badge className={item.status === "live" ? "bg-rose-600 text-white border-rose-500 text-sm" : "bg-white/10 text-white border-white/20 text-sm"}>{i18n.tx(item.status === "live" ? <><Radio className="me-1.5 h-3.5 w-3.5" />En direct</> : <><Clock className="me-1.5 h-3.5 w-3.5" />À venir</>)}</Badge><Tv className="h-7 w-7 text-orange-300" /></div><p className="relative mt-7 text-sm font-bold uppercase tracking-widest text-orange-200">{i18n.tx(SPORT_NAMES[item.sport] || "Sport")}</p><p className="relative mt-2 text-lg font-bold">{item.channel_title}</p></div><div className="flex flex-1 flex-col gap-4 p-6"><h3 className="text-xl font-extrabold leading-tight text-slate-900">{i18n.tx(item.title)}</h3><p className="text-sm text-slate-500">{i18n.tx(item.status === "upcoming" ? dateLabel(i18n, item.scheduled_start) : "Diffusion en cours selon le diffuseur")}</p><Button onClick={() => {
            setSelected(item);
            setFollowedId("");
          }} className="mt-auto min-h-12 w-full bg-orange-600 text-base text-white"><Play className="me-2 h-5 w-5" />{i18n.tx(item.status === "live" ? "Regarder le direct" : "Ouvrir le programme")}</Button><a href={item.watch_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-slate-600">{i18n.t("Voir sur YouTube")}<ExternalLink className="h-4 w-4" /></a></div></Card>))}</div> : <Card className="rounded-3xl bg-white p-8 sm:p-10 text-center"><Tv className="mx-auto h-12 w-12 text-orange-500" /><h3 className="mt-4 text-2xl font-extrabold text-slate-900">{i18n.tx(data?.status === "not_configured" ? "Les diffusions vidéo sont en préparation" : items.length ? "Aucune diffusion ne correspond à ces filtres" : "Aucune diffusion intégrable disponible actuellement")}</h3><p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">{i18n.tx(data?.status === "warming" ? "Le programme est en cours de préparation. Il s’actualisera automatiquement." : "Retrouve les scores ci-dessous et reviens consulter les prochaines diffusions proposées.")}</p>{i18n.tx(items.length > 0 && <Button variant="outline" className="mt-5 min-h-12" onClick={() => {
        setQuery("");
        setSport("all");
      }}>{i18n.t("Afficher toutes les diffusions")}</Button>)}</Card>)}
    <p className="mt-5 text-sm leading-relaxed text-slate-500">{i18n.t("Les vid\xE9os sont lues via YouTube. Leur disponibilit\xE9 d\xE9pend du pays et des conditions du diffuseur. Les directs disponibles ne couvrent pas n\xE9cessairement toutes les rencontres du tableau des scores.")}</p>
  </section>;
}
