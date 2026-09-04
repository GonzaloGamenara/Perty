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
import { readChoice, readToggles } from '../settings';
import { normalize } from '../liar';
import { QUIP_PROMPTS } from './prompts';
import type {
  QuipConfig,
  QuipHostView,
  QuipHud,
  QuipOption,
  QuipOutcome,
  QuipPrompt,
  QuipReveal,
  QuipState,
  QuipStats,
  QuipTone,
} from './types';

export const QUIPS_INFO: GameInfo = {
  id: 'quips',
  name: 'Superlativos',
  tagline: 'Una consigna absurda, todos escriben, todos votan. Gana el que hace reír.',
  emoji: '✍️',
  minPlayers: 3,
  maxPlayers: 8,
  modes: [
    {
      id: 'classic',
      name: 'Clásico',
      description: 'Cobrás por cada voto que te llevás. Arrasar con todos paga extra.',
      emoji: '🏆',
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
      label: 'Tiempo para escribir',
      hint: 'Menos tiempo es más caótico; más tiempo es más elaborado',
      options: [
        { value: 'rapido', label: '35s · lo primero que salga' },
        { value: 'normal', label: '50s · normal' },
        { value: 'tranqui', label: '75s · con tiempo' },
      ],
      default: 'normal',
    },
    {
      kind: 'toggles',
      id: 'tonos',
      label: 'Tipo de consigna',
      hint: '"Personal" son consignas sobre alguien de la mesa, elegido al azar',
      options: [
        { value: 'clasico', label: 'Clásico', emoji: '🎪' },
        { value: 'nerd', label: 'Nerd', emoji: '🤓' },
        { value: 'personal', label: 'Personal', emoji: '🫵' },
      ],
      default: ['clasico', 'nerd', 'personal'],
      min: 1,
    },
  ],
};

const TONES: QuipTone[] = ['clasico', 'nerd', 'personal'];
const WRITE_MS = { rapido: 35_000, normal: 50_000, tranqui: 75_000 } as const;

const POINTS = {
  /** Por cada persona que te votó. */
  vote: 1000,
  /** Por llevarte todos los votos que podían ir a tu respuesta. */
  sweep: 1500,
} as const;

export function defaultQuipConfig(): QuipConfig {
  return {
    rounds: 8,
    introMs: 2_400,
    writeMs: 50_000,
    voteMs: 30_000,
    revealMs: 12_000,
    standingsMs: 7_500,
    standingsEvery: 4,
    maxAnswerLength: 70,
    tones: null,
  };
}

export const quipsGame: GameModule<QuipState, QuipConfig> = {
  info: QUIPS_INFO,

  defaultConfig: () => defaultQuipConfig(),

  configure(settings) {
    const escritura = readChoice(
      settings,
      'escritura',
      ['rapido', 'normal', 'tranqui'] as const,
      'normal',
    );
    return {
      ...defaultQuipConfig(),
      rounds: readChoice(settings, 'rondas', [5, 8, 12] as const, 8),
      writeMs: WRITE_MS[escritura],
      tones: readToggles(settings, 'tonos', TONES, TONES) as QuipTone[],
    };
  },

  quickConfig: () => ({ ...defaultQuipConfig(), rounds: 4, standingsEvery: 99 }),

  create(ctx, config) {
    const state: QuipState = {
      config,
      round: 0,
      phase: { kind: 'intro', endsAt: ctx.now },
      deck: buildDeck(ctx, config),
      deckIndex: 0,
      prompt: null,
      text: '',
      subject: null,
      answers: {},
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
      extra: stats.votes > 0 ? `🏆 ${stats.votes} ${stats.votes === 1 ? 'voto' : 'votos'}` : undefined,
      rank: mine?.rank,
      totalPlayers: ctx.players.length,
    };
  },
};

function emptyStats(): QuipStats {
  return { points: 0, votes: 0, wins: 0, sweeps: 0, zeroes: 0, blanks: 0, chars: 0, written: 0 };
}

function ensureStats(state: QuipState, playerId: PlayerId): QuipState {
  if (state.stats[playerId]) return state;
  return { ...state, stats: { ...state.stats, [playerId]: emptyStats() } };
}

function buildDeck(ctx: GameCtx, config: QuipConfig): QuipPrompt[] {
  const wanted = config.tones?.length ? new Set(config.tones) : null;
  const pool = QUIP_PROMPTS.filter((p) => !wanted || wanted.has(p.tone));
  return ctx.rng.shuffle(pool.length ? pool : QUIP_PROMPTS);
}

/** Reemplaza `{jugador}` por el nombre del elegido. Sin hueco, no hay elegido. */
export function resolvePrompt(text: string, name: string | null): string {
  return name ? text.replaceAll('{jugador}', name) : text;
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function phaseTimer(delayMs: number): Effect[] {
  return [{ t: 'timer', key: 'phase', delayMs }];
}

function beginRound(state: QuipState, ctx: GameCtx): Reduction<QuipState> {
  const round = state.round + 1;
  const prompt = state.deck[state.deckIndex];
  if (round > state.config.rounds || !prompt) return finish(state, ctx);

  // El elegido de las consignas personales también responde: esa es la gracia.
  const needsSubject = prompt.text.includes('{jugador}');
  const subject = needsSubject && ctx.players.length ? ctx.rng.pick(ctx.players) : null;

  return {
    state: {
      ...state,
      round,
      deckIndex: state.deckIndex + 1,
      prompt,
      subject: subject?.id ?? null,
      text: resolvePrompt(prompt.text, subject?.name ?? null),
      answers: {},
      options: [],
      votes: {},
      outcomes: [],
      phase: { kind: 'intro', endsAt: ctx.now + state.config.introMs },
    },
    effects: [...phaseTimer(state.config.introMs), { t: 'sfx', name: 'round-start' }],
  };
}

function advance(state: QuipState, ctx: GameCtx): Reduction<QuipState> {
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

function enterVote(state: QuipState, ctx: GameCtx): Reduction<QuipState> {
  // Dos personas que escriben exactamente lo mismo comparten la respuesta: es
  // rarísimo con consignas abiertas, pero si pasa cobran las dos.
  const merged = new Map<string, { text: string; authors: PlayerId[] }>();
  const stats = { ...state.stats };

  for (const player of ctx.players) {
    const answer = state.answers[player.id];
    const previous = stats[player.id] ?? emptyStats();
    if (!answer) {
      stats[player.id] = { ...previous, blanks: previous.blanks + 1 };
      continue;
    }
    stats[player.id] = {
      ...previous,
      written: previous.written + 1,
      chars: previous.chars + answer.length,
    };
    const key = normalize(answer);
    const existing = merged.get(key);
    if (existing) existing.authors.push(player.id);
    else merged.set(key, { text: answer, authors: [player.id] });
  }

  const options: QuipOption[] = ctx.rng
    .shuffle([...merged.values()])
    .map((entry, index) => ({ ...entry, id: `o${index}`, slot: index % 4 }));

  const next = { ...state, stats, options };

  // Con una sola respuesta no hay nada que votar: se muestra y se sigue.
  if (options.length < 2) return resolveVote(next, ctx);

  return {
    state: { ...next, phase: { kind: 'vote', endsAt: ctx.now + state.config.voteMs } },
    effects: [...phaseTimer(state.config.voteMs), { t: 'sfx', name: 'question' }],
  };
}

function resolveVote(state: QuipState, ctx: GameCtx): Reduction<QuipState> {
  const voters = Object.keys(state.votes);
  const countFor = (optionId: string) => voters.filter((id) => state.votes[id] === optionId).length;
  const best = Math.max(0, ...state.options.map((o) => countFor(o.id)));

  const stats = { ...state.stats };
  const outcomes: QuipOutcome[] = ctx.players.map((player) => {
    const option = state.options.find((o) => o.authors.includes(player.id));
    if (!option) {
      return { playerId: player.id, voters: [], points: 0, sweep: false, win: false, blank: true };
    }

    const mine = voters.filter((id) => state.votes[id] === option.id);
    // Arrasar es llevarse todos los votos que podían ir a esta respuesta.
    const eligible = voters.filter((id) => !option.authors.includes(id));
    const sweep = eligible.length >= 2 && mine.length === eligible.length;
    const points = mine.length * POINTS.vote + (sweep ? POINTS.sweep : 0);

    return {
      playerId: player.id,
      voters: mine,
      points,
      sweep,
      win: best > 0 && mine.length === best,
      blank: false,
    };
  });

  for (const outcome of outcomes) {
    const previous = stats[outcome.playerId] ?? emptyStats();
    stats[outcome.playerId] = {
      ...previous,
      points: previous.points + outcome.points,
      votes: previous.votes + outcome.voters.length,
      wins: previous.wins + (outcome.win ? 1 : 0),
      sweeps: previous.sweeps + (outcome.sweep ? 1 : 0),
      zeroes: previous.zeroes + (!outcome.blank && outcome.voters.length === 0 ? 1 : 0),
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
      { t: 'sfx', name: outcomes.some((o) => o.sweep) ? 'star' : 'reveal' },
    ],
  };
}

function afterReveal(state: QuipState, ctx: GameCtx): Reduction<QuipState> {
  if (state.round >= state.config.rounds) return finish(state, ctx);
  if (state.round % state.config.standingsEvery === 0) {
    return {
      state: { ...state, phase: { kind: 'standings', endsAt: ctx.now + state.config.standingsMs } },
      effects: phaseTimer(state.config.standingsMs),
    };
  }
  return beginRound(state, ctx);
}

function finish(state: QuipState, ctx: GameCtx): Reduction<QuipState> {
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
  state: QuipState,
  playerId: PlayerId,
  action: { t: string; [k: string]: unknown },
  ctx: GameCtx,
): Reduction<QuipState> {
  const withStats = ensureStats(state, playerId);

  if (action.t === 'submitText' && withStats.phase.kind === 'write') {
    if (withStats.answers[playerId]) return { state: withStats };
    const text = String(action.text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, withStats.config.maxAnswerLength);
    if (!normalize(text)) return { state: withStats };

    const next: QuipState = { ...withStats, answers: { ...withStats.answers, [playerId]: text } };
    return everyoneWrote(next, ctx) ? enterVote(next, ctx) : { state: next };
  }

  if (action.t === 'choose' && withStats.phase.kind === 'vote') {
    if (withStats.votes[playerId]) return { state: withStats };
    const option = withStats.options.find((o) => o.id === String(action.choiceId));
    // Nadie se vota a sí mismo, por más que el celu lo mande.
    if (!option || option.authors.includes(playerId)) return { state: withStats };

    const next: QuipState = { ...withStats, votes: { ...withStats.votes, [playerId]: option.id } };
    return everyoneVoted(next, ctx) ? resolveVote(next, ctx) : { state: next };
  }

  return { state: withStats };
}

function activePlayers(ctx: GameCtx | ViewCtx): PlayerId[] {
  const connected = ctx.players.filter((p) => p.connected);
  return (connected.length ? connected : ctx.players).map((p) => p.id);
}

function everyoneWrote(state: QuipState, ctx: GameCtx): boolean {
  return activePlayers(ctx).every((id) => state.answers[id]);
}

/** El que solo escribió la única respuesta en pie no tiene a quién votar. */
function everyoneVoted(state: QuipState, ctx: GameCtx): boolean {
  return activePlayers(ctx).every((id) => {
    if (state.votes[id]) return true;
    return !state.options.some((o) => !o.authors.includes(id));
  });
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function buildStandings(state: QuipState, players: Player[]): Standing[] {
  const rows = players
    .map((player) => ({ playerId: player.id, stats: state.stats[player.id] ?? emptyStats() }))
    .sort((a, b) => b.stats.points - a.stats.points || b.stats.votes - a.stats.votes);

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

function buildMedals(state: QuipState, players: Player[]): Medal[] {
  const specs: {
    id: string;
    name: string;
    description: string;
    emoji: string;
    value: (s: QuipStats) => number | null;
    detail: (s: QuipStats) => string;
  }[] = [
    {
      id: 'superlativo',
      name: 'Superlativo',
      description: 'El más votado de la noche',
      emoji: '🏆',
      value: (s) => (s.votes > 0 ? s.votes : null),
      detail: (s) => `${s.votes} ${s.votes === 1 ? 'voto' : 'votos'}`,
    },
    {
      id: 'arrasador',
      name: 'Arrasador',
      description: 'El que más veces se llevó todos los votos',
      emoji: '💥',
      value: (s) => (s.sweeps > 0 ? s.sweeps : null),
      detail: (s) => `${s.sweeps} ${s.sweeps === 1 ? 'ronda' : 'rondas'} sin dejar nada`,
    },
    {
      id: 'grillos',
      name: 'Grillos',
      description: 'El que más veces escribió y no votó nadie',
      emoji: '🦗',
      value: (s) => (s.zeroes > 0 ? s.zeroes : null),
      detail: (s) => `${s.zeroes} ${s.zeroes === 1 ? 'silencio' : 'silencios'}`,
    },
    {
      id: 'novelista',
      name: 'Novelista',
      description: 'El que escribió las respuestas más largas',
      emoji: '📜',
      value: (s) => (s.written > 0 ? s.chars / s.written : null),
      detail: (s) => `${Math.round(s.chars / Math.max(1, s.written))} caracteres de promedio`,
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
    let winner: { playerId: PlayerId; value: number; stats: QuipStats } | null = null;
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

function buildHud(state: QuipState, ctx: ViewCtx): QuipHud {
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

function hostView(state: QuipState, ctx: ViewCtx): QuipHostView {
  const hud = buildHud(state, ctx);

  switch (state.phase.kind) {
    case 'intro':
      return {
        kind: 'quips/intro',
        hud,
        tone: state.prompt?.tone ?? 'clasico',
        subject: state.subject,
      };

    case 'write':
      return {
        kind: 'quips/write',
        hud,
        text: state.text,
        subject: state.subject,
        endsAt: state.phase.endsAt,
        ready: Object.keys(state.answers),
      };

    case 'vote':
      return {
        kind: 'quips/vote',
        hud,
        text: state.text,
        options: state.options.map((o) => ({ id: o.id, text: o.text, slot: o.slot })),
        endsAt: state.phase.endsAt,
        voted: Object.keys(state.votes),
      };

    case 'reveal': {
      const entries: QuipReveal[] = state.options
        .map((option) => {
          const outcome = state.outcomes.find((o) => option.authors.includes(o.playerId));
          return {
            id: option.id,
            text: option.text,
            slot: option.slot,
            authors: option.authors,
            voters: outcome?.voters ?? [],
            points: outcome?.points ?? 0,
            sweep: outcome?.sweep ?? false,
            win: outcome?.win ?? false,
          };
        })
        // De menos a más votada: la ganadora queda para el final.
        .sort((a, b) => a.voters.length - b.voters.length);

      return {
        kind: 'quips/reveal',
        hud,
        text: state.text,
        entries,
        blanks: state.outcomes.filter((o) => o.blank).map((o) => o.playerId),
      };
    }

    case 'standings':
      return { kind: 'quips/standings', hud, standings: buildStandings(state, ctx.players) };

    case 'done':
      return { kind: 'quips/done', hud };
  }
}

const TONE_LABEL: Record<QuipTone, string> = {
  clasico: 'Clásico',
  nerd: 'Nerd',
  personal: 'Personal',
};

function playerView(state: QuipState, playerId: PlayerId, ctx: ViewCtx): PlayerView {
  switch (state.phase.kind) {
    case 'intro':
      return {
        kind: 'idle',
        title: `Ronda ${state.round}`,
        subtitle: TONE_LABEL[state.prompt?.tone ?? 'clasico'],
        emoji: '✍️',
      };

    case 'write':
      return {
        kind: 'text',
        prompt: state.text,
        hint:
          state.subject === playerId ? '🫵 Es sobre vos. Respondé igual.' : undefined,
        placeholder: 'Algo que los haga reír',
        maxLength: state.config.maxAnswerLength,
        submitted: state.answers[playerId],
        deadline: state.phase.endsAt,
      };

    case 'vote': {
      const choices: Choice[] = state.options
        .filter((option) => !option.authors.includes(playerId))
        .map((option) => ({ id: option.id, label: option.text, slot: option.slot }));
      if (!choices.length) {
        return { kind: 'idle', title: 'Sos el único', subtitle: 'Votan los demás', emoji: '😬' };
      }
      return {
        kind: 'choices',
        prompt: '¿Cuál te gustó más?',
        hint: state.answers[playerId] ? undefined : 'No escribiste, pero votás igual',
        choices,
        locked: state.votes[playerId],
        deadline: state.phase.endsAt,
      };
    }

    case 'reveal': {
      const outcome = state.outcomes.find((o) => o.playerId === playerId);
      if (!outcome) return { kind: 'idle', title: 'Mirá la tele', emoji: '📺' };
      const votes = outcome.voters.length;
      return {
        kind: 'verdict',
        tone: outcome.points > 0 ? 'good' : 'bad',
        title: outcome.sweep
          ? '¡Los tenés a todos!'
          : outcome.win
            ? '¡Ganaste la ronda!'
            : votes > 0
              ? `${votes} ${votes === 1 ? 'voto' : 'votos'}`
              : outcome.blank
                ? 'No escribiste'
                : 'Nadie te votó',
        subtitle: outcome.blank ? undefined : votes === 0 ? 'Se escuchan los grillos' : undefined,
        delta: outcome.points,
        deltaSuffix: 'pts',
        emoji: outcome.sweep ? '💥' : outcome.win ? '🏆' : votes > 0 ? '✅' : '🦗',
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

export { QUIP_PROMPTS } from './prompts';
export type * from './types';
