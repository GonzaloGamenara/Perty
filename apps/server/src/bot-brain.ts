import { POLL_PROMPTS, PRICE_QUESTIONS, QUESTIONS } from '@perty/games';
import type { Choice, PlayerAction, PlayerView } from '@perty/protocol';

/**
 * Qué hace un bot frente a una vista. Es lo único que decide, y lo comparten
 * los dos caminos: el botón del lobby (bots dentro del server) y `npm run bots`
 * (bots por socket, para probar la red de verdad).
 *
 * Los bots hacen trampa: miran el banco de preguntas, que el server nunca les
 * manda. Son una herramienta para probar, no un rival.
 */

export interface Brain {
  name: string;
  /** Con qué probabilidad usa la respuesta correcta cuando puede saberla. */
  accuracy: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export const BOT_NAMES = [
  'Robo-Tito',
  'Botina',
  'Chip',
  'Nerd-9000',
  'La Máquina',
  'Byte',
  'Cacho.exe',
] as const;

/** Mentiras genéricas para Mentiroso. Absurdas a propósito: se nota quién es bot. */
const LIES = [
  'un tenedor',
  'una llave inglesa',
  'papas fritas',
  'el hermano de Napoleón',
  'una radio a transistores',
  'humo',
  'el año 1973',
  'un pingüino',
  'cuarenta y dos',
  'una fábrica de paraguas',
  'la abuela de Tesla',
  'un submarino amarillo',
  'queso rallado',
  'tres monedas',
  'un caballo llamado Pedro',
  'la letra Q',
  'una siesta muy larga',
  'chapa y pintura',
];

/**
 * Respuestas para Superlativos. Acá no hay nada que saber: alcanza con que
 * suenen a algo que escribiría alguien apurado y medio dormido.
 */
const QUIPS = [
  'mi tío',
  'un tupper sin tapa',
  'el olor a lavandina',
  'gritar y salir corriendo',
  'una factura de gas',
  'Ricardo',
  'el ruido del módem',
  'dos milanesas frías',
  'nada, justamente',
  'un currículum en Comic Sans',
  'la sopa',
  'perder el colectivo',
  'un pendrive con virus',
  'aplaudir en el momento equivocado',
  'el vecino del tercero',
  'una siesta de once horas',
  'medio limón',
  'llorar en el bondi',
  'la impresora',
  'un audio de siete minutos',
];

/**
 * Para Encuesta. La gracia del juego es coincidir, así que el pozo es chico a
 * propósito: con tres bots tirando de cuatro palabras, se arman rebaños solos.
 */
const HERD = ['perro', 'rojo', 'pizza', 'uno'];

export type BotPlan =
  | { kind: 'once'; delayMs: number; action: PlayerAction }
  | { kind: 'mash'; intervalMs: number; durationMs: number };

export function makeBrain(index: number): Brain {
  return {
    name: BOT_NAMES[index] ?? `Bot ${index + 1}`,
    accuracy: 0.45 + Math.random() * 0.4,
    minDelayMs: 800 + Math.random() * 1500,
    maxDelayMs: 3500 + Math.random() * 6000,
  };
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Una acción por vista distinta: evita responder mil veces al mismo frame. */
export function viewKey(view: PlayerView): string {
  const choices = 'choices' in view ? view.choices.map((c) => c.id).join() : '';
  const deadline = 'deadline' in view ? view.deadline : '';
  const prompt = 'prompt' in view ? view.prompt : '';
  return `${view.kind}:${choices}:${deadline}:${prompt}`;
}

/** En el banco la correcta va primera, así que con el texto alcanza. */
function correctChoiceFor(prompt: string | undefined, choices: Choice[]): Choice | null {
  if (!prompt) return null;
  const question = QUESTIONS.find((q) => q.text === prompt);
  if (!question) return null;
  return choices.find((c) => c.label === question.options[0]) ?? null;
}

/** Para El Precio Justo: tira cerca del número real, no cualquier cosa. */
function priceGuessFor(prompt: string, accuracy: number): string {
  const question = PRICE_QUESTIONS.find((q) => q.text === prompt);
  if (!question) return String(Math.floor(Math.random() * 2000) + 1);
  // Cuanto peor el bot, más lejos tira.
  const spread = (1 - accuracy) * 0.6;
  const noise = 1 + (Math.random() * 2 - 1) * spread;
  return String(Math.max(0, Math.round(question.answer * noise)));
}

export function decide(view: PlayerView, brain: Brain): BotPlan | null {
  const wait = brain.minDelayMs + Math.random() * (brain.maxDelayMs - brain.minDelayMs);

  if (view.kind === 'choices') {
    const smart = Math.random() < brain.accuracy ? correctChoiceFor(view.prompt, view.choices) : null;
    const choice = smart ?? pick(view.choices);
    if (!choice) return null;
    return { kind: 'once', delayMs: wait, action: { t: 'choose', choiceId: choice.id } };
  }

  if (view.kind === 'wager') {
    const options = view.options.filter((o) => !o.disabled);
    if (!options.length) return null;
    return {
      kind: 'once',
      delayMs: Math.min(wait, 2500),
      action: { t: 'wager', value: pick(options).value },
    };
  }

  if (view.kind === 'text') {
    // Mentiroso se reconoce por el hueco; Encuesta, mirando su banco. Lo que
    // queda es Superlativos, que no tiene respuesta que valga la pena adivinar.
    const text = view.numeric
      ? priceGuessFor(view.prompt, brain.accuracy)
      : view.prompt.includes('____')
        ? pick(LIES)
        : POLL_PROMPTS.some((p) => p.text === view.prompt)
          ? pick(HERD)
          : pick(QUIPS);
    return { kind: 'once', delayMs: Math.min(wait, 6000), action: { t: 'submitText', text } };
  }

  if (view.kind === 'buzzer' && view.armed && !view.pressed) {
    return { kind: 'once', delayMs: wait, action: { t: 'buzz' } };
  }

  if (view.kind === 'tapper') {
    return { kind: 'mash', intervalMs: 120, durationMs: 6000 };
  }

  return null;
}
