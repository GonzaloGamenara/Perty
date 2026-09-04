import type { Medal, PlayerId, Standing } from '@perty/protocol';

export interface PollPrompt {
  id: string;
  text: string;
  /** Pista corta que acota el universo de respuestas. Opcional. */
  hint?: string;
}

export interface PollConfig {
  rounds: number;
  introMs: number;
  writeMs: number;
  revealMs: number;
  standingsMs: number;
  standingsEvery: number;
  maxAnswerLength: number;
  /** Cuánto paga cada integrante del grupo mayoritario, por cabeza del grupo. */
  perHead: number;
  /** Extra para todos cuando la mesa entera escribió lo mismo. */
  unanimousBonus: number;
  /** Lo que le cuesta terminar la partida con la vaca. Cero la desactiva. */
  cowPenalty: number;
}

/** Un grupo de gente que escribió lo mismo. El texto es el del primero. */
export interface PollGroup {
  id: string;
  text: string;
  members: PlayerId[];
}

export interface PollStats {
  points: number;
  /** Rondas en el grupo mayoritario. */
  herd: number;
  /** Rondas en las que quedó solo con su respuesta. */
  alone: number;
  /** Rondas en las que la mesa entera coincidió. */
  unanimous: number;
  /** Veces que le pasaron la vaca. */
  cows: number;
  blanks: number;
}

export interface PollOutcome {
  playerId: PlayerId;
  groupId: string | null;
  points: number;
  inHerd: boolean;
  alone: boolean;
  blank: boolean;
}

export type PollPhase =
  | { kind: 'intro'; endsAt: number }
  | { kind: 'write'; endsAt: number }
  | { kind: 'reveal'; endsAt: number }
  | { kind: 'standings'; endsAt: number }
  | { kind: 'done' };

export interface PollState {
  config: PollConfig;
  round: number;
  phase: PollPhase;
  deck: PollPrompt[];
  deckIndex: number;
  prompt: PollPrompt | null;
  answers: Record<PlayerId, string>;
  groups: PollGroup[];
  /** Grupos que se llevaron la ronda. Vacío si no hubo mayoría clara. */
  winnerIds: string[];
  outcomes: PollOutcome[];
  /** Quién tiene la vaca ahora. */
  cow: PlayerId | null;
  /** Si la vaca cambió de manos en esta ronda, a quién fue. Para animarlo. */
  cowMoved: PlayerId | null;
  unanimous: boolean;
  stats: Record<PlayerId, PollStats>;
  finale: { standings: Standing[]; medals: Medal[] } | null;
}

// -- vistas de la tele ------------------------------------------------------

export interface PollHud {
  round: number;
  totalRounds: number;
  cow: PlayerId | null;
  entries: { playerId: PlayerId; points: number; delta: number | null }[];
}

export interface PollRevealGroup {
  id: string;
  text: string;
  members: PlayerId[];
  points: number;
  winner: boolean;
}

export type PollHostView =
  | { kind: 'poll/intro'; hud: PollHud }
  | {
      kind: 'poll/write';
      hud: PollHud;
      text: string;
      hint?: string;
      endsAt: number;
      ready: PlayerId[];
    }
  | {
      kind: 'poll/reveal';
      hud: PollHud;
      text: string;
      groups: PollRevealGroup[];
      blanks: PlayerId[];
      unanimous: boolean;
      /** Nadie coincidió con nadie, o hubo empate: la ronda no paga. */
      noDeal: boolean;
      cowMoved: PlayerId | null;
    }
  | { kind: 'poll/standings'; hud: PollHud; standings: Standing[] }
  | { kind: 'poll/done'; hud: PollHud };
