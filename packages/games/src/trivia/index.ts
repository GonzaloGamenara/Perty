import {
  type Choice,
  type GameInfo,
  type PlayerId,
  type PlayerView,
  type WagerOption,
} from '@perty/protocol';
import type { Effect, GameCtx, GameModule, Reduction, ViewCtx } from '@perty/engine';
import { CATEGORIES, getCategory } from './categories';
import { readChoice, readToggles } from '../settings';
import { getModifier, usableModifiers, type Modifier } from './modifiers';
import { QUESTIONS } from './questions';
import { baseCoins, buildMedals, buildStandings, emptyStats, SCORING } from './scoring';
import type {
  AnswerRecord,
  Hud,
  ModifierBadge,
  Outcome,
  PlayerStats,
  Question,
  StarEvent,
  TriviaConfig,
  TriviaHostView,
  TriviaState,
} from './types';

export const TRIVIA_INFO: GameInfo = {
  id: 'trivia',
  name: 'Trivia Caótica',
  tagline: 'Preguntados, pero con las reglas rotas',
  emoji: '🧠',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    {
      id: 'ffa',
      name: 'Todos contra Todos',
      description: 'Monedas, estrellas por categoría y modificadores que rompen las reglas.',
      emoji: '⚔️',
      available: true,
    },
  ],
  settings: [
    {
      kind: 'choice',
      id: 'rondas',
      label: 'Rondas',
      options: [
        { value: 8, label: '8 · corta' },
        { value: 12, label: '12 · normal' },
        { value: 16, label: '16 · larga' },
        { value: 20, label: '20 · maratón' },
      ],
      default: 12,
    },
    {
      kind: 'choice',
      id: 'tiempo',
      label: 'Tiempo por pregunta',
      options: [
        { value: 'rapido', label: '12s · al toque' },
        { value: 'normal', label: '18s · normal' },
        { value: 'tranqui', label: '25s · tranqui' },
      ],
      default: 'normal',
    },
    {
      kind: 'choice',
      id: 'caos',
      label: 'Nivel de caos',
      hint: 'Cada cuánto sale un modificador que rompe las reglas',
      options: [
        { value: 'nada', label: 'Nada', emoji: '😇' },
        { value: 'poco', label: 'Poco', emoji: '🙂' },
        { value: 'normal', label: 'Normal', emoji: '😈' },
        { value: 'mucho', label: 'Mucho', emoji: '🔥' },
      ],
      default: 'normal',
    },
    {
      kind: 'toggles',
      id: 'categorias',
      label: 'Categorías',
      hint: 'Cada una trae su estrella. Mínimo dos.',
      options: CATEGORIES.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })),
      default: CATEGORIES.map((c) => c.id),
      min: 2,
    },
  ],
};

const ANSWER_MS = { rapido: 12_000, normal: 18_000, tranqui: 25_000 } as const;
const CHAOS_CHANCE = { nada: 0, poco: 0.2, normal: 0.38, mucho: 0.6 } as const;

export function defaultTriviaConfig(): TriviaConfig {
  return {
    rounds: 12,
    answerMs: 18_000,
    // Los momentos de resultado necesitan aire: es donde se festeja y se putea.
    revealMs: 7_500,
    introMs: 3_200,
    chaosMs: 4_200,
    wagerMs: 8_000,
    sabotageMs: 10_000,
    starMs: 5_600,
    standingsMs: 7_500,
    standingsEvery: 4,
    chaosChance: 0.38,
    starThreshold: 2,
    chaosWarmup: 2,
    forcedModifier: null,
    categories: null,
  };
}

// ---------------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------------

export const triviaGame: GameModule<TriviaState, TriviaConfig> = {
  info: TRIVIA_INFO,

  defaultConfig: () => defaultTriviaConfig(),

  configure(settings) {
    const tiempo = readChoice(settings, 'tiempo', ['rapido', 'normal', 'tranqui'] as const, 'normal');
    const caos = readChoice(settings, 'caos', ['nada', 'poco', 'normal', 'mucho'] as const, 'normal');
    const categorias = readToggles(
      settings,
      'categorias',
      CATEGORIES.map((c) => c.id),
      CATEGORIES.map((c) => c.id),
      2,
    );
    return {
      ...defaultTriviaConfig(),
      rounds: readChoice(settings, 'rondas', [8, 12, 16, 20] as const, 12),
      answerMs: ANSWER_MS[tiempo],
      chaosChance: CHAOS_CHANCE[caos],
      categories: categorias,
    };
  },

  quickConfig: () => ({ ...defaultTriviaConfig(), rounds: 6, standingsEvery: 99, chaosWarmup: 1 }),

  create(ctx, config) {
    const state: TriviaState = {
      config,
      round: 0,
      phase: { kind: 'intro', endsAt: ctx.now },
      deck: buildDeck(ctx, config),
      deckIndex: 0,
      question: null,
      choices: [],
      correctChoiceId: '',
      answers: {},
      wagers: {},
      sabotages: {},
      modifierId: null,
      modifierData: null,
      stats: Object.fromEntries(ctx.players.map((p) => [p.id, emptyStats()])),
      stars: Object.fromEntries(activeCategories(config).map((c) => [c.id, null])),
      outcomes: [],
      starEvent: null,
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
        // Le guardamos las monedas por si vuelve: el celular se bloquea seguido.
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
    if (stats.starsWon > 0) extra.push(`${stats.starsWon}⭐`);
    if (stats.streak >= 2) extra.push(`racha ${stats.streak} 🔥`);
    return {
      score: stats.coins,
      scoreLabel: `${stats.coins.toLocaleString('es-AR')} 🪙`,
      extra: extra.join('  ·  ') || undefined,
      rank: mine?.rank,
      totalPlayers: ctx.players.length,
    };
  },
};

// ---------------------------------------------------------------------------
// Mazo
// ---------------------------------------------------------------------------

function activeCategories(config: TriviaConfig) {
  if (!config.categories?.length) return CATEGORIES;
  const wanted = new Set(config.categories);
  return CATEGORIES.filter((c) => wanted.has(c.id));
}

/**
 * Arma el mazo alternando categorías: así ninguna ronda repite tema dos veces
 * seguidas y todas las estrellas tienen chances parecidas de aparecer.
 */
function buildDeck(ctx: GameCtx, config: TriviaConfig): Question[] {
  const pools = new Map<string, Question[]>();
  for (const category of activeCategories(config)) {
    const pool = ctx.rng.shuffle(QUESTIONS.filter((q) => q.category === category.id));
    if (pool.length) pools.set(category.id, pool);
  }

  const deck: Question[] = [];
  while (pools.size > 0) {
    for (const categoryId of ctx.rng.shuffle([...pools.keys()])) {
      const pool = pools.get(categoryId);
      if (!pool) continue;
      const question = pool.pop();
      if (question) deck.push(question);
      if (pool.length === 0) pools.delete(categoryId);
    }
  }
  return deck;
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function phaseTimer(delayMs: number): Effect[] {
  return [{ t: 'timer', key: 'phase', delayMs }];
}

function ensureStats(state: TriviaState, playerId: PlayerId): TriviaState {
  if (state.stats[playerId]) return state;
  return { ...state, stats: { ...state.stats, [playerId]: emptyStats() } };
}

function beginRound(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  const round = state.round + 1;
  const question = state.deck[state.deckIndex];
  if (round > state.config.rounds || !question) return finish(state, ctx);

  // La correcta está siempre primera en el banco; acá se baraja.
  const shuffled = ctx.rng.shuffle(
    question.options.map((label, index) => ({ label, correct: index === 0 })),
  );
  const choices: Choice[] = shuffled.map((option, slot) => ({
    id: `c${slot}`,
    label: option.label,
    slot,
  }));
  const correctSlot = shuffled.findIndex((option) => option.correct);

  const modifierId = rollModifier(state, ctx, round);
  const modifier = getModifier(modifierId);
  const next: TriviaState = {
    ...state,
    round,
    deckIndex: state.deckIndex + 1,
    question,
    choices,
    correctChoiceId: `c${correctSlot}`,
    answers: {},
    wagers: {},
    sabotages: {},
    outcomes: [],
    starEvent: null,
    modifierId,
    modifierData: modifier?.roll?.(ctx.rng, ctx.players) ?? null,
    phase: { kind: 'intro', endsAt: ctx.now + state.config.introMs },
  };
  return {
    state: next,
    effects: [...phaseTimer(state.config.introMs), { t: 'sfx', name: 'round-start' }],
  };
}

function rollModifier(state: TriviaState, ctx: GameCtx, round: number): string | null {
  if (state.config.forcedModifier) return state.config.forcedModifier;
  if (round <= state.config.chaosWarmup) return null;
  if (!ctx.rng.chance(state.config.chaosChance)) return null;
  // Con poca gente, varios modificadores no tienen gracia: se filtran solos.
  const pool = usableModifiers(ctx.players.length);
  return ctx.rng.weighted(pool, (m) => m.weight)?.id ?? null;
}

function advance(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  switch (state.phase.kind) {
    case 'intro':
      return state.modifierId ? enterChaos(state, ctx) : enterWagerOrQuestion(state, ctx);
    case 'chaos':
      return enterWagerOrQuestion(state, ctx);
    case 'wager':
    case 'sabotage':
      return enterQuestion(state, ctx);
    case 'question':
      return resolveQuestion(state, ctx);
    case 'reveal':
      return state.starEvent ? enterStar(state, ctx) : afterReveal(state, ctx);
    case 'star':
      return afterReveal(state, ctx);
    case 'standings':
      return beginRound(state, ctx);
    case 'done':
      return { state };
  }
}

function enterChaos(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  return {
    state: { ...state, phase: { kind: 'chaos', endsAt: ctx.now + state.config.chaosMs } },
    effects: [...phaseTimer(state.config.chaosMs), { t: 'sfx', name: 'chaos' }],
  };
}

function enterWagerOrQuestion(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  const modifier = getModifier(state.modifierId);
  if (modifier?.wagerOptions) {
    return {
      state: { ...state, phase: { kind: 'wager', endsAt: ctx.now + state.config.wagerMs } },
      effects: phaseTimer(state.config.wagerMs),
    };
  }
  if (modifier?.sabotage) {
    return {
      state: { ...state, phase: { kind: 'sabotage', endsAt: ctx.now + state.config.sabotageMs } },
      effects: phaseTimer(state.config.sabotageMs),
    };
  }
  return enterQuestion(state, ctx);
}

function enterQuestion(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  const answerMs = questionMs(state);
  return {
    state: {
      ...state,
      phase: { kind: 'question', startedAt: ctx.now, endsAt: ctx.now + answerMs },
    },
    effects: [...phaseTimer(answerMs), { t: 'sfx', name: 'question' }],
  };
}

function questionMs(state: TriviaState): number {
  const modifier = getModifier(state.modifierId);
  return Math.round(state.config.answerMs * (modifier?.timeScale ?? 1));
}

function enterStar(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  return {
    state: { ...state, phase: { kind: 'star', endsAt: ctx.now + state.config.starMs } },
    effects: [...phaseTimer(state.config.starMs), { t: 'sfx', name: 'star' }],
  };
}

function afterReveal(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  if (state.round >= state.config.rounds) return finish(state, ctx);
  if (state.round % state.config.standingsEvery === 0) {
    return {
      state: { ...state, phase: { kind: 'standings', endsAt: ctx.now + state.config.standingsMs } },
      effects: phaseTimer(state.config.standingsMs),
    };
  }
  return beginRound(state, ctx);
}

function finish(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  const standings = buildStandings(state, ctx.players);
  const medals = buildMedals(state, ctx.players);
  const next: TriviaState = { ...state, phase: { kind: 'done' }, finale: { standings, medals } };
  return {
    state: next,
    effects: [
      { t: 'cancelTimer', key: 'phase' },
      { t: 'sfx', name: 'finale' },
      { t: 'finish', standings, medals },
    ],
  };
}

// ---------------------------------------------------------------------------
// Acciones de jugador
// ---------------------------------------------------------------------------

function onPlayerAction(
  state: TriviaState,
  playerId: PlayerId,
  action: { t: string; [k: string]: unknown },
  ctx: GameCtx,
): Reduction<TriviaState> {
  const withStats = ensureStats(state, playerId);

  if (action.t === 'choose' && withStats.phase.kind === 'sabotage') {
    const targetId = sabotageTarget(ctx, playerId);
    if (!targetId || withStats.sabotages[targetId]) return { state: withStats };
    const choiceId = String(action.choiceId);
    if (!withStats.choices.some((c) => c.id === choiceId)) return { state: withStats };
    const next: TriviaState = {
      ...withStats,
      sabotages: { ...withStats.sabotages, [targetId]: { choiceId, by: playerId } },
    };
    return everyoneSabotaged(next, ctx) ? enterQuestion(next, ctx) : { state: next };
  }

  if (action.t === 'choose' && withStats.phase.kind === 'question') {
    if (withStats.answers[playerId]) return { state: withStats }; // no se cambia de opinión
    const choiceId = String(action.choiceId);
    if (!withStats.choices.some((c) => c.id === choiceId)) return { state: withStats };
    // La opción tachada no existe para esta persona, por más que el celu la mande.
    if (withStats.sabotages[playerId]?.choiceId === choiceId) return { state: withStats };

    const answer: AnswerRecord = {
      choiceId,
      // El tiempo lo mide el server: el celular no tiene voz acá.
      ms: Math.max(0, ctx.now - withStats.phase.startedAt),
    };
    const next: TriviaState = {
      ...withStats,
      answers: { ...withStats.answers, [playerId]: answer },
    };
    return everyoneAnswered(next, ctx) ? resolveQuestion(next, ctx) : { state: next };
  }

  if (action.t === 'wager' && withStats.phase.kind === 'wager') {
    if (withStats.wagers[playerId] !== undefined) return { state: withStats };
    const modifier = getModifier(withStats.modifierId);
    const options = modifier?.wagerOptions ?? [0];
    const coins = withStats.stats[playerId]?.coins ?? 0;
    const requested = Number(action.value) || 0;
    const value = options.includes(requested) && requested <= coins ? requested : 0;
    const next: TriviaState = { ...withStats, wagers: { ...withStats.wagers, [playerId]: value } };
    return everyoneWagered(next, ctx) ? enterQuestion(next, ctx) : { state: next };
  }

  return { state: withStats };
}

function activePlayers(ctx: GameCtx | ViewCtx): PlayerId[] {
  const connected = ctx.players.filter((p) => p.connected);
  return (connected.length ? connected : ctx.players).map((p) => p.id);
}

function everyoneAnswered(state: TriviaState, ctx: GameCtx): boolean {
  return activePlayers(ctx).every((id) => state.answers[id] !== undefined);
}

function everyoneWagered(state: TriviaState, ctx: GameCtx): boolean {
  return activePlayers(ctx).every((id) => state.wagers[id] !== undefined);
}

/** Cada uno sabotea al siguiente en la ronda: nadie se tacha a sí mismo. */
function sabotageTarget(ctx: GameCtx | ViewCtx, playerId: PlayerId): PlayerId | null {
  const ids = ctx.players.map((p) => p.id);
  const index = ids.indexOf(playerId);
  if (index < 0 || ids.length < 2) return null;
  return ids[(index + 1) % ids.length] ?? null;
}

function everyoneSabotaged(state: TriviaState, ctx: GameCtx): boolean {
  const done = new Set(Object.values(state.sabotages).map((s) => s.by));
  return activePlayers(ctx).every((id) => done.has(id));
}

/** El texto que se muestra, ya pasado por el modificador (Sin Vocales y demás). */
function displayText(state: TriviaState): string {
  const text = state.question?.text ?? '';
  return getModifier(state.modifierId)?.transformText?.(text) ?? text;
}

// ---------------------------------------------------------------------------
// Resolución de la pregunta
// ---------------------------------------------------------------------------

function resolveQuestion(state: TriviaState, ctx: GameCtx): Reduction<TriviaState> {
  const question = state.question;
  if (!question) return afterReveal(state, ctx);

  const modifier = getModifier(state.modifierId);
  const judge = modifier?.judge ?? ((picked: string, correct: string) => picked === correct);
  const answerMs = questionMs(state);

  // 1. Quién acertó y en qué orden.
  const raw = ctx.players.map((player) => {
    const answer = state.answers[player.id];
    const correct = answer ? judge(answer.choiceId, state.correctChoiceId) : false;
    return { playerId: player.id, answer, correct };
  });
  const ranking = raw
    .filter((r) => r.correct && r.answer)
    .sort((a, b) => a.answer!.ms - b.answer!.ms)
    .map((r) => r.playerId);

  // 2. Monedas base.
  let outcomes: Outcome[] = raw.map((r) => {
    const place = r.correct ? ranking.indexOf(r.playerId) + 1 : null;
    const stats = state.stats[r.playerId] ?? emptyStats();
    const coins =
      r.correct && r.answer
        ? baseCoins({
            ms: r.answer.ms,
            answerMs,
            place: place ?? 99,
            previousStreak: stats.streak,
            difficulty: question.difficulty,
          })
        : 0;
    return {
      playerId: r.playerId,
      choiceId: r.answer?.choiceId ?? null,
      correct: r.correct,
      ms: r.answer?.ms ?? null,
      coins,
      place,
    };
  });

  // 3. Los hooks del modificador retocan el reparto.
  if (modifier?.scoreOne) {
    outcomes = outcomes.map((o) => ({ ...o, coins: modifier.scoreOne!(o.coins, o, state) }));
  }
  if (modifier?.settleAll) {
    outcomes = modifier.settleAll(outcomes, state);
  }

  // 4. Se aplican a las estadísticas.
  const stats: Record<PlayerId, PlayerStats> = { ...state.stats };
  for (const outcome of outcomes) {
    const previous = stats[outcome.playerId] ?? emptyStats();
    const streak = outcome.correct ? previous.streak + 1 : 0;
    const wager = state.wagers[outcome.playerId] ?? 0;
    stats[outcome.playerId] = {
      ...previous,
      coins: Math.max(0, previous.coins + outcome.coins),
      streak,
      bestStreak: Math.max(previous.bestStreak, streak),
      correct: previous.correct + (outcome.correct ? 1 : 0),
      wrong: previous.wrong + (!outcome.correct && outcome.choiceId ? 1 : 0),
      missed: previous.missed + (outcome.choiceId ? 0 : 1),
      firstBloods: previous.firstBloods + (outcome.place === 1 ? 1 : 0),
      wagered: previous.wagered + wager,
      times: outcome.correct && outcome.ms !== null ? [...previous.times, outcome.ms] : previous.times,
      categoryHits: outcome.correct
        ? {
            ...previous.categoryHits,
            [question.category]: (previous.categoryHits[question.category] ?? 0) + 1,
          }
        : previous.categoryHits,
    };
  }

  // 5. Estrella de la categoría.
  const star = resolveStar(state, question.category, outcomes, stats);

  const next: TriviaState = {
    ...state,
    stats: star.stats,
    stars: star.stars,
    outcomes: star.outcomes,
    starEvent: star.event,
    phase: { kind: 'reveal', endsAt: ctx.now + state.config.revealMs },
  };
  return {
    state: next,
    effects: [...phaseTimer(state.config.revealMs), { t: 'sfx', name: 'reveal' }],
  };
}

/**
 * Cada categoría tiene una estrella. Se reclama al llegar a `starThreshold`
 * aciertos en esa categoría. Si ya tiene dueño, el retador se la roba salvo
 * que el dueño también haya acertado y más rápido: ahí defiende y cobra peaje.
 */
function resolveStar(
  state: TriviaState,
  category: string,
  outcomes: Outcome[],
  stats: Record<PlayerId, PlayerStats>,
): {
  stars: Record<string, PlayerId | null>;
  stats: Record<PlayerId, PlayerStats>;
  outcomes: Outcome[];
  event: StarEvent | null;
} {
  const owner = state.stars[category] ?? null;
  const challenger = outcomes
    .filter(
      (o) =>
        o.correct &&
        o.ms !== null &&
        o.playerId !== owner &&
        (stats[o.playerId]?.categoryHits[category] ?? 0) >= state.config.starThreshold,
    )
    .sort((a, b) => a.ms! - b.ms!)[0];

  if (!challenger) {
    return { stars: state.stars, stats, outcomes, event: null };
  }

  const ownerOutcome = owner ? outcomes.find((o) => o.playerId === owner) : undefined;
  const ownerDefends =
    !!owner && !!ownerOutcome?.correct && ownerOutcome.ms !== null && ownerOutcome.ms < challenger.ms!;

  if (ownerDefends && owner) {
    const toll = SCORING.defendToll;
    const nextStats = { ...stats };
    nextStats[owner] = { ...stats[owner]!, coins: stats[owner]!.coins + toll };
    nextStats[challenger.playerId] = {
      ...stats[challenger.playerId]!,
      coins: Math.max(0, stats[challenger.playerId]!.coins - toll),
    };
    const nextOutcomes = outcomes.map((o) => {
      if (o.playerId === owner) return { ...o, coins: o.coins + toll, note: 'Defendió la estrella' };
      if (o.playerId === challenger.playerId) return { ...o, coins: o.coins - toll, note: 'Pagó peaje' };
      return o;
    });
    return {
      stars: state.stars,
      stats: nextStats,
      outcomes: nextOutcomes,
      event: { type: 'defend', category, playerId: owner, challengerId: challenger.playerId, toll },
    };
  }

  const stars = { ...state.stars, [category]: challenger.playerId };
  const nextStats = recountStars(stats, stars);
  const event: StarEvent = owner
    ? { type: 'steal', category, playerId: challenger.playerId, fromPlayerId: owner }
    : { type: 'claim', category, playerId: challenger.playerId };
  return { stars, stats: nextStats, outcomes, event };
}

function recountStars(
  stats: Record<PlayerId, PlayerStats>,
  stars: Record<string, PlayerId | null>,
): Record<PlayerId, PlayerStats> {
  const counts = new Map<PlayerId, number>();
  for (const owner of Object.values(stars)) {
    if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  const next: Record<PlayerId, PlayerStats> = {};
  for (const [playerId, playerStats] of Object.entries(stats)) {
    next[playerId] = { ...playerStats, starsWon: counts.get(playerId) ?? 0 };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------

function badge(modifier: Modifier | null): ModifierBadge | null {
  if (!modifier) return null;
  return {
    id: modifier.id,
    name: modifier.name,
    description: modifier.description,
    emoji: modifier.emoji,
    color: modifier.color,
  };
}

function buildHud(state: TriviaState, ctx: ViewCtx): Hud {
  const showDelta = state.phase.kind === 'reveal' || state.phase.kind === 'star';
  return {
    round: state.round,
    totalRounds: state.config.rounds,
    entries: ctx.players.map((player) => {
      const stats = state.stats[player.id] ?? emptyStats();
      const outcome = state.outcomes.find((o) => o.playerId === player.id);
      return {
        playerId: player.id,
        coins: stats.coins,
        stars: stats.starsWon,
        streak: stats.streak,
        delta: showDelta && outcome ? outcome.coins : null,
      };
    }),
    stars: activeCategories(state.config).map((category) => ({
      category,
      owner: state.stars[category.id] ?? null,
    })),
  };
}

function hostView(state: TriviaState, ctx: ViewCtx): TriviaHostView {
  const hud = buildHud(state, ctx);
  const modifier = badge(getModifier(state.modifierId));
  const category = getCategory(state.question?.category ?? '');

  switch (state.phase.kind) {
    case 'intro':
      return { kind: 'trivia/intro', hud, category, difficulty: state.question?.difficulty ?? 1 };
    case 'chaos':
      return { kind: 'trivia/chaos', hud, modifier: modifier! };
    case 'wager':
      return {
        kind: 'trivia/wager',
        hud,
        modifier: modifier!,
        ready: Object.keys(state.wagers),
        endsAt: state.phase.endsAt,
      };
    case 'sabotage':
      return {
        kind: 'trivia/sabotage',
        hud,
        modifier: modifier!,
        endsAt: state.phase.endsAt,
        pairs: ctx.players.flatMap((player) => {
          const toId = sabotageTarget(ctx, player.id);
          return toId
            ? [{ fromId: player.id, toId, done: state.sabotages[toId]?.by === player.id }]
            : [];
        }),
      };
    case 'question':
      return {
        kind: 'trivia/question',
        hud,
        category,
        text: displayText(state),
        choices: state.choices,
        endsAt: state.phase.endsAt,
        answered: Object.keys(state.answers),
        modifier,
        spotlight: getModifier(state.modifierId)?.spotlight?.(state) ?? null,
      };
    case 'reveal':
      return {
        kind: 'trivia/reveal',
        hud,
        category,
        text: state.question?.text ?? '',  // en el reveal se lee entera, sin trucos
        choices: state.choices,
        correctChoiceId: state.correctChoiceId,
        outcomes: state.outcomes,
        modifier,
        note: state.question?.note,
      };
    case 'star':
      return {
        kind: 'trivia/star',
        hud,
        category: getCategory(state.starEvent?.category ?? ''),
        event: state.starEvent!,
      };
    case 'standings':
      return { kind: 'trivia/standings', hud };
    case 'done':
      return { kind: 'trivia/done', hud };
  }
}

function playerView(state: TriviaState, playerId: PlayerId, ctx: ViewCtx): PlayerView {
  const modifier = getModifier(state.modifierId);
  const category = getCategory(state.question?.category ?? '');

  switch (state.phase.kind) {
    case 'intro':
      return {
        kind: 'idle',
        title: `Ronda ${state.round}`,
        subtitle: category.name,
        emoji: category.emoji,
      };

    case 'chaos':
      return {
        kind: 'idle',
        title: modifier?.name ?? 'Caos',
        subtitle: modifier?.description,
        emoji: modifier?.emoji ?? '🎲',
      };

    case 'wager': {
      const coins = state.stats[playerId]?.coins ?? 0;
      const options: WagerOption[] = (modifier?.wagerOptions ?? [0]).map((value) => ({
        value,
        label: value === 0 ? 'Nada' : String(value),
        disabled: value > coins,
      }));
      return {
        kind: 'wager',
        prompt: '¿Cuánto apostás?',
        hint: `Tenés ${coins} monedas · todavía no viste la pregunta`,
        options,
        locked: state.wagers[playerId],
        deadline: state.phase.endsAt,
      };
    }

    case 'sabotage': {
      const targetId = sabotageTarget(ctx, playerId);
      const target = ctx.players.find((p) => p.id === targetId);
      const mine = Object.entries(state.sabotages).find(([, s]) => s.by === playerId);
      return {
        kind: 'choices',
        prompt: target ? `Tachale una opción a ${target.name}` : 'Esperando…',
        hint: 'Todavía no viste la pregunta',
        choices: state.choices,
        locked: mine?.[1].choiceId,
        deadline: state.phase.endsAt,
      };
    }

    case 'question': {
      const sabotaged = state.sabotages[playerId]?.choiceId;
      const hint = modifier?.playerHint?.(playerId, state);
      return {
        kind: 'choices',
        prompt: modifier?.blind ? 'Mirá la tele y elegí' : displayText(state),
        hint: hint ?? (modifier ? `${modifier.emoji} ${modifier.name}` : category.name),
        // La opción tachada directamente no le llega a la víctima.
        choices: state.choices.filter((choice) => choice.id !== sabotaged),
        locked: state.answers[playerId]?.choiceId,
        blind: modifier?.blind ?? false,
        deadline: state.phase.endsAt,
      };
    }

    case 'reveal': {
      const outcome = state.outcomes.find((o) => o.playerId === playerId);
      if (!outcome || !outcome.choiceId) {
        return {
          kind: 'verdict',
          tone: 'bad',
          title: 'Te dormiste',
          subtitle: 'No llegaste a responder',
          emoji: '😴',
        };
      }
      return {
        kind: 'verdict',
        tone: outcome.correct ? 'good' : 'bad',
        title: outcome.correct ? '¡Bien ahí!' : 'Nop',
        subtitle: outcome.note ?? (outcome.place === 1 ? 'Primero en acertar' : undefined),
        delta: outcome.coins,
        deltaSuffix: '🪙',
        emoji: outcome.correct ? (outcome.place === 1 ? '🥇' : '✅') : '❌',
      };
    }

    case 'star': {
      const event = state.starEvent;
      if (!event) return { kind: 'idle', title: 'Estrella en juego', emoji: '⭐' };
      const mine = event.playerId === playerId;
      if (event.type === 'defend') {
        if (mine) return { kind: 'verdict', tone: 'good', title: 'Defendiste la estrella', emoji: '🛡️' };
        if (event.challengerId === playerId) {
          return {
            kind: 'verdict',
            tone: 'bad',
            title: 'Te la defendieron',
            subtitle: `Pagaste ${event.toll} de peaje`,
            emoji: '🛡️',
          };
        }
        return { kind: 'idle', title: 'Estrella defendida', emoji: '🛡️' };
      }
      if (mine) {
        return {
          kind: 'verdict',
          tone: 'good',
          title: event.type === 'steal' ? '¡Se la robaste!' : '¡Estrella tuya!',
          subtitle: getCategory(event.category).name,
          emoji: '⭐',
        };
      }
      if (event.type === 'steal' && event.fromPlayerId === playerId) {
        return {
          kind: 'verdict',
          tone: 'bad',
          title: 'Te robaron la estrella',
          subtitle: getCategory(event.category).name,
          emoji: '💫',
        };
      }
      return { kind: 'idle', title: 'Estrella en juego', subtitle: getCategory(event.category).name, emoji: '⭐' };
    }

    case 'standings': {
      const standings = buildStandings(state, ctx.players);
      const mine = standings.find((s) => s.playerId === playerId);
      return {
        kind: 'idle',
        title: mine ? `Vas ${ordinal(mine.rank)}` : 'Tabla de posiciones',
        subtitle: mine?.label,
        emoji: mine?.rank === 1 ? '👑' : '📊',
      };
    }

    case 'done':
      return { kind: 'idle', title: 'Se terminó', subtitle: 'Mirá la tele', emoji: '🏁' };
  }
}

function ordinal(rank: number): string {
  return ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo'][rank - 1] ?? `#${rank}`;
}

export * from './types';
export { CATEGORIES } from './categories';
export { MODIFIERS } from './modifiers';
export { QUESTIONS } from './questions';
