import { useEffect, useState, useRef, useCallback } from "react";
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
            <TabsTrigger value="journey" data-testid="tab-journey">Parcours visiteurs</TabsTrigger>
            <TabsTrigger value="ranking" data-testid="tab-ranking">Comparatif des pronostics</TabsTrigger>
            <TabsTrigger value="enrichment" data-testid="tab-enrichment"><EnrichmentTabLabel /></TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">Paiements</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Utilisateurs</TabsTrigger>
            <TabsTrigger value="whatsapp-contacts" data-testid="tab-whatsapp-contacts"><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Contacts WhatsApp</TabsTrigger>
            <TabsTrigger value="broadcast" data-testid="tab-broadcast">Envoi emails</TabsTrigger>
            <TabsTrigger value="auto-follower" data-testid="tab-auto-follower">
              <Sunrise className="h-3.5 w-3.5 mr-1.5" />Suiveur 7h
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quality"><QualityControlPanel /></TabsContent>

          <TabsContent value="journey"><JourneyReport /></TabsContent>

          <TabsContent value="ranking"><RankingEvaluationPanel /></TabsContent>

          <TabsContent value="enrichment"><VisualAssetsPanel /><EnrichmentPanel /></TabsContent>
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
  <ResultSyncPanel onUpdated={() => setRetry(n => n + 1)} />
  <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="quality-status"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-xl font-bold">{w[5]}</h3><span className="text-sm text-slate-500">{w[6]} : {date(report?.checked_at)}</span></div>
   {!report ? <p className="mt-3 text-sm" role="status">{visible.loading ? w[11] : w[12]}</p> : <><p className={`mt-3 text-sm font-bold ${report.status === 'healthy' && !report.stale ? 'text-emerald-700' : 'text-amber-800'}`}>{statuses[report.stale ? "unknown" : report.status] || w[38]}{report.stale && ` · ${w[8]}`}</p>{report.scheduler_enabled === false && <p className="mt-2 text-sm text-amber-800">{w[9]}</p>}<div className="mt-4 grid gap-2 sm:grid-cols-2">{(report.checks || []).map(check => <div key={check.code} className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span className="min-w-0 break-words">{names[codes.indexOf(check.code)] || w[38]}{check.value != null && <bdi className="ms-2 font-mono font-bold">{number(check.value)}</bdi>}</span><span className={`text-xs font-bold ${check.status === 'healthy' ? 'text-emerald-700' : check.status === 'critical' ? 'text-rose-700' : 'text-amber-800'}`}>{statuses[check.status] || w[38]}</span></div>)}</div></>}
   <p className="mt-4 text-xs leading-6 text-slate-500">{w[44]}<br />{w[34]}</p><p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-6 text-slate-500">{w[10]} : {date(audit?.started_at)} · {audit?.overall_status ? statuses[audit.overall_status] || w[38] : w[7]}</p></div>
  <div className="flex flex-wrap gap-2">{[7, 30, 90].map(n => <button type="button" key={n} aria-pressed={days === n} onClick={() => setDays(n)} className={`min-h-11 rounded-xl border px-4 text-sm font-bold ${days === n ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 text-slate-600'}`}>{n} {w[13]}</button>)}</div>
  {!data ? <p role="status" className="text-sm text-slate-500">{visible.loading ? w[11] : w[12]}</p> : <><div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="quality-business">
   {metric(w[45], number(data.navigation?.pro_views))}{metric(w[46], number(data.navigation?.checkout_openings))}{metric(w[14], number(data.checkout_requests))}{metric(w[15], number(data.confirmed_payments), `${w[31]} : ${number(data.verified_fedapay)} · ${w[32]} : ${number(data.manual_approved)}`)}{metric(w[16], `${number(data.confirmed_amount_xof)} XOF`)}{metric(w[17], number(data.first_buyers))}{metric(w[18], number(data.repeat_purchases))}{metric(w[19], percent(data.renewal_percent), `${w[40]} : ${number(data.renewal_cycles_due)} · ${w[41]} : ${number(data.renewal_cycles_renewed)}`)}{metric(i18n.t("Premier renouvellement après 30 jours"), percent(data.first_30d_renewal_percent), `${number(data.first_30d_renewed)} / ${number(data.first_30d_due)} · ${i18n.t("Fenêtre de 7 jours terminée")}`)}{metric(w[20], percent(data.signup_to_paid_percent), `${w[22]} : ${number(data.new_registrations)} · ${w[23]} : ${number(data.new_registrations_paid)}`)}{metric(w[21], percent(data.checkout_to_paid_percent), `${number(data.checkout_requests_paid)} / ${number(data.checkout_requests)}`)}
  </div><div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-500"><h3 className="mb-2 text-base font-bold text-slate-900">{w[24]}</h3><p>{w[25]}</p><p className="mt-2">{w[47]}</p><p className="mt-2">{w[26]}</p><p className="mt-2">{w[27]}</p><p className="mt-2">{w[28]}<br />{w[48]} : {date(data.renewal_from)} → {date(data.renewal_to)}</p><p className="mt-3">{w[29]} : {number(data.payments_missing_expiry)}<br />{w[30]} : {number(data.fedapay_unknown_environment)}<br />{w[42]} : {number(data.payments_missing_amount)}</p></div></>}
 </section>;
}

const ENRICHMENT_COPY = {"fr": ["Sources et modèles", "Actualiser", "Collecter et entraîner en observation", "Lancement demandé. Les quotas restent respectés.", "Un traitement est déjà actif.", "Source indisponible. Réessaie.", "Résultats observés", "Portraits avec licence vérifiée", "Dernière collecte", "Clé API-Sports configurée", "Clé tennis optionnelle configurée", "Oui", "Non", "Les sources sont indépendantes du catalogue : une donnée manquante ne retire aucun match.", "Modèles en observation", "Aucun modèle entraîné pour le moment. Le moteur actuel reste utilisé.", "Matchs d’entraînement", "Échantillon de test rétrospectif", "Brier du modèle", "Brier du marché", "Comparaison prospective", "Aucune comparaison prospective disponible pour ce modèle.", "Les tests rétrospectifs supposent les résultats disponibles le lendemain UTC. Ils ne prouvent pas que le modèle bat les bookmakers. Les probabilités en observation ne remplacent aucun pronostic public.", "Les mesures prospectives utilisent une première prévision figée avant le début du match, puis le résultat confirmé.", "Historique insuffisant", "Prêt en observation", "Échec d’entraînement", "Automatisation désactivée : utilise le bouton de collecte.", "Consommation locale du quota aujourd’hui (UTC)", "Chargement…", "Source", "État", "Des statistiques avancées peuvent rester absentes selon les droits du fournisseur. La clé tennis optionnelle utilise le plan choisi chez ce fournisseur ; ce site ne souscrit aucun abonnement.", "Non mesuré"], "en": ["Sources and models", "Refresh", "Collect and train in shadow mode", "Run requested. Provider quotas still apply.", "A job is already active.", "Source unavailable. Try again.", "Observed results", "Portraits with verified licences", "Last collection", "API-Sports key configured", "Optional tennis key configured", "Yes", "No", "Sources are independent of the catalogue: missing data never removes a match.", "Models in shadow mode", "No trained model yet. The current engine remains in use.", "Training fixtures", "Retrospective test sample", "Model Brier", "Market Brier", "Prospective comparison", "No prospective comparison for this model yet.", "Retrospective tests assume results available the following UTC day. They do not prove bookmaker outperformance. Shadow probabilities do not replace public picks.", "Prospective measures use a first forecast frozen before kickoff and a confirmed result.", "Insufficient history", "Shadow ready", "Training failed", "Automation disabled: use the collection button.", "Local quota usage today (UTC)", "Loading…", "Source", "Status", "Advanced statistics may remain unavailable under provider access rules. The optional tennis key uses your selected provider plan; this site purchases no subscription.", "Not measured"], "es": ["Fuentes y modelos", "Actualizar", "Recopilar y entrenar en observación", "Ejecución solicitada. Se respetan las cuotas.", "Ya hay un proceso activo.", "Fuente no disponible. Reintenta.", "Resultados observados", "Retratos con licencia verificada", "Última recopilación", "Clave API-Sports configurada", "Clave opcional de tenis configurada", "Sí", "No", "Las fuentes son independientes del catálogo: la falta de datos no elimina partidos.", "Modelos en observación", "Aún no hay modelo entrenado. Se mantiene el motor actual.", "Partidos de entrenamiento", "Muestra de prueba retrospectiva", "Brier del modelo", "Brier del mercado", "Comparación prospectiva", "Aún no hay comparación prospectiva para este modelo.", "Las pruebas retrospectivas suponen resultados disponibles al día siguiente UTC. No demuestran superar a las casas. No reemplazan los pronósticos públicos.", "Las medidas prospectivas usan la primera previsión registrada antes del inicio y el resultado confirmado.", "Historial insuficiente", "Listo en observación", "Entrenamiento fallido", "Automatización desactivada: usa el botón.", "Consumo local de cuota hoy (UTC)", "Cargando…", "Fuente", "Estado", "Las estadísticas avanzadas dependen del acceso del proveedor. La clave opcional de tenis usa tu plan; el sitio no contrata ninguna suscripción.", "Sin medir"], "pt": ["Fontes e modelos", "Atualizar", "Recolher e treinar em observação", "Execução pedida. As cotas mantêm-se.", "Já existe um processo ativo.", "Fonte indisponível. Tenta novamente.", "Resultados observados", "Retratos com licença verificada", "Última recolha", "Chave API-Sports configurada", "Chave opcional de ténis configurada", "Sim", "Não", "As fontes são independentes do catálogo: dados em falta não retiram jogos.", "Modelos em observação", "Ainda sem modelo treinado. Mantém-se o motor atual.", "Jogos de treino", "Amostra de teste retrospetivo", "Brier do modelo", "Brier do mercado", "Comparação prospetiva", "Sem comparação prospetiva para este modelo.", "Os testes retrospetivos assumem resultados disponíveis no dia seguinte UTC. Não provam superioridade às casas. Não substituem os palpites públicos.", "As medidas prospetivas usam a primeira previsão registada antes do jogo e o resultado confirmado.", "Histórico insuficiente", "Pronto em observação", "Falha no treino", "Automatização desativada: usa o botão.", "Consumo local da cota hoje (UTC)", "A carregar…", "Fonte", "Estado", "Estatísticas avançadas dependem do acesso do fornecedor. A chave de ténis usa o teu plano; o site não contrata subscrições.", "Não medido"], "de": ["Quellen und Modelle", "Aktualisieren", "Daten sammeln und im Schattenmodus trainieren", "Lauf angefordert. Kontingente gelten weiterhin.", "Ein Vorgang läuft bereits.", "Quelle nicht verfügbar. Erneut versuchen.", "Beobachtete Ergebnisse", "Porträts mit geprüfter Lizenz", "Letzte Erfassung", "API-Sports-Schlüssel konfiguriert", "Optionaler Tennisschlüssel konfiguriert", "Ja", "Nein", "Quellen sind vom Katalog getrennt: fehlende Daten entfernen kein Spiel.", "Modelle im Schattenmodus", "Noch kein trainiertes Modell. Das bisherige System bleibt aktiv.", "Trainingsspiele", "Retrospektive Teststichprobe", "Modell-Brier", "Markt-Brier", "Prospektiver Vergleich", "Noch kein prospektiver Vergleich für dieses Modell.", "Retrospektive Tests nehmen Ergebnisse am folgenden UTC-Tag an. Kein Nachweis einer Überlegenheit gegenüber Buchmachern. Keine öffentlichen Tipps werden ersetzt.", "Prospektive Messungen nutzen die erste vor Spielbeginn gespeicherte Prognose und ein bestätigtes Ergebnis.", "Historie unzureichend", "Im Schattenmodus bereit", "Training fehlgeschlagen", "Automatisierung deaktiviert: Schaltfläche verwenden.", "Lokaler Kontingentverbrauch heute (UTC)", "Wird geladen…", "Quelle", "Status", "Erweiterte Statistiken hängen von den Zugriffsrechten ab. Der optionale Tennisschlüssel nutzt deinen Tarif; die Seite schließt kein Abonnement ab.", "Nicht gemessen"], "ar": ["المصادر والنماذج", "تحديث", "جمع البيانات والتدريب في وضع المراقبة", "طُلب التشغيل مع احترام الحصص.", "توجد عملية نشطة بالفعل.", "المصدر غير متاح. أعد المحاولة.", "نتائج مرصودة", "صور بتراخيص موثقة", "آخر جمع", "مفتاح API-Sports مضبوط", "مفتاح التنس الاختياري مضبوط", "نعم", "لا", "المصادر مستقلة عن الكتالوج: نقص البيانات لا يحذف مباراة.", "نماذج في وضع المراقبة", "لا يوجد نموذج مدرب بعد. يبقى المحرك الحالي.", "مباريات التدريب", "عينة اختبار بأثر رجعي", "Brier للنموذج", "Brier للسوق", "مقارنة مستقبلية", "لا توجد مقارنة مستقبلية لهذا النموذج بعد.", "تفترض الاختبارات الرجعية توفر النتيجة في اليوم التالي UTC. لا تثبت التفوق على الشركات ولا تستبدل التوقعات العامة.", "تستخدم القياسات المستقبلية أول توقع محفوظ قبل البداية ونتيجة مؤكدة.", "السجل غير كاف", "جاهز للمراقبة", "فشل التدريب", "الأتمتة متوقفة: استخدم زر الجمع.", "استخدام الحصة المحلي اليوم (UTC)", "جارٍ التحميل…", "المصدر", "الحالة", "تعتمد الإحصاءات المتقدمة على صلاحيات المزود. يستخدم مفتاح التنس خطتك المختارة ولا يشترك الموقع في أي خدمة.", "غير مقاس"]};

function EnrichmentTabLabel(){const {language}=usePageLanguage();return (ENRICHMENT_COPY[language]||ENRICHMENT_COPY.fr)[0];}
function EnrichmentPanel(){
 const {user}=useAuth();const i18n=usePageLanguage();const w=ENRICHMENT_COPY[i18n.language]||ENRICHMENT_COPY.fr;
 const [state,setState]=useState({owner:null,data:null,error:false});const [retry,setRetry]=useState(0);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 useEffect(()=>{if(!user?.is_admin)return undefined;let active=true;const controller=new AbortController();
  api.get('/admin/enrichment/status',{signal:controller.signal,timeout:15000}).then(({data})=>{if(active)setState({owner:user.id,data,error:false});}).catch(()=>{if(active)setState({owner:user.id,data:null,error:true});});
  return()=>{active=false;controller.abort();};},[user?.id,user?.is_admin,retry]);
 if(!user?.is_admin)return null;
 const data=state.owner===user.id?state.data:null;const failed=state.owner===user.id&&state.error;const sources=Array.isArray(data?.sources)?data.sources:[];
 const capabilities=sources.find(s=>s._id==='capabilities');const cycle=sources.find(s=>s._id==='last_cycle');
 const number=value=>value!=null&&Number.isFinite(Number(value))?i18n.formatNumber(Number(value),{maximumFractionDigits:4}):'—';
 const date=value=>value&&Number.isFinite(new Date(value).getTime())?i18n.formatDate(value,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
 const flag=value=>value===true?w[11]:value===false?w[12]:'—';
 return <section className="space-y-5" data-testid="enrichment-panel" dir={i18n.direction}>
  <header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">{w[0]}</h2><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setRetry(n=>n+1)} className="min-h-11 rounded-xl border px-4 text-sm font-bold">{w[1]}</button><button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{const {data}=await api.post('/admin/enrichment/refresh',{}, {timeout:10000});setNotice(data.queued?w[3]:w[4]);}catch{setNotice(w[5]);}finally{setBusy(false);}}} className="min-h-11 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" data-testid="enrichment-run">{w[2]}</button></div></header>
  <p className="text-sm leading-6 text-slate-500">{w[13]}</p>{notice&&<p role="status" className="rounded-xl bg-orange-50 p-3 text-sm text-orange-800">{notice}</p>}
  {!data?<p role="status" className="text-sm">{failed?w[5]:w[29]}</p>:<>
   <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{w[6]}</p><strong className="mt-2 block font-mono text-2xl">{number(data.results)}</strong></div><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{w[7]}</p><strong className="mt-2 block font-mono text-2xl">{number(data.media)}</strong></div></div>
   <div className="rounded-2xl border bg-white p-4 text-sm leading-7"><p>{w[8]} : {date(cycle?.finished_at)}</p><p>{w[9]} : {flag(capabilities?.apisports_key_configured)}</p><p>{w[10]} : {flag(capabilities?.tennis_key_configured)}</p>{data.scheduler_enabled===false&&<p className="mt-2 text-amber-800">{w[27]}</p>}<p className="mt-3 text-xs leading-6 text-slate-500">{w[32]}</p></div>
   <div className="grid gap-3 sm:grid-cols-2">{(data.provider_status||[]).map(provider=><div key={provider._id} className="min-w-0 rounded-xl border p-3 text-xs leading-6 text-slate-500"><p className="break-words font-bold text-slate-900">{provider._id.replace('source:','')}</p><p>{w[31]} : {provider.status} {provider.http_status?`(HTTP ${provider.http_status})`:''}</p><p>{date(provider.checked_at)}</p></div>)}</div>
   <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer text-sm font-bold">{w[28]}</summary>{(data.usage||[]).map(row=><p key={row._id} className="break-words text-xs leading-6 text-slate-500">{row._id.replace(/:\d{4}-\d{2}-\d{2}$/,'')} : {number(row.calls)}</p>)}</details>
   <h3 className="text-xl font-bold">{w[14]}</h3><p className="text-xs leading-6 text-slate-500">{w[22]}</p>
   {!data.models?.length?<p className="rounded-xl border p-4 text-sm">{w[15]}</p>:<div className="grid gap-4 lg:grid-cols-2">{data.models.map(model=>{const prospective=(data.prospective||[]).find(r=>r._id===model._id);return <article key={model._id} className="min-w-0 rounded-2xl border bg-white p-4"><h4 className="break-words text-lg font-bold">{model.sport_key}</h4><p className="mt-1 text-xs text-orange-700">{model.status==='shadow_ready'?w[25]:model.status==='training_failed'?w[26]:w[24]} · {model.model_type||'—'}</p><p className="mt-3 text-sm">{w[16]} : {number(model.fixtures)}</p><p className="mt-1 text-xs text-slate-500">{w[17]} : {number(model.retrospective?.n)}</p><div className="mt-4 border-t pt-3 text-xs leading-6"><h5 className="font-bold">{w[20]}</h5>{prospective?<><p>n = {number(prospective.n)}</p><p>{w[18]} : {number(prospective.model_brier)}</p><p>{w[19]} : {number(prospective.market_brier)}</p></>:<p className="text-slate-500">{w[21]}</p>}</div><p className="mt-3 text-xs text-slate-500">{date(model.as_of)}</p></article>;})}</div>}
   <p className="text-xs leading-6 text-slate-500">{w[23]}</p>
  </>}
 </section>;
}

const RESULT_SYNC_COPY = {"fr": {"title": "Synchronisation des résultats", "intro": "Le contrôle léger vérifie l’alerte. Ce bouton recherche les scores et confirme les résultats récupérables.", "start": "Synchroniser les résultats", "refresh": "Actualiser le bilan", "requesting": "Demande en cours…", "loading": "Chargement…", "queued": "Demande envoyée. Le traitement se poursuit en arrière-plan.", "already": "Un traitement est déjà demandé. Consulte le bilan.", "unknownRequest": "Demande non confirmée. Actualise le bilan avant de réessayer.", "missingRoute": "Les routes de synchronisation sont absentes. Déploie le dernier server.py sur Railway.", "access": "Accès administrateur requis. Reconnecte-toi.", "error": "Bilan indisponible. Vérifie les journaux Railway.", "rate": "Trop de demandes. Patiente cinq minutes avant de relancer.", "overdue": "Pronostics en attente > 12 h", "matches": "Matchs distincts concernés", "old": "Pronostics en attente > 3 jours", "last": "Dernier passage", "checked": "Vérifiés dans le dernier lot", "updated": "Résultats confirmés dans le lot", "noScore": "Sans score final dans le lot", "outside": "Hors fenêtre API, sans archive trouvée dans le lot", "unsupported": "Marchés non évaluables dans le lot", "errors": "Erreurs dans le lot", "never": "Pas encore enregistré", "running": "Traitement en cours sur cette instance", "idle": "Aucun traitement local en cours", "polling": "Bilan actualisé toutes les 15 secondes pendant cinq minutes après une demande.", "honest": "Un pronostic sans résultat vérifiable reste en attente. Aucun gagnant ou perdant n’est inventé et aucun ancien pari n’est supprimé.", "providers": "Diagnostic des compétitions", "provider": "Compétition", "state": "État de la dernière tentative", "http": "HTTP", "available": "Disponible", "provider_error": "Erreur fournisseur", "network_error": "Erreur réseau", "invalid_response": "Réponse invalide", "local_budget_reached": "Plafond local atteint", "quotaHelp": "Un plafond local ou fournisseur atteint peut retarder la récupération. Les réglages du rattrapage figurent dans la notice backend.", "timeout_retry_next_batch": "Temps maximal atteint : reprise au prochain lot", "already_running": "Déjà en cours", "already_running_elsewhere": "Déjà en cours sur une autre instance", "noReport": "Aucun bilan de synchronisation enregistré.", "next": "Le total compte les pronostics ; plusieurs marchés peuvent appartenir au même match. Les autres chiffres concernent le dernier lot.", "notCompleted": "Matchs pas encore confirmés terminés", "batch": "Taille maximale d’un lot", "stale": "Dernier bilan indisponible : les chiffres ci-dessous sont les derniers reçus.", "retryDate": "Prochaine tentative au plus tôt", "fresh": "Bilan reçu"}, "en": {"title": "Result synchronisation", "intro": "The lightweight check reads the alert. This button retrieves scores and confirms recoverable results.", "start": "Synchronise results", "refresh": "Refresh report", "requesting": "Requesting…", "loading": "Loading…", "queued": "Request sent. Processing continues in the background.", "already": "Processing has already been requested. Check the report.", "unknownRequest": "Request not confirmed. Refresh the report before retrying.", "missingRoute": "Synchronisation routes are missing. Deploy the latest server.py on Railway.", "access": "Administrator access required. Sign in again.", "error": "Report unavailable. Check Railway logs.", "rate": "Too many requests. Wait five minutes before retrying.", "overdue": "Predictions pending > 12 h", "matches": "Distinct affected matches", "old": "Predictions pending > 3 days", "last": "Last run", "checked": "Checked in last batch", "updated": "Confirmed in last batch", "noScore": "No final score in batch", "outside": "Outside API window, no archive found in batch", "unsupported": "Unsupported markets in batch", "errors": "Errors in batch", "never": "Not recorded yet", "running": "Processing on this instance", "idle": "No local processing running", "polling": "Report refreshes every 15 seconds for five minutes after a request.", "honest": "Unverifiable results remain pending. Wins and losses are never invented and old picks are never deleted.", "providers": "Competition diagnostics", "provider": "Competition", "state": "Last attempt status", "http": "HTTP", "available": "Available", "provider_error": "Provider error", "network_error": "Network error", "invalid_response": "Invalid response", "local_budget_reached": "Local limit reached", "quotaHelp": "A local or provider limit can delay recovery. See the backend instructions for recovery settings.", "timeout_retry_next_batch": "Timed out: retry in next batch", "already_running": "Already running", "already_running_elsewhere": "Running on another instance", "noReport": "No synchronisation report recorded.", "next": "The total counts predictions; several markets may belong to one match. Other figures describe the last batch.", "notCompleted": "Not confirmed finished yet", "batch": "Maximum batch size", "stale": "Latest report unavailable: figures below are the last received.", "retryDate": "Next attempt no earlier than", "fresh": "Report received"}, "es": {"title": "Sincronización de resultados", "intro": "La comprobación ligera lee la alerta. Este botón busca marcadores y confirma resultados recuperables.", "start": "Sincronizar resultados", "refresh": "Actualizar informe", "requesting": "Solicitando…", "loading": "Cargando…", "queued": "Solicitud enviada. El proceso continúa en segundo plano.", "already": "Ya hay una solicitud. Consulta el informe.", "unknownRequest": "Solicitud sin confirmar. Actualiza el informe antes de reintentar.", "missingRoute": "Faltan las rutas de sincronización. Despliega el último server.py en Railway.", "access": "Acceso de administrador requerido. Vuelve a iniciar sesión.", "error": "Informe no disponible. Consulta los registros de Railway.", "rate": "Demasiadas solicitudes. Espera cinco minutos.", "overdue": "Pronósticos pendientes > 12 h", "matches": "Partidos distintos afectados", "old": "Pronósticos pendientes > 3 días", "last": "Última ejecución", "checked": "Revisados en el último lote", "updated": "Confirmados en el último lote", "noScore": "Sin marcador final en el lote", "outside": "Fuera de la ventana API, sin archivo en el lote", "unsupported": "Mercados no evaluables en el lote", "errors": "Errores en el lote", "never": "Aún no registrado", "running": "Proceso en esta instancia", "idle": "Sin proceso local activo", "polling": "Informe actualizado cada 15 segundos durante cinco minutos tras una solicitud.", "honest": "Los resultados no verificables siguen pendientes. No se inventan victorias o derrotas ni se borran pronósticos antiguos.", "providers": "Diagnóstico de competiciones", "provider": "Competición", "state": "Estado del último intento", "http": "HTTP", "available": "Disponible", "provider_error": "Error del proveedor", "network_error": "Error de red", "invalid_response": "Respuesta inválida", "local_budget_reached": "Límite local alcanzado", "quotaHelp": "Un límite local o del proveedor puede retrasar la recuperación. Consulta la guía del backend.", "timeout_retry_next_batch": "Tiempo agotado: reintento en el próximo lote", "already_running": "Ya en curso", "already_running_elsewhere": "En curso en otra instancia", "noReport": "Sin informe de sincronización registrado.", "next": "El total cuenta pronósticos; un partido puede tener varios mercados. Las otras cifras corresponden al último lote.", "notCompleted": "Sin final confirmado", "batch": "Tamaño máximo del lote", "stale": "Informe reciente no disponible: se muestran los últimos datos recibidos.", "retryDate": "Próximo intento no antes de", "fresh": "Informe recibido"}, "pt": {"title": "Sincronização de resultados", "intro": "A verificação leve lê o alerta. Este botão procura resultados finais e confirma os recuperáveis.", "start": "Sincronizar resultados", "refresh": "Atualizar relatório", "requesting": "A solicitar…", "loading": "A carregar…", "queued": "Pedido enviado. O processamento continua em segundo plano.", "already": "Já existe um pedido. Consulta o relatório.", "unknownRequest": "Pedido não confirmado. Atualiza o relatório antes de tentar novamente.", "missingRoute": "Faltam as rotas de sincronização. Publica o server.py mais recente no Railway.", "access": "É necessário acesso de administrador. Inicia sessão novamente.", "error": "Relatório indisponível. Consulta os registos do Railway.", "rate": "Demasiados pedidos. Aguarda cinco minutos.", "overdue": "Prognósticos pendentes > 12 h", "matches": "Jogos distintos afetados", "old": "Prognósticos pendentes > 3 dias", "last": "Última execução", "checked": "Verificados no último lote", "updated": "Confirmados no último lote", "noScore": "Sem resultado final no lote", "outside": "Fora da janela API, sem arquivo no lote", "unsupported": "Mercados não avaliáveis no lote", "errors": "Erros no lote", "never": "Ainda não registado", "running": "A processar nesta instância", "idle": "Sem processamento local ativo", "polling": "Relatório atualizado a cada 15 segundos durante cinco minutos após um pedido.", "honest": "Resultados não verificáveis continuam pendentes. Não são inventadas vitórias ou derrotas nem apagados prognósticos antigos.", "providers": "Diagnóstico das competições", "provider": "Competição", "state": "Estado da última tentativa", "http": "HTTP", "available": "Disponível", "provider_error": "Erro do fornecedor", "network_error": "Erro de rede", "invalid_response": "Resposta inválida", "local_budget_reached": "Limite local atingido", "quotaHelp": "Um limite local ou do fornecedor pode atrasar a recuperação. Consulta as instruções do backend.", "timeout_retry_next_batch": "Tempo esgotado: nova tentativa no próximo lote", "already_running": "Já em curso", "already_running_elsewhere": "Em curso noutra instância", "noReport": "Sem relatório de sincronização registado.", "next": "O total conta prognósticos; um jogo pode ter vários mercados. As outras métricas são do último lote.", "notCompleted": "Fim ainda não confirmado", "batch": "Tamanho máximo do lote", "stale": "Relatório recente indisponível: são mostrados os últimos dados recebidos.", "retryDate": "Próxima tentativa não antes de", "fresh": "Relatório recebido"}, "de": {"title": "Ergebnisse synchronisieren", "intro": "Die leichte Prüfung liest die Warnung. Diese Schaltfläche ruft Spielstände ab und bestätigt verfügbare Ergebnisse.", "start": "Ergebnisse synchronisieren", "refresh": "Bericht aktualisieren", "requesting": "Anfrage läuft…", "loading": "Wird geladen…", "queued": "Anfrage gesendet. Die Verarbeitung läuft im Hintergrund weiter.", "already": "Eine Anfrage liegt bereits vor. Bericht prüfen.", "unknownRequest": "Anfrage nicht bestätigt. Vor einem neuen Versuch den Bericht aktualisieren.", "missingRoute": "Synchronisationsrouten fehlen. Aktuelle server.py auf Railway bereitstellen.", "access": "Administratorzugang erforderlich. Erneut anmelden.", "error": "Bericht nicht verfügbar. Railway-Protokolle prüfen.", "rate": "Zu viele Anfragen. Fünf Minuten warten.", "overdue": "Tipps ausstehend > 12 Std.", "matches": "Verschiedene betroffene Spiele", "old": "Tipps ausstehend > 3 Tage", "last": "Letzter Durchlauf", "checked": "Im letzten Stapel geprüft", "updated": "Im letzten Stapel bestätigt", "noScore": "Kein Endstand im Stapel", "outside": "Außerhalb des API-Fensters, kein Archivfund im Stapel", "unsupported": "Nicht auswertbare Märkte im Stapel", "errors": "Fehler im Stapel", "never": "Noch nicht erfasst", "running": "Verarbeitung auf dieser Instanz", "idle": "Keine lokale Verarbeitung aktiv", "polling": "Bericht nach einer Anfrage fünf Minuten lang alle 15 Sekunden aktualisiert.", "honest": "Nicht überprüfbare Ergebnisse bleiben offen. Gewinne und Verluste werden nicht erfunden, alte Tipps nicht gelöscht.", "providers": "Wettbewerbsdiagnose", "provider": "Wettbewerb", "state": "Status des letzten Versuchs", "http": "HTTP", "available": "Verfügbar", "provider_error": "Anbieterfehler", "network_error": "Netzwerkfehler", "invalid_response": "Ungültige Antwort", "local_budget_reached": "Lokales Limit erreicht", "quotaHelp": "Ein lokales oder Anbieterlimit kann den Abruf verzögern. Einstellungen stehen in der Backend-Anleitung.", "timeout_retry_next_batch": "Zeitlimit: neuer Versuch im nächsten Stapel", "already_running": "Bereits aktiv", "already_running_elsewhere": "Auf anderer Instanz aktiv", "noReport": "Noch kein Synchronisationsbericht erfasst.", "next": "Die Summe zählt Tipps; mehrere Märkte können zu einem Spiel gehören. Andere Werte beziehen sich auf den letzten Stapel.", "notCompleted": "Spielende noch nicht bestätigt", "batch": "Maximale Stapelgröße", "stale": "Aktueller Bericht nicht verfügbar: letzte empfangene Werte werden angezeigt.", "retryDate": "Nächster Versuch frühestens", "fresh": "Bericht empfangen"}, "ar": {"title": "مزامنة النتائج", "intro": "الفحص الخفيف يقرأ التنبيه. هذا الزر يجلب النتائج ويؤكد ما يمكن التحقق منه.", "start": "مزامنة النتائج", "refresh": "تحديث التقرير", "requesting": "جارٍ إرسال الطلب…", "loading": "جارٍ التحميل…", "queued": "أُرسل الطلب. تستمر المعالجة في الخلفية.", "already": "يوجد طلب معالجة بالفعل. راجع التقرير.", "unknownRequest": "لم يتأكد الطلب. حدّث التقرير قبل المحاولة مجدداً.", "missingRoute": "مسارات المزامنة غير متاحة. انشر أحدث server.py على Railway.", "access": "يلزم دخول المسؤول. سجّل الدخول مجدداً.", "error": "التقرير غير متاح. راجع سجلات Railway.", "rate": "طلبات كثيرة. انتظر خمس دقائق.", "overdue": "توقعات معلقة لأكثر من 12 ساعة", "matches": "مباريات مختلفة متأثرة", "old": "توقعات معلقة لأكثر من 3 أيام", "last": "آخر معالجة", "checked": "فُحصت في آخر دفعة", "updated": "تأكدت في آخر دفعة", "noScore": "بلا نتيجة نهائية في الدفعة", "outside": "خارج نافذة API دون أرشيف في الدفعة", "unsupported": "أسواق لا يمكن تقييمها في الدفعة", "errors": "أخطاء الدفعة", "never": "لم يُسجل بعد", "running": "المعالجة جارية على هذه النسخة", "idle": "لا توجد معالجة محلية جارية", "polling": "يُحدث التقرير كل 15 ثانية لمدة خمس دقائق بعد الطلب.", "honest": "تبقى النتائج غير القابلة للتحقق معلقة. لا تُختلق انتصارات أو خسائر ولا تُحذف التوقعات القديمة.", "providers": "تشخيص البطولات", "provider": "البطولة", "state": "حالة آخر محاولة", "http": "HTTP", "available": "متاح", "provider_error": "خطأ المزود", "network_error": "خطأ الشبكة", "invalid_response": "استجابة غير صالحة", "local_budget_reached": "بلوغ الحد المحلي", "quotaHelp": "قد يؤخر حد محلي أو حد المزود الاسترجاع. راجع دليل الخادم للإعدادات.", "timeout_retry_next_batch": "انتهت المهلة: المحاولة في الدفعة التالية", "already_running": "جارٍ بالفعل", "already_running_elsewhere": "جارٍ على نسخة أخرى", "noReport": "لم يُسجل تقرير مزامنة بعد.", "next": "المجموع يحسب التوقعات؛ قد تضم المباراة عدة أسواق. الأرقام الأخرى تخص آخر دفعة.", "notCompleted": "لم يتأكد انتهاء المباراة", "batch": "الحد الأقصى لحجم الدفعة", "stale": "التقرير الأخير غير متاح: تُعرض آخر الأرقام المستلمة.", "retryDate": "المحاولة التالية ليست قبل", "fresh": "استُلم التقرير"}};

function resultSyncErrorKind(error) {
    const status = error?.response?.status;
    return status === 404 || status === 405 ? "missingRoute" : status === 401 || status === 403 ? "access" : status === 429 ? "rate" : "error";
}

function ResultSyncPanel({ onUpdated }) {
  const { user } = useAuth();
  const i18n = usePageLanguage();
  const words = RESULT_SYNC_COPY[i18n.language] || RESULT_SYNC_COPY.fr;
  const owner = user?.is_admin && user?.id ? String(user.id) : "";
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const onUpdatedRef = useRef(onUpdated); onUpdatedRef.current = onUpdated;
  const mounted = useRef(false), postController = useRef(null), posting = useRef(false);
  const [report, setReport] = useState({ owner: "", data: null, error: null, loading: false });
  const [notice, setNotice] = useState(null), [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0), [monitor, setMonitor] = useState(0);
  const lastRun = useRef(null), monitorDeadline = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; postController.current?.abort(); };
  }, []);
  useEffect(() => {
    postController.current?.abort(); posting.current = false;
    setBusy(false); setNotice(null); setMonitor(0); lastRun.current = null;
  }, [owner]);
  useEffect(() => {
    if (!owner) return undefined;
    let active = true, inFlight = false;
    const controller = new AbortController();
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setReport(previous => ({ owner, data: previous.owner === owner ? previous.data : null, error: null, loading: true }));
      try {
        const { data } = await api.get("/admin/results-sync/status", { signal: controller.signal, timeout: 15000 });
        if (!data || !data.last_run || typeof data.last_run !== "object") throw new Error("Invalid result report");
        if (!active || controller.signal.aborted) return;
        setReport({ owner, data, error: null, loading: false });
        const stamp = data.last_run.last_run_at || null;
        if (stamp && lastRun.current !== stamp) onUpdatedRef.current?.();
        lastRun.current = stamp;
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setReport(previous => ({ owner, data: previous.owner === owner ? previous.data : null, error: resultSyncErrorKind(error), loading: false }));
      } finally { inFlight = false; }
    };
    load();
    const timer = monitor ? setInterval(() => {
      if (Date.now() >= monitorDeadline.current) { setMonitor(0); return; }
      load();
    }, 15000) : null;
    return () => { active = false; controller.abort(); if (timer) clearInterval(timer); };
  }, [owner, retry, monitor]);
  if (!owner) return null;
  const visible = report.owner === owner ? report : { data: null, loading: true, error: null };
  const data = visible.data, batch = data?.last_run;
  const number = value => value == null || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat(i18n.locale || "fr-FR").format(Number(value));
  const date = value => { const parsed = new Date(value); return !value || !Number.isFinite(parsed.getTime()) ? words.never : new Intl.DateTimeFormat(i18n.locale || "fr-FR", { dateStyle: "short", timeStyle: "short" }).format(parsed); };
  const metric = (label, value) => <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4"><p className="break-words text-sm leading-6 text-slate-600">{label}</p><p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{number(value)}</p></div>;
  const start = async () => {
    if (posting.current || ownerRef.current !== owner) return;
    posting.current = true; setBusy(true); setNotice(null);
    const controller = new AbortController(); postController.current = controller;
    try {
      const { data: response } = await api.post("/admin/results-sync", {}, { signal: controller.signal, timeout: 15000 });
      if (typeof response?.queued !== "boolean") throw new Error("Unconfirmed request");
      if (!mounted.current || ownerRef.current !== owner) return;
      setNotice(response.queued ? "queued" : "already");
      monitorDeadline.current = Date.now() + 300000;
      setMonitor(value => value + 1); setRetry(value => value + 1);
    } catch (error) {
      if (mounted.current && ownerRef.current === owner && !controller.signal.aborted) {
        const kind = resultSyncErrorKind(error);
        setNotice(kind === "error" ? "unknownRequest" : kind);
      }
    } finally {
      if (mounted.current && ownerRef.current === owner) { posting.current = false; setBusy(false); }
    }
  };
  return <section dir={i18n.direction} className="min-w-0 rounded-2xl border border-orange-200 bg-orange-50/40 p-4 sm:p-6" data-testid="results-sync-panel">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1"><h3 className="text-xl font-extrabold text-slate-900">{words.title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{words.intro}</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <button type="button" data-testid="results-sync-refresh" onClick={() => { setRetry(value => value + 1); onUpdatedRef.current?.(); }} disabled={visible.loading} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 disabled:opacity-50 sm:flex-none"><RefreshCw className={`h-4 w-4 shrink-0 ${visible.loading ? "animate-spin" : ""}`} />{words.refresh}</button>
        <button type="button" data-testid="results-sync-start" onClick={start} disabled={busy || data?.running || visible.loading || visible.error === "access" || visible.error === "missingRoute"} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:flex-none">{busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <RefreshCw className="h-4 w-4 shrink-0" />}{busy ? words.requesting : words.start}</button>
      </div>
    </header>
    {notice && <p role="status" className={`mt-4 rounded-xl border p-3 text-sm leading-6 ${notice === "queued" || notice === "already" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{words[notice]}</p>}
    {visible.error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">{words[visible.error]}{data && <span className="mt-1 block">{words.stale}</span>}</p>}
    {!data ? <p className="mt-4 text-sm text-slate-500" role="status">{visible.loading ? words.loading : words.noReport}</p> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="results-sync-totals">{metric(words.overdue, data.pending_over_12h)}{metric(words.matches, data.distinct_matches_over_12h)}{metric(words.old, data.pending_over_3days)}</div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{words.next}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm leading-6 text-slate-600"><p><strong>{words.last} :</strong> {date(batch?.last_run_at)}</p><p className={data.running ? "font-semibold text-orange-800" : "text-slate-500"}>{data.running ? words.running : words.idle}</p><p>{words.batch} : {number(data.batch_limit)}</p></div>
      {batch?.status && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{words[batch.status] || batch.status}</p>}
      {batch?.last_run_at ? <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="results-sync-last-batch">{[["checked", "checked"], ["updated", "updated"], ["noScore", "no_score"], ["outside", "outside_provider_window"], ["notCompleted", "not_completed"], ["unsupported", "unsupported_market"], ["errors", "errors"]].map(([label, key]) => metric(words[label], batch[key]))}</div> : <p className="mt-4 text-sm text-slate-500">{words.noReport}</p>}
      {Object.keys(data.providers || {}).length > 0 && <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4"><summary className="min-h-8 cursor-pointer text-sm font-bold text-slate-800">{words.providers}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(data.providers).map(([key, provider]) => <article key={key} className="min-w-0 rounded-xl bg-slate-50 p-3 text-sm leading-6"><p className="break-all font-semibold text-slate-900">{words.provider} : {key}</p><p>{words.state} : {words[provider.status] || provider.status || "—"}</p>{provider.http_status != null && <p>{words.http} : {provider.http_status}</p>}{provider.retry_at && <p>{words.retryDate} : {date(provider.retry_at)}</p>}</article>)}</div><p className="mt-3 text-xs leading-6 text-slate-500">{words.quotaHelp}</p></details>}
    </>}
    {!!monitor && <p role="status" className="mt-4 text-xs leading-6 text-slate-500">{words.polling}</p>}
    <p className="mt-4 border-t border-orange-200 pt-3 text-sm leading-6 text-slate-600">{words.honest}</p>
  </section>;
}


const VISUAL_ASSETS_COPY={
 fr:["Logos et portraits","Actualiser le bilan","Synchroniser les images","La recherche est lancée en arrière-plan. Actualise le bilan dans quelques instants.","Une synchronisation est déjà en cours.","Impossible de charger les images. Réessaie.","Sport","Disponibles","À rechercher","Aucune rencontre dans la fenêtre de synchronisation.","Images manquantes ou ambiguës","La couverture dépend des sources. Aucune image incertaine n’est attribuée à un joueur.","football","basket","tennis","hockey","baseball","football américain","Synchronisation automatique désactivée : vérifie la configuration du serveur.","Dernier passage"],
 en:["Logos and portraits","Refresh report","Sync images","Search started in the background. Refresh the report shortly.","A sync is already running.","Images could not be loaded. Try again.","Sport","Available","To find","No matches in the sync window.","Missing or ambiguous images","Coverage depends on providers. Uncertain images are never assigned to a player.","football","basketball","tennis","hockey","baseball","American football","Automatic sync is disabled: check server configuration.","Last run"],
 es:["Logotipos y retratos","Actualizar informe","Sincronizar imágenes","Búsqueda iniciada en segundo plano. Actualiza el informe en unos instantes.","Ya hay una sincronización en curso.","No se pudieron cargar las imágenes. Reintenta.","Deporte","Disponibles","Por buscar","No hay partidos en la ventana de sincronización.","Imágenes ausentes o ambiguas","La cobertura depende de los proveedores. No se asignan imágenes dudosas a un jugador.","fútbol","baloncesto","tenis","hockey","béisbol","fútbol americano","Sincronización automática desactivada: revisa la configuración.","Última ejecución"],
 pt:["Logos e retratos","Atualizar relatório","Sincronizar imagens","Pesquisa iniciada em segundo plano. Atualize o relatório em instantes.","Já existe uma sincronização em curso.","Não foi possível carregar as imagens. Tente novamente.","Desporto","Disponíveis","Por pesquisar","Sem jogos na janela de sincronização.","Imagens ausentes ou ambíguas","A cobertura depende dos fornecedores. Não são atribuídas imagens duvidosas a um jogador.","futebol","basquetebol","ténis","hóquei","basebol","futebol americano","Sincronização automática desativada: verifique a configuração.","Última execução"],
 de:["Logos und Porträts","Bericht aktualisieren","Bilder synchronisieren","Suche im Hintergrund gestartet. Aktualisiere den Bericht in Kürze.","Eine Synchronisierung läuft bereits.","Bilder konnten nicht geladen werden. Erneut versuchen.","Sport","Verfügbar","Zu suchen","Keine Spiele im Synchronisierungsfenster.","Fehlende oder mehrdeutige Bilder","Die Abdeckung hängt von den Anbietern ab. Unsichere Bilder werden keinem Spieler zugeordnet.","Fußball","Basketball","Tennis","Eishockey","Baseball","American Football","Automatische Synchronisierung deaktiviert: Serverkonfiguration prüfen.","Letzter Lauf"],
 ar:["الشعارات والصور","تحديث التقرير","مزامنة الصور","بدأ البحث في الخلفية. حدّث التقرير بعد قليل.","المزامنة قيد التنفيذ بالفعل.","تعذر تحميل الصور. حاول مجدداً.","الرياضة","متاحة","قيد البحث","لا توجد مباريات ضمن نافذة المزامنة.","صور مفقودة أو غير مؤكدة","تعتمد التغطية على المصادر. لا تنسب صورة غير مؤكدة إلى لاعب.","كرة القدم","كرة السلة","التنس","الهوكي","البيسبول","كرة القدم الأمريكية","المزامنة التلقائية معطلة: تحقق من إعدادات الخادم.","آخر تشغيل"]
};
function VisualAssetsPanel(){
 const i18n=usePageLanguage();const w=VISUAL_ASSETS_COPY[i18n.language]||VISUAL_ASSETS_COPY.fr;
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const requestRef=useRef(null);
 const sports={football:w[12],basketball:w[13],tennis:w[14],hockey:w[15],baseball:w[16],american_football:w[17]};
 const load=useCallback(async()=>{
   requestRef.current?.abort();const request=new AbortController();requestRef.current=request;
   setBusy(true);setMessage("");
   try{const r=await api.get('/admin/media/status',{signal:request.signal,timeout:15000});if(!request.signal.aborted)setData(r.data);}
   catch{if(!request.signal.aborted)setMessage(w[5]);}
   finally{if(!request.signal.aborted)setBusy(false);}
 },[w]);
 useEffect(()=>{load();return()=>requestRef.current?.abort();},[load]);
 const sync=async()=>{
   if(busy)return;
   const request=new AbortController();requestRef.current=request;
   setBusy(true);setMessage("");
   try{const r=await api.post('/admin/media/refresh',null,{signal:request.signal,timeout:15000});
     if(!request.signal.aborted)setMessage(r.data?.queued?w[3]:r.data?.status==='already_running'?w[4]:r.data?.status==='disabled'?w[18]:w[5]);}
   catch{if(!request.signal.aborted)setMessage(w[5]);}
   finally{if(!request.signal.aborted)setBusy(false);}
 };
 return <Card className="mb-6 min-w-0 rounded-2xl border-orange-200 p-4 sm:p-6" data-testid="visual-assets-admin">
  <h2 className="text-lg font-extrabold text-slate-900">{w[0]}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{w[11]}</p>
  <div className="mt-4 flex flex-wrap gap-3"><Button onClick={load} disabled={busy} variant="outline" className="min-h-11"><RefreshCw className={cn("me-2 h-4 w-4",busy&&"animate-spin")}/>{w[1]}</Button><Button onClick={sync} disabled={busy||data?.running} className="min-h-11 bg-orange-600 text-white hover:bg-orange-700">{w[2]}</Button></div>
  {message&&<p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
  {data&&(!data.enabled||!data.scheduler_enabled)&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{w[18]}</p>}
  {data&&<div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(data.sports||{}).map(([sport,row])=><div key={sport} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-bold text-slate-900">{sports[sport]||sport}</h3><p className="mt-2 text-sm text-emerald-700">{w[7]} : <b>{row.available} / {row.total}</b></p><p className="mt-1 text-sm text-slate-500">{w[8]} : <b>{row.missing}</b></p></div>)}</div>}
  {data&&Object.keys(data.sports||{}).length===0&&<p className="mt-4 text-sm text-slate-500">{w[9]}</p>}
  {data?.last_run?.checked_at&&<p className="mt-3 text-xs text-slate-500">{w[19]} : {new Intl.DateTimeFormat(i18n.locale,{dateStyle:'short',timeStyle:'short'}).format(new Date(data.last_run.checked_at))}</p>}
  {data?.missing_sample?.length>0&&<details className="mt-4 rounded-xl border border-slate-200 p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold text-slate-700">{w[10]}</summary><ul className="mt-3 space-y-2 text-sm text-slate-500">{data.missing_sample.map(row=><li key={row.key} className="break-words"><bdi>{row.name}</bdi> · {sports[row.sport]||row.sport}</li>)}</ul></details>}
 </Card>;
}


function RankingEvaluationPanel() {
  const [report, setReport] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const request = path => api.get(path, { signal: controller.signal, timeout: 14000 }).then(r => r.data);
    Promise.allSettled([
      request("/admin/prediction-comparison/ranking?days=30"),
      request("/admin/prediction-comparison/status?days=30"),
    ]).then(([current, legacy]) => {
      if (controller.signal.aborted) return;
      setReport(current.status === "fulfilled" ? current.value : null);
      setPrevious(legacy.status === "fulfilled" ? legacy.value : null);
      setLoading(false);
    });
    return () => controller.abort();
  }, [revision]);
  const number = value => value == null ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  const percent = value => value == null ? "—" : `${number(value)} %`;
  const cells = data => [number(data?.bets), percent(data?.win_rate), percent(data?.roi), number(data?.net_per_100_events)];
  const rows = report ? [
    ["Pronostic publié", report.arms.baseline],
    ["Classement sélectif", report.arms.challenger],
    ["Publié · mêmes matchs joués", report.same_event_arms.baseline],
    ["Sélectif · mêmes matchs joués", report.same_event_arms.challenger],
  ] : [];
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7" data-testid="ranking-evaluation">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-bold text-slate-900">Le classement sélectif à l’essai</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Football · 30 derniers jours. Les deux choix sont enregistrés avant le coup d’envoi. Le site continue à publier ses pronostics habituels pendant la comparaison.</p></div>
      <Button variant="outline" disabled={loading} onClick={() => setRevision(n => n+1)}>Actualiser</Button>
    </div>
    {loading ? <p role="status" className="mt-5 text-sm text-slate-600">Chargement de la comparaison…</p>
      : !report ? <p role="alert" className="mt-5 text-sm text-slate-600">Le rapport est temporairement indisponible.</p>
      : <>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[["Matchs suivis", report.observed], ["Résultats confirmés", report.resolved], ["Matchs écartés par le test", report.passed]].map(([label, value]) =>
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm text-slate-600">{label}</p><strong className="mt-1 block text-2xl text-slate-900">{number(value)}</strong></div>)}
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">Couverture sur les résultats confirmés : <strong>{percent(report.coverage)}</strong> · {number(report.different_choices)} choix différents. {report.paired < report.min_review_pairs ? `Premier examen après ${report.min_review_pairs} matchs comparables ; l’échantillon est encore insuffisant.` : "Échantillon disponible pour examen ; aucun changement automatique."}</p>
        {report.truncated && <p className="mt-3 text-sm text-amber-800">Le rapport est limité aux 10 000 observations les plus récentes.</p>}
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[39rem] w-full text-left text-sm">
            <thead className="text-slate-500"><tr>{["Comparaison", "Sélections", "Réussite", "Rendement", "Unités nettes / 100 matchs"].map(label => <th key={label} scope="col" className="border-b p-3">{label}</th>)}</tr></thead>
            <tbody>{rows.map(([label, data]) => <tr key={label}><th scope="row" className="border-b p-3 text-slate-900">{label}</th>{cells(data).map((value, i) => <td key={i} className="border-b p-3 tabular-nums">{value}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-6 text-slate-500">Rendement simulé à une unité par sélection aux cotes enregistrées. Les remboursements ne comptent pas comme des victoires. Le résultat par 100 matchs inclut les matchs écartés, avec un résultat net de zéro pour ces matchs.</p>
      </>}
    {!loading && previous && <div className="mt-6 border-t pt-5 text-sm leading-6 text-slate-600">
      <h3 className="font-bold text-slate-900">Autre test : modèle de scores indépendant</h3>
      <p>{number(previous.resolved_pairs)} matchs évalués · rendement simulé du modèle de référence : {percent(previous.arms?.baseline?.roi_percent)} · modèle de scores : {percent(previous.arms?.challenger?.roi_percent)}.</p>
    </div>}
  </section>;
}

function JourneyReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.get("/admin/journey/summary", { signal: controller.signal, timeout: 14000 })
      .then(({ data }) => { if (!controller.signal.aborted) setReport(data); })
      .catch(() => { if (!controller.signal.aborted) setReport(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const titles = { direct: "Direct / non renseigné", telegram: "Telegram", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", campaign: "Autre campagne" };
  const cols = [["visits", "Visites"], ["free_pick", "Aperçu vu"], ["telegram", "Clic Telegram"], ["pro", "Offre Pro"], ["checkout", "Paiement demandé"], ["paid", "Paiement confirmé"]];
  const format = value => new Intl.NumberFormat("fr-FR").format(value || 0);
  const rows = report ? [["Total", report.totals], ...Object.entries(report.sources || {}).map(([key, values]) => [titles[key] || key, values])] : [];
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7" data-testid="journey-report">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-bold text-slate-900">De la première visite à Pro</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">30 jours · visites ayant accepté la mesure. Un clic Telegram n’indique pas que le visiteur a rejoint le canal.</p></div>
      <Button variant="outline" disabled={loading} onClick={() => setRefresh(v => v + 1)}>Actualiser</Button>
    </div>
    {loading ? <p role="status" className="mt-5 text-sm text-slate-600">Chargement…</p> : !report ? <p role="alert" className="mt-5 text-sm">Mesures indisponibles pour le moment.</p>
      : <>
        {!report.totals?.visits && <p className="mt-5 text-sm text-slate-600">Aucune visite mesurée sur cette période.</p>}
        <div className="mt-5 overflow-x-auto"><table className="min-w-[42rem] w-full text-left text-sm">
          <thead><tr><th scope="col" className="border-b p-3">Origine</th>{cols.map(([key, label]) => <th key={key} scope="col" className="border-b p-3">{label}</th>)}</tr></thead>
          <tbody>{rows.map(([label, values]) => <tr key={label}><th scope="row" className="border-b p-3">{label}</th>{cols.map(([key]) => <td key={key} className="border-b p-3 tabular-nums">{format(values?.[key])}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="mt-4 text-xs leading-6 text-slate-600">Les étapes sont comptées une fois par visite. Les colonnes ne sont pas des étapes obligatoires. Les paiements de test et les paiements annulés ne comptent pas comme confirmés.</p>
        <p className="mt-2 break-all text-sm text-slate-600">Lien à partager dans le canal : <code>https://wnpulse.com/?via=telegram</code></p>
        {report.truncated && <p className="mt-2 text-sm text-amber-800">Le rapport a atteint sa limite de données.</p>}
      </>}
  </section>;
}
