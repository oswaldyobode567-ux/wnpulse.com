import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Copy,
  Crown,
  Sparkles,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  MessageCircle,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const TIER_CONFIG = {
  PRO: {
    label: "Pro",
    price: 4900,
    accent: "from-orange-500 to-rose-500",
    icon: Sparkles,
    perks: [
      "Tous les pronostics du jour (7 sports)",
      "3 combinés (Sécurité / Équilibre / Jackpot)",
      "Analyse IA Claude Sonnet",
      "Value bets & track record détaillé",
    ],
  },
  ELITE: {
    label: "Elite",
    price: 14900,
    accent: "from-amber-500 via-rose-500 to-fuchsia-600",
    icon: Crown,
    perks: [
      "Tout du plan Pro",
      "Picks VIP envoyés en avant-première",
      "Stratégie bankroll personnalisée",
      "Support prioritaire WhatsApp",
    ],
  },
};

function genRef() {
  const part = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  return `PE-${part.padEnd(8, "X").slice(0, 8)}`;
}

function formatXof(n) {
  return n.toLocaleString("fr-FR");
}

const MERCHANT = "+229 01 66 28 06 03";
const OWNER_NAME = "KOUKPAKI VIANEY";
const WHATSAPP = "+33 7 67 97 17 52";

export default function PaymentModal({ isOpen, onClose, targetTier = "PRO" }) {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const tierKey = (targetTier || "PRO").toUpperCase();
  const tier = TIER_CONFIG[tierKey] || TIER_CONFIG.PRO;
  const TierIcon = tier.icon;

  const [step, setStep] = useState(1); // 1 summary, 2 instructions, 3 confirmation
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [payerName, setPayerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Reset whenever the modal is opened/closed or tier changes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setReference(genRef());
      setPhone("");
      setPayerName(user?.full_name || "");
      setSubmitting(false);
      setConfirmed(false);
      setAcceptedTerms(false);
    }
  }, [isOpen, tierKey, user?.full_name]);

  const whatsappUrl = useMemo(() => {
    const cleanWa = WHATSAPP.replace(/[^0-9]/g, "");
    const msg = [
      `Bonjour WinPulse !`,
      `Je viens d'effectuer le paiement pour activer mon plan *${tier.label}*.`,
      ``,
      `• Référence : *${reference}*`,
      `• Montant : *${formatXof(tier.price)} FCFA*`,
      `• Numéro MTN MoMo utilisé : *${phone || "(à compléter)"}*`,
      `• Destinataire payé : *${OWNER_NAME}*`,
      `• Nom : *${payerName || user?.full_name || "(à compléter)"}*`,
      `• Email du compte : *${user?.email || "(non connecté)"}*`,
      ``,
      `Voici la capture du SMS de confirmation MTN. Merci d'activer mon accès 🚀`,
    ].join("\n");
    return `https://wa.me/${cleanWa}?text=${encodeURIComponent(msg)}`;
  }, [reference, tier, phone, payerName, user]);

  const handleClose = () => {
    onClose?.();
  };

  const goToInstructions = async () => {
    if (!user) {
      toast.info("Crée ton compte gratuit pour finaliser le paiement");
      handleClose();
      navigate("/register");
      return;
    }
    if (!phone.trim()) {
      toast.error("Numéro MTN MoMo requis");
      return;
    }
    if (!payerName.trim()) {
      toast.error("Nom complet requis");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Vous devez accepter les conditions de remboursement");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/subscription/checkout", {
        tier: tierKey.toLowerCase(),
        phone: phone.trim(),
        payer_name: payerName.trim(),
      });
      // Use server-issued reference if returned (already PE-XXXXXXXX), else keep local
      if (data?.reference) setReference(data.reference);
      setStep(2);
    } catch (err) {
      // Record fails (e.g. offline) — fall back to local ref so user can still pay manually
      toast.warning("Connexion limitée — vous pouvez quand même payer, prévenez-nous via WhatsApp.");
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
    setConfirmed(true);
    setStep(3);
    // Refresh user in background — admin will activate after verification
    refresh?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" data-testid="payment-modal">
        {/* Gradient header */}
        <div className={`relative bg-gradient-to-br ${tier.accent} px-6 pt-6 pb-5 text-white`}>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/15 backdrop-blur-sm grid place-items-center ring-1 ring-white/25">
              <TierIcon className="h-5 w-5" />
            </div>
            <div>
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle className="text-white font-heading text-xl font-extrabold tracking-tight" data-testid="payment-modal-title">
                  Activer le plan {tier.label}
                </DialogTitle>
                <DialogDescription className="text-white/80 text-xs mt-0.5">
                  Paiement sécurisé · MTN Mobile Money Bénin
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          {/* Stepper */}
          <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={`h-6 w-6 rounded-full grid place-items-center text-[11px] ${
                    step >= s ? "bg-white text-slate-900" : "bg-white/20 text-white/70"
                  }`}
                  data-testid={`payment-step-${s}-indicator`}
                >
                  {step > s ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
                </div>
                <span className={step >= s ? "text-white" : "text-white/60"}>
                  {s === 1 ? "Récap" : s === 2 ? "Paiement" : "Confirmation"}
                </span>
                {s < 3 && <div className="flex-1 h-px bg-white/20" />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 bg-white">
          {/* STEP 1 — Summary */}
          {step === 1 && (
            <div className="space-y-5" data-testid="payment-step-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Total à régler</span>
                  <Badge variant="outline" className="text-[10px]">1 mois</Badge>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-heading text-4xl font-black text-slate-900 tracking-tighter" data-testid="payment-amount">
                    {formatXof(tier.price)}
                  </span>
                  <span className="text-sm text-slate-500 font-medium">FCFA</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Référence commande : <span className="font-mono font-semibold text-slate-700" data-testid="payment-reference">{reference}</span>
                </div>
              </div>

              <ul className="space-y-2">
                {tier.perks.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pm-name" className="text-xs">Nom complet</Label>
                  <Input
                    id="pm-name"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="Ex. Yobode Oswald"
                    className="mt-1"
                    data-testid="payment-payer-name"
                  />
                </div>
                <div>
                  <Label htmlFor="pm-phone" className="text-xs">Numéro MTN MoMo</Label>
                  <Input
                    id="pm-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+229 XX XX XX XX"
                    className="mt-1"
                    data-testid="payment-phone"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                Aucune carte requise · Validation manuelle par notre équipe sous 1h
              </div>

              {/* No-refund consent checkbox */}
              <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-amber-200 bg-amber-50/60 p-3 hover:bg-amber-50 transition-colors">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 text-orange-600 focus:ring-orange-500 cursor-pointer"
                  data-testid="payment-accept-terms"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  J'ai compris qu'<strong>aucun remboursement n'est possible après activation</strong> de l'abonnement (service numérique consommable immédiatement). J'accepte les{" "}
                  <a href="/legal/cgv" target="_blank" rel="noopener noreferrer" className="text-orange-700 font-semibold underline">CGV</a> et la{" "}
                  <a href="/legal/confidentialite" target="_blank" rel="noopener noreferrer" className="text-orange-700 font-semibold underline">politique de confidentialité</a>.
                </span>
              </label>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                <Button variant="ghost" onClick={handleClose} data-testid="payment-cancel-btn">
                  Annuler
                </Button>
                <Button
                  className={`bg-gradient-to-r ${tier.accent} text-white border-0 hover:opacity-90 font-semibold disabled:opacity-50`}
                  onClick={goToInstructions}
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
          )}

          {/* STEP 2 — Instructions */}
          {step === 2 && (
            <div className="space-y-4" data-testid="payment-step-2">
              <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-yellow-400 grid place-items-center text-slate-900">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <span className="font-heading font-extrabold text-slate-900 text-sm">MTN Mobile Money</span>
                  </div>
                  <Badge className="bg-yellow-400 text-slate-900 border-0">Bénin</Badge>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <CopyRow label="Numéro MTN MoMo" value={MERCHANT} onCopy={copy} testid="copy-merchant" />
                  <CopyRow label="Nom du destinataire" value={OWNER_NAME} onCopy={copy} testid="copy-owner" />
                  <CopyRow label="Montant" value={`${formatXof(tier.price)} FCFA`} rawValue={tier.price} onCopy={copy} testid="copy-amount" />
                  <CopyRow label="Référence (motif)" value={reference} onCopy={copy} testid="copy-reference" mono />
                </div>
              </div>

              <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
                <li>Composez <span className="font-mono font-bold">*880#</span> sur ton téléphone MTN Bénin.</li>
                <li>Choisis <strong>Transfert d'argent</strong>.</li>
                <li>Saisis le <strong>numéro</strong> : <span className="font-mono">{MERCHANT}</span></li>
                <li><strong>Vérifie le nom affiché</strong> : il doit être <strong className="text-orange-700">{OWNER_NAME}</strong>. Sinon, annule immédiatement.</li>
                <li>Montant exact : <span className="font-mono">{formatXof(tier.price)} FCFA</span>.</li>
                <li>Référence (motif) : <span className="font-mono">{reference}</span>.</li>
                <li>Confirme avec ton <strong>code PIN MTN</strong>.</li>
                <li>Envoie la capture du SMS de confirmation sur WhatsApp <span className="font-mono">{WHATSAPP}</span>.</li>
              </ol>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#25D366] hover:bg-[#1ebe5c] text-white font-bold py-2.5 transition-colors"
                data-testid="payment-whatsapp-link"
              >
                <MessageCircle className="h-4 w-4" />
                Confirmer sur WhatsApp ({WHATSAPP})
              </a>

              <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                <Clock className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                Notre équipe valide manuellement chaque paiement (en moyenne sous 1h). Tu recevras un email dès activation.
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-1">
                <Button variant="ghost" onClick={() => setStep(1)} data-testid="payment-back-btn">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Retour
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  onClick={markPaid}
                  data-testid="payment-mark-paid-btn"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> J'ai effectué le paiement
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 — Confirmation */}
          {step === 3 && (
            <div className="space-y-4 text-center py-2" data-testid="payment-step-3">
              <div className="mx-auto h-16 w-16 rounded-full bg-emerald-50 grid place-items-center ring-4 ring-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <div className="font-heading text-xl font-extrabold text-slate-900">Merci, on s'en occupe ! 🎉</div>
                <p className="text-sm text-slate-600 mt-1">
                  Ton paiement <span className="font-mono font-semibold">{reference}</span> est en cours de vérification.
                  Tu recevras un email de confirmation dès que ton plan <strong>{tier.label}</strong> sera activé.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-left text-xs text-slate-600 space-y-1">
                <div className="flex justify-between"><span>Plan</span><span className="font-semibold text-slate-900">{tier.label}</span></div>
                <div className="flex justify-between"><span>Montant</span><span className="font-semibold text-slate-900">{formatXof(tier.price)} FCFA</span></div>
                <div className="flex justify-between"><span>Référence</span><span className="font-mono font-semibold text-slate-900">{reference}</span></div>
              </div>

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
                  onClick={handleClose}
                  data-testid="payment-done-btn"
                >
                  Terminé
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CopyRow({ label, value, rawValue, onCopy, testid, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-white/70 rounded-lg px-3 py-2 border border-amber-200/60">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">{label}</div>
        <div className={`text-slate-900 font-bold text-sm truncate ${mono ? "font-mono" : ""}`} data-testid={`${testid}-value`}>
          {value}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 hover:bg-amber-100"
        onClick={() => onCopy(rawValue ?? value, `${label} copié`)}
        data-testid={`${testid}-btn`}
        aria-label={`Copier ${label}`}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}
