import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
const WINPULSE_MONTHLY_PRICE_XOF = 10500;

const FALLBACK_PLAN = {
  id: "pro",
  name: "WinPulse Pro",
  price: WINPULSE_MONTHLY_PRICE_XOF,
  price_fcfa: WINPULSE_MONTHLY_PRICE_XOF,
  price_xof: WINPULSE_MONTHLY_PRICE_XOF,
  duration_days: 30,
  period: "mois",
  tagline: "Un seul prix. Tout WinPulse. Sans compromis.",
  features: [
    "Accès illimité à tous les pronostics, tous les jours, sur 7 sports",
    "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués",
    "Chaque match analysé sur tous ses marchés",
    "Combo Builder et détecteur de value bets",
    "Analyse IA experte sur chaque match",
    "Montante WinPulse avec picks débloqués",
    "Track Record public et vérifiable",
    "Support prioritaire par WhatsApp",
  ],
};

function formatXof(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("fr-FR")
    : "0";
}

export default function SubscriptionPage() {
  const { user } = useAuth();

  const [plans, setPlans] = useState([FALLBACK_PLAN]);
  const [loading, setLoading] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState(1);
  const [payerName, setPayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState({
    provider: "manual_momo",
    fedapay_enabled: false,
  });

  useEffect(() => {
    let active = true;

    Promise.all([
      api.get("/plans"),
      api.get("/payments/config").catch(() => ({
        data: { provider: "manual_momo", fedapay_enabled: false },
      })),
    ])
      .then(([response, paymentResponse]) => {
        if (!active) return;

        setPaymentConfig({
          provider: paymentResponse?.data?.provider || "manual_momo",
          fedapay_enabled: paymentResponse?.data?.fedapay_enabled === true,
          fedapay_environment: paymentResponse?.data?.fedapay_environment || null,
        });

        const remotePlans = Array.isArray(response?.data) ? response.data : [];
        const remotePlan = remotePlans[0];

        if (remotePlan && typeof remotePlan === "object") {
          setPlans([{
            ...FALLBACK_PLAN,
            ...remotePlan,
            id: String(remotePlan.id || FALLBACK_PLAN.id),
            name: String(remotePlan.name || FALLBACK_PLAN.name),
            price: WINPULSE_MONTHLY_PRICE_XOF,
            price_fcfa: WINPULSE_MONTHLY_PRICE_XOF,
            price_xof: WINPULSE_MONTHLY_PRICE_XOF,
            features: Array.isArray(remotePlan.features)
              ? remotePlan.features
              : FALLBACK_PLAN.features,
          }]);
        }
      })
      .catch(() => {
        if (active) {
          toast.error(
            "Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché."
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

  const plan = plans[0] || FALLBACK_PLAN;
  const subscriptionTier = String(
    user?.subscription_tier || user?.subscription || "free"
  ).toLowerCase();
  const isCurrent = subscriptionTier === String(plan?.id || "pro").toLowerCase();
  const amount = WINPULSE_MONTHLY_PRICE_XOF;

  const openPayment = () => {
    setPayerName(
      user?.full_name ||
        user?.name ||
        ""
    );

    setPhone("");
    setReference("");
    setPaymentError("");
    setPaymentStep(1);
    setPaymentOpen(true);
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

    if (!cleanPhone && !paymentConfig?.fedapay_enabled) {
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

      setReference(generatedReference);

      const paymentUrl = response?.data?.payment_url;
      if (paymentUrl) {
        let safePaymentUrl;
        try {
          safePaymentUrl = new URL(paymentUrl);
        } catch {
          throw new Error("Lien de paiement FedaPay invalide.");
        }

        if (safePaymentUrl.protocol !== "https:") {
          throw new Error("Le lien de paiement doit utiliser HTTPS.");
        }

        try {
          window.sessionStorage.setItem(
            "winpulse_payment_reference",
            generatedReference
          );
        } catch {
          // sessionStorage peut être indisponible en navigation privée stricte.
        }

        window.location.assign(safePaymentUrl.toString());
        return;
      }

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
      <div className="w-full max-w-2xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Un seul accès. Tout WinPulse.
          </h1>

          <p className="mt-3 text-sm text-slate-600">
            Paiement sécurisé via MTN Mobile Money Bénin · annulable à tout moment
          </p>

          {subscriptionTier !== "free" && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
                <Crown className="h-3.5 w-3.5" />
                Plan actif :{" "}
                {subscriptionTier.toUpperCase()}
              </div>
            )}
        </div>

        {plan ? (
          <Card
            data-testid={`plan-${plan.id}`}
            className="bg-white p-5 sm:p-8 relative w-full max-w-md mx-auto border-orange-500 ring-2 ring-orange-500 shadow-xl"
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
              <span className="font-heading text-4xl sm:text-5xl font-black tracking-tighter text-slate-900">
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
              disabled={isCurrent}
            >
              {isCurrent
                ? "Plan actuel"
                : `Débloquer ${plan.name}`}
            </Button>

            <p className="text-center text-xs text-slate-400 mt-4">
              Sans engagement · résiliable à tout moment · support WhatsApp inclus
            </p>
          </Card>
        ) : (
          <p className="text-center text-slate-500 text-sm">
            Aucun plan disponible pour le moment.
          </p>
        )}
      </div>

      {paymentOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 lg:p-6"
          data-testid="subscription-payment-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Paiement WinPulse"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fermer"
            onClick={closePayment}
          />

          <div
            className="relative z-10 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-lg sm:rounded-2xl"
            data-testid="subscription-payment-modal"
          >
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 px-4 sm:px-5 py-3.5 sm:py-4">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-600">
                  Paiement WinPulse
                </div>
                <h2 className="mt-1 truncate text-lg sm:text-xl font-extrabold text-slate-900">
                  {paymentStep === 1 ? "Informations de paiement" : "Détails du paiement"}
                </h2>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  WinPulse Pro · {formatXof(amount)} FCFA / mois
                </div>
              </div>

              <button
                type="button"
                onClick={closePayment}
                disabled={submitting}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 disabled:opacity-50"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 sm:py-5 pb-6">
              {paymentStep === 1 ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
                    <div className="text-xs text-slate-500">Montant de l'abonnement</div>
                    <div className="text-2xl font-black text-orange-600">
                      {formatXof(amount)} FCFA
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">30 jours · WinPulse Pro</div>
                  </div>

                  {paymentConfig?.fedapay_enabled && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-5 text-emerald-800">
                      <strong>Paiement sécurisé par FedaPay.</strong> Après validation, tu seras redirigé vers la page de paiement.
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Email du compte</label>
                    <input
                      type="email"
                      value={user?.email || ""}
                      readOnly
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Nom utilisé pour le paiement</label>
                    <input
                      type="text"
                      value={payerName}
                      onChange={(event) => setPayerName(event.target.value)}
                      placeholder="Nom et prénom"
                      autoComplete="name"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {paymentConfig?.fedapay_enabled ? "Téléphone (facultatif)" : "Numéro MTN Mobile Money"}
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder={paymentConfig?.fedapay_enabled ? "Ex. +229 01 97 00 00 00" : "Ex. 01 97 00 00 00"}
                      autoComplete="tel"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  {paymentError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      {paymentError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="text-xs font-bold text-emerald-700">Référence de suivi</div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="min-w-0 break-all font-mono text-lg sm:text-xl font-black text-slate-900">{reference}</div>
                      <button
                        type="button"
                        onClick={copyReference}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-200 bg-white text-emerald-700"
                        aria-label="Copier la référence"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="font-bold text-slate-900">Procédure MTN Mobile Money</h3>
                    <ol className="mt-3 space-y-3 text-sm text-slate-700">
                      <li>1. Compose <strong>*165#</strong> ou ouvre l'application MTN MoMo.</li>
                      <li>2. Envoie <strong>{formatXof(amount)} FCFA</strong> au <strong>{MOMO_NUMBER}</strong>.</li>
                      <li>3. Vérifie le destinataire : <strong>{MOMO_RECIPIENT_NAME}</strong>.</li>
                      <li>4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 sm:px-5 pt-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-10px_24px_rgba(15,23,42,0.08)]">
              {paymentStep === 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={submitting}
                  data-testid="subscription-inline-next"
                  className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-base font-extrabold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-wait disabled:bg-slate-400"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {paymentConfig?.fedapay_enabled ? "Ouverture du paiement…" : "Préparation du paiement…"}
                    </>
                  ) : (
                    paymentConfig?.fedapay_enabled
                      ? `Payer ${formatXof(amount)} FCFA`
                      : `Continuer — ${formatXof(amount)} FCFA`
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openWhatsApp}
                  className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm sm:text-base font-extrabold text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  Envoyer la confirmation sur WhatsApp
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
