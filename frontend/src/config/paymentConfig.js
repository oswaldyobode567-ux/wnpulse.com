import { Sparkles, Crown } from "lucide-react";

export const PAYMENT_CONFIG = {
  merchant: "+229 01 66 28 06 03",
  ownerName: "KOUKPAKI VIANEY",
  whatsapp: "+33 7 67 97 17 52",
};

export const FALLBACK_TIER = {
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

export const TIER_ICONS = {
  elite: Crown,
  default: Sparkles,
};
