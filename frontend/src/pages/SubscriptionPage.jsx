import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Crown, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import PaymentModal from "../../PaymentModal";
export default function SubscriptionPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });

  useEffect(() => {
    api.get("/plans").then((r) => setPlans(r.data)).finally(() => setLoading(false));
  }, []);
  const onChoose = (tier) => {
    if (tier === "free") {
      toast.info("Vous êtes déjà sur le plan gratuit");
      return;
    }
    setPayState({ isOpen: true, tier: tier.toUpperCase() });
  };
  // Palier unique : plans ne contient plus qu'une seule offre desormais.
  const plan = plans[0];
  const isCurrent = user?.subscription_tier === plan?.id;
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Un seul accès. Tout WinPulse.
          </h1>
          <p className="mt-3 text-sm text-slate-600">Paiement sécurisé via MTN Mobile Money Bénin · annulable à tout moment</p>
          {user?.subscription_tier && user.subscription_tier !== "free" && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
              <Crown className="h-3.5 w-3.5" />
              Plan actif : {user.subscription_tier.toUpperCase()}
            </div>
          )}
        </div>
        {loading ? (
          <Skeleton className="h-[520px] max-w-md mx-auto" />
        ) : plan ? (
          <Card
            data-testid={`plan-${plan.id}`}
            className="bg-white p-8 relative max-w-md mx-auto border-orange-500 ring-2 ring-orange-500 shadow-xl"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 wp-gradient-warm text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
              <Zap className="h-3 w-3" fill="white" /> Accès complet
            </div>

            <div className="text-center mb-2">
              <div className="font-heading text-2xl font-extrabold text-slate-900">{plan.name}</div>
              {plan.tagline && (
                <p className="text-sm text-orange-600 font-medium mt-1">{plan.tagline}</p>
              )}
            </div>

            <div className="flex items-baseline justify-center gap-1 my-6">
              <span className="font-heading text-5xl font-black tracking-tighter text-slate-900">
                {plan.price_xof.toLocaleString()}
              </span>
              <span className="text-base text-slate-500">FCFA{plan.duration_days > 0 && "/mois"}</span>
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              data-testid={`choose-${plan.id}-btn`}
              className="w-full h-12 text-base wp-gradient-warm text-white border-0 hover:opacity-90"
              onClick={() => onChoose(plan.id)}
              disabled={isCurrent}
            >
              {isCurrent ? "Plan actuel" : `Débloquer ${plan.name}`}
            </Button>

            <p className="text-center text-xs text-slate-400 mt-4">
              Sans engagement · résiliable à tout moment · support WhatsApp inclus
            </p>
          </Card>
        ) : (
          <p className="text-center text-slate-500 text-sm">Aucun plan disponible pour le moment.</p>
        )}
      </div>
      <PaymentModal
        isOpen={payState.isOpen}
        onClose={() => setPayState({ isOpen: false, tier: payState.tier })}
        targetTier={payState.tier}
      />
    </AppLayout>
  );
}
