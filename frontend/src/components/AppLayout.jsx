import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Globe2,
  LayoutDashboard,
  Trophy,
  Layers,
  History,
  CreditCard,
  LogOut,
  Zap,
  Crown,
  ShieldCheck,
  Target,
  TrendingUp,
  User,
  Gift,
  Sparkles,
  Radio,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { toast } from "sonner";

// Six langues, sans service de traduction externe ni dépendance supplémentaire.
// Les pages suivantes peuvent importer useLanguage depuis ce fichier AppLayout.
export const SUPPORTED_LANGUAGES = [
  { code: "fr", name: "Français", locale: "fr-FR", dir: "ltr" },
  { code: "en", name: "English", locale: "en-GB", dir: "ltr" },
  { code: "es", name: "Español", locale: "es-ES", dir: "ltr" },
  { code: "pt", name: "Português", locale: "pt-PT", dir: "ltr" },
  { code: "de", name: "Deutsch", locale: "de-DE", dir: "ltr" },
  { code: "ar", name: "العربية", locale: "ar", dir: "rtl" },
];
const LANGUAGE_STORAGE_KEY = "wnpulse_language";
const LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map(item => item.code));
const LANGUAGE_MESSAGES = {
  "fr": {
    "Choisir la langue": "Choisir la langue",
    "Langue de l’interface": "Langue de l’interface",
    "Dashboard": "Tableau de bord",
    "Live": "En direct",
    "Aujourd'hui": "Aujourd'hui",
    "À la une": "À la une",
    "Combinés": "Combinés",
    "Combo Builder": "Combo Builder",
    "Value bets": "Value bets",
    "Montante": "Montante",
    "Track record": "Track record",
    "Profil": "Profil",
    "Parrainage": "Parrainage",
    "Abonnement": "Abonnement",
    "Admin": "Admin",
    "New": "Nouveau",
    "10J": "10 j",
    "Free": "Gratuit",
    "Ton pouls de gagnant": "Ton pouls de gagnant",
    "Connecté": "Connecté",
    "Déconnexion": "Déconnexion",
    "Plus d'options": "Plus d'options",
    "Fermer": "Fermer",
    "Plus": "Plus",
    "Tableau": "Tableau",
    "Direct": "Direct",
    "Jour": "Jour",
    "Créer": "Créer",
    "Blog": "Blog",
    "Mentions légales": "Mentions légales",
    "CGV": "CGV",
    "Confidentialité": "Confidentialité",
    "Jeu responsable · 18+": "Jeu responsable · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublin, Irlande",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "Ta session a expiré. Reconnecte-toi pour continuer.",
    "EN COURS": "EN COURS",
    "ÉCHOUÉE": "ÉCHOUÉE",
    "TERMINÉE": "TERMINÉE",
    "AUCUNE": "AUCUNE",
    "Aucune montante active.": "Aucune montante active.",
    "Impossible de charger la montante.": "Impossible de charger la montante.",
    "Impossible d'actualiser la montante.": "Impossible d'actualiser la montante.",
    "Le capital initial doit être un nombre positif.": "Le capital initial doit être un nombre positif.",
    "La montante doit durer 10 ou 15 jours.": "La montante doit durer 10 ou 15 jours.",
    "Impossible de démarrer la montante.": "Impossible de démarrer la montante.",
    "Montante WinPulse": "Montante WinPulse",
    "10 → 15 jours": "10 → 15 jours",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.",
    "Actualiser": "Actualiser",
    "Montante indisponible": "Montante indisponible",
    "Contrôle administrateur": "Contrôle administrateur",
    "Montante 10 jours": "Montante 10 jours",
    "Montante 15 jours": "Montante 15 jours",
    "Capital initial": "Capital initial",
    "Démarrer": "Démarrer",
    "Recommencer": "Recommencer",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.",
    "Chargement de la montante…": "Chargement de la montante…",
    "Aucune montante active": "Aucune montante active",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "L'administrateur doit lancer une montante de 10 ou 15 jours.",
    "progression": "progression",
    "mise de départ": "mise de départ",
    "Capital théorique": "Capital théorique",
    "si les journées passent": "si les journées passent",
    "Progression": "Progression",
    "de la série": "de la série",
    "Progression de la série": "Progression de la série",
    "Jour {{day}} sur {{total}}": "Jour {{day}} sur {{total}}",
    "Pronostics du jour": "Pronostics du jour",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.",
    "Pick {{number}}": "Pick {{number}}",
    "Confiance": "Confiance",
    "Début :": "Début :",
    "En attente d'un pick qualifié": "En attente d'un pick qualifié",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.",
    "Historique": "Historique",
    "Aucune journée terminée.": "Aucune journée terminée.",
    "GAGNÉ": "GAGNÉ",
    "REMBOURSÉ": "REMBOURSÉ",
    "PERDU": "PERDU",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.",
    "Chargement…": "Chargement…",
    "Analyses sportives": "Analyses sportives",
    "Historique des résultats": "Historique des résultats",
    "Articles": "Articles",
    "Ouvrir l'app": "Ouvrir l'app",
    "Connexion": "Connexion",
    "S'inscrire": "S'inscrire",
    "Démarrer gratuit": "Démarrer gratuit",
    "Pronostics · Analyses · Résultats publics": "Pronostics · Analyses · Résultats publics",
    "Vise la victoire avec nos pronostics.": "Vise la victoire avec nos pronostics.",
    "Garde une longueur d’avance.": "Garde une longueur d’avance.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.",
    "Découvrir les pronostics": "Découvrir les pronostics",
    "Découvrir l’offre Pro": "Découvrir l’offre Pro",
    "Consulter l’historique complet": "Consulter l’historique complet",
    "Inscription sans carte": "Inscription sans carte",
    "Résultats publics": "Résultats publics",
    "Compte gratuit": "Compte gratuit",
    "Pronostics disponibles": "Pronostics disponibles",
    "Chargement des analyses…": "Chargement des analyses…",
    "Les analyses ne sont pas disponibles pour le moment.": "Les analyses ne sont pas disponibles pour le moment.",
    "Réessayer": "Réessayer",
    "Les analyses du jour arrivent prochainement.": "Les analyses du jour arrivent prochainement.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Consulte l’historique de résultats en attendant les prochaines sélections.",
    "Analyse réservée Pro": "Analyse réservée Pro",
    "Indice : {{value}} %": "Indice : {{value}} %",
    "Les indices d’analyse ne garantissent aucun résultat.": "Les indices d’analyse ne garantissent aucun résultat.",
    "Ouvrir l’application": "Ouvrir l’application",
    "Créer mon compte gratuit": "Créer mon compte gratuit",
    "Historique des pronostics": "Historique des pronostics",
    "Les résultats d’hier": "Les résultats d’hier",
    "Matchs du {{date}}.": "Matchs du {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.",
    "Voir tous les résultats": "Voir tous les résultats",
    "Chargement des résultats d’hier…": "Chargement des résultats d’hier…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "Le bilan d’hier n’est pas disponible pour le moment.",
    "Tu peux consulter l’historique complet des résultats.": "Tu peux consulter l’historique complet des résultats.",
    "Gagnants": "Gagnants",
    "Perdants": "Perdants",
    "En attente": "En attente",
    "Annulés / remboursés": "Annulés / remboursés",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.",
    "Aucun pronostic publié pour les matchs de cette journée.": "Aucun pronostic publié pour les matchs de cette journée.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.",
    "Gagné": "Gagné",
    "Cote publiée": "Cote publiée",
    "Score final": "Score final",
    "Pronostic publié avant le match · résultat confirmé.": "Pronostic publié avant le match · résultat confirmé.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Les résultats passés ne garantissent pas les prochains résultats.",
    "COMMENT UTILISER WINPULSE": "COMMENT UTILISER WINPULSE",
    "Une analyse pro, claire et immédiate": "Une analyse pro, claire et immédiate",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.",
    "Explications de match": "Explications de match",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.",
    "Scoring rigoureux": "Scoring rigoureux",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.",
    "Combinés par profil": "Combinés par profil",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.",
    "Track record transparent": "Track record transparent",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.",
    "Value bets détectés": "Value bets détectés",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Compare les estimations et les cotes proposées. Les estimations restent incertaines.",
    "Découverte gratuite": "Découverte gratuite",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Retrouve ton code et les conditions du programme dans ton compte.",
    "Voir mon code": "Voir mon code",
    "ABONNEMENT": "ABONNEMENT",
    "Choisis ton accès": "Choisis ton accès",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.",
    "Pour découvrir": "Pour découvrir",
    "Sélections gratuites disponibles": "Sélections gratuites disponibles",
    "Tous les matchs (cotes visibles)": "Tous les matchs (cotes visibles)",
    "Track record public": "Track record public",
    "pour 30 jours": "pour 30 jours",
    "Accès complet": "Accès complet",
    "Tous les pronostics débloqués": "Tous les pronostics débloqués",
    "Tous les combinés du jour": "Tous les combinés du jour",
    "Explications des pronostics": "Explications des pronostics",
    "Value bets et Combo Builder": "Value bets et Combo Builder",
    "Montante premium": "Montante premium",
    "Support WhatsApp prioritaire": "Support WhatsApp prioritaire",
    "Passer à Pro": "Passer à Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Joue responsable · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.",
    "Renseigne ton nom.": "Renseigne ton nom.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "Ton numéro WhatsApp est obligatoire pour créer ton compte.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "L’inscription n’a pas abouti. Réessaie dans un instant.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analyse les matchs. Vérifie les résultats. Décide toi-même.",
    "Commence gratuitement, sans carte bancaire.": "Commence gratuitement, sans carte bancaire.",
    "Historique public des résultats": "Historique public des résultats",
    "Aucun paiement pour créer le compte": "Aucun paiement pour créer le compte",
    "Invitation détectée": "Invitation détectée",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Joue responsable",
    "100 % gratuit": "100 % gratuit",
    "Ton accès gratuit est presque prêt": "Ton accès gratuit est presque prêt",
    "Crée ton compte pour découvrir WinPulse.": "Crée ton compte pour découvrir WinPulse.",
    "Gratuit": "Gratuit",
    "0 FCFA": "0 FCFA",
    "Sans CB": "Sans CB",
    "Aucun paiement": "Aucun paiement",
    "Libre": "Libre",
    "Sans engagement": "Sans engagement",
    "Nom": "Nom",
    "Ton nom complet": "Ton nom complet",
    "Email": "Email",
    "vous@email.com": "vous@email.com",
    "Numéro WhatsApp": "Numéro WhatsApp",
    "(obligatoire)": "(obligatoire)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.",
    "Mot de passe": "Mot de passe",
    "10 caractères minimum": "10 caractères minimum",
    "J’ai un code parrainage": "J’ai un code parrainage",
    "Code parrainage": "Code parrainage",
    "(optionnel)": "(optionnel)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.",
    "Création du compte…": "Création du compte…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.",
    "Politique de confidentialité": "Politique de confidentialité",
    "Déjà inscrit ?": "Déjà inscrit ?",
    "Se connecter": "Se connecter",
    "18+ · Joue responsable": "18+ · Joue responsable",
    "Bienvenue !": "Bienvenue !",
    "Erreur {{status}}": "Erreur {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.",
    "Erreur inconnue": "Erreur inconnue",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Joue responsable",
    "Accède à tes pronostics du jour": "Accède à tes pronostics du jour",
    "Mot de passe oublié ?": "Mot de passe oublié ?",
    "Connexion en cours…": "Connexion en cours…",
    "Pas encore de compte ?": "Pas encore de compte ?",
    "Créer un compte gratuit": "Créer un compte gratuit",
    "Cache de connexion effacé. Réessaye maintenant.": "Cache de connexion effacé. Réessaye maintenant.",
    "Le navigateur bloque l’accès au stockage local.": "Le navigateur bloque l’accès au stockage local.",
    "Problème de connexion ? Effacer le cache de connexion": "Problème de connexion ? Effacer le cache de connexion",
    "Email ou mot de passe incorrect": "Email ou mot de passe incorrect",
    "Email deja utilise": "Email deja utilise",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "Le numéro WhatsApp est obligatoire pour créer un compte",
    "Le mot de passe doit contenir au moins 10 caractères": "Le mot de passe doit contenir au moins 10 caractères",
    "Choisis un mot de passe moins courant": "Choisis un mot de passe moins courant",
    "Choisis un mot de passe moins répétitif": "Choisis un mot de passe moins répétitif",
    "Le mot de passe ne doit pas contenir ton adresse email": "Le mot de passe ne doit pas contenir ton adresse email",
    "Trop de tentatives. Réessaie plus tard.": "Trop de tentatives. Réessaie plus tard."
  },
  "en": {
    "Choisir la langue": "Choose language",
    "Langue de l’interface": "Interface language",
    "Dashboard": "Dashboard",
    "Live": "Live",
    "Aujourd'hui": "Today",
    "À la une": "Highlights",
    "Combinés": "Accumulators",
    "Combo Builder": "Combo Builder",
    "Value bets": "Value bets",
    "Montante": "Progression",
    "Track record": "Track record",
    "Profil": "Profile",
    "Parrainage": "Referrals",
    "Abonnement": "Subscription",
    "Admin": "Admin",
    "New": "New",
    "10J": "10d",
    "Free": "Free",
    "Ton pouls de gagnant": "Stay ahead of the game",
    "Connecté": "Signed in",
    "Déconnexion": "Sign out",
    "Plus d'options": "More options",
    "Fermer": "Close",
    "Plus": "More",
    "Tableau": "Home",
    "Direct": "Live",
    "Jour": "Day",
    "Créer": "Build",
    "Blog": "Blog",
    "Mentions légales": "Legal notice",
    "CGV": "Terms of sale",
    "Confidentialité": "Privacy",
    "Jeu responsable · 18+": "Responsible gambling · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublin, Ireland",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "This account was signed in on another device or browser. This session has ended.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "Your session has expired. Sign in again to continue.",
    "EN COURS": "IN PROGRESS",
    "ÉCHOUÉE": "FAILED",
    "TERMINÉE": "COMPLETED",
    "AUCUNE": "NONE",
    "Aucune montante active.": "No active progression.",
    "Impossible de charger la montante.": "Unable to load the progression.",
    "Impossible d'actualiser la montante.": "Unable to refresh the progression.",
    "Le capital initial doit être un nombre positif.": "The starting amount must be a positive number.",
    "La montante doit durer 10 ou 15 jours.": "The progression must last 10 or 15 days.",
    "Impossible de démarrer la montante.": "Unable to start the progression.",
    "Montante WinPulse": "WinPulse progression",
    "10 → 15 jours": "10 → 15 days",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "The engine selects existing predictions that meet its criteria. A winning day advances the series; a losing day ends it. If no selection qualifies, the module waits.",
    "Actualiser": "Refresh",
    "Montante indisponible": "Progression unavailable",
    "Contrôle administrateur": "Admin controls",
    "Montante 10 jours": "10-day progression",
    "Montante 15 jours": "15-day progression",
    "Capital initial": "Starting amount",
    "Démarrer": "Start",
    "Recommencer": "Restart",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Only administrators can start or restart the series, to prevent users from resetting it.",
    "Chargement de la montante…": "Loading progression…",
    "Aucune montante active": "No active progression",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "An administrator must start a 10- or 15-day progression.",
    "progression": "progress",
    "mise de départ": "starting stake",
    "Capital théorique": "Theoretical amount",
    "si les journées passent": "if each day succeeds",
    "Progression": "Progress",
    "de la série": "of the series",
    "Progression de la série": "Series progress",
    "Jour {{day}} sur {{total}}": "Day {{day}} of {{total}}",
    "Pronostics du jour": "Today's predictions",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "Selections depend on the criteria and available data. No fixed odds range is guaranteed.",
    "Pick {{number}}": "Pick {{number}}",
    "Confiance": "Confidence",
    "Début :": "Starts:",
    "En attente d'un pick qualifié": "Waiting for a qualifying pick",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "The module never forces a prediction that does not meet its criteria.",
    "Historique": "History",
    "Aucune journée terminée.": "No completed days yet.",
    "GAGNÉ": "WON",
    "REMBOURSÉ": "VOID",
    "PERDU": "LOST",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "No sports bet is guaranteed. The progression limits the number of selections but does not eliminate risk. 18+ · Responsible gambling.",
    "Chargement…": "Loading…",
    "Analyses sportives": "Sports analysis",
    "Historique des résultats": "Results history",
    "Articles": "Articles",
    "Ouvrir l'app": "Open the app",
    "Connexion": "Sign in",
    "S'inscrire": "Sign up",
    "Démarrer gratuit": "Start for free",
    "Pronostics · Analyses · Résultats publics": "Predictions · Analysis · Public results",
    "Vise la victoire avec nos pronostics.": "Aim for victory with our predictions.",
    "Garde une longueur d’avance.": "Stay one step ahead.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Discover today's predictions and match analysis. Start for free, then upgrade to Pro to explore subscriber picks and accumulators.",
    "Découvrir les pronostics": "Explore predictions",
    "Découvrir l’offre Pro": "Explore Pro",
    "Consulter l’historique complet": "View the full history",
    "Inscription sans carte": "No card needed to sign up",
    "Résultats publics": "Public results",
    "Compte gratuit": "Free account",
    "Pronostics disponibles": "Available predictions",
    "Chargement des analyses…": "Loading analysis…",
    "Les analyses ne sont pas disponibles pour le moment.": "Analysis is currently unavailable.",
    "Réessayer": "Try again",
    "Les analyses du jour arrivent prochainement.": "Today's analysis is coming soon.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Browse the results history while waiting for the next picks.",
    "Analyse réservée Pro": "Pro-only analysis",
    "Indice : {{value}} %": "Indicator: {{value}}%",
    "Les indices d’analyse ne garantissent aucun résultat.": "Analysis indicators do not guarantee any outcome.",
    "Ouvrir l’application": "Open the app",
    "Créer mon compte gratuit": "Create my free account",
    "Historique des pronostics": "Prediction history",
    "Les résultats d’hier": "Yesterday's results",
    "Matchs du {{date}}.": "Matches on {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "A selection of yesterday's winning picks from our track record, ordered by highest odds.",
    "Voir tous les résultats": "View all results",
    "Chargement des résultats d’hier…": "Loading yesterday's results…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "Yesterday's summary is currently unavailable.",
    "Tu peux consulter l’historique complet des résultats.": "You can browse the full results history.",
    "Gagnants": "Won",
    "Perdants": "Lost",
    "En attente": "Pending",
    "Annulés / remboursés": "Void / refunded",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Total predictions: {{count}}. The cards below show only a selection of winners.",
    "Aucun pronostic publié pour les matchs de cette journée.": "No predictions were published for this day's matches.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "No winning prediction has been confirmed for this day. The summary remains visible above.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Details of the winning predictions are not available here yet. Browse the full history.",
    "Gagné": "Won",
    "Cote publiée": "Published odds",
    "Score final": "Final score",
    "Pronostic publié avant le match · résultat confirmé.": "Prediction published before the match · confirmed result.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Past results do not guarantee future outcomes.",
    "COMMENT UTILISER WINPULSE": "HOW TO USE WINPULSE",
    "Une analyse pro, claire et immédiate": "Clear, accessible sports analysis",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Read the analysis, check the results and stay in control of your decisions.",
    "Explications de match": "Match explanations",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Understand picks using available data, with a local explanation or AI assistance when configured.",
    "Scoring rigoureux": "Analysis indicators",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Use available indicators to compare picks. An indicator is not a guarantee of success.",
    "Combinés par profil": "Accumulators by profile",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Compare available selections and risk levels. No accumulator is risk-free.",
    "Track record transparent": "Transparent track record",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Public history, ROI, win rate and average odds. Both winning and losing picks are included.",
    "Value bets détectés": "Value bet detection",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Compare estimates with the odds on offer. Estimates remain uncertain.",
    "Découverte gratuite": "Free access to explore",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Create an account without paying. Then check the Pro offer in your account.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Find your code and the programme terms in your account.",
    "Voir mon code": "View my code",
    "ABONNEMENT": "SUBSCRIPTION",
    "Choisis ton accès": "Choose your access",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Explore WinPulse for free. Upgrade to Pro for subscriber predictions, accumulators and tools.",
    "Pour découvrir": "To explore",
    "Sélections gratuites disponibles": "Available free picks",
    "Tous les matchs (cotes visibles)": "All matches with visible odds",
    "Track record public": "Public track record",
    "pour 30 jours": "for 30 days",
    "Accès complet": "Full access",
    "Tous les pronostics débloqués": "All predictions unlocked",
    "Tous les combinés du jour": "All daily accumulators",
    "Explications des pronostics": "Prediction explanations",
    "Value bets et Combo Builder": "Value bets and Combo Builder",
    "Montante premium": "Premium progression",
    "Support WhatsApp prioritaire": "Priority WhatsApp support",
    "Passer à Pro": "Upgrade to Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Play responsibly · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Predictions are statistical analyses, not guarantees. Only stake what you can afford to lose. WinPulse does not accept bets or place them for users.",
    "Renseigne ton nom.": "Enter your name.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "Your WhatsApp number is required to create an account.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Enter your number with + and the country code, for example +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "The registration form needs an update. Refresh the page and try again.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "Registration was unsuccessful. Try again shortly.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analyse matches. Check results. Make your own decisions.",
    "Commence gratuitement, sans carte bancaire.": "Start for free, without a bank card.",
    "Historique public des résultats": "Public results history",
    "Aucun paiement pour créer le compte": "No payment to create an account",
    "Invitation détectée": "Invitation detected",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Play responsibly",
    "100 % gratuit": "100% free",
    "Ton accès gratuit est presque prêt": "Your free access is almost ready",
    "Crée ton compte pour découvrir WinPulse.": "Create your account to explore WinPulse.",
    "Gratuit": "Free",
    "0 FCFA": "0 FCFA",
    "Sans CB": "No card",
    "Aucun paiement": "No payment",
    "Libre": "Your choice",
    "Sans engagement": "No commitment",
    "Nom": "Name",
    "Ton nom complet": "Your full name",
    "Email": "Email",
    "vous@email.com": "you@email.com",
    "Numéro WhatsApp": "WhatsApp number",
    "(obligatoire)": "(required)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Include + and your country code: +33 France, +353 Ireland, +225 Côte d’Ivoire, +229 Benin, +223 Mali.",
    "Mot de passe": "Password",
    "10 caractères minimum": "At least 10 characters",
    "J’ai un code parrainage": "I have a referral code",
    "Code parrainage": "Referral code",
    "(optionnel)": "(optional)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "I agree to receive WinPulse offers and invitations to its private groups or communities on WhatsApp, through manual or automated messages. This permission is optional and is not required to create my account. I can withdraw it from my profile.",
    "Création du compte…": "Creating account…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "No payment is required at registration. WinPulse provides statistical analysis and does not guarantee winnings.",
    "Politique de confidentialité": "Privacy policy",
    "Déjà inscrit ?": "Already registered?",
    "Se connecter": "Sign in",
    "18+ · Joue responsable": "18+ · Play responsibly",
    "Bienvenue !": "Welcome!",
    "Erreur {{status}}": "Error {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "No response from the server. Check your internet connection and try again.",
    "Erreur inconnue": "Unknown error",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "Find your predictions, analysis and available results in your account. No outcome is guaranteed.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Play responsibly",
    "Accède à tes pronostics du jour": "Access today's predictions",
    "Mot de passe oublié ?": "Forgot your password?",
    "Connexion en cours…": "Signing in…",
    "Pas encore de compte ?": "Don't have an account yet?",
    "Créer un compte gratuit": "Create a free account",
    "Cache de connexion effacé. Réessaye maintenant.": "Sign-in cache cleared. Try again now.",
    "Le navigateur bloque l’accès au stockage local.": "The browser is blocking local storage access.",
    "Problème de connexion ? Effacer le cache de connexion": "Trouble signing in? Clear the sign-in cache",
    "Email ou mot de passe incorrect": "Incorrect email or password",
    "Email deja utilise": "Email already in use",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "A WhatsApp number is required to create an account",
    "Le mot de passe doit contenir au moins 10 caractères": "The password must contain at least 10 characters",
    "Choisis un mot de passe moins courant": "Choose a less common password",
    "Choisis un mot de passe moins répétitif": "Choose a less repetitive password",
    "Le mot de passe ne doit pas contenir ton adresse email": "The password must not contain your email address",
    "Trop de tentatives. Réessaie plus tard.": "Too many attempts. Try again later."
  },
  "es": {
    "Choisir la langue": "Elegir idioma",
    "Langue de l’interface": "Idioma de la interfaz",
    "Dashboard": "Panel principal",
    "Live": "En directo",
    "Aujourd'hui": "Hoy",
    "À la une": "Destacados",
    "Combinés": "Combinadas",
    "Combo Builder": "Creador de combinadas",
    "Value bets": "Apuestas de valor",
    "Montante": "Racha",
    "Track record": "Historial de resultados",
    "Profil": "Perfil",
    "Parrainage": "Invitaciones",
    "Abonnement": "Suscripción",
    "Admin": "Administración",
    "New": "Nuevo",
    "10J": "10d",
    "Free": "Gratis",
    "Ton pouls de gagnant": "Adelántate al juego",
    "Connecté": "Sesión iniciada",
    "Déconnexion": "Cerrar sesión",
    "Plus d'options": "Más opciones",
    "Fermer": "Cerrar",
    "Plus": "Más",
    "Tableau": "Inicio",
    "Direct": "Directo",
    "Jour": "Día",
    "Créer": "Crear",
    "Blog": "Blog",
    "Mentions légales": "Aviso legal",
    "CGV": "Condiciones de venta",
    "Confidentialité": "Privacidad",
    "Jeu responsable · 18+": "Juego responsable · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublín, Irlanda",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "Se ha iniciado sesión con esta cuenta en otro dispositivo o navegador. Esta sesión se ha cerrado.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.",
    "EN COURS": "EN CURSO",
    "ÉCHOUÉE": "FINALIZADA SIN ÉXITO",
    "TERMINÉE": "COMPLETADA",
    "AUCUNE": "NINGUNA",
    "Aucune montante active.": "No hay ninguna racha activa.",
    "Impossible de charger la montante.": "No se ha podido cargar la racha.",
    "Impossible d'actualiser la montante.": "No se ha podido actualizar la racha.",
    "Le capital initial doit être un nombre positif.": "El importe inicial debe ser un número positivo.",
    "La montante doit durer 10 ou 15 jours.": "La racha debe durar 10 o 15 días.",
    "Impossible de démarrer la montante.": "No se ha podido iniciar la racha.",
    "Montante WinPulse": "Racha WinPulse",
    "10 → 15 jours": "10 → 15 días",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "El motor selecciona pronósticos existentes que cumplen sus criterios. Una jornada ganada hace avanzar la racha; una perdida la termina. Si ninguna selección cumple los criterios, el módulo espera.",
    "Actualiser": "Actualizar",
    "Montante indisponible": "Racha no disponible",
    "Contrôle administrateur": "Controles de administración",
    "Montante 10 jours": "Racha de 10 días",
    "Montante 15 jours": "Racha de 15 días",
    "Capital initial": "Importe inicial",
    "Démarrer": "Iniciar",
    "Recommencer": "Reiniciar",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Solo la administración puede iniciar o reiniciar la racha, para evitar que los usuarios la restablezcan.",
    "Chargement de la montante…": "Cargando la racha…",
    "Aucune montante active": "No hay ninguna racha activa",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "La administración debe iniciar una racha de 10 o 15 días.",
    "progression": "progreso",
    "mise de départ": "importe de partida",
    "Capital théorique": "Importe teórico",
    "si les journées passent": "si se superan las jornadas",
    "Progression": "Progreso",
    "de la série": "de la racha",
    "Progression de la série": "Progreso de la racha",
    "Jour {{day}} sur {{total}}": "Día {{day}} de {{total}}",
    "Pronostics du jour": "Pronósticos de hoy",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "Las selecciones dependen de los criterios y de los datos disponibles. No se garantiza un intervalo fijo de cuotas.",
    "Pick {{number}}": "Selección {{number}}",
    "Confiance": "Confianza",
    "Début :": "Inicio:",
    "En attente d'un pick qualifié": "Esperando una selección válida",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "El módulo nunca fuerza un pronóstico que no cumple sus criterios.",
    "Historique": "Historial",
    "Aucune journée terminée.": "Todavía no hay jornadas completadas.",
    "GAGNÉ": "GANADO",
    "REMBOURSÉ": "ANULADO",
    "PERDU": "PERDIDO",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "Ninguna apuesta deportiva está garantizada. La racha limita el número de selecciones, pero no elimina el riesgo. 18+ · Juego responsable.",
    "Chargement…": "Cargando…",
    "Analyses sportives": "Análisis deportivo",
    "Historique des résultats": "Historial de resultados",
    "Articles": "Artículos",
    "Ouvrir l'app": "Abrir la aplicación",
    "Connexion": "Iniciar sesión",
    "S'inscrire": "Registrarse",
    "Démarrer gratuit": "Empezar gratis",
    "Pronostics · Analyses · Résultats publics": "Pronósticos · Análisis · Resultados públicos",
    "Vise la victoire avec nos pronostics.": "Apunta a la victoria con nuestros pronósticos.",
    "Garde une longueur d’avance.": "Mantente un paso por delante.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Descubre los pronósticos de hoy y nuestros análisis. Empieza gratis y pasa a Pro para acceder a selecciones y combinadas para suscriptores.",
    "Découvrir les pronostics": "Ver pronósticos",
    "Découvrir l’offre Pro": "Descubrir Pro",
    "Consulter l’historique complet": "Ver el historial completo",
    "Inscription sans carte": "Registro sin tarjeta",
    "Résultats publics": "Resultados públicos",
    "Compte gratuit": "Cuenta gratuita",
    "Pronostics disponibles": "Pronósticos disponibles",
    "Chargement des analyses…": "Cargando análisis…",
    "Les analyses ne sont pas disponibles pour le moment.": "Los análisis no están disponibles en este momento.",
    "Réessayer": "Reintentar",
    "Les analyses du jour arrivent prochainement.": "Los análisis de hoy estarán disponibles pronto.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Consulta el historial de resultados mientras esperas las próximas selecciones.",
    "Analyse réservée Pro": "Análisis exclusivo Pro",
    "Indice : {{value}} %": "Indicador: {{value}} %",
    "Les indices d’analyse ne garantissent aucun résultat.": "Los indicadores de análisis no garantizan ningún resultado.",
    "Ouvrir l’application": "Abrir la aplicación",
    "Créer mon compte gratuit": "Crear mi cuenta gratuita",
    "Historique des pronostics": "Historial de pronósticos",
    "Les résultats d’hier": "Resultados de ayer",
    "Matchs du {{date}}.": "Partidos del {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "Una selección de pronósticos ganadores de ayer de nuestro historial, ordenados de mayor a menor cuota.",
    "Voir tous les résultats": "Ver todos los resultados",
    "Chargement des résultats d’hier…": "Cargando los resultados de ayer…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "El resumen de ayer no está disponible en este momento.",
    "Tu peux consulter l’historique complet des résultats.": "Puedes consultar el historial completo de resultados.",
    "Gagnants": "Ganadores",
    "Perdants": "Perdedores",
    "En attente": "Pendientes",
    "Annulés / remboursés": "Anulados / reembolsados",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Total de pronósticos: {{count}}. Las tarjetas solo muestran una selección de los ganadores.",
    "Aucun pronostic publié pour les matchs de cette journée.": "No se publicaron pronósticos para los partidos de ese día.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "No hay pronósticos ganadores confirmados para ese día. El resumen sigue visible arriba.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Los detalles de los pronósticos ganadores aún no están disponibles aquí. Consulta el historial completo.",
    "Gagné": "Ganado",
    "Cote publiée": "Cuota publicada",
    "Score final": "Resultado final",
    "Pronostic publié avant le match · résultat confirmé.": "Pronóstico publicado antes del partido · resultado confirmado.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Los resultados pasados no garantizan los futuros.",
    "COMMENT UTILISER WINPULSE": "CÓMO USAR WINPULSE",
    "Une analyse pro, claire et immédiate": "Análisis deportivo claro y accesible",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Consulta los análisis, comprueba los resultados y mantén el control de tus decisiones.",
    "Explications de match": "Explicaciones del partido",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Comprende las selecciones con los datos disponibles, mediante explicaciones locales o ayuda de IA cuando esté configurada.",
    "Scoring rigoureux": "Indicadores de análisis",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Consulta los indicadores disponibles para comparar selecciones. Un indicador no garantiza el éxito.",
    "Combinés par profil": "Combinadas por perfil",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Compara las selecciones y los niveles de riesgo disponibles. Ninguna combinada está libre de riesgo.",
    "Track record transparent": "Historial transparente",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Historial público, ROI, porcentaje de aciertos y cuotas medias. Se incluyen pronósticos ganadores y perdedores.",
    "Value bets détectés": "Detección de apuestas de valor",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Compara las estimaciones con las cuotas ofrecidas. Las estimaciones siguen siendo inciertas.",
    "Découverte gratuite": "Descubrimiento gratuito",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Crea tu cuenta sin pagar. Después consulta la oferta Pro desde tu espacio.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Consulta tu código y las condiciones del programa en tu cuenta.",
    "Voir mon code": "Ver mi código",
    "ABONNEMENT": "SUSCRIPCIÓN",
    "Choisis ton accès": "Elige tu acceso",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Descubre WinPulse gratis. Pasa a Pro para acceder a pronósticos, combinadas y herramientas para suscriptores.",
    "Pour découvrir": "Para descubrir",
    "Sélections gratuites disponibles": "Selecciones gratuitas disponibles",
    "Tous les matchs (cotes visibles)": "Todos los partidos con cuotas visibles",
    "Track record public": "Historial público",
    "pour 30 jours": "por 30 días",
    "Accès complet": "Acceso completo",
    "Tous les pronostics débloqués": "Todos los pronósticos desbloqueados",
    "Tous les combinés du jour": "Todas las combinadas del día",
    "Explications des pronostics": "Explicaciones de los pronósticos",
    "Value bets et Combo Builder": "Apuestas de valor y creador de combinadas",
    "Montante premium": "Racha premium",
    "Support WhatsApp prioritaire": "Soporte prioritario por WhatsApp",
    "Passer à Pro": "Pasar a Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Juega con responsabilidad · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Los pronósticos son análisis estadísticos, no garantías. Apuesta solo lo que puedas permitirte perder. WinPulse no acepta apuestas ni apuesta por sus usuarios.",
    "Renseigne ton nom.": "Introduce tu nombre.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "Tu número de WhatsApp es obligatorio para crear la cuenta.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Introduce el número con + y el prefijo del país, por ejemplo +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "El formulario necesita actualizarse. Recarga la página e inténtalo de nuevo.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "No se ha completado el registro. Inténtalo de nuevo en un momento.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analiza partidos. Comprueba resultados. Decide por ti mismo.",
    "Commence gratuitement, sans carte bancaire.": "Empieza gratis, sin tarjeta bancaria.",
    "Historique public des résultats": "Historial público de resultados",
    "Aucun paiement pour créer le compte": "Sin pago para crear la cuenta",
    "Invitation détectée": "Invitación detectada",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Juega con responsabilidad",
    "100 % gratuit": "100 % gratis",
    "Ton accès gratuit est presque prêt": "Tu acceso gratuito está casi listo",
    "Crée ton compte pour découvrir WinPulse.": "Crea tu cuenta para descubrir WinPulse.",
    "Gratuit": "Gratis",
    "0 FCFA": "0 FCFA",
    "Sans CB": "Sin tarjeta",
    "Aucun paiement": "Sin pago",
    "Libre": "Tú eliges",
    "Sans engagement": "Sin compromiso",
    "Nom": "Nombre",
    "Ton nom complet": "Tu nombre completo",
    "Email": "Correo electrónico",
    "vous@email.com": "tu@email.com",
    "Numéro WhatsApp": "Número de WhatsApp",
    "(obligatoire)": "(obligatorio)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Añade + y el prefijo del país: +33 Francia, +353 Irlanda, +225 Costa de Marfil, +229 Benín, +223 Mali.",
    "Mot de passe": "Contraseña",
    "10 caractères minimum": "Mínimo 10 caracteres",
    "J’ai un code parrainage": "Tengo un código de invitación",
    "Code parrainage": "Código de invitación",
    "(optionnel)": "(opcional)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "Acepto recibir por WhatsApp ofertas de WinPulse e invitaciones a sus grupos o comunidades privadas, mediante mensajes manuales o automáticos. Esta autorización es opcional y no es necesaria para crear mi cuenta. Puedo retirarla desde mi perfil.",
    "Création du compte…": "Creando cuenta…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "No se solicita ningún pago al registrarse. WinPulse ofrece análisis estadísticos y no garantiza ganancias.",
    "Politique de confidentialité": "Política de privacidad",
    "Déjà inscrit ?": "¿Ya tienes cuenta?",
    "Se connecter": "Iniciar sesión",
    "18+ · Joue responsable": "18+ · Juega con responsabilidad",
    "Bienvenue !": "¡Bienvenido!",
    "Erreur {{status}}": "Error {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "El servidor no responde. Comprueba tu conexión a internet y vuelve a intentarlo.",
    "Erreur inconnue": "Error desconocido",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "Consulta tus pronósticos, análisis y resultados disponibles desde tu espacio. Ningún resultado está garantizado.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Juega con responsabilidad",
    "Accède à tes pronostics du jour": "Accede a tus pronósticos de hoy",
    "Mot de passe oublié ?": "¿Olvidaste tu contraseña?",
    "Connexion en cours…": "Iniciando sesión…",
    "Pas encore de compte ?": "¿Aún no tienes cuenta?",
    "Créer un compte gratuit": "Crear una cuenta gratuita",
    "Cache de connexion effacé. Réessaye maintenant.": "Caché de conexión borrada. Vuelve a intentarlo.",
    "Le navigateur bloque l’accès au stockage local.": "El navegador bloquea el acceso al almacenamiento local.",
    "Problème de connexion ? Effacer le cache de connexion": "¿Problemas para entrar? Borrar la caché de conexión",
    "Email ou mot de passe incorrect": "Correo electrónico o contraseña incorrectos",
    "Email deja utilise": "El correo electrónico ya está en uso",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "Se necesita un número de WhatsApp para crear la cuenta",
    "Le mot de passe doit contenir au moins 10 caractères": "La contraseña debe tener al menos 10 caracteres",
    "Choisis un mot de passe moins courant": "Elige una contraseña menos común",
    "Choisis un mot de passe moins répétitif": "Elige una contraseña menos repetitiva",
    "Le mot de passe ne doit pas contenir ton adresse email": "La contraseña no debe contener tu correo electrónico",
    "Trop de tentatives. Réessaie plus tard.": "Demasiados intentos. Vuelve a intentarlo más tarde."
  },
  "pt": {
    "Choisir la langue": "Escolher idioma",
    "Langue de l’interface": "Idioma da interface",
    "Dashboard": "Painel",
    "Live": "Ao vivo",
    "Aujourd'hui": "Hoje",
    "À la une": "Destaques",
    "Combinés": "Acumuladas",
    "Combo Builder": "Criador de acumuladas",
    "Value bets": "Apostas de valor",
    "Montante": "Progressão",
    "Track record": "Histórico de resultados",
    "Profil": "Perfil",
    "Parrainage": "Indicações",
    "Abonnement": "Assinatura",
    "Admin": "Administração",
    "New": "Novo",
    "10J": "10d",
    "Free": "Grátis",
    "Ton pouls de gagnant": "Fica à frente do jogo",
    "Connecté": "Sessão iniciada",
    "Déconnexion": "Terminar sessão",
    "Plus d'options": "Mais opções",
    "Fermer": "Fechar",
    "Plus": "Mais",
    "Tableau": "Início",
    "Direct": "Ao vivo",
    "Jour": "Dia",
    "Créer": "Criar",
    "Blog": "Blog",
    "Mentions légales": "Aviso legal",
    "CGV": "Condições de venda",
    "Confidentialité": "Privacidade",
    "Jeu responsable · 18+": "Jogo responsável · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublin, Irlanda",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "Foi iniciada uma sessão nesta conta noutro dispositivo ou navegador. Esta sessão foi encerrada.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "A tua sessão expirou. Inicia sessão novamente para continuar.",
    "EN COURS": "EM CURSO",
    "ÉCHOUÉE": "SEM SUCESSO",
    "TERMINÉE": "CONCLUÍDA",
    "AUCUNE": "NENHUMA",
    "Aucune montante active.": "Não existe uma progressão ativa.",
    "Impossible de charger la montante.": "Não foi possível carregar a progressão.",
    "Impossible d'actualiser la montante.": "Não foi possível atualizar a progressão.",
    "Le capital initial doit être un nombre positif.": "O valor inicial tem de ser um número positivo.",
    "La montante doit durer 10 ou 15 jours.": "A progressão tem de durar 10 ou 15 dias.",
    "Impossible de démarrer la montante.": "Não foi possível iniciar a progressão.",
    "Montante WinPulse": "Progressão WinPulse",
    "10 → 15 jours": "10 → 15 dias",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "O motor seleciona prognósticos existentes que cumprem os seus critérios. Um dia ganho faz avançar a série; um dia perdido termina-a. Se nenhuma seleção cumprir os critérios, o módulo aguarda.",
    "Actualiser": "Atualizar",
    "Montante indisponible": "Progressão indisponível",
    "Contrôle administrateur": "Controlos de administração",
    "Montante 10 jours": "Progressão de 10 dias",
    "Montante 15 jours": "Progressão de 15 dias",
    "Capital initial": "Valor inicial",
    "Démarrer": "Iniciar",
    "Recommencer": "Recomeçar",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Só a administração pode iniciar ou reiniciar a série, para evitar que os utilizadores a reinicializem.",
    "Chargement de la montante…": "A carregar a progressão…",
    "Aucune montante active": "Não existe uma progressão ativa",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "A administração tem de iniciar uma progressão de 10 ou 15 dias.",
    "progression": "progresso",
    "mise de départ": "valor de partida",
    "Capital théorique": "Valor teórico",
    "si les journées passent": "se os dias forem bem-sucedidos",
    "Progression": "Progresso",
    "de la série": "da série",
    "Progression de la série": "Progresso da série",
    "Jour {{day}} sur {{total}}": "Dia {{day}} de {{total}}",
    "Pronostics du jour": "Prognósticos de hoje",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "As seleções dependem dos critérios e dos dados disponíveis. Não é garantido um intervalo fixo de odds.",
    "Pick {{number}}": "Seleção {{number}}",
    "Confiance": "Confiança",
    "Début :": "Início:",
    "En attente d'un pick qualifié": "A aguardar uma seleção válida",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "O módulo nunca força um prognóstico que não cumpre os seus critérios.",
    "Historique": "Histórico",
    "Aucune journée terminée.": "Ainda não existem dias concluídos.",
    "GAGNÉ": "GANHO",
    "REMBOURSÉ": "ANULADO",
    "PERDU": "PERDIDO",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "Nenhuma aposta desportiva é garantida. A progressão limita o número de seleções, mas não elimina o risco. 18+ · Jogo responsável.",
    "Chargement…": "A carregar…",
    "Analyses sportives": "Análise desportiva",
    "Historique des résultats": "Histórico de resultados",
    "Articles": "Artigos",
    "Ouvrir l'app": "Abrir a aplicação",
    "Connexion": "Iniciar sessão",
    "S'inscrire": "Registar",
    "Démarrer gratuit": "Começar grátis",
    "Pronostics · Analyses · Résultats publics": "Prognósticos · Análises · Resultados públicos",
    "Vise la victoire avec nos pronostics.": "Aponta à vitória com os nossos prognósticos.",
    "Garde une longueur d’avance.": "Mantém-te um passo à frente.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Descobre os prognósticos do dia e as nossas análises. Começa grátis e adere ao Pro para explorar as seleções e acumuladas dos assinantes.",
    "Découvrir les pronostics": "Explorar prognósticos",
    "Découvrir l’offre Pro": "Conhecer o Pro",
    "Consulter l’historique complet": "Ver o histórico completo",
    "Inscription sans carte": "Registo sem cartão",
    "Résultats publics": "Resultados públicos",
    "Compte gratuit": "Conta gratuita",
    "Pronostics disponibles": "Prognósticos disponíveis",
    "Chargement des analyses…": "A carregar análises…",
    "Les analyses ne sont pas disponibles pour le moment.": "As análises não estão disponíveis neste momento.",
    "Réessayer": "Tentar novamente",
    "Les analyses du jour arrivent prochainement.": "As análises do dia estarão disponíveis em breve.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Consulta o histórico de resultados enquanto aguardas as próximas seleções.",
    "Analyse réservée Pro": "Análise exclusiva Pro",
    "Indice : {{value}} %": "Indicador: {{value}}%",
    "Les indices d’analyse ne garantissent aucun résultat.": "Os indicadores de análise não garantem resultados.",
    "Ouvrir l’application": "Abrir a aplicação",
    "Créer mon compte gratuit": "Criar a minha conta gratuita",
    "Historique des pronostics": "Histórico de prognósticos",
    "Les résultats d’hier": "Resultados de ontem",
    "Matchs du {{date}}.": "Jogos de {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "Uma seleção dos prognósticos ganhos de ontem do nosso histórico, por ordem decrescente de odds.",
    "Voir tous les résultats": "Ver todos os resultados",
    "Chargement des résultats d’hier…": "A carregar os resultados de ontem…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "O resumo de ontem não está disponível neste momento.",
    "Tu peux consulter l’historique complet des résultats.": "Podes consultar o histórico completo de resultados.",
    "Gagnants": "Ganhos",
    "Perdants": "Perdidos",
    "En attente": "Pendentes",
    "Annulés / remboursés": "Anulados / reembolsados",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Total de prognósticos: {{count}}. Os cartões abaixo mostram apenas uma seleção dos ganhos.",
    "Aucun pronostic publié pour les matchs de cette journée.": "Não foram publicados prognósticos para os jogos desse dia.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "Não existem prognósticos ganhos confirmados nesse dia. O resumo continua visível acima.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Os detalhes dos prognósticos ganhos ainda não estão disponíveis aqui. Consulta o histórico completo.",
    "Gagné": "Ganho",
    "Cote publiée": "Odd publicada",
    "Score final": "Resultado final",
    "Pronostic publié avant le match · résultat confirmé.": "Prognóstico publicado antes do jogo · resultado confirmado.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Os resultados anteriores não garantem resultados futuros.",
    "COMMENT UTILISER WINPULSE": "COMO UTILIZAR O WINPULSE",
    "Une analyse pro, claire et immédiate": "Análise desportiva clara e acessível",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Consulta as análises, verifica os resultados e mantém o controlo das tuas decisões.",
    "Explications de match": "Explicações do jogo",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Compreende as seleções com os dados disponíveis, através de explicações locais ou apoio de IA quando configurado.",
    "Scoring rigoureux": "Indicadores de análise",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Consulta os indicadores disponíveis para comparar seleções. Um indicador não garante sucesso.",
    "Combinés par profil": "Acumuladas por perfil",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Compara as seleções e os níveis de risco disponíveis. Nenhuma acumulada está isenta de risco.",
    "Track record transparent": "Histórico transparente",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Histórico público, ROI, taxa de acerto e odds médias. Incluímos prognósticos ganhos e perdidos.",
    "Value bets détectés": "Deteção de apostas de valor",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Compara as estimativas com as odds propostas. As estimativas continuam incertas.",
    "Découverte gratuite": "Descoberta gratuita",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Cria a tua conta sem pagar. Depois consulta a oferta Pro na tua área.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Encontra o teu código e as condições do programa na tua conta.",
    "Voir mon code": "Ver o meu código",
    "ABONNEMENT": "ASSINATURA",
    "Choisis ton accès": "Escolhe o teu acesso",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Descobre o WinPulse grátis. Adere ao Pro para aceder a prognósticos, acumuladas e ferramentas dos assinantes.",
    "Pour découvrir": "Para descobrir",
    "Sélections gratuites disponibles": "Seleções gratuitas disponíveis",
    "Tous les matchs (cotes visibles)": "Todos os jogos com odds visíveis",
    "Track record public": "Histórico público",
    "pour 30 jours": "por 30 dias",
    "Accès complet": "Acesso completo",
    "Tous les pronostics débloqués": "Todos os prognósticos desbloqueados",
    "Tous les combinés du jour": "Todas as acumuladas do dia",
    "Explications des pronostics": "Explicações dos prognósticos",
    "Value bets et Combo Builder": "Apostas de valor e criador de acumuladas",
    "Montante premium": "Progressão premium",
    "Support WhatsApp prioritaire": "Apoio prioritário por WhatsApp",
    "Passer à Pro": "Aderir ao Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Joga com responsabilidade · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Os prognósticos são análises estatísticas, não garantias. Aposta apenas o que podes perder. O WinPulse não aceita apostas nem aposta pelos utilizadores.",
    "Renseigne ton nom.": "Indica o teu nome.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "O teu número WhatsApp é obrigatório para criar a conta.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Indica o número com + e o indicativo do país, por exemplo +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "O formulário precisa de ser atualizado. Atualiza a página e tenta novamente.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "O registo não foi concluído. Tenta novamente dentro de instantes.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analisa os jogos. Verifica os resultados. Decide por ti.",
    "Commence gratuitement, sans carte bancaire.": "Começa grátis, sem cartão bancário.",
    "Historique public des résultats": "Histórico público de resultados",
    "Aucun paiement pour créer le compte": "Sem pagamento para criar a conta",
    "Invitation détectée": "Convite detetado",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Joga com responsabilidade",
    "100 % gratuit": "100% grátis",
    "Ton accès gratuit est presque prêt": "O teu acesso gratuito está quase pronto",
    "Crée ton compte pour découvrir WinPulse.": "Cria a tua conta para descobrir o WinPulse.",
    "Gratuit": "Grátis",
    "0 FCFA": "0 FCFA",
    "Sans CB": "Sem cartão",
    "Aucun paiement": "Sem pagamento",
    "Libre": "Tu escolhes",
    "Sans engagement": "Sem compromisso",
    "Nom": "Nome",
    "Ton nom complet": "O teu nome completo",
    "Email": "Email",
    "vous@email.com": "tu@email.com",
    "Numéro WhatsApp": "Número WhatsApp",
    "(obligatoire)": "(obrigatório)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Inclui + e o indicativo do país: +33 França, +353 Irlanda, +225 Costa do Marfim, +229 Benim, +223 Mali.",
    "Mot de passe": "Palavra-passe",
    "10 caractères minimum": "Mínimo de 10 caracteres",
    "J’ai un code parrainage": "Tenho um código de indicação",
    "Code parrainage": "Código de indicação",
    "(optionnel)": "(opcional)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "Aceito receber no WhatsApp ofertas WinPulse e convites para os seus grupos ou comunidades privadas, através de mensagens manuais ou automáticas. Esta autorização é facultativa e não é necessária para criar a conta. Posso retirá-la no meu perfil.",
    "Création du compte…": "A criar a conta…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "Não é pedido qualquer pagamento no registo. O WinPulse fornece análises estatísticas e não garante ganhos.",
    "Politique de confidentialité": "Política de privacidade",
    "Déjà inscrit ?": "Já tens conta?",
    "Se connecter": "Iniciar sessão",
    "18+ · Joue responsable": "18+ · Joga com responsabilidade",
    "Bienvenue !": "Bem-vindo!",
    "Erreur {{status}}": "Erro {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "O servidor não respondeu. Verifica a ligação à internet e tenta novamente.",
    "Erreur inconnue": "Erro desconhecido",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "Consulta os teus prognósticos, análises e resultados disponíveis na tua área. Nenhum resultado é garantido.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Joga com responsabilidade",
    "Accède à tes pronostics du jour": "Acede aos teus prognósticos do dia",
    "Mot de passe oublié ?": "Esqueceste-te da palavra-passe?",
    "Connexion en cours…": "A iniciar sessão…",
    "Pas encore de compte ?": "Ainda não tens conta?",
    "Créer un compte gratuit": "Criar uma conta gratuita",
    "Cache de connexion effacé. Réessaye maintenant.": "Cache de início de sessão limpa. Tenta novamente.",
    "Le navigateur bloque l’accès au stockage local.": "O navegador bloqueia o acesso ao armazenamento local.",
    "Problème de connexion ? Effacer le cache de connexion": "Problemas ao entrar? Limpar a cache de sessão",
    "Email ou mot de passe incorrect": "Email ou palavra-passe incorretos",
    "Email deja utilise": "Este email já está a ser utilizado",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "É necessário um número WhatsApp para criar a conta",
    "Le mot de passe doit contenir au moins 10 caractères": "A palavra-passe tem de conter pelo menos 10 caracteres",
    "Choisis un mot de passe moins courant": "Escolhe uma palavra-passe menos comum",
    "Choisis un mot de passe moins répétitif": "Escolhe uma palavra-passe menos repetitiva",
    "Le mot de passe ne doit pas contenir ton adresse email": "A palavra-passe não deve conter o teu email",
    "Trop de tentatives. Réessaie plus tard.": "Demasiadas tentativas. Tenta novamente mais tarde."
  },
  "de": {
    "Choisir la langue": "Sprache auswählen",
    "Langue de l’interface": "Sprache der Oberfläche",
    "Dashboard": "Übersicht",
    "Live": "Live",
    "Aujourd'hui": "Heute",
    "À la une": "Highlights",
    "Combinés": "Kombiwetten",
    "Combo Builder": "Kombi-Builder",
    "Value bets": "Value Bets",
    "Montante": "Serie",
    "Track record": "Ergebnisbilanz",
    "Profil": "Profil",
    "Parrainage": "Empfehlungen",
    "Abonnement": "Abonnement",
    "Admin": "Verwaltung",
    "New": "Neu",
    "10J": "10T",
    "Free": "Kostenlos",
    "Ton pouls de gagnant": "Dem Spiel einen Schritt voraus",
    "Connecté": "Angemeldet",
    "Déconnexion": "Abmelden",
    "Plus d'options": "Weitere Optionen",
    "Fermer": "Schließen",
    "Plus": "Mehr",
    "Tableau": "Start",
    "Direct": "Live",
    "Jour": "Tag",
    "Créer": "Erstellen",
    "Blog": "Blog",
    "Mentions légales": "Impressum",
    "CGV": "Verkaufsbedingungen",
    "Confidentialité": "Datenschutz",
    "Jeu responsable · 18+": "Verantwortungsvolles Spielen · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublin, Irland",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "Dieses Konto wurde auf einem anderen Gerät oder Browser angemeldet. Diese Sitzung wurde beendet.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "Deine Sitzung ist abgelaufen. Melde dich erneut an, um fortzufahren.",
    "EN COURS": "LÄUFT",
    "ÉCHOUÉE": "GESCHEITERT",
    "TERMINÉE": "ABGESCHLOSSEN",
    "AUCUNE": "KEINE",
    "Aucune montante active.": "Keine aktive Serie.",
    "Impossible de charger la montante.": "Die Serie konnte nicht geladen werden.",
    "Impossible d'actualiser la montante.": "Die Serie konnte nicht aktualisiert werden.",
    "Le capital initial doit être un nombre positif.": "Der Startbetrag muss eine positive Zahl sein.",
    "La montante doit durer 10 ou 15 jours.": "Die Serie muss 10 oder 15 Tage dauern.",
    "Impossible de démarrer la montante.": "Die Serie konnte nicht gestartet werden.",
    "Montante WinPulse": "WinPulse-Serie",
    "10 → 15 jours": "10 → 15 Tage",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "Das System wählt vorhandene Tipps aus, die seine Kriterien erfüllen. Ein erfolgreicher Tag setzt die Serie fort, ein verlorener Tag beendet sie. Passt keine Auswahl, wartet das Modul.",
    "Actualiser": "Aktualisieren",
    "Montante indisponible": "Serie nicht verfügbar",
    "Contrôle administrateur": "Verwaltungsfunktionen",
    "Montante 10 jours": "10-Tage-Serie",
    "Montante 15 jours": "15-Tage-Serie",
    "Capital initial": "Startbetrag",
    "Démarrer": "Starten",
    "Recommencer": "Neu starten",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Nur Administratoren können die Serie starten oder neu starten, damit Nutzer sie nicht zurücksetzen können.",
    "Chargement de la montante…": "Serie wird geladen…",
    "Aucune montante active": "Keine aktive Serie",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "Ein Administrator muss eine Serie für 10 oder 15 Tage starten.",
    "progression": "Fortschritt",
    "mise de départ": "Ausgangseinsatz",
    "Capital théorique": "Theoretischer Betrag",
    "si les journées passent": "bei erfolgreichen Tagen",
    "Progression": "Fortschritt",
    "de la série": "der Serie",
    "Progression de la série": "Fortschritt der Serie",
    "Jour {{day}} sur {{total}}": "Tag {{day}} von {{total}}",
    "Pronostics du jour": "Heutige Tipps",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "Die Auswahl hängt von den Kriterien und verfügbaren Daten ab. Ein fester Quotenbereich wird nicht garantiert.",
    "Pick {{number}}": "Tipp {{number}}",
    "Confiance": "Konfidenz",
    "Début :": "Beginn:",
    "En attente d'un pick qualifié": "Warten auf einen geeigneten Tipp",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "Das Modul erzwingt keinen Tipp, der seine Kriterien nicht erfüllt.",
    "Historique": "Verlauf",
    "Aucune journée terminée.": "Noch keine abgeschlossenen Tage.",
    "GAGNÉ": "GEWONNEN",
    "REMBOURSÉ": "STORNIERT",
    "PERDU": "VERLOREN",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "Keine Sportwette ist garantiert. Die Serie begrenzt die Anzahl der Tipps, beseitigt aber nicht das Risiko. 18+ · Verantwortungsvolles Spielen.",
    "Chargement…": "Wird geladen…",
    "Analyses sportives": "Sportanalysen",
    "Historique des résultats": "Ergebnisverlauf",
    "Articles": "Artikel",
    "Ouvrir l'app": "App öffnen",
    "Connexion": "Anmelden",
    "S'inscrire": "Registrieren",
    "Démarrer gratuit": "Kostenlos starten",
    "Pronostics · Analyses · Résultats publics": "Tipps · Analysen · Öffentliche Ergebnisse",
    "Vise la victoire avec nos pronostics.": "Mit unseren Tipps den Sieg im Blick.",
    "Garde une longueur d’avance.": "Bleib einen Schritt voraus.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Entdecke die heutigen Tipps und Spielanalysen. Starte kostenlos und wechsle zu Pro für die Tipps und Kombiwetten für Abonnenten.",
    "Découvrir les pronostics": "Tipps entdecken",
    "Découvrir l’offre Pro": "Pro entdecken",
    "Consulter l’historique complet": "Vollständigen Verlauf ansehen",
    "Inscription sans carte": "Registrierung ohne Karte",
    "Résultats publics": "Öffentliche Ergebnisse",
    "Compte gratuit": "Kostenloses Konto",
    "Pronostics disponibles": "Verfügbare Tipps",
    "Chargement des analyses…": "Analysen werden geladen…",
    "Les analyses ne sont pas disponibles pour le moment.": "Die Analysen sind derzeit nicht verfügbar.",
    "Réessayer": "Erneut versuchen",
    "Les analyses du jour arrivent prochainement.": "Die heutigen Analysen folgen in Kürze.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Sieh dir bis zu den nächsten Tipps den Ergebnisverlauf an.",
    "Analyse réservée Pro": "Analyse für Pro",
    "Indice : {{value}} %": "Indikator: {{value}} %",
    "Les indices d’analyse ne garantissent aucun résultat.": "Analyseindikatoren garantieren kein Ergebnis.",
    "Ouvrir l’application": "App öffnen",
    "Créer mon compte gratuit": "Kostenloses Konto erstellen",
    "Historique des pronostics": "Tippverlauf",
    "Les résultats d’hier": "Ergebnisse von gestern",
    "Matchs du {{date}}.": "Spiele am {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "Eine Auswahl erfolgreicher Tipps von gestern aus unserer Ergebnisbilanz, nach absteigender Quote sortiert.",
    "Voir tous les résultats": "Alle Ergebnisse ansehen",
    "Chargement des résultats d’hier…": "Ergebnisse von gestern werden geladen…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "Die Übersicht von gestern ist derzeit nicht verfügbar.",
    "Tu peux consulter l’historique complet des résultats.": "Du kannst den vollständigen Ergebnisverlauf ansehen.",
    "Gagnants": "Gewonnen",
    "Perdants": "Verloren",
    "En attente": "Ausstehend",
    "Annulés / remboursés": "Storniert / erstattet",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Tipps insgesamt: {{count}}. Die Karten unten zeigen nur eine Auswahl der erfolgreichen Tipps.",
    "Aucun pronostic publié pour les matchs de cette journée.": "Für die Spiele dieses Tages wurden keine Tipps veröffentlicht.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "Für diesen Tag ist kein erfolgreicher Tipp bestätigt. Die Übersicht bleibt oben sichtbar.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Die Details der erfolgreichen Tipps sind hier noch nicht verfügbar. Sieh dir den vollständigen Verlauf an.",
    "Gagné": "Gewonnen",
    "Cote publiée": "Veröffentlichte Quote",
    "Score final": "Endstand",
    "Pronostic publié avant le match · résultat confirmé.": "Tipp vor Spielbeginn veröffentlicht · Ergebnis bestätigt.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Vergangene Ergebnisse garantieren keine zukünftigen Ergebnisse.",
    "COMMENT UTILISER WINPULSE": "SO NUTZT DU WINPULSE",
    "Une analyse pro, claire et immédiate": "Klare, leicht zugängliche Sportanalysen",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Lies die Analysen, prüfe die Ergebnisse und entscheide selbst.",
    "Explications de match": "Spielerklärungen",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Verstehe die Tipps anhand verfügbarer Daten, mit einer lokalen Erklärung oder KI-Unterstützung, sofern eingerichtet.",
    "Scoring rigoureux": "Analyseindikatoren",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Vergleiche Tipps anhand verfügbarer Indikatoren. Ein Indikator garantiert keinen Erfolg.",
    "Combinés par profil": "Kombiwetten nach Profil",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Vergleiche verfügbare Tipps und Risikostufen. Keine Kombiwette ist risikofrei.",
    "Track record transparent": "Transparente Ergebnisbilanz",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Öffentlicher Verlauf, ROI, Trefferquote und Durchschnittsquoten. Erfolgreiche und verlorene Tipps werden erfasst.",
    "Value bets détectés": "Erkennung von Value Bets",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Vergleiche Schätzungen mit angebotenen Quoten. Schätzungen bleiben unsicher.",
    "Découverte gratuite": "Kostenlos entdecken",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Erstelle dein Konto ohne Zahlung. Informiere dich anschließend in deinem Konto über Pro.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Deinen Code und die Programmbedingungen findest du in deinem Konto.",
    "Voir mon code": "Meinen Code ansehen",
    "ABONNEMENT": "ABONNEMENT",
    "Choisis ton accès": "Wähle deinen Zugang",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Entdecke WinPulse kostenlos. Mit Pro erhältst du Tipps, Kombiwetten und Tools für Abonnenten.",
    "Pour découvrir": "Zum Entdecken",
    "Sélections gratuites disponibles": "Verfügbare kostenlose Tipps",
    "Tous les matchs (cotes visibles)": "Alle Spiele mit sichtbaren Quoten",
    "Track record public": "Öffentliche Ergebnisbilanz",
    "pour 30 jours": "für 30 Tage",
    "Accès complet": "Vollständiger Zugang",
    "Tous les pronostics débloqués": "Alle Tipps freigeschaltet",
    "Tous les combinés du jour": "Alle täglichen Kombiwetten",
    "Explications des pronostics": "Erklärungen zu den Tipps",
    "Value bets et Combo Builder": "Value Bets und Kombi-Builder",
    "Montante premium": "Premium-Serie",
    "Support WhatsApp prioritaire": "Bevorzugter WhatsApp-Support",
    "Passer à Pro": "Zu Pro wechseln",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Spiele verantwortungsvoll · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Tipps sind statistische Analysen und keine Garantien. Setze nur, was du verlieren kannst. WinPulse nimmt keine Wetten an und wettet nicht für Nutzer.",
    "Renseigne ton nom.": "Gib deinen Namen ein.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "Deine WhatsApp-Nummer ist zur Kontoerstellung erforderlich.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Gib deine Nummer mit + und Ländervorwahl ein, zum Beispiel +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "Das Registrierungsformular muss aktualisiert werden. Lade die Seite neu und versuche es erneut.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "Die Registrierung war nicht erfolgreich. Versuche es gleich erneut.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analysiere Spiele. Prüfe Ergebnisse. Entscheide selbst.",
    "Commence gratuitement, sans carte bancaire.": "Starte kostenlos, ohne Bankkarte.",
    "Historique public des résultats": "Öffentlicher Ergebnisverlauf",
    "Aucun paiement pour créer le compte": "Keine Zahlung zur Kontoerstellung",
    "Invitation détectée": "Einladung erkannt",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Spiele verantwortungsvoll",
    "100 % gratuit": "100 % kostenlos",
    "Ton accès gratuit est presque prêt": "Dein kostenloser Zugang ist fast bereit",
    "Crée ton compte pour découvrir WinPulse.": "Erstelle dein Konto, um WinPulse zu entdecken.",
    "Gratuit": "Kostenlos",
    "0 FCFA": "0 FCFA",
    "Sans CB": "Ohne Karte",
    "Aucun paiement": "Keine Zahlung",
    "Libre": "Freie Wahl",
    "Sans engagement": "Ohne Bindung",
    "Nom": "Name",
    "Ton nom complet": "Dein vollständiger Name",
    "Email": "E-Mail",
    "vous@email.com": "du@email.com",
    "Numéro WhatsApp": "WhatsApp-Nummer",
    "(obligatoire)": "(erforderlich)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Verwende + und die Ländervorwahl: +33 Frankreich, +353 Irland, +225 Elfenbeinküste, +229 Benin, +223 Mali.",
    "Mot de passe": "Passwort",
    "10 caractères minimum": "Mindestens 10 Zeichen",
    "J’ai un code parrainage": "Ich habe einen Empfehlungscode",
    "Code parrainage": "Empfehlungscode",
    "(optionnel)": "(optional)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "Ich möchte über WhatsApp WinPulse-Angebote und Einladungen zu privaten Gruppen oder Communitys erhalten, per manueller oder automatisierter Nachricht. Diese Einwilligung ist freiwillig und zur Kontoerstellung nicht erforderlich. Ich kann sie in meinem Profil widerrufen.",
    "Création du compte…": "Konto wird erstellt…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "Bei der Registrierung ist keine Zahlung erforderlich. WinPulse bietet statistische Analysen und garantiert keine Gewinne.",
    "Politique de confidentialité": "Datenschutzerklärung",
    "Déjà inscrit ?": "Bereits registriert?",
    "Se connecter": "Anmelden",
    "18+ · Joue responsable": "18+ · Spiele verantwortungsvoll",
    "Bienvenue !": "Willkommen!",
    "Erreur {{status}}": "Fehler {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "Keine Antwort vom Server. Prüfe deine Internetverbindung und versuche es erneut.",
    "Erreur inconnue": "Unbekannter Fehler",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "In deinem Konto findest du Tipps, Analysen und verfügbare Ergebnisse. Kein Ergebnis ist garantiert.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Spiele verantwortungsvoll",
    "Accède à tes pronostics du jour": "Zu deinen heutigen Tipps",
    "Mot de passe oublié ?": "Passwort vergessen?",
    "Connexion en cours…": "Anmeldung läuft…",
    "Pas encore de compte ?": "Noch kein Konto?",
    "Créer un compte gratuit": "Kostenloses Konto erstellen",
    "Cache de connexion effacé. Réessaye maintenant.": "Anmeldecache gelöscht. Versuche es jetzt erneut.",
    "Le navigateur bloque l’accès au stockage local.": "Der Browser blockiert den Zugriff auf den lokalen Speicher.",
    "Problème de connexion ? Effacer le cache de connexion": "Anmeldeprobleme? Anmeldecache löschen",
    "Email ou mot de passe incorrect": "E-Mail oder Passwort falsch",
    "Email deja utilise": "E-Mail-Adresse wird bereits verwendet",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "Für die Kontoerstellung ist eine WhatsApp-Nummer erforderlich",
    "Le mot de passe doit contenir au moins 10 caractères": "Das Passwort muss mindestens 10 Zeichen enthalten",
    "Choisis un mot de passe moins courant": "Wähle ein weniger verbreitetes Passwort",
    "Choisis un mot de passe moins répétitif": "Wähle ein Passwort mit weniger Wiederholungen",
    "Le mot de passe ne doit pas contenir ton adresse email": "Das Passwort darf deine E-Mail-Adresse nicht enthalten",
    "Trop de tentatives. Réessaie plus tard.": "Zu viele Versuche. Versuche es später erneut."
  },
  "ar": {
    "Choisir la langue": "اختيار اللغة",
    "Langue de l’interface": "لغة الواجهة",
    "Dashboard": "لوحة التحكم",
    "Live": "مباشر",
    "Aujourd'hui": "اليوم",
    "À la une": "أبرز التوقعات",
    "Combinés": "التوقعات المجمعة",
    "Combo Builder": "منشئ التوقعات المجمعة",
    "Value bets": "توقعات ذات قيمة",
    "Montante": "سلسلة التوقعات",
    "Track record": "سجل النتائج",
    "Profil": "الملف الشخصي",
    "Parrainage": "دعوة الأصدقاء",
    "Abonnement": "الاشتراك",
    "Admin": "الإدارة",
    "New": "جديد",
    "10J": "١٠ أيام",
    "Free": "مجاني",
    "Ton pouls de gagnant": "ابقَ متقدماً",
    "Connecté": "تم تسجيل الدخول",
    "Déconnexion": "تسجيل الخروج",
    "Plus d'options": "خيارات إضافية",
    "Fermer": "إغلاق",
    "Plus": "المزيد",
    "Tableau": "الرئيسية",
    "Direct": "مباشر",
    "Jour": "اليوم",
    "Créer": "إنشاء",
    "Blog": "المدونة",
    "Mentions légales": "البيانات القانونية",
    "CGV": "شروط البيع",
    "Confidentialité": "الخصوصية",
    "Jeu responsable · 18+": "اللعب بمسؤولية · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · دبلن، أيرلندا",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "تم تسجيل الدخول إلى هذا الحساب من جهاز أو متصفح آخر. تم إنهاء هذه الجلسة.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "انتهت صلاحية جلستك. سجّل الدخول مجدداً للمتابعة.",
    "EN COURS": "جارية",
    "ÉCHOUÉE": "غير ناجحة",
    "TERMINÉE": "مكتملة",
    "AUCUNE": "لا توجد",
    "Aucune montante active.": "لا توجد سلسلة توقعات نشطة.",
    "Impossible de charger la montante.": "تعذّر تحميل سلسلة التوقعات.",
    "Impossible d'actualiser la montante.": "تعذّر تحديث سلسلة التوقعات.",
    "Le capital initial doit être un nombre positif.": "يجب أن يكون المبلغ الأولي رقماً موجباً.",
    "La montante doit durer 10 ou 15 jours.": "يجب أن تستمر السلسلة ١٠ أو ١٥ يوماً.",
    "Impossible de démarrer la montante.": "تعذّر بدء سلسلة التوقعات.",
    "Montante WinPulse": "سلسلة توقعات WinPulse",
    "10 → 15 jours": "١٠ إلى ١٥ يوماً",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "يختار المحرك التوقعات المتاحة التي تستوفي معاييره. يقدّم اليوم الناجح السلسلة، وينهيها اليوم الخاسر. إذا لم تتوفر اختيارات مناسبة، ينتظر النظام.",
    "Actualiser": "تحديث",
    "Montante indisponible": "سلسلة التوقعات غير متاحة",
    "Contrôle administrateur": "أدوات الإدارة",
    "Montante 10 jours": "سلسلة لمدة ١٠ أيام",
    "Montante 15 jours": "سلسلة لمدة ١٥ يوماً",
    "Capital initial": "المبلغ الأولي",
    "Démarrer": "بدء",
    "Recommencer": "إعادة البدء",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "بدء السلسلة وإعادة بدئها متاحان للإدارة فقط، لمنع المستخدمين من إعادة ضبطها.",
    "Chargement de la montante…": "جارٍ تحميل سلسلة التوقعات…",
    "Aucune montante active": "لا توجد سلسلة توقعات نشطة",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "يجب على الإدارة بدء سلسلة لمدة ١٠ أو ١٥ يوماً.",
    "progression": "التقدم",
    "mise de départ": "المبلغ الابتدائي",
    "Capital théorique": "المبلغ النظري",
    "si les journées passent": "إذا نجحت أيام السلسلة",
    "Progression": "التقدم",
    "de la série": "في السلسلة",
    "Progression de la série": "تقدم السلسلة",
    "Jour {{day}} sur {{total}}": "اليوم {{day}} من {{total}}",
    "Pronostics du jour": "توقعات اليوم",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "تعتمد الاختيارات على المعايير والبيانات المتاحة. لا يوجد نطاق ثابت مضمون للمعاملات.",
    "Pick {{number}}": "الاختيار {{number}}",
    "Confiance": "مؤشر الثقة",
    "Début :": "البداية:",
    "En attente d'un pick qualifié": "في انتظار اختيار يستوفي المعايير",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "لا يفرض النظام توقعاً لا يستوفي معاييره.",
    "Historique": "السجل",
    "Aucune journée terminée.": "لا توجد أيام مكتملة بعد.",
    "GAGNÉ": "ناجح",
    "REMBOURSÉ": "ملغى",
    "PERDU": "خاسر",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "لا توجد نتيجة مضمونة لأي رهان رياضي. تحدّ السلسلة من عدد الاختيارات، لكنها لا تلغي المخاطر. 18+ · اللعب بمسؤولية.",
    "Chargement…": "جارٍ التحميل…",
    "Analyses sportives": "تحليلات رياضية",
    "Historique des résultats": "سجل النتائج",
    "Articles": "مقالات",
    "Ouvrir l'app": "فتح التطبيق",
    "Connexion": "تسجيل الدخول",
    "S'inscrire": "إنشاء حساب",
    "Démarrer gratuit": "ابدأ مجاناً",
    "Pronostics · Analyses · Résultats publics": "توقعات · تحليلات · نتائج متاحة للجميع",
    "Vise la victoire avec nos pronostics.": "استهدف الفوز مع توقعاتنا.",
    "Garde une longueur d’avance.": "ابقَ متقدماً بخطوة.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "اكتشف توقعات اليوم وتحليلات المباريات. ابدأ مجاناً، ثم اشترك في Pro للوصول إلى الاختيارات والتوقعات المجمعة المخصصة للمشتركين.",
    "Découvrir les pronostics": "استكشاف التوقعات",
    "Découvrir l’offre Pro": "اكتشاف عرض Pro",
    "Consulter l’historique complet": "عرض السجل الكامل",
    "Inscription sans carte": "التسجيل دون بطاقة بنكية",
    "Résultats publics": "نتائج متاحة للجميع",
    "Compte gratuit": "حساب مجاني",
    "Pronostics disponibles": "التوقعات المتاحة",
    "Chargement des analyses…": "جارٍ تحميل التحليلات…",
    "Les analyses ne sont pas disponibles pour le moment.": "التحليلات غير متاحة حالياً.",
    "Réessayer": "إعادة المحاولة",
    "Les analyses du jour arrivent prochainement.": "ستتوفر تحليلات اليوم قريباً.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "تصفح سجل النتائج أثناء انتظار الاختيارات القادمة.",
    "Analyse réservée Pro": "تحليل مخصص لمشتركي Pro",
    "Indice : {{value}} %": "المؤشر: {{value}} %",
    "Les indices d’analyse ne garantissent aucun résultat.": "مؤشرات التحليل لا تضمن أي نتيجة.",
    "Ouvrir l’application": "فتح التطبيق",
    "Créer mon compte gratuit": "إنشاء حسابي المجاني",
    "Historique des pronostics": "سجل التوقعات",
    "Les résultats d’hier": "نتائج الأمس",
    "Matchs du {{date}}.": "مباريات {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "مجموعة من اختيارات الأمس الناجحة من سجل نتائجنا، مرتبة تنازلياً حسب المعامل.",
    "Voir tous les résultats": "عرض جميع النتائج",
    "Chargement des résultats d’hier…": "جارٍ تحميل نتائج الأمس…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "ملخص الأمس غير متاح حالياً.",
    "Tu peux consulter l’historique complet des résultats.": "يمكنك الاطلاع على سجل النتائج الكامل.",
    "Gagnants": "ناجحة",
    "Perdants": "خاسرة",
    "En attente": "قيد الانتظار",
    "Annulés / remboursés": "ملغاة / مستردة",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "إجمالي التوقعات: {{count}}. تعرض البطاقات أدناه مجموعة مختارة من التوقعات الناجحة فقط.",
    "Aucun pronostic publié pour les matchs de cette journée.": "لم تُنشر توقعات لمباريات هذا اليوم.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "لا توجد توقعات ناجحة مؤكدة لهذا اليوم. يظل الملخص ظاهراً أعلاه.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "تفاصيل التوقعات الناجحة غير متاحة هنا بعد. راجع السجل الكامل.",
    "Gagné": "ناجح",
    "Cote publiée": "المعامل المنشور",
    "Score final": "النتيجة النهائية",
    "Pronostic publié avant le match · résultat confirmé.": "توقع منشور قبل المباراة · نتيجة مؤكدة.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "النتائج السابقة لا تضمن النتائج القادمة.",
    "COMMENT UTILISER WINPULSE": "كيفية استخدام WINPULSE",
    "Une analyse pro, claire et immédiate": "تحليل رياضي واضح وسهل الوصول",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "اطلع على التحليلات، وتحقق من النتائج، واحتفظ بالتحكم في قراراتك.",
    "Explications de match": "شروحات المباريات",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "افهم الاختيارات بناءً على البيانات المتاحة، مع شرح محلي أو مساعدة بالذكاء الاصطناعي عند تهيئتها.",
    "Scoring rigoureux": "مؤشرات التحليل",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "استخدم المؤشرات المتاحة لمقارنة الاختيارات. المؤشر ليس ضماناً للنجاح.",
    "Combinés par profil": "توقعات مجمعة حسب النمط",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "قارن الاختيارات ومستويات المخاطر المتاحة. لا توجد مجموعة توقعات خالية من المخاطر.",
    "Track record transparent": "سجل نتائج شفاف",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "سجل عام، وعائد، ومعدل نجاح، ومتوسط معاملات. يشمل الاختيارات الناجحة والخاسرة.",
    "Value bets détectés": "رصد توقعات ذات قيمة",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "قارن التقديرات بالمعاملات المعروضة. تظل التقديرات غير مؤكدة.",
    "Découverte gratuite": "اكتشاف مجاني",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "أنشئ حسابك دون دفع. ثم اطلع على شروط عرض Pro من حسابك.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "ستجد رمزك وشروط البرنامج في حسابك.",
    "Voir mon code": "عرض رمزي",
    "ABONNEMENT": "الاشتراك",
    "Choisis ton accès": "اختر طريقة الوصول",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "اكتشف WinPulse مجاناً. اشترك في Pro للوصول إلى التوقعات والمجموعات والأدوات المخصصة للمشتركين.",
    "Pour découvrir": "للاكتشاف",
    "Sélections gratuites disponibles": "الاختيارات المجانية المتاحة",
    "Tous les matchs (cotes visibles)": "جميع المباريات مع المعاملات الظاهرة",
    "Track record public": "سجل نتائج عام",
    "pour 30 jours": "لمدة ٣٠ يوماً",
    "Accès complet": "وصول كامل",
    "Tous les pronostics débloqués": "إتاحة جميع التوقعات",
    "Tous les combinés du jour": "جميع التوقعات المجمعة لليوم",
    "Explications des pronostics": "شروحات التوقعات",
    "Value bets et Combo Builder": "توقعات ذات قيمة ومنشئ المجموعات",
    "Montante premium": "سلسلة توقعات مميزة",
    "Support WhatsApp prioritaire": "دعم ذو أولوية عبر WhatsApp",
    "Passer à Pro": "الترقية إلى Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · العب بمسؤولية · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "التوقعات تحليلات إحصائية وليست ضمانات. لا تراهن إلا بما يمكنك تحمّل خسارته. لا يقبل WinPulse الرهانات ولا يراهن نيابةً عن مستخدميه.",
    "Renseigne ton nom.": "أدخل اسمك.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "رقم WhatsApp مطلوب لإنشاء حسابك.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "أدخل رقمك مع + ورمز البلد، مثل +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "يحتاج نموذج التسجيل إلى تحديث. حدّث الصفحة ثم أعد المحاولة.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "لم يكتمل التسجيل. أعد المحاولة بعد قليل.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "حلّل المباريات. تحقق من النتائج. اتخذ قرارك بنفسك.",
    "Commence gratuitement, sans carte bancaire.": "ابدأ مجاناً، دون بطاقة بنكية.",
    "Historique public des résultats": "سجل نتائج متاح للجميع",
    "Aucun paiement pour créer le compte": "لا يلزم الدفع لإنشاء الحساب",
    "Invitation détectée": "تم العثور على دعوة",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · العب بمسؤولية",
    "100 % gratuit": "مجاني بالكامل",
    "Ton accès gratuit est presque prêt": "وصولك المجاني أصبح جاهزاً تقريباً",
    "Crée ton compte pour découvrir WinPulse.": "أنشئ حسابك لاكتشاف WinPulse.",
    "Gratuit": "مجاني",
    "0 FCFA": "0 FCFA",
    "Sans CB": "دون بطاقة",
    "Aucun paiement": "دون دفع",
    "Libre": "الاختيار لك",
    "Sans engagement": "دون التزام",
    "Nom": "الاسم",
    "Ton nom complet": "اسمك الكامل",
    "Email": "البريد الإلكتروني",
    "vous@email.com": "you@email.com",
    "Numéro WhatsApp": "رقم WhatsApp",
    "(obligatoire)": "(مطلوب)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "أضف + ورمز بلدك: +33 فرنسا، +353 أيرلندا، +225 ساحل العاج، +229 بنين، +223 مالي.",
    "Mot de passe": "كلمة المرور",
    "10 caractères minimum": "١٠ أحرف على الأقل",
    "J’ai un code parrainage": "لديّ رمز دعوة",
    "Code parrainage": "رمز الدعوة",
    "(optionnel)": "(اختياري)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "أوافق على تلقي عروض WinPulse ودعوات إلى مجموعاته أو مجتمعاته الخاصة عبر WhatsApp، برسائل يدوية أو تلقائية. هذا الإذن اختياري وليس شرطاً لإنشاء حسابي. يمكنني سحبه من ملفي الشخصي.",
    "Création du compte…": "جارٍ إنشاء الحساب…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "لا يُطلب أي دفع عند التسجيل. يقدم WinPulse تحليلات إحصائية ولا يضمن أي أرباح.",
    "Politique de confidentialité": "سياسة الخصوصية",
    "Déjà inscrit ?": "لديك حساب بالفعل؟",
    "Se connecter": "تسجيل الدخول",
    "18+ · Joue responsable": "18+ · العب بمسؤولية",
    "Bienvenue !": "مرحباً بك!",
    "Erreur {{status}}": "خطأ {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "لا توجد استجابة من الخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
    "Erreur inconnue": "خطأ غير معروف",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "اطلع على توقعاتك وتحليلاتك والنتائج المتاحة من حسابك. لا توجد نتيجة مضمونة.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · العب بمسؤولية",
    "Accède à tes pronostics du jour": "الوصول إلى توقعات اليوم",
    "Mot de passe oublié ?": "نسيت كلمة المرور؟",
    "Connexion en cours…": "جارٍ تسجيل الدخول…",
    "Pas encore de compte ?": "ليس لديك حساب بعد؟",
    "Créer un compte gratuit": "إنشاء حساب مجاني",
    "Cache de connexion effacé. Réessaye maintenant.": "تم مسح ذاكرة تسجيل الدخول. أعد المحاولة الآن.",
    "Le navigateur bloque l’accès au stockage local.": "المتصفح يمنع الوصول إلى التخزين المحلي.",
    "Problème de connexion ? Effacer le cache de connexion": "مشكلة في الدخول؟ امسح ذاكرة تسجيل الدخول",
    "Email ou mot de passe incorrect": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "Email deja utilise": "البريد الإلكتروني مستخدم بالفعل",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "رقم WhatsApp مطلوب لإنشاء الحساب",
    "Le mot de passe doit contenir au moins 10 caractères": "يجب أن تتكون كلمة المرور من ١٠ أحرف على الأقل",
    "Choisis un mot de passe moins courant": "اختر كلمة مرور أقل شيوعاً",
    "Choisis un mot de passe moins répétitif": "اختر كلمة مرور أقل تكراراً",
    "Le mot de passe ne doit pas contenir ton adresse email": "يجب ألا تتضمن كلمة المرور عنوان بريدك الإلكتروني",
    "Trop de tentatives. Réessaie plus tard.": "محاولات كثيرة. أعد المحاولة لاحقاً."
  }
};

function normalizeLanguage(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return LANGUAGE_CODES.has(code) ? code : null;
}

function browserLanguage() {
  if (typeof navigator === "undefined") return "fr";
  const candidates = [...(Array.isArray(navigator.languages) ? navigator.languages : []), navigator.language];
  for (const candidate of candidates) {
    const supported = normalizeLanguage(candidate);
    if (supported) return supported;
  }
  return "fr";
}

function initialLanguage() {
  try {
    const stored = typeof window !== "undefined" ? normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) : null;
    if (stored) return stored;
  } catch { /* Stockage facultatif : navigation privée ou stockage bloqué. */ }
  return browserLanguage();
}

function translateText(language, source, values = {}) {
  const code = normalizeLanguage(language) || "fr";
  const safeSource = typeof source === "string" ? source : "";
  const has = (dictionary, key) => Object.prototype.hasOwnProperty.call(dictionary || {}, key);
  const message = has(LANGUAGE_MESSAGES[code], safeSource)
    ? LANGUAGE_MESSAGES[code][safeSource]
    : has(LANGUAGE_MESSAGES.fr, safeSource) ? LANGUAGE_MESSAGES.fr[safeSource] : safeSource;
  return message.replace(/\{\{(\w+)\}\}/g, (placeholder, key) =>
    Object.prototype.hasOwnProperty.call(values || {}, key) ? String(values[key] ?? "") : placeholder);
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setCurrentLanguage] = useState(initialLanguage);
  const selected = SUPPORTED_LANGUAGES.find(item => item.code === language) || SUPPORTED_LANGUAGES[0];
  const t = useCallback((source, values) => translateText(language, source, values), [language]);
  const setLanguage = useCallback((value) => {
    const supported = normalizeLanguage(value);
    if (supported) setCurrentLanguage(supported);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = selected.code;
      document.documentElement.dir = selected.dir;
    }
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, selected.code); } catch { /* Le choix reste actif en mémoire. */ }
  }, [selected.code, selected.dir]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== LANGUAGE_STORAGE_KEY) return;
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
      if (event.newValue === null) setCurrentLanguage(browserLanguage());
      else {
        const next = normalizeLanguage(event.newValue);
        if (next) setCurrentLanguage(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const formatNumber = useCallback((value, options = {}) => {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    try { return new Intl.NumberFormat(selected.locale, options).format(number); } catch { return String(number); }
  }, [selected.locale]);
  const formatDate = useCallback((value, options = {}) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    try { return new Intl.DateTimeFormat(selected.locale, options).format(date); } catch { return "—"; }
  }, [selected.locale]);
  const context = useMemo(() => ({ language, locale: selected.locale, direction: selected.dir, setLanguage, t, formatNumber, formatDate }),
    [language, selected.locale, selected.dir, setLanguage, t, formatNumber, formatDate]);
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage doit être utilisé dans LanguageProvider.");
  return context;
}

export function LanguageSwitcher({ compact = false, dark = false }) {
  const { language, setLanguage, t } = useLanguage();
  const selectId = useId();
  return <div dir="ltr" className={`flex min-w-0 items-center gap-2 ${compact ? "max-w-[150px]" : "w-full"}`}>
    <label htmlFor={selectId} className="sr-only">{t("Choisir la langue")}</label>
    <span aria-hidden="true" className={dark ? "text-orange-300" : "text-orange-600"}><Globe2 className="h-5 w-5 shrink-0" /></span>
    <select id={selectId} value={language} onChange={event => setLanguage(event.target.value)}
      aria-label={t("Choisir la langue")} data-testid="language-selector"
      className={`min-h-11 min-w-0 flex-1 rounded-xl border px-2 py-2 text-base font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${dark ? "border-slate-700 bg-slate-900 text-white" : "border-neutral-200 bg-white text-slate-800"}`}>
      {SUPPORTED_LANGUAGES.map(item => <option key={item.code} value={item.code} lang={item.code} dir={item.dir}>{item.name}</option>)}
    </select>
  </div>;
}


const NAV = [
  {
    to: "/app",
    label: "Dashboard",
    icon: LayoutDashboard,
    end: true,
    testId: "nav-dashboard",
  },
  {
    to: "/app/live",
    label: "Live",
    icon: Radio,
    testId: "nav-live",
    badge: "Live",
  },
  {
    to: "/app/aujourdhui",
    label: "Aujourd'hui",
    icon: Zap,
    testId: "nav-today",
    badge: "New",
  },
  {
    to: "/app/top",
    label: "À la une",
    icon: Trophy,
    testId: "nav-top",
  },
  {
    to: "/app/combines",
    label: "Combinés",
    icon: Layers,
    testId: "nav-combos",
  },
  {
    to: "/app/builder",
    label: "Combo Builder",
    icon: Sparkles,
    testId: "nav-builder",
    badge: "New",
  },
  {
    to: "/app/value-bets",
    label: "Value bets",
    icon: Target,
    testId: "nav-value-bets",
  },
  {
    to: "/app/montante",
    label: "Montante",
    icon: TrendingUp,
    testId: "nav-montante",
    badge: "10J",
  },
  {
    to: "/resultats",
    label: "Track record",
    icon: History,
    testId: "nav-history",
  },
  {
    to: "/app/profil",
    label: "Profil",
    icon: User,
    testId: "nav-profile",
  },
  {
    to: "/app/parrainage",
    label: "Parrainage",
    icon: Gift,
    testId: "nav-referral",
  },
  {
    to: "/app/abonnement",
    label: "Abonnement",
    icon: CreditCard,
    testId: "nav-subscription",
  },
];


const WINPULSE_MONTHLY_PRICE_LABEL = "10 500 FCFA";

function normalizeLegacyPriceText(text) {
  return String(text || "")
    .replace(/4[\s.\u00A0\u202F]?500\s*FCFA/gi, WINPULSE_MONTHLY_PRICE_LABEL)
    .replace(/6[\s.\u00A0\u202F]?500\s*FCFA/gi, WINPULSE_MONTHLY_PRICE_LABEL);
}

// Sur mobile : 4 onglets essentiels + "Plus".
// Cela évite que les 11+ entrées de navigation agrandissent la barre fixe
// sur plusieurs lignes et recouvrent le contenu.
const MOBILE_PRIMARY_KEYS = [
  "/app",
  "/app/live",
  "/app/aujourdhui",
  "/app/builder",
];

export default function AppLayout({ children }) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  // Sécurité anti-partage : le serveur autorise une seule session active pour
  // Free/Pro. Si ce compte est reconnecté ailleurs, l'ancien navigateur reçoit
  // SESSION_REVOKED et est déconnecté proprement. Les comptes Admin peuvent
  // avoir plusieurs sessions simultanées : le serveur les exempte de la règle.
  useEffect(() => {
    if (!user?.id) return undefined;

    let stopped = false;
    let handlingRevocation = false;

    const verifySession = async () => {
      if (stopped || handlingRevocation) return;

      try {
        await api.get("/auth/me");
      } catch (error) {
        const status = error?.response?.status;
        const detail = String(error?.response?.data?.detail || "");

        if (status === 401) {
          handlingRevocation = true;

          if (detail === "SESSION_REVOKED") {
            toast.error(
              t("Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.")
            );
          } else {
            toast.error(t("Ta session a expiré. Reconnecte-toi pour continuer."));
          }

          logout();
          navigate("/login", { replace: true });
        }
      }
    };

    // Contrôle immédiat, puis périodique. Les événements focus/visibility
    // rendent la révocation quasi immédiate quand l'utilisateur revient sur l'app.
    verifySession();
    const intervalId = window.setInterval(verifySession, 15000);

    const onFocus = () => verifySession();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") verifySession();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user?.id, logout, navigate, t]);

  // Filet de sécurité global : neutralise tout ancien tarif d’abonnement encore affiché
  // encore éventuellement présents dans un vieux composant ou un contenu mis en cache.
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return undefined;

    const normalizeNode = (container) => {
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT
      );
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && !["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(parent.tagName)) {
          const nextValue = normalizeLegacyPriceText(node.nodeValue);
          if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
        }
        node = walker.nextNode();
      }
    };

    normalizeNode(root);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const nextValue = normalizeLegacyPriceText(node.nodeValue);
            if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            normalizeNode(node);
          }
        });
        if (mutation.type === "characterData" && mutation.target?.nodeValue) {
          const nextValue = normalizeLegacyPriceText(mutation.target.nodeValue);
          if (nextValue !== mutation.target.nodeValue) mutation.target.nodeValue = nextValue;
        }
      }
    });

    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const subscriptionTier = String(
    user?.subscription_tier || user?.subscription || "free"
  ).toLowerCase();

  const tierLabel = ({
    free: {
      label: t("Free"),
      cls: "bg-slate-100 text-slate-700",
    },
    pro: {
      label: "Pro",
      cls: "bg-orange-100 text-orange-700",
    },
    elite: {
      label: "Elite",
      cls: "bg-rose-100 text-rose-700",
    },
  }[subscriptionTier] || {
    label: subscriptionTier === "free" ? t("Free") : "Pro",
    cls: subscriptionTier === "free"
      ? "bg-slate-100 text-slate-700"
      : "bg-orange-100 text-orange-700",
  });

  const mobileLabels = { "/app": t("Tableau"), "/app/live": t("Direct"), "/app/aujourdhui": t("Jour"), "/app/builder": t("Créer") };
  const navItems = NAV.map(item => ({ ...item, label: t(item.label), shortLabel: t(mobileLabels[item.to] || item.label), badge: item.badge ? t(item.badge) : null }));

  if (user?.is_admin) {
    navItems.push({
      to: "/app/admin",
      label: t("Admin"),
      icon: ShieldCheck,
      testId: "nav-admin",
    });
  }

  const isActive = (item) =>
    item.end
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to);

  const primaryMobileItems = navItems.filter((i) =>
    MOBILE_PRIMARY_KEYS.includes(i.to)
  );

  const moreMobileItems = navItems.filter(
    (i) => !MOBILE_PRIMARY_KEYS.includes(i.to)
  );

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-neutral-50">
      {/* Sidebar desktop */}
      <aside
        className="hidden lg:flex fixed inset-y-0 ltr:left-0 rtl:right-0 w-64 bg-slate-950 text-slate-100 flex-col"
        data-testid="app-sidebar"
      >
        <div className="px-6 py-6 border-b border-slate-800/80 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center shadow-lg shadow-orange-600/30">
            <Zap
              className="h-5 w-5 text-white"
              strokeWidth={2.5}
              fill="white"
            />
          </div>

          <div>
            <div className="font-heading font-extrabold tracking-tight text-lg leading-none">
              WinPulse
            </div>

            <div className="text-[10px] uppercase tracking-[0.18em] text-orange-400/70 mt-1">
              {t("Ton pouls de gagnant")}
            </div>
          </div>
        </div>

        <div className="px-4 pt-4"><LanguageSwitcher dark /></div>
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);

            return (
              <Link
                key={item.to}
                to={item.to}
                data-testid={item.testId}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-gradient-to-r from-orange-600/20 to-rose-600/10 text-white border border-orange-500/30"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    active && "text-orange-400"
                  )}
                  strokeWidth={2}
                />

                <span className="flex-1">{item.label}</span>

                {item.badge && (
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-500 text-white px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80">
          <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-400">
                {t("Connecté")}
              </div>

              <Badge
                className={cn(
                  "text-[10px] font-bold",
                  tierLabel.cls
                )}
                data-testid="user-tier-badge"
              >
                {tierLabel.label === "Elite" && (
                  <Crown className="h-3 w-3 me-1" />
                )}

                {tierLabel.label}
              </Badge>
            </div>

            <div
              className="text-sm font-semibold truncate"
              data-testid="user-name"
            >
              {user?.full_name}
            </div>

            <div className="text-xs text-slate-400 truncate mb-2">
              {user?.email}
            </div>

            <Button
              data-testid="logout-button"
              size="sm"
              variant="ghost"
              className="w-full text-slate-300 hover:text-white hover:bg-slate-800 justify-start"
              onClick={async () => {
                try {
                  await api.post("/auth/logout");
                } catch {
                  // Même si le réseau est indisponible, on termine la déconnexion locale.
                }
                logout();
                navigate("/");
              }}
            >
              <LogOut className="h-3.5 w-3.5 me-2" />
              {t("Déconnexion")}
            </Button>
          </div>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="lg:hidden sticky top-0 z-40 w-full bg-white/95 backdrop-blur-xl border-b border-neutral-200 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-lg wp-gradient-warm grid place-items-center text-white">
            <Zap
              className="h-4 w-4"
              strokeWidth={2.5}
              fill="white"
            />
          </div>

          <span className="font-heading font-extrabold truncate hidden min-[380px]:inline">
            WinPulse
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1 shrink-0">
          <LanguageSwitcher compact />
          <Badge
            className={cn(
              "text-[10px] font-bold",
              tierLabel.cls
            )}
          >
            {tierLabel.label}
          </Badge>

          <Button
            data-testid="logout-button-mobile"
            size="icon"
            variant="ghost"
            aria-label={t("Déconnexion")}
            className="min-h-11 min-w-11 text-slate-500 hover:text-rose-600 hover:bg-rose-50"
            onClick={() => {
              logout();
              navigate("/");
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Panneau "Plus" mobile */}
      {moreOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setMoreOpen(false)}
            data-testid="mobile-more-overlay"
          />

          <div
            className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-50 bg-white border-t border-neutral-200 rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto overscroll-contain"
            data-testid="mobile-more-panel"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <span className="font-heading font-bold text-slate-900 text-sm">
                {t("Plus d'options")}
              </span>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label={t("Fermer")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-3 pb-5">
              {moreMobileItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    data-testid={`${item.testId}-mobile-more`}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 text-[11px] font-medium text-center",
                      active
                        ? "bg-orange-50 text-orange-600"
                        : "text-slate-600 hover:bg-neutral-50"
                    )}
                  >
                    <Icon className="h-5 w-5" />

                    <span className="leading-tight">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Navigation mobile : une seule ligne + zone tactile compatible iPhone */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/98 backdrop-blur border-t border-neutral-200 grid grid-cols-5 min-h-16 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        data-testid="mobile-bottom-nav"
      >
        {primaryMobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <Link
              key={item.to}
              to={item.to}
              data-testid={`${item.testId}-mobile`}
              className={cn(
                "min-w-0 flex flex-col items-center justify-center py-2 text-xs",
                active
                  ? "text-orange-600"
                  : "text-slate-500"
              )}
            >
              <Icon className="h-5 w-5 mb-1 shrink-0" />

              <span className="leading-snug text-center break-words px-1 w-full">
                {item.shortLabel}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          data-testid="mobile-more-toggle"
          aria-expanded={moreOpen}
          className={cn(
            "min-w-0 flex flex-col items-center justify-center py-2 text-xs",
            moreOpen
              ? "text-orange-600"
              : "text-slate-500"
          )}
        >
          <Menu className="h-5 w-5 mb-1 shrink-0" />

          <span className="leading-none">
            {t("Plus")}
          </span>
        </button>
      </nav>

      {/* Contenu principal */}
      <main className="ltr:lg:pl-64 rtl:lg:pr-64 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 min-h-screen w-full min-w-0 max-w-full flex flex-col">
        <div className="flex-1 min-w-0 max-w-full overflow-x-hidden">
          {children}
        </div>

        <footer className="border-t border-neutral-200 bg-white py-5 px-3 sm:px-4">
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-2 text-xs">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link
                to="/blog"
                className="text-slate-500 hover:text-orange-600 font-semibold"
              >
                {t("Blog")}
              </Link>

              <span className="text-slate-300">·</span>

              <Link
                to="/legal/mentions-legales"
                className="text-slate-500 hover:text-orange-600 font-semibold"
              >
                {t("Mentions légales")}
              </Link>

              <span className="text-slate-300">·</span>

              <Link
                to="/legal/cgv"
                className="text-slate-500 hover:text-orange-600 font-semibold"
              >
                {t("CGV")}
              </Link>

              <span className="text-slate-300">·</span>

              <Link
                to="/legal/confidentialite"
                className="text-slate-500 hover:text-orange-600 font-semibold"
              >
                {t("Confidentialité")}
              </Link>

              <span className="text-slate-300">·</span>

              <Link
                to="/legal/jeu-responsable"
                className="text-rose-600 hover:text-rose-700 font-semibold"
              >
                {t("Jeu responsable · 18+")}
              </Link>
            </div>

            <div className="text-slate-400">
              {t("© 2026 WinPulse · Dublin, Irlande")}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
