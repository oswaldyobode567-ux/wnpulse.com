import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Gift,
  Copy,
  Users,
  Sparkles,
  MessageCircle,
  Send,
  Trophy,
  CheckCircle2,
  Crown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function ParrainagePage() {
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const fetchReferral = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get("/referral/me");
      setData(res);
    } catch (e) {
      toast.error("Impossible de charger le parrainage");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferral();
  }, []);

  const copyCode = () => {
    if (!data?.code) return;
    navigator.clipboard?.writeText(data.code);
    toast.success(`Code ${data.code} copié`);
  };

  const copyLink = () => {
    if (!data?.share_url) return;
    navigator.clipboard?.writeText(data.share_url);
    toast.success("Lien copié — partage-le maintenant !");
  };

  const claim = async () => {
    setClaiming(true);
    try {
      const { data: res } = await api.post("/referral/claim");
      toast.success(res.message || "Récompense activée !");
      await refresh?.();
      await fetchReferral();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Réclamation impossible");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-72" />
        </div>
      </AppLayout>
    );
  }

  if (!data) return null;

  const progressPct = Math.min(100, (data.count / data.threshold) * 100);
  const remaining = Math.max(0, data.threshold - data.count);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Hero */}
        <Card className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 text-white border-0 p-7 sm:p-10">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-yellow-300/20 blur-3xl" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 ring-white/25">
                <Gift className="h-3.5 w-3.5" /> Programme parrainage
              </div>
              <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter mt-3" data-testid="referral-headline">
                Invite 3 amis,<br />reçois <span className="bg-yellow-300 text-slate-900 px-2 rounded">7 jours Pro offerts</span>
              </h1>
              <p className="mt-3 text-white/90 max-w-xl text-sm sm:text-base">
                Partage ton lien WhatsApp en 1 clic. Dès que <strong>3 amis</strong> créent leur compte, ton accès Pro s'active automatiquement — vraiment gratuit.
              </p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl ring-1 ring-white/25 p-5 min-w-[200px] text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Ton code</div>
              <div className="font-mono text-3xl sm:text-4xl font-black mt-1 tracking-tight" data-testid="referral-code">{data.code}</div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-white hover:bg-white/20 h-7 text-xs"
                onClick={copyCode}
                data-testid="copy-referral-code"
              >
                <Copy className="h-3 w-3 mr-1" /> Copier
              </Button>
            </div>
          </div>
        </Card>

        {/* Progress + Claim */}
        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2 p-6 bg-white border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Ta progression</div>
                <div className="font-heading text-2xl font-extrabold text-slate-900 mt-1">
                  <span data-testid="referral-count">{data.count}</span> / {data.threshold} amis inscrits
                </div>
              </div>
              <div className={`h-12 w-12 rounded-full grid place-items-center ${data.eligible ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"}`}>
                {data.eligible ? <Trophy className="h-6 w-6" /> : <Users className="h-6 w-6" />}
              </div>
            </div>

            <Progress value={progressPct} className="h-3" data-testid="referral-progress" />

            <div className="mt-3 text-sm text-slate-600">
              {data.eligible ? (
                <span className="text-emerald-600 font-semibold">🎉 Bravo ! Tu peux réclamer ta récompense.</span>
              ) : data.claimed ? (
                <span className="text-slate-500">Récompense déjà réclamée. Merci d'avoir parrainé tes amis !</span>
              ) : (
                <span>Encore <strong>{remaining}</strong> ami{remaining > 1 ? "s" : ""} à inviter pour débloquer ta semaine Pro.</span>
              )}
            </div>

            <div className="mt-5">
              {data.eligible && (
                <Button
                  className="w-full sm:w-auto wp-gradient-warm text-white border-0 hover:opacity-90 font-bold"
                  onClick={claim}
                  disabled={claiming}
                  data-testid="claim-reward-btn"
                >
                  {claiming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" /> Réclamer mes 7 jours Pro
                    </>
                  )}
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
            <div className="text-xs uppercase tracking-wider text-orange-300 font-bold mb-2">Comment ça marche</div>
            <ol className="space-y-3 mt-3 text-sm">
              {[
                "Copie ton lien ou ton code unique.",
                "Partage-le sur WhatsApp, en 1 clic.",
                `Dès que 3 amis créent leur compte avec ton code, ${data.reward_days} jours Pro s'activent.`,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <div className="h-6 w-6 rounded-full bg-orange-500 grid place-items-center text-xs font-black flex-shrink-0">{i + 1}</div>
                  <span className="text-slate-200">{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Share actions */}
        <Card className="p-6 bg-white border-neutral-200">
          <div className="font-heading text-lg font-extrabold text-slate-900 mb-4">Partager maintenant</div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="font-mono text-sm text-slate-700 truncate flex-1" data-testid="share-url">{data.share_url}</div>
              <Button size="sm" variant="outline" onClick={copyLink} data-testid="copy-share-link">
                <Copy className="h-3.5 w-3.5 mr-1" /> Copier
              </Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <a
                href={data.whatsapp_share}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#25D366] hover:bg-[#1ebe5c] text-white font-bold py-3 transition-colors"
                data-testid="share-whatsapp"
              >
                <MessageCircle className="h-4 w-4" /> Partager sur WhatsApp
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent("Découvre WinPulse — IA pronostics sportifs")}&body=${encodeURIComponent(`Salut ! Je viens de découvrir WinPulse, une IA qui décrypte les pronostics sportifs. Inscris-toi gratuitement avec mon code : ${data.share_url}`)}`}
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 transition-colors"
                data-testid="share-email"
              >
                <Send className="h-4 w-4" /> Envoyer par email
              </a>
            </div>
          </div>
        </Card>

        {/* Why */}
        <Card className="p-6 bg-gradient-to-br from-amber-50 to-rose-50 border-orange-200">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-orange-600" />
            <div className="font-heading text-lg font-extrabold text-slate-900">Pourquoi ils vont kiffer</div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: Trophy, t: "70%+ de réussite", d: "Track record public, vérifiable à tout moment." },
              { icon: Users, t: "Communauté active", d: "Picks décortiqués, analyses IA, combinés du jour." },
              { icon: CheckCircle2, t: "Sans engagement", d: "1 mois, paiement MTN. Pas de carte, pas de piège." },
            ].map((b, i) => {
              const I = b.icon;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-white grid place-items-center shadow-sm flex-shrink-0">
                    <I className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900">{b.t}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{b.d}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
