/**
 * Bots por socket, para probar sin juntar a nadie:
 *
 *   npm run bots -- ABCD 3
 *
 * Se conectan como celulares de verdad, así que además de probar los juegos
 * prueban la red. Para llenar la mesa rápido está el botón del lobby, que usa
 * bots dentro del server y no necesita este comando.
 */
import { io, type Socket } from 'socket.io-client';
import { EV, type PlayerFrame } from '@perty/protocol';
import { decide, makeBrain, viewKey, type Brain } from './bot-brain';

const [, , codeArg, countArg, urlArg] = process.argv;
const code = codeArg?.toUpperCase();
const count = Math.min(7, Math.max(1, Number(countArg ?? 3)));
const url = urlArg ?? `http://localhost:${process.env.PORT ?? 3000}`;

if (!code) {
  console.error('uso: npm run bots -- <CODIGO> [cantidad] [url]');
  process.exit(1);
}

function spawn(brain: Brain): Socket {
  const socket = io(url, { transports: ['websocket', 'polling'] });
  let handled = '';
  let mash: NodeJS.Timeout | null = null;

  socket.on('connect', () => {
    socket.emit(EV.playerJoin, { code, name: brain.name, bot: true }, (ack: { ok: boolean; error?: string }) => {
      if (!ack?.ok) {
        console.error(`✗ ${brain.name}: ${ack?.error}`);
        socket.close();
      } else {
        console.log(`✓ ${brain.name} entró`);
      }
    });
  });

  socket.on(EV.playerFrame, (frame: PlayerFrame) => {
    const key = viewKey(frame.view);
    if (key === handled) return;
    handled = key;

    if (mash) {
      clearInterval(mash);
      mash = null;
    }

    const plan = decide(frame.view, brain);
    if (!plan) return;

    if (plan.kind === 'once') {
      setTimeout(() => socket.emit(EV.playerAction, plan.action), plan.delayMs);
      return;
    }

    mash = setInterval(() => socket.emit(EV.playerAction, { t: 'tap' }), plan.intervalMs);
    const running = mash;
    setTimeout(() => clearInterval(running), plan.durationMs);
  });

  return socket;
}

const sockets = Array.from({ length: count }, (_, index) => spawn(makeBrain(index)));

process.on('SIGINT', () => {
  for (const socket of sockets) socket.close();
  process.exit(0);
});
