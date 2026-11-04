// Générateur pseudo-aléatoire à graine (mulberry32), sérialisable : tout son état tient dans un entier 32 bits.

export function hashSeed(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// `holder` est un objet qui porte l'état dans `holder.rng` (l'état de partie, ou un générateur local).
export function next(holder) {
  const a = (holder.rng + 0x6d2b79f5) >>> 0;
  holder.rng = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const int = (holder, n) => Math.floor(next(holder) * n);

export function shuffle(holder, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(holder, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Générateur jetable, dérivé d'une graine, sans toucher à l'état de partie (utilisé par l'IA).
export const local = (seed) => ({ rng: hashSeed(seed) });
