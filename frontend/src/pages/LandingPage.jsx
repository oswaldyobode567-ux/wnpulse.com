import { Link, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 mb-6">
                <span className="h-2 w-2 rounded-full bg-rose-500 live-dot" />
                Analyses live · 7 sports
              </div>
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.02]">
                Sens battre le pouls<br />
                <span className="bg-gradient-to-r from-orange-600 via-rose-500 to-orange-600 bg-clip-text text-transparent">
                  des paris gagnants
                </span>.
              </h1>
              <p className="mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">
                Chaque jour, WinPulse analyse les matchs de la planète foot, basket, tennis, NFL, NHL, MMA. On chiffre la confiance, on détecte la value, et on te livre trois combinés clés en main : <strong>Sécurité</strong>, <strong>Équilibre</strong>, <strong>Jackpot</strong>.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  className="wp-gradient-warm text-white border-0 hover:opacity-90 text-base px-8 h-12 shadow-xl shadow-orange-600/25"
                  onClick={() => navigate(user ? "/app" : "/register")}
                  data-testid="hero-cta-btn"
                >
                  Voir les picks du jour
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base px-8 h-12 border-slate-300"
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
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">À la une — Aujourd'hui</span>
                    </div>
                    <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">+22% ROI 30j</span>
                  </div>
                  <div className="space-y-3 relative z-10">
                    {[
                      { match: "Real Madrid vs Barcelona", pick: "Real Madrid", conf: 82, label: "safe", odds: 1.78 },
                      { match: "Lakers vs Celtics", pick: "Celtics", conf: 71, label: "value", odds: 1.92 },
                      { match: "Djokovic vs Sinner", pick: "Djokovic", conf: 68, label: "value", odds: 2.05 },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 border border-neutral-100 wp-rise" style={{ animationDelay: `${i * 80}ms` }}>
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 mb-0.5">{row.match}</div>
                          <div className="text-sm font-semibold text-slate-900">
                            {row.pick} <span className="text-slate-400 font-normal">@ {row.odds}</span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold border ${
                          row.label === "safe" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>
                          {row.conf}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between text-xs relative z-10">
                    <span className="text-slate-500">Combiné Sécurité (3 picks)</span>
                    <span className="font-bold text-slate-900 font-mono">Cote 6.99</span>
                  </div>
                </Card>
                <div className="absolute -bottom-4 -right-4 wp-gradient-warm text-white rounded-2xl px-5 py-3 shadow-2xl shadow-rose-500/40 rotate-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold opacity-90">Confiance IA</div>
                  <div className="text-3xl font-black tracking-tighter">82%</div>
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
              { id: "free", name: "Free", price: "0 FCFA", desc: "Pour découvrir", features: ["5 pronostics / jour", "1 sport au choix", "Statistiques de base"], cta: "Démarrer gratuit", highlight: false },
              { id: "pro", name: "Pro", price: "4 900 FCFA", per: "/mois", desc: "Le plus populaire", features: ["Pronostics illimités", "Tous les sports", "Analyse IA experte", "3 combinés quotidiens", "Notifications email VIP"], cta: "Choisir Pro", highlight: true },
              { id: "elite", name: "Elite", price: "14 900 FCFA", per: "/mois", desc: "Performance maximale", features: ["Tout Pro inclus", "Picks VIP >80% confiance", "Combinés boostés (5 picks)", "Bankroll & Kelly", "Support WhatsApp prio"], cta: "Choisir Elite", highlight: false },
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500">© 2026 WinPulse · Joue responsable · 18+</div>
          <div className="text-xs text-slate-400">Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre.</div>
        </div>
      </footer>
    </div>
  );
}
