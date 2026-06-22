import { cn } from "@/lib/utils";
import { ShieldCheck, Sparkles, AlertTriangle } from "lucide-react";

export function ConfidenceBadge({ label, confidence, size = "sm" }) {
  const config = {
    safe: {
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: ShieldCheck,
      text: "SAFE",
    },
    value: {
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      icon: Sparkles,
      text: "VALUE",
    },
    risky: {
      cls: "bg-rose-50 text-rose-700 border-rose-200",
      icon: AlertTriangle,
      text: "RISKY",
    },
  };
  const c = config[label] || config.value;
  const Icon = c.icon;
  return (
    <span
      data-testid="prediction-confidence-badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        c.cls,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} strokeWidth={2.5} />
      {c.text} · {confidence}%
    </span>
  );
}
