/**
 * Format a number as French locale currency (FCFA)
 * @param {number} n - The number to format
 * @returns {string} Formatted number string
 */
export const formatXof = (n) => {
  return n.toLocaleString("fr-FR");
};
