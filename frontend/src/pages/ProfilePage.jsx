import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Crown, CreditCard, BarChart3, Target, Mail, CheckCircle2, XCircle, RotateCcw, RefreshCw, Info, UserRound, ShieldCheck, ArrowUpRight, Phone, CalendarDays, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
const PRO_PRICE_XOF = 10500;
function PRO_PRICE_LABEL(i18n) {
  return i18n.t("{{v0}} FCFA", {
    v0: PRO_PRICE_XOF.toLocaleString(i18n.locale)
  });
}
const REQUEST_TIMEOUT_MS = 12000;
function dateValue(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}
function formatDate(i18n, value) {
  const time = dateValue(value);
  return time === null ? "Non renseignée" : new Intl.DateTimeFormat(i18n.locale, {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(time));
}
function getAccountAccess(user, status, now = Date.now()) {
  const source = status || user || {};
  const rawTier = String(source.subscription_tier || source.subscription || "free").trim().toLowerCase() || "free";
  const expiry = source.subscription_expires_at || null;
  const expiryTime = dateValue(expiry);
  const expired = rawTier !== "free" && expiryTime !== null && expiryTime <= now;
  const isAdmin = source.is_admin === true;
  const kind = isAdmin ? "admin" : rawTier !== "free" && !expired ? "pro" : "free";
  return {
    kind,
    rawTier,
    expiry,
    expired,
    legacyElite: rawTier === "elite" && kind === "pro",
    label: kind === "admin" ? "Administrateur" : kind === "pro" ? "WinPulse Pro" : "Gratuit",
    daysLeft: kind === "pro" && expiryTime !== null ? Math.max(0, Math.ceil((expiryTime - now) / 86400000)) : null
  };
}
function readTrackStats(data) {
  const stats = data?.stats;
  if (!stats || typeof stats !== "object") throw new Error("Statistiques absentes");
  const counts = [stats.wins, stats.losses, stats.voids];
  if (!counts.every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("Statistiques invalides");
  }
  const [wins, losses, voids] = counts;
  const graded = wins + losses;
  return {
    wins,
    losses,
    voids,
    graded,
    resolved: graded + voids,
    winRate: graded > 0 ? Math.round(wins / graded * 1000) / 10 : null
  };
}
function errorText(error, fallback) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
}
function initialsFor(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase() : "WP";
}
export default function ProfilePage() {
  const i18n = usePageLanguage();
  const {
    user,
    refresh
  } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("subscription");
  const [subscriptionState, setSubscriptionState] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [subscriptionRevision, setSubscriptionRevision] = useState(0);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [statsRevision, setStatsRevision] = useState(0);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [optingOut, setOptingOut] = useState(false);
  const [whatsappOptedOutFor, setWhatsappOptedOutFor] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const serverStatus = subscriptionState?.userId === user?.id ? subscriptionState.data : null;
  const access = getAccountAccess(user, serverStatus, clock);
  const name = user?.full_name?.trim() || user?.name?.trim() || "Mon profil";
  const whatsappEnabled = Boolean(user?.whatsapp_number && user?.whatsapp_marketing_opt_in === true && whatsappOptedOutFor !== user?.id);
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!user?.id) {
      setSubscriptionState(null);
      setSubscriptionLoading(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setSubscriptionLoading(true);
    setSubscriptionError("");
    api.get("/subscription/status", {
      signal: controller.signal,
      timeout: REQUEST_TIMEOUT_MS
    }).then(({
      data
    }) => {
      if (!active) return;
      if (!data || typeof data !== "object" || typeof data.subscription !== "string") {
        throw new Error("Abonnement invalide");
      }
      setSubscriptionState({
        userId: user.id,
        data
      });
      setClock(Date.now());
    }).catch(error => {
      if (active && !controller.signal.aborted) {
        setSubscriptionState(null);
        setSubscriptionError(errorText(error, "Impossible de vérifier votre abonnement. Les informations affichées viennent de votre dernière connexion."));
      }
    }).finally(() => {
      if (active) setSubscriptionLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [user?.id, subscriptionRevision]);
  useEffect(() => {
    if (tab !== "results") return;
    let active = true;
    const controller = new AbortController();
    setStatsLoading(true);
    setStatsError("");
    api.get("/track-record", {
      params: {
        page: 1,
        per_page: 1,
        sport: "all",
        label: "all"
      },
      signal: controller.signal,
      timeout: REQUEST_TIMEOUT_MS
    }).then(({
      data
    }) => {
      if (active) setStats(readTrackStats(data));
    }).catch(error => {
      if (active && !controller.signal.aborted) {
        setStats(null);
        setStatsError(errorText(error, "Impossible de charger les résultats WinPulse. Réessayez dans un instant."));
      }
    }).finally(() => {
      if (active) setStatsLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [tab, statsRevision]);
  const refreshProfile = async () => {
    if (refreshingProfile) return;
    setRefreshingProfile(true);
    try {
      await refresh();
      setSubscriptionRevision(value => value + 1);
      toast.success(i18n.t("Votre profil a été actualisé."));
    } catch (error) {
      toast.error(errorText(error, "Impossible d’actualiser votre profil."));
    } finally {
      setRefreshingProfile(false);
    }
  };
  const optOutWhatsapp = async () => {
    if (optingOut || !whatsappEnabled) return;
    setOptingOut(true);
    try {
      await api.post("/auth/whatsapp-opt-out", {}, {
        timeout: REQUEST_TIMEOUT_MS
      });
      setWhatsappOptedOutFor(user.id);
      toast.success(i18n.t("Votre consentement aux messages WhatsApp a été retiré."));
      // Le retrait est déjà enregistré ; un échec de relecture ne l'annule pas.
      try {
        await refresh();
      } catch {/* Le prochain chargement relira le choix enregistré. */}
    } catch (error) {
      toast.error(errorText(error, "Impossible de modifier votre choix WhatsApp."));
    } finally {
      setOptingOut(false);
    }
  };
  return <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:px-8">
        <Card className="relative mb-6 overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950 p-5 text-white sm:p-8" data-testid="profile-header">
          <div className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="wp-gradient-warm grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-black ring-4 ring-white/10 sm:h-20 sm:w-20" aria-hidden="true">
                {i18n.tx(initialsFor(name))}
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">{i18n.t("Mon espace WinPulse")}</div>
                <h1 className="font-heading break-words text-2xl font-black tracking-tight sm:text-3xl">{i18n.tx(name)}</h1>
                <p className="mt-1 flex items-start gap-1.5 break-all text-sm text-slate-300">
                  <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />{i18n.tx(user?.email || "Email non renseigné")}
                </p>
                <Badge className="mt-3 border-white/10 bg-white/10 text-xs text-white">
                  {i18n.tx(access.kind === "admin" ? <ShieldCheck className="me-1 h-3.5 w-3.5" /> : access.kind === "pro" ? <Crown className="me-1 h-3.5 w-3.5" /> : null)}
                  {i18n.tx(access.label)}
                </Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refreshProfile} disabled={refreshingProfile} className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" data-testid="refresh-profile">
              <RefreshCw className={`me-2 h-3.5 w-3.5 ${refreshingProfile ? "animate-spin" : ""}`} />
              {i18n.tx(refreshingProfile ? "Actualisation…" : "Actualiser")}
            </Button>
          </div>
        </Card>

        <Tabs value={tab} onValueChange={setTab} className="space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            <TabsTrigger value="subscription" className="gap-1.5 px-2 py-2.5 text-xs sm:text-sm" data-testid="tab-subscription"><CreditCard className="h-4 w-4 shrink-0" />{i18n.t("Abonnement")}</TabsTrigger>
            <TabsTrigger value="results" className="gap-1.5 px-2 py-2.5 text-xs sm:text-sm" data-testid="tab-stats"><BarChart3 className="h-4 w-4 shrink-0" /><span className="sm:hidden">{i18n.t("R\xE9sultats")}</span><span className="hidden sm:inline">{i18n.t("R\xE9sultats WinPulse")}</span></TabsTrigger>
            <TabsTrigger value="account" className="gap-1.5 px-2 py-2.5 text-xs sm:text-sm" data-testid="tab-account"><UserRound className="h-4 w-4 shrink-0" />{i18n.t("Mon compte")}</TabsTrigger>
          </TabsList>

          <TabsContent value="subscription" className="space-y-4">
            <Card className="border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{i18n.t("Votre acc\xE8s actuel")}</p>
                  <h2 className="font-heading text-2xl font-extrabold text-slate-900">{i18n.tx(access.label)}</h2>
                  {i18n.tx(subscriptionLoading && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />{i18n.t("V\xE9rification de votre abonnement\u2026")}</p>)}
                  {i18n.tx(access.kind === "admin" && <p className="mt-2 text-sm text-slate-600">{i18n.t("Les fonctionnalit\xE9s Pro sont accessibles avec vos droits administrateur.")}</p>)}
                  {i18n.tx(access.kind === "pro" && <p className="mt-2 text-sm text-slate-600">{i18n.tx(access.expiry ? <>Accès valable jusqu’au <strong>{i18n.tx(formatDate(i18n, access.expiry))}</strong>.</> : "Date d’expiration non renseignée.")}</p>)}
                  {i18n.tx(access.daysLeft !== null && <Badge className="mt-2 border-orange-200 bg-orange-50 text-orange-700">{i18n.rich("{{v0}} jour{{v1}} restant{{v2}}", {
                    v0: i18n.tx(access.daysLeft),
                    v1: i18n.tx(access.daysLeft > 1 ? "s" : ""),
                    v2: i18n.tx(access.daysLeft > 1 ? "s" : "")
                  })}</Badge>)}
                  {i18n.tx(access.expired && <p className="mt-2 text-sm text-amber-700">{i18n.t("Votre ancien acc\xE8s payant est arriv\xE9 \xE0 expiration.")}</p>)}
                  {i18n.tx(access.legacyElite && <p className="mt-2 text-xs text-slate-500">{i18n.t("Votre ancien acc\xE8s Elite reste reconnu. L\u2019offre actuellement propos\xE9e est WinPulse Pro.")}</p>)}
                  {i18n.tx(access.kind === "free" && !access.expired && <p className="mt-2 text-sm text-slate-600">{i18n.t("D\xE9couvrez les pronostics gratuits disponibles et les r\xE9sultats publics.")}</p>)}
                </div>
                <Button onClick={() => navigate("/app/abonnement")} className="wp-gradient-warm border-0 text-white" data-testid="upgrade-from-profile">
                  {i18n.tx(access.kind === "free" ? "Passer Pro" : access.kind === "admin" ? "Voir l’offre Pro" : "Gérer mon abonnement")}<ArrowUpRight className="ms-2 h-4 w-4" />
                </Button>
              </div>
              {i18n.tx(subscriptionError && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
                <p>{i18n.tx(subscriptionError)}</p>
                <Button variant="ghost" size="sm" className="mt-1 px-0 text-amber-900" onClick={() => setSubscriptionRevision(value => value + 1)}>{i18n.t("R\xE9essayer")}</Button>
              </div>)}
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <PlanCard title={i18n.t("Gratuit")} price={i18n.t("0 FCFA")} current={access.kind === "free"} features={["Pronostics gratuits selon les disponibilités", "Track Record public complet", "Compte personnel WinPulse"]} />
              <PlanCard title={i18n.t("WinPulse Pro")} price={i18n.tx(i18n.t("{{v0}} / mois", {
              v0: PRO_PRICE_LABEL(i18n)
            }))} current={access.kind === "pro"} premium features={["Tous les pronostics et combinés", "Analyses IA complètes", "Combo Builder et value bets", "Montante WinPulse"]} />
            </div>
            <p className="px-1 text-xs text-slate-500">{i18n.t("Consultez l\u2019offre compl\xE8te et les modalit\xE9s de paiement sur la page Abonnement.")}</p>
          </TabsContent>

          <TabsContent value="results" className="space-y-4">
            <Card className="border-blue-200 bg-blue-50 p-4 sm:p-5" data-testid="public-results-explanation">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div>
                  <h2 className="font-heading font-bold text-blue-950">{i18n.t("Les r\xE9sultats publics de WinPulse")}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-blue-900">{i18n.t("Ces chiffres concernent les pronostics de la plateforme, pas les paris de votre compte. Ils sont visibles en Gratuit comme en Pro pour vous permettre de consulter notre historique.")}</p>
                </div>
              </div>
            </Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900">{i18n.t("Bilan des r\xE9sultats confirm\xE9s")}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{i18n.t("Cumul du Track Record, tous sports et tous niveaux.")}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStatsRevision(value => value + 1)} disabled={statsLoading} data-testid="refresh-profile-results"><RefreshCw className={`me-2 h-3.5 w-3.5 ${statsLoading ? "animate-spin" : ""}`} />{i18n.t("Actualiser")}</Button>
            </div>

            {i18n.tx(statsLoading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{i18n.tx([1, 2, 3, 4].map(item => <Skeleton key={item} className="h-28 rounded-xl" />))}</div> : statsError ? <Card className="border-amber-200 bg-amber-50 p-5" role="alert"><p className="text-sm text-amber-800">{i18n.tx(statsError)}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setStatsRevision(value => value + 1)}>{i18n.t("R\xE9essayer")}</Button></Card> : stats ? <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label={i18n.t("Résultats confirmés")} value={stats.resolved} icon={Target} />
                  <StatCard label={i18n.t("Gagnés")} value={stats.wins} icon={CheckCircle2} color="emerald" />
                  <StatCard label={i18n.t("Perdus")} value={stats.losses} icon={XCircle} color="rose" />
                  <StatCard label={i18n.t("Remboursés")} value={stats.voids} icon={RotateCcw} />
                </div>
                {i18n.tx(stats.resolved === 0 ? <Card className="border-dashed border-slate-200 bg-white p-6 text-center"><Target className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h3 className="font-heading font-bold text-slate-900">{i18n.t("Aucun r\xE9sultat confirm\xE9 pour le moment")}</h3><p className="mt-2 text-sm text-slate-600">{i18n.t("Le bilan se mettra \xE0 jour lorsque les pronostics seront r\xE9solus.")}</p></Card> : <Card className="border-slate-200 bg-white p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><h3 className="font-heading font-bold text-slate-900">{i18n.t("Taux de r\xE9ussite WinPulse")}</h3><p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-500">{i18n.t("Gagn\xE9s \xF7 (gagn\xE9s + perdus). Les remboursements et les pronostics en attente ne sont pas inclus.")}</p></div>
                      <div className="font-heading text-3xl font-black text-slate-900">{i18n.tx(stats.winRate === null ? "—" : `${stats.winRate.toLocaleString(i18n.locale)} %`)}</div>
                    </div>
                    <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={i18n.tx(i18n.t("{{v0}} gagn\xE9s, {{v1}} perdus, {{v2}} rembours\xE9s", {
                v0: stats.wins,
                v1: stats.losses,
                v2: stats.voids
              }))}>
                      <div className="bg-emerald-500" style={{
                  width: `${stats.wins / stats.resolved * 100}%`
                }} />
                      <div className="bg-rose-500" style={{
                  width: `${stats.losses / stats.resolved * 100}%`
                }} />
                      <div className="bg-slate-400" style={{
                  width: `${stats.voids / stats.resolved * 100}%`
                }} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600"><Legend color="bg-emerald-500" text={i18n.tx(i18n.t("{{v0}} gagn\xE9s", {
                  v0: stats.wins
                }))} /><Legend color="bg-rose-500" text={i18n.tx(i18n.t("{{v0}} perdus", {
                  v0: stats.losses
                }))} /><Legend color="bg-slate-400" text={i18n.tx(i18n.t("{{v0}} rembours\xE9s", {
                  v0: stats.voids
                }))} /></div>
                  </Card>)}
              </> : null)}
            <Card className="border-slate-200 bg-white p-5">
              <h3 className="font-heading font-bold text-slate-900">{i18n.t("Et mes statistiques personnelles ?")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{i18n.t("Elles n\xE9cessitent un historique des paris que vous avez r\xE9ellement suivis. Aucun suivi personnel n\u2019est reli\xE9 \xE0 cette page actuellement : elle n\u2019affiche donc pas de taux de r\xE9ussite, de ROI ou de gains attribu\xE9s \xE0 votre compte.")}</p>
              <Link to="/resultats" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline">{i18n.t("Consulter le Track Record complet")}<ArrowUpRight className="h-4 w-4" /></Link>
            </Card>
          </TabsContent>

          <TabsContent value="account" className="space-y-4">
            <Card className="border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="font-heading mb-5 text-lg font-bold text-slate-900">{i18n.t("Mes informations")}</h2>
              <dl className="space-y-4">
                <InfoRow icon={UserRound} label={i18n.t("Nom")} value={user?.full_name?.trim() || user?.name?.trim() || "Non renseigné"} />
                <InfoRow icon={Mail} label={i18n.t("Email")} value={user?.email || "Non renseigné"} />
                <InfoRow icon={Phone} label={i18n.t("WhatsApp")} value={user?.whatsapp_number || "Non renseigné"} />
                {i18n.tx(dateValue(user?.created_at) !== null && <InfoRow icon={CalendarDays} label={i18n.t("Membre depuis")} value={formatDate(i18n, user.created_at)} />)}
              </dl>
              <p className="mt-5 text-xs text-slate-500">{i18n.t("Ces informations correspondent aux donn\xE9es enregistr\xE9es sur votre compte.")}</p>
            </Card>
            <Card className="border-slate-200 bg-white p-5 sm:p-6" data-testid="whatsapp-preferences">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-heading font-bold text-slate-900">{i18n.t("Messages WhatsApp")}</h3><p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">{i18n.tx(whatsappEnabled ? "Vous avez autorisé WinPulse à vous contacter sur votre numéro WhatsApp. Vous pouvez retirer ce consentement à tout moment." : "Vous n’avez pas de consentement actif pour les messages WhatsApp de WinPulse.")}</p></div>
                <Badge className={whatsappEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}>{i18n.tx(whatsappEnabled ? "Autorisé" : "Non autorisé")}</Badge>
              </div>
              {i18n.tx(whatsappEnabled && <Button variant="outline" size="sm" className="mt-4" onClick={optOutWhatsapp} disabled={optingOut} data-testid="whatsapp-opt-out">{i18n.rich("{{v0}}Retirer mon consentement", {
                v0: i18n.tx(optingOut && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />)
              })}</Button>)}
            </Card>
            <div className="flex flex-wrap gap-3">
              <Link to="/app" className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline">{i18n.t("Voir les pronostics")}<ArrowUpRight className="h-4 w-4" /></Link>
              <Link to="/resultats" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:underline">{i18n.t("Voir les r\xE9sultats publics")}<ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>;
}
function PlanCard({
  title,
  price,
  current,
  premium = false,
  features
}) {
  const i18n = usePageLanguage();
  return <Card className={`p-5 ${premium ? "border-orange-200 bg-gradient-to-br from-orange-50 to-rose-50" : "border-slate-200 bg-white"}`}>
    <div className="flex items-center justify-between gap-2"><h3 className="font-heading font-bold text-slate-900">{i18n.tx(title)}</h3>{i18n.tx(current && <Badge className="border-orange-200 bg-orange-100 text-orange-700">{i18n.t("Actuel")}</Badge>)}</div>
    <p className="mt-2 font-mono text-lg font-bold text-slate-900">{i18n.tx(price)}</p>
    <ul className="mt-4 space-y-2">{i18n.tx(features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{i18n.tx(feature)}</li>))}</ul>
  </Card>;
}
function StatCard({
  label,
  value,
  icon: Icon,
  color = "slate"
}) {
  const i18n = usePageLanguage();
  const colors = {
    emerald: "text-emerald-600 bg-emerald-50",
    rose: "text-rose-600 bg-rose-50",
    slate: "text-slate-600 bg-slate-100"
  };
  return <Card className="border-slate-200 bg-white p-4"><div className={`mb-3 inline-flex rounded-lg p-2 ${colors[color] || colors.slate}`}><Icon className="h-4 w-4" /></div><div className="font-heading text-2xl font-black text-slate-900">{i18n.tx(value.toLocaleString(i18n.locale))}</div><p className="mt-1 text-xs text-slate-500">{i18n.tx(label)}</p></Card>;
}
function Legend({
  color,
  text
}) {
  const i18n = usePageLanguage();
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{i18n.tx(text)}</span>;
}
function InfoRow({
  icon: Icon,
  label,
  value
}) {
  const i18n = usePageLanguage();
  return <div className="flex flex-col gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><dt className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4" />{i18n.tx(label)}</dt><dd className="break-words text-sm font-semibold text-slate-900 sm:max-w-[65%] sm:text-end">{i18n.tx(value)}</dd></div>;
}
