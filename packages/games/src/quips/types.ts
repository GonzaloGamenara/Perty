import type { Medal, PlayerId, Standing } from '@perty/protocol';

/**
 * Tres tonos, para que la mesa elija con qué se banca jugar. `personal` es el
 * que usa `{jugador}`: son las consignas sobre los que están sentados.
 */
export type QuipTone = 'clasico' | 'nerd' | 'personal';

export interface QuipPrompt {
  id: string;
  tone: QuipTone;
  /** Puede llevar `{jugador}`: se reemplaza por alguien de la mesa al azar. */
  text: string;
}

export interface QuipConfig {
  rounds: number;
  introMs: number;
  writeMs: number;
  voteMs: number;
  revealMs: number;
  standingsMs: number;
  standingsEvery: number;
  maxAnswerLength: number;
  tones: QuipTone[] | null;
}

/** Una respuesta puesta a votación. Si dos escribieron lo mismo, comparten. */
export interface QuipOption {
  id: string;
  text: string;
  slot: number;
  authors: PlayerId[];
}

export interface QuipStats {
  points: number;
  /** Votos recibidos en toda la partida. */
  votes: number;
  /** Rondas ganadas (empates cuentan para todos). */
  wins: number;
  /** Rondas en las que se llevó todos los votos posibles. */
  sweeps: number;
  /** Rondas en las que escribió y no lo votó nadie. */
  zeroes: number;
  blanks: number;
  /** Para la medalla del que escribe testamentos. */
  chars: number;
  written: number;
}

export interface QuipOutcome {
  playerId: PlayerId;
  /** Quiénes lo votaron. */
  voters: PlayerId[];
  points: number;
  sweep: boolean;
  win: boolean;
  blank: boolean;
}

export type QuipPhase =
  | { kind: 'intro'; endsAt: number }
  | { kind: 'write'; endsAt: number }
  | { kind: 'vote'; endsAt: number }
  | { kind: 'reveal'; endsAt: number }
  | { kind: 'standings'; endsAt: number }
  | { kind: 'done' };

export interface QuipState {
  config: QuipConfig;
  round: number;
  phase: QuipPhase;
  deck: QuipPrompt[];
  deckIndex: number;
  prompt: QuipPrompt | null;
  /** El enunciado ya resuelto: `{jugador}` reemplazado por un nombre. */
  text: string;
  /** A quién le tocó ser el tema de la ronda, si la consigna lo pedía. */
  subject: PlayerId | null;
  answers: Record<PlayerId, string>;
  options: QuipOption[];
  votes: Record<PlayerId, string>;
  outcomes: QuipOutcome[];
  stats: Record<PlayerId, QuipStats>;
  finale: { standings: Standing[]; medals: Medal[] } | null;
}

// -- vistas de la tele ------------------------------------------------------

export interface QuipHud {
  round: number;
  totalRounds: number;
  entries: { playerId: PlayerId; points: number; delta: number | null }[];
}

/** Una respuesta ya destapada: con autor, votos y puntos. */
export interface QuipReveal {
  id: string;
  text: string;
  slot: number;
  authors: PlayerId[];
  voters: PlayerId[];
  points: number;
  sweep: boolean;
  win: boolean;
}

export type QuipHostView =
  | { kind: 'quips/intro'; hud: QuipHud; tone: QuipTone; subject: PlayerId | null }
  | {
      kind: 'quips/write';
      hud: QuipHud;
      text: string;
      subject: PlayerId | null;
      endsAt: number;
      ready: PlayerId[];
    }
  | {
      kind: 'quips/vote';
      hud: QuipHud;
      text: string;
      options: { id: string; text: string; slot: number }[];
      endsAt: number;
      voted: PlayerId[];
    }
  | {
      kind: 'quips/reveal';
      hud: QuipHud;
      text: string;
      entries: QuipReveal[];
      /** Los que no escribieron nada: se nombran al final. */
      blanks: PlayerId[];
    }
  | { kind: 'quips/standings'; hud: QuipHud; standings: Standing[] }
  | { kind: 'quips/done'; hud: QuipHud };
