/** Match catalogue refresh: retain every provider row and source status. */
import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export function normalizeMatchStatus(match) {
  const pred = match.prediction || {};
  const finished = Boolean(match.completed || match.is_finished || pred.is_finished);
  const live = !finished && Boolean(match.is_live || pred.is_live);
  const time = new Date(match.commence_time).getTime();
  const status = finished ? "finished" : live ? "live" : Number.isFinite(time) && time <= Date.now() ? "unconfirmed" : "upcoming";
  return { ...match, is_live: live, is_finished: finished, match_status: status,
    prediction: { ...pred, is_live: live, is_finished: finished } };
}

export function useRealtimeMatches(intervalMs = 3 * 60 * 1000) {
  const { user } = useAuth();
  const owner = `${user?.id || "anonymous"}|${user?.subscription_tier || user?.subscription || "free"}|${user?.subscription_expires_at || ""}|${Boolean(user?.is_admin)}`;
  const [state, setState] = useState({ owner: null, matches: [], lastUpdate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const flight = useRef(null), mounted = useRef(false), ownerRef = useRef(owner);
  ownerRef.current = owner;
  const fetchMatches = useCallback(async () => {
    if (flight.current) return flight.current.promise;
    const controller = new AbortController();
    const promise = (async () => {
      try {
        const { data } = await api.get("/matches", { signal: controller.signal, timeout: 20000 });
        if (!Array.isArray(data)) throw new Error("INVALID_MATCH_CATALOGUE");
        if (controller.signal.aborted || !mounted.current || ownerRef.current !== owner) return;
        const order = { live: 0, upcoming: 1, unconfirmed: 2, finished: 3 };
        const rows = data.map(normalizeMatchStatus).sort((a,b) => order[a.match_status]-order[b.match_status] || (new Date(a.commence_time).getTime()||0)-(new Date(b.commence_time).getTime()||0));
        setState({ owner, matches: rows, lastUpdate: Date.now() });
        setError(false);
      } catch (cause) {
        if (!controller.signal.aborted && mounted.current && ownerRef.current === owner) {
          setError(true);
          if ([401,403].includes(cause?.response?.status)) setState({owner,matches:[],lastUpdate:null});
        }
        if (!controller.signal.aborted) throw cause;
      } finally {
        if (flight.current?.controller === controller) flight.current = null;
        if (mounted.current && ownerRef.current === owner) setLoading(false);
      }
    })();
    flight.current = { controller, promise };
    return promise;
  }, [owner]);
  useEffect(() => {
    mounted.current = true;
    setState({owner,matches:[],lastUpdate:null}); setLoading(true); setError(false);
    fetchMatches().catch(()=>{});
    const refreshVisible = () => { if (!document.hidden) fetchMatches().catch(()=>{}); };
    const timer = window.setInterval(refreshVisible, Math.max(30000, intervalMs));
    window.addEventListener("focus", refreshVisible);
    return () => { mounted.current=false; flight.current?.controller.abort(); flight.current=null; window.clearInterval(timer); window.removeEventListener("focus",refreshVisible); };
  }, [fetchMatches, intervalMs, owner]);
  return { matches: state.owner === owner ? state.matches : [], loading, error,
    lastUpdate: state.owner === owner ? state.lastUpdate : null, refresh: fetchMatches };
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
