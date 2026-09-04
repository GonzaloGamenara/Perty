import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { Server, type Socket } from 'socket.io';
import { createRegistry } from '@perty/games';
import type { Room } from '@perty/engine';
import {
  EV,
  type ErrorAck,
  type HostCreateAck,
  type PlayerJoinAck,
  type SettingValues,
} from '@perty/protocol';
import { BotDriver } from './bot-driver';
import { joinUrl, lanAddress, originFromHeaders, readNetConfig } from './net';
import { RoomStore } from './rooms';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const config = readNetConfig();
const registry = createRegistry();

const app = express();
const http = createServer(app);
const io = new Server(http, {
  cors: { origin: true, credentials: true },
  // Los celulares se bloquean y vuelven: damos margen antes de darlos por muertos.
  pingTimeout: 25_000,
  connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
});

// ---------------------------------------------------------------------------
// Difusión de frames
// ---------------------------------------------------------------------------

const bots = new BotDriver();
const dirty = new Set<Room>();
let flushScheduled = false;

/** Varios cambios en el mismo tick se mandan como un solo frame. */
function markDirty(room: Room): void {
  dirty.add(room);
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(() => {
    flushScheduled = false;
    const pending = [...dirty];
    dirty.clear();
    for (const room of pending) pushFrames(room);
  });
}

function pushFrames(room: Room): void {
  const serverNow = Date.now();
  const snapshot = room.snapshot();

  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit(EV.hostFrame, {
      serverNow,
      room: snapshot,
      game: room.hostGameView(),
    });
  }
  for (const player of room.players) {
    const view = room.playerGameView(player.id);

    if (player.isBot) {
      bots.handle(room, player.id, view);
      continue;
    }

    const socketId = room.socketIdOf(player.id);
    if (!socketId) continue;
    io.to(socketId).emit(EV.playerFrame, {
      serverNow,
      room: snapshot,
      me: player,
      view,
      hud: room.playerHud(player.id),
    });
  }
}

const store = new RoomStore(
  {
    onChange: (room) => markDirty(room),
    onSfx: (room, name) => {
      // El audio vive en la tele: los celulares no suenan.
      if (room.hostSocketId) io.to(room.hostSocketId).emit(EV.sfx, name);
    },
    onTakeover: (_room, socketId) => {
      io.to(socketId).emit(EV.playerKicked, 'Entraste desde otro lado');
    },
  },
  (code, origin) => joinUrl(config, code, origin),
);

store.onClose = (room) => bots.forgetRoom(room);

// ---------------------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------------------

interface SessionData {
  code?: string;
  role?: 'host' | 'player';
  playerId?: string;
}

const fail = (message: string): ErrorAck => ({ ok: false, error: message });

function reply<T>(ack: unknown, value: T | ErrorAck): void {
  if (typeof ack === 'function') (ack as (v: unknown) => void)(value);
}

function session(socket: Socket): SessionData {
  return socket.data as SessionData;
}

function roomOf(socket: Socket): Room | null {
  return store.get(session(socket).code);
}

io.on('connection', (socket) => {
  socket.data = {} as SessionData;

  // -- tele ------------------------------------------------------------------

  socket.on(EV.hostCreate, (_payload: unknown, ack: unknown) => {
    // El QR sale de la URL por la que entró esta tele, no de una variable.
    const room = store.create(originFromHeaders(socket.handshake.headers));
    room.setCatalog(registry.catalog());
    room.hostSocketId = socket.id;
    Object.assign(session(socket), { code: room.code, role: 'host' });
    reply<HostCreateAck>(ack, {
      ok: true,
      code: room.code,
      hostToken: room.hostToken,
      games: registry.catalog(),
    });
    markDirty(room);
  });

  socket.on(EV.hostResume, (payload: { code?: string; hostToken?: string }, ack: unknown) => {
    const room = store.get(payload?.code);
    if (!room || room.hostToken !== payload?.hostToken) return reply(ack, fail('Sala no encontrada'));
    room.hostSocketId = socket.id;
    room.setCatalog(registry.catalog());
    store.refreshJoinUrl(room, originFromHeaders(socket.handshake.headers));
    Object.assign(session(socket), { code: room.code, role: 'host' });
    reply<HostCreateAck>(ack, {
      ok: true,
      code: room.code,
      hostToken: room.hostToken,
      games: registry.catalog(),
    });
    markDirty(room);
  });

  socket.on(
    EV.hostStart,
    (payload: { gameId?: string; settings?: SettingValues }, ack: unknown) => {
      const room = roomOf(socket);
      if (!room || session(socket).role !== 'host') return reply(ack, fail('No sos el host'));
      const module = registry.get(payload?.gameId ?? '');
      if (!module) return reply(ack, fail('Ese juego no existe'));
      const error = room.startGame(module, payload?.settings);
      if (error) return reply(ack, fail(error.error));
      reply(ack, { ok: true });
    },
  );

  socket.on(EV.hostAction, (payload: { t?: string }) => {
    const room = roomOf(socket);
    if (!room || session(socket).role !== 'host') return;
    if (payload?.t === 'advance' || payload?.t === 'skip' || payload?.t === 'endGame') {
      room.hostAction({ t: payload.t });
    }
  });

  socket.on(EV.hostReturnToLobby, () => {
    const room = roomOf(socket);
    if (room && session(socket).role === 'host') room.returnToLobby();
  });

  socket.on(EV.hostAddBot, (_payload: unknown, ack: unknown) => {
    const room = roomOf(socket);
    if (!room || session(socket).role !== 'host') return reply(ack, fail('No sos el host'));
    const result = bots.add(room);
    if ('error' in result) return reply(ack, fail(result.error));
    reply(ack, { ok: true });
  });

  socket.on(EV.hostRemoveBots, (_payload: unknown, ack: unknown) => {
    const room = roomOf(socket);
    if (!room || session(socket).role !== 'host') return reply(ack, fail('No sos el host'));
    bots.removeAll(room);
    reply(ack, { ok: true });
  });

  // -- celulares -------------------------------------------------------------

  socket.on(EV.playerJoin, (payload: { code?: string; name?: string }, ack: unknown) => {
    const room = store.get(payload?.code);
    if (!room) return reply(ack, fail('No existe esa sala'));
    // Se puede entrar con la partida empezada: arrancás con 0 monedas.
    const result = room.addPlayer(String(payload?.name ?? ''));
    if ('error' in result) return reply(ack, fail(result.error));

    room.attachSocket(result.player.id, socket.id);
    Object.assign(session(socket), { code: room.code, role: 'player', playerId: result.player.id });
    reply<PlayerJoinAck>(ack, {
      ok: true,
      playerId: result.player.id,
      token: result.token,
      code: room.code,
    });
  });

  socket.on(
    EV.playerResume,
    (payload: { code?: string; playerId?: string; token?: string }, ack: unknown) => {
      const room = store.get(payload?.code);
      if (!room || !payload?.playerId || !payload?.token) return reply(ack, fail('Sesión vencida'));
      if (!room.authenticate(payload.playerId, payload.token)) return reply(ack, fail('Sesión vencida'));
      room.attachSocket(payload.playerId, socket.id);
      Object.assign(session(socket), {
        code: room.code,
        role: 'player',
        playerId: payload.playerId,
      });
      reply<PlayerJoinAck>(ack, {
        ok: true,
        playerId: payload.playerId,
        token: payload.token,
        code: room.code,
      });
    },
  );

  socket.on(EV.playerAction, (payload: unknown) => {
    const room = roomOf(socket);
    const playerId = session(socket).playerId;
    if (!room || !playerId) return;
    const action = payload as { t?: string };
    if (!action?.t) return;

    // El armado se maneja desde el celular del VIP: a la tele no se le hace clic.
    if (room.phase === 'lobby' || room.phase === 'results') {
      if (!room.isVip(playerId)) return;
      const lobby = action as { t: string; gameId?: string; id?: string; value?: unknown };

      if (lobby.t === 'selectGame') return room.selectGame(String(lobby.gameId ?? ''));
      if (lobby.t === 'setSetting') {
        return room.setSetting(String(lobby.id ?? ''), lobby.value as never);
      }
      if (lobby.t === 'addBot') {
        bots.add(room);
        return;
      }
      if (lobby.t === 'removeBots') {
        bots.removeAll(room);
        return;
      }
      if (lobby.t === 'startGame') {
        const chosen = room.chosen;
        const module = registry.get(chosen.gameId ?? '');
        if (module) room.startGame(module, chosen.settings);
        return;
      }
      return;
    }

    room.playerAction(playerId, action as never);
  });

  socket.on('disconnect', () => {
    const room = roomOf(socket);
    room?.detachSocket(socket.id);
  });
});

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * Diagnóstico para abrir en la tele antes de la junta: dice si ese navegador
 * puede correr el juego. Va en HTML plano para que cargue hasta en un Tizen viejo.
 */
app.get('/check', (_req: Request, res: Response) => {
  res.sendFile(path.join(here, '../public/check.html'));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: store.size, games: registry.catalog().length });
});

app.get('/api/games', (_req, res) => {
  res.json(registry.catalog());
});

if (config.isProd) {
  const hostDist = path.join(repoRoot, 'apps/host/dist');
  const controllerDist = path.join(repoRoot, 'apps/controller/dist');
  app.use('/j', express.static(controllerDist));
  app.use(express.static(hostDist));
  // Fallback SPA sin patrones de ruta (express 5 es quisquilloso con los comodines).
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const file = req.path.startsWith('/j') ? controllerDist : hostDist;
    res.sendFile(path.join(file, 'index.html'), (err) => (err ? next() : undefined));
  });
}

http.listen(config.port, () => {
  console.log('');
  console.log('  🎉  Perty listo');

  if (config.publicBase) {
    console.log(`      abrí en la tele  ${config.publicBase}`);
  } else if (process.env.RENDER || process.env.FLY_APP_NAME || process.env.RAILWAY_ENVIRONMENT) {
    // Publicado: la IP interna del contenedor no le sirve a nadie.
    console.log(`      escuchando en el puerto ${config.port}`);
    console.log('      abrí en la tele la URL pública de tu servicio');
  } else {
    const lan = lanAddress();
    const tv = config.isProd ? `http://${lan}:${config.port}` : 'http://localhost:5173';
    const phone = config.isProd ? `http://${lan}:${config.port}/j` : `http://${lan}:5174`;
    console.log(`      tele    ${tv}`);
    console.log(`      celular ${phone}`);
  }
  console.log('');
});
