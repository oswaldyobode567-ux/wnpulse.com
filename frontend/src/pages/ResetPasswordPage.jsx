import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Activity, Loader2, KeyRound } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("6 caractères minimum");
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      toast.success("Mot de passe mis à jour !");
      navigate("/login");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Lien invalide ou expiré");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-slate-950 text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 wp-gradient-hero opacity-30" />
        <Link to="/" className="flex items-center gap-2.5 relative z-10">
          <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center shadow-lg shadow-orange-600/30">
            <Activity className="h-5 w-5" strokeWidth={2.5} fill="white" />
          </div>
          <span className="font-heading font-extrabold text-lg">WinPulse</span>
        </Link>
        <div className="relative z-10">
          <h2 className="font-heading text-3xl font-extrabold leading-tight mb-3">Nouveau départ.</h2>
          <p className="text-slate-300 text-sm leading-relaxed max-w-md">
            Choisis un mot de passe solide, et c'est reparti pour les pronostics gagnants.
          </p>
        </div>
        <div className="text-xs text-slate-500 relative z-10">© 2026 WinPulse · 18+</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-neutral-50">
        <Card className="w-full max-w-md p-8 border-neutral-200 shadow-lg">
          <div className="h-12 w-12 rounded-xl wp-gradient-warm grid place-items-center text-white mb-4">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 mb-1">Nouveau mot de passe</h1>
          <p className="text-sm text-slate-500 mb-6">Choisis un mot de passe d'au moins 6 caractères.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="pwd">Nouveau mot de passe</Label>
              <Input
                id="pwd"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                data-testid="reset-password-input"
                placeholder="••••••••"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pwd2">Confirme le mot de passe</Label>
              <Input
                id="pwd2"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                data-testid="reset-confirm-input"
                placeholder="••••••••"
                className="mt-1"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full wp-gradient-warm text-white border-0 hover:opacity-90 h-11"
              data-testid="reset-submit-button"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Réinitialiser le mot de passe"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
