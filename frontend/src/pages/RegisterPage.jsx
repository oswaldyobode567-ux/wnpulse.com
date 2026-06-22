import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, password, fullName);
      toast.success("Compte créé · bienvenue !");
      navigate("/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Inscription impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-blue-600 grid place-items-center"><Activity className="h-5 w-5" /></div>
          <span className="font-heading font-extrabold text-lg">Pronostix AI</span>
        </Link>
        <div>
          <h2 className="font-heading text-3xl font-extrabold leading-tight mb-3">
            Rejoignez les parieurs gagnants.
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed max-w-md">
            7 sports, analyse IA Claude 4.5, combinés du jour. Inscription gratuite, sans CB.
          </p>
        </div>
        <div className="text-xs text-slate-500">© 2026 Pronostix AI · 18+ · Jouez responsable</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <Card className="w-full max-w-md p-8 border-slate-200">
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 mb-1">Créer un compte</h1>
          <p className="text-sm text-slate-500 mb-6">Gratuit · sans carte bancaire</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nom complet</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required
                data-testid="register-name-input" placeholder="Jean Dupont" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                data-testid="register-email-input" placeholder="vous@email.com" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe (6+ caractères)</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                data-testid="register-password-input" placeholder="••••••••" className="mt-1" />
            </div>
            <Button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 h-11"
              data-testid="register-submit-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer mon compte"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-center text-slate-500">
            Déjà inscrit ?{" "}
            <Link to="/login" className="text-blue-600 font-semibold" data-testid="goto-login-link">
              Se connecter
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
