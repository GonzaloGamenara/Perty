import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRng, type Effect, type GameEvent } from '@perty/engine';
import type { Player, PlayerAction } from '@perty/protocol';
import { defaultQuipConfig, quipsGame, resolvePrompt } from '../src/quips/index';
import type { QuipConfig, QuipState } from '../src/quips/types';

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

function harness(players: Player[], overrides: Partial<QuipConfig> = {}) {
  const rng = createRng(909);
  let now = 3_000_000;
  let timerAt: number | null = null;
  const config = { ...defaultQuipConfig(), ...overrides };
  const ctx = () => ({ now, rng, players });
  const applied: Effect[] = [];

  const apply = (effects: Effect[] | undefined) => {
    for (const effect of effects ?? []) {
      applied.push(effect);
      if (effect.t === 'timer') timerAt = now + effect.delayMs;
      if (effect.t === 'cancelTimer') timerAt = null;
    }
  };

  let { state, effects } = quipsGame.create(ctx(), config);
  apply(effects);

  const dispatch = (event: GameEvent) => {
    const result = quipsGame.reduce(state, event, ctx());
    state = result.state;
    apply(result.effects);
  };

  return {
    get state(): QuipState {
      return state;
    },
    get effects() {
      return applied;
    },
    act(playerId: string, action: PlayerAction) {
      dispatch({ t: 'player', playerId, action });
    },
    playerView(playerId: string) {
      return quipsGame.playerView(state, playerId, { now, players });
    },
    hostView() {
      return quipsGame.hostView(state, { now, players });
    },
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        if (timerAt === null) return;
        now = timerAt;
        timerAt = null;
        dispatch({ t: 'timer', key: 'phase' });
      }
    },
    runTo(kind: QuipState['phase']['kind'], limit = 200) {
      for (let i = 0; i < limit && state.phase.kind !== kind; i++) this.tick();
      return state.phase.kind === kind;
    },
    /** Todos escriben algo distinto, así que quedan tantas opciones como gente. */
    everyoneWrites() {
      for (const player of players) this.act(player.id, { t: 'submitText', text: `resp ${player.id}` });
    },
    optionOf(playerId: string) {
      return state.options.find((o) => o.authors.includes(playerId))!.id;
    },
  };
}

const FOUR = makePlayers(['ana', 'beto', 'cami', 'dani']);

describe('superlativos · escritura', () => {
  it('en cuanto escriben todos pasa a votar sin esperar el reloj', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.everyoneWrites();
    assert.equal(h.state.phase.kind, 'vote');
    assert.equal(h.state.options.length, 4);
  });

  it('no se puede reescribir una respuesta ya mandada', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.act('ana', { t: 'submitText', text: 'primera' });
    h.act('ana', { t: 'submitText', text: 'segunda' });
    assert.equal(h.state.answers['ana'], 'primera');
  });

  it('una respuesta vacía no cuenta', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.act('ana', { t: 'submitText', text: '   ' });
    assert.equal(h.state.answers['ana'], undefined);
  });

  it('dos respuestas iguales comparten una sola opción', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.act('ana', { t: 'submitText', text: 'La Sopa' });
    h.act('beto', { t: 'submitText', text: 'la sopa' });
    h.act('cami', { t: 'submitText', text: 'otra cosa' });
    h.act('dani', { t: 'submitText', text: 'y otra' });
    assert.equal(h.state.options.length, 3);
    const shared = h.state.options.find((o) => o.authors.length === 2);
    assert.deepEqual(shared?.authors, ['ana', 'beto']);
  });
});

describe('superlativos · votación', () => {
  it('nadie ve ni puede votar su propia respuesta', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.everyoneWrites();

    const view = h.playerView('ana');
    assert.equal(view.kind, 'choices');
    assert.equal(view.kind === 'choices' && view.choices.length, 3);

    const mine = h.optionOf('ana');
    h.act('ana', { t: 'choose', choiceId: mine });
    assert.equal(h.state.votes['ana'], undefined);
  });

  it('cada voto paga y llevarse todos paga extra', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.everyoneWrites();

    const target = h.optionOf('ana');
    for (const id of ['beto', 'cami', 'dani']) h.act(id, { t: 'choose', choiceId: target });
    h.act('ana', { t: 'choose', choiceId: h.optionOf('beto') });

    assert.equal(h.state.phase.kind, 'reveal');
    const ana = h.state.outcomes.find((o) => o.playerId === 'ana')!;
    assert.equal(ana.voters.length, 3);
    assert.equal(ana.sweep, true);
    assert.equal(ana.win, true);
    // 3 votos x 1000 + 1500 de bonus.
    assert.equal(ana.points, 4500);

    // Beto se llevó el voto de Ana, pero no arrasó: quedaban otros dos votantes.
    const beto = h.state.outcomes.find((o) => o.playerId === 'beto')!;
    assert.equal(beto.points, 1000);
    assert.equal(beto.sweep, false);
  });

  it('el que no escribió vota igual y queda marcado en blanco', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    for (const id of ['ana', 'beto', 'cami']) h.act(id, { t: 'submitText', text: `resp ${id}` });
    h.tick(); // se acaba el tiempo con dani sin escribir

    assert.equal(h.state.phase.kind, 'vote');
    assert.equal(h.state.stats['dani']!.blanks, 1);

    const view = h.playerView('dani');
    assert.equal(view.kind, 'choices');
    assert.equal(view.kind === 'choices' && view.choices.length, 3);

    h.act('dani', { t: 'choose', choiceId: h.optionOf('ana') });
    assert.equal(h.state.votes['dani'], h.optionOf('ana'));
  });

  it('escribir y no recibir un solo voto cuenta como grillos', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.everyoneWrites();

    const target = h.optionOf('ana');
    for (const id of ['beto', 'cami', 'dani']) h.act(id, { t: 'choose', choiceId: target });
    h.act('ana', { t: 'choose', choiceId: h.optionOf('beto') });

    assert.equal(h.state.stats['cami']!.zeroes, 1);
    assert.equal(h.state.stats['ana']!.zeroes, 0);
  });

  it('si solo escribió uno no hay nada que votar', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.act('ana', { t: 'submitText', text: 'sola' });
    h.tick();
    assert.equal(h.state.phase.kind, 'reveal');
    assert.equal(h.state.outcomes.find((o) => o.playerId === 'ana')!.points, 0);
  });
});

describe('superlativos · consignas personales', () => {
  it('reemplaza el hueco por el nombre y deja el resto igual', () => {
    assert.equal(resolvePrompt('El apodo de {jugador}', 'Beto'), 'El apodo de Beto');
    assert.equal(resolvePrompt('Un mal nombre para un gato', 'Beto'), 'Un mal nombre para un gato');
    assert.equal(resolvePrompt('Lo de {jugador}', null), 'Lo de {jugador}');
  });

  it('el enunciado que sale por la tele nunca conserva el hueco', () => {
    const h = harness(FOUR, { tones: ['personal'], rounds: 6 });
    for (let round = 0; round < 3; round++) {
      assert.ok(h.runTo('write'));
      assert.ok(!h.state.text.includes('{jugador}'), h.state.text);
      assert.ok(h.state.subject !== null);
      assert.ok(FOUR.some((p) => h.state.text.includes(p.name)));
      h.everyoneWrites();
      assert.ok(h.runTo('intro'));
    }
  });

  it('el elegido responde su propia consigna', () => {
    const h = harness(FOUR, { tones: ['personal'] });
    assert.ok(h.runTo('write'));
    const subject = h.state.subject!;
    const view = h.playerView(subject);
    assert.equal(view.kind, 'text');
  });
});

describe('superlativos · partida completa', () => {
  it('termina con posiciones y medallas', () => {
    const h = harness(FOUR, { rounds: 3, standingsEvery: 99 });

    for (let round = 0; round < 3; round++) {
      assert.ok(h.runTo('write'));
      h.everyoneWrites();
      // Ana se lleva todo siempre: tiene que terminar primera.
      const target = h.optionOf('ana');
      for (const id of ['beto', 'cami', 'dani']) h.act(id, { t: 'choose', choiceId: target });
      h.act('ana', { t: 'choose', choiceId: h.optionOf('beto') });
      h.tick();
    }

    assert.equal(h.state.phase.kind, 'done');
    const finale = h.state.finale!;
    assert.equal(finale.standings[0]!.playerId, 'ana');
    assert.equal(finale.standings[0]!.score, 3 * 4500);

    const superlativo = finale.medals.find((m) => m.id === 'superlativo');
    assert.equal(superlativo?.playerId, 'ana');
    assert.equal(finale.medals.find((m) => m.id === 'arrasador')?.playerId, 'ana');
    assert.ok(finale.medals.some((m) => m.id === 'grillos'));

    const finish = h.effects.find((e) => e.t === 'finish');
    assert.ok(finish);
  });
});
