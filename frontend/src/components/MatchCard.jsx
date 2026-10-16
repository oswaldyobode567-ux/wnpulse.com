import { useCallback } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Radio, Lock, Send, Clock, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { useLanguage, FollowPickButton } from "@/components/AppLayout";

const MATCH_MESSAGES = {
  "fr": {
    "🟢 SÛR": "🟢 SÛR",
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
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3" data-testid="secondary-markets">
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

export default function MatchCard({ match, isAdmin, onShareWA, isFree, onUpgrade }) {
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
  const canShare = Boolean(isAdmin && pred.pick && !locked && typeof onShareWA === "function");
  const borderClass = isLive ? "border-rose-300 ring-1 ring-rose-200"
    : isFinished ? "border-slate-200" : "border-orange-200/60";
  const handleShare = eventClick => {
    eventClick.preventDefault();
    eventClick.stopPropagation();
    if (canShare) onShareWA({ ...event, ...pred, id: event.id, home_team: event.home_team, away_team: event.away_team,
      commence_time: event.commence_time, sport_title: event.sport_title }, eventClick);
  };

  return (
    <Card className={`flex h-full min-w-0 flex-col border bg-white p-4 transition-shadow hover:shadow-md sm:p-5 ${borderClass}`} data-testid="match-card">
      <Link to={`/app/match/${event.id}`} className="block min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-4" data-testid="match-card-link">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs font-medium leading-5 text-slate-500">
            <span className="min-w-0 flex-1 basis-32 [overflow-wrap:anywhere]"><bdi>{event.sport_title}</bdi></span>
            <time dateTime={event.commence_time || undefined} className="font-mono tabular-nums"><bdi>{formatDate(event.commence_time, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</bdi></time>
          </div>

          <div className="min-w-0">
            <div className="font-heading text-base font-bold leading-6 text-slate-900 [overflow-wrap:anywhere]"><bdi>{event.home_team}</bdi></div>
            <div className="my-1 text-xs text-slate-400" aria-hidden="true">vs</div>
            <div className="font-heading text-base font-bold leading-6 text-slate-900 [overflow-wrap:anywhere]"><bdi>{event.away_team}</bdi></div>
          </div>

          {(isLive || isFinished) && pred.score_home != null && pred.score_away != null && (
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center" data-testid="match-score">
              <bdi className="font-mono text-xl font-bold tabular-nums text-slate-800">{formatScore(pred.score_home, formatNumber)} - {formatScore(pred.score_away, formatNumber)}</bdi>
              {isLive && <span className="text-xs font-bold text-rose-500">{t("EN DIRECT")}</span>}
            </div>
          )}

          {!locked && (pred.pick ? (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              {pred.market_label && <div className="break-words text-xs font-medium uppercase leading-5 tracking-wide text-slate-500">{translateBetText(pred.market_label, t, formatNumber)}</div>}
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-slate-500">{t("Pronostic")}</div>
                  <div className="text-base font-bold leading-6 text-orange-600 [overflow-wrap:anywhere]"><bdi>{translateBetText(pred.pick, t, formatNumber, teams)}</bdi></div>
                  {pred.best_bookmaker && <div className="mt-1 break-words text-xs leading-5 text-slate-500">{t("chez {{bookmaker}}", { bookmaker: pred.best_bookmaker })}</div>}
                </div>
                <div className="text-end">
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

      {canShare && <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
        <button type="button" onClick={handleShare} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-sm transition-colors hover:bg-[#1ebe5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          title={t("Partager WhatsApp (Admin)")} aria-label={t("Partager WhatsApp (Admin)")} data-testid="match-share">
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>}
    </Card>
  );
}
