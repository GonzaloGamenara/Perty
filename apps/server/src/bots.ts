/**
 * Bots para probar sin juntar a nadie.
 *
 *   npm run bots -- ABCD 3
 *
 * Se conectan como jugadores comunes, contestan con un delay y un acierto
 * aleatorios, y apuestan cuando toca. Sirven para ver mecánicas nuevas en la
 * tele sin esperar al fin de semana.
 */
import { io, type Socket } from 'socket.io-client';
import { QUESTIONS } from '@perty/games';
import { EV, type Choice, type PlayerFrame } from '@perty/protocol';

const [, , codeArg, countArg, urlArg] = process.argv;
const code = codeArg?.toUpperCase();
const count = Math.min(7, Math.max(1, Number(countArg ?? 3)));
const url = urlArg ?? `http://localhost:${process.env.PORT ?? 3000}`;

if (!code) {
  console.error('uso: npm run bots -- <CODIGO> [cantidad] [url]');
  process.exit(1);
}

/**
 * En el banco la opción correcta es siempre la primera, así que con el texto de
 * la pregunta alcanza. Si la ronda es "a ciegas" no hay texto y el bot va a dedo.
 */
function correctChoiceFor(prompt: string | undefined, choices: Choice[]): Choice | null {
  if (!prompt) return null;
  const question = QUESTIONS.find((q) => q.text === prompt);
  if (!question) return null;
  return choices.find((c) => c.label === question.options[0]) ?? null;
}

const NAMES = ['Robo-Tito', 'Botina', 'Chip', 'Nerd-9000', 'La Máquina', 'Byte', 'Cacho.exe'];

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

/** Cada bot tiene su personalidad: qué tan rápido y qué tan bueno es. */
interface Brain {
  name: string;
  accuracy: number;
  minDelayMs: number;
  maxDelayMs: number;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function spawn(brain: Brain): Socket {
  const socket = io(url, { transports: ['websocket', 'polling'] });
  let handled = '';

  socket.on('connect', () => {
    socket.emit(EV.playerJoin, { code, name: brain.name }, (ack: { ok: boolean; error?: string }) => {
      if (!ack?.ok) {
        console.error(`✗ ${brain.name}: ${ack?.error}`);
        socket.close();
      } else {
        console.log(`✓ ${brain.name} entró`);
      }
    });
  });

  socket.on(EV.playerFrame, (frame: PlayerFrame) => {
    const view = frame.view;
    // Una acción por vista: la clave evita responder mil veces al mismo frame.
    const key = `${view.kind}:${'choices' in view ? view.choices.map((c) => c.id).join() : ''}:${'deadline' in view ? view.deadline : ''}`;
    if (key === handled) return;
    handled = key;

    const wait = brain.minDelayMs + Math.random() * (brain.maxDelayMs - brain.minDelayMs);

    if (view.kind === 'choices') {
      setTimeout(() => {
        const random = view.choices[Math.floor(Math.random() * view.choices.length)];
        // El server nunca manda la respuesta correcta, así que el bot hace trampa
        // mirando el banco de preguntas. Es una herramienta de desarrollo, no un rival.
        const cheat = Math.random() < brain.accuracy ? correctChoiceFor(view.prompt, view.choices) : null;
        const pick = cheat ?? random;
        if (pick) socket.emit(EV.playerAction, { t: 'choose', choiceId: pick.id });
      }, wait);
    }

    if (view.kind === 'wager') {
      setTimeout(() => {
        const options = view.options.filter((o) => !o.disabled);
        const pick = options[Math.floor(Math.random() * options.length)];
        if (pick) socket.emit(EV.playerAction, { t: 'wager', value: pick.value });
      }, Math.min(wait, 2500));
    }

    if (view.kind === 'text') {
      // En El Precio Justo el campo es numérico: una mentira con letras no sirve.
      const answer = view.numeric
        ? String(Math.floor(Math.random() * 2000) + 1)
        : pick(LIES);
      setTimeout(
        () => socket.emit(EV.playerAction, { t: 'submitText', text: answer }),
        Math.min(wait, 6000),
      );
    }

    if (view.kind === 'tapper') {
      const id = setInterval(() => socket.emit(EV.playerAction, { t: 'tap' }), 120);
      setTimeout(() => clearInterval(id), 6000);
    }
  });

  return socket;
}

const sockets = Array.from({ length: count }, (_, index) =>
  spawn({
    name: NAMES[index] ?? `Bot ${index + 1}`,
    accuracy: 0.45 + Math.random() * 0.4,
    minDelayMs: 800 + Math.random() * 1500,
    maxDelayMs: 3500 + Math.random() * 6000,
  }),
);

process.on('SIGINT', () => {
  for (const socket of sockets) socket.close();
  process.exit(0);
});
