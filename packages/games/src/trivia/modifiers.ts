import type { Player, PlayerId } from '@perty/protocol';
import type { Rng } from '@perty/engine';
import type { Outcome, Spotlight, TriviaState } from './types';

/**
 * Un modificador es una vuelta de rosca sobre una ronda. Se engancha en unos
 * pocos puntos y nada más, así agregar caos cuesta ~20 líneas y no puede romper
 * el flujo de la partida.
 *
 *   roll        · datos propios de la ronda (a quién le toca la bala, etc)
 *   transformText · cómo se lee la pregunta
 *   judge       · qué cuenta como acierto
 *   scoreOne    · cuánto cobra cada uno
 *   settleAll   · retoque global una vez que están todos los resultados
 */
export interface Modifier {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  /** Rareza relativa. Más peso = sale más seguido. */
  weight: number;
  /** Con menos gente que esto, no sale. */
  minPlayers?: number;
  /** El celular oculta el texto de las opciones: hay que mirar la tele. */
  blind?: boolean;
  /** Pide fase de apuesta antes de mostrar la pregunta. */
  wagerOptions?: number[];
  /** Pide fase de sabotaje: cada uno le tacha una opción a otro. */
  sabotage?: boolean;
  /** Multiplica el tiempo de respuesta de la ronda. */
  timeScale?: number;

  /** Se corre una vez al empezar la ronda; lo que devuelve queda en `modifierData`. */
  roll?(rng: Rng, players: Player[]): unknown;
  transformText?(text: string): string;
  judge?(pickedChoiceId: string, correctChoiceId: string): boolean;
  scoreOne?(base: number, outcome: Outcome, state: TriviaState): number;
  settleAll?(outcomes: Outcome[], state: TriviaState): Outcome[];
  /** Aviso extra en el celu de un jugador puntual. */
  playerHint?(playerId: PlayerId, state: TriviaState): string | undefined;
  /** A quién apunta la cámara de la tele durante la pregunta. */
  spotlight?(state: TriviaState): Spotlight | null;
}

export const MODIFIERS: Modifier[] = [
  {
    id: 'double',
    name: 'Doble o Nada',
    description: 'Acertás y cobrás el doble. Errás y pagás 100.',
    emoji: '🎰',
    color: '#f59e0b',
    weight: 10,
    scoreOne: (base, o) => (o.correct ? base * 2 : -100),
  },
  {
    id: 'blind',
    name: 'A Ciegas',
    description: 'Las opciones solo están en la tele. En el celu, puro color.',
    emoji: '🙈',
    color: '#8b5cf6',
    weight: 9,
    blind: true,
    scoreOne: (base, o) => (o.correct ? Math.round(base * 1.5) : 0),
  },
  {
    id: 'wager',
    name: 'La Apuesta',
    description: 'Apostá antes de ver la pregunta. Si acertás cobrás el doble de lo apostado.',
    emoji: '💰',
    color: '#22c55e',
    weight: 8,
    wagerOptions: [0, 100, 250],
    scoreOne: (base, o, state) => {
      const bet = state.wagers[o.playerId] ?? 0;
      return o.correct ? base + bet * 2 : -bet;
    },
  },
  {
    id: 'inverse',
    name: 'Al Revés',
    description: 'Gana el que NO elige la respuesta correcta. Ojo con saber demasiado.',
    emoji: '🙃',
    color: '#ec4899',
    weight: 7,
    judge: (picked, correct) => picked !== correct,
  },
  {
    id: 'blitz',
    name: 'Reflejos',
    description: 'La mitad de tiempo. Pensar es un lujo.',
    emoji: '⚡',
    color: '#38bdf8',
    weight: 8,
    timeScale: 0.5,
    scoreOne: (base, o) => (o.correct ? Math.round(base * 1.4) : 0),
  },
  {
    id: 'sniper',
    name: 'Francotirador',
    description: 'Solo cobra el primero en acertar. Y cobra triple.',
    emoji: '🎯',
    color: '#ef4444',
    weight: 7,
    minPlayers: 2,
    settleAll: (outcomes) =>
      outcomes.map((o) => {
        if (!o.correct) return o;
        return o.place === 1
          ? { ...o, coins: o.coins * 3, note: 'Se llevó todo' }
          : { ...o, coins: 0, note: 'Llegó tarde' };
      }),
  },
  {
    id: 'thief',
    name: 'Atraco',
    description: 'El primero en acertar le roba 150 monedas al que va puntero.',
    emoji: '🦝',
    color: '#a3e635',
    weight: 6,
    minPlayers: 2,
    settleAll: (outcomes, state) => {
      const first = outcomes.find((o) => o.correct && o.place === 1);
      if (!first) return outcomes;
      const leader = leaderOf(state, first.playerId);
      if (!leader) return outcomes;
      return outcomes.map((o) => {
        if (o.playerId === first.playerId) return { ...o, coins: o.coins + 150, note: 'Atraco' };
        if (o.playerId === leader) return { ...o, coins: o.coins - 150, note: 'Le robaron' };
        return o;
      });
    },
  },
  {
    id: 'solo',
    name: 'Dato Fino',
    description: 'Si acertás solo vos, cobrás triple. Si acierta la mayoría, todos cobran la mitad.',
    emoji: '🧐',
    color: '#06b6d4',
    weight: 6,
    minPlayers: 2,
    settleAll: (outcomes, state) => {
      const hits = outcomes.filter((o) => o.correct).length;
      const total = Object.keys(state.stats).length;
      if (hits === 1) {
        return outcomes.map((o) =>
          o.correct ? { ...o, coins: o.coins * 3, note: 'Único que sabía' } : o,
        );
      }
      if (hits > total / 2) {
        return outcomes.map((o) =>
          o.correct ? { ...o, coins: Math.round(o.coins / 2), note: 'Muy fácil' } : o,
        );
      }
      return outcomes;
    },
  },

  // -- los nuevos -----------------------------------------------------------

  {
    id: 'ruleta',
    name: 'Ruleta Rusa',
    description: 'Uno tiene la bala. Si acierta cobra doble; si falla, paga 250.',
    emoji: '💀',
    color: '#dc2626',
    weight: 7,
    minPlayers: 2,
    roll: (rng, players) => ({ victimId: rng.pick(players).id }),
    playerHint: (playerId, state) =>
      victimOf(state) === playerId ? '💀 Tenés la bala' : undefined,
    spotlight: (state) => {
      const victimId = victimOf(state);
      return victimId ? { playerId: victimId, label: 'tiene la bala' } : null;
    },
    settleAll: (outcomes, state) => {
      const victimId = victimOf(state);
      if (!victimId) return outcomes;
      return outcomes.map((o) => {
        if (o.playerId !== victimId) return o;
        return o.correct
          ? { ...o, coins: o.coins * 2, note: 'Sobrevivió' }
          : { ...o, coins: -250, note: 'Se comió la bala' };
      });
    },
  },
  {
    id: 'cadena',
    name: 'Cadena',
    description: 'O aciertan todos y cobran el doble, o no cobra nadie.',
    emoji: '⛓️',
    color: '#facc15',
    weight: 6,
    minPlayers: 2,
    settleAll: (outcomes) => {
      const unbroken = outcomes.length > 0 && outcomes.every((o) => o.correct);
      return outcomes.map((o) =>
        unbroken
          ? { ...o, coins: o.coins * 2, note: 'Cadena completa' }
          : { ...o, coins: 0, note: o.correct ? 'Se cortó la cadena' : 'Cortó la cadena' },
      );
    },
  },
  {
    id: 'sinvocales',
    name: 'Sin Vocales',
    description: 'La pregunta viene sin vocales. Las opciones no. Suerte.',
    emoji: '🔤',
    color: '#f97316',
    weight: 6,
    transformText: stripVowels,
    scoreOne: (base, o) => (o.correct ? Math.round(base * 1.6) : 0),
  },
  {
    id: 'sabotaje',
    name: 'Sabotaje',
    description: 'Antes de la pregunta, cada uno le tacha una opción a otro. Puede tacharle la correcta.',
    emoji: '🔪',
    color: '#84cc16',
    weight: 7,
    minPlayers: 2,
    sabotage: true,
    playerHint: (playerId, state) =>
      state.sabotages[playerId] ? '🔪 Te tacharon una opción' : undefined,
    settleAll: (outcomes, state) => {
      // Al saboteador le pagan si su víctima se comió el tachón.
      const bounty = new Map<PlayerId, number>();
      for (const outcome of outcomes) {
        const sabotage = state.sabotages[outcome.playerId];
        if (sabotage && !outcome.correct) {
          bounty.set(sabotage.by, (bounty.get(sabotage.by) ?? 0) + 150);
        }
      }
      return outcomes.map((o) => {
        const prize = bounty.get(o.playerId);
        return prize ? { ...o, coins: o.coins + prize, note: 'Sabotaje exitoso' } : o;
      });
    },
  },
];

const BY_ID = new Map(MODIFIERS.map((m) => [m.id, m]));

export function getModifier(id: string | null): Modifier | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** Modificadores que tienen sentido con esta cantidad de gente. */
export function usableModifiers(playerCount: number): Modifier[] {
  return MODIFIERS.filter((m) => playerCount >= (m.minPlayers ?? 1));
}

function victimOf(state: TriviaState): PlayerId | null {
  const data = state.modifierData as { victimId?: PlayerId } | null;
  return data?.victimId ?? null;
}

/** El que más monedas tiene, excluyendo a `exclude` (para no robarse a sí mismo). */
function leaderOf(state: TriviaState, exclude: string): string | null {
  let best: string | null = null;
  let bestCoins = -Infinity;
  for (const [playerId, stats] of Object.entries(state.stats)) {
    if (playerId === exclude) continue;
    if (stats.coins > bestCoins) {
      bestCoins = stats.coins;
      best = playerId;
    }
  }
  return best;
}

const VOWELS = /[aeiouáéíóúü]/gi;

/** "¿Quién dirigió Pulp Fiction?" -> "¿Q__n d_r_g__ P_lp F_ct__n?" */
export function stripVowels(text: string): string {
  return text.replace(VOWELS, '_');
}
