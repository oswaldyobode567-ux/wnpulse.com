import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Crown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";

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

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Choisissez votre niveau d'analyse
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
          <div className="grid md:grid-cols-3 gap-5">
            {[1,2,3].map(i => <Skeleton key={i} className="h-96" />)}
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-5">
            {plans.map((p) => {
              const highlight = p.id === "pro";
              const isCurrent = user?.subscription_tier === p.id;
              return (
                <Card
                  key={p.id}
                  data-testid={`plan-${p.id}`}
                  className={`bg-white p-6 relative ${highlight ? "border-orange-500 ring-2 ring-orange-500 shadow-lg" : "border-neutral-200"}`}
                >
                  {highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 wp-gradient-warm text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                      Populaire
                    </div>
                  )}
                  <div className="font-heading text-xl font-extrabold text-slate-900 mb-1">{p.name}</div>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="font-heading text-4xl font-black tracking-tighter text-slate-900">
                      {p.price_xof.toLocaleString()}
                    </span>
                    <span className="text-sm text-slate-500">FCFA{p.duration_days > 0 && "/mois"}</span>
                  </div>
                  <ul className="space-y-2.5 mb-6 min-h-[180px]">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    data-testid={`choose-${p.id}-btn`}
                    className={`w-full ${highlight ? "wp-gradient-warm text-white border-0 hover:opacity-90" : ""}`}
                    variant={highlight ? "default" : "outline"}
                    onClick={() => onChoose(p.id)}
                    disabled={isCurrent}
                  >
                    {isCurrent ? "Plan actuel" : p.id === "free" ? "Gratuit" : `Choisir ${p.name}`}
                  </Button>
                </Card>
              );
            })}
          </div>
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
