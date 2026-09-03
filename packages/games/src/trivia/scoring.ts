import type { Medal, Player, PlayerId, Standing } from '@perty/protocol';
import type { PlayerStats, TriviaState } from './types';

export const SCORING = {
  /** Monedas por acertar, antes de bonus. */
  base: 100,
  /** Bonus máximo por responder al toque (se derrite con el tiempo). */
  speedMax: 120,
  /** Extra para el primero que acierta. */
  firstBlood: 50,
  /** Extra por cada acierto consecutivo previo, hasta streakCap. */
  streakStep: 25,
  streakCap: 4,
  /** Extra por nivel de dificultad por encima de 1. */
  difficultyStep: 40,
  /** Cuánto vale cada estrella en el puntaje final. */
  starValue: 300,
  /** Peaje que paga el retador cuando el dueño defiende su estrella. */
  defendToll: 100,
} as const;

export function emptyStats(): PlayerStats {
  return {
    coins: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    wrong: 0,
    missed: 0,
    firstBloods: 0,
    wagered: 0,
    times: [],
    categoryHits: {},
    starsWon: 0,
  };
}

export function baseCoins(input: {
  ms: number;
  answerMs: number;
  place: number;
  previousStreak: number;
  difficulty: number;
}): number {
  const remaining = Math.max(0, 1 - input.ms / Math.max(1, input.answerMs));
  const speed = Math.round(SCORING.speedMax * remaining);
  const streak = Math.min(input.previousStreak, SCORING.streakCap) * SCORING.streakStep;
  const difficulty = (input.difficulty - 1) * SCORING.difficultyStep;
  const first = input.place === 1 ? SCORING.firstBlood : 0;
  return SCORING.base + speed + streak + difficulty + first;
}

export function totalScore(stats: PlayerStats): number {
  return stats.coins + stats.starsWon * SCORING.starValue;
}

export function buildStandings(state: TriviaState, players: Player[]): Standing[] {
  const rows = players
    .map((player) => {
      const stats = state.stats[player.id] ?? emptyStats();
      return { playerId: player.id, score: totalScore(stats), stats };
    })
    .sort((a, b) => b.score - a.score || b.stats.correct - a.stats.correct);

  let lastScore = Number.NaN;
  let lastRank = 0;
  return rows.map((row, index) => {
    const rank = row.score === lastScore ? lastRank : index + 1;
    lastScore = row.score;
    lastRank = rank;
    const starPart = row.stats.starsWon ? ` · ${row.stats.starsWon}⭐` : '';
    return {
      playerId: row.playerId,
      rank,
      score: row.score,
      label: `${row.score.toLocaleString('es-AR')} monedas${starPart}`,
    };
  });
}

/** "1 error" / "2 errores": los detalles de las medallas se leen en la tele. */
function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}

interface MedalSpec {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** null = no aplica a este jugador. Gana el valor más alto. */
  value(stats: PlayerStats): number | null;
  detail(stats: PlayerStats): string;
}

const MEDALS: MedalSpec[] = [
  {
    id: 'bala',
    name: 'Bala',
    description: 'El dedo más rápido del oeste',
    emoji: '⚡',
    value: (s) => (s.times.length >= 3 ? -average(s.times) : null),
    detail: (s) => `${(average(s.times) / 1000).toFixed(1)}s de promedio`,
  },
  {
    id: 'tortuga',
    name: 'Tortuga',
    description: 'Se lo pensaba mucho',
    emoji: '🐢',
    value: (s) => (s.times.length >= 3 ? average(s.times) : null),
    detail: (s) => `${(average(s.times) / 1000).toFixed(1)}s de promedio`,
  },
  {
    id: 'llamas',
    name: 'En Llamas',
    description: 'La racha más larga de la noche',
    emoji: '🔥',
    value: (s) => (s.bestStreak >= 2 ? s.bestStreak : null),
    detail: (s) => `racha de ${s.bestStreak}`,
  },
  {
    id: 'cerebrito',
    name: 'Cerebrito',
    description: 'La mayor cantidad de aciertos',
    emoji: '🧠',
    value: (s) => (s.correct > 0 ? s.correct : null),
    detail: (s) => plural(s.correct, 'acierto', 'aciertos'),
  },
  {
    id: 'gatillo',
    name: 'Gatillo Fácil',
    description: 'El que más veces contestó primero',
    emoji: '🎯',
    value: (s) => (s.firstBloods > 0 ? s.firstBloods : null),
    detail: (s) => `${plural(s.firstBloods, 'vez', 'veces')} primero`,
  },
  {
    id: 'ludopata',
    name: 'Ludópata',
    description: 'El que más monedas puso en juego',
    emoji: '🎲',
    value: (s) => (s.wagered > 0 ? s.wagered : null),
    detail: (s) => `${plural(s.wagered, 'moneda apostada', 'monedas apostadas')}`,
  },
  {
    id: 'estatua',
    name: 'Estatua',
    description: 'Se le acabó el tiempo más veces',
    emoji: '🗿',
    value: (s) => (s.missed > 0 ? s.missed : null),
    detail: (s) => `${s.missed} sin responder`,
  },
  {
    id: 'mufa',
    name: 'Mufa',
    description: 'El rey de la respuesta equivocada',
    emoji: '💀',
    value: (s) => (s.wrong > 0 ? s.wrong : null),
    detail: (s) => plural(s.wrong, 'error', 'errores'),
  },
  {
    id: 'coleccionista',
    name: 'Coleccionista',
    description: 'El que juntó más estrellas',
    emoji: '🌟',
    value: (s) => (s.starsWon > 0 ? s.starsWon : null),
    detail: (s) => plural(s.starsWon, 'estrella', 'estrellas'),
  },
];

export function buildMedals(state: TriviaState, players: Player[]): Medal[] {
  const out: Medal[] = [];
  for (const spec of MEDALS) {
    let winner: { playerId: PlayerId; value: number; stats: PlayerStats } | null = null;
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
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
