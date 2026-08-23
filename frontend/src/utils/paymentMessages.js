import { formatXof } from "./currency";
import { PAYMENT_CONFIG } from "@/config/paymentConfig";

/**
 * Build WhatsApp message for payment confirmation
 * @param {Object} params
 * @param {Object} params.tier - The subscription tier
 * @param {string} params.reference - Payment reference
 * @param {string} params.phone - Payer phone number
 * @param {string} params.payerName - Payer name
 * @param {Object} params.user - User object
 * @returns {string} WhatsApp message
 */
export function buildWhatsAppMessage({
  tier,
  reference,
  phone,
  payerName,
  user,
}) {
  return [
    `Bonjour WinPulse !`,
    `Je viens d'effectuer le paiement pour activer mon plan *${tier.label}*.`,
    ``,
    `• Référence : *${reference}*`,
    `• Montant : *${formatXof(tier.price)} FCFA*`,
    `• Numéro MTN MoMo utilisé : *${phone || "(à compléter)"}*`,
    `• Destinataire payé : *${PAYMENT_CONFIG.ownerName}*`,
    `• Nom : *${payerName || user?.full_name || "(à compléter)"}*`,
    `• Email du compte : *${user?.email || "(non connecté)"}*`,
    ``,
    `Voici la capture du SMS de confirmation MTN. Merci d'activer mon accès 🚀`,
  ].join("\n");
}

/**
 * Build WhatsApp URL with pre-filled message
 * @param {string} message - The message to send
 * @param {string} [phoneNumber] - WhatsApp number (default from config)
 * @returns {string} WhatsApp URL
 */
export function buildWhatsAppUrl(message, phoneNumber = PAYMENT_CONFIG.whatsapp) {
  const cleanWa = phoneNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleanWa}?text=${encodeURIComponent(message)}`;
}
