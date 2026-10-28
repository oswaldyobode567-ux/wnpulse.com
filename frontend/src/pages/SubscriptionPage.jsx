import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import MatchCard from "@/components/MatchCard";
import AppLayout, { usePageLanguage, useExperienceCopy, useExperienceEvent } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Crown, Zap, X, Copy, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
const MOMO_NUMBER = "+229 01 66 28 06 03";
const MOMO_RECIPIENT_NAME = "KOUKPAKI VIANEY";
const WHATSAPP_NUMBER = "33767971752";
const WINPULSE_MONTHLY_PRICE_XOF = 10500;
const FALLBACK_PLAN = {
  id: "pro",
  name: "WinPulse Pro",
  price: WINPULSE_MONTHLY_PRICE_XOF,
  price_fcfa: WINPULSE_MONTHLY_PRICE_XOF,
  price_xof: WINPULSE_MONTHLY_PRICE_XOF,
  duration_days: 30,
  period: "mois",
  tagline: "Un seul prix. Tout WinPulse. Sans compromis.",
  features: ["Accès illimité à tous les pronostics, tous les jours, sur 7 sports", "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués", "Chaque match analysé sur tous ses marchés", "Combo Builder et détecteur de value bets", "Analyse IA experte sur chaque match", "Montante WinPulse avec picks débloqués", "Track Record public et vérifiable", "Support prioritaire par WhatsApp"]
};
function formatXof(i18n, value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString(i18n.locale) : "0";
}
export default function SubscriptionPage() {
  const i18n = usePageLanguage();
  const w = useExperienceCopy();
  useExperienceEvent("pro_view");
  const {
    user
  } = useAuth();
  const [plans, setPlans] = useState([FALLBACK_PLAN]);
  const [loading, setLoading] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState(1);
  const [payerName, setPayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState({
    provider: "manual_momo",
    fedapay_enabled: false
  });
  useEffect(() => {
    let active = true;
    Promise.all([api.get("/plans"), api.get("/payments/config").catch(() => ({
      data: {
        provider: "manual_momo",
        fedapay_enabled: false
      }
    }))]).then(([response, paymentResponse]) => {
      if (!active) return;
      setPaymentConfig({
        provider: paymentResponse?.data?.provider || "manual_momo",
        fedapay_enabled: paymentResponse?.data?.fedapay_enabled === true,
        fedapay_environment: paymentResponse?.data?.fedapay_environment || null
      });
      const remotePlans = Array.isArray(response?.data) ? response.data : [];
      const remotePlan = remotePlans[0];
      if (remotePlan && typeof remotePlan === "object") {
        setPlans([{
          ...FALLBACK_PLAN,
          ...remotePlan,
          id: String(remotePlan.id || FALLBACK_PLAN.id),
          name: String(remotePlan.name || FALLBACK_PLAN.name),
          price: WINPULSE_MONTHLY_PRICE_XOF,
          price_fcfa: WINPULSE_MONTHLY_PRICE_XOF,
          price_xof: WINPULSE_MONTHLY_PRICE_XOF,
          features: Array.isArray(remotePlan.features) ? remotePlan.features : FALLBACK_PLAN.features
        }]);
      }
    }).catch(() => {
      if (active) {
        toast.error(i18n.t("Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché."));
      }
    }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [i18n]);
  useEffect(() => {
    if (!paymentOpen || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [paymentOpen]);
  const plan = plans[0] || FALLBACK_PLAN;
  const subscriptionTier = String(user?.subscription_tier || user?.subscription || "free").toLowerCase();
  const isCurrent = Boolean(user?.is_admin || subscriptionTier !== "free");
  const amount = WINPULSE_MONTHLY_PRICE_XOF;
  const openPayment = () => {
    setPayerName(user?.full_name || user?.name || "");
    setPhone("");
    setReference("");
    setPaymentError("");
    setPaymentStep(1);
    api.post("/experience/events",{event:"pro_checkout"}).catch(()=>{});
    setPaymentOpen(true);
  };
  const closePayment = () => {
    if (submitting) return;
    setPaymentOpen(false);
  };
  const goNext = async () => {
    const cleanName = payerName.trim();
    const cleanPhone = phone.trim();
    if (!cleanName) {
      setPaymentError("Indique le nom utilisé pour le paiement.");
      return;
    }
    if (!cleanPhone && !paymentConfig?.fedapay_enabled) {
      setPaymentError("Indique le numéro MTN Mobile Money utilisé.");
      return;
    }
    if (!plan?.id) {
      setPaymentError("Le plan d'abonnement n'est pas disponible.");
      return;
    }
    setSubmitting(true);
    setPaymentError("");
    try {
      const response = await api.post("/subscription/checkout", {
        tier: String(plan.id).toLowerCase(),
        phone: cleanPhone,
        payer_name: cleanName
      });
      const generatedReference = response?.data?.reference;
      if (!generatedReference) {
        throw new Error("La référence de suivi n'a pas été générée.");
      }
      setReference(generatedReference);
      const paymentUrl = response?.data?.payment_url;
      if (paymentUrl) {
        let safePaymentUrl;
        try {
          safePaymentUrl = new URL(paymentUrl);
        } catch {
          throw new Error("Lien de paiement FedaPay invalide.");
        }
        if (safePaymentUrl.protocol !== "https:") {
          throw new Error("Le lien de paiement doit utiliser HTTPS.");
        }
        try {
          window.sessionStorage.setItem("winpulse_payment_reference", generatedReference);
        } catch {
          // sessionStorage peut être indisponible en navigation privée stricte.
        }
        window.location.assign(safePaymentUrl.toString());
        return;
      }
      setPaymentStep(2);
    } catch (error) {
      setPaymentError(error?.response?.data?.detail || error?.message || "Impossible de générer la référence de paiement.");
    } finally {
      setSubmitting(false);
    }
  };
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(i18n.t("Référence copiée"));
    } catch {
      toast.info(i18n.t("R\xE9f\xE9rence : {{v0}}", {
        v0: reference
      }));
    }
  };
  const openWhatsApp = () => {
    const message = ["Bonjour WinPulse !", "", i18n.t("Je viens d'effectuer le paiement pour activer mon plan {{v0}}.", {
      v0: plan?.name || "WinPulse Pro"
    }), i18n.t("R\xE9f\xE9rence : {{v0}}", {
      v0: reference
    }), i18n.t("Montant : {{v0}} FCFA", {
      v0: formatXof(i18n, amount)
    }), i18n.t("Num\xE9ro MTN MoMo utilis\xE9 : {{v0}}", {
      v0: phone.trim()
    }), i18n.t("Nom : {{v0}}", {
      v0: payerName.trim()
    }), i18n.t("Email : {{v0}}", {
      v0: user?.email || ""
    }), "", "Merci de vérifier mon paiement et d'activer mon accès."].join("\n");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  return <AppLayout>
      <div className="mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-7 pb-36 sm:px-6 lg:pb-10" data-testid="subscription-page-scroll">
        <header className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-10"><div className="pointer-events-none absolute -end-20 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" aria-hidden="true"/><p className="relative text-xs font-bold uppercase tracking-widest text-orange-300">WinPulse Pro</p><h1 className="relative mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{w.proTitle}</h1><p className="relative mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{w.proIntro}</p></header>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
          <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 sm:p-6" data-testid="pro-comparison"><h2 className="text-xl font-extrabold text-slate-900">{w.compare}</h2><div className="mt-5 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b pb-3 text-xs font-bold text-slate-500"><span>{w.feature}</span><span>Free</span><span className="text-orange-700">Pro</span></div>{[[w.selections,w.freeSelections,w.paidSelections],[w.availableData,w.preview,w.included],[w.savedSearches,'3','8'],[w.follow,w.included,w.included],[w.history,w.included,w.included],[w.combos,w.preview,w.included]].map(([label,free,pro],index)=><div key={index} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2 border-b border-slate-100 py-4 text-xs leading-5 sm:text-sm"><span className="break-words font-semibold text-slate-800">{label}</span><span className="break-words text-slate-500">{free}</span><span className="break-words font-bold text-orange-700">{pro}</span></div>)}<p className="mt-4 text-xs leading-6 text-slate-500">{w.coverage}</p></section>
          <section className="rounded-3xl border-2 border-orange-400 bg-white p-6 shadow-lg shadow-orange-100/50 sm:p-8" data-testid={`plan-${plan.id}`}><span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-extrabold text-orange-700">WinPulse Pro</span><div className="mt-5 flex flex-wrap items-baseline gap-2"><strong className="font-heading text-4xl font-black tracking-tight text-slate-900">{formatXof(i18n,amount)}</strong><span className="text-sm text-slate-500">FCFA / 30 {i18n.language==='fr'?'jours':i18n.language==='en'?'days':i18n.language==='es'?'días':i18n.language==='pt'?'dias':i18n.language==='de'?'Tage':'يوماً'}</span></div><p className="mt-4 text-sm leading-6 text-slate-500">{w.period}</p><ul className="mt-6 space-y-3">{[w.paidSelections,w.availableData,w.combos,w.builder,w.follow,w.savedSearches+' · 8'].map((label,index)=><li key={index} className="flex gap-2 text-sm leading-6 text-slate-700"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-orange-600"/><span>{label}</span></li>)}</ul><Button disabled={isCurrent} onClick={openPayment} data-testid="choose-pro-primary-btn" className="mt-7 h-auto min-h-12 w-full whitespace-normal bg-orange-600 px-5 py-3 text-base font-bold text-white hover:bg-orange-700">{isCurrent?i18n.t('Plan actuel'):w.upgrade}</Button><p className="mt-4 text-xs leading-6 text-slate-500">{w.payment}</p></section>
        </div>
        <ProDiscoveryExample />
        <p className="rounded-2xl bg-slate-100 p-4 text-xs leading-6 text-slate-600">{w.note}</p>
      </div>

      {i18n.tx(subscriptionTier === "free" && !isCurrent && !paymentOpen && <div className="lg:hidden fixed inset-x-0 z-[90] px-3 pointer-events-none" style={{
      bottom: "calc(4rem + env(safe-area-inset-bottom))"
    }} data-testid="subscription-mobile-sticky-cta">
          <div className="pointer-events-auto mx-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-orange-200 bg-white/95 p-3 shadow-[0_-8px_28px_rgba(15,23,42,0.16)] backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-slate-500">{i18n.t("WinPulse Pro")}</div>
              <div className="font-heading text-base font-black text-slate-900">
                {i18n.rich("{{v0}} FCFA / mois", {
              v0: i18n.tx(formatXof(i18n, amount))
            })}</div>
            </div>

            <button type="button" onClick={openPayment} className="shrink-0 rounded-xl bg-orange-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 active:scale-[0.99]" data-testid="subscription-mobile-sticky-unlock">{i18n.t("D\xE9bloquer Pro")}</button>
          </div>
        </div>)}

      {i18n.tx(paymentOpen && <div className="fixed inset-0 z-[99999] flex h-[100dvh] max-h-[100dvh] items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 lg:p-6 overflow-hidden" data-testid="subscription-payment-overlay" role="dialog" aria-modal="true" aria-label={i18n.t("Paiement WinPulse")}>
          <button type="button" className="absolute inset-0" aria-label={i18n.t("Fermer")} onClick={closePayment} />

          <div className="relative z-10 flex h-[100dvh] min-h-0 max-h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-lg sm:rounded-2xl" data-testid="subscription-payment-modal">
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 px-4 sm:px-5 py-2.5 sm:py-4">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-600">{i18n.t("Paiement WinPulse")}</div>
                <h2 className="mt-1 truncate text-lg sm:text-xl font-extrabold text-slate-900">
                  {i18n.tx(paymentStep === 1 ? "Informations de paiement" : "Détails du paiement")}
                </h2>
                <div className="mt-0.5 text-[11px] text-slate-500">{i18n.rich("WinPulse Pro \xB7 {{v0}} FCFA / mois", {
                v0: i18n.tx(formatXof(i18n, amount))
              })}</div>
              </div>

              <button type="button" onClick={closePayment} disabled={submitting} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 disabled:opacity-50" aria-label={i18n.t("Fermer")}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y px-4 sm:px-5 py-3 sm:py-5 pb-8 [-webkit-overflow-scrolling:touch]">
              {i18n.tx(paymentStep === 1 ? <div className="space-y-4">
                  <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
                    <div className="text-xs text-slate-500">{i18n.t("Montant de l'abonnement")}</div>
                    <div className="text-2xl font-black text-orange-600">
                      {i18n.rich("{{v0}} FCFA", {
                  v0: i18n.tx(formatXof(i18n, amount))
                })}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{i18n.t("30 jours \xB7 WinPulse Pro")}</div>
                  </div>

                  {i18n.tx(paymentConfig?.fedapay_enabled && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-5 text-emerald-800">
                      {i18n.rich("{{v0}} Apr\xE8s validation, tu seras redirig\xE9 vers la page de paiement.", {
                v0: <strong>{i18n.t("Paiement s\xE9curis\xE9 par FedaPay.")}</strong>
              })}</div>)}

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">{i18n.t("Email du compte")}</label>
                    <input type="email" value={user?.email || ""} readOnly className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm" dir="ltr" />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">{i18n.t("Nom utilis\xE9 pour le paiement")}</label>
                    <input type="text" value={payerName} onChange={event => setPayerName(event.target.value)} placeholder={i18n.t("Nom et prénom")} autoComplete="name" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {i18n.tx(paymentConfig?.fedapay_enabled ? "Téléphone (facultatif)" : "Numéro MTN Mobile Money")}
                    </label>
                    <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder={i18n.tx(paymentConfig?.fedapay_enabled ? "Ex. +229 01 97 00 00 00" : "Ex. 01 97 00 00 00")} autoComplete="tel" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" dir="ltr" />
                  </div>

                  {i18n.tx(paymentError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      {i18n.tx(paymentError)}
                    </div>)}
                </div> : <div className="space-y-5">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="text-xs font-bold text-emerald-700">{i18n.t("R\xE9f\xE9rence de suivi")}</div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="min-w-0 break-all font-mono text-lg sm:text-xl font-black text-slate-900">{i18n.tx(reference)}</div>
                      <button type="button" onClick={copyReference} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-200 bg-white text-emerald-700" aria-label={i18n.t("Copier la référence")}>
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="font-bold text-slate-900">{i18n.t("Proc\xE9dure MTN Mobile Money")}</h3>
                    <ol className="mt-3 space-y-3 text-sm text-slate-700">
                      <li>{i18n.rich("1. Compose {{v0}} ou ouvre l'application MTN MoMo.", {
                    v0: <strong>*165#</strong>
                  })}</li>
                      <li>{i18n.rich("2. Envoie {{v0}} au {{v1}}.", {
                    v0: <strong>{i18n.rich("{{v0}} FCFA", {
                        v0: i18n.tx(formatXof(i18n, amount))
                      })}</strong>,
                    v1: <strong>{i18n.tx(MOMO_NUMBER)}</strong>
                  })}</li>
                      <li>{i18n.rich("3. V\xE9rifie le destinataire : {{v0}}.", {
                    v0: <strong>{i18n.tx(MOMO_RECIPIENT_NAME)}</strong>
                  })}</li>
                      <li>{i18n.t("4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.")}</li>
                    </ol>
                  </div>
                </div>)}
            </div>

            <div className="shrink-0 z-30 border-t border-slate-200 bg-white px-4 sm:px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 shadow-[0_-12px_28px_rgba(15,23,42,0.16)]">
              {i18n.tx(paymentStep === 1 ? <button type="button" onClick={goNext} disabled={submitting} data-testid="subscription-inline-next" className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-base font-extrabold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-wait disabled:bg-slate-400">
                  {i18n.tx(submitting ? <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {i18n.tx(paymentConfig?.fedapay_enabled ? "Ouverture du paiement…" : "Préparation du paiement…")}
                    </> : paymentConfig?.fedapay_enabled ? i18n.t("Payer {{v0}} FCFA", {
              v0: formatXof(i18n, amount)
            }) : i18n.t("Continuer \u2014 {{v0}} FCFA", {
              v0: formatXof(i18n, amount)
            }))}
                </button> : <button type="button" onClick={openWhatsApp} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm sm:text-base font-extrabold text-white">
                  <MessageCircle className="h-4 w-4" />{i18n.t("Envoyer la confirmation sur WhatsApp")}</button>)}
            </div>
          </div>
        </div>)}
    </AppLayout>;
}

function ProDiscoveryExample(){
 const w=useExperienceCopy();const {user}=useAuth();const [example,setExample]=useState(null);
 useEffect(()=>{const controller=new AbortController();setExample(null);api.get('/discovery',{signal:controller.signal,timeout:12000}).then(({data})=>{if(!controller.signal.aborted)setExample((data.items||[]).find(m=>m?.prediction?.pick&&!m.prediction.locked)||null);}).catch(()=>{});return()=>controller.abort();},[user?.id,user?.subscription,user?.subscription_tier]);
 return <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7" data-testid="pro-real-example"><h2 className="text-lg font-extrabold text-slate-900">{w.previewExample}</h2>{example?<div className="mt-4 max-w-xl"><MatchCard match={example} isFree={!user?.is_admin&&String(user?.subscription_tier||user?.subscription||'free').toLowerCase()==='free'}/></div>:<Link to="/app/aujourdhui" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-orange-700">{w.allMatches} →</Link>}</section>;
}
