import type { Choice, Player, PlayerAction, PlayerId, PlayerView } from '@perty/protocol';
import type { Rng } from '@perty/engine';
import type { Question } from '../trivia/types';
import type {
  MechanicHostView,
  MechanicId,
  MechanicOutcome,
  MechanicState,
  Rune,
} from './types';

/**
 * Los ataques del jefe NO son trivia: son las partes donde hay que hablar.
 * Todas se expresan con las primitivas que ya tiene el celular (`tapper`,
 * `choices`, `idle`), así que sumar un ataque no toca la app del control.
 */
export interface MechanicInfo {
  id: MechanicId;
  name: string;
  description: string;
  emoji: string;
  durationMs: number;
  /** Con cuánta gente tiene sentido. */
  minPlayers: number;
  maxPlayers: number;
}

export const MECHANICS: Record<MechanicId, MechanicInfo> = {
  barrido: {
    id: 'barrido',
    name: 'Barrido',
    description: 'Machaquen el botón entre todos para aguantar el golpe.',
    emoji: '💥',
    durationMs: 7_000,
    minPlayers: 1,
    maxPlayers: 8,
  },
  escudo: {
    id: 'escudo',
    name: 'Escudo Elemental',
    description: 'Cada uno ve solo parte de las runas. Elijan una cada uno, sin repetir.',
    emoji: '🛡️',
    durationMs: 15_000,
    minPlayers: 2,
    maxPlayers: 4,
  },
  marca: {
    id: 'marca',
    name: 'La Marca',
    description: 'El marcado ve la pregunta y no puede contestar. Los demás contestan a ciegas.',
    emoji: '🎯',
    durationMs: 22_000,
    minPlayers: 2,
    maxPlayers: 8,
  },
};

const RUNE_POOL: Omit<Rune, 'id'>[] = [
  { glyph: '🔥', name: 'Fuego', color: '#e8384f' },
  { glyph: '💧', name: 'Agua', color: '#2b7fff' },
  { glyph: '🌿', name: 'Bosque', color: '#22b573' },
  { glyph: '⚡', name: 'Rayo', color: '#ffb020' },
];

/** Elige un ataque posible para esta mesa, evitando repetir el anterior. */
export function pickMechanic(
  attacks: MechanicId[],
  rng: Rng,
  playerCount: number,
  last: MechanicId | null,
): MechanicId {
  const usable = attacks.filter((id) => {
    const info = MECHANICS[id];
    return playerCount >= info.minPlayers && playerCount <= info.maxPlayers;
  });
  const fresh = usable.filter((id) => id !== last);
  const pool = fresh.length ? fresh : usable;
  return pool.length ? rng.pick(pool) : 'barrido';
}

export function setupMechanic(
  id: MechanicId,
  rng: Rng,
  now: number,
  players: Player[],
  question: { question: Question; choices: Choice[]; correctChoiceId: string },
): MechanicState {
  const endsAt = now + MECHANICS[id].durationMs;

  if (id === 'barrido') {
    return {
      kind: 'barrido',
      endsAt,
      target: Math.max(30, players.length * 22),
      taps: {},
    };
  }

  if (id === 'escudo') {
    const runes: Rune[] = rng
      .shuffle(RUNE_POOL)
      .slice(0, Math.max(2, Math.min(4, players.length)))
      .map((rune, index) => ({ ...rune, id: `r${index}` }));
    // Cada mano trae la runa "propia" y la del vecino: existe solución, pero
    // si nadie habla se pisan.
    const hands: Record<PlayerId, string[]> = {};
    players.forEach((player, index) => {
      const own = runes[index % runes.length]!;
      const neighbour = runes[(index + 1) % runes.length]!;
      hands[player.id] = rng.shuffle([own.id, neighbour.id]);
    });
    return { kind: 'escudo', endsAt, runes, hands, picks: {} };
  }

  return {
    kind: 'marca',
    endsAt,
    markedId: rng.pick(players).id,
    question: question.question,
    choices: question.choices,
    correctChoiceId: question.correctChoiceId,
    answers: {},
  };
}

export function mechanicAction(
  state: MechanicState,
  playerId: PlayerId,
  action: PlayerAction,
): MechanicState {
  if (state.kind === 'barrido' && action.t === 'tap') {
    return { ...state, taps: { ...state.taps, [playerId]: (state.taps[playerId] ?? 0) + 1 } };
  }

  if (state.kind === 'escudo' && action.t === 'choose') {
    if (state.picks[playerId]) return state;
    if (!state.hands[playerId]?.includes(action.choiceId)) return state;
    return { ...state, picks: { ...state.picks, [playerId]: action.choiceId } };
  }

  if (state.kind === 'marca' && action.t === 'choose') {
    if (playerId === state.markedId || state.answers[playerId]) return state;
    if (!state.choices.some((choice) => choice.id === action.choiceId)) return state;
    return { ...state, answers: { ...state.answers, [playerId]: action.choiceId } };
  }

  return state;
}

/** ¿Ya hicieron todos lo suyo? Sirve para no esperar el timer al pedo. */
export function mechanicSettled(state: MechanicState, players: Player[]): boolean {
  if (state.kind === 'escudo') return players.every((p) => state.picks[p.id]);
  if (state.kind === 'marca') {
    return players.every((p) => p.id === state.markedId || state.answers[p.id]);
  }
  return false; // el barrido siempre corre hasta que se acaba el tiempo
}

export function resolveMechanic(state: MechanicState, players: Player[]): MechanicOutcome {
  if (state.kind === 'barrido') {
    const total = Object.values(state.taps).reduce((sum, n) => sum + n, 0);
    const survived = total >= state.target;
    return {
      survived,
      headline: survived ? '¡Lo aguantaron!' : 'Los pasó por arriba',
      detail: `${total} de ${state.target} golpes`,
    };
  }

  if (state.kind === 'escudo') {
    const picks = players.map((p) => state.picks[p.id]);
    const missing = picks.filter((pick) => !pick).length;
    const distinct = new Set(picks.filter(Boolean)).size;
    const survived = missing === 0 && distinct === players.length;
    return {
      survived,
      headline: survived ? '¡Escudo completo!' : 'El escudo se rompió',
      detail: missing
        ? `${missing} sin elegir`
        : survived
          ? 'Ninguno repitió runa'
          : 'Eligieron la misma runa',
    };
  }

  const others = players.filter((p) => p.id !== state.markedId);
  const right = others.filter((p) => state.answers[p.id] === state.correctChoiceId).length;
  const needed = Math.max(1, Math.ceil(others.length / 2));
  const survived = right >= needed;
  return {
    survived,
    headline: survived ? '¡Se entendieron!' : 'No se entendió nada',
    detail: `${right} de ${others.length} acertaron (hacían falta ${needed})`,
  };
}

/** Quiénes hicieron la jugada que salvó al grupo, para la medalla del final. */
export function mechanicHeroes(state: MechanicState, players: Player[]): PlayerId[] {
  if (state.kind === 'marca') {
    const heroes = players
      .filter((p) => p.id !== state.markedId && state.answers[p.id] === state.correctChoiceId)
      .map((p) => p.id);
    // El marcado dictó bien: si acertó alguien, también es mérito suyo.
    return heroes.length ? [...heroes, state.markedId] : [];
  }
  if (state.kind === 'escudo') {
    const counts = new Map<string, number>();
    for (const pick of Object.values(state.picks)) counts.set(pick, (counts.get(pick) ?? 0) + 1);
    return players.filter((p) => {
      const pick = state.picks[p.id];
      return !!pick && counts.get(pick) === 1;
    }).map((p) => p.id);
  }
  const taps = Object.entries(state.taps).sort((a, b) => b[1] - a[1]);
  return taps.length ? [taps[0]![0]] : [];
}

export function mechanicPlayerView(
  state: MechanicState,
  playerId: PlayerId,
  info: MechanicInfo,
): PlayerView {
  if (state.kind === 'barrido') {
    return {
      kind: 'tapper',
      label: '¡DALE!',
      count: state.taps[playerId] ?? 0,
      deadline: state.endsAt,
    };
  }

  if (state.kind === 'escudo') {
    const hand = state.hands[playerId] ?? [];
    const choices: Choice[] = hand.flatMap((runeId) => {
      const index = state.runes.findIndex((rune) => rune.id === runeId);
      const rune = state.runes[index];
      // El slot va por índice global de la runa: la misma runa se ve del mismo
      // color en todos los celulares y en la tele, si no no se pueden entender.
      return rune ? [{ id: rune.id, label: `${rune.glyph} ${rune.name}`, slot: index }] : [];
    });
    return {
      kind: 'choices',
      prompt: 'Elegí una runa',
      hint: 'Hablen: si dos eligen la misma, el escudo se rompe',
      choices,
      locked: state.picks[playerId],
      deadline: state.endsAt,
    };
  }

  if (playerId === state.markedId) {
    return {
      kind: 'idle',
      title: state.question.text,
      subtitle: 'Estás marcado: no podés contestar. Dictásela al resto, rápido.',
      emoji: '🎯',
    };
  }

  return {
    kind: 'choices',
    prompt: 'Contestá lo que te digan',
    hint: info.name,
    choices: state.choices,
    locked: state.answers[playerId],
    // A ciegas: la pregunta la tiene el marcado, no la tele.
    blind: true,
    deadline: state.endsAt,
  };
}

export function mechanicHostView(state: MechanicState, players: Player[]): MechanicHostView {
  if (state.kind === 'barrido') {
    const info = MECHANICS.barrido;
    return {
      kind: 'barrido',
      name: info.name,
      instruction: info.description,
      endsAt: state.endsAt,
      progress: Object.values(state.taps).reduce((sum, n) => sum + n, 0),
      target: state.target,
      taps: players.map((p) => ({ playerId: p.id, count: state.taps[p.id] ?? 0 })),
    };
  }

  if (state.kind === 'escudo') {
    const info = MECHANICS.escudo;
    const picked = players.map((p) => state.picks[p.id]).filter(Boolean);
    return {
      kind: 'escudo',
      name: info.name,
      instruction: info.description,
      endsAt: state.endsAt,
      runes: state.runes,
      picks: players.map((p) => ({ playerId: p.id, runeId: state.picks[p.id] ?? null })),
      clash: new Set(picked).size !== picked.length,
    };
  }

  const info = MECHANICS.marca;
  return {
    kind: 'marca',
    name: info.name,
    // La tele no muestra la pregunta: el único que la tiene es el marcado.
    instruction: info.description,
    endsAt: state.endsAt,
    markedId: state.markedId,
    // Sin texto: si la tele mostrara las opciones, dictar no tendría gracia.
    choices: state.choices.map((choice) => ({ ...choice, label: '' })),
    answered: Object.keys(state.answers),
  };
}
