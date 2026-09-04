import type { GameId, Medal, Player, PlayerId, Standing } from '@perty/protocol';
import type { Rng } from './rng';

/**
 * "La Noche": varios juegos encadenados con un puntaje que se arrastra.
 *
 * La idea es el arco de Mario Party sin su peor parte. En Mario Party el
 * tablero se lleva más de la mitad del tiempo moviendo fichas; acá las fichas
 * avanzan solas según cómo salió cada uno en el juego que acaba de terminar.
 * El tablero es un dibujo, no una mecánica: cero tiempo muerto.
 *
 * Esto no sabe qué juegos existen. Recibe ids y resultados, y decide qué sigue.
 */

/** Pasos por puesto. Todos avanzan algo: nadie se queda clavado mirando. */
const STEPS_BY_RANK = [4, 3, 2, 1] as const;
const CONSOLATION_STEPS = 1;

export interface NightConfig {
  /** Secuencia de juegos, ya resuelta al empezar. */
  gameIds: GameId[];
  /** Si hay eventos entre juego y juego. */
  events: boolean;
  /** El último juego reparte el doble. */
  doubleLast: boolean;
  introMs: number;
  boardMs: number;
  eventMs: number;
  finaleMs: number;
}

export interface NightEventResult {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Lo que le pasó a cada uno, para mostrarlo en la tele. */
  changes: { playerId: PlayerId; steps: number }[];
  doubleNext: boolean;
}

export type NightPhase =
  | { kind: 'intro'; endsAt: number }
  | { kind: 'board'; endsAt: number }
  | { kind: 'event'; endsAt: number; event: NightEventResult }
  | { kind: 'playing' }
  | { kind: 'finale'; endsAt: number };

export interface NightLeg {
  gameId: GameId;
  gameName: string;
  emoji: string;
  winnerId: PlayerId | null;
}

export interface NightState {
  config: NightConfig;
  /** Índice del juego que se está por jugar o se está jugando. */
  index: number;
  phase: NightPhase;
  steps: Record<PlayerId, number>;
  /** Lo que sumó cada uno recién, para animarlo en el tablero. */
  lastGain: Record<PlayerId, number>;
  medals: Medal[];
  history: NightLeg[];
  doubleNext: boolean;
}

export function defaultNightConfig(gameIds: GameId[]): NightConfig {
  return {
    gameIds,
    events: true,
    doubleLast: true,
    introMs: 5_000,
    boardMs: 7_000,
    eventMs: 6_500,
    finaleMs: 20_000,
  };
}

export function createNight(config: NightConfig, players: Player[], now: number): NightState {
  return {
    config,
    index: 0,
    phase: { kind: 'intro', endsAt: now + config.introMs },
    steps: Object.fromEntries(players.map((player) => [player.id, 0])),
    lastGain: {},
    medals: [],
    history: [],
    doubleNext: false,
  };
}

/** Cuántos pasos puede llegar a tener alguien: sirve para dibujar la pista. */
export function maxSteps(config: NightConfig): number {
  const best = STEPS_BY_RANK[0];
  const extra = config.doubleLast ? best : 0;
  return config.gameIds.length * best + extra + (config.events ? 6 : 0);
}

/** Reparte pasos según cómo salió cada uno y anota quién ganó ese juego. */
export function applyResults(
  night: NightState,
  leg: { gameId: GameId; gameName: string; emoji: string },
  standings: Standing[],
  medals: Medal[],
): NightState {
  const isLast = night.index === night.config.gameIds.length - 1;
  const multiplier = (night.doubleNext ? 2 : 1) * (isLast && night.config.doubleLast ? 2 : 1);

  const steps = { ...night.steps };
  const lastGain: Record<PlayerId, number> = {};

  for (const standing of standings) {
    const base = STEPS_BY_RANK[standing.rank - 1] ?? CONSOLATION_STEPS;
    const gain = base * multiplier;
    steps[standing.playerId] = (steps[standing.playerId] ?? 0) + gain;
    lastGain[standing.playerId] = gain;
  }

  return {
    ...night,
    steps,
    lastGain,
    doubleNext: false,
    medals: [...night.medals, ...medals],
    history: [
      ...night.history,
      { ...leg, winnerId: standings.find((s) => s.rank === 1)?.playerId ?? null },
    ],
  };
}

// ---------------------------------------------------------------------------
// Eventos entre juegos
// ---------------------------------------------------------------------------

interface EventSpec {
  id: string;
  name: string;
  description: string;
  emoji: string;
  weight: number;
  minPlayers: number;
  run(order: PlayerId[], rng: Rng): { changes: Record<PlayerId, number>; doubleNext?: boolean };
}

/** `order` viene del que va primero al que va último. */
const EVENTS: EventSpec[] = [
  {
    id: 'ruleta',
    name: 'Ruleta',
    description: 'La rueda elige a uno y lo empuja tres pasos.',
    emoji: '🎡',
    weight: 10,
    minPlayers: 2,
    run: (order, rng) => ({ changes: { [rng.pick(order)]: 3 } }),
  },
  {
    id: 'viento',
    name: 'Viento de Cola',
    description: 'El que va último agarra impulso.',
    emoji: '🪂',
    weight: 9,
    minPlayers: 2,
    run: (order) => ({ changes: { [order[order.length - 1]!]: 4 } }),
  },
  {
    id: 'peaje',
    name: 'Peaje',
    description: 'El que va primero paga por ir adelante.',
    emoji: '🚧',
    weight: 8,
    minPlayers: 2,
    run: (order) => ({ changes: { [order[0]!]: -3 } }),
  },
  {
    id: 'cambio',
    name: 'Cambio de Lugar',
    description: 'El primero y el último se dan vuelta las posiciones.',
    emoji: '🔄',
    weight: 6,
    minPlayers: 3,
    run: () => ({ changes: {} }), // el intercambio se resuelve aparte
  },
  {
    id: 'doble',
    name: 'Todo o Nada',
    description: 'El próximo juego reparte el doble de pasos.',
    emoji: '💥',
    weight: 7,
    minPlayers: 2,
    run: () => ({ changes: {}, doubleNext: true }),
  },
  {
    id: 'atajo',
    name: 'Atajo',
    description: 'Los dos del medio encuentran un atajo.',
    emoji: '🌿',
    weight: 6,
    minPlayers: 4,
    run: (order) => ({
      changes: Object.fromEntries(order.slice(1, -1).map((id) => [id, 2])),
    }),
  },
];

export function rollEvent(night: NightState, players: Player[], rng: Rng): NightState {
  const order = [...players]
    .map((player) => player.id)
    .sort((a, b) => (night.steps[b] ?? 0) - (night.steps[a] ?? 0));

  const usable = EVENTS.filter((event) => order.length >= event.minPlayers);
  const spec = rng.weighted(usable, (event) => event.weight);
  if (!spec) return night;

  const steps = { ...night.steps };
  const changes: { playerId: PlayerId; steps: number }[] = [];

  if (spec.id === 'cambio') {
    // Intercambio literal de posiciones: el que iba último pasa a ir primero.
    const first = order[0]!;
    const last = order[order.length - 1]!;
    const before = { first: steps[first] ?? 0, last: steps[last] ?? 0 };
    steps[first] = before.last;
    steps[last] = before.first;
    changes.push(
      { playerId: first, steps: before.last - before.first },
      { playerId: last, steps: before.first - before.last },
    );
  } else {
    const result = spec.run(order, rng);
    for (const [playerId, delta] of Object.entries(result.changes)) {
      steps[playerId] = Math.max(0, (steps[playerId] ?? 0) + delta);
      changes.push({ playerId, steps: delta });
    }
  }

  const doubleNext = spec.id === 'doble';

  return {
    ...night,
    steps,
    doubleNext,
    phase: {
      kind: 'event',
      endsAt: 0, // lo completa la sala, que es la que tiene el reloj
      event: {
        id: spec.id,
        name: spec.name,
        description: spec.description,
        emoji: spec.emoji,
        changes,
        doubleNext,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------------------

export function nightStandings(night: NightState, players: Player[]): Standing[] {
  const rows = players
    .map((player) => ({ playerId: player.id, steps: night.steps[player.id] ?? 0 }))
    .sort((a, b) => b.steps - a.steps);

  let lastSteps = Number.NaN;
  let lastRank = 0;
  return rows.map((row, index) => {
    const rank = row.steps === lastSteps ? lastRank : index + 1;
    lastSteps = row.steps;
    lastRank = rank;
    return {
      playerId: row.playerId,
      rank,
      score: row.steps,
      label: `${row.steps} ${row.steps === 1 ? 'paso' : 'pasos'}`,
    };
  });
}

/** Las medallas de toda la noche, sin repetir tipo y repartiendo entre gente. */
export function nightMedals(night: NightState): Medal[] {
  const seen = new Set<string>();
  const out: Medal[] = [];
  for (const medal of night.medals) {
    const key = `${medal.id}:${medal.playerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(medal);
  }
  // Las más recientes primero: son las que la mesa tiene fresca.
  return out.reverse().slice(0, 8);
}


// ---------------------------------------------------------------------------
// Vistas de la tele
// ---------------------------------------------------------------------------

export interface NightBoardEntry {
  playerId: PlayerId;
  steps: number;
  /** Lo que sumó en el último juego, o null si no viene de uno. */
  gain: number | null;
  /** Posición en la pista, de 0 a 1. */
  progress: number;
}

export interface NightGameCard {
  gameId: GameId;
  name: string;
  emoji: string;
}

export type NightHostView =
  | { kind: 'night/intro'; games: NightGameCard[]; events: boolean; doubleLast: boolean }
  | {
      kind: 'night/board';
      leg: number;
      total: number;
      next: NightGameCard | null;
      entries: NightBoardEntry[];
      history: NightLeg[];
      doubleNext: boolean;
      /** Verdadero cuando el próximo es el último y vale doble. */
      finalRound: boolean;
    }
  | { kind: 'night/event'; event: NightEventResult; entries: NightBoardEntry[] }
  | {
      kind: 'night/finale';
      standings: Standing[];
      history: NightLeg[];
      entries: NightBoardEntry[];
    };

export function boardEntries(night: NightState, players: Player[]): NightBoardEntry[] {
  const ceiling = Math.max(1, maxSteps(night.config));
  return players.map((player) => {
    const steps = night.steps[player.id] ?? 0;
    return {
      playerId: player.id,
      steps,
      gain: night.lastGain[player.id] ?? null,
      progress: Math.min(1, steps / ceiling),
    };
  });
}
