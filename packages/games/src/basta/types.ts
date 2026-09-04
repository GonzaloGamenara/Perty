import type { Medal, PlayerId, Standing } from '@perty/protocol';

/** Una columna de la hoja: "Animal", "País", "Marca". */
export interface BastaCategory {
  id: string;
  label: string;
  emoji: string;
}

export interface BastaConfig {
  rounds: number;
  /** Cuántas columnas se juegan por ronda. */
  columns: number;
  introMs: number;
  writeMs: number;
  revealMs: number;
  standingsMs: number;
  standingsEvery: number;
  maxAnswerLength: number;
  /** Vale una respuesta que no escribió nadie más. */
  unique: number;
  /** Vale una respuesta que alguien más también escribió. */
  shared: number;
  /** Se lo lleva el que cerró la ronda, si llenó todo. */
  stopBonus: number;
}

/** Cómo quedó una respuesta después de contar. */
export interface BastaCell {
  playerId: PlayerId;
  text: string;
  /** Vacía o no empieza con la letra. */
  invalid: boolean;
  /** Alguien más escribió lo mismo. */
  shared: boolean;
  points: number;
}

export interface BastaStats {
  points: number;
  uniques: number;
  shareds: number;
  invalids: number;
  /** Veces que cerró la ronda gritando basta. */
  stops: number;
  /** Hojas completadas con todo válido. */
  perfects: number;
}

export interface BastaRoundResult {
  playerId: PlayerId;
  points: number;
  /** Cuántas columnas llenó con algo válido. */
  valid: number;
  stopped: boolean;
}

export type BastaPhase =
  | { kind: 'intro'; endsAt: number }
  | { kind: 'write'; endsAt: number }
  | { kind: 'reveal'; endsAt: number }
  | { kind: 'standings'; endsAt: number }
  | { kind: 'done' };

export interface BastaState {
  config: BastaConfig;
  round: number;
  phase: BastaPhase;
  letter: string;
  /** Letras ya jugadas, para no repetir en la misma partida. */
  usedLetters: string[];
  columns: BastaCategory[];
  /** Lo que lleva escrito cada uno, por columna. Viaja mientras tipean. */
  sheets: Record<PlayerId, Record<string, string>>;
  /** Quién cerró la ronda antes de tiempo, si alguien lo hizo. */
  stopper: PlayerId | null;
  /** Resultado por columna, listo para mostrar. */
  cells: Record<string, BastaCell[]>;
  results: BastaRoundResult[];
  stats: Record<PlayerId, BastaStats>;
  finale: { standings: Standing[]; medals: Medal[] } | null;
}

// -- vistas de la tele ------------------------------------------------------

export interface BastaHud {
  round: number;
  totalRounds: number;
  letter: string;
  entries: { playerId: PlayerId; points: number; delta: number | null }[];
}

export type BastaHostView =
  | { kind: 'basta/intro'; hud: BastaHud; columns: BastaCategory[] }
  | {
      kind: 'basta/write';
      hud: BastaHud;
      columns: BastaCategory[];
      endsAt: number;
      /** Cuánto duraba la ronda, para que el anillo del reloj sepa su escala. */
      totalMs: number;
      /** Cuántas columnas lleva llena cada uno. Se ve avanzar sin espiar qué puso. */
      progress: { playerId: PlayerId; filled: number }[];
    }
  | {
      kind: 'basta/reveal';
      hud: BastaHud;
      columns: BastaCategory[];
      cells: Record<string, BastaCell[]>;
      results: BastaRoundResult[];
      stopper: PlayerId | null;
      stopBonus: number;
    }
  | { kind: 'basta/standings'; hud: BastaHud; standings: Standing[] }
  | { kind: 'basta/done'; hud: BastaHud };
