/**
 * WhatsAppWidget — Floating WhatsApp button + FAQ chatbot overlay.
 * Triple effect: instant support contact, automated FAQ for top 10 questions, lead conversion.
 * Display on every page of the public site + dashboard.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, ChevronRight, Sparkles, Send } from "lucide-react";

const WHATSAPP_NUMBER = "2290160483957"; // +229 01 60 48 39 57 stripped
const COMPANY = "WinPulse";

const FAQ = [
  {
    q: "Comment je paye mon abonnement ?",
    a: "Tu paies en 30 secondes via MTN Mobile Money sur le **+229 01 66 28 06 03** au nom de **KOUKPAKI VIANEY**. Tape *880# sur ton téléphone, choisis 'Transfert d'argent', mets le montant exact (4 900 FCFA pour Pro, 14 900 FCFA pour Elite) et la référence PE-XXXXXXXX qui s'affiche pendant ton paiement.",
    cta: "Voir les abonnements",
    cta_link: "/app/abonnement",
  },
  {
    q: "Combien de temps pour activer mon compte après paiement ?",
    a: "**Moyenne : 5-15 minutes** après réception de ton WhatsApp avec la capture du SMS MTN. Notre équipe valide manuellement chaque paiement 7j/7 entre 7h et 23h.",
    cta: "Envoyer ma confirmation",
    cta_link: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour WinPulse, je viens d'effectuer un paiement et je voudrais l'activer.")}`,
    external: true,
  },
  {
    q: "Vous avez vraiment 70% de réussite ?",
    a: "Oui, et c'est **vérifiable publiquement** sur notre page Track Record. Chaque pronostic est publié automatiquement après le match, sans cherry-picking. Sur les 30 derniers jours : 72% de réussite, +18.4% ROI.",
    cta: "Voir le track record",
    cta_link: "/resultats",
  },
  {
    q: "Quelle est la différence entre Free, Pro et Elite ?",
    a: "**Free** : 1 pick gratuit/jour, track record public. **Pro (4 900 FCFA/mois)** : tous les pronostics du jour, 3 combinés (Sécurité/Équilibre/Jackpot), analyse IA. **Elite (14 900 FCFA/mois)** : tout Pro + picks VIP + stratégie bankroll Kelly + support prioritaire WhatsApp.",
    cta: "Comparer les plans",
    cta_link: "/app/abonnement",
  },
  {
    q: "Puis-je me faire rembourser si je change d'avis ?",
    a: "**Non, aucun remboursement après activation** (service numérique immédiatement consommable). C'est pour ça qu'on a un **plan Free** : teste-nous gratuitement avant de passer Pro.",
    cta: "Tester gratuitement",
    cta_link: "/register",
  },
  {
    q: "Comment marche le parrainage WhatsApp ?",
    a: "**3 amis qui s'inscrivent avec ton code = 7 jours Pro offerts.** Tu trouves ton code unique dans la page Parrainage. Tu cliques 'Partager sur WhatsApp', tu envoies à tes contacts, et dès que 3 amis créent leur compte avec ton code, ton accès Pro s'active automatiquement.",
    cta: "Voir mon code de parrainage",
    cta_link: "/app/parrainage",
  },
  {
    q: "Sur quels sports vous donnez des pronostics ?",
    a: "**7 sports** : Football (toutes ligues majeures + CAN), Basket (NBA), Tennis (ATP/WTA), NFL, NHL, MMA, et Rugby. La plupart de nos picks sont en football car c'est là qu'on a le plus de data.",
    cta: "Voir les picks du jour",
    cta_link: "/app",
  },
  {
    q: "C'est légal au Bénin ?",
    a: "**Oui, totalement.** WinPulse est une plateforme d'analyse — on n'organise pas de paris, on ne joue pas pour toi. Tu places tes paris chez un bookmaker agréé. Réservé aux 18+. Joue responsable.",
    cta: "Lire nos CGV",
    cta_link: "/legal/cgv",
  },
  {
    q: "Comment supprimer mon compte ?",
    a: "Envoie-nous un email à **contact@wnpulse.com** ou un WhatsApp avec ta demande. Suppression sous 24h, conformément à la loi béninoise n° 2017-20 sur le numérique.",
    cta: "Contact WhatsApp",
    cta_link: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour, je voudrais supprimer mon compte WinPulse.")}`,
    external: true,
  },
  {
    q: "Je n'arrive pas à me connecter, que faire ?",
    a: "1. Vérifie qu'il n'y a pas d'espace avant/après ton email. 2. Vérifie la casse de ton mot de passe. 3. Si ça ne marche toujours pas, clique 'Mot de passe oublié' sur la page Connexion → tu recevras un email de réinitialisation. 4. Sinon, contacte-nous WhatsApp.",
    cta: "Mot de passe oublié",
    cta_link: "/forgot-password",
  },
];

export default function WhatsAppWidget() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // Render the inline-formatted answer (handles **bold**)
  const renderAnswer = (text) =>
    text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>');

  const openWhatsApp = (presetMsg) => {
    const msg = presetMsg || `Bonjour ${COMPANY}, j'ai une question :`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  const handleQuestionClick = (idx) => {
    setSelected(idx);
  };

  // Body scroll lock when chat is open on mobile
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Floating button (always visible) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full bg-[#25D366] hover:bg-[#1ebe5c] grid place-items-center text-white shadow-2xl shadow-emerald-600/40 transition-transform hover:scale-110 active:scale-95 group"
          style={{ animation: "wpPulse 2s infinite", zIndex: 10001 }}
          data-testid="whatsapp-floating-btn"
          aria-label="Ouvrir le chat WhatsApp"
        >
          <MessageCircle className="h-7 w-7" fill="white" strokeWidth={1.8} />
          <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
          <span className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Besoin d'aide ?
          </span>
        </button>
      )}

      <style>{`
        @keyframes wpPulse {
          0%, 100% { box-shadow: 0 8px 24px rgba(37, 211, 102, 0.4), 0 0 0 0 rgba(37, 211, 102, 0.6); }
          50% { box-shadow: 0 8px 24px rgba(37, 211, 102, 0.4), 0 0 0 14px rgba(37, 211, 102, 0); }
        }
      `}</style>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:w-[380px] sm:max-h-[calc(100vh-2.5rem)] bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in"
          style={{ zIndex: 10000 }}
          data-testid="whatsapp-chat-panel"
        >
          {/* Header */}
          <div className="relative bg-gradient-to-br from-[#1ebe5c] via-[#25D366] to-emerald-400 text-white px-4 py-4 flex items-center justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
            <div className="relative flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/15 backdrop-blur-sm ring-2 ring-white/30 grid place-items-center">
                <MessageCircle className="h-5 w-5" fill="white" strokeWidth={1.5} />
              </div>
              <div>
                <div className="font-heading font-extrabold text-base leading-tight">Support {COMPANY}</div>
                <div className="text-[11px] opacity-90 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  En ligne · répond en moyenne en 5 min
                </div>
              </div>
            </div>
            <button
              onClick={() => { setOpen(false); setSelected(null); }}
              className="relative h-8 w-8 rounded-full hover:bg-white/15 grid place-items-center"
              data-testid="whatsapp-close-btn"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-slate-50">
            {/* Bot greeting */}
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-emerald-100 grid place-items-center flex-shrink-0">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm text-sm text-slate-700 max-w-[85%]">
                  Salut 👋 ! Je suis l'assistant {COMPANY}. Choisis une question ci-dessous ou écris-nous directement sur WhatsApp.
                </div>
              </div>

              {/* Selected answer or FAQ list */}
              {selected === null ? (
                <div className="space-y-2 pt-1">
                  {FAQ.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuestionClick(idx)}
                      className="w-full text-left bg-white rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 transition-colors border border-slate-200 hover:border-emerald-200 flex items-center justify-between gap-2 group"
                      data-testid={`faq-question-${idx}`}
                    >
                      <span className="line-clamp-2">{item.q}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-600 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {/* User question bubble */}
                  <div className="flex justify-end">
                    <div className="bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 shadow-sm text-sm max-w-[85%]">
                      {FAQ[selected].q}
                    </div>
                  </div>
                  {/* Bot answer */}
                  <div className="flex items-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-emerald-100 grid place-items-center flex-shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <div
                      className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm text-sm text-slate-700 max-w-[85%] leading-relaxed"
                      data-testid={`faq-answer-${selected}`}
                      dangerouslySetInnerHTML={{ __html: renderAnswer(FAQ[selected].a) }}
                    />
                  </div>
                  {/* Inline CTA */}
                  {FAQ[selected].cta && (
                    <div className="flex justify-start ml-9">
                      {FAQ[selected].external ? (
                        <a
                          href={FAQ[selected].cta_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 transition-colors"
                          data-testid={`faq-cta-${selected}`}
                        >
                          {FAQ[selected].cta} <ChevronRight className="h-3 w-3" />
                        </a>
                      ) : (
                        <a
                          href={FAQ[selected].cta_link}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 transition-colors"
                          data-testid={`faq-cta-${selected}`}
                        >
                          {FAQ[selected].cta} <ChevronRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                  {/* Back button */}
                  <div className="pt-1">
                    <button
                      onClick={() => setSelected(null)}
                      className="text-xs text-slate-500 hover:text-emerald-600 font-semibold"
                      data-testid="faq-back-btn"
                    >
                      ← Voir toutes les questions
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer CTA — direct WhatsApp */}
          <div className="border-t border-slate-200 bg-white p-3">
            <Button
              onClick={() => openWhatsApp()}
              className="w-full bg-[#25D366] hover:bg-[#1ebe5c] text-white border-0 font-bold h-11 shadow-md hover:shadow-lg transition-shadow"
              data-testid="whatsapp-direct-btn"
            >
              <Send className="h-4 w-4 mr-2" /> Discuter direct sur WhatsApp
            </Button>
            <div className="text-center text-[10px] text-slate-400 mt-1.5">
              Notre équipe répond 7j/7 entre 7h et 23h.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
