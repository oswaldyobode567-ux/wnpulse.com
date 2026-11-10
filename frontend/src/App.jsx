import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import PageTracker from "@/components/PageTracker";
import { LanguageProvider, LanguageSwitcher, useLanguage, FollowedPicksPage, ExperienceProvider, useExperienceCopy } from "@/components/AppLayout";
import { Component, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import api from "@/lib/api";

const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const MatchCataloguePage = lazy(() => import("@/pages/DashboardPage").then(module=>({default:module.MatchCataloguePage})));
const ExplorePage = lazy(() => import("@/pages/DashboardPage").then(module=>({default:module.ExplorePage})));
const CombinationsHubPage = lazy(() => import("@/pages/DashboardPage").then(module=>({default:module.CombinationsHubPage})));
const MatchDetailPage = lazy(() => import("@/pages/MatchDetailPage"));
const CombosPage = lazy(() => import("@/pages/CombosPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const SubscriptionPage = lazy(() => import("@/pages/SubscriptionPage"));
const TopPicksPage = lazy(() => import("@/pages/TopPicksPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const TrackRecordPage = lazy(() => import("@/pages/TrackRecordPage"));
const ValueBetsPage = lazy(() => import("@/pages/ValueBetsPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const ParrainagePage = lazy(() => import("@/pages/ParrainagePage"));
const ComboBuilderPage = lazy(() => import("@/pages/ComboBuilderPage"));
const TodayCombosPage = lazy(() => import("@/pages/TodayCombosPage"));
const LivePage = lazy(() => import("@/pages/LivePage"));
const BlogPage = lazy(() => import("@/pages/BlogPage"));
const BlogPostPage = lazy(() => import("@/pages/BlogPostPage"));
const LegalPage = lazy(() => import("@/pages/LegalPage"));

const MontantePage = lazy(() => import("@/pages/MontanteRoute"));

function RequireAuth({
  children,
  admin = false
}) {
  const {
    t
  } = useLanguage();
  const {
    user,
    loading
  } = useAuth();
  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-neutral-50">
        <div className="text-slate-500 text-sm">
          {t("Chargement…")}
        </div>
      </div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (admin && !user.is_admin) {
    return <Navigate to="/app" replace />;
  }
  return children;
}

export default function App() {
  return <LanguageProvider>
    <AuthProvider>
      <ExperienceProvider>
      <BrowserRouter>
        <NavigationPositionMemory />
        <PublicLanguageBar />
        <RouteBoundary><Suspense fallback={<RouteLoading />}><Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          <Route path="/resultats" element={<TrackRecordPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/legal/:slug" element={<LegalPage />} />

          <Route path="/legal" element={<Navigate to="/legal/mentions-legales" replace />} />

          <Route path="/app" element={<RequireAuth>
                <DashboardPage />
              </RequireAuth>} />

          <Route path="/app/suivi" element={<RequireAuth><FollowedPicksPage /></RequireAuth>} />

          <Route path="/app/top" element={<RequireAuth>
                <TopPicksPage />
              </RequireAuth>} />

          <Route path="/app/value-bets" element={<RequireAuth>
                <ValueBetsPage />
              </RequireAuth>} />

          <Route path="/app/montante" element={<RequireAuth>
                <MontantePage />
              </RequireAuth>} />

          <Route path="/montante" element={<Navigate to="/app/montante" replace />} />

          <Route path="/app/profil" element={<RequireAuth>
                <ProfilePage />
              </RequireAuth>} />

          <Route path="/app/parrainage" element={<RequireAuth>
                <ParrainagePage />
              </RequireAuth>} />

          <Route path="/app/match/:matchId" element={<RequireAuth>
                <MatchDetailPage />
              </RequireAuth>} />

          <Route path="/app/explorer" element={<RequireAuth><ExplorePage /></RequireAuth>} />
          <Route path="/app/combines" element={<RequireAuth><CombinationsHubPage /></RequireAuth>} />
          <Route path="/app/combines/personnaliser" element={<RequireAuth><CombosPage /></RequireAuth>} />
          <Route path="/app/combines/recommandations" element={<RequireAuth><TodayCombosPage /></RequireAuth>} />

          <Route path="/app/builder" element={<RequireAuth>
                <ComboBuilderPage />
              </RequireAuth>} />

          <Route path="/app/aujourdhui" element={<RequireAuth><MatchCataloguePage /></RequireAuth>} />

          <Route path="/app/live" element={<RequireAuth>
                <LivePage />
              </RequireAuth>} />

          <Route path="/app/historique" element={<RequireAuth>
                <HistoryPage />
              </RequireAuth>} />

          <Route path="/app/abonnement" element={<RequireAuth>
                <SubscriptionPage />
              </RequireAuth>} />

          <Route path="/app/admin" element={<RequireAuth admin>
                <AdminPage />
              </RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></Suspense></RouteBoundary>

        <PageTracker />
        <QualitySignals />
        <ContextualWhatsAppWidget />
        <LocalizedToaster />
      </BrowserRouter>
      </ExperienceProvider>
    </AuthProvider>
    </LanguageProvider>;
}

function PublicLanguageBar() {
  const {
    pathname
  } = useLocation();
  const {
    t
  } = useLanguage();
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;
  return <div className="border-b border-neutral-200 bg-white px-4 py-2" data-testid="public-language-bar">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3">
      <span className="text-sm font-semibold text-slate-600">{t("Langue de l’interface")}</span>
      <LanguageSwitcher compact />
    </div>
  </div>;
}

function LocalizedToaster() {
  const {
    direction
  } = useLanguage();
  return <Toaster position={direction === "rtl" ? "top-left" : "top-right"} richColors />;
}



function RouteLoading(){const w=useExperienceCopy();return <div role="status" className="grid min-h-[65vh] place-items-center bg-neutral-50 p-6"><div className="text-center"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-orange-600 motion-reduce:animate-none"/><p className="mt-4 text-sm font-bold text-slate-600">WinPulse · {w.open}…</p></div></div>;}
class RouteErrorBoundary extends Component {
  componentDidCatch() { window.dispatchEvent(new Event('wnpulse:render-error')); }
 constructor(props){super(props);this.state={failed:false};}
 static getDerivedStateFromError(){return {failed:true};}
 componentDidUpdate(previous){if(previous.route!==this.props.route&&this.state.failed)this.setState({failed:false});}
 render(){return this.state.failed?<div role="alert" data-testid="route-error" className="mx-auto my-12 max-w-lg rounded-3xl border bg-white p-7"><h1 className="text-xl font-bold">WinPulse</h1><p className="mt-3 text-sm leading-6 text-slate-600">{this.props.words.error}</p><button type="button" onClick={()=>window.location.reload()} className="mt-4 min-h-11 rounded-xl bg-orange-600 px-5 font-bold text-white">↻ {this.props.words.open}</button><a href="/app" className="ms-4 inline-flex min-h-11 items-center font-bold text-orange-700">{this.props.words.home}</a></div>:this.props.children;}
}
function RouteBoundary({children}){const {pathname}=useLocation();const w=useExperienceCopy();return <RouteErrorBoundary route={pathname} words={w}>{children}</RouteErrorBoundary>;}

function ContextualWhatsAppWidget(){const {pathname}=useLocation();return pathname.startsWith('/app')&&!['/app/abonnement','/app/profil'].includes(pathname)?null:<WhatsAppWidget/>;}

function QualitySignals() {
  const {
    user
  } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (!user?.id) return undefined;
    let sent = 0;
    const route = location.pathname === '/app' ? 'home' : location.pathname.startsWith('/app/match/') ? 'match' : location.pathname.startsWith('/app/aujourdhui') ? 'catalogue' : location.pathname.startsWith('/app/suivi') ? 'follow' : location.pathname.startsWith('/app/abonnement') ? 'subscription' : location.pathname.includes('montante') ? 'montante' : location.pathname.includes('combin') || location.pathname.includes('builder') ? 'combos' : 'other';
    const report = event => {
      const reason = event.reason;
      if (reason?.name === 'AbortError' || reason?.name === 'CanceledError' || reason?.response?.status >= 400 && reason?.response?.status < 500 || sent >= 3) return;
      sent += 1;
      api.post('/experience/quality-event', {
        event: event.type === 'wnpulse:render-error' ? 'render_error' : 'runtime_error',
        route
      }, {
        timeout: 5000
      }).catch(() => {});
    };
    window.addEventListener('error', report);
    window.addEventListener('unhandledrejection', report);
    window.addEventListener('wnpulse:render-error', report);
    return () => {
      window.removeEventListener('error', report);
      window.removeEventListener('unhandledrejection', report);
      window.removeEventListener('wnpulse:render-error', report);
    };
  }, [user?.id, location.pathname]);
  return null;
}




// Session-only navigation memory. No prediction or account data is persisted.
export function NavigationPositionMemory() {
  const location=useLocation(), navigationType=useNavigationType();
  const {user}=useAuth();const previous=useRef(null);
  useLayoutEffect(()=>{
    const owner=String(user?.id || 'guest');
    const storageKey='wnpulse:navigation:v1:'+owner;
    const url=location.pathname+location.search;
    const identity=String(location.key || 'default')+'|'+url;
    const now=Date.now();let state={entries:{},urls:{}};
    try{const raw=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(raw&&raw.entries&&raw.urls)state=raw;}catch{}
    const from=previous.current;previous.current=url;
    const stored=(navigationType==='POP'?state.entries[identity]:null) ||
      (from?.startsWith('/app/match/')&&!location.pathname.startsWith('/app/match/')?state.urls[url]:null);
    const target=stored&&Number.isFinite(stored.y)&&stored.y>=0&&now-stored.at<21600000?stored:null;
    let active=true,restoring=Boolean(target),frame=0,timer=0,observer=null,resize=null,settledAt=0;
    let latest=target || {x:0,y:0,at:now,url};
    const priorMode=window.history.scrollRestoration;window.history.scrollRestoration='manual';
    const oldBehavior=document.documentElement.style.scrollBehavior;document.documentElement.style.scrollBehavior='auto';
    const persist=snapshot=>{
      try{
        state.entries[identity]=snapshot;state.urls[url]=snapshot;
        for(const name of ['entries','urls']){
          const rows=Object.entries(state[name]).filter(([,v])=>v&&Date.now()-v.at<21600000).sort((a,b)=>b[1].at-a[1].at).slice(0,40);
          state[name]=Object.fromEntries(rows);
        }
        sessionStorage.setItem(storageKey,JSON.stringify(state));
      }catch{}
    };
    const capture=clicked=>{
      if(restoring||!active)return;
      const cards=[...document.querySelectorAll('[data-navigation-match-id]')];
      const anchor=clicked?.getBoundingClientRect?clicked:cards.find(node=>{const r=node.getBoundingClientRect();return r.bottom>0&&r.top<window.innerHeight;});
      latest={x:window.scrollX||0,y:window.scrollY||0,at:Date.now(),url,
        anchor:anchor?{id:anchor.getAttribute('data-navigation-match-id'),occurrence:cards.filter(node=>node.getAttribute('data-navigation-match-id')===anchor.getAttribute('data-navigation-match-id')).indexOf(anchor),offset:anchor.getBoundingClientRect().top}:null};
      persist(latest);
    };
    const stopRestore=()=>{
      restoring=false;observer?.disconnect();resize?.disconnect();window.clearTimeout(timer);
      document.documentElement.style.scrollBehavior=oldBehavior;
    };
    const interrupted=()=>{if(restoring){stopRestore();capture();}};
    const restore=()=>{
      if(!active||!restoring)return;
      const matches=target.anchor?[...document.querySelectorAll('[data-navigation-match-id]')].filter(node=>node.getAttribute('data-navigation-match-id')===target.anchor.id):[];
      const anchor=matches[target.anchor?.occurrence||0]||matches[0];
      if(target.anchor&&!anchor)return;
      const y=anchor?Math.max(0,window.scrollY+anchor.getBoundingClientRect().top-target.anchor.offset):target.y;
      const height=Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0);
      if(!anchor&&height-window.innerHeight<y-2)return;
      window.scrollTo(target.x||0,y);
      if(Math.abs(window.scrollY-y)<=3){
        if(!settledAt)settledAt=Date.now();
        if(Date.now()-settledAt>=500){stopRestore();capture(anchor);}
      }else settledAt=0;
    };
    const scheduleRestore=()=>{if(!frame)frame=window.requestAnimationFrame(()=>{frame=0;restore();});};
    const onScroll=()=>{if(!restoring&&!frame)frame=window.requestAnimationFrame(()=>{frame=0;capture();});};
    const onClick=event=>{
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const link=event.target?.closest?.('a[href]');if(!link)return;
      capture(link.closest('[data-navigation-match-id]'));
    };
    if(target){
      observer=new MutationObserver(scheduleRestore);observer.observe(document.body,{childList:true,subtree:true});
      if(typeof ResizeObserver!=='undefined'){resize=new ResizeObserver(scheduleRestore);resize.observe(document.body);}
      const deadline=Date.now()+10000;
      const boundedTick=()=>{
        if(!active||!restoring)return;
        if(Date.now()>deadline){window.scrollTo(target.x||0,target.y);stopRestore();capture();return;}
        restore();if(restoring)timer=window.setTimeout(boundedTick,100);
      };
      boundedTick();
    }else if(!location.hash){window.scrollTo(0,0);document.documentElement.style.scrollBehavior=oldBehavior;}
    window.addEventListener('scroll',onScroll,{passive:true});
    document.addEventListener('click',onClick,true);window.addEventListener('pagehide',capture);
    for(const event of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(event,interrupted,{passive:true});
    return()=>{
      if(!restoring)persist(latest);active=false;window.cancelAnimationFrame(frame);window.clearTimeout(timer);
      observer?.disconnect();resize?.disconnect();document.documentElement.style.scrollBehavior=oldBehavior;
      window.history.scrollRestoration=priorMode;
      window.removeEventListener('scroll',onScroll);document.removeEventListener('click',onClick,true);window.removeEventListener('pagehide',capture);
      for(const event of ['wheel','touchstart','pointerdown','keydown'])window.removeEventListener(event,interrupted);
    };
  },[location.key,location.pathname,location.search,location.hash,navigationType,user?.id]);
  return null;
}
