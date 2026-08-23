import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reusable copy row component for displaying and copying payment details
 * @param {Object} props
 * @param {string} props.label - Field label
 * @param {string} props.value - Display value
 * @param {*} props.rawValue - Value to copy (defaults to value)
 * @param {Function} props.onCopy - Copy callback
 * @param {string} props.testid - Test ID prefix
 * @param {boolean} [props.mono] - Use monospace font
 */
export function CopyRow({
  label,
  value,
  rawValue,
  onCopy,
  testid,
  mono = false,
}) {
  return (
    <div className="flex items-center justify-between gap-2 bg-white/70 rounded-lg px-3 py-2 border border-amber-200/60">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">
          {label}
        </div>
        <div
          className={`text-slate-900 font-bold text-sm truncate ${
            mono ? "font-mono" : ""
          }`}
          data-testid={`${testid}-value`}
        >
          {value}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 hover:bg-amber-100"
        onClick={() => onCopy(rawValue ?? value, `${label} copié`)}
        data-testid={`${testid}-btn`}
        aria-label={`Copier ${label}`}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}
