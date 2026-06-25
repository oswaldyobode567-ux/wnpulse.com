import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
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
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, testId: "nav-dashboard" },
  { to: "/app/top", label: "À la une", icon: Trophy, testId: "nav-top" },
  { to: "/app/combines", label: "Combinés", icon: Layers, testId: "nav-combos" },
  { to: "/app/value-bets", label: "Value bets", icon: Target, testId: "nav-value-bets" },
  { to: "/app/historique", label: "Track record", icon: History, testId: "nav-history" },
  { to: "/app/profil", label: "Profil", icon: User, testId: "nav-profile" },
  { to: "/app/abonnement", label: "Abonnement", icon: CreditCard, testId: "nav-subscription" },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const tierLabel = {
    free: { label: "Free", cls: "bg-slate-100 text-slate-700" },
    pro: { label: "Pro", cls: "bg-orange-100 text-orange-700" },
    elite: { label: "Elite", cls: "bg-rose-100 text-rose-700" },
  }[user?.subscription_tier || "free"];

  const navItems = [...NAV];
  if (user?.is_admin) {
    navItems.push({ to: "/app/admin", label: "Admin", icon: ShieldCheck, testId: "nav-admin" });
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-slate-950 text-slate-100 flex-col" data-testid="app-sidebar">
        <div className="px-6 py-6 border-b border-slate-800/80 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center shadow-lg shadow-orange-600/30">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} fill="white" />
          </div>
          <div>
            <div className="font-heading font-extrabold tracking-tight text-lg leading-none">WinPulse</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-orange-400/70 mt-1">Ton pouls de gagnant</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
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
                <Icon className={cn("h-4 w-4", active && "text-orange-400")} strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80">
          <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-400">Connecté</div>
              <Badge className={cn("text-[10px] font-bold", tierLabel.cls)} data-testid="user-tier-badge">
                {tierLabel.label === "Elite" && <Crown className="h-3 w-3 mr-1" />}
                {tierLabel.label}
              </Badge>
            </div>
            <div className="text-sm font-semibold truncate" data-testid="user-name">{user?.full_name}</div>
            <div className="text-xs text-slate-400 truncate mb-2">{user?.email}</div>
            <Button
              data-testid="logout-button"
              size="sm"
              variant="ghost"
              className="w-full text-slate-300 hover:text-white hover:bg-slate-800 justify-start"
              onClick={() => { logout(); navigate("/"); }}
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Déconnexion
            </Button>
          </div>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg wp-gradient-warm grid place-items-center text-white">
            <Zap className="h-4 w-4" strokeWidth={2.5} fill="white" />
          </div>
          <span className="font-heading font-extrabold">WinPulse</span>
        </div>
        <Badge className={cn("text-[10px] font-bold", tierLabel.cls)}>{tierLabel.label}</Badge>
      </header>

      <nav className={cn("lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200 grid", user?.is_admin ? "grid-cols-6" : "grid-cols-5")}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              data-testid={`${item.testId}-mobile`}
              className={cn(
                "flex flex-col items-center justify-center py-2 text-[10px]",
                active ? "text-orange-600" : "text-slate-500"
              )}
            >
              <Icon className="h-5 w-5 mb-1" />
              <span className="leading-none">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>

      <main className="lg:pl-64 pb-24 lg:pb-0 min-h-screen flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-neutral-200 bg-white py-5 px-4">
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-2 text-xs">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link to="/legal/mentions-legales" className="text-slate-500 hover:text-orange-600 font-semibold">Mentions légales</Link>
              <span className="text-slate-300">·</span>
              <Link to="/legal/cgv" className="text-slate-500 hover:text-orange-600 font-semibold">CGV</Link>
              <span className="text-slate-300">·</span>
              <Link to="/legal/confidentialite" className="text-slate-500 hover:text-orange-600 font-semibold">Confidentialité</Link>
              <span className="text-slate-300">·</span>
              <Link to="/legal/jeu-responsable" className="text-rose-600 hover:text-rose-700 font-semibold">Jeu responsable · 18+</Link>
            </div>
            <div className="text-slate-400">© 2026 WinPulse SARL · Cotonou, Bénin</div>
          </div>
        </footer>
      </main>
    </div>
  );
}
