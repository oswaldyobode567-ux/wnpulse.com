/**
 * Validate payment form inputs
 * @param {Object} params
 * @param {Object} params.user - User object
 * @param {string} params.phone - Phone number
 * @param {string} params.payerName - Payer name
 * @param {boolean} params.acceptedTerms - Terms acceptance
 * @returns {Object} { valid: boolean, message?: string }
 */
export function validatePaymentForm({
  user,
  phone,
  payerName,
  acceptedTerms,
}) {
  if (!user) {
    return {
      valid: false,
      message: "Crée ton compte gratuit pour finaliser le paiement",
      action: "register",
    };
  }

  if (!phone?.trim()) {
    return {
      valid: false,
      message: "Numéro MTN MoMo requis",
    };
  }

  if (!payerName?.trim()) {
    return {
      valid: false,
      message: "Nom complet requis",
    };
  }

  if (!acceptedTerms) {
    return {
      valid: false,
      message: "Vous devez accepter les conditions de remboursement",
    };
  }

  return { valid: true };
}
