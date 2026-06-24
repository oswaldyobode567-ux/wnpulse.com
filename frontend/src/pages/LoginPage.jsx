import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success("Bienvenue !");
      navigate("/app");
    } catch (err) {
      // Surface the EXACT error so user knows whether it's network, wrong pwd, or server
      let msg;
      if (err?.response) {
        // Server replied with an error
        msg = err.response.data?.detail || `Erreur ${err.response.status}`;
      } else if (err?.request) {
        msg = "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.";
      } else {
        msg = err?.message || "Erreur inconnue";
      }
      toast.error(msg, { duration: 6000 });
      console.error("[Login error]", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-slate-950 text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 wp-gradient-hero opacity-30" />
        <Link to="/" className="flex items-center gap-2.5 relative z-10" data-testid="brand-link">
          <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center shadow-lg shadow-orange-600/30">
            <Activity className="h-5 w-5" strokeWidth={2.5} fill="white" />
          </div>
          <span className="font-heading font-extrabold text-lg">WinPulse</span>
        </Link>
        <div className="relative z-10">
          <h2 className="font-heading text-3xl font-extrabold leading-tight mb-3">
            Les pronostics les plus fiables, en temps réel.
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed max-w-md">
            7 sports couverts · IA experte intégrée · 3 combinés gagnants par jour.
            Connecte-toi pour accéder à ton dashboard.
          </p>
        </div>
        <div className="text-xs text-slate-500 relative z-10">© 2026 WinPulse · 18+ · Joue responsable</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-neutral-50">
        <Card className="w-full max-w-md p-8 border-neutral-200 shadow-lg">
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 mb-1">Connexion</h1>
          <p className="text-sm text-slate-500 mb-6">Accède à tes pronostics du jour</p>
          <form onSubmit={submit} className="space-y-4">            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                data-testid="login-email-input"
                placeholder="vous@email.com"
                className="mt-1"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link to="/forgot-password" className="text-xs text-orange-600 font-semibold hover:underline" data-testid="forgot-password-link">
                  Mot de passe oublié ?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
                placeholder="••••••••"
                className="mt-1"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full wp-gradient-warm text-white border-0 hover:opacity-90 h-11"
              data-testid="login-submit-button"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-center text-slate-500">
            Pas encore de compte ?{" "}
            <Link to="/register" className="text-orange-600 font-semibold" data-testid="goto-register-link">
              Créer un compte gratuit
            </Link>
          </div>
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                toast.success("Cache vidé. Réessaye maintenant.");
              }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
              data-testid="clear-cache-btn"
            >
              Problème de connexion ? Vider le cache local
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
