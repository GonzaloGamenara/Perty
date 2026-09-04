import type { GameInfo, SettingValues } from '@perty/protocol';
import { defaultNightConfig, type NightConfig } from '@perty/engine';
import { readChoice, readToggles } from './settings';

/**
 * La Noche no es un juego: es una secuencia de juegos. Por eso no implementa
 * `GameModule` — la orquesta la sala. Pero sí se muestra en el lobby como una
 * opción más, con sus perillas, para que elegirla sea igual que elegir un juego.
 */
export const NIGHT_ID = 'night';

const HOW_MANY = [3, 4, 5] as const;

/** El catálogo de juegos define qué se puede encadenar, así que se arma acá. */
export function nightInfo(games: GameInfo[]): GameInfo {
  const playable = games.filter((game) => game.id !== NIGHT_ID);
  return {
    id: NIGHT_ID,
    name: 'La Noche',
    tagline: 'Varios juegos seguidos, un solo campeón. Con eventos que dan vuelta todo.',
    emoji: '🌙',
    minPlayers: 2,
    maxPlayers: 8,
    modes: [
      {
        id: 'campeonato',
        name: 'Campeonato',
        description: 'Cada juego reparte pasos según el puesto. El último vale doble.',
        emoji: '🏁',
        available: true,
      },
    ],
    settings: [
      {
        kind: 'choice',
        id: 'juegos',
        label: 'Cuántos juegos',
        options: [
          { value: 3, label: '3 · un rato' },
          { value: 4, label: '4 · una noche' },
          { value: 5, label: '5 · larga' },
        ],
        default: 4,
      },
      {
        kind: 'toggles',
        id: 'cuales',
        label: 'Cuáles entran',
        hint: 'Se eligen al azar entre estos. Si son menos, alguno se repite.',
        options: playable.map((game) => ({
          value: game.id,
          label: game.name,
          emoji: game.emoji,
        })),
        default: playable.map((game) => game.id),
        min: 2,
      },
      {
        kind: 'choice',
        id: 'eventos',
        label: 'Eventos entre juegos',
        hint: 'Ruletas, peajes y cambios de lugar que castigan al que va ganando',
        options: [
          { value: 'si', label: 'Sí', emoji: '🎡' },
          { value: 'no', label: 'No', emoji: '😌' },
        ],
        default: 'si',
      },
      {
        kind: 'choice',
        id: 'final',
        label: 'El último juego',
        options: [
          { value: 'doble', label: 'Vale doble', emoji: '💥' },
          { value: 'normal', label: 'Vale igual', emoji: '⚖️' },
        ],
        default: 'doble',
      },
    ],
  };
}

/**
 * Arma la secuencia. Se usa `Math.random` a propósito: esto corre una sola vez
 * al empezar, fuera de cualquier reducer, así que no hay nada que reproducir.
 */
export function buildNightConfig(
  settings: SettingValues,
  games: GameInfo[],
  playerCount: number,
): NightConfig {
  const playable = games.filter((game) => game.id !== NIGHT_ID);
  const allIds = playable.map((game) => game.id);

  const wanted = new Set(readToggles(settings, 'cuales', allIds, allIds, 2));
  // Un juego que no entra con esta cantidad de gente no puede caer en la noche.
  const usable = playable
    .filter((game) => wanted.has(game.id) && playerCount >= game.minPlayers)
    .map((game) => game.id);
  const pool = usable.length ? usable : allIds;

  const howMany = readChoice(settings, 'juegos', HOW_MANY, 4);
  const gameIds: string[] = [];
  let bag: string[] = [];
  while (gameIds.length < howMany) {
    if (!bag.length) bag = shuffle(pool);
    gameIds.push(bag.pop()!);
  }

  return {
    ...defaultNightConfig(gameIds),
    events: readChoice(settings, 'eventos', ['si', 'no'] as const, 'si') === 'si',
    doubleLast: readChoice(settings, 'final', ['doble', 'normal'] as const, 'doble') === 'doble',
  };
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
