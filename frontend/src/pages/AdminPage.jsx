import { useEffect, useState } from "react";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Send, Users, Wallet, Clock, Mail, Loader2, ShieldCheck, Sunrise, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";

const STATUS_CLS = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [comboTier, setComboTier] = useState("balanced");
  const [broadcasting, setBroadcasting] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [blast, setBlast] = useState(null);
  const [autoFollowerRunning, setAutoFollowerRunning] = useState(false);

  const loadBlast = async () => {
    try {
      const { data } = await api.get("/admin/whatsapp-blast");
      setBlast(data);
    } catch (e) {
      // silent: panel will show empty state
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, p, u] = await Promise.all([
        api.get("/admin/stats"),
        api.get(`/admin/payments${statusFilter ? `?status_filter=${statusFilter}` : ""}`),
        api.get("/admin/users"),
      ]);
      setStats(s.data);
      setPayments(p.data);
      setUsers(u.data);
    } catch (e) {
      toast.error("Erreur de chargement admin");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); loadBlast(); /* eslint-disable-next-line */ }, [statusFilter]);

  const confirmPayment = async (ref) => {
    setActionLoading(ref);
    try {
      await api.post(`/admin/payments/${ref}/confirm`);
      toast.success("Paiement confirmé · utilisateur upgradé");
      await loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec confirmation");
    } finally {
      setActionLoading(null);
    }
  };

  const rejectPayment = async (ref) => {
    setActionLoading(ref);
    try {
      await api.post(`/admin/payments/${ref}/reject`);
      toast.success("Paiement rejeté");
      await loadAll();
    } catch (e) {
      toast.error("Échec rejet");
    } finally {
      setActionLoading(null);
    }
  };

  const broadcastPicks = async () => {
    setBroadcasting(true);
    try {
      const { data } = await api.post("/admin/broadcast/picks", { tier: "pro", combo_tier: comboTier });
      toast.success(`Envoyé : ${data.sent} email(s) · ${data.drafted} brouillon(s) · ${data.errors} erreur(s)`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec envoi");
    } finally {
      setBroadcasting(false);
    }
  };

  const broadcastFreeTeaser = async () => {
    setBroadcasting(true);
    try {
      const { data } = await api.post("/admin/broadcast/free-weekly-teaser");
      toast.success(`Teaser envoyé aux ${data.users} Free · ${data.sent} delivered · ${data.errors} erreurs`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec envoi");
    } finally {
      setBroadcasting(false);
    }
  };

  const testEmail = async () => {
    setBroadcasting(true);
    try {
      const { data } = await api.post("/admin/test-email");
      if (data.status === "sent") toast.success(`Email test envoyé (id: ${data.email_id?.slice(0, 8)}...)`);
      else if (data.status === "draft") toast.info("Mode draft (clé Resend absente)");
      else toast.error(data.error || "Erreur");
    } catch (e) {
      toast.error("Erreur test email");
    } finally {
      setBroadcasting(false);
    }
  };

  const runAutoFollower = async (dryRun = false) => {
    setAutoFollowerRunning(true);
    try {
      const { data } = await api.post(`/admin/auto-follower/run?dry_run=${dryRun}`);
      if (data.no_picks) {
        toast.warning("Pas de combiné disponible aujourd'hui");
      } else if (dryRun) {
        toast.info(`Dry-run : ${data.sent} abonnés recevront l'email`);
      } else {
        toast.success(`Suiveur 7h envoyé · ${data.sent} email(s) · ${data.skipped_already_sent} déjà reçu · ${data.errors} erreur(s)`);
      }
      await loadBlast();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec du Suiveur");
    } finally {
      setAutoFollowerRunning(false);
    }
  };

  const copyBlast = () => {
    if (!blast?.blast_text) return;
    navigator.clipboard?.writeText(blast.blast_text);
    toast.success("Message WhatsApp copié dans le presse-papier");
  };

  const whatsappBlastUrl = blast?.blast_text
    ? `https://wa.me/?text=${encodeURIComponent(blast.blast_text)}`
    : null;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl wp-gradient-warm grid place-items-center text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-heading text-3xl font-extrabold text-slate-900">Panneau admin</h1>
            <p className="text-sm text-slate-500">Validation paiements · stats · envoi d'emails VIP</p>
          </div>
        </div>

        {/* Stats KPI */}
        {loading || !stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="admin-stats">
            <Kpi icon={Users} label="Utilisateurs" value={stats.users.total} sub={`${stats.users.pro} Pro · ${stats.users.elite} Elite`} accent="orange" />
            <Kpi icon={Clock} label="Paiements en attente" value={stats.payments.pending} accent="amber" />
            <Kpi icon={CheckCircle2} label="Paiements validés" value={stats.payments.confirmed} accent="emerald" />
            <Kpi icon={Wallet} label="Chiffre d'affaires" value={`${stats.revenue_xof.toLocaleString()} FCFA`} accent="rose" mono />
          </div>
        )}

        <Tabs defaultValue="payments" className="space-y-6">
          <TabsList className="bg-neutral-100">
            <TabsTrigger value="payments" data-testid="tab-payments">Paiements</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Utilisateurs</TabsTrigger>
            <TabsTrigger value="broadcast" data-testid="tab-broadcast">Envoi emails</TabsTrigger>
            <TabsTrigger value="auto-follower" data-testid="tab-auto-follower">
              <Sunrise className="h-3.5 w-3.5 mr-1.5" />Suiveur 7h
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payments">
            <Card className="bg-white border-neutral-200">
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between gap-4">
                <h2 className="font-heading font-bold text-slate-900">Paiements MTN MoMo</h2>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40" data-testid="payment-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="confirmed">Confirmés</SelectItem>
                    <SelectItem value="rejected">Rejetés</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="divide-y divide-neutral-100">
                {payments.length === 0 ? (
                  <div className="px-5 py-12 text-center text-slate-500">Aucun paiement {statusFilter ? `(${statusFilter})` : ""}.</div>
                ) : payments.map((p) => (
                  <div key={p.id} className="px-5 py-4 flex items-center justify-between gap-4" data-testid={`payment-row-${p.reference}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-sm text-slate-900">{p.reference}</span>
                        <Badge className={cn("border", STATUS_CLS[p.status])}>{p.status}</Badge>
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.payer_name || "?"} · {p.user_email} · 📱 {p.phone} · {dayjs(p.created_at).format("DD MMM HH:mm")}
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 font-mono">{p.amount_xof.toLocaleString()} FCFA</div>
                    <Badge variant="outline" className="font-semibold">{p.tier.toUpperCase()}</Badge>
                    {p.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => confirmPayment(p.reference)}
                          disabled={actionLoading === p.reference}
                          data-testid={`confirm-btn-${p.reference}`}
                        >
                          {actionLoading === p.reference ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-300 text-rose-700 hover:bg-rose-50"
                          onClick={() => rejectPayment(p.reference)}
                          disabled={actionLoading === p.reference}
                          data-testid={`reject-btn-${p.reference}`}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="bg-white border-neutral-200">
              <div className="px-5 py-4 border-b border-neutral-200">
                <h2 className="font-heading font-bold text-slate-900">Utilisateurs ({users.length})</h2>
              </div>
              <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto scrollbar-thin">
                {users.map((u) => (
                  <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-4" data-testid={`user-row-${u.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-slate-900 truncate">{u.full_name} {u.is_admin && <Badge className="ml-1 bg-orange-100 text-orange-700">admin</Badge>}</div>
                      <div className="text-xs text-slate-500 truncate">{u.email}</div>
                    </div>
                    <Badge variant="outline" className="font-semibold">{(u.subscription_tier || "free").toUpperCase()}</Badge>
                    <div className="text-xs text-slate-400 hidden sm:block">{dayjs(u.created_at).format("DD MMM YYYY")}</div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="broadcast">
            <Card className="bg-white border-neutral-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="h-5 w-5 text-orange-600" />
                <h2 className="font-heading font-bold text-slate-900">Envoyer les picks du jour aux abonnés</h2>
              </div>
              <p className="text-sm text-slate-600 mb-6">
                Envoie un email HTML aux abonnés <strong>Pro & Elite</strong> avec le combiné du jour de ton choix.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-600 font-bold mb-1.5 block">Type de combiné</label>
                  <Select value={comboTier} onValueChange={setComboTier}>
                    <SelectTrigger className="w-48" data-testid="broadcast-combo-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="safe">Sécurité (3 picks)</SelectItem>
                      <SelectItem value="balanced">Équilibre (4 picks)</SelectItem>
                      <SelectItem value="jackpot">Jackpot (5 picks)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={broadcastPicks}
                  disabled={broadcasting}
                  className="wp-gradient-warm text-white border-0"
                  data-testid="broadcast-btn"
                >
                  {broadcasting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Envoyer aux abonnés Pro/Elite
                </Button>
                <Button
                  onClick={testEmail}
                  variant="outline"
                  disabled={broadcasting}
                  data-testid="test-email-btn"
                >
                  Test email (à moi)
                </Button>
              </div>

              <div className="mt-8 pt-6 border-t border-neutral-200">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-heading font-bold text-slate-900">Pari de la semaine — Vendredi</h3>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  Envoie aux utilisateurs <strong>Free</strong> un teaser hebdomadaire montrant le 1er pick gratuit + les autres floutés. Levier de conversion idéal le vendredi.
                </p>
                <Button
                  onClick={broadcastFreeTeaser}
                  disabled={broadcasting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="broadcast-weekly-teaser-btn"
                >
                  {broadcasting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Envoyer le pari de la semaine aux Free
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="auto-follower">
            <Card className="bg-white border-neutral-200 p-6" data-testid="auto-follower-panel">
              <div className="flex items-center gap-2 mb-2">
                <Sunrise className="h-5 w-5 text-orange-600" />
                <h2 className="font-heading font-bold text-slate-900">Suiveur automatique — 7h Bénin</h2>
              </div>
              <p className="text-sm text-slate-600 mb-6">
                Chaque matin à <strong>7h00 (UTC+1)</strong>, un email avec le combiné Équilibre du jour est envoyé automatiquement à tous les abonnés <strong>Pro/Elite</strong> ayant activé l'option. En parallèle, on prépare ici le message <strong>WhatsApp</strong> à blaster manuellement sur ton numéro support.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <MiniStat label="Date locale" value={blast?.date || "—"} />
                <MiniStat label="Abonnés actifs" value={blast?.active_subscribers ?? "—"} accent="emerald" />
                <MiniStat label="Cote du jour" value={blast?.combo_total_odds || "—"} mono />
                <MiniStat label="Picks" value={blast?.legs_count || 0} />
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                <Button
                  onClick={() => runAutoFollower(true)}
                  variant="outline"
                  disabled={autoFollowerRunning}
                  data-testid="auto-follower-preview-btn"
                >
                  {autoFollowerRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Aperçu (sans envoi)
                </Button>
                <Button
                  onClick={() => runAutoFollower(false)}
                  className="wp-gradient-warm text-white border-0"
                  disabled={autoFollowerRunning}
                  data-testid="auto-follower-run-btn"
                >
                  {autoFollowerRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Envoyer maintenant aux abonnés
                </Button>
                <Button
                  onClick={loadBlast}
                  variant="ghost"
                  size="sm"
                  data-testid="auto-follower-refresh-btn"
                >
                  Rafraîchir
                </Button>
              </div>

              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-emerald-700" />
                    <span className="font-heading font-bold text-emerald-900 text-sm">Message WhatsApp à blaster</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyBlast}
                      disabled={!blast?.blast_text}
                      data-testid="auto-follower-copy-btn"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copier
                    </Button>
                    {whatsappBlastUrl ? (
                      <a href={whatsappBlastUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="bg-[#25D366] hover:bg-[#1ebe5c] text-white" data-testid="auto-follower-whatsapp-btn">
                          <MessageCircle className="h-3.5 w-3.5 mr-1" /> Ouvrir WhatsApp
                        </Button>
                      </a>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-slate-200 text-slate-400"
                        disabled
                        data-testid="auto-follower-whatsapp-btn"
                      >
                        <MessageCircle className="h-3.5 w-3.5 mr-1" /> Ouvrir WhatsApp
                      </Button>
                    )}
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-slate-800 font-mono bg-white/70 border border-emerald-200 rounded-lg p-3 max-h-72 overflow-y-auto" data-testid="auto-follower-blast-text">
{blast?.blast_text || "Aperçu non encore généré. Clique sur \"Aperçu\" pour préparer le message du jour."}
                </pre>
                <p className="text-[11px] text-emerald-800/80 mt-2">
                  💡 Astuce : crée une <strong>liste de diffusion WhatsApp</strong> avec tes abonnés Pro/Elite. Ouvre la liste, colle le message et envoie.
                </p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function MiniStat({ label, value, accent, mono }) {
  const cls = {
    emerald: "text-emerald-700",
    orange: "text-orange-700",
  }[accent] || "text-slate-900";
  return (
    <div className="rounded-lg border border-neutral-200 bg-slate-50/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className={cn("font-heading font-extrabold text-lg mt-0.5", cls, mono && "font-mono")}>{value}</div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent, mono }) {
  const cls = {
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }[accent];
  return (
    <Card className="bg-white border-neutral-200 p-4">
      <div className={cn("h-8 w-8 rounded-lg grid place-items-center border mb-3", cls)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">{label}</div>
      <div className={cn("font-heading text-2xl font-extrabold text-slate-900", mono && "font-mono text-xl")}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </Card>
  );
}
