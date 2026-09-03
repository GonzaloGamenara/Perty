import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRng, type Effect, type GameEvent } from '@perty/engine';
import type { Player, PlayerAction } from '@perty/protocol';
import { bossGame, defaultBossConfig } from '../src/boss/index';
import { resolveMechanic, setupMechanic } from '../src/boss/mechanics';
import type { BossConfig, BossState } from '../src/boss/types';

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

function harness(players: Player[], overrides: Partial<BossConfig> = {}) {
  const rng = createRng(99);
  let now = 5_000_000;
  let timerAt: number | null = null;
  const config = { ...defaultBossConfig(), bossId: 'compilador', ...overrides };
  const ctx = () => ({ now, rng, players });
  const applied: Effect[] = [];

  const apply = (effects: Effect[] | undefined) => {
    for (const effect of effects ?? []) {
      applied.push(effect);
      if (effect.t === 'timer') timerAt = now + effect.delayMs;
      if (effect.t === 'cancelTimer') timerAt = null;
    }
  };

  let { state, effects } = bossGame.create(ctx(), config);
  apply(effects);

  const dispatch = (event: GameEvent) => {
    const result = bossGame.reduce(state, event, ctx());
    state = result.state;
    apply(result.effects);
  };

  return {
    get state(): BossState {
      return state;
    },
    get effects() {
      return applied;
    },
    act(playerId: string, action: PlayerAction) {
      dispatch({ t: 'player', playerId, action });
    },
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        if (timerAt === null) return;
        now = timerAt;
        timerAt = null;
        dispatch({ t: 'timer', key: 'phase' });
      }
    },
    runTo(kind: BossState['phase']['kind'], limit = 200) {
      for (let i = 0; i < limit && state.phase.kind !== kind; i++) this.tick();
      return state.phase.kind === kind;
    },
    advanceClock(ms: number) {
      now += ms;
    },
    correctId: () => state.correctChoiceId,
    wrongId: () => state.choices.find((c) => c.id !== state.correctChoiceId)!.id,
    /** Todos contestan bien y se resuelve la ronda. */
    everyoneRight(delayMs = 1200) {
      this.advanceClock(delayMs);
      for (const player of players) this.act(player.id, { t: 'choose', choiceId: state.correctChoiceId });
    },
    everyoneWrong(delayMs = 1200) {
      this.advanceClock(delayMs);
      const wrong = state.choices.find((c) => c.id !== state.correctChoiceId)!.id;
      for (const player of players) this.act(player.id, { t: 'choose', choiceId: wrong });
    },
  };
}

describe('jefe · daño', () => {
  it('acertar le baja la vida y errar no', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    assert.ok(game.runTo('question'), 'no llegó a la primera pregunta');
    const full = game.state.maxHp;

    game.everyoneRight();
    assert.equal(game.state.phase.kind, 'reveal');
    assert.ok(game.state.hp < full, 'le acertaron y no perdió vida');
    assert.ok(game.state.roundDamage > 0);

    const afterHit = game.state.hp;
    assert.ok(game.runTo('question'));
    game.everyoneWrong();
    assert.equal(game.state.hp, afterHit, 'fallaron y igual le hicieron daño');
  });

  it('el combo del grupo multiplica el daño de la ronda', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('question');
    game.everyoneRight(1000);
    const first = game.state.roundDamage;

    // Tres rondas más acertando: el combo tiene que estar pagando más.
    for (let i = 0; i < 3; i++) {
      assert.ok(game.runTo('question'), `no llegó a la ronda ${i + 2}`);
      game.everyoneRight(1000);
    }
    assert.ok(game.state.combo >= 3, `combo bajo: ${game.state.combo}`);
    assert.ok(
      game.state.roundDamage > first,
      `con combo ${game.state.combo} pegó ${game.state.roundDamage}, sin combo ${first}`,
    );
  });

  it('fallar carga el ataque hasta que el jefe golpea', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('question');
    game.everyoneWrong();
    const charged = game.state.charge;
    assert.ok(charged > 0, 'errar no cargó nada');

    assert.ok(game.runTo('telegraph', 60), 'el jefe nunca atacó');
    assert.equal(game.state.combo, 0);
  });
});

describe('jefe · vidas compartidas', () => {
  it('perder una mecánica cuesta un corazón', () => {
    const game = harness(makePlayers(['ana', 'beto']));
    game.runTo('question');
    game.everyoneWrong();
    assert.ok(game.runTo('mechanicResult', 80), 'no se resolvió ninguna mecánica');

    assert.equal(game.state.mechanicOutcome?.survived, false, 'nadie hizo nada y sobrevivieron');
    assert.equal(game.state.hearts, 2);
    assert.equal(game.state.charge, 0, 'la carga no se reseteó después del ataque');
  });

  it('sin corazones se pierde la partida', () => {
    const game = harness(makePlayers(['ana', 'beto']), { hearts: 1 });
    game.runTo('question');
    game.everyoneWrong();
    assert.ok(game.runTo('finale', 120), 'la partida no terminó');
    assert.equal(game.state.result, 'lose');

    game.tick(); // el finale se muestra un rato y recién ahí cierra
    const finish = game.effects.find((e) => e.t === 'finish');
    assert.ok(finish, 'no se emitió el fin de juego');
    assert.match(finish.headline ?? '', /hizo puré/);
  });
});

describe('jefe · victoria', () => {
  it('bajarle la vida a cero gana y reparte medallas', () => {
    const game = harness(makePlayers(['ana', 'beto', 'cami']));
    for (let round = 0; round < 14; round++) {
      if (!game.runTo('question', 40)) break;
      game.everyoneRight(600);
      if (game.state.hp <= 0) break;
    }
    assert.ok(game.runTo('finale', 60), 'nunca llegó al final');
    assert.equal(game.state.result, 'win', `terminó con ${game.state.hp} de vida`);

    game.tick();
    const finish = game.effects.find((e) => e.t === 'finish');
    assert.ok(finish);
    assert.match(finish.headline ?? '', /Derrotaron a/);
    assert.equal(finish.standings.length, 3);
    assert.ok(finish.medals.some((m) => m.id === 'espada'));
  });
});

describe('mecánicas', () => {
  const players = makePlayers(['ana', 'beto', 'cami']);
  const question = {
    question: {
      id: 'q',
      category: 'cultura',
      difficulty: 1 as const,
      text: '¿?',
      options: ['a', 'b', 'c', 'd'] as [string, string, string, string],
    },
    choices: [
      { id: 'c0', label: 'a', slot: 0 },
      { id: 'c1', label: 'b', slot: 1 },
      { id: 'c2', label: 'c', slot: 2 },
      { id: 'c3', label: 'd', slot: 3 },
    ],
    correctChoiceId: 'c0',
  };

  it('el escudo aguanta si nadie repite runa', () => {
    const state = setupMechanic('escudo', createRng(7), 0, players, question);
    assert.equal(state.kind, 'escudo');
    if (state.kind !== 'escudo') return;

    // Cada uno se queda con su runa "propia": es una solución válida.
    const picks = Object.fromEntries(
      players.map((p, index) => [p.id, state.runes[index % state.runes.length]!.id]),
    );
    assert.equal(resolveMechanic({ ...state, picks }, players).survived, true);

    const same = state.runes[0]!.id;
    const clash = Object.fromEntries(players.map((p) => [p.id, same]));
    assert.equal(resolveMechanic({ ...state, picks: clash }, players).survived, false);
  });

  it('cada mano tiene una runa propia, así siempre hay salida', () => {
    const state = setupMechanic('escudo', createRng(3), 0, players, question);
    if (state.kind !== 'escudo') return assert.fail('no armó el escudo');
    for (const player of players) {
      assert.equal(state.hands[player.id]?.length, 2, `${player.name} no recibió 2 runas`);
    }
    const covered = new Set(Object.values(state.hands).flat());
    assert.equal(covered.size, state.runes.length, 'hay runas que nadie puede elegir');
  });

  it('la marca la salva la mayoría de los no marcados', () => {
    const state = setupMechanic('marca', createRng(11), 0, players, question);
    if (state.kind !== 'marca') return assert.fail('no armó la marca');
    const others = players.filter((p) => p.id !== state.markedId);

    const allRight = Object.fromEntries(others.map((p) => [p.id, 'c0']));
    assert.equal(resolveMechanic({ ...state, answers: allRight }, players).survived, true);

    const allWrong = Object.fromEntries(others.map((p) => [p.id, 'c3']));
    assert.equal(resolveMechanic({ ...state, answers: allWrong }, players).survived, false);
  });

  it('el barrido se gana llegando al total entre todos', () => {
    const state = setupMechanic('barrido', createRng(5), 0, players, question);
    if (state.kind !== 'barrido') return assert.fail('no armó el barrido');

    const enough = { ana: state.target, beto: 0, cami: 0 };
    assert.equal(resolveMechanic({ ...state, taps: enough }, players).survived, true);
    assert.equal(resolveMechanic({ ...state, taps: { ana: 1 } }, players).survived, false);
  });
});
