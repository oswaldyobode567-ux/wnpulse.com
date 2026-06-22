import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Activity, Loader2, ArrowLeft, MailCheck } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur réseau");
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
          <h2 className="font-heading text-3xl font-extrabold leading-tight mb-3">Ça arrive aux meilleurs.</h2>
          <p className="text-slate-300 text-sm leading-relaxed max-w-md">
            Un mot de passe perdu, ça se règle en 2 minutes. On t'envoie un lien sécurisé sur ton email.
          </p>
        </div>
        <div className="text-xs text-slate-500 relative z-10">© 2026 WinPulse · 18+</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-neutral-50">
        <Card className="w-full max-w-md p-8 border-neutral-200 shadow-lg">
          <Link to="/login" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4" data-testid="back-to-login">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour à la connexion
          </Link>

          {sent ? (
            <div className="text-center py-4" data-testid="forgot-success">
              <div className="h-14 w-14 rounded-full bg-emerald-100 grid place-items-center mx-auto mb-4">
                <MailCheck className="h-7 w-7 text-emerald-600" />
              </div>
              <h1 className="font-heading text-2xl font-extrabold text-slate-900 mb-2">Lien envoyé !</h1>
              <p className="text-sm text-slate-600 mb-6">
                Si un compte WinPulse existe avec <strong>{email}</strong>, un email avec le lien de réinitialisation vient de partir. Vérifie ta boîte (et le dossier spam).
              </p>
              <p className="text-xs text-slate-400 mb-6">
                Le lien expire dans 2 heures.
              </p>
              <Button onClick={() => navigate("/login")} variant="outline" className="w-full" data-testid="back-to-login-btn">
                Retour à la connexion
              </Button>
            </div>
          ) : (
            <>
              <h1 className="font-heading text-2xl font-extrabold text-slate-900 mb-1">Mot de passe oublié ?</h1>
              <p className="text-sm text-slate-500 mb-6">Saisis ton email, on t'envoie un lien pour le réinitialiser.</p>
              <form onSubmit={submit} className="space-y-4">
                <div>
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
                    data-testid="forgot-email-input"
                    placeholder="vous@email.com"
                    className="mt-1"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full wp-gradient-warm text-white border-0 hover:opacity-90 h-11"
                  data-testid="forgot-submit-button"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer le lien"}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
