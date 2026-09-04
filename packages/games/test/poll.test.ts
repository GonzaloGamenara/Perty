import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRng, type Effect, type GameEvent } from '@perty/engine';
import type { Player, PlayerAction } from '@perty/protocol';
import { defaultPollConfig, pollGame } from '../src/poll/index';
import type { PollConfig, PollState } from '../src/poll/types';

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

function harness(players: Player[], overrides: Partial<PollConfig> = {}) {
  const rng = createRng(77);
  let now = 5_000_000;
  let timerAt: number | null = null;
  const config = { ...defaultPollConfig(), ...overrides };
  const ctx = () => ({ now, rng, players });
  const applied: Effect[] = [];

  const apply = (effects: Effect[] | undefined) => {
    for (const effect of effects ?? []) {
      applied.push(effect);
      if (effect.t === 'timer') timerAt = now + effect.delayMs;
      if (effect.t === 'cancelTimer') timerAt = null;
    }
  };

  let { state, effects } = pollGame.create(ctx(), config);
  apply(effects);

  const dispatch = (event: GameEvent) => {
    const result = pollGame.reduce(state, event, ctx());
    state = result.state;
    apply(result.effects);
  };

  return {
    get state(): PollState {
      return state;
    },
    get effects() {
      return applied;
    },
    act(playerId: string, action: PlayerAction) {
      dispatch({ t: 'player', playerId, action });
    },
    playerView(playerId: string) {
      return pollGame.playerView(state, playerId, { now, players });
    },
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        if (timerAt === null) return;
        now = timerAt;
        timerAt = null;
        dispatch({ t: 'timer', key: 'phase' });
      }
    },
    runTo(kind: PollState['phase']['kind'], limit = 200) {
      for (let i = 0; i < limit && state.phase.kind !== kind; i++) this.tick();
      return state.phase.kind === kind;
    },
    /** Manda una respuesta por jugador, en orden. */
    answer(texts: Record<string, string>) {
      for (const [playerId, text] of Object.entries(texts)) {
        this.act(playerId, { t: 'submitText', text });
      }
    },
    points(playerId: string) {
      return state.stats[playerId]!.points;
    },
  };
}

const FOUR = makePlayers(['ana', 'beto', 'cami', 'dani']);

describe('encuesta · rebaño', () => {
  it('la mayoría cobra por cabeza y el resto no cobra nada', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'vaca', beto: 'Vaca', cami: 'vaca', dani: 'cabra' });

    assert.equal(h.state.phase.kind, 'reveal');
    // Tres cabezas x 500.
    assert.equal(h.points('ana'), 1500);
    assert.equal(h.points('beto'), 1500);
    assert.equal(h.points('cami'), 1500);
    assert.equal(h.points('dani'), 0);
  });

  it('agrupa sin importar mayúsculas ni acentos', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'León', beto: 'leon', cami: 'LEÓN', dani: 'tigre' });
    assert.equal(h.state.groups.length, 2);
    assert.equal(h.state.groups[0]!.members.length, 3);
  });

  it('si dos grupos empatan la ronda no paga', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'perro', beto: 'perro', cami: 'gato', dani: 'gato' });
    assert.equal(h.state.winnerIds.length, 0);
    for (const id of ['ana', 'beto', 'cami', 'dani']) assert.equal(h.points(id), 0);
  });

  it('si nadie coincide con nadie tampoco paga', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'uno', beto: 'dos', cami: 'tres', dani: 'cuatro' });
    assert.equal(h.state.winnerIds.length, 0);
    assert.equal(h.points('ana'), 0);
  });

  it('coincidir todos paga el extra de unanimidad', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'rojo', beto: 'rojo', cami: 'rojo', dani: 'rojo' });
    assert.equal(h.state.unanimous, true);
    // 4 cabezas x 500 + 1000 de bonus.
    assert.equal(h.points('ana'), 3000);
    assert.equal(h.state.stats['ana']!.unanimous, 1);
  });

  it('el que no contestó queda en blanco y no cobra', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'sol', beto: 'sol', cami: 'sol' });
    h.tick();
    assert.equal(h.state.phase.kind, 'reveal');
    assert.equal(h.state.stats['dani']!.blanks, 1);
    assert.equal(h.points('dani'), 0);
    assert.equal(h.points('ana'), 1500);
    // Coincidieron los tres que contestaron, pero la mesa es de cuatro.
    assert.equal(h.state.unanimous, false);
  });
});

describe('encuesta · la vaca', () => {
  it('se la lleva el único que quedó solo', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'pan', beto: 'pan', cami: 'pan', dani: 'brioche' });
    assert.equal(h.state.cow, 'dani');
    assert.equal(h.state.cowMoved, 'dani');
    assert.equal(h.state.stats['dani']!.cows, 1);
  });

  it('con dos solitarios no se mueve: no hay un raro, hay dos', () => {
    const h = harness(FOUR);
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'pan', beto: 'pan', cami: 'tostada', dani: 'brioche' });
    assert.equal(h.state.cow, null);
    assert.equal(h.state.cowMoved, null);
  });

  it('cambia de manos y solo se cobra al final', () => {
    const h = harness(FOUR, { rounds: 2, standingsEvery: 99 });

    assert.ok(h.runTo('write'));
    h.answer({ ana: 'a', beto: 'a', cami: 'a', dani: 'raro' });
    assert.equal(h.state.cow, 'dani');
    // Todavía no se cobró: la vaca es amenaza, no castigo.
    assert.equal(h.points('dani'), 0);
    h.tick();

    assert.ok(h.runTo('write'));
    h.answer({ ana: 'raro', beto: 'b', cami: 'b', dani: 'b' });
    assert.equal(h.state.cow, 'ana');
    h.tick();

    assert.equal(h.state.phase.kind, 'done');
    // Ana cobró 1500 en la primera ronda y paga 2500 por la vaca.
    assert.equal(h.points('ana'), 1500 - 2500);
    assert.equal(h.points('dani'), 1500);
    assert.equal(h.state.finale!.medals.find((m) => m.id === 'vaca')?.playerId, 'ana');
  });

  it('apagada, nadie la agarra ni paga nada', () => {
    const h = harness(FOUR, { rounds: 1, cowPenalty: 0, standingsEvery: 99 });
    assert.ok(h.runTo('write'));
    h.answer({ ana: 'a', beto: 'a', cami: 'a', dani: 'raro' });
    assert.equal(h.state.cow, null);
    h.tick();
    assert.equal(h.state.phase.kind, 'done');
    assert.equal(h.points('dani'), 0);
    assert.ok(!h.state.finale!.medals.some((m) => m.id === 'vaca'));
  });
});

describe('encuesta · partida completa', () => {
  it('termina con posiciones y medallas', () => {
    const h = harness(FOUR, { rounds: 3, standingsEvery: 99 });

    for (let round = 0; round < 3; round++) {
      assert.ok(h.runTo('write'));
      h.answer({ ana: 'mismo', beto: 'mismo', cami: 'mismo', dani: `raro ${round}` });
      h.tick();
    }

    assert.equal(h.state.phase.kind, 'done');
    const finale = h.state.finale!;
    assert.equal(finale.standings[0]!.score, 4500);
    assert.equal(finale.standings[3]!.playerId, 'dani');

    assert.equal(finale.medals.find((m) => m.id === 'raro')?.playerId, 'dani');
    assert.equal(finale.medals.find((m) => m.id === 'vaca')?.playerId, 'dani');
    assert.ok(finale.medals.some((m) => m.id === 'rebano'));

    assert.ok(h.effects.find((e) => e.t === 'finish'));
  });
});
