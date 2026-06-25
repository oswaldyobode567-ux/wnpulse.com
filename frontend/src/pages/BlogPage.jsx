/**
 * BlogPage — SEO-optimized blog index for WinPulse.
 * Markdown rendered with a tiny built-in parser (no extra dependency).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Calendar, Clock, ArrowRight, Sparkles, BookOpen } from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/fr";

dayjs.locale("fr");

function useSeoMeta({ title, description, canonical, ogImage }) {
  useEffect(() => {
    if (title) document.title = title;
    const setMeta = (name, content, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content || "");
    };
    if (description) setMeta("description", description);
    if (description) setMeta("og:description", description, "property");
    if (title) setMeta("og:title", title, "property");
    if (ogImage) setMeta("og:image", ogImage, "property");
    setMeta("og:type", "article", "property");
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", canonical);
    }
  }, [title, description, canonical, ogImage]);
}

export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useSeoMeta({
    title: "Blog WinPulse — Stratégies, conseils et guides de paris sportifs",
    description: "Tous nos guides et stratégies pour parier intelligemment au Bénin : bankroll, value betting, MTN MoMo, CAN 2026 et plus.",
    canonical: "https://wnpulse.com/blog",
  });

  useEffect(() => {
    api.get("/blog/posts")
      .then((r) => setPosts(r.data.posts))
      .finally(() => setLoading(false));
  }, []);

  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="blog-brand-link">
            <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center text-white shadow-lg shadow-orange-600/30">
              <Activity className="h-5 w-5" strokeWidth={2.5} fill="white" />
            </div>
            <div>
              <div className="font-heading font-extrabold text-lg leading-none">WinPulse</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-orange-600 font-semibold">Blog</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/resultats" className="hidden sm:inline-flex items-center text-sm font-semibold text-slate-600 hover:text-orange-600 px-3">Track record</Link>
            <Link to="/login"><Button variant="ghost" size="sm">Connexion</Button></Link>
            <Link to="/register"><Button size="sm" className="wp-gradient-warm text-white border-0">Démarrer gratuit</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-orange-900 text-white">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-orange-400/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-rose-400/30 blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1 text-xs font-bold text-orange-200 mb-5">
            <BookOpen className="h-3.5 w-3.5" /> Le blog des parieurs malins
          </div>
          <h1 className="font-heading text-4xl sm:text-6xl font-black tracking-tighter leading-[0.95]">
            Stratégies, guides et<br />
            <span className="bg-gradient-to-r from-orange-300 via-rose-300 to-amber-300 bg-clip-text text-transparent">
              vraies astuces
            </span>{" "}
            pour gagner
          </h1>
          <p className="mt-5 text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">
            Sans bullshit, sans promesses farfelues. Juste des conseils concrets de notre équipe WinPulse basée à Cotonou.
          </p>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-72" />)}
          </div>
        ) : (
          <>
            {/* Featured post */}
            {featured && (
              <Link to={`/blog/${featured.slug}`} data-testid={`blog-featured-${featured.slug}`}>
                <Card className="group relative overflow-hidden border-neutral-200 mb-10 grid md:grid-cols-5 hover:shadow-2xl transition-shadow">
                  <div className="md:col-span-3 aspect-video md:aspect-auto bg-slate-100 relative overflow-hidden">
                    <img
                      src={featured.cover}
                      alt={featured.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      loading="lazy"
                    />
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-orange-500 text-white border-0 font-bold">
                        <Sparkles className="h-3 w-3 mr-1" /> À la une
                      </Badge>
                    </div>
                  </div>
                  <div className="md:col-span-2 p-6 sm:p-8 flex flex-col justify-center">
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(featured.tags || []).slice(0, 3).map((t, i) => (
                        <span key={i} className="text-[10px] uppercase tracking-wider font-bold text-orange-700 bg-orange-100 rounded-full px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                    <h2 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 group-hover:text-orange-700 transition-colors">
                      {featured.title}
                    </h2>
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">{featured.excerpt}</p>
                    <div className="mt-5 flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {dayjs(featured.published_at).format("D MMM YYYY")}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {featured.read_min} min</span>
                    </div>
                    <div className="mt-5">
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600">
                        Lire l'article <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            )}

            {/* Rest of posts */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="blog-posts-grid">
              {rest.map((p) => (
                <Link key={p.slug} to={`/blog/${p.slug}`} data-testid={`blog-card-${p.slug}`}>
                  <Card className="group h-full overflow-hidden border-neutral-200 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col">
                    <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
                      <img
                        src={p.cover}
                        alt={p.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {(p.tags || []).slice(0, 2).map((t, i) => (
                          <span key={i} className="text-[10px] uppercase tracking-wider font-bold text-orange-700 bg-orange-100 rounded-full px-2 py-0.5">{t}</span>
                        ))}
                      </div>
                      <h3 className="font-heading text-lg font-extrabold text-slate-900 group-hover:text-orange-700 transition-colors leading-snug">
                        {p.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed flex-1 line-clamp-2">{p.excerpt}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {dayjs(p.published_at).format("D MMM YYYY")}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {p.read_min} min</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* CTA footer */}
        <Card className="mt-14 relative overflow-hidden bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 text-white border-0 p-7 sm:p-10">
          <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-yellow-300/20 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="font-heading text-2xl sm:text-3xl font-black tracking-tight">
                Prêt à appliquer ces stratégies ?
              </div>
              <p className="mt-2 text-white/90 text-sm">Crée ton compte gratuit en 30 secondes et reçois nos picks du jour.</p>
            </div>
            <Link to="/register">
              <Button className="bg-white text-slate-900 hover:bg-slate-100 font-bold whitespace-nowrap shadow-xl" data-testid="blog-cta-register">
                Démarrer gratuitement →
              </Button>
            </Link>
          </div>
        </Card>
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
            <Link to="/legal/mentions-legales" className="text-slate-600 hover:text-orange-600 font-semibold">Mentions légales</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/cgv" className="text-slate-600 hover:text-orange-600 font-semibold">CGV</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/confidentialite" className="text-slate-600 hover:text-orange-600 font-semibold">Confidentialité</Link>
            <span className="text-slate-300">·</span>
            <Link to="/legal/jeu-responsable" className="text-rose-600 hover:text-rose-700 font-semibold">Jeu responsable · 18+</Link>
          </div>
          <div className="text-sm text-slate-500">© 2026 WinPulse SARL · Cotonou, Bénin</div>
        </div>
      </footer>
    </div>
  );
}
