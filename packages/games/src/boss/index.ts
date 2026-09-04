import {
  type Choice,
  type GameInfo,
  type Medal,
  type Player,
  type PlayerId,
  type PlayerView,
  type Standing,
} from '@perty/protocol';
import type { Effect, GameCtx, GameModule, Reduction, ViewCtx } from '@perty/engine';
import { CATEGORIES, getCategory } from '../trivia/categories';
import { QUESTIONS } from '../trivia/questions';
import type { Question } from '../trivia/types';
import { readChoice } from '../settings';
import { BOSSES, getBoss } from './bosses';
import {
  MECHANICS,
  mechanicAction,
  mechanicHeroes,
  mechanicHostView,
  mechanicPlayerView,
  mechanicSettled,
  pickMechanic,
  resolveMechanic,
  setupMechanic,
} from './mechanics';
import type {
  BossConfig,
  BossHostView,
  BossHud,
  BossOutcome,
  BossPlayerStats,
  BossState,
  MechanicId,
} from './types';

export const BOSS_INFO: GameInfo = {
  id: 'boss',
  name: 'Jefe Final',
  tagline: 'Los cuatro contra uno. Tres vidas compartidas.',
  emoji: '🐲',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    {
      id: 'coop',
      name: 'Cooperativo',
      description: 'Trivia para pegarle, y ataques donde hay que hablar para sobrevivir.',
      emoji: '🤝',
      available: true,
    },
  ],
  settings: [
    {
      kind: 'choice',
      id: 'jefe',
      label: 'Jefe',
      options: [
        { value: 'random', label: 'Sorpresa', emoji: '🎲' },
        ...BOSSES.map((boss) => ({ value: boss.id, label: boss.name, emoji: boss.emoji })),
      ],
      default: 'random',
    },
    {
      kind: 'choice',
      id: 'vidas',
      label: 'Vidas compartidas',
      hint: 'Cuántos ataques pueden fallar antes de perder',
      options: [
        { value: 1, label: '1 · brutal' },
        { value: 3, label: '3 · normal' },
        { value: 5, label: '5 · tranqui' },
      ],
      default: 3,
    },
    {
      kind: 'choice',
      id: 'rondas',
      label: 'Rondas máximas',
      hint: 'Si no lo bajan a tiempo, gana el jefe',
      options: [
        { value: 10, label: '10 · apretado' },
        { value: 14, label: '14 · normal' },
        { value: 20, label: '20 · holgado' },
      ],
      default: 14,
    },
  ],
};

export function defaultBossConfig(): BossConfig {
  return {
    bossId: null,
    answerMs: 16_000,
    introMs: 4_200,
    revealMs: 6_200,
    telegraphMs: 4_200,
    mechanicResultMs: 5_200,
    finaleMs: 8_000,
    hearts: 3,
    maxRounds: 14,
    hpScale: 1,
  };
}

const DAMAGE = {
  base: 100,
  speedMax: 120,
  difficultyStep: 40,
  /** Cada eslabón del combo grupal suma 20% al daño de la ronda, hasta x2. */
  comboStep: 0.2,
  comboCap: 5,
} as const;

export const bossGame: GameModule<BossState, BossConfig> = {
  info: BOSS_INFO,

  defaultConfig: () => defaultBossConfig(),

  configure(settings) {
    const jefe = readChoice(
      settings,
      'jefe',
      ['random', ...BOSSES.map((boss) => boss.id)] as const,
      'random',
    );
    return {
      ...defaultBossConfig(),
      bossId: jefe === 'random' ? null : jefe,
      hearts: readChoice(settings, 'vidas', [1, 3, 5] as const, 3),
      maxRounds: readChoice(settings, 'rondas', [10, 14, 20] as const, 14),
    };
  },

  quickConfig: () => ({ ...defaultBossConfig(), maxRounds: 8, hpScale: 0.5 }),

  create(ctx, config) {
    const boss = getBoss(config.bossId) ?? ctx.rng.pick(BOSSES);
    const maxHp = Math.round(
      boss.hpPerPlayer * Math.max(2, ctx.players.length) * config.hpScale,
    );
    const state: BossState = {
      config,
      boss,
      hp: maxHp,
      maxHp,
      hearts: config.hearts,
      charge: 0,
      combo: 0,
      bestCombo: 0,
      round: 0,
      phase: { kind: 'intro', endsAt: ctx.now + config.introMs },
      deck: buildDeck(ctx, boss.favorites),
      deckIndex: 0,
      question: null,
      choices: [],
      correctChoiceId: '',
      answers: {},
      answeredAt: {},
      mechanic: null,
      mechanicOutcome: null,
      outcomes: [],
      roundDamage: 0,
      stats: Object.fromEntries(ctx.players.map((p) => [p.id, emptyStats()])),
      taunt: boss.taunts.intro,
      result: null,
    };
    return {
      state,
      effects: [{ t: 'timer', key: 'phase', delayMs: config.introMs }, { t: 'sfx', name: 'boss-intro' }],
    };
  },

  reduce(state, event, ctx) {
    switch (event.t) {
      case 'start':
        return { state };
      case 'timer':
        return event.key === 'phase' ? advance(state, ctx) : { state };
      case 'player':
        return onPlayerAction(state, event.playerId, event.action, ctx);
      case 'host':
        if (event.action.t === 'endGame') return finale(state, ctx, false);
        return advance(state, ctx);
      case 'playerJoined':
        return { state: ensureStats(state, event.playerId) };
      case 'playerLeft':
        return { state };
    }
  },

  hostView(state, ctx) {
    return hostView(state, ctx);
  },

  playerView(state, playerId, ctx) {
    return playerView(state, playerId, ctx);
  },

  playerHud(state, playerId, ctx) {
    const stats = state.stats[playerId];
    if (!stats) return null;
    const total = Object.values(state.stats).reduce((sum, s) => sum + s.damage, 0);
    const share = total > 0 ? Math.round((stats.damage / total) * 100) : 0;
    return {
      score: stats.damage,
      scoreLabel: `${stats.damage.toLocaleString('es-AR')} de daño`,
      extra: `${share}% del total  ·  ❤️ ${state.hearts}`,
      totalPlayers: ctx.players.length,
    };
  },
};

function emptyStats(): BossPlayerStats {
  return { damage: 0, correct: 0, wrong: 0, missed: 0, taps: 0, clutch: 0, times: [] };
}

function ensureStats(state: BossState, playerId: PlayerId): BossState {
  if (state.stats[playerId]) return state;
  return { ...state, stats: { ...state.stats, [playerId]: emptyStats() } };
}

/** Mazo con las categorías del jefe repetidas: se nota de qué palo es. */
function buildDeck(ctx: GameCtx, favorites: string[]): Question[] {
  const pools = new Map<string, Question[]>();
  for (const category of CATEGORIES) {
    const pool = ctx.rng.shuffle(QUESTIONS.filter((q) => q.category === category.id));
    if (pool.length) pools.set(category.id, pool);
  }
  const rotation = [...CATEGORIES.map((c) => c.id), ...favorites];

  const deck: Question[] = [];
  while (pools.size > 0) {
    for (const categoryId of ctx.rng.shuffle(rotation)) {
      const pool = pools.get(categoryId);
      if (!pool?.length) continue;
      const question = pool.pop();
      if (question) deck.push(question);
      if (pool.length === 0) pools.delete(categoryId);
    }
  }
  return deck;
}

/** Saca la próxima pregunta del mazo con las opciones ya barajadas. */
function drawQuestion(
  state: BossState,
  ctx: GameCtx,
): { question: Question; choices: Choice[]; correctChoiceId: string; nextIndex: number } | null {
  const question = state.deck[state.deckIndex];
  if (!question) return null;
  const shuffled = ctx.rng.shuffle(
    question.options.map((label, index) => ({ label, correct: index === 0 })),
  );
  return {
    question,
    choices: shuffled.map((option, slot) => ({ id: `c${slot}`, label: option.label, slot })),
    correctChoiceId: `c${shuffled.findIndex((option) => option.correct)}`,
    nextIndex: state.deckIndex + 1,
  };
}

function phaseTimer(delayMs: number): Effect[] {
  return [{ t: 'timer', key: 'phase', delayMs }];
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function advance(state: BossState, ctx: GameCtx): Reduction<BossState> {
  switch (state.phase.kind) {
    case 'intro':
      return nextQuestion(state, ctx);
    case 'question':
      return resolveQuestion(state, ctx);
    case 'reveal':
      return afterReveal(state, ctx);
    case 'telegraph':
      return enterMechanic(state, ctx, state.phase.mechanicId);
    case 'mechanic':
      return resolveMechanicPhase(state, ctx);
    case 'mechanicResult':
      return afterMechanic(state, ctx);
    case 'finale':
      return closeGame(state, ctx);
  }
}

function nextQuestion(state: BossState, ctx: GameCtx): Reduction<BossState> {
  const round = state.round + 1;
  const drawn = drawQuestion(state, ctx);
  if (!drawn || round > state.config.maxRounds) return finale(state, ctx, false);

  return {
    state: {
      ...state,
      round,
      deckIndex: drawn.nextIndex,
      question: drawn.question,
      choices: drawn.choices,
      correctChoiceId: drawn.correctChoiceId,
      answers: {},
      answeredAt: {},
      outcomes: [],
      roundDamage: 0,
      mechanicOutcome: null,
      phase: { kind: 'question', startedAt: ctx.now, endsAt: ctx.now + state.config.answerMs },
    },
    effects: [...phaseTimer(state.config.answerMs), { t: 'sfx', name: 'question' }],
  };
}

function resolveQuestion(state: BossState, ctx: GameCtx): Reduction<BossState> {
  const question = state.question;
  if (!question) return afterReveal(state, ctx);

  const outcomes: BossOutcome[] = ctx.players.map((player) => {
    const choiceId = state.answers[player.id] ?? null;
    const ms = state.answeredAt[player.id] ?? null;
    const correct = choiceId === state.correctChoiceId;
    const speed =
      correct && ms !== null
        ? Math.round(DAMAGE.speedMax * Math.max(0, 1 - ms / state.config.answerMs))
        : 0;
    const damage = correct ? DAMAGE.base + speed + (question.difficulty - 1) * DAMAGE.difficultyStep : 0;
    return { playerId: player.id, choiceId, correct, ms, damage };
  });

  const hits = outcomes.filter((o) => o.correct).length;
  const misses = outcomes.length - hits;
  // El combo es del grupo, no de cada uno: premia que se ayuden.
  const combo = hits >= Math.ceil(ctx.players.length / 2) ? state.combo + 1 : 0;
  const multiplier = 1 + Math.min(combo, DAMAGE.comboCap) * DAMAGE.comboStep;

  const scaled = outcomes.map((o) => ({ ...o, damage: Math.round(o.damage * multiplier) }));
  const roundDamage = scaled.reduce((sum, o) => sum + o.damage, 0);

  const stats = { ...state.stats };
  for (const outcome of scaled) {
    const previous = stats[outcome.playerId] ?? emptyStats();
    stats[outcome.playerId] = {
      ...previous,
      damage: previous.damage + outcome.damage,
      correct: previous.correct + (outcome.correct ? 1 : 0),
      wrong: previous.wrong + (!outcome.correct && outcome.choiceId ? 1 : 0),
      missed: previous.missed + (outcome.choiceId ? 0 : 1),
      times: outcome.correct && outcome.ms !== null ? [...previous.times, outcome.ms] : previous.times,
    };
  }

  const hp = Math.max(0, state.hp - roundDamage);
  const charge = Math.min(
    state.boss.chargeMax,
    state.charge + state.boss.chargePerRound + misses * state.boss.chargePerMiss,
  );

  return {
    state: {
      ...state,
      hp,
      charge,
      combo,
      bestCombo: Math.max(state.bestCombo, combo),
      outcomes: scaled,
      roundDamage,
      stats,
      taunt: roundDamage > 0 ? ctx.rng.pick(state.boss.taunts.hurt) : state.boss.taunts.hurt[0]!,
      phase: { kind: 'reveal', endsAt: ctx.now + state.config.revealMs },
    },
    effects: [
      ...phaseTimer(state.config.revealMs),
      { t: 'sfx', name: roundDamage > 0 ? 'boss-hit' : 'reveal' },
    ],
  };
}

function afterReveal(state: BossState, ctx: GameCtx): Reduction<BossState> {
  if (state.hp <= 0) return finale(state, ctx, true);
  if (state.charge >= state.boss.chargeMax) return enterTelegraph(state, ctx);
  if (state.round >= state.config.maxRounds) return finale(state, ctx, false);
  return nextQuestion(state, ctx);
}

function enterTelegraph(state: BossState, ctx: GameCtx): Reduction<BossState> {
  const lastId = state.mechanic?.kind ?? null;
  const mechanicId = pickMechanic(state.boss.attacks, ctx.rng, ctx.players.length, lastId);
  return {
    state: {
      ...state,
      taunt: ctx.rng.pick(state.boss.taunts.attack),
      phase: { kind: 'telegraph', endsAt: ctx.now + state.config.telegraphMs, mechanicId },
    },
    effects: [...phaseTimer(state.config.telegraphMs), { t: 'sfx', name: 'boss-attack' }],
  };
}

function enterMechanic(state: BossState, ctx: GameCtx, mechanicId: MechanicId): Reduction<BossState> {
  // La Marca consume una pregunta del mazo: la ve solo el jugador marcado.
  const drawn = drawQuestion(state, ctx);
  if (!drawn) return finale(state, ctx, false);

  const mechanic = setupMechanic(mechanicId, ctx.rng, ctx.now, ctx.players, drawn);
  return {
    state: {
      ...state,
      deckIndex: mechanicId === 'marca' ? drawn.nextIndex : state.deckIndex,
      mechanic,
      mechanicOutcome: null,
      phase: { kind: 'mechanic' },
    },
    effects: phaseTimer(MECHANICS[mechanicId].durationMs),
  };
}

function resolveMechanicPhase(state: BossState, ctx: GameCtx): Reduction<BossState> {
  const mechanic = state.mechanic;
  if (!mechanic) return nextQuestion(state, ctx);

  const outcome = resolveMechanic(mechanic, ctx.players);
  const heroes = outcome.survived ? mechanicHeroes(mechanic, ctx.players) : [];

  const stats = { ...state.stats };
  for (const playerId of heroes) {
    const previous = stats[playerId];
    if (previous) stats[playerId] = { ...previous, clutch: previous.clutch + 1 };
  }
  if (mechanic.kind === 'barrido') {
    for (const [playerId, taps] of Object.entries(mechanic.taps)) {
      const previous = stats[playerId];
      if (previous) stats[playerId] = { ...previous, taps: previous.taps + taps };
    }
  }

  return {
    state: {
      ...state,
      stats,
      hearts: outcome.survived ? state.hearts : state.hearts - 1,
      charge: 0,
      mechanicOutcome: outcome,
      phase: { kind: 'mechanicResult', endsAt: ctx.now + state.config.mechanicResultMs },
    },
    effects: [
      ...phaseTimer(state.config.mechanicResultMs),
      { t: 'sfx', name: outcome.survived ? 'star' : 'boss-hurt-us' },
    ],
  };
}

function afterMechanic(state: BossState, ctx: GameCtx): Reduction<BossState> {
  if (state.hearts <= 0) return finale(state, ctx, false);
  if (state.round >= state.config.maxRounds) return finale(state, ctx, false);
  return nextQuestion(state, ctx);
}

function finale(state: BossState, ctx: GameCtx, won: boolean): Reduction<BossState> {
  return {
    state: {
      ...state,
      result: won ? 'win' : 'lose',
      taunt: won ? state.boss.taunts.defeat : state.boss.taunts.victory,
      phase: { kind: 'finale', endsAt: ctx.now + state.config.finaleMs, won },
    },
    effects: [
      ...phaseTimer(state.config.finaleMs),
      { t: 'sfx', name: won ? 'finale' : 'boss-lose' },
    ],
  };
}

/** El `finale` se muestra un rato y recién ahí termina el juego. */
function closeGame(state: BossState, ctx: GameCtx): Reduction<BossState> {
  const won = state.result === 'win';
  return {
    state,
    effects: [
      { t: 'cancelTimer', key: 'phase' },
      {
        t: 'finish',
        headline: won
          ? `Derrotaron a ${state.boss.name}`
          : `${state.boss.name} los hizo puré`,
        standings: buildStandings(state, ctx.players),
        medals: buildMedals(state, ctx.players),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

function onPlayerAction(
  state: BossState,
  playerId: PlayerId,
  action: { t: string; [k: string]: unknown },
  ctx: GameCtx,
): Reduction<BossState> {
  const withStats = ensureStats(state, playerId);

  if (withStats.phase.kind === 'question' && action.t === 'choose') {
    if (withStats.answers[playerId]) return { state: withStats };
    const choiceId = String(action.choiceId);
    if (!withStats.choices.some((c) => c.id === choiceId)) return { state: withStats };
    const next: BossState = {
      ...withStats,
      answers: { ...withStats.answers, [playerId]: choiceId },
      answeredAt: {
        ...withStats.answeredAt,
        [playerId]: Math.max(0, ctx.now - withStats.phase.startedAt),
      },
    };
    const everyone = ctx.players.every((p) => next.answers[p.id]);
    return everyone ? resolveQuestion(next, ctx) : { state: next };
  }

  if (withStats.phase.kind === 'mechanic' && withStats.mechanic) {
    const mechanic = mechanicAction(withStats.mechanic, playerId, action as never);
    if (mechanic === withStats.mechanic) return { state: withStats };
    const next: BossState = { ...withStats, mechanic };
    return mechanicSettled(mechanic, ctx.players)
      ? resolveMechanicPhase(next, ctx)
      : { state: next };
  }

  return { state: withStats };
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function buildStandings(state: BossState, players: Player[]): Standing[] {
  const rows = players
    .map((player) => ({ playerId: player.id, stats: state.stats[player.id] ?? emptyStats() }))
    .sort((a, b) => b.stats.damage - a.stats.damage);

  return rows.map((row, index) => ({
    playerId: row.playerId,
    rank: index + 1,
    score: row.stats.damage,
    label: `${row.stats.damage.toLocaleString('es-AR')} de daño`,
  }));
}

function buildMedals(state: BossState, players: Player[]): Medal[] {
  const specs: {
    id: string;
    name: string;
    description: string;
    emoji: string;
    value: (s: BossPlayerStats) => number | null;
    detail: (s: BossPlayerStats) => string;
  }[] = [
    {
      id: 'espada',
      name: 'Espada del Grupo',
      description: 'El que más daño hizo',
      emoji: '🗡️',
      value: (s) => (s.damage > 0 ? s.damage : null),
      detail: (s) => `${s.damage.toLocaleString('es-AR')} de daño`,
    },
    {
      id: 'clutch',
      name: 'Escudo Humano',
      description: 'El que más veces salvó al grupo',
      emoji: '🛡️',
      value: (s) => (s.clutch > 0 ? s.clutch : null),
      detail: (s) => `${s.clutch} ${s.clutch === 1 ? 'salvada' : 'salvadas'}`,
    },
    {
      id: 'machaca',
      name: 'Machaca',
      description: 'El pulgar más rápido',
      emoji: '💪',
      value: (s) => (s.taps > 0 ? s.taps : null),
      detail: (s) => `${s.taps} golpes`,
    },
    {
      id: 'francotirador',
      name: 'Reflejos',
      description: 'El que menos tardó en contestar',
      emoji: '⚡',
      value: (s) => (s.times.length >= 2 ? -average(s.times) : null),
      detail: (s) => `${(average(s.times) / 1000).toFixed(1)}s de promedio`,
    },
    {
      id: 'turista',
      name: 'Turista',
      description: 'Vino a mirar',
      emoji: '🧳',
      value: (s) => (s.missed > 0 ? s.missed : null),
      detail: (s) => `${s.missed} sin responder`,
    },
  ];

  const out: Medal[] = [];
  for (const spec of specs) {
    let winner: { playerId: PlayerId; value: number; stats: BossPlayerStats } | null = null;
    for (const player of players) {
      const stats = state.stats[player.id];
      if (!stats) continue;
      const value = spec.value(stats);
      if (value === null) continue;
      if (!winner || value > winner.value) winner = { playerId: player.id, value, stats };
    }
    if (!winner) continue;
    out.push({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      emoji: spec.emoji,
      playerId: winner.playerId,
      detail: spec.detail(winner.stats),
    });
  }
  return out;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------

function buildHud(state: BossState, ctx: ViewCtx): BossHud {
  return {
    name: state.boss.name,
    title: state.boss.title,
    emoji: state.boss.emoji,
    color: state.boss.color,
    hp: state.hp,
    maxHp: state.maxHp,
    hearts: state.hearts,
    maxHearts: state.config.hearts,
    charge: state.charge,
    chargeMax: state.boss.chargeMax,
    combo: state.combo,
    round: state.round,
    maxRounds: state.config.maxRounds,
    damage: ctx.players.map((player) => ({
      playerId: player.id,
      damage: state.stats[player.id]?.damage ?? 0,
    })),
  };
}

function hostView(state: BossState, ctx: ViewCtx): BossHostView {
  const hud = buildHud(state, ctx);

  switch (state.phase.kind) {
    case 'intro':
      return { kind: 'boss/intro', hud, taunt: state.taunt };
    case 'question':
      return {
        kind: 'boss/question',
        hud,
        category: getCategory(state.question?.category ?? ''),
        text: state.question?.text ?? '',
        choices: state.choices,
        endsAt: state.phase.endsAt,
        answered: Object.keys(state.answers),
      };
    case 'reveal':
      return {
        kind: 'boss/reveal',
        hud,
        text: state.question?.text ?? '',
        choices: state.choices,
        correctChoiceId: state.correctChoiceId,
        outcomes: state.outcomes,
        roundDamage: state.roundDamage,
        taunt: state.taunt,
      };
    case 'telegraph': {
      const info = MECHANICS[state.phase.mechanicId];
      return {
        kind: 'boss/telegraph',
        hud,
        mechanic: {
          id: info.id,
          name: info.name,
          description: info.description,
          emoji: info.emoji,
        },
        taunt: state.taunt,
      };
    }
    case 'mechanic':
      return {
        kind: 'boss/mechanic',
        hud,
        mechanic: mechanicHostView(state.mechanic!, ctx.players),
      };
    case 'mechanicResult':
      return { kind: 'boss/mechanicResult', hud, outcome: state.mechanicOutcome! };
    case 'finale':
      return { kind: 'boss/finale', hud, won: state.phase.won, taunt: state.taunt };
  }
}

function playerView(state: BossState, playerId: PlayerId, _ctx: ViewCtx): PlayerView {
  switch (state.phase.kind) {
    case 'intro':
      return {
        kind: 'idle',
        title: state.boss.name,
        subtitle: state.taunt,
        emoji: state.boss.emoji,
      };

    case 'question':
      return {
        kind: 'choices',
        prompt: state.question?.text,
        hint: `❤️ ${state.hearts}  ·  ${getCategory(state.question?.category ?? '').name}`,
        choices: state.choices,
        locked: state.answers[playerId],
        deadline: state.phase.endsAt,
      };

    case 'reveal': {
      const outcome = state.outcomes.find((o) => o.playerId === playerId);
      if (!outcome?.choiceId) {
        return { kind: 'verdict', tone: 'bad', title: 'Te dormiste', subtitle: 'El jefe carga', emoji: '😴' };
      }
      return {
        kind: 'verdict',
        tone: outcome.correct ? 'good' : 'bad',
        title: outcome.correct ? '¡Le pegaste!' : 'Fallaste',
        subtitle: outcome.correct ? undefined : 'El jefe carga su ataque',
        delta: outcome.damage,
        deltaSuffix: 'de daño',
        emoji: outcome.correct ? '🗡️' : '💢',
      };
    }

    case 'telegraph': {
      const info = MECHANICS[state.phase.mechanicId];
      return {
        kind: 'idle',
        title: info.name,
        subtitle: info.description,
        emoji: info.emoji,
      };
    }

    case 'mechanic':
      return state.mechanic
        ? mechanicPlayerView(state.mechanic, playerId, MECHANICS[state.mechanic.kind])
        : { kind: 'idle', title: 'Aguanten…' };

    case 'mechanicResult':
      return {
        kind: 'verdict',
        tone: state.mechanicOutcome?.survived ? 'good' : 'bad',
        title: state.mechanicOutcome?.headline ?? '',
        subtitle: state.mechanicOutcome?.detail,
        emoji: state.mechanicOutcome?.survived ? '🛡️' : '💔',
      };

    case 'finale':
      return {
        kind: 'verdict',
        tone: state.phase.won ? 'good' : 'bad',
        title: state.phase.won ? '¡Lo bajaron!' : 'Los hizo puré',
        subtitle: state.taunt,
        emoji: state.phase.won ? '🏆' : '💀',
      };
  }
}

export { BOSSES, getBoss } from './bosses';
export { MECHANICS } from './mechanics';
export type * from './types';
