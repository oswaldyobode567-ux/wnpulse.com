import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  Crown,
  Zap,
  X,
  Copy,
  MessageCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const MOMO_NUMBER = "+229 01 66 28 06 03";
const MOMO_RECIPIENT_NAME = "KOUKPAKI VIANEY";
const WHATSAPP_NUMBER = "33767971752";

function formatXof(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("fr-FR")
    : "0";
}

export default function SubscriptionPage() {
  const { user } = useAuth();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState(1);
  const [payerName, setPayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    api
      .get("/plans")
      .then((response) => {
        if (!active) return;

        setPlans(
          Array.isArray(response?.data)
            ? response.data
            : []
        );
      })
      .catch(() => {
        if (active) {
          toast.error(
            "Impossible de charger les offres"
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const plan = plans[0] || null;

  const isCurrent =
    user?.subscription_tier === plan?.id;

  const amount = useMemo(
    () =>
      Number(
        plan?.price_xof ??
          plan?.price_fcfa ??
          plan?.price ??
          0
      ),
    [plan]
  );

  const openPayment = async () => {
    if (!plan?.id || submitting) return;

    setSubmitting(true);
    setPaymentError("");

    try {
      const response = await api.post(
        "/subscription/checkout",
        {
          tier: String(plan.id).toLowerCase(),
          phone: "",
          payer_name:
            user?.full_name ||
            user?.name ||
            "",
        }
      );

      const paymentData = response?.data || {};

      if (
        paymentData?.payment_provider === "fedapay" &&
        paymentData?.payment_url
      ) {
        window.location.assign(paymentData.payment_url);
        return;
      }

      if (paymentData?.payment_provider === "manual_momo") {
        throw new Error(
          "FedaPay n'est pas activé sur le backend. Vérifie FEDAPAY_ENABLED=true et FEDAPAY_SECRET_KEY sur le service backend déployé."
        );
      }

      throw new Error(
        "FedaPay n'a pas retourné de lien de paiement."
      );
    } catch (error) {
      const detail =
        error?.response?.data?.detail ||
        error?.message ||
        "Impossible d'ouvrir le paiement FedaPay.";

      setPaymentError(String(detail));
      toast.error(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  const closePayment = () => {
    if (submitting) return;
    setPaymentOpen(false);
  };

  const goNext = async () => {
    const cleanName =
      payerName.trim();

    const cleanPhone =
      phone.trim();

    if (!cleanName) {
      setPaymentError(
        "Indique le nom utilisé pour le paiement."
      );
      return;
    }

    if (!cleanPhone) {
      setPaymentError(
        "Indique le numéro MTN Mobile Money utilisé."
      );
      return;
    }

    if (!plan?.id) {
      setPaymentError(
        "Le plan d'abonnement n'est pas disponible."
      );
      return;
    }

    setSubmitting(true);
    setPaymentError("");

    try {
      const response = await api.post(
        "/subscription/checkout",
        {
          tier: String(
            plan.id
          ).toLowerCase(),
          phone: cleanPhone,
          payer_name: cleanName,
        }
      );

      const generatedReference =
        response?.data?.reference;

      if (!generatedReference) {
        throw new Error(
          "La référence de suivi n'a pas été générée."
        );
      }

      setReference(
        generatedReference
      );

      setPaymentStep(2);
    } catch (error) {
      setPaymentError(
        error?.response?.data?.detail ||
          error?.message ||
          "Impossible de générer la référence de paiement."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(
        reference
      );

      toast.success(
        "Référence copiée"
      );
    } catch {
      toast.info(
        `Référence : ${reference}`
      );
    }
  };

  const openWhatsApp = () => {
    const message = [
      "Bonjour WinPulse !",
      "",
      `Je viens d'effectuer le paiement pour activer mon plan ${plan?.name || "WinPulse Pro"}.`,
      `Référence : ${reference}`,
      `Montant : ${formatXof(amount)} FCFA`,
      `Numéro MTN MoMo utilisé : ${phone.trim()}`,
      `Nom : ${payerName.trim()}`,
      `Email : ${user?.email || ""}`,
      "",
      "Merci de vérifier mon paiement et d'activer mon accès.",
    ].join("\n");

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        message
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Un seul accès. Tout WinPulse.
          </h1>

          <p className="mt-3 text-sm text-slate-600">
            Paiement sécurisé via FedaPay · XOF · activation automatique après confirmation
          </p>

          {user?.subscription_tier &&
            user.subscription_tier !==
              "free" && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
                <Crown className="h-3.5 w-3.5" />
                Plan actif :{" "}
                {user.subscription_tier.toUpperCase()}
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
              <Zap
                className="h-3 w-3"
                fill="white"
              />
              Accès complet
            </div>

            <div className="text-center mb-2">
              <div className="font-heading text-2xl font-extrabold text-slate-900">
                {plan.name}
              </div>

              {plan.tagline && (
                <p className="text-sm text-orange-600 font-medium mt-1">
                  {plan.tagline}
                </p>
              )}
            </div>

            <div className="flex items-baseline justify-center gap-1 my-6">
              <span className="font-heading text-5xl font-black tracking-tighter text-slate-900">
                {formatXof(amount)}
              </span>

              <span className="text-base text-slate-500">
                FCFA
                {plan.duration_days >
                  0 &&
                  "/mois"}
              </span>
            </div>

            <ul className="space-y-3 mb-8">
              {Array.isArray(
                plan.features
              ) &&
                plan.features.map(
                  (feature, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2.5 text-sm text-slate-700"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />

                      <span>
                        {feature}
                      </span>
                    </li>
                  )
                )}
            </ul>

            <Button
              data-testid={`choose-${plan.id}-btn`}
              className="w-full h-12 text-base wp-gradient-warm text-white border-0 hover:opacity-90"
              onClick={openPayment}
              disabled={isCurrent || submitting}
            >
              {isCurrent
                ? "Plan actuel"
                : submitting
                  ? "Ouverture de FedaPay…"
                  : `Débloquer ${plan.name}`}
            </Button>

            {paymentError && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {paymentError}
              </div>
            )}

            <p className="text-center text-xs text-slate-400 mt-4">
              Paiement traité par FedaPay · activation automatique après confirmation
            </p>
          </Card>
        ) : (
          <p className="text-center text-slate-500 text-sm">
            Aucun plan disponible pour le moment.
          </p>
        )}
      </div>

    </AppLayout>
  );
}
