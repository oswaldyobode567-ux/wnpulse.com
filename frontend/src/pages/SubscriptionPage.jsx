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
            Paiement sécurisé via MTN Mobile Money Bénin · annulable à tout moment
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
          className="fixed inset-0 z-[99999] flex items-start sm:items-center justify-center overflow-y-auto bg-slate-950/70 p-3 sm:p-6"
          data-testid="subscription-payment-overlay"
        >
          <button
            type="button"
            className="fixed inset-0"
            aria-label="Fermer"
            onClick={closePayment}
          />

          <div
            className="relative z-10 my-auto w-full max-w-lg rounded-2xl bg-white shadow-2xl"
            data-testid="subscription-payment-modal"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-600">
                  Paiement WinPulse
                </div>

                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  {paymentStep === 1
                    ? "Informations de paiement"
                    : "Détails du paiement"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closePayment}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {paymentStep === 1 ? (
              <div className="space-y-4 p-5">
                <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
                  <div className="text-xs text-slate-500">
                    Montant
                  </div>

                  <div className="text-2xl font-black text-orange-600">
                    {formatXof(
                      amount
                    )}{" "}
                    FCFA
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Email du compte
                  </label>

                  <input
                    type="email"
                    value={
                      user?.email || ""
                    }
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Nom utilisé pour le paiement
                  </label>

                  <input
                    type="text"
                    value={payerName}
                    onChange={(event) =>
                      setPayerName(
                        event.target.value
                      )
                    }
                    placeholder="Nom et prénom"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Numéro MTN Mobile Money
                  </label>

                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                    placeholder="Ex. 01 97 00 00 00"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm"
                  />
                </div>

                {paymentError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {paymentError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={goNext}
                  disabled={submitting}
                  data-testid="subscription-inline-next"
                  style={{
                    display: "flex",
                    width: "100%",
                    minHeight: "52px",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    border: "0",
                    borderRadius: "10px",
                    background:
                      submitting
                        ? "#94a3b8"
                        : "#f97316",
                    color: "#ffffff",
                    fontSize: "16px",
                    fontWeight: 800,
                    cursor:
                      submitting
                        ? "wait"
                        : "pointer",
                    opacity: 1,
                    visibility:
                      "visible",
                    position:
                      "relative",
                    zIndex: 100000,
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Génération…
                    </>
                  ) : (
                    "Suivant — afficher les détails du paiement"
                  )}
                </button>

                <p className="text-center text-[10px] text-slate-400">
                  Le bouton ci-dessus est intégré directement dans la page Abonnement.
                </p>
              </div>
            ) : (
              <div className="space-y-5 p-5">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-bold text-emerald-700">
                    Référence de suivi
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="font-mono text-xl font-black text-slate-900">
                      {reference}
                    </div>

                    <button
                      type="button"
                      onClick={
                        copyReference
                      }
                      className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-200 bg-white text-emerald-700"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-slate-900">
                    Procédure MTN Mobile Money
                  </h3>

                  <ol className="mt-3 space-y-3 text-sm text-slate-700">
                    <li>
                      1. Compose{" "}
                      <strong>
                        *165#
                      </strong>{" "}
                      ou ouvre l'application MTN MoMo.
                    </li>

                    <li>
                      2. Envoie{" "}
                      <strong>
                        {formatXof(
                          amount
                        )}{" "}
                        FCFA
                      </strong>{" "}
                      au{" "}
                      <strong>
                        {MOMO_NUMBER}
                      </strong>
                      .
                    </li>

                    <li>
                      3. Vérifie le destinataire :{" "}
                      <strong>
                        {MOMO_RECIPIENT_NAME}
                      </strong>
                      .
                    </li>

                    <li>
                      4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.
                    </li>
                  </ol>
                </div>

                <button
                  type="button"
                  onClick={
                    openWhatsApp
                  }
                  style={{
                    display: "flex",
                    width: "100%",
                    minHeight: "52px",
                    alignItems: "center",
                    justifyContent:
                      "center",
                    gap: "8px",
                    border: "0",
                    borderRadius:
                      "10px",
                    background:
                      "#25D366",
                    color: "#ffffff",
                    fontWeight: 800,
                    cursor:
                      "pointer",
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Envoyer la confirmation sur WhatsApp
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
