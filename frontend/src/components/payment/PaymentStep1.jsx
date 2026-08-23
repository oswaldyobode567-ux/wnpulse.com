"use client";

import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

/**
 * Payment Step 1 - Summary and Form
 * @param {Object} props
 * @param {Object} props.tier - Subscription tier
 * @param {string} props.reference - Payment reference
 * @param {string} props.phone - Phone number
 * @param {string} props.payerName - Payer name
 * @param {boolean} props.acceptedTerms - Terms acceptance
 * @param {boolean} props.submitting - Is submitting
 * @param {Function} props.onPhoneChange - Phone change handler
 * @param {Function} props.onNameChange - Name change handler
 * @param {Function} props.onTermsChange - Terms acceptance handler
 * @param {Function} props.onContinue - Continue button handler
 * @param {Function} props.onCancel - Cancel button handler
 */
export function PaymentStep1({
  tier = { price: 0, perks: [], accent: "from-orange-500 to-amber-500" },
  reference = "",
  phone = "",
  payerName = "",
  acceptedTerms = false,
  submitting = false,
  onPhoneChange = () => {},
  onNameChange = () => {},
  onTermsChange = () => {},
  onContinue = () => {},
  onCancel = () => {},
}) {
  const amount = Number(tier?.price ?? 0);

  return (
    <div className="space-y-5" data-testid="payment-step-1">
      {/* Price Summary */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Total à régler
          </span>
          <span className="text-[10px] font-bold px-2 py-1 bg-white border border-slate-200 rounded text-slate-600">
            1 mois
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className="font-heading text-4xl font-black text-slate-900 tracking-tighter"
            data-testid="payment-amount"
          >
            {amount.toLocaleString("fr-FR")}
          </span>
          <span className="text-sm text-slate-500 font-medium">FCFA</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Référence commande :{" "}
          <span
            className="font-mono font-semibold text-slate-700"
            data-testid="payment-reference"
          >
            {reference}
          </span>
        </div>
      </div>

      {/* Perks List */}
      <ul className="space-y-2">
        {tier?.perks?.map((perk, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-slate-700"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            {perk}
          </li>
        ))}
      </ul>

      {/* Form Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pm-name" className="text-xs">
            Nom complet
          </Label>
          <Input
            id="pm-name"
            value={payerName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Ex. Yobode Oswald"
            className="mt-1"
            data-testid="payment-payer-name"
          />
        </div>
        <div>
          <Label htmlFor="pm-phone" className="text-xs">
            Numéro MTN MoMo
          </Label>
          <Input
            id="pm-phone"
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="+229 XX XX XX XX"
            className="mt-1"
            data-testid="payment-phone"
          />
        </div>
      </div>

      {/* Security Info */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        Aucune carte requise · Validation manuelle par notre équipe sous 1h
      </div>

      {/* Terms Checkbox */}
      <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-amber-200 bg-amber-50/60 p-3 hover:bg-amber-50 transition-colors">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => onTermsChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-amber-400 text-orange-600 focus:ring-orange-500 cursor-pointer"
          data-testid="payment-accept-terms"
        />
        <span className="text-xs text-slate-700 leading-relaxed">
          J'ai compris qu'<strong>aucun remboursement n'est possible après activation</strong> de
          l'abonnement (service numérique consommable immédiatement). J'accepte les{" "}
          <a
            href="/legal/cgv"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-700 font-semibold underline"
          >
            CGV
          </a>{" "}
          et la{" "}
          <a
            href="/legal/confidentialite"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-700 font-semibold underline"
          >
            politique de confidentialité
          </a>
          .
        </span>
      </label>

      {/* Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
        <Button
          variant="ghost"
          onClick={onCancel}
          data-testid="payment-cancel-btn"
        >
          Annuler
        </Button>
        <Button
          className={`bg-gradient-to-r ${tier.accent} text-white border-0 hover:opacity-90 font-semibold disabled:opacity-50`}
          onClick={onContinue}
          disabled={submitting || !acceptedTerms}
          data-testid="payment-next-btn"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Continuer <ArrowRight className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
