import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRng, type Effect, type GameEvent } from '@perty/engine';
import type { Player, PlayerAction } from '@perty/protocol';
import { buildScale, defaultPriceConfig, parseGuess, priceGame } from '../src/price/index';
import { PRICE_QUESTIONS } from '../src/price/questions';
import type { PriceConfig, PriceState } from '../src/price/types';

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

function harness(players: Player[], overrides: Partial<PriceConfig> = {}) {
  const rng = createRng(31337);
  let now = 3_000_000;
  let timerAt: number | null = null;
  const config = { ...defaultPriceConfig(), ...overrides };
  const ctx = () => ({ now, rng, players });
  const applied: Effect[] = [];

  const apply = (effects: Effect[] | undefined) => {
    for (const effect of effects ?? []) {
      applied.push(effect);
      if (effect.t === 'timer') timerAt = now + effect.delayMs;
      if (effect.t === 'cancelTimer') timerAt = null;
    }
  };

  let { state, effects } = priceGame.create(ctx(), config);
  apply(effects);

  const dispatch = (event: GameEvent) => {
    const result = priceGame.reduce(state, event, ctx());
    state = result.state;
    apply(result.effects);
  };

  return {
    get state(): PriceState {
      return state;
    },
    get effects() {
      return applied;
    },
    act(playerId: string, action: PlayerAction) {
      dispatch({ t: 'player', playerId, action });
    },
    guess(playerId: string, value: number | string) {
      dispatch({ t: 'player', playerId, action: { t: 'submitText', text: String(value) } });
    },
    playerView(playerId: string) {
      return priceGame.playerView(state, playerId, { now, players });
    },
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        if (timerAt === null) return;
        now = timerAt;
        timerAt = null;
        dispatch({ t: 'timer', key: 'phase' });
      }
    },
    runTo(kind: PriceState['phase']['kind'], limit = 200) {
      for (let i = 0; i < limit && state.phase.kind !== kind; i++) this.tick();
      return state.phase.kind === kind;
    },
    answer() {
      return state.question!.answer;
    },
    outcome(playerId: string) {
      return state.outcomes.find((o) => o.playerId === playerId)!;
    },
  };
}

describe('precio justo · ronda', () => {
  it('el más cerca se lleva más que el resto', () => {
    const game = harness(makePlayers(['ana', 'beto', 'cami']));
    assert.ok(game.runTo('guess'), 'no llegó a la fase de tirar el número');
    const answer = game.answer();

    game.guess('ana', answer + 1);
    game.guess('beto', answer + 10);
    game.guess('cami', answer + 500);

    assert.equal(game.state.phase.kind, 'reveal', 'tiraron todos y no se reveló');
    assert.equal(game.outcome('ana').rank, 1);
    assert.equal(game.outcome('beto').rank, 2);
    assert.equal(game.outcome('cami').rank, 3);
    assert.ok(game.outcome('ana').points > game.outcome('beto').points);
    assert.ok(game.outcome('beto').points > game.outcome('cami').points);
  });

  it('clavar el número exacto paga un bonus', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('guess');
    const answer = game.answer();

    game.guess('ana', answer);
    game.guess('beto', answer + 1);

    const ana = game.outcome('ana');
    assert.equal(ana.exact, true);
    assert.equal(ana.points, 2000, 'primer puesto 1000 + bonus 1000');
    assert.equal(ana.note, '¡Clavado!');
    assert.equal(game.state.stats['ana']!.exact, 1);
  });

  it('empatar la distancia empata el puesto', () => {
    const game = harness(makePlayers(['ana', 'beto', 'cami']));
    game.runTo('guess');
    const answer = game.answer();

    // Offsets chicos a propósito: hay respuestas de un dígito en el banco.
    game.guess('ana', answer + 1);
    game.guess('beto', answer - 1);
    game.guess('cami', answer + 50);

    assert.equal(game.outcome('ana').rank, 1);
    assert.equal(game.outcome('beto').rank, 1, 'misma distancia, distinto puesto');
    assert.equal(game.outcome('ana').points, game.outcome('beto').points);
    assert.equal(game.outcome('cami').rank, 3, 'después de dos empatados va el tercero');
  });

  it('al que no tira número le queda en blanco', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('guess');
    game.guess('ana', game.answer());
    game.tick(); // se acaba el tiempo

    assert.equal(game.state.phase.kind, 'reveal');
    const beto = game.outcome('beto');
    assert.equal(beto.guess, null);
    assert.equal(beto.points, 0);
    assert.equal(game.state.stats['beto']!.blanks, 1);
  });

  it('no se puede corregir el número una vez enviado', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('guess');
    game.guess('ana', 10);
    game.guess('ana', 999);
    assert.equal(game.state.guesses['ana'], 10);
  });
});

describe('precio justo · regla de la casa', () => {
  it('sin pasarse deja sin puntos al que se pasa', () => {
    const game = harness(makePlayers(['ana', 'beto']), { noOvershoot: true });
    game.runTo('guess');
    const answer = game.answer();

    // Ana se pasa por poquito, Beto se queda corto. La mitad siempre es válida:
    // restar un número fijo daría negativo con las respuestas más chicas.
    game.guess('ana', answer + 1);
    game.guess('beto', Math.floor(answer / 2));

    const ana = game.outcome('ana');
    assert.equal(ana.over, true);
    assert.equal(ana.points, 0, 'se pasó y cobró igual');
    assert.equal(ana.rank, null);
    assert.equal(game.outcome('beto').rank, 1, 'el que no se pasó tiene que ganar la ronda');
  });

  it('con la regla libre, pasarse solo cuenta como distancia', () => {
    const game = harness(makePlayers(['ana', 'beto']), { noOvershoot: false });
    game.runTo('guess');
    const answer = game.answer();

    game.guess('ana', answer + 1);
    game.guess('beto', Math.floor(answer / 2));

    assert.equal(game.outcome('ana').over, false);
    assert.equal(game.outcome('ana').rank, 1);
  });
});

describe('precio justo · números que llegan', () => {
  it('acepta dígitos y descarta el resto', () => {
    assert.equal(parseGuess('1994'), 1994);
    assert.equal(parseGuess(' 1.994 '), 1994, 'los separadores de miles no deberían romper');
    assert.equal(parseGuess('como 200'), 200);
    assert.equal(parseGuess('-5'), 5, 'no hay números negativos en este juego');
    assert.equal(parseGuess('no sé'), null);
    assert.equal(parseGuess(''), null);
    assert.equal(parseGuess('9'.repeat(20)), null, 'dejó pasar un número absurdo');
  });

  it('el celu recibe un campo numérico', () => {
    const game = harness(makePlayers(['ana']));
    game.runTo('guess');
    const view = game.playerView('ana');
    assert.equal(view.kind, 'text');
    if (view.kind !== 'text') return;
    assert.equal(view.numeric, true);
    assert.equal(view.submitted, undefined);

    game.guess('ana', 42);
  });
});

describe('precio justo · recta del reveal', () => {
  it('entra todo el mundo con aire a los costados', () => {
    const scale = buildScale(100, [50, 150]);
    assert.ok(scale.min < 50, 'el más chico quedó pegado al borde');
    assert.ok(scale.max > 150, 'el más grande quedó pegado al borde');
  });

  it('sobrevive a que todos digan lo mismo', () => {
    const scale = buildScale(100, [100, 100]);
    assert.ok(scale.max > scale.min, 'la recta quedó sin ancho');
  });

  it('sobrevive a que nadie tire nada', () => {
    const scale = buildScale(1889, []);
    assert.ok(scale.min < 1889 && scale.max > 1889);
  });

  it('nunca arranca en negativo', () => {
    const scale = buildScale(193, [922, 1163, 1689]);
    assert.equal(scale.min, 0, 'una recta de "cuántos países" no puede empezar bajo cero');
    assert.ok(scale.max > 1689);
  });
});

describe('precio justo · banco', () => {
  it('no repite ids ni preguntas y los números son sensatos', () => {
    const ids = new Set<string>();
    const texts = new Set<string>();
    for (const question of PRICE_QUESTIONS) {
      assert.ok(!ids.has(question.id), `id repetido: ${question.id}`);
      ids.add(question.id);
      const key = question.text.trim().toLowerCase();
      assert.ok(!texts.has(key), `${question.id} repite una pregunta`);
      texts.add(key);
      assert.ok(Number.isFinite(question.answer), `${question.id} no tiene número`);
      assert.ok(question.answer >= 0, `${question.id} tiene respuesta negativa`);
      assert.ok(question.text.includes('?'), `${question.id} no parece una pregunta`);
    }
  });
});

describe('precio justo · partida completa', () => {
  it('termina con posiciones y medallas', () => {
    const players = makePlayers(['ana', 'beto', 'cami']);
    const game = harness(players, { rounds: 5 });

    for (let round = 0; round < 5; round++) {
      if (!game.runTo('guess', 40)) break;
      const answer = game.answer();
      game.guess('ana', answer);
      game.guess('beto', answer + 3);
      game.guess('cami', answer + 500);
    }
    game.runTo('done', 40);

    const finale = game.state.finale;
    assert.ok(finale, 'la partida no terminó');
    assert.equal(finale.standings[0]!.playerId, 'ana', 'ana clavó todas');
    assert.ok(finale.medals.some((m) => m.id === 'clavado'));
    assert.ok(finale.medals.some((m) => m.id === 'ojo'));
    assert.ok(game.effects.some((e) => e.t === 'finish'));
  });
});
