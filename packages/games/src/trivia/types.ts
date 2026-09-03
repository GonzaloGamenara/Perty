import type { Choice, Medal, PlayerId, Standing } from '@perty/protocol';

export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  emoji: string;
  color: string;
}

export interface Question {
  id: string;
  category: CategoryId;
  /** 1 fácil · 2 media · 3 pica */
  difficulty: 1 | 2 | 3;
  text: string;
  /** La correcta siempre es la primera; el deck las baraja al armar la ronda. */
  options: [string, string, string, string];
  note?: string;
}

export interface TriviaConfig {
  rounds: number;
  answerMs: number;
  revealMs: number;
  introMs: number;
  chaosMs: number;
  wagerMs: number;
  sabotageMs: number;
  starMs: number;
  standingsMs: number;
  /** Cada cuántas rondas se muestra la tabla completa. */
  standingsEvery: number;
  /** Probabilidad de que una ronda tenga modificador caótico. */
  chaosChance: number;
  /** Aciertos en una categoría necesarios para reclamar su estrella. */
  starThreshold: number;
  /** Rondas iniciales sin caos, para entrar en calor. */
  chaosWarmup: number;
  /** Fija un modificador en todas las rondas. Para probar uno puntual. */
  forcedModifier: string | null;
  categories: CategoryId[] | null;
}

export interface Sabotage {
  choiceId: string;
  by: PlayerId;
}

export interface AnswerRecord {
  choiceId: string;
  /** ms desde que apareció la pregunta. Lo mide el server, no el celular. */
  ms: number;
}

export interface PlayerStats {
  coins: number;
  streak: number;
  bestStreak: number;
  correct: number;
  wrong: number;
  missed: number;
  firstBloods: number;
  wagered: number;
  /** ms de cada respuesta correcta, para las medallas de velocidad. */
  times: number[];
  categoryHits: Record<CategoryId, number>;
  starsWon: number;
}

export interface Outcome {
  playerId: PlayerId;
  choiceId: string | null;
  correct: boolean;
  ms: number | null;
  coins: number;
  /** Rank entre los que acertaron (1 = primera sangre). */
  place: number | null;
  note?: string;
}

export type StarEvent =
  | { type: 'claim'; category: CategoryId; playerId: PlayerId }
  | { type: 'steal'; category: CategoryId; playerId: PlayerId; fromPlayerId: PlayerId }
  | { type: 'defend'; category: CategoryId; playerId: PlayerId; challengerId: PlayerId; toll: number };

export type TriviaPhase =
  | { kind: 'intro'; endsAt: number }
  | { kind: 'chaos'; endsAt: number }
  | { kind: 'wager'; endsAt: number }
  | { kind: 'sabotage'; endsAt: number }
  | { kind: 'question'; endsAt: number; startedAt: number }
  | { kind: 'reveal'; endsAt: number }
  | { kind: 'star'; endsAt: number }
  | { kind: 'standings'; endsAt: number }
  | { kind: 'done' };

export interface TriviaState {
  config: TriviaConfig;
  round: number;
  phase: TriviaPhase;
  deck: Question[];
  deckIndex: number;
  question: Question | null;
  choices: Choice[];
  correctChoiceId: string;
  answers: Record<PlayerId, AnswerRecord>;
  wagers: Record<PlayerId, number>;
  /** Opción tachada a cada víctima, y por quién. */
  sabotages: Record<PlayerId, Sabotage>;
  modifierId: string | null;
  /** Estado propio del modificador de esta ronda (víctima de la ruleta, etc). */
  modifierData: unknown;
  stats: Record<PlayerId, PlayerStats>;
  /** Dueño actual de la estrella de cada categoría. */
  stars: Record<CategoryId, PlayerId | null>;
  outcomes: Outcome[];
  starEvent: StarEvent | null;
  finale: { standings: Standing[]; medals: Medal[] } | null;
}

// -- vistas de la tele ------------------------------------------------------

export interface HudEntry {
  playerId: PlayerId;
  coins: number;
  stars: number;
  streak: number;
  /** Monedas ganadas/perdidas en la ronda que se acaba de revelar. */
  delta: number | null;
}

export interface Hud {
  round: number;
  totalRounds: number;
  entries: HudEntry[];
  stars: { category: Category; owner: PlayerId | null }[];
}

export interface ModifierBadge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
}

/** A quién apunta la cámara: "Ana tiene la bala". */
export interface Spotlight {
  playerId: PlayerId;
  label: string;
}

export type TriviaHostView =
  | { kind: 'trivia/intro'; hud: Hud; category: Category; difficulty: number }
  | { kind: 'trivia/chaos'; hud: Hud; modifier: ModifierBadge }
  | { kind: 'trivia/wager'; hud: Hud; modifier: ModifierBadge; ready: PlayerId[]; endsAt: number }
  | {
      kind: 'trivia/sabotage';
      hud: Hud;
      modifier: ModifierBadge;
      endsAt: number;
      /** Quién le tacha a quién, y si ya lo hizo. */
      pairs: { fromId: PlayerId; toId: PlayerId; done: boolean }[];
    }
  | {
      kind: 'trivia/question';
      hud: Hud;
      category: Category;
      text: string;
      choices: Choice[];
      endsAt: number;
      answered: PlayerId[];
      modifier: ModifierBadge | null;
      spotlight: Spotlight | null;
    }
  | {
      kind: 'trivia/reveal';
      hud: Hud;
      category: Category;
      text: string;
      choices: Choice[];
      correctChoiceId: string;
      outcomes: Outcome[];
      modifier: ModifierBadge | null;
      note?: string;
    }
  | { kind: 'trivia/star'; hud: Hud; category: Category; event: StarEvent }
  | { kind: 'trivia/standings'; hud: Hud }
  | { kind: 'trivia/done'; hud: Hud };
