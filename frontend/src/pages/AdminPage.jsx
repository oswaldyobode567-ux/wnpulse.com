import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import AppLayout from "@/components/AppLayout";
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

        <Tabs defaultValue="payments" className="space-y-6">
          <TabsList className="h-auto flex flex-wrap justify-start gap-1 bg-neutral-100">
            <TabsTrigger value="payments" data-testid="tab-payments">Paiements</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Utilisateurs</TabsTrigger>
            <TabsTrigger value="whatsapp-contacts" data-testid="tab-whatsapp-contacts"><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Contacts WhatsApp</TabsTrigger>
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
