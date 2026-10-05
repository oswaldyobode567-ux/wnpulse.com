import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
import api from "@/lib/api";

// Activer uniquement après raccordement au véritable endpoint d'historique.
// Exemple de contrat à implémenter : voir LIRE_AVANT_INSTALLATION.md.
const DAILY_RESULTS_ENDPOINT = null;
const RESULTS_TIME_ZONE = "Africa/Porto-Novo";

function isAvailablePick(row) {
  if (!row || typeof row !== "object") return false;
  const unlocked = [undefined, null, false, 0, "false"].includes(row.locked);
  return unlocked && typeof row.pick === "string" && Boolean(row.pick.trim());
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
  if (!data || data.date !== date || data.time_zone !== RESULTS_TIME_ZONE || data.complete !== true) {
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
    winners: winners.sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time) || a.id.localeCompare(b.id)).slice(0, 3),
  };
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [livePicks, setLivePicks] = useState([]);
  const [picksStatus, setPicksStatus] = useState("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [resultsDate, setResultsDate] = useState(yesterdayDate);
  const [dailyResults, setDailyResults] = useState(null);
  const [resultsStatus, setResultsStatus] = useState(DAILY_RESULTS_ENDPOINT ? "loading" : "disabled");
  const [resultsReloadKey, setResultsReloadKey] = useState(0);
  const resultsDateLabel = new Intl.DateTimeFormat("fr-FR", {
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
    api.get(DAILY_RESULTS_ENDPOINT, { params: { date: resultsDate, time_zone: RESULTS_TIME_ZONE } })
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
    <div className="min-h-screen w-full min-w-0 bg-neutral-50">
      <header className="sticky top-0 z-50 w-full max-w-full border-b border-neutral-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-3 sm:px-6 lg:px-8">
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
              <div className="mt-1 hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 md:block">
                Analyses sportives
              </div>
            </div>
          </Link>

          <nav className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
            <Link to="/resultats" className="hidden lg:inline-flex">
              <Button variant="ghost" size="sm" data-testid="public-trackrecord-link">
                Historique des résultats
              </Button>
            </Link>

            <Link to="/blog" className="hidden md:inline-flex">
              <Button
                variant="ghost"
                size="sm"
                className="relative font-bold text-orange-700 hover:bg-orange-50"
                data-testid="public-blog-link"
              >
                Blog
                <span className="ml-1.5 rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white animate-pulse">
                  Live
                </span>
              </Button>
            </Link>

            {user ? (
              <Button
                data-testid="open-app-btn"
                className="h-9 shrink-0 border-0 px-3 text-xs text-white hover:opacity-90 wp-gradient-warm sm:px-4 sm:text-sm"
                onClick={() => navigate("/app")}
              >
                Ouvrir l'app
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/login")}
                  data-testid="header-login-btn"
                  className="h-9 shrink-0 px-2 text-xs sm:px-3 sm:text-sm"
                >
                  Connexion
                </Button>
                <Button
                  className="h-9 shrink-0 border-0 px-3 text-xs text-white hover:opacity-90 wp-gradient-warm sm:px-4 sm:text-sm"
                  onClick={() => navigate(signupUrl)}
                  data-testid="header-signup-btn"
                >
                  <span className="sm:hidden">S'inscrire</span>
                  <span className="hidden sm:inline">Démarrer gratuit</span>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden wp-gradient-hero">
        {/* Floating decorative blobs */}
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange-300/40 blur-3xl pointer-events-none animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-rose-300/40 blur-3xl pointer-events-none animate-pulse" style={{ animationDuration: "10s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl pointer-events-none" />

        <div className="relative mx-auto w-full min-w-0 max-w-7xl px-4 py-12 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid min-w-0 gap-10 items-center lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <div className="mb-6 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border-2 border-orange-400 bg-white px-3 py-1.5 text-[11px] font-bold text-orange-700 shadow-lg shadow-orange-200/50 sm:text-xs">
                <span className="h-2 w-2 rounded-full bg-rose-500 live-dot" />
                Analyses du jour · Historique public
              </div>
              <h1 className="wp-mobile-hero-title font-heading text-4xl font-black leading-tight tracking-tighter text-slate-900 sm:text-5xl lg:text-6xl">
                Des pronostics sportifs{" "}
                <span className="bg-gradient-to-r from-orange-600 via-rose-500 to-fuchsia-600 bg-clip-text text-transparent">transparents</span>.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Consulte les analyses disponibles et notre historique de résultats,
                pronostics gagnants comme perdants. Commence gratuitement, sans carte bancaire.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  className="group relative h-12 w-full border-0 px-5 text-base text-white shadow-2xl shadow-orange-600/40 transition-transform hover:scale-[1.02] wp-gradient-warm sm:w-auto sm:px-8"
                  onClick={showPicks}
                  data-testid="hero-cta-btn"
                >
                  <span className="absolute inset-0 rounded-md bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  Voir les pronostics du jour
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full border-slate-300 bg-white px-5 text-base hover:bg-slate-50 sm:w-auto sm:px-8"
                  onClick={() => navigate("/resultats")}
                  data-testid="hero-results-btn"
                >
                  Voir nos résultats
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-slate-500 sm:gap-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Pas de carte bancaire
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Résultats publics
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Compte gratuit
                </div>
              </div>
            </div>

            <div className="min-w-0 lg:col-span-5">
              <div id="picks-du-jour" className="relative min-w-0 scroll-mt-24">
                <Card className="relative min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><Trophy className="h-4 w-4 shrink-0 text-orange-500" /><h2 className="text-sm font-bold text-slate-700">Pronostics disponibles</h2></div>
                    <Link to="/resultats" className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Résultats publics</Link>
                  </div>
                  <div className="space-y-3" aria-live="polite" aria-busy={picksStatus === "loading"}>
                    {picksStatus === "loading" ? (
                      <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Chargement des analyses…</p>
                    ) : picksStatus === "error" ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                        <p>Les analyses ne sont pas disponibles pour le moment.</p>
                        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-3 font-semibold text-orange-700 underline">Réessayer</button>
                      </div>
                    ) : livePicks.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
                        <p className="font-semibold text-slate-800">Les analyses du jour arrivent prochainement.</p>
                        <p className="mt-2 text-sm text-slate-500">Consulte l’historique de résultats en attendant les prochaines sélections.</p>
                      </div>
                    ) : livePicks.map((row, i) => {
                      const locked = !isAvailablePick(row);
                      const confidence = row.confidence == null || row.confidence === "" ? NaN : Number(row.confidence);
                      const showConfidence = !locked && Number.isFinite(confidence) && confidence >= 0 && confidence <= 100;
                      return (
                        <div key={row.id || i} className="min-w-0 rounded-lg border border-neutral-100 bg-neutral-50 p-3 wp-rise">
                          <p className="break-words text-xs leading-relaxed text-slate-500">{row.home_team} vs {row.away_team}{row.sport_title && <span> · {row.sport_title}</span>}</p>
                          <div className="mt-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
                            <p className="min-w-0 break-words text-sm font-semibold text-slate-900">
                              {locked ? <span className="inline-flex items-center gap-1 text-slate-500"><Lock className="h-3 w-3 shrink-0" />Analyse réservée Pro</span> : <>{row.pick}{row.pick_odds != null && <span className="ml-1 font-normal text-slate-500">@ {row.pick_odds}</span>}</>}
                            </p>
                            {showConfidence && <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700">Indice : {Math.round(confidence)} %</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 border-t border-neutral-100 pt-4">
                    <p className="mb-3 text-xs leading-relaxed text-slate-500">Les indices d’analyse ne garantissent aucun résultat.</p>
                    <Button className="h-auto min-h-11 w-full whitespace-normal border-0 py-3 font-bold text-white wp-gradient-warm" onClick={() => navigate(user ? "/app" : signupUrl)} data-testid="picks-signup-btn">{user ? "Ouvrir l’application" : "Créer mon compte gratuit"}</Button>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {DAILY_RESULTS_ENDPOINT && (
      <section id="resultats-hier" aria-labelledby="resultats-hier-title" className="border-y border-neutral-200 bg-white py-12 sm:py-16">
        <div className="mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
            <div className="min-w-0">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Historique des pronostics</span>
              <h2 id="resultats-hier-title" className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Les résultats d’hier</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">Matchs du {resultsDateLabel}.</p>
            </div>
            <Link to="/resultats" className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" data-testid="yesterday-all-results-link">Voir tous les résultats<ArrowRight className="h-4 w-4 shrink-0" /></Link>
          </div>

          <div className="mt-7" aria-live="polite" aria-busy={resultsStatus === "loading"}>
            {resultsStatus === "loading" || (dailyResults && dailyResults.date !== resultsDate) ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Chargement des résultats d’hier…</div>
            ) : resultsStatus === "error" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <p className="font-semibold text-slate-800">Le bilan d’hier n’est pas disponible pour le moment.</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">Tu peux consulter l’historique complet des résultats.</p>
                <button type="button" onClick={() => setResultsReloadKey((value) => value + 1)} className="mt-3 min-h-11 text-sm font-semibold text-orange-700 underline">Réessayer</button>
              </div>
            ) : dailyResults && (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="yesterday-summary">
                  {[
                    { key: "won", label: "Gagnants", color: "text-emerald-700" },
                    { key: "lost", label: "Perdants", color: "text-rose-700" },
                    { key: "pending", label: "En attente", color: "text-amber-700" },
                    { key: "void", label: "Annulés / remboursés", color: "text-slate-600" },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <dt className="break-words text-xs font-semibold text-slate-500">{label}</dt>
                      <dd className={`mt-1 font-heading text-3xl font-extrabold ${color}`}>{dailyResults.summary[key]}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">Bilan complet : {dailyResults.summary.total} pronostic{dailyResults.summary.total === 1 ? "" : "s"}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.</p>

                {dailyResults.summary.total === 0 ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Aucun pronostic publié pour les matchs de cette journée.</p>
                ) : dailyResults.summary.won === 0 ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.</p>
                ) : dailyResults.winners.length === 0 ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.</p>
                ) : (
                  <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-3">
                    {dailyResults.winners.map((row) => (
                      <Card key={row.id} className="min-w-0 rounded-2xl border-emerald-200 bg-white p-5 shadow-sm" data-testid="yesterday-winner-card">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Gagné</span>
                          <span className="text-xs text-slate-500">{new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: RESULTS_TIME_ZONE }).format(new Date(row.start_time))}</span>
                        </div>
                        <h3 className="mt-4 break-words font-heading text-lg font-bold text-slate-900">{row.home_team} <span className="font-normal text-slate-400">vs</span> {row.away_team}</h3>
                        <p className="mt-3 break-words text-sm font-semibold leading-relaxed text-slate-700">{row.pick}</p>
                        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                          <div className="min-w-0"><dt className="text-xs text-slate-500">Cote publiée</dt><dd className="mt-1 font-bold text-slate-900">{row.pick_odds.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</dd></div>
                          <div className="min-w-0"><dt className="text-xs text-slate-500">Score final</dt><dd className="mt-1 break-words font-bold text-slate-900">{row.final_score}</dd></div>
                        </dl>
                        <p className="mt-4 text-xs leading-relaxed text-slate-500">Pronostic publié avant le match · résultat confirmé.</p>
                      </Card>
                    ))}
                  </div>
                )}
                <p className="mt-5 text-xs leading-relaxed text-slate-500">Les résultats passés ne garantissent pas les prochains résultats.</p>
              </>
            )}
          </div>
        </div>
      </section>
      )}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700 mb-4">
            COMMENT UTILISER WINPULSE
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Une analyse pro, claire et immédiate
          </h2>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Brain, title: "IA experte intégrée", txt: "Analyse textuelle claire de chaque match : forme, H2H, contexte, paris alternatifs.", color: "orange" },
            { icon: BarChart3, title: "Scoring rigoureux", txt: "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.", color: "rose" },
            { icon: Sparkles, title: "3 combinés par jour", txt: "Prudent, Équilibré et Audacieux : compare les niveaux de risque. Aucun combiné n’est sans risque.", color: "amber" },
            { icon: Shield, title: "Track record transparent", txt: "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.", color: "emerald" },
            { icon: TrendingUp, title: "Value bets détectés", txt: "Compare les estimations et les cotes proposées. Les estimations restent incertaines.", color: "orange" },
            { icon: Smartphone, title: "Découverte gratuite", txt: "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.", color: "rose" },
          ].map((f, i) => {
            const Icon = f.icon;
            const colorMap = {
              orange: "bg-orange-50 text-orange-600 border-orange-100",
              rose: "bg-rose-50 text-rose-600 border-rose-100",
              amber: "bg-amber-50 text-amber-600 border-amber-100",
              emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
            }[f.color];
            return (
              <Card key={i} className="bg-white border-neutral-200 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all">
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
          <Card className="border-0 p-6 text-white wp-gradient-warm sm:p-8">
            <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div className="min-w-0"><h2 className="flex items-center gap-2 font-heading text-2xl font-bold"><Gift className="h-5 w-5 shrink-0" />Parrainage</h2><p className="mt-2 text-sm leading-relaxed">Retrouve ton code et les conditions du programme dans ton compte.</p></div>
              <Button className="h-auto min-h-11 whitespace-normal bg-white py-3 font-bold text-slate-900 hover:bg-slate-100" onClick={() => navigate(user ? "/app/parrainage" : signupUrl)} data-testid="referral-cta-landing">{user ? "Voir mon code" : "Créer mon compte gratuit"}</Button>
            </div>
          </Card>
        </div>
      </section>

      <section id="pricing" className="bg-slate-950 text-white border-t border-neutral-200 relative overflow-hidden">
        <div className="absolute inset-0 wp-gradient-hero opacity-20" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs font-bold text-orange-400 mb-4">
              ABONNEMENT
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">
              Choisis ton accès
            </h2>
            <p className="mt-3 text-slate-400">Commence avec Free. Consulte les modalités de paiement dans ton espace avant de choisir Pro.</p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
            {[
              {
                id: "free",
                name: "Free",
                price: "0 FCFA",
                desc: "Pour découvrir",
                features: [
                  "1 pick gratuit du jour",
                  "Tous les matchs (cotes visibles)",
                  "Track record public",
                ],
                cta: "Démarrer gratuit",
                highlight: false,
              },
              {
                id: "pro",
                name: "Pro",
                price: "10 500 FCFA",
                per: "/mois",
                desc: "Accès complet",
                features: [
                  "Tous les pronostics débloqués",
                  "Tous les combinés du jour",
                  "Analyse IA experte sur chaque match",
                  "Value bets et Combo Builder",
                  "Montante premium",
                  "Support WhatsApp prioritaire",
                ],
                cta: "Choisir Pro",
                highlight: true,
              },
            ].map((p) => (
              <Card
                key={p.id}
                data-testid={`pricing-card-${p.id}`}
                className={`relative p-6 border ${p.highlight
                  ? "bg-gradient-to-br from-orange-500/15 to-rose-500/10 border-orange-500/40 ring-2 ring-orange-500 shadow-2xl shadow-orange-500/20"
                  : "bg-slate-900/60 border-slate-800"}`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 wp-gradient-warm text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg">
                    Accès complet
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
                  className={`h-auto min-h-11 w-full whitespace-normal py-3 ${p.highlight
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
            <Link to="/legal/mentions-legales" className="text-slate-600 hover:text-orange-600 font-semibold" data-testid="footer-legal-mentions">Mentions légales</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/cgv" className="text-slate-600 hover:text-orange-600 font-semibold" data-testid="footer-legal-cgv">CGV</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/confidentialite" className="text-slate-600 hover:text-orange-600 font-semibold" data-testid="footer-legal-confidentialite">Confidentialité</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/jeu-responsable" className="text-rose-600 hover:text-rose-700 font-semibold" data-testid="footer-legal-jeu">Jeu responsable · 18+</Link>
            <span className="text-slate-300">·</span>
            <Link to="/resultats" className="text-slate-600 hover:text-orange-600 font-semibold">Track record</Link>
            <span className="text-slate-300">·</span>
            <Link to="/blog" className="text-slate-600 hover:text-orange-600 font-semibold">Blog</Link>
          </div>
          <div className="text-sm text-slate-500 text-center">© 2026 WinPulse · Joue responsable · 18+</div>
          <div className="text-xs text-slate-400 max-w-2xl text-center">Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.</div>
        </div>
      </footer>
    </div>
  );
}
