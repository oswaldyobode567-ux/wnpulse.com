import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  Smartphone,
  X,
} from "lucide-react";

const MOMO_NUMBER = "+229 01 66 28 06 03";
const MOMO_RECIPIENT_NAME = "KOUKPAKI VIANEY";
const WHATSAPP_NUMBER = "33767971752";

function formatXof(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("fr-FR")
    : "0";
}

export default function PaymentModal({
  isOpen,
  onClose,
  targetTier = "PRO",
}) {
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState(null);
  const [planId, setPlanId] = useState(
    String(targetTier || "pro").toLowerCase()
  );
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setStep(1);
    setReference("");
    setError("");

    const initialName =
      user?.full_name ||
      user?.name ||
      "";

    setPayerName(initialName);

    let cancelled = false;

    async function loadPlan() {
      setLoadingPlan(true);

      try {
        const response = await api.get("/plans");
        if (cancelled) return;

        const plans = Array.isArray(response?.data)
          ? response.data
          : [];

        const requestedId =
          String(targetTier || "").toLowerCase();

        const selectedPlan =
          plans.find(
            (item) =>
              String(item?.id || "").toLowerCase() ===
              requestedId
          ) ||
          plans[0] ||
          null;

        if (selectedPlan) {
          setPlan(selectedPlan);
          setPlanId(
            String(selectedPlan.id || "pro").toLowerCase()
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            "Impossible de charger les informations du plan."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPlan(false);
        }
      }
    }

    loadPlan();

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetTier, user]);

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

  if (!isOpen) return null;

  const close = () => {
    if (submitting) return;
    onClose?.();
  };

  const goNext = async () => {
    const cleanName = payerName.trim();
    const cleanPhone = phone.trim();

    if (!cleanName) {
      setError("Indique le nom utilisé pour le paiement.");
      return;
    }

    if (!cleanPhone) {
      setError(
        "Indique le numéro MTN Mobile Money utilisé pour le paiement."
      );
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await api.post(
        "/subscription/checkout",
        {
          tier: planId,
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
      setStep(2);
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.message ||
        "Impossible de générer la référence de paiement.";

      setError(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Le navigateur peut bloquer le presse-papiers.
    }
  };

  const openWhatsApp = () => {
    const message = [
      "Bonjour WinPulse !",
      "",
      `Je viens d'effectuer le paiement pour activer mon plan ${plan?.name || "WinPulse Pro"}.`,
      "",
      `Référence : ${reference}`,
      `Montant : ${formatXof(amount)} FCFA`,
      `Numéro MTN MoMo utilisé : ${phone.trim()}`,
      `Destinataire payé : ${MOMO_RECIPIENT_NAME}`,
      `Nom : ${payerName.trim()}`,
      `Email du compte : ${user?.email || ""}`,
      "",
      "Voici la confirmation de paiement. Merci de vérifier et d'activer mon accès.",
    ].join("\n");

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      message
    )}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Paiement WinPulse"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fermer"
        onClick={close}
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-600">
              Paiement WinPulse
            </p>

            <h2 className="mt-1 font-heading text-xl font-extrabold text-slate-900">
              {step === 1
                ? "Informations de paiement"
                : "Procédure de paiement"}
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Étape {step} sur 2
            </p>
          </div>

          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {loadingPlan ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : step === 1 ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">
                      Offre choisie
                    </div>
                    <div className="font-heading text-lg font-bold text-slate-900">
                      {plan?.name || "WinPulse Pro"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-heading text-xl font-black text-orange-600">
                      {formatXof(amount)} FCFA
                    </div>
                    <div className="text-[10px] text-slate-500">
                      / mois
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="payment-email"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  Email du compte
                </label>

                <input
                  id="payment-email"
                  type="email"
                  value={user?.email || ""}
                  readOnly
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="payment-name"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  Nom utilisé pour le paiement
                </label>

                <input
                  id="payment-name"
                  type="text"
                  value={payerName}
                  onChange={(event) =>
                    setPayerName(event.target.value)
                  }
                  autoComplete="name"
                  placeholder="Nom et prénom"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label
                  htmlFor="payment-phone"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  Numéro MTN Mobile Money utilisé
                </label>

                <input
                  id="payment-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value)
                  }
                  autoComplete="tel"
                  placeholder="Ex. 01 97 00 00 00"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />

                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-emerald-800">
                      Référence de suivi générée
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      <div className="break-all font-mono text-lg font-black text-slate-900">
                        {reference}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          copyText(reference)
                        }
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-emerald-200 bg-white text-emerald-700"
                        aria-label="Copier la référence"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-orange-600" />

                  <h3 className="font-heading font-bold text-slate-900">
                    Procédure MTN Mobile Money
                  </h3>
                </div>

                <ol className="space-y-3 text-sm text-slate-700">
                  <li>
                    1. Compose <strong>*165#</strong> sur ton téléphone MTN ou ouvre l'application MoMo.
                  </li>

                  <li>
                    2. Envoie <strong>{formatXof(amount)} FCFA</strong> au numéro{" "}
                    <strong>{MOMO_NUMBER}</strong>.
                  </li>

                  <li>
                    3. Vérifie que le destinataire affiché est{" "}
                    <strong>{MOMO_RECIPIENT_NAME}</strong>.
                  </li>

                  <li>
                    4. Garde le SMS de confirmation MTN puis envoie la confirmation à WinPulse sur WhatsApp.
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-neutral-200 bg-white px-5 py-4">
          {step === 1 ? (
            <Button
              type="button"
              onClick={goNext}
              disabled={
                submitting ||
                loadingPlan ||
                !payerName.trim() ||
                !phone.trim()
              }
              className="h-12 w-full wp-gradient-warm text-white border-0"
              data-testid="payment-next-button"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération de la référence…
                </>
              ) : (
                <>
                  Suivant
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <div className="grid gap-2">
              <Button
                type="button"
                onClick={openWhatsApp}
                className="h-12 w-full bg-[#25D366] text-white hover:bg-[#1ebe5c]"
                data-testid="payment-whatsapp-button"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Envoyer la confirmation sur WhatsApp
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={close}
                className="h-10 w-full"
              >
                Fermer
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
