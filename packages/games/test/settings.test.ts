import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SettingValues } from '@perty/protocol';
import { CATEGORIES } from '../src/trivia/categories';
import { triviaGame } from '../src/trivia/index';
import { bossGame } from '../src/boss/index';
import { liarGame } from '../src/liar/index';
import { priceGame } from '../src/price/index';

/**
 * Lo que llega a `configure` viene de un cliente: puede venir cualquier cosa.
 * Estos tests fijan que nunca se cuele un valor fuera de la lista declarada.
 */

const ALL_CATEGORIES = CATEGORIES.map((c) => c.id);

describe('perillas · trivia', () => {
  it('aplica lo que se eligió en el lobby', () => {
    const config = triviaGame.configure!(
      { rondas: 20, tiempo: 'rapido', caos: 'mucho', categorias: ['anime', 'comida'] },
      4,
    );
    assert.equal(config.rounds, 20);
    assert.equal(config.answerMs, 12_000);
    assert.equal(config.chaosChance, 0.6);
    assert.deepEqual(config.categories, ['anime', 'comida']);
  });

  it('acepta números que llegan como texto por el socket', () => {
    const config = triviaGame.configure!({ rondas: '16' } as SettingValues, 4);
    assert.equal(config.rounds, 16);
  });

  it('ignora valores que no están en la lista', () => {
    const config = triviaGame.configure!(
      { rondas: 9999, tiempo: 'instantáneo', caos: 'apocalíptico' },
      4,
    );
    assert.equal(config.rounds, 12, 'dejó pasar una cantidad de rondas inventada');
    assert.equal(config.answerMs, 18_000);
    assert.equal(config.chaosChance, 0.38);
  });

  it('descarta categorías inexistentes y no deja jugar con menos de dos', () => {
    const colada = triviaGame.configure!({ categorias: ['anime', 'quimica-organica'] }, 4);
    assert.deepEqual(colada.categories, ALL_CATEGORIES, 'quedó una sola categoría válida');

    const dos = triviaGame.configure!({ categorias: ['anime', 'cine', 'inventada'] }, 4);
    assert.deepEqual(dos.categories, ['anime', 'cine']);
  });

  it('sobrevive a que no llegue nada', () => {
    const config = triviaGame.configure!({}, 4);
    assert.equal(config.rounds, 12);
    assert.deepEqual(config.categories, ALL_CATEGORIES);
  });

  it('con caos en cero nunca sale un modificador', () => {
    const config = triviaGame.configure!({ caos: 'nada' }, 4);
    assert.equal(config.chaosChance, 0);
  });
});

describe('perillas · jefe final', () => {
  it('"sorpresa" deja que lo elija el juego', () => {
    assert.equal(bossGame.configure!({ jefe: 'random' }, 4).bossId, null);
  });

  it('se puede pedir un jefe puntual', () => {
    assert.equal(bossGame.configure!({ jefe: 'dragon' }, 4).bossId, 'dragon');
  });

  it('un jefe inventado cae en sorpresa', () => {
    assert.equal(bossGame.configure!({ jefe: 'godzilla' }, 4).bossId, null);
  });

  it('recorta vidas y rondas a los valores ofrecidos', () => {
    const config = bossGame.configure!({ vidas: 99, rondas: 3 }, 4);
    assert.equal(config.hearts, 3);
    assert.equal(config.maxRounds, 14);

    const brutal = bossGame.configure!({ vidas: 1, rondas: 20 }, 4);
    assert.equal(brutal.hearts, 1);
    assert.equal(brutal.maxRounds, 20);
  });
});

describe('perillas · mentiroso', () => {
  it('cambia rondas y tiempo de escritura', () => {
    const config = liarGame.configure!({ rondas: 12, escritura: 'tranqui' }, 4);
    assert.equal(config.rounds, 12);
    assert.equal(config.writeMs, 60_000);
  });

  it('ignora un tiempo de escritura absurdo', () => {
    assert.equal(liarGame.configure!({ escritura: '0' }, 4).writeMs, 40_000);
  });
});

describe('perillas · el precio justo', () => {
  it('la regla de la casa cambia si pasarse descalifica', () => {
    assert.equal(priceGame.configure!({ regla: 'sinpasarse' }, 4).noOvershoot, true);
    assert.equal(priceGame.configure!({ regla: 'libre' }, 4).noOvershoot, false);
    assert.equal(priceGame.configure!({ regla: 'a veces' }, 4).noOvershoot, false);
  });

  it('recorta rondas y tiempo', () => {
    const config = priceGame.configure!({ rondas: 14, tiempo: 'rapido' }, 4);
    assert.equal(config.rounds, 14);
    assert.equal(config.guessMs, 15_000);
    assert.equal(priceGame.configure!({ rondas: 7 }, 4).rounds, 10);
  });
});

describe('perillas · declaración', () => {
  it('todos los juegos declaran perillas con defaults válidos', () => {
    for (const game of [triviaGame, bossGame, liarGame, priceGame]) {
      const specs = game.info.settings ?? [];
      assert.ok(specs.length > 0, `${game.info.name} no declara ninguna perilla`);

      const ids = new Set<string>();
      for (const spec of specs) {
        assert.ok(!ids.has(spec.id), `${game.info.name} repite la perilla ${spec.id}`);
        ids.add(spec.id);
        assert.ok(spec.options.length >= 2, `${spec.id} tiene menos de dos opciones`);

        if (spec.kind === 'choice') {
          const values = spec.options.map((o) => String(o.value));
          assert.ok(
            values.includes(String(spec.default)),
            `el default de ${spec.id} no está entre sus opciones`,
          );
        } else {
          const values = new Set(spec.options.map((o) => String(o.value)));
          for (const value of spec.default) {
            assert.ok(values.has(value), `el default de ${spec.id} incluye "${value}", que no existe`);
          }
          assert.ok(
            spec.default.length >= (spec.min ?? 1),
            `el default de ${spec.id} no llega al mínimo`,
          );
        }
      }
    }
  });

  it('configurar con los defaults declarados da una config usable', () => {
    for (const game of [triviaGame, bossGame, liarGame, priceGame]) {
      const defaults: SettingValues = Object.fromEntries(
        (game.info.settings ?? []).map((spec) => [spec.id, spec.default]),
      );
      const config = game.configure!(defaults, 4) as unknown as Record<string, unknown>;
      assert.ok(
        typeof config.rounds === 'number' || typeof config.maxRounds === 'number',
        `${game.info.name} no devolvió una config con rondas`,
      );
    }
  });
});
