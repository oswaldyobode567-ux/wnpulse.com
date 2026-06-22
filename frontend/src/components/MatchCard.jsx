import { Link } from "react-router-dom";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Card } from "@/components/ui/card";
import dayjs from "dayjs";
import { ChevronRight } from "lucide-react";

function sportIcon(sportKey = "") {
  if (sportKey.includes("soccer")) return "⚽";
  if (sportKey.includes("basketball")) return "🏀";
  if (sportKey.includes("tennis")) return "🎾";
  if (sportKey.includes("football")) return "🏈";
  if (sportKey.includes("hockey")) return "🏒";
  if (sportKey.includes("mma")) return "🥊";
  return "🏆";
}

export default function MatchCard({ match }) {
  const p = match.prediction || {};
  const odds = p.implied_probs || {};
  const pickProb = odds[p.pick] || 0;

  return (
    <Link
      to={`/app/match/${match.id}`}
      data-testid={`match-card-${match.id}`}
      className="block group"
    >
      <Card className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
              <span className="text-base leading-none">{sportIcon(match.sport_key)}</span>
              <span className="font-medium">{match.sport_title}</span>
              <span>·</span>
              <span className="font-mono">{dayjs(match.commence_time).format("HH:mm")}</span>
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

        {p.pick && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">
                Pronostic
              </div>
              <div className="text-sm font-semibold text-slate-900 truncate">
                {p.pick} <span className="text-slate-400 font-normal text-xs">@ {p.pick_odds}</span>
              </div>
            </div>
            <ConfidenceBadge label={p.label} confidence={p.confidence} />
          </div>
        )}
      </Card>
    </Link>
  );
}
