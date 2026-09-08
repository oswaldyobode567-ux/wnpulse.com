
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  ShieldCheck,
  Zap,
  Flame,
  Rocket,
  Loader2,
  Lock,
  Send,
  Sparkles,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import LiveDataBadge from "@/components/LiveDataBadge";
import dayjs from "dayjs";

const TIER_META = {
  ultra_safe: {
    icon: ShieldCheck,
    gradient: "from-teal-500 to-cyan-700",
  },
  sure: {
    icon: Shield,
    gradient: "from-emerald-500 to-emerald-700",
  },
  booster: {
    icon: Zap,
    gradient: "from-orange-500 to-orange-700",
  },
  extra: {
    icon: Flame,
    gradient: "from-rose-500 to-pink-700",
  },
  jackpot: {
    icon: Rocket,
    gradient: "from-violet-600 to-purple-800",
  },
};

const TIER_ORDER = [
  "ultra_safe",
  "sure",
  "booster",
  "extra",
  "jackpot",
];

function normalizeConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

function safeOdds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatKickoff(value) {
  if (!value) return "";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("HH:mm") : "";
}

function getLegKey(leg, index) {
  return (
    leg?.match_id ||
    leg?.id ||
    `${leg?.home_team || "home"}-${leg?.away_team || "away"}-${leg?.commence_time || index}`
  );
}

export default function TodayCombosPage() {
  const { user } = useAuth();

  const subscription =
    user?.subscription_tier ||
    user?.subscription ||
    "free";

  const isFree = subscription === "free";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sportKey, setSportKey] = useState("all");
  const [error, setError] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await api.get("/predictions/today-combos");
      const payload =
        response?.data && typeof response.data === "object"
          ? response.data
          : {};

      setData(payload);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Impossible de charger les combinés du jour.";

      setError(String(detail));
      toast.error("Impossible de charger les combinés du jour");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const families = useMemo(() => {
    const rawFamilies = data?.families;

    if (!rawFamilies || typeof rawFamilies !== "object") {
      return [];
    }

    return Object.values(rawFamilies)
      .filter((family) => family && typeof family === "object")
      .sort((a, b) => {
        if (a.family_key === "all") return -1;
        if (b.family_key === "all") return 1;
        return String(a.family_label || "").localeCompare(
          String(b.family_label || ""),
          "fr"
        );
      });
  }, [data]);

  useEffect(() => {
    if (!families.length) return;

    const exists = families.some(
      (family) => family.family_key === sportKey
    );

    if (!exists) {
      const fallback =
        families.find((family) => family.family_key === "all") ||
        families[0];

      setSportKey(fallback.family_key);
    }
  }, [families, sportKey]);

  const currentFamily = useMemo(() => {
    if (!families.length) return null;

    return (
      families.find((family) => family.family_key === sportKey) ||
      families.find((family) => family.family_key === "all") ||
      families[0]
    );
  }, [families, sportKey]);

  const currentTiers = useMemo(() => {
    const tiers = currentFamily?.tiers;

    if (!tiers || typeof tiers !== "object") {
      return [];
    }

    return Object.entries(tiers)
      .filter(([, tier]) => tier && typeof tier === "object")
      .sort(([a], [b]) => {
        const ai = TIER_ORDER.indexOf(a);
        const bi = TIER_ORDER.indexOf(b);

        const safeAi = ai === -1 ? 999 : ai;
        const safeBi = bi === -1 ? 999 : bi;

        return safeAi - safeBi;
      });
  }, [currentFamily]);

  const shareWhatsApp = useCallback((tier) => {
    if (!Array.isArray(tier?.legs) || tier.legs.length === 0) {
      toast.info("Aucun pick à partager pour ce combiné.");
      return;
    }

    const totalOdds = safeOdds(tier.total_odds);

    const lines = [
      `🎯 *Combiné WinPulse ${tier.label || ""}* (${dayjs().format("DD/MM")})`,
      `_Cote totale : ${totalOdds || "—"} · ${tier.legs.length} pick${tier.legs.length > 1 ? "s" : ""}_`,
      "",
    ];

    tier.legs.forEach((pick, index) => {
      lines.push(
        `${index + 1}. *${pick.home_team || "Équipe 1"} vs ${pick.away_team || "Équipe 2"}*`,
        `   👉 ${pick.pick || "Sélection"} @ ${pick.pick_odds || "—"}`
      );
    });

    lines.push(
      "",
      "Généré par WinPulse · https://wnpulse.com",
      "18+ · Aucun pari n'est garanti."
    );

    const url = `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  }, []);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 grid place-items-center shadow-md shadow-orange-500/30">
              <Sparkles
                className="h-4 w-4 text-white"
                strokeWidth={2.5}
              />
            </div>

            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">
              Combinés du jour
            </h1>

            <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] ml-1">
              {dayjs().format("DD/MM/YYYY")}
            </Badge>

            <div className="ml-auto flex items-center gap-2">
              <LiveDataBadge />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => load({ silent: true })}
                disabled={refreshing || loading}
                className="h-8"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    refreshing && "animate-spin"
                  )}
                />
                Actualiser
              </Button>
            </div>
          </div>

          <p className="text-sm text-slate-600 max-w-2xl">
            Uniquement les matchs qui se jouent aujourd'hui, répartis
            en niveaux de cote, du plus prudent au plus ambitieux.
          </p>
        </div>

        {error && (
          <Card className="mb-5 border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">
              Données temporairement indisponibles
            </p>
            <p className="text-xs text-rose-700 mt-1">
              {error}
            </p>
          </Card>
        )}

        {!loading && data?.ultra_safe && (
          <div className="mb-6">
            <TierCard
              tier={data.ultra_safe}
              tkey="ultra_safe"
              isFree={false}
              onShare={() => shareWhatsApp(data.ultra_safe)}
            />
          </div>
        )}

        {families.length > 0 && (
          <Tabs
            value={sportKey}
            onValueChange={setSportKey}
            className="mb-6"
          >
            <TabsList
              className="bg-white border border-neutral-200 flex-wrap h-auto p-1"
              data-testid="today-sport-tabs"
            >
              {families.map((family) => (
                <TabsTrigger
                  key={family.family_key}
                  value={family.family_key}
                  disabled={
                    Number(family.matches_today || 0) === 0 &&
                    family.family_key !== "all"
                  }
                  data-testid={`today-tab-${family.family_key}`}
                >
                  {family.family_label || family.family_key}

                  {Number(family.matches_today || 0) > 0 && (
                    <span className="ml-1.5 text-[9px] opacity-70">
                      {family.matches_today}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : !currentFamily ? (
          <Card className="p-8 bg-white border-neutral-200 text-center">
            <div className="text-4xl mb-3 opacity-40">
              🕒
            </div>

            <p className="text-slate-500 text-sm">
              Aucun combiné disponible pour le moment.
            </p>

            <p className="text-slate-400 text-xs mt-2">
              Les données seront affichées dès qu'elles seront disponibles.
            </p>
          </Card>
        ) : Number(currentFamily.matches_today || 0) === 0 ? (
          <Card className="p-8 bg-white border-neutral-200 text-center">
            <div className="text-4xl mb-3 opacity-40">
              🕒
            </div>

            <p className="text-slate-500 text-sm">
              Aucun match aujourd'hui dans{" "}
              <strong>
                {currentFamily.family_label || "ce sport"}
              </strong>.
            </p>

            <p className="text-slate-400 text-xs mt-2">
              Consulte les autres sports ou reviens plus tard.
            </p>
          </Card>
        ) : currentTiers.length === 0 ? (
          <Card className="p-8 bg-white border-neutral-200 text-center">
            <p className="text-slate-500 text-sm">
              Aucun combiné n'a encore été construit pour cette catégorie.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {currentTiers.map(([tkey, tier]) => (
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

function TierCard({
  tier,
  tkey,
  isFree,
  onShare,
}) {
  const meta =
    TIER_META[tkey] ||
    TIER_META.sure;

  const Icon = meta.icon;

  const legs = Array.isArray(tier?.legs)
    ? tier.legs
    : [];

  const isLocked =
    Boolean(tier?.locked) &&
    isFree;

  const isUltraSafe =
    tkey === "ultra_safe";

  const totalOdds = safeOdds(tier?.total_odds);

  const avgConfidence =
    normalizeConfidence(tier?.avg_confidence);

  const potentialReturn =
    totalOdds > 0
      ? Math.round(totalOdds * 1000)
      : 0;

  return (
    <Card
      className={cn(
        "bg-white overflow-hidden",
        isUltraSafe
          ? "border-teal-300 ring-2 ring-teal-500/10"
          : "border-neutral-200"
      )}
      data-testid={`today-tier-${tkey}`}
    >
      <div
        className={cn(
          "bg-gradient-to-br text-white p-5",
          meta.gradient
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-white/20 grid place-items-center backdrop-blur-sm shrink-0">
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="font-heading font-extrabold text-xl truncate">
                {tier?.label || "Combiné"}
              </div>

              {tier?.tagline && (
                <div className="text-[10px] uppercase tracking-wider opacity-90 font-bold">
                  {tier.tagline}
                </div>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider opacity-80 font-bold">
              Cote totale
            </div>

            <div className="font-heading font-black text-3xl leading-none mt-1 font-mono">
              {totalOdds || "—"}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="opacity-90">
            {legs.length} pick
            {legs.length > 1 ? "s" : ""} · confiance{" "}
            {Math.round(avgConfidence)}%
          </span>

          {potentialReturn > 0 && (
            <span className="bg-white/25 rounded px-2 py-0.5 font-mono font-bold">
              Mise 1 000 → retour potentiel {potentialReturn.toLocaleString("fr-FR")} FCFA
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        {tier?.description && (
          <p className="text-xs text-slate-500 mb-3 italic">
            {tier.description}
          </p>
        )}

        {isUltraSafe && legs.length > 0 && (
          <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />

            <p className="text-[11px] text-amber-800 leading-snug">
              Même un favori très net peut perdre. Ce niveau réduit
              le risque, il ne l'élimine pas. Aucun pari sportif
              n'est garanti.
            </p>
          </div>
        )}

        {isLocked ? (
          <div className="text-center py-6">
            <Lock className="h-8 w-8 mx-auto text-slate-400 mb-2" />

            <p className="text-sm text-slate-600 font-semibold mb-1">
              Réservé aux abonnés WinPulse Pro
            </p>

            <p className="text-xs text-slate-400 mb-3">
              Abonne-toi pour débloquer tous les niveaux et leurs sélections.
            </p>
          </div>
        ) : legs.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            {isUltraSafe
              ? "Pas assez de matchs très fiables aujourd'hui pour ce niveau. Reviens plus tard."
              : "Pas assez de matchs qualifiés aujourd'hui pour construire ce niveau."}
          </p>
        ) : (
          <>
            <div className="space-y-2 mb-3">
              {legs.map((pick, index) => {
                const confidence =
                  normalizeConfidence(pick?.confidence);

                const kickoff =
                  formatKickoff(pick?.commence_time);

                return (
                  <div
                    key={getLegKey(pick, index)}
                    className="p-2.5 rounded-lg bg-slate-50 border border-neutral-200"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">
                        {pick?.sport_title ||
                          pick?.market_label ||
                          "Match"}
                        {kickoff ? ` · ${kickoff}` : ""}
                      </div>

                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                        {Math.round(confidence)}%
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {pick?.home_team || "Équipe 1"}{" "}
                      <span className="text-slate-400">
                        vs
                      </span>{" "}
                      {pick?.away_team || "Équipe 2"}
                    </div>

                    <div className="text-xs text-slate-600 mt-0.5">
                      <span className="text-slate-500">
                        {pick?.market_label || "Sélection"} :
                      </span>{" "}
                      <strong className="text-orange-600">
                        {pick?.pick || "—"}
                      </strong>{" "}
                      @{" "}
                      <strong className="font-mono">
                        {pick?.pick_odds || "—"}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              onClick={onShare}
              size="sm"
              className="w-full bg-[#25D366] hover:bg-[#1ebe5c] text-white h-9 text-xs"
              data-testid={`today-share-${tkey}`}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Partager par WhatsApp
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
