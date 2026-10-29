import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Send, Users, Wallet, Clock, Mail, Loader2, ShieldCheck, Sunrise, Copy, MessageCircle, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";

const STATUS_CLS = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

// Petits helpers défensifs : le backend a déjà eu un historique de noms de
// champs incohérents (ex: price vs price_fcfa). On tente plusieurs clés
// possibles et on retombe sur 0 plutôt que de planter le composant.
function safeNumber(...candidates) {
  for (const c of candidates) {
    if (typeof c === "number" && !Number.isNaN(c)) return c;
  }
  return 0;
}

function formatFcfa(...candidates) {
  return safeNumber(...candidates).toLocaleString();
}

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
        api.get(`/admin/subscription-requests${statusFilter ? `?status_filter=${statusFilter}` : ""}`),
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
      await api.post(`/admin/subscription-requests/${ref}/approve`);
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
      await api.post(`/admin/subscription-requests/${ref}/reject`);
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
            <p className="text-sm text-slate-500">Validation paiements · utilisateurs · contacts WhatsApp</p>
          </div>
        </div>

        {/* Stats KPI */}
        {loading || !stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="admin-stats">
            <Kpi icon={Users} label="Utilisateurs" value={safeNumber(stats.total_users)} sub={`${safeNumber(stats.paid_users)} payants · ${safeNumber(stats.free_users)} gratuits`} accent="orange" />
            <Kpi icon={Clock} label="Paiements en attente" value={safeNumber(stats.pending_payments)} accent="amber" />
            <Kpi icon={CheckCircle2} label="Paiements validés" value={safeNumber(stats.approved_payments)} accent="emerald" />
            <Kpi
              icon={Wallet}
              label="Matchs en cache"
              value={safeNumber(stats.matches_in_cache)}
              accent="rose"
              mono
            />
          </div>
        )}

        <Tabs defaultValue="quality" className="space-y-6">
          <TabsList className="h-auto flex flex-wrap justify-start gap-1 bg-neutral-100">
            <TabsTrigger value="quality" data-testid="tab-quality"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Pilotage</TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">Paiements</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Utilisateurs</TabsTrigger>
            <TabsTrigger value="whatsapp-contacts" data-testid="tab-whatsapp-contacts"><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Contacts WhatsApp</TabsTrigger>
            <TabsTrigger value="broadcast" data-testid="tab-broadcast">Envoi emails</TabsTrigger>
            <TabsTrigger value="auto-follower" data-testid="tab-auto-follower">
              <Sunrise className="h-3.5 w-3.5 mr-1.5" />Suiveur 7h
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quality"><QualityControlPanel /></TabsContent>

          <TabsContent value="payments">
            <Card className="bg-white border-neutral-200">
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between gap-4">
                <h2 className="font-heading font-bold text-slate-900">Demandes d’abonnement</h2>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40" data-testid="payment-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="approved">Confirmés</SelectItem>
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
                        {p.user_email} · {p.created_at ? dayjs(p.created_at).format("DD MMM HH:mm") : "—"}
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 font-mono">
                      {formatFcfa(p.amount_fcfa, p.amount_xof, p.amount)} FCFA
                    </div>
                    <Badge variant="outline" className="font-semibold">{(p.plan_name || p.plan_id || "").toUpperCase()}</Badge>
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
                      <div className="font-semibold text-sm text-slate-900 truncate">{u.name} {u.is_admin && <Badge className="ml-1 bg-orange-100 text-orange-700">admin</Badge>}</div>
                      <div className="text-xs text-slate-500 truncate">{u.email}</div>
                      <div className="mt-1 text-xs text-slate-500">WhatsApp : <span className="font-mono">{u.whatsapp_number || "Non renseigné"}</span> · {canContact(u) ? "Contact autorisé" : "Contact non autorisé"}</div>
                    </div>
                    <Badge variant="outline" className="font-semibold">{(u.subscription || "free").toUpperCase()}</Badge>
                    <div className="text-xs text-slate-400 hidden sm:block">{u.created_at ? dayjs(u.created_at).format("DD MMM YYYY") : "—"}</div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="whatsapp-contacts">
            <AdminWhatsAppContacts />
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
                  💡 Astuce : crée une <strong>liste de diffusion WhatsApp</strong> avec les personnes ayant accepté les messages. Consulte l’onglet Contacts WhatsApp pour vérifier leurs autorisations et préparer une invitation à ta communauté.
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

function canContact(contact) {
  return contact?.whatsapp_marketing_opt_in === true && /^\+[1-9]\d{7,14}$/.test(contact?.whatsapp_number || "");
}

function whatsappLink(contact, message) {
  if (!canContact(contact)) return null;
  return `https://wa.me/${contact.whatsapp_number.slice(1)}?text=${encodeURIComponent(message)}`;
}

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("fr-FR") : "—";
}

function AdminWhatsAppContacts() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [message, setMessage] = useState("Bonjour ! Tu as accepté les messages WhatsApp de WinPulse. Souhaites-tu découvrir notre offre Pro ou recevoir une invitation à notre communauté privée ? Tu peux retirer cette autorisation depuis ton profil WinPulse.");

  useEffect(() => {
    let active = true;
    setData(null);
    if (!user?.is_admin) return () => { active = false; };
    setLoading(true);
    setError("");
    api.get("/admin/whatsapp-contacts", { params: { page, per_page: 50, search, contact_filter: filter } })
      .then(({ data: response }) => {
        if (!active) return;
        if (!Array.isArray(response?.items) || !Number.isSafeInteger(response?.total) || !Number.isSafeInteger(response?.total_pages)) {
          throw new Error("Réponse de contacts invalide.");
        }
        if (page > response.total_pages) {
          setPage(Math.max(1, response.total_pages));
          return;
        }
        setData(response);
      })
      .catch(err => {
        if (active) setError(typeof err?.response?.data?.detail === "string" ? err.response.data.detail : "Impossible de charger les contacts WhatsApp. Vérifie que le serveur a été mis à jour.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, user?.is_admin, page, search, filter, revision]);

  async function copyNumber(number) {
    setNotice("");
    try {
      await navigator.clipboard.writeText(number);
      setNotice("Numéro copié.");
    } catch {
      setNotice("La copie automatique est indisponible. Sélectionne et copie le numéro affiché.");
    }
  }

  async function exportContacts() {
    if (exporting || !user?.is_admin) return;
    setExporting(true);
    setNotice("");
    setError("");
    let url;
    try {
      const response = await api.get("/admin/whatsapp-contacts/export", { params: { search }, responseType: "blob" });
      if (!String(response.headers?.["content-type"] || "").toLowerCase().includes("text/csv")) {
        throw new Error("Le serveur n’a pas renvoyé un CSV.");
      }
      url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `winpulse-contacts-whatsapp-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setNotice("Export téléchargé : uniquement les contacts autorisés correspondant à la recherche, sur toutes les pages.");
    } catch {
      setError("L’export a échoué. Vérifie ton accès administrateur et réessaie.");
    } finally {
      if (url) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExporting(false);
    }
  }

  if (!user?.is_admin) return null;

  return (
    <Card className="space-y-5 border-neutral-200 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><MessageCircle className="h-5 w-5 text-emerald-600" />Contacts WhatsApp</h2>
          <p className="mt-1 text-sm text-slate-500">Numéros des inscrits, autorisations de contact et invitations à ta communauté.</p>
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualiser</Button>
      </div>

      <form onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); setRevision(value => value + 1); }} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Rechercher
          <Input className="mt-1 min-w-48" value={searchInput} onChange={event => setSearchInput(event.target.value)} maxLength={120} placeholder="Nom, email ou numéro" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Autorisation
          <select className="mt-1 block h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
            <option value="all">Tous les inscrits</option>
            <option value="authorized">Contact autorisé</option>
            <option value="not_authorized">Contact non autorisé</option>
            <option value="missing">Numéro absent ou invalide</option>
          </select>
        </label>
        <Button type="submit">Rechercher</Button>
      </form>

      <div className="rounded-lg bg-slate-50 p-3">
        <label className="block text-xs font-semibold text-slate-600">Message à préparer dans WhatsApp
          <textarea rows={3} maxLength={2000} className="mt-2 w-full rounded-md border border-slate-200 bg-white p-2 text-sm font-normal text-slate-700" value={message} onChange={event => setMessage(event.target.value)} />
        </label>
        <p className="mt-1 text-xs text-slate-500">Le bouton ouvre une conversation avec un brouillon. Tu décides de l’envoyer. Une invitation laisse la personne choisir de rejoindre le groupe.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{data ? `${data.total} inscrit${data.total > 1 ? "s" : ""} correspondant au filtre` : "Chargement des contacts…"}</p>
        <Button type="button" variant="outline" onClick={exportContacts} disabled={loading || exporting || !data}><Download className="mr-2 h-4 w-4" />{exporting ? "Export…" : "Exporter les contacts autorisés"}</Button>
      </div>
      <p className="text-xs text-slate-500">L’export suit la recherche et inclut uniquement les numéros ayant une autorisation active, quel que soit le filtre choisi. Les anciens comptes sans numéro restent accessibles.</p>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {loading ? <p role="status" className="py-5 text-center text-sm text-slate-500">Chargement…</p> : data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Utilisateur</th><th className="p-3">WhatsApp</th><th className="p-3">Autorisation</th><th className="p-3">Actions</th></tr></thead>
              <tbody>{data.items.map(contact => {
                const allowed = canContact(contact);
                const link = whatsappLink(contact, message.trim());
                return <tr key={contact.id} className="border-b border-slate-100 align-top">
                  <td className="p-3"><div className="font-semibold text-slate-800">{contact.name || "Sans nom"}</div><div className="break-all text-xs text-slate-500">{contact.email}</div><div className="mt-1 text-xs text-slate-500">{contact.subscription || "free"} · Inscrit le {dateLabel(contact.created_at)}</div></td>
                  <td className="whitespace-nowrap p-3 font-mono text-xs">{contact.whatsapp_number || "Non renseigné"}</td>
                  <td className="p-3"><span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${allowed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{allowed ? "Contact autorisé" : "Contact non autorisé"}</span><div className="mt-1 text-xs text-slate-500">{allowed ? `Accord le ${dateLabel(contact.whatsapp_opt_in_at)}` : contact.whatsapp_opt_out_at ? `Retirée le ${dateLabel(contact.whatsapp_opt_out_at)}` : "Aucune autorisation active"}</div></td>
                  <td className="p-3"><div className="flex flex-wrap gap-2">
                    {contact.whatsapp_number && <Button type="button" variant="outline" size="sm" aria-label={`Copier le numéro de ${contact.name || contact.email}`} onClick={() => copyNumber(contact.whatsapp_number)}><Copy className="mr-1 h-3.5 w-3.5" />Copier</Button>}
                    {link && message.trim() && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><MessageCircle className="h-3.5 w-3.5" />Contacter / inviter</a>}
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
            {data.items.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Aucun inscrit ne correspond à ces critères.</p>}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Précédent</Button>
            <span className="text-xs text-slate-500">Page {data.page} / {data.total_pages}</span>
            <Button type="button" variant="outline" disabled={page >= data.total_pages} onClick={() => setPage(value => value + 1)}>Suivant</Button>
          </div>
        </>
      )}
    </Card>
  );
}

const QUALITY_ADMIN_COPY = {"fr": ["Pilotage de WinPulse", "Fiabilité et abonnements, à partir des données réellement enregistrées.", "Actualiser", "Contrôle léger", "Contrôle en cours…", "État du service", "Dernier contrôle", "Aucun contrôle disponible", "Rapport ancien : relance un contrôle.", "Automatisation désactivée sur le serveur.", "Audit quotidien", "Chargement…", "Indisponible. Réessaie.", "jours", "Demandes de paiement", "Paiements validés", "Montants validés dans l’application", "Premiers acheteurs", "Achats répétés", "Renouvellements observables", "Inscriptions → premier paiement", "Demandes → paiement validé", "Nouvelles inscriptions", "Inscriptions devenues payantes", "Lecture des chiffres", "Les ouvertures de la fenêtre de paiement ne sont pas des paiements. Le ratio des demandes concerne les demandes créées sur la période ; les paiements sont comptés à leur date de validation.", "Ces montants ne sont pas un rapprochement bancaire ni un bénéfice net. Les paiements manuels restent distingués de FedaPay.", "Les cohortes récentes évoluent encore. Sans dénominateur, aucun pourcentage n’est inventé.", "Renouvellements : fenêtre de même durée, décalée de 7 jours pour observer chaque échéance jusqu’au bout. Paiements avant expiration inclus.", "Paiements sans échéance historique connue", "FedaPay historique sans environnement enregistré", "FedaPay vérifiés", "Validations manuelles", "Aucune alerte détectée par ce contrôle.", "Les signaux navigateur sont des compteurs agrégés des utilisateurs connectés, pas un test complet de toutes les pages.", "Sain", "Attention", "Critique", "Inconnu", "Le contrôle est en cours ou temporairement indisponible.", "Échéances évaluées", "Renouvelées", "Paiements sans montant exploitable", "Gagnants et perdants restent dans l’historique public.", "La surveillance légère fonctionne toutes les 5 minutes lorsque le scheduler interne est actif. Elle ne contacte pas les bookmakers.", "Consultations de l’offre Pro", "Ouvertures du paiement", "Navigation : compteurs par jours UTC, avec visites répétées possibles. Ce ne sont pas des visiteurs uniques.", "Fenêtre des échéances"], "en": ["WinPulse control centre", "Reliability and subscriptions from recorded data.", "Refresh", "Lightweight check", "Checking…", "Service status", "Last check", "No check available", "Old report: run another check.", "Server automation is disabled.", "Daily audit", "Loading…", "Unavailable. Try again.", "days", "Payment requests", "Confirmed payments", "Amounts validated in the app", "First buyers", "Repeat purchases", "Observable renewals", "Signups → first payment", "Requests → confirmed payment", "New signups", "Signups that paid", "Reading the figures", "Opening checkout is not a payment. Request conversion uses requests created in the period; payments use their approval date.", "These amounts are not bank reconciliation or net profit. Manual approvals are separated from FedaPay.", "Recent cohorts are still evolving. No percentage is invented without a denominator.", "Renewals use a window of the same length shifted back seven days, giving every expiry a full grace period. Early payments count.", "Payments without a known historical expiry", "Historical FedaPay payments without recorded environment", "Verified FedaPay", "Manual approvals", "No alert detected by this check.", "Browser signals aggregate signed-in users; they are not a full test of every page.", "Healthy", "Warning", "Critical", "Unknown", "Check running or temporarily unavailable.", "Evaluated expiry cycles", "Renewed", "Payments without a usable amount", "Wins and losses remain in the public record.", "Lightweight monitoring runs every five minutes when the internal scheduler is active. It does not contact bookmakers.", "Pro offer views", "Checkout openings", "Navigation counts use UTC calendar days and may include repeat visits. These are not unique visitors.", "Expiry window"], "es": ["Control de WinPulse", "Fiabilidad y suscripciones según datos registrados.", "Actualizar", "Control ligero", "Comprobando…", "Estado del servicio", "Último control", "Sin controles disponibles", "Informe antiguo: ejecuta otro control.", "La automatización está desactivada.", "Auditoría diaria", "Cargando…", "No disponible. Reintenta.", "días", "Solicitudes de pago", "Pagos validados", "Importes validados en la aplicación", "Primeros compradores", "Compras repetidas", "Renovaciones observables", "Inscripciones → primer pago", "Solicitudes → pago validado", "Nuevas inscripciones", "Inscripciones que pagaron", "Interpretar cifras", "Abrir el pago no es pagar. La conversión usa las solicitudes creadas en el periodo; los pagos usan la fecha de validación.", "No es una conciliación bancaria ni un beneficio neto. Las aprobaciones manuales se separan de FedaPay.", "Las cohortes recientes siguen cambiando. Sin denominador no se inventa un porcentaje.", "Renovaciones: ventana de igual duración desplazada siete días para completar el margen de cada vencimiento. Incluye pagos anticipados.", "Pagos sin vencimiento histórico conocido", "FedaPay histórico sin entorno registrado", "FedaPay verificados", "Validaciones manuales", "Sin alertas detectadas por este control.", "Los errores del navegador se agregan para usuarios conectados; no prueban todas las páginas.", "Correcto", "Atención", "Crítico", "Desconocido", "Control en curso o no disponible.", "Vencimientos evaluados", "Renovados", "Pagos sin importe utilizable", "Ganados y perdidos permanecen en el historial público.", "Control cada cinco minutos con el planificador activo, sin contactar a las casas.", "Visitas a la oferta Pro", "Aperturas del pago", "Contadores por días UTC; pueden incluir visitas repetidas. No son visitantes únicos.", "Ventana de vencimientos"], "pt": ["Controlo WinPulse", "Fiabilidade e subscrições com dados registados.", "Atualizar", "Controlo ligeiro", "A verificar…", "Estado do serviço", "Último controlo", "Sem controlo disponível", "Relatório antigo: executa novo controlo.", "Automatização desativada.", "Auditoria diária", "A carregar…", "Indisponível. Tenta novamente.", "dias", "Pedidos de pagamento", "Pagamentos validados", "Montantes validados na aplicação", "Primeiros compradores", "Compras repetidas", "Renovações observáveis", "Inscrições → primeiro pagamento", "Pedidos → pagamento validado", "Novas inscrições", "Inscrições que pagaram", "Interpretar os números", "Abrir o pagamento não equivale a pagar. A conversão usa pedidos criados no período; os pagamentos usam a data de validação.", "Não é reconciliação bancária nem lucro líquido. As validações manuais são separadas da FedaPay.", "As coortes recentes ainda evoluem. Sem denominador não se inventa uma percentagem.", "Renovações: janela da mesma duração recuada sete dias para completar a margem de cada validade. Inclui pagamentos antecipados.", "Pagamentos sem validade histórica conhecida", "FedaPay histórico sem ambiente registado", "FedaPay verificados", "Validações manuais", "Sem alerta detetado neste controlo.", "Os sinais agregam utilizadores ligados; não são um teste completo de todas as páginas.", "Saudável", "Atenção", "Crítico", "Desconhecido", "Controlo em curso ou indisponível.", "Validades avaliadas", "Renovadas", "Pagamentos sem montante utilizável", "Ganhos e perdas continuam no histórico público.", "Controlo a cada cinco minutos com o agendador ativo, sem contactar casas.", "Visitas à oferta Pro", "Aberturas do pagamento", "Contadores por dias UTC com possíveis visitas repetidas. Não são visitantes únicos.", "Janela de validades"], "de": ["WinPulse-Steuerung", "Zuverlässigkeit und Abonnements aus erfassten Daten.", "Aktualisieren", "Leichte Prüfung", "Wird geprüft…", "Dienststatus", "Letzte Prüfung", "Keine Prüfung verfügbar", "Alter Bericht: erneut prüfen.", "Serverautomatisierung deaktiviert.", "Tägliche Prüfung", "Wird geladen…", "Nicht verfügbar. Erneut versuchen.", "Tage", "Zahlungsanfragen", "Bestätigte Zahlungen", "In der App bestätigte Beträge", "Erstkäufer", "Wiederholte Käufe", "Beobachtbare Verlängerungen", "Anmeldungen → erste Zahlung", "Anfragen → bestätigte Zahlung", "Neue Anmeldungen", "Anmeldungen mit Zahlung", "Zahlen verstehen", "Ein geöffnetes Zahlungsfenster ist keine Zahlung. Die Anfragenquote betrifft im Zeitraum erstellte Anfragen; Zahlungen zählen nach Bestätigungsdatum.", "Kein Bankabgleich und kein Nettogewinn. Manuelle Freigaben werden von FedaPay getrennt.", "Jüngere Kohorten verändern sich noch. Ohne Nenner wird keine Quote erfunden.", "Verlängerungen: gleich langes Fenster, um sieben Tage zurückversetzt für eine vollständige Nachfrist. Frühzahlungen zählen.", "Zahlungen ohne bekanntes historisches Ablaufdatum", "Historische FedaPay-Zahlungen ohne Umgebung", "Verifizierte FedaPay", "Manuelle Freigaben", "Keine Warnung bei dieser Prüfung.", "Browsersignale aggregieren angemeldete Nutzer und testen nicht jede Seite.", "Gesund", "Warnung", "Kritisch", "Unbekannt", "Prüfung läuft oder ist nicht verfügbar.", "Bewertete Ablaufzyklen", "Verlängert", "Zahlungen ohne nutzbaren Betrag", "Siege und Niederlagen bleiben öffentlich sichtbar.", "Leichte Prüfung alle fünf Minuten bei aktivem Scheduler, ohne Buchmacheraufrufe.", "Pro-Angebotsaufrufe", "Geöffnete Zahlungen", "Zähler nach UTC-Kalendertagen, möglicherweise mit Wiederholungen. Keine eindeutigen Besucher.", "Ablauffenster"], "ar": ["مركز تحكم WinPulse", "موثوقية واشتراكات بناءً على بيانات مسجلة.", "تحديث", "فحص خفيف", "جارٍ الفحص…", "حالة الخدمة", "آخر فحص", "لا يوجد فحص", "تقرير قديم: أعد الفحص.", "الأتمتة متوقفة على الخادم.", "الفحص اليومي", "جارٍ التحميل…", "غير متاح. أعد المحاولة.", "أيام", "طلبات الدفع", "مدفوعات مؤكدة", "مبالغ مؤكدة داخل التطبيق", "مشترون جدد", "مشتريات متكررة", "تجديدات قابلة للرصد", "التسجيل → أول دفع", "الطلبات → دفع مؤكد", "تسجيلات جديدة", "تسجيلات دفعت", "قراءة الأرقام", "فتح نافذة الدفع ليس دفعاً. النسبة تخص الطلبات المنشأة خلال الفترة؛ وتُحسب المدفوعات بتاريخ تأكيدها.", "ليست مطابقة مصرفية أو ربحاً صافياً. تُفصل الموافقات اليدوية عن FedaPay.", "الدفعات الحديثة لا تزال تتغير. لا تُختلق نسبة دون مقام.", "التجديدات ضمن نافذة مساوية المدة مؤخرة سبعة أيام لإكمال مهلة كل انتهاء. يشمل الدفع المبكر.", "مدفوعات بلا تاريخ انتهاء سابق معروف", "مدفوعات FedaPay سابقة بلا بيئة مسجلة", "FedaPay موثق", "موافقات يدوية", "لم يرصد الفحص تنبيهاً.", "إشارات المتصفح مجمعة للمستخدمين المتصلين وليست اختباراً لكل الصفحات.", "سليم", "تنبيه", "حرج", "غير معروف", "الفحص جارٍ أو غير متاح.", "دورات انتهاء مقيمة", "مجددة", "مدفوعات بلا مبلغ صالح", "تبقى النتائج الفائزة والخاسرة في السجل العام.", "فحص كل خمس دقائق عند تشغيل المجدول دون الاتصال بشركات المراهنة.", "مشاهدات عرض Pro", "مرات فتح الدفع", "عدادات حسب أيام UTC وقد تتكرر الزيارات. ليست زواراً فريدين.", "نافذة تواريخ الانتهاء"]};
const QUALITY_CHECK_COPY = {"fr": ["Base de données", "Fraîcheur des cotes", "Erreurs de paiement récentes", "Activation de paiement à vérifier", "Résultats en attente depuis plus de 12 h", "Planificateur automatique", "Erreurs navigateur signalées aujourd’hui (UTC)"], "en": ["Database", "Odds freshness", "Recent payment errors", "Payment activation needs review", "Results pending over 12 hours", "Automatic scheduler", "Browser errors reported today (UTC)"], "es": ["Base de datos", "Actualidad de cuotas", "Errores de pago recientes", "Revisar activación de pago", "Resultados pendientes más de 12 h", "Planificador automático", "Errores del navegador de hoy (UTC)"], "pt": ["Base de dados", "Atualidade das cotas", "Erros de pagamento recentes", "Rever ativação do pagamento", "Resultados pendentes há mais de 12 h", "Agendador automático", "Erros do navegador hoje (UTC)"], "de": ["Datenbank", "Quotenaktualität", "Jüngste Zahlungsfehler", "Zahlungsaktivierung prüfen", "Ergebnisse über 12 Stunden ausstehend", "Automatischer Scheduler", "Heute gemeldete Browserfehler (UTC)"], "ar": ["قاعدة البيانات", "حداثة المعاملات", "أخطاء دفع حديثة", "تفعيل دفع يحتاج مراجعة", "نتائج معلقة أكثر من 12 ساعة", "المجدول الآلي", "أخطاء المتصفح المبلغة اليوم (UTC)"]};

function QualityControlPanel() {
  const {
    user
  } = useAuth();
  const i18n = usePageLanguage();
  const w = QUALITY_ADMIN_COPY[i18n.language] || QUALITY_ADMIN_COPY.fr;
  const names = QUALITY_CHECK_COPY[i18n.language] || QUALITY_CHECK_COPY.fr;
  const [days, setDays] = useState(30),
    [retry, setRetry] = useState(0),
    [checking, setChecking] = useState(false);
  const [state, setState] = useState({
    key: null,
    loading: true
  });
  const alive = useRef(false);
  const key = `${user?.id}:${days}`;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!user?.is_admin) return undefined;
    let active = true;
    let flight = null;
    const load = async () => {
      if (flight || document.hidden) return;
      const controller = new AbortController();
      flight = controller;
      setState(old => ({
        ...old,
        key,
        loading: true
      }));
      const results = await Promise.allSettled([api.get(`/admin/quality/status`, {
        signal: controller.signal,
        timeout: 8000
      }), api.get(`/admin/quality/business?days=${days}`, {
        signal: controller.signal,
        timeout: 25000
      }), api.get('/admin/health-monitor/latest', {
        signal: controller.signal,
        timeout: 8000
      })]);
      if (active && !controller.signal.aborted) setState({
        key,
        loading: false,
        status: results[0].status === 'fulfilled' ? results[0].value.data : null,
        business: results[1].status === 'fulfilled' ? results[1].value.data : null,
        audit: results[2].status === 'fulfilled' ? results[2].value.data : null
      });
      flight = null;
    };
    load();
    const timer = window.setInterval(load, 60000);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      flight?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [key, days, retry, user?.is_admin]);
  if (!user?.is_admin) return null;
  const visible = state.key === key ? state : {};
  const data = visible.business;
  const report = visible.status;
  const audit = visible.audit;
  const number = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? i18n.formatNumber(Number(value), {
    maximumFractionDigits: 2
  }) : '—';
  const percent = value => value == null ? '—' : `${number(value)} %`;
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? i18n.formatDate(value, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }) : '—';
  const statuses = {
    healthy: w[35],
    warning: w[36],
    critical: w[37],
    unknown: w[38],
    never_run: w[7]
  };
  const codes = ['database', 'odds_freshness', 'payment_provider_errors', 'activation_pending', 'results_overdue', 'scheduler', 'browser_errors_today'];
  const metric = (label, value, sub) => <div key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs leading-5 text-slate-500">{label}</p><strong className="mt-2 block break-words font-mono text-2xl text-slate-900">{value}</strong>{sub && <p className="mt-2 text-xs leading-5 text-slate-500">{sub}</p>}</div>;
  return <section data-testid="quality-control" className="space-y-6" dir={i18n.direction}>
  <header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-900">{w[0]}</h2><p className="mt-2 text-sm text-slate-500">{w[1]}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={visible.loading} onClick={() => setRetry(n => n + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${visible.loading ? 'animate-spin' : ''}`} />{w[2]}</button><button type="button" data-testid="quality-check" disabled={checking} onClick={async () => {
          setChecking(true);
          try {
            await api.post('/admin/quality/check', {}, {
              timeout: 55000
            });
            if (alive.current) setRetry(n => n + 1);
          } catch {
            if (alive.current) toast.error(w[39]);
          } finally {
            if (alive.current) setChecking(false);
          }
        }} className="min-h-11 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white disabled:opacity-50">{checking ? w[4] : w[3]}</button></div></header>
  <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="quality-status"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-xl font-bold">{w[5]}</h3><span className="text-sm text-slate-500">{w[6]} : {date(report?.checked_at)}</span></div>
   {!report ? <p className="mt-3 text-sm" role="status">{visible.loading ? w[11] : w[12]}</p> : <><p className={`mt-3 text-sm font-bold ${report.status === 'healthy' && !report.stale ? 'text-emerald-700' : 'text-amber-800'}`}>{statuses[report.stale ? "unknown" : report.status] || w[38]}{report.stale && ` · ${w[8]}`}</p>{report.scheduler_enabled === false && <p className="mt-2 text-sm text-amber-800">{w[9]}</p>}<div className="mt-4 grid gap-2 sm:grid-cols-2">{(report.checks || []).map(check => <div key={check.code} className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span className="min-w-0 break-words">{names[codes.indexOf(check.code)] || w[38]}{check.value != null && <bdi className="ms-2 font-mono font-bold">{number(check.value)}</bdi>}</span><span className={`text-xs font-bold ${check.status === 'healthy' ? 'text-emerald-700' : check.status === 'critical' ? 'text-rose-700' : 'text-amber-800'}`}>{statuses[check.status] || w[38]}</span></div>)}</div></>}
   <p className="mt-4 text-xs leading-6 text-slate-500">{w[44]}<br />{w[34]}</p><p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-6 text-slate-500">{w[10]} : {date(audit?.started_at)} · {audit?.overall_status ? statuses[audit.overall_status] || w[38] : w[7]}</p></div>
  <div className="flex flex-wrap gap-2">{[7, 30, 90].map(n => <button type="button" key={n} aria-pressed={days === n} onClick={() => setDays(n)} className={`min-h-11 rounded-xl border px-4 text-sm font-bold ${days === n ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 text-slate-600'}`}>{n} {w[13]}</button>)}</div>
  {!data ? <p role="status" className="text-sm text-slate-500">{visible.loading ? w[11] : w[12]}</p> : <><div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="quality-business">
   {metric(w[45], number(data.navigation?.pro_views))}{metric(w[46], number(data.navigation?.checkout_openings))}{metric(w[14], number(data.checkout_requests))}{metric(w[15], number(data.confirmed_payments), `${w[31]} : ${number(data.verified_fedapay)} · ${w[32]} : ${number(data.manual_approved)}`)}{metric(w[16], `${number(data.confirmed_amount_xof)} XOF`)}{metric(w[17], number(data.first_buyers))}{metric(w[18], number(data.repeat_purchases))}{metric(w[19], percent(data.renewal_percent), `${w[40]} : ${number(data.renewal_cycles_due)} · ${w[41]} : ${number(data.renewal_cycles_renewed)}`)}{metric(w[20], percent(data.signup_to_paid_percent), `${w[22]} : ${number(data.new_registrations)} · ${w[23]} : ${number(data.new_registrations_paid)}`)}{metric(w[21], percent(data.checkout_to_paid_percent), `${number(data.checkout_requests_paid)} / ${number(data.checkout_requests)}`)}
  </div><div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-500"><h3 className="mb-2 text-base font-bold text-slate-900">{w[24]}</h3><p>{w[25]}</p><p className="mt-2">{w[47]}</p><p className="mt-2">{w[26]}</p><p className="mt-2">{w[27]}</p><p className="mt-2">{w[28]}<br />{w[48]} : {date(data.renewal_from)} → {date(data.renewal_to)}</p><p className="mt-3">{w[29]} : {number(data.payments_missing_expiry)}<br />{w[30]} : {number(data.fedapay_unknown_environment)}<br />{w[42]} : {number(data.payments_missing_amount)}</p></div></>}
 </section>;
}
