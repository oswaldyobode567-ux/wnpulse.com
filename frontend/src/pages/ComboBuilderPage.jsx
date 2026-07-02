import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Trash2, Save, Send, Trophy, Loader2, X, TrendingUp, BarChart3, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import dayjs from "dayjs";
import LiveDataBadge from "@/components/LiveDataBadge";

const SPORT_TABS = [
  { key: "all", label: "Tous" },
  { key: "soccer", label: "Football" },
  { key: "basketball", label: "Basketball" },
  { key: "tennis", label: "Tennis" },
  { key: "americanfootball", label: "NFL" },
  { key: "icehockey", label: "NHL" },
  { key: "mma", label: "MMA" },
];

const LABEL_COLORS = {
  safe: "bg-emerald-100 text-emerald-700 border-emerald-200",
  value: "bg-amber-100 text-amber-800 border-amber-200",
  risky: "bg-rose-100 text-rose-700 border-rose-200",
};

export default function ComboBuilderPage() {
  const { user } = useAuth();
  const isFree = (user?.subscription_tier || "free") === "free";
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState("all");
  const [selectedPicks, setSelectedPicks] = useState([]);
  const [comboName, setComboName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCombos, setSavedCombos] = useState([]);
  const [expandedMatchId, setExpandedMatchId] = useState(null);
  const [matchStats, setMatchStats] = useState({});

  const loadMatches = async (sk) => {
    setLoading(true);
    try {
      const url = sk && sk !== "all" ? `/builder/matches?sport=${sk}` : "/builder/matches";
      const { data } = await api.get(url);
      setMatches(data.matches || []);
    } catch (e) {
      toast.error("Impossible de charger les matchs");
    } finally {
      setLoading(false);
    }
  };

  const loadSaved = async () => {
    try {
      const { data } = await api.get("/builder/my-combos");
      setSavedCombos(data.combos || []);
    } catch (e) {
      /* silent */
    }
  };

  useEffect(() => {
    loadMatches(sport);
  }, [sport]);
  useEffect(() => {
    loadSaved();
  }, []);

  const toggleExpand = async (mid) => {
    if (expandedMatchId === mid) {
      setExpandedMatchId(null);
      return;
    }
    setExpandedMatchId(mid);
    if (!matchStats[mid]) {
      try {
        const { data } = await api.get(`/builder/stats/${mid}`);
        setMatchStats((prev) => ({ ...prev, [mid]: data }));
      } catch (e) {
        /* silent */
      }
    }
  };

  const togglePick = (match, pick) => {
    if (pick.locked || pick.pick_odds == null) {
      toast.info("Cette option est réservée aux abonnés Pro / Elite");
      return;
    }
    const key = `${match.match_id}:${pick.market}:${pick.pick}`;
    const already = selectedPicks.find((p) => p._key === key);
    if (already) {
      setSelectedPicks((prev) => prev.filter((p) => p._key !== key));
      return;
    }
    // Only one pick per match to build valid combos
    const withoutSameMatch = selectedPicks.filter((p) => p.match_id !== match.match_id);
    if (withoutSameMatch.length !== selectedPicks.length) {
      toast.info(`Pick remplacé sur ${match.home_team} vs ${match.away_team}`);
    }
    setSelectedPicks([
      ...withoutSameMatch,
      {
        _key: key,
        match_id: match.match_id,
        home_team: match.home_team,
        away_team: match.away_team,
        sport_title: match.sport_title,
        commence_time: match.commence_time,
        pick: pick.pick,
        pick_odds: pick.pick_odds,
        confidence: pick.confidence,
        market: pick.market,
        market_label: pick.market_label,
      },
    ]);
  };

  const totalOdds = useMemo(() => selectedPicks.reduce((acc, p) => acc * (p.pick_odds || 1), 1), [selectedPicks]);
  const avgConf = useMemo(() => {
    if (!selectedPicks.length) return 0;
    return selectedPicks.reduce((acc, p) => acc + (p.confidence || 0), 0) / selectedPicks.length;
  }, [selectedPicks]);
  const combinedProb = useMemo(() => {
    return selectedPicks.reduce((acc, p) => acc * ((p.confidence || 0) / 100), 1) * 100;
  }, [selectedPicks]);

  const kellyStake = useMemo(() => {
    if (!selectedPicks.length) return 0;
    const p = combinedProb / 100;
    const b = totalOdds - 1;
    if (b <= 0) return 0;
    const k = Math.max(0, (p * b - (1 - p)) / b);
    return Math.round(k * 100 * 0.25); // Quarter-Kelly, % of bankroll
  }, [combinedProb, totalOdds, selectedPicks]);

  const saveCombo = async () => {
    if (!selectedPicks.length) return;
    if (isFree && selectedPicks.length >= 2) {
      toast.warning("Passe Pro pour créer des combos illimités");
      return;
    }
    setSaving(true);
    try {
      const legs = selectedPicks.map(({ _key, ...rest }) => rest);
      const { data } = await api.post("/builder/save", { name: comboName, legs });
      toast.success(`Combo enregistré · cote ${data.total_odds}`);
      setComboName("");
      loadSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const shareWhatsApp = () => {
    if (!selectedPicks.length) return;
    const lines = [
      `🎯 *Mon combiné WinPulse*`,
      `_Cote totale : ${totalOdds.toFixed(2)}_`,
      "",
    ];
    selectedPicks.forEach((p, i) => {
      lines.push(`${i + 1}. *${p.home_team} vs ${p.away_team}*\n   👉 ${p.pick} @ ${p.pick_odds}`);
    });
    lines.push("", `Confiance IA moyenne : ${avgConf.toFixed(0)}%`, "", "Généré sur https://wnpulse.com");
    const text = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const deleteSaved = async (id) => {
    try {
      await api.delete(`/builder/my-combos/${id}`);
      toast.success("Combo supprimé");
      loadSaved();
    } catch (e) {
      toast.error("Suppression échouée");
    }
  };

  const clearAll = () => setSelectedPicks([]);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 grid place-items-center shadow-md shadow-orange-500/30">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">Combo Builder</h1>
            <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] ml-1">Nouveau</Badge>
            <div className="ml-auto"><LiveDataBadge /></div>
          </div>
          <p className="text-sm text-slate-600 max-w-2xl">
            Construis ton propre combiné à partir de <strong>40+ marchés analysés par notre IA</strong> (vainqueur, double chance, BTTS, over/under, handicaps, mi-temps…). Style FootyStats.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr,340px] gap-6">
          {/* Left column — matches list */}
          <div>
            <Tabs value={sport} onValueChange={setSport} className="mb-4">
              <TabsList className="bg-white border border-neutral-200 flex-wrap h-auto p-1" data-testid="builder-sport-tabs">
                {SPORT_TABS.map((s) => (
                  <TabsTrigger key={s.key} value={s.key} data-testid={`builder-tab-${s.key}`}>
                    {s.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {loading ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
              </div>
            ) : matches.length === 0 ? (
              <Card className="p-8 bg-white border-neutral-200 text-center text-slate-500">
                Aucun match disponible pour le moment. Reviens dans 1h.
              </Card>
            ) : (
              <div className="space-y-3">
                {matches.map((m) => (
                  <MatchCard
                    key={m.match_id}
                    match={m}
                    expanded={expandedMatchId === m.match_id}
                    onToggle={() => toggleExpand(m.match_id)}
                    onPickToggle={togglePick}
                    selectedKeys={selectedPicks.map((p) => p._key)}
                    stats={matchStats[m.match_id]}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right column — sticky combo builder */}
          <div className="lg:sticky lg:top-4 h-fit">
            <Card className="bg-white border-2 border-orange-200 shadow-lg shadow-orange-500/10 p-4" data-testid="builder-panel">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-orange-500" />
                  <h2 className="font-heading font-extrabold text-slate-900 text-sm">Mon combiné</h2>
                </div>
                {selectedPicks.length > 0 && (
                  <button onClick={clearAll} className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1" data-testid="builder-clear-btn">
                    <X className="h-3 w-3" /> vider
                  </button>
                )}
              </div>

              {selectedPicks.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-4xl opacity-30 mb-2">🎯</div>
                  <p className="text-xs text-slate-500">Sélectionne des picks à gauche pour construire ton combiné.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-4 p-2 rounded-lg bg-orange-50 border border-orange-100">
                    <StatBox label="Cote" value={totalOdds.toFixed(2)} accent="orange" data-testid="builder-total-odds" />
                    <StatBox label="Conf." value={`${avgConf.toFixed(0)}%`} accent="emerald" />
                    <StatBox label="Kelly" value={`${kellyStake}%`} accent="rose" hint="% de bankroll" />
                  </div>

                  <div className="space-y-2 max-h-[280px] overflow-y-auto mb-3" data-testid="builder-legs-list">
                    {selectedPicks.map((p, i) => (
                      <div key={p._key} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-neutral-200 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 truncate">{p.home_team} vs {p.away_team}</div>
                          <div className="text-slate-500 truncate">{p.market_label} · <strong className="text-orange-600">{p.pick}</strong> @ {p.pick_odds}</div>
                        </div>
                        <button onClick={() => togglePick({ match_id: p.match_id }, { market: p.market, pick: p.pick, pick_odds: p.pick_odds })} className="text-slate-400 hover:text-rose-600" data-testid={`builder-remove-${i}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <Input
                    placeholder="Nom du combo (optionnel)"
                    value={comboName}
                    onChange={(e) => setComboName(e.target.value)}
                    className="mb-2 text-sm h-9"
                    data-testid="builder-name-input"
                  />
                  <div className="flex gap-2">
                    <Button onClick={saveCombo} disabled={saving || !selectedPicks.length} className="flex-1 wp-gradient-warm text-white border-0 h-9 text-xs" data-testid="builder-save-btn">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" /> Enregistrer</>}
                    </Button>
                    <Button onClick={shareWhatsApp} variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-9 text-xs" data-testid="builder-whatsapp-btn">
                      <Send className="h-3.5 w-3.5 mr-1" /> WhatsApp
                    </Button>
                  </div>
                </>
              )}

              {isFree && (
                <div className="mt-4 p-3 rounded-lg bg-gradient-to-br from-orange-50 to-rose-50 border border-orange-200 text-xs">
                  <div className="font-bold text-slate-900 mb-1 flex items-center gap-1"><Lock className="h-3 w-3" /> Compte Free</div>
                  <p className="text-slate-600 leading-relaxed">Tu vois le meilleur pick par match. Passe Pro pour débloquer les <strong>40+ options par match</strong> (double chance, BTTS, over/under, mi-temps…).</p>
                </div>
              )}
            </Card>

            {/* Saved combos */}
            {savedCombos.length > 0 && (
              <Card className="mt-4 bg-white border-neutral-200 p-4" data-testid="builder-saved-list">
                <h3 className="font-heading font-bold text-slate-900 text-sm mb-3">Mes combinés enregistrés</h3>
                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                  {savedCombos.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-neutral-200 bg-slate-50 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                        <div className="text-slate-500">Cote {c.total_odds} · {c.num_legs} picks · {dayjs(c.created_at).format("DD/MM HH:mm")}</div>
                      </div>
                      <button onClick={() => deleteSaved(c.id)} className="text-slate-400 hover:text-rose-600" data-testid={`saved-delete-${c.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ----------- Sub-components -----------

function MatchCard({ match, expanded, onToggle, onPickToggle, selectedKeys, stats }) {
  const dt = dayjs(match.commence_time);
  const primaryPick = match.picks?.[0];
  return (
    <Card className="bg-white border-neutral-200 overflow-hidden" data-testid={`builder-match-${match.match_id}`}>
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-bold">
            <span>{match.sport_title || "—"}</span>
            <span>·</span>
            <span>{dt.format("DD/MM · HH:mm")}</span>
          </div>
          <div className="font-heading font-bold text-slate-900 truncate">{match.home_team} <span className="text-slate-400">vs</span> {match.away_team}</div>
          {primaryPick && primaryPick.pick_odds != null && (
            <div className="text-xs text-slate-600 mt-1">
              💡 Meilleur pick IA : <strong className="text-orange-600">{primaryPick.pick}</strong> @ {primaryPick.pick_odds}
              <Badge className={cn("ml-2 text-[9px]", LABEL_COLORS[primaryPick.label] || LABEL_COLORS.value)}>
                {primaryPick.confidence?.toFixed(0)}%
              </Badge>
            </div>
          )}
        </div>
        <div className="text-xs text-slate-500 shrink-0">
          {match.picks?.length || 0} <span className="text-[10px] uppercase">options</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 bg-slate-50/60 p-4 space-y-3">
          {/* Stats block */}
          {stats && stats.probs && (
            <div className="p-3 rounded-lg bg-white border border-neutral-200">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Analyse IA</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-lg font-heading font-extrabold text-slate-900">{stats.probs.home_win}%</div><div className="text-[10px] text-slate-500">Domicile</div></div>
                <div><div className="text-lg font-heading font-extrabold text-slate-500">{stats.probs.draw}%</div><div className="text-[10px] text-slate-500">Nul</div></div>
                <div><div className="text-lg font-heading font-extrabold text-slate-900">{stats.probs.away_win}%</div><div className="text-[10px] text-slate-500">Extérieur</div></div>
              </div>
              {stats.expectations && (
                <div className="mt-3 pt-3 border-t border-neutral-100 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-slate-500">BTTS :</span> <strong>{stats.expectations.btts_yes_pct}%</strong></div>
                  <div className="flex justify-between"><span className="text-slate-500">+ 2.5 :</span> <strong>{stats.expectations.over_2_5_pct}%</strong></div>
                  <div className="flex justify-between"><span className="text-slate-500">+ 1.5 :</span> <strong>{stats.expectations.over_1_5_pct}%</strong></div>
                  <div className="flex justify-between"><span className="text-slate-500">CS dom. :</span> <strong>{stats.expectations.clean_sheet_home_pct}%</strong></div>
                  <div className="flex justify-between"><span className="text-slate-500">CS ext. :</span> <strong>{stats.expectations.clean_sheet_away_pct}%</strong></div>
                </div>
              )}
            </div>
          )}

          {/* Pick options grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(match.picks || []).map((p, i) => {
              const key = `${match.match_id}:${p.market}:${p.pick}`;
              const isSelected = selectedKeys.includes(key);
              const isLocked = p.locked || p.pick_odds == null;
              return (
                <button
                  key={i}
                  onClick={() => onPickToggle(match, p)}
                  disabled={isLocked}
                  className={cn(
                    "text-left p-2.5 rounded-lg border transition-all text-xs",
                    isSelected
                      ? "border-orange-500 bg-orange-50 ring-2 ring-orange-500/20"
                      : isLocked
                      ? "border-neutral-200 bg-neutral-50 opacity-60 cursor-not-allowed"
                      : "border-neutral-200 bg-white hover:border-orange-300 hover:bg-orange-50/40"
                  )}
                  data-testid={`builder-pick-${match.match_id}-${p.market}-${i}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">{p.market_label}</div>
                    {p.synthetic && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[8px]">IA</Badge>}
                    {isLocked && <Lock className="h-3 w-3 text-slate-400" />}
                  </div>
                  <div className="font-semibold text-slate-900 truncate">{p.pick}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-orange-600 font-mono font-bold">
                      {isLocked ? "🔒" : `@ ${p.pick_odds}`}
                    </span>
                    {p.confidence != null && (
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", LABEL_COLORS[p.label] || LABEL_COLORS.value)}>
                        {p.confidence.toFixed(0)}%
                      </span>
                    )}
                    {p.edge > 5 && (
                      <span className="text-[9px] text-emerald-700 font-bold flex items-center gap-0.5">
                        <TrendingUp className="h-2.5 w-2.5" /> +{p.edge.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function StatBox({ label, value, accent = "orange", hint }) {
  const cls = {
    orange: "text-orange-700",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
  }[accent];
  return (
    <div className="text-center">
      <div className={cn("font-heading font-extrabold text-lg leading-none", cls)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1">{label}</div>
      {hint && <div className="text-[9px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}
