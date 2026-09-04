import {
  type GameInfo,
  type Medal,
  type Player,
  type PlayerId,
  type PlayerView,
  type Standing,
} from '@perty/protocol';
import type { Effect, GameCtx, GameModule, Reduction, ViewCtx } from '@perty/engine';
import { readChoice, readToggles } from '../settings';
import { CATEGORIES, getCategory } from '../trivia/categories';
import { PRICE_QUESTIONS } from './questions';
import type {
  PriceConfig,
  PriceHostView,
  PriceHud,
  PriceOutcome,
  PriceQuestion,
  PriceScale,
  PriceState,
  PriceStats,
} from './types';

export const PRICE_INFO: GameInfo = {
  id: 'price',
  name: 'El Precio Justo',
  tagline: 'Un número, cuatro corazonadas. Gana el que menos se equivoca.',
  emoji: '🎯',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    {
      id: 'closest',
      name: 'El más cerca',
      description: 'Todos tiran un número y se revelan en una recta. El que menos se aleja se lleva más.',
      emoji: '📏',
      available: true,
    },
  ],
  settings: [
    {
      kind: 'choice',
      id: 'rondas',
      label: 'Rondas',
      options: [
        { value: 6, label: '6 · corta' },
        { value: 10, label: '10 · normal' },
        { value: 14, label: '14 · larga' },
      ],
      default: 10,
    },
    {
      kind: 'choice',
      id: 'tiempo',
      label: 'Tiempo para pensar',
      options: [
        { value: 'rapido', label: '15s · corazonada' },
        { value: 'normal', label: '25s · normal' },
        { value: 'tranqui', label: '40s · con cuentas' },
      ],
      default: 'normal',
    },
    {
      kind: 'choice',
      id: 'regla',
      label: 'Regla de la casa',
      hint: 'Como en el programa: pasarse del número real te deja sin puntos',
      options: [
        { value: 'libre', label: 'Libre', emoji: '🙂' },
        { value: 'sinpasarse', label: 'Sin pasarse', emoji: '😬' },
      ],
      default: 'libre',
    },
    {
      kind: 'toggles',
      id: 'categorias',
      label: 'Categorías',
      options: CATEGORIES.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })),
      default: CATEGORIES.map((c) => c.id),
      min: 2,
    },
  ],
};

/** Puntos por puesto. Del quinto en adelante, un consuelo fijo. */
const RANK_POINTS = [1000, 600, 300, 150] as const;
const CONSOLATION = 100;
const EXACT_BONUS = 1000;
/** Nadie escribe un número más grande que esto de buena fe. */
const MAX_GUESS = 1e12;
const GUESS_MS = { rapido: 15_000, normal: 25_000, tranqui: 40_000 } as const;

export function defaultPriceConfig(): PriceConfig {
  return {
    rounds: 10,
    introMs: 2_400,
    guessMs: 25_000,
    revealMs: 10_000,
    standingsMs: 7_500,
    standingsEvery: 5,
    noOvershoot: false,
    categories: null,
  };
}

export const priceGame: GameModule<PriceState, PriceConfig> = {
  info: PRICE_INFO,

  defaultConfig: () => defaultPriceConfig(),

  configure(settings) {
    const tiempo = readChoice(settings, 'tiempo', ['rapido', 'normal', 'tranqui'] as const, 'normal');
    const regla = readChoice(settings, 'regla', ['libre', 'sinpasarse'] as const, 'libre');
    return {
      ...defaultPriceConfig(),
      rounds: readChoice(settings, 'rondas', [6, 10, 14] as const, 10),
      guessMs: GUESS_MS[tiempo],
      noOvershoot: regla === 'sinpasarse',
      categories: readToggles(
        settings,
        'categorias',
        CATEGORIES.map((c) => c.id),
        CATEGORIES.map((c) => c.id),
        2,
      ),
    };
  },

  quickConfig: () => ({ ...defaultPriceConfig(), rounds: 5, standingsEvery: 99 }),

  create(ctx, config) {
    const state: PriceState = {
      config,
      round: 0,
      phase: { kind: 'intro', endsAt: ctx.now },
      deck: buildDeck(ctx, config),
      deckIndex: 0,
      question: null,
      guesses: {},
      outcomes: [],
      stats: Object.fromEntries(ctx.players.map((p) => [p.id, emptyStats()])),
      finale: null,
    };
    return beginRound(state, ctx);
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
        if (event.action.t === 'endGame') return finish(state, ctx);
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
    const mine = buildStandings(state, ctx.players).find((s) => s.playerId === playerId);
    const extra: string[] = [];
    if (stats.exact > 0) extra.push(`💎 ${stats.exact} ${stats.exact === 1 ? 'clavado' : 'clavados'}`);
    if (stats.closest > 0) extra.push(`🎯 ${stats.closest}`);
    return {
      score: stats.points,
      scoreLabel: `${stats.points.toLocaleString('es-AR')} pts`,
      extra: extra.join('  ·  ') || undefined,
      rank: mine?.rank,
      totalPlayers: ctx.players.length,
    };
  },
};

function emptyStats(): PriceStats {
  return { points: 0, closest: 0, exact: 0, above: 0, below: 0, blanks: 0, guesses: 0, relError: 0 };
}

function ensureStats(state: PriceState, playerId: PlayerId): PriceState {
  if (state.stats[playerId]) return state;
  return { ...state, stats: { ...state.stats, [playerId]: emptyStats() } };
}

function buildDeck(ctx: GameCtx, config: PriceConfig): PriceQuestion[] {
  const wanted = config.categories?.length ? new Set(config.categories) : null;
  return ctx.rng.shuffle(PRICE_QUESTIONS.filter((q) => !wanted || wanted.has(q.category)));
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function phaseTimer(delayMs: number): Effect[] {
  return [{ t: 'timer', key: 'phase', delayMs }];
}

function beginRound(state: PriceState, ctx: GameCtx): Reduction<PriceState> {
  const round = state.round + 1;
  const question = state.deck[state.deckIndex];
  if (round > state.config.rounds || !question) return finish(state, ctx);

  return {
    state: {
      ...state,
      round,
      deckIndex: state.deckIndex + 1,
      question,
      guesses: {},
      outcomes: [],
      phase: { kind: 'intro', endsAt: ctx.now + state.config.introMs },
    },
    effects: [...phaseTimer(state.config.introMs), { t: 'sfx', name: 'round-start' }],
  };
}

function advance(state: PriceState, ctx: GameCtx): Reduction<PriceState> {
  switch (state.phase.kind) {
    case 'intro':
      return {
        state: {
          ...state,
          phase: { kind: 'guess', startedAt: ctx.now, endsAt: ctx.now + state.config.guessMs },
        },
        effects: [...phaseTimer(state.config.guessMs), { t: 'sfx', name: 'question' }],
      };
    case 'guess':
      return resolveRound(state, ctx);
    case 'reveal':
      return afterReveal(state, ctx);
    case 'standings':
      return beginRound(state, ctx);
    case 'done':
      return { state };
  }
}

function resolveRound(state: PriceState, ctx: GameCtx): Reduction<PriceState> {
  const question = state.question;
  if (!question) return afterReveal(state, ctx);
  const answer = question.answer;

  // 1. Distancia de cada uno, y quién queda descalificado por pasarse.
  const raw = ctx.players.map((player) => {
    const guess = state.guesses[player.id];
    if (guess === undefined) {
      return { playerId: player.id, guess: null, distance: null, over: false, exact: false };
    }
    const over = state.config.noOvershoot && guess > answer;
    return {
      playerId: player.id,
      guess,
      distance: Math.abs(guess - answer),
      over,
      exact: guess === answer,
    };
  });

  // 2. Ranking entre los que puntúan. Empate de distancia = mismo puesto.
  const ranked = raw
    .filter((r) => r.distance !== null && !r.over)
    .sort((a, b) => a.distance! - b.distance!);
  const rankOf = new Map<PlayerId, number>();
  let lastDistance = Number.NaN;
  let lastRank = 0;
  ranked.forEach((entry, index) => {
    const rank = entry.distance === lastDistance ? lastRank : index + 1;
    lastDistance = entry.distance!;
    lastRank = rank;
    rankOf.set(entry.playerId, rank);
  });

  const outcomes: PriceOutcome[] = raw.map((r) => {
    const rank = rankOf.get(r.playerId) ?? null;
    const base = rank === null ? 0 : (RANK_POINTS[rank - 1] ?? CONSOLATION);
    const points = base + (r.exact ? EXACT_BONUS : 0);
    return {
      playerId: r.playerId,
      guess: r.guess,
      distance: r.distance,
      rank,
      exact: r.exact,
      over: r.over,
      points,
      note: r.exact
        ? '¡Clavado!'
        : r.over
          ? 'Se pasó'
          : r.guess === null
            ? 'No tiró número'
            : undefined,
    };
  });

  // 3. A las estadísticas.
  const stats = { ...state.stats };
  for (const outcome of outcomes) {
    const previous = stats[outcome.playerId] ?? emptyStats();
    const relError =
      outcome.distance !== null ? outcome.distance / Math.max(1, Math.abs(answer)) : 0;
    stats[outcome.playerId] = {
      ...previous,
      points: previous.points + outcome.points,
      closest: previous.closest + (outcome.rank === 1 ? 1 : 0),
      exact: previous.exact + (outcome.exact ? 1 : 0),
      above: previous.above + (outcome.guess !== null && outcome.guess > answer ? 1 : 0),
      below: previous.below + (outcome.guess !== null && outcome.guess < answer ? 1 : 0),
      blanks: previous.blanks + (outcome.guess === null ? 1 : 0),
      guesses: previous.guesses + (outcome.guess !== null ? 1 : 0),
      relError: previous.relError + relError,
    };
  }

  return {
    state: {
      ...state,
      stats,
      outcomes,
      phase: { kind: 'reveal', endsAt: ctx.now + state.config.revealMs },
    },
    effects: [
      ...phaseTimer(state.config.revealMs),
      { t: 'sfx', name: outcomes.some((o) => o.exact) ? 'star' : 'reveal' },
    ],
  };
}

function afterReveal(state: PriceState, ctx: GameCtx): Reduction<PriceState> {
  if (state.round >= state.config.rounds) return finish(state, ctx);
  if (state.round % state.config.standingsEvery === 0) {
    return {
      state: { ...state, phase: { kind: 'standings', endsAt: ctx.now + state.config.standingsMs } },
      effects: phaseTimer(state.config.standingsMs),
    };
  }
  return beginRound(state, ctx);
}

function finish(state: PriceState, ctx: GameCtx): Reduction<PriceState> {
  const standings = buildStandings(state, ctx.players);
  const medals = buildMedals(state, ctx.players);
  return {
    state: { ...state, phase: { kind: 'done' }, finale: { standings, medals } },
    effects: [
      { t: 'cancelTimer', key: 'phase' },
      { t: 'sfx', name: 'finale' },
      { t: 'finish', standings, medals },
    ],
  };
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

function onPlayerAction(
  state: PriceState,
  playerId: PlayerId,
  action: { t: string; [k: string]: unknown },
  ctx: GameCtx,
): Reduction<PriceState> {
  const withStats = ensureStats(state, playerId);
  if (action.t !== 'submitText' || withStats.phase.kind !== 'guess') return { state: withStats };
  if (withStats.guesses[playerId] !== undefined) return { state: withStats };

  const guess = parseGuess(String(action.text ?? ''));
  if (guess === null) return { state: withStats };

  const next: PriceState = { ...withStats, guesses: { ...withStats.guesses, [playerId]: guess } };
  return everyoneGuessed(next, ctx) ? resolveRound(next, ctx) : { state: next };
}

/** El celu ya filtra, pero el número igual se valida acá: es lo que llega al juego. */
export function parseGuess(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value > MAX_GUESS) return null;
  return value;
}

function activePlayers(ctx: GameCtx | ViewCtx): PlayerId[] {
  const connected = ctx.players.filter((p) => p.connected);
  return (connected.length ? connected : ctx.players).map((p) => p.id);
}

function everyoneGuessed(state: PriceState, ctx: GameCtx): boolean {
  return activePlayers(ctx).every((id) => state.guesses[id] !== undefined);
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function buildStandings(state: PriceState, players: Player[]): Standing[] {
  const rows = players
    .map((player) => ({ playerId: player.id, stats: state.stats[player.id] ?? emptyStats() }))
    .sort((a, b) => b.stats.points - a.stats.points || b.stats.closest - a.stats.closest);

  let lastScore = Number.NaN;
  let lastRank = 0;
  return rows.map((row, index) => {
    const rank = row.stats.points === lastScore ? lastRank : index + 1;
    lastScore = row.stats.points;
    lastRank = rank;
    return {
      playerId: row.playerId,
      rank,
      score: row.stats.points,
      label: `${row.stats.points.toLocaleString('es-AR')} pts`,
    };
  });
}

function buildMedals(state: PriceState, players: Player[]): Medal[] {
  const specs: {
    id: string;
    name: string;
    description: string;
    emoji: string;
    value: (s: PriceStats) => number | null;
    detail: (s: PriceStats) => string;
  }[] = [
    {
      id: 'ojo',
      name: 'Ojo de Águila',
      description: 'El que más veces quedó más cerca',
      emoji: '🎯',
      value: (s) => (s.closest > 0 ? s.closest : null),
      detail: (s) => `${s.closest} ${s.closest === 1 ? 'ronda' : 'rondas'}`,
    },
    {
      id: 'clavado',
      name: 'Clavado',
      description: 'El que acertó el número exacto',
      emoji: '💎',
      value: (s) => (s.exact > 0 ? s.exact : null),
      detail: (s) => `${s.exact} ${s.exact === 1 ? 'vez' : 'veces'}`,
    },
    {
      id: 'ojimetro',
      name: 'Buen Ojímetro',
      description: 'El que menos se desvió en promedio',
      emoji: '📏',
      value: (s) => (s.guesses >= 3 ? -(s.relError / s.guesses) : null),
      detail: (s) => `${Math.round((s.relError / Math.max(1, s.guesses)) * 100)}% de error`,
    },
    {
      id: 'exagerado',
      name: 'Exagerado',
      description: 'El que más veces tiró para arriba',
      emoji: '🎈',
      value: (s) => (s.above > 0 ? s.above : null),
      detail: (s) => `${s.above} ${s.above === 1 ? 'vez' : 'veces'} de más`,
    },
    {
      id: 'cauto',
      name: 'Cauteloso',
      description: 'El que más veces se quedó corto',
      emoji: '🐢',
      value: (s) => (s.below > 0 ? s.below : null),
      detail: (s) => `${s.below} ${s.below === 1 ? 'vez' : 'veces'} de menos`,
    },
    {
      id: 'fantasma',
      name: 'Fantasma',
      description: 'Las veces que ni tiró un número',
      emoji: '👻',
      value: (s) => (s.blanks > 0 ? s.blanks : null),
      detail: (s) => `${s.blanks} en blanco`,
    },
  ];

  const out: Medal[] = [];
  for (const spec of specs) {
    let winner: { playerId: PlayerId; value: number; stats: PriceStats } | null = null;
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

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------

/**
 * Extremos de la recta del reveal. Se calculan acá y no en la tele para que la
 * pantalla siga siendo tonta, y con un margen para que nada quede pegado al borde.
 */
export function buildScale(answer: number, guesses: number[]): PriceScale {
  const values = [answer, ...guesses];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.15 : Math.max(1, Math.abs(answer) * 0.1);
  // Nunca por debajo de cero: "-31 países" en la recta se lee como un error.
  return { min: Math.max(0, lo - pad), max: hi + pad };
}

function buildHud(state: PriceState, ctx: ViewCtx): PriceHud {
  const showDelta = state.phase.kind === 'reveal';
  return {
    round: state.round,
    totalRounds: state.config.rounds,
    noOvershoot: state.config.noOvershoot,
    entries: ctx.players.map((player) => {
      const outcome = state.outcomes.find((o) => o.playerId === player.id);
      return {
        playerId: player.id,
        points: state.stats[player.id]?.points ?? 0,
        delta: showDelta && outcome ? outcome.points : null,
      };
    }),
  };
}

function hostView(state: PriceState, ctx: ViewCtx): PriceHostView {
  const hud = buildHud(state, ctx);
  const category = getCategory(state.question?.category ?? '');

  switch (state.phase.kind) {
    case 'intro':
      return { kind: 'price/intro', hud, category };

    case 'guess':
      return {
        kind: 'price/guess',
        hud,
        category,
        text: state.question?.text ?? '',
        unit: state.question?.unit,
        endsAt: state.phase.endsAt,
        // Solo quién ya tiró, nunca el número: se revelan todos juntos.
        ready: Object.keys(state.guesses),
      };

    case 'reveal': {
      const answer = state.question?.answer ?? 0;
      const guesses = state.outcomes
        .map((o) => o.guess)
        .filter((guess): guess is number => guess !== null);
      return {
        kind: 'price/reveal',
        hud,
        text: state.question?.text ?? '',
        unit: state.question?.unit,
        answer,
        scale: buildScale(answer, guesses),
        outcomes: state.outcomes,
        note: state.question?.note,
      };
    }

    case 'standings':
      return { kind: 'price/standings', hud, standings: buildStandings(state, ctx.players) };

    case 'done':
      return { kind: 'price/done', hud };
  }
}

function playerView(state: PriceState, playerId: PlayerId, ctx: ViewCtx): PlayerView {
  const category = getCategory(state.question?.category ?? '');

  switch (state.phase.kind) {
    case 'intro':
      return {
        kind: 'idle',
        title: `Ronda ${state.round}`,
        subtitle: category.name,
        emoji: '🎯',
      };

    case 'guess': {
      const mine = state.guesses[playerId];
      return {
        kind: 'text',
        prompt: state.question?.text ?? '',
        hint: state.config.noOvershoot
          ? '😬 Sin pasarse: si te pasás, no sumás'
          : state.question?.unit
            ? `En ${state.question.unit}`
            : undefined,
        placeholder: '0',
        maxLength: 13,
        numeric: true,
        submitted: mine === undefined ? undefined : String(mine),
        deadline: state.phase.endsAt,
      };
    }

    case 'reveal': {
      const outcome = state.outcomes.find((o) => o.playerId === playerId);
      if (!outcome || outcome.guess === null) {
        return {
          kind: 'verdict',
          tone: 'bad',
          title: 'No tiraste número',
          subtitle: `Era ${state.question?.answer.toLocaleString('es-AR')}`,
          emoji: '😴',
        };
      }
      const good = outcome.rank === 1;
      return {
        kind: 'verdict',
        tone: outcome.points > 0 ? (good ? 'good' : 'neutral') : 'bad',
        title: outcome.exact
          ? '¡Clavado!'
          : outcome.over
            ? 'Te pasaste'
            : good
              ? 'El más cerca'
              : `Te faltó por ${outcome.distance?.toLocaleString('es-AR')}`,
        subtitle: `Era ${state.question?.answer.toLocaleString('es-AR')}`,
        delta: outcome.points,
        deltaSuffix: 'pts',
        emoji: outcome.exact ? '💎' : good ? '🎯' : outcome.over ? '🎈' : '📏',
      };
    }

    case 'standings': {
      const mine = buildStandings(state, ctx.players).find((s) => s.playerId === playerId);
      return {
        kind: 'idle',
        title: mine ? `Vas #${mine.rank}` : 'Tabla',
        subtitle: mine?.label,
        emoji: mine?.rank === 1 ? '👑' : '📊',
      };
    }

    case 'done':
      return { kind: 'idle', title: 'Se terminó', subtitle: 'Mirá la tele', emoji: '🏁' };
  }
}

export { PRICE_QUESTIONS } from './questions';
export type * from './types';
