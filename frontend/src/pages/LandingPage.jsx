import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Activity,
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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
            <div className="h-9 w-9 rounded-lg bg-blue-600 grid place-items-center text-white">
              <Activity className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-heading font-extrabold text-lg leading-none">Pronostix AI</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">FootyStats + BetAI</div>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Button data-testid="open-app-btn" className="bg-blue-600 hover:bg-blue-700" onClick={() => navigate("/app")}>
                Ouvrir l'app
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/login")} data-testid="header-login-btn">
                  Connexion
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => navigate("/register")} data-testid="header-signup-btn">
                  Démarrer gratuit
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden glow-soft">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 mb-6">
                <span className="h-2 w-2 rounded-full bg-emerald-500 live-dot" />
                Analyses en temps réel · Multi-sports
              </div>
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.05]">
                Les meilleurs pronostics<br />
                <span className="text-blue-600">propulsés par l'IA</span>.
              </h1>
              <p className="mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">
                Pronostix AI combine la rigueur statistique de <strong>FootyStats</strong> et la puissance d'analyse de <strong>Claude Sonnet 4.5</strong> pour identifier chaque jour les paris à plus forte probabilité — football, basket, tennis, NFL, NHL, MMA.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-base px-8 h-12"
                  onClick={() => navigate(user ? "/app" : "/register")}
                  data-testid="hero-cta-btn"
                >
                  Voir les pronostics du jour
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base px-8 h-12"
                  onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
                  data-testid="hero-pricing-btn"
                >
                  Voir les abonnements
                </Button>
              </div>
              <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Pas de carte bancaire
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Paiement MTN MoMo
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="relative">
                <Card className="bg-white border border-slate-200 rounded-2xl shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">À la une — Aujourd'hui</span>
                    </div>
                    <span className="text-xs text-emerald-700 font-semibold">+18.4% ROI 30j</span>
                  </div>
                  <div className="space-y-3">
                    {[
                      { match: "Real Madrid vs Barcelona", pick: "Real Madrid", conf: 82, label: "safe", odds: 1.78 },
                      { match: "Lakers vs Celtics", pick: "Celtics", conf: 71, label: "value", odds: 1.92 },
                      { match: "Djokovic vs Sinner", pick: "Djokovic", conf: 68, label: "value", odds: 2.05 },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 mb-0.5">{row.match}</div>
                          <div className="text-sm font-semibold text-slate-900">{row.pick} <span className="text-slate-400 font-normal">@ {row.odds}</span></div>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${
                          row.label === "safe" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>
                          {row.conf}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Combiné 3 sélections</span>
                    <span className="font-bold text-slate-900">Cote: 6.99</span>
                  </div>
                </Card>
                <div className="absolute -bottom-4 -right-4 bg-blue-600 text-white rounded-xl px-4 py-3 shadow-lg rotate-2">
                  <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Confiance IA</div>
                  <div className="text-2xl font-extrabold">82%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { val: "63%", lbl: "Taux de réussite 90j" },
            { val: "+22.7%", lbl: "ROI moyen Elite" },
            { val: "7", lbl: "Sports couverts" },
            { val: "24/7", lbl: "Analyse temps réel" },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="font-heading text-3xl sm:text-4xl font-black text-slate-900">{s.val}</div>
              <div className="text-xs text-slate-500 mt-1">{s.lbl}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Une analyse pro, claire et immédiate
          </h2>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            Toutes les données. Aucun bruit. Des recommandations chiffrées que vous comprenez en 5 secondes.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Brain, title: "IA Claude Sonnet 4.5", txt: "Une analyse textuelle claire de chaque match : forme, H2H, contexte, alternatives." },
            { icon: BarChart3, title: "Scoring déterministe", txt: "Probabilités consensus retirée du vig sur 3 bookmakers + variance pour scorer la confiance." },
            { icon: Sparkles, title: "Combinés gagnants", txt: "Parlays multi-sports auto-générés à partir des picks les plus fiables du jour." },
            { icon: Shield, title: "Track record transparent", txt: "Historique public de toutes les prédictions, ROI, win-rate, cotes moyennes." },
            { icon: TrendingUp, title: "Value bets détectés", txt: "Edge calculé vs marché. On vous dit où le bookmaker se trompe." },
            { icon: Smartphone, title: "Paiement MTN MoMo", txt: "Abonnement sans CB. Composez *880#, payez en 30 secondes." },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <Card key={i} className="bg-white border-slate-200 p-6 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 grid place-items-center mb-4">
                  <Icon className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="font-heading font-bold text-lg text-slate-900 mb-1">{f.title}</div>
                <div className="text-sm text-slate-600 leading-relaxed">{f.txt}</div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Choisissez votre niveau d'analyse
            </h2>
            <p className="mt-3 text-slate-600">Paiement sécurisé via MTN Mobile Money Bénin · annulable à tout moment</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { id: "free", name: "Free", price: "0 FCFA", desc: "Pour découvrir", features: ["5 pronostics / jour", "1 sport au choix", "Statistiques de base"], cta: "Démarrer gratuit", highlight: false },
              { id: "pro", name: "Pro", price: "4 900 FCFA", per: "/mois", desc: "Le plus populaire", features: ["Pronostics illimités", "Tous les sports", "Analyse IA Claude 4.5", "Combinés quotidiens", "Notifications temps réel"], cta: "Choisir Pro", highlight: true },
              { id: "elite", name: "Elite", price: "14 900 FCFA", per: "/mois", desc: "Performance maximale", features: ["Tout Pro inclus", "Picks VIP >80% confiance", "Combinés boostés", "Bankroll & Kelly", "Support WhatsApp prio"], cta: "Choisir Elite", highlight: false },
            ].map((p) => (
              <Card
                key={p.id}
                data-testid={`pricing-card-${p.id}`}
                className={`bg-white border p-6 relative ${p.highlight ? "border-blue-600 ring-2 ring-blue-600 shadow-lg" : "border-slate-200"}`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    Populaire
                  </div>
                )}
                <div className="text-sm text-slate-500 mb-1">{p.desc}</div>
                <div className="font-heading text-2xl font-extrabold text-slate-900 mb-2">{p.name}</div>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="font-heading text-4xl font-black tracking-tighter text-slate-900">{p.price}</span>
                  {p.per && <span className="text-sm text-slate-500">{p.per}</span>}
                </div>
                <ul className="space-y-2.5 mb-6">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  data-testid={`pricing-cta-${p.id}`}
                  className={`w-full ${p.highlight ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                  variant={p.highlight ? "default" : "outline"}
                  onClick={() => navigate(user ? "/app/abonnement" : "/register")}
                >
                  {p.cta}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            © 2026 Pronostix AI · Jouez responsable · 18+
          </div>
          <div className="text-xs text-slate-400">
            Les pronostics sont des analyses statistiques, pas des garanties. Pariez ce que vous pouvez perdre.
          </div>
        </div>
      </footer>
    </div>
  );
}
