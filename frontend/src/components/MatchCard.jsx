import api from "@/lib/api";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Radio, Lock, Clock, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { useLanguage, usePageLanguage, FollowPickButton } from "@/components/AppLayout";

const MATCH_MESSAGES = {
  "fr": {
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
  const color = bounded >= 82 ? "bg-green-500" : bounded >= 75 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      role="progressbar" aria-label={label} aria-valuenow={bounded} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${color} h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${bounded}%` }} />
    </div>
  );
}

function RiskBadge({ label }) {
  const { t } = useMatchLanguage();
  const presentation = {
    safe: ["🟢 SÛR", "bg-green-100 text-green-700 border-green-200"],
    value: ["🟡 MODÉRÉ", "bg-orange-100 text-orange-700 border-orange-200"],
    risky: ["🔴 RISQUÉ", "bg-red-100 text-red-700 border-red-200"],
  };
  const entry = Object.prototype.hasOwnProperty.call(presentation, label) ? presentation[label] : null;
  if (!entry) return null;
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-bold leading-5 ${entry[1]}`}>{t(entry[0])}</span>;
}

function MiniRiskDot({ label }) {
  const { t } = useMatchLanguage();
  const presentations = {
    safe: ["bg-green-500", "Pronostic à risque réduit"],
    value: ["bg-orange-400", "Pronostic à risque modéré"],
    risky: ["bg-red-400", "Pronostic risqué"],
  };
  const entry = Object.prototype.hasOwnProperty.call(presentations, label) ? presentations[label] : null;
  if (!entry) return null;
  return <span className="inline-flex shrink-0 items-center" title={t(entry[1])}>
    <span className={`inline-block h-2 w-2 rounded-full ${entry[0]}`} aria-hidden="true" />
    <span className="sr-only">{t(entry[1])}</span>
  </span>;
}

function SecondaryMarkets({ markets, primaryPick, primaryMarket, teams }) {
  const { t, formatNumber } = useMatchLanguage();
  if (!Array.isArray(markets)) return null;
  const seen = new Set();
  const secondary = markets.filter(market => {
    if (!market || typeof market.pick !== "string" || !market.pick.trim() || market.locked) return false;
    const isPrimary = market.pick === primaryPick && (!primaryMarket || !market.market_label || market.market_label === primaryMarket);
    if (isPrimary) return false;
    const key = JSON.stringify([market.market_key || market.market_label || "", market.pick]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 2);
  if (!secondary.length) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-orange-100 pt-3" data-testid="secondary-markets">
      <div className="text-xs font-bold uppercase leading-5 tracking-wide text-slate-500">{t("Autres marchés analysés")}</div>
      {secondary.map((market, index) => (
        <div key={JSON.stringify([market.market_key || market.market_label, market.pick, index])}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-lg bg-slate-50 p-2.5 text-sm">
          <div className="min-w-0 space-y-1">
            {market.market_label && <div className="break-words text-xs leading-5 text-slate-500">{translateBetText(market.market_label, t, formatNumber)}</div>}
            <div className="flex min-w-0 items-start gap-1.5">
              <span className="pt-1"><MiniRiskDot label={market.label} /></span>
              <span className="min-w-0 font-semibold leading-5 text-slate-700 [overflow-wrap:anywhere]">
                <bdi>{translateBetText(market.pick, t, formatNumber, teams)}</bdi>
              </span>
            </div>
          </div>
          <span className="font-mono font-bold tabular-nums text-slate-800" aria-label={t("Cote")}>
            <bdi>{formatOdds(market.pick_odds, formatNumber)}</bdi>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MatchCard({ match, isAdmin, isFree, onUpgrade }) {
  const { t, formatDate, formatNumber } = useMatchLanguage();
  const event = match || {};
  const pred = event.prediction || {};
  // Le statut provient de la source. Le temps écoulé seul ne suffit pas à
  // déduire un direct ou une fin de match, selon le sport et les reports.
  const isFinished = Boolean(pred.is_finished || event.is_finished || event.completed);
  const isLive = !isFinished && Boolean(pred.is_live || event.is_live);
  const unavailable = pred.analysis_status === "unavailable" || pred.has_prediction === false || (!pred.pick && !pred.locked);
  const locked = !unavailable && Boolean(pred.locked || (!pred.pick && isFree));
  const teams = [event.home_team, event.away_team];
  const confidence = finiteNumber(pred.confidence);
  const hasConfidence = confidence !== null && confidence >= 0 && confidence <= 100;
  const edge = finiteNumber(pred.edge);
  const borderClass = isLive ? "border-rose-300 ring-1 ring-rose-200"
    : isFinished ? "border-slate-200" : "border-orange-200/60";


  return (
    <Card className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none sm:p-5 ${borderClass}`} data-testid="match-card">
      <Link to={`/app/match/${event.id}`} className="block min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-4" data-testid="match-card-link">
        <div className="mb-3 flex min-h-7 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {isLive && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-xs font-black leading-5 text-white">
              <Radio className="h-3.5 w-3.5 motion-safe:animate-pulse" aria-hidden="true" />{t("LIVE")}
            </span>}
            {isFinished && <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold leading-5 text-slate-500">{t("TERMINÉ")}</span>}
          </div>
          {locked ? <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-100 px-2.5 py-1 text-xs font-bold leading-5 text-orange-700"><Lock className="h-3.5 w-3.5" aria-hidden="true" />PRO</span>
            : pred.label ? <RiskBadge label={pred.label} /> : null}
        </div>

        <div className="space-y-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
            <span className="min-w-0 flex-1 basis-32 [overflow-wrap:anywhere]"><bdi>{event.sport_title}</bdi></span>
            <time dateTime={event.commence_time || undefined} className="shrink-0 font-mono text-slate-700 tabular-nums"><bdi>{formatDate(event.commence_time, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</bdi></time>
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-3 sm:p-4">
            {[['home', event.home_team], ['away', event.away_team]].map(([side, name]) => <div key={side} className="flex min-w-0 items-center gap-3">
              <TeamBadge name={name} src={badgeUrl(event, side)} />
              <div className="min-w-0 flex-1 font-heading text-base font-bold leading-6 text-slate-900 [overflow-wrap:anywhere]"><bdi>{name || '—'}</bdi></div>
            </div>)}
          </div>

          {(isLive || isFinished) && pred.score_home != null && pred.score_away != null && (
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center" data-testid="match-score">
              <bdi className="font-mono text-xl font-bold tabular-nums text-slate-800">{formatScore(pred.score_home, formatNumber)} - {formatScore(pred.score_away, formatNumber)}</bdi>
              {isLive && <span className="text-xs font-bold text-rose-500">{t("EN DIRECT")}</span>}
            </div>
          )}

          {!locked && (pred.pick ? (
            <div className="space-y-3 rounded-2xl border border-orange-100 bg-orange-50/40 p-3 sm:p-4">
              {pred.market_label && <div className="break-words text-xs font-medium uppercase leading-5 tracking-wide text-slate-500">{translateBetText(pred.market_label, t, formatNumber)}</div>}
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-slate-500">{t("Pronostic")}</div>
                  <div className="text-base font-extrabold leading-6 text-orange-700 [overflow-wrap:anywhere]"><bdi>{translateBetText(pred.pick, t, formatNumber, teams)}</bdi></div>
                  {pred.best_bookmaker && <div className="mt-1 break-words text-xs leading-5 text-slate-500">{t("chez {{bookmaker}}", { bookmaker: pred.best_bookmaker })}</div>}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-end shadow-sm">
                  <div className="text-xs font-medium text-slate-500">{t("Cote")}</div>
                  <bdi className="font-mono text-2xl font-black tabular-nums text-slate-900">{formatOdds(pred.pick_odds, formatNumber)}</bdi>
                </div>
              </div>

              {hasConfidence && <div className="space-y-1.5" data-testid="match-confidence">
                <ConfidenceBar value={confidence} label={t("Confiance du moteur")} />
                <div className="flex flex-wrap justify-between gap-2 text-xs leading-5 text-slate-500">
                  <span>{t("Confiance du moteur")}</span>
                  <bdi className="font-bold text-slate-700">{formatNumber(confidence / 100, { style: "percent", maximumFractionDigits: 0 })}</bdi>
                </div>
              </div>}

              {edge !== null && edge > 0 && <div className="text-xs font-semibold leading-5 text-emerald-600" data-testid="match-edge">
                {t("Avantage estimé : {{edge}}", { edge: formatNumber(edge / 100, { style: "percent", signDisplay: "always", maximumFractionDigits: 1 }) })}
              </div>}

              {isFinished && <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-bold ${pred.won === true ? "border-emerald-200 bg-emerald-50 text-emerald-700" : pred.won === false ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}`} data-testid="match-result">
                {pred.won === true ? <><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />{t("GAGNÉ")}</>
                  : pred.won === false ? <><XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{t("PERDU")}</>
                    : <><Clock className="h-4 w-4 shrink-0" aria-hidden="true" />{t("En attente")}</>}
              </div>}

              <SecondaryMarkets markets={pred.markets} primaryPick={pred.pick} primaryMarket={pred.market_label} teams={teams} />
            </div>
          ) : <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6" data-testid="match-selection-unavailable"><p className="font-semibold text-slate-700">{t("Sélection indisponible")}</p><p className="mt-1 text-slate-500">{t("Aucune sélection exploitable dans les données reçues pour cette rencontre.")}</p></div>)}
        </div>
      </Link>

      {!locked && <FollowPickButton matchId={event.id} pick={pred.pick} market={pred.market} disabled={isFinished || isLive} />}

      {locked && <div className="mt-4 rounded-xl border border-dashed border-orange-200 bg-orange-50 p-3">
        <div className="mb-1 text-sm font-bold text-orange-700">{t("Pick verrouillé")}</div>
        {typeof onUpgrade === "function" ? <button type="button" onClick={eventClick => { eventClick.stopPropagation(); onUpgrade(); }}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg py-2 text-start text-sm font-semibold leading-5 text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" data-testid="match-upgrade">
          {t("Passe Pro pour voir l’analyse")}<ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
        </button> : <Link to="/app/abonnement" className="flex min-h-11 items-center justify-between gap-2 rounded-lg py-2 text-sm font-semibold leading-5 text-orange-700" data-testid="match-upgrade-link">
          {t("Passe Pro pour voir l’analyse")}<ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
        </Link>}
      </div>}

      {isAdmin && !locked && !unavailable && <AdminShareActions isAdmin={isAdmin} item={{ ...event, prediction: pred }} />}

    </Card>
  );
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
  const field = (label, value) => value !== null && value !== undefined && String(value).trim() ? `${label} : ${shareClean(value)}` : null;
  const header = `🎯 ${kind === "results" ? words.results : words.picks}\n${words.zone} : ${zone}\n${words.caption}`;
  const footer = `\n\n🌐 https://wnpulse.com\n${words.disclaimer}`;
  const blocks = items.filter(shareEligible).map((item, index) => {
    const p = item.prediction || item;
    const teams = [item.home_team, item.away_team];
    const odds = finiteNumber(p.pick_odds ?? p.odds);
    const confidence = finiteNumber(p.confidence);
    const value = item.commence_time || item.date;
    const date = value && Number.isFinite(new Date(value).getTime()) ? formatDate(value, {year:"numeric",month:"2-digit",day:"2-digit", ...(item.commence_time || /T\d{2}:\d{2}/.test(String(value)) ? {hour:"2-digit",minute:"2-digit"} : {})}) : words.unavailable;
    const status = String(p.status || item.status || "").toLowerCase();
    const result = ["won","lost","void"].includes(status) ? words[status] : p.won === true ? words.won : p.won === false ? words.lost : words.pending;
    return [ `${index + 1}. ${shareClean(item.match || teams.filter(Boolean).join(" vs ")) || words.unavailable}`,
      field(words.competition, item.league || item.sport_title || item.sport), field(words.date,date),
      field(words.market, p.market_label || p.market_key ? translateBetText(p.market_label || p.market_key,t,formatNumber,teams) : words.unavailable),
      field(words.pick,translateBetText(p.pick,t,formatNumber,teams)),
      field(words.odds, odds !== null && odds > 1 ? formatNumber(odds,{minimumFractionDigits:2,maximumFractionDigits:2}) : words.unavailable),
      field(words.risk, words[p.label] || words.unavailable),
      confidence !== null && confidence >= 0 && confidence <= 100 ? field(words.confidence,`${formatNumber(confidence,{maximumFractionDigits:0})}%`) : null,
      field(words.bookmaker,p.best_bookmaker), kind === "results" ? field(words.result,result) : null,
    ].filter(Boolean).join("\n");
  });
  // Whole selections stay together. A long batch becomes separate, explicitly numbered messages.
  const groups=[]; let current=[]; let length=0;
  const budget=1700-header.length-footer.length;
  for (const block of blocks) {
    if (current.length && length + block.length + 2 > budget) {groups.push(current);current=[];length=0;}
    current.push(block);length+=block.length+2;
  }
  if(current.length)groups.push(current);
  return groups.map((group,index)=>`${header}\n${words.part} ${index+1}/${groups.length}\n\n${group.join("\n\n")}${footer}`);
}
function ShareComposer({ items, kind, onClose }) {
  const words=useAdminShareLanguage();
  const helpers=useMatchLanguage();
  const messages=buildShareMessages(items,kind,words,helpers);
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
    <p className="my-3 text-xs leading-5 text-slate-500">{words.hint}</p>
    <div className="mb-2 flex flex-wrap gap-2" aria-label={words.part}>{messages.map((message,index)=><button type="button" key={index} aria-pressed={part===index} onClick={()=>{setPart(index);setCopied("");}} className={`${SHARE_BUTTON} ${part===index ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200"}`}>{words.part} {index+1}/{messages.length}</button>)}</div>
    <label className="sr-only" htmlFor="admin-share-text">{words.preview}</label><textarea id="admin-share-text" readOnly value={current} dir="auto" className="h-72 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6" />
    <div className="mt-3 flex flex-wrap gap-2">
      <a href={`https://wa.me/?text=${encodeURIComponent(current)}`} target="_blank" rel="noopener noreferrer" className={`${SHARE_BUTTON} border-green-600 bg-green-600 text-white`} data-testid="admin-share-whatsapp">WhatsApp ↗</a>
      <a href={`https://t.me/share/url?url=${encodeURIComponent("https://wnpulse.com")}&text=${encodeURIComponent(current)}`} target="_blank" rel="noopener noreferrer" className={`${SHARE_BUTTON} border-sky-600 bg-sky-600 text-white`} data-testid="admin-share-telegram">Telegram ↗</a>
      <button type="button" className={`${SHARE_BUTTON} border-slate-200`} onClick={async()=>{try{await navigator.clipboard.writeText(current);setCopied(words.copied);}catch{setCopied(words.copyError);}}}>{words.copy}</button>
    </div><p className="mt-2 text-xs text-slate-500" role="status">{copied}</p>
  </dialog>;
}
export function AdminShareProvider({isAdmin,items=[],kind="picks",children}) {
  const [selection,setSelection]=useState([]);
  const [individual,setIndividual]=useState(null);
  const [bulkOpen,setBulkOpen]=useState(false);
  const [owner,setOwner]=useState(null);
  const {user}=useAuth();
  const userId=user?.id;
  const permitted=Boolean(isAdmin && user?.is_admin);
  const available=new Map();
  if(permitted)items.filter(shareEligible).forEach(item=>available.set(shareItemKey(item),item));
  const keys=owner===userId ? selection.filter(key=>available.has(key)) : [];
  const signature=JSON.stringify(Array.from(available, ([key,item])=>{
    const prediction=item.prediction || item;
    return [key,prediction.confidence,prediction.label,prediction.best_bookmaker,prediction.status,prediction.won,prediction.score_home,prediction.score_away,item.league,item.sport_title,item.match];
  }));
  useEffect(()=>{
    const validKeys=new Set(JSON.parse(signature).map(row=>row[0]));
    setSelection(previous=>previous.filter(key=>validKeys.has(key)));setBulkOpen(false);setIndividual(null);
    // Source changes invalidate the preview; no stale pick or previous page is shared.
  },[signature,userId]);
  const selected=keys.map(key=>available.get(key));
  const context={permitted,kind,available,keys,selected,
    toggle(key){setOwner(userId);setSelection(keys.includes(key)?keys.filter(value=>value!==key):keys.length<20?[...keys,key]:keys);},
    selectAll(){setOwner(userId);setSelection(Array.from(available.keys()).slice(0,20));},
    clear(){setSelection([]);},open(item){setIndividual(item);setBulkOpen(false);},openBulk(){if(selected.length){setIndividual(null);setBulkOpen(true);}}
  };
  const preview=individual ? [individual] : bulkOpen ? selected : [];
  return <AdminShareContext.Provider value={context}>{children}{permitted && preview.length>0 && <ShareComposer key={JSON.stringify(preview.map(shareItemKey))} items={preview} kind={kind} onClose={()=>{setIndividual(null);setBulkOpen(false);}} />}</AdminShareContext.Provider>;
}
export function AdminShareToolbar() {
  const context=useContext(AdminShareContext),words=useAdminShareLanguage();
  if(!context?.permitted)return null;
  return <section className="my-3 rounded-xl border border-orange-200 bg-orange-50 p-3" aria-label={words.admin} data-testid="admin-share-toolbar">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-slate-900">{words.admin}</h2><span className="text-xs font-semibold text-orange-700" aria-live="polite">{context.keys.length}/20 {words.selected}</span></div>
    <p className="mt-1 text-xs leading-5 text-slate-600">{words.scope} {context.kind==="results" ? words.page : ""}</p>
    <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={context.selectAll} disabled={!context.available.size} className={`${SHARE_BUTTON} border-orange-200 bg-white`}>{words.all}</button><button type="button" onClick={context.clear} disabled={!context.keys.length} className={`${SHARE_BUTTON} border-orange-200 bg-white`}>{words.clear}</button><button type="button" onClick={context.openBulk} disabled={!context.keys.length} className={`${SHARE_BUTTON} border-orange-600 bg-orange-600 text-white`} data-testid="admin-share-bulk">{words.preview}</button></div>
  </section>;
}
export function AdminShareActions({item,isAdmin,kind="picks"}) {
  const context=useContext(AdminShareContext),words=useAdminShareLanguage();
  const {user}=useAuth();
  const [preview,setPreview]=useState(false);
  if(!isAdmin || !user?.is_admin || !shareEligible(item))return null;
  const key=shareItemKey(item),selectable=context?.permitted && context.available.has(key);
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

export function badgeUrl(match, side) {
  const candidates = [match?.[`${side}_logo`], match?.[`${side}_team_logo`], match?.[`${side}_crest`], match?.[`${side}Team`]?.crest];
  return candidates.find(value => {
    if (typeof value !== "string") return false;
    try { const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { return false; }
  }) || null;
}

function teamInitials(name) {
  return String(name || "").trim().split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).slice(0,2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase() || "•";
}

export function TeamBadge({ name = "", src, size = "small" }) {
  const [failed, setFailed] = useState(null);
  let url = null;
  try { const parsed = new URL(src); if (parsed.protocol === "https:" && !parsed.username && !parsed.password) url = src; } catch {}
  const initials = teamInitials(name);
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white font-black text-slate-500 shadow-sm ${size === "large" ? "h-16 w-16 rounded-2xl text-xl sm:h-20 sm:w-20" : "h-10 w-10 rounded-xl text-xs"}`}>
    {url && failed !== url ? <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(url)} className="h-full w-full object-contain p-1.5" /> : initials}
  </span>;
}

const METRICS = [["played",7],["wins",8],["draws",9],["losses",10],["goals_for",11],["goals_against",12],["over25",13,"%"],["btts",14,"%"],["clean_sheets",15,"%"],["scored",16,"%"]];
export function MatchInsights({ match }) {
  const i18n = usePageLanguage();
  const words = LABELS[i18n.language] || LABELS.fr;
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
  const home = data?.home?.[venue ? "venue":"overall"] || {};
  const away = data?.away?.[venue ? "venue":"overall"] || {};
  const form = rows => <div className="flex flex-wrap gap-1.5">{(rows || []).map((v,index) => <span key={index} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-extrabold ${v==="W" ? "bg-emerald-100 text-emerald-800" : v==="D" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`} title={words[v==="W" ? 8 : v==="D" ? 9 : 10]}>{words[v==="W" ? 38 : v==="D" ? 39 : 40]}</span>)}</div>;
  const history = rows => !rows?.length ? <p className="p-4 text-sm text-slate-500">{words[35]}</p> : <div className="divide-y divide-slate-100">{rows.map((r,index) => <article key={`${r.id}-${index}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm">
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
          <div className="mb-4 flex flex-wrap gap-2">{[false,true].map(v=><button key={String(v)} type="button" onClick={()=>setVenue(v)} aria-pressed={venue===v} className={`min-h-11 rounded-xl border px-3 text-xs font-semibold ${venue===v ? "border-orange-300 bg-orange-50 text-orange-800":"border-slate-200 text-slate-600"}`}>{words[v?6:5]}</button>)}</div>
          <div className="grid grid-cols-2 gap-3">{[[match.home_team,home, "home"],[match.away_team,away,"away"]].map(([name,summary,side])=><div key={side} className="min-w-0 rounded-xl bg-slate-50 p-3"><div className="mb-2 min-w-0 space-y-2"><TeamBadge name={name} src={badgeUrl(match,side)} /><p className="min-w-0 text-sm font-bold leading-6 text-slate-900 [overflow-wrap:anywhere]"><bdi>{name}</bdi></p></div>{form(summary.form)}<p className="mt-2 text-xs leading-5 text-slate-500">{words[7]} : {number(summary.played)}</p></div>)}</div>
          <p className="my-3 text-xs text-slate-500">{words[31]}</p>
          <table className="w-full table-fixed text-sm" data-testid="match-comparison-table"><caption className="sr-only">{words[2]}: {match.home_team} / {match.away_team}</caption><thead><tr className="border-b border-slate-200"><th scope="col" className="w-[46%] py-3 text-start text-xs font-semibold text-slate-500">{words[17]}</th><th scope="col" className="break-words px-1 py-3 text-center text-xs"><abbr title={match.home_team} className="no-underline sm:hidden">{teamInitials(match.home_team)}</abbr><span className="hidden sm:inline">{match.home_team}</span></th><th scope="col" className="break-words px-1 py-3 text-center text-xs"><abbr title={match.away_team} className="no-underline sm:hidden">{teamInitials(match.away_team)}</abbr><span className="hidden sm:inline">{match.away_team}</span></th></tr></thead><tbody>{METRICS.map(([key,index,suffix])=><tr key={key} className="border-b border-slate-100 last:border-0"><th scope="row" className="break-words py-3 pe-2 text-start text-xs font-medium leading-5 text-slate-600 sm:text-sm">{words[index]}</th><td className="px-1 py-3 text-center font-mono font-bold tabular-nums text-slate-900">{number(home[key],suffix)}</td><td className="px-1 py-3 text-center font-mono font-bold tabular-nums text-slate-900">{number(away[key],suffix)}</td></tr>)}</tbody></table>
        </>}
        {tab === "recent" && <div className="grid min-w-0 gap-6 lg:grid-cols-2">{[[match.home_team,data.home?.recent],[match.away_team,data.away?.recent]].map(([name,rows],index)=><div key={index} className="min-w-0"><h3 className="mb-2 break-words text-base font-extrabold text-slate-900">{name}</h3>{history(rows)}</div>)}</div>}
        {tab === "h2h" && <><p className="mb-3 text-sm leading-6 text-slate-500">{words[37]}</p>{data.h2h?.length ? history(data.h2h) : <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{words[26]}</p>}</>}
        <p className="mt-4 rounded-xl bg-orange-50 p-3 text-xs leading-5 text-orange-900">{words[27]}</p><p className="mt-3 text-xs leading-5 text-slate-500">{words[33]}</p>
        <footer className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500"><span>{words[28]} : {data.source}</span><span>{words[29]} : {date(data.updated_at)}</span></footer>
      </div>
    </>}
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
