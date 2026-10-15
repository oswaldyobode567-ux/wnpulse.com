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
    "Chargement…": "Chargement…"
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
    "Chargement…": "Loading…"
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
    "Chargement…": "Cargando…"
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
    "Chargement…": "A carregar…"
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
    "Chargement…": "Wird geladen…"
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
    "Chargement…": "جارٍ التحميل…"
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
