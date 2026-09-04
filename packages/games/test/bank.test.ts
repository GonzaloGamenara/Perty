import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATEGORIES } from '../src/trivia/categories';
import { QUESTIONS } from '../src/trivia/questions';
import { LIAR_PROMPTS } from '../src/liar/prompts';
import { normalize } from '../src/liar/index';
import { QUIP_PROMPTS } from '../src/quips/prompts';

/**
 * Los bancos se editan a mano y crecen solos. Estos tests son el guardarraíl:
 * si alguien pega una pregunta con una opción repetida, un id duplicado o una
 * categoría que no existe, se entera acá y no en medio de una partida.
 */

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
/** Mínimo por categoría para que una noche entera no repita. */
const MIN_PER_CATEGORY = 30;

describe('banco de trivia', () => {
  it('no tiene ids repetidos', () => {
    const seen = new Set<string>();
    for (const question of QUESTIONS) {
      assert.ok(!seen.has(question.id), `id repetido: ${question.id}`);
      seen.add(question.id);
    }
  });

  it('usa categorías que existen', () => {
    for (const question of QUESTIONS) {
      assert.ok(
        CATEGORY_IDS.has(question.category),
        `${question.id} usa la categoría inexistente "${question.category}"`,
      );
    }
  });

  it('tiene cuatro opciones distintas y no vacías', () => {
    for (const question of QUESTIONS) {
      assert.equal(question.options.length, 4, `${question.id} no tiene 4 opciones`);
      for (const option of question.options) {
        assert.ok(option.trim().length > 0, `${question.id} tiene una opción vacía`);
      }
      const unique = new Set(question.options.map((o) => o.trim().toLowerCase()));
      assert.equal(unique.size, 4, `${question.id} repite una opción`);
    }
  });

  it('no repite el texto de una pregunta', () => {
    const seen = new Map<string, string>();
    for (const question of QUESTIONS) {
      const key = question.text.trim().toLowerCase();
      const previous = seen.get(key);
      assert.ok(!previous, `${question.id} repite el texto de ${previous}`);
      seen.set(key, question.id);
    }
  });

  it('tiene enunciados y dificultad razonables', () => {
    for (const question of QUESTIONS) {
      assert.ok(question.text.trim().length > 10, `${question.id} tiene un enunciado muy corto`);
      assert.ok(
        [1, 2, 3].includes(question.difficulty),
        `${question.id} tiene una dificultad rara: ${question.difficulty}`,
      );
    }
  });

  it('alcanza para una noche entera en todas las categorías', () => {
    for (const category of CATEGORIES) {
      const count = QUESTIONS.filter((q) => q.category === category.id).length;
      assert.ok(
        count >= MIN_PER_CATEGORY,
        `${category.name} tiene ${count} preguntas, hacen falta ${MIN_PER_CATEGORY}`,
      );
    }
  });

  it('reparte las dificultades', () => {
    for (const level of [1, 2, 3] as const) {
      const count = QUESTIONS.filter((q) => q.difficulty === level).length;
      assert.ok(count >= 30, `solo hay ${count} preguntas de dificultad ${level}`);
    }
  });
});

describe('banco de mentiroso', () => {
  it('no tiene ids repetidos ni consignas repetidas', () => {
    const ids = new Set<string>();
    const texts = new Set<string>();
    for (const prompt of LIAR_PROMPTS) {
      assert.ok(!ids.has(prompt.id), `id repetido: ${prompt.id}`);
      ids.add(prompt.id);
      const key = prompt.text.trim().toLowerCase();
      assert.ok(!texts.has(key), `${prompt.id} repite una consigna`);
      texts.add(key);
    }
  });

  it('todas tienen hueco, respuesta corta y categoría válida', () => {
    for (const prompt of LIAR_PROMPTS) {
      assert.ok(prompt.text.includes('____'), `${prompt.id} no tiene hueco`);
      assert.ok(normalize(prompt.answer).length > 0, `${prompt.id} no tiene respuesta`);
      assert.ok(
        prompt.answer.split(' ').length <= 8,
        `${prompt.id} tiene una respuesta demasiado larga para votarla`,
      );
      assert.ok(
        CATEGORY_IDS.has(prompt.category),
        `${prompt.id} usa la categoría inexistente "${prompt.category}"`,
      );
    }
  });

  it('las variantes de la respuesta no repiten la principal', () => {
    for (const prompt of LIAR_PROMPTS) {
      const main = normalize(prompt.answer);
      const variants = (prompt.also ?? []).map(normalize);
      for (const variant of variants) {
        assert.notEqual(variant, main, `${prompt.id} repite la respuesta en "also"`);
        assert.ok(variant.length > 0, `${prompt.id} tiene una variante vacía`);
      }
      assert.equal(new Set(variants).size, variants.length, `${prompt.id} repite una variante`);
    }
  });

  it('cubre todas las categorías', () => {
    for (const category of CATEGORIES) {
      const count = LIAR_PROMPTS.filter((p) => p.category === category.id).length;
      assert.ok(count >= 5, `${category.name} tiene ${count} consignas, hacen falta 5`);
    }
  });
});

describe('banco de superlativos', () => {
  const TONES = ['clasico', 'nerd', 'personal'] as const;

  it('no tiene ids repetidos', () => {
    const seen = new Set<string>();
    for (const prompt of QUIP_PROMPTS) {
      assert.ok(!seen.has(prompt.id), `id repetido: ${prompt.id}`);
      seen.add(prompt.id);
    }
  });

  it('no repite consignas', () => {
    const seen = new Set<string>();
    for (const prompt of QUIP_PROMPTS) {
      const key = normalize(prompt.text);
      assert.ok(key.length > 0, `${prompt.id} tiene el enunciado vacío`);
      assert.ok(!seen.has(key), `consigna repetida: ${prompt.id}`);
      seen.add(key);
    }
  });

  it('tiene consignas de sobra para cada tono', () => {
    for (const tone of TONES) {
      const count = QUIP_PROMPTS.filter((p) => p.tone === tone).length;
      assert.ok(count >= 30, `el tono ${tone} tiene ${count} consignas, hacen falta 30`);
    }
  });

  it('el hueco {jugador} es exclusivo del tono personal', () => {
    for (const prompt of QUIP_PROMPTS) {
      const hasSlot = prompt.text.includes('{jugador}');
      assert.equal(
        hasSlot,
        prompt.tone === 'personal',
        `${prompt.id}: solo las consignas personales llevan {jugador}`,
      );
    }
  });

  it('no usa el hueco de Mentiroso, que los bots leen como seña', () => {
    for (const prompt of QUIP_PROMPTS) {
      assert.ok(!prompt.text.includes('____'), `${prompt.id} usa ____, que es de Mentiroso`);
    }
  });
});
