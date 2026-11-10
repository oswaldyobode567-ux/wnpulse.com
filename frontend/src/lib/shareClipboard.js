// Safari and embedded browsers can reject clipboard requests even on HTTPS.
export async function copyShareText(value) {
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* Try the selected-text copy fallback. */ }
  const previous = document.activeElement;
  const node = document.createElement("textarea");
  node.value = value;
  node.readOnly = true;
  node.style.cssText = "position:fixed;left:0;top:0;opacity:0;font-size:16px;pointer-events:none";
  (document.querySelector("dialog[open]") || document.body).appendChild(node);
  try {
    node.focus({ preventScroll: true });
    node.select();
    node.setSelectionRange(0, value.length);
    return Boolean(document.execCommand?.("copy"));
  } catch {
    return false;
  } finally {
    node.remove();
    previous?.focus?.({ preventScroll: true });
  }
}
