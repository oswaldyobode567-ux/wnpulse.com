import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import MatchDetailPage from "@/pages/MatchDetailPage";
import CombosPage from "@/pages/CombosPage";
import HistoryPage from "@/pages/HistoryPage";
import SubscriptionPage from "@/pages/SubscriptionPage";
import TopPicksPage from "@/pages/TopPicksPage";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="text-slate-500 text-sm">Chargement…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
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
          <Route path="/app" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/app/top" element={<RequireAuth><TopPicksPage /></RequireAuth>} />
          <Route path="/app/match/:matchId" element={<RequireAuth><MatchDetailPage /></RequireAuth>} />
          <Route path="/app/combines" element={<RequireAuth><CombosPage /></RequireAuth>} />
          <Route path="/app/historique" element={<RequireAuth><HistoryPage /></RequireAuth>} />
          <Route path="/app/abonnement" element={<RequireAuth><SubscriptionPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
