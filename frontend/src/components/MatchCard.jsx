import { useMatchShareBasket } from "@/contexts/MatchShareBasket";
import PickShareImagePanel from "@/components/PickShareImagePanel";
import { copyShareText } from "@/lib/shareClipboard";
import api from "@/lib/api";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Radio, Lock, Clock, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { useLanguage, usePageLanguage, FollowPickButton } from "@/components/AppLayout";

const MATCH_MESSAGES = {
  "fr": {
    "Voir l’analyse": "Voir l’analyse",
    "🟢 SÛR": "🟢 PRUDENT",
    "🟡 MODÉRÉ": "🟡 MODÉRÉ",
    "🔴 RISQUÉ": "🔴 RISQUÉ",
    "LIVE": "LIVE",
    "Pronostic": "Pronostic",
    "Cote": "Cote",
    "chez {{bookmaker}}": "chez {{bookmaker}}",
    "En attente": "En attente",
    "Vainqueur (1X2)": "Vainqueur (1X2)",
    "Vainqueur": "Vainqueur",
    "Total buts/points": "Total buts/points",
    "Total de buts": "Total de buts",
    "Double chance": "Double chance",
    "Les deux équipes marquent": "Les deux équipes marquent",
    "Handicap": "Handicap",
    "Cartons": "Cartons",
    "Corners": "Corners",
    "Mi-temps": "Mi-temps",
    "Match nul": "Match nul",
    "Plus de {{line}} buts": "Plus de {{line}} buts",
    "Moins de {{line}} buts": "Moins de {{line}} buts",
    "Plus de {{line}} points": "Plus de {{line}} points",
    "Moins de {{line}} points": "Moins de {{line}} points",
    "Plus de {{line}} corners": "Plus de {{line}} corners",
    "Moins de {{line}} corners": "Moins de {{line}} corners",
    "Plus de {{line}} cartons": "Plus de {{line}} cartons",
    "Moins de {{line}} cartons": "Moins de {{line}} cartons",
    "TERMINÉ": "TERMINÉ",
    "EN DIRECT": "EN DIRECT",
    "Pick verrouillé": "Pick verrouillé",
    "Passe Pro pour voir l’analyse": "Passe Pro pour voir l’analyse",
    "Confiance du moteur": "Confiance du moteur",
    "Avantage estimé : {{edge}}": "Avantage estimé : {{edge}}",
    "GAGNÉ": "GAGNÉ",
    "PERDU": "PERDU",
    "Analyse en cours…": "Analyse en cours…",
    "Autres marchés analysés": "Autres marchés analysés",
    "Partager WhatsApp (Admin)": "Partager WhatsApp (Admin)",
    "Pronostic à risque réduit": "Pronostic à risque réduit",
    "Pronostic à risque modéré": "Pronostic à risque modéré",
    "Pronostic risqué": "Pronostic risqué",
    "Victoire de {{team}}": "Victoire de {{team}}",
    "Plus de {{line}}": "Plus de {{line}}",
    "Moins de {{line}}": "Moins de {{line}}",
    "Oui": "Oui",
    "Non": "Non",
    "Les deux équipes marquent : Oui": "Les deux équipes marquent : Oui",
    "Les deux équipes marquent : Non": "Les deux équipes marquent : Non"
  },
  "en": {
    "Voir l’analyse": "View analysis",
    "🟢 SÛR": "🟢 LOWER RISK",
    "🟡 MODÉRÉ": "🟡 MODERATE",
    "🔴 RISQUÉ": "🔴 HIGHER RISK",
    "LIVE": "LIVE",
    "Pronostic": "Prediction",
    "Cote": "Odds",
    "chez {{bookmaker}}": "at {{bookmaker}}",
    "En attente": "Pending",
    "Vainqueur (1X2)": "Match winner (1X2)",
    "Vainqueur": "Winner",
    "Total buts/points": "Total goals/points",
    "Total de buts": "Total goals",
    "Double chance": "Double chance",
    "Les deux équipes marquent": "Both teams to score",
    "Handicap": "Handicap",
    "Cartons": "Cards",
    "Corners": "Corners",
    "Mi-temps": "Half-time",
    "Match nul": "Draw",
    "Plus de {{line}} buts": "Over {{line}} goals",
    "Moins de {{line}} buts": "Under {{line}} goals",
    "Plus de {{line}} points": "Over {{line}} points",
    "Moins de {{line}} points": "Under {{line}} points",
    "Plus de {{line}} corners": "Over {{line}} corners",
    "Moins de {{line}} corners": "Under {{line}} corners",
    "Plus de {{line}} cartons": "Over {{line}} cards",
    "Moins de {{line}} cartons": "Under {{line}} cards",
    "TERMINÉ": "FINISHED",
    "EN DIRECT": "LIVE",
    "Pick verrouillé": "Locked pick",
    "Passe Pro pour voir l’analyse": "Upgrade to Pro to view the analysis",
    "Confiance du moteur": "Engine confidence",
    "Avantage estimé : {{edge}}": "Estimated edge: {{edge}}",
    "GAGNÉ": "WON",
    "PERDU": "LOST",
    "Analyse en cours…": "Analysis in progress…",
    "Autres marchés analysés": "Other analysed markets",
    "Partager WhatsApp (Admin)": "Share on WhatsApp (Admin)",
    "Pronostic à risque réduit": "Lower-risk prediction",
    "Pronostic à risque modéré": "Moderate-risk prediction",
    "Pronostic risqué": "Higher-risk prediction",
    "Victoire de {{team}}": "{{team}} to win",
    "Plus de {{line}}": "Over {{line}}",
    "Moins de {{line}}": "Under {{line}}",
    "Oui": "Yes",
    "Non": "No",
    "Les deux équipes marquent : Oui": "Both teams to score: Yes",
    "Les deux équipes marquent : Non": "Both teams to score: No"
  },
  "es": {
    "Voir l’analyse": "Ver análisis",
    "🟢 SÛR": "🟢 MENOR RIESGO",
    "🟡 MODÉRÉ": "🟡 MODERADO",
    "🔴 RISQUÉ": "🔴 ARRIESGADO",
    "LIVE": "EN DIRECTO",
    "Pronostic": "Pronóstico",
    "Cote": "Cuota",
    "chez {{bookmaker}}": "en {{bookmaker}}",
    "En attente": "Pendientes",
    "Vainqueur (1X2)": "Ganador (1X2)",
    "Vainqueur": "Ganador",
    "Total buts/points": "Total de goles/puntos",
    "Total de buts": "Total de goles",
    "Double chance": "Doble oportunidad",
    "Les deux équipes marquent": "Ambos equipos marcan",
    "Handicap": "Hándicap",
    "Cartons": "Tarjetas",
    "Corners": "Córneres",
    "Mi-temps": "Descanso",
    "Match nul": "Empate",
    "Plus de {{line}} buts": "Más de {{line}} goles",
    "Moins de {{line}} buts": "Menos de {{line}} goles",
    "Plus de {{line}} points": "Más de {{line}} puntos",
    "Moins de {{line}} points": "Menos de {{line}} puntos",
    "Plus de {{line}} corners": "Más de {{line}} córneres",
    "Moins de {{line}} corners": "Menos de {{line}} córneres",
    "Plus de {{line}} cartons": "Más de {{line}} tarjetas",
    "Moins de {{line}} cartons": "Menos de {{line}} tarjetas",
    "TERMINÉ": "FINALIZADO",
    "EN DIRECT": "EN DIRECTO",
    "Pick verrouillé": "Selección bloqueada",
    "Passe Pro pour voir l’analyse": "Pásate a Pro para ver el análisis",
    "Confiance du moteur": "Confianza del motor",
    "Avantage estimé : {{edge}}": "Ventaja estimada: {{edge}}",
    "GAGNÉ": "GANADO",
    "PERDU": "PERDIDO",
    "Analyse en cours…": "Análisis en curso…",
    "Autres marchés analysés": "Otros mercados analizados",
    "Partager WhatsApp (Admin)": "Compartir en WhatsApp (Admin)",
    "Pronostic à risque réduit": "Pronóstico de menor riesgo",
    "Pronostic à risque modéré": "Pronóstico de riesgo moderado",
    "Pronostic risqué": "Pronóstico arriesgado",
    "Victoire de {{team}}": "Victoria de {{team}}",
    "Plus de {{line}}": "Más de {{line}}",
    "Moins de {{line}}": "Menos de {{line}}",
    "Oui": "Sí",
    "Non": "No",
    "Les deux équipes marquent : Oui": "Ambos equipos marcan: Sí",
    "Les deux équipes marquent : Non": "Ambos equipos marcan: No"
  },
  "pt": {
    "Voir l’analyse": "Ver análise",
    "🟢 SÛR": "🟢 MENOR RISCO",
    "🟡 MODÉRÉ": "🟡 MODERADO",
    "🔴 RISQUÉ": "🔴 ARRISCADO",
    "LIVE": "EM DIRETO",
    "Pronostic": "Prognóstico",
    "Cote": "Odd",
    "chez {{bookmaker}}": "na {{bookmaker}}",
    "En attente": "Pendentes",
    "Vainqueur (1X2)": "Vencedor (1X2)",
    "Vainqueur": "Vencedor",
    "Total buts/points": "Total de golos/pontos",
    "Total de buts": "Total de golos",
    "Double chance": "Dupla hipótese",
    "Les deux équipes marquent": "Ambas marcam",
    "Handicap": "Handicap",
    "Cartons": "Cartões",
    "Corners": "Cantos",
    "Mi-temps": "Intervalo",
    "Match nul": "Empate",
    "Plus de {{line}} buts": "Mais de {{line}} golos",
    "Moins de {{line}} buts": "Menos de {{line}} golos",
    "Plus de {{line}} points": "Mais de {{line}} pontos",
    "Moins de {{line}} points": "Menos de {{line}} pontos",
    "Plus de {{line}} corners": "Mais de {{line}} cantos",
    "Moins de {{line}} corners": "Menos de {{line}} cantos",
    "Plus de {{line}} cartons": "Mais de {{line}} cartões",
    "Moins de {{line}} cartons": "Menos de {{line}} cartões",
    "TERMINÉ": "TERMINADO",
    "EN DIRECT": "EM DIRETO",
    "Pick verrouillé": "Seleção bloqueada",
    "Passe Pro pour voir l’analyse": "Adere ao Pro para ver a análise",
    "Confiance du moteur": "Confiança do motor",
    "Avantage estimé : {{edge}}": "Vantagem estimada: {{edge}}",
    "GAGNÉ": "GANHO",
    "PERDU": "PERDIDO",
    "Analyse en cours…": "Análise em curso…",
    "Autres marchés analysés": "Outros mercados analisados",
    "Partager WhatsApp (Admin)": "Partilhar no WhatsApp (Admin)",
    "Pronostic à risque réduit": "Prognóstico de menor risco",
    "Pronostic à risque modéré": "Prognóstico de risco moderado",
    "Pronostic risqué": "Prognóstico arriscado",
    "Victoire de {{team}}": "Vitória de {{team}}",
    "Plus de {{line}}": "Mais de {{line}}",
    "Moins de {{line}}": "Menos de {{line}}",
    "Oui": "Sim",
    "Non": "Não",
    "Les deux équipes marquent : Oui": "Ambas marcam: Sim",
    "Les deux équipes marquent : Non": "Ambas marcam: Não"
  },
  "de": {
    "Voir l’analyse": "Analyse ansehen",
    "🟢 SÛR": "🟢 GERINGERES RISIKO",
    "🟡 MODÉRÉ": "🟡 MODERAT",
    "🔴 RISQUÉ": "🔴 HÖHERES RISIKO",
    "LIVE": "LIVE",
    "Pronostic": "Tipp",
    "Cote": "Quote",
    "chez {{bookmaker}}": "bei {{bookmaker}}",
    "En attente": "Ausstehend",
    "Vainqueur (1X2)": "Sieger (1X2)",
    "Vainqueur": "Sieger",
    "Total buts/points": "Tore/Punkte gesamt",
    "Total de buts": "Tore gesamt",
    "Double chance": "Doppelte Chance",
    "Les deux équipes marquent": "Beide Teams treffen",
    "Handicap": "Handicap",
    "Cartons": "Karten",
    "Corners": "Eckbälle",
    "Mi-temps": "Halbzeit",
    "Match nul": "Unentschieden",
    "Plus de {{line}} buts": "Über {{line}} Tore",
    "Moins de {{line}} buts": "Unter {{line}} Tore",
    "Plus de {{line}} points": "Über {{line}} Punkte",
    "Moins de {{line}} points": "Unter {{line}} Punkte",
    "Plus de {{line}} corners": "Über {{line}} Eckbälle",
    "Moins de {{line}} corners": "Unter {{line}} Eckbälle",
    "Plus de {{line}} cartons": "Über {{line}} Karten",
    "Moins de {{line}} cartons": "Unter {{line}} Karten",
    "TERMINÉ": "BEENDET",
    "EN DIRECT": "LIVE",
    "Pick verrouillé": "Gesperrter Tipp",
    "Passe Pro pour voir l’analyse": "Mit Pro die Analyse ansehen",
    "Confiance du moteur": "Modellkonfidenz",
    "Avantage estimé : {{edge}}": "Geschätzter Vorteil: {{edge}}",
    "GAGNÉ": "GEWONNEN",
    "PERDU": "VERLOREN",
    "Analyse en cours…": "Analyse läuft…",
    "Autres marchés analysés": "Weitere analysierte Märkte",
    "Partager WhatsApp (Admin)": "Auf WhatsApp teilen (Admin)",
    "Pronostic à risque réduit": "Tipp mit geringerem Risiko",
    "Pronostic à risque modéré": "Tipp mit moderatem Risiko",
    "Pronostic risqué": "Tipp mit höherem Risiko",
    "Victoire de {{team}}": "Sieg von {{team}}",
    "Plus de {{line}}": "Über {{line}}",
    "Moins de {{line}}": "Unter {{line}}",
    "Oui": "Ja",
    "Non": "Nein",
    "Les deux équipes marquent : Oui": "Beide Teams treffen: Ja",
    "Les deux équipes marquent : Non": "Beide Teams treffen: Nein"
  },
  "ar": {
    "Voir l’analyse": "عرض التحليل",
    "🟢 SÛR": "🟢 مخاطر أقل",
    "🟡 MODÉRÉ": "🟡 متوسط",
    "🔴 RISQUÉ": "🔴 مرتفع المخاطر",
    "LIVE": "مباشر",
    "Pronostic": "التوقع",
    "Cote": "معامل الربح",
    "chez {{bookmaker}}": "لدى {{bookmaker}}",
    "En attente": "قيد الانتظار",
    "Vainqueur (1X2)": "الفائز (1X2)",
    "Vainqueur": "الفائز",
    "Total buts/points": "إجمالي الأهداف/النقاط",
    "Total de buts": "إجمالي الأهداف",
    "Double chance": "فرصة مزدوجة",
    "Les deux équipes marquent": "كلا الفريقين يسجل",
    "Handicap": "هانديكاب",
    "Cartons": "البطاقات",
    "Corners": "الركنيات",
    "Mi-temps": "الشوط الأول",
    "Match nul": "تعادل",
    "Plus de {{line}} buts": "أكثر من {{line}} هدف",
    "Moins de {{line}} buts": "أقل من {{line}} هدف",
    "Plus de {{line}} points": "أكثر من {{line}} نقطة",
    "Moins de {{line}} points": "أقل من {{line}} نقطة",
    "Plus de {{line}} corners": "أكثر من {{line}} ركنية",
    "Moins de {{line}} corners": "أقل من {{line}} ركنية",
    "Plus de {{line}} cartons": "أكثر من {{line}} بطاقة",
    "Moins de {{line}} cartons": "أقل من {{line}} بطاقة",
    "TERMINÉ": "انتهت",
    "EN DIRECT": "مباشر",
    "Pick verrouillé": "اختيار مقفل",
    "Passe Pro pour voir l’analyse": "اشترك في Pro لعرض التحليل",
    "Confiance du moteur": "ثقة المحرّك",
    "Avantage estimé : {{edge}}": "الأفضلية المقدّرة: {{edge}}",
    "GAGNÉ": "ناجح",
    "PERDU": "خاسر",
    "Analyse en cours…": "جارٍ التحليل…",
    "Autres marchés analysés": "أسواق أخرى تم تحليلها",
    "Partager WhatsApp (Admin)": "المشاركة عبر واتساب (المشرف)",
    "Pronostic à risque réduit": "توقع بمخاطر أقل",
    "Pronostic à risque modéré": "توقع بمخاطر متوسطة",
    "Pronostic risqué": "توقع بمخاطر مرتفعة",
    "Victoire de {{team}}": "فوز {{team}}",
    "Plus de {{line}}": "أكثر من {{line}}",
    "Moins de {{line}}": "أقل من {{line}}",
    "Oui": "نعم",
    "Non": "لا",
    "Les deux équipes marquent : Oui": "كلا الفريقين يسجل: نعم",
    "Les deux équipes marquent : Non": "كلا الفريقين يسجل: لا"
  }
};

// Même choix global que le menu et le dashboard. Aucun appel de traduction.
const AVAILABILITY_MESSAGES = {"fr": {"Sélection indisponible": "Sélection indisponible", "Aucune sélection exploitable dans les données reçues pour cette rencontre.": "Aucune sélection exploitable dans les données reçues pour cette rencontre."}, "en": {"Sélection indisponible": "Selection unavailable", "Aucune sélection exploitable dans les données reçues pour cette rencontre.": "No usable selection in the data received for this match."}, "es": {"Sélection indisponible": "Selección no disponible", "Aucune sélection exploitable dans les données reçues pour cette rencontre.": "No hay una selección utilizable en los datos recibidos para este partido."}, "pt": {"Sélection indisponible": "Seleção indisponível", "Aucune sélection exploitable dans les données reçues pour cette rencontre.": "Não há uma seleção utilizável nos dados recebidos para este jogo."}, "de": {"Sélection indisponible": "Auswahl nicht verfügbar", "Aucune sélection exploitable dans les données reçues pour cette rencontre.": "Die empfangenen Daten enthalten keine verwertbare Auswahl für dieses Spiel."}, "ar": {"Sélection indisponible": "الاختيار غير متاح", "Aucune sélection exploitable dans les données reçues pour cette rencontre.": "لا يوجد اختيار قابل للاستخدام في البيانات المستلمة لهذه المباراة."}};
Object.keys(AVAILABILITY_MESSAGES).forEach(language => Object.assign(MATCH_MESSAGES[language], AVAILABILITY_MESSAGES[language]));

const ENGINE_MESSAGES = {"fr": {"Probabilité estimée": "Probabilité estimée", "Probabilité hors remboursement": "Probabilité hors remboursement", "Données : solides": "Données : solides", "Données : partielles": "Données : partielles", "Données : limitées": "Données : limitées", "Modèle pilote": "Modèle pilote", "Hybride · test historique": "Hybride · test historique", "Risque non évalué": "Risque non évalué", "Estimation expérimentale : amélioration des résultats non démontrée.": "Estimation expérimentale : amélioration des résultats non démontrée."}, "en": {"Probabilité estimée": "Estimated probability", "Probabilité hors remboursement": "Probability excluding refunds", "Données : solides": "Data: strong", "Données : partielles": "Data: partial", "Données : limitées": "Data: limited", "Modèle pilote": "Pilot model", "Hybride · test historique": "Hybrid · historical test", "Risque non évalué": "Risk not assessed", "Estimation expérimentale : amélioration des résultats non démontrée.": "Experimental estimate: improved results have not been demonstrated."}, "es": {"Probabilité estimée": "Probabilidad estimada", "Probabilité hors remboursement": "Probabilidad sin reembolso", "Données : solides": "Datos: sólidos", "Données : partielles": "Datos: parciales", "Données : limitées": "Datos: limitados", "Modèle pilote": "Modelo piloto", "Hybride · test historique": "Híbrido · prueba histórica", "Risque non évalué": "Riesgo no evaluado", "Estimation expérimentale : amélioration des résultats non démontrée.": "Estimación experimental: no se ha demostrado una mejora de los resultados."}, "pt": {"Probabilité estimée": "Probabilidade estimada", "Probabilité hors remboursement": "Probabilidade sem reembolso", "Données : solides": "Dados: sólidos", "Données : partielles": "Dados: parciais", "Données : limitées": "Dados: limitados", "Modèle pilote": "Modelo piloto", "Hybride · test historique": "Híbrido · teste histórico", "Risque non évalué": "Risco não avaliado", "Estimation expérimentale : amélioration des résultats non démontrée.": "Estimativa experimental: melhoria dos resultados não demonstrada."}, "de": {"Probabilité estimée": "Geschätzte Wahrscheinlichkeit", "Probabilité hors remboursement": "Wahrscheinlichkeit ohne Rückzahlung", "Données : solides": "Daten: solide", "Données : partielles": "Daten: teilweise", "Données : limitées": "Daten: begrenzt", "Modèle pilote": "Pilotmodell", "Hybride · test historique": "Hybrid · historischer Test", "Risque non évalué": "Risiko nicht bewertet", "Estimation expérimentale : amélioration des résultats non démontrée.": "Experimentelle Schätzung: bessere Ergebnisse sind nicht nachgewiesen."}, "ar": {"Probabilité estimée": "الاحتمال التقديري", "Probabilité hors remboursement": "الاحتمال باستثناء الاسترداد", "Données : solides": "البيانات: قوية", "Données : partielles": "البيانات: جزئية", "Données : limitées": "البيانات: محدودة", "Modèle pilote": "نموذج تجريبي", "Hybride · test historique": "هجين · اختبار تاريخي", "Risque non évalué": "المخاطر غير مقيّمة", "Estimation expérimentale : amélioration des résultats non démontrée.": "تقدير تجريبي: لم يُثبت تحسن النتائج."}};
Object.keys(ENGINE_MESSAGES).forEach(language => Object.assign(MATCH_MESSAGES[language], ENGINE_MESSAGES[language]));

function useMatchLanguage() {
  const context = useLanguage();
  const { language } = context;
  const t = useCallback((source, values = {}) => {
    const dictionary = MATCH_MESSAGES[language] || MATCH_MESSAGES.fr;
    const template = Object.prototype.hasOwnProperty.call(dictionary, source)
      ? dictionary[source] : source;
    return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : placeholder);
  }, [language]);
  return { ...context, t };
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatOdds(value, formatNumber) {
  const number = finiteNumber(value);
  return number !== null && number > 1
    ? formatNumber(number, { minimumFractionDigits: 2, maximumFractionDigits: 10 }) : "—";
}

function formatScore(value, formatNumber) {
  if (value === null || value === undefined || value === "") return "—";
  const number = finiteNumber(value);
  if (number !== null) return formatNumber(number);
  // Certains sports renvoient un score de sets ou de périodes en texte.
  return typeof value === "string" ? value : "—";
}

// Traduction des libellés connus ; les noms d’équipes et sélections inconnues
// restent identiques. Aucune cote ni sélection officielle n’est recalculée.
function translateBetText(value, t, formatNumber, teams = []) {
  if (typeof value !== "string" || !value.trim()) return "—";
  if (teams.some(team => team && team === value)) return value;
  const text = value.trim();
  const total = text.match(/^(Plus|Moins) de (\d+(?:[.,]\d+)?)(?: (buts|points|corners|cartons))?$/i);
  if (total) {
    const direction = total[1].toLowerCase() === "plus" ? "Plus" : "Moins";
    const unit = total[3] ? " " + total[3].toLowerCase() : "";
    return t(`${direction} de {{line}}${unit}`, {
      line: formatNumber(Number(total[2].replace(",", ".")), { maximumFractionDigits: 10 }),
    });
  }
  const victory = text.match(/^Victoire de (.+)$/i);
  if (victory) return t("Victoire de {{team}}", { team: victory[1] });
  const aliases = {
    h2h: "Vainqueur (1X2)", totals: "Total buts/points", spreads: "Handicap",
    "Total buts": "Total de buts", "Total points": "Total buts/points",
    "Both teams to score": "Les deux équipes marquent", BTTS: "Les deux équipes marquent",
    Draw: "Match nul", "BTTS Oui": "Les deux équipes marquent : Oui", "BTTS Non": "Les deux équipes marquent : Non",
  };
  return t(Object.prototype.hasOwnProperty.call(aliases, text) ? aliases[text] : text);
}

function ConfidenceBar({ value, label }) {
  const raw = finiteNumber(value);
  if (raw === null) return null;
  const bounded = Math.max(0, Math.min(raw, 100));
  const color = bounded >= 70 ? "bg-gradient-to-r from-emerald-500 to-teal-500" : bounded >= 55 ? "bg-gradient-to-r from-amber-400 to-orange-400" : "bg-gradient-to-r from-rose-400 to-fuchsia-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      role="progressbar" aria-label={label} aria-valuenow={bounded} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${color} h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${bounded}%` }} />
    </div>
  );
}

export default function MatchCard({ match, isAdmin, isFree, onUpgrade }) {
  const { t, formatDate, formatNumber } = useMatchLanguage();
  const event = match || {};
  const pred = event.prediction || {};
  const isFinished = Boolean(pred.is_finished || event.is_finished || event.completed);
  const isLive = !isFinished && Boolean(pred.is_live || event.is_live);
  const unavailable = pred.analysis_status === "unavailable" || pred.has_prediction === false || (!pred.pick && !pred.locked);
  const locked = !unavailable && Boolean(pred.locked || (!pred.pick && isFree));
  const teams = [event.home_team, event.away_team];
  const confidence = marketWinProbability(pred);
  const hasConfidence = confidence !== null && confidence >= 0 && confidence <= 100;
  const edge = finiteNumber(pred.edge);
  const probabilityLabel = t("Probabilité estimée");

  return <Card className={`wp-match-card ${isLive ? 'wp-match-live' : ''}`} data-testid="match-card" data-navigation-match-id={event.id || event.match_id}>
    <Link to={`/app/match/${event.id}`} className="wp-match-link" data-testid="match-card-link">
      <div className="wp-match-meta">
        <div className="wp-match-competition-row">
          <span className="wp-competition"><bdi>{event.sport_title}</bdi></span>
          {isLive ? <span className="wp-live-label"><Radio className="h-3 w-3" aria-hidden="true" />{t("LIVE")}</span> : isFinished ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{t("TERMINÉ")}</span> : null}
        </div>
        <time data-testid="match-start-time" className="wp-match-start" dateTime={event.commence_time || pred.commence_time || undefined}>
          <span data-testid="match-start-date">{formatDate(event.commence_time || pred.commence_time, {day:"2-digit",month:"2-digit"})}</span>
          <strong data-testid="match-start-hour"><bdi>{formatDate(event.commence_time || pred.commence_time, {hour:"2-digit",minute:"2-digit"})}</bdi></strong>
        </time>
      </div>
      <div className="wp-match-teams">{[['home',event.home_team],['away',event.away_team]].map(([side,name])=><div key={side} className="wp-match-team"><TeamBadge name={name} src={badgeUrl(event,side)} fallbackSrcs={badgeUrls(event,side)} sport={event.sport_key} kind={event[`${side}_media`]?.kind} size="large"/><h3><bdi>{name || '—'}</bdi></h3></div>)}<span className="wp-versus" aria-hidden="true">VS</span></div>
      {(isLive || isFinished) && pred.score_home != null && pred.score_away != null && <div className="wp-match-score" data-testid="match-score"><bdi>{formatScore(pred.score_home,formatNumber)} — {formatScore(pred.score_away,formatNumber)}</bdi>{isFinished && <span>{t("TERMINÉ")}</span>}</div>}
      {!locked && (pred.pick ? <div className="wp-pick-panel">
        <div className="wp-pick-heading"><span>{pred.market_label ? translateBetText(pred.market_label,t,formatNumber) : t("Pronostic")}</span><span>{t("Cote")}</span></div>
        <div className="wp-pick-main"><strong><bdi>{translateBetText(pred.pick,t,formatNumber,teams)}</bdi></strong><bdi className="wp-odds">{formatOdds(pred.pick_odds,formatNumber)}</bdi></div>
        {pred.best_bookmaker && <p className="wp-bookmaker">{t("chez {{bookmaker}}",{bookmaker:pred.best_bookmaker})}</p>}
      </div> : <div className="wp-pick-panel" data-testid="match-selection-unavailable"><p className="font-semibold text-slate-700">{t("Sélection indisponible")}</p><p className="mt-1 text-sm text-slate-500">{t("Aucune sélection exploitable dans les données reçues pour cette rencontre.")}</p></div>)}
      {locked && <div className="wp-pick-panel wp-pick-locked"><Lock className="h-4 w-4" aria-hidden="true"/><span>{t("Pick verrouillé")}</span><span className="wp-pro-chip">PRO</span></div>}
      <div className="wp-match-bottom">{!locked && pred.label && <PredictionEvidence prediction={pred} compact/>}{hasConfidence && !locked && <span className="wp-confidence" data-testid="match-confidence"><span>{probabilityLabel}</span><bdi>{formatNumber(confidence/100,{style:'percent',maximumFractionDigits:0})}</bdi></span>}</div>
      {hasConfidence && !locked && <ConfidenceBar value={confidence} label={probabilityLabel}/>}
      {!locked && !unavailable && pred.risk_policy_version && <div className="flex flex-wrap items-center gap-2 text-xs leading-5 text-slate-600" data-testid="match-model-evidence">

        {pred.hybrid_applied && <span className="rounded-full border border-orange-200 px-2 py-0.5" title={t("Estimation expérimentale : amélioration des résultats non démontrée.")}>{t(pred.hybrid_validation === "retrospective_only" ? "Hybride · test historique" : "Modèle pilote")}</span>}
      </div>}
      {!locked && pred.multi_market?.choices?.length > 1 && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{pred.multi_market.choices.filter(row=>row.market !== pred.market).slice(0,2).map((row,index)=><div key={index} className="flex min-w-0 items-start justify-between gap-2 text-xs leading-5"><span className="min-w-0 break-words text-slate-600">{translateBetText(row.pick,t,formatNumber,teams)}</span><bdi className="shrink-0 font-mono font-bold text-slate-900">{formatOdds(row.pick_odds,formatNumber)}</bdi></div>)}</div>}
      {edge !== null && edge > 0 && !locked && <p className="wp-edge" data-testid="match-edge">{t("Avantage estimé : {{edge}}",{edge:formatNumber(edge/100,{style:'percent',signDisplay:'always',maximumFractionDigits:1})})}</p>}
      {isFinished && !locked && pred.pick && <div className={`wp-result ${pred.won===true?'wp-result-won':pred.won===false?'wp-result-lost':''}`} data-testid="match-result">{pred.won===true?<><CheckCircle2 className="h-4 w-4"/>{t("GAGNÉ")}</>:pred.won===false?<><XCircle className="h-4 w-4"/>{t("PERDU")}</>:<><Clock className="h-4 w-4"/>{t("En attente")}</>}</div>}
    </Link>
    <div className="mt-3 grid min-w-0 gap-2" data-testid="match-card-actions"><Link to={`/app/match/${event.id}`} className="wp-analysis-link">{t("Voir l’analyse")}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true"/></Link>{!locked && pred.pick && <FollowPickButton matchId={event.id || event.match_id} pick={pred.pick} market={pred.market} compact disabled={isFinished||isLive}/>}</div>
    {locked && <div className="wp-upgrade-action">{typeof onUpgrade==='function'?<button type="button" onClick={eventClick=>{eventClick.stopPropagation();onUpgrade();}} data-testid="match-upgrade">{t("Passe Pro pour voir l’analyse")}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></button>:<Link to="/app/abonnement" data-testid="match-upgrade-link">{t("Passe Pro pour voir l’analyse")}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></Link>}</div>}
    {isAdmin && !locked && !unavailable && <AdminShareActions isAdmin={isAdmin} item={{...event,prediction:pred}}/>}
    <MediaCredits match={event}/>
  </Card>;
}

// Admin-only composition. This module never sends messages automatically.
const AdminShareContext = createContext(null);
const SHARE_TEXT = {
  fr: {admin:"Partage administrateur", select:"Sélectionner", selected:"sélectionnés", all:"Sélectionner les 20 premiers", clear:"Effacer", preview:"Préparer le message", close:"Fermer", part:"Message", copy:"Copier", copied:"Copié", copyError:"Sélectionne le texte pour le copier.", hint:"Choisis le groupe ou canal dans l’application, puis confirme l’envoi. Aucun envoi automatique.", scope:"Sélection limitée aux rencontres actuellement filtrées (20 maximum).", page:"Pour les résultats, seule la page affichée est sélectionnable.", picks:"PRONOSTICS WNPULSE", results:"RÉSULTATS WNPULSE", date:"Date", competition:"Compétition", match:"Rencontre", market:"Marché", pick:"Pronostic", odds:"Cote", risk:"Risque", confidence:"Confiance du moteur", bookmaker:"Bookmaker", won:"Gagné", lost:"Perdu", void:"Remboursé", pending:"En attente", result:"Résultat", safe:"Prudent", value:"Modéré", risky:"Risqué", zone:"Fuseau horaire", disclaimer:"18+ · Aucun gain garanti. Les performances passées ne garantissent pas les résultats futurs.", caption:"Sélections présentées individuellement, pas un combiné.", title:"Partager", empty:"Sélectionne au moins un pronostic.", unavailable:"Non renseigné"},
  en: {admin:"Admin sharing",select:"Select",selected:"selected",all:"Select first 20",clear:"Clear",preview:"Prepare message",close:"Close",part:"Message",copy:"Copy",copied:"Copied",copyError:"Select the text to copy it.",hint:"Choose a group or channel in the app, then confirm sending. Nothing is sent automatically.",scope:"Selection is limited to currently filtered matches (maximum 20).",page:"For results, only the displayed page can be selected.",picks:"WNPULSE PICKS",results:"WNPULSE RESULTS",date:"Date",competition:"Competition",match:"Match",market:"Market",pick:"Pick",odds:"Odds",risk:"Risk",confidence:"Engine confidence",bookmaker:"Bookmaker",won:"Won",lost:"Lost",void:"Refunded",pending:"Pending",result:"Result",safe:"Lower risk",value:"Moderate",risky:"Higher risk",zone:"Time zone",disclaimer:"18+ · No guaranteed winnings. Past performance does not guarantee future results.",caption:"Individual selections, not an accumulator.",title:"Share",empty:"Select at least one pick.",unavailable:"Not provided"},
  es: {admin:"Compartir como administrador",select:"Seleccionar",selected:"seleccionados",all:"Seleccionar los primeros 20",clear:"Borrar",preview:"Preparar mensaje",close:"Cerrar",part:"Mensaje",copy:"Copiar",copied:"Copiado",copyError:"Selecciona el texto para copiarlo.",hint:"Elige el grupo o canal en la aplicación y confirma el envío. No se envía automáticamente.",scope:"Solo encuentros filtrados actualmente (máximo 20).",page:"En resultados solo se puede seleccionar la página visible.",picks:"PRONÓSTICOS WNPULSE",results:"RESULTADOS WNPULSE",date:"Fecha",competition:"Competición",match:"Encuentro",market:"Mercado",pick:"Pronóstico",odds:"Cuota",risk:"Riesgo",confidence:"Confianza del motor",bookmaker:"Casa de apuestas",won:"Ganado",lost:"Perdido",void:"Reembolsado",pending:"Pendiente",result:"Resultado",safe:"Prudente",value:"Moderado",risky:"Arriesgado",zone:"Zona horaria",disclaimer:"18+ · Sin ganancias garantizadas. Los resultados pasados no garantizan resultados futuros.",caption:"Selecciones individuales, no una combinada.",title:"Compartir",empty:"Selecciona al menos un pronóstico.",unavailable:"No indicado"},
  pt: {admin:"Partilha do administrador",select:"Selecionar",selected:"selecionados",all:"Selecionar os primeiros 20",clear:"Limpar",preview:"Preparar mensagem",close:"Fechar",part:"Mensagem",copy:"Copiar",copied:"Copiado",copyError:"Seleciona o texto para o copiar.",hint:"Escolhe o grupo ou canal na aplicação e confirma o envio. Não há envio automático.",scope:"Apenas jogos atualmente filtrados (máximo 20).",page:"Nos resultados, apenas a página apresentada pode ser selecionada.",picks:"PRONÓSTICOS WNPULSE",results:"RESULTADOS WNPULSE",date:"Data",competition:"Competição",match:"Jogo",market:"Mercado",pick:"Pronóstico",odds:"Cotação",risk:"Risco",confidence:"Confiança do motor",bookmaker:"Casa de apostas",won:"Ganho",lost:"Perdido",void:"Reembolsado",pending:"Pendente",result:"Resultado",safe:"Prudente",value:"Moderado",risky:"Arriscado",zone:"Fuso horário",disclaimer:"18+ · Sem ganhos garantidos. Resultados passados não garantem resultados futuros.",caption:"Seleções individuais, não uma múltipla.",title:"Partilhar",empty:"Seleciona pelo menos um pronóstico.",unavailable:"Não indicado"},
  de: {admin:"Admin-Freigabe",select:"Auswählen",selected:"ausgewählt",all:"Erste 20 auswählen",clear:"Leeren",preview:"Nachricht vorbereiten",close:"Schließen",part:"Nachricht",copy:"Kopieren",copied:"Kopiert",copyError:"Text zum Kopieren markieren.",hint:"Gruppe oder Kanal in der App wählen und Versand bestätigen. Kein automatischer Versand.",scope:"Nur aktuell gefilterte Spiele (höchstens 20).",page:"Bei Ergebnissen ist nur die angezeigte Seite auswählbar.",picks:"WNPULSE TIPPS",results:"WNPULSE ERGEBNISSE",date:"Datum",competition:"Wettbewerb",match:"Begegnung",market:"Markt",pick:"Tipp",odds:"Quote",risk:"Risiko",confidence:"Modellvertrauen",bookmaker:"Buchmacher",won:"Gewonnen",lost:"Verloren",void:"Erstattet",pending:"Ausstehend",result:"Ergebnis",safe:"Vorsichtig",value:"Moderat",risky:"Riskant",zone:"Zeitzone",disclaimer:"18+ · Keine Gewinngarantie. Frühere Ergebnisse garantieren keine zukünftigen Ergebnisse.",caption:"Einzelne Tipps, keine Kombiwette.",title:"Teilen",empty:"Mindestens einen Tipp auswählen.",unavailable:"Keine Angabe"},
  ar: {admin:"مشاركة المسؤول",select:"تحديد",selected:"محدد",all:"تحديد أول 20",clear:"مسح",preview:"تحضير الرسالة",close:"إغلاق",part:"رسالة",copy:"نسخ",copied:"تم النسخ",copyError:"حدد النص لنسخه.",hint:"اختر المجموعة أو القناة في التطبيق ثم أكّد الإرسال. لا يوجد إرسال تلقائي.",scope:"المباريات المفلترة حاليًا فقط (20 كحد أقصى).",page:"في النتائج يمكن تحديد الصفحة المعروضة فقط.",picks:"توقعات WNPULSE",results:"نتائج WNPULSE",date:"التاريخ",competition:"البطولة",match:"المباراة",market:"السوق",pick:"التوقع",odds:"المعامل",risk:"المخاطرة",confidence:"ثقة المحرك",bookmaker:"شركة المراهنات",won:"فاز",lost:"خسر",void:"مسترد",pending:"قيد الانتظار",result:"النتيجة",safe:"حذر",value:"متوسط",risky:"مرتفع المخاطرة",zone:"المنطقة الزمنية",disclaimer:"للبالغين 18+ · لا ضمان للأرباح. الأداء السابق لا يضمن النتائج المستقبلية.",caption:"اختيارات فردية وليست رهانًا مركبًا.",title:"مشاركة",empty:"حدد توقعًا واحدًا على الأقل.",unavailable:"غير مذكور"}
};
const SHARE_BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40";
function useAdminShareLanguage() {
  const { language } = useLanguage();
  return SHARE_TEXT[language] || SHARE_TEXT.fr;
}
export function shareItemKey(item) {
  const p = item?.prediction || item || {};
  return JSON.stringify([item?.id || item?.match_id || item?.match || [item?.home_team,item?.away_team], item?.commence_time || item?.date, p.market_key || p.market_label, p.pick, p.pick_odds ?? p.odds]);
}
function shareEligible(item) {
  const p = item?.prediction || item;
  return Boolean(p && typeof p.pick === "string" && p.pick.trim() && !p.locked && p.has_prediction !== false && p.analysis_status !== "unavailable");
}
function shareClean(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}
export function buildShareMessages(items, kind, words, helpers) {
  const { t, formatNumber, formatDate } = helpers;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const header = kind === "results" ? words.results : words.picks;
  const footer = `\n\n${words.caption}\n${words.zone} : ${zone}\nhttps://wnpulse.com · 18+`;
  const blocks = items.filter(shareEligible).map((item,index)=>{
    const p=item.prediction || item;
    const teams=[item.home_team,item.away_team];
    const odds=finiteNumber(p.pick_odds ?? p.odds);
    const value=item.commence_time || item.date;
    const date=value && Number.isFinite(new Date(value).getTime())
      ? formatDate(value,{day:"2-digit",month:"2-digit",...(item.commence_time || /T\d{2}:\d{2}/.test(String(value)) ? {hour:"2-digit",minute:"2-digit"} : {})})
      : words.unavailable;
    const league=shareClean(item.league || item.sport_title || item.sport);
    const pick=translateBetText(p.pick,t,formatNumber,teams);
    const market=translateBetText(p.market_label || p.market_key || "",t,formatNumber,teams);
    const status=String(p.status || item.status || "").toLowerCase();
    const result=["won","lost","void"].includes(status) ? words[status] : p.won===true ? words.won : p.won===false ? words.lost : words.pending;
    return [
      `${index+1}. ${shareClean(item.match || teams.filter(Boolean).join("  vs  ")) || words.unavailable}`,
      [league,date].filter(Boolean).join(" · "),
      `→ ${words.pick} : ${shareClean(pick)}`,
      [market,odds!==null && odds>1 ? `${words.odds} ${formatNumber(odds,{minimumFractionDigits:2,maximumFractionDigits:2})}` : null].filter(Boolean).join(" · "),
      p.best_bookmaker ? `${words.bookmaker} : ${shareClean(p.best_bookmaker)}` : null,
      kind==="results" ? `${words.result} : ${result}` : null,
    ].filter(Boolean).join("\n");
  });
  const groups=[];let group=[],size=0;
  const budget=1900-header.length-footer.length;
  for(const block of blocks){
    if(group.length && size+block.length+2>budget){groups.push(group);group=[];size=0;}
    group.push(block);size+=block.length+2;
  }
  if(group.length)groups.push(group);
  return groups.map((rows,i)=>`${header}${groups.length>1 ? ` · ${i+1}/${groups.length}` : ""}\n\n${rows.join("\n\n")}${footer}`);
}
function ShareComposer({ items, kind, onClose }) {
  const words=useAdminShareLanguage();
  const helpers=useMatchLanguage();
  const [focus,setFocus]=useState(0);
  const eligible=items.filter(shareEligible);
  const selected=focus<0 ? eligible : eligible.slice(Math.min(focus,Math.max(0,eligible.length-1)),Math.min(focus,Math.max(0,eligible.length-1))+1);
  const messages=buildShareMessages(selected,kind,words,helpers);
  const cards=selected.filter(item=>item.home_team && item.away_team).map(item=>{
    const p=item.prediction || item;
    const teams=[item.home_team,item.away_team];
    const odds=finiteNumber(p.pick_odds ?? p.odds);
    const time=item.commence_time || item.date;
    return {teams,badgeSources:["home","away"].map(side=>badgeUrls(item,side).find(url=>/api-sports\.io|crests\.football-data\.org/.test(url))),
      competition:item.league || item.sport_title || item.sport || "",
      date:time && Number.isFinite(new Date(time).getTime()) ? helpers.formatDate(time,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "",
      market:translateBetText(p.market_label || p.market_key || words.pick,helpers.t,helpers.formatNumber,teams),
      pick:translateBetText(p.pick,helpers.t,helpers.formatNumber,teams),
      odds:odds>1 ? helpers.formatNumber(odds,{minimumFractionDigits:2,maximumFractionDigits:2}) : "",
      status:kind==="results" ? (words[String(p.status || item.status || "").toLowerCase()] || (p.won===true ? words.won : p.won===false ? words.lost : words.pending)) : ""};
  });
  const [part,setPart]=useState(0);
  const [copied,setCopied]=useState("");
  const dialog=useRef(null);
  const current=messages[Math.min(part,Math.max(messages.length-1,0))] || "";
  useEffect(()=>{
    const node=dialog.current;
    if(node && !node.open)node.showModal();
    return ()=>{if(node?.open)node.close();};
  },[]);
  return <dialog ref={dialog} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}} aria-label={words.preview} className="m-auto w-[calc(100%-1.5rem)] max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl backdrop:bg-slate-950/60" data-testid="admin-share-composer">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{words.preview}</h2><button type="button" onClick={onClose} className={SHARE_BUTTON}>{words.close}</button></div>
    <p className="my-3 text-sm leading-6 text-slate-500">{words.hint}</p>
    {eligible.length>1 && <label className="mb-3 block text-sm font-semibold">{helpers.t("Contenu à partager")}
      <select data-testid="share-content-selection" value={focus} onChange={event=>{setFocus(Number(event.target.value));setPart(0);setCopied("");}} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">
        {eligible.map((item,index)=><option key={index} value={index}>{[item.home_team,item.away_team].filter(Boolean).join(" – ") || item.match} · {(item.prediction || item).pick}</option>)}
        <option value={-1}>{helpers.t("Tous les pronostics sélectionnés")} ({eligible.length})</option>
      </select>
    </label>}
    <div className="mb-2 flex flex-wrap gap-2" aria-label={words.part}>{messages.map((message,index)=><button type="button" key={index} aria-pressed={part===index} onClick={()=>{setPart(index);setCopied("");}} className={`${SHARE_BUTTON} ${part===index ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200"}`}>{words.part} {index+1}/{messages.length}</button>)}</div>
    {focus>=0 ? <PickShareImagePanel cards={cards} t={helpers.t} text={current} /> : <p className="my-3 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{helpers.t("La série est partagée en texte. Choisis une rencontre pour son image et son message individuel.")}</p>}
    <label className="sr-only" htmlFor="admin-share-text">{words.preview}</label><textarea id="admin-share-text" readOnly value={current} dir="auto" className="h-52 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6" />
    <div className="mt-3 flex flex-wrap gap-2">
      <a href={`https://wa.me/?text=${encodeURIComponent(current)}`} target="_blank" rel="noopener noreferrer" className={`${SHARE_BUTTON} border-green-600 bg-green-600 text-white`} data-testid="admin-share-whatsapp">WhatsApp ↗</a>
      <a href={`https://t.me/share/url?url=${encodeURIComponent("https://wnpulse.com")}&text=${encodeURIComponent(current)}`} target="_blank" rel="noopener noreferrer" className={`${SHARE_BUTTON} border-sky-600 bg-sky-600 text-white`} data-testid="admin-share-telegram">Telegram ↗</a>
      <button type="button" className={`${SHARE_BUTTON} border-slate-200`} onClick={async()=>{setCopied(await copyShareText(current) ? words.copied : words.copyError);}}>{words.copy}</button>
    </div><p className="mt-2 text-xs text-slate-500" role="status">{copied}</p>
  </dialog>;
}
function detailShareKey(item) {
  const p = item.prediction || item;
  return JSON.stringify([item.id || item.match_id, item.commence_time, p.market || p.market_key || p.market_label, p.pick, p.pick_point, p.team]);
}
function detailShareSnapshot(item) {
  const p = item.prediction || item;
  const fields = ["pick", "pick_odds", "market", "market_label", "market_key", "pick_point", "team", "confidence", "label", "best_bookmaker", "is_alternative", "status", "alternative_result_confirmed"];
  return {
    id:item.id || item.match_id, commence_time:item.commence_time, home_team:item.home_team, away_team:item.away_team,
    sport_title:item.sport_title, league:item.league, sport_key:item.sport_key,
    home_image_candidates:badgeUrls(item,"home"), away_image_candidates:badgeUrls(item,"away"),
    prediction:Object.fromEntries(fields.map(key=>[key,p[key]])),
  };
}
export function AdminShareProvider({isAdmin,items=[],kind="picks",sharedAcrossMatches=false,children}) {
  const [selection,setSelection]=useState([]);
  const [individual,setIndividual]=useState(null);
  const [bulkOpen,setBulkOpen]=useState(false);
  const [owner,setOwner]=useState(null);
  const {user}=useAuth();
  const userId=user?.id;
  const basket=useMatchShareBasket();
  const shared=sharedAcrossMatches && Boolean(basket);
  const keyFor=shared ? detailShareKey : shareItemKey;
  const permitted=Boolean(isAdmin && user?.is_admin);
  const available=new Map();
  if(permitted)items.filter(shareEligible).forEach(item=>available.set(keyFor(item),item));
  const keys=shared ? basket.items.map(detailShareKey) : owner===userId ? selection.filter(key=>available.has(key)) : [];
  const signature=JSON.stringify(Array.from(available, ([key,item])=>{
    const prediction=item.prediction || item;
    return [key,prediction.pick_odds,prediction.confidence,prediction.label,prediction.best_bookmaker,prediction.status,prediction.won,prediction.score_home,prediction.score_away,item.league,item.sport_title,item.match];
  }));
  useEffect(()=>{
    const validKeys=new Set(JSON.parse(signature).map(row=>row[0]));
    setSelection(previous=>previous.filter(key=>validKeys.has(key)));setBulkOpen(false);setIndividual(null);
    // Source changes invalidate the preview; no stale pick or previous page is shared.
  },[signature,userId]);
  const selected=shared ? basket.items : keys.map(key=>available.get(key));
  const context={permitted,kind,available,keys,selected,shared,keyFor,
    toggle(key) {
      if (shared) {
        basket.change(previous => previous.some(item=>detailShareKey(item)===key)
          ? previous.filter(item=>detailShareKey(item)!==key)
          : available.has(key) && previous.length<20 ? [...previous,detailShareSnapshot(available.get(key))] : previous);
        return;
      }
      setOwner(userId);setSelection(keys.includes(key)?keys.filter(value=>value!==key):keys.length<20?[...keys,key]:keys);
    },
    selectAll() {
      if (shared) {
        basket.change(previous => [...previous, ...Array.from(available).filter(([key])=>!previous.some(item=>detailShareKey(item)===key)).map(([,item])=>detailShareSnapshot(item))].slice(0,20));
        return;
      }
      setOwner(userId);setSelection(Array.from(available.keys()).slice(0,20));
    },
    clear(){if(shared)basket.change(()=>[]);else setSelection([]);},
    open(item){setIndividual(item);setBulkOpen(false);},
    openBulk(){if(selected.length){setIndividual(null);setBulkOpen(true);}},
  };
  const preview=individual ? [individual] : bulkOpen ? selected : [];
  return <AdminShareContext.Provider value={context}>{children}{permitted && preview.length>0 && <ShareComposer key={JSON.stringify(preview.map(shareItemKey))} items={preview} kind={kind==="picks" && preview.every(item=>(item.prediction||item).is_alternative && (item.prediction||item).alternative_result_confirmed)?"results":kind} onClose={()=>{setIndividual(null);setBulkOpen(false);}} />}</AdminShareContext.Provider>;
}
export function AdminShareToolbar() {
  const context=useContext(AdminShareContext),words=useAdminShareLanguage();
  const {t}=useLanguage();
  if(!context?.permitted)return null;
  return <section className="my-3 rounded-xl border border-orange-200 bg-orange-50 p-3" aria-label={words.admin} data-testid="admin-share-toolbar">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-slate-900">{words.admin}</h2><span className="text-xs font-semibold text-orange-700" aria-live="polite">{context.keys.length}/20 {words.selected}</span></div>
    <p className="mt-1 text-xs leading-5 text-slate-600">{context.shared ? t("Tes sélections et leurs cotes restent dans le panier quand tu changes de match (20 maximum).") : words.scope} {context.kind==="results" ? words.page : ""}</p>
    <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={context.selectAll} disabled={!context.available.size} className={`${SHARE_BUTTON} border-orange-200 bg-white`}>{words.all}</button><button type="button" onClick={context.clear} disabled={!context.keys.length} className={`${SHARE_BUTTON} border-orange-200 bg-white`}>{words.clear}</button><button type="button" onClick={context.openBulk} disabled={!context.keys.length} className={`${SHARE_BUTTON} border-orange-600 bg-orange-600 text-white`} data-testid="admin-share-bulk">{words.preview}</button></div>
    {context.shared && context.selected.length>0 && <details className="mt-3 rounded-lg border border-orange-200 p-2">
      <summary className="cursor-pointer text-sm font-semibold">{t("Voir les sélections conservées")}</summary>
      <ul className="mt-2 divide-y divide-slate-200">{context.selected.map(item=><li key={context.keyFor(item)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
        <span className="min-w-0 break-words">{item.home_team} vs {item.away_team} · {item.prediction.pick} @ {item.prediction.pick_odds}</span>
        <button type="button" className={SHARE_BUTTON} onClick={()=>context.toggle(context.keyFor(item))}>{t("Retirer")}</button>
      </li>)}</ul>
    </details>}
  </section>;
}
export function AdminShareActions({item,isAdmin,kind="picks"}) {
  const context=useContext(AdminShareContext),words=useAdminShareLanguage();
  const {user}=useAuth();
  const [preview,setPreview]=useState(false);
  if(!isAdmin || !user?.is_admin || !shareEligible(item))return null;
  const key=context?.keyFor(item) || shareItemKey(item),selectable=context?.permitted && context.available.has(key);
  const open=()=>{if(context?.permitted)context.open(item);else setPreview(true);};
  return <div className="mt-3 border-t border-slate-100 pt-2" data-testid="admin-share-actions">
    <div className="flex flex-wrap items-center gap-2">
      {selectable && <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-xs font-semibold text-slate-600"><input type="checkbox" checked={context.keys.includes(key)} disabled={!context.keys.includes(key) && context.keys.length>=20} onChange={()=>context.toggle(key)} className="h-4 w-4 accent-orange-600" aria-label={`${words.select} ${shareClean(item.match || item.home_team || "")}`} />{words.select}</label>}
      <button type="button" onClick={open} className={`${SHARE_BUTTON} border-green-200 text-green-700`}>WhatsApp</button>
      <button type="button" onClick={open} className={`${SHARE_BUTTON} border-sky-200 text-sky-700`}>Telegram</button>
    </div>
    {preview && <ShareComposer items={[item]} kind={kind} onClose={()=>setPreview(false)} />}
  </div>;
}



// Match insights and shared team badges are embedded here.
const LABELS = {
 fr: ["Le match en chiffres", "Résultats observés, avant cette rencontre", "Comparaison", "Derniers matchs", "Confrontations", "Toutes rencontres", "Domicile / extérieur", "Matchs observés", "Victoires", "Nuls", "Défaites", "Buts marqués / match", "Buts encaissés / match", "Plus de 2,5 buts", "Les deux équipes marquent", "Sans encaisser", "Avec au moins un but marqué", "Indicateur", "Date", "Rencontre", "Score", "Compétition", "Actualiser", "Chargement des statistiques…", "Historique indisponible pour cette rencontre.", "Ces données dépendent de la couverture et du cache du fournisseur. Aucun résultat n’est inventé.", "Pas de confrontation dans les échantillons disponibles. Cela ne signifie pas que ces équipes ne se sont jamais rencontrées.", "Les fréquences décrivent ces matchs passés ; elles ne sont pas des probabilités pour le prochain match.", "Source", "Dernière collecte", "Données anciennes : à interpréter avec prudence.", "Plus récent en premier", "Retour au pronostic", "Échantillon limité à 10 matchs par équipe, selon les données accessibles. Les adversaires et périodes peuvent différer.", "Impossible de charger les statistiques. Le pronostic reste accessible.", "Pas de résultat vérifié disponible.", "Non communiqué", "Confrontations retrouvées dans les derniers matchs disponibles, pas un historique exhaustif.", "V", "N", "D"],
 en: ["The match in numbers", "Observed results before this fixture", "Comparison", "Recent matches", "Head-to-head", "All fixtures", "Home / away", "Matches observed", "Wins", "Draws", "Losses", "Goals scored / match", "Goals conceded / match", "Over 2.5 goals", "Both teams score", "Clean sheets", "Scored at least once", "Metric", "Date", "Fixture", "Score", "Competition", "Refresh", "Loading statistics…", "History unavailable for this fixture.", "Data depends on provider coverage and cache. No results are invented.", "No head-to-head in the available samples. This does not mean the teams have never met.", "Frequencies describe past matches; they are not probabilities for the next fixture.", "Source", "Last collected", "Old data: interpret with caution.", "Most recent first", "Back to prediction", "Up to 10 matches per team, depending on available data. Opponents and periods may differ.", "Unable to load statistics. The prediction remains accessible.", "No verified results available.", "Not provided", "Meetings found in the available recent matches, not a complete history.", "W", "D", "L"],
 es: ["El partido en cifras", "Resultados observados antes del encuentro", "Comparación", "Últimos partidos", "Enfrentamientos", "Todos los partidos", "Local / visitante", "Partidos observados", "Victorias", "Empates", "Derrotas", "Goles marcados / partido", "Goles recibidos / partido", "Más de 2,5 goles", "Ambos marcan", "Portería a cero", "Marcó al menos una vez", "Indicador", "Fecha", "Partido", "Resultado", "Competición", "Actualizar", "Cargando estadísticas…", "Historial no disponible para este partido.", "Los datos dependen de la cobertura y caché del proveedor. No se inventan resultados.", "Sin enfrentamientos en las muestras disponibles. No significa que nunca se hayan enfrentado.", "Las frecuencias describen partidos pasados, no probabilidades del próximo partido.", "Fuente", "Última recopilación", "Datos antiguos: interpreta con cautela.", "Más reciente primero", "Volver al pronóstico", "Hasta 10 partidos por equipo según los datos disponibles. Rivales y períodos pueden variar.", "No se pudieron cargar las estadísticas. El pronóstico sigue disponible.", "Sin resultados verificados.", "No disponible", "Enfrentamientos encontrados en los partidos recientes disponibles, no un historial completo.", "V", "E", "D"],
 pt: ["O jogo em números", "Resultados observados antes deste jogo", "Comparação", "Últimos jogos", "Confrontos", "Todos os jogos", "Casa / fora", "Jogos observados", "Vitórias", "Empates", "Derrotas", "Golos marcados / jogo", "Golos sofridos / jogo", "Mais de 2,5 golos", "Ambas marcam", "Sem sofrer golos", "Marcou pelo menos uma vez", "Indicador", "Data", "Jogo", "Resultado", "Competição", "Atualizar", "A carregar estatísticas…", "Histórico indisponível para este jogo.", "Os dados dependem da cobertura e cache do fornecedor. Nenhum resultado é inventado.", "Sem confrontos nas amostras disponíveis. Não significa que nunca se tenham defrontado.", "As frequências descrevem jogos passados, não probabilidades para o próximo jogo.", "Fonte", "Última recolha", "Dados antigos: interpretar com prudência.", "Mais recente primeiro", "Voltar ao palpite", "Até 10 jogos por equipa conforme os dados disponíveis. Adversários e períodos podem variar.", "Não foi possível carregar as estatísticas. O palpite continua disponível.", "Sem resultados verificados.", "Não disponível", "Confrontos encontrados nos jogos recentes disponíveis, não um histórico completo.", "V", "E", "D"],
 de: ["Das Spiel in Zahlen", "Beobachtete Ergebnisse vor dieser Partie", "Vergleich", "Letzte Spiele", "Direkte Duelle", "Alle Spiele", "Heim / auswärts", "Beobachtete Spiele", "Siege", "Unentschieden", "Niederlagen", "Erzielte Tore / Spiel", "Gegentore / Spiel", "Über 2,5 Tore", "Beide Teams treffen", "Ohne Gegentor", "Mindestens ein Tor erzielt", "Kennzahl", "Datum", "Partie", "Ergebnis", "Wettbewerb", "Aktualisieren", "Statistiken werden geladen…", "Keine Historie für diese Partie verfügbar.", "Daten hängen von Anbieterabdeckung und Cache ab. Keine erfundenen Ergebnisse.", "Keine direkten Duelle in den verfügbaren Stichproben. Frühere Begegnungen sind damit nicht ausgeschlossen.", "Häufigkeiten beschreiben vergangene Spiele, keine Wahrscheinlichkeiten für das nächste Spiel.", "Quelle", "Zuletzt erfasst", "Alte Daten: vorsichtig interpretieren.", "Neueste zuerst", "Zurück zum Tipp", "Bis zu 10 Spiele je Team, je nach Datenlage. Gegner und Zeiträume können abweichen.", "Statistiken konnten nicht geladen werden. Der Tipp bleibt verfügbar.", "Keine bestätigten Ergebnisse verfügbar.", "Nicht angegeben", "Duelle aus den verfügbaren jüngsten Spielen, keine vollständige Historie.", "S", "U", "N"],
 ar: ["المباراة بالأرقام", "نتائج مرصودة قبل هذه المباراة", "مقارنة", "آخر المباريات", "المواجهات المباشرة", "جميع المباريات", "داخل / خارج الأرض", "المباريات المرصودة", "انتصارات", "تعادلات", "هزائم", "أهداف مسجلة / مباراة", "أهداف مستقبلة / مباراة", "أكثر من 2.5 هدف", "يسجل الفريقان", "شباك نظيفة", "سجل هدفاً على الأقل", "المؤشر", "التاريخ", "المباراة", "النتيجة", "البطولة", "تحديث", "جارٍ تحميل الإحصاءات…", "السجل غير متاح لهذه المباراة.", "تعتمد البيانات على تغطية المزود وذاكرته المؤقتة. لا تُختلق نتائج.", "لا توجد مواجهة في العينات المتاحة. هذا لا يعني أن الفريقين لم يلتقيا من قبل.", "التكرارات تصف مباريات سابقة وليست احتمالات للمباراة القادمة.", "المصدر", "آخر جمع للبيانات", "بيانات قديمة: تُفسر بحذر.", "الأحدث أولاً", "العودة إلى التوقع", "حتى 10 مباريات لكل فريق حسب البيانات المتاحة. قد يختلف الخصوم والفترات.", "تعذر تحميل الإحصاءات. يبقى التوقع متاحاً.", "لا توجد نتائج موثقة متاحة.", "غير متاح", "مواجهات عُثر عليها ضمن المباريات الأخيرة المتاحة وليست سجلاً كاملاً.", "ف", "ت", "خ"]
};

export function badgeUrls(match, side) {
  const nested=match?.prediction || {};
  const media=match?.[`${side}_media`] || nested[`${side}_media`] || {};
  const portrait=String(match?.sport_key||'').startsWith('tennis_')&&media.verified_license?media.url:null;
  const candidates=[portrait,...(Array.isArray(match?.[`${side}_image_candidates`])?match[`${side}_image_candidates`]:[]),match?.[`${side}_logo`],match?.[`${side}_team_logo`],match?.[`${side}_crest`],match?.[`${side}Team`]?.crest,media.url,nested[`${side}_logo`],nested[`${side}_team_logo`],...(Array.isArray(nested[`${side}_image_candidates`])?nested[`${side}_image_candidates`]:[])];
  return [...new Set(candidates.filter(value=>{
    if(typeof value!=="string")return false;
    try {const parsed=new URL(value);return parsed.protocol==="https:"&&!parsed.username&&!parsed.password;}catch{return false;}
  }))].slice(0,4);
}
export function badgeUrl(match, side) { return badgeUrls(match,side)[0] || null; }

// Used by the compact statistics table, independently from image placeholders.
function teamInitials(name) {
  return String(name || "").trim().split(/\s+/).filter(word=>/[\p{L}\p{N}]/u.test(word)).slice(0,2).map(word=>Array.from(word)[0]).join("").toLocaleUpperCase() || "—";
}

export function TeamBadge({ name = "", src, size = "small", kind, fallbackSrcs = [], sport = "" }) {
  const [failed,setFailed]=useState([]);
  const candidates=[...new Set([src,...(Array.isArray(fallbackSrcs)?fallbackSrcs:[])])].filter(value=>{
    if(typeof value!=="string")return false;
    try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password;}catch{return false;}
  });
  const candidateKey=candidates.join("|");
  useEffect(()=>{setFailed([]);},[name,sport,candidateKey]);
  const url=candidates.find(value=>!failed.includes(value));
  const portrait=kind==="portrait"||String(sport).startsWith("tennis_");
  const colors=["from-orange-50 to-amber-100 text-orange-500","from-sky-50 to-indigo-100 text-indigo-500","from-emerald-50 to-teal-100 text-teal-600"];
  const color=colors[Array.from(String(name)).reduce((sum,char)=>sum+char.codePointAt(0),0)%colors.length];
  const pixels = size === "large" ? 64 : size === "compact" ? 24 : 40;
  return <span style={{width:pixels,height:pixels,minWidth:pixels,flexShrink:0}} aria-hidden="true" data-testid="participant-image" data-image-size={size} data-image-kind={portrait?"portrait":"badge"}
    className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white shadow-sm ${portrait?"rounded-full":"rounded-2xl"} ${size==="large"?"h-16 w-16 sm:h-20 sm:w-20":"h-10 w-10"}`}>
    {url?<img src={url} alt="" width={pixels} height={pixels} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onError={()=>setFailed(current=>current.includes(url)?current:[...current,url])}
      className={`h-full w-full ${portrait?"object-cover":"object-contain p-1.5"}`} style={{width:"100%",height:"100%",maxWidth:"100%",objectFit:portrait?"cover":"contain",...(portrait?{objectPosition:"center 22%"}:{padding:size==="compact"?2:4})}}/>
      :<span className={`grid h-full w-full place-items-center bg-gradient-to-br ${color}`} data-testid="participant-image-placeholder">
        {portrait && size !== "compact" ? <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3/5 w-3/5">
          <circle cx="16" cy="11" r="5"/><path d="M6 28c0-7 4-11 10-11s10 4 10 11"/>
        </svg> : <span className={size === "compact" ? "text-[9px] font-bold" : "text-sm font-bold"}>{teamInitials(name)}</span>}
      </span>}
  </span>;
}

const SPORT_INSIGHT_COPY = {"fr": {"points_for": "Points marqués / match", "points_against": "Points encaissés / match", "sets_for": "Sets gagnés / match", "sets_against": "Sets perdus / match", "credits": "Crédits photo", "crop": "cadrage adapté", "first": "Joueur 1", "second": "Joueur 2"}, "en": {"points_for": "Points scored / game", "points_against": "Points allowed / game", "sets_for": "Sets won / match", "sets_against": "Sets lost / match", "credits": "Photo credits", "crop": "display crop", "first": "Player 1", "second": "Player 2"}, "es": {"points_for": "Puntos anotados / partido", "points_against": "Puntos recibidos / partido", "sets_for": "Sets ganados / partido", "sets_against": "Sets perdidos / partido", "credits": "Créditos fotográficos", "crop": "encuadre adaptado", "first": "Jugador 1", "second": "Jugador 2"}, "pt": {"points_for": "Pontos marcados / jogo", "points_against": "Pontos sofridos / jogo", "sets_for": "Sets ganhos / jogo", "sets_against": "Sets perdidos / jogo", "credits": "Créditos das fotos", "crop": "enquadramento adaptado", "first": "Jogador 1", "second": "Jogador 2"}, "de": {"points_for": "Erzielte Punkte / Spiel", "points_against": "Zugelassene Punkte / Spiel", "sets_for": "Gewonnene Sätze / Spiel", "sets_against": "Verlorene Sätze / Spiel", "credits": "Bildnachweise", "crop": "Darstellung zugeschnitten", "first": "Spieler 1", "second": "Spieler 2"}, "ar": {"points_for": "نقاط مسجلة / مباراة", "points_against": "نقاط مستقبلة / مباراة", "sets_for": "مجموعات فائزة / مباراة", "sets_against": "مجموعات خاسرة / مباراة", "credits": "حقوق الصور", "crop": "اقتصاص للعرض", "first": "اللاعب الأول", "second": "اللاعب الثاني"}};
const METRICS = [["played",7],["wins",8],["draws",9],["losses",10],["goals_for",11],["goals_against",12],["over25",13,"%"],["btts",14,"%"],["clean_sheets",15,"%"],["scored",16,"%"]];
export function MatchInsights({ match }) {
  const i18n = usePageLanguage();
  const words = LABELS[i18n.language] || LABELS.fr;
  const sportWords = SPORT_INSIGHT_COPY[i18n.language] || SPORT_INSIGHT_COPY.fr;
  const id = String(match?.id || match?.match_id || "");
  const [state,setState] = useState({ id:null,data:null,error:false });
  const [retry,setRetry] = useState(0);
  const [tab,setTab] = useState("compare");
  const [venue,setVenue] = useState(false);
  const data = state.id === id ? state.data : null;
  const error = state.id === id && state.error;
  useEffect(() => {
    if (!id) return undefined;
    const controller = new AbortController();
    setState({id,data:null,error:false}); setTab("compare"); setVenue(false);
    api.get(`/matches/${encodeURIComponent(id)}/insights`, { signal:controller.signal,timeout:12000 }).then(response => {
      if (controller.signal.aborted) return;
      if (!response.data || response.data.version !== 1) throw new Error("Invalid insights response");
      setState({id,data:response.data,error:false});
    }).catch(() => { if (!controller.signal.aborted) setState({id,data:null,error:true}); });
    return () => controller.abort();
  },[id,retry]);
  const number = (value,suffix="") => value == null || !Number.isFinite(Number(value)) ? "—" : `${new Intl.NumberFormat(i18n.locale,{maximumFractionDigits:2}).format(Number(value))}${suffix}`;
  const date = value => { const stamp = new Date(value); return !value || !Number.isFinite(stamp.getTime()) ? words[36] : new Intl.DateTimeFormat(i18n.locale,{day:"2-digit",month:"short",year:"numeric"}).format(stamp); };
  const metricRows = data?.metric_family === "basketball" ? [["played",7],["wins",8],["losses",10],["points_for","points_for"],["points_against","points_against"]] : data?.metric_family === "tennis" ? [["played",7],["wins",8],["losses",10],["sets_for","sets_for"],["sets_against","sets_against"]] : METRICS;
  const home = data?.home?.[venue ? "venue":"overall"] || {};
  const away = data?.away?.[venue ? "venue":"overall"] || {};
  const form = rows => <div className="flex flex-wrap gap-1.5">{(Array.isArray(rows) ? rows : []).map((v,index) => <span key={index} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-extrabold ${v==="W" ? "bg-emerald-100 text-emerald-800" : v==="D" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`} title={words[v==="W" ? 8 : v==="D" ? 9 : 10]}>{words[v==="W" ? 38 : v==="D" ? 39 : 40]}</span>)}</div>;
  const history = rows => !Array.isArray(rows) || !rows.length ? <p className="p-4 text-sm text-slate-500">{words[35]}</p> : <div className="divide-y divide-slate-100">{rows.map((r,index) => <article key={`${r.id}-${index}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm">
    <div className="min-w-0"><p className="mb-1 text-xs leading-5 text-slate-500"><time dateTime={r.date}>{date(r.date)}</time> · {r.competition || words[36]}</p><p className="break-words font-semibold leading-6 text-slate-800"><bdi>{r.home_team}</bdi><span className="mx-1 text-xs text-slate-400">vs</span><bdi>{r.away_team}</bdi></p></div>
    <bdi aria-label={words[20]} className="rounded-xl bg-slate-100 px-3 py-2 font-mono font-extrabold tabular-nums text-slate-800">{number(r.score_home)}–{number(r.score_away)}</bdi>
  </article>)}</div>;
  return <section id="match-insights" dir={i18n.direction} className="mb-6 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="match-insights">
    <header className="border-b border-slate-100 bg-gradient-to-r from-orange-50 to-white p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-wider text-orange-700">WinPulse · Stats</p><h2 className="mt-1 font-heading text-xl font-extrabold text-slate-900 sm:text-2xl">{words[0]}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{words[1]}</p></header>
    {error ? <div role="alert" className="p-5 text-sm leading-6 text-slate-600">{words[34]}<button type="button" onClick={()=>setRetry(v=>v+1)} className="mt-3 block min-h-11 rounded-xl border px-4 font-bold text-orange-700">{words[22]}</button></div> : !data ? <p role="status" className="p-6 text-sm text-slate-500">{words[23]}</p> : data.status !== "ready" ? <div className="p-5"><p className="font-semibold text-slate-800">{words[24]}</p><p className="mt-2 text-sm leading-6 text-slate-500">{words[25]}</p></div> : <>
      <nav aria-label={words[0]} className="grid grid-cols-3 gap-1 border-b border-slate-100 p-2">{[["compare",2],["recent",3],["h2h",4]].map(([key,index])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>setTab(key)} className={`min-h-12 rounded-xl px-1 py-2 text-xs font-bold leading-5 sm:text-sm ${tab===key ? "bg-slate-900 text-white":"text-slate-600 hover:bg-slate-50"}`}>{words[index]}</button>)}</nav>
      <div className="p-4 sm:p-6">
        {data.stale && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{words[30]}</p>}
        {tab === "compare" && <>
          <div className="mb-4 flex flex-wrap gap-2">{data.venue_supported!==false && [false,true].map(v=><button key={String(v)} type="button" onClick={()=>setVenue(v)} aria-pressed={venue===v} className={`min-h-11 rounded-xl border px-3 text-xs font-semibold ${venue===v ? "border-orange-300 bg-orange-50 text-orange-800":"border-slate-200 text-slate-600"}`}>{words[v?6:5]}</button>)}</div>
          <div className="grid grid-cols-2 gap-3">{[[match.home_team,home, "home"],[match.away_team,away,"away"]].map(([name,summary,side])=><div key={side} className="min-w-0 rounded-xl bg-slate-50 p-3"><div className="mb-2 min-w-0 space-y-2"><TeamBadge name={name} src={badgeUrl(match,side)} fallbackSrcs={badgeUrls(match,side)} sport={match.sport_key} kind={match[`${side}_media`]?.kind} /><p className="min-w-0 text-sm font-bold leading-6 text-slate-900 [overflow-wrap:anywhere]"><bdi>{name}</bdi></p></div>{form(summary.form)}<p className="mt-2 text-xs leading-5 text-slate-500">{words[7]} : {number(summary.played)}</p></div>)}</div>
          <p className="my-3 text-xs text-slate-500">{words[31]}</p>
          <table className="w-full table-fixed text-sm" data-testid="match-comparison-table"><caption className="sr-only">{words[2]}: {match.home_team} / {match.away_team}</caption><thead><tr className="border-b border-slate-200"><th scope="col" className="w-[46%] py-3 text-start text-xs font-semibold text-slate-500">{words[17]}</th><th scope="col" className="break-words px-1 py-3 text-center text-xs"><abbr title={match.home_team} className="no-underline sm:hidden">{teamInitials(match.home_team)}</abbr><span className="hidden sm:inline">{match.home_team}</span></th><th scope="col" className="break-words px-1 py-3 text-center text-xs"><abbr title={match.away_team} className="no-underline sm:hidden">{teamInitials(match.away_team)}</abbr><span className="hidden sm:inline">{match.away_team}</span></th></tr></thead><tbody>{metricRows.map(([key,index,suffix])=><tr key={key} className="border-b border-slate-100 last:border-0"><th scope="row" className="break-words py-3 pe-2 text-start text-xs font-medium leading-5 text-slate-600 sm:text-sm">{typeof index === "number" ? words[index] : sportWords[index]}</th><td className="px-1 py-3 text-center font-mono font-bold tabular-nums text-slate-900">{number(home[key],suffix)}</td><td className="px-1 py-3 text-center font-mono font-bold tabular-nums text-slate-900">{number(away[key],suffix)}</td></tr>)}</tbody></table>
        </>}
        {tab === "recent" && <div className="grid min-w-0 gap-6 lg:grid-cols-2">{[[match.home_team,data.home?.recent],[match.away_team,data.away?.recent]].map(([name,rows],index)=><div key={index} className="min-w-0"><h3 className="mb-2 break-words text-base font-extrabold text-slate-900">{name}</h3>{history(rows)}</div>)}</div>}
        {tab === "h2h" && <><p className="mb-3 text-sm leading-6 text-slate-500">{words[37]}</p>{data.h2h?.length ? history(data.h2h) : <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{words[26]}</p>}</>}
        <p className="mt-4 rounded-xl bg-orange-50 p-3 text-xs leading-5 text-orange-900">{words[27]}</p><p className="mt-3 text-xs leading-5 text-slate-500">{words[33]}</p>
        <footer className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500"><span>{words[28]} : {data.source}</span><span>{words[29]} : {date(data.updated_at)}</span></footer>
      </div>
    </>}
    {data?.detailed_statistics && <DetailedFootballStats stats={data.detailed_statistics} match={match} />}
  </section>;
}

export function InsightsLink() {
  const { language } = usePageLanguage();
  return <a href="#match-insights" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-orange-700 hover:bg-orange-50">{(LABELS[language] || LABELS.fr)[0]} ↓</a>;
}

export function MarketQuotes({ match }) {
  const i18n = usePageLanguage();
  const labels = {
    fr:["Cotes du marché sélectionné","Bookmaker","Sélection","Cote","Aucune cote comparable transmise pour ce marché.","Cotes observées : disponibilité et règles à vérifier chez le bookmaker."],
    en:["Selected market odds","Bookmaker","Selection","Odds","No comparable quotes provided for this market.","Observed odds: check availability and rules with the bookmaker."],
    es:["Cuotas del mercado elegido","Casa de apuestas","Selección","Cuota","Sin cuotas comparables para este mercado.","Cuotas observadas: verifica disponibilidad y reglas con el operador."],
    pt:["Cotas do mercado escolhido","Operador","Seleção","Cota","Sem cotas comparáveis para este mercado.","Cotas observadas: confirma disponibilidade e regras no operador."],
    de:["Quoten des gewählten Marktes","Anbieter","Auswahl","Quote","Keine vergleichbaren Quoten für diesen Markt.","Beobachtete Quoten: Verfügbarkeit und Regeln beim Anbieter prüfen."],
    ar:["معاملات السوق المختار","المزود","الاختيار","المعامل","لا توجد أسعار قابلة للمقارنة لهذا السوق.","أسعار مرصودة: تحقق من التوفر والقواعد لدى المزود."]
  }[i18n.language] || ["Cotes du marché sélectionné","Bookmaker","Sélection","Cote","Aucune cote comparable transmise pour ce marché.","Vérifie les règles et la disponibilité."];
  const prediction = match.prediction || {};
  const key = prediction.market || prediction.market_key;
  const rows = (match.bookmakers || []).flatMap(book => (book.markets || []).filter(market => market.key === key).flatMap(market => (market.outcomes || []).filter(outcome => {
    const valid = typeof outcome.price === "number" && Number.isFinite(outcome.price) && outcome.price > 1;
    // Compare the exact quoted line, not different totals or handicaps.
    const point = prediction.pick_point;
    return valid && (point == null || Number(outcome.point) === Number(point));
  }).map(outcome => ({book:book.title || book.key,name:outcome.name,point:outcome.point,price:outcome.price}))));
  return <section className="mb-6 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" data-testid="selected-market-quotes"><h2 className="text-lg font-extrabold text-slate-900">{labels[0]}</h2><p className="mt-1 text-sm text-slate-500">{i18n.bet(prediction.market_label || key || "")}</p>{rows.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-start text-xs text-slate-500">{labels.slice(1,4).map(text=><th key={text} scope="col" className="px-2 py-3 text-start">{text}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index} className="border-b border-slate-100"><th scope="row" className="px-2 py-3 text-start font-semibold text-slate-700">{row.book}</th><td className="px-2 py-3 text-slate-600">{i18n.bet(row.name)}{row.point != null ? ` ${row.point}` : ""}</td><td className="px-2 py-3 font-mono font-bold text-slate-900">{new Intl.NumberFormat(i18n.locale,{maximumFractionDigits:3}).format(row.price)}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-slate-500">{labels[4]}</p>}<p className="mt-3 text-xs leading-5 text-slate-500">{labels[5]}</p></section>;
}


export function sportRole(match,side,language="fr") {
 const words=SPORT_INSIGHT_COPY[language]||SPORT_INSIGHT_COPY.fr;
 return String(match?.sport_key||'').startsWith('tennis_')?words[side==='home'?'first':'second']:null;
}
export function MediaCredits({match}) {
 const {language}=usePageLanguage();const words=SPORT_INSIGHT_COPY[language]||SPORT_INSIGHT_COPY.fr;
 const entries=['home','away'].map(side=>({...(match?.[`${side}_media`]||{}),name:match?.[`${side}_team`],displayed:badgeUrl(match,side)})).filter(row=>row.verified_license&&row.kind==='portrait'&&row.url===row.displayed&&row.author&&row.license&&/^https:\/\/commons\.wikimedia\.org\//.test(row.source_url||'')&&/^https:\/\/(?:creativecommons\.org|commons\.wikimedia\.org)\//.test(row.license_url||''));
 if(!entries.length)return null;
 const label={fr:"Images et sources",en:"Images and sources",es:"Imágenes y fuentes",pt:"Imagens e fontes",de:"Bilder und Quellen",ar:"الصور والمصادر"}[language] || "Images and sources";
 return <details className="mt-2 text-xs leading-5 text-slate-500" data-testid="media-credits">
   <summary className="w-fit cursor-pointer rounded-md px-1 py-1 text-[11px] underline decoration-slate-300 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">{label}</summary>
   <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="font-semibold">{words.credits}</p>{entries.map(row=><p key={row.url} className="break-words"><a href={row.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{row.name} — {row.author}</a>{" · "}<a href={row.license_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{row.license}</a>{" · "}{words.crop}</p>)}</div>
 </details>;
}


const MULTI_COPY = {
  fr: {rich:"Données étoffées",partial:"Données partielles",limited:"Données limitées",contained:"Incertitude contenue",intermediate:"Incertitude intermédiaire",high:"Incertitude élevée",unassessed:"Incertitude non évaluée",title:"Explorer les marchés",intro:"Une analyse par marché, issue du modèle sportif lorsqu’il est disponible.",pilot:"Modèle sportif indépendant · expérimental",market:"Comparaison des cotes · modèle sportif indisponible",win:"Victoire du pari",push:"Remboursement",loss:"Perte du pari",odds:"Cote observée",noQuote:"Analyse uniquement · cote indisponible ou ancienne",all:"Tous",choices:"Options avec cote récente",analysis:"Voir les autres probabilités calculées",note:"Ces choix concernent le même match et sont liés : ils ne constituent pas un combiné. Une estimation élevée ne garantit aucun résultat.",proof:"La qualité des données et l’incertitude du pari sont deux informations différentes. Les estimations du pilote ne sont pas encore validées sur des résultats futurs.",fresh:"Cote relevée",history:"Rencontres historiques",homeGoals:"Buts attendus à domicile",awayGoals:"Buts attendus à l’extérieur",lines:"Autres marchés",empty:"Aucune cote récente supplémentaire pour cette rencontre.",families:{btts:"Les deux équipes marquent",totals:"Total de buts",spreads:"Handicap",draw_no_bet:"Nul remboursé",double_chance:"Double chance",team_totals:"Buts par équipe",h2h:"Résultat"}},
  en: {rich:"Extensive data",partial:"Partial data",limited:"Limited data",contained:"Contained uncertainty",intermediate:"Intermediate uncertainty",high:"High uncertainty",unassessed:"Uncertainty not assessed",title:"Explore markets",intro:"Market-by-market analysis, from the sports model when available.",pilot:"Independent sports model · experimental",market:"Odds comparison · sports model unavailable",win:"Bet wins",push:"Refund",loss:"Bet loses",odds:"Observed odds",noQuote:"Analysis only · odds missing or outdated",all:"All",choices:"Options with recent odds",analysis:"See other calculated probabilities",note:"These selections concern the same match and are correlated; this is not an accumulator. High estimates do not guarantee results.",proof:"Data quality and bet uncertainty are different. Pilot estimates have not yet been validated on future results.",fresh:"Odds recorded",history:"Historical fixtures",homeGoals:"Expected home goals",awayGoals:"Expected away goals",lines:"Other markets",empty:"No additional recent odds for this fixture.",families:{btts:"Both teams to score",totals:"Total goals",spreads:"Handicap",draw_no_bet:"Draw no bet",double_chance:"Double chance",team_totals:"Team goals",h2h:"Match result"}},
  es: {rich:"Datos amplios",partial:"Datos parciales",limited:"Datos limitados",contained:"Incertidumbre contenida",intermediate:"Incertidumbre intermedia",high:"Incertidumbre elevada",unassessed:"Incertidumbre no evaluada",title:"Explorar mercados",intro:"Análisis por mercado, basado en el modelo deportivo cuando existe.",pilot:"Modelo deportivo independiente · experimental",market:"Comparación de cuotas · sin modelo deportivo",win:"Apuesta ganada",push:"Reembolso",loss:"Apuesta perdida",odds:"Cuota observada",noQuote:"Solo análisis · cuota ausente o antigua",all:"Todos",choices:"Opciones con cuotas recientes",analysis:"Ver otras probabilidades calculadas",note:"Las selecciones del mismo partido están relacionadas y no forman una combinada. Ningún resultado está garantizado.",proof:"La calidad de datos y la incertidumbre son distintas. El piloto no está validado en resultados futuros.",fresh:"Cuota registrada",history:"Partidos históricos",homeGoals:"Goles esperados local",awayGoals:"Goles esperados visitante",lines:"Otros mercados",empty:"No hay cuotas recientes adicionales.",families:{btts:"Ambos marcan",totals:"Total de goles",spreads:"Hándicap",draw_no_bet:"Empate no válido",double_chance:"Doble oportunidad",team_totals:"Goles por equipo",h2h:"Resultado"}},
  pt: {rich:"Dados amplos",partial:"Dados parciais",limited:"Dados limitados",contained:"Incerteza contida",intermediate:"Incerteza intermédia",high:"Incerteza elevada",unassessed:"Incerteza não avaliada",title:"Explorar mercados",intro:"Análise por mercado, a partir do modelo desportivo quando disponível.",pilot:"Modelo desportivo independente · experimental",market:"Comparação de odds · sem modelo desportivo",win:"Aposta ganha",push:"Reembolso",loss:"Aposta perdida",odds:"Odd observada",noQuote:"Apenas análise · odd ausente ou antiga",all:"Todos",choices:"Opções com odds recentes",analysis:"Ver outras probabilidades calculadas",note:"As escolhas do mesmo jogo são relacionadas e não formam uma múltipla. Nenhum resultado é garantido.",proof:"A qualidade dos dados e a incerteza são diferentes. O piloto ainda não foi validado em resultados futuros.",fresh:"Odd registada",history:"Jogos históricos",homeGoals:"Golos esperados em casa",awayGoals:"Golos esperados fora",lines:"Outros mercados",empty:"Sem odds recentes adicionais.",families:{btts:"Ambas marcam",totals:"Total de golos",spreads:"Handicap",draw_no_bet:"Empate devolve",double_chance:"Dupla hipótese",team_totals:"Golos por equipa",h2h:"Resultado"}},
  de: {rich:"Umfangreiche Daten",partial:"Teilweise Daten",limited:"Begrenzte Daten",contained:"Begrenzte Unsicherheit",intermediate:"Mittlere Unsicherheit",high:"Hohe Unsicherheit",unassessed:"Unsicherheit nicht bewertet",title:"Märkte entdecken",intro:"Analyse je Markt aus dem Sportmodell, sofern verfügbar.",pilot:"Unabhängiges Sportmodell · experimentell",market:"Quotenvergleich · Sportmodell nicht verfügbar",win:"Wette gewinnt",push:"Rückzahlung",loss:"Wette verliert",odds:"Beobachtete Quote",noQuote:"Nur Analyse · Quote fehlt oder ist veraltet",all:"Alle",choices:"Optionen mit aktuellen Quoten",analysis:"Weitere berechnete Wahrscheinlichkeiten",note:"Auswahlen zum selben Spiel sind abhängig und keine Kombiwette. Kein Ergebnis ist garantiert.",proof:"Datenqualität und Unsicherheit sind verschieden. Das Pilotmodell ist noch nicht mit zukünftigen Ergebnissen validiert.",fresh:"Quote erfasst",history:"Historische Spiele",homeGoals:"Erwartete Heimtore",awayGoals:"Erwartete Auswärtstore",lines:"Weitere Märkte",empty:"Keine weiteren aktuellen Quoten.",families:{btts:"Beide treffen",totals:"Gesamttore",spreads:"Handicap",draw_no_bet:"Unentschieden zurück",double_chance:"Doppelte Chance",team_totals:"Teamtore",h2h:"Ergebnis"}},
  ar: {rich:"بيانات موسعة",partial:"بيانات جزئية",limited:"بيانات محدودة",contained:"عدم يقين محدود",intermediate:"عدم يقين متوسط",high:"عدم يقين مرتفع",unassessed:"عدم اليقين غير مقيّم",title:"استكشف الأسواق",intro:"تحليل لكل سوق من النموذج الرياضي عند توفره.",pilot:"نموذج رياضي مستقل · تجريبي",market:"مقارنة المعاملات · النموذج الرياضي غير متاح",win:"فوز الرهان",push:"استرداد",loss:"خسارة الرهان",odds:"المعامل المرصود",noQuote:"تحليل فقط · المعامل مفقود أو قديم",all:"الكل",choices:"خيارات بمعاملات حديثة",analysis:"احتمالات أخرى محسوبة",note:"اختيارات المباراة نفسها مترابطة وليست رهاناً مركباً. لا توجد نتائج مضمونة.",proof:"جودة البيانات وعدم اليقين مختلفان. لم يُتحقق من النموذج التجريبي على نتائج مستقبلية بعد.",fresh:"تاريخ المعامل",history:"المباريات التاريخية",homeGoals:"أهداف المضيف المتوقعة",awayGoals:"أهداف الضيف المتوقعة",lines:"أسواق أخرى",empty:"لا توجد معاملات حديثة إضافية.",families:{btts:"يسجل الفريقان",totals:"مجموع الأهداف",spreads:"الهانديكاب",draw_no_bet:"التعادل يعيد الرهان",double_chance:"فرصة مزدوجة",team_totals:"أهداف الفريق",h2h:"النتيجة"}}
};

const PROFILE_COPY = {
  fr: {strong:"Tendance forte",shared:"Scénario partagé",bold:"Choix audacieux",unknown:"Estimation indisponible",hint:"Profil fondé sur la probabilité estimée de gagner le pari. Aucun résultat garanti.",method:"Comprendre le calcul",history:"Rencontres utilisées",updated:"Dernier résultat historique",experimental:"Modèle expérimental : ses performances futures restent à évaluer."},
  en: {strong:"Strong trend",shared:"Contested outcome",bold:"Bold selection",unknown:"Estimate unavailable",hint:"Profile based on the estimated probability of winning the bet. No guaranteed outcome.",method:"Understand the calculation",history:"Fixtures used",updated:"Latest historical result",experimental:"Experimental model: future performance still needs evaluation."},
  es: {strong:"Tendencia fuerte",shared:"Escenario disputado",bold:"Selección audaz",unknown:"Estimación no disponible",hint:"Perfil basado en la probabilidad estimada de ganar. Sin resultados garantizados.",method:"Entender el cálculo",history:"Partidos utilizados",updated:"Último resultado histórico",experimental:"Modelo experimental: su rendimiento futuro está por evaluar."},
  pt: {strong:"Tendência forte",shared:"Cenário disputado",bold:"Escolha ousada",unknown:"Estimativa indisponível",hint:"Perfil baseado na probabilidade estimada de ganhar. Sem resultados garantidos.",method:"Compreender o cálculo",history:"Jogos utilizados",updated:"Último resultado histórico",experimental:"Modelo experimental: o desempenho futuro ainda será avaliado."},
  de: {strong:"Starke Tendenz",shared:"Offenes Szenario",bold:"Mutige Auswahl",unknown:"Schätzung nicht verfügbar",hint:"Profil nach geschätzter Gewinnwahrscheinlichkeit. Kein Ergebnis garantiert.",method:"Berechnung verstehen",history:"Verwendete Spiele",updated:"Letztes historisches Ergebnis",experimental:"Experimentelles Modell: zukünftige Leistung muss noch bewertet werden."},
  ar: {strong:"اتجاه قوي",shared:"سيناريو متقارب",bold:"اختيار جريء",unknown:"التقدير غير متاح",hint:"التصنيف مبني على احتمال الفوز المقدر. لا توجد نتيجة مضمونة.",method:"فهم الحساب",history:"المباريات المستخدمة",updated:"آخر نتيجة تاريخية",experimental:"نموذج تجريبي: لا يزال الأداء المستقبلي بحاجة إلى تقييم."}
};

export function PredictionEvidence({ prediction = {}, compact = false, official = false }) {
  const { language, formatNumber } = useMatchLanguage();
  const words = PROFILE_COPY[language] || PROFILE_COPY.fr;
  const probability = marketWinProbability(prediction);
  const profile = probability === null ? "unknown" : probability >= 70 ? "strong" : probability >= 55 ? "shared" : "bold";
  const cls = profile === "strong" ? "border-emerald-300 bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-950 shadow-sm shadow-emerald-100" : profile === "shared" ? "border-amber-300 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-950 shadow-sm shadow-amber-100" : profile === "bold" ? "border-rose-300 bg-gradient-to-r from-rose-100 to-fuchsia-100 text-rose-950 shadow-sm shadow-rose-100" : "border-slate-300 bg-slate-100 text-slate-700";
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-extrabold leading-5 ${cls}`} data-testid="prediction-evidence" title={compact ? undefined : words.hint}><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-current opacity-80" />{official && <span>{({fr:"Estimation publiée",en:"Published estimate",es:"Estimación publicada",pt:"Estimativa publicada",de:"Veröffentlichte Schätzung",ar:"التقدير المنشور"})[language] || "Published estimate"} · </span>}<span>{words[profile]}{official && probability!==null ? ` · ${formatNumber(probability,{maximumFractionDigits:1})} %` : ""}</span></span>;
}

const MARKET_DETAIL_COPY={
 fr:{best:"Estimation la plus élevée",scope:"Parmi toutes les probabilités calculées pour résultat, double chance et total de buts, avec ou sans cote disponible. Ce repère ne remplace pas le choix officiel et ne garantit pas un gain.",archived:"Analyses conservées avant le coup d’envoi. Ces probabilités et cotes ne sont pas une mise à jour en direct.",alternative:"Alternative — hors bilan officiel"},
 en:{best:"Highest estimated probability",scope:"Across all calculated match result, double chance and total goal probabilities, with or without available odds. This does not replace the official pick or guarantee a win.",archived:"Pre-match analyses preserved. These probabilities and odds are not live updates.",alternative:"Alternative — excluded from official record"},
 es:{best:"Mayor probabilidad estimada",scope:"Entre todas las probabilidades calculadas de resultado, doble oportunidad y goles, con o sin cuota. No sustituye el pronóstico oficial ni garantiza acierto.",archived:"Análisis previos al inicio conservados; no son actualizaciones en directo.",alternative:"Alternativa — fuera del balance oficial"},
 pt:{best:"Maior probabilidade estimada",scope:"Entre todas as probabilidades calculadas de resultado, dupla hipótese e golos, com ou sem odd. Não substitui a seleção oficial nem garante acerto.",archived:"Análises anteriores ao início preservadas; não são atualizações ao vivo.",alternative:"Alternativa — fora do histórico oficial"},
 de:{best:"Höchste geschätzte Wahrscheinlichkeit",scope:"Unter allen berechneten Ergebnis-, Doppelchance- und Torwahrscheinlichkeiten, mit oder ohne Quote. Ersetzt den offiziellen Tipp nicht; keine Gewinngarantie.",archived:"Gespeicherte Vorab-Analysen; keine Live-Aktualisierung der Quoten oder Wahrscheinlichkeiten.",alternative:"Alternative — nicht Teil der offiziellen Bilanz"},
 ar:{best:"أعلى احتمال تقديري",scope:"بين كل احتمالات النتيجة والفرصة المزدوجة والأهداف المحسوبة، مع سعر متاح أو بدونه. لا يستبدل الاختيار الرسمي ولا يضمن الفوز.",archived:"تحليلات محفوظة قبل البداية وليست تحديثات مباشرة للاحتمالات والأسعار.",alternative:"بديل خارج السجل الرسمي"}
};
export function marketWinProbability(row) {
  const explicit=finiteNumber(row.estimated_win_probability);
  if(explicit!==null && explicit>=0 && explicit<=100)return explicit;
  const raw=finiteNumber(row.model_probability ?? row.confidence);
  if(raw===null || raw<0 || raw>100)return null;
  if(!row.probability_basis || row.probability_basis==="unconditional")return raw;
  const push=finiteNumber(row.push_probability);
  return push!==null && push>=0 && push<=100 ? raw*(1-push/100) : null;
}
export function preferredDetailChoice(choices) {
  return choices.filter(row=>["h2h","double_chance","totals"].includes(row.market) && marketWinProbability(row)!==null)
    .reduce((best,row)=>!best || marketWinProbability(row)>marketWinProbability(best)?row:best,null);
}

export function MultiMarketBoard({ prediction = {}, match = {} }) {
  const { user } = useAuth();
  const { language, formatNumber, t } = useMatchLanguage();
  const w = MULTI_COPY[language] || MULTI_COPY.fr;
  const [family, setFamily] = useState("all");
  const profileWords = PROFILE_COPY[language] || PROFILE_COPY.fr;
  const model = prediction.multi_market;
  const hasModel = Boolean(model);
  const detailWords=MARKET_DETAIL_COPY[language] || MARKET_DETAIL_COPY.fr;
  const seen = new Set();
  const baseChoices=[...(Array.isArray(model?.choices)?model.choices:[]),...(Array.isArray(prediction.recommendations)?prediction.recommendations:[]),...(Array.isArray(prediction.markets)?prediction.markets:[])].filter(item=>{
    if(!item || !item.pick)return false;
    const key=JSON.stringify([item.market,item.pick,item.pick_point,item.team]);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
  const calculated=Array.isArray(model?.analysis)?model.analysis:[];
  const preferred=preferredDetailChoice([...baseChoices,...calculated]);
  const sameLine=(a,b)=>a && b && a.market===b.market && a.pick===b.pick && a.pick_point===b.pick_point && a.team===b.team;
  const choices=preferred?[preferred,...baseChoices.filter(row=>!sameLine(row,preferred))]:baseChoices;
  const shareItem=row=>({...match,prediction:{...row,is_alternative:true,status:row.alternative_result_confirmed?row.result:"pending",won:undefined,locked:false}});
  const analysis = calculated.filter(row=>!sameLine(row,preferred));
  const families = [...new Set([...choices,...analysis].map(item=>item.market))];
  const number = value => finiteNumber(value) === null ? "—" : formatNumber(Number(value), {maximumFractionDigits:1});
  const percent = value => `${number(value)} %`;
  const probability = (row, part) => {
    const explicit = finiteNumber(row[part]);
    if (explicit !== null) return explicit;
    if (part === "estimated_win_probability" && (!row.probability_basis || row.probability_basis === "unconditional")) return finiteNumber(row.model_probability ?? row.confidence);
    return null;
  };
  const renderRow = (row, index, theoretical = false) => <article key={`${row.market}:${row.team}:${row.pick}:${row.pick_point}:${index}`} data-testid="market-choice" className={`min-w-0 rounded-2xl border bg-white p-4 shadow-sm ${row===preferred?"border-orange-400 ring-2 ring-orange-100":"border-slate-200"}`}>
    {row===preferred && <div className="mb-3 rounded-xl bg-orange-50 p-3" data-testid="preferred-market-choice"><p className="text-sm font-extrabold text-orange-800">{detailWords.best}</p><p className="mt-1 text-xs leading-5 text-orange-900">{detailWords.scope}</p></div>}
    <div className="flex flex-wrap items-start justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-indigo-700">{w.families[row.market] || row.market_label}</span><PredictionEvidence prediction={row} compact /></div>
    <h3 className="mt-3 break-words text-base font-extrabold leading-6 text-slate-900">{translateBetText(row.pick,t,formatNumber)}</h3>
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-600">{[[w.win, probability(row,"estimated_win_probability")],[w.push, probability(row,"push_probability")],[w.loss, probability(row,"estimated_loss_probability")]].map(([label,value])=><div key={label} className="min-w-0"><span className="block break-words leading-4">{label}</span><bdi className="mt-1 block text-sm font-extrabold text-slate-900">{percent(value)}</bdi></div>)}</div>
    {row.pick_odds != null && row.selection_available !== false ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className="text-xs text-slate-500">{w.odds}<strong className="mt-1 block break-words text-slate-700">{row.best_bookmaker}</strong></span><bdi className="font-mono text-2xl font-black text-orange-600">{formatOdds(row.pick_odds,formatNumber)}</bdi></div> : <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">{w.noQuote}</p>}
    {!theoretical && <div className="mt-3"><PredictionEvidence prediction={row} /></div>}
    {user?.is_admin && !theoretical && row.selection_available!==false && finiteNumber(row.pick_odds)>1 && <AdminShareActions isAdmin={true} item={shareItem(row)} kind={row.alternative_result_confirmed?"results":"picks"}/>}
  </article>;
  return <AdminShareProvider sharedAcrossMatches isAdmin={Boolean(user?.is_admin)} items={choices.filter(row=>row.selection_available!==false && finiteNumber(row.pick_odds)>1).map(shareItem)}><section className="mb-6 min-w-0 rounded-3xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white p-4 sm:p-6" data-testid="multi-market-board">
    <h2 className="text-xl font-extrabold tracking-tight text-slate-900">{w.title}</h2>
    {prediction.analysis_snapshot?.archived && <p className="my-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900" data-testid="archived-market-analysis">{detailWords.archived}</p>}
    <AdminShareToolbar/><p className="mt-2 text-sm leading-6 text-slate-600">{w.intro}</p>
    <span className="mt-3 inline-flex rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-bold text-indigo-800">{hasModel ? w.pilot : w.market}</span>
    {hasModel && <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 text-xs text-slate-500">{[[w.homeGoals,model.expected_home_goals],[w.awayGoals,model.expected_away_goals]].map(([label,value])=><div key={label}><span>{label}</span><bdi className="mt-1 block text-xl font-extrabold text-slate-900">{number(value)}</bdi></div>)}</div>}
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={w.title}>{["all",...families].map(key=><button key={key} type="button" aria-pressed={family===key} onClick={()=>setFamily(key)} className={`min-h-11 max-w-full rounded-xl border px-3 py-2 text-sm font-semibold ${family===key ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{key==="all" ? w.all : w.families[key] || key}</button>)}</div>
    <h3 className="mt-5 text-sm font-bold text-slate-700">{preferred && (preferred.analysis_only || preferred.selection_available===false || !(finiteNumber(preferred.pick_odds)>1)) ? w.analysis : w.choices}</h3><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">{choices.filter(row=>family==="all" || row.market===family).map((row,i)=>renderRow(row,i))}</div>
    {!choices.some(row=>family==="all" || row.market===family) && <p className="mt-3 text-sm text-slate-500">{w.empty}</p>}
    {analysis.length > 0 && <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-800">{w.analysis}</summary><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">{analysis.filter(row=>family==="all" || row.market===family).map((row,i)=>renderRow(row,i,true))}</div></details>}
    {hasModel && <details className="mt-4 border-t border-slate-200 pt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-700">{profileWords.method}</summary><p className="mt-2 text-xs leading-6 text-slate-600">{profileWords.experimental}</p><p className="mt-2 text-xs text-slate-600">{profileWords.history} : {number(model.model_fixtures)}</p>{model.latest_fixture_at && <p className="mt-2 text-xs text-slate-600">{profileWords.updated} : {String(model.latest_fixture_at).slice(0,10)}</p>}</details>}<p className="mt-2 text-xs leading-6 text-slate-600">{w.note}</p>
  </section></AdminShareProvider>;
}


const DETAIL_STATS_COPY = {
  fr:{title:"Le match en chiffres",intro:"Moyennes des dernières rencontres disponibles dans la même compétition.",metric:"Statistique",corners:"Corners",yellow_cards:"Cartons jaunes",red_cards:"Cartons rouges",shots:"Tirs",shots_on_target:"Tirs cadrés",possession:"Possession",fouls:"Fautes",sample:"matchs",empty:"Les statistiques détaillées seront affichées dès leur collecte.",models:"Tendances corners et cartons",cornersModel:"Total de corners",cardsModel:"Total de cartons jaunes",over:"Plus de",under:"Moins de",pending:"Analyse en préparation",note:"Estimations expérimentales calculées sur les décomptes observés, indépendamment du modèle de buts. Elles ne constituent pas des paris activés.",cardsNote:"Les cartons jaunes ne sont pas équivalents aux points de cartons d’un bookmaker.",referee:"Arbitre annoncé",method:"Détail de l’échantillon",source:"Source",updated:"Dernière collecte",against:"Moyenne concédée"},
  en:{title:"Match statistics",intro:"Averages from available recent games in the same competition.",metric:"Statistic",corners:"Corners",yellow_cards:"Yellow cards",red_cards:"Red cards",shots:"Shots",shots_on_target:"Shots on target",possession:"Possession",fouls:"Fouls",sample:"games",empty:"Detailed statistics will appear once collected.",models:"Corner and card trends",cornersModel:"Total corners",cardsModel:"Total yellow cards",over:"Over",under:"Under",pending:"Analysis in preparation",note:"Experimental estimates from observed counts, independent of the goals model. These are not enabled betting selections.",cardsNote:"Yellow cards are not equivalent to a bookmaker’s booking points.",referee:"Announced referee",method:"Sample details",source:"Source",updated:"Last collection",against:"Average conceded"},
  es:{title:"El partido en cifras",intro:"Promedios de partidos recientes disponibles en la misma competición.",metric:"Estadística",corners:"Córners",yellow_cards:"Tarjetas amarillas",red_cards:"Tarjetas rojas",shots:"Tiros",shots_on_target:"Tiros a puerta",possession:"Posesión",fouls:"Faltas",sample:"partidos",empty:"Las estadísticas detalladas aparecerán tras su recopilación.",models:"Tendencias de córners y tarjetas",cornersModel:"Total de córners",cardsModel:"Total de amarillas",over:"Más de",under:"Menos de",pending:"Análisis en preparación",note:"Estimaciones experimentales de recuentos observados, independientes del modelo de goles. No son apuestas habilitadas.",cardsNote:"Las amarillas no equivalen a los puntos de tarjetas de una casa de apuestas.",referee:"Árbitro anunciado",method:"Detalle de la muestra",source:"Fuente",updated:"Última recopilación",against:"Promedio concedido"},
  pt:{title:"O jogo em números",intro:"Médias dos jogos recentes disponíveis na mesma competição.",metric:"Estatística",corners:"Cantos",yellow_cards:"Cartões amarelos",red_cards:"Cartões vermelhos",shots:"Remates",shots_on_target:"Remates à baliza",possession:"Posse",fouls:"Faltas",sample:"jogos",empty:"As estatísticas detalhadas serão apresentadas após a recolha.",models:"Tendências de cantos e cartões",cornersModel:"Total de cantos",cardsModel:"Total de amarelos",over:"Mais de",under:"Menos de",pending:"Análise em preparação",note:"Estimativas experimentais de contagens observadas, independentes do modelo de golos. Não são apostas ativadas.",cardsNote:"Amarelos não equivalem aos pontos de cartões de uma casa de apostas.",referee:"Árbitro anunciado",method:"Detalhes da amostra",source:"Fonte",updated:"Última recolha",against:"Média concedida"},
  de:{title:"Das Spiel in Zahlen",intro:"Durchschnitte verfügbarer letzter Spiele desselben Wettbewerbs.",metric:"Statistik",corners:"Ecken",yellow_cards:"Gelbe Karten",red_cards:"Rote Karten",shots:"Schüsse",shots_on_target:"Torschüsse",possession:"Ballbesitz",fouls:"Fouls",sample:"Spiele",empty:"Detailstatistiken erscheinen nach der Erfassung.",models:"Ecken- und Kartentrends",cornersModel:"Ecken gesamt",cardsModel:"Gelbe Karten gesamt",over:"Über",under:"Unter",pending:"Analyse in Vorbereitung",note:"Experimentelle Schätzungen aus beobachteten Zählwerten, unabhängig vom Tormodell. Keine aktivierten Wettauswahlen.",cardsNote:"Gelbe Karten sind nicht gleich den Kartenpunkten eines Buchmachers.",referee:"Angekündigter Schiedsrichter",method:"Stichprobendetails",source:"Quelle",updated:"Letzte Erfassung",against:"Durchschnitt gegen das Team"},
  ar:{title:"المباراة بالأرقام",intro:"متوسطات المباريات الأخيرة المتاحة في المسابقة نفسها.",metric:"الإحصائية",corners:"الركنيات",yellow_cards:"البطاقات الصفراء",red_cards:"البطاقات الحمراء",shots:"التسديدات",shots_on_target:"التسديدات على المرمى",possession:"الاستحواذ",fouls:"الأخطاء",sample:"مباريات",empty:"ستظهر الإحصاءات التفصيلية بعد جمعها.",models:"اتجاهات الركنيات والبطاقات",cornersModel:"إجمالي الركنيات",cardsModel:"إجمالي البطاقات الصفراء",over:"أكثر من",under:"أقل من",pending:"التحليل قيد الإعداد",note:"تقديرات تجريبية من الأعداد المرصودة، مستقلة عن نموذج الأهداف. ليست اختيارات مراهنة مفعّلة.",cardsNote:"البطاقات الصفراء لا تساوي نقاط البطاقات لدى شركة المراهنات.",referee:"الحكم المعلن",method:"تفاصيل العينة",source:"المصدر",updated:"آخر جمع",against:"متوسط ضد الفريق"}
};

export function DetailedFootballStats({ stats, match }) {
  const {language,locale}=usePageLanguage();
  const w=DETAIL_STATS_COPY[language]||DETAIL_STATS_COPY.fr;
  const numeric=value=>value==null||!Number.isFinite(Number(value))?"—":new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(Number(value));
  if(!stats)return null;
  const models=stats.count_models||{};
  return <section className="m-4 min-w-0 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50/60 to-white p-4 sm:m-6 sm:p-5" data-testid="detailed-football-statistics">
    <h3 className="text-lg font-extrabold text-slate-900">{w.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{w.intro}</p>
    {stats.status!=="ready" ? <p className="mt-3 text-sm text-slate-500">{w.empty}</p> : <div className="mt-4 space-y-2"><div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-xs font-bold text-slate-600"><span>{w.metric}</span><bdi className="break-words text-center">{match?.home_team}</bdi><bdi className="break-words text-center">{match?.away_team}</bdi></div>{["corners","yellow_cards","red_cards","shots","shots_on_target","possession","fouls"].map(metric=><div key={metric} className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-xl border border-slate-100 bg-white p-3"><span className="break-words text-xs font-semibold leading-5 text-slate-700 sm:text-sm">{w[metric]}</span>{["home","away"].map(side=>{const value=stats[side]?.[metric];return <div key={side} className="min-w-0 text-center"><bdi className="font-mono text-base font-extrabold text-slate-900">{numeric(value?.mean)}{metric==="possession"&&value?.mean!=null?" %":""}</bdi><span className="mt-1 block text-[11px] leading-4 text-slate-500">{numeric(value?.n??0)} {w.sample}</span></div>;})}</div>)}</div>}
    {stats.referee && <p className="mt-3 text-sm text-slate-600">{w.referee} : <strong>{stats.referee}</strong></p>}
    {Object.keys(models).length>0 && <details className="mt-4 border-t border-orange-100 pt-3"><summary className="min-h-11 cursor-pointer py-2 font-bold text-slate-800">{w.models}</summary><p className="mt-2 text-xs leading-6 text-slate-600">{w.note}</p>{["corners","yellow_cards"].map(key=>{const model=models[key];if(!model)return null;return <article key={key} className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><h4 className="font-bold text-slate-800">{key==="corners"?w.cornersModel:w.cardsModel}</h4><p className="mt-1 text-xs text-slate-500">{numeric(model.sample??0)} {w.sample}</p>{model.status!=="observational_pilot"?<p className="mt-2 text-sm text-slate-500">{w.pending}</p>:<div className="mt-3 grid gap-2 sm:grid-cols-2">{(Array.isArray(model.lines)?model.lines:[]).map(line=><div key={line.line} className="rounded-lg bg-slate-50 p-3 text-sm leading-6"><div className="flex flex-wrap justify-between gap-2"><span>{w.over} {numeric(line.line)}</span><bdi className="font-bold">{numeric(line.over_probability)} %</bdi></div><div className="flex flex-wrap justify-between gap-2"><span>{w.under} {numeric(line.line)}</span><bdi className="font-bold">{numeric(line.under_probability)} %</bdi></div></div>)}</div>}</article>;})}<p className="mt-3 text-xs leading-6 text-slate-600">{w.cardsNote}</p></details>}
    <details className="mt-3 border-t border-slate-100 pt-3"><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-slate-600">{w.method}</summary><p className="mt-2 text-xs leading-6 text-slate-500">{w.source} : {stats.source||"API-Football"}</p>{stats.updated_at&&<p className="text-xs leading-6 text-slate-500">{w.updated} : {String(stats.updated_at).slice(0,10)}</p>}</details>
  </section>;
}







