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
import { readChoice } from '../settings';
import { getCategory } from '../trivia/categories';
import { LIAR_PROMPTS } from './prompts';
import type {
  LiarConfig,
  LiarHostView,
  LiarHud,
  LiarOption,
  LiarOutcome,
  LiarPrompt,
  LiarState,
  LiarStats,
} from './types';

export const LIAR_INFO: GameInfo = {
  id: 'liar',
  name: 'Mentiroso',
  tagline: 'Inventá una mentira creíble. Encontrá la verdad entre las de los demás.',
  emoji: '🎭',
  minPlayers: 2,
  maxPlayers: 8,
  modes: [
    {
      id: 'classic',
      name: 'Clásico',
      description: 'Cobrás por cada uno que pica en tu mentira, y por encontrar la verdad.',
      emoji: '🃏',
      available: true,
    },
  ],
  settings: [
    {
      kind: 'choice',
      id: 'rondas',
      label: 'Rondas',
      options: [
        { value: 5, label: '5 · corta' },
        { value: 8, label: '8 · normal' },
        { value: 12, label: '12 · larga' },
      ],
      default: 8,
    },
    {
      kind: 'choice',
      id: 'escritura',
      label: 'Tiempo para mentir',
      hint: 'Cuánto tienen para inventar la respuesta falsa',
      options: [
        { value: 'rapido', label: '25s · apurados' },
        { value: 'normal', label: '40s · normal' },
        { value: 'tranqui', label: '60s · elaborada' },
      ],
      default: 'normal',
    },
  ],
};

const WRITE_MS = { rapido: 25_000, normal: 40_000, tranqui: 60_000 } as const;

const POINTS = {
  /** Por cada persona que vota tu mentira. */
  fool: 500,
  /** Por encontrar la verdad. */
  truth: 1000,
  /** Por escribir la verdad sin querer (queda fuera de la votación). */
  accident: 500,
} as const;

export function defaultLiarConfig(): LiarConfig {
  return {
    rounds: 8,
    introMs: 2_600,
    writeMs: 40_000,
    voteMs: 25_000,
    revealMs: 11_000,
    standingsMs: 7_500,
    standingsEvery: 4,
    maxAnswerLength: 40,
    categories: null,
  };
}

export const liarGame: GameModule<LiarState, LiarConfig> = {
  info: LIAR_INFO,

  defaultConfig: () => defaultLiarConfig(),

  configure(settings) {
    const escritura = readChoice(
      settings,
      'escritura',
      ['rapido', 'normal', 'tranqui'] as const,
      'normal',
    );
    return {
      ...defaultLiarConfig(),
      rounds: readChoice(settings, 'rondas', [5, 8, 12] as const, 8),
      writeMs: WRITE_MS[escritura],
    };
  },

  create(ctx, config) {
    const state: LiarState = {
      config,
      round: 0,
      phase: { kind: 'intro', endsAt: ctx.now },
      deck: buildDeck(ctx, config),
      deckIndex: 0,
      prompt: null,
      fakes: {},
      accidents: [],
      options: [],
      votes: {},
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
    return {
      score: stats.points,
      scoreLabel: `${stats.points.toLocaleString('es-AR')} pts`,
      extra: stats.fooled > 0 ? `🎭 engañaste a ${stats.fooled}` : undefined,
      rank: mine?.rank,
      totalPlayers: ctx.players.length,
    };
  },
};

function emptyStats(): LiarStats {
  return { points: 0, fooled: 0, found: 0, accidents: 0, blanks: 0, fell: 0 };
}

function ensureStats(state: LiarState, playerId: PlayerId): LiarState {
  if (state.stats[playerId]) return state;
  return { ...state, stats: { ...state.stats, [playerId]: emptyStats() } };
}

function buildDeck(ctx: GameCtx, config: LiarConfig): LiarPrompt[] {
  const wanted = config.categories?.length ? new Set(config.categories) : null;
  const pool = LIAR_PROMPTS.filter((p) => !wanted || wanted.has(p.category));
  return ctx.rng.shuffle(pool);
}

/** Para comparar respuestas escritas a mano: sin acentos, sin puntuación, sin mayúsculas. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // saca los acentos, no las letras
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTruth(prompt: LiarPrompt, text: string): boolean {
  const target = normalize(text);
  if (!target) return false;
  return [prompt.answer, ...(prompt.also ?? [])].some((truth) => normalize(truth) === target);
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function phaseTimer(delayMs: number): Effect[] {
  return [{ t: 'timer', key: 'phase', delayMs }];
}

function beginRound(state: LiarState, ctx: GameCtx): Reduction<LiarState> {
  const round = state.round + 1;
  const prompt = state.deck[state.deckIndex];
  if (round > state.config.rounds || !prompt) return finish(state, ctx);

  return {
    state: {
      ...state,
      round,
      deckIndex: state.deckIndex + 1,
      prompt,
      fakes: {},
      accidents: [],
      options: [],
      votes: {},
      outcomes: [],
      phase: { kind: 'intro', endsAt: ctx.now + state.config.introMs },
    },
    effects: [...phaseTimer(state.config.introMs), { t: 'sfx', name: 'round-start' }],
  };
}

function advance(state: LiarState, ctx: GameCtx): Reduction<LiarState> {
  switch (state.phase.kind) {
    case 'intro':
      return {
        state: { ...state, phase: { kind: 'write', endsAt: ctx.now + state.config.writeMs } },
        effects: [...phaseTimer(state.config.writeMs), { t: 'sfx', name: 'question' }],
      };
    case 'write':
      return enterVote(state, ctx);
    case 'vote':
      return resolveVote(state, ctx);
    case 'reveal':
      return afterReveal(state, ctx);
    case 'standings':
      return beginRound(state, ctx);
    case 'done':
      return { state };
  }
}

function enterVote(state: LiarState, ctx: GameCtx): Reduction<LiarState> {
  const prompt = state.prompt;
  if (!prompt) return afterReveal(state, ctx);

  // Las mentiras iguales se juntan en una sola opción con varios autores.
  const merged = new Map<string, { text: string; authors: PlayerId[] }>();
  for (const player of ctx.players) {
    const fake = state.fakes[player.id];
    if (!fake) continue;
    const key = normalize(fake);
    const existing = merged.get(key);
    if (existing) existing.authors.push(player.id);
    else merged.set(key, { text: fake, authors: [player.id] });
  }

  const entries = [
    ...[...merged.values()].map((entry) => ({ ...entry, truth: false })),
    { text: prompt.answer, authors: [] as PlayerId[], truth: true },
  ];

  const options: LiarOption[] = ctx.rng.shuffle(entries).map((entry, index) => ({
    id: `o${index}`,
    text: entry.text,
    slot: index % 4,
    authors: entry.authors,
    truth: entry.truth,
  }));

  // Los que no escribieron nada quedan marcados: hay medalla para eso.
  const stats = { ...state.stats };
  for (const player of ctx.players) {
    if (state.fakes[player.id] || state.accidents.includes(player.id)) continue;
    const previous = stats[player.id] ?? emptyStats();
    stats[player.id] = { ...previous, blanks: previous.blanks + 1 };
  }

  return {
    state: {
      ...state,
      stats,
      options,
      phase: { kind: 'vote', endsAt: ctx.now + state.config.voteMs },
    },
    effects: [...phaseTimer(state.config.voteMs), { t: 'sfx', name: 'question' }],
  };
}

function resolveVote(state: LiarState, ctx: GameCtx): Reduction<LiarState> {
  const gained = new Map<PlayerId, number>();
  const add = (playerId: PlayerId, amount: number) =>
    gained.set(playerId, (gained.get(playerId) ?? 0) + amount);

  const stats = { ...state.stats };
  const bump = (playerId: PlayerId, patch: Partial<LiarStats>) => {
    stats[playerId] = { ...(stats[playerId] ?? emptyStats()), ...patch };
  };

  // Escribir la verdad sin querer paga, aunque no entre a la votación.
  for (const playerId of state.accidents) {
    add(playerId, POINTS.accident);
    const previous = stats[playerId] ?? emptyStats();
    bump(playerId, { accidents: previous.accidents + 1 });
  }

  const outcomes: LiarOutcome[] = ctx.players.map((player) => {
    const votedId = state.votes[player.id] ?? null;
    const option = state.options.find((o) => o.id === votedId);
    const votedTruth = !!option?.truth;

    if (votedTruth) {
      add(player.id, POINTS.truth);
      const previous = stats[player.id] ?? emptyStats();
      bump(player.id, { found: previous.found + 1 });
    } else if (option) {
      // Picó: cada autor de esa mentira cobra.
      for (const author of option.authors) {
        add(author, POINTS.fool);
        const previous = stats[author] ?? emptyStats();
        bump(author, { fooled: previous.fooled + 1 });
      }
      const previous = stats[player.id] ?? emptyStats();
      bump(player.id, { fell: previous.fell + 1 });
    }

    return {
      playerId: player.id,
      votedId,
      votedTruth,
      fooledIds: [],
      points: 0,
    };
  });

  // Quién cayó en la mentira de quién, para mostrarlo en la tele.
  const withFooled = outcomes.map((outcome) => {
    const fooledIds = ctx.players
      .filter((other) => {
        if (other.id === outcome.playerId) return false;
        const option = state.options.find((o) => o.id === state.votes[other.id]);
        return !!option && !option.truth && option.authors.includes(outcome.playerId);
      })
      .map((other) => other.id);
    const points = gained.get(outcome.playerId) ?? 0;
    return {
      ...outcome,
      fooledIds,
      points,
      note: state.accidents.includes(outcome.playerId) ? 'Escribió la verdad' : undefined,
    };
  });

  for (const outcome of withFooled) {
    const previous = stats[outcome.playerId] ?? emptyStats();
    stats[outcome.playerId] = { ...previous, points: previous.points + outcome.points };
  }

  return {
    state: {
      ...state,
      stats,
      outcomes: withFooled,
      phase: { kind: 'reveal', endsAt: ctx.now + state.config.revealMs },
    },
    effects: [...phaseTimer(state.config.revealMs), { t: 'sfx', name: 'reveal' }],
  };
}

function afterReveal(state: LiarState, ctx: GameCtx): Reduction<LiarState> {
  if (state.round >= state.config.rounds) return finish(state, ctx);
  if (state.round % state.config.standingsEvery === 0) {
    return {
      state: { ...state, phase: { kind: 'standings', endsAt: ctx.now + state.config.standingsMs } },
      effects: phaseTimer(state.config.standingsMs),
    };
  }
  return beginRound(state, ctx);
}

function finish(state: LiarState, ctx: GameCtx): Reduction<LiarState> {
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
  state: LiarState,
  playerId: PlayerId,
  action: { t: string; [k: string]: unknown },
  ctx: GameCtx,
): Reduction<LiarState> {
  const withStats = ensureStats(state, playerId);
  const prompt = withStats.prompt;

  if (action.t === 'submitText' && withStats.phase.kind === 'write' && prompt) {
    if (withStats.fakes[playerId] || withStats.accidents.includes(playerId)) {
      return { state: withStats };
    }
    const text = String(action.text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, withStats.config.maxAnswerLength);
    if (!normalize(text)) return { state: withStats };

    const next: LiarState = isTruth(prompt, text)
      ? { ...withStats, accidents: [...withStats.accidents, playerId] }
      : { ...withStats, fakes: { ...withStats.fakes, [playerId]: text } };

    return everyoneWrote(next, ctx) ? enterVote(next, ctx) : { state: next };
  }

  if (action.t === 'choose' && withStats.phase.kind === 'vote') {
    if (withStats.votes[playerId]) return { state: withStats };
    const optionId = String(action.choiceId);
    const option = withStats.options.find((o) => o.id === optionId);
    // Nadie vota su propia mentira, por más que el celu lo mande.
    if (!option || option.authors.includes(playerId)) return { state: withStats };

    const next: LiarState = { ...withStats, votes: { ...withStats.votes, [playerId]: optionId } };
    return everyoneVoted(next, ctx) ? resolveVote(next, ctx) : { state: next };
  }

  return { state: withStats };
}

function activePlayers(ctx: GameCtx | ViewCtx): PlayerId[] {
  const connected = ctx.players.filter((p) => p.connected);
  return (connected.length ? connected : ctx.players).map((p) => p.id);
}

function everyoneWrote(state: LiarState, ctx: GameCtx): boolean {
  return activePlayers(ctx).every((id) => state.fakes[id] || state.accidents.includes(id));
}

function everyoneVoted(state: LiarState, ctx: GameCtx): boolean {
  return activePlayers(ctx).every((id) => state.votes[id]);
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function buildStandings(state: LiarState, players: Player[]): Standing[] {
  const rows = players
    .map((player) => ({ playerId: player.id, stats: state.stats[player.id] ?? emptyStats() }))
    .sort((a, b) => b.stats.points - a.stats.points || b.stats.fooled - a.stats.fooled);

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

function buildMedals(state: LiarState, players: Player[]): Medal[] {
  const specs: {
    id: string;
    name: string;
    description: string;
    emoji: string;
    value: (s: LiarStats) => number | null;
    detail: (s: LiarStats) => string;
  }[] = [
    {
      id: 'mentiroso',
      name: 'Mentiroso Serial',
      description: 'El que hizo picar a más gente',
      emoji: '🎭',
      value: (s) => (s.fooled > 0 ? s.fooled : null),
      detail: (s) => `${s.fooled} ${s.fooled === 1 ? 'incauto' : 'incautos'}`,
    },
    {
      id: 'sabueso',
      name: 'Sabueso',
      description: 'El que más veces encontró la verdad',
      emoji: '🔍',
      value: (s) => (s.found > 0 ? s.found : null),
      detail: (s) => `${s.found} ${s.found === 1 ? 'verdad' : 'verdades'}`,
    },
    {
      id: 'ovejita',
      name: 'Ovejita',
      description: 'El que más veces se comió una mentira',
      emoji: '🐑',
      value: (s) => (s.fell > 0 ? s.fell : null),
      detail: (s) => `picó ${s.fell} ${s.fell === 1 ? 'vez' : 'veces'}`,
    },
    {
      id: 'suertudo',
      name: 'Suertudo',
      description: 'Escribió la verdad sin saberlo',
      emoji: '🍀',
      value: (s) => (s.accidents > 0 ? s.accidents : null),
      detail: (s) => `${s.accidents} ${s.accidents === 1 ? 'vez' : 'veces'}`,
    },
    {
      id: 'fantasma',
      name: 'Fantasma',
      description: 'Las veces que no escribió nada',
      emoji: '👻',
      value: (s) => (s.blanks > 0 ? s.blanks : null),
      detail: (s) => `${s.blanks} en blanco`,
    },
  ];

  const out: Medal[] = [];
  for (const spec of specs) {
    let winner: { playerId: PlayerId; value: number; stats: LiarStats } | null = null;
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

function buildHud(state: LiarState, ctx: ViewCtx): LiarHud {
  const showDelta = state.phase.kind === 'reveal';
  return {
    round: state.round,
    totalRounds: state.config.rounds,
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

function hostView(state: LiarState, ctx: ViewCtx): LiarHostView {
  const hud = buildHud(state, ctx);
  const category = getCategory(state.prompt?.category ?? '');

  switch (state.phase.kind) {
    case 'intro':
      return { kind: 'liar/intro', hud, category };

    case 'write':
      return {
        kind: 'liar/write',
        hud,
        category,
        text: state.prompt?.text ?? '',
        endsAt: state.phase.endsAt,
        ready: [...Object.keys(state.fakes), ...state.accidents],
      };

    case 'vote':
      return {
        kind: 'liar/vote',
        hud,
        text: state.prompt?.text ?? '',
        options: state.options.map((o) => ({ id: o.id, text: o.text, slot: o.slot })),
        endsAt: state.phase.endsAt,
        voted: Object.keys(state.votes),
      };

    case 'reveal': {
      const votesByOption: Record<string, PlayerId[]> = {};
      for (const [playerId, optionId] of Object.entries(state.votes)) {
        (votesByOption[optionId] ??= []).push(playerId);
      }
      return {
        kind: 'liar/reveal',
        hud,
        text: state.prompt?.text ?? '',
        answer: state.prompt?.answer ?? '',
        options: state.options,
        votesByOption,
        outcomes: state.outcomes,
        accidents: state.accidents,
      };
    }

    case 'standings':
      return { kind: 'liar/standings', hud, standings: buildStandings(state, ctx.players) };

    case 'done':
      return { kind: 'liar/done', hud };
  }
}

function playerView(state: LiarState, playerId: PlayerId, ctx: ViewCtx): PlayerView {
  const category = getCategory(state.prompt?.category ?? '');

  switch (state.phase.kind) {
    case 'intro':
      return {
        kind: 'idle',
        title: `Ronda ${state.round}`,
        subtitle: category.name,
        emoji: '🎭',
      };

    case 'write': {
      if (state.accidents.includes(playerId)) {
        return {
          kind: 'idle',
          title: '¡Escribiste la verdad!',
          subtitle: 'Sin querer. Cobrás igual.',
          emoji: '🍀',
        };
      }
      return {
        kind: 'text',
        prompt: state.prompt?.text ?? '',
        placeholder: 'Inventá algo creíble',
        maxLength: state.config.maxAnswerLength,
        submitted: state.fakes[playerId],
        deadline: state.phase.endsAt,
      };
    }

    case 'vote': {
      // Cada uno vota entre las mentiras ajenas y la verdad; la suya no aparece.
      const choices: Choice[] = state.options
        .filter((option) => !option.authors.includes(playerId))
        .map((option) => ({ id: option.id, label: option.text, slot: option.slot }));
      return {
        kind: 'choices',
        prompt: '¿Cuál es la verdad?',
        hint: state.accidents.includes(playerId) ? '🍀 Vos ya la escribiste' : undefined,
        choices,
        locked: state.votes[playerId],
        deadline: state.phase.endsAt,
      };
    }

    case 'reveal': {
      const outcome = state.outcomes.find((o) => o.playerId === playerId);
      if (!outcome) return { kind: 'idle', title: 'Mirá la tele', emoji: '📺' };
      const fooled = outcome.fooledIds.length;
      return {
        kind: 'verdict',
        tone: outcome.points > 0 ? 'good' : 'bad',
        title: outcome.votedTruth
          ? '¡Encontraste la verdad!'
          : fooled > 0
            ? `Cayeron ${fooled}`
            : outcome.votedId
              ? 'Te comiste una mentira'
              : 'No votaste',
        subtitle: outcome.note,
        delta: outcome.points,
        deltaSuffix: 'pts',
        emoji: outcome.votedTruth ? '🔍' : fooled > 0 ? '🎭' : '🐑',
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

export { LIAR_PROMPTS } from './prompts';
export type * from './types';
