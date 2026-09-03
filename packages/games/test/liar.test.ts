import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRng, type Effect, type GameEvent } from '@perty/engine';
import type { Player, PlayerAction } from '@perty/protocol';
import { defaultLiarConfig, liarGame, normalize } from '../src/liar/index';
import { LIAR_PROMPTS } from '../src/liar/prompts';
import type { LiarConfig, LiarState } from '../src/liar/types';

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

function harness(players: Player[], overrides: Partial<LiarConfig> = {}) {
  const rng = createRng(4242);
  let now = 2_000_000;
  let timerAt: number | null = null;
  const config = { ...defaultLiarConfig(), ...overrides };
  const ctx = () => ({ now, rng, players });
  const applied: Effect[] = [];

  const apply = (effects: Effect[] | undefined) => {
    for (const effect of effects ?? []) {
      applied.push(effect);
      if (effect.t === 'timer') timerAt = now + effect.delayMs;
      if (effect.t === 'cancelTimer') timerAt = null;
    }
  };

  let { state, effects } = liarGame.create(ctx(), config);
  apply(effects);

  const dispatch = (event: GameEvent) => {
    const result = liarGame.reduce(state, event, ctx());
    state = result.state;
    apply(result.effects);
  };

  return {
    get state(): LiarState {
      return state;
    },
    get effects() {
      return applied;
    },
    act(playerId: string, action: PlayerAction) {
      dispatch({ t: 'player', playerId, action });
    },
    playerView(playerId: string) {
      return liarGame.playerView(state, playerId, { now, players });
    },
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        if (timerAt === null) return;
        now = timerAt;
        timerAt = null;
        dispatch({ t: 'timer', key: 'phase' });
      }
    },
    runTo(kind: LiarState['phase']['kind'], limit = 200) {
      for (let i = 0; i < limit && state.phase.kind !== kind; i++) this.tick();
      return state.phase.kind === kind;
    },
    truthOptionId() {
      return state.options.find((o) => o.truth)!.id;
    },
    optionByText(text: string) {
      return state.options.find((o) => o.text === text)!.id;
    },
  };
}

describe('mentiroso · escritura', () => {
  it('escribir la verdad cuenta como acierto y no entra a la votación', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    assert.ok(game.runTo('write'), 'no llegó a la escritura');
    const truth = game.state.prompt!.answer;

    game.act('ana', { t: 'submitText', text: truth.toUpperCase() });
    assert.deepEqual(game.state.accidents, ['ana'], 'no detectó la verdad escrita con mayúsculas');
    assert.equal(game.state.fakes['ana'], undefined, 'la verdad entró como mentira');

    const view = game.playerView('ana');
    assert.equal(view.kind, 'idle');

    game.act('beto', { t: 'submitText', text: 'cualquier verdura' });
    assert.equal(game.state.phase.kind, 'vote', 'escribieron todos y no arrancó la votación');
  });

  it('las mentiras iguales se juntan en una sola opción', () => {
    const game = harness(makePlayers(['ana', 'beto', 'cami']));
    game.runTo('write');
    game.act('ana', { t: 'submitText', text: 'Una bicicleta' });
    game.act('beto', { t: 'submitText', text: 'una  BICICLETA' });
    game.act('cami', { t: 'submitText', text: 'otra cosa' });

    assert.equal(game.state.phase.kind, 'vote');
    const shared = game.state.options.find((o) => o.authors.length === 2);
    assert.ok(shared, 'las mentiras repetidas quedaron como opciones separadas');
    assert.deepEqual(shared.authors.sort(), ['ana', 'beto']);
    // verdad + bici compartida + la de cami
    assert.equal(game.state.options.length, 3);
  });

  it('no se puede escribir dos veces ni mandar vacío', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('write');
    game.act('ana', { t: 'submitText', text: '   ' });
    assert.equal(game.state.fakes['ana'], undefined, 'aceptó una respuesta vacía');

    game.act('ana', { t: 'submitText', text: 'primera' });
    game.act('ana', { t: 'submitText', text: 'segunda' });
    assert.equal(game.state.fakes['ana'], 'primera', 'dejó cambiar la mentira');
  });
});

describe('mentiroso · votación', () => {
  it('nadie ve ni puede votar su propia mentira', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('write');
    game.act('ana', { t: 'submitText', text: 'la mentira de ana' });
    game.act('beto', { t: 'submitText', text: 'la mentira de beto' });

    const view = game.playerView('ana');
    assert.equal(view.kind, 'choices');
    if (view.kind !== 'choices') return;
    assert.ok(
      !view.choices.some((c) => c.label === 'la mentira de ana'),
      'a ana le mostraron su propia mentira',
    );

    const own = game.optionByText('la mentira de ana');
    game.act('ana', { t: 'choose', choiceId: own });
    assert.equal(game.state.votes['ana'], undefined, 'el server aceptó el autovoto');
  });

  it('paga encontrar la verdad y paga que piquen en tu mentira', () => {
    const game = harness(makePlayers(['ana', 'beto', 'cami']));
    game.runTo('write');
    const truth = game.state.prompt!.answer;
    game.act('ana', { t: 'submitText', text: 'la mentira de ana' });
    game.act('beto', { t: 'submitText', text: 'la mentira de beto' });
    game.act('cami', { t: 'submitText', text: truth });

    assert.deepEqual(game.state.accidents, ['cami']);
    assert.equal(game.state.phase.kind, 'vote');

    const anaLie = game.optionByText('la mentira de ana');
    game.act('ana', { t: 'choose', choiceId: game.truthOptionId() });
    game.act('beto', { t: 'choose', choiceId: anaLie });
    game.act('cami', { t: 'choose', choiceId: anaLie });

    assert.equal(game.state.phase.kind, 'reveal');
    const stats = game.state.stats;
    // 1000 por encontrar la verdad + 500 por cada uno de los dos que picaron
    assert.equal(stats['ana']!.points, 2000);
    assert.equal(stats['ana']!.fooled, 2);
    assert.equal(stats['ana']!.found, 1);
    assert.equal(stats['beto']!.points, 0);
    assert.equal(stats['beto']!.fell, 1);
    assert.equal(stats['cami']!.points, 500, 'no le pagaron el acierto sin querer');
  });

  it('al que no escribe nada se le anota en blanco', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('write');
    game.act('ana', { t: 'submitText', text: 'algo' });
    game.tick(); // se acaba el tiempo de escritura

    assert.equal(game.state.phase.kind, 'vote');
    assert.equal(game.state.stats['beto']!.blanks, 1);
  });
});

describe('mentiroso · banco', () => {
  it('todas las consignas tienen hueco y respuesta corta', () => {
    for (const prompt of LIAR_PROMPTS) {
      assert.ok(prompt.text.includes('____'), `${prompt.id} no tiene hueco`);
      assert.ok(prompt.answer.trim().length > 0, `${prompt.id} no tiene respuesta`);
      assert.ok(normalize(prompt.answer).length > 0, `${prompt.id} tiene respuesta invisible`);
    }
    const ids = new Set(LIAR_PROMPTS.map((p) => p.id));
    assert.equal(ids.size, LIAR_PROMPTS.length, 'hay ids repetidos');
  });

  it('normalize ignora mayúsculas, acentos y puntuación', () => {
    assert.equal(normalize('  ¡La Miel!  '), 'la miel');
    assert.equal(normalize('Völuspá'), 'voluspa');
    assert.equal(normalize('15 centímetros'), '15 centimetros');
  });
});

describe('mentiroso · partida completa', () => {
  it('termina con posiciones y medallas', () => {
    const players = makePlayers(['ana', 'beto', 'cami']);
    const game = harness(players, { rounds: 4 });

    for (let round = 0; round < 4; round++) {
      if (!game.runTo('write', 40)) break;
      game.act('ana', { t: 'submitText', text: `mentira de ana ${round}` });
      game.act('beto', { t: 'submitText', text: `mentira de beto ${round}` });
      game.act('cami', { t: 'submitText', text: `mentira de cami ${round}` });

      const anaLie = game.optionByText(`mentira de ana ${round}`);
      game.act('ana', { t: 'choose', choiceId: game.truthOptionId() });
      game.act('beto', { t: 'choose', choiceId: anaLie });
      game.act('cami', { t: 'choose', choiceId: anaLie });
    }
    game.runTo('done', 40);

    const finale = game.state.finale;
    assert.ok(finale, 'la partida no terminó');
    assert.equal(finale.standings[0]!.playerId, 'ana');
    assert.ok(finale.medals.some((m) => m.id === 'mentiroso'));
    assert.ok(finale.medals.some((m) => m.id === 'sabueso'));
    assert.ok(game.effects.some((e) => e.t === 'finish'));
  });
});
