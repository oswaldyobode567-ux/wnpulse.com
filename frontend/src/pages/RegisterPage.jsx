import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, CheckCircle2, Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useLanguage } from "@/components/AppLayout";

const ADULT_MESSAGES = {
  "fr": {
    "Je certifie avoir au moins 18 ans.": "Je certifie avoir au moins 18 ans.",
    "Tu dois certifier avoir au moins 18 ans pour créer un compte.": "Tu dois certifier avoir au moins 18 ans pour créer un compte.",
    "Rejoins notre canal Telegram": "Rejoins notre canal Telegram",
    "Retrouve les actualités et les sélections partagées par WNPulse. Adhésion facultative.": "Retrouve les actualités et les sélections partagées par WNPulse. Adhésion facultative.",
    "Rejoindre le canal": "Rejoindre le canal",
    "Compte créé. Connecte-toi pour continuer.": "Compte créé. Connecte-toi pour continuer."
  },
  "en": {
    "Je certifie avoir au moins 18 ans.": "I certify that I am at least 18 years old.",
    "Tu dois certifier avoir au moins 18 ans pour créer un compte.": "You must certify that you are at least 18 to create an account.",
    "Rejoins notre canal Telegram": "Join our Telegram channel",
    "Retrouve les actualités et les sélections partagées par WNPulse. Adhésion facultative.": "Find news and selections shared by WNPulse. Joining is optional.",
    "Rejoindre le canal": "Join the channel",
    "Compte créé. Connecte-toi pour continuer.": "Account created. Log in to continue."
  },
  "es": {
    "Je certifie avoir au moins 18 ans.": "Certifico que tengo al menos 18 años.",
    "Tu dois certifier avoir au moins 18 ans pour créer un compte.": "Debes certificar que tienes al menos 18 años para crear una cuenta.",
    "Rejoins notre canal Telegram": "Únete a nuestro canal de Telegram",
    "Retrouve les actualités et les sélections partagées par WNPulse. Adhésion facultative.": "Descubre las novedades y selecciones de WNPulse. Unirse es opcional.",
    "Rejoindre le canal": "Unirse al canal",
    "Compte créé. Connecte-toi pour continuer.": "Cuenta creada. Inicia sesión para continuar."
  },
  "pt": {
    "Je certifie avoir au moins 18 ans.": "Declaro que tenho pelo menos 18 anos.",
    "Tu dois certifier avoir au moins 18 ans pour créer un compte.": "É necessário declarar que tens pelo menos 18 anos para criar uma conta.",
    "Rejoins notre canal Telegram": "Junta-te ao nosso canal Telegram",
    "Retrouve les actualités et les sélections partagées par WNPulse. Adhésion facultative.": "Descobre as novidades e seleções da WNPulse. A adesão é opcional.",
    "Rejoindre le canal": "Aderir ao canal",
    "Compte créé. Connecte-toi pour continuer.": "Conta criada. Inicia sessão para continuar."
  },
  "de": {
    "Je certifie avoir au moins 18 ans.": "Ich bestätige, dass ich mindestens 18 Jahre alt bin.",
    "Tu dois certifier avoir au moins 18 ans pour créer un compte.": "Du musst bestätigen, dass du mindestens 18 Jahre alt bist, um ein Konto zu erstellen.",
    "Rejoins notre canal Telegram": "Tritt unserem Telegram-Kanal bei",
    "Retrouve les actualités et les sélections partagées par WNPulse. Adhésion facultative.": "Neuigkeiten und Tipps von WNPulse. Der Beitritt ist freiwillig.",
    "Rejoindre le canal": "Kanal beitreten",
    "Compte créé. Connecte-toi pour continuer.": "Konto erstellt. Melde dich an, um fortzufahren."
  },
  "ar": {
    "Je certifie avoir au moins 18 ans.": "أقر بأن عمري 18 عامًا على الأقل.",
    "Tu dois certifier avoir au moins 18 ans pour créer un compte.": "يجب أن تقر بأن عمرك 18 عامًا على الأقل لإنشاء حساب.",
    "Rejoins notre canal Telegram": "انضم إلى قناتنا على تيليغرام",
    "Retrouve les actualités et les sélections partagées par WNPulse. Adhésion facultative.": "تابع أخبار وترشيحات WNPulse. الانضمام اختياري.",
    "Rejoindre le canal": "الانضمام إلى القناة",
    "Compte créé. Connecte-toi pour continuer.": "تم إنشاء الحساب. سجّل الدخول للمتابعة."
  }
};

// Submit the full registration payload directly; reload so AuthContext reads the new session.
export default function RegisterPage() {
  const { t: globalTranslate, language } = useLanguage();
  const t = (key) => ADULT_MESSAGES[language]?.[key] || globalTranslate(key);
  const [params] = useSearchParams();
  const initialReferral = (params.get("ref") || "").trim().toUpperCase();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(initialReferral);
  const [showReferral, setShowReferral] = useState(Boolean(initialReferral));
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (!ageConfirmed) {
      setError("Tu dois certifier avoir au moins 18 ans pour créer un compte.");
      return;
    }
    const normalizedNumber = whatsapp.trim().replace(/[\s().-]/g, "");
    if (!fullName.trim()) {
      setError("Renseigne ton nom.");
      return;
    }
    if (!normalizedNumber) {
      setError("Ton numéro WhatsApp est obligatoire pour créer ton compte.");
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedNumber)) {
      setError("Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        referral_code: referralCode.trim() || null,
        whatsapp_number: normalizedNumber,
        whatsapp_marketing_opt_in: whatsappOptIn,
        age_confirmed: ageConfirmed,
      });
      if (!data?.access_token || !data?.user) throw new Error("L’inscription n’a pas abouti. Réessaie dans un instant.");
      try {
        localStorage.setItem("pronostix_token", data.access_token);
        localStorage.setItem("pronostix_user", JSON.stringify(data.user));
      } catch {
        // The account already exists: do not invite the user to create it again.
        setError("Compte créé. Connecte-toi pour continuer.");
        return;
      }
      window.location.replace("/app");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const message = err?.response?.data?.message;
      setError(typeof detail === "string" ? detail : typeof message === "string" ? message : err instanceof Error && !err?.response ? err.message : "L’inscription n’a pas abouti. Réessaie dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen min-h-[100dvh] w-full bg-neutral-50 lg:grid-cols-2">
      <aside className="relative hidden min-w-0 flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 wp-gradient-hero" />
        <Link to="/" className="relative flex items-center gap-3 text-2xl font-extrabold font-heading">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl wp-gradient-warm"><Activity className="h-6 w-6" /></span>
          WinPulse
        </Link>
        <div className="relative my-12 max-w-lg">
          <h2 className="font-heading text-4xl font-extrabold leading-tight">{t("Analyse les matchs. Vérifie les résultats. Décide toi-même.")}</h2>
          <p className="mt-5 leading-relaxed text-slate-300">{t("Commence gratuitement, sans carte bancaire.")}</p>
          <div className="mt-8 space-y-4 text-slate-200">
            {[t("Sélections gratuites disponibles"), t("Historique public des résultats"), t("Aucun paiement pour créer le compte")].map((text) => (
              <div key={text} className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><span>{text}</span></div>
            ))}
          </div>
          {referralCode && <div dir="ltr" className="mt-7 rounded-xl border border-orange-400/40 bg-orange-500/10 p-4"><div className="flex items-center gap-2 text-sm font-bold text-orange-300"><Gift className="h-4 w-4 shrink-0" />{t("Invitation détectée")}</div><p className="mt-2 break-all font-mono text-sm">{referralCode}</p></div>}
        </div>
        <p className="relative text-xs text-slate-400">© {new Date().getFullYear()} {t("WinPulse · 18+ · Joue responsable")}</p>
      </aside>

      <main className="flex min-w-0 items-center justify-center px-4 py-8 sm:px-6 lg:p-12">
        <div className="w-full min-w-0 max-w-md">
          <Link to="/" className="mb-7 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white wp-gradient-warm"><Activity className="h-5 w-5" /></span>
            <span className="font-heading text-xl font-extrabold text-slate-900">WinPulse</span>
          </Link>
          <Card className="min-w-0 border-neutral-200 p-5 shadow-lg sm:p-8">
            <div className="mb-6">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{t("100 % gratuit")}</div>
              <h1 className="font-heading text-2xl font-extrabold text-slate-900">{t("Ton accès gratuit est presque prêt")}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{t("Crée ton compte pour découvrir WinPulse.")}</p>
            </div>
            <div className="mb-6 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center lg:hidden">
              <div><div className="text-xs font-bold">{t("Gratuit")}</div><div className="mt-0.5 text-xs text-slate-500">{t("0 FCFA")}</div></div>
              <div className="border-x border-slate-200"><div className="text-xs font-bold">{t("Sans CB")}</div><div className="mt-0.5 text-xs text-slate-500">{t("Aucun paiement")}</div></div>
              <div><div className="text-xs font-bold">{t("Libre")}</div><div className="mt-0.5 text-xs text-slate-500">{t("Sans engagement")}</div></div>
            </div>
            <form onSubmit={submit} className="space-y-4" aria-busy={loading}>
              <div><Label htmlFor="name">{t("Nom")}</Label><Input id="name" name="name" dir="auto" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" placeholder={t("Ton nom complet")} className="mt-1 h-11" data-testid="register-name-input" /></div>
              <div><Label htmlFor="email">{t("Email")}</Label><Input id="email" name="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder={t("vous@email.com")} dir="ltr" className="mt-1 h-11 text-start" data-testid="register-email-input" /></div>
              <div>
                <Label htmlFor="whatsapp">{t("Numéro WhatsApp")} <span className="ms-1 text-xs font-normal text-orange-700">{t("(obligatoire)")}</span></Label>
                <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" required maxLength={40} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+225 07 00 00 00 00" aria-describedby="whatsapp-help" dir="ltr" className="mt-1 h-11 text-start" data-testid="register-whatsapp-input" />
                <p id="whatsapp-help" className="mt-1.5 text-xs text-slate-500">{t("Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.")}</p>
              </div>
              <div><Label htmlFor="password">{t("Mot de passe")}</Label><Input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" placeholder={t("10 caractères minimum")} className="mt-1 h-11" data-testid="register-password-input" /></div>
              {!showReferral ? <button type="button" onClick={() => setShowReferral(true)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-orange-600"><Gift className="h-3.5 w-3.5" />{t("J’ai un code parrainage")}</button> : <div><Label htmlFor="ref">{t("Code parrainage")} <span className="text-xs font-normal text-slate-500">{t("(optionnel)")}</span></Label><Input id="ref" name="referralCode" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="WP-XXXX" autoComplete="off" dir="ltr" className="mt-1 h-11 font-mono text-start" data-testid="register-referral-input" /></div>}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label htmlFor="whatsapp-opt-in" className="flex cursor-pointer items-start gap-3">
                  <input id="whatsapp-opt-in" name="whatsapp_marketing_opt_in" type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-orange-600" data-testid="register-whatsapp-opt-in" />
                  <span className="min-w-0 text-xs leading-relaxed text-slate-600">{t("J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.")}</span>
                </label>
              </div>
              <label htmlFor="age-confirmed" className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
                <input id="age-confirmed" name="age_confirmed" type="checkbox" required checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600" data-testid="register-age-confirmed" />
                <span className="text-sm font-semibold leading-6 text-slate-800">{t("Je certifie avoir au moins 18 ans.")}</span>
              </label>
              {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{t(error)}</p>}
              <Button type="submit" disabled={loading} className="h-auto min-h-12 w-full whitespace-normal border-0 px-3 py-3 text-base font-bold text-white wp-gradient-warm hover:opacity-90" data-testid="register-submit-button">{loading ? <><Loader2 className="me-2 h-4 w-4 shrink-0 animate-spin" />{t("Création du compte…")}</> : t("Créer mon compte gratuit")}</Button>
            </form>
            <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">{t("Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.")}</p>
            <aside className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label={t("Rejoins notre canal Telegram")}>
              <h2 className="text-sm font-bold text-slate-900">{t("Rejoins notre canal Telegram")}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">{t("Retrouve les actualités et les sélections partagées par WNPulse. Adhésion facultative.")}</p>
              <a href="https://t.me/wnplus" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-800" data-testid="register-telegram">{t("Rejoindre le canal")} ↗</a>
            </aside>
            <Link to="/legal/confidentialite" className="mt-3 block text-center text-xs text-orange-700 underline">{t("Politique de confidentialité")}</Link>
            <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">{t("Déjà inscrit ?")} <Link to="/login" className="font-semibold text-orange-600" data-testid="goto-login-link">{t("Se connecter")}</Link></div>
          </Card>
          <p className="mt-5 text-center text-xs text-slate-500 lg:hidden">{t("18+ · Joue responsable")}</p>
        </div>
      </main>
    </div>
  );
}
