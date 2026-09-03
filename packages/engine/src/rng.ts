/**
 * RNG determinista (mulberry32). Sembrado por sala: la misma semilla + los
 * mismos eventos reproducen la misma partida, lo que hace los tests aburridos
 * (que es lo que queremos) y permitiría repetir una ronda igual.
 */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** Elige un item usando pesos relativos (para rarezas de modificadores). */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T | null;
  chance(probability: number): boolean;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick sobre lista vacía');
      return items[int(items.length)]!;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    weighted<T>(items: readonly T[], weightOf: (item: T) => number): T | null {
      const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
      if (total <= 0) return null;
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weightOf(item));
        if (roll <= 0) return item;
      }
      return items[items.length - 1] ?? null;
    },
    chance(probability: number) {
      return next() < probability;
    },
  };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I,O,0,1

export function randomRoomCode(length = 4): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function randomToken(): string {
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
}
