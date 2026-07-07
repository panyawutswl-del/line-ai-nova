/**
 * Dice coefficient over character bigrams — works for Thai (no word spaces)
 * and English alike. Returns 0..1. Whitespace/case are ignored.
 *
 * Substring containment scores 0.9 so a short query ("ประชุม") strongly
 * matches a longer title ("ประชุมกับสถาปนิก") without being an exact match.
 */
export function similarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const A = bigrams(na);
  const B = bigrams(nb);
  if (A.length === 0 || B.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let intersection = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      intersection++;
      counts.set(g, c - 1);
    }
  }
  return (2 * intersection) / (A.length + B.length);
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}
