import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import AppLayout, { useLanguage, usePageLanguage, useExperienceCopy, useExperiencePreferences, useFollowedPicks, useExperienceEvent, StadiumBackdrop } from "@/components/AppLayout";
import MatchCard, { AdminShareProvider, AdminShareToolbar, TeamBadge, badgeUrl, MediaCredits } from "@/components/MatchCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Trophy,  ChevronRight, Activity, 
  Sparkles, Radio,  CheckCircle2, XCircle,
  Clock, TrendingUp, RefreshCw, Filter, ShieldCheck, Search, X, ArrowRight, Layers, SlidersHorizontal, Bookmark, CalendarDays
} from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeMatches } from "@/services/realtimeService";
import { toast } from "sonner";


const DISCOVERY_COPY = {
  fr: {title:"Découvre WinPulse : 3 pronostics à venir",intro:"Les aperçus se renouvellent au coup d’envoi, selon les marchés disponibles dans les prochaines 48 heures.",pro:"À découvrir avec Pro",reserved:"pronostics réservés actuellement",cta:"Débloquer les pronostics et leurs analyses",offer:"Tu viens de découvrir une analyse WinPulse",offerText:"Accède aux autres sélections et aux marchés analysés inclus dans ton abonnement.",empty:"Les sélections du jour ne sont pas encore disponibles. Reviens un peu plus tard.",error:"Impossible de charger la sélection découverte.",retry:"Réessayer",pending:"Résultat non confirmé",won:"Gagné",lost:"Perdu",void:"Remboursé",count:"sélection(s) disponible(s)",note:"Heures affichées dans ton fuseau. Journée découverte : Africa/Porto-Novo.",noGuarantee:"Aucun gain garanti. Consulte le track record pour les résultats gagnants et perdants.",follow:"Suis ces sélections depuis leur carte pour retrouver leurs résultats.",unavailable:"Aucune sélection exploitable pour cette rencontre actuellement."},
  en: {title:"Discover WinPulse: 3 upcoming picks",intro:"Previews renew at kickoff, subject to available markets over the next 48 hours.",pro:"Discover with Pro",reserved:"predictions currently reserved",cta:"Unlock predictions and their analysis",offer:"You have explored a WinPulse analysis",offerText:"Access the other selections and analysed markets included in your subscription.",empty:"Today's selections are not available yet. Check back later.",error:"Unable to load the discovery selection.",retry:"Try again",pending:"Result unconfirmed",won:"Won",lost:"Lost",void:"Refunded",count:"selection(s) available",note:"Times shown in your time zone. Discovery day: Africa/Porto-Novo.",noGuarantee:"No guaranteed winnings. Check the track record for wins and losses.",follow:"Follow these selections from their cards to find their results.",unavailable:"No usable selection is currently available for this fixture."},
  es: {title:"Descubre WinPulse: 3 próximos pronósticos",intro:"Las vistas previas se renuevan al inicio, según los mercados de las próximas 48 horas.",pro:"Descubre Pro",reserved:"pronósticos reservados actualmente",cta:"Desbloquear pronósticos y análisis",offer:"Has descubierto un análisis WinPulse",offerText:"Accede a las demás selecciones y mercados analizados incluidos en tu suscripción.",empty:"Las selecciones de hoy aún no están disponibles. Vuelve más tarde.",error:"No se pudo cargar la selección gratuita.",retry:"Reintentar",pending:"Resultado sin confirmar",won:"Ganado",lost:"Perdido",void:"Reembolsado",count:"selección(es) disponible(s)",note:"Horarios en tu zona. Día de selección: Africa/Porto-Novo.",noGuarantee:"Sin ganancias garantizadas. Consulta aciertos y pérdidas en el historial.",follow:"Sigue las selecciones desde sus tarjetas para consultar los resultados.",unavailable:"No hay ninguna selección disponible para este partido actualmente."},
  pt: {title:"Descobre a WinPulse: 3 próximos palpites",intro:"As prévias renovam-se no início dos jogos, conforme os mercados das próximas 48 horas.",pro:"Descobre o Pro",reserved:"palpites reservados atualmente",cta:"Desbloquear palpites e análises",offer:"Acabaste de descobrir uma análise WinPulse",offerText:"Acede às outras seleções e mercados analisados incluídos na tua subscrição.",empty:"As seleções de hoje ainda não estão disponíveis. Volta mais tarde.",error:"Não foi possível carregar a seleção gratuita.",retry:"Tentar novamente",pending:"Resultado não confirmado",won:"Ganho",lost:"Perdido",void:"Reembolsado",count:"seleção(ões) disponível(is)",note:"Horários no teu fuso. Dia de seleção: Africa/Porto-Novo.",noGuarantee:"Sem ganhos garantidos. Consulta ganhos e perdas no histórico.",follow:"Segue as seleções nos cartões para consultar os resultados.",unavailable:"Não existe uma seleção disponível para este jogo neste momento."},
  de: {title:"WinPulse entdecken: 3 kommende Tipps",intro:"Vorschauen erneuern sich beim Anpfiff, je nach verfügbaren Märkten der nächsten 48 Stunden.",pro:"Mit Pro entdecken",reserved:"derzeit reservierte Tipps",cta:"Tipps und Analysen freischalten",offer:"Du hast eine WinPulse-Analyse entdeckt",offerText:"Erhalte die weiteren Tipps und analysierten Märkte deines Abonnements.",empty:"Die heutigen Tipps sind noch nicht verfügbar. Schau später wieder vorbei.",error:"Die kostenlose Auswahl konnte nicht geladen werden.",retry:"Erneut versuchen",pending:"Ergebnis unbestätigt",won:"Gewonnen",lost:"Verloren",void:"Erstattet",count:"verfügbare Tipps",note:"Zeiten in deiner Zeitzone. Auswahltag: Africa/Porto-Novo.",noGuarantee:"Keine garantierten Gewinne. Siege und Niederlagen stehen im Track Record.",follow:"Verfolge die Tipps über ihre Karten, um Ergebnisse zu sehen.",unavailable:"Für dieses Spiel ist derzeit kein nutzbarer Tipp verfügbar."},
  ar: {title:"اكتشف WinPulse: 3 توقعات قادمة",intro:"تتجدد المعاينات عند بداية المباراة حسب الأسواق المتاحة خلال 48 ساعة.",pro:"اكتشف اشتراك Pro",reserved:"توقعات متاحة للمشتركين حاليًا",cta:"افتح التوقعات وتحليلاتها",offer:"لقد اكتشفت تحليلًا من WinPulse",offerText:"اطلع على الاختيارات الأخرى والأسواق المحللة ضمن اشتراكك.",empty:"اختيارات اليوم غير متاحة بعد. عد لاحقًا.",error:"تعذر تحميل الاختيارات المجانية.",retry:"إعادة المحاولة",pending:"النتيجة غير مؤكدة",won:"فائز",lost:"خاسر",void:"مسترد",count:"اختيارات متاحة",note:"الأوقات بتوقيتك المحلي. يوم الاختيارات: Africa/Porto-Novo.",noGuarantee:"لا توجد أرباح مضمونة. راجع النتائج الفائزة والخاسرة في السجل.",follow:"تابع الاختيارات من بطاقاتها لعرض نتائجها.",unavailable:"لا يوجد توقع متاح لهذه المباراة حاليًا."}
};
function discoveryCopy(language) { return DISCOVERY_COPY[language] || DISCOVERY_COPY.fr; }
function discoveryEvent(event, surface) {
  api.post("/discovery/events", { event, surface }).catch(() => {});
}


function FreeDiscoveryPanel({ user, lastUpdate, onUpgrade, compact = false }) {
  const { language } = useLanguage();
  const words = discoveryCopy(language);
  const owner = user?.id || "anonymous";
  const [state, setState] = useState({ owner: null, data: null });
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const data = state.owner === owner ? state.data : null;
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setRetry(value => value + 1); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError(false);
    api.get("/discovery", { signal: controller.signal, timeout: 15000 }).then(response => {
      if (!active) return;
      if (!Array.isArray(response.data?.items)) throw new Error("Invalid discovery payload");
      setState({ owner, data: response.data });
      if (user?.id && !response.data.paid) discoveryEvent("view", "dashboard");
    }).catch(() => { if (active && !controller.signal.aborted) setError(true); });
    return () => { active = false; controller.abort(); };
  }, [owner, user?.id, lastUpdate, retry]);
  if (data?.paid || user?.is_admin) return null;
  const upgrade = () => { if (user?.id) discoveryEvent("upgrade_click", "dashboard"); onUpgrade(); };
  const items = data?.items || [];
  return <section className="min-w-0 space-y-4 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50/70 to-white p-3 sm:p-5" data-testid="free-discovery-panel">
    <div><p className="text-xs font-bold uppercase tracking-wider text-orange-700">WinPulse · Free</p><h2 className="mt-1 font-heading text-lg font-extrabold leading-snug text-slate-900 sm:text-2xl">{words.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{words.intro}</p></div>
    {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">{words.error}<Button variant="outline" className="ms-3 min-h-11" onClick={()=>setRetry(value=>value+1)}>{words.retry}</Button></div> : !data ? <Skeleton className="h-48 rounded-xl" /> : <>
      <p className="text-xs font-semibold text-slate-600" role="status">{data.date} · {items.length}/3 {words.count}</p>
      {items.length ? <div className="grid min-w-0 gap-3 md:grid-cols-3">{items.map(match=><div key={match.id} className="min-w-0"><div className="min-w-0"><MatchCard match={match} isFree={true} isAdmin={false} onUpgrade={upgrade} /></div></div>)}</div> : <p className="rounded-xl bg-white p-4 text-sm leading-6 text-slate-600">{words.empty}</p>}
      <p className="text-xs leading-5 text-slate-500">{words.note} {words.follow}</p>
      {Number(data.locked_count)>0 && <div className="space-y-3 border-t border-orange-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-heading text-base font-bold text-slate-900">{words.pro}</h3><span className="text-sm text-slate-600">{data.locked_count} {words.reserved}</span></div>{!compact && <div className="grid min-w-0 gap-3 md:grid-cols-3">{(data.preview || []).slice(0,3).map(match=><MatchCard key={match.id} match={match} isFree={true} isAdmin={false} onUpgrade={upgrade} />)}</div>}<Button onClick={upgrade} className="h-auto min-h-11 w-full whitespace-normal bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 sm:w-auto">{words.cta}</Button></div>}
    </>}
    <p className="text-xs leading-5 text-slate-500">18+ · {words.noGuarantee}</p>
  </section>;
}


// Catalogue local : aucun remplacement supplémentaire d’AppLayout n’est requis.
// Les autres écrans continuent d’utiliser le même choix global de langue.
const DASHBOARD_MESSAGES = {
  "fr": {
    "Tous": "Tous",
    "Football": "Football",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Hockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Tous les marchés": "Tous les marchés",
    "🏆 Victoire": "🏆 Victoire",
    "🔄 Double chance": "🔄 Double chance",
    "📈 Plus de 2,5 buts": "📈 Plus de 2,5 buts",
    "🎯 Les deux équipes marquent": "🎯 Les deux équipes marquent",
    "⚖️ Handicap": "⚖️ Handicap",
    "🟨 Cartons": "🟨 Cartons",
    "📐 Corners": "📐 Corners",
    "⏱ Mi-temps": "⏱ Mi-temps",
    "Tous les niveaux": "Tous les niveaux",
    "🟢 Sûr": "🟢 Sûr",
    "🟡 Modéré": "🟡 Modéré",
    "🔴 Risqué": "🔴 Risqué",
    "🟢 SÛR": "🟢 SÛR",
    "🟡 MODÉRÉ": "🟡 MODÉRÉ",
    "🔴 RISQUÉ": "🔴 RISQUÉ",
    "Autre": "Autre",
    "Chargement des pronostics…": "Chargement des pronostics…",
    "Aucun pick disponible actuellement": "Aucun pick disponible actuellement",
    "Accès gratuit · Passe Pro pour débloquer les picks réservés": "Accès gratuit · Passe Pro pour débloquer les picks réservés",
    "{{plan}} actif · Tous les picks disponibles": "{{plan}} actif · Tous les picks disponibles",
    "Tes pronostics, en un coup d’œil 🎯": "Tes pronostics, en un coup d’œil 🎯",
    "Picks disponibles": "Picks disponibles",
    "En direct": "En direct",
    "Actualiser les données": "Actualiser les données",
    "Actualisation en cours…": "Actualisation en cours…",
    "Données mises à jour": "Données mises à jour",
    "Impossible d’actualiser les données. Réessaie dans un instant.": "Impossible d’actualiser les données. Réessaie dans un instant.",
    "Rechercher une rencontre": "Rechercher une rencontre",
    "Équipe, championnat, pays, sport ou marché…": "Équipe, championnat, pays, sport ou marché…",
    "Effacer la recherche": "Effacer la recherche",
    "Exemples : Espagne, Ligue 1, Atlético, PSG, plus de 2.5. La recherche se combine avec les filtres sport, marché et risque.": "Exemples : Espagne, Ligue 1, Atlético, PSG, plus de 2.5. La recherche se combine avec les filtres sport, marché et risque.",
    "{{count}} rencontre trouvée dans les matchs chargés.": "{{count}} rencontre trouvée dans les matchs chargés.",
    "{{count}} rencontres trouvées dans les matchs chargés.": "{{count}} rencontres trouvées dans les matchs chargés.",
    "À la une": "À la une",
    "Confiance du moteur": "Confiance du moteur",
    "Tout voir": "Tout voir",
    "Aucune sélection à la une pour cette recherche.": "Aucune sélection à la une pour cette recherche.",
    "Aucune sélection à la une pour le moment.": "Aucune sélection à la une pour le moment.",
    "Consulte aussi les résultats par championnat ci-dessous.": "Consulte aussi les résultats par championnat ci-dessous.",
    "Les sélections apparaîtront dès qu’elles seront disponibles.": "Les sélections apparaîtront dès qu’elles seront disponibles.",
    "Impossible de charger les sélections à la une.": "Impossible de charger les sélections à la une.",
    "Réessayer": "Réessayer",
    "LIVE": "LIVE",
    "Verrouillé": "Verrouillé",
    "Passe Pro pour débloquer": "Passe Pro pour débloquer",
    "Pronostic": "Pronostic",
    "Cote": "Cote",
    "chez {{bookmaker}}": "chez {{bookmaker}}",
    "Partager sur WhatsApp": "Partager sur WhatsApp",
    "🎯 Confiance : {{confidence}}%": "🎯 Confiance : {{confidence}}%",
    "💳 Pro dès {{price}} · Paiement mobile": "💳 Pro dès {{price}} · Paiement mobile",
    "WhatsApp ouvert !": "WhatsApp ouvert !",
    "Débloque tous les pronostics.": "Débloque tous les pronostics.",
    "{{count}} pick réservé actuellement · Analyses · Combos · Super Combos": "{{count}} pick réservé actuellement · Analyses · Combos · Super Combos",
    "{{count}} picks réservés actuellement · Analyses · Combos · Super Combos": "{{count}} picks réservés actuellement · Analyses · Combos · Super Combos",
    "Passer Pro · {{price}}": "Passer Pro · {{price}}",
    "Matchs par championnat": "Matchs par championnat",
    "Aucune rencontre ne correspond à cette recherche et aux filtres.": "Aucune rencontre ne correspond à cette recherche et aux filtres.",
    "Aucun match pour ce filtre": "Aucun match pour ce filtre",
    "Essaie un nom d’équipe, un pays ou un championnat, ou retire les filtres.": "Essaie un nom d’équipe, un pays ou un championnat, ou retire les filtres.",
    "Réinitialiser les filtres": "Réinitialiser les filtres",
    "Voir {{count}} championnats supplémentaires": "Voir {{count}} championnats supplémentaires",
    "Picks validés": "Picks validés",
    "Track record": "Track record",
    "Aujourd’hui ({{date}})": "Aujourd’hui ({{date}})",
    "Cette semaine · hors aujourd’hui": "Cette semaine · hors aujourd’hui",
    "Aucun pick pour cette période.": "Aucun pick pour cette période.",
    "Gagnés": "Gagnés",
    "Perdus": "Perdus",
    "En attente": "En attente",
    "{{rate}} de réussite": "{{rate}} de réussite",
    "Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.": "Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.",
    "Les 15 premiers picks sont affichés. Consulte le track record pour la suite.": "Les 15 premiers picks sont affichés. Consulte le track record pour la suite.",
    "Voir le track record": "Voir le track record",
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
    "Accessibles avec ton compte": "Accessibles avec ton compte",
    "Trouve ton prochain match": "Trouve ton prochain match",
    "Recherche une équipe ou explore les championnats. Les filtres se combinent.": "Recherche une équipe ou explore les championnats. Les filtres se combinent.",
    "Sport": "Sport",
    "Marché": "Marché",
    "Niveau de risque": "Niveau de risque",
    "Affiner les résultats": "Affiner les résultats",
    "Filtres actifs": "Filtres actifs",
    "Effacer les filtres": "Effacer les filtres",
    "Retirer le filtre {{filter}}": "Retirer le filtre {{filter}}",
    "{{count}} filtres avancés actifs": "{{count}} filtres avancés actifs",
    "Sélections à la une": "Sélections à la une",
    "Ouvrir la sélection": "Ouvrir la sélection",
    "Explorer les rencontres": "Explorer les rencontres",
    "{{count}} rencontres · {{leagues}} championnats": "{{count}} rencontres · {{leagues}} championnats",
    "Trier les matchs": "Trier les matchs",
    "Par horaire": "Par horaire",
    "Par confiance": "Par confiance",
    "Par cote": "Par cote",
    "Le tri s’applique dans chaque championnat et utilise les données accessibles avec ton compte.": "Le tri s’applique dans chaque championnat et utilise les données accessibles avec ton compte.",
    "{{shown}} championnats affichés sur {{total}}": "{{shown}} championnats affichés sur {{total}}",
    "Voir {{count}} autres rencontres": "Voir {{count}} autres rencontres",
    "Réduire cette liste": "Réduire cette liste",
    "Résultats récents": "Résultats récents",
    "Déplier pour consulter les résultats de la période.": "Déplier pour consulter les résultats de la période.",
    "{{count}} pronostics sur la période": "{{count}} pronostics sur la période",
    "Plus de sélections avec Pro": "Plus de sélections avec Pro",
    "{{count}} pronostics réservés aux abonnés actuellement.": "{{count}} pronostics réservés aux abonnés actuellement.",
    "{{price}} / 30 jours": "{{price}} / 30 jours",
    "Découvrir Pro": "Découvrir Pro"
  },
  "en": {
    "Tous": "All",
    "Football": "Football",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Hockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Tous les marchés": "All markets",
    "🏆 Victoire": "🏆 Winner",
    "🔄 Double chance": "🔄 Double chance",
    "📈 Plus de 2,5 buts": "📈 Over 2.5 goals",
    "🎯 Les deux équipes marquent": "🎯 Both teams to score",
    "⚖️ Handicap": "⚖️ Handicap",
    "🟨 Cartons": "🟨 Cards",
    "📐 Corners": "📐 Corners",
    "⏱ Mi-temps": "⏱ Half-time",
    "Tous les niveaux": "All risk levels",
    "🟢 Sûr": "🟢 Lower risk",
    "🟡 Modéré": "🟡 Moderate",
    "🔴 Risqué": "🔴 Higher risk",
    "🟢 SÛR": "🟢 LOWER RISK",
    "🟡 MODÉRÉ": "🟡 MODERATE",
    "🔴 RISQUÉ": "🔴 HIGHER RISK",
    "Autre": "Other",
    "Chargement des pronostics…": "Loading predictions…",
    "Aucun pick disponible actuellement": "No picks available right now",
    "Accès gratuit · Passe Pro pour débloquer les picks réservés": "Free access · Upgrade to Pro to unlock reserved picks",
    "{{plan}} actif · Tous les picks disponibles": "{{plan}} active · All available picks",
    "Tes pronostics, en un coup d’œil 🎯": "Your predictions at a glance 🎯",
    "Picks disponibles": "Available picks",
    "En direct": "Live",
    "Actualiser les données": "Refresh data",
    "Actualisation en cours…": "Refreshing…",
    "Données mises à jour": "Data updated",
    "Impossible d’actualiser les données. Réessaie dans un instant.": "Unable to refresh data. Try again shortly.",
    "Rechercher une rencontre": "Find a match",
    "Équipe, championnat, pays, sport ou marché…": "Team, league, country, sport or market…",
    "Effacer la recherche": "Clear search",
    "Exemples : Espagne, Ligue 1, Atlético, PSG, plus de 2.5. La recherche se combine avec les filtres sport, marché et risque.": "Examples: Spain, Ligue 1, Atlético, PSG, over 2.5. Combine your search with sport, market and risk filters.",
    "{{count}} rencontre trouvée dans les matchs chargés.": "{{count}} match found in the loaded matches.",
    "{{count}} rencontres trouvées dans les matchs chargés.": "{{count}} matches found in the loaded matches.",
    "À la une": "Highlights",
    "Confiance du moteur": "Engine confidence",
    "Tout voir": "View all",
    "Aucune sélection à la une pour cette recherche.": "No highlighted picks match this search.",
    "Aucune sélection à la une pour le moment.": "No highlighted picks right now.",
    "Consulte aussi les résultats par championnat ci-dessous.": "Browse matches by league below too.",
    "Les sélections apparaîtront dès qu’elles seront disponibles.": "Picks will appear as soon as they are available.",
    "Impossible de charger les sélections à la une.": "Unable to load highlighted picks.",
    "Réessayer": "Try again",
    "LIVE": "LIVE",
    "Verrouillé": "Locked",
    "Passe Pro pour débloquer": "Upgrade to Pro to unlock",
    "Pronostic": "Prediction",
    "Cote": "Odds",
    "chez {{bookmaker}}": "at {{bookmaker}}",
    "Partager sur WhatsApp": "Share on WhatsApp",
    "🎯 Confiance : {{confidence}}%": "🎯 Confidence: {{confidence}}%",
    "💳 Pro dès {{price}} · Paiement mobile": "💳 Pro from {{price}} · Mobile payment",
    "WhatsApp ouvert !": "WhatsApp opened!",
    "Débloque tous les pronostics.": "Unlock all predictions.",
    "{{count}} pick réservé actuellement · Analyses · Combos · Super Combos": "{{count}} reserved pick right now · Analyses · Combos · Super Combos",
    "{{count}} picks réservés actuellement · Analyses · Combos · Super Combos": "{{count}} reserved picks right now · Analyses · Combos · Super Combos",
    "Passer Pro · {{price}}": "Upgrade to Pro · {{price}}",
    "Matchs par championnat": "Matches by league",
    "Aucune rencontre ne correspond à cette recherche et aux filtres.": "No matches fit this search and these filters.",
    "Aucun match pour ce filtre": "No matches for this filter",
    "Essaie un nom d’équipe, un pays ou un championnat, ou retire les filtres.": "Try a team, country or league name, or clear the filters.",
    "Réinitialiser les filtres": "Reset filters",
    "Voir {{count}} championnats supplémentaires": "Show {{count}} more leagues",
    "Picks validés": "Prediction results",
    "Track record": "Track record",
    "Aujourd’hui ({{date}})": "Today ({{date}})",
    "Cette semaine · hors aujourd’hui": "This week · excluding today",
    "Aucun pick pour cette période.": "No picks for this period.",
    "Gagnés": "Won",
    "Perdus": "Lost",
    "En attente": "Pending",
    "{{rate}} de réussite": "{{rate}} win rate",
    "Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.": "Win rate is based on won and lost picks; pending picks are excluded.",
    "Les 15 premiers picks sont affichés. Consulte le track record pour la suite.": "The first 15 picks are shown. See the track record for the rest.",
    "Voir le track record": "View track record",
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
    "Accessibles avec ton compte": "Available with your account",
    "Trouve ton prochain match": "Find your next match",
    "Recherche une équipe ou explore les championnats. Les filtres se combinent.": "Search for a team or browse leagues. Filters work together.",
    "Sport": "Sport",
    "Marché": "Market",
    "Niveau de risque": "Risk level",
    "Affiner les résultats": "Refine results",
    "Filtres actifs": "Active filters",
    "Effacer les filtres": "Clear filters",
    "Retirer le filtre {{filter}}": "Remove {{filter}} filter",
    "{{count}} filtres avancés actifs": "{{count}} advanced filters active",
    "Sélections à la une": "Featured picks",
    "Ouvrir la sélection": "Open picks",
    "Explorer les rencontres": "Browse matches",
    "{{count}} rencontres · {{leagues}} championnats": "{{count}} matches · {{leagues}} leagues",
    "Trier les matchs": "Sort matches",
    "Par horaire": "By kick-off time",
    "Par confiance": "By confidence",
    "Par cote": "By odds",
    "Le tri s’applique dans chaque championnat et utilise les données accessibles avec ton compte.": "Sorting applies within each league using data available with your account.",
    "{{shown}} championnats affichés sur {{total}}": "{{shown}} of {{total}} leagues shown",
    "Voir {{count}} autres rencontres": "Show {{count}} more matches",
    "Réduire cette liste": "Show fewer matches",
    "Résultats récents": "Recent results",
    "Déplier pour consulter les résultats de la période.": "Expand to view results for this period.",
    "{{count}} pronostics sur la période": "{{count}} predictions in this period",
    "Plus de sélections avec Pro": "More picks with Pro",
    "{{count}} pronostics réservés aux abonnés actuellement.": "{{count}} subscriber-only predictions right now.",
    "{{price}} / 30 jours": "{{price}} / 30 days",
    "Découvrir Pro": "Explore Pro"
  },
  "es": {
    "Tous": "Todos",
    "Football": "Fútbol",
    "Basketball": "Baloncesto",
    "Tennis": "Tenis",
    "Hockey": "Hockey",
    "Baseball": "Béisbol",
    "MMA": "MMA",
    "Tous les marchés": "Todos los mercados",
    "🏆 Victoire": "🏆 Ganador",
    "🔄 Double chance": "🔄 Doble oportunidad",
    "📈 Plus de 2,5 buts": "📈 Más de 2,5 goles",
    "🎯 Les deux équipes marquent": "🎯 Ambos equipos marcan",
    "⚖️ Handicap": "⚖️ Hándicap",
    "🟨 Cartons": "🟨 Tarjetas",
    "📐 Corners": "📐 Córneres",
    "⏱ Mi-temps": "⏱ Descanso",
    "Tous les niveaux": "Todos los niveles de riesgo",
    "🟢 Sûr": "🟢 Menor riesgo",
    "🟡 Modéré": "🟡 Moderado",
    "🔴 Risqué": "🔴 Arriesgado",
    "🟢 SÛR": "🟢 MENOR RIESGO",
    "🟡 MODÉRÉ": "🟡 MODERADO",
    "🔴 RISQUÉ": "🔴 ARRIESGADO",
    "Autre": "Otros",
    "Chargement des pronostics…": "Cargando pronósticos…",
    "Aucun pick disponible actuellement": "No hay selecciones disponibles ahora",
    "Accès gratuit · Passe Pro pour débloquer les picks réservés": "Acceso gratuito · Pásate a Pro para desbloquear las selecciones reservadas",
    "{{plan}} actif · Tous les picks disponibles": "{{plan}} activo · Todas las selecciones disponibles",
    "Tes pronostics, en un coup d’œil 🎯": "Tus pronósticos de un vistazo 🎯",
    "Picks disponibles": "Selecciones disponibles",
    "En direct": "En directo",
    "Actualiser les données": "Actualizar datos",
    "Actualisation en cours…": "Actualizando…",
    "Données mises à jour": "Datos actualizados",
    "Impossible d’actualiser les données. Réessaie dans un instant.": "No se han podido actualizar los datos. Inténtalo de nuevo en un momento.",
    "Rechercher une rencontre": "Buscar un encuentro",
    "Équipe, championnat, pays, sport ou marché…": "Equipo, liga, país, deporte o mercado…",
    "Effacer la recherche": "Borrar búsqueda",
    "Exemples : Espagne, Ligue 1, Atlético, PSG, plus de 2.5. La recherche se combine avec les filtres sport, marché et risque.": "Ejemplos: España, Ligue 1, Atlético, PSG, más de 2,5. Combina la búsqueda con los filtros de deporte, mercado y riesgo.",
    "{{count}} rencontre trouvée dans les matchs chargés.": "{{count}} encuentro encontrado entre los partidos cargados.",
    "{{count}} rencontres trouvées dans les matchs chargés.": "{{count}} encuentros encontrados entre los partidos cargados.",
    "À la une": "Destacados",
    "Confiance du moteur": "Confianza del motor",
    "Tout voir": "Ver todo",
    "Aucune sélection à la une pour cette recherche.": "No hay selecciones destacadas para esta búsqueda.",
    "Aucune sélection à la une pour le moment.": "No hay selecciones destacadas por ahora.",
    "Consulte aussi les résultats par championnat ci-dessous.": "Consulta también los encuentros por liga más abajo.",
    "Les sélections apparaîtront dès qu’elles seront disponibles.": "Las selecciones aparecerán en cuanto estén disponibles.",
    "Impossible de charger les sélections à la une.": "No se han podido cargar las selecciones destacadas.",
    "Réessayer": "Reintentar",
    "LIVE": "EN DIRECTO",
    "Verrouillé": "Bloqueado",
    "Passe Pro pour débloquer": "Pásate a Pro para desbloquear",
    "Pronostic": "Pronóstico",
    "Cote": "Cuota",
    "chez {{bookmaker}}": "en {{bookmaker}}",
    "Partager sur WhatsApp": "Compartir en WhatsApp",
    "🎯 Confiance : {{confidence}}%": "🎯 Confianza: {{confidence}}%",
    "💳 Pro dès {{price}} · Paiement mobile": "💳 Pro desde {{price}} · Pago móvil",
    "WhatsApp ouvert !": "¡WhatsApp abierto!",
    "Débloque tous les pronostics.": "Desbloquea todos los pronósticos.",
    "{{count}} pick réservé actuellement · Analyses · Combos · Super Combos": "{{count}} selección reservada ahora · Análisis · Combinadas · Súper combinadas",
    "{{count}} picks réservés actuellement · Analyses · Combos · Super Combos": "{{count}} selecciones reservadas ahora · Análisis · Combinadas · Súper combinadas",
    "Passer Pro · {{price}}": "Pasar a Pro · {{price}}",
    "Matchs par championnat": "Partidos por liga",
    "Aucune rencontre ne correspond à cette recherche et aux filtres.": "Ningún encuentro coincide con esta búsqueda y estos filtros.",
    "Aucun match pour ce filtre": "No hay partidos para este filtro",
    "Essaie un nom d’équipe, un pays ou un championnat, ou retire les filtres.": "Prueba con un equipo, país o liga, o elimina los filtros.",
    "Réinitialiser les filtres": "Restablecer filtros",
    "Voir {{count}} championnats supplémentaires": "Ver {{count}} ligas más",
    "Picks validés": "Resultados de pronósticos",
    "Track record": "Historial",
    "Aujourd’hui ({{date}})": "Hoy ({{date}})",
    "Cette semaine · hors aujourd’hui": "Esta semana · sin incluir hoy",
    "Aucun pick pour cette période.": "No hay selecciones en este periodo.",
    "Gagnés": "Ganados",
    "Perdus": "Perdidos",
    "En attente": "Pendientes",
    "{{rate}} de réussite": "{{rate}} de acierto",
    "Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.": "La tasa se calcula con selecciones ganadas y perdidas; se excluyen las pendientes.",
    "Les 15 premiers picks sont affichés. Consulte le track record pour la suite.": "Se muestran las primeras 15 selecciones. Consulta el historial para ver el resto.",
    "Voir le track record": "Ver historial",
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
    "Accessibles avec ton compte": "Accesibles con tu cuenta",
    "Trouve ton prochain match": "Encuentra tu próximo partido",
    "Recherche une équipe ou explore les championnats. Les filtres se combinent.": "Busca un equipo o explora las ligas. Los filtros se combinan.",
    "Sport": "Deporte",
    "Marché": "Mercado",
    "Niveau de risque": "Nivel de riesgo",
    "Affiner les résultats": "Afinar resultados",
    "Filtres actifs": "Filtros activos",
    "Effacer les filtres": "Borrar filtros",
    "Retirer le filtre {{filter}}": "Quitar filtro {{filter}}",
    "{{count}} filtres avancés actifs": "{{count}} filtros avanzados activos",
    "Sélections à la une": "Selecciones destacadas",
    "Ouvrir la sélection": "Abrir selecciones",
    "Explorer les rencontres": "Explorar encuentros",
    "{{count}} rencontres · {{leagues}} championnats": "{{count}} encuentros · {{leagues}} ligas",
    "Trier les matchs": "Ordenar partidos",
    "Par horaire": "Por horario",
    "Par confiance": "Por confianza",
    "Par cote": "Por cuota",
    "Le tri s’applique dans chaque championnat et utilise les données accessibles avec ton compte.": "El orden se aplica dentro de cada liga con los datos accesibles desde tu cuenta.",
    "{{shown}} championnats affichés sur {{total}}": "{{shown}} de {{total}} ligas mostradas",
    "Voir {{count}} autres rencontres": "Ver {{count}} encuentros más",
    "Réduire cette liste": "Mostrar menos partidos",
    "Résultats récents": "Resultados recientes",
    "Déplier pour consulter les résultats de la période.": "Despliega para consultar los resultados del periodo.",
    "{{count}} pronostics sur la période": "{{count}} pronósticos en el periodo",
    "Plus de sélections avec Pro": "Más selecciones con Pro",
    "{{count}} pronostics réservés aux abonnés actuellement.": "{{count}} pronósticos reservados a suscriptores ahora.",
    "{{price}} / 30 jours": "{{price}} / 30 días",
    "Découvrir Pro": "Descubrir Pro"
  },
  "pt": {
    "Tous": "Todos",
    "Football": "Futebol",
    "Basketball": "Basquetebol",
    "Tennis": "Ténis",
    "Hockey": "Hóquei",
    "Baseball": "Basebol",
    "MMA": "MMA",
    "Tous les marchés": "Todos os mercados",
    "🏆 Victoire": "🏆 Vencedor",
    "🔄 Double chance": "🔄 Dupla hipótese",
    "📈 Plus de 2,5 buts": "📈 Mais de 2,5 golos",
    "🎯 Les deux équipes marquent": "🎯 Ambas marcam",
    "⚖️ Handicap": "⚖️ Handicap",
    "🟨 Cartons": "🟨 Cartões",
    "📐 Corners": "📐 Cantos",
    "⏱ Mi-temps": "⏱ Intervalo",
    "Tous les niveaux": "Todos os níveis de risco",
    "🟢 Sûr": "🟢 Menor risco",
    "🟡 Modéré": "🟡 Moderado",
    "🔴 Risqué": "🔴 Arriscado",
    "🟢 SÛR": "🟢 MENOR RISCO",
    "🟡 MODÉRÉ": "🟡 MODERADO",
    "🔴 RISQUÉ": "🔴 ARRISCADO",
    "Autre": "Outros",
    "Chargement des pronostics…": "A carregar prognósticos…",
    "Aucun pick disponible actuellement": "Sem seleções disponíveis neste momento",
    "Accès gratuit · Passe Pro pour débloquer les picks réservés": "Acesso gratuito · Adere ao Pro para desbloquear as seleções reservadas",
    "{{plan}} actif · Tous les picks disponibles": "{{plan}} ativo · Todas as seleções disponíveis",
    "Tes pronostics, en un coup d’œil 🎯": "Os teus prognósticos num relance 🎯",
    "Picks disponibles": "Seleções disponíveis",
    "En direct": "Em direto",
    "Actualiser les données": "Atualizar dados",
    "Actualisation en cours…": "A atualizar…",
    "Données mises à jour": "Dados atualizados",
    "Impossible d’actualiser les données. Réessaie dans un instant.": "Não foi possível atualizar os dados. Tenta novamente dentro de instantes.",
    "Rechercher une rencontre": "Procurar um jogo",
    "Équipe, championnat, pays, sport ou marché…": "Equipa, campeonato, país, desporto ou mercado…",
    "Effacer la recherche": "Limpar pesquisa",
    "Exemples : Espagne, Ligue 1, Atlético, PSG, plus de 2.5. La recherche se combine avec les filtres sport, marché et risque.": "Exemplos: Espanha, Ligue 1, Atlético, PSG, mais de 2,5. Combina a pesquisa com os filtros de desporto, mercado e risco.",
    "{{count}} rencontre trouvée dans les matchs chargés.": "{{count}} jogo encontrado entre os jogos carregados.",
    "{{count}} rencontres trouvées dans les matchs chargés.": "{{count}} jogos encontrados entre os jogos carregados.",
    "À la une": "Destaques",
    "Confiance du moteur": "Confiança do motor",
    "Tout voir": "Ver tudo",
    "Aucune sélection à la une pour cette recherche.": "Sem seleções em destaque para esta pesquisa.",
    "Aucune sélection à la une pour le moment.": "Sem seleções em destaque neste momento.",
    "Consulte aussi les résultats par championnat ci-dessous.": "Consulta também os jogos por campeonato abaixo.",
    "Les sélections apparaîtront dès qu’elles seront disponibles.": "As seleções aparecerão assim que estiverem disponíveis.",
    "Impossible de charger les sélections à la une.": "Não foi possível carregar as seleções em destaque.",
    "Réessayer": "Tentar novamente",
    "LIVE": "EM DIRETO",
    "Verrouillé": "Bloqueado",
    "Passe Pro pour débloquer": "Adere ao Pro para desbloquear",
    "Pronostic": "Prognóstico",
    "Cote": "Odd",
    "chez {{bookmaker}}": "na {{bookmaker}}",
    "Partager sur WhatsApp": "Partilhar no WhatsApp",
    "🎯 Confiance : {{confidence}}%": "🎯 Confiança: {{confidence}}%",
    "💳 Pro dès {{price}} · Paiement mobile": "💳 Pro desde {{price}} · Pagamento móvel",
    "WhatsApp ouvert !": "WhatsApp aberto!",
    "Débloque tous les pronostics.": "Desbloqueia todos os prognósticos.",
    "{{count}} pick réservé actuellement · Analyses · Combos · Super Combos": "{{count}} seleção reservada agora · Análises · Combinadas · Super combinadas",
    "{{count}} picks réservés actuellement · Analyses · Combos · Super Combos": "{{count}} seleções reservadas agora · Análises · Combinadas · Super combinadas",
    "Passer Pro · {{price}}": "Aderir ao Pro · {{price}}",
    "Matchs par championnat": "Jogos por campeonato",
    "Aucune rencontre ne correspond à cette recherche et aux filtres.": "Nenhum jogo corresponde a esta pesquisa e a estes filtros.",
    "Aucun match pour ce filtre": "Sem jogos para este filtro",
    "Essaie un nom d’équipe, un pays ou un championnat, ou retire les filtres.": "Experimenta uma equipa, país ou campeonato, ou remove os filtros.",
    "Réinitialiser les filtres": "Repor filtros",
    "Voir {{count}} championnats supplémentaires": "Ver mais {{count}} campeonatos",
    "Picks validés": "Resultados dos prognósticos",
    "Track record": "Histórico",
    "Aujourd’hui ({{date}})": "Hoje ({{date}})",
    "Cette semaine · hors aujourd’hui": "Esta semana · sem incluir hoje",
    "Aucun pick pour cette période.": "Sem seleções neste período.",
    "Gagnés": "Ganhos",
    "Perdus": "Perdidos",
    "En attente": "Pendentes",
    "{{rate}} de réussite": "{{rate}} de acerto",
    "Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.": "A taxa é calculada com seleções ganhas e perdidas; as pendentes são excluídas.",
    "Les 15 premiers picks sont affichés. Consulte le track record pour la suite.": "São apresentadas as primeiras 15 seleções. Consulta o histórico para ver as restantes.",
    "Voir le track record": "Ver histórico",
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
    "Accessibles avec ton compte": "Acessíveis com a tua conta",
    "Trouve ton prochain match": "Encontra o teu próximo jogo",
    "Recherche une équipe ou explore les championnats. Les filtres se combinent.": "Procura uma equipa ou explora os campeonatos. Os filtros combinam-se.",
    "Sport": "Desporto",
    "Marché": "Mercado",
    "Niveau de risque": "Nível de risco",
    "Affiner les résultats": "Refinar resultados",
    "Filtres actifs": "Filtros ativos",
    "Effacer les filtres": "Limpar filtros",
    "Retirer le filtre {{filter}}": "Remover filtro {{filter}}",
    "{{count}} filtres avancés actifs": "{{count}} filtros avançados ativos",
    "Sélections à la une": "Seleções em destaque",
    "Ouvrir la sélection": "Abrir seleções",
    "Explorer les rencontres": "Explorar jogos",
    "{{count}} rencontres · {{leagues}} championnats": "{{count}} jogos · {{leagues}} campeonatos",
    "Trier les matchs": "Ordenar jogos",
    "Par horaire": "Por horário",
    "Par confiance": "Por confiança",
    "Par cote": "Por odd",
    "Le tri s’applique dans chaque championnat et utilise les données accessibles avec ton compte.": "A ordenação aplica-se em cada campeonato com os dados acessíveis na tua conta.",
    "{{shown}} championnats affichés sur {{total}}": "{{shown}} de {{total}} campeonatos apresentados",
    "Voir {{count}} autres rencontres": "Ver mais {{count}} jogos",
    "Réduire cette liste": "Mostrar menos jogos",
    "Résultats récents": "Resultados recentes",
    "Déplier pour consulter les résultats de la période.": "Expande para consultar os resultados do período.",
    "{{count}} pronostics sur la période": "{{count}} prognósticos no período",
    "Plus de sélections avec Pro": "Mais seleções com Pro",
    "{{count}} pronostics réservés aux abonnés actuellement.": "{{count}} prognósticos reservados a assinantes neste momento.",
    "{{price}} / 30 jours": "{{price}} / 30 dias",
    "Découvrir Pro": "Conhecer Pro"
  },
  "de": {
    "Tous": "Alle",
    "Football": "Fußball",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "Hockey": "Eishockey",
    "Baseball": "Baseball",
    "MMA": "MMA",
    "Tous les marchés": "Alle Wettmärkte",
    "🏆 Victoire": "🏆 Sieger",
    "🔄 Double chance": "🔄 Doppelte Chance",
    "📈 Plus de 2,5 buts": "📈 Über 2,5 Tore",
    "🎯 Les deux équipes marquent": "🎯 Beide Teams treffen",
    "⚖️ Handicap": "⚖️ Handicap",
    "🟨 Cartons": "🟨 Karten",
    "📐 Corners": "📐 Eckbälle",
    "⏱ Mi-temps": "⏱ Halbzeit",
    "Tous les niveaux": "Alle Risikostufen",
    "🟢 Sûr": "🟢 Geringeres Risiko",
    "🟡 Modéré": "🟡 Moderat",
    "🔴 Risqué": "🔴 Höheres Risiko",
    "🟢 SÛR": "🟢 GERINGERES RISIKO",
    "🟡 MODÉRÉ": "🟡 MODERAT",
    "🔴 RISQUÉ": "🔴 HÖHERES RISIKO",
    "Autre": "Sonstige",
    "Chargement des pronostics…": "Tipps werden geladen…",
    "Aucun pick disponible actuellement": "Derzeit keine Tipps verfügbar",
    "Accès gratuit · Passe Pro pour débloquer les picks réservés": "Kostenloser Zugang · Mit Pro reservierte Tipps freischalten",
    "{{plan}} actif · Tous les picks disponibles": "{{plan}} aktiv · Alle verfügbaren Tipps",
    "Tes pronostics, en un coup d’œil 🎯": "Deine Tipps auf einen Blick 🎯",
    "Picks disponibles": "Verfügbare Tipps",
    "En direct": "Live",
    "Actualiser les données": "Daten aktualisieren",
    "Actualisation en cours…": "Wird aktualisiert…",
    "Données mises à jour": "Daten aktualisiert",
    "Impossible d’actualiser les données. Réessaie dans un instant.": "Die Daten konnten nicht aktualisiert werden. Versuche es gleich noch einmal.",
    "Rechercher une rencontre": "Begegnung suchen",
    "Équipe, championnat, pays, sport ou marché…": "Team, Liga, Land, Sport oder Wettmarkt…",
    "Effacer la recherche": "Suche löschen",
    "Exemples : Espagne, Ligue 1, Atlético, PSG, plus de 2.5. La recherche se combine avec les filtres sport, marché et risque.": "Beispiele: Spanien, Ligue 1, Atlético, PSG, über 2,5. Kombiniere die Suche mit Sport-, Markt- und Risikofiltern.",
    "{{count}} rencontre trouvée dans les matchs chargés.": "{{count}} Begegnung unter den geladenen Spielen gefunden.",
    "{{count}} rencontres trouvées dans les matchs chargés.": "{{count}} Begegnungen unter den geladenen Spielen gefunden.",
    "À la une": "Highlights",
    "Confiance du moteur": "Modellkonfidenz",
    "Tout voir": "Alle ansehen",
    "Aucune sélection à la une pour cette recherche.": "Keine hervorgehobenen Tipps für diese Suche.",
    "Aucune sélection à la une pour le moment.": "Derzeit keine hervorgehobenen Tipps.",
    "Consulte aussi les résultats par championnat ci-dessous.": "Sieh dir unten auch die Begegnungen nach Liga an.",
    "Les sélections apparaîtront dès qu’elles seront disponibles.": "Tipps erscheinen, sobald sie verfügbar sind.",
    "Impossible de charger les sélections à la une.": "Hervorgehobene Tipps konnten nicht geladen werden.",
    "Réessayer": "Erneut versuchen",
    "LIVE": "LIVE",
    "Verrouillé": "Gesperrt",
    "Passe Pro pour débloquer": "Mit Pro freischalten",
    "Pronostic": "Tipp",
    "Cote": "Quote",
    "chez {{bookmaker}}": "bei {{bookmaker}}",
    "Partager sur WhatsApp": "Auf WhatsApp teilen",
    "🎯 Confiance : {{confidence}}%": "🎯 Konfidenz: {{confidence}}%",
    "💳 Pro dès {{price}} · Paiement mobile": "💳 Pro ab {{price}} · Mobile Zahlung",
    "WhatsApp ouvert !": "WhatsApp geöffnet!",
    "Débloque tous les pronostics.": "Alle Tipps freischalten.",
    "{{count}} pick réservé actuellement · Analyses · Combos · Super Combos": "{{count}} reservierter Tipp · Analysen · Kombis · Super-Kombis",
    "{{count}} picks réservés actuellement · Analyses · Combos · Super Combos": "{{count}} reservierte Tipps · Analysen · Kombis · Super-Kombis",
    "Passer Pro · {{price}}": "Pro abonnieren · {{price}}",
    "Matchs par championnat": "Spiele nach Liga",
    "Aucune rencontre ne correspond à cette recherche et aux filtres.": "Keine Begegnung entspricht dieser Suche und diesen Filtern.",
    "Aucun match pour ce filtre": "Keine Spiele für diesen Filter",
    "Essaie un nom d’équipe, un pays ou un championnat, ou retire les filtres.": "Suche nach Team, Land oder Liga oder entferne die Filter.",
    "Réinitialiser les filtres": "Filter zurücksetzen",
    "Voir {{count}} championnats supplémentaires": "{{count}} weitere Ligen anzeigen",
    "Picks validés": "Tippergebnisse",
    "Track record": "Ergebnisbilanz",
    "Aujourd’hui ({{date}})": "Heute ({{date}})",
    "Cette semaine · hors aujourd’hui": "Diese Woche · ohne heute",
    "Aucun pick pour cette période.": "Keine Tipps für diesen Zeitraum.",
    "Gagnés": "Gewonnen",
    "Perdus": "Verloren",
    "En attente": "Ausstehend",
    "{{rate}} de réussite": "{{rate}} Trefferquote",
    "Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.": "Die Quote berücksichtigt gewonnene und verlorene Tipps; ausstehende sind ausgeschlossen.",
    "Les 15 premiers picks sont affichés. Consulte le track record pour la suite.": "Die ersten 15 Tipps werden angezeigt. Weitere findest du in der Ergebnisbilanz.",
    "Voir le track record": "Ergebnisbilanz ansehen",
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
    "Accessibles avec ton compte": "Mit deinem Konto zugänglich",
    "Trouve ton prochain match": "Finde dein nächstes Spiel",
    "Recherche une équipe ou explore les championnats. Les filtres se combinent.": "Suche ein Team oder stöbere in den Ligen. Die Filter lassen sich kombinieren.",
    "Sport": "Sport",
    "Marché": "Wettmarkt",
    "Niveau de risque": "Risikostufe",
    "Affiner les résultats": "Ergebnisse eingrenzen",
    "Filtres actifs": "Aktive Filter",
    "Effacer les filtres": "Filter löschen",
    "Retirer le filtre {{filter}}": "Filter {{filter}} entfernen",
    "{{count}} filtres avancés actifs": "{{count}} erweiterte Filter aktiv",
    "Sélections à la une": "Hervorgehobene Tipps",
    "Ouvrir la sélection": "Tipps öffnen",
    "Explorer les rencontres": "Begegnungen ansehen",
    "{{count}} rencontres · {{leagues}} championnats": "{{count}} Begegnungen · {{leagues}} Ligen",
    "Trier les matchs": "Spiele sortieren",
    "Par horaire": "Nach Beginn",
    "Par confiance": "Nach Konfidenz",
    "Par cote": "Nach Quote",
    "Le tri s’applique dans chaque championnat et utilise les données accessibles avec ton compte.": "Die Sortierung gilt innerhalb jeder Liga und nutzt die mit deinem Konto zugänglichen Daten.",
    "{{shown}} championnats affichés sur {{total}}": "{{shown}} von {{total}} Ligen angezeigt",
    "Voir {{count}} autres rencontres": "{{count}} weitere Begegnungen anzeigen",
    "Réduire cette liste": "Weniger Spiele anzeigen",
    "Résultats récents": "Aktuelle Ergebnisse",
    "Déplier pour consulter les résultats de la période.": "Aufklappen, um die Ergebnisse dieses Zeitraums zu sehen.",
    "{{count}} pronostics sur la période": "{{count}} Tipps in diesem Zeitraum",
    "Plus de sélections avec Pro": "Mehr Tipps mit Pro",
    "{{count}} pronostics réservés aux abonnés actuellement.": "Derzeit {{count}} Tipps für Abonnenten.",
    "{{price}} / 30 jours": "{{price}} / 30 Tage",
    "Découvrir Pro": "Pro entdecken"
  },
  "ar": {
    "Tous": "الكل",
    "Football": "كرة القدم",
    "Basketball": "كرة السلة",
    "Tennis": "التنس",
    "Hockey": "الهوكي",
    "Baseball": "البيسبول",
    "MMA": "الفنون القتالية المختلطة",
    "Tous les marchés": "جميع الأسواق",
    "🏆 Victoire": "🏆 الفائز",
    "🔄 Double chance": "🔄 فرصة مزدوجة",
    "📈 Plus de 2,5 buts": "📈 أكثر من ٢٫٥ هدف",
    "🎯 Les deux équipes marquent": "🎯 كلا الفريقين يسجل",
    "⚖️ Handicap": "⚖️ هانديكاب",
    "🟨 Cartons": "🟨 البطاقات",
    "📐 Corners": "📐 الركنيات",
    "⏱ Mi-temps": "⏱ الشوط الأول",
    "Tous les niveaux": "جميع مستويات المخاطر",
    "🟢 Sûr": "🟢 مخاطر أقل",
    "🟡 Modéré": "🟡 متوسط",
    "🔴 Risqué": "🔴 مرتفع المخاطر",
    "🟢 SÛR": "🟢 مخاطر أقل",
    "🟡 MODÉRÉ": "🟡 متوسط",
    "🔴 RISQUÉ": "🔴 مرتفع المخاطر",
    "Autre": "أخرى",
    "Chargement des pronostics…": "جارٍ تحميل التوقعات…",
    "Aucun pick disponible actuellement": "لا توجد اختيارات متاحة حالياً",
    "Accès gratuit · Passe Pro pour débloquer les picks réservés": "وصول مجاني · اشترك في Pro لفتح الاختيارات المحجوزة",
    "{{plan}} actif · Tous les picks disponibles": "اشتراك {{plan}} مفعّل · جميع الاختيارات المتاحة",
    "Tes pronostics, en un coup d’œil 🎯": "توقعاتك في لمحة 🎯",
    "Picks disponibles": "الاختيارات المتاحة",
    "En direct": "مباشر",
    "Actualiser les données": "تحديث البيانات",
    "Actualisation en cours…": "جارٍ التحديث…",
    "Données mises à jour": "تم تحديث البيانات",
    "Impossible d’actualiser les données. Réessaie dans un instant.": "تعذّر تحديث البيانات. حاول مجدداً بعد قليل.",
    "Rechercher une rencontre": "البحث عن مباراة",
    "Équipe, championnat, pays, sport ou marché…": "فريق أو بطولة أو بلد أو رياضة أو سوق…",
    "Effacer la recherche": "مسح البحث",
    "Exemples : Espagne, Ligue 1, Atlético, PSG, plus de 2.5. La recherche se combine avec les filtres sport, marché et risque.": "أمثلة: إسبانيا، Ligue 1، Atlético، PSG، أكثر من ٢٫٥. يمكن الجمع بين البحث وفلاتر الرياضة والسوق والمخاطر.",
    "{{count}} rencontre trouvée dans les matchs chargés.": "عدد المباريات المطابقة ضمن المباريات المحمّلة: {{count}}.",
    "{{count}} rencontres trouvées dans les matchs chargés.": "عدد المباريات المطابقة ضمن المباريات المحمّلة: {{count}}.",
    "À la une": "أبرز الاختيارات",
    "Confiance du moteur": "ثقة المحرّك",
    "Tout voir": "عرض الكل",
    "Aucune sélection à la une pour cette recherche.": "لا توجد اختيارات بارزة مطابقة لهذا البحث.",
    "Aucune sélection à la une pour le moment.": "لا توجد اختيارات بارزة حالياً.",
    "Consulte aussi les résultats par championnat ci-dessous.": "تصفّح أيضاً المباريات حسب البطولة أدناه.",
    "Les sélections apparaîtront dès qu’elles seront disponibles.": "ستظهر الاختيارات بمجرد توفّرها.",
    "Impossible de charger les sélections à la une.": "تعذّر تحميل الاختيارات البارزة.",
    "Réessayer": "إعادة المحاولة",
    "LIVE": "مباشر",
    "Verrouillé": "مقفل",
    "Passe Pro pour débloquer": "اشترك في Pro لفتح المحتوى",
    "Pronostic": "التوقع",
    "Cote": "معامل الربح",
    "chez {{bookmaker}}": "لدى {{bookmaker}}",
    "Partager sur WhatsApp": "المشاركة عبر واتساب",
    "🎯 Confiance : {{confidence}}%": "🎯 الثقة: {{confidence}}٪",
    "💳 Pro dès {{price}} · Paiement mobile": "💳 اشتراك Pro ابتداءً من {{price}} · الدفع عبر الهاتف",
    "WhatsApp ouvert !": "تم فتح واتساب!",
    "Débloque tous les pronostics.": "افتح جميع التوقعات.",
    "{{count}} pick réservé actuellement · Analyses · Combos · Super Combos": "الاختيارات المحجوزة حالياً: {{count}} · تحليلات · رهانات مركبة · رهانات مركبة موسّعة",
    "{{count}} picks réservés actuellement · Analyses · Combos · Super Combos": "الاختيارات المحجوزة حالياً: {{count}} · تحليلات · رهانات مركبة · رهانات مركبة موسّعة",
    "Passer Pro · {{price}}": "الاشتراك في Pro · {{price}}",
    "Matchs par championnat": "المباريات حسب البطولة",
    "Aucune rencontre ne correspond à cette recherche et aux filtres.": "لا توجد مباريات تطابق هذا البحث وهذه الفلاتر.",
    "Aucun match pour ce filtre": "لا توجد مباريات لهذا الفلتر",
    "Essaie un nom d’équipe, un pays ou un championnat, ou retire les filtres.": "جرّب اسم فريق أو بلد أو بطولة، أو أزل الفلاتر.",
    "Réinitialiser les filtres": "إعادة ضبط الفلاتر",
    "Voir {{count}} championnats supplémentaires": "عرض بطولات إضافية: {{count}}",
    "Picks validés": "نتائج التوقعات",
    "Track record": "سجل النتائج",
    "Aujourd’hui ({{date}})": "اليوم ({{date}})",
    "Cette semaine · hors aujourd’hui": "هذا الأسبوع · باستثناء اليوم",
    "Aucun pick pour cette période.": "لا توجد اختيارات لهذه الفترة.",
    "Gagnés": "ناجحة",
    "Perdus": "خاسرة",
    "En attente": "قيد الانتظار",
    "{{rate}} de réussite": "نسبة النجاح {{rate}}",
    "Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.": "تُحسب النسبة على الاختيارات الناجحة والخاسرة فقط، وتُستثنى الاختيارات قيد الانتظار.",
    "Les 15 premiers picks sont affichés. Consulte le track record pour la suite.": "تُعرض أول ١٥ اختياراً. راجع سجل النتائج للاطّلاع على البقية.",
    "Voir le track record": "عرض سجل النتائج",
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
    "Accessibles avec ton compte": "المتاحة لحسابك",
    "Trouve ton prochain match": "ابحث عن مباراتك القادمة",
    "Recherche une équipe ou explore les championnats. Les filtres se combinent.": "ابحث عن فريق أو تصفّح البطولات. يمكن الجمع بين الفلاتر.",
    "Sport": "الرياضة",
    "Marché": "السوق",
    "Niveau de risque": "مستوى المخاطر",
    "Affiner les résultats": "تضييق نطاق النتائج",
    "Filtres actifs": "الفلاتر المفعّلة",
    "Effacer les filtres": "مسح الفلاتر",
    "Retirer le filtre {{filter}}": "إزالة فلتر {{filter}}",
    "{{count}} filtres avancés actifs": "الفلاتر المتقدمة المفعّلة: {{count}}",
    "Sélections à la une": "الاختيارات البارزة",
    "Ouvrir la sélection": "عرض الاختيارات",
    "Explorer les rencontres": "تصفّح المباريات",
    "{{count}} rencontres · {{leagues}} championnats": "المباريات: {{count}} · البطولات: {{leagues}}",
    "Trier les matchs": "ترتيب المباريات",
    "Par horaire": "حسب الموعد",
    "Par confiance": "حسب الثقة",
    "Par cote": "حسب معامل الربح",
    "Le tri s’applique dans chaque championnat et utilise les données accessibles avec ton compte.": "يُطبّق الترتيب داخل كل بطولة باستخدام البيانات المتاحة لحسابك.",
    "{{shown}} championnats affichés sur {{total}}": "البطولات المعروضة: {{shown}} من {{total}}",
    "Voir {{count}} autres rencontres": "عرض مباريات إضافية: {{count}}",
    "Réduire cette liste": "عرض مباريات أقل",
    "Résultats récents": "النتائج الأخيرة",
    "Déplier pour consulter les résultats de la période.": "افتح لعرض نتائج هذه الفترة.",
    "{{count}} pronostics sur la période": "التوقعات خلال الفترة: {{count}}",
    "Plus de sélections avec Pro": "اختيارات أكثر مع Pro",
    "{{count}} pronostics réservés aux abonnés actuellement.": "التوقعات المخصّصة للمشتركين حالياً: {{count}}.",
    "{{price}} / 30 jours": "{{price}} / ٣٠ يوماً",
    "Découvrir Pro": "اكتشف Pro"
  }
};

const CALENDAR_MESSAGES = {
  "fr": {
    "Matchs du jour": "Matchs du jour",
    "Demain": "Demain",
    "Prochains jours": "Prochains jours",
    "Jours précédents": "Jours précédents",
    "Date à confirmer": "Date à confirmer",
    "Les rencontres sont regroupées par date, puis par championnat.": "Les rencontres sont regroupées par date, puis par championnat.",
    "Horaires dans ton fuseau : {{zone}}": "Horaires dans ton fuseau : {{zone}}",
    "{{count}} rencontres": "{{count}} rencontres",
    "Aucun match du jour avec ces filtres.": "Aucun match du jour avec ces filtres.",
    "Voir les prochaines rencontres ci-dessous ou modifier les filtres.": "Voir les prochaines rencontres ci-dessous ou modifier les filtres.",
    "Voir tous les championnats de cette journée": "Voir tous les championnats de cette journée",
    "Réduire cette journée": "Réduire cette journée",
    "Parcourir les journées": "Parcourir les journées",
    "À venir": "À venir",
    "Terminés": "Terminés",
    "{{count}} journées": "{{count}} journées",
    "Le tri reste indépendant pour chaque journée et chaque championnat.": "Le tri reste indépendant pour chaque journée et chaque championnat."
  },
  "en": {
    "Matchs du jour": "Today’s matches",
    "Demain": "Tomorrow",
    "Prochains jours": "Coming days",
    "Jours précédents": "Previous days",
    "Date à confirmer": "Date to be confirmed",
    "Les rencontres sont regroupées par date, puis par championnat.": "Matches are grouped by date, then by competition.",
    "Horaires dans ton fuseau : {{zone}}": "Times in your time zone: {{zone}}",
    "{{count}} rencontres": "{{count}} matches",
    "Aucun match du jour avec ces filtres.": "No matches today with these filters.",
    "Voir les prochaines rencontres ci-dessous ou modifier les filtres.": "Browse upcoming matches below or adjust the filters.",
    "Voir tous les championnats de cette journée": "Show every competition for this day",
    "Réduire cette journée": "Show fewer competitions",
    "Parcourir les journées": "Browse match days",
    "À venir": "Upcoming",
    "Terminés": "Finished",
    "{{count}} journées": "{{count}} days",
    "Le tri reste indépendant pour chaque journée et chaque championnat.": "Sorting applies separately to each day and competition."
  },
  "es": {
    "Matchs du jour": "Partidos de hoy",
    "Demain": "Mañana",
    "Prochains jours": "Próximos días",
    "Jours précédents": "Días anteriores",
    "Date à confirmer": "Fecha por confirmar",
    "Les rencontres sont regroupées par date, puis par championnat.": "Los partidos se agrupan por fecha y después por competición.",
    "Horaires dans ton fuseau : {{zone}}": "Horarios en tu zona: {{zone}}",
    "{{count}} rencontres": "{{count}} partidos",
    "Aucun match du jour avec ces filtres.": "No hay partidos de hoy con estos filtros.",
    "Voir les prochaines rencontres ci-dessous ou modifier les filtres.": "Consulta los próximos partidos abajo o modifica los filtros.",
    "Voir tous les championnats de cette journée": "Ver todas las competiciones de este día",
    "Réduire cette journée": "Mostrar menos competiciones",
    "Parcourir les journées": "Explorar las jornadas",
    "À venir": "Próximos",
    "Terminés": "Finalizados",
    "{{count}} journées": "{{count}} días",
    "Le tri reste indépendant pour chaque journée et chaque championnat.": "La clasificación se aplica por separado a cada día y competición."
  },
  "pt": {
    "Matchs du jour": "Jogos de hoje",
    "Demain": "Amanhã",
    "Prochains jours": "Próximos dias",
    "Jours précédents": "Dias anteriores",
    "Date à confirmer": "Data a confirmar",
    "Les rencontres sont regroupées par date, puis par championnat.": "Os jogos estão agrupados por data e depois por competição.",
    "Horaires dans ton fuseau : {{zone}}": "Horários no teu fuso: {{zone}}",
    "{{count}} rencontres": "{{count}} jogos",
    "Aucun match du jour avec ces filtres.": "Sem jogos de hoje com estes filtros.",
    "Voir les prochaines rencontres ci-dessous ou modifier les filtres.": "Consulta os próximos jogos abaixo ou ajusta os filtros.",
    "Voir tous les championnats de cette journée": "Ver todas as competições deste dia",
    "Réduire cette journée": "Mostrar menos competições",
    "Parcourir les journées": "Explorar os dias",
    "À venir": "Por começar",
    "Terminés": "Terminados",
    "{{count}} journées": "{{count}} dias",
    "Le tri reste indépendant pour chaque journée et chaque championnat.": "A ordenação é aplicada separadamente a cada dia e competição."
  },
  "de": {
    "Matchs du jour": "Spiele des Tages",
    "Demain": "Morgen",
    "Prochains jours": "Nächste Tage",
    "Jours précédents": "Vergangene Tage",
    "Date à confirmer": "Datum noch offen",
    "Les rencontres sont regroupées par date, puis par championnat.": "Die Spiele sind nach Datum und anschließend nach Wettbewerb gruppiert.",
    "Horaires dans ton fuseau : {{zone}}": "Zeiten in deiner Zeitzone: {{zone}}",
    "{{count}} rencontres": "{{count}} Spiele",
    "Aucun match du jour avec ces filtres.": "Heute keine Spiele mit diesen Filtern.",
    "Voir les prochaines rencontres ci-dessous ou modifier les filtres.": "Sieh dir die nächsten Spiele unten an oder ändere die Filter.",
    "Voir tous les championnats de cette journée": "Alle Wettbewerbe dieses Tages anzeigen",
    "Réduire cette journée": "Weniger Wettbewerbe anzeigen",
    "Parcourir les journées": "Spieltage durchsehen",
    "À venir": "Bevorstehend",
    "Terminés": "Beendet",
    "{{count}} journées": "{{count}} Tage",
    "Le tri reste indépendant pour chaque journée et chaque championnat.": "Die Sortierung gilt für jeden Tag und Wettbewerb getrennt."
  },
  "ar": {
    "Matchs du jour": "مباريات اليوم",
    "Demain": "غداً",
    "Prochains jours": "الأيام القادمة",
    "Jours précédents": "الأيام السابقة",
    "Date à confirmer": "الموعد غير مؤكد",
    "Les rencontres sont regroupées par date, puis par championnat.": "المباريات مرتبة حسب التاريخ ثم البطولة.",
    "Horaires dans ton fuseau : {{zone}}": "الأوقات حسب منطقتك الزمنية: {{zone}}",
    "{{count}} rencontres": "{{count}} مباراة",
    "Aucun match du jour avec ces filtres.": "لا توجد مباريات اليوم بهذه الفلاتر.",
    "Voir les prochaines rencontres ci-dessous ou modifier les filtres.": "تصفح المباريات القادمة أدناه أو غيّر الفلاتر.",
    "Voir tous les championnats de cette journée": "عرض جميع بطولات هذا اليوم",
    "Réduire cette journée": "عرض بطولات أقل",
    "Parcourir les journées": "تصفح أيام المباريات",
    "À venir": "قادمة",
    "Terminés": "انتهت",
    "{{count}} journées": "{{count}} أيام",
    "Le tri reste indépendant pour chaque journée et chaque championnat.": "يطبق الترتيب بشكل مستقل داخل كل يوم وكل بطولة."
  }
};
Object.keys(CALENDAR_MESSAGES).forEach(language => Object.assign(DASHBOARD_MESSAGES[language], CALENDAR_MESSAGES[language]));

function useDashboardLanguage() {
  const context = useLanguage();
  const { language, t: sharedTranslate } = context;
  const t = useCallback((source, values = {}) => {
    const dictionary = DASHBOARD_MESSAGES[language] || DASHBOARD_MESSAGES.fr;
    const message = Object.prototype.hasOwnProperty.call(dictionary, source)
      ? dictionary[source] : sharedTranslate(source);
    return message.replace(/\{\{(\w+)\}\}/g, (placeholder, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : placeholder);
  }, [language, sharedTranslate]);
  return { ...context, t };
}

function translateBetText(value, t, formatNumber, teams = []) {
  if (typeof value !== "string") return "—";
  // Une équipe qui porte le nom d’un marché ne doit pas être traduite.
  if (teams.some(team => team && team === value)) return value;
  const total = value.trim().match(/^(Plus|Moins) de (\d+(?:[.,]\d+)?) (buts|points|corners|cartons)$/i);
  if (total) {
    const direction = total[1].toLowerCase() === "plus" ? "Plus" : "Moins";
    return t(direction + " de {{line}} " + total[3].toLowerCase(), {
      line: formatNumber(Number(total[2].replace(",", ".")), { maximumFractionDigits: 3 }),
    });
  }
  return t(value);
}

const SPORT_TABS = [
  { key: "all",        label: "Tous",       icon: "🌍" },
  { key: "soccer",     label: "Football",   icon: "⚽" },
  { key: "basketball", label: "Basketball", icon: "🏀" },
  { key: "tennis",     label: "Tennis",     icon: "🎾" },
  { key: "icehockey",  label: "Hockey",     icon: "🏒" },
  { key: "baseball",   label: "Baseball",   icon: "⚾" },
  { key: "mma",        label: "MMA",        icon: "🥊" },
];
const BET_FILTERS = [
  { key: "all",           label: "Tous les marchés" },
  { key: "victoire",      label: "🏆 Victoire" },
  { key: "double_chance", label: "🔄 Double chance" },
  { key: "over_25",       label: "📈 Plus de 2,5 buts" },
  { key: "btts",          label: "🎯 Les deux équipes marquent" },
  { key: "handicap",      label: "⚖️ Handicap" },
  { key: "cartons",       label: "🟨 Cartons" },
  { key: "corners",       label: "📐 Corners" },
  { key: "mi_temps",      label: "⏱ Mi-temps" },
];
// Nouvelle ligne de filtre, additive — ne remplace rien de l'existant.
// Permet de regrouper/reperer tous les picks Surs, Moderes ou Risques,
// combinable avec les filtres sport et marche deja en place.
const RISK_FILTERS = [
  { key: "all",   label: "Tous les niveaux", cls: "bg-slate-800 text-white border-slate-800" },
  { key: "safe",  label: "🟢 Sûr",     cls: "bg-emerald-600 text-white border-emerald-600" },
  { key: "value", label: "🟡 Modéré",  cls: "bg-amber-500 text-white border-amber-500" },
  { key: "risky", label: "🔴 Risqué",  cls: "bg-rose-600 text-white border-rose-600" },
];
function matchesBetFilter(pick = "", filterKey, marketLabel = "", marketKey = "") {
  if (filterKey === "all") return true;
  const text = normalizeSearch([pick, marketLabel, marketKey].filter(value => typeof value === "string").join(" "));
  const selection = normalizeSearch(pick);
  switch (filterKey) {
    case "victoire": return /\b(victoire|vainqueur|winner|h2h|1x2)\b/.test(text);
    case "double_chance": return text.includes("double chance") || /^(1x|x2|12)$/.test(selection);
    case "over_25": return /(?:plus de|over)\s*2 5(?:\s|$)/.test(selection);
    case "btts": return text.includes("equipes marquent") || text.includes("both teams") || text.includes("btts");
    case "handicap": return /\b(handicap|spread|spreads)\b/.test(text);
    case "cartons": return /\b(carton|cartons|cards)\b/.test(text);
    case "corners": return /\b(corner|corners)\b/.test(text);
    case "mi_temps": return text.includes("mi temps") || text.includes("periode") || text.includes("half time");
    default: return true;
  }
}

function sortDashboardMatches(matches, sort) {
  const number = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  const value = match => {
    if (sort === "time") {
      const timestamp = match.commence_time ? new Date(match.commence_time).getTime() : NaN;
      return Number.isFinite(timestamp) ? timestamp : Infinity;
    }
    if (match.prediction?.locked) return -Infinity;
    return number(sort === "confidence" ? match.prediction?.confidence : match.prediction?.pick_odds) ?? -Infinity;
  };
  return [...matches].sort((left, right) => {
    const a = value(left), b = value(right);
    if (a === b) return 0;
    return sort === "time" ? (a < b ? -1 : 1) : (a > b ? -1 : 1);
  });
}
const LEAGUE_PRIORITY = [
  "FIFA World Cup","Coupe du Monde","Champions League","UEFA Champions League",
  "Premier League","La Liga","Bundesliga","Ligue 1","Serie A",
  "Europa League","CAF Champions League","Africa Cup",
  "NBA","EuroLeague","ATP","WTA","NHL","MLB",
];
function groupByLeague(matches) {
  const groups = {};
  for (const m of matches) {
    const league = m.sport_title || "Autre";
    if (!groups[league]) groups[league] = [];
    groups[league].push(m);
  } return Object.entries(groups).sort(([a],[b]) => {
    const ia = LEAGUE_PRIORITY.findIndex(p => a.includes(p));
    const ib = LEAGUE_PRIORITY.findIndex(p => b.includes(p));
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function normalizeSearch(value) {
  return String(value ?? "").replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= "٩" ? 1632 : 1776))).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/œ/g, "oe").replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Les alias permettent par exemple "Espagne" quand l'API transmet "Spain".
const SEARCH_COUNTRIES = [
  ["spain espagne espana espanha spanien إسبانيا اسبانيا", ["spain", "espagne", "espana"]],
  ["france francais francia franca frankreich فرنسا", ["france"]],
  ["germany allemagne deutschland alemania alemanha ألمانيا المانيا", ["germany", "allemagne", "deutschland"]],
  ["england angleterre royaume uni inglaterra vereinigtes konigreich إنجلترا انجلترا إنكلترا", ["england", "angleterre", "epl", "efl"]],
  ["italy italie italia italien إيطاليا ايطاليا", ["italy", "italie", "italia"]],
  ["poland pologne polska polonia polen بولندا", ["poland", "pologne", "ekstraklasa"]],
  ["finland finlande finlandia finnland فنلندا", ["finland", "finlande", "veikkausliiga"]],
  ["japan japon japao اليابان", ["japan", "japon", "j league", "jleague"]],
  ["south korea coree du sud corea del sur coreia do sul sudkorea كوريا الجنوبية", ["korea", "coree", "k league", "kleague"]],
  ["china chine الصين", ["china", "chine"]],
  ["usa etats unis amerique estados unidos vereinigte staaten الولايات المتحدة أمريكا امريكا", ["usa", "united states", "nba", "wnba", "nfl", "mlb"]],
  ["portugal portugais البرتغال", ["portugal", "primeira liga"]],
  ["netherlands pays bas hollande paises bajos paises baixos niederlande هولندا", ["netherlands", "pays bas", "eredivisie"]],
  ["belgium belgique belgica belgien بلجيكا", ["belgium", "belgique"]],
  ["brazil bresil brasil brasilien البرازيل", ["brazil", "bresil", "brasil"]],
  ["argentina argentine argentinien الأرجنتين الارجنتين", ["argentina", "argentine"]],
  ["turkey turquie turkiye turquia turkei تركيا", ["turkey", "turquie", "super lig"]],
  ["switzerland suisse suiza suica schweiz سويسرا", ["switzerland", "suisse"]],
  ["austria autriche osterreich النمسا", ["austria", "autriche"]],
  ["scotland ecosse escocia schottland اسكتلندا", ["scotland", "ecosse"]],
];

function matchSearchText(match) {
  const prediction = match?.prediction || {};
  const competition = normalizeSearch([
    match?.sport_title, match?.sport_key, match?.league, match?.league_name,
    match?.competition_name, match?.league?.name, match?.country, match?.country?.name, match?.country_name,
    prediction.sport_title, prediction.sport_key,
  ].filter(value => typeof value === "string").join(" "));
  const aliases = SEARCH_COUNTRIES.filter(([, terms]) => terms.some(term =>
    ` ${competition} `.includes(` ${term} `))).map(([names]) => names);
  const family = String(match?.sport_key || prediction.sport_key || "").split("_")[0];
  const sports = { soccer: "football foot soccer futbol futebol fussball كرة القدم", basketball: "basket basketball baloncesto basquetebol كرة السلة", tennis: "tennis tenis التنس", icehockey: "hockey hoquei eishockey الهوكي", baseball: "baseball beisbol basebol البيسبول", mma: "mma ufc boxe الفنون القتالية" };
  const risk = { safe: "sur safe lower risk menor riesgo menor risco geringeres risiko مخاطر أقل", value: "modere value moderate moderado moderat متوسط", risky: "risque risky higher risk arriesgado arriscado hoheres risiko مرتفع المخاطر" };
  const teams = normalizeSearch(`${match?.home_team || ""} ${match?.away_team || ""} ${prediction.home_team || ""} ${prediction.away_team || ""}`);
  const teamAliases = teams.includes("paris saint germain") ? "psg" : "";
  // Ne pas indexer un pronostic verrouillé, même si un ancien serveur le transmet.
  const pickText = prediction.locked ? "" : `${prediction.pick || ""} ${prediction.market_label || ""}`;
  const marketAliases = prediction.locked ? "" : Object.values(DASHBOARD_MESSAGES).map(dictionary => {
    const translate = (key, values = {}) => (dictionary[key] || key).replace(/\{\{(\w+)\}\}/g, (placeholder, name) => String(values[name] ?? placeholder));
    return [prediction.pick, prediction.market_label].filter(Boolean)
      .map(value => translateBetText(value, translate, number => String(number), [match?.home_team, match?.away_team, prediction.home_team, prediction.away_team])).join(" ");
  }).join(" ");
  return normalizeSearch(`${marketAliases} ${competition} ${teams} ${aliases.join(" ")} ${sports[family] || ""} ${risk[prediction.label] || ""} ${teamAliases} ${pickText}`);
}

function matchesSearch(match, query) {
  const terms = normalizeSearch(String(query || "").slice(0, 200)).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const text = matchSearchText(match);
  return terms.every(term => text.includes(term));
}

function getAvailablePickCounts(matches) {
  const picksByMatch = new Map();
  for (const [index, match] of (Array.isArray(matches) ? matches : []).entries()) {
    const prediction = match?.prediction;
    if (!prediction || prediction.is_finished || match.is_finished || match.completed) continue;
    // L'API fournit ce booléen avant de masquer le détail des picks Pro.
    // Sur un ancien serveur, ne compter que les sélections effectivement reçues.
    const available = typeof prediction.has_prediction === "boolean"
      ? prediction.has_prediction
      : typeof prediction.pick === "string" && prediction.pick.trim().length > 0;
    if (!available) continue;
    const key = String(match.id || prediction.match_id || `match-${index}`);
    const accessible = prediction.locked !== true;
    picksByMatch.set(key, Boolean(picksByMatch.get(key)) || accessible);
  }
  const total = picksByMatch.size;
  const accessible = [...picksByMatch.values()].filter(Boolean).length;
  return { total, accessible, locked: total - accessible };
}

function localMatchDay(value) {
  if (!value) return null;
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DD") : null;
}
function groupDashboardDays(matches, today) {
  const groups = new Map();
  matches.forEach(match => {
    const key = localMatchDay(match.commence_time) || "undated";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  });
  const rank = key => key === "undated" ? 2 : key < today ? 1 : 0;
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)
    || (rank(a) === 1 ? b.localeCompare(a) : a.localeCompare(b)));
}
function calendarDayTitle(key, today, t, formatDate) {
  if (key === "undated") return t("Date à confirmer");
  if (key === today) return t("Matchs du jour");
  if (key === dayjs(today).add(1, "day").format("YYYY-MM-DD")) return t("Demain");
  return formatDate(`${key}T12:00:00`, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function useCalendarDay() {
  const [today, setToday] = useState(() => dayjs().format("YYYY-MM-DD"));
  useEffect(() => {
    const update = () => setToday(dayjs().format("YYYY-MM-DD"));
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return today;
}

export function MatchCataloguePage() {
  const experienceWords = useExperienceCopy();
  useExperienceEvent("catalogue");
  const { user } = useAuth();
  const { t, formatDate, formatNumber } = useDashboardLanguage();
  const translationRef = useRef(t);
  translationRef.current = t;
  const navigate = useNavigate();
  const { matches, loading, lastUpdate, refresh } = useRealtimeMatches();
  const pickCounts = useMemo(() => getAvailablePickCounts(matches), [matches]);
  const picksLoading = loading && pickCounts.total === 0;
  const [topPicks,    setTopPicks]   = useState([]);
  const [topLoading,  setTopLoading] = useState(true);
  const [topError, setTopError] = useState(false);
  const [topRetry, setTopRetry] = useState(0);
  const [validated,   setValidated]  = useState([]);
  // Tarif public canonique WinPulse Pro.
  // Le Dashboard ne doit jamais afficher un ancien montant ni ouvrir
  // un ancien flux de paiement : l'abonnement se fait sur /app/abonnement.
  const WINPULSE_MONTHLY_PRICE_XOF = 10500;
  const priceLabel = `${formatNumber(WINPULSE_MONTHLY_PRICE_XOF)} FCFA`;
  const [searchParams, setSearchParams] = useSearchParams();
  const sport = searchParams.get("sport") || "all";
  const betFilter = searchParams.get("bet") || "all";
  const riskFilter = searchParams.get("risk") || "all";
  const requestedSort = searchParams.get("sort");
  const sort = ["time", "confidence", "odds"].includes(requestedSort) ? requestedSort : "time";
  const searchQuery = (searchParams.get("q") || "").slice(0, 200);
  const hasSearch = Boolean(normalizeSearch(searchQuery));
  const setSearchQuery = (value) => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    value ? p.set("q", value.slice(0, 200)) : p.delete("q");
    return p;
  }, { replace: true });
  const setSport = (val) => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    val === "all" ? p.delete("sport") : p.set("sport", val);
    return p;
  });
  const setBetFilter = (val) => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    val === "all" ? p.delete("bet") : p.set("bet", val);
    return p;
  });
  const setRiskFilter = (val) => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    val === "all" ? p.delete("risk") : p.set("risk", val);
    return p;
  });
  const setSort = value => setSearchParams(previous => {
    const params = new URLSearchParams(previous);
    value === "time" ? params.delete("sort") : params.set("sort", value);
    return params;
  }, { replace: true });
  const resetFilters = () => setSearchParams(previous => {
    const params = new URLSearchParams(previous);
    ["q", "sport", "bet", "risk"].forEach(key => params.delete(key));
    return params;
  }, { replace: true });
  const today = useCalendarDay();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [refreshing,  setRefreshing] = useState(false);
  // Open the nearest day by default; other dates remain available without a long wall of cards.
  const [openDays, setOpenDays] = useState({});
  const subscriptionTier = String(user?.subscription_tier || user?.subscription || "free").toLowerCase();
  const isFree = subscriptionTier === "free" && !user?.is_admin;
  const isAdmin = Boolean(user?.is_admin);
  useEffect(() => {
    let ok = true;
    setTopError(false);
    setTopLoading(true);
    api.get("/predictions/top")
      .then(r => { if (ok) setTopPicks(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (ok) { setTopPicks([]); setTopError(true); } })
      .finally(() => { if (ok) setTopLoading(false); });
    setValidated([]);
    if (isAdmin) api.get("/predictions/history")
      .then(r => { if (ok) setValidated(Array.isArray(r.data) ? r.data : Array.isArray(r.data?.predictions) ? r.data.predictions : []); })
      .catch(() => {});
    return () => { ok = false; };
  }, [lastUpdate, topRetry, isAdmin, user?.id]);
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
      toast.success(translationRef.current("Données mises à jour"));
    } catch {
      toast.error(translationRef.current("Impossible d’actualiser les données. Réessaie dans un instant."));
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshing]);
  const searchIndex = useMemo(() => new Map(matches.map(match => [match, matchSearchText(match)])), [matches]);
  const filtered = useMemo(() => {
    let list = matches;
    if (hasSearch) {
      const terms = normalizeSearch(searchQuery).split(" ").filter(Boolean);
      list = list.filter(match => terms.every(term => searchIndex.get(match)?.includes(term)));
    }
    if (sport !== "all")
      list = list.filter(m => (m.sport_key || "").toLowerCase().includes(sport));
    if (betFilter !== "all")
      list = list.filter(m => matchesBetFilter(m.prediction?.pick, betFilter, m.prediction?.market_label, m.prediction?.market_key));
    if (riskFilter !== "all")
      list = list.filter(m => (m.prediction?.label || "") === riskFilter);
    return list;
  }, [matches, sport, betFilter, riskFilter, hasSearch, searchQuery, searchIndex]);
  const visibleTopPicks = useMemo(() => topPicks.filter(p => matchesSearch({ ...p, prediction: p }, searchQuery)
      && (sport === "all" || (p.sport_key || "").toLowerCase().includes(sport))
      && matchesBetFilter(p.pick, betFilter, p.market_label, p.market_key)
      && (riskFilter === "all" || p.label === riskFilter))
    , [topPicks, searchQuery, sport, betFilter, riskFilter]);
  const sportCounts = useMemo(() => {
    const c = {};
    matches.forEach(m => {
      SPORT_TABS.forEach(tab => {       if (tab.key !== "all" && (m.sport_key || "").toLowerCase().includes(tab.key))
          c[tab.key] = (c[tab.key] || 0) + 1;
      });
    });
    return c;
  }, [matches]);
  // Compte par niveau de confiance, pour afficher un badge sur chaque
  // bouton de filtre (ex: "🟢 Sûr (12)") — aide a voir d'un coup d'oeil
  // combien de picks sont disponibles dans chaque categorie.
  const riskCounts = useMemo(() => {
    const c = { safe: 0, value: 0, risky: 0 };
    matches.forEach(m => {
      const lbl = m.prediction?.label;
      if (lbl && c[lbl] !== undefined) c[lbl] += 1;
    });
    return c;
  }, [matches]);
  const orderedMatches = useMemo(() => sortDashboardMatches(filtered, sort), [filtered, sort]);
  const leagueGroups = useMemo(() => groupByLeague(orderedMatches), [orderedMatches]);
  const dayGroups = useMemo(() => groupDashboardDays(orderedMatches, today), [orderedMatches, today]);
  const todayCount = filtered.filter(match => localMatchDay(match.commence_time) === today).length;
  const liveCount = matches.filter(match => !(match.completed || match.is_finished || match.prediction?.is_finished) && (match.prediction?.is_live || match.is_live)).length;
  const advancedFilterCount = Number(betFilter !== "all") + Number(riskFilter !== "all");
  const activeFilters = [
    ...(hasSearch ? [{ key: "q", label: searchQuery, clear: () => setSearchQuery("") }] : []),
    ...(sport !== "all" ? [{ key: "sport", label: t(SPORT_TABS.find(tab => tab.key === sport)?.label || sport), clear: () => setSport("all") }] : []),
    ...(betFilter !== "all" ? [{ key: "bet", label: t(BET_FILTERS.find(filter => filter.key === betFilter)?.label || betFilter), clear: () => setBetFilter("all") }] : []),
    ...(riskFilter !== "all" ? [{ key: "risk", label: t(RISK_FILTERS.find(filter => filter.key === riskFilter)?.label || riskFilter), clear: () => setRiskFilter("all") }] : []),
  ];
  return (
    <AppLayout>
      <AdminShareProvider isAdmin={isAdmin} items={filtered} kind="picks">
      <div className="wp-catalogue mx-auto max-w-7xl space-y-5 px-4 py-6 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8" data-testid="dashboard-redesigned">
        <Card className="wp-catalogue-header relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-5 text-white sm:p-7">
          <div className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full bg-orange-500/15 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-xs font-semibold leading-5 text-orange-200">{formatDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · WinPulse</p>
                <h1 className="font-heading text-xl font-extrabold leading-tight tracking-tight sm:text-3xl">{experienceWords.allMatches}</h1>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300 sm:mt-2 sm:text-sm sm:leading-6">
                  {isFree ? picksLoading ? t("Chargement des pronostics…") : pickCounts.total === 0 ? t("Aucun pick disponible actuellement") : t("Accès gratuit · Passe Pro pour débloquer les picks réservés")
                    : t("{{plan}} actif · Tous les picks disponibles", { plan: (isAdmin ? "admin" : subscriptionTier).toUpperCase() })}
                </p>
              </div>
              <button type="button" onClick={handleRefresh} disabled={refreshing} aria-busy={refreshing}
                aria-label={refreshing ? t("Actualisation en cours…") : t("Actualiser les données")}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:opacity-60">
                <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{refreshing ? t("Actualisation en cours…") : t("Actualiser les données")}</span>
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2.5 sm:p-4">
                <p className="min-h-10 text-xs font-medium leading-4 sm:leading-5 text-slate-300">{t("Picks disponibles")}</p>
                <p className="mt-1 font-heading text-2xl sm:text-3xl font-extrabold tabular-nums" data-testid="available-picks-count" aria-live="polite">{picksLoading ? "…" : formatNumber(pickCounts.total)}</p>
              </div>
              <div className="rounded-xl border border-orange-300/15 bg-orange-500/10 p-2.5 sm:p-4">
                <p className="min-h-10 text-xs font-medium leading-4 sm:leading-5 text-orange-100">{t("Accessibles avec ton compte")}</p>
                <p className="mt-1 font-heading text-2xl sm:text-3xl font-extrabold tabular-nums text-orange-200" data-testid="accessible-picks-count">{picksLoading ? "…" : formatNumber(pickCounts.accessible)}</p>
              </div>
              <Link to="/app/live" className="flex min-h-11 flex-col items-start justify-between gap-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 sm:col-span-1 sm:block sm:p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-slate-300 sm:min-h-10"><Radio className="h-4 w-4 text-rose-300" aria-hidden="true" />{t("En direct")}</p>
                <p className="font-heading text-2xl font-extrabold tabular-nums text-rose-200 sm:mt-1 sm:text-3xl">{formatNumber(liveCount)}</p>
              </Link>
            </div>
          </div>
        </Card>

        <SavedSearches />
        <FreeDiscoveryPanel user={user} lastUpdate={lastUpdate} onUpgrade={() => navigate("/app/abonnement")} />

        <Card className="min-w-0 rounded-2xl border-orange-100 bg-white p-4 shadow-sm sm:p-5" data-testid="dashboard-search">
          <div className="mb-3">
            <h2 className="font-heading text-base font-bold text-slate-900 sm:text-xl">{t("Trouve ton prochain match")}</h2>
            <p className="mt-1 hidden text-sm leading-6 text-slate-500 sm:block">{t("Recherche une équipe ou explore les championnats. Les filtres se combinent.")}</p>
          </div>
          <label htmlFor="dashboard-search-input" className="sr-only">{t("Rechercher une rencontre")}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-orange-500" aria-hidden="true" />
            <input id="dashboard-search-input" type="search" value={searchQuery} maxLength={200} onChange={event => setSearchQuery(event.target.value)}
              placeholder={t("Équipe, championnat, pays, sport ou marché…")}
              className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 pe-12 ps-11 text-base text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 [&::-webkit-search-cancel-button]:appearance-none"
              aria-describedby="dashboard-search-help" data-testid="dashboard-search-input" />
            {searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label={t("Effacer la recherche")} className="absolute end-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><X className="h-4 w-4" aria-hidden="true" /></button>}
          </div>
          <p id="dashboard-search-help" className="sr-only sm:not-sr-only sm:mt-2 sm:text-xs sm:leading-5 sm:text-slate-500">{t("Exemples : Espagne, Ligue 1, Atlético, PSG, plus de 2.5. La recherche se combine avec les filtres sport, marché et risque.")}</p>
          <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1 sm:flex-wrap" role="group" aria-label={t("Sport")}>
            {SPORT_TABS.map(tab => <button key={tab.key} type="button" onClick={() => setSport(tab.key)} aria-pressed={sport === tab.key}
              className={`inline-flex min-h-11 shrink-0 max-w-full items-center gap-1.5 rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${sport === tab.key ? "border-orange-600 bg-orange-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50"}`}>
              <span aria-hidden="true">{tab.icon}</span><span>{t(tab.label)}</span>
              {tab.key !== "all" && sportCounts[tab.key] > 0 && <span className={`rounded-full px-1.5 text-xs tabular-nums ${sport === tab.key ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{formatNumber(sportCounts[tab.key])}</span>}
            </button>)}
          </div>
          <details className="mt-3 border-t border-slate-100 pt-2" data-testid="dashboard-advanced-filters">
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 rounded-lg py-2 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 [&::-webkit-details-marker]:hidden">
              <Filter className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />{t("Affiner les résultats")}
              {advancedFilterCount > 0 && <span className="rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-700">{t("{{count}} filtres avancés actifs", { count: formatNumber(advancedFilterCount) })}</span>}
              <ChevronRight className="ms-auto h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-4 pb-3 pt-2">
              <fieldset><legend className="mb-2 text-sm font-bold text-slate-700">{t("Marché")}</legend>
                <div className="flex flex-wrap gap-2">{BET_FILTERS.map(filter => <button key={filter.key} type="button" onClick={() => setBetFilter(filter.key)} aria-pressed={betFilter === filter.key}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${betFilter === filter.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{t(filter.label)}</button>)}</div>
              </fieldset>
              <fieldset><legend className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700"><ShieldCheck className="h-4 w-4 text-slate-400" aria-hidden="true" />{t("Niveau de risque")}</legend>
                <div className="flex flex-wrap gap-2">{RISK_FILTERS.map(filter => <button key={filter.key} type="button" onClick={() => setRiskFilter(filter.key)} data-testid={`risk-filter-${filter.key}`} aria-pressed={riskFilter === filter.key}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${riskFilter === filter.key ? filter.cls : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {t(filter.label)}{filter.key !== "all" && riskCounts[filter.key] > 0 && <span className={`rounded-full px-1.5 text-xs tabular-nums ${riskFilter === filter.key ? "bg-white/20" : "bg-slate-100"}`}>{formatNumber(riskCounts[filter.key])}</span>}
                </button>)}</div>
              </fieldset>
            </div>
          </details>
          {activeFilters.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3" role="group" aria-label={t("Filtres actifs")}>
            {activeFilters.map(filter => <button key={filter.key} type="button" onClick={filter.clear} aria-label={t("Retirer le filtre {{filter}}", { filter: filter.label })}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-2 text-sm font-medium text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><span className="min-w-0 break-words">{filter.label}</span><X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></button>)}
            <button type="button" onClick={resetFilters} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-slate-600 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">{t("Effacer les filtres")}</button>
          </div>}
          {hasSearch && <p className="mt-3 text-sm font-semibold leading-6 text-orange-700" aria-live="polite">{t(filtered.length === 1 ? "{{count}} rencontre trouvée dans les matchs chargés." : "{{count}} rencontres trouvées dans les matchs chargés.", { count: formatNumber(filtered.length) })}</p>}
        </Card>

        <AdminShareToolbar />
        <section id="dashboard-matches" className="scroll-mt-6" aria-labelledby="dashboard-matches-title" data-testid="dashboard-matches">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0"><h2 id="dashboard-matches-title" className="flex items-center gap-2 font-heading text-lg sm:text-xl font-bold text-slate-900"><Activity className="h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" />{t("Explorer les rencontres")}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500" aria-live="polite">{t("{{count}} rencontres · {{leagues}} championnats", { count: formatNumber(filtered.length), leagues: formatNumber(leagueGroups.length) })}</p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2"><label htmlFor="dashboard-sort" className="text-xs font-semibold text-slate-500">{t("Trier les matchs")}</label>
              <select id="dashboard-sort" value={sort} onChange={event => setSort(event.target.value)} title={t("Le tri reste indépendant pour chaque journée et chaque championnat.")}
                className="min-h-11 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200" data-testid="dashboard-sort">
                <option value="time">{t("Par horaire")}</option><option value="confidence">{t("Par confiance")}</option><option value="odds">{t("Par cote")}</option>
              </select>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs leading-5 text-slate-600 sm:text-sm"><p>{t("Les rencontres sont regroupées par date, puis par championnat.")}</p><p className="text-xs text-slate-500">{t("Horaires dans ton fuseau : {{zone}}", { zone: timeZone })}</p></div>
          {loading ? <div className="space-y-6">{[1,2].map(number => <div key={number}><Skeleton className="mb-3 h-7 w-48" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3].map(index => <Skeleton key={index} className="h-72 rounded-xl" />)}</div></div>)}</div>
            : filtered.length === 0 ? <Card className="rounded-2xl border-dashed border-slate-200 bg-white px-5 py-10 text-center"><Search className="mx-auto mb-3 h-7 w-7 text-orange-400" aria-hidden="true" /><p className="text-lg font-semibold text-slate-700">{hasSearch ? t("Aucune rencontre ne correspond à cette recherche et aux filtres.") : t("Aucun match pour ce filtre")}</p><p className="mt-2 text-sm leading-6 text-slate-500">{t("Essaie un nom d’équipe, un pays ou un championnat, ou retire les filtres.")}</p><Button type="button" variant="outline" className="mt-4 min-h-11" onClick={resetFilters}>{t("Réinitialiser les filtres")}</Button></Card>
              : <div className="space-y-6">
                <nav aria-label={t("Parcourir les journées")} className="flex min-w-0 gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 sm:flex-wrap sm:p-3" data-testid="dashboard-day-navigation">
                  {dayGroups.map(([key, dayMatches]) => <a key={key} href={`#day-${key}`} onClick={() => { setOpenDays(previous => ({ ...previous, [key]: true })); }} className={`shrink-0 inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${key === today ? "border-orange-500 bg-orange-500 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-orange-300"}`}>
                    <span className="min-w-0 break-words">{calendarDayTitle(key, today, t, formatDate)}</span><span className="rounded-full bg-black/5 px-2 py-0.5 text-xs tabular-nums">{formatNumber(dayMatches.length)}</span>
                  </a>)}
                </nav>
                {todayCount === 0 && <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 p-5" data-testid="dashboard-no-today"><h3 className="font-heading text-lg font-bold text-slate-900">{t("Matchs du jour")} · {formatDate(`${today}T12:00:00`, { day: "numeric", month: "long" })}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{t("Aucun match du jour avec ces filtres.")} {t("Voir les prochaines rencontres ci-dessous ou modifier les filtres.")}</p></div>}
                {dayGroups.map(([key, dayMatches], index) => <DaySection key={key} expanded={hasSearch || (openDays[key] ?? index === 0)} onToggle={() => setOpenDays(previous => ({ ...previous, [key]: !(previous[key] ?? index === 0) }))} dayKey={key} today={today} matches={dayMatches} isAdmin={isAdmin} isFree={isFree} showAllMatches={hasSearch} onUpgrade={() => navigate("/app/abonnement")} />)}
              </div>}

        </section>

        <details className="rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50/70 to-white" data-testid="dashboard-featured">
          <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 sm:px-5 [&::-webkit-details-marker]:hidden">
            <Trophy className="h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" /><h2 className="font-heading text-base font-bold text-slate-900">{t("Sélections à la une")}</h2>
            {!topLoading && !topError && <span className="rounded-full border border-orange-200 bg-white px-2 py-0.5 text-xs font-bold text-orange-700">{formatNumber(Math.min(visibleTopPicks.length, 3))}</span>}
            <span className="ms-auto text-xs font-semibold text-orange-700">{t("Ouvrir la sélection")}</span><ChevronRight className="h-4 w-4 shrink-0 text-orange-500 rtl:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-orange-100 p-4 sm:p-5">
            {topLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3].map(number => <Skeleton key={number} className="h-64 rounded-xl" />)}</div>
              : topError ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center" role="alert"><p className="text-sm leading-6 text-slate-700">{t("Impossible de charger les sélections à la une.")}</p><Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => { setTopLoading(true); setTopRetry(value => value + 1); }}>{t("Réessayer")}</Button></div>
                : visibleTopPicks.length === 0 ? <p className="py-3 text-sm leading-6 text-slate-500">{hasSearch ? t("Aucune sélection à la une pour cette recherche.") : t("Aucune sélection à la une pour le moment.")}</p>
                  : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleTopPicks.slice(0,3).map(prediction => <MatchCard key={prediction.match_id || prediction.id}
                    match={{ id: prediction.match_id || prediction.id, home_team: prediction.home_team, away_team: prediction.away_team, sport_title: prediction.sport_title, sport_key: prediction.sport_key, commence_time: prediction.commence_time, prediction }}
                    isAdmin={isAdmin} isFree={isFree} onUpgrade={() => navigate("/app/abonnement")} />)}</div>}
            <Link to="/app/top" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-orange-600 hover:underline">{t("Tout voir")}<ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></Link>
          </div>
        </details>

        <ValidatedSection picks={validated} />

        {isFree && !picksLoading && pickCounts.locked > 0 && <Card className="flex flex-col gap-4 rounded-2xl border-orange-200 bg-orange-50/60 p-4 sm:flex-row sm:items-center sm:p-5" data-testid="dashboard-upgrade">
          <div className="min-w-0 flex-1"><h2 className="flex items-center gap-2 font-heading text-base font-bold text-slate-900"><Sparkles className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />{t("Plus de sélections avec Pro")}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{t("{{count}} pronostics réservés aux abonnés actuellement.", { count: formatNumber(pickCounts.locked) })}</p><p className="mt-1 text-sm font-semibold text-orange-700">{t("{{price}} / 30 jours", { price: priceLabel })}</p></div>
          <Button type="button" className="min-h-11 w-full whitespace-normal border-0 bg-gradient-to-r from-orange-500 to-rose-500 px-5 text-white hover:opacity-90 sm:w-auto" onClick={() => navigate("/app/abonnement")}>{t("Découvrir Pro")}<ChevronRight className="ms-1 h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" /></Button>
        </Card>}
      </div>
      </AdminShareProvider>
    </AppLayout>
  );

}
function DaySection({ dayKey, today, matches, isAdmin, isFree, onUpgrade, showAllMatches, expanded, onToggle }) {
  const { t, formatDate, formatNumber } = useDashboardLanguage();
  const [showAllLeagues, setShowAllLeagues] = useState(false);
  const groups = groupByLeague(matches);
  const visibleGroups = showAllLeagues || showAllMatches ? groups : groups.slice(0, 4);
  const isToday = dayKey === today;
  const tomorrow = dayjs(today).add(1, "day").format("YYYY-MM-DD");
  const past = dayKey !== "undated" && dayKey < today;
  const counts = matches.reduce((result, match) => {
    const finished = match.completed || match.is_finished || match.prediction?.is_finished;
    const live = !finished && (match.is_live || match.prediction?.is_live);
    result[finished ? "finished" : live ? "live" : "upcoming"] += 1;
    return result;
  }, { live: 0, finished: 0, upcoming: 0 });
  return <section id={`day-${dayKey}`} aria-labelledby={`day-title-${dayKey}`} className="min-w-0 scroll-mt-6 space-y-4" data-testid="dashboard-day" data-day={dayKey}>
    <header className={`relative overflow-hidden rounded-2xl border p-3 sm:p-5 ${isToday ? "border-orange-300 bg-gradient-to-br from-orange-50 via-white to-orange-50" : "border-slate-200 bg-white"}`}>
      <button type="button" onClick={onToggle} disabled={showAllMatches} aria-expanded={expanded} aria-controls={`day-content-${dayKey}`} className="flex min-h-11 w-full items-center gap-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-xl" data-testid="day-toggle">
        <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <span className={`grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl text-lg ${isToday ? "bg-orange-500 text-white shadow-md shadow-orange-200" : "bg-slate-100 text-slate-700"}`} aria-hidden="true">{dayKey === "undated" ? "?" : formatDate(`${dayKey}T12:00:00`, { day: "2-digit" })}</span>
          <span className="min-w-0">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-orange-600">{t(isToday ? "Matchs du jour" : dayKey === tomorrow ? "Demain" : past ? "Jours précédents" : dayKey === "undated" ? "Date à confirmer" : "Prochains jours")}</span>
            <span role="heading" aria-level={3} id={`day-title-${dayKey}`} className="block break-words font-heading text-sm font-extrabold leading-5 text-slate-900 sm:text-xl sm:leading-7">{dayKey === "undated" ? t("Date à confirmer") : formatDate(`${dayKey}T12:00:00`, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500 sm:text-sm">{t("{{count}} rencontres · {{leagues}} championnats", { count: formatNumber(matches.length), leagues: formatNumber(groups.length) })}</span>
          </span>
        </span>
        <ChevronRight className={`h-5 w-5 shrink-0 text-orange-500 ${expanded ? "rotate-90" : "rtl:rotate-180"}`} aria-hidden="true" />
      </button>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
          {counts.live > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-rose-700"><Radio className="h-3.5 w-3.5" aria-hidden="true" />{formatNumber(counts.live)} {t("En direct")}</span>}
          {counts.upcoming > 0 && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-600">{formatNumber(counts.upcoming)} {t("À venir")}</span>}
          {counts.finished > 0 && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-500">{formatNumber(counts.finished)} {t("Terminés")}</span>}
        </div>
    </header>
    <div id={`day-content-${dayKey}`} hidden={!expanded} className={`space-y-3 sm:space-y-4 border-s-2 ps-1 sm:ps-4 ${isToday ? "border-orange-300" : "border-slate-200"}`}>
      {expanded && visibleGroups.map(([league, leagueMatches]) => <LeagueSection key={league} league={league} matches={leagueMatches} isAdmin={isAdmin} isFree={isFree} onUpgrade={onUpgrade} showAllMatches={showAllMatches} />)}
      {expanded && !showAllMatches && groups.length > 4 && <button type="button" onClick={() => setShowAllLeagues(value => !value)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold leading-6 text-orange-700 hover:border-orange-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" data-testid="day-show-more">{t(showAllLeagues ? "Réduire cette journée" : "Voir tous les championnats de cette journée")}<span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs">{formatNumber(groups.length)}</span></button>}
    </div>
  </section>;
}

function getLeagueEmoji(name = "") {
  const n = name.toLowerCase();
  if (n.includes("nba") || n.includes("basketball") || n.includes("euroleague")) return "🏀";
  if (n.includes("tennis") || n.includes("atp") || n.includes("wta") || n.includes("wimbledon")) return "🎾";
  if (n.includes("nhl") || n.includes("hockey")) return "🏒";
  if (n.includes("mlb") || n.includes("baseball")) return "⚾";
  if (n.includes("mma") || n.includes("ufc")) return "🥊";
  return "⚽";
}
function LeagueSection({ league, matches, isAdmin, isFree, onUpgrade, showAllMatches = false }) {
  const { t, formatNumber } = useDashboardLanguage();
  const [expanded, setExpanded] = useState(true);
  const [expandedAll, setExpandedAll] = useState(false);
  const liveCount = matches.filter(match => !(match.completed || match.is_finished || match.prediction?.is_finished) && (match.prediction?.is_live || match.is_live)).length;
  const visible = expandedAll || showAllMatches ? matches : matches.slice(0, 6);
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-2 sm:p-4" data-testid="dashboard-league">
    <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="mb-3 flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-lg" aria-hidden="true">{getLeagueEmoji(league)}</span>
      <h4 className="min-w-0 flex-1 basis-28 break-words font-heading text-sm sm:text-base font-bold leading-5 sm:leading-6 text-slate-900"><bdi>{league === "Autre" ? t("Autre") : league}</bdi></h4>
      {liveCount > 0 && <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600">{formatNumber(liveCount)} {t("LIVE")}</span>}
      <span className="rounded-full bg-white px-2 py-1 text-xs font-bold tabular-nums text-slate-500">{formatNumber(matches.length)}</span>
      <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : "rtl:rotate-180"}`} aria-hidden="true" />
    </button>
    {expanded && <>
      <div className="grid min-w-0 gap-2.5 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(match => <MatchCard key={match.id} match={match} isAdmin={isAdmin} isFree={isFree} onUpgrade={onUpgrade} />)}</div>
      {!showAllMatches && matches.length > 6 && <button type="button" onClick={() => setExpandedAll(value => !value)} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-6 text-slate-600 hover:border-orange-300 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" data-testid="league-show-more">
        {expandedAll ? t("Réduire cette liste") : t("Voir {{count}} autres rencontres", { count: formatNumber(matches.length - visible.length) })}
      </button>}
    </>}
  </div>;
}
function ValidatedSection({ picks }) {
  const { t, formatDate, formatNumber } = useDashboardLanguage();
  const today = dayjs().format("YYYY-MM-DD");
  const weekStart = dayjs().startOf("week").format("YYYY-MM-DD");
  const todayPicks = (picks || []).filter(pick => (pick.date || "").slice(0,10) === today);
  const weekPicks = (picks || []).filter(pick => { const date = (pick.date || "").slice(0,10); return date >= weekStart && date < today; });
  const stats = list => ({ wins: list.filter(pick => pick.won === true).length, losses: list.filter(pick => pick.won === false).length, pending: list.filter(pick => pick.won == null).length, total: list.length });
  const count = todayPicks.length + weekPicks.length;
  if (!count) return null;
  return <details className="rounded-2xl border border-slate-200 bg-white" data-testid="dashboard-results">
    <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 sm:px-5 [&::-webkit-details-marker]:hidden">
      <TrendingUp className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" /><div className="min-w-0 flex-1"><h2 className="font-heading text-base font-bold text-slate-900">{t("Résultats récents")}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{t("{{count}} pronostics sur la période", { count: formatNumber(count) })}</p></div>
      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{t("Track record")}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400 rtl:rotate-180" aria-hidden="true" />
    </summary>
    <div className="border-t border-slate-100 p-4 sm:p-5"><p className="mb-3 text-xs leading-5 text-slate-500">{t("Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.")}</p>
      <div className="grid gap-4 lg:grid-cols-2"><ValidatedBlock title={t("Aujourd’hui ({{date}})", { date: formatDate(new Date(), { day: "2-digit", month: "2-digit" }) })} picks={todayPicks} stats={stats(todayPicks)} /><ValidatedBlock title={t("Cette semaine · hors aujourd’hui")} picks={weekPicks} stats={stats(weekPicks)} /></div>
    </div>
  </details>;
}
function ValidatedBlock({ title, picks, stats }) {
  const { t, formatNumber } = useDashboardLanguage();
  const settled = stats.wins + stats.losses;
  return (
    <Card className="p-4 bg-white border-neutral-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-heading font-bold text-slate-900 text-sm">{title}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-0.5 text-emerald-600 font-bold" aria-label={`${t("Gagnés")} : ${formatNumber(stats.wins)}`} title={t("Gagnés")}><CheckCircle2 className="h-3 w-3"/>{formatNumber(stats.wins)}</span>
          <span className="flex items-center gap-0.5 text-rose-600 font-bold" aria-label={`${t("Perdus")} : ${formatNumber(stats.losses)}`} title={t("Perdus")}><XCircle className="h-3 w-3"/>{formatNumber(stats.losses)}</span>
          <span className="flex items-center gap-0.5 text-amber-600 font-bold" aria-label={`${t("En attente")} : ${formatNumber(stats.pending)}`} title={t("En attente")}><Clock className="h-3 w-3"/>{formatNumber(stats.pending)}</span>
          {settled > 0 && <span className="font-bold text-slate-700 ms-1" title={t("Taux calculé sur les picks gagnés et perdus ; les picks en attente sont exclus.")}>{t("{{rate}} de réussite", { rate: formatNumber(stats.wins / settled, { style: "percent", maximumFractionDigits: 0 }) })}</span>}
        </div>
      </div> {picks.length===0 ? (
        <div className="text-sm text-slate-400 py-4 text-center">{t("Aucun pick pour cette période.")}</div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {picks.slice(0,15).map((p,i) => {
            const icon = p.won===true ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0"/>
              : p.won===false ? <XCircle className="h-4 w-4 text-rose-500 shrink-0"/>
              : <Clock className="h-4 w-4 text-amber-500 shrink-0"/>;
            const bg = p.won===true ? "bg-emerald-50 border-emerald-100"
              : p.won===false ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100";
            return (
              <div key={p.id||i} className={`flex items-center gap-2 p-2 rounded-lg border ${bg} text-sm`}>
                {icon}
                <div className="flex-1 min-w-0">
                  <div dir="auto" className="font-semibold text-slate-900 break-words">{p.match||`${p.home_team} vs ${p.away_team}`}</div>
                  <div className="text-slate-500 break-words"><span className="font-bold text-slate-700">{translateBetText(p.pick, t, formatNumber, [p.home_team, p.away_team])}</span> @ {formatNumber(p.odds, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                {p.won===true && p.profit!=null && <span className="text-xs font-bold text-emerald-700 shrink-0">{formatNumber(Math.round(p.profit), { signDisplay: "always" })}u</span>}
              </div>
            );
          })}
          {picks.length > 15 && <p className="pt-3 text-sm text-slate-500">{t("Les 15 premiers picks sont affichés. Consulte le track record pour la suite.")}</p>}
        </div>
      )}
      <Link to="/resultats" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-orange-600 hover:underline">{t("Voir le track record")}</Link>
    </Card>
  );
}



const HOME_SPORTS = ["soccer","basketball","tennis","icehockey","americanfootball","baseball","mma"];
function experiencePaid(user){
  return Boolean(user?.is_admin || (user && String(user.subscription_tier || user.subscription || "free").toLowerCase() !== "free"));
}
function upcomingHomeMatch(match,now){
  return Number.isFinite(new Date(match.commence_time).getTime()) && new Date(match.commence_time).getTime()>now && !match.is_finished && !match.completed && !match.prediction?.is_finished && !match.is_live && !match.prediction?.is_live;
}
function sportFamily(match){ return String(match.sport_key || "").split('_')[0]; }
function PreferenceEditor({matches}){
  const w=useExperienceCopy(); const {preferences,loading,busy,failed,save,retry}=useExperiencePreferences();
  const [sports,setSports]=useState(preferences.sports),[leagues,setLeagues]=useState(preferences.leagues),[notice,setNotice]=useState(""),[leagueQuery,setLeagueQuery]=useState("");
  useEffect(()=>{setSports(preferences.sports);setLeagues(preferences.leagues);},[preferences]);
  const options=[...new Set([...preferences.leagues,...matches.filter(m=>!sports.length||sports.includes(sportFamily(m))).map(m=>m.sport_title).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
  return <details className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="home-preferences"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-slate-800"><SlidersHorizontal className="h-5 w-5 text-orange-600" />{w.preferences}</summary>
    <p className="mt-3 text-sm leading-6 text-slate-500">{w.preferenceHint}</p>
    {failed&&<p role="alert" className="mt-3 text-sm text-amber-800">{w.error}<button type="button" onClick={retry} className="ms-3 min-h-11 px-3 font-bold">↻</button></p>}
    <fieldset disabled={busy||loading||failed} className="mt-4"><legend className="text-sm font-bold">{w.sports}</legend><div className="mt-2 flex flex-wrap gap-2">{HOME_SPORTS.map(key=><label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${sports.includes(key)?'border-orange-300 bg-orange-50 text-orange-800':'border-slate-200 text-slate-600'}`}><input type="checkbox" checked={sports.includes(key)} onChange={()=>{setNotice("");setSports(old=>old.includes(key)?old.filter(x=>x!==key):[...old,key]);}} className="accent-orange-600" />{w[key]}</label>)}</div></fieldset>
    <label className="mt-5 block text-sm font-bold" htmlFor="home-leagues">{w.leagues}</label><input id="home-leagues" type="search" value={leagueQuery} onChange={event=>setLeagueQuery(event.target.value)} placeholder={w.leagues} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base"/><fieldset disabled={busy||loading||failed} className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2"><legend className="sr-only">{w.leagues}</legend>{options.filter(name=>name.toLocaleLowerCase().includes(leagueQuery.toLocaleLowerCase())).slice(0,80).map(name=><label key={name} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-white"><input type="checkbox" checked={leagues.includes(name)} disabled={!leagues.includes(name)&&leagues.length>=20} onChange={()=>{setNotice("");setLeagues(old=>old.includes(name)?old.filter(x=>x!==name):[...old,name]);}} className="shrink-0 accent-orange-600"/><span className="break-words">{name}</span></label>)}</fieldset>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={busy||loading||failed} onClick={async()=>{const ok=await save({sports,leagues});setNotice(ok?w.saved:w.error);}} className="min-h-11 rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">{busy?w.saving:w.save}</button><p role="status" className="text-sm text-slate-600">{notice}</p></div>
  </details>;
}
function SavedSearches(){
 const w=useExperienceCopy();const {user}=useAuth();const {preferences,loading,busy,failed,save,retry}=useExperiencePreferences();const [params,setParams]=useSearchParams();const [name,setName]=useState("");const [notice,setNotice]=useState("");
 const filters=Array.isArray(preferences.saved_filters)?preferences.saved_filters:[];const limit=experiencePaid(user)?8:3;
 return <details className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="saved-searches"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-slate-800"><Bookmark className="h-4 w-4 text-orange-600" />{w.savedSearches}<span className="text-slate-400">{filters.length}/{limit}</span></summary><p className="mt-2 text-xs leading-5 text-slate-500">{w.searchLimit}</p>
 {failed&&<p className="mt-2 text-sm text-amber-800" role="alert">{w.error}<button type="button" onClick={retry} className="ms-3 min-h-11 px-3 font-bold">↻</button></p>}
 <div className="mt-3 space-y-2">{filters.map((item,index)=><div key={index} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-2"><button type="button" className="min-h-11 min-w-0 flex-1 break-words text-start text-sm font-semibold text-slate-700" onClick={()=>{const next=new URLSearchParams();Object.entries(item.query||{}).forEach(([key,value])=>next.set(key,value));setParams(next);}}>{item.name}<span className="ms-2 text-orange-700">→</span></button><button type="button" disabled={busy||loading||failed} aria-label={`${w.delete}: ${item.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700" onClick={async()=>{const ok=await save({saved_filters:filters.filter((_,i)=>i!==index)});setNotice(ok?w.saved:w.error);}}><X className="h-4 w-4" /></button></div>)}</div>
 <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={async event=>{event.preventDefault();if(filters.length>=limit||!name.trim())return;const query={};['q','sport','risk','bet','sort'].forEach(key=>{if(params.has(key))query[key]=params.get(key);});const ok=await save({saved_filters:[...filters,{name:name.trim(),query}]});setNotice(ok?w.saved:w.error);if(ok)setName("");}}><label className="sr-only" htmlFor="saved-search-name">{w.searchName}</label><input id="saved-search-name" value={name} maxLength={50} onChange={event=>setName(event.target.value)} required placeholder={w.searchName} disabled={busy||loading||failed||filters.length>=limit} className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-base"/><button disabled={busy||loading||failed||filters.length>=limit} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">{w.saveSearch}</button></form><p role="status" className="mt-2 text-sm text-slate-500">{notice}</p>
 </details>;
}
function HomeFollowRows({rows}){
 const w=useExperienceCopy();const i18n=usePageLanguage();
 return <div className="grid gap-3 sm:grid-cols-2">{rows.map((row,index)=><Link key={row.id||index} to={`/app/match/${encodeURIComponent(row.match_id||row.id)}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-orange-300" data-testid="home-follow-row"><p className="text-xs text-slate-500">{i18n.formatDate(row.commence_time,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p><h3 className="mt-2 break-words text-sm font-extrabold leading-6 text-slate-900"><bdi>{row.home_team} · {row.away_team}</bdi></h3><p className="mt-2 break-words text-sm font-semibold text-orange-700"><bdi>{i18n.bet(row.pick)}</bdi></p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-slate-500">{w.initialOdds} <bdi className="font-mono font-bold">{row.pick_odds??'—'}</bdi></span><span className={`rounded-full px-2 py-1 font-bold ${row.result==='won'?'bg-emerald-50 text-emerald-700':row.result==='lost'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-600'}`}>{row.result==='won'?w.won:row.result==='lost'?w.lost:row.result==='void'?w.void:w.pending}</span></div></Link>)}</div>;
}
function ExperienceHome(){
 const {user}=useAuth();const w=useExperienceCopy();const i18n=usePageLanguage();const navigate=useNavigate();const {matches,loading,error,lastUpdate,refresh}=useRealtimeMatches();const {preferences}=useExperiencePreferences();const follows=useFollowedPicks();const [now,setNow]=useState(Date.now());
 useExperienceEvent('home');
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60000);return()=>window.clearInterval(timer);},[]);
 const upcoming=useMemo(()=>matches.filter(m=>upcomingHomeMatch(m,now)).sort((a,b)=>new Date(a.commence_time)-new Date(b.commence_time)),[matches,now]);
 const preferred=useMemo(()=>upcoming.filter(m=>(!preferences.sports.length||preferences.sports.includes(sportFamily(m)))&&(!preferences.leagues.length||preferences.leagues.includes(m.sport_title))).slice(0,experiencePaid(user)?6:3),[upcoming,preferences,user]);
 const featured=upcoming.find(m=>m.prediction?.pick&&!m.prediction.locked);
 const rows=follows?.follows||[];const active=rows.filter(row=>row.state!=='resolved').sort((a,b)=>new Date(a.commence_time)-new Date(b.commence_time)).slice(0,4);const resolved=rows.filter(row=>row.state==='resolved').slice(0,4);
 const counts=getAvailablePickCounts(matches);const paid=experiencePaid(user);
 return <div className="wp-home mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8" data-testid="experience-home">
   <section className="wp-home-hero"><StadiumBackdrop/><div className="wp-hero-shade" aria-hidden="true"/><div className="wp-hero-content"><p className="wp-eyebrow">WinPulse / {i18n.formatDate(new Date(now),{day:'numeric',month:'long'})}</p><h1>{w.hello}</h1><p className="wp-hero-intro">{w.homeIntro}</p><div className="wp-hero-links"><Link to="/app/aujourdhui" className="wp-primary-button">{w.allMatches}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></Link><Link to="/app/suivi" className="wp-quiet-button">{w.follow}<Bookmark className="h-4 w-4"/></Link></div></div>
     {featured&&<Link to={`/app/match/${featured.id}`} className="wp-featured-match" data-testid="premium-featured-match"><div className="wp-featured-meta"><span>{w.upcoming}</span><time dateTime={featured.commence_time}>{i18n.formatDate(featured.commence_time,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div><p className="wp-featured-league">{featured.sport_title}</p><div className="wp-featured-teams">{[['home',featured.home_team],['away',featured.away_team]].map(([side,name])=><div key={side}><TeamBadge name={name} src={badgeUrl(featured,side)} kind={featured[`${side}_media`]?.kind} size="large"/><strong><bdi>{name}</bdi></strong></div>)}<span aria-hidden="true">VS</span></div><div className="wp-featured-pick"><div><small>{i18n.bet(featured.prediction.market_label || 'Pronostic')}</small><strong><bdi>{i18n.bet(featured.prediction.pick)}</bdi></strong></div><bdi>{Number.isFinite(Number(featured.prediction.pick_odds))&&Number(featured.prediction.pick_odds)>1?i18n.formatNumber(Number(featured.prediction.pick_odds),{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}</bdi></div><span className="wp-featured-open">{w.open}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></span></Link>}
   </section>
   {featured&&<MediaCredits match={featured}/>}
   <div className="wp-overview-strip">{[[loading?'—':counts.total,w.selections,Layers],[loading?'—':upcoming.length,w.upcoming,CalendarDays],[follows?.loading?'—':rows.filter(r=>r.state!=='resolved').length,w.follow,Bookmark]].map(([value,label,Icon],i)=><div key={i}><span className="wp-overview-icon"><Icon className="h-5 w-5" aria-hidden="true"/></span><div><strong>{value}</strong><p>{label}</p></div></div>)}</div>
   {error&&<div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><span>{w.error}</span><button type="button" onClick={()=>refresh().catch(()=>{})} className="min-h-11 px-3 font-bold" aria-label={i18n.t('Actualiser')}><RefreshCw className="h-4 w-4"/></button></div>}
   <div className="wp-home-grid"><div className="wp-home-main">
     {!paid&&<FreeDiscoveryPanel compact user={user} lastUpdate={lastUpdate} onUpgrade={()=>navigate('/app/abonnement')}/>}
     {(paid||preferences.sports.length>0||preferences.leagues.length>0)&&<section><HomeSectionTitle title={preferences.sports.length||preferences.leagues.length?w.forYou:w.upcoming} to="/app/aujourdhui"/><div className="mt-4">{loading&&!matches.length?<div className="wp-home-cards">{[1,2,3,4].map(i=><Skeleton key={i} className="h-80 rounded-2xl"/>)}</div>:preferred.length?<div className="wp-home-cards">{preferred.map(match=><MatchCard key={match.id} match={match} isFree={!paid} isAdmin={Boolean(user?.is_admin)} onUpgrade={()=>navigate('/app/abonnement')}/>)}</div>:<p className="rounded-2xl bg-white p-5 text-sm leading-6 text-slate-500">{w.emptyMatches}</p>}</div></section>}
     <div className="grid gap-4 sm:grid-cols-2"><ExperienceTool to="/app/combines" title={w.combos} text={w.comboIntro} icon={Layers}/><ExperienceTool to="/app/explorer" title={w.explore} text={w.exploreIntro} icon={SlidersHorizontal}/></div>
   </div><aside className="wp-home-rail" aria-label={w.follow}>
     <section className="wp-rail-section"><HomeSectionTitle title={w.next} to="/app/suivi"/><div className="mt-4">{follows?.failed?<p className="rounded-xl bg-amber-50 p-4 text-sm">{w.error}</p>:active.length?<HomeFollowRows rows={active}/>:<div className="wp-empty-state"><Bookmark className="h-6 w-6" aria-hidden="true"/><p>{w.emptyFollow}</p><Link to="/app/aujourdhui">{w.allMatches} →</Link></div>}</div></section>
     <section className="wp-rail-section"><HomeSectionTitle title={w.lastResults} to="/app/suivi"/><div className="mt-4">{resolved.length?<HomeFollowRows rows={resolved}/>:<p className="text-sm leading-6 text-slate-500">{w.noResults}</p>}</div></section>
     <PreferenceEditor matches={matches}/>
     {!paid&&<section className="wp-pro-offer"><span className="wp-pro-chip">WinPulse Pro</span><h2>{w.proTitle}</h2><p>{w.proIntro}</p><Link to="/app/abonnement" className="wp-primary-button">{w.upgrade}<ArrowRight className="h-4 w-4"/></Link></section>}
   </aside></div><p className="mt-8 text-xs leading-6 text-slate-500">{w.note}</p>
 </div>;
}
function HomeSectionTitle({title,to}){const w=useExperienceCopy();return <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h2><Link to={to} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-orange-700">{w.open}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></Link></div>;}
function ExperienceTool({to,title,text,icon:Icon}){const w=useExperienceCopy();return <Link to={to} className="group flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-orange-300 hover:shadow-md sm:p-6"><span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-600"><Icon className="h-6 w-6"/></span><h2 className="text-lg font-extrabold text-slate-900">{title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{text}</p><span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-700">{w.open}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></span></Link>;}
export default function DashboardPage(){return <AppLayout><ExperienceHome/></AppLayout>;}
export function ExplorePage(){const w=useExperienceCopy();useExperienceEvent('explore');return <AppLayout><div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6"><header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-widest text-orange-300">WinPulse</p><h1 className="mt-3 text-3xl font-extrabold">{w.explore}</h1><p className="mt-3 text-sm leading-6 text-slate-300">{w.exploreIntro}</p></header><div className="grid gap-4 sm:grid-cols-2"><ExperienceTool to="/app/combines" title={w.combos} text={w.comboIntro} icon={Layers}/><ExperienceTool to="/app/montante" title={w.montante} text={w.montanteText} icon={TrendingUp}/><ExperienceTool to="/app/value-bets" title={w.value} text={w.valueText} icon={Activity}/><ExperienceTool to="/app/live" title={w.live} text={w.liveText} icon={Radio}/></div><p className="text-xs leading-6 text-slate-500">{w.note}</p><ExperienceAdminSummary/><EngineObservationPanel/></div></AppLayout>;}
export function CombinationsHubPage(){const w=useExperienceCopy();useExperienceEvent('combos');return <AppLayout><div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6"><header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-9"><Link to="/app/explorer" className="inline-flex min-h-11 items-center text-sm text-orange-300">← {w.explore}</Link><h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{w.combos}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{w.comboIntro}</p></header><div className="grid gap-4 md:grid-cols-3"><ExperienceTool to="/app/combines/recommandations" title={w.recommendations} text={w.recommendationsText} icon={Layers}/><ExperienceTool to="/app/combines/personnaliser" title={w.personal} text={w.personalText} icon={SlidersHorizontal}/><ExperienceTool to="/app/builder" title={w.builder} text={w.builderText} icon={Bookmark}/></div><p className="rounded-2xl bg-orange-50 p-4 text-sm leading-6 text-orange-900">{w.note}</p></div></AppLayout>;}
function ExperienceAdminSummary(){const {user}=useAuth();const w=useExperienceCopy();const [data,setData]=useState(null);useEffect(()=>{if(!user?.is_admin)return;let active=true;api.get('/experience/admin/summary',{timeout:10000}).then(r=>{if(active)setData(r.data);}).catch(()=>{});return()=>{active=false;};},[user?.id,user?.is_admin]);if(!user?.is_admin||!data)return null;return <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="experience-admin-summary"><h2 className="font-bold">{w.usage}</h2><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{[['home',w.home],['catalogue',w.allMatches],['pro_view',w.pro],['pro_checkout',w.payment],['combos',w.combos],['explore',w.explore]].map(([key,label])=><div key={key} className="rounded-xl bg-slate-50 p-3"><p className="font-mono text-xl font-bold">{data.events?.[key]||0}</p><p className="text-xs leading-5 text-slate-500">{label}</p></div>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">{w.usageNote}</p></section>;}

function EngineObservationPanel(){
 const {user}=useAuth();const w=useExperienceCopy();const i18n=usePageLanguage();const [report,setReport]=useState(null);
 useEffect(()=>{if(!user?.is_admin)return;const controller=new AbortController();api.get('/admin/prediction-model/status',{signal:controller.signal,timeout:15000}).then(({data})=>{if(!controller.signal.aborted)setReport(data);}).catch(()=>{});return()=>controller.abort();},[user?.id,user?.is_admin]);
 if(!user?.is_admin)return null;
 const r=report?.prospective||{};const number=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?i18n.formatNumber(Number(v),{maximumFractionDigits:4}):'—';
 return <details className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="engine-observation"><summary className="flex min-h-11 cursor-pointer items-center gap-2 font-bold text-slate-900"><Activity className="h-4 w-4 text-orange-600"/>{w.modelAudit}</summary><p className="mt-3 text-sm leading-6 text-slate-600">{w.modelNote}</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{[[w.modelSamples,r.settled_matches],[w.modelBase,r.baseline_brier],[w.modelTest,r.hybrid_brier]].map(([label,value],index)=><div key={index} className="rounded-xl bg-slate-50 p-3"><p className="font-mono text-xl font-bold text-slate-900">{number(value)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{label}</p></div>)}</div><p className="mt-3 text-xs leading-6 text-slate-500">{w.modelMetric}</p></details>;
}
