/**
 * Realtime data service for WinPulse.
 * - Polls /api/data/status every 60s for freshness counters
 * - Polls /api/matches every 3 min for odds refresh
 * - Polls /api/scores every 60s for live scores
 * - Caches in localStorage with TTL
 * - Exposes hooks for components
 */
import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";

const TTL = {
  status: 60 * 1000,
  matches: 3 * 60 * 1000,
  scores: 60 * 1000,
};

const CACHE_PREFIX = "wp_rt_";

function setCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) { /* quota */ }
}

function getCache(key, ttl) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    return { data, age: Date.now() - ts };
  } catch (e) { return null; }
}

export function useDataStatus(intervalMs = 60000) {
  const [status, setStatus] = useState(() => getCache("status", TTL.status)?.data || null);
  const [connState, setConnState] = useState("green"); // green / amber / red
  const timerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/data/status");
      setStatus(data);
      setCache("status", data);
      // Compute connection state from updated_at
      const updated = data.odds_updated_at ? new Date(data.odds_updated_at) : null;
      if (!updated) { setConnState("amber"); return; }
      const ageMs = Date.now() - updated.getTime();
      if (ageMs < 5 * 60 * 1000) setConnState("green");
      else if (ageMs < 15 * 60 * 1000) setConnState("amber");
      else setConnState("red");
    } catch (e) {
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

export function useRealtimeMatches(intervalMs = 3 * 60 * 1000) {
  const cached = getCache("matches", TTL.matches);
  const [matches, setMatches] = useState(cached?.data || []);
  const [loading, setLoading] = useState(!cached);
  const [lastUpdate, setLastUpdate] = useState(cached ? Date.now() - cached.age : null);
  const prevOddsRef = useRef(new Map());
  const timerRef = useRef(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get("/matches");
      // Build odds delta map: matchId → {prevOdds, newOdds}
      const newMap = new Map();
      const enriched = data.map((m) => {
        const p = m.prediction || {};
        const prev = prevOddsRef.current.get(m.id);
        let movement = 0;
        if (prev != null && p.pick_odds != null && prev !== p.pick_odds) {
          movement = p.pick_odds - prev;
        }
        if (p.pick_odds != null) newMap.set(m.id, p.pick_odds);
        return { ...m, prediction: { ...p, odds_movement: movement, previous_odds: prev } };
      });
      prevOddsRef.current = newMap;
      setMatches(enriched);
      setCache("matches", enriched);
      setLastUpdate(Date.now());
    } catch (e) { /* keep cached */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [fetch, intervalMs]);

  return { matches, loading, lastUpdate, refresh: fetch };
}

export function useScores(intervalMs = 60 * 1000) {
  const cached = getCache("scores", TTL.scores);
  const [scores, setScores] = useState(cached?.data || []);
  const [lastUpdate, setLastUpdate] = useState(cached ? Date.now() - cached.age : null);
  const timerRef = useRef(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get("/scores");
      setScores(data);
      setCache("scores", data);
      setLastUpdate(Date.now());
    } catch (e) { /* keep */ }
  }, []);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [fetch, intervalMs]);

  return { scores, lastUpdate, refresh: fetch };
}

export function formatRelativeTime(ts) {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - (typeof ts === "string" ? new Date(ts).getTime() : ts)) / 1000);
  if (sec < 30) return "à l'instant";
  if (sec < 60) return `il y a ${sec}s`;
  if (sec < 3600) return `il y a ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `il y a ${Math.floor(sec / 3600)}h`;
  return `il y a ${Math.floor(sec / 86400)}j`;
}

export function forceFullRefresh() {
  return api.post("/data/refresh");
}
