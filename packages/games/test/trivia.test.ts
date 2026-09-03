import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRng, type Effect, type GameEvent } from '@perty/engine';
import type { Player, PlayerAction } from '@perty/protocol';
import { defaultTriviaConfig, triviaGame } from '../src/trivia/index';
import { getModifier, stripVowels } from '../src/trivia/modifiers';
import { baseCoins } from '../src/trivia/scoring';
import type { TriviaConfig, TriviaState } from '../src/trivia/types';

function makePlayers(names: string[]): Player[] {
  return names.map((name, index) => ({
    id: name,
    name,
    color: '#fff',
    emoji: '🐙',
    connected: true,
    isVip: index === 0,
  }));
}

/**
 * Corre el juego sin timers reales: un reloj virtual salta directo al próximo
 * vencimiento. Determinista y sin esperas.
 */
function harness(players: Player[], overrides: Partial<TriviaConfig> = {}) {
  const rng = createRng(1234);
  let now = 1_000_000;
  let timerAt: number | null = null;
  const config = { ...defaultTriviaConfig(), ...overrides };

  const ctx = () => ({ now, rng, players });
  const applied: Effect[] = [];

  const apply = (effects: Effect[] | undefined) => {
    for (const effect of effects ?? []) {
      applied.push(effect);
      if (effect.t === 'timer') timerAt = now + effect.delayMs;
      if (effect.t === 'cancelTimer') timerAt = null;
    }
  };

  let { state, effects } = triviaGame.create(ctx(), config);
  apply(effects);

  const dispatch = (event: GameEvent) => {
    const result = triviaGame.reduce(state, event, ctx());
    state = result.state;
    apply(result.effects);
  };

  return {
    get state(): TriviaState {
      return state;
    },
    get effects() {
      return applied;
    },
    get now() {
      return now;
    },
    act(playerId: string, action: PlayerAction) {
      dispatch({ t: 'player', playerId, action });
    },
    /** Deja correr el tiempo hasta que salte el próximo timer de fase. */
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        if (timerAt === null) return;
        now = timerAt;
        timerAt = null;
        dispatch({ t: 'timer', key: 'phase' });
      }
    },
    /** Avanza hasta que la fase sea `kind` (o se acabe la paciencia). */
    runTo(kind: TriviaState['phase']['kind'], limit = 200) {
      for (let i = 0; i < limit && state.phase.kind !== kind; i++) this.tick();
      return state.phase.kind === kind;
    },
    advanceClock(ms: number) {
      now += ms;
    },
    correctId() {
      return state.correctChoiceId;
    },
    playerView(playerId: string) {
      return triviaGame.playerView(state, playerId, { now, players });
    },
    wrongId() {
      return state.choices.find((c) => c.id !== state.correctChoiceId)!.id;
    },
  };
}

describe('mazo', () => {
  it('no repite preguntas y alterna categorías', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    const deck = game.state.deck;
    const ids = new Set(deck.map((q) => q.id));

    assert.equal(ids.size, deck.length, 'hay preguntas repetidas en el mazo');
    assert.ok(deck.length > 40, 'el mazo quedó demasiado corto');

    let repeats = 0;
    for (let i = 1; i < deck.length; i++) {
      if (deck[i]!.category === deck[i - 1]!.category) repeats++;
    }
    // Solo se permiten repeticiones al final, cuando quedan pocas categorías vivas.
    assert.ok(repeats < deck.length / 6, `demasiadas categorías seguidas: ${repeats}`);
  });
});

describe('puntaje', () => {
  it('contestar rápido paga más que contestar tarde', () => {
    const fast = baseCoins({ ms: 1000, answerMs: 18000, place: 1, previousStreak: 0, difficulty: 1 });
    const slow = baseCoins({ ms: 16000, answerMs: 18000, place: 3, previousStreak: 0, difficulty: 1 });
    assert.ok(fast > slow, `rápido ${fast} debería pagar más que lento ${slow}`);
  });

  it('la racha y la dificultad suman', () => {
    const plain = baseCoins({ ms: 5000, answerMs: 18000, place: 2, previousStreak: 0, difficulty: 1 });
    const hot = baseCoins({ ms: 5000, answerMs: 18000, place: 2, previousStreak: 3, difficulty: 3 });
    assert.ok(hot > plain + 100);
  });
});

describe('ronda', () => {
  it('reparte monedas al que acierta y cero al que erra', () => {
    const game = harness(makePlayers(['ana', 'beto']), { chaosWarmup: 99 });
    assert.ok(game.runTo('question'), 'nunca llegó a la pregunta');

    game.advanceClock(2000);
    game.act('ana', { t: 'choose', choiceId: game.correctId() });
    game.advanceClock(1000);
    game.act('beto', { t: 'choose', choiceId: game.wrongId() });

    // Contestaron todos: la fase salta sola al reveal.
    assert.equal(game.state.phase.kind, 'reveal');
    const ana = game.state.stats['ana']!;
    const beto = game.state.stats['beto']!;
    assert.ok(ana.coins > 0, 'ana acertó y no cobró');
    assert.equal(beto.coins, 0);
    assert.equal(ana.streak, 1);
    assert.equal(beto.streak, 0);
    assert.equal(ana.correct, 1);
    assert.equal(beto.wrong, 1);
  });

  it('al que no contesta le cuenta como perdida', () => {
    const game = harness(makePlayers(['ana', 'beto']), { chaosWarmup: 99 });
    game.runTo('question');
    game.act('ana', { t: 'choose', choiceId: game.correctId() });
    game.tick(); // se acaba el tiempo

    assert.equal(game.state.stats['beto']!.missed, 1);
  });
});

describe('estrellas', () => {
  it('se reclaman y después se roban', () => {
    const game = harness(makePlayers(['ana', 'beto']), {
      categories: ['programacion'],
      starThreshold: 1,
      chaosWarmup: 99,
      rounds: 6,
    });

    // Ronda 1: ana acierta sola -> reclama la estrella.
    game.runTo('question');
    game.advanceClock(1500);
    game.act('ana', { t: 'choose', choiceId: game.correctId() });
    game.act('beto', { t: 'choose', choiceId: game.wrongId() });
    assert.equal(game.state.starEvent?.type, 'claim');
    assert.equal(game.state.stars['programacion'], 'ana');
    assert.equal(game.state.stats['ana']!.starsWon, 1);

    // Ronda 2: beto acierta más rápido -> se la roba.
    assert.ok(game.runTo('question'), 'no llegó a la segunda pregunta');
    game.advanceClock(800);
    game.act('beto', { t: 'choose', choiceId: game.correctId() });
    game.advanceClock(4000);
    game.act('ana', { t: 'choose', choiceId: game.correctId() });

    assert.equal(game.state.starEvent?.type, 'steal');
    assert.equal(game.state.stars['programacion'], 'beto');
    assert.equal(game.state.stats['beto']!.starsWon, 1);
    assert.equal(game.state.stats['ana']!.starsWon, 0);
  });

  it('el dueño que contesta más rápido defiende y cobra peaje', () => {
    const game = harness(makePlayers(['ana', 'beto']), {
      categories: ['programacion'],
      starThreshold: 1,
      chaosWarmup: 99,
      rounds: 6,
    });

    game.runTo('question');
    game.advanceClock(1000);
    game.act('ana', { t: 'choose', choiceId: game.correctId() });
    game.act('beto', { t: 'choose', choiceId: game.wrongId() });
    assert.equal(game.state.stars['programacion'], 'ana');

    game.runTo('question');
    game.advanceClock(500);
    game.act('ana', { t: 'choose', choiceId: game.correctId() });
    game.advanceClock(3000);
    game.act('beto', { t: 'choose', choiceId: game.correctId() });

    const event = game.state.starEvent;
    assert.equal(event?.type, 'defend');
    assert.equal(game.state.stars['programacion'], 'ana');
  });
});

describe('modificadores', () => {
  it('Al Revés invierte qué cuenta como acierto', () => {
    const inverse = getModifier('inverse')!;
    assert.equal(inverse.judge!('c1', 'c2'), true);
    assert.equal(inverse.judge!('c2', 'c2'), false);
  });

  it('Francotirador deja sin nada al que llega segundo', () => {
    const sniper = getModifier('sniper')!;
    const outcomes = [
      { playerId: 'ana', choiceId: 'c1', correct: true, ms: 900, coins: 200, place: 1 },
      { playerId: 'beto', choiceId: 'c1', correct: true, ms: 1800, coins: 180, place: 2 },
    ];
    const settled = sniper.settleAll!(outcomes, {} as TriviaState);
    assert.equal(settled[0]!.coins, 600);
    assert.equal(settled[1]!.coins, 0);
  });

  it('La Apuesta paga el doble de lo apostado y lo cobra si errás', () => {
    const wager = getModifier('wager')!;
    const state = { wagers: { ana: 250 } } as unknown as TriviaState;
    const win = wager.scoreOne!(100, { playerId: 'ana', correct: true } as never, state);
    const lose = wager.scoreOne!(0, { playerId: 'ana', correct: false } as never, state);
    assert.equal(win, 600);
    assert.equal(lose, -250);
  });
});

describe('modificadores nuevos', () => {
  const baseState = (extra: Partial<TriviaState> = {}) =>
    ({
      stats: { ana: {}, beto: {} },
      wagers: {},
      sabotages: {},
      modifierData: null,
      ...extra,
    }) as unknown as TriviaState;

  it('Ruleta Rusa premia al que sobrevive y funde al que no', () => {
    const ruleta = getModifier('ruleta')!;
    const state = baseState({ modifierData: { victimId: 'ana' } });
    const outcomes = [
      { playerId: 'ana', choiceId: 'c0', correct: true, ms: 900, coins: 200, place: 1 },
      { playerId: 'beto', choiceId: 'c0', correct: true, ms: 1200, coins: 180, place: 2 },
    ];
    const survived = ruleta.settleAll!(outcomes, state);
    assert.equal(survived[0]!.coins, 400, 'la víctima acertó y no cobró doble');
    assert.equal(survived[1]!.coins, 180, 'le tocó a alguien que no tenía la bala');

    const shot = ruleta.settleAll!(
      outcomes.map((o) => (o.playerId === 'ana' ? { ...o, correct: false, coins: 0 } : o)),
      state,
    );
    assert.equal(shot[0]!.coins, -250);
  });

  it('Cadena paga a todos o a ninguno', () => {
    const cadena = getModifier('cadena')!;
    const all = [
      { playerId: 'ana', choiceId: 'c0', correct: true, ms: 900, coins: 200, place: 1 },
      { playerId: 'beto', choiceId: 'c0', correct: true, ms: 1200, coins: 180, place: 2 },
    ];
    const unbroken = cadena.settleAll!(all, baseState());
    assert.deepEqual(
      unbroken.map((o) => o.coins),
      [400, 360],
    );

    const broken = cadena.settleAll!(
      [all[0]!, { ...all[1]!, correct: false, coins: 0 }],
      baseState(),
    );
    assert.deepEqual(
      broken.map((o) => o.coins),
      [0, 0],
    );
  });

  it('Sin Vocales tapa las vocales y deja el resto', () => {
    assert.equal(stripVowels('¿Quién dirigió Pulp Fiction?'), '¿Q___n d_r_g__ P_lp F_ct__n?');
    assert.equal(stripVowels('ñandú'), 'ñ_nd_');
  });

  it('Sabotaje: la opción tachada no le llega a la víctima ni se la aceptan', () => {
    const game = harness(makePlayers(['ana', 'beto']), {
      forcedModifier: 'sabotaje',
      chaosWarmup: 0,
    });
    assert.ok(game.runTo('sabotage'), 'nunca llegó a la fase de sabotaje');

    // Ana sabotea a Beto tachándole la correcta; Beto le tacha cualquiera a Ana.
    const doomed = game.correctId();
    game.act('ana', { t: 'choose', choiceId: doomed });
    game.act('beto', { t: 'choose', choiceId: game.wrongId() });
    assert.equal(game.state.phase.kind, 'question', 'sabotearon todos y no arrancó la pregunta');

    const view = game.playerView('beto');
    assert.equal(view.kind, 'choices');
    if (view.kind !== 'choices') return;
    assert.equal(view.choices.length, 3, 'a la víctima le siguen llegando las 4');
    assert.ok(!view.choices.some((c) => c.id === doomed), 'le llegó la opción tachada');

    // Aunque el celu mande la tachada igual, el server no la toma.
    game.act('beto', { t: 'choose', choiceId: doomed });
    assert.equal(game.state.answers['beto'], undefined, 'el server aceptó una opción tachada');
  });

  it('Sabotaje: el saboteador cobra si su víctima cae', () => {
    const sabotaje = getModifier('sabotaje')!;
    const state = baseState({ sabotages: { beto: { choiceId: 'c1', by: 'ana' } } });
    const outcomes = [
      { playerId: 'ana', choiceId: 'c0', correct: true, ms: 900, coins: 200, place: 1 },
      { playerId: 'beto', choiceId: 'c2', correct: false, ms: 1500, coins: 0, place: null },
    ];
    const settled = sabotaje.settleAll!(outcomes, state);
    assert.equal(settled[0]!.coins, 350);
    assert.equal(settled[1]!.coins, 0);
  });
});

describe('partida completa', () => {
  it('termina con posiciones y medallas', () => {
    const players = makePlayers(['ana', 'beto', 'cami']);
    const game = harness(players, { rounds: 6 });

    for (let round = 0; round < 6; round++) {
      if (!game.runTo('question', 40)) break;
      game.advanceClock(1200);
      game.act('ana', { t: 'choose', choiceId: game.correctId() });
      game.advanceClock(900);
      game.act('beto', { t: 'choose', choiceId: game.correctId() });
      game.advanceClock(700);
      game.act('cami', { t: 'choose', choiceId: game.wrongId() });
    }
    game.runTo('done', 40);

    const finale = game.state.finale;
    assert.ok(finale, 'la partida no terminó');
    assert.equal(finale.standings.length, 3);
    assert.equal(finale.standings[0]!.rank, 1);
    assert.equal(finale.standings[0]!.playerId, 'ana', 'ana contestó primero siempre');
    assert.ok(finale.medals.length >= 3, 'esperaba varias medallas');
    assert.ok(finale.medals.some((m) => m.id === 'cerebrito'));

    const finish = game.effects.find((e) => e.t === 'finish');
    assert.ok(finish, 'no se emitió el efecto de fin de juego');
  });
});
