/**
 * WinPulse Realtime Service v7.1
 * CORRECTIONS :
 * - Matchs LIVE toujours visibles (ne disparaissent plus jamais)
 * - Matchs terminés visibles 24h avec score final
 * - Tri : LIVE → À venir → Terminés
 * - Cache local 5 minutes (évite les appels inutiles)
 * - Statut calculé côté client pour fiabilité maximale
 */
import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function computeStatus(commenceTime) {
  if (!commenceTime) return "upcoming";
  try {
    const ct  = new Date(commenceTime);
    const now = Date.now();
    const diff = now - ct.getTime();
    if (diff < 0)                   return "upcoming";
    if (diff < 4 * 60 * 60 * 1000) return "live";
    return "finished";
  } catch {
    return "upcoming";
  }
}

const STATUS_ORDER = { live: 0, upcoming: 1, finished: 2 };

export function useRealtimeMatches(intervalMs = 3 * 60 * 1000) {
  const [matches,    setMatches]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const cacheRef = useRef({ data: null, ts: 0 });
  const timerRef = useRef(null);

  const fetchMatches = useCallback(async () => {
    try {
      const { data } = await api.get("/matches");

      // Enrichir chaque match avec le statut calculé côté client
      const enriched = (data || []).map(m => {
        const status     = computeStatus(m.commence_time);
        const is_live     = status === "live";
        const is_finished = status === "finished";
        return {
          ...m,
          is_live,
          is_finished,
          match_status: status,
          prediction: {
            ...(m.prediction || {}),
            is_live,
            is_finished,
          },
        };
      });

      // Tri : LIVE → À venir → Terminés
      enriched.sort((a, b) => {
        const oa = STATUS_ORDER[a.match_status] ?? 1;
        const ob = STATUS_ORDER[b.match_status] ?? 1;
        if (oa !== ob) return oa - ob;
        return new Date(a.commence_time) - new Date(b.commence_time);
      });

      // Mise à jour cache + état
      cacheRef.current = { data: enriched, ts: Date.now() };
      setMatches(enriched);
      setLastUpdate(Date.now());
    } catch (err) {
      // En cas d'erreur réseau → garder le cache existant
      if (cacheRef.current.data) {
        setMatches(cacheRef.current.data);
      }
      console.warn("realtimeService fetch error:", err?.message || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Si cache valide → utiliser immédiatement sans attendre
    if (
      cacheRef.current.data &&
      Date.now() - cacheRef.current.ts < CACHE_TTL_MS
    ) {
      setMatches(cacheRef.current.data);
      setLoading(false);
    } else {
      fetchMatches();
    }

    // Refresh automatique toutes les 3 minutes
    timerRef.current = setInterval(fetchMatches, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [fetchMatches, intervalMs]);

  return {
    matches,
    loading,
    lastUpdate,
    refresh: fetchMatches,
  };
}

export function useDataStatus(intervalMs = 60000) {
  const [status,    setStatus]    = useState(null);
  const [connState, setConnState] = useState("green");
  const timerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/data/status");
      setStatus(data);

      const updated = data.odds_updated_at ? new Date(data.odds_updated_at) : null;
      if (!updated) {
        setConnState("amber");
        return;
      }
      const ageMs = Date.now() - updated.getTime();
      if (ageMs < 5 * 60 * 1000)        setConnState("green");
      else if (ageMs < 15 * 60 * 1000)  setConnState("amber");
      else                               setConnState("red");
    } catch {
      setConnState("red");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [fetchStatus, intervalMs]);

  return { status, connState, refresh: fetchStatus };
}

export function useScores(intervalMs = 60000) {
  const [scores,     setScores]     = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);

  const fetchScores = useCallback(async () => {
    try {
      const { data } = await api.get("/scores");
      setScores(data || []);
      setLastUpdate(Date.now());
    } catch {
      // garder les scores existants
    }
  }, []);

  useEffect(() => {
    fetchScores();
    timerRef.current = setInterval(fetchScores, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [fetchScores, intervalMs]);

  return { scores, lastUpdate, refresh: fetchScores };
}

export function formatRelativeTime(ts) {
  if (!ts) return "—";
  const sec = Math.floor(
    (Date.now() - (typeof ts === "string" ? new Date(ts).getTime() : ts)) / 1000
  );
  if (sec < 30)    return "à l'instant";
  if (sec < 60)    return `il y a ${sec}s`;
  if (sec < 3600)  return `il y a ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `il y a ${Math.floor(sec / 3600)}h`;
  return `il y a ${Math.floor(sec / 86400)}j`;
}

export function forceFullRefresh() {
  return api.post("/data/refresh");
}
