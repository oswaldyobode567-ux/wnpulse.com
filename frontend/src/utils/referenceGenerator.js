/**
 * Generate a unique payment reference code
 * Format: PE-XXXXXXXX (8 alphanumeric characters)
 * @returns {string} Generated reference
 */
export function genRef() {
  const part = Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "X");
  return `PE-${part.padEnd(8, "X").slice(0, 8)}`;
}
