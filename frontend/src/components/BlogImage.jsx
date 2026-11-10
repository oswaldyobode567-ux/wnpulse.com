import { useState } from "react";
import api from "@/lib/api";

export function safeBlogUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const base = new URL(api.defaults?.baseURL || "/api", window.location.origin);
    const url = new URL(value, base.origin);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function Crest({ subject }) {
  const [failed, setFailed] = useState(false);
  const logo = safeBlogUrl(subject.logo);
  return <span className="flex min-w-0 flex-col items-center gap-2 text-center font-semibold text-xs sm:text-sm">
    <span className="grid h-12 w-12 sm:h-16 sm:w-16 place-items-center rounded-2xl bg-white/95 p-2 text-slate-900">
      {logo && !failed
        ? <img src={logo} alt="" className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : subject.name.split(/\s+/).map(part => part[0]).join("").slice(0, 3).toUpperCase()}
    </span>
    <span className="leading-tight">{subject.name}</span>
  </span>;
}

const backgrounds = [
  "from-[#181b32] via-[#252247] to-[#5f3868]",
  "from-[#132324] via-[#143c45] to-[#075d68]",
  "from-[#211a20] via-[#54243b] to-[#733129]",
  "from-[#151e2d] via-[#203659] to-[#274f73]",
];

export default function BlogImage({ post, className = "", loading = "lazy", creditOverlay = false }) {
  const url = safeBlogUrl(post.cover);
  // Prevent the old shared terrain from resurfacing during a rolling deploy.
  const src = url && !/\/api\/blog\/(?:covers\/|photos\/(?:football|basketball|tennis)\.webp)/.test(new URL(url).pathname) ? url : "";
  const [failedSrc, setFailedSrc] = useState("");
  if (src && src !== failedSrc) {
    return <>
      <img src={src} alt={post.cover_alt || post.title || ""} className={className} loading={loading} decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
      {creditOverlay && post.cover_credit && <span className="absolute bottom-2 left-2 right-2 w-fit rounded-md bg-slate-950/85 px-2 py-1 text-[10px] leading-tight text-white">
        Archives · {post.cover_credit.author} · {post.cover_credit.license}
      </span>}
    </>;
  }
  const subjects = Array.isArray(post.cover_subjects) ? post.cover_subjects : [];
  const variant = [...(post.slug || post.title || "")].reduce((sum, char) => sum + char.codePointAt(0), 0) % backgrounds.length;
  return <div className={`${className} grid place-items-center bg-gradient-to-br ${backgrounds[variant]} text-white`} aria-hidden="true">
    <div className="relative z-[1] flex w-full max-w-md flex-col items-center gap-3 p-4 text-center sm:gap-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">{post.sport || post.category || "WinPulse"}</span>
      {subjects.length ? <div className="flex items-center justify-center gap-4 sm:gap-8">
        {subjects.map(subject => <Crest key={subject.name} subject={subject} />)}
      </div> : <span className="line-clamp-3 text-sm font-bold leading-snug sm:text-xl">{post.title}</span>}
    </div>
  </div>;
}
