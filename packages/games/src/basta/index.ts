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
import { BASTA_COLUMNS, BASTA_LETTERS } from './categories';
import type {
  BastaCategory,
  BastaCell,
  BastaConfig,
  BastaHostView,
  BastaHud,
  BastaRoundResult,
  BastaState,
  BastaStats,
} from './types';

export const BASTA_INFO: GameInfo = {
  id: 'basta',
  name: 'Tutti Frutti',
  tagline: 'Una letra, cinco columnas y el reloj. El primero que llena todo grita basta.',
  emoji: '🅰️',
  minPlayers: 2,
  maxPlayers: 8,
  modes: [
    {
      id: 'classic',
      name: 'Clásico',
      description: 'Lo que escribió otro vale la mitad. Cerrar la ronda con todo lleno paga extra.',
      emoji: '✏️',
      available: true,
    },
  ],
  settings: [
    {
      kind: 'choice',
      id: 'rondas',
      label: 'Rondas',
      options: [
        { value: 3, label: '3 · corta' },
        { value: 5, label: '5 · normal' },
        { value: 8, label: '8 · larga' },
      ],
      default: 5,
    },
    {
      kind: 'choice',
      id: 'columnas',
      label: 'Columnas',
      hint: 'Cuántas cosas hay que escribir en cada ronda',
      options: [
        { value: 4, label: '4 · liviano' },
        { value: 5, label: '5 · normal' },
        { value: 6, label: '6 · sudor' },
      ],
      default: 5,
    },
    {
      kind: 'choice',
      id: 'tiempo',
      label: 'Tiempo por ronda',
      options: [
        { value: 'rapido', label: '60s · corriendo' },
        { value: 'normal', label: '90s · normal' },
        { value: 'tranqui', label: '120s · tranqui' },
      ],
      default: 'normal',
    },
  ],
};

const WRITE_MS = { rapido: 60_000, normal: 90_000, tranqui: 120_000 } as const;

export function defaultBastaConfig(): BastaConfig {
  return {
    rounds: 5,
    columns: 5,
    introMs: 3_200,
    writeMs: 90_000,
    revealMs: 14_000,
    standingsMs: 7_500,
    standingsEvery: 3,
    maxAnswerLength: 24,
    unique: 100,
    shared: 50,
    stopBonus: 150,
  };
}

export const bastaGame: GameModule<BastaState, BastaConfig> = {
  info: BASTA_INFO,

  defaultConfig: () => defaultBastaConfig(),

  configure(settings) {
    const tiempo = readChoice(settings, 'tiempo', ['rapido', 'normal', 'tranqui'] as const, 'normal');
    return {
      ...defaultBastaConfig(),
      rounds: readChoice(settings, 'rondas', [3, 5, 8] as const, 5),
      columns: readChoice(settings, 'columnas', [4, 5, 6] as const, 5),
      writeMs: WRITE_MS[tiempo],
    };
  },

  quickConfig: () => ({ ...defaultBastaConfig(), rounds: 3, columns: 4, standingsEvery: 99 }),

  create(ctx, config) {
    const state: BastaState = {
      config,
      round: 0,
      phase: { kind: 'intro', endsAt: ctx.now },
      letter: '',
      usedLetters: [],
      columns: [],
      sheets: {},
      stopper: null,
      cells: {},
      results: [],
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
      extra: state.letter ? `Letra ${state.letter}` : undefined,
      rank: mine?.rank,
      totalPlayers: ctx.players.length,
    };
  },
};

function emptyStats(): BastaStats {
  return { points: 0, uniques: 0, shareds: 0, invalids: 0, stops: 0, perfects: 0 };
}

function ensureStats(state: BastaState, playerId: PlayerId): BastaState {
  if (state.stats[playerId]) return state;
  return { ...state, stats: { ...state.stats, [playerId]: emptyStats() } };
}

/** Empieza con la letra de la ronda, ignorando mayúsculas y acentos. */
export function startsWithLetter(text: string, letter: string): boolean {
  const clean = normalize(text);
  return clean.length > 0 && clean.startsWith(normalize(letter));
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function phaseTimer(delayMs: number): Effect[] {
  return [{ t: 'timer', key: 'phase', delayMs }];
}

function beginRound(state: BastaState, ctx: GameCtx): Reduction<BastaState> {
  const round = state.round + 1;
  if (round > state.config.rounds) return finish(state, ctx);

  // Ninguna letra sale dos veces mientras queden sin usar.
  const pool = BASTA_LETTERS.filter((l) => !state.usedLetters.includes(l));
  const letter = ctx.rng.pick(pool.length ? pool : BASTA_LETTERS);
  const columns = ctx.rng.shuffle(BASTA_COLUMNS).slice(0, state.config.columns);

  return {
    state: {
      ...state,
      round,
      letter,
      usedLetters: [...state.usedLetters, letter],
      columns,
      sheets: {},
      stopper: null,
      cells: {},
      results: [],
      phase: { kind: 'intro', endsAt: ctx.now + state.config.introMs },
    },
    effects: [...phaseTimer(state.config.introMs), { t: 'sfx', name: 'round-start' }],
  };
}

function advance(state: BastaState, ctx: GameCtx): Reduction<BastaState> {
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

function resolveRound(state: BastaState, ctx: GameCtx): Reduction<BastaState> {
  const cells: Record<string, BastaCell[]> = {};

  for (const column of state.columns) {
    const raw = ctx.players.map((player) => ({
      playerId: player.id,
      text: (state.sheets[player.id]?.[column.id] ?? '').trim(),
    }));

    // Cuántos escribieron cada cosa: lo que repitió otro vale la mitad.
    const counts = new Map<string, number>();
    for (const entry of raw) {
      if (!startsWithLetter(entry.text, state.letter)) continue;
      const key = normalize(entry.text);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    cells[column.id] = raw.map((entry) => {
      const invalid = !startsWithLetter(entry.text, state.letter);
      const shared = !invalid && (counts.get(normalize(entry.text)) ?? 0) > 1;
      return {
        playerId: entry.playerId,
        text: entry.text,
        invalid,
        shared,
        points: invalid ? 0 : shared ? state.config.shared : state.config.unique,
      };
    });
  }

  const stats = { ...state.stats };
  const results: BastaRoundResult[] = ctx.players.map((player) => {
    const mine = state.columns.map((column) =>
      cells[column.id]!.find((cell) => cell.playerId === player.id)!,
    );
    const valid = mine.filter((cell) => !cell.invalid).length;
    const perfect = valid === state.columns.length && state.columns.length > 0;
    const stopped = state.stopper === player.id;
    // El bonus por cerrar pide la hoja entera bien: si no, cerrar temprano sería
    // una forma barata de cortarle la ronda al resto.
    const bonus = stopped && perfect ? state.config.stopBonus : 0;
    const points = mine.reduce((total, cell) => total + cell.points, 0) + bonus;

    const previous = stats[player.id] ?? emptyStats();
    stats[player.id] = {
      points: previous.points + points,
      uniques: previous.uniques + mine.filter((c) => !c.invalid && !c.shared).length,
      shareds: previous.shareds + mine.filter((c) => c.shared).length,
      invalids: previous.invalids + mine.filter((c) => c.invalid).length,
      stops: previous.stops + (stopped ? 1 : 0),
      perfects: previous.perfects + (perfect ? 1 : 0),
    };

    return { playerId: player.id, points, valid, stopped };
  });

  return {
    state: {
      ...state,
      stats,
      cells,
      results,
      phase: { kind: 'reveal', endsAt: ctx.now + state.config.revealMs },
    },
    effects: [...phaseTimer(state.config.revealMs), { t: 'sfx', name: 'reveal' }],
  };
}

function afterReveal(state: BastaState, ctx: GameCtx): Reduction<BastaState> {
  if (state.round >= state.config.rounds) return finish(state, ctx);
  if (state.round % state.config.standingsEvery === 0) {
    return {
      state: { ...state, phase: { kind: 'standings', endsAt: ctx.now + state.config.standingsMs } },
      effects: phaseTimer(state.config.standingsMs),
    };
  }
  return beginRound(state, ctx);
}

function finish(state: BastaState, ctx: GameCtx): Reduction<BastaState> {
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
  state: BastaState,
  playerId: PlayerId,
  action: { t: string; [k: string]: unknown },
  ctx: GameCtx,
): Reduction<BastaState> {
  const withStats = ensureStats(state, playerId);
  if (action.t !== 'submitForm' || withStats.phase.kind !== 'write') return { state: withStats };

  const incoming = (action.values ?? {}) as Record<string, unknown>;
  const sheet: Record<string, string> = {};
  for (const column of withStats.columns) {
    const value = incoming[column.id];
    if (typeof value !== 'string') continue;
    sheet[column.id] = value.replace(/\s+/g, ' ').trim().slice(0, withStats.config.maxAnswerLength);
  }

  const next: BastaState = { ...withStats, sheets: { ...withStats.sheets, [playerId]: sheet } };

  // "Basta" solo cuenta con la hoja llena: si no, cortar la ronda sería gratis.
  if (action.stop === true && isComplete(next, playerId)) {
    return resolveRound({ ...next, stopper: playerId }, ctx);
  }

  // Si ya no le queda nada por escribir a nadie, no tiene sentido esperar al
  // reloj. Cierra sin `stopper`: nadie cortó nada, simplemente terminaron.
  if (everyoneComplete(next, ctx)) return resolveRound(next, ctx);

  return { state: next };
}

function isComplete(state: BastaState, playerId: PlayerId): boolean {
  const sheet = state.sheets[playerId] ?? {};
  return state.columns.every((column) => (sheet[column.id] ?? '').length > 0);
}

function everyoneComplete(state: BastaState, ctx: GameCtx): boolean {
  const connected = ctx.players.filter((p) => p.connected);
  return (connected.length ? connected : ctx.players).every((p) => isComplete(state, p.id));
}

function filledCount(state: BastaState, playerId: PlayerId): number {
  const sheet = state.sheets[playerId] ?? {};
  return state.columns.filter((column) => (sheet[column.id] ?? '').length > 0).length;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function buildStandings(state: BastaState, players: Player[]): Standing[] {
  const rows = players
    .map((player) => ({ playerId: player.id, stats: state.stats[player.id] ?? emptyStats() }))
    .sort((a, b) => b.stats.points - a.stats.points || b.stats.uniques - a.stats.uniques);

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

function buildMedals(state: BastaState, players: Player[]): Medal[] {
  const specs: {
    id: string;
    name: string;
    description: string;
    emoji: string;
    value: (s: BastaStats) => number | null;
    detail: (s: BastaStats) => string;
  }[] = [
    {
      id: 'campana',
      name: 'El de la Campana',
      description: 'El que más veces cortó la ronda',
      emoji: '🔔',
      value: (s) => (s.stops > 0 ? s.stops : null),
      detail: (s) => `${s.stops} ${s.stops === 1 ? 'basta' : 'bastas'}`,
    },
    {
      id: 'original',
      name: 'Original',
      description: 'El que más veces escribió algo que no puso nadie más',
      emoji: '💎',
      value: (s) => (s.uniques > 0 ? s.uniques : null),
      detail: (s) => `${s.uniques} respuestas únicas`,
    },
    {
      id: 'obvio',
      name: 'Lo Obvio',
      description: 'El que más veces escribió lo mismo que otro',
      emoji: '🐑',
      value: (s) => (s.shareds > 0 ? s.shareds : null),
      detail: (s) => `${s.shareds} repetidas`,
    },
    {
      id: 'impecable',
      name: 'Impecable',
      description: 'El que más hojas llenó completas y bien',
      emoji: '✨',
      value: (s) => (s.perfects > 0 ? s.perfects : null),
      detail: (s) => `${s.perfects} ${s.perfects === 1 ? 'hoja' : 'hojas'} perfectas`,
    },
    {
      id: 'blanco',
      name: 'Hoja en Blanco',
      description: 'El que más casilleros dejó vacíos o mal',
      emoji: '🕳️',
      value: (s) => (s.invalids > 0 ? s.invalids : null),
      detail: (s) => `${s.invalids} sin puntos`,
    },
  ];

  const out: Medal[] = [];
  for (const spec of specs) {
    let winner: { playerId: PlayerId; value: number; stats: BastaStats } | null = null;
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

function buildHud(state: BastaState, ctx: ViewCtx): BastaHud {
  const showDelta = state.phase.kind === 'reveal';
  return {
    round: state.round,
    totalRounds: state.config.rounds,
    letter: state.letter,
    entries: ctx.players.map((player) => {
      const result = state.results.find((r) => r.playerId === player.id);
      return {
        playerId: player.id,
        points: state.stats[player.id]?.points ?? 0,
        delta: showDelta && result ? result.points : null,
      };
    }),
  };
}

function hostView(state: BastaState, ctx: ViewCtx): BastaHostView {
  const hud = buildHud(state, ctx);

  switch (state.phase.kind) {
    case 'intro':
      return { kind: 'basta/intro', hud, columns: state.columns };

    case 'write':
      return {
        kind: 'basta/write',
        hud,
        columns: state.columns,
        endsAt: state.phase.endsAt,
        totalMs: state.config.writeMs,
        // Solo cuántas van: lo que escribieron no se muestra hasta el final.
        progress: ctx.players.map((player) => ({
          playerId: player.id,
          filled: filledCount(state, player.id),
        })),
      };

    case 'reveal':
      return {
        kind: 'basta/reveal',
        hud,
        columns: state.columns,
        cells: state.cells,
        results: state.results,
        stopper: state.stopper,
        stopBonus: state.config.stopBonus,
      };

    case 'standings':
      return { kind: 'basta/standings', hud, standings: buildStandings(state, ctx.players) };

    case 'done':
      return { kind: 'basta/done', hud };
  }
}

function playerView(state: BastaState, playerId: PlayerId, ctx: ViewCtx): PlayerView {
  switch (state.phase.kind) {
    case 'intro':
      return {
        kind: 'idle',
        title: `Letra ${state.letter}`,
        subtitle: state.columns.map((c) => c.label).join(' · '),
        emoji: '✏️',
      };

    case 'write':
      return {
        kind: 'form',
        prompt: `Todo con ${state.letter}`,
        badge: state.letter,
        fields: state.columns.map((column) => ({
          id: column.id,
          label: column.label,
          emoji: column.emoji,
          placeholder: `${state.letter}…`,
        })),
        maxLength: state.config.maxAnswerLength,
        values: state.sheets[playerId],
        stop: {
          label: '¡BASTA!',
          enabled: true,
          hint: 'Llená todo para poder cortar la ronda',
        },
        deadline: state.phase.endsAt,
      };

    case 'reveal': {
      const result = state.results.find((r) => r.playerId === playerId);
      if (!result) return { kind: 'idle', title: 'Mirá la tele', emoji: '📺' };
      const perfect = result.valid === state.columns.length;
      return {
        kind: 'verdict',
        tone: result.points > 0 ? 'good' : 'bad',
        title: result.stopped
          ? '¡Cortaste la ronda!'
          : perfect
            ? 'Hoja completa'
            : `${result.valid} de ${state.columns.length}`,
        subtitle: result.stopped && !perfect ? 'Pero algo no empezaba con la letra' : undefined,
        delta: result.points,
        deltaSuffix: 'pts',
        emoji: result.stopped ? '🔔' : perfect ? '✨' : '✏️',
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

export { BASTA_COLUMNS, BASTA_LETTERS } from './categories';
export type * from './types';
