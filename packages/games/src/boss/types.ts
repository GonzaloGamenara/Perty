import type { Choice, PlayerId } from '@perty/protocol';
import type { CategoryId, Question } from '../trivia/types';

export type MechanicId = 'barrido' | 'escudo' | 'marca';

export interface BossDef {
  id: string;
  name: string;
  /** Subtítulo con onda: "Devorador de Finales". */
  title: string;
  emoji: string;
  color: string;
  /** HP por jugador; se escala con la mesa así 2 y 5 personas tardan parecido. */
  hpPerPlayer: number;
  /** Cuánto carga el ataque cada respuesta fallada y cada ronda que pasa. */
  chargePerMiss: number;
  chargePerRound: number;
  chargeMax: number;
  /** Categorías donde el jefe se siente cómodo: salen más seguido. */
  favorites: CategoryId[];
  attacks: MechanicId[];
  taunts: {
    intro: string;
    hurt: string[];
    attack: string[];
    victory: string;
    defeat: string;
  };
}

export interface BossConfig {
  bossId: string | null;
  answerMs: number;
  introMs: number;
  revealMs: number;
  telegraphMs: number;
  mechanicResultMs: number;
  finaleMs: number;
  hearts: number;
  /** Tope de rondas: si no lo bajan a tiempo, el jefe gana. */
  maxRounds: number;
}

// -- mecánicas --------------------------------------------------------------

export interface Rune {
  id: string;
  glyph: string;
  name: string;
  color: string;
}

export type MechanicState =
  | {
      kind: 'barrido';
      endsAt: number;
      target: number;
      taps: Record<PlayerId, number>;
    }
  | {
      kind: 'escudo';
      endsAt: number;
      runes: Rune[];
      /** Cada celular ve solo su mano: hay que hablar para no repetir. */
      hands: Record<PlayerId, string[]>;
      picks: Record<PlayerId, string>;
    }
  | {
      kind: 'marca';
      endsAt: number;
      markedId: PlayerId;
      question: Question;
      choices: Choice[];
      correctChoiceId: string;
      answers: Record<PlayerId, string>;
    };

export interface MechanicOutcome {
  survived: boolean;
  headline: string;
  detail: string;
}

// -- estado -----------------------------------------------------------------

export interface BossPlayerStats {
  damage: number;
  correct: number;
  wrong: number;
  missed: number;
  taps: number;
  /** Veces que su acción salvó al grupo en una mecánica. */
  clutch: number;
  times: number[];
}

export interface BossOutcome {
  playerId: PlayerId;
  choiceId: string | null;
  correct: boolean;
  ms: number | null;
  damage: number;
}

export type BossPhase =
  | { kind: 'intro'; endsAt: number }
  | { kind: 'question'; startedAt: number; endsAt: number }
  | { kind: 'reveal'; endsAt: number }
  | { kind: 'telegraph'; endsAt: number; mechanicId: MechanicId }
  | { kind: 'mechanic' }
  | { kind: 'mechanicResult'; endsAt: number }
  | { kind: 'finale'; endsAt: number; won: boolean };

export interface BossState {
  config: BossConfig;
  boss: BossDef;
  hp: number;
  maxHp: number;
  hearts: number;
  charge: number;
  /** Rondas seguidas en que el grupo respondió bien: multiplica el daño. */
  combo: number;
  bestCombo: number;
  round: number;
  phase: BossPhase;
  deck: Question[];
  deckIndex: number;
  question: Question | null;
  choices: Choice[];
  correctChoiceId: string;
  answers: Record<PlayerId, string>;
  answeredAt: Record<PlayerId, number>;
  mechanic: MechanicState | null;
  mechanicOutcome: MechanicOutcome | null;
  outcomes: BossOutcome[];
  roundDamage: number;
  stats: Record<PlayerId, BossPlayerStats>;
  taunt: string;
  result: 'win' | 'lose' | null;
}

// -- vistas de la tele ------------------------------------------------------

export interface BossHud {
  name: string;
  title: string;
  emoji: string;
  color: string;
  hp: number;
  maxHp: number;
  hearts: number;
  maxHearts: number;
  charge: number;
  chargeMax: number;
  combo: number;
  round: number;
  maxRounds: number;
  damage: { playerId: PlayerId; damage: number }[];
}

export type BossHostView =
  | { kind: 'boss/intro'; hud: BossHud; taunt: string }
  | {
      kind: 'boss/question';
      hud: BossHud;
      category: { id: string; name: string; emoji: string; color: string };
      text: string;
      choices: Choice[];
      endsAt: number;
      answered: PlayerId[];
    }
  | {
      kind: 'boss/reveal';
      hud: BossHud;
      text: string;
      choices: Choice[];
      correctChoiceId: string;
      outcomes: BossOutcome[];
      roundDamage: number;
      taunt: string;
    }
  | {
      kind: 'boss/telegraph';
      hud: BossHud;
      mechanic: { id: MechanicId; name: string; description: string; emoji: string };
      taunt: string;
    }
  | { kind: 'boss/mechanic'; hud: BossHud; mechanic: MechanicHostView }
  | { kind: 'boss/mechanicResult'; hud: BossHud; outcome: MechanicOutcome }
  | { kind: 'boss/finale'; hud: BossHud; won: boolean; taunt: string };

export type MechanicHostView =
  | {
      kind: 'barrido';
      name: string;
      instruction: string;
      endsAt: number;
      progress: number;
      target: number;
      taps: { playerId: PlayerId; count: number }[];
    }
  | {
      kind: 'escudo';
      name: string;
      instruction: string;
      endsAt: number;
      runes: Rune[];
      picks: { playerId: PlayerId; runeId: string | null }[];
      clash: boolean;
    }
  | {
      kind: 'marca';
      name: string;
      instruction: string;
      endsAt: number;
      markedId: PlayerId;
      choices: Choice[];
      answered: PlayerId[];
    };
