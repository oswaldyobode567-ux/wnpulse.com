import { MessageCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatXof } from "@/utils/currency";
import { PAYMENT_CONFIG } from "@/config/paymentConfig";

/**
 * Payment Step 3 - Confirmation
 * @param {Object} props
 * @param {Object} props.tier - Subscription tier
 * @param {string} props.reference - Payment reference
 * @param {string} props.whatsappUrl - WhatsApp URL
 * @param {Function} props.onClose - Close handler
 */
export function PaymentStep3({
  tier,
  reference,
  whatsappUrl,
  onClose,
}) {
  return (
    <div className="space-y-4 text-center py-2" data-testid="payment-step-3">
      {/* Success Icon */}
      <div className="mx-auto h-16 w-16 rounded-full bg-emerald-50 grid place-items-center ring-4 ring-emerald-100">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>

      {/* Success Message */}
      <div>
        <div className="font-heading text-xl font-extrabold text-slate-900">
          Merci, on s'en occupe ! 🎉
        </div>
        <p className="text-sm text-slate-600 mt-1">
          Ton paiement{" "}
          <span className="font-mono font-semibold">{reference}</span> est en
          cours de vérification. Tu recevras un email de confirmation dès que
          ton plan <strong>{tier.label}</strong> sera activé.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-left text-xs text-slate-600 space-y-1">
        <div className="flex justify-between">
          <span>Plan</span>
          <span className="font-semibold text-slate-900">{tier.label}</span>
        </div>
        <div className="flex justify-between">
          <span>Montant</span>
          <span className="font-semibold text-slate-900">
            {formatXof(tier.price)} FCFA
          </span>
        </div>
        <div className="flex justify-between">
          <span>Référence</span>
          <span className="font-mono font-semibold text-slate-900">
            {reference}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#25D366] hover:bg-[#1ebe5c] text-white font-bold py-2.5 transition-colors text-sm"
          data-testid="payment-whatsapp-followup"
        >
          <MessageCircle className="h-4 w-4" /> Envoyer la capture
        </a>
        <Button
          variant="outline"
          className="flex-1"
          onClick={onClose}
          data-testid="payment-done-btn"
        >
          Terminé
        </Button>
      </div>
    </div>
  );
}
