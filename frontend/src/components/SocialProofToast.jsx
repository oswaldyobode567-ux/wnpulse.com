import { useEffect, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

/**
 * Floating social-proof toasts (preuve sociale) shown to FREE users only.
 * Fetches recent wins on mount, then displays a random one every 30s.
 */
export default function SocialProofToast() {
  const { user } = useAuth();
  const winsRef = useRef([]);
  const indexRef = useRef(0);
  const timerRef = useRef(null);
  const startedRef = useRef(false);

  const isFree = !user?.subscription_tier || user.subscription_tier === "free";

  useEffect(() => {
    if (!isFree || startedRef.current) return;
    startedRef.current = true;

    api.get("/social/recent-wins")
      .then((r) => {
        winsRef.current = r.data || [];
        if (winsRef.current.length === 0) return;
        // Fire first toast after 8s (let user breathe), then every 30s
        const fire = () => {
          if (!winsRef.current.length) return;
          const item = winsRef.current[indexRef.current % winsRef.current.length];
          indexRef.current += 1;
          showWinToast(item);
        };
        const startTimer = setTimeout(() => {
          fire();
          timerRef.current = setInterval(fire, 30000);
        }, 8000);
        return () => clearTimeout(startTimer);
      })
      .catch(() => {});

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      startedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFree]);

  return null;
}

function showWinToast(item) {
  const formatted = (item.gain_xof || 0).toLocaleString();
  toast.custom((t) => (
    <Link to="/app/abonnement" onClick={() => toast.dismiss(t)} className="block" data-testid="social-proof-toast">
      <div className="flex items-start gap-3 bg-white border border-orange-200 rounded-xl shadow-xl px-4 py-3 w-[340px] hover:border-orange-400 transition-colors">
        <div className="h-10 w-10 rounded-full wp-gradient-warm grid place-items-center text-white flex-shrink-0 text-base">
          🔥
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-900">
            <span className="font-bold">{item.name}</span>
            <span className="text-slate-500"> · abonné </span>
            <span className="font-semibold text-orange-600">Pro</span>
          </div>
          <div className="text-sm text-slate-700 mt-0.5">
            vient de toucher <span className="font-bold font-mono text-emerald-600">{formatted} FCFA</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Combiné <span className="font-semibold text-slate-700">{item.combo}</span> · <span className="italic">{item.ago}</span>
          </div>
        </div>
      </div>
    </Link>
  ), { duration: 6500, position: "bottom-left" });
}
