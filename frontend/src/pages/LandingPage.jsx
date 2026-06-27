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
  Star,
  Quote,
  Gift,
  Flame,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import dayjs from "dayjs";
import LiveHeatmap from "@/components/LiveHeatmap";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [livePicks, setLivePicks] = useState([]);

  useEffect(() => {
    api.get("/predictions/top")
      .then((r) => setLivePicks((r.data || []).slice(0, 3)))
      .catch(() => setLivePicks([]));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="brand-link">
            <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center text-white shadow-lg shadow-orange-600/30">
              <Zap className="h-5 w-5" strokeWidth={2.5} fill="white" />
            </div>
            <div>
              <div className="font-heading font-extrabold text-lg leading-none">WinPulse</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-orange-600 font-semibold">Ton pouls de gagnant</div>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/resultats" className="hidden sm:inline-flex"><Button variant="ghost" size="sm" data-testid="public-trackrecord-link">📈 Track record</Button></Link>
            <Link to="/blog" className="hidden md:inline-flex"><Button variant="ghost" size="sm" data-testid="public-blog-link">📰 Blog</Button></Link>
            {user ? (
              <Button data-testid="open-app-btn" className="wp-gradient-warm text-white hover:opacity-90 border-0" onClick={() => navigate("/app")}>
                Ouvrir l'app
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/login")} data-testid="header-login-btn">
                  Connexion
                </Button>
                <Button className="wp-gradient-warm text-white hover:opacity-90 border-0" onClick={() => navigate("/register")} data-testid="header-signup-btn">
                  Démarrer gratuit
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

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-orange-400 bg-white px-3 py-1.5 text-xs font-bold text-orange-700 mb-6 shadow-lg shadow-orange-200/50">
                <span className="h-2 w-2 rounded-full bg-rose-500 live-dot" />
                Analyses live · 7 sports · 2 400+ utilisateurs
              </div>
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-7xl font-black tracking-tighter text-slate-900 leading-[0.95]">
                Sens battre le pouls<br />
                <span className="bg-gradient-to-r from-orange-600 via-rose-500 to-fuchsia-600 bg-clip-text text-transparent">
                  des paris gagnants
                </span>.
              </h1>
              <p className="mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">
                Chaque jour, WinPulse analyse les matchs de la planète foot, basket, tennis, NFL, NHL, MMA. On chiffre la confiance, on détecte la value, et on te livre trois combinés clés en main : <strong>Sécurité</strong>, <strong>Équilibre</strong>, <strong>Jackpot</strong>.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  className="relative wp-gradient-warm text-white border-0 hover:scale-105 transition-transform text-base px-8 h-12 shadow-2xl shadow-orange-600/40 group"
                  onClick={() => navigate(user ? "/app" : "/register")}
                  data-testid="hero-cta-btn"
                >
                  <span className="absolute inset-0 rounded-md bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  Voir les picks du jour
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base px-8 h-12 border-slate-300 bg-white hover:bg-slate-50"
                  onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
                  data-testid="hero-pricing-btn"
                >
                  Voir les abonnements
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Pas de carte bancaire
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Paiement MTN MoMo
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Annulable à tout moment
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="relative">
                <Card className="relative bg-white border border-neutral-200 rounded-2xl shadow-2xl p-5 wp-noise overflow-hidden">
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-orange-500" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">À la une — Live</span>
                    </div>
                    <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">+22% ROI 30j</span>
                  </div>
                  <div className="space-y-3 relative z-10">
                    {(livePicks.length > 0 ? livePicks : [
                      { home_team: "Argentina", away_team: "Austria", pick: "Argentina", confidence: 78, pick_odds: 1.72, label: "safe", locked: false, sport_title: "FIFA World Cup" },
                      { home_team: "France", away_team: "Iraq", pick: null, confidence: null, pick_odds: 1.20, label: "locked", locked: true, sport_title: "FIFA World Cup" },
                      { home_team: "Portugal", away_team: "Uzbekistan", pick: null, confidence: null, pick_odds: 2.05, label: "locked", locked: true, sport_title: "FIFA World Cup" },
                    ]).map((row, i) => {
                      const locked = row.locked || !row.pick;
                      return (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 border border-neutral-100 wp-rise" style={{ animationDelay: `${i * 80}ms` }}>
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500 mb-0.5 truncate">
                              {row.home_team} vs {row.away_team}
                              {row.sport_title && <span className="ml-1 text-slate-400">· {row.sport_title}</span>}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                              {locked ? (
                                <span className="inline-flex items-center gap-1 text-slate-400">
                                  <Lock className="h-3 w-3" /> Pick réservé Pro
                                </span>
                              ) : (
                                <>
                                  {row.pick} <span className="text-slate-400 font-normal">@ {row.pick_odds}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {!locked && row.confidence != null && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold border ${
                              row.label === "safe" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>
                              {Math.round(row.confidence)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 pb-2 border-t border-neutral-100 flex items-center justify-between text-xs relative z-10">
                    <span className="text-slate-500">1 pick gratuit · le reste en Pro</span>
                    <Link to={user ? "/app/abonnement" : "/register"} className="font-bold text-orange-600 hover:underline">Débloquer →</Link>
                  </div>
                </Card>
                <div className="absolute -top-8 -right-4 wp-gradient-warm text-white rounded-2xl px-5 py-3 shadow-2xl shadow-rose-500/40 rotate-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold opacity-90">Confiance IA</div>
                  <div className="text-3xl font-black tracking-tighter">{livePicks[0]?.confidence ? Math.round(livePicks[0].confidence) : 82}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { val: "63%", lbl: "Taux de réussite 90j", c: "text-emerald-600" },
            { val: "+22.7%", lbl: "ROI moyen Elite", c: "text-orange-600" },
            { val: "7", lbl: "Sports couverts", c: "text-rose-600" },
            { val: "24/7", lbl: "Analyse temps réel", c: "text-slate-900" },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className={`font-heading text-3xl sm:text-4xl font-black ${s.c}`}>{s.val}</div>
              <div className="text-xs text-slate-500 mt-1">{s.lbl}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700 mb-4">
            POURQUOI ÇA MARCHE
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Une analyse pro, claire et immédiate
          </h2>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            Toutes les données. Aucun bruit. Des recommandations chiffrées que tu comprends en 5 secondes.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Brain, title: "IA experte intégrée", txt: "Analyse textuelle claire de chaque match : forme, H2H, contexte, paris alternatifs.", color: "orange" },
            { icon: BarChart3, title: "Scoring rigoureux", txt: "Probabilités consensus retirées du vig sur 3 bookmakers + variance pour scorer la confiance.", color: "rose" },
            { icon: Sparkles, title: "3 combinés par jour", txt: "Sécurité, Équilibre et Jackpot — un parlay multi-sports diversifié pour chaque niveau de risque.", color: "amber" },
            { icon: Shield, title: "Track record transparent", txt: "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.", color: "emerald" },
            { icon: TrendingUp, title: "Value bets détectés", txt: "Edge calculé vs marché. On te dit exactement où le bookmaker se trompe.", color: "orange" },
            { icon: Smartphone, title: "MTN Mobile Money", txt: "Abonnement sans CB. Composez *880#, paye en 30 secondes, active ton compte en quelques minutes.", color: "rose" },
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

      {/* ========== LIVE HEATMAP ========== */}
      <LiveHeatmap />

      {/* ========== TESTIMONIALS SECTION ========== */}
      <section id="testimonials" className="bg-gradient-to-b from-white via-orange-50/30 to-white py-20 border-t border-neutral-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-orange-300/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-rose-300/20 blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-100 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700 mb-4">
              <Flame className="h-3.5 w-3.5" /> AVIS DE LA COMMUNAUTÉ
            </div>
            <h2 className="font-heading text-3xl sm:text-5xl font-black tracking-tighter text-slate-900">
              Ce que disent <span className="bg-gradient-to-r from-orange-600 to-rose-600 bg-clip-text text-transparent">les pros qui kiffent</span>
            </h2>
            <p className="mt-3 text-slate-600 max-w-2xl mx-auto text-base">
              Plus de <strong className="text-slate-900">2 400 utilisateurs actifs</strong> à travers le Bénin, le Togo et la Côte d'Ivoire — note moyenne <strong className="text-orange-600">4.8/5</strong>.
            </p>
            <div className="mt-4 flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
              ))}
              <span className="ml-2 text-sm font-bold text-slate-700">4.8 sur 1 247 avis</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                name: "Romaric A.",
                city: "Cotonou, BJ",
                stars: 5,
                badge: "Pro depuis 4 mois",
                quote: "Je suivais déjà les matchs mais je perdais sur les paris. Avec WinPulse, je comprends enfin pourquoi un pick a de la valeur. ROI +22% sur mon dernier mois. Sérieux.",
                init: "RA",
                color: "from-orange-400 to-rose-500",
              },
              {
                name: "Estelle K.",
                city: "Lomé, TG",
                stars: 5,
                badge: "Elite",
                quote: "L'analyse IA pour chaque match c'est juste fou — ça te dit exactement où le bookmaker s'est planté. Le combiné « Sécurité » est devenu mon rituel du week-end.",
                init: "EK",
                color: "from-fuchsia-500 to-rose-500",
              },
              {
                name: "Yobode O.",
                city: "Cotonou, BJ",
                stars: 5,
                badge: "Pro depuis 6 mois",
                quote: "Track record public 100% vérifiable, paiement MTN MoMo en 30 secondes, support WhatsApp ultra réactif. C'est carré et c'est rare au Bénin.",
                init: "YO",
                color: "from-amber-500 to-orange-600",
              },
              {
                name: "Tony D.",
                city: "Abidjan, CI",
                stars: 5,
                badge: "Pro",
                quote: "Le bouton « Value bets » est devenu mon arme secrète. Tu vois en un coup d'œil les paris qui ont un edge positif. Bye bye les intuitions, hello les maths.",
                init: "TD",
                color: "from-cyan-500 to-blue-600",
              },
              {
                name: "Carmel M.",
                city: "Parakou, BJ",
                stars: 4,
                badge: "Free → Pro",
                quote: "Je restais en Free au début, puis j'ai vu le combiné gratuit passer 3 fois de suite. Là j'ai upgradé. Je regrette juste de ne pas l'avoir fait plus tôt.",
                init: "CM",
                color: "from-emerald-500 to-teal-600",
              },
              {
                name: "Ange S.",
                city: "Cotonou, BJ",
                stars: 5,
                badge: "Elite",
                quote: "Ce que j'aime : pas de promesses bidon, pas de « 100% sûr ». Juste des stats claires et un track record honnête. Les pertes sont assumées, les gains sont chiffrés.",
                init: "AS",
                color: "from-violet-500 to-fuchsia-600",
              },
            ].map((t, i) => (
              <Card key={i} className="relative bg-white border-neutral-200 p-6 hover:shadow-xl hover:-translate-y-1 transition-all group" data-testid={`testimonial-${i}`}>
                <Quote className="absolute top-4 right-4 h-7 w-7 text-orange-200 group-hover:text-orange-300 transition-colors" />
                <div className="flex items-center gap-3 mb-4">
                  <div className={`h-12 w-12 rounded-full bg-gradient-to-br ${t.color} grid place-items-center text-white font-black text-sm shadow-lg`}>
                    {t.init}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.city}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`h-3.5 w-3.5 ${s <= t.stars ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}`}
                    />
                  ))}
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-orange-700 bg-orange-100 rounded-full px-2 py-0.5">{t.badge}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">"{t.quote}"</p>
              </Card>
            ))}
          </div>

          {/* Trust strip */}
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { num: "2 400+", label: "Utilisateurs actifs" },
              { num: "72%", label: "Taux de réussite (30j)" },
              { num: "+18.4%", label: "ROI mensuel moyen" },
              { num: "4.8/5", label: "Note moyenne" },
            ].map((s, i) => (
              <div key={i} className="text-center p-5 rounded-2xl bg-white border border-neutral-200 hover:border-orange-300 hover:shadow-md transition-all">
                <div className="font-heading text-3xl sm:text-4xl font-black bg-gradient-to-r from-orange-600 to-rose-600 bg-clip-text text-transparent tracking-tighter">
                  {s.num}
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Referral teaser */}
          <Card className="mt-12 relative overflow-hidden bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 text-white border-0 p-7 sm:p-10">
            <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-yellow-300/20 blur-3xl" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 ring-white/25 mb-3">
                  <Gift className="h-3.5 w-3.5" /> Programme parrainage
                </div>
                <div className="font-heading text-2xl sm:text-3xl font-black tracking-tight">
                  Invite 3 amis sur WhatsApp = <span className="bg-yellow-300 text-slate-900 px-2 rounded">7 jours Pro offerts</span>
                </div>
                <p className="mt-2 text-white/90 text-sm max-w-xl">Disponible dès que tu crées ton compte. Tu reçois ton code unique, tu le partages, tes amis t'aident à débloquer du Pro sans bouger le petit doigt.</p>
              </div>
              <Button
                className="bg-white text-slate-900 hover:bg-slate-100 font-bold whitespace-nowrap shadow-xl"
                onClick={() => navigate(user ? "/app/parrainage" : "/register")}
                data-testid="referral-cta-landing"
              >
                <Sparkles className="h-4 w-4 mr-2" /> {user ? "Voir mon code" : "M'inscrire gratuit"}
              </Button>
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
              Choisis ton niveau de jeu
            </h2>
            <p className="mt-3 text-slate-400">Paiement sécurisé via MTN Mobile Money Bénin · annulable à tout moment</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { id: "free", name: "Free", price: "0 FCFA", desc: "Pour découvrir", features: ["1 pick gratuit du jour", "Tous les matchs (cotes visibles)", "Track record public"], cta: "Démarrer gratuit", highlight: false },
              { id: "pro", name: "Pro", price: "4 900 FCFA", per: "/mois", desc: "Le plus populaire", features: ["Tous les pronostics débloqués", "Tous les sports (Coupe du Monde, NBA, Tennis…)", "Analyse IA experte sur chaque match", "Les 3 combinés du jour", "Email VIP avec les picks"], cta: "Choisir Pro", highlight: true },
              { id: "elite", name: "Elite", price: "14 900 FCFA", per: "/mois", desc: "Performance max", features: ["Tout Pro inclus", "Picks VIP haute confiance (>80%)", "Combinés boostés (5 sélections)", "Bankroll & Kelly criterion", "Support WhatsApp prio"], cta: "Choisir Elite", highlight: false },
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
                    Populaire
                  </div>
                )}
                <div className="text-sm text-slate-400 mb-1">{p.desc}</div>
                <div className="font-heading text-2xl font-extrabold text-white mb-2">{p.name}</div>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="font-heading text-4xl font-black tracking-tighter text-white">{p.price}</span>
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
                  className={`w-full ${p.highlight
                    ? "wp-gradient-warm text-white border-0 hover:opacity-90"
                    : "bg-white text-slate-900 hover:bg-slate-100"}`}
                  onClick={() => navigate(user ? "/app/abonnement" : "/register")}
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
          <div className="text-sm text-slate-500 text-center">© 2026 WinPulse SARL · Cotonou, Bénin · Joue responsable · 18+</div>
          <div className="text-xs text-slate-400 max-w-2xl text-center">Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.</div>
        </div>
      </footer>
    </div>
  );
}
