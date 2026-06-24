import { useDataStatus, useScores, formatRelativeTime, forceFullRefresh } from "@/services/realtimeService";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const COUNTDOWN_SEC = 3 * 60; // matches the realtime polling

export function RealtimeBar({ onRefresh }) {
  const { status, connState, refresh: refreshStatus } = useDataStatus();
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? COUNTDOWN_SEC : c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleRefresh = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    try {
      await forceFullRefresh();
      await refreshStatus();
      if (onRefresh) await onRefresh();
      toast.success("Données actualisées");
      setCountdown(COUNTDOWN_SEC);
      setCooldown(30);
    } catch (e) {
      toast.error("Échec de l'actualisation");
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(countdown / 60)).padStart(1, "0");
  const ss = String(countdown % 60).padStart(2, "0");

  const dotCls = {
    green: "bg-emerald-500 shadow-emerald-400/50",
    amber: "bg-amber-500 shadow-amber-400/50",
    red: "bg-rose-500 shadow-rose-400/50",
  }[connState];

  const dotLabel = {
    green: "Données en direct",
    amber: "Actualisation en cours",
    red: "Données en cache",
  }[connState];

  return (
    <div className="flex items-center gap-3 flex-wrap" data-testid="realtime-bar">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-neutral-200 text-xs" title={dotLabel} data-testid="conn-indicator">
        <span className={cn("h-2 w-2 rounded-full live-dot", dotCls)} />
        <span className="font-semibold text-slate-700">{dotLabel}</span>
      </div>

      {status && (
        <div className="flex items-center gap-3 text-xs text-slate-600" data-testid="freshness-counters">
          {status.live_count > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-rose-600">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 live-dot" /> {status.live_count} LIVE
            </span>
          )}
          <span className="hidden sm:inline">📅 {status.upcoming_today} aujourd'hui</span>
          <span className="hidden md:inline">🎯 {status.total_matches} matchs</span>
        </div>
      )}

      <div className="flex items-center gap-1 text-xs text-slate-500 ml-auto" data-testid="next-refresh">
        <Activity className="h-3 w-3" />
        <span>Prochaine MAJ : <span className="font-mono font-bold text-slate-700">{mm}:{ss}</span></span>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={handleRefresh}
        disabled={busy || cooldown > 0}
        data-testid="manual-refresh-btn"
        className="h-7 px-3 text-xs"
      >
        <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", busy && "animate-spin")} />
        {busy ? "MAJ..." : cooldown > 0 ? `${cooldown}s` : "Actualiser"}
      </Button>
    </div>
  );
}

export function FreshnessStamp({ label, ts }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="text-[10px] text-slate-400 ml-2" data-testid={`freshness-${label}`}>
      {label} {formatRelativeTime(ts)}
    </span>
  );
}
