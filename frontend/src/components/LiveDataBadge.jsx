import { useEffect, useState } from "react";
import { Radio, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Badge that proves the data comes from the real Odds API (not demo/mock).
 * Fetches /data/source-audit which is a public endpoint returning per-sport counts.
 * Shows a tooltip with sample matches so users can verify.
 */
export default function LiveDataBadge({ compact = false }) {
  const [audit, setAudit] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/data/source-audit");
        if (alive) setAudit(data);
      } catch (e) {
        /* silent */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!audit) return null;

  const isLive = audit.data_source === "live";
  const isMixed = audit.data_source === "mixed";
  const cls = isLive
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : isMixed
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
          cls
        )}
        data-testid="live-data-badge"
      >
        <Radio className={cn("h-3 w-3", isLive && "animate-pulse")} />
        {isLive ? "Live · Odds API" : isMixed ? "Live + Démo" : "Démo"}
        {!compact && <span className="text-slate-600 font-normal normal-case tracking-normal">· {audit.total_matches} matchs</span>}
      </button>

      {open && (
        <div className="absolute z-50 top-8 right-0 w-80 rounded-xl bg-white border border-neutral-200 shadow-xl p-4 text-left" data-testid="live-data-tooltip">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className={cn("h-4 w-4", isLive ? "text-emerald-600" : "text-amber-600")} />
            <h3 className="font-heading font-bold text-slate-900 text-sm">
              {isLive ? "Données en direct" : isMixed ? "Données mixtes" : "Mode démo"}
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            {isLive
              ? `Tous les ${audit.real_matches} matchs affichés proviennent de The Odds API (bookmakers réels, dates réelles).`
              : `Sur ${audit.total_matches} matchs, ${audit.real_matches} sont réels et ${audit.mock_matches} sont des données de démonstration.`}
          </p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {audit.sports.slice(0, 8).map((s) => (
              <div key={s.sport_key} className="flex items-center justify-between text-[11px] p-1.5 rounded border border-neutral-100 bg-slate-50">
                <div className="min-w-0 flex-1 truncate">
                  <div className="font-semibold text-slate-900 truncate">{s.sport_title || s.sport_key}</div>
                  {s.sample_matches[0] && (
                    <div className="text-[10px] text-slate-500 truncate">
                      {s.sample_matches[0].home_team} vs {s.sample_matches[0].away_team}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <span className="text-slate-500">{s.count}</span>
                  {s.is_mock ? (
                    <span className="text-[9px] font-bold uppercase text-amber-700 bg-amber-100 px-1 rounded">démo</span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1 rounded">live</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400 mt-3 text-center">
            Audit vérifiable sur <code className="text-slate-600 bg-slate-100 px-1 rounded">/api/data/source-audit</code>
          </div>
        </div>
      )}
    </div>
  );
}
