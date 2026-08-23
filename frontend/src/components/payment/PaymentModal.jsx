import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sparkles, CheckCircle2, Crown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

import { FALLBACK_TIER, TIER_ICONS } from "@/config/paymentConfig";
import { formatXof } from "@/utils/currency";
import { genRef } from "@/utils/referenceGenerator";
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
} from "@/utils/paymentMessages";
import { validatePaymentForm } from "@/utils/paymentValidation";

import { PaymentStep1 } from "./PaymentStep1";
import { PaymentStep2 } from "./PaymentStep2";
import { PaymentStep3 } from "./PaymentStep3";

/**
 * Payment Modal Component
 * Handles subscription payment flow with 3 steps:
 * 1. Summary and form
 * 2. Payment instructions
 * 3. Confirmation
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal open state
 * @param {Function} props.onClose - Close callback
 * @param {string} [props.targetTier] - Target tier (default: "PRO")
 */
export default function PaymentModal({
  isOpen,
  onClose,
  targetTier = "PRO",
}) {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  // Tier data
  const [plan, setPlan] = useState(FALLBACK_TIER);
  const [planId, setPlanId] = useState("pro");

  // Form state
  const [step, setStep] = useState(1);
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [payerName, setPayerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Fetch plan data on mount
  useEffect(() => {
    api
      .get("/plans")
      .then((r) => {
        const p = r.data?.[0];
        if (!p) return;

        setPlanId(p.id || "pro");
        setPlan({
          label: p.name || "Pro",
          price: p.price_xof ?? p.price_fcfa ?? p.price ?? FALLBACK_TIER.price,
          accent: FALLBACK_TIER.accent,
          icon: (p.name || "").toLowerCase().includes("elite")
            ? Crown
            : Sparkles,
          perks:
            Array.isArray(p.features) && p.features.length
              ? p.features
              : FALLBACK_TIER.perks,
        });
      })
      .catch(() => {
        // Use fallback tier on error
      });
  }, []);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setReference(genRef());
      setPhone("");
      setPayerName(user?.full_name || "");
      setSubmitting(false);
      setAcceptedTerms(false);
    }
  }, [isOpen, user?.full_name]);

  const tier = plan;
  const TierIcon = tier.icon;

  // Build WhatsApp message and URL
  const whatsappUrl = useMemo(() => {
    const msg = buildWhatsAppMessage({
      tier,
      reference,
      phone,
      payerName,
      user,
    });
    return buildWhatsAppUrl(msg);
  }, [reference, tier, phone, payerName, user]);

  // Handlers
  const handleClose = () => {
    onClose?.();
  };

  const goToInstructions = async () => {
    // Validate form
    const validation = validatePaymentForm({
      user,
      phone,
      payerName,
      acceptedTerms,
    });

    if (!validation.valid) {
      toast.error(validation.message);
      if (validation.action === "register") {
        handleClose();
        navigate("/register");
      }
      return;
    }

    // Submit checkout
    setSubmitting(true);
    try {
      const { data } = await api.post("/subscription/checkout", {
        tier: planId,
        phone: phone.trim(),
        payer_name: payerName.trim(),
      });
      if (data?.reference) setReference(data.reference);
      setStep(2);
    } catch (err) {
      toast.warning(
        "Connexion limitée — vous pouvez quand même payer, prévenez-nous via WhatsApp."
      );
      setStep(2);
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (txt, label = "Copié") => {
    navigator.clipboard?.writeText(String(txt));
    toast.success(label);
  };

  const markPaid = () => {
    setStep(3);
    refresh?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="max-w-lg p-0 overflow-hidden"
        data-testid="payment-modal"
      >
        {/* Header */}
        <div
          className={`relative bg-gradient-to-br ${tier.accent} px-6 pt-6 pb-5 text-white`}
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/15 backdrop-blur-sm grid place-items-center ring-1 ring-white/25">
              <TierIcon className="h-5 w-5" />
            </div>
            <div>
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle
                  className="text-white font-heading text-xl font-extrabold tracking-tight"
                  data-testid="payment-modal-title"
                >
                  Activer le plan {tier.label}
                </DialogTitle>
                <DialogDescription className="text-white/80 text-xs mt-0.5">
                  Paiement sécurisé · MTN Mobile Money Bénin
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={`h-6 w-6 rounded-full grid place-items-center text-[11px] ${
                    step >= s
                      ? "bg-white text-slate-900"
                      : "bg-white/20 text-white/70"
                  }`}
                  data-testid={`payment-step-${s}-indicator`}
                >
                  {step > s ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    s
                  )}
                </div>
                <span
                  className={step >= s ? "text-white" : "text-white/60"}
                >
                  {s === 1 ? "Récap" : s === 2 ? "Paiement" : "Confirmation"}
                </span>
                {s < 3 && <div className="flex-1 h-px bg-white/20" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 bg-white">
          {step === 1 && (
            <PaymentStep1
              tier={tier}
              reference={reference}
              phone={phone}
              payerName={payerName}
              acceptedTerms={acceptedTerms}
              submitting={submitting}
              onPhoneChange={setPhone}
              onNameChange={setPayerName}
              onTermsChange={setAcceptedTerms}
              onContinue={goToInstructions}
              onCancel={handleClose}
            />
          )}

          {step === 2 && (
            <PaymentStep2
              tier={tier}
              reference={reference}
              whatsappUrl={whatsappUrl}
              onCopy={copy}
              onMarkPaid={markPaid}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <PaymentStep3
              tier={tier}
              reference={reference}
              whatsappUrl={whatsappUrl}
              onClose={handleClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
 