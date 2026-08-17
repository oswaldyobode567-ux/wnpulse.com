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

// CORRECTIF : ce fichier avait son PROPRE TIER_CONFIG code en dur (Pro a
// 4 900 FCFA, Elite a 14 900 FCFA — un plan Elite qui n'existe meme plus
// depuis le passage a un palier unique a 6 500 FCFA cote backend). C'est
// cette incoherence precise qui faisait que le prix affiche au clic ne
// correspondait jamais au vrai montant facture. Desormais, le plan reel
// (nom, prix, avantages) est recupere dynamiquement depuis /api/plans au
// chargement du modal — plus aucun prix ni nom de palier code en dur ici.
const FALLBACK_TIER = {
  label: "Pro",
  price: 6500,
  accent: "from-orange-500 to-rose-500",
  icon: Sparkles,
  perks: [
    "Accès illimité à tous les pronostics, tous les jours",
    "Tous les combinés débloqués",
    "Analyse IA experte sur chaque match",
    "Value bets & Track Record détaillé",
  ],
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

  // Recupere le VRAI plan (nom/prix/avantages) depuis le backend — plus
  // aucune valeur codee en dur ici. Comme il n'existe plus qu'un seul
  // palier, targetTier n'est conserve que pour compatibilite d'appel mais
  // n'affecte plus le prix affiche : c'est toujours le plan reel qui prime.
  const [plan, setPlan] = useState(FALLBACK_TIER);
  const [planId, setPlanId] = useState("pro");
  useEffect(() => {
    api.get("/plans")
      .then(r => {
        const p = r.data?.[0];
        if (!p) return;
        setPlanId(p.id || "pro");
        setPlan({
          label: p.name || "Pro",
          price: p.price_xof ?? p.price_fcfa ?? p.price ?? FALLBACK_TIER.price,
          accent: FALLBACK_TIER.accent,
          icon: (p.name || "").toLowerCase().includes("elite") ? Crown : Sparkles,
          perks: Array.isArray(p.features) && p.features.length ? p.features : FALLBACK_TIER.perks,
        });
      })
      .catch(() => {}); // silencieux : le fallback ci-dessus reste utilisable
  }, []);

  const tier = plan;
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
      setPhone(""); setPayerName(user?.full_name || "");
      setSubmitting(false);
      setConfirmed(false);
      setAcceptedTerms(false);
    }
  }, [isOpen, user?.full_name]);

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
      // CORRECTIF : envoie toujours planId (recupere du backend), jamais
      // targetTier — au cas ou un appelant passerait encore "ELITE" par
      // habitude, ca n'enverrait plus un plan_id inexistant au backend.
      const { data } = await api.post("/subscription/checkout", {
        tier: planId,
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
            </div>  <div>
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
          </div>   </div>
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
