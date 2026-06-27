import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Crown, CreditCard, BarChart3, Target, Trophy, Flame, History, Mail, Sparkles, Sunrise } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import dayjs from "dayjs";
import api from "@/lib/api";
import { toast } from "sonner";
import PaymentModal from "@/components/payment/PaymentModal";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const tier = user?.subscription_tier || "free";
  const [payState, setPayState] = useState({ isOpen: false, tier: "PRO" });
  const [autoFollower, setAutoFollower] = useState(user?.auto_follower_enabled ?? true);
  const [savingPref, setSavingPref] = useState(false);

  useEffect(() => {
    setAutoFollower(user?.auto_follower_enabled ?? true);
  }, [user?.auto_follower_enabled]);

  const toggleAutoFollower = async (val) => {
    setAutoFollower(val);
    setSavingPref(true);
    try {
      await api.patch("/me/preferences", { auto_follower_enabled: val });
      await refresh?.();
      toast.success(val ? "Suiveur 7h activé ✨" : "Suiveur 7h désactivé");
    } catch (e) {
      setAutoFollower(!val);
      toast.error(e?.response?.data?.detail || "Échec de la mise à jour");
    } finally {
      setSavingPref(false);
    }
  };
  const tierData = {
    free: { label: "Free", cls: "bg-slate-100 text-slate-700 border-slate-200", gradient: "from-slate-50 to-slate-100" },
    pro: { label: "Pro", cls: "bg-orange-100 text-orange-700 border-orange-200", gradient: "from-orange-50 to-rose-50" },
    elite: { label: "Elite", cls: "bg-rose-100 text-rose-700 border-rose-200", gradient: "from-rose-50 to-amber-50" },
  }[tier];

  const pieData = [{ name: "Gagnés", value: 14, color: "#10b981" }, { name: "Perdus", value: 6, color: "#f43f5e" }];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Epic profile header */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-900 to-orange-900 text-white p-6 sm:p-8 mb-6" data-testid="profile-header">
          <div className="absolute -top-32 -right-32 h-72 w-72 rounded-full bg-orange-500/30 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl pointer-events-none" />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="h-20 w-20 rounded-2xl wp-gradient-warm grid place-items-center text-white text-3xl font-black shadow-2xl shadow-orange-600/40 ring-4 ring-white/10">
                  {user?.full_name?.[0]?.toUpperCase() || "?"}
                </div>
                {tier !== "free" && (
                  <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-yellow-400 grid place-items-center ring-2 ring-slate-900">
                    {tier === "elite" ? <Crown className="h-3.5 w-3.5 text-slate-900" /> : <Sparkles className="h-3.5 w-3.5 text-slate-900" />}
                  </div>
                )}
              </div>
              <div>
                <h1 className="font-heading text-2xl sm:text-3xl font-black text-white tracking-tight">{user?.full_name}</h1>
                <div className="text-sm text-slate-300 flex items-center gap-1 mt-0.5"><Mail className="h-3.5 w-3.5" /> {user?.email}</div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge className={`text-xs font-bold py-1 px-2.5 ${tier === "elite" ? "bg-yellow-400 text-slate-900 border-0" : tier === "pro" ? "bg-orange-500 text-white border-0" : "bg-slate-700 text-slate-200 border-0"}`}>
                    {tier === "elite" && <Crown className="h-3 w-3 mr-1" />} Plan {tierData.label}
                  </Badge>
                  {user?.referral_count > 0 && (
                    <Badge className="bg-emerald-500 text-white border-0 text-xs font-bold">
                      {user.referral_count} parrainage{user.referral_count > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/60 font-bold">Membre depuis</div>
              <div className="font-heading text-lg font-bold text-white mt-0.5">
                {user?.created_at ? dayjs(user.created_at).format("MMM YYYY") : "—"}
              </div>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="subscription" className="space-y-6">
          <TabsList className="bg-neutral-100">
            <TabsTrigger value="subscription" data-testid="tab-subscription"><CreditCard className="h-3.5 w-3.5 mr-1.5" />Mon abonnement</TabsTrigger>
            <TabsTrigger value="stats" data-testid="tab-stats"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Mes stats</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history"><History className="h-3.5 w-3.5 mr-1.5" />Historique</TabsTrigger>
          </TabsList>

          <TabsContent value="subscription">
            <Card className="bg-white border-neutral-200 p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Abonnement actuel</div>
                  <div className="font-heading text-3xl font-extrabold text-slate-900">{tierData.label}</div>
                  {user?.subscription_expires_at && tier !== "free" && (
                    <div className="text-sm text-slate-600 mt-1">Renouvellement le <strong>{dayjs(user.subscription_expires_at).format("DD MMM YYYY")}</strong></div>
                  )}
                </div>
                {tier !== "elite" && (
                  <Button
                    className="wp-gradient-warm text-white border-0"
                    data-testid="upgrade-from-profile"
                    onClick={() => setPayState({ isOpen: true, tier: tier === "free" ? "PRO" : "ELITE" })}
                  >
                    {tier === "free" ? "Passer Pro" : "Passer Elite"}
                  </Button>
                )}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { key: "free", label: "Free", price: "0 FCFA", feat: ["3 picks/jour", "1 combiné gratuit", "Track record public"] },
                  { key: "pro", label: "Pro", price: "4 900 FCFA/mois", feat: ["Tous les picks", "3 combinés", "IA experte"] },
                  { key: "elite", label: "Elite", price: "14 900 FCFA/mois", feat: ["Tout Pro", "Picks VIP", "Bankroll Kelly"] },
                ].map((p) => (
                  <div key={p.key} className={`p-4 rounded-xl border ${p.key === tier ? "border-orange-500 bg-orange-50" : "border-neutral-200"}`} data-testid={`plan-overview-${p.key}`}>
                    <div className="font-heading font-bold text-slate-900">{p.label}</div>
                    <div className="font-mono text-sm text-slate-600 mb-2">{p.price}</div>
                    <ul className="text-xs text-slate-600 space-y-1">{p.feat.map((f, i) => <li key={i}>· {f}</li>)}</ul>
                    {p.key === tier && <Badge className="mt-2 bg-orange-100 text-orange-700 text-[10px]">Actuel</Badge>}
                  </div>
                ))}
              </div>

              {/* Suiveur automatique — réservé aux Pro/Elite */}
              {tier !== "free" && (
                <div className="mt-6 pt-6 border-t border-neutral-200" data-testid="auto-follower-card">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 grid place-items-center text-white shadow-md shadow-orange-500/30">
                        <Sunrise className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-heading font-extrabold text-slate-900">Suiveur automatique</h3>
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">Inclus {tier === "elite" ? "Elite" : "Pro"}</Badge>
                        </div>
                        <p className="text-sm text-slate-600 mt-1 max-w-md">
                          Reçois <strong>chaque matin à 7h</strong> (heure Bénin) un email avec le combiné Équilibre du jour. Zéro effort, juste à suivre.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">{autoFollower ? "Activé" : "Désactivé"}</span>
                      <Switch
                        checked={autoFollower}
                        onCheckedChange={toggleAutoFollower}
                        disabled={savingPref}
                        data-testid="auto-follower-toggle"
                      />
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="stats">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-white border-neutral-200 p-5">
                <h3 className="font-heading font-bold text-slate-900 mb-4 flex items-center gap-2"><Target className="h-4 w-4 text-emerald-600" /> Performance personnelle</h3>
                <div className="space-y-3 text-sm">
                  <Row label="Picks suivis" value="20" />
                  <Row label="Win rate perso" value="70%" accent="emerald" />
                  <Row label="ROI personnel" value="+18.4%" accent="emerald" />
                  <Row label="Meilleure série" value="🔥 5 picks" accent="orange" />
                  <Row label="Profit cumulé" value="+2 340 FCFA" mono accent="emerald" />
                </div>
              </Card>
              <Card className="bg-white border-neutral-200 p-5">
                <h3 className="font-heading font-bold text-slate-900 mb-2 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Répartition</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 text-xs">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> 14 gagnés</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span> 6 perdus</span>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <Card className="bg-white border-neutral-200 p-6 text-center">
              <Flame className="h-10 w-10 text-orange-500 mx-auto mb-3" />
              <h3 className="font-heading text-xl font-extrabold text-slate-900 mb-2">Suis tes picks préférés</h3>
              <p className="text-sm text-slate-600 mb-4">Marque les pronostics que tu joues. On calcule ton P&L personnel automatiquement.</p>
              <Link to="/app"><Button className="wp-gradient-warm text-white border-0">Découvrir les picks du jour</Button></Link>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <PaymentModal
        isOpen={payState.isOpen}
        onClose={() => setPayState({ isOpen: false, tier: payState.tier })}
        targetTier={payState.tier}
      />
    </AppLayout>
  );
}

function Row({ label, value, mono, accent }) {
  const cls = { emerald: "text-emerald-600", rose: "text-rose-600", orange: "text-orange-600" }[accent] || "text-slate-900";
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
      <span className="text-slate-600">{label}</span>
      <span className={`font-bold ${cls} ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
