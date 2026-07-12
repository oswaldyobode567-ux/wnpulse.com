/**
 * Realtime data service for WinPulse.
 * CORRECTIONS :
 * - Les matchs LIVE et TERMINÉS ne sont plus filtrés — tous les statuts sont retournés
 * - Tri : LIVE en premier, puis À venir, puis Terminés
 * - Baseball ajouté dans la liste des sports suivis
 */
import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";

const TTL = {
  status:  60 * 1000,
  matches: 3 * 60 * 1000,
  scores:  60 * 1000,
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

/**
 * Détermine le statut d'un match en fonction de commence_time.
 * On considère "live" si le match a commencé il y a moins de 4h.
 * On considère "finished" si le match a commencé il y a plus de 4h.
 */
function computeMatchStatus(commenceTime) {
  if (!commenceTime) return "upcoming";
  try {
    const dt  = new Date(commenceTime);
    const now = Date.now();
    const diff = now - dt.getTime();
    if (diff < 0)                 return "upcoming";   // pas encore commencé
    if (diff < 4 * 60 * 60 * 1000) return "live";      // en cours (≤ 4h)
    return "finished";                                  // terminé
  } catch (e) {
    return "upcoming";
  }
}

export function useDataStatus(intervalMs = 60000) {
  const [status, setStatus] = useState(() => getCache("status", TTL.status)?.data || null);
  const [connState, setConnState] = useState("green");
  const timerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/data/status");
      setStatus(data);
      setCache("status", data);
      const updated = data.odds_updated_at ? new Date(data.odds_updated_at) : null;
      if (!updated) { setConnState("amber"); return; }
      const ageMs = Date.now() - updated.getTime();
      if (ageMs < 5 * 60 * 1000)  setConnState("green");
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

      const newMap = new Map();
      const enriched = data.map((m) => {
        const p = m.prediction || {};

        // ── Calcul statut match ──────────────────────────────────────────
        const status   = computeMatchStatus(m.commence_time);
        const is_live  = status === "live";
        const finished = status === "finished";

        // ── Mouvement des cotes ──────────────────────────────────────────
        const prev = prevOddsRef.current.get(m.id);
        let movement = 0;
        if (prev != null && p.pick_odds != null && prev !== p.pick_odds) {
          movement = p.pick_odds - prev;
        }
        if (p.pick_odds != null) newMap.set(m.id, p.pick_odds);

        return {
          ...m,
          // Statut calculé côté client (complète is_live du backend)
          is_live:  is_live  || p.is_live  || false,
          finished: finished || p.finished || false,
          match_status: status,
          prediction: {
            ...p,
            is_live:     is_live || p.is_live || false,
            odds_movement:   movement,
            previous_odds:   prev,
          },
        };
      });

      prevOddsRef.current = newMap;

      // ── Tri : LIVE → À venir → Terminés ─────────────────────────────
      const sorted = [...enriched].sort((a, b) => {
        const order = { live: 0, upcoming: 1, finished: 2 };
        const ao = order[a.match_status] ?? 1;
        const bo = order[b.match_status] ?? 1;
        if (ao !== bo) return ao - bo;
        return new Date(a.commence_time) - new Date(b.commence_time);
      });

      setMatches(sorted);
      setCache("matches", sorted);
      setLastUpdate(Date.now());
    } catch (e) {
      // keep cached
    } finally {
      setLoading(false);
    }
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
  if (sec < 30)    return "à l'instant";
  if (sec < 60)    return `il y a ${sec}s`;
  if (sec < 3600)  return `il y a ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `il y a ${Math.floor(sec / 3600)}h`;
  return `il y a ${Math.floor(sec / 86400)}j`;
}

export function forceFullRefresh() {
  return api.post("/data/refresh");
}
