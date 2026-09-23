/**
 * Fuzzy matching utility for domain search suggestions
 * Levenshtein distance + findSimilar helper
 */

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Use two rows instead of full matrix for memory efficiency
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr = new Array(lb + 1);

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[lb];
}

/**
 * Find similar strings from a list of candidates
 * @param {string} input - The search input
 * @param {string[]} candidates - Array of candidate strings
 * @param {number} maxDistance - Maximum Levenshtein distance to consider (default 2)
 * @returns {Array<{value: string, distance: number}>} Top 5 closest matches sorted by distance
 */
export function findSimilar(input, candidates, maxDistance = 2) {
  const normalized = input.toLowerCase();
  const matches = [];

  for (const candidate of candidates) {
    const dist = levenshtein(normalized, candidate.toLowerCase());
    if (dist > 0 && dist <= maxDistance) {
      matches.push({ value: candidate, distance: dist });
    }
  }

  matches.sort((a, b) => a.distance - b.distance);
  return matches.slice(0, 5);
}

export default { levenshtein, findSimilar };
