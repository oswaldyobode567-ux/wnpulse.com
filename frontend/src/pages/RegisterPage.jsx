import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Activity, Loader2, Gift, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Pick up ?ref=CODE from URL
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setReferralCode(ref.toUpperCase());
      toast.info(`🎁 Code parrainage appliqué : ${ref.toUpperCase()}`, { duration: 4000 });
    }
  }, [searchParams]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, password, fullName, referralCode || null);
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
      <div className="hidden lg:flex flex-col justify-between bg-slate-950 text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 wp-gradient-hero opacity-30" />
        <Link to="/" className="flex items-center gap-2.5 relative z-10">
          <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center shadow-lg shadow-orange-600/30">
            <Activity className="h-5 w-5" strokeWidth={2.5} fill="white" />
          </div>
          <span className="font-heading font-extrabold text-lg">WinPulse</span>
        </Link>
        <div className="relative z-10">
          <h2 className="font-heading text-3xl font-extrabold leading-tight mb-3">
            Rejoins les parieurs gagnants.
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed max-w-md">
            7 sports, IA experte, 3 combinés du jour. Inscription gratuite, sans CB.
          </p>
          {referralCode && (
            <div className="mt-6 rounded-xl bg-gradient-to-br from-orange-500/20 to-rose-500/20 border border-orange-400/40 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="h-4 w-4 text-orange-300" />
                <span className="text-xs font-bold uppercase tracking-wider text-orange-300">Tu as été invité</span>
              </div>
              <div className="text-sm text-slate-200">Code : <span className="font-mono font-bold text-white">{referralCode}</span></div>
              <div className="text-xs text-slate-400 mt-1">Ton ami débloquera 7 jours Pro en t'aidant à découvrir WinPulse.</div>
            </div>
          )}
        </div>
        <div className="text-xs text-slate-500 relative z-10">© 2026 WinPulse · 18+ · Joue responsable</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-neutral-50">
        <Card className="w-full max-w-md p-8 border-neutral-200 shadow-lg">
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
            <div>
              <Label htmlFor="ref" className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-orange-500" /> Code parrainage <span className="text-slate-400 text-xs">(optionnel)</span>
              </Label>
              <Input id="ref" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                data-testid="register-referral-input" placeholder="WP-XXXX" className="mt-1 font-mono" />
            </div>
            <Button type="submit" disabled={loading}
              className="w-full wp-gradient-warm text-white border-0 hover:opacity-90 h-11"
              data-testid="register-submit-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer mon compte"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-center text-slate-500">
            Déjà inscrit ?{" "}
            <Link to="/login" className="text-orange-600 font-semibold" data-testid="goto-login-link">
              Se connecter
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
