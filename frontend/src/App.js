import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import LegalPage from "@/pages/LegalPage";

function RequireAuth({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50">
        <div className="text-slate-500 text-sm">Chargement…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !user.is_admin) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/resultats" element={<TrackRecordPage />} />
          <Route path="/legal/:slug" element={<LegalPage />} />
          <Route path="/legal" element={<Navigate to="/legal/mentions-legales" replace />} />
          <Route path="/app" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/app/top" element={<RequireAuth><TopPicksPage /></RequireAuth>} />
          <Route path="/app/value-bets" element={<RequireAuth><ValueBetsPage /></RequireAuth>} />
          <Route path="/app/profil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/app/match/:matchId" element={<RequireAuth><MatchDetailPage /></RequireAuth>} />
          <Route path="/app/combines" element={<RequireAuth><CombosPage /></RequireAuth>} />
          <Route path="/app/historique" element={<RequireAuth><HistoryPage /></RequireAuth>} />
          <Route path="/app/abonnement" element={<RequireAuth><SubscriptionPage /></RequireAuth>} />
          <Route path="/app/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
