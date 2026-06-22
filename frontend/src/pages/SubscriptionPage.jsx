import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, Crown, Smartphone, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function SubscriptionPage() {
  const { user, refresh } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [phone, setPhone] = useState("");
  const [payerName, setPayerName] = useState(user?.full_name || "");
  const [checkout, setCheckout] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api.get("/plans").then((r) => setPlans(r.data)).finally(() => setLoading(false));
  }, []);

  const onChoose = (tier) => {
    if (tier === "free") {
      toast.info("Vous êtes déjà sur le plan gratuit");
      return;
    }
    setSelectedTier(tier);
    setCheckout(null);
    setOpen(true);
  };

  const submitCheckout = async () => {
    if (!phone) {
      toast.error("Numéro de téléphone requis");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/subscription/checkout", {
        tier: selectedTier,
        phone,
        payer_name: payerName,
      });
      setCheckout(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  const simulateConfirm = async () => {
    if (!checkout) return;
    setConfirming(true);
    try {
      await api.post(`/subscription/confirm/${checkout.reference}`);
      await refresh();
      toast.success("Abonnement activé !");
      setOpen(false);
      setCheckout(null);
    } catch (err) {
      // In production this is expected — admin must validate manually
      toast.info(err?.response?.data?.detail || "Notre équipe va valider sous 1h. Vous recevrez un email dès l'activation.");
      setOpen(false);
      setCheckout(null);
    } finally {
      setConfirming(false);
    }
  };

  const copy = (txt) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copié");
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="checkout-dialog">
          {!checkout ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-yellow-500" />
                  Paiement MTN Mobile Money
                </DialogTitle>
                <DialogDescription>
                  Plan {selectedTier?.toUpperCase()} · {plans.find(p => p.id === selectedTier)?.price_xof.toLocaleString()} FCFA / mois
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="payer">Votre nom complet</Label>
                  <Input id="payer" value={payerName} onChange={(e) => setPayerName(e.target.value)} className="mt-1" data-testid="payer-name-input" />
                </div>
                <div>
                  <Label htmlFor="phone">Numéro MTN MoMo</Label>
                  <Input id="phone" type="tel" placeholder="+229 XX XX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" data-testid="phone-input" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button
                  onClick={submitCheckout}
                  disabled={submitting}
                  className="bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold"
                  data-testid="submit-momo-btn"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Obtenir les instructions"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Instructions MTN MoMo</DialogTitle>
                <DialogDescription>Référence : <span className="font-mono font-bold">{checkout.reference}</span></DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-yellow-800 font-semibold">Numéro marchand</div>
                      <div className="font-mono font-bold text-slate-900">{checkout.instructions.merchant_number}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => copy(checkout.instructions.merchant_number)} data-testid="copy-merchant-btn">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-yellow-200">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-yellow-800 font-semibold">Montant</div>
                      <div className="font-mono font-bold text-slate-900">{checkout.amount_xof.toLocaleString()} FCFA</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => copy(checkout.amount_xof.toString())}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
                  {checkout.instructions.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">Fermer</Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                  onClick={simulateConfirm}
                  disabled={confirming}
                  data-testid="confirm-payment-btn"
                >
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  J'ai payé · Notifier l'admin
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
