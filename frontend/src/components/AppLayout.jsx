import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Trophy,
  Layers,
  History,
  CreditCard,
  LogOut,
  Activity,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, testId: "nav-dashboard" },
  { to: "/app/top", label: "À la une", icon: Trophy, testId: "nav-top" },
  { to: "/app/combines", label: "Combinés gagnants", icon: Layers, testId: "nav-combos" },
  { to: "/app/historique", label: "Track record", icon: History, testId: "nav-history" },
  { to: "/app/abonnement", label: "Abonnement", icon: CreditCard, testId: "nav-subscription" },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const tierLabel = {
    free: { label: "Free", cls: "bg-slate-100 text-slate-700" },
    pro: { label: "Pro", cls: "bg-blue-100 text-blue-700" },
    elite: { label: "Elite", cls: "bg-amber-100 text-amber-800" },
  }[user?.subscription_tier || "free"];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-slate-900 text-slate-100 flex-col" data-testid="app-sidebar">
        <div className="px-6 py-6 border-b border-slate-800 flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-blue-600 grid place-items-center">
            <Activity className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-heading font-extrabold tracking-tight text-lg">Pronostix</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">AI Edition</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          {NAV.map((item) => {
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
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="rounded-lg bg-slate-800/60 p-3">
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
              className="w-full text-slate-300 hover:text-white hover:bg-slate-700 justify-start"
              onClick={() => { logout(); navigate("/"); }}
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Déconnexion
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-600 grid place-items-center text-white">
            <Activity className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <span className="font-heading font-extrabold">Pronostix</span>
        </div>
        <Badge className={cn("text-[10px] font-bold", tierLabel.cls)}>
          {tierLabel.label}
        </Badge>
      </header>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-5">
        {NAV.map((item) => {
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
                active ? "text-blue-600" : "text-slate-500"
              )}
            >
              <Icon className="h-5 w-5 mb-1" />
              <span className="leading-none">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main */}
      <main className="lg:pl-64 pb-24 lg:pb-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
