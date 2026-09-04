import {
  type GameInfo,
  type Medal,
  type Player,
  type PlayerId,
  type PlayerView,
  type Standing,
} from '@perty/protocol';
import type { Effect, GameCtx, GameModule, Reduction, ViewCtx } from '@perty/engine';
import { readChoice } from '../settings';
import { normalize } from '../liar';
import { POLL_PROMPTS } from './prompts';
import type {
  PollConfig,
  PollGroup,
  PollHostView,
  PollHud,
  PollOutcome,
  PollPrompt,
  PollRevealGroup,
  PollState,
  PollStats,
} from './types';

export const POLL_INFO: GameInfo = {
  id: 'poll',
  name: 'Encuesta',
  tagline: 'No gana el que tiene razón: gana el que piensa como el resto.',
  emoji: '🐑',
  minPlayers: 3,
  maxPlayers: 8,
  modes: [
    {
      id: 'classic',
      name: 'Clásico',
      description: 'Cobrás si escribiste lo mismo que la mayoría. El bicho raro se lleva la vaca.',
      emoji: '🐄',
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
      label: 'Tiempo para responder',
      hint: 'Poco tiempo obliga a poner lo primero que se te viene, que suele ser lo mismo que a todos',
      options: [
        { value: 'rapido', label: '15s · instinto' },
        { value: 'normal', label: '25s · normal' },
        { value: 'tranqui', label: '40s · pensado' },
      ],
      default: 'normal',
    },
    {
      kind: 'choice',
      id: 'vaca',
      label: 'La vaca',
      hint: 'Se la queda el único que no coincidió con nadie. Terminar con ella cuesta caro',
      options: [
        { value: 'si', label: 'Sí', emoji: '🐄' },
        { value: 'no', label: 'No', emoji: '😌' },
      ],
      default: 'si',
    },
  ],
};

const WRITE_MS = { rapido: 15_000, normal: 25_000, tranqui: 40_000 } as const;

export function defaultPollConfig(): PollConfig {
  return {
    rounds: 8,
    introMs: 2_400,
    writeMs: 25_000,
    revealMs: 11_000,
    standingsMs: 7_500,
    standingsEvery: 4,
    maxAnswerLength: 28,
    perHead: 500,
    unanimousBonus: 1_000,
    cowPenalty: 2_500,
  };
}

export const pollGame: GameModule<PollState, PollConfig> = {
  info: POLL_INFO,

  defaultConfig: () => defaultPollConfig(),

  configure(settings) {
    const escritura = readChoice(
      settings,
      'escritura',
      ['rapido', 'normal', 'tranqui'] as const,
      'normal',
    );
    const vaca = readChoice(settings, 'vaca', ['si', 'no'] as const, 'si');
    return {
      ...defaultPollConfig(),
      rounds: readChoice(settings, 'rondas', [5, 8, 12] as const, 8),
      writeMs: WRITE_MS[escritura],
      cowPenalty: vaca === 'si' ? 2_500 : 0,
    };
  },

  quickConfig: () => ({ ...defaultPollConfig(), rounds: 5, standingsEvery: 99 }),

  create(ctx, config) {
    const state: PollState = {
      config,
      round: 0,
      phase: { kind: 'intro', endsAt: ctx.now },
      deck: ctx.rng.shuffle(POLL_PROMPTS),
      deckIndex: 0,
      prompt: null,
      answers: {},
      groups: [],
      winnerIds: [],
      outcomes: [],
      cow: null,
      cowMoved: null,
      unanimous: false,
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
      extra: state.cow === playerId ? '🐄 tenés la vaca' : undefined,
      rank: mine?.rank,
      totalPlayers: ctx.players.length,
    };
  },
};

function emptyStats(): PollStats {
  return { points: 0, herd: 0, alone: 0, unanimous: 0, cows: 0, blanks: 0 };
}

function ensureStats(state: PollState, playerId: PlayerId): PollState {
  if (state.stats[playerId]) return state;
  return { ...state, stats: { ...state.stats, [playerId]: emptyStats() } };
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function phaseTimer(delayMs: number): Effect[] {
  return [{ t: 'timer', key: 'phase', delayMs }];
}

function beginRound(state: PollState, ctx: GameCtx): Reduction<PollState> {
  const round = state.round + 1;
  const prompt: PollPrompt | undefined = state.deck[state.deckIndex];
  if (round > state.config.rounds || !prompt) return finish(state, ctx);

  return {
    state: {
      ...state,
      round,
      deckIndex: state.deckIndex + 1,
      prompt,
      answers: {},
      groups: [],
      winnerIds: [],
      outcomes: [],
      cowMoved: null,
      unanimous: false,
      phase: { kind: 'intro', endsAt: ctx.now + state.config.introMs },
    },
    effects: [...phaseTimer(state.config.introMs), { t: 'sfx', name: 'round-start' }],
  };
}

function advance(state: PollState, ctx: GameCtx): Reduction<PollState> {
  switch (state.phase.kind) {
    case 'intro':
      return {
        state: { ...state, phase: { kind: 'write', endsAt: ctx.now + state.config.writeMs } },
        effects: [...phaseTimer(state.config.writeMs), { t: 'sfx', name: 'question' }],
      };
    case 'write':
      return resolveRound(state, ctx);
    case 'reveal':
      return afterReveal(state, ctx);
    case 'standings':
      return beginRound(state, ctx);
    case 'done':
      return { state };
  }
}

function resolveRound(state: PollState, ctx: GameCtx): Reduction<PollState> {
  // Agrupar por respuesta normalizada: "La Vaca" y "vaca" son el mismo rebaño.
  const merged = new Map<string, { text: string; members: PlayerId[] }>();
  for (const player of ctx.players) {
    const answer = state.answers[player.id];
    if (!answer) continue;
    const key = normalize(answer);
    const existing = merged.get(key);
    if (existing) existing.members.push(player.id);
    else merged.set(key, { text: answer, members: [player.id] });
  }

  const groups: PollGroup[] = [...merged.values()]
    .map((entry, index) => ({ ...entry, id: `g${index}` }))
    .sort((a, b) => b.members.length - a.members.length);

  const best = Math.max(0, ...groups.map((g) => g.members.length));
  const tops = groups.filter((g) => g.members.length === best);

  // La mayoría tiene que ser una sola y de más de uno: si empatan dos grupos, o
  // si nadie coincidió con nadie, la ronda no paga. Eso es lo que la hace tensa.
  const winners = best >= 2 && tops.length === 1 ? tops : [];
  // Unanimidad es la mesa entera, no "todos los que llegaron a contestar": con
  // alguien en blanco la tele estaría cantando un acuerdo que no existió.
  const unanimous =
    winners.length === 1 && ctx.players.length >= 3 && best === ctx.players.length;

  const stats = { ...state.stats };
  const outcomes: PollOutcome[] = ctx.players.map((player) => {
    const group = groups.find((g) => g.members.includes(player.id));
    if (!group) {
      return { playerId: player.id, groupId: null, points: 0, inHerd: false, alone: false, blank: true };
    }
    const inHerd = winners.some((w) => w.id === group.id);
    const points = inHerd
      ? group.members.length * state.config.perHead + (unanimous ? state.config.unanimousBonus : 0)
      : 0;
    return {
      playerId: player.id,
      groupId: group.id,
      points,
      inHerd,
      alone: group.members.length === 1,
      blank: false,
    };
  });

  // La vaca se la lleva el único que quedó solo. Si quedaron dos solos no se
  // mueve: no hay un raro, hay dos, y eso ya es otra cosa.
  const loners = outcomes.filter((o) => o.alone);
  const takesCow =
    state.config.cowPenalty > 0 && loners.length === 1 ? loners[0]!.playerId : null;

  for (const outcome of outcomes) {
    const previous = stats[outcome.playerId] ?? emptyStats();
    stats[outcome.playerId] = {
      ...previous,
      points: previous.points + outcome.points,
      herd: previous.herd + (outcome.inHerd ? 1 : 0),
      alone: previous.alone + (outcome.alone ? 1 : 0),
      unanimous: previous.unanimous + (unanimous && outcome.inHerd ? 1 : 0),
      cows: previous.cows + (takesCow === outcome.playerId ? 1 : 0),
      blanks: previous.blanks + (outcome.blank ? 1 : 0),
    };
  }

  return {
    state: {
      ...state,
      stats,
      groups,
      winnerIds: winners.map((w) => w.id),
      outcomes,
      unanimous,
      cow: takesCow ?? state.cow,
      cowMoved: takesCow,
      phase: { kind: 'reveal', endsAt: ctx.now + state.config.revealMs },
    },
    effects: [
      ...phaseTimer(state.config.revealMs),
      { t: 'sfx', name: unanimous ? 'star' : 'reveal' },
    ],
  };
}

function afterReveal(state: PollState, ctx: GameCtx): Reduction<PollState> {
  if (state.round >= state.config.rounds) return finish(state, ctx);
  if (state.round % state.config.standingsEvery === 0) {
    return {
      state: { ...state, phase: { kind: 'standings', endsAt: ctx.now + state.config.standingsMs } },
      effects: phaseTimer(state.config.standingsMs),
    };
  }
  return beginRound(state, ctx);
}

function finish(state: PollState, ctx: GameCtx): Reduction<PollState> {
  // La vaca se cobra recién al final: durante la partida es una amenaza, no un
  // castigo, y eso hace que el que la tiene juegue distinto la última ronda.
  const stats = { ...state.stats };
  if (state.cow && state.config.cowPenalty > 0) {
    const previous = stats[state.cow] ?? emptyStats();
    stats[state.cow] = { ...previous, points: previous.points - state.config.cowPenalty };
  }

  const settled: PollState = { ...state, stats, phase: { kind: 'done' } };
  const standings = buildStandings(settled, ctx.players);
  const medals = buildMedals(settled, ctx.players);

  return {
    state: { ...settled, finale: { standings, medals } },
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
  state: PollState,
  playerId: PlayerId,
  action: { t: string; [k: string]: unknown },
  ctx: GameCtx,
): Reduction<PollState> {
  const withStats = ensureStats(state, playerId);

  if (action.t === 'submitText' && withStats.phase.kind === 'write') {
    if (withStats.answers[playerId]) return { state: withStats };
    const text = String(action.text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, withStats.config.maxAnswerLength);
    if (!normalize(text)) return { state: withStats };

    const next: PollState = { ...withStats, answers: { ...withStats.answers, [playerId]: text } };
    return everyoneWrote(next, ctx) ? resolveRound(next, ctx) : { state: next };
  }

  return { state: withStats };
}

function everyoneWrote(state: PollState, ctx: GameCtx): boolean {
  const connected = ctx.players.filter((p) => p.connected);
  return (connected.length ? connected : ctx.players).every((p) => state.answers[p.id]);
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function buildStandings(state: PollState, players: Player[]): Standing[] {
  const rows = players
    .map((player) => ({ playerId: player.id, stats: state.stats[player.id] ?? emptyStats() }))
    .sort((a, b) => b.stats.points - a.stats.points || b.stats.herd - a.stats.herd);

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

function buildMedals(state: PollState, players: Player[]): Medal[] {
  const out: Medal[] = [];

  // La vaca no se compite: la tiene quien la tiene cuando suena la campana.
  if (state.cow && state.config.cowPenalty > 0) {
    out.push({
      id: 'vaca',
      name: 'La Vaca',
      description: 'Se quedó con ella hasta el final',
      emoji: '🐄',
      playerId: state.cow,
      detail: `−${state.config.cowPenalty.toLocaleString('es-AR')} pts`,
    });
  }

  const specs: {
    id: string;
    name: string;
    description: string;
    emoji: string;
    value: (s: PollStats) => number | null;
    detail: (s: PollStats) => string;
  }[] = [
    {
      id: 'rebano',
      name: 'Uno Más del Rebaño',
      description: 'El que más veces pensó como la mayoría',
      emoji: '🐑',
      value: (s) => (s.herd > 0 ? s.herd : null),
      detail: (s) => `${s.herd} ${s.herd === 1 ? 'ronda' : 'rondas'} en la mayoría`,
    },
    {
      id: 'raro',
      name: 'Bicho Raro',
      description: 'El que más veces quedó solo con su respuesta',
      emoji: '🦄',
      value: (s) => (s.alone > 0 ? s.alone : null),
      detail: (s) => `${s.alone} ${s.alone === 1 ? 'vez' : 'veces'} solo`,
    },
    {
      id: 'telepata',
      name: 'Telépata',
      description: 'Estuvo en las rondas donde coincidió toda la mesa',
      emoji: '🔮',
      value: (s) => (s.unanimous > 0 ? s.unanimous : null),
      detail: (s) => `${s.unanimous} ${s.unanimous === 1 ? 'unánime' : 'unánimes'}`,
    },
    {
      id: 'fantasma',
      name: 'Fantasma',
      description: 'Las veces que no contestó',
      emoji: '👻',
      value: (s) => (s.blanks > 0 ? s.blanks : null),
      detail: (s) => `${s.blanks} en blanco`,
    },
  ];

  for (const spec of specs) {
    let winner: { playerId: PlayerId; value: number; stats: PollStats } | null = null;
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

function buildHud(state: PollState, ctx: ViewCtx): PollHud {
  const showDelta = state.phase.kind === 'reveal';
  return {
    round: state.round,
    totalRounds: state.config.rounds,
    cow: state.cow,
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

function hostView(state: PollState, ctx: ViewCtx): PollHostView {
  const hud = buildHud(state, ctx);

  switch (state.phase.kind) {
    case 'intro':
      return { kind: 'poll/intro', hud };

    case 'write':
      return {
        kind: 'poll/write',
        hud,
        text: state.prompt?.text ?? '',
        hint: state.prompt?.hint,
        endsAt: state.phase.endsAt,
        ready: Object.keys(state.answers),
      };

    case 'reveal': {
      const groups: PollRevealGroup[] = state.groups.map((group) => ({
        id: group.id,
        text: group.text,
        members: group.members,
        points: state.outcomes.find((o) => o.groupId === group.id)?.points ?? 0,
        winner: state.winnerIds.includes(group.id),
      }));
      return {
        kind: 'poll/reveal',
        hud,
        text: state.prompt?.text ?? '',
        groups,
        blanks: state.outcomes.filter((o) => o.blank).map((o) => o.playerId),
        unanimous: state.unanimous,
        noDeal: state.winnerIds.length === 0,
        cowMoved: state.cowMoved,
      };
    }

    case 'standings':
      return { kind: 'poll/standings', hud, standings: buildStandings(state, ctx.players) };

    case 'done':
      return { kind: 'poll/done', hud };
  }
}

function playerView(state: PollState, playerId: PlayerId, ctx: ViewCtx): PlayerView {
  switch (state.phase.kind) {
    case 'intro':
      return {
        kind: 'idle',
        title: `Ronda ${state.round}`,
        subtitle: state.cow === playerId ? '🐄 Tenés la vaca' : 'Pensá como el resto',
        emoji: '🐑',
      };

    case 'write':
      return {
        kind: 'text',
        prompt: state.prompt?.text ?? '',
        hint: state.prompt?.hint ?? 'Lo que crees que van a poner los demás',
        placeholder: 'Una o dos palabras',
        maxLength: state.config.maxAnswerLength,
        submitted: state.answers[playerId],
        deadline: state.phase.endsAt,
      };

    case 'reveal': {
      const outcome = state.outcomes.find((o) => o.playerId === playerId);
      if (!outcome) return { kind: 'idle', title: 'Mirá la tele', emoji: '📺' };
      const group = state.groups.find((g) => g.id === outcome.groupId);
      const others = (group?.members.length ?? 1) - 1;
      return {
        kind: 'verdict',
        tone: outcome.inHerd ? 'good' : 'bad',
        title: outcome.blank
          ? 'No contestaste'
          : state.unanimous && outcome.inHerd
            ? '¡Coincidieron todos!'
            : outcome.inHerd
              ? `Con la mayoría (${others + 1})`
              : outcome.alone
                ? 'Quedaste solo'
                : 'Fuera de la mayoría',
        subtitle:
          state.cowMoved === playerId
            ? '🐄 Te llevás la vaca'
            : state.winnerIds.length === 0 && !outcome.blank
              ? 'No hubo mayoría: nadie cobra'
              : undefined,
        delta: outcome.points,
        deltaSuffix: 'pts',
        emoji: state.unanimous && outcome.inHerd ? '🔮' : outcome.inHerd ? '🐑' : '🦄',
      };
    }

    case 'standings': {
      const mine = buildStandings(state, ctx.players).find((s) => s.playerId === playerId);
      return {
        kind: 'idle',
        title: mine ? `Vas #${mine.rank}` : 'Tabla',
        subtitle: state.cow === playerId ? '🐄 y tenés la vaca' : mine?.label,
        emoji: mine?.rank === 1 ? '👑' : '📊',
      };
    }

    case 'done':
      return { kind: 'idle', title: 'Se terminó', subtitle: 'Mirá la tele', emoji: '🏁' };
  }
}

export { POLL_PROMPTS } from './prompts';
export type * from './types';
