import MontantePage from "@/pages/MontantePage";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import MatchDetailPage from "@/pages/MatchDetailPage";
import CombosPage from "@/pages/CombosPage";
import HistoryPage from "@/pages/HistoryPage";
import SubscriptionPage from "@/pages/SubscriptionPage";
import TopPicksPage from "@/pages/TopPicksPage";
import AdminPage from "@/pages/AdminPage";
import TrackRecordPage from "@/pages/TrackRecordPage";
import ValueBetsPage from "@/pages/ValueBetsPage";
import ProfilePage from "@/pages/ProfilePage";
import ParrainagePage from "@/pages/ParrainagePage";
import ComboBuilderPage from "@/pages/ComboBuilderPage";
import TodayCombosPage from "@/pages/TodayCombosPage";
import LivePage from "@/pages/LivePage";
import BlogPage from "@/pages/BlogPage";
import BlogPostPage from "@/pages/BlogPostPage";
import LegalPage from "@/pages/LegalPage";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import PageTracker from "@/components/PageTracker";
import { LanguageProvider, LanguageSwitcher, useLanguage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
function Kpi({
  label,
  value,
  sub
}) {
  return <Card className="bg-white border-neutral-200 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
        {label}
      </div>

      <div className="font-heading text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
        {value}
      </div>

      <div className="text-xs text-slate-500 mt-1">
        {sub}
      </div>
    </Card>;
}
function RequireAuth({
  children,
  admin = false
}) {
  const {
    t
  } = useLanguage();
  const {
    user,
    loading
  } = useAuth();
  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-neutral-50">
        <div className="text-slate-500 text-sm">
          {t("Chargement…")}
        </div>
      </div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (admin && !user.is_admin) {
    return <Navigate to="/app" replace />;
  }
  return children;
}
export default function App() {
  return <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <PublicLanguageBar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          <Route path="/resultats" element={<TrackRecordPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/legal/:slug" element={<LegalPage />} />

          <Route path="/legal" element={<Navigate to="/legal/mentions-legales" replace />} />

          <Route path="/app" element={<RequireAuth>
                <DashboardPage />
              </RequireAuth>} />

          <Route path="/app/top" element={<RequireAuth>
                <TopPicksPage />
              </RequireAuth>} />

          <Route path="/app/value-bets" element={<RequireAuth>
                <ValueBetsPage />
              </RequireAuth>} />

          <Route path="/app/montante" element={<RequireAuth>
                <MontantePage />
              </RequireAuth>} />

          <Route path="/montante" element={<Navigate to="/app/montante" replace />} />

          <Route path="/app/profil" element={<RequireAuth>
                <ProfilePage />
              </RequireAuth>} />

          <Route path="/app/parrainage" element={<RequireAuth>
                <ParrainagePage />
              </RequireAuth>} />

          <Route path="/app/match/:matchId" element={<RequireAuth>
                <MatchDetailPage />
              </RequireAuth>} />

          <Route path="/app/combines" element={<RequireAuth>
                <CombosPage />
              </RequireAuth>} />

          <Route path="/app/builder" element={<RequireAuth>
                <ComboBuilderPage />
              </RequireAuth>} />

          <Route path="/app/aujourdhui" element={<RequireAuth>
                <TodayCombosPage />
              </RequireAuth>} />

          <Route path="/app/live" element={<RequireAuth>
                <LivePage />
              </RequireAuth>} />

          <Route path="/app/historique" element={<RequireAuth>
                <HistoryPage />
              </RequireAuth>} />

          <Route path="/app/abonnement" element={<RequireAuth>
                <SubscriptionPage />
              </RequireAuth>} />

          <Route path="/app/admin" element={<RequireAuth admin>
                <AdminPage />
              </RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <PageTracker />
        <WhatsAppWidget />
        <LocalizedToaster />
      </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>;
}
function PublicLanguageBar() {
  const {
    pathname
  } = useLocation();
  const {
    t
  } = useLanguage();
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;
  return <div className="border-b border-neutral-200 bg-white px-4 py-2" data-testid="public-language-bar">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3">
      <span className="text-sm font-semibold text-slate-600">{t("Langue de l’interface")}</span>
      <LanguageSwitcher compact />
    </div>
  </div>;
}
function LocalizedToaster() {
  const {
    direction
  } = useLanguage();
  return <Toaster position={direction === "rtl" ? "top-left" : "top-right"} richColors />;
}
