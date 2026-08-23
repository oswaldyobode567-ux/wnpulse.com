import { ArrowLeft, MessageCircle, Smartphone, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyRow } from "./CopyRow";
import { formatXof } from "@/utils/currency";
import { PAYMENT_CONFIG } from "@/config/paymentConfig";

/**
 * Payment Step 2 - Payment Instructions
 * @param {Object} props
 * @param {Object} props.tier - Subscription tier
 * @param {string} props.reference - Payment reference
 * @param {string} props.whatsappUrl - WhatsApp URL
 * @param {Function} props.onCopy - Copy handler
 * @param {Function} props.onMarkPaid - Mark as paid handler
 * @param {Function} props.onBack - Back button handler
 */
export function PaymentStep2({
  tier,
  reference,
  whatsappUrl,
  onCopy,
  onMarkPaid,
  onBack,
}) {
  return (
    <div className="space-y-4" data-testid="payment-step-2">
      {/* Payment Details Card */}
      <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-yellow-400 grid place-items-center text-slate-900">
              <Smartphone className="h-4 w-4" />
            </div>
            <span className="font-heading font-extrabold text-slate-900 text-sm">
              MTN Mobile Money
            </span>
          </div>
          <Badge className="bg-yellow-400 text-slate-900 border-0">
            Bénin
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-2.5">
          <CopyRow
            label="Numéro MTN MoMo"
            value={PAYMENT_CONFIG.merchant}
            onCopy={onCopy}
            testid="copy-merchant"
          />
          <CopyRow
            label="Nom du destinataire"
            value={PAYMENT_CONFIG.ownerName}
            onCopy={onCopy}
            testid="copy-owner"
          />
          <CopyRow
            label="Montant"
            value={`${formatXof(tier.price)} FCFA`}
            rawValue={tier.price}
            onCopy={onCopy}
            testid="copy-amount"
          />
          <CopyRow
            label="Référence (motif)"
            value={reference}
            onCopy={onCopy}
            testid="copy-reference"
            mono
          />
        </div>
      </div>

      {/* Instructions */}
      <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
        <li>
          Composez <span className="font-mono font-bold">*880#</span> sur ton
          téléphone MTN Bénin.
        </li>
        <li>
          Choisis <strong>Transfert d'argent</strong>.
        </li>
        <li>
          Saisis le <strong>numéro</strong> :{" "}
          <span className="font-mono">{PAYMENT_CONFIG.merchant}</span>
        </li>
        <li>
          <strong>Vérifie le nom affiché</strong> : il doit être{" "}
          <strong className="text-orange-700">{PAYMENT_CONFIG.ownerName}</strong>
          . Sinon, annule immédiatement.
        </li>
        <li>
          Montant exact :{" "}
          <span className="font-mono">{formatXof(tier.price)} FCFA</span>.
        </li>
        <li>
          Référence (motif) : <span className="font-mono">{reference}</span>.
        </li>
        <li>
          Confirme avec ton <strong>code PIN MTN</strong>.
        </li>
        <li>
          Envoie la capture du SMS de confirmation sur WhatsApp{" "}
          <span className="font-mono">{PAYMENT_CONFIG.whatsapp}</span>.
        </li>
      </ol>

      {/* WhatsApp Button */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#25D366] hover:bg-[#1ebe5c] text-white font-bold py-2.5 transition-colors"
        data-testid="payment-whatsapp-link"
      >
        <MessageCircle className="h-4 w-4" />
        Confirmer sur WhatsApp ({PAYMENT_CONFIG.whatsapp})
      </a>

      {/* Info Box */}
      <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
        <Clock className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
        Notre équipe valide manuellement chaque paiement (en moyenne sous 1h).
        Tu recevras un email dès activation.
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-1">
        <Button
          variant="ghost"
          onClick={onBack}
          data-testid="payment-back-btn"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Retour
        </Button>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          onClick={onMarkPaid}
          data-testid="payment-mark-paid-btn"
        >
          <CheckCircle2 className="h-4 w-4 mr-1.5" /> J'ai effectué le paiement
        </Button>
      </div>
    </div>
  );
}
