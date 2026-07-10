import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Zap, Flame, Rocket, Loader2, Lock, Send, Trophy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import LiveDataBadge from "@/components/LiveDataBadge";
import dayjs from "dayjs";

const TIER_META = {
  sure: { icon: Shield, accent: "emerald", gradient: "from-emerald-500 to-emerald-700" },
  booster: { icon: Zap, accent: "orange", gradient: "from-orange-500 to-orange-700" },
  extra: { icon: Flame, accent: "rose", gradient: "from-rose-500 to-pink-700" },
  jackpot: { icon: Rocket, accent: "violet", gradient: "from-violet-600 to-purple-800" },
};

export default function TodayCombosPage() {
  const { user } = useAuth();
  const isFree = (user?.subscription_tier || "free") === "free";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sportKey, setSportKey] = useState("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/predictions/today-combos");
        setData(data);
      } catch (e) {
        toast.error("Impossible de charger les combinés du jour");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const families = useMemo(() => (data ? Object.values(data.families) : []), [data]);
  const currentFamily = useMemo(() => families.find((f) => f.family_key === sportKey), [families, sportKey]);

  const shareWhatsApp = (tier) => {
    if (!tier.legs?.length) return;
    const lines = [
      `🎯 *Combiné WinPulse ${tier.label}* (${dayjs().format("DD/MM")})`,
      `_Cote totale : ${tier.total_odds} · ${tier.legs.length} picks_`,
      "",
    ];
    tier.legs.forEach((p, i) => {
      lines.push(`${i + 1}. *${p.home_team} vs ${p.away_team}*\n   👉 ${p.pick} @ ${p.pick_odds}`);
    });
    lines.push("", "Généré par WinPulse · https://wnpulse.com");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 grid place-items-center shadow-md shadow-orange-500/30">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">Combinés du jour</h1>
            <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] ml-1">
              {dayjs().format("dddd D MMMM")}
            </Badge>
            <div className="ml-auto"><LiveDataBadge /></div>
          </div>
          <p className="text-sm text-slate-600 max-w-2xl">
            Uniquement les matchs qui se jouent <strong>aujourd'hui</strong>, répartis en 4 niveaux de cote — du plus sûr au plus jackpot. Choisis ta stratégie.
          </p>
        </div>

        {/* Sport tabs */}
        <Tabs value={sportKey} onValueChange={setSportKey} className="mb-6">
          <TabsList className="bg-white border border-neutral-200 flex-wrap h-auto p-1" data-testid="today-sport-tabs">
            {families.map((f) => (
              <TabsTrigger key={f.family_key} value={f.family_key} disabled={f.matches_today === 0 && f.family_key !== "all"} data-testid={`today-tab-${f.family_key}`}>
                {f.family_label}
                {f.matches_today > 0 && <span className="ml-1.5 text-[9px] opacity-70">{f.matches_today}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : !currentFamily || currentFamily.matches_today === 0 ? (
          <Card className="p-8 bg-white border-neutral-200 text-center">
            <div className="text-4xl mb-3 opacity-40">🕒</div>
            <p className="text-slate-500 text-sm">Aucun match aujourd'hui dans <strong>{currentFamily?.family_label || "ce sport"}</strong>.</p>
            <p className="text-slate-400 text-xs mt-2">Reviens demain matin ou regarde la catégorie "Tous sports".</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
            {Object.entries(currentFamily.tiers).map(([tkey, tier]) => (
              <TierCard
                key={tkey}
                tier={tier}
                tkey={tkey}
                isFree={isFree}
                onShare={() => shareWhatsApp(tier)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function TierCard({ tier, tkey, isFree, onShare }) {
  const meta = TIER_META[tkey] || TIER_META.sure;
  const Icon = meta.icon;
  const legs = tier.legs || [];
  const isLocked = tier.locked && isFree;
  const potentialWin = Math.round((tier.total_odds || 0) * 1000);

  return (
    <Card className="bg-white border-neutral-200 overflow-hidden" data-testid={`today-tier-${tkey}`}>
      <div className={cn("bg-gradient-to-br text-white p-5", meta.gradient)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-white/20 grid place-items-center backdrop-blur-sm">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="font-heading font-extrabold text-xl">{tier.label}</div>
              <div className="text-[10px] uppercase tracking-wider opacity-90 font-bold">{tier.tagline}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Cote totale</div>
            <div className="font-heading font-black text-3xl leading-none mt-1 font-mono">{tier.total_odds || "—"}</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-xs">
          <span className="opacity-90">{legs.length} pick{legs.length > 1 ? "s" : ""} · confiance {tier.avg_confidence || 0}%</span>
          {tier.total_odds > 0 && (
            <span className="bg-white/25 rounded px-2 py-0.5 font-mono font-bold">Mise 1000 → {potentialWin} FCFA</span>
          )}
        </div>
      </div>

      <div className="p-4">
        <p className="text-xs text-slate-500 mb-3 italic">{tier.description}</p>

        {isLocked ? (
          <div className="text-center py-6">
            <Lock className="h-8 w-8 mx-auto text-slate-400 mb-2" />
            <p className="text-sm text-slate-600 font-semibold mb-1">Réservé aux abonnés Pro / Elite</p>
            <p className="text-xs text-slate-400 mb-3">Passe Pro pour débloquer les 3 niveaux Booster, Extra & Jackpot</p>
          </div>
        ) : legs.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Pas assez de matchs aujourd'hui pour construire ce niveau.</p>
        ) : (
          <>
            <div className="space-y-2 mb-3">
              {legs.map((p, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-slate-50 border border-neutral-200">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">
                      {p.sport_title || p.market_label} · {dayjs(p.commence_time).format("HH:mm")}
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">{p.confidence?.toFixed(0)}%</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">{p.home_team} <span className="text-slate-400">vs</span> {p.away_team}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    <span className="text-slate-500">{p.market_label} :</span> <strong className="text-orange-600">{p.pick}</strong> @ <strong className="font-mono">{p.pick_odds}</strong>
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={onShare}
              size="sm"
              className="w-full bg-[#25D366] hover:bg-[#1ebe5c] text-white h-9 text-xs"
              data-testid={`today-share-${tkey}`}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" /> Partager par WhatsApp
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
