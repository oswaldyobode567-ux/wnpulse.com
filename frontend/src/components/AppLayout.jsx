import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, Fragment, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Trophy, Layers, History, CreditCard, LogOut, Zap, Crown, ShieldCheck, Target, TrendingUp, User, Gift, Sparkles, Radio, Menu, X, Bell, BellPlus, Check, CheckCheck, Loader2, CheckCircle2, XCircle, MinusCircle, Search, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// Six langues, sans service de traduction externe ni dépendance supplémentaire.
// Les pages suivantes peuvent importer useLanguage depuis ce fichier AppLayout.
export const SUPPORTED_LANGUAGES = [{
  code: "fr",
  name: "Français",
  locale: "fr-FR",
  dir: "ltr"
}, {
  code: "en",
  name: "English",
  locale: "en-GB",
  dir: "ltr"
}, {
  code: "es",
  name: "Español",
  locale: "es-ES",
  dir: "ltr"
}, {
  code: "pt",
  name: "Português",
  locale: "pt-PT",
  dir: "ltr"
}, {
  code: "de",
  name: "Deutsch",
  locale: "de-DE",
  dir: "ltr"
}, {
  code: "ar",
  name: "العربية",
  locale: "ar",
  dir: "rtl"
}];
const LANGUAGE_STORAGE_KEY = "wnpulse_language";
const LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map(item => item.code));
// Only the selected catalogue is requested; French source strings remain usable offline.
const localeLoaders = import.meta.glob("../locales/*.json", { import: "default" });
const localCatalogues = new Map();
const PAGE_MESSAGE_SOURCES = Object.create(null);
function loadLocalCatalogue(code) {
  if (!localCatalogues.has(code)) {
    localCatalogues.set(code, localeLoaders[`../locales/${code}.json`]().then(messages => {
      for (const [key, value] of Object.entries(messages)) {
        if (typeof value === "string" && !value.includes("{{") && !(value in PAGE_MESSAGE_SOURCES)) {
          PAGE_MESSAGE_SOURCES[value] = key;
        }
      }
      return messages;
    }).catch(error => { localCatalogues.delete(code); throw error; }));
  }
  return localCatalogues.get(code);
}
function normalizeLanguage(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return LANGUAGE_CODES.has(code) ? code : null;
}
function browserLanguage() {
  if (typeof navigator === "undefined") return "fr";
  const candidates = [...(Array.isArray(navigator.languages) ? navigator.languages : []), navigator.language];
  for (const candidate of candidates) {
    const supported = normalizeLanguage(candidate);
    if (supported) return supported;
  }
  return "fr";
}
function initialLanguage() {
  try {
    const stored = typeof window !== "undefined" ? normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) : null;
    if (stored) return stored;
  } catch {/* Stockage facultatif : navigation privée ou stockage bloqué. */}
  return browserLanguage();
}
function translateText(dictionary, source, values = {}) {
  const safeSource = typeof source === "string" ? source : "";
  const has = (dictionary, key) => Object.prototype.hasOwnProperty.call(dictionary || {}, key);
  const message = has(dictionary, safeSource) ? dictionary[safeSource] : safeSource;
  return message.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => Object.prototype.hasOwnProperty.call(values || {}, key) ? String(values[key] ?? "") : placeholder);
}
const LanguageContext = createContext(null);
export function LanguageProvider({
  children
}) {
  const [language, setCurrentLanguage] = useState(initialLanguage);
  const selected = SUPPORTED_LANGUAGES.find(item => item.code === language) || SUPPORTED_LANGUAGES[0];
  const [localCatalogue, setLocalCatalogue] = useState(null);
  useEffect(() => {
    let active = true;
    loadLocalCatalogue(language).then(messages => {
      if (active) setLocalCatalogue({ language, messages });
    }).catch(() => {});
    return () => { active = false; };
  }, [language]);
  const [remoteCatalogue, setRemoteCatalogue] = useState(null);
  const remoteCatalogues = useRef(new Map());
  const t = useCallback((source, values = {}) => {
    const messages = remoteCatalogue?.language === language ? remoteCatalogue.messages : null;
    if (typeof source === "string" && Object.prototype.hasOwnProperty.call(messages || {}, source)) {
      return messages[source].replace(/\{\{(\w+)\}\}/g, (placeholder, key) =>
        Object.prototype.hasOwnProperty.call(values || {}, key) ? String(values[key] ?? "") : placeholder);
    }
    return translateText(localCatalogue?.language === language ? localCatalogue.messages : null, source, values);
  }, [language, localCatalogue, remoteCatalogue]);
  useEffect(() => {
    // Seul le client API WNPulse reçoit ce choix, sans toucher au jeton d'accès.
    api.defaults.headers.common["X-WNPulse-Language"] = language;
    const cached = remoteCatalogues.current.get(language);
    if (cached && cached.expiresAt > Date.now()) {
      setRemoteCatalogue(cached);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    api.get("/i18n", { params: { lang: language }, signal: controller.signal })
      .then(({ data }) => {
        if (!active || data?.language !== language || !data.messages ||
            typeof data.messages !== "object" || Array.isArray(data.messages)) return;
        const messages = Object.create(null);
        for (const [key, value] of Object.entries(data.messages).slice(0, 3000)) {
          if (typeof value === "string") messages[key] = value;
        }
        const next = { language, messages, expiresAt: Date.now() + 3600000 };
        remoteCatalogues.current.set(language, next);
        setRemoteCatalogue(next);
      })
      .catch(() => {
        // Ancien backend, panne réseau ou accès expiré : le catalogue local reste utilisable.
      });
    return () => { active = false; controller.abort(); };
  }, [language]);
  const setLanguage = useCallback(value => {
    const supported = normalizeLanguage(value);
    if (supported) setCurrentLanguage(supported);
  }, []);
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = selected.code;
      document.documentElement.dir = selected.dir;
    }
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, selected.code);
    } catch {/* Le choix reste actif en mémoire. */}
  }, [selected.code, selected.dir]);
  useEffect(() => {
    const onStorage = event => {
      if (event.key !== LANGUAGE_STORAGE_KEY) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }
      if (event.newValue === null) setCurrentLanguage(browserLanguage());else {
        const next = normalizeLanguage(event.newValue);
        if (next) setCurrentLanguage(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const formatNumber = useCallback((value, options = {}) => {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    try {
      return new Intl.NumberFormat(selected.locale, options).format(number);
    } catch {
      return String(number);
    }
  }, [selected.locale]);
  const formatDate = useCallback((value, options = {}) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat(selected.locale, options).format(date);
    } catch {
      return "—";
    }
  }, [selected.locale]);
  const context = useMemo(() => ({
    language,
    locale: selected.locale,
    direction: selected.dir,
    setLanguage,
    t,
    formatNumber,
    formatDate
  }), [language, selected.locale, selected.dir, setLanguage, t, formatNumber, formatDate]);
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage doit être utilisé dans LanguageProvider.");
  return context;
}
function LanguageFlag({code}){
 const common={viewBox:"0 0 30 20",className:"h-4 w-6 shrink-0 overflow-hidden rounded-sm",'aria-hidden':true};
 if(code==='fr')return <svg {...common}><path fill="#fff" d="M0 0h30v20H0z"/><path fill="#002395" d="M0 0h10v20H0z"/><path fill="#ed2939" d="M20 0h10v20H20z"/></svg>;
 if(code==='de')return <svg {...common}><path fill="#ffce00" d="M0 0h30v20H0z"/><path fill="#000" d="M0 0h30v6.7H0z"/><path fill="#d00" d="M0 6.7h30v6.6H0z"/></svg>;
 if(code==='es')return <svg {...common}><path fill="#aa151b" d="M0 0h30v20H0z"/><path fill="#f1bf00" d="M0 5h30v10H0z"/></svg>;
 if(code==='pt')return <svg {...common}><path fill="#f00" d="M0 0h30v20H0z"/><path fill="#060" d="M0 0h12v20H0z"/><circle cx="12" cy="10" r="4" fill="#ffde00"/><path fill="#fff" d="M10 7h4v5l-2 1-2-1z"/><path fill="#c00" d="M10.5 7.5h3v4l-1.5 1-1.5-1z"/></svg>;
 if(code==='en')return <svg {...common}><path fill="#012169" d="M0 0h30v20H0z"/><path stroke="#fff" strokeWidth="5" d="m0 0 30 20M30 0 0 20"/><path stroke="#c8102e" strokeWidth="2" d="m0 0 30 20M30 0 0 20"/><path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30"/><path stroke="#c8102e" strokeWidth="4" d="M15 0v20M0 10h30"/></svg>;
 return <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></svg>;
}
export function LanguageSwitcher({compact=false,dark=false}){
 const {language,setLanguage,t}=useLanguage();const selectId=useId();
 return <div dir="ltr" className={`flex min-w-0 items-center ${compact?'max-w-[145px]':'w-full'}`}>
  <Select value={language} onValueChange={setLanguage}>
   <SelectTrigger id={selectId} aria-label={t('Choisir la langue')} data-testid="language-selector" className={`min-h-11 min-w-0 gap-2 rounded-xl px-2 text-sm font-semibold focus:ring-orange-400 ${dark?'border-slate-700 bg-slate-900 text-white':'border-slate-200 bg-white text-slate-800'}`}><SelectValue/></SelectTrigger>
   <SelectContent position="popper" className="z-[120] min-w-[170px]">{SUPPORTED_LANGUAGES.map(item=><SelectItem key={item.code} value={item.code} lang={item.code}><span className="flex items-center gap-2"><LanguageFlag code={item.code}/><span dir={item.dir}>{item.name}</span></span></SelectItem>)}</SelectContent>
  </Select>
 </div>;
}
const NAV = [
 {to:"/app",label:"home",icon:LayoutDashboard,end:true,testId:"nav-dashboard"},
 {to:"/app/aujourdhui",label:"today",icon:Zap,testId:"nav-today"},
 {to:"/app/explorer",label:"explore",icon:Target,testId:"nav-explore"},
 {to:"/app/suivi",label:"follow",icon:Bell,testId:"nav-followed"},
 {to:"/resultats",label:"results",icon:History,testId:"nav-history"},
 {to:"/app/abonnement",label:"Abonnement",icon:CreditCard,testId:"nav-subscription"},
 {to:"/app/profil",label:"Profil",icon:User,testId:"nav-profile"},
 {to:"/app/parrainage",label:"Parrainage",icon:Gift,testId:"nav-referral"}
];
const WINPULSE_MONTHLY_PRICE_LABEL = "10 500 FCFA";
function normalizeLegacyPriceText(text) {
  return String(text || "").replace(/4[\s.\u00A0\u202F]?500\s*FCFA/gi, WINPULSE_MONTHLY_PRICE_LABEL).replace(/6[\s.\u00A0\u202F]?500\s*FCFA/gi, WINPULSE_MONTHLY_PRICE_LABEL);
}

// Sur mobile : 4 onglets essentiels + "Plus".
// Cela évite que les 11+ entrées de navigation agrandissent la barre fixe
// sur plusieurs lignes et recouvrent le contenu.
const MOBILE_PRIMARY_KEYS = ["/app", "/app/aujourdhui", "/app/explorer", "/app/suivi", "/resultats"];
function AppLayoutContent({
  children
}) {
  const experienceWords = useExperienceCopy();
  const {
    t
  } = useLanguage();
  const {
    user,
    logout
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const [qualityAlert, setQualityAlert] = useState({owner:null,count:0});
  const qualityWarningCount = qualityAlert.owner === user?.id && user?.is_admin ? qualityAlert.count : 0;
  useEffect(() => {
    if (!user?.is_admin || !user?.id) return undefined;
    const owner=user.id;let active=true;let flight=null;
    const load=async()=>{if(document.hidden||flight)return;const controller=new AbortController();flight=controller;
      try {const {data}=await api.get('/admin/quality/status',{signal:controller.signal,timeout:8000});
        const count=(Array.isArray(data?.checks)?data.checks:[]).filter(check=>check.status!=='healthy').length;
        if(active&&!controller.signal.aborted)setQualityAlert({owner,count:Math.max(count,data?.stale||data?.status==='never_run'?1:0)});
      } catch {if(active&&!controller.signal.aborted)setQualityAlert({owner,count:1});}
      finally {flight=null;}
    };
    load();const timer=window.setInterval(load,60000);document.addEventListener('visibilitychange',load);
    return()=>{active=false;flight?.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',load);};
  },[user?.id,user?.is_admin]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  // Sécurité anti-partage : le serveur autorise une seule session active pour
  // Free/Pro. Si ce compte est reconnecté ailleurs, l'ancien navigateur reçoit
  // SESSION_REVOKED et est déconnecté proprement. Les comptes Admin peuvent
  // avoir plusieurs sessions simultanées : le serveur les exempte de la règle.
  useEffect(() => {
    if (!user?.id) return undefined;
    let stopped = false;
    let handlingRevocation = false;
    const verifySession = async () => {
      if (stopped || handlingRevocation) return;
      try {
        await api.get("/auth/me");
      } catch (error) {
        const status = error?.response?.status;
        const detail = String(error?.response?.data?.detail || "");
        if (status === 401) {
          handlingRevocation = true;
          if (detail === "SESSION_REVOKED") {
            toast.error(t("Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée."));
          } else {
            toast.error(t("Ta session a expiré. Reconnecte-toi pour continuer."));
          }
          logout();
          navigate("/login", {
            replace: true
          });
        }
      }
    };

    // Contrôle immédiat, puis périodique. Les événements focus/visibility
    // rendent la révocation quasi immédiate quand l'utilisateur revient sur l'app.
    verifySession();
    const intervalId = window.setInterval(verifySession, 15000);
    const onFocus = () => verifySession();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") verifySession();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user?.id, logout, navigate, t]);

  // Filet de sécurité global : neutralise tout ancien tarif d’abonnement encore affiché
  // encore éventuellement présents dans un vieux composant ou un contenu mis en cache.
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return undefined;
    const normalizeNode = container => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && !["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(parent.tagName)) {
          const nextValue = normalizeLegacyPriceText(node.nodeValue);
          if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
        }
        node = walker.nextNode();
      }
    };
    normalizeNode(root);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            const nextValue = normalizeLegacyPriceText(node.nodeValue);
            if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            normalizeNode(node);
          }
        });
        if (mutation.type === "characterData" && mutation.target?.nodeValue) {
          const nextValue = normalizeLegacyPriceText(mutation.target.nodeValue);
          if (nextValue !== mutation.target.nodeValue) mutation.target.nodeValue = nextValue;
        }
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
    return () => observer.disconnect();
  }, []);
  const subscriptionTier = String(user?.subscription_tier || user?.subscription || "free").toLowerCase();
  const tierLabel = {
    free: {
      label: t("Free"),
      cls: "bg-slate-100 text-slate-700"
    },
    pro: {
      label: "Pro",
      cls: "bg-orange-100 text-orange-700"
    },
    elite: {
      label: "Elite",
      cls: "bg-rose-100 text-rose-700"
    }
  }[subscriptionTier] || {
    label: subscriptionTier === "free" ? t("Free") : "Pro",
    cls: subscriptionTier === "free" ? "bg-slate-100 text-slate-700" : "bg-orange-100 text-orange-700"
  };
  const mobileLabels = {
    "/app": t("Tableau"),
    "/app/live": t("Direct"),
    "/app/aujourdhui": t("Jour"),
    "/app/builder": t("Créer")
  };
  const navItems = NAV.map(item => ({
    ...item,
    label: experienceWords[item.label] || t(item.label),
    shortLabel: experienceWords[item.label] || t(mobileLabels[item.to] || item.label),
    badge: item.badge ? t(item.badge) : null
  }));
  if (user?.is_admin) {
    navItems.push({
      to: "/app/admin",
      label: t("Admin"),
      icon: ShieldCheck,
      badge: qualityWarningCount ? String(qualityWarningCount) : null,
      testId: "nav-admin"
    });
  }
  const isActive = item => item.end ? location.pathname === item.to : item.to === "/app/explorer"
    ? ["/app/explorer","/app/combines","/app/builder","/app/value-bets","/app/top","/app/montante"].some(path=>location.pathname.startsWith(path))
    : item.to === "/app/aujourdhui" ? ["/app/aujourdhui","/app/live","/app/match/"].some(path=>location.pathname.startsWith(path))
    : location.pathname.startsWith(item.to);
  const primaryMobileItems = navItems.filter(i => MOBILE_PRIMARY_KEYS.includes(i.to));
  const moreMobileItems = navItems.filter(i => !MOBILE_PRIMARY_KEYS.includes(i.to));
  return <div className="wp-premium min-h-screen w-full max-w-full bg-neutral-50" data-testid="premium-shell">
      {/* Sidebar desktop */}
      <aside className="wp-sidebar hidden lg:flex fixed inset-y-0 ltr:left-0 rtl:right-0 w-64 bg-slate-950 text-slate-100 flex-col" data-testid="app-sidebar">
        <div className="px-6 py-6 border-b border-slate-800/80 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center shadow-lg shadow-orange-600/30">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} fill="white" />
          </div>

          <div>
            <div className="font-heading font-extrabold tracking-tight text-lg leading-none">
              WinPulse
            </div>

            <div className="text-[10px] uppercase tracking-[0.18em] text-orange-400/70 mt-1">
              {experienceWords.heroTwo}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map(item => {
          const Icon = item.icon;
          const active = isActive(item);
          return <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined} data-testid={item.testId} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all", active ? "bg-gradient-to-r from-orange-600/20 to-rose-600/10 text-white border border-orange-500/30" : "text-slate-400 hover:bg-slate-800/60 hover:text-white")}>
                <Icon className={cn("h-4 w-4", active && "text-orange-400")} strokeWidth={2} />

                <span className="flex-1">{item.label}</span>

                {item.badge && <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-500 text-white px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>}
              </Link>;
        })}
        </nav>

        <div className="p-4 border-t border-slate-800/80">
          <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-400">
                {t("Connecté")}
              </div>

              <Badge className={cn("text-[10px] font-bold", tierLabel.cls)} data-testid="user-tier-badge">
                {tierLabel.label === "Elite" && <Crown className="h-3 w-3 me-1" />}

                {tierLabel.label}
              </Badge>
            </div>

            <div className="text-sm font-semibold truncate" data-testid="user-name">
              {user?.full_name}
            </div>

            <div className="text-xs text-slate-400 truncate mb-2">
              {user?.email}
            </div>

            <Button data-testid="logout-button" size="sm" variant="ghost" className="w-full text-slate-300 hover:text-white hover:bg-slate-800 justify-start" onClick={async () => {
            try {
              await api.post("/auth/logout");
            } catch {
              // Même si le réseau est indisponible, on termine la déconnexion locale.
            }
            logout();
            navigate("/");
          }}>
              <LogOut className="h-3.5 w-3.5 me-2" />
              {t("Déconnexion")}
            </Button>
          </div>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="wp-mobile-header lg:hidden sticky top-0 z-40 w-full bg-white/95 backdrop-blur-xl border-b border-neutral-200 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-lg wp-gradient-warm grid place-items-center text-white">
            <Zap className="h-4 w-4" strokeWidth={2.5} fill="white" />
          </div>

          <span className="font-heading font-extrabold truncate hidden sm:inline">
            WinPulse
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1 shrink-0">
          <button type="button" onClick={()=>setMoreOpen(v=>!v)} aria-label={experienceWords.account} aria-expanded={moreOpen} data-testid="mobile-more-toggle" className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100"><Menu className="h-5 w-5" />{qualityWarningCount>0&&<span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-orange-500" aria-label={t("Admin")} />}</button>
          <ResultNotificationBell />
          <AppearanceSwitcher /><LanguageSwitcher compact />
          <Badge className={cn("hidden min-[400px]:inline-flex text-[10px] font-bold", tierLabel.cls)}>
            {tierLabel.label}
          </Badge>

          <Button data-testid="logout-button-mobile" size="icon" variant="ghost" aria-label={t("Déconnexion")} className="min-h-11 min-w-11 text-slate-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => {
          logout();
          navigate("/");
        }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Panneau "Plus" mobile */}
      {moreOpen && <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMoreOpen(false)} data-testid="mobile-more-overlay" />

          <div className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-50 bg-white border-t border-neutral-200 rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto overscroll-contain" data-testid="mobile-more-panel">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <span className="font-heading font-bold text-slate-900 text-sm">
                {t("Plus d'options")}
              </span>

              <button type="button" onClick={() => setMoreOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label={t("Fermer")}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-3 pb-5">
              {moreMobileItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item);
            return <Link key={item.to} to={item.to} data-testid={`${item.testId}-mobile-more`} className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 text-[11px] font-medium text-center", active ? "bg-orange-50 text-orange-600" : "text-slate-600 hover:bg-neutral-50")}>
                    <Icon className="h-5 w-5" />

                    <span className="leading-tight">
                      {item.label}{item.badge&&<span className="ms-1 rounded-full bg-orange-500 px-1.5 text-white">{item.badge}</span>}
                    </span>
                  </Link>;
          })}
            </div>
          </div>
        </>}

      {/* Navigation mobile : une seule ligne + zone tactile compatible iPhone */}
      <nav className="wp-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/98 backdrop-blur border-t border-neutral-200 grid grid-cols-5 min-h-16 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]" style={{
      paddingBottom: "env(safe-area-inset-bottom)"
    }} data-testid="mobile-bottom-nav">
        {primaryMobileItems.map(item => {
        const Icon = item.icon;
        const active = isActive(item);
        return <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined} data-testid={`${item.testId}-mobile`} className={cn("min-w-0 flex flex-col items-center justify-center py-2 text-xs", active ? "text-orange-600" : "text-slate-500")}>
              <Icon className="h-5 w-5 mb-1 shrink-0" />

              <span className="leading-snug text-center break-words px-1 w-full">
                {item.shortLabel}
              </span>
            </Link>;
      })}

      </nav>

      {/* Contenu principal */}
      <main className="ltr:lg:pl-64 rtl:lg:pr-64 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 min-h-screen w-full min-w-0 max-w-full flex flex-col">
        <div className="wp-topbar hidden lg:flex items-center gap-6 border-b border-slate-200 bg-white px-8 py-4" data-testid="desktop-notification-header">
          <div className="min-w-0"><p className="wp-eyebrow">WinPulse</p><p className="text-sm font-semibold text-slate-300">{navItems.find(isActive)?.label || experienceWords.home}</p></div>
          <form className="wp-header-search" onSubmit={event => { event.preventDefault(); const query = headerSearch.trim(); navigate(`/app/aujourdhui${query ? `?q=${encodeURIComponent(query.slice(0, 200))}` : ""}`); }} role="search">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" /><label htmlFor="wp-header-search" className="sr-only">{experienceWords.allMatches}</label>
            <input id="wp-header-search" type="search" value={headerSearch} maxLength={200} onChange={event=>setHeaderSearch(event.target.value)} placeholder={experienceWords.allMatches} />
            <button type="submit" aria-label={experienceWords.open}><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button>
          </form>
          <div className="ms-auto flex items-center gap-3"><AppearanceSwitcher /><LanguageSwitcher dark compact /><ResultNotificationBell /><Link to="/app/profil" className="wp-avatar" aria-label={experienceWords.account}>{Array.from(user?.full_name || "W")[0]}</Link></div>
        </div>
        <div className="flex-1 min-w-0 max-w-full overflow-x-hidden">
          {children}
        </div>

        <footer className="border-t border-neutral-200 bg-white py-5 px-3 sm:px-4">
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-2 text-xs">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link to="/blog" className="text-slate-500 hover:text-orange-600 font-semibold">
                {t("Blog")}
              </Link>

              <span className="text-slate-300">·</span>

              <Link to="/legal/mentions-legales" className="text-slate-500 hover:text-orange-600 font-semibold">
                {t("Mentions légales")}
              </Link>

              <span className="text-slate-300">·</span>

              <Link to="/legal/cgv" className="text-slate-500 hover:text-orange-600 font-semibold">
                {t("CGV")}
              </Link>

              <span className="text-slate-300">·</span>

              <Link to="/legal/confidentialite" className="text-slate-500 hover:text-orange-600 font-semibold">
                {t("Confidentialité")}
              </Link>

              <span className="text-slate-300">·</span>

              <Link to="/legal/jeu-responsable" className="text-rose-600 hover:text-rose-700 font-semibold">
                {t("Jeu responsable · 18+")}
              </Link>
            </div>

            <div className="text-slate-400">
              {t("© 2026 WinPulse · Dublin, Irlande")}
            </div>
          </div>
        </footer>
      </main>
    </div>;
}

// Helpers de présentation pour les pages. Le contexte reste stable dans les
// effets et callbacks ; son contenu suit le sélecteur sans relancer les API.
export function usePageLanguage() {
  const context = useLanguage();
  const current = useRef(context);
  current.current = context;
  return useMemo(() => {
    const translate = (source, values) => current.current.t(source, values && Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "number" ? current.current.formatNumber(value, { maximumFractionDigits: 10 }) : value])));
    const tx = value => {
      if (typeof value === "number") return current.current.formatNumber(value);
      if (typeof value !== "string") return value;
      const aliases = { safe: "Prudent", value: "Modéré", risky: "Risqué" };
      const source = Object.prototype.hasOwnProperty.call(PAGE_MESSAGE_SOURCES, value) ? PAGE_MESSAGE_SOURCES[value]
        : Object.prototype.hasOwnProperty.call(aliases, value) ? aliases[value] : value;
      return translate(source);
    };
    const bet = value => {
      if (typeof value !== "string") return tx(value);
      const total = value.trim().match(/^(Plus|Moins) de (\d+(?:[.,]\d+)?)(?: (buts|but|points|point|corners|cartons))?$/i);
      if (total) {
        const direction = total[1].toLowerCase() === "plus" ? "Plus" : "Moins";
        const unit = total[3] ? " " + ({ but: "buts", point: "points" }[total[3].toLowerCase()] || total[3].toLowerCase()) : "";
        return translate(`${direction} de {{line}}${unit}`, { line: current.current.formatNumber(Number(total[2].replace(",", ".")), { maximumFractionDigits: 10 }) });
      }
      const aliases = { h2h: "Vainqueur (1X2)", totals: "Total buts/points", spreads: "Handicap", Draw: "Match nul", BTTS: "Les deux équipes marquent" };
      return tx(Object.prototype.hasOwnProperty.call(aliases, value) ? aliases[value] : value);
    };
    return {
      get language() { return current.current.language; },
      get locale() { return current.current.locale; },
      get direction() { return current.current.direction; },
      t: translate,
      tx,
      bet,
      formatNumber: (value, options) => current.current.formatNumber(value, options),
      formatDate: (value, options) => current.current.formatDate(value, options),
      rich: (source, values = {}) => {
        const template = translate(source);
        return template.split(/(\{\{\w+\}\})/g).filter(Boolean).map((part, index) => {
          const token = part.match(/^\{\{(\w+)\}\}$/);
          return <Fragment key={index}>{token && Object.prototype.hasOwnProperty.call(values, token[1]) ? values[token[1]] : part}</Fragment>;
        });
      },
      formatPattern: (value, pattern = "DD/MM HH:mm") => {
        if (value === null || value === undefined || value === "") return "";
        const date = value instanceof Date ? value : new Date(value);
        if (!Number.isFinite(date.getTime())) return "";
        const options = {};
        if (/dddd/.test(pattern)) options.weekday = "long";
        if (/D/.test(pattern)) options.day = /DD/.test(pattern) ? "2-digit" : "numeric";
        if (/M/.test(pattern)) options.month = /MMMM/.test(pattern) ? "long" : /MMM/.test(pattern) ? "short" : "2-digit";
        if (/YYYY/.test(pattern)) options.year = "numeric";
        if (/HH/.test(pattern)) { options.hour = "2-digit"; options.hourCycle = "h23"; }
        if (/mm/.test(pattern)) options.minute = "2-digit";
        if (/ss/.test(pattern)) options.second = "2-digit";
        return current.current.formatDate(date, options);
      },
    };
  }, []);
}

const ResultNotificationsContext = createContext(null);
const NOTIFICATION_MESSAGES = {
  "fr": {
    "Tes notifications": "Tes notifications",
    "Les résultats confirmés des pronostics que tu suis.": "Les résultats confirmés des pronostics que tu suis.",
    "Fermer": "Fermer",
    "Contenu des notifications": "Contenu des notifications",
    "Résultats": "Résultats",
    "Pronostics suivis": "Pronostics suivis",
    "Notifications temporairement indisponibles.": "Notifications temporairement indisponibles.",
    "Réessayer": "Réessayer",
    "Chargement…": "Chargement…",
    "Marquer la liste comme lue": "Marquer la liste comme lue",
    "Aucun résultat à notifier": "Aucun résultat à notifier",
    "Clique sur « Suivre ce pronostic » sur une carte avant le début du match. Son résultat apparaîtra ici après confirmation.": "Clique sur « Suivre ce pronostic » sur une carte avant le début du match. Son résultat apparaîtra ici après confirmation.",
    "Gagné": "Gagné",
    "Perdu": "Perdu",
    "Remboursé": "Remboursé",
    "Score final": "Score final",
    "Voir les résultats": "Voir les résultats",
    "Aucun pronostic suivi en attente de résultat.": "Aucun pronostic suivi en attente de résultat.",
    "Arrêter le suivi": "Arrêter le suivi",
    "Mise à jour lorsque le site est ouvert. Gagnés, perdus et remboursés sont tous signalés.": "Mise à jour lorsque le site est ouvert. Gagnés, perdus et remboursés sont tous signalés.",
    "Notifications : {{count}} non lues": "Notifications : {{count}} non lues",
    "Suivi arrêté": "Suivi arrêté",
    "Pronostic suivi": "Pronostic suivi",
    "Suivre ce pronostic": "Suivre ce pronostic",
    "Action impossible. Réessaie.": "Action impossible. Réessaie.",
    "Le suivi de ce pronostic nécessite un accès Pro": "Le suivi de ce pronostic nécessite un accès Pro",
    "Aucun pronostic disponible à suivre": "Aucun pronostic disponible à suivre",
    "Le suivi s’active avant le début de la rencontre": "Le suivi s’active avant le début de la rencontre",
    "Le résultat de cette sélection est déjà confirmé": "Le résultat de cette sélection est déjà confirmé",
    "Tu peux suivre jusqu’à 200 pronostics à la fois": "Tu peux suivre jusqu’à 200 pronostics à la fois",
    "Le suivi de ce marché n’est pas encore disponible": "Le suivi de ce marché n’est pas encore disponible"
  },
  "en": {
    "Tes notifications": "Your notifications",
    "Les résultats confirmés des pronostics que tu suis.": "Confirmed results for the predictions you follow.",
    "Fermer": "Close",
    "Contenu des notifications": "Notification content",
    "Résultats": "Results",
    "Pronostics suivis": "Followed predictions",
    "Notifications temporairement indisponibles.": "Notifications temporarily unavailable.",
    "Réessayer": "Try again",
    "Chargement…": "Loading…",
    "Marquer la liste comme lue": "Mark this list as read",
    "Aucun résultat à notifier": "No results to notify",
    "Clique sur « Suivre ce pronostic » sur une carte avant le début du match. Son résultat apparaîtra ici après confirmation.": "Click “Follow this prediction” on a card before kickoff. Its result will appear here once confirmed.",
    "Gagné": "Won",
    "Perdu": "Lost",
    "Remboursé": "Refunded",
    "Score final": "Final score",
    "Voir les résultats": "View results",
    "Aucun pronostic suivi en attente de résultat.": "No followed predictions awaiting a result.",
    "Arrêter le suivi": "Stop following",
    "Mise à jour lorsque le site est ouvert. Gagnés, perdus et remboursés sont tous signalés.": "Updates while the site is open. Wins, losses and refunds are all reported.",
    "Notifications : {{count}} non lues": "Notifications: {{count}} unread",
    "Suivi arrêté": "Stopped following",
    "Pronostic suivi": "Following prediction",
    "Suivre ce pronostic": "Follow this prediction",
    "Action impossible. Réessaie.": "Unable to complete this action. Try again.",
    "Le suivi de ce pronostic nécessite un accès Pro": "Following this prediction requires Pro access",
    "Aucun pronostic disponible à suivre": "No available prediction to follow",
    "Le suivi s’active avant le début de la rencontre": "Follow a prediction before the match starts",
    "Le résultat de cette sélection est déjà confirmé": "This selection’s result is already confirmed",
    "Tu peux suivre jusqu’à 200 pronostics à la fois": "You can follow up to 200 predictions at a time",
    "Le suivi de ce marché n’est pas encore disponible": "Following this market is not available yet"
  },
  "es": {
    "Tes notifications": "Tus notificaciones",
    "Les résultats confirmés des pronostics que tu suis.": "Resultados confirmados de los pronósticos que sigues.",
    "Fermer": "Cerrar",
    "Contenu des notifications": "Contenido de las notificaciones",
    "Résultats": "Resultados",
    "Pronostics suivis": "Pronósticos seguidos",
    "Notifications temporairement indisponibles.": "Notificaciones temporalmente no disponibles.",
    "Réessayer": "Reintentar",
    "Chargement…": "Cargando…",
    "Marquer la liste comme lue": "Marcar esta lista como leída",
    "Aucun résultat à notifier": "No hay resultados que notificar",
    "Clique sur « Suivre ce pronostic » sur une carte avant le début du match. Son résultat apparaîtra ici après confirmation.": "Pulsa «Seguir este pronóstico» en una tarjeta antes del partido. Su resultado aparecerá aquí cuando se confirme.",
    "Gagné": "Ganado",
    "Perdu": "Perdido",
    "Remboursé": "Reembolsado",
    "Score final": "Marcador final",
    "Voir les résultats": "Ver resultados",
    "Aucun pronostic suivi en attente de résultat.": "No hay pronósticos seguidos pendientes de resultado.",
    "Arrêter le suivi": "Dejar de seguir",
    "Mise à jour lorsque le site est ouvert. Gagnés, perdus et remboursés sont tous signalés.": "Se actualiza mientras el sitio está abierto. Se notifican aciertos, fallos y reembolsos.",
    "Notifications : {{count}} non lues": "Notificaciones: {{count}} sin leer",
    "Suivi arrêté": "Seguimiento detenido",
    "Pronostic suivi": "Siguiendo pronóstico",
    "Suivre ce pronostic": "Seguir este pronóstico",
    "Action impossible. Réessaie.": "No se pudo completar la acción. Reintenta.",
    "Le suivi de ce pronostic nécessite un accès Pro": "Seguir este pronóstico requiere acceso Pro",
    "Aucun pronostic disponible à suivre": "No hay un pronóstico disponible para seguir",
    "Le suivi s’active avant le début de la rencontre": "El seguimiento se activa antes del inicio del partido",
    "Le résultat de cette sélection est déjà confirmé": "El resultado de esta selección ya está confirmado",
    "Tu peux suivre jusqu’à 200 pronostics à la fois": "Puedes seguir hasta 200 pronósticos a la vez",
    "Le suivi de ce marché n’est pas encore disponible": "El seguimiento de este mercado aún no está disponible"
  },
  "pt": {
    "Tes notifications": "As tuas notificações",
    "Les résultats confirmés des pronostics que tu suis.": "Resultados confirmados dos prognósticos que segues.",
    "Fermer": "Fechar",
    "Contenu des notifications": "Conteúdo das notificações",
    "Résultats": "Resultados",
    "Pronostics suivis": "Prognósticos seguidos",
    "Notifications temporairement indisponibles.": "Notificações temporariamente indisponíveis.",
    "Réessayer": "Tentar novamente",
    "Chargement…": "A carregar…",
    "Marquer la liste comme lue": "Marcar esta lista como lida",
    "Aucun résultat à notifier": "Sem resultados para notificar",
    "Clique sur « Suivre ce pronostic » sur une carte avant le début du match. Son résultat apparaîtra ici après confirmation.": "Clica em «Seguir este prognóstico» num cartão antes do jogo. O resultado aparecerá aqui após confirmação.",
    "Gagné": "Ganho",
    "Perdu": "Perdido",
    "Remboursé": "Reembolsado",
    "Score final": "Resultado final",
    "Voir les résultats": "Ver resultados",
    "Aucun pronostic suivi en attente de résultat.": "Sem prognósticos seguidos a aguardar resultado.",
    "Arrêter le suivi": "Deixar de seguir",
    "Mise à jour lorsque le site est ouvert. Gagnés, perdus et remboursés sont tous signalés.": "Atualiza enquanto o site está aberto. Vitórias, derrotas e reembolsos são todos comunicados.",
    "Notifications : {{count}} non lues": "Notificações: {{count}} por ler",
    "Suivi arrêté": "Seguimento terminado",
    "Pronostic suivi": "A seguir prognóstico",
    "Suivre ce pronostic": "Seguir este prognóstico",
    "Action impossible. Réessaie.": "Não foi possível concluir a ação. Tenta novamente.",
    "Le suivi de ce pronostic nécessite un accès Pro": "Seguir este prognóstico requer acesso Pro",
    "Aucun pronostic disponible à suivre": "Nenhum prognóstico disponível para seguir",
    "Le suivi s’active avant le début de la rencontre": "O seguimento é ativado antes do início do jogo",
    "Le résultat de cette sélection est déjà confirmé": "O resultado desta seleção já está confirmado",
    "Tu peux suivre jusqu’à 200 pronostics à la fois": "Podes seguir até 200 prognósticos de cada vez",
    "Le suivi de ce marché n’est pas encore disponible": "O seguimento deste mercado ainda não está disponível"
  },
  "de": {
    "Tes notifications": "Deine Benachrichtigungen",
    "Les résultats confirmés des pronostics que tu suis.": "Bestätigte Ergebnisse deiner verfolgten Tipps.",
    "Fermer": "Schließen",
    "Contenu des notifications": "Inhalt der Benachrichtigungen",
    "Résultats": "Ergebnisse",
    "Pronostics suivis": "Verfolgte Tipps",
    "Notifications temporairement indisponibles.": "Benachrichtigungen sind vorübergehend nicht verfügbar.",
    "Réessayer": "Erneut versuchen",
    "Chargement…": "Wird geladen…",
    "Marquer la liste comme lue": "Diese Liste als gelesen markieren",
    "Aucun résultat à notifier": "Keine Ergebnisse zu melden",
    "Clique sur « Suivre ce pronostic » sur une carte avant le début du match. Son résultat apparaîtra ici après confirmation.": "Klicke vor Spielbeginn auf „Diesen Tipp verfolgen“. Das bestätigte Ergebnis erscheint anschließend hier.",
    "Gagné": "Gewonnen",
    "Perdu": "Verloren",
    "Remboursé": "Erstattet",
    "Score final": "Endstand",
    "Voir les résultats": "Ergebnisse ansehen",
    "Aucun pronostic suivi en attente de résultat.": "Keine verfolgten Tipps mit ausstehendem Ergebnis.",
    "Arrêter le suivi": "Nicht mehr verfolgen",
    "Mise à jour lorsque le site est ouvert. Gagnés, perdus et remboursés sont tous signalés.": "Aktualisierung bei geöffneter Website. Gewinne, Verluste und Erstattungen werden gemeldet.",
    "Notifications : {{count}} non lues": "Benachrichtigungen: {{count}} ungelesen",
    "Suivi arrêté": "Verfolgung beendet",
    "Pronostic suivi": "Tipp wird verfolgt",
    "Suivre ce pronostic": "Diesen Tipp verfolgen",
    "Action impossible. Réessaie.": "Aktion nicht möglich. Versuche es erneut.",
    "Le suivi de ce pronostic nécessite un accès Pro": "Für diesen Tipp ist ein Pro-Zugang erforderlich",
    "Aucun pronostic disponible à suivre": "Kein verfügbarer Tipp zum Verfolgen",
    "Le suivi s’active avant le début de la rencontre": "Tipps können vor Spielbeginn verfolgt werden",
    "Le résultat de cette sélection est déjà confirmé": "Das Ergebnis dieses Tipps ist bereits bestätigt",
    "Tu peux suivre jusqu’à 200 pronostics à la fois": "Du kannst bis zu 200 Tipps gleichzeitig verfolgen",
    "Le suivi de ce marché n’est pas encore disponible": "Dieser Markt kann noch nicht verfolgt werden"
  },
  "ar": {
    "Tes notifications": "إشعاراتك",
    "Les résultats confirmés des pronostics que tu suis.": "النتائج المؤكدة للتوقعات التي تتابعها.",
    "Fermer": "إغلاق",
    "Contenu des notifications": "محتوى الإشعارات",
    "Résultats": "النتائج",
    "Pronostics suivis": "التوقعات المتابَعة",
    "Notifications temporairement indisponibles.": "الإشعارات غير متاحة مؤقتاً.",
    "Réessayer": "إعادة المحاولة",
    "Chargement…": "جارٍ التحميل…",
    "Marquer la liste comme lue": "تحديد هذه القائمة كمقروءة",
    "Aucun résultat à notifier": "لا توجد نتائج للإشعار بها",
    "Clique sur « Suivre ce pronostic » sur une carte avant le début du match. Son résultat apparaîtra ici après confirmation.": "اضغط «متابعة هذا التوقع» على البطاقة قبل بداية المباراة. ستظهر النتيجة هنا بعد تأكيدها.",
    "Gagné": "فائز",
    "Perdu": "خاسر",
    "Remboursé": "مسترد",
    "Score final": "النتيجة النهائية",
    "Voir les résultats": "عرض النتائج",
    "Aucun pronostic suivi en attente de résultat.": "لا توجد توقعات متابَعة بانتظار النتيجة.",
    "Arrêter le suivi": "إيقاف المتابعة",
    "Mise à jour lorsque le site est ouvert. Gagnés, perdus et remboursés sont tous signalés.": "تحديث أثناء فتح الموقع. تُعرض النتائج الفائزة والخاسرة والمستردة جميعها.",
    "Notifications : {{count}} non lues": "الإشعارات: {{count}} غير مقروءة",
    "Suivi arrêté": "تم إيقاف المتابعة",
    "Pronostic suivi": "تتم متابعة التوقع",
    "Suivre ce pronostic": "متابعة هذا التوقع",
    "Action impossible. Réessaie.": "تعذّر تنفيذ الإجراء. حاول مجدداً.",
    "Le suivi de ce pronostic nécessite un accès Pro": "تتطلب متابعة هذا التوقع اشتراك Pro",
    "Aucun pronostic disponible à suivre": "لا يوجد توقع متاح للمتابعة",
    "Le suivi s’active avant le début de la rencontre": "يمكن تفعيل المتابعة قبل بداية المباراة",
    "Le résultat de cette sélection est déjà confirmé": "تم تأكيد نتيجة هذا الاختيار بالفعل",
    "Tu peux suivre jusqu’à 200 pronostics à la fois": "يمكنك متابعة ما يصل إلى 200 توقع في الوقت نفسه",
    "Le suivi de ce marché n’est pas encore disponible": "متابعة هذا السوق غير متاحة بعد"
  }
};
function useNotificationLanguage() {
  const page = usePageLanguage();
  const { language } = page;
  const t = useCallback((key, values = {}) => {
    const message = NOTIFICATION_MESSAGES[language]?.[key] || NOTIFICATION_MESSAGES.fr[key] || key;
    return message.replace(/\{\{(\w+)\}\}/g, (all, name) => String(values[name] ?? all));
  }, [language]);
  return { ...page, t };
}

function ResultNotificationsProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.id || null;
  const uidRef = useRef(uid);
  uidRef.current = uid;
  const [data, setData] = useState({ owner: null, items: [], follows: [], unread_count: 0 });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [busy, setBusy] = useState(new Set());
  const [open, setOpen] = useState(false);
  const flight = useRef(null);
  const actions = useRef(new Set());
  const mounted = useRef(false);
  const { t } = useNotificationLanguage();
  const translation = useRef(t);
  translation.current = t;
  const refresh = useCallback(async (force = false) => {
    if (!uid || !mounted.current || (!force && document.hidden)) return false;
    if (flight.current) {
      if (!force) return false;
      flight.current.abort();
    }
    const controller = new AbortController();
    flight.current = controller;
    setLoading(true);
    try {
      const response = await api.get("/notifications", {
        signal: controller.signal,
        timeout: 20000,
        // Un clic explicite doit obtenir une réponse fraîche, même derrière un cache HTTP.
        params: force ? { _refresh: Date.now() } : undefined,
      });
      if (mounted.current && uidRef.current === uid && !controller.signal.aborted) {
        const value = response.data || {};
        setData({ owner: uid, items: Array.isArray(value.items) ? value.items : [], follows: Array.isArray(value.follows) ? value.follows : [], unread_count: Math.max(0, Number(value.unread_count) || 0) });
        setFailed(false);
        setLastUpdated(new Date().toISOString());
        return true;
      }
      return false;
    } catch {
      if (mounted.current && uidRef.current === uid && !controller.signal.aborted) setFailed(true);
      return false;
    } finally {
      if (flight.current === controller) {
        flight.current = null;
        if (mounted.current && uidRef.current === uid) setLoading(false);
      }
    }
  }, [uid]);
  useEffect(() => {
    mounted.current = true;
    setData({ owner: uid, items: [], follows: [], unread_count: 0 });
    setLastUpdated(null);
    setLoading(false);
    setBusy(new Set());
    setOpen(false);
    setFailed(false);
    refresh(true);
    const resume = () => { if (!document.hidden) refresh(); };
    const timer = uid ? window.setInterval(resume, 60000) : null;
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      mounted.current = false;
      flight.current?.abort();
      flight.current = null;
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [uid, refresh]);
  const perform = useCallback(async (key, request) => {
    const actionKey = `${uid}:${key}`;
    if (!uid || actions.current.has(actionKey)) return false;
    actions.current.add(actionKey);
    setBusy(previous => new Set([...previous, key]));
    try {
      await request();
      if (mounted.current && uidRef.current === uid) await refresh(true);
      return true;
    } catch (error) {
      if (mounted.current && uidRef.current === uid) {
        const detail = error?.response?.data?.detail;
        toast.error(translation.current(typeof detail === "string" && Object.prototype.hasOwnProperty.call(NOTIFICATION_MESSAGES.fr, detail) ? detail : "Action impossible. Réessaie."));
      }
      return false;
    } finally {
      actions.current.delete(actionKey);
      if (mounted.current && uidRef.current === uid) setBusy(previous => { const next = new Set(previous); next.delete(key); return next; });
    }
  }, [uid, refresh]);
  const follow = useCallback(matchId => perform(`follow:${matchId}`, () => api.post(`/predictions/${encodeURIComponent(matchId)}/follow`)), [perform]);
  const unfollow = useCallback(id => perform(`unfollow:${id}`, () => api.delete(`/notifications/follows/${encodeURIComponent(id)}`)), [perform]);
  const clearResolved = useCallback(() => perform("clear-resolved", () => api.post("/notifications/follows/clear-resolved")), [perform]);
  const markRead = useCallback(ids => perform("read", () => api.post("/notifications/read", { ids: ids.slice(0, 50) })), [perform]);
  const value = useMemo(() => ({ ...(data.owner === uid ? data : { items: [], follows: [], unread_count: 0 }), uid, loading, failed, lastUpdated, busy, open, setOpen, refresh, follow, unfollow, markRead, clearResolved }), [data, uid, loading, failed, lastUpdated, busy, open, refresh, follow, unfollow, markRead, clearResolved]);
  return <ResultNotificationsContext.Provider value={value}>{children}{uid && <ResultNotificationsDialog />}</ResultNotificationsContext.Provider>;
}

export function FollowPickButton({ matchId, pick, market, disabled = false, compact = false }) {
  const state = useContext(ResultNotificationsContext);
  const { t } = useNotificationLanguage();
  if (!state?.uid || !matchId || !pick) return null;
  const unsupported = Boolean(market && !["h2h", "totals", "spreads", "btts", "draw_no_bet", "double_chance", "team_totals"].includes(market));
  const followed = state.follows.find(row => row.match_id === String(matchId) && row.pick === pick);
  const busy = state.loading || state.busy.has(`follow:${matchId}`) || (followed && state.busy.has(`unfollow:${followed.id}`));
  return <button type="button" data-testid="follow-pick" disabled={Boolean(busy || (!followed && (disabled || unsupported)))} title={!followed && unsupported ? t("Le suivi de ce marché n’est pas encore disponible") : !followed && disabled ? t("Le suivi s’active avant le début de la rencontre") : undefined} aria-pressed={Boolean(followed)} onClick={async event => {
    event.preventDefault(); event.stopPropagation();
    const ok = followed ? await state.unfollow(followed.id) : await state.follow(String(matchId));
    if (ok) toast.success(t(followed ? "Suivi arrêté" : "Pronostic suivi"));
  }} className={`${compact ? "" : "mt-3"} inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold leading-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60 ${followed ? "border-orange-200 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700"}`}>
    {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : followed ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <BellPlus className="h-4 w-4 shrink-0" aria-hidden="true" />}
    {t(followed ? "Pronostic suivi" : "Suivre ce pronostic")}
  </button>;
}

function ResultNotificationBell() {
  const state = useContext(ResultNotificationsContext);
  const { t, formatNumber, language } = useNotificationLanguage();
  if (!state?.uid) return null;
  const activeAlerts = state.follows.flatMap(row => Array.isArray(row.alerts) ? row.alerts : []);
  const alertText = activeAlerts.length ? ` · ${(FOLLOW_PAGE_TEXT[language] || FOLLOW_PAGE_TEXT.fr)[activeAlerts[0].type === "kickoff_soon" ? 8 : 9]}` : "";
  return <button type="button" data-testid="notification-bell" onClick={() => { state.setOpen(true); state.refresh(); }} aria-haspopup="dialog" aria-expanded={state.open} aria-label={t("Notifications : {{count}} non lues", { count: formatNumber(state.unread_count) }) + alertText} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-100 bg-orange-50 text-orange-600 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
    <Bell className="h-5 w-5" aria-hidden="true" />
    {state.unread_count > 0 && <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white" aria-hidden="true">{state.unread_count > 99 ? "99+" : formatNumber(state.unread_count)}</span>}
    {state.unread_count === 0 && activeAlerts.length > 0 && <span className="absolute -end-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-xs font-black text-white" aria-hidden="true">!</span>}
  </button>;
}

function ResultNotificationsDialog() {
  const state = useContext(ResultNotificationsContext);
  const { t, bet, formatDate, formatNumber, direction, language } = useNotificationLanguage();
  const navigate = useNavigate();
  const dialog = useRef(null);
  const titleId = useId();
  const [tab, setTab] = useState("results");
  useEffect(() => {
    const element = dialog.current;
    if (state.open && element && !element.open) element.showModal();
    if (!state.open && element?.open) element.close();
  }, [state.open]);
  const unread = state.items.filter(item => !item.read_at).map(item => item.id);
  const following = state.follows.filter(row => row.state === "following");
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? formatDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  return <dialog ref={dialog} dir={direction} aria-labelledby={titleId} onCancel={() => state.setOpen(false)} onClose={() => state.setOpen(false)} onClick={event => { if (event.target === dialog.current) state.setOpen(false); }} className="fixed inset-0 z-[100] m-auto w-[calc(100%-1.5rem)] max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40" data-testid="notifications-dialog">
    <div className="flex max-h-[85dvh] flex-col">
      <header className="flex items-start gap-3 border-b border-orange-100 bg-orange-50/70 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-500 text-white"><Bell className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><h2 id={titleId} className="font-heading text-xl font-extrabold">{t("Tes notifications")}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{t("Les résultats confirmés des pronostics que tu suis.")}</p></div>
        <button type="button" onClick={() => state.setOpen(false)} aria-label={t("Fermer")} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-orange-100"><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3" aria-label={t("Contenu des notifications")}>
        {[["results", "Résultats"], ["follows", "Pronostics suivis"]].map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={`min-h-11 rounded-xl px-3 py-2 text-sm font-bold ${tab === key ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-600"}`}>{t(label)}{key === "follows" && <span className="ms-2 rounded-full bg-white/15 px-1.5 text-xs">{formatNumber(following.length)}</span>}</button>)}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {state.follows.flatMap(row => (Array.isArray(row.alerts) ? row.alerts : []).map((alert,index) => <Link key={`${row.id}-${index}`} to="/app/suivi" onClick={() => state.setOpen(false)} className="mb-3 block rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900" role="status">{(FOLLOW_PAGE_TEXT[language] || FOLLOW_PAGE_TEXT.fr)[alert.type === "kickoff_soon" ? 8 : 9]} · <bdi>{row.home_team} vs {row.away_team}</bdi> →</Link>))}
        {state.failed && <div role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6"><p>{t("Notifications temporairement indisponibles.")}</p><button type="button" className="mt-1 min-h-11 font-bold text-orange-700" onClick={() => state.refresh(true)}>{t("Réessayer")}</button></div>}
        {state.loading && state.items.length === 0 && <p className="py-4 text-sm text-slate-500" role="status">{t("Chargement…")}</p>}
        {tab === "results" ? <>
          {unread.length > 0 && <button type="button" disabled={state.busy.has("read")} onClick={() => state.markRead(unread)} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-700"><CheckCheck className="h-4 w-4" aria-hidden="true" />{t("Marquer la liste comme lue")}</button>}
          {!state.loading && !state.failed && state.items.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center"><BellPlus className="mx-auto mb-3 h-8 w-8 text-orange-400" aria-hidden="true" /><h3 className="font-bold">{t("Aucun résultat à notifier")}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{t("Clique sur « Suivre ce pronostic » sur une carte avant le début du match. Son résultat apparaîtra ici après confirmation.")}</p></div>}
          <div className="space-y-3">{state.items.map(item => {
            const won = item.result === "won", lost = item.result === "lost";
            const Icon = won ? CheckCircle2 : lost ? XCircle : MinusCircle;
            return <article key={item.id} className={`rounded-2xl border p-4 ${!item.read_at ? "border-orange-200 bg-orange-50/30" : "border-slate-200 bg-white"}`} data-testid="result-notification">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold ${won ? "bg-emerald-100 text-emerald-800" : lost ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}><Icon className="h-4 w-4" aria-hidden="true" />{t(won ? "Gagné" : lost ? "Perdu" : "Remboursé")}</span><time className="text-xs text-slate-500" dateTime={item.confirmed_at}>{date(item.confirmed_at)}</time></div>
              <h3 className="break-words text-base font-bold leading-6"><bdi>{item.home_team} vs {item.away_team}</bdi></h3>
              <p className="mt-1 break-words text-sm leading-6 text-slate-600"><bdi>{bet(item.pick)}</bdi>{Number.isFinite(Number(item.pick_odds)) && Number(item.pick_odds) > 1 && <> · <bdi className="font-mono font-bold">{formatNumber(Number(item.pick_odds), { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</bdi></>}</p>
              {item.final_score && <p className="mt-1 text-sm text-slate-500">{t("Score final")} : <bdi>{item.final_score}</bdi></p>}
              <button type="button" disabled={state.busy.has("read")} onClick={async () => { if (!item.read_at) { const ok = await state.markRead([item.id]); if (!ok) return; } state.setOpen(false); navigate("/resultats"); }} className="mt-2 min-h-11 text-sm font-bold text-orange-700">{t("Voir les résultats")} →</button>
            </article>;
          })}</div>
        </> : <div className="space-y-3">
          {following.length === 0 && <p className="py-6 text-center text-sm leading-6 text-slate-500">{t("Aucun pronostic suivi en attente de résultat.")}</p>}
          {following.map(row => <article key={row.id} className="rounded-2xl border border-slate-200 p-4"><h3 className="break-words text-sm font-bold leading-6"><bdi>{row.home_team} vs {row.away_team}</bdi></h3><p className="mt-1 break-words text-sm leading-6 text-slate-500"><bdi>{bet(row.pick)}</bdi></p><button type="button" disabled={state.busy.has(`unfollow:${row.id}`)} onClick={() => state.unfollow(row.id)} className="mt-2 min-h-11 text-sm font-semibold text-slate-600 underline underline-offset-4">{t("Arrêter le suivi")}</button></article>)}
        </div>}
        <Link to="/app/suivi" onClick={() => state.setOpen(false)} className="mt-3 inline-flex min-h-11 items-center font-bold text-orange-700">{t("Pronostics suivis")} →</Link>
      </div>
      <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-500">{t("Mise à jour lorsque le site est ouvert. Gagnés, perdus et remboursés sont tous signalés.")}</p>
    </div>
  </dialog>;
}

export default function AppLayout({ children }) {
  return <ResultNotificationsProvider><AppLayoutContent>{children}</AppLayoutContent></ResultNotificationsProvider>;
}



const FOLLOW_PAGE_TEXT = {
 fr:["Mes pronostics suivis","Tes sélections et leurs résultats confirmés au même endroit.","Cote initiale","Début","En attente","Gagné","Perdu","Remboursé","Début dans moins de 30 minutes","Cote modifiée","Ancienne cote","Cote actuelle","Mise à jour lorsque le site est ouvert. Les cotes peuvent changer.","Aucune sélection suivie pour le moment.","Suivre des pronostics","Historique limité aux 200 suivis actifs et 50 suivis récents.","Actualiser","Indisponible","Arrêter le suivi","Sélection","Marché","Notifications indisponibles. Réessaie.","Actualisation…","Dernière actualisation","Retirer les matchs terminés","Suppression…","Les matchs terminés ont été retirés du suivi.","Seuls les suivis dont le résultat est confirmé seront retirés. Les notifications de résultats restent disponibles."],
 en:["My followed picks","Your selections and confirmed results in one place.","Original odds","Starts","Pending","Won","Lost","Refunded","Starts within 30 minutes","Odds changed","Original odds","Current odds","Updated while the site is open. Odds may change.","No followed selections yet.","Explore predictions","Showing up to 200 active and 50 recent follows.","Refresh","Unavailable","Unfollow","Selection","Market","Notifications unavailable. Try again.","Refreshing…","Last refreshed","Remove finished matches","Removing…","Finished matches removed from your follows.","Only follows with confirmed results will be removed. Result notifications remain available."],
 es:["Mis pronósticos seguidos","Tus selecciones y resultados confirmados en un solo lugar.","Cuota inicial","Inicio","Pendiente","Ganado","Perdido","Reembolsado","Comienza en menos de 30 minutos","Cuota modificada","Cuota inicial","Cuota actual","Actualizado con el sitio abierto. Las cuotas pueden variar.","Aún no sigues selecciones.","Ver pronósticos","Hasta 200 seguimientos activos y 50 recientes.","Actualizar","No disponible","Dejar de seguir","Selección","Mercado","Notificaciones no disponibles. Inténtalo de nuevo.","Actualizando…","Última actualización","Retirar partidos finalizados","Eliminando…","Se han retirado los partidos finalizados.","Solo se retirarán los seguimientos con resultado confirmado. Las notificaciones se conservarán."],
 pt:["Os meus palpites seguidos","As tuas seleções e resultados confirmados num só lugar.","Cota inicial","Início","Pendente","Ganho","Perdido","Reembolsado","Começa dentro de 30 minutos","Cota alterada","Cota inicial","Cota atual","Atualizado com o site aberto. As cotas podem mudar.","Ainda não segues seleções.","Ver palpites","Até 200 acompanhamentos ativos e 50 recentes.","Atualizar","Indisponível","Deixar de seguir","Seleção","Mercado","Notificações indisponíveis. Tenta novamente.","A atualizar…","Última atualização","Remover jogos terminados","A remover…","Os jogos terminados foram removidos.","Apenas os acompanhamentos com resultado confirmado serão removidos. As notificações continuam disponíveis."],
 de:["Meine verfolgten Tipps","Deine Tipps und bestätigten Ergebnisse an einem Ort.","Ursprüngliche Quote","Beginn","Ausstehend","Gewonnen","Verloren","Erstattet","Beginn innerhalb von 30 Minuten","Quote geändert","Ursprüngliche Quote","Aktuelle Quote","Aktualisierung bei geöffneter Seite. Quoten können sich ändern.","Noch keine verfolgten Tipps.","Tipps ansehen","Bis zu 200 aktive und 50 jüngste verfolgte Tipps.","Aktualisieren","Nicht verfügbar","Nicht mehr verfolgen","Auswahl","Markt","Benachrichtigungen nicht verfügbar. Erneut versuchen.","Wird aktualisiert…","Zuletzt aktualisiert","Beendete Spiele entfernen","Wird entfernt…","Beendete Spiele wurden entfernt.","Nur Tipps mit bestätigtem Ergebnis werden entfernt. Ergebnisbenachrichtigungen bleiben verfügbar."],
 ar:["توقعاتي المتابَعة","اختياراتك ونتائجها المؤكدة في مكان واحد.","المعامل الأصلي","البداية","قيد الانتظار","فائز","خاسر","مسترد","تبدأ خلال 30 دقيقة","تغير المعامل","المعامل الأصلي","المعامل الحالي","التحديث عند فتح الموقع. قد تتغير المعاملات.","لا توجد اختيارات متابَعة بعد.","استعرض التوقعات","حتى 200 متابعة نشطة و50 متابعة حديثة.","تحديث","غير متاح","إيقاف المتابعة","الاختيار","السوق","الإشعارات غير متاحة. حاول مجدداً.","جارٍ التحديث…","آخر تحديث","إزالة المباريات المنتهية","جارٍ الإزالة…","تمت إزالة المباريات المنتهية من المتابعة.","ستُزال المتابعات ذات النتائج المؤكدة فقط. تبقى إشعارات النتائج متاحة."]
};
function FollowedPicksContent() {
  const state = useContext(ResultNotificationsContext);
  const { language, locale, direction, bet, formatDate, t } = usePageLanguage();
  const w = FOLLOW_PAGE_TEXT[language] || FOLLOW_PAGE_TEXT.fr;
  const rows = Array.isArray(state?.follows) ? state.follows : [];
  const [filter, setFilter] = useState("all");
  const resolvedCount = rows.filter(row => row.state === "resolved").length;
  const stamp = value => Date.parse(value || "") || 0;
  const visible = rows.filter(row => filter === "all" || (row.state === "resolved") === (filter === "resolved"))
    .sort((a, b) => Number(a.state === "resolved") - Number(b.state === "resolved")
      || (a.state === "resolved" ? stamp(b.commence_time) - stamp(a.commence_time) : stamp(a.commence_time) - stamp(b.commence_time)));
  const clearing = Boolean(state?.busy.has("clear-resolved"));
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? formatDate(value,{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "—";
  const odds = value => value != null && Number.isFinite(Number(value)) && Number(value)>1 ? new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:3}).format(Number(value)) : "—";
  return <main dir={direction} className="mx-auto max-w-5xl min-w-0 px-4 py-7 pb-24" data-testid="follow-centre">
    <header className="mb-6 rounded-3xl bg-slate-950 p-5 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-wider text-orange-300">WinPulse</p><h1 className="mt-2 text-2xl font-extrabold sm:text-4xl">{w[0]}</h1><p className="mt-2 text-sm leading-6 text-slate-300">{w[1]}</p><p className="mt-2 text-xs text-slate-400">{w[12]}</p></header>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">{w[15]}</p><button type="button" data-testid="follow-refresh" disabled={Boolean(state?.loading)} aria-busy={Boolean(state?.loading)} onClick={()=>state?.refresh(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-orange-700 disabled:opacity-60">{state?.loading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{state?.loading ? w[22] : w[16]}</button></div>
    <nav className="mb-4 flex flex-wrap items-center gap-2" aria-label={t("Filtrer le suivi")}>
      {[["all", "Tout", rows.length], ["active", "À suivre", rows.length - resolvedCount], ["resolved", "Résultats confirmés", resolvedCount]].map(([key, label, count]) =>
        <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold", filter === key ? "border-orange-500 text-orange-700" : "border-slate-200 text-slate-600")}>{t(label)} · {count}</button>)}
      <Link to="/app/aujourdhui" className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-orange-700">{t("Voir les sélections")} →</Link>
    </nav>
    {resolvedCount > 0 && <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <button type="button" data-testid="clear-resolved-follows" disabled={clearing || state?.loading} aria-busy={clearing} onClick={async () => { if (await state.clearResolved()) toast.success(w[26]); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto">{clearing && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{clearing ? w[25] : w[24]}</button>
      <p className="mt-2 text-sm leading-6 text-slate-500">{w[27]}</p>
    </section>}
    {state?.lastUpdated && <p role="status" aria-live="polite" className="mb-3 text-xs text-slate-500">{w[23]} : {date(state.lastUpdated)}</p>}
    {state?.failed && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm">{w[21]}</p>}
    {state?.loading && !rows.length ? <p role="status" className="p-5">…</p> : !rows.length ? <div className="rounded-2xl border border-dashed p-6 text-center"><p>{w[13]}</p><Link to="/app" className="mt-4 inline-flex min-h-11 items-center font-bold text-orange-700">{w[14]} →</Link></div> : !visible.length ? <p className="py-5 text-sm text-slate-600">{t("Aucune sélection dans ce filtre.")}</p> : <div className="grid min-w-0 gap-3 md:grid-cols-2">{visible.map(row=>{
      const outcome = row.state !== "resolved" ? w[4] : row.result === "won" ? w[5] : row.result === "lost" ? w[6] : row.result === "void" ? w[7] : w[4];
      const confirmed = state.items.find(item => item.id === row.id);
      return <article key={row.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${row.result === "won" ? "bg-emerald-100 text-emerald-800" : row.result === "lost" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{outcome}</span><span className="text-xs text-slate-500">{w[3]} : {date(row.commence_time)}</span></div><h2 className="mt-3 break-words font-bold text-slate-900"><bdi>{row.home_team} vs {row.away_team}</bdi></h2><p className="mt-2 break-words text-sm font-semibold text-orange-700">{w[19]} : <bdi>{bet(row.pick)}</bdi></p><p className="mt-1 text-sm text-slate-600">{w[20]} : {bet(row.market_label || row.market || "—")}</p><p className="mt-2 text-sm text-slate-600">{w[2]} : <bdi className="font-mono font-bold">{odds(row.pick_odds)}</bdi>{row.best_bookmaker && <> · {row.best_bookmaker}</>}</p>
      {confirmed?.final_score && <p className="mt-2 text-sm text-slate-600">{t("Score final")} : <bdi className="font-mono font-bold">{confirmed.final_score}</bdi></p>}
      {(Array.isArray(row.alerts) ? row.alerts : []).map((alert,index)=><p key={index} className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">{alert.type === "kickoff_soon" ? w[8] : alert.type === "odds_changed" ? `${w[9]} : ${odds(alert.initial_odds)} → ${odds(alert.current_odds)}` : ""}</p>)}
      {row.state === "following" && <button type="button" disabled={state.busy.has(`unfollow:${row.id}`)} onClick={()=>state.unfollow(row.id)} className="mt-3 min-h-11 text-sm font-semibold text-slate-500 underline">{w[18]}</button>}</article>;
    })}</div>}
  </main>;
}
export function FollowedPicksPage() { return <AppLayout><FollowedPicksContent /></AppLayout>; }

const EXPERIENCE_TEXT = {
  "fr": {
    "home": "Accueil",
    "today": "Aujourd’hui",
    "explore": "Explorer",
    "follow": "Mon suivi",
    "results": "Résultats",
    "account": "Mon compte",
    "hello": "Ton sport, à ta façon.",
    "homeIntro": "Retrouve tes compétitions, les prochains matchs et les sélections que tu suis.",
    "preferences": "Personnaliser mon accueil",
    "sports": "Mes sports",
    "leagues": "Mes compétitions",
    "preferenceHint": "Sans préférence, tous les sports restent proposés. Ces choix ne suppriment aucun match du catalogue.",
    "save": "Enregistrer",
    "saving": "Enregistrement…",
    "saved": "Préférences enregistrées.",
    "error": "Impossible de charger ou enregistrer les données. Réessaie.",
    "next": "À suivre prochainement",
    "emptyFollow": "Enregistre une sélection avant le début du match pour retrouver son résultat ici.",
    "forYou": "Dans tes compétitions",
    "upcoming": "Prochaines rencontres",
    "allMatches": "Toutes les rencontres",
    "emptyMatches": "Aucune rencontre à venir dans cette vue. Le catalogue complet reste accessible.",
    "lastResults": "Derniers résultats de ton suivi",
    "pending": "En attente de confirmation",
    "won": "Gagné",
    "lost": "Perdu",
    "void": "Remboursé",
    "noResults": "Les résultats confirmés, gagnants et perdants, apparaîtront ici.",
    "free": "Découverte gratuite",
    "pro": "WinPulse Pro",
    "proTitle": "Plus de profondeur. Moins de recherche.",
    "proIntro": "Explore les sélections accessibles avec Pro, organise tes recherches et compare les données disponibles.",
    "upgrade": "Découvrir Pro",
    "exploreIntro": "Un outil pour chaque besoin. Choisis ton parcours.",
    "combos": "Combinés",
    "comboIntro": "Consulte les propositions, personnalise un ticket ou choisis toi-même les rencontres.",
    "recommendations": "Propositions WinPulse",
    "recommendationsText": "Prudent, Équilibré et Jackpot : selon les sélections disponibles, sans remplir les tickets artificiellement.",
    "personal": "Selon mes préférences",
    "personalText": "Période, sports et bookmaker : le moteur recherche un regroupement compatible.",
    "builder": "Mon combiné",
    "builderText": "Tu choisis chaque rencontre et chaque marché. Retrouve ensuite tes tickets enregistrés.",
    "montante": "Montante",
    "montanteText": "Un parcours par étapes, avec résultats confirmés et historique des réussites comme des échecs.",
    "live": "En direct",
    "liveText": "Consulte les scores transmis par les fournisseurs.",
    "value": "Value bets",
    "valueText": "Compare estimation et cote. Un écart estimé ne garantit pas un résultat.",
    "open": "Ouvrir",
    "note": "18+ · Aucun gain garanti. Les résultats passés ne garantissent pas les résultats futurs.",
    "initialOdds": "Cote initiale",
    "savedSearches": "Mes recherches enregistrées",
    "saveSearch": "Enregistrer cette recherche",
    "searchName": "Nom de la recherche",
    "delete": "Supprimer",
    "apply": "Appliquer",
    "searchLimit": "3 recherches avec Free, 8 avec Pro.",
    "pause": "Mettre mon suivi de la série en pause",
    "resume": "Reprendre mon suivi",
    "pauseHint": "Préférence personnelle : la série publique et ses résultats continuent. Aucune mise ni opération chez un bookmaker n’est effectuée.",
    "paused": "Ton suivi personnel est en pause.",
    "compare": "Free ou Pro : compare concrètement",
    "feature": "Fonction",
    "selections": "Sélections",
    "freeSelections": "Aperçus selon disponibilité",
    "paidSelections": "Toutes celles incluses dans Pro",
    "history": "Historique public complet",
    "availableData": "Statistiques selon couverture",
    "included": "Inclus",
    "preview": "Aperçu",
    "period": "Accès pendant 30 jours, sans reconduction automatique actuellement.",
    "payment": "Les moyens disponibles sont présentés lors du paiement.",
    "coverage": "La couverture varie selon les sports et compétitions. Les informations manquantes ne sont pas inventées.",
    "previewExample": "Avant de choisir, ouvre une vraie fiche découverte.",
    "soccer": "Football",
    "basketball": "Basketball",
    "tennis": "Tennis",
    "icehockey": "Hockey",
    "americanfootball": "Football américain",
    "baseball": "Baseball",
    "other": "Autres sports",
    "usage": "Navigation des 30 derniers jours",
    "usageNote": "Compteurs de navigation, pas des visiteurs uniques ni des paiements confirmés.",
    "heroOne": "Tes matchs. Tes analyses.",
    "heroTwo": "Une vision plus claire.",
    "heroIntro": "Explore les pronostics, compare les données disponibles et suis chaque sélection jusqu’au résultat.",
    "modelAudit": "Moteur : observation progressive",
    "modelNote": "Le modèle expérimental est comparé au moteur actuel. Aucune promotion automatique ni suppression de matchs. Un petit échantillon ne permet pas de conclure.",
    "modelSamples": "Matchs réglés observés",
    "modelBase": "Moteur actuel · Brier",
    "modelTest": "Modèle expérimental · Brier",
    "modelMetric": "Le score de Brier mesure l’erreur des probabilités ; plus bas est préférable. Ce n’est ni un taux de gain ni une garantie de rentabilité.",
    "mma": "MMA"
  },
  "en": {
    "home": "Home",
    "today": "Today",
    "explore": "Explore",
    "follow": "My follows",
    "results": "Results",
    "account": "My account",
    "hello": "Your sports, your way.",
    "homeIntro": "Your competitions, upcoming matches and followed selections in one place.",
    "preferences": "Personalize my home",
    "sports": "My sports",
    "leagues": "My competitions",
    "preferenceHint": "With no preferences, all sports are suggested. These choices never remove catalogue matches.",
    "save": "Save",
    "saving": "Saving…",
    "saved": "Preferences saved.",
    "error": "Unable to load or save data. Try again.",
    "next": "Coming up in your follows",
    "emptyFollow": "Follow a selection before kickoff to find its result here.",
    "forYou": "Your competitions",
    "upcoming": "Upcoming matches",
    "allMatches": "All matches",
    "emptyMatches": "No upcoming matches in this view. The full catalogue remains available.",
    "lastResults": "Latest results from your follows",
    "pending": "Awaiting confirmation",
    "won": "Won",
    "lost": "Lost",
    "void": "Refunded",
    "noResults": "Confirmed wins and losses will appear here.",
    "free": "Free discovery",
    "pro": "WinPulse Pro",
    "proTitle": "More depth. Less searching.",
    "proIntro": "Explore Pro selections, organize your searches and compare available data.",
    "upgrade": "Explore Pro",
    "exploreIntro": "A tool for each need. Choose your path.",
    "combos": "Combinations",
    "comboIntro": "Browse proposals, personalize a ticket or choose matches yourself.",
    "recommendations": "WinPulse proposals",
    "recommendationsText": "Cautious, Balanced and Jackpot: based on available selections, without padding tickets.",
    "personal": "Based on my preferences",
    "personalText": "Period, sports and bookmaker: the engine looks for compatible selections.",
    "builder": "My combination",
    "builderText": "Choose every match and market, then find your saved tickets.",
    "montante": "Step-by-step series",
    "montanteText": "A series of stages with confirmed results, including wins and losses.",
    "live": "Live",
    "liveText": "View scores reported by providers.",
    "value": "Value bets",
    "valueText": "Compare estimates and odds. An estimated edge does not guarantee an outcome.",
    "open": "Open",
    "note": "18+ · No guaranteed winnings. Past results do not guarantee future results.",
    "initialOdds": "Original odds",
    "savedSearches": "My saved searches",
    "saveSearch": "Save this search",
    "searchName": "Search name",
    "delete": "Delete",
    "apply": "Apply",
    "searchLimit": "3 searches with Free, 8 with Pro.",
    "pause": "Pause my series follow",
    "resume": "Resume my follow",
    "pauseHint": "Personal preference: the public series and results continue. No stake or bookmaker operation is made.",
    "paused": "Your personal follow is paused.",
    "compare": "Free or Pro: compare the difference",
    "feature": "Feature",
    "selections": "Selections",
    "freeSelections": "Previews subject to availability",
    "paidSelections": "All selections included in Pro",
    "history": "Full public history",
    "availableData": "Statistics subject to coverage",
    "included": "Included",
    "preview": "Preview",
    "period": "30-day access, currently without automatic renewal.",
    "payment": "Available methods are shown at checkout.",
    "coverage": "Coverage varies by sport and competition. Missing information is never invented.",
    "previewExample": "Before choosing, open a real discovery preview.",
    "soccer": "Football",
    "basketball": "Basketball",
    "tennis": "Tennis",
    "icehockey": "Hockey",
    "americanfootball": "American football",
    "baseball": "Baseball",
    "other": "Other sports",
    "usage": "Navigation over the last 30 days",
    "usageNote": "Navigation counts, not unique visitors or confirmed payments.",
    "heroOne": "Your matches. Your analysis.",
    "heroTwo": "A clearer picture.",
    "heroIntro": "Explore predictions, compare available data and follow each selection through to its result.",
    "modelAudit": "Engine: progressive observation",
    "modelNote": "The experimental model is compared with the current engine. No automatic promotion or match removal. Small samples do not support conclusions.",
    "modelSamples": "Settled matches observed",
    "modelBase": "Current engine · Brier",
    "modelTest": "Experimental model · Brier",
    "modelMetric": "Brier score measures probability error; lower is better. It is neither a win rate nor a profitability guarantee.",
    "mma": "MMA"
  },
  "es": {
    "home": "Inicio",
    "today": "Hoy",
    "explore": "Explorar",
    "follow": "Mi seguimiento",
    "results": "Resultados",
    "account": "Mi cuenta",
    "hello": "Tu deporte, a tu manera.",
    "homeIntro": "Tus competiciones, próximos partidos y selecciones seguidas en un solo lugar.",
    "preferences": "Personalizar inicio",
    "sports": "Mis deportes",
    "leagues": "Mis competiciones",
    "preferenceHint": "Sin preferencias, se muestran todos los deportes. No se eliminan partidos del catálogo.",
    "save": "Guardar",
    "saving": "Guardando…",
    "saved": "Preferencias guardadas.",
    "error": "No se pudieron cargar o guardar los datos. Reintenta.",
    "next": "Próximos en tu seguimiento",
    "emptyFollow": "Sigue una selección antes del inicio para ver aquí su resultado.",
    "forYou": "Tus competiciones",
    "upcoming": "Próximos partidos",
    "allMatches": "Todos los partidos",
    "emptyMatches": "No hay próximos partidos en esta vista. El catálogo completo sigue disponible.",
    "lastResults": "Últimos resultados seguidos",
    "pending": "Pendiente de confirmación",
    "won": "Ganado",
    "lost": "Perdido",
    "void": "Reembolsado",
    "noResults": "Los aciertos y pérdidas confirmados aparecerán aquí.",
    "free": "Descubrimiento gratuito",
    "pro": "WinPulse Pro",
    "proTitle": "Más profundidad. Menos búsqueda.",
    "proIntro": "Explora selecciones Pro, organiza búsquedas y compara los datos disponibles.",
    "upgrade": "Descubrir Pro",
    "exploreIntro": "Una herramienta para cada necesidad. Elige tu camino.",
    "combos": "Combinadas",
    "comboIntro": "Consulta propuestas, personaliza un boleto o elige tus partidos.",
    "recommendations": "Propuestas WinPulse",
    "recommendationsText": "Prudente, Equilibrada y Jackpot: según selecciones disponibles, sin rellenar boletos.",
    "personal": "Según mis preferencias",
    "personalText": "Periodo, deportes y operador: el motor busca selecciones compatibles.",
    "builder": "Mi combinada",
    "builderText": "Elige cada partido y mercado y recupera tus boletos guardados.",
    "montante": "Serie por etapas",
    "montanteText": "Un recorrido por etapas con resultados confirmados, incluidos aciertos y fallos.",
    "live": "En directo",
    "liveText": "Consulta marcadores de los proveedores.",
    "value": "Value bets",
    "valueText": "Compara estimaciones y cuotas. Una ventaja estimada no garantiza un resultado.",
    "open": "Abrir",
    "note": "18+ · Sin ganancias garantizadas. Los resultados pasados no garantizan resultados futuros.",
    "initialOdds": "Cuota inicial",
    "savedSearches": "Mis búsquedas guardadas",
    "saveSearch": "Guardar esta búsqueda",
    "searchName": "Nombre de búsqueda",
    "delete": "Eliminar",
    "apply": "Aplicar",
    "searchLimit": "3 búsquedas con Free, 8 con Pro.",
    "pause": "Pausar mi seguimiento de la serie",
    "resume": "Reanudar mi seguimiento",
    "pauseHint": "Preferencia personal: la serie pública y sus resultados continúan. No se realizan apuestas ni operaciones.",
    "paused": "Tu seguimiento personal está en pausa.",
    "compare": "Free o Pro: compara las diferencias",
    "feature": "Función",
    "selections": "Selecciones",
    "freeSelections": "Vistas previas según disponibilidad",
    "paidSelections": "Todas las incluidas en Pro",
    "history": "Historial público completo",
    "availableData": "Estadísticas según cobertura",
    "included": "Incluido",
    "preview": "Vista previa",
    "period": "Acceso de 30 días, actualmente sin renovación automática.",
    "payment": "Los métodos disponibles se muestran al pagar.",
    "coverage": "La cobertura varía según deporte y competición. No se inventan datos ausentes.",
    "previewExample": "Antes de elegir, abre una ficha gratuita real.",
    "soccer": "Fútbol",
    "basketball": "Baloncesto",
    "tennis": "Tenis",
    "icehockey": "Hockey",
    "americanfootball": "Fútbol americano",
    "baseball": "Béisbol",
    "other": "Otros deportes",
    "usage": "Navegación de los últimos 30 días",
    "usageNote": "Contadores de navegación, no visitantes únicos ni pagos confirmados.",
    "heroOne": "Tus partidos. Tus análisis.",
    "heroTwo": "Una visión más clara.",
    "heroIntro": "Explora pronósticos, compara datos disponibles y sigue cada selección hasta el resultado.",
    "modelAudit": "Motor: observación progresiva",
    "modelNote": "El modelo experimental se compara con el actual. Sin promoción automática ni eliminación de partidos. Una muestra pequeña no permite concluir.",
    "modelSamples": "Partidos resueltos observados",
    "modelBase": "Motor actual · Brier",
    "modelTest": "Modelo experimental · Brier",
    "modelMetric": "Brier mide el error de probabilidades; menor es mejor. No es una tasa de acierto ni una garantía de rentabilidad.",
    "mma": "MMA"
  },
  "pt": {
    "home": "Início",
    "today": "Hoje",
    "explore": "Explorar",
    "follow": "O meu acompanhamento",
    "results": "Resultados",
    "account": "A minha conta",
    "hello": "O teu desporto, à tua maneira.",
    "homeIntro": "As tuas competições, próximos jogos e seleções seguidas num só lugar.",
    "preferences": "Personalizar início",
    "sports": "Os meus desportos",
    "leagues": "As minhas competições",
    "preferenceHint": "Sem preferências, todos os desportos são apresentados. Nenhum jogo é removido do catálogo.",
    "save": "Guardar",
    "saving": "A guardar…",
    "saved": "Preferências guardadas.",
    "error": "Não foi possível carregar ou guardar. Tenta novamente.",
    "next": "A seguir em breve",
    "emptyFollow": "Segue uma seleção antes do início para veres aqui o resultado.",
    "forYou": "Nas tuas competições",
    "upcoming": "Próximos jogos",
    "allMatches": "Todos os jogos",
    "emptyMatches": "Não há próximos jogos nesta vista. O catálogo completo continua disponível.",
    "lastResults": "Últimos resultados seguidos",
    "pending": "Aguarda confirmação",
    "won": "Ganho",
    "lost": "Perdido",
    "void": "Reembolsado",
    "noResults": "Os ganhos e perdas confirmados aparecem aqui.",
    "free": "Descoberta gratuita",
    "pro": "WinPulse Pro",
    "proTitle": "Mais profundidade. Menos pesquisa.",
    "proIntro": "Explora seleções Pro, organiza pesquisas e compara os dados disponíveis.",
    "upgrade": "Descobrir Pro",
    "exploreIntro": "Uma ferramenta para cada necessidade. Escolhe o teu caminho.",
    "combos": "Combinadas",
    "comboIntro": "Consulta propostas, personaliza um bilhete ou escolhe os teus jogos.",
    "recommendations": "Propostas WinPulse",
    "recommendationsText": "Prudente, Equilibrado e Jackpot: conforme seleções disponíveis, sem preencher artificialmente.",
    "personal": "Segundo as minhas preferências",
    "personalText": "Período, desportos e operador: o motor procura seleções compatíveis.",
    "builder": "A minha combinada",
    "builderText": "Escolhe cada jogo e mercado e consulta os bilhetes guardados.",
    "montante": "Série por etapas",
    "montanteText": "Um percurso por etapas com resultados confirmados, incluindo ganhos e perdas.",
    "live": "Em direto",
    "liveText": "Consulta os resultados dos fornecedores.",
    "value": "Value bets",
    "valueText": "Compara estimativas e cotas. Uma vantagem estimada não garante um resultado.",
    "open": "Abrir",
    "note": "18+ · Sem ganhos garantidos. Os resultados passados não garantem resultados futuros.",
    "initialOdds": "Cota inicial",
    "savedSearches": "As minhas pesquisas guardadas",
    "saveSearch": "Guardar esta pesquisa",
    "searchName": "Nome da pesquisa",
    "delete": "Eliminar",
    "apply": "Aplicar",
    "searchLimit": "3 pesquisas com Free, 8 com Pro.",
    "pause": "Pausar o meu acompanhamento da série",
    "resume": "Retomar o meu acompanhamento",
    "pauseHint": "Preferência pessoal: a série pública e os resultados continuam. Não são feitas apostas nem operações.",
    "paused": "O teu acompanhamento pessoal está em pausa.",
    "compare": "Free ou Pro: compara as diferenças",
    "feature": "Funcionalidade",
    "selections": "Seleções",
    "freeSelections": "Prévias conforme disponibilidade",
    "paidSelections": "Todas as incluídas no Pro",
    "history": "Histórico público completo",
    "availableData": "Estatísticas conforme cobertura",
    "included": "Incluído",
    "preview": "Prévia",
    "period": "Acesso por 30 dias, atualmente sem renovação automática.",
    "payment": "Os métodos disponíveis são apresentados no pagamento.",
    "coverage": "A cobertura varia por desporto e competição. Não se inventam dados em falta.",
    "previewExample": "Antes de escolher, abre uma ficha gratuita real.",
    "soccer": "Futebol",
    "basketball": "Basquetebol",
    "tennis": "Ténis",
    "icehockey": "Hóquei",
    "americanfootball": "Futebol americano",
    "baseball": "Basebol",
    "other": "Outros desportos",
    "usage": "Navegação dos últimos 30 dias",
    "usageNote": "Contagens de navegação, não visitantes únicos nem pagamentos confirmados.",
    "heroOne": "Os teus jogos. As tuas análises.",
    "heroTwo": "Uma visão mais clara.",
    "heroIntro": "Explora palpites, compara os dados disponíveis e segue cada seleção até ao resultado.",
    "modelAudit": "Motor: observação progressiva",
    "modelNote": "O modelo experimental é comparado com o atual. Sem promoção automática nem remoção de jogos. Uma amostra pequena não permite concluir.",
    "modelSamples": "Jogos resolvidos observados",
    "modelBase": "Motor atual · Brier",
    "modelTest": "Modelo experimental · Brier",
    "modelMetric": "Brier mede o erro das probabilidades; mais baixo é melhor. Não é uma taxa de acerto nem uma garantia de rentabilidade.",
    "mma": "MMA"
  },
  "de": {
    "home": "Start",
    "today": "Heute",
    "explore": "Entdecken",
    "follow": "Meine Tipps",
    "results": "Ergebnisse",
    "account": "Mein Konto",
    "hello": "Dein Sport. Dein Überblick.",
    "homeIntro": "Deine Wettbewerbe, kommenden Spiele und verfolgten Tipps an einem Ort.",
    "preferences": "Startseite anpassen",
    "sports": "Meine Sportarten",
    "leagues": "Meine Wettbewerbe",
    "preferenceHint": "Ohne Auswahl werden alle Sportarten vorgeschlagen. Kein Spiel wird aus dem Katalog entfernt.",
    "save": "Speichern",
    "saving": "Speichern…",
    "saved": "Einstellungen gespeichert.",
    "error": "Daten konnten nicht geladen oder gespeichert werden. Erneut versuchen.",
    "next": "Demnächst in deinen Tipps",
    "emptyFollow": "Verfolge einen Tipp vor Spielbeginn, um hier das Ergebnis zu sehen.",
    "forYou": "Deine Wettbewerbe",
    "upcoming": "Kommende Spiele",
    "allMatches": "Alle Spiele",
    "emptyMatches": "Keine kommenden Spiele in dieser Ansicht. Der vollständige Katalog bleibt verfügbar.",
    "lastResults": "Neueste Ergebnisse deiner Tipps",
    "pending": "Bestätigung ausstehend",
    "won": "Gewonnen",
    "lost": "Verloren",
    "void": "Erstattet",
    "noResults": "Bestätigte Gewinne und Verluste erscheinen hier.",
    "free": "Kostenlos entdecken",
    "pro": "WinPulse Pro",
    "proTitle": "Mehr Tiefe. Weniger Suchen.",
    "proIntro": "Entdecke Pro-Tipps, organisiere Suchen und vergleiche verfügbare Daten.",
    "upgrade": "Pro entdecken",
    "exploreIntro": "Für jeden Bedarf ein Werkzeug. Wähle deinen Weg.",
    "combos": "Kombis",
    "comboIntro": "Vorschläge ansehen, einen Schein anpassen oder Spiele selbst wählen.",
    "recommendations": "WinPulse-Vorschläge",
    "recommendationsText": "Vorsichtig, Ausgewogen und Jackpot: nach verfügbaren Tipps, ohne künstlich aufzufüllen.",
    "personal": "Nach meinen Einstellungen",
    "personalText": "Zeitraum, Sportarten und Anbieter: die Suche berücksichtigt die Kompatibilität.",
    "builder": "Meine Kombi",
    "builderText": "Wähle Spiele und Märkte selbst und finde gespeicherte Scheine wieder.",
    "montante": "Etappenserie",
    "montanteText": "Eine Etappenserie mit bestätigten Gewinnen und Verlusten.",
    "live": "Live",
    "liveText": "Sieh die von Anbietern gemeldeten Spielstände.",
    "value": "Value Bets",
    "valueText": "Vergleiche Schätzungen und Quoten. Ein geschätzter Vorteil garantiert kein Ergebnis.",
    "open": "Öffnen",
    "note": "18+ · Keine garantierten Gewinne. Vergangene Ergebnisse garantieren keine künftigen Ergebnisse.",
    "initialOdds": "Ursprüngliche Quote",
    "savedSearches": "Meine gespeicherten Suchen",
    "saveSearch": "Diese Suche speichern",
    "searchName": "Name der Suche",
    "delete": "Löschen",
    "apply": "Anwenden",
    "searchLimit": "3 Suchen mit Free, 8 mit Pro.",
    "pause": "Meine Serienverfolgung pausieren",
    "resume": "Meine Verfolgung fortsetzen",
    "pauseHint": "Persönliche Einstellung: die öffentliche Serie läuft weiter. Es werden keine Einsätze oder Buchmacheraktionen ausgeführt.",
    "paused": "Deine persönliche Verfolgung ist pausiert.",
    "compare": "Free oder Pro: konkret vergleichen",
    "feature": "Funktion",
    "selections": "Tipps",
    "freeSelections": "Vorschauen nach Verfügbarkeit",
    "paidSelections": "Alle in Pro enthaltenen Tipps",
    "history": "Vollständiger öffentlicher Verlauf",
    "availableData": "Statistiken nach Abdeckung",
    "included": "Enthalten",
    "preview": "Vorschau",
    "period": "30 Tage Zugang, derzeit ohne automatische Verlängerung.",
    "payment": "Verfügbare Zahlungsarten werden beim Bezahlen angezeigt.",
    "coverage": "Die Abdeckung variiert nach Sport und Wettbewerb. Fehlende Daten werden nicht erfunden.",
    "previewExample": "Öffne vor deiner Entscheidung eine echte kostenlose Vorschau.",
    "soccer": "Fußball",
    "basketball": "Basketball",
    "tennis": "Tennis",
    "icehockey": "Eishockey",
    "americanfootball": "American Football",
    "baseball": "Baseball",
    "other": "Weitere Sportarten",
    "usage": "Navigation der letzten 30 Tage",
    "usageNote": "Navigationszähler, keine eindeutigen Besucher oder bestätigten Zahlungen.",
    "heroOne": "Deine Spiele. Deine Analysen.",
    "heroTwo": "Ein klarerer Überblick.",
    "heroIntro": "Entdecke Tipps, vergleiche verfügbare Daten und verfolge jede Auswahl bis zum Ergebnis.",
    "modelAudit": "Modell: schrittweise Beobachtung",
    "modelNote": "Das experimentelle Modell wird mit dem aktuellen verglichen. Keine automatische Aktivierung oder Spielentfernung. Kleine Stichproben erlauben keine Schlussfolgerung.",
    "modelSamples": "Beobachtete abgerechnete Spiele",
    "modelBase": "Aktuelles Modell · Brier",
    "modelTest": "Experimentelles Modell · Brier",
    "modelMetric": "Der Brier-Wert misst den Wahrscheinlichkeitsfehler; niedriger ist besser. Keine Gewinnquote oder Rentabilitätsgarantie.",
    "mma": "MMA"
  },
  "ar": {
    "home": "الرئيسية",
    "today": "اليوم",
    "explore": "استكشاف",
    "follow": "متابعتي",
    "results": "النتائج",
    "account": "حسابي",
    "hello": "رياضتك على طريقتك.",
    "homeIntro": "بطولاتك ومبارياتك القادمة واختياراتك المتابعة في مكان واحد.",
    "preferences": "تخصيص الرئيسية",
    "sports": "رياضاتي",
    "leagues": "بطولاتي",
    "preferenceHint": "دون تفضيلات تُقترح كل الرياضات. لا تُحذف أي مباراة من القائمة.",
    "save": "حفظ",
    "saving": "جارٍ الحفظ…",
    "saved": "تم حفظ التفضيلات.",
    "error": "تعذر تحميل البيانات أو حفظها. حاول مجدداً.",
    "next": "قريباً في متابعتك",
    "emptyFollow": "تابع اختياراً قبل بداية المباراة لتجد نتيجته هنا.",
    "forYou": "ضمن بطولاتك",
    "upcoming": "المباريات القادمة",
    "allMatches": "كل المباريات",
    "emptyMatches": "لا توجد مباريات قادمة في هذا العرض. تبقى القائمة الكاملة متاحة.",
    "lastResults": "آخر نتائج متابعتك",
    "pending": "بانتظار التأكيد",
    "won": "فائز",
    "lost": "خاسر",
    "void": "مسترد",
    "noResults": "ستظهر هنا النتائج المؤكدة الفائزة والخاسرة.",
    "free": "اكتشاف مجاني",
    "pro": "WinPulse Pro",
    "proTitle": "تفاصيل أكثر. بحث أقل.",
    "proIntro": "استعرض اختيارات Pro ونظّم بحثك وقارن البيانات المتاحة.",
    "upgrade": "اكتشف Pro",
    "exploreIntro": "أداة لكل حاجة. اختر مسارك.",
    "combos": "الرهانات المركبة",
    "comboIntro": "استعرض المقترحات أو خصّص بطاقة أو اختر المباريات بنفسك.",
    "recommendations": "مقترحات WinPulse",
    "recommendationsText": "حذر ومتوازن وجاكبوت حسب الاختيارات المتاحة دون إضافة مباريات لمجرد ملء البطاقة.",
    "personal": "حسب تفضيلاتي",
    "personalText": "الفترة والرياضات والمزود: يبحث المحرك عن اختيارات متوافقة.",
    "builder": "رهاني المركب",
    "builderText": "اختر كل مباراة وسوق ثم اعثر على بطاقاتك المحفوظة.",
    "montante": "سلسلة المراحل",
    "montanteText": "مسار بمراحل ونتائج مؤكدة يشمل النجاحات والإخفاقات.",
    "live": "مباشر",
    "liveText": "اطلع على النتائج التي يرسلها المزودون.",
    "value": "اختيارات القيمة",
    "valueText": "قارن التقدير بالمعامل. الفارق التقديري لا يضمن النتيجة.",
    "open": "فتح",
    "note": "للبالغين 18+ · لا أرباح مضمونة. النتائج السابقة لا تضمن النتائج المستقبلية.",
    "initialOdds": "المعامل الأصلي",
    "savedSearches": "عمليات بحثي المحفوظة",
    "saveSearch": "حفظ هذا البحث",
    "searchName": "اسم البحث",
    "delete": "حذف",
    "apply": "تطبيق",
    "searchLimit": "3 عمليات بحث مع Free و8 مع Pro.",
    "pause": "إيقاف متابعتي للسلسلة مؤقتاً",
    "resume": "استئناف متابعتي",
    "pauseHint": "تفضيل شخصي: تستمر السلسلة العامة ونتائجها. لا تُنفذ أي رهانات أو عمليات لدى مزود.",
    "paused": "متابعتك الشخصية متوقفة مؤقتاً.",
    "compare": "قارن عملياً بين Free وPro",
    "feature": "الميزة",
    "selections": "الاختيارات",
    "freeSelections": "معاينات حسب التوفر",
    "paidSelections": "كل الاختيارات المشمولة في Pro",
    "history": "السجل العام الكامل",
    "availableData": "إحصاءات حسب التغطية",
    "included": "مشمول",
    "preview": "معاينة",
    "period": "وصول لمدة 30 يوماً دون تجديد تلقائي حالياً.",
    "payment": "تظهر وسائل الدفع المتاحة عند الدفع.",
    "coverage": "تختلف التغطية حسب الرياضة والبطولة ولا تُختلق المعلومات الناقصة.",
    "previewExample": "قبل الاختيار افتح معاينة مجانية حقيقية.",
    "soccer": "كرة القدم",
    "basketball": "كرة السلة",
    "tennis": "التنس",
    "icehockey": "الهوكي",
    "americanfootball": "كرة القدم الأمريكية",
    "baseball": "البيسبول",
    "other": "رياضات أخرى",
    "usage": "التصفح خلال آخر 30 يوماً",
    "usageNote": "عدادات تصفح وليست زواراً فريدين أو مدفوعات مؤكدة.",
    "heroOne": "مبارياتك. تحليلاتك.",
    "heroTwo": "رؤية أوضح.",
    "heroIntro": "استعرض التوقعات وقارن البيانات المتاحة وتابع كل اختيار حتى النتيجة.",
    "modelAudit": "المحرك: متابعة تدريجية",
    "modelNote": "يُقارن النموذج التجريبي بالمحرك الحالي دون تفعيل تلقائي أو حذف مباريات. العينات الصغيرة لا تكفي للاستنتاج.",
    "modelSamples": "المباريات المرصودة التي سُويت نتائجها",
    "modelBase": "المحرك الحالي · Brier",
    "modelTest": "النموذج التجريبي · Brier",
    "modelMetric": "يقيس Brier خطأ الاحتمالات والأقل أفضل. ليس نسبة فوز ولا ضماناً للربحية.",
    "mma": "MMA"
  }
};
export function useExperienceCopy() { const { language } = useLanguage(); return EXPERIENCE_TEXT[language] || EXPERIENCE_TEXT.fr; }

const ExperienceContext = createContext(null);
const EXPERIENCE_EMPTY = { sports: [], leagues: [], saved_filters: [], montante_paused: false };
export function ExperienceProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.id || null;
  const owner = useRef(uid); owner.current = uid;
  const [state, setState] = useState({owner:null,value:EXPERIENCE_EMPTY});
  const [loading,setLoading]=useState(false), [busy,setBusy]=useState(false), [failed,setFailed]=useState(false), [attempt,setAttempt]=useState(0);
  const saveFlight=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    setState({owner:uid,value:EXPERIENCE_EMPTY});setFailed(false);setBusy(false);
    if (!uid) {setLoading(false);return ()=>controller.abort();}
    setLoading(true);
    api.get('/experience/preferences',{signal:controller.signal,timeout:12000}).then(({data})=>{
      if(!controller.signal.aborted && owner.current===uid) setState({owner:uid,value:{...EXPERIENCE_EMPTY,...data}});
    }).catch(()=>{if(!controller.signal.aborted && owner.current===uid)setFailed(true);}).finally(()=>{if(!controller.signal.aborted && owner.current===uid)setLoading(false);});
    return ()=>{controller.abort();saveFlight.current?.abort();saveFlight.current=null;};
  },[uid,attempt]);
  const value=state.owner===uid ? state.value : EXPERIENCE_EMPTY;
  const save=async patch=>{
    if(!uid || loading || failed || saveFlight.current) return false;
    const controller=new AbortController();saveFlight.current=controller;setBusy(true);
    try {
      const {data}=await api.put('/experience/preferences',{...value,...patch},{signal:controller.signal,timeout:12000});
      if(controller.signal.aborted || owner.current!==uid)return false;
      setState({owner:uid,value:{...EXPERIENCE_EMPTY,...data}});setFailed(false);return true;
    }catch{if(!controller.signal.aborted && owner.current===uid)setFailed(true);return false;}
    finally{if(saveFlight.current===controller){saveFlight.current=null;if(owner.current===uid)setBusy(false);}}
  };
  return <ExperienceContext.Provider value={{preferences:value,loading,busy,failed,save,retry:()=>setAttempt(v=>v+1)}}>{children}</ExperienceContext.Provider>;
}
export function useExperiencePreferences(){
 const state=useContext(ExperienceContext);
 if(!state)throw new Error('ExperienceProvider missing');
 return state;
}
export function useFollowedPicks(){return useContext(ResultNotificationsContext);}
export function useExperienceEvent(event){
 const {user}=useAuth();
 useEffect(()=>{if(user?.id && event)api.post('/experience/events',{event}).catch(()=>{});},[user?.id,event]);
}

export function ExperienceToolNav(){
 const w=useExperienceCopy();const {pathname}=useLocation();
 const tabs=[['/app/combines',w.combos],['/app/combines/recommandations',w.recommendations],['/app/combines/personnaliser',w.personal],['/app/builder',w.builder]];
 return <nav aria-label={w.combos} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2" data-testid="combination-tools-nav">{tabs.map(([to,label])=><Link key={to} to={to} aria-current={pathname===to?'page':undefined} className={`inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold ${pathname===to?'bg-slate-950 text-white':'text-slate-600 hover:bg-orange-50'}`}>{label}</Link>)}</nav>;
}


// Décor vectoriel original : aucun appel externe ni image de joueur sans licence.
export function StadiumBackdrop({ className = "" }) {
  const id = useId().replace(/:/g, "");
  return <svg className={`wp-stadium ${className}`} viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-sky`} cx="66%" cy="22%" r="80%"><stop stopColor="#25466a"/><stop offset=".55" stopColor="#101d32"/><stop offset="1" stopColor="#080f1b"/></radialGradient>
      <linearGradient id={`${id}-turf`} x2="0" y2="1"><stop stopColor="#174b43"/><stop offset="1" stopColor="#0a2727"/></linearGradient>
      <linearGradient id={`${id}-beam`} x2="0" y2="1"><stop stopColor="#d9efff" stopOpacity=".17"/><stop offset="1" stopColor="#d9efff" stopOpacity="0"/></linearGradient>
      <pattern id={`${id}-seats`} width="14" height="11" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.4" fill="#7898b6" opacity=".45"/><circle cx="10" cy="8" r="1" fill="#f5b877" opacity=".35"/></pattern>
    </defs>
    <rect width="1000" height="620" fill={`url(#${id}-sky)`}/>
    <path d="M-50 295 Q500 140 1050 295 L1050 430 Q500 235 -50 430Z" fill="#14253a"/>
    <path d="M-50 310 Q500 155 1050 310 L1050 420 Q500 255 -50 420Z" fill={`url(#${id}-seats)`}/>
    {[280,305,332,362].map(y=><path key={y} d={`M-30 ${y+35} Q500 ${y-95} 1030 ${y+35}`} stroke="#638098" strokeWidth="2" fill="none" opacity=".35"/>)}
    <path d="M-60 275 Q500 95 1060 275" stroke="#5d7e98" strokeWidth="7" fill="none" opacity=".45"/>
    <path d="M-60 280 Q500 100 1060 280" stroke="#d4ecff" strokeWidth="2" fill="none" opacity=".7"/>
    {[130,365,635,870].map((x,i)=><g key={x}><path d={`M${x} 195 L${x-180} 540 L${x+180} 540Z`} fill={`url(#${id}-beam)`}/><rect x={x-26} y={i===1||i===2?164:195} width="52" height="5" rx="2" fill="#e7f5ff" opacity=".9"/></g>)}
    <path d="M145 400 L855 400 L1120 660 L-120 660Z" fill={`url(#${id}-turf)`}/>
    {[0,1,2,3,4,5].map(i=><path key={i} d={`M${145+i*118} 400 L${204+i*118} 400 L${-17+i*207} 660 L${-120+i*207} 660Z`} fill="#6aaba0" opacity=".045"/>)}
    <path d="M185 416 L815 416 L970 595 L30 595Z M500 416 L500 595 M185 416 L245 486 L365 486 L340 416 M815 416 L755 486 L635 486 L660 416" stroke="#bfdad1" strokeWidth="2" opacity=".3" fill="none"/>
    <ellipse cx="500" cy="484" rx="75" ry="27" stroke="#bfdad1" strokeWidth="2" fill="none" opacity=".3"/>
    <circle cx="500" cy="484" r="2.5" fill="#bfdad1" opacity=".5"/>
  </svg>;
}


// User-controlled appearance, independent from subscriptions and predictions.
const AppearanceContext = createContext(null);
const APPEARANCE_COPY = {
 fr: ["Apparence", "Clair", "Sombre", "Automatique"], en: ["Appearance", "Light", "Dark", "Automatic"],
 es: ["Apariencia", "Claro", "Oscuro", "Automático"], pt: ["Aparência", "Claro", "Escuro", "Automático"],
 de: ["Darstellung", "Hell", "Dunkel", "Automatisch"], ar: ["المظهر", "فاتح", "داكن", "تلقائي"]
};
function readAppearance() {
 try { const value = localStorage.getItem("wnpulse_theme"); return ["light","dark","system"].includes(value) ? value : "light"; }
 catch { return "light"; }
}
export function initializeAppearance(preference = readAppearance()) {
 const choice = ["light","dark","system"].includes(preference) ? preference : "light";
 const resolved = choice === "system" ? (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
 if (typeof document !== "undefined") {
   document.documentElement.dataset.wpTheme = resolved;
   document.documentElement.style.colorScheme = resolved;
   document.documentElement.classList.toggle("dark", resolved === "dark");
 }
 return resolved;
}
export function AppearanceProvider({children}) {
 const [preference,setPreference] = useState(readAppearance);
 useEffect(() => {
   const apply = () => initializeAppearance(preference); apply();
   const media = window.matchMedia?.("(prefers-color-scheme: dark)");
   const changed = () => { if (preference === "system") apply(); };
   media?.addEventListener?.("change", changed);
   if (media && !media.addEventListener) media.addListener?.(changed);
   return () => { media?.removeEventListener?.("change",changed); if (media && !media.removeEventListener) media.removeListener?.(changed); };
 },[preference]);
 useEffect(() => {
   const sync = event => { if (event.key === "wnpulse_theme" || event.key === null) setPreference(readAppearance()); };
   window.addEventListener("storage",sync);return () => window.removeEventListener("storage",sync);
 },[]);
 const change = value => {
   if (!["light","dark","system"].includes(value)) return;
   initializeAppearance(value);setPreference(value);
   try { localStorage.setItem("wnpulse_theme",value); } catch { /* usable even when storage is blocked */ }
 };
 return <AppearanceContext.Provider value={{preference,change}}>{children}</AppearanceContext.Provider>;
}
export function AppearanceSwitcher() {
 const context = useContext(AppearanceContext);const {language} = usePageLanguage();
 const words = APPEARANCE_COPY[language] || APPEARANCE_COPY.fr;const id = useId();
 if (!context) return null;
 return <label htmlFor={id} className="wp-appearance"><span aria-hidden="true">◐</span><span className="sr-only">{words[0]}</span><select id={id} aria-label={words[0]} value={context.preference} onChange={event=>context.change(event.target.value)} data-testid="appearance-switcher">{["light","dark","system"].map((value,index)=><option key={value} value={value}>{words[index+1]}</option>)}</select></label>;
}

