import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Radio, Lock, Send, Clock, CheckCircle2, XCircle } from "lucide-react";
import dayjs from "dayjs";

function ConfidenceBar({ value }) {
  const color = value >= 82 ? "bg-green-500" : value >= 75 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div className={`${color} h-full rounded-full transition-all duration-700`} style={{ width: `${Math.min(value,100)}%` }} />
    </div>
  );
}

function RiskBadge({ label }) {
  if (label==="safe")  return <span className="text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 rounded-full px-1.5 py-0.5">🟢 SÛR</span>;
  if (label==="value") return <span className="text-[10px] font-bold text-orange-700 bg-orange-100 border border-orange-200 rounded-full px-1.5 py-0.5">🟡 MODÉRÉ</span>;
  return <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 rounded-full px-1.5 py-0.5">🔴 RISQUÉ</span>;
}

export default function MatchCard({ match, isAdmin, onShareWA, isFree, onUpgrade }) {
  const pred       = match.prediction || {};
  const isLive     = pred.is_live     || match.is_live     || false;
  const isFinished = pred.is_finished || match.is_finished || false;
  const locked     = pred.locked || (!pred.pick && isFree);

  const now     = new Date();
  const ct      = new Date(match.commence_time);
  const elapsed = (now - ct) / 1000 / 60;
  const matchStatus = elapsed < 0 ? "upcoming" : elapsed <= 240 ? "live" : "finished";

  const borderClass = isLive
    ? "border-rose-300 ring-1 ring-rose-200"
    : isFinished ? "border-slate-200" : "border-orange-200/60";

  const handleShare = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (onShareWA) onShareWA({ ...pred, ...match, sport_title: match.sport_title }, e);
  };

  return (
    <Link to={`/app/match/${match.id}`}>
      <Card className={`relative border p-4 hover:shadow-md transition-all h-full cursor-pointer bg-white ${borderClass}`}>

        {/* LIVE / TERMINÉ badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black uppercase animate-pulse">
              <Radio className="h-2.5 w-2.5" /> LIVE
            </span>
          )}
          {isFinished && !isLive && (
            <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-bold border border-slate-200">
              TERMINÉ
            </span>
          )}
        </div>

        {/* Risk badge */}
        <div className="absolute top-3 right-3">
          {locked
            ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 text-[10px] font-bold"><Lock className="h-2.5 w-2.5"/>PRO</span>
            : pred.label ? <RiskBadge label={pred.label} /> : null}
        </div>

        <div className="mt-5 space-y-3">

          {/* Sport + heure */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <span className="truncate max-w-[60%]">{match.sport_title}</span>
            <span className="font-mono">{dayjs(match.commence_time).format("DD/MM HH:mm")}</span>
          </div>

          {/* Teams */}
          <div>
            <div className="font-heading font-bold text-sm text-slate-900 truncate">{match.home_team}</div>
            <div className="text-[11px] text-slate-400 my-0.5">vs</div>
            <div className="font-heading font-bold text-sm text-slate-900 truncate">{match.away_team}</div>
          </div>

          {/* Score live/terminé */}
          {(isLive||isFinished) && pred.score_home!=null && pred.score_away!=null && (
            <div className="bg-slate-50 rounded-lg px-3 py-1.5 text-center border border-slate-200">
              <span className="font-mono font-bold text-lg text-slate-800">{pred.score_home} - {pred.score_away}</span>
              {isLive && <span className="ml-2 text-[10px] text-rose-500 font-bold animate-pulse">EN DIRECT</span>}
            </div>
          )}

          {/* Pick */}
          {locked ? (
            <div
              className="bg-orange-50 border border-dashed border-orange-200 rounded-lg p-3 cursor-pointer"
              onClick={e => { e.preventDefault(); if (onUpgrade) onUpgrade(); }}
            >
              <div className="text-[10px] uppercase text-orange-600 font-bold mb-0.5">Pick verrouillé</div>
              <div className="text-xs text-slate-500">Passe Pro pour voir l'analyse →</div>
            </div>
          ) : pred.pick ? (
            <div className="space-y-2">
              {pred.market_label && (
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{pred.market_label}</div>
              )}
              <div className="flex items-end justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-orange-600 truncate">{pred.pick}</div>
                  {pred.best_bookmaker && (
                    <div className="text-[10px] text-slate-400">💰 chez <span className="font-semibold text-slate-600">{pred.best_bookmaker}</span></div>
                  )}
                </div>
                <div className="text-right ml-2 flex-shrink-0">
                  <div className="font-mono text-xl font-black text-slate-900">{pred.pick_odds}</div>
                </div>
              </div>

              {pred.confidence!=null && (
                <div className="space-y-1">
                  <ConfidenceBar value={pred.confidence} />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Confiance IA</span>
                    <span className="font-bold text-slate-600">{Math.round(pred.confidence)}%</span>
                  </div>
                </div>
              )}

              {pred.edge!=null && pred.edge>0 && (
                <div className="text-[10px] text-emerald-600 font-semibold">+{pred.edge.toFixed(1)}% d'avantage sur le bookmaker</div>
              )}

              {isFinished && (
                <div className={`flex items-center gap-1.5 text-xs font-bold rounded-lg px-2 py-1 ${
                  pred.won===true  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                  pred.won===false ? "bg-rose-50 text-rose-700 border border-rose-200" :
                  "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                  {pred.won===true  && <><CheckCircle2 className="h-3.5 w-3.5"/>GAGNÉ</>}
                  {pred.won===false && <><XCircle className="h-3.5 w-3.5"/>PERDU</>}
                  {pred.won==null   && <><Clock className="h-3.5 w-3.5"/>En attente</>}
                </div>
              )}

              {pred.markets && pred.markets.length>1 && (
                <div className="text-[10px] text-slate-400 italic">
                  + {pred.markets.length-1} autre{pred.markets.length>2?"s":""} marché{pred.markets.length>2?"s":""} analysé{pred.markets.length>2?"s":""}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic py-2">Analyse en cours...</div>
          )}
        </div>

        {/* WhatsApp admin uniquement */}
        {isAdmin && pred.pick && !locked && (
          <button
            onClick={handleShare}
            className="absolute bottom-3 right-3 h-7 w-7 rounded-full bg-[#25D366] hover:bg-[#1ebe5c] text-white grid place-items-center shadow-sm transition-colors"
            title="Partager WhatsApp (Admin)"
          >
            <Send className="h-3 w-3" />
          </button>
        )}
      </Card>
    </Link>
  );
}
