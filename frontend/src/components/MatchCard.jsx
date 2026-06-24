import { Link } from "react-router-dom";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Card } from "@/components/ui/card";
import dayjs from "dayjs";
import { ChevronRight, Lock } from "lucide-react";

function sportIcon(sportKey = "") {
  if (sportKey.includes("soccer")) return "⚽";
  if (sportKey.includes("basketball")) return "🏀";
  if (sportKey.includes("tennis")) return "🎾";
  if (sportKey.includes("football")) return "🏈";
  if (sportKey.includes("hockey")) return "🏒";
  if (sportKey.includes("mma")) return "🥊";
  if (sportKey.includes("baseball")) return "⚾";
  if (sportKey.includes("rugby")) return "🏉";
  return "🏆";
}

export default function MatchCard({ match }) {
  const p = match.prediction || {};
  const locked = p.locked || !p.pick;
  const movement = p.odds_movement;
  const hasMovement = movement != null && Math.abs(movement) >= 0.01;
  const movementColor = movement > 0 ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-rose-600 bg-rose-50 border-rose-200";

  return (
    <Link
      to={`/app/match/${match.id}`}
      data-testid={`match-card-${match.id}`}
      className="block group"
    >
      <Card className="bg-white border border-neutral-200 rounded-xl p-4 hover:shadow-md hover:border-neutral-300 transition-all">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
              <span className="text-base leading-none">{sportIcon(match.sport_key)}</span>
              <span className="font-medium truncate">{match.sport_title}</span>
              <span>·</span>
              <span className="font-mono whitespace-nowrap">{dayjs(match.commence_time).format("DD/MM HH:mm")}</span>
            </div>
            <div className="font-heading font-bold text-base text-slate-900 leading-tight truncate">
              {match.home_team}
            </div>
            <div className="text-xs text-slate-400 my-0.5">vs</div>
            <div className="font-heading font-bold text-base text-slate-900 leading-tight truncate">
              {match.away_team}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-600 transition-colors flex-shrink-0 mt-1" />
        </div>

        <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
          {locked ? (
            <>
              <div className="min-w-0 flex items-center gap-2 text-slate-500">
                <Lock className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-orange-600 font-bold mb-0.5">Pronostic verrouillé</div>
                  <div className="text-xs text-slate-500 truncate">Passe Pro pour débloquer</div>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border border-orange-200 bg-orange-50 text-orange-700">PRO</span>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Pronostic</div>
                <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1.5">
                  <span>{p.pick}</span>
                  <span className="text-slate-400 font-normal text-xs">@ {p.pick_odds}</span>
                  {hasMovement && Math.abs(movement) >= 0.10 && (
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-bold border ${movementColor}`} title={`${p.previous_odds} → ${p.pick_odds}`} data-testid="odds-movement">
                      {movement > 0 ? "▲" : "▼"}{Math.abs(movement).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <ConfidenceBadge label={p.label} confidence={p.confidence} />
            </>
          )}
        </div>
      </Card>
    </Link>
  );
}
