import type { Medal, PlayerId, Standing } from '@perty/protocol';
import type { Category, CategoryId } from '../trivia/types';

export interface PriceQuestion {
  id: string;
  category: CategoryId;
  text: string;
  answer: number;
  /** "episodios", "año", "metros"… se muestra como pista de qué se está pidiendo. */
  unit?: string;
  note?: string;
}

export interface PriceConfig {
  rounds: number;
  introMs: number;
  guessMs: number;
  revealMs: number;
  standingsMs: number;
  standingsEvery: number;
  /** Regla de la casa: pasarse del número real deja sin puntos. */
  noOvershoot: boolean;
  categories: CategoryId[] | null;
}

export interface PriceStats {
  points: number;
  /** Veces que quedó más cerca que nadie. */
  closest: number;
  /** Veces que clavó el número exacto. */
  exact: number;
  above: number;
  below: number;
  blanks: number;
  guesses: number;
  /** Suma del error relativo, para la medalla de buen ojo. */
  relError: number;
}

export interface PriceOutcome {
  playerId: PlayerId;
  guess: number | null;
  distance: number | null;
  /** Puesto entre los que puntúan (1 = más cerca). */
  rank: number | null;
  exact: boolean;
  /** Se pasó del número real. */
  over: boolean;
  points: number;
  note?: string;
}

export type PricePhase =
  | { kind: 'intro'; endsAt: number }
  | { kind: 'guess'; startedAt: number; endsAt: number }
  | { kind: 'reveal'; endsAt: number }
  | { kind: 'standings'; endsAt: number }
  | { kind: 'done' };

export interface PriceState {
  config: PriceConfig;
  round: number;
  phase: PricePhase;
  deck: PriceQuestion[];
  deckIndex: number;
  question: PriceQuestion | null;
  guesses: Record<PlayerId, number>;
  outcomes: PriceOutcome[];
  stats: Record<PlayerId, PriceStats>;
  finale: { standings: Standing[]; medals: Medal[] } | null;
}

// -- vistas de la tele ------------------------------------------------------

export interface PriceHud {
  round: number;
  totalRounds: number;
  noOvershoot: boolean;
  entries: { playerId: PlayerId; points: number; delta: number | null }[];
}

/** Extremos de la recta numérica del reveal, ya calculados por el juego. */
export interface PriceScale {
  min: number;
  max: number;
}

export type PriceHostView =
  | { kind: 'price/intro'; hud: PriceHud; category: Category }
  | {
      kind: 'price/guess';
      hud: PriceHud;
      category: Category;
      text: string;
      unit?: string;
      endsAt: number;
      ready: PlayerId[];
    }
  | {
      kind: 'price/reveal';
      hud: PriceHud;
      text: string;
      unit?: string;
      answer: number;
      scale: PriceScale;
      outcomes: PriceOutcome[];
      note?: string;
    }
  | { kind: 'price/standings'; hud: PriceHud; standings: Standing[] }
  | { kind: 'price/done'; hud: PriceHud };
