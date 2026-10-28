import { TeamBadge, badgeUrl } from "@/components/MatchCard";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Zap,
  TrendingUp,
  Brain,
  Shield,
  CheckCircle2,
  ArrowRight,
  Trophy,
  BarChart3,
  Sparkles,
  Smartphone,
  Lock,
  Gift,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, useExperienceCopy } from "@/components/AppLayout";
import api from "@/lib/api";

// Même archive que /track-record ; endpoint inclus dans server.py livré.
const DAILY_RESULTS_ENDPOINT = "/track-record/highlights";
const RESULTS_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Styles limités à la vitrine ; aucune dépendance d'animation supplémentaire.
const LANDING_MOTION_CSS = `
  .wp-landing { overflow-x: clip; }
  .wp-landing .wp-enter {
    animation: wp-landing-enter .65s cubic-bezier(.22,1,.36,1) backwards;
    animation-delay: var(--wp-delay, 0ms);
  }
  .wp-landing .wp-revealed {
    animation: wp-landing-enter .55s cubic-bezier(.22,1,.36,1) backwards;
    animation-delay: var(--wp-delay, 0ms);
  }
  .wp-landing .wp-hero-glow {
    animation: wp-landing-glow 3.5s ease-out backwards;
  }
  .wp-landing .wp-interactive-card {
    transition: transform .25s ease;
  }
  .wp-landing .wp-interactive-card:hover {
    border-color: rgb(251 146 60 / .65);
  }
  .wp-landing .wp-action {
    position: relative;
    overflow: hidden;
    transition: transform .2s ease;
  }
  .wp-landing .wp-action::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(110deg, transparent 25%, rgb(255 255 255 / .22) 50%, transparent 75%);
    transform: translateX(-120%);
  }
  .wp-landing .wp-action:focus-visible::after {
    animation: wp-landing-sheen .6s ease-out;
  }
  .wp-landing .wp-action:active { transform: scale(.98); }
  .wp-landing .wp-result-link { text-underline-offset: 4px; }
  .wp-landing .wp-result-link:hover { text-decoration: underline; }
  @media (hover: hover) and (pointer: fine) {
    .wp-landing .wp-interactive-card:hover { transform: translateY(-4px); }
    .wp-landing .wp-action:hover { transform: translateY(-2px); }
    .wp-landing .wp-action:hover::after { animation: wp-landing-sheen .6s ease-out; }
  }
  @keyframes wp-landing-enter {
    from { opacity: 0; transform: translate3d(0, 18px, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes wp-landing-glow {
    from { opacity: .35; transform: translate3d(0, 20px, 0) scale(.94); }
    to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
  }
  @keyframes wp-landing-sheen {
    to { transform: translateX(120%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .wp-landing *, .wp-landing *::before, .wp-landing *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
    .wp-landing .wp-action:hover, .wp-landing .wp-action:active,
    .wp-landing .wp-interactive-card:hover { transform: none !important; }
  }
`;

function useLandingMotion() {
  const root = useRef(null);
  useEffect(() => {
    if (!root.current || typeof window.IntersectionObserver !== "function") return;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (preference?.matches) return;
    const observer = new window.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("wp-revealed");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    // Le contenu reste visible même si l'observateur n'est pas disponible.
    root.current.querySelectorAll("[data-wp-reveal]").forEach(node => observer.observe(node));
    const stop = () => { if (preference?.matches) observer.disconnect(); };
    preference?.addEventListener?.("change", stop);
    return () => {
      observer.disconnect();
      preference?.removeEventListener?.("change", stop);
    };
  }, []);
  return root;
}

function isAvailablePick(row) {
  if (!row || typeof row !== "object") return false;
  const unlocked = [undefined, null, false, 0, "false"].includes(row.locked);
  return unlocked && typeof row.pick === "string" && Boolean(row.pick.trim());
}

const LANDING_EXTRA = {
 fr:["Pourquoi cette sélection ?","Estimation du moteur","Sources de cotes","bookmaker(s)","Données de sources non communiquées.","Point de vigilance","Une estimation reste incertaine et la cote peut évoluer.","Date à confirmer","Découvre une fiche WinPulse","Un exemple réel actuellement disponible","Match","Marché","Sélection","Cote","Avec Pro : autres sélections, combinés et outils d’analyse.","Aucune sélection publique disponible pour le moment.","Comparer les accès","Free : sélections gratuites et historique public.","Pro : sélections et outils réservés aux abonnés.","Estimation non communiquée.","Rencontres visibles ; détails réservés selon l’accès."],
 en:["Why this selection?","Model estimate","Odds sources","bookmaker(s)","Source details unavailable.","Risk to consider","An estimate is uncertain and odds can change.","Time to be confirmed","Explore a WinPulse match card","A real selection currently available","Match","Market","Selection","Odds","With Pro: more selections, accumulators and analysis tools.","No public selection available currently.","Compare access","Free: available picks and public history.","Pro: subscriber selections and tools.","Estimate unavailable.","Fixtures visible; details depend on access."],
 es:["¿Por qué esta selección?","Estimación del motor","Fuentes de cuotas","casa(s) de apuestas","Fuentes no disponibles.","Riesgo a considerar","Una estimación es incierta y la cuota puede cambiar.","Hora por confirmar","Descubre una ficha WinPulse","Una selección real disponible","Partido","Mercado","Selección","Cuota","Con Pro: más selecciones, combinadas y herramientas de análisis.","No hay una selección pública disponible.","Comparar accesos","Free: selecciones gratis e historial público.","Pro: selecciones y herramientas para abonados.","Estimación no disponible.","Partidos visibles; detalles según el acceso."],
 pt:["Porquê esta seleção?","Estimativa do motor","Fontes de cotas","operador(es)","Fontes não disponíveis.","Risco a considerar","Uma estimativa é incerta e a cota pode mudar.","Hora por confirmar","Descobre uma ficha WinPulse","Uma seleção real disponível","Jogo","Mercado","Seleção","Cota","Com Pro: mais seleções, combinados e ferramentas de análise.","Nenhuma seleção pública disponível.","Comparar acessos","Free: seleções grátis e histórico público.","Pro: seleções e ferramentas para subscritores.","Estimativa indisponível.","Jogos visíveis; detalhes conforme o acesso."],
 de:["Warum diese Auswahl?","Modellschätzung","Quotenquellen","Anbieter","Quellen nicht angegeben.","Risiko","Eine Schätzung ist unsicher und Quoten können sich ändern.","Uhrzeit offen","Eine WinPulse-Partie entdecken","Eine aktuell verfügbare echte Auswahl","Spiel","Markt","Auswahl","Quote","Mit Pro: weitere Tipps, Kombis und Analysewerkzeuge.","Derzeit keine öffentliche Auswahl verfügbar.","Zugang vergleichen","Free: kostenlose Tipps und öffentliche Ergebnisse.","Pro: Tipps und Werkzeuge für Abonnenten.","Schätzung nicht verfügbar.","Spiele sichtbar; Details je nach Zugang."],
 ar:["لماذا هذا الاختيار؟","تقدير المحرك","مصادر المعاملات","مزود","تفاصيل المصادر غير متاحة.","نقطة انتباه","التقدير غير مؤكد وقد يتغير المعامل.","الموعد غير مؤكد","اكتشف بطاقة WinPulse","اختيار حقيقي متاح حالياً","المباراة","السوق","الاختيار","المعامل","مع Pro: اختيارات ورهانات مجمعة وأدوات تحليل إضافية.","لا يوجد اختيار عام متاح حالياً.","قارن الاشتراكات","Free: اختيارات مجانية وسجل عام.","Pro: اختيارات وأدوات للمشتركين.","التقدير غير متاح.","المباريات ظاهرة والتفاصيل حسب الاشتراك."]
};
function landingTime(value,locale,fallback) {
  const d = new Date(value); return value && Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat(locale,{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(d) : fallback;
}
function homepagePicks(data) {
  if (!Array.isArray(data)) {
    const error = new Error("Unexpected predictions response");
    error.code = "INVALID_TOP_PREDICTIONS_RESPONSE";
    throw error;
  }
  const rows = data.filter((row) => row && typeof row === "object");
  // Chercher la sélection disponible AVANT de limiter l'aperçu à trois cartes.
  return [...rows.filter(isAvailablePick), ...rows.filter((row) => !isAvailablePick(row))].slice(0, 3);
}

function yesterdayDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESULTS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day") - 1)).toISOString().slice(0, 10);
}

function eventDate(value) {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESULTS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type).value).join("-");
}

function readDailyResults(data, date, now = new Date()) {
  if (!data || data.date !== date || data.time_zone !== RESULTS_TIME_ZONE || data.complete !== true || data.source !== "track_record") {
    throw new Error("Daily results must describe the complete requested day");
  }
  const summary = data.summary;
  const keys = ["total", "won", "lost", "pending", "void"];
  if (!summary || keys.some((key) => !Number.isSafeInteger(summary[key]) || summary[key] < 0)
    || summary.total !== summary.won + summary.lost + summary.pending + summary.void
    || !Array.isArray(data.winners)) {
    throw new Error("Invalid daily results summary");
  }
  const seen = new Set();
  const winners = data.winners.filter((row) => {
    if (!row || typeof row.id !== "string" || !row.id.trim() || seen.has(row.id)) return false;
    if (row.status !== "won" || row.result_verified !== true) return false;
    if (["home_team", "away_team", "pick", "final_score"].some((key) => typeof row[key] !== "string" || !row[key].trim())) return false;
    if (typeof row.pick_odds !== "number" || !Number.isFinite(row.pick_odds) || row.pick_odds <= 1) return false;
    const start = Date.parse(row.start_time);
    const published = Date.parse(row.published_at);
    const settled = Date.parse(row.settled_at);
    if (eventDate(row.start_time) !== date || !eventDate(row.published_at) || !eventDate(row.settled_at)
      || !Number.isFinite(published) || !Number.isFinite(settled) || published >= start || settled < start || settled > now.getTime()) return false;
    seen.add(row.id);
    return true;
  });
  if (winners.length > summary.won) throw new Error("Winners exceed the daily summary");
  return {
    date,
    summary,
    winners: winners.sort((a, b) => b.pick_odds - a.pick_odds || Date.parse(b.start_time) - Date.parse(a.start_time) || a.id.localeCompare(b.id)).slice(0, 3),
  };
}

export default function LandingPage() {
  const experienceWords = useExperienceCopy();
  const { t, locale, formatNumber, language } = useLanguage();
  const telegramLabel = ({fr: "Rejoindre notre canal Telegram", en: "Join our Telegram channel", es: "Únete a nuestro canal de Telegram", pt: "Junta-te ao nosso canal Telegram", de: "Unserem Telegram-Kanal beitreten", ar: "انضم إلى قناتنا على تيليغرام"})[language] || "Rejoindre notre canal Telegram";
  const motionRoot = useLandingMotion();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [livePicks, setLivePicks] = useState([]);
  const extra = LANDING_EXTRA[language] || LANDING_EXTRA.fr;
  const [picksStatus, setPicksStatus] = useState("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [resultsDate, setResultsDate] = useState(yesterdayDate);
  const [dailyResults, setDailyResults] = useState(null);
  const [resultsStatus, setResultsStatus] = useState(DAILY_RESULTS_ENDPOINT ? "loading" : "disabled");
  const [resultsReloadKey, setResultsReloadKey] = useState(0);
  const resultsDateLabel = new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${resultsDate}T12:00:00Z`));
  const signupUrl = typeof window === "undefined" ? "/register" : (() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    return ref ? `/register?ref=${encodeURIComponent(ref)}` : "/register";
  })();

  function showPicks() {
    document.getElementById("picks-du-jour")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function showPricing() {
    document.getElementById("pricing")?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      block: "start",
    });
  }

  useEffect(() => {
    let active = true;
    setPicksStatus("loading");
    api.get("/predictions/top")
      .then((response) => {
        const rows = homepagePicks(response.data);
        if (!active) return;
        setLivePicks(rows);
        setPicksStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        // Diagnostic développeur : aucun numéro, email, jeton ou payload logué.
        console.warn("WinPulse: public predictions request failed", {
          status: error?.response?.status ?? null,
          code: error?.code ?? null,
        });
        setLivePicks([]);
        setPicksStatus("error");
      });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!DAILY_RESULTS_ENDPOINT) return;
    const timer = window.setInterval(() => setResultsDate(yesterdayDate()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!DAILY_RESULTS_ENDPOINT) {
      setDailyResults(null);
      setResultsStatus("disabled");
      return;
    }
    let active = true;
    setDailyResults(null);
    setResultsStatus("loading");
    api.get(DAILY_RESULTS_ENDPOINT, { params: { date: resultsDate, time_zone: RESULTS_TIME_ZONE, limit: 3 } })
      .then(({ data }) => {
        const results = readDailyResults(data, resultsDate);
        if (!active) return;
        setDailyResults(results);
        setResultsStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setDailyResults(null);
        setResultsStatus("error");
      });
    return () => { active = false; };
  }, [resultsDate, resultsReloadKey]);

  return (
    <div ref={motionRoot} className="wp-landing min-h-screen w-full min-w-0 bg-neutral-50">
      <style>{LANDING_MOTION_CSS}</style>
      <header className="sticky top-0 z-50 w-full max-w-full border-b border-neutral-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 flex-wrap py-2 w-full max-w-7xl items-center gap-2 px-3 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
            data-testid="brand-link"
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-lg shadow-orange-600/30 wp-gradient-warm sm:h-9 sm:w-9 sm:rounded-xl">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} fill="white" />
            </div>
            <div className="min-w-0">
              <div className="font-heading text-base font-extrabold leading-none sm:text-lg">WinPulse</div>
              <div className="mt-1 hidden text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 md:block">
                {t("Analyses sportives")}
              </div>
            </div>
          </Link>

          <nav className="ms-auto flex max-w-full flex-wrap min-w-0 items-center gap-1 sm:gap-2">
            <Link to="/resultats" className="hidden lg:inline-flex">
              <Button variant="ghost" size="sm" data-testid="public-trackrecord-link">
                {t("Historique des résultats")}
              </Button>
            </Link>

            <Link to="/blog" className="hidden md:inline-flex">
              <Button
                variant="ghost"
                size="sm"
                className="relative font-bold text-orange-700 hover:bg-orange-50"
                data-testid="public-blog-link"
              >
                {t("Blog")}
                <span className="ms-1.5 rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  {t("Articles")}
                </span>
              </Button>
            </Link>

            {user ? (
              <Button
                data-testid="open-app-btn"
                className="h-9 shrink-0 border-0 px-3 text-xs text-white hover:opacity-90 wp-gradient-warm sm:px-4 sm:text-sm"
                onClick={() => navigate("/app")}
              >
                {t("Ouvrir l'app")}
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/login")}
                  data-testid="header-login-btn"
                  className="h-9 shrink-0 px-2 text-xs sm:px-3 sm:text-sm"
                >
                  {t("Connexion")}
                </Button>
                <Button
                  className="h-9 shrink-0 border-0 px-3 text-xs text-white hover:opacity-90 wp-gradient-warm sm:px-4 sm:text-sm"
                  onClick={() => navigate(signupUrl)}
                  data-testid="header-signup-btn"
                >
                  <span className="sm:hidden">{t("S'inscrire")}</span>
                  <span className="hidden sm:inline">{t("Démarrer gratuit")}</span>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden wp-gradient-hero">
        {/* Lumières décoratives : une entrée douce, puis un fond stable. */}
        <div aria-hidden="true" className="wp-hero-glow absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange-300/40 blur-3xl pointer-events-none" />
        <div aria-hidden="true" className="wp-hero-glow absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-rose-300/40 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl pointer-events-none" />

        <div className="relative mx-auto w-full min-w-0 max-w-7xl px-4 py-12 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid min-w-0 gap-10 items-center lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <div className="wp-enter mb-6 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border-2 border-orange-400 bg-white px-3 py-1.5 text-[11px] font-bold text-orange-700 shadow-lg shadow-orange-200/50 sm:text-xs">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-orange-500" />
                {t("Pronostics · Analyses · Résultats publics")}
              </div>
              <h1 className="wp-enter wp-mobile-hero-title font-heading text-4xl font-black leading-tight tracking-tighter text-slate-900 sm:text-5xl lg:text-6xl" style={{ "--wp-delay": "80ms" }}>
                {experienceWords.heroOne}{" "}
                <span className="block bg-gradient-to-r from-orange-600 via-rose-500 to-fuchsia-600 bg-clip-text text-transparent">{experienceWords.heroTwo}</span>
              </h1>
              <p className="wp-enter mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg" style={{ "--wp-delay": "160ms" }}>
                {experienceWords.heroIntro}
              </p>
              <div className="wp-enter mt-8 flex flex-col sm:flex-row gap-3" style={{ "--wp-delay": "240ms" }}>
                <Button
                  size="lg"
                  className="wp-action group relative h-auto min-h-12 w-full whitespace-normal border-0 px-5 py-3 text-base text-white shadow-2xl shadow-orange-600/40 wp-gradient-warm sm:w-auto sm:px-8"
                  onClick={showPicks}
                  data-testid="hero-cta-btn"
                >
                  <span className="absolute inset-0 rounded-md bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  {t("Découvrir les pronostics")}
                  <ArrowRight className="ms-2 h-4 w-4 group-hover:translate-x-1 transition-transform rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="wp-action h-auto min-h-12 w-full whitespace-normal border-slate-300 bg-white px-5 py-3 text-base hover:bg-slate-50 sm:w-auto sm:px-8"
                  onClick={showPricing}
                  data-testid="hero-pro-btn"
                >
                  {t("Découvrir l’offre Pro")}
                </Button>
              </div>
              <div className="mt-3"><a href="https://t.me/wnplus" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-700 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" data-testid="landing-telegram">{telegramLabel} ↗</a></div>
              <Link to="/resultats" className="wp-result-link mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600" data-testid="hero-results-btn">{t("Consulter l’historique complet")}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
              <div className="wp-enter mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-slate-500 sm:gap-6" style={{ "--wp-delay": "320ms" }}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("Inscription sans carte")}
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("Résultats publics")}
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("Compte gratuit")}
                </div>
              </div>
            </div>

            <div className="wp-enter min-w-0 lg:col-span-5" style={{ "--wp-delay": "160ms" }}>
              <div id="picks-du-jour" className="relative min-w-0 scroll-mt-24">
                <Card className="relative min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><Trophy className="h-4 w-4 shrink-0 text-orange-500" /><h2 className="text-sm font-bold text-slate-700">{t("Pronostics disponibles")}</h2></div>
                    <Link to="/resultats" className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{t("Résultats publics")}</Link>
                  </div>
                  <div className="space-y-3" aria-live="polite" aria-busy={picksStatus === "loading"}>
                    {picksStatus === "loading" ? (
                      <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{t("Chargement des analyses…")}</p>
                    ) : picksStatus === "error" ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                        <p>{t("Les analyses ne sont pas disponibles pour le moment.")}</p>
                        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-3 font-semibold text-orange-700 underline">{t("Réessayer")}</button>
                      </div>
                    ) : livePicks.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
                        <p className="font-semibold text-slate-800">{t("Les analyses du jour arrivent prochainement.")}</p>
                        <p className="mt-2 text-sm text-slate-500">{t("Consulte l’historique de résultats en attendant les prochaines sélections.")}</p>
                      </div>
                    ) : livePicks.map((row, i) => {
                      const locked = !isAvailablePick(row);
                      const confidence = row.confidence == null || row.confidence === "" ? NaN : Number(row.confidence);
                      const showConfidence = !locked && Number.isFinite(confidence) && confidence >= 0 && confidence <= 100;
                      return (
                        <div key={row.id || i} className="wp-enter wp-interactive-card min-w-0 rounded-lg border border-neutral-100 bg-neutral-50 p-3" style={{ "--wp-delay": `${i * 70}ms` }}>
                          <div className="space-y-2">{["home","away"].map(side=><div key={side} className="flex min-w-0 items-center gap-2"><TeamBadge name={row[`${side}_team`]} src={badgeUrl(row,side)} /><bdi className="min-w-0 break-words text-sm font-bold leading-5 text-slate-800">{row[`${side}_team`]}</bdi></div>)}{row.sport_title && <p className="text-xs text-slate-500">{row.sport_title}</p>}</div>
                          <p className="mt-2 text-xs text-slate-500"><time dateTime={row.commence_time || undefined}>{landingTime(row.commence_time,locale,extra[7])}</time>{row.market_label && <> · {row.market_label}</>}</p>
                          <div className="mt-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
                            <p className="min-w-0 break-words text-sm font-semibold text-slate-900">
                              {locked ? <span className="inline-flex items-center gap-1 text-slate-500"><Lock className="h-3 w-3 shrink-0" />{t("Analyse réservée Pro")}</span> : <>{row.pick}{row.pick_odds != null && <span className="ms-1 font-normal text-slate-500">@ {row.pick_odds}</span>}</>}
                            </p>
                            {showConfidence && <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700">{t("Indice : {{value}} %", { value: formatNumber(Math.round(confidence)) })}</span>}
                          </div>
                          {!locked && <div className="mt-3 rounded-lg border border-orange-100 bg-white p-3 text-xs leading-5 text-slate-600"><p className="font-bold text-slate-800">{extra[0]}</p><p className="mt-1">• {row.model_probability != null && Number.isFinite(Number(row.model_probability)) && Number(row.model_probability)>=0 && Number(row.model_probability)<=100 ? `${extra[1]} : ${formatNumber(Number(row.model_probability))} %` : extra[19]}</p><p>• {row.num_books != null && Number.isFinite(Number(row.num_books)) && Number(row.num_books)>0 ? `${extra[2]} : ${formatNumber(Number(row.num_books))} ${extra[3]}` : extra[4]}</p><p className="mt-2 text-amber-800"><strong>{extra[5]} :</strong> {extra[6]}</p></div>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 border-t border-neutral-100 pt-4">
                    <p className="mb-3 text-xs leading-relaxed text-slate-500">{t("Les indices d’analyse ne garantissent aucun résultat.")}</p>
                    <Button className="h-auto min-h-11 w-full whitespace-normal border-0 py-3 font-bold text-white wp-gradient-warm" onClick={() => navigate(user ? "/app" : signupUrl)} data-testid="picks-signup-btn">{user ? t("Ouvrir l’application") : t("Créer mon compte gratuit")}</Button>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {DAILY_RESULTS_ENDPOINT && (
      <section data-wp-reveal id="resultats-hier" aria-labelledby="resultats-hier-title" className="border-y border-neutral-200 bg-white py-12 sm:py-16">
        <div className="mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
            <div className="min-w-0">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{t("Historique des pronostics")}</span>
              <h2 id="resultats-hier-title" className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{t("Les résultats d’hier")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{t("Matchs du {{date}}.", { date: resultsDateLabel })}</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{t("Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.")}</p>
            </div>
            <Link to="/resultats" className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" data-testid="yesterday-all-results-link">{t("Voir tous les résultats")}<ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" /></Link>
          </div>

          <div className="mt-7" aria-live="polite" aria-busy={resultsStatus === "loading"}>
            {resultsStatus === "loading" || (dailyResults && dailyResults.date !== resultsDate) ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">{t("Chargement des résultats d’hier…")}</div>
            ) : resultsStatus === "error" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <p className="font-semibold text-slate-800">{t("Le bilan d’hier n’est pas disponible pour le moment.")}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{t("Tu peux consulter l’historique complet des résultats.")}</p>
                <button type="button" onClick={() => setResultsReloadKey((value) => value + 1)} className="mt-3 min-h-11 text-sm font-semibold text-orange-700 underline">{t("Réessayer")}</button>
              </div>
            ) : dailyResults && (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="yesterday-summary">
                  {[
                    { key: "won", label: t("Gagnants"), color: "text-emerald-700" },
                    { key: "lost", label: t("Perdants"), color: "text-rose-700" },
                    { key: "pending", label: t("En attente"), color: "text-amber-700" },
                    { key: "void", label: t("Annulés / remboursés"), color: "text-slate-600" },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <dt className="break-words text-xs font-semibold text-slate-500">{label}</dt>
                      <dd className={`mt-1 font-heading text-3xl font-extrabold ${color}`}>{formatNumber(dailyResults.summary[key])}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">{t("Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.", { count: formatNumber(dailyResults.summary.total) })}</p>

                {dailyResults.summary.total === 0 ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{t("Aucun pronostic publié pour les matchs de cette journée.")}</p>
                ) : dailyResults.summary.won === 0 ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{t("Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.")}</p>
                ) : dailyResults.winners.length === 0 ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{t("Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.")}</p>
                ) : (
                  <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-3">
                    {dailyResults.winners.map((row) => (
                      <Card key={row.id} className="wp-enter wp-interactive-card min-w-0 rounded-2xl border-emerald-200 bg-white p-5 shadow-sm" data-testid="yesterday-winner-card">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{t("Gagné")}</span>
                          <span className="text-xs text-slate-500">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: RESULTS_TIME_ZONE }).format(new Date(row.start_time))}</span>
                        </div>
                        <div className="mt-4 space-y-2">{["home","away"].map(side=><div key={side} className="flex min-w-0 items-center gap-2"><TeamBadge name={row[`${side}_team`]} src={badgeUrl(row,side)} /><h3 className="min-w-0 break-words font-heading text-base font-bold text-slate-900"><bdi>{row[`${side}_team`]}</bdi></h3></div>)}</div>
                        <p className="mt-3 break-words text-sm font-semibold leading-relaxed text-slate-700">{row.pick}</p>
                        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                          <div className="min-w-0"><dt className="text-xs text-slate-500">{t("Cote publiée")}</dt><dd className="mt-1 font-bold text-slate-900">{row.pick_odds.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</dd></div>
                          <div className="min-w-0"><dt className="text-xs text-slate-500">{t("Score final")}</dt><dd className="mt-1 break-words font-bold text-slate-900">{row.final_score}</dd></div>
                        </dl>
                        <p className="mt-4 text-xs leading-relaxed text-slate-500">{t("Résultat confirmé")}</p>
                      </Card>
                    ))}
                  </div>
                )}
                <p className="mt-5 text-xs leading-relaxed text-slate-500">{t("Les résultats passés ne garantissent pas les prochains résultats.")}</p>
              </>
            )}
          </div>
        </div>
      </section>
      )}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div data-wp-reveal className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700 mb-4">
            {t("COMMENT UTILISER WINPULSE")}
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            {t("Une analyse pro, claire et immédiate")}
          </h2>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            {t("Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.")}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Brain, title: t("Explications de match"), txt: t("Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée."), color: "orange" },
            { icon: BarChart3, title: t("Scoring rigoureux"), txt: t("Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite."), color: "rose" },
            { icon: Sparkles, title: t("Combinés par profil"), txt: t("Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque."), color: "amber" },
            { icon: Shield, title: t("Track record transparent"), txt: t("Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants."), color: "emerald" },
            { icon: TrendingUp, title: t("Value bets détectés"), txt: t("Compare les estimations et les cotes proposées. Les estimations restent incertaines."), color: "orange" },
            { icon: Smartphone, title: t("Découverte gratuite"), txt: t("Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace."), color: "rose" },
          ].map((f, i) => {
            const Icon = f.icon;
            const colorMap = {
              orange: "bg-orange-50 text-orange-600 border-orange-100",
              rose: "bg-rose-50 text-rose-600 border-rose-100",
              amber: "bg-amber-50 text-amber-600 border-amber-100",
              emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
            }[f.color];
            return (
              <Card key={i} data-wp-reveal className="wp-interactive-card bg-white border-neutral-200 p-6" style={{ "--wp-delay": `${(i % 3) * 60}ms` }}>
                <div className={`h-10 w-10 rounded-xl border grid place-items-center mb-4 ${colorMap}`}>
                  <Icon className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="font-heading font-bold text-lg text-slate-900 mb-1">{f.title}</div>
                <div className="text-sm text-slate-600 leading-relaxed">{f.txt}</div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-t border-neutral-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Card data-wp-reveal className="border-0 p-6 text-white wp-gradient-warm sm:p-8">
            <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div className="min-w-0"><h2 className="flex items-center gap-2 font-heading text-2xl font-bold"><Gift className="h-5 w-5 shrink-0" />{t("Parrainage")}</h2><p className="mt-2 text-sm leading-relaxed">{t("Retrouve ton code et les conditions du programme dans ton compte.")}</p></div>
              <Button className="h-auto min-h-11 whitespace-normal bg-white py-3 font-bold text-slate-900 hover:bg-slate-100" onClick={() => navigate(user ? "/app/parrainage" : signupUrl)} data-testid="referral-cta-landing">{user ? t("Voir mon code") : t("Créer mon compte gratuit")}</Button>
            </div>
          </Card>
        </div>
      </section>

      <section id="pricing" className="bg-slate-950 text-white border-t border-neutral-200 relative overflow-hidden">
        <div className="absolute inset-0 wp-gradient-hero opacity-20" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
          <div data-wp-reveal className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs font-bold text-orange-400 mb-4">
              {t("ABONNEMENT")}
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">
              {t("Choisis ton accès")}
            </h2>
            <p className="mt-3 text-slate-400">{t("Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.")}</p>
          </div>
          <div className="mx-auto mb-6 max-w-4xl rounded-2xl border border-white/15 bg-white/5 p-5" data-testid="pricing-example"><h3 className="text-xl font-bold">{extra[8]}</h3><p className="mt-1 text-sm text-slate-300">{extra[9]}</p>{livePicks.find(isAvailablePick) ? (()=>{const example = livePicks.find(isAvailablePick);return <div className="mt-4 grid min-w-0 gap-2 rounded-xl bg-white/10 p-4 text-sm sm:grid-cols-2"><p className="break-words"><span className="text-slate-400">{extra[10]} :</span> {example.home_team} vs {example.away_team}</p><p><span className="text-slate-400">{extra[11]} :</span> {example.market_label || "—"}</p><p><span className="text-slate-400">{extra[12]} :</span> {example.pick}</p><p><span className="text-slate-400">{extra[13]} :</span> {example.pick_odds ?? "—"}</p></div>;})() : <p className="mt-3 text-sm text-slate-300">{extra[15]}</p>}<p className="mt-3 text-sm leading-6 text-slate-300">{extra[14]}</p><p className="mt-3 text-xs text-slate-400">{extra[17]}<br />{extra[18]}</p></div>
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
            {[
              {
                id: "free",
                name: t("Free"),
                price: `${formatNumber(0)} FCFA`,
                desc: t("Pour découvrir"),
                features: [
                  t("Sélections gratuites disponibles"),
                  extra[20],
                  t("Track record public"),
                ],
                cta: t("Démarrer gratuit"),
                highlight: false,
              },
              {
                id: "pro",
                name: "Pro",
                price: `${formatNumber(10500)} FCFA`,
                per: t("pour 30 jours"),
                desc: t("Accès complet"),
                features: [
                  experienceWords.paidSelections,
                  experienceWords.combos,
                  experienceWords.availableData,
                  experienceWords.savedSearches + " · 8",
                  experienceWords.follow,
                  experienceWords.history,
                ],
                cta: t("Passer à Pro"),
                highlight: true,
              },
            ].map((p) => (
              <Card
                key={p.id}
                data-wp-reveal
                data-testid={`pricing-card-${p.id}`}
                className={`wp-interactive-card relative p-6 border ${p.highlight
                  ? "bg-gradient-to-br from-orange-500/15 to-rose-500/10 border-orange-500/40 ring-2 ring-orange-500 shadow-2xl shadow-orange-500/20"
                  : "bg-slate-900/60 border-slate-800"}`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 wp-gradient-warm text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg">
                    {t("Accès complet")}
                  </div>
                )}
                <div className="text-sm text-slate-400 mb-1">{p.desc}</div>
                <div className="font-heading text-2xl font-extrabold text-white mb-2">{p.name}</div>
                <div className="flex flex-wrap items-baseline gap-1 mb-6">
                  <span className="font-heading text-3xl sm:text-4xl font-black tracking-tighter text-white">{p.price}</span>
                  {p.per && <span className="text-sm text-slate-400">{p.per}</span>}
                </div>
                <ul className="space-y-2.5 mb-6">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                      <CheckCircle2 className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  data-testid={`pricing-cta-${p.id}`}
                  className={`wp-action h-auto min-h-11 w-full whitespace-normal py-3 ${p.highlight
                    ? "wp-gradient-warm text-white border-0 hover:opacity-90"
                    : "bg-white text-slate-900 hover:bg-slate-100"}`}
                  onClick={() => navigate(user ? (p.id === "free" ? "/app" : "/app/abonnement") : signupUrl)}
                >
                  {p.cta}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
            <Link to="/legal/mentions-legales" className="text-slate-600 hover:text-orange-600 font-semibold" data-testid="footer-legal-mentions">{t("Mentions légales")}</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/cgv" className="text-slate-600 hover:text-orange-600 font-semibold" data-testid="footer-legal-cgv">{t("CGV")}</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/confidentialite" className="text-slate-600 hover:text-orange-600 font-semibold" data-testid="footer-legal-confidentialite">{t("Confidentialité")}</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/jeu-responsable" className="text-rose-600 hover:text-rose-700 font-semibold" data-testid="footer-legal-jeu">{t("Jeu responsable · 18+")}</Link>
            <span className="text-slate-300">·</span>
            <Link to="/resultats" className="text-slate-600 hover:text-orange-600 font-semibold">{t("Track record")}</Link>
            <span className="text-slate-300">·</span>
            <Link to="/blog" className="text-slate-600 hover:text-orange-600 font-semibold">{t("Blog")}</Link>
          </div>
          <div className="text-sm text-slate-500 text-center">{t("© 2026 WinPulse · Joue responsable · 18+")}</div>
          <div className="text-xs text-slate-400 max-w-2xl text-center">{t("Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.")}</div>
        </div>
      </footer>
    </div>
  );
}


