import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/components/AppLayout";
import { toast } from "sonner";

export default function LoginPage() {
  const { t } = useLanguage();
  const translateRef = useRef(t);
  translateRef.current = t;
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success(translateRef.current("Bienvenue !"));
      navigate("/app");
    } catch (err) {
      let msg;
      if (err?.response) {
        const detail = err.response.data?.detail;
        msg = typeof detail === "string" ? detail : translateRef.current("Erreur {{status}}", { status: err.response.status });
      } else if (err?.request) {
        msg = "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.";
      } else {
        msg = err?.message || t("Erreur inconnue");
      }
      toast.error(translateRef.current(msg), { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-slate-950 text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 wp-gradient-hero opacity-30" />
        <Link to="/" className="flex items-center gap-2.5 relative z-10" data-testid="brand-link">
          <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center shadow-lg shadow-orange-600/30"><Activity className="h-5 w-5" strokeWidth={2.5} fill="white" /></div>
          <span className="font-heading font-extrabold text-lg">WinPulse</span>
        </Link>
        <div className="relative z-10">
          <h2 className="font-heading text-3xl font-extrabold leading-tight mb-3">{t("Vise la victoire avec nos pronostics.")}</h2>
          <p className="text-slate-300 text-sm leading-relaxed max-w-md">{t("Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.")}</p>
        </div>
        <div className="text-xs text-slate-500 relative z-10">{t("© 2026 WinPulse · 18+ · Joue responsable")}</div>
      </div>
      <div className="flex min-w-0 items-center justify-center p-4 sm:p-12 bg-neutral-50">
        <Card className="w-full min-w-0 max-w-md p-5 sm:p-8 border-neutral-200 shadow-lg">
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 mb-1">{t("Connexion")}</h1>
          <p className="text-sm text-slate-500 mb-6">{t("Accède à tes pronostics du jour")}</p>
          <form aria-busy={loading} onSubmit={submit} className="space-y-4">
            <div><Label htmlFor="email">{t("Email")}</Label><Input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoCapitalize="off" autoCorrect="off" spellCheck={false} data-testid="login-email-input" autoComplete="username" dir="ltr" placeholder={t("vous@email.com")} className="mt-1 h-12 text-base" /></div>
            <div><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="password">{t("Mot de passe")}</Label><Link to="/forgot-password" className="text-xs text-orange-600 font-semibold hover:underline" data-testid="forgot-password-link">{t("Mot de passe oublié ?")}</Link></div><Input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required data-testid="login-password-input" autoComplete="current-password" placeholder="••••••••" className="mt-1 h-12 text-base" /></div>
            <Button type="submit" disabled={loading} className="w-full min-h-12 h-auto whitespace-normal py-3 wp-gradient-warm text-base text-white border-0 hover:opacity-90" data-testid="login-submit-button">{loading ? <><Loader2 className="h-4 w-4 animate-spin me-2" /><span>{t("Connexion en cours…")}</span></> : t("Se connecter")}</Button>
          </form>
          <div className="mt-6 text-sm text-center text-slate-500">{t("Pas encore de compte ?")}{" "}<Link to="/register" className="text-orange-600 font-semibold" data-testid="goto-register-link">{t("Créer un compte gratuit")}</Link></div>
          <div className="mt-3 text-center"><button type="button" onClick={()=>{try {
                localStorage.removeItem("pronostix_token");
                localStorage.removeItem("pronostix_user");
                sessionStorage.removeItem("winpulse_live_scores_v2");
                toast.success(translateRef.current("Cache de connexion effacé. Réessaye maintenant."));
              } catch {
                toast.error(translateRef.current("Le navigateur bloque l’accès au stockage local."));
              }}} className="text-xs text-slate-400 hover:text-slate-600 underline" data-testid="clear-cache-btn">{t("Problème de connexion ? Effacer le cache de connexion")}</button></div>
        </Card>
      </div>
    </div>
  );
}
