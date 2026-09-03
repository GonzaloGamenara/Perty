import type { Medal, PlayerId, Standing } from '@perty/protocol';
import type { Category, CategoryId } from '../trivia/types';

export interface LiarPrompt {
  id: string;
  category: CategoryId;
  /** Lleva `____` donde va la respuesta. */
  text: string;
  answer: string;
  /** Otras formas de escribir la verdad, para detectar el acierto sin querer. */
  also?: string[];
}

export interface LiarConfig {
  rounds: number;
  introMs: number;
  writeMs: number;
  voteMs: number;
  revealMs: number;
  standingsMs: number;
  standingsEvery: number;
  maxAnswerLength: number;
  categories: CategoryId[] | null;
}

/** Una opción para votar: la verdad, o la mentira de una o más personas. */
export interface LiarOption {
  id: string;
  text: string;
  slot: number;
  /** Quiénes escribieron esta mentira (puede ser más de uno si coincidieron). */
  authors: PlayerId[];
  truth: boolean;
}

export interface LiarStats {
  points: number;
  /** Cuántas veces alguien picó en una mentira suya. */
  fooled: number;
  /** Cuántas veces encontró la verdad. */
  found: number;
  /** Cuántas veces escribió la verdad sin querer. */
  accidents: number;
  /** Cuántas veces picó en la mentira de otro. */
  fell: number;
  blanks: number;
}

export interface LiarOutcome {
  playerId: PlayerId;
  /** A qué opción votó. */
  votedId: string | null;
  votedTruth: boolean;
  /** Quiénes cayeron en su mentira. */
  fooledIds: PlayerId[];
  points: number;
  note?: string;
}

export type LiarPhase =
  | { kind: 'intro'; endsAt: number }
  | { kind: 'write'; endsAt: number }
  | { kind: 'vote'; endsAt: number }
  | { kind: 'reveal'; endsAt: number }
  | { kind: 'standings'; endsAt: number }
  | { kind: 'done' };

export interface LiarState {
  config: LiarConfig;
  round: number;
  phase: LiarPhase;
  deck: LiarPrompt[];
  deckIndex: number;
  prompt: LiarPrompt | null;
  /** Lo que escribió cada uno, tal cual lo tipeó. */
  fakes: Record<PlayerId, string>;
  /** Los que escribieron la verdad sin querer: no entran a la votación. */
  accidents: PlayerId[];
  options: LiarOption[];
  votes: Record<PlayerId, string>;
  outcomes: LiarOutcome[];
  stats: Record<PlayerId, LiarStats>;
  finale: { standings: Standing[]; medals: Medal[] } | null;
}

// -- vistas de la tele ------------------------------------------------------

export interface LiarHud {
  round: number;
  totalRounds: number;
  entries: { playerId: PlayerId; points: number; delta: number | null }[];
}

export type LiarHostView =
  | { kind: 'liar/intro'; hud: LiarHud; category: Category }
  | {
      kind: 'liar/write';
      hud: LiarHud;
      category: Category;
      text: string;
      endsAt: number;
      ready: PlayerId[];
    }
  | {
      kind: 'liar/vote';
      hud: LiarHud;
      text: string;
      options: { id: string; text: string; slot: number }[];
      endsAt: number;
      voted: PlayerId[];
    }
  | {
      kind: 'liar/reveal';
      hud: LiarHud;
      text: string;
      answer: string;
      options: LiarOption[];
      /** Quién votó cada opción. */
      votesByOption: Record<string, PlayerId[]>;
      outcomes: LiarOutcome[];
      accidents: PlayerId[];
    }
  | { kind: 'liar/standings'; hud: LiarHud; standings: Standing[] }
  | { kind: 'liar/done'; hud: LiarHud };
