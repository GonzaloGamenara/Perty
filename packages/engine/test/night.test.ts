import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Medal, Player, Standing } from '@perty/protocol';
import {
  applyResults,
  boardEntries,
  createNight,
  defaultNightConfig,
  maxSteps,
  nightMedals,
  nightStandings,
  rollEvent,
  type NightState,
} from '../src/night';
import { createRng } from '../src/rng';

function makePlayers(names: string[]): Player[] {
  return names.map((name) => ({
    id: name,
    name,
    color: '#fff',
    emoji: '🐙',
    connected: true,
    isVip: false,
  }));
}

const players = makePlayers(['ana', 'beto', 'cami', 'dani']);

function standings(order: string[]): Standing[] {
  return order.map((playerId, index) => ({
    playerId,
    rank: index + 1,
    score: 100 - index,
    label: '',
  }));
}

function start(overrides: Partial<ReturnType<typeof defaultNightConfig>> = {}): NightState {
  return createNight(
    { ...defaultNightConfig(['trivia', 'liar', 'price']), ...overrides },
    players,
    0,
  );
}

const leg = { gameId: 'trivia', gameName: 'Trivia', emoji: '🧠' };

describe('la noche · pasos', () => {
  it('reparte según el puesto y nadie se queda en cero', () => {
    const night = applyResults(start(), leg, standings(['ana', 'beto', 'cami', 'dani']), []);
    assert.equal(night.steps['ana'], 4);
    assert.equal(night.steps['beto'], 3);
    assert.equal(night.steps['cami'], 2);
    assert.equal(night.steps['dani'], 1);
  });

  it('el último juego vale doble si está activado', () => {
    // Con tres juegos, el índice 2 es el último.
    const night = { ...start(), index: 2 };
    const scored = applyResults(night, leg, standings(['ana', 'beto']), []);
    assert.equal(scored.steps['ana'], 8, 'el último tenía que pagar doble');
    assert.equal(scored.steps['beto'], 6);
  });

  it('sin la regla del final, el último paga igual que el resto', () => {
    const night = { ...start({ doubleLast: false }), index: 2 };
    const scored = applyResults(night, leg, standings(['ana']), []);
    assert.equal(scored.steps['ana'], 4);
  });

  it('un evento de "todo o nada" duplica el juego siguiente', () => {
    const night = { ...start(), doubleNext: true };
    const scored = applyResults(night, leg, standings(['ana']), []);
    assert.equal(scored.steps['ana'], 8);
    assert.equal(scored.doubleNext, false, 'el doble se consume en un solo juego');
  });

  it('anota quién ganó cada juego', () => {
    const night = applyResults(start(), leg, standings(['beto', 'ana']), []);
    assert.deepEqual(night.history, [
      { gameId: 'trivia', gameName: 'Trivia', emoji: '🧠', winnerId: 'beto' },
    ]);
  });
});

describe('la noche · eventos', () => {
  const withSteps = (steps: Record<string, number>): NightState => ({
    ...start(),
    steps,
  });

  it('siempre le pega a alguien y deja constancia', () => {
    // Se prueban varias semillas: cualquiera de los eventos tiene que ser válido.
    for (let seed = 1; seed <= 25; seed++) {
      const before = withSteps({ ana: 10, beto: 7, cami: 4, dani: 1 });
      const after = rollEvent(before, players, createRng(seed));
      assert.equal(after.phase.kind, 'event', `semilla ${seed} no produjo evento`);
      if (after.phase.kind !== 'event') continue;

      for (const [id, value] of Object.entries(after.steps)) {
        assert.ok(value >= 0, `${id} quedó con pasos negativos`);
      }
      const total = Object.values(after.steps).reduce((sum, v) => sum + v, 0);
      assert.ok(total > 0, 'la mesa quedó en cero');
    }
  });

  it('el cambio de lugar da vuelta al primero con el último', () => {
    let found = false;
    for (let seed = 1; seed <= 80 && !found; seed++) {
      const before = withSteps({ ana: 10, beto: 7, cami: 4, dani: 1 });
      const after = rollEvent(before, players, createRng(seed));
      if (after.phase.kind !== 'event' || after.phase.event.id !== 'cambio') continue;
      found = true;
      assert.equal(after.steps['ana'], 1, 'el que iba primero tenía que quedar último');
      assert.equal(after.steps['dani'], 10, 'el que iba último tenía que quedar primero');
    }
    assert.ok(found, 'nunca salió el cambio de lugar en 80 tiradas');
  });

  it('el peaje solo castiga al que va ganando', () => {
    let found = false;
    for (let seed = 1; seed <= 80 && !found; seed++) {
      const before = withSteps({ ana: 10, beto: 7, cami: 4, dani: 1 });
      const after = rollEvent(before, players, createRng(seed));
      if (after.phase.kind !== 'event' || after.phase.event.id !== 'peaje') continue;
      found = true;
      assert.equal(after.steps['ana'], 7);
      assert.equal(after.steps['dani'], 1, 'no tenía que tocar al resto');
    }
    assert.ok(found, 'nunca salió el peaje en 80 tiradas');
  });
});

describe('la noche · resultado', () => {
  it('ordena por pasos y empata bien', () => {
    const night = { ...start(), steps: { ana: 9, beto: 9, cami: 3, dani: 0 } };
    const table = nightStandings(night, players);
    assert.equal(table[0]!.rank, 1);
    assert.equal(table[1]!.rank, 1, 'dos con los mismos pasos comparten puesto');
    assert.equal(table[2]!.rank, 3, 'después de dos empatados va el tercero');
    assert.equal(table[0]!.label, '9 pasos');
  });

  it('no repite la misma medalla para la misma persona', () => {
    const medal = (id: string, playerId: string): Medal => ({
      id,
      name: id,
      description: '',
      emoji: '🏅',
      playerId,
      detail: '',
    });
    const night: NightState = {
      ...start(),
      medals: [medal('bala', 'ana'), medal('bala', 'ana'), medal('bala', 'beto')],
    };
    const medals = nightMedals(night);
    assert.equal(medals.length, 2);
  });

  it('la pista deja lugar para todo lo que se puede ganar', () => {
    const night = { ...start(), steps: { ana: maxSteps(start().config) } };
    const entry = boardEntries(night, players).find((row) => row.playerId === 'ana')!;
    assert.ok(entry.progress <= 1, 'la ficha se pasó del final de la pista');
    assert.ok(entry.progress > 0.5, 'con el máximo debería estar bien avanzada');
  });
});
