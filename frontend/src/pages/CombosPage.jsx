import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Link } from "react-router-dom";
import { Shield, Scale, Rocket, RefreshCw, TrendingUp, Lock } from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import SocialProofToast from "@/components/SocialProofToast";

const TIERS = [
  {
    key: "safe",
    label: "Sécurité",
    icon: Shield,
    accent: "emerald",
    description: "Le combiné le plus probable. 3 picks à haute confiance, sports diversifiés.",
    mise: 1000,
  },
  {
    key: "balanced",
    label: "Équilibre",
    icon: Scale,
    accent: "orange",
    description: "Le meilleur rapport risque/gain. 4 picks confiance + value edge.",
    mise: 1000,
  },
  {
    key: "jackpot",
    label: "Jackpot",
    icon: Rocket,
    accent: "rose",
    description: "Le combiné qui paye gros. 5 picks à cote plus élevée, edge positif.",
    mise: 500,
  },
];

const ACCENT_CLS = {
  emerald: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: "bg-emerald-100 text-emerald-600",
    ring: "ring-emerald-300",
    cardBg: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700",
  },
  orange: {
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    icon: "bg-orange-100 text-orange-600",
    ring: "ring-orange-300",
    cardBg: "wp-gradient-warm",
  },
  rose: {
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    icon: "bg-rose-100 text-rose-600",
    ring: "ring-rose-300",
    cardBg: "bg-gradient-to-br from-rose-500 via-rose-600 to-pink-700",
  },
};

export default function CombosPage() {
  const { user } = useAuth();
  const [combos, setCombos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTier, setActiveTier] = useState("balanced");

  const fetchCombos = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/predictions/combos");
      setCombos(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCombos(); }, []);

  const isPaid = user?.subscription_tier && user.subscription_tier !== "free";
  const activeCombo = combos?.[activeTier];

  return (
    <AppLayout>
      <SocialProofToast />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-orange-600 font-bold mb-1">
              Combinés du jour
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              3 combinés. 3 niveaux de risque. <span className="bg-gradient-to-r from-orange-600 to-rose-500 bg-clip-text text-transparent">À toi de choisir.</span>
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              Chaque combiné est généré automatiquement à partir des matchs les plus analysés, avec une diversification multi-sports pour minimiser les corrélations.
            </p>
          </div>
          <Button
            onClick={fetchCombos}
            variant="outline"
            size="sm"
            data-testid="refresh-combos-btn"
            disabled={loading}
            className="flex-shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Actualiser
          </Button>
        </div>

        {/* Tier selector */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
          {TIERS.map((t) => {
            const Icon = t.icon;
            const c = combos?.[t.key];
            const isActive = activeTier === t.key;
            const acc = ACCENT_CLS[t.accent];
            return (
              <button
                key={t.key}
                data-testid={`tier-tab-${t.key}`}
                onClick={() => setActiveTier(t.key)}
                className={cn(
                  "text-left p-4 rounded-2xl border-2 transition-all bg-white",
                  isActive ? `border-${t.accent}-500 shadow-lg` : "border-neutral-200 hover:border-neutral-300"
                )}
                style={isActive ? { borderColor: t.accent === "orange" ? "#ea580c" : t.accent === "rose" ? "#f43f5e" : "#10b981" } : {}}
              >
                <div className={cn("h-9 w-9 rounded-xl grid place-items-center mb-3", acc.icon)}>
                  <Icon className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="font-heading font-bold text-base sm:text-lg text-slate-900">{t.label}</div>
                {c && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                    <span>{c.legs?.length || 0} picks</span>
                    <span>·</span>
                    <span className="font-mono font-bold text-slate-900">@ {c.total_odds}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {!isPaid && (
          <Card className="mb-6 p-4 bg-orange-50 border-orange-200 flex items-center gap-3">
            <Lock className="h-5 w-5 text-orange-600 flex-shrink-0" />
            <div className="flex-1 text-sm text-orange-900">
              <strong>Compte Free :</strong> tu vois la structure mais les picks complets sont réservés aux abonnés Pro & Elite.
            </div>
            <Link to="/app/abonnement">
              <Button size="sm" className="wp-gradient-warm text-white border-0" data-testid="upgrade-from-combos-btn">
                Passer Pro
              </Button>
            </Link>
          </Card>
        )}

        {/* Combo display */}
        {loading ? (
          <Skeleton className="h-96" />
        ) : !activeCombo || activeCombo.legs.length === 0 ? (
          <Card className="p-12 text-center bg-white border-neutral-200">
            <div className="text-slate-500">Pas assez de matchs disponibles pour ce niveau aujourd'hui.</div>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3" data-testid={`combo-legs-${activeTier}`}>
              <div className="px-1 mb-2">
                <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">{activeCombo.tagline}</div>
                <div className="text-sm text-slate-700 mt-1">{activeCombo.description}</div>
              </div>
              {activeCombo.legs.map((p, i) => (
                <Card key={p.match_id} className="bg-white border-neutral-200 p-4 hover:shadow-md transition-shadow wp-rise" style={{ animationDelay: `${i * 60}ms` }}>
                  <Link to={`/app/match/${p.match_id}`} data-testid={`combo-leg-${p.match_id}`} className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg wp-gradient-warm text-white grid place-items-center font-bold text-sm flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500 mb-1">{p.sport_title} · {dayjs(p.commence_time).format("HH:mm")}</div>
                        <div className={cn("font-semibold text-slate-900 truncate", !isPaid && "blur-sm select-none")}>
                          {p.home_team} <span className="text-slate-400">vs</span> {p.away_team}
                        </div>
                        <div className="text-sm mt-1">
                          <span className={cn("font-bold text-orange-600", !isPaid && "blur-sm select-none")}>{p.pick}</span>
                          <span className="text-slate-500 font-mono ml-2">@ {p.pick_odds}</span>
                        </div>
                      </div>
                    </div>
                    <ConfidenceBadge label={p.label} confidence={p.confidence} />
                  </Link>
                </Card>
              ))}
            </div>

            <div className="lg:col-span-1">
              <Card className={cn("text-white border-0 p-6 sticky top-6 shadow-2xl wp-noise relative overflow-hidden", ACCENT_CLS[TIERS.find(t => t.key === activeTier).accent].cardBg)} data-testid={`bet-slip-${activeTier}`}>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/80 font-bold mb-4">
                    <TrendingUp className="h-3.5 w-3.5" /> Ticket {activeCombo.label}
                  </div>
                  <div className="space-y-3 mb-6">
                    <Row label="Sélections" value={activeCombo.legs.length} />
                    <Row label="Confiance moy." value={`${activeCombo.avg_confidence}%`} />
                    <Row label="Prob. combinée" value={`${activeCombo.combined_probability}%`} />
                  </div>
                  <div className="pt-4 border-t border-white/20">
                    <div className="text-[10px] uppercase tracking-wider text-white/70 font-bold mb-1">Cote totale</div>
                    <div className="font-heading text-5xl font-black tracking-tighter">{activeCombo.total_odds}</div>
                    <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/10 text-xs">
                      <span className="text-white/70">Mise </span>
                      <span className="font-mono font-bold">{TIERS.find(t => t.key === activeTier).mise.toLocaleString()} FCFA</span>
                      <span className="text-white/70"> → </span>
                      <span className="font-mono font-bold text-white">
                        {(activeCombo.total_odds * TIERS.find(t => t.key === activeTier).mise).toFixed(0)} FCFA
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/75">{label}</span>
      <span className="font-bold font-mono">{value}</span>
    </div>
  );
}
