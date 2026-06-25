/**
 * BlogPostPage — individual article with SEO meta tags, JSON-LD structured data, and share buttons.
 * Markdown is rendered with a small built-in parser.
 */
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Activity, Calendar, Clock, ArrowLeft, ArrowRight, MessageCircle, Share2 } from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/fr";

dayjs.locale("fr");

/** Tiny markdown → JSX renderer (handles h2, h3, lists, bold, links, code, tables, paragraphs, blockquotes). */
function renderMarkdown(md) {
  if (!md) return null;
  const lines = md.split("\n");
  const blocks = [];
  let i = 0;

  const renderInline = (text) =>
    text
      // bold
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
      // italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // code
      .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-rose-600 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
      // links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-orange-600 font-semibold hover:underline">$1</a>');

  while (i < lines.length) {
    const line = lines[i];
    // Headings
    if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={i} className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 mt-10 mb-4 scroll-mt-24" id={`h2-${i}`}>
          {line.slice(3)}
        </h2>
      );
      i++; continue;
    }
    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={i} className="font-heading text-xl font-bold text-slate-900 mt-7 mb-3" id={`h3-${i}`}>
          {line.slice(4)}
        </h3>
      );
      i++; continue;
    }
    // Tables
    if (line.includes("|") && lines[i + 1]?.match(/^\|[\s\-:|]+\|/)) {
      const headers = line.split("|").filter(Boolean).map((s) => s.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").filter(Boolean).map((s) => s.trim()));
        i++;
      }
      blocks.push(
        <div key={`t-${i}`} className="my-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-orange-50 border-b-2 border-orange-200">
                {headers.map((h, k) => (
                  <th key={k} className="text-left py-2 px-3 font-bold text-slate-900" dangerouslySetInnerHTML={{ __html: renderInline(h) }} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-slate-100">
                  {r.map((c, ci) => (
                    <td key={ci} className="py-2 px-3 text-slate-700" dangerouslySetInnerHTML={{ __html: renderInline(c) }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    // Code blocks
    if (line.startsWith("```")) {
      i++;
      const code = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]); i++;
      }
      i++;
      blocks.push(
        <pre key={`c-${i}`} className="my-5 bg-slate-900 text-orange-200 p-4 rounded-xl overflow-x-auto text-sm font-mono">
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }
    // Blockquote
    if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2)); i++;
      }
      blocks.push(
        <blockquote key={`q-${i}`} className="my-5 border-l-4 border-orange-500 bg-orange-50 pl-4 py-3 rounded-r-lg text-slate-700 italic">
          <span dangerouslySetInnerHTML={{ __html: renderInline(quote.join(" ")) }} />
        </blockquote>
      );
      continue;
    }
    // Unordered list
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2)); i++;
      }
      blocks.push(
        <ul key={`u-${i}`} className="my-4 space-y-2 list-disc pl-6 text-slate-700">
          {items.map((it, k) => (
            <li key={k} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
          ))}
        </ul>
      );
      continue;
    }
    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, "")); i++;
      }
      blocks.push(
        <ol key={`o-${i}`} className="my-4 space-y-2 list-decimal pl-6 text-slate-700">
          {items.map((it, k) => (
            <li key={k} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
          ))}
        </ol>
      );
      continue;
    }
    // Horizontal rule
    if (line.startsWith("---")) {
      blocks.push(<hr key={`hr-${i}`} className="my-8 border-slate-200" />);
      i++; continue;
    }
    // Empty line
    if (line.trim() === "") {
      i++; continue;
    }
    // Paragraph
    blocks.push(
      <p key={i} className="my-4 text-slate-700 leading-[1.75]" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />
    );
    i++;
  }
  return blocks;
}

function useSeoMeta({ title, description, canonical, ogImage, jsonLd }) {
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
    if (description) {
      setMeta("description", description);
      setMeta("og:description", description, "property");
    }
    if (title) {
      setMeta("og:title", title, "property");
      setMeta("twitter:title", title);
    }
    if (ogImage) {
      setMeta("og:image", ogImage, "property");
      setMeta("twitter:image", ogImage);
    }
    setMeta("og:type", "article", "property");
    setMeta("twitter:card", "summary_large_image");
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", canonical);
    }
    // JSON-LD
    if (jsonLd) {
      let script = document.querySelector('script[type="application/ld+json"][data-page="blog-post"]');
      if (!script) {
        script = document.createElement("script");
        script.setAttribute("type", "application/ld+json");
        script.setAttribute("data-page", "blog-post");
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    }
    return () => {
      const s = document.querySelector('script[type="application/ld+json"][data-page="blog-post"]');
      if (s) s.remove();
    };
  }, [title, description, canonical, ogImage, jsonLd]);
}

export default function BlogPostPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/blog/posts/${slug}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const post = data?.post;
  const canonical = `https://wnpulse.com/blog/${slug}`;
  const jsonLd = post ? {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.meta_description,
    "image": post.cover,
    "datePublished": post.published_at,
    "author": { "@type": "Organization", "name": post.author || "WinPulse" },
    "publisher": {
      "@type": "Organization",
      "name": "WinPulse SARL",
      "logo": { "@type": "ImageObject", "url": "https://wnpulse.com/logo.png" },
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
    "articleSection": post.tags?.[0] || "Paris sportifs",
    "inLanguage": "fr",
  } : null;

  useSeoMeta({
    title: post ? `${post.title} | WinPulse Blog` : "Article — WinPulse",
    description: post?.meta_description,
    canonical,
    ogImage: post?.cover,
    jsonLd,
  });

  const sharePost = () => {
    const url = canonical;
    if (navigator.share) {
      navigator.share({ title: post?.title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
    }
  };

  const whatsappShare = () => {
    const text = encodeURIComponent(`${post?.title}\n\n${canonical}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-4">
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-64" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 mb-2">Article introuvable</h1>
          <p className="text-sm text-slate-600 mb-5">Cet article n'existe pas ou a été retiré.</p>
          <Button onClick={() => navigate("/blog")}>Retour au blog</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center text-white shadow-lg shadow-orange-600/30">
              <Activity className="h-5 w-5" strokeWidth={2.5} fill="white" />
            </div>
            <span className="font-heading font-extrabold text-lg">WinPulse</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/blog"><Button variant="ghost" size="sm"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Blog</Button></Link>
            <Link to="/register"><Button size="sm" className="wp-gradient-warm text-white border-0">Démarrer gratuit</Button></Link>
          </div>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {(post.tags || []).map((t, i) => (
              <span key={i} className="text-[10px] uppercase tracking-wider font-bold text-orange-700 bg-orange-100 rounded-full px-2.5 py-1">{t}</span>
            ))}
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl font-black tracking-tighter text-slate-900 leading-[1.05]" data-testid="post-title">
            {post.title}
          </h1>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed">{post.excerpt}</p>
          <div className="mt-5 flex items-center gap-5 text-sm text-slate-500">
            <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {dayjs(post.published_at).format("D MMMM YYYY")}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {post.read_min} min de lecture</span>
            <span className="hidden sm:inline text-slate-400">·</span>
            <span className="hidden sm:inline">par {post.author}</span>
          </div>
        </div>

        {/* Cover */}
        <div className="relative aspect-[16/9] bg-slate-100 rounded-2xl overflow-hidden mb-10 shadow-xl">
          <img src={post.cover} alt={post.title} className="absolute inset-0 w-full h-full object-cover" />
        </div>

        {/* Body */}
        <div className="prose-wp" data-testid="post-content">
          {renderMarkdown(post.content_md)}
        </div>

        {/* Share */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="font-heading font-bold text-slate-900 mb-3">Tu as aimé ? Partage-le 🎯</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={whatsappShare} className="bg-[#25D366] hover:bg-[#1ebe5c] text-white border-0" data-testid="share-whatsapp-post">
              <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
            </Button>
            <Button onClick={sharePost} variant="outline" data-testid="share-generic-post">
              <Share2 className="h-4 w-4 mr-2" /> Partager
            </Button>
          </div>
        </div>

        {/* Related */}
        {data?.related?.length > 0 && (
          <div className="mt-14">
            <h3 className="font-heading text-xl font-extrabold text-slate-900 mb-5">Articles liés</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {data.related.map((r) => (
                <Link key={r.slug} to={`/blog/${r.slug}`} className="group">
                  <Card className="h-full overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="aspect-[16/10] bg-slate-100 overflow-hidden">
                      <img src={r.cover} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </div>
                    <div className="p-4">
                      <h4 className="font-heading font-bold text-sm text-slate-900 group-hover:text-orange-700 leading-snug line-clamp-2">{r.title}</h4>
                      <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {r.read_min} min
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <Card className="mt-14 relative overflow-hidden bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 text-white border-0 p-7 sm:p-9">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-yellow-300/20 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="font-heading text-xl sm:text-2xl font-black tracking-tight">Applique cette stratégie aujourd'hui</div>
              <p className="mt-1.5 text-white/90 text-sm">Crée ton compte gratuit, reçois nos 3 picks du jour.</p>
            </div>
            <Link to="/register">
              <Button className="bg-white text-slate-900 hover:bg-slate-100 font-bold whitespace-nowrap shadow-xl">
                Démarrer gratuitement <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </Card>
      </article>

      <footer className="border-t border-neutral-200 bg-white mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-xs text-slate-500">
          © 2026 WinPulse SARL · Cotonou, Bénin · 18+ · Joue responsable
        </div>
      </footer>
    </div>
  );
}
