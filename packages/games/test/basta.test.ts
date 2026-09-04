import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRng, type Effect, type GameEvent } from '@perty/engine';
import type { Player, PlayerAction } from '@perty/protocol';
import { bastaGame, defaultBastaConfig, startsWithLetter } from '../src/basta/index';
import { BASTA_COLUMNS, BASTA_LETTERS } from '../src/basta/categories';
import type { BastaConfig, BastaHostView, BastaState } from '../src/basta/types';

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

function harness(players: Player[], overrides: Partial<BastaConfig> = {}) {
  const rng = createRng(1234);
  let now = 7_000_000;
  let timerAt: number | null = null;
  const config = { ...defaultBastaConfig(), ...overrides };
  const ctx = () => ({ now, rng, players });
  const applied: Effect[] = [];

  const apply = (effects: Effect[] | undefined) => {
    for (const effect of effects ?? []) {
      applied.push(effect);
      if (effect.t === 'timer') timerAt = now + effect.delayMs;
      if (effect.t === 'cancelTimer') timerAt = null;
    }
  };

  let { state, effects } = bastaGame.create(ctx(), config);
  apply(effects);

  const dispatch = (event: GameEvent) => {
    const result = bastaGame.reduce(state, event, ctx());
    state = result.state;
    apply(result.effects);
  };

  return {
    get state(): BastaState {
      return state;
    },
    get effects() {
      return applied;
    },
    act(playerId: string, action: PlayerAction) {
      dispatch({ t: 'player', playerId, action });
    },
    playerView(playerId: string) {
      return bastaGame.playerView(state, playerId, { now, players });
    },
    hostView(): BastaHostView {
      return bastaGame.hostView(state, { now, players }) as BastaHostView;
    },
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        if (timerAt === null) return;
        now = timerAt;
        timerAt = null;
        dispatch({ t: 'timer', key: 'phase' });
      }
    },
    runTo(kind: BastaState['phase']['kind'], limit = 200) {
      for (let i = 0; i < limit && state.phase.kind !== kind; i++) this.tick();
      return state.phase.kind === kind;
    },
    /** Llena la hoja entera de alguien con la letra de la ronda más un sufijo. */
    fill(playerId: string, suffix: string, stop = false) {
      const values = Object.fromEntries(
        state.columns.map((column) => [column.id, `${state.letter}${suffix}`]),
      );
      this.act(playerId, { t: 'submitForm', values, stop });
    },
    points(playerId: string) {
      return state.stats[playerId]!.points;
    },
  };
}

const FOUR = makePlayers(['ana', 'beto', 'cami', 'dani']);

describe('tutti frutti · la letra', () => {
  it('solo cuenta lo que empieza con la letra, sin importar acentos', () => {
    assert.equal(startsWithLetter('Águila', 'A'), true);
    assert.equal(startsWithLetter('avión', 'A'), true);
    assert.equal(startsWithLetter('Elefante', 'A'), false);
    assert.equal(startsWithLetter('   ', 'A'), false);
    assert.equal(startsWithLetter('', 'A'), false);
  });

  it('no repite letra mientras queden sin usar', () => {
    const h = harness(FOUR, { rounds: 6, columns: 4, standingsEvery: 99 });
    const seen: string[] = [];
    for (let round = 0; round < 6; round++) {
      assert.ok(h.runTo('write'));
      seen.push(h.state.letter);
      assert.ok(BASTA_LETTERS.includes(h.state.letter));
      h.tick();
    }
    assert.equal(new Set(seen).size, seen.length, `se repitió una letra: ${seen.join()}`);
  });

  it('sortea columnas distintas de la lista', () => {
    const h = harness(FOUR, { columns: 5 });
    assert.ok(h.runTo('write'));
    assert.equal(h.state.columns.length, 5);
    assert.equal(new Set(h.state.columns.map((c) => c.id)).size, 5);
    for (const column of h.state.columns) {
      assert.ok(BASTA_COLUMNS.some((c) => c.id === column.id));
    }
  });
});

describe('tutti frutti · puntaje', () => {
  it('lo único vale el doble que lo repetido, y lo que no arranca con la letra no vale', () => {
    const h = harness(FOUR, { columns: 2 });
    assert.ok(h.runTo('write'));
    const [uno, dos] = h.state.columns;
    const L = h.state.letter;

    h.act('ana', { t: 'submitForm', values: { [uno!.id]: `${L}rbol`, [dos!.id]: `${L}zul` } });
    h.act('beto', { t: 'submitForm', values: { [uno!.id]: `${L}rbol`, [dos!.id]: `${L}beja` } });
    // Cami escribe algo que no empieza con la letra de la ronda.
    const wrong = L === 'Z' ? 'Ave' : 'Zapallo';
    h.act('cami', { t: 'submitForm', values: { [uno!.id]: wrong, [dos!.id]: '' } });
    h.tick();

    assert.equal(h.state.phase.kind, 'reveal');
    // Ana: repetida (50) + única (100).
    assert.equal(h.points('ana'), 150);
    assert.equal(h.points('beto'), 150);
    assert.equal(h.points('cami'), 0);
    assert.equal(h.state.stats['cami']!.invalids, 2);
    assert.equal(h.state.stats['ana']!.uniques, 1);
    assert.equal(h.state.stats['ana']!.shareds, 1);
  });

  it('las mayúsculas y los acentos no hacen que dos respuestas sean distintas', () => {
    const h = harness(FOUR, { columns: 1 });
    assert.ok(h.runTo('write'));
    const col = h.state.columns[0]!.id;
    const L = h.state.letter;
    h.act('ana', { t: 'submitForm', values: { [col]: `${L}güila` } });
    h.act('beto', { t: 'submitForm', values: { [col]: `${L}GUILA` } });
    h.tick();
    assert.equal(h.points('ana'), 50);
    assert.equal(h.points('beto'), 50);
  });
});

describe('tutti frutti · el basta', () => {
  it('con la hoja llena corta la ronda para todos', () => {
    const h = harness(FOUR, { columns: 3 });
    assert.ok(h.runTo('write'));
    h.fill('beto', 'lgo');
    h.fill('ana', 'rbol', true);

    assert.equal(h.state.phase.kind, 'reveal');
    assert.equal(h.state.stopper, 'ana');
    assert.equal(h.state.stats['ana']!.stops, 1);
  });

  it('cuando todos llenaron la hoja no se espera al reloj', () => {
    const h = harness(FOUR, { columns: 2 });
    assert.ok(h.runTo('write'));
    for (const id of ['ana', 'beto', 'cami']) h.fill(id, id);
    assert.equal(h.state.phase.kind, 'write');

    h.fill('dani', 'dani');
    assert.equal(h.state.phase.kind, 'reveal');
    // Nadie cortó nada: terminaron. Por eso no hay bonus para nadie.
    assert.equal(h.state.stopper, null);
    assert.equal(h.points('dani'), 200);
  });

  it('con la hoja incompleta el basta se ignora y la ronda sigue', () => {
    const h = harness(FOUR, { columns: 3 });
    assert.ok(h.runTo('write'));
    const col = h.state.columns[0]!.id;
    h.act('ana', { t: 'submitForm', values: { [col]: `${h.state.letter}lgo` }, stop: true });

    assert.equal(h.state.phase.kind, 'write');
    assert.equal(h.state.stopper, null);
    // Lo que llegó a escribir igual quedó guardado.
    assert.equal(h.state.sheets['ana']![col], `${h.state.letter}lgo`);
  });

  it('lo tipeado antes del basta ajeno se cuenta igual', () => {
    const h = harness(FOUR, { columns: 2 });
    assert.ok(h.runTo('write'));
    const [uno, dos] = h.state.columns;
    const L = h.state.letter;

    h.act('beto', { t: 'submitForm', values: { [uno!.id]: `${L}bejorro`, [dos!.id]: '' } });
    h.fill('ana', 'rbol', true);

    assert.equal(h.state.phase.kind, 'reveal');
    // Beto no llegó a la segunda, pero la primera le cuenta.
    assert.equal(h.points('beto'), 100);
  });

  it('cortar con todo válido paga el extra; con algo mal, no', () => {
    const h = harness(FOUR, { columns: 2 });
    assert.ok(h.runTo('write'));
    const [uno, dos] = h.state.columns;
    const L = h.state.letter;
    const wrong = L === 'Z' ? 'Ave' : 'Zapallo';

    h.act('ana', { t: 'submitForm', values: { [uno!.id]: `${L}rbol`, [dos!.id]: wrong }, stop: true });
    assert.equal(h.state.phase.kind, 'reveal');
    assert.equal(h.state.stopper, 'ana');
    // Una válida (100) y una que no arranca con la letra: sin bonus.
    assert.equal(h.points('ana'), 100);
    assert.equal(h.state.stats['ana']!.perfects, 0);
  });
});

describe('tutti frutti · vistas', () => {
  it('la tele muestra cuántas van, nunca qué escribieron', () => {
    const h = harness(FOUR, { columns: 3 });
    assert.ok(h.runTo('write'));
    const col = h.state.columns[0]!.id;
    h.act('ana', { t: 'submitForm', values: { [col]: 'secreto' } });

    const view = h.hostView();
    assert.equal(view.kind, 'basta/write');
    const serialized = JSON.stringify(view);
    assert.ok(!serialized.includes('secreto'), 'la tele filtró una respuesta');
    if (view.kind === 'basta/write') {
      assert.equal(view.progress.find((p) => p.playerId === 'ana')!.filled, 1);
      assert.equal(view.progress.find((p) => p.playerId === 'beto')!.filled, 0);
    }
  });

  it('el celular recupera lo que ya había escrito', () => {
    const h = harness(FOUR, { columns: 3 });
    assert.ok(h.runTo('write'));
    const col = h.state.columns[0]!.id;
    h.act('ana', { t: 'submitForm', values: { [col]: 'Ave' } });

    const view = h.playerView('ana');
    assert.equal(view.kind, 'form');
    if (view.kind === 'form') {
      assert.equal(view.values?.[col], 'Ave');
      assert.equal(view.badge, h.state.letter);
      assert.equal(view.fields.length, 3);
    }
  });
});

describe('tutti frutti · partida completa', () => {
  it('termina con posiciones y medallas', () => {
    const h = harness(FOUR, { rounds: 3, columns: 3, standingsEvery: 99 });

    for (let round = 0; round < 3; round++) {
      assert.ok(h.runTo('write'));
      h.fill('ana', 'ana');
      h.fill('beto', 'beto');
      // Cami y Dani copian: van a compartir siempre.
      h.fill('cami', 'igual');
      h.fill('dani', 'igual');
      // Con las cuatro hojas llenas la ronda se cierra sola, sin esperar reloj.
      assert.equal(h.state.phase.kind, 'reveal');
      h.tick();
    }

    assert.equal(h.state.phase.kind, 'done');
    const finale = h.state.finale!;
    // Ana y Beto: 3 columnas únicas x 100 x 3 rondas.
    assert.equal(finale.standings[0]!.score, 900);
    assert.equal(h.points('cami'), 450);

    assert.ok(finale.medals.some((m) => m.id === 'original'));
    assert.equal(finale.medals.find((m) => m.id === 'obvio')?.playerId, 'cami');
    assert.ok(h.effects.find((e) => e.t === 'finish'));
  });
});
