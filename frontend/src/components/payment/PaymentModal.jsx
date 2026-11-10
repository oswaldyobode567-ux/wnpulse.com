import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trackJourney } from "@/lib/journey";

export default function PaymentModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  return <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose?.(); }}>
    <DialogContent className="max-w-sm">
      <DialogHeader><DialogTitle>WinPulse Pro</DialogTitle>
        <DialogDescription>{t("Compare les accès et découvre les moyens de paiement disponibles.")}</DialogDescription>
      </DialogHeader>
      <Button className="wp-gradient-warm min-h-11 text-white" onClick={() => {
        trackJourney("pro");
        onClose?.();
        navigate(user ? "/app/abonnement" : "/register?next=pro");
      }}>{t("Découvrir l’offre Pro")} <ArrowRight className="ms-2 h-4 w-4" /></Button>
    </DialogContent>
  </Dialog>;
}
