/**
 * Contrato compartido entre server, TV (host) y celular (controller).
 * Regla de oro: el server es autoritativo. Lo que viaja del celular al server
 * es *intención*; lo que viaja de vuelta es una *vista ya resuelta*.
 */

export type PlayerId = string;
export type RoomCode = string;
export type GameId = string;

export interface Player {
  id: PlayerId;
  name: string;
  /** Color asignado por la sala; identifica al jugador en la TV y en el celu. */
  color: string;
  emoji: string;
  connected: boolean;
  /** El que abrió la sala manda: elige juego y arranca. */
  isVip: boolean;
  /** Jugador de relleno que maneja el server. Se ve marcado en la tele. */
  isBot?: boolean;
}

export type RoomPhase = 'lobby' | 'game' | 'results';

export interface RoomSnapshot {
  code: RoomCode;
  phase: RoomPhase;
  players: Player[];
  gameId: GameId | null;
  gameName: string | null;
  /** URL que el celular abre para unirse (se muestra como QR en la tele). */
  joinUrl: string;
  /** Lo que el VIP está armando desde su celular, para mostrarlo en la tele. */
  setup: RoomSetup | null;
}

export interface RoomSetup {
  gameId: GameId;
  gameName: string;
  emoji: string;
  /** Resumen legible de las perillas: "12 rondas", "caos normal". */
  summary: string[];
}

// ---------------------------------------------------------------------------
// Vistas del celular
// ---------------------------------------------------------------------------

/**
 * Primitivas de UI para el control. Cualquier juego nuevo debería poder
 * expresarse combinando estas: si un juego necesita algo que no está acá,
 * agregar la primitiva acá antes que un componente a medida.
 */
export type PlayerView =
  | { kind: 'idle'; title: string; subtitle?: string; emoji?: string }
  | {
      kind: 'lobby';
      /** El que manda arma la partida desde su celular; el resto solo mira. */
      isVip: boolean;
      vipName: string;
      playerCount: number;
      /** Catálogo completo, solo para quien elige. */
      games: GameInfo[];
      selectedGameId: GameId | null;
      settings: SettingValues;
      /** Por qué todavía no se puede arrancar. */
      blocked?: string;
    }
  | {
      kind: 'choices';
      prompt?: string;
      hint?: string;
      choices: Choice[];
      /** Ya eligió: la UI se bloquea mostrando esta opción. */
      locked?: string;
      /** Modo "a ciegas": el celu muestra solo color/forma, el texto está en la tele. */
      blind?: boolean;
      deadline?: number;
    }
  | {
      kind: 'wager';
      prompt: string;
      hint?: string;
      options: WagerOption[];
      locked?: number;
      deadline?: number;
    }
  | { kind: 'buzzer'; label: string; armed: boolean; pressed?: boolean }
  | { kind: 'tapper'; label: string; count: number; deadline?: number }
  | {
      kind: 'text';
      prompt: string;
      hint?: string;
      placeholder?: string;
      maxLength: number;
      submitted?: string;
      /** Espera un número: el celu abre el teclado numérico y filtra el resto. */
      numeric?: boolean;
      deadline?: number;
    }
  | {
      kind: 'verdict';
      tone: 'good' | 'bad' | 'neutral';
      title: string;
      subtitle?: string;
      delta?: number;
      /** Qué son esos puntos: "🪙", "de daño", "pts". Cada juego pone lo suyo. */
      deltaSuffix?: string;
      emoji?: string;
    };

export interface Choice {
  id: string;
  label: string;
  /** Índice 0..3 -> color+forma fijos, para poder jugar mirando solo la tele. */
  slot: number;
}

export interface WagerOption {
  value: number;
  label: string;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Acciones del celular
// ---------------------------------------------------------------------------

export type PlayerAction =
  | { t: 'choose'; choiceId: string }
  | { t: 'wager'; value: number }
  | { t: 'buzz' }
  | { t: 'tap' }
  | { t: 'submitText'; text: string }
  // Acciones del lobby: solo las puede usar quien manda en la sala.
  | { t: 'selectGame'; gameId: GameId }
  | { t: 'setSetting'; id: string; value: string | number | string[] }
  | { t: 'startGame' }
  | { t: 'addBot' }
  | { t: 'removeBots' };

export type HostAction =
  | { t: 'advance' }
  | { t: 'skip' }
  | { t: 'endGame' };

// ---------------------------------------------------------------------------
// Frames (server -> clientes)
// ---------------------------------------------------------------------------

/**
 * `serverNow` viaja en cada frame: el cliente calcula su offset de reloj y con
 * eso interpreta los `deadline` (epoch ms del server) sin depender de que el
 * celular tenga la hora bien.
 */
export interface HostFrame {
  serverNow: number;
  room: RoomSnapshot;
  /** Vista específica del juego. Tipada en @perty/games. */
  game: unknown | null;
}

export interface PlayerFrame {
  serverNow: number;
  room: RoomSnapshot;
  me: Player;
  view: PlayerView;
  /** Marcador propio: lo que el jugador quiere ver siempre, sin mirar la tele. */
  hud: PlayerHud | null;
}

export interface PlayerHud {
  score: number;
  scoreLabel: string;
  /** Segunda línea: estrellas, racha, lo que el juego quiera contar. */
  extra?: string;
  rank?: number;
  totalPlayers?: number;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

export interface Standing {
  playerId: PlayerId;
  rank: number;
  score: number;
  label: string;
}

export interface Medal {
  id: string;
  name: string;
  description: string;
  emoji: string;
  playerId: PlayerId;
  /** Valor que ganó la medalla, ya formateado ("2.4s", "racha de 5"). */
  detail: string;
}

/** Vista final que arma la sala cuando un juego termina. */
export interface ResultsView {
  kind: 'results';
  standings: Standing[];
  medals: Medal[];
  gameId: GameId;
  gameName: string;
  /** Titular propio del juego; si no viene, se anuncia al primero. */
  headline?: string;
}

// ---------------------------------------------------------------------------
// Catálogo de juegos
// ---------------------------------------------------------------------------

export interface GameInfo {
  id: GameId;
  name: string;
  tagline: string;
  emoji: string;
  minPlayers: number;
  maxPlayers: number;
  modes: GameModeInfo[];
  /** Perillas que el lobby dibuja solo. Cada juego declara las suyas. */
  settings?: SettingSpec[];
}

/**
 * Descripción declarativa de una opción configurable. La tele las renderiza sin
 * saber de qué juego son: sumar una perilla no toca la UI.
 */
export type SettingSpec =
  | {
      kind: 'choice';
      id: string;
      label: string;
      hint?: string;
      options: SettingOption[];
      default: string | number;
    }
  | {
      kind: 'toggles';
      id: string;
      label: string;
      hint?: string;
      options: SettingOption[];
      default: string[];
      /** Mínimo de opciones prendidas; el lobby no deja bajar de acá. */
      min?: number;
    };

export interface SettingOption {
  value: string | number;
  label: string;
  emoji?: string;
}

/** Lo que el lobby manda al arrancar: id de la perilla -> valor elegido. */
export type SettingValues = Record<string, string | number | string[]>;

export interface GameModeInfo {
  id: string;
  name: string;
  description: string;
  emoji: string;
  available: boolean;
}

// ---------------------------------------------------------------------------
// Eventos de socket
// ---------------------------------------------------------------------------

export const EV = {
  // TV -> server
  hostCreate: 'host:create',
  hostResume: 'host:resume',
  hostStart: 'host:start',
  hostAction: 'host:action',
  hostReturnToLobby: 'host:lobby',
  hostAddBot: 'host:addBot',
  hostRemoveBots: 'host:removeBots',
  // celu -> server
  playerJoin: 'player:join',
  playerResume: 'player:resume',
  playerAction: 'player:action',
  // server -> TV
  hostFrame: 'host:frame',
  sfx: 'perty:sfx',
  // server -> celu
  playerFrame: 'player:frame',
  playerKicked: 'player:kicked',
  // server -> todos
  error: 'perty:error',
} as const;

export interface HostCreateAck {
  ok: true;
  code: RoomCode;
  hostToken: string;
  games: GameInfo[];
}

export interface PlayerJoinAck {
  ok: true;
  playerId: PlayerId;
  token: string;
  code: RoomCode;
}

export interface ErrorAck {
  ok: false;
  error: string;
}

export type Ack<T> = T | ErrorAck;

/** Paleta de la sala: 8 colores bien separados para 8 jugadores. */
export const PLAYER_COLORS = [
  '#ff4d6d',
  '#4dabf7',
  '#ffd43b',
  '#51cf66',
  '#c084fc',
  '#ff922b',
  '#22d3ee',
  '#f472b6',
] as const;

/** Colores + formas de los 4 slots de respuesta (estilo Kahoot, para jugar a ciegas). */
export const CHOICE_SLOTS = [
  { color: '#e8384f', shape: '▲', name: 'triángulo' },
  { color: '#2b7fff', shape: '◆', name: 'rombo' },
  { color: '#ffb020', shape: '●', name: 'círculo' },
  { color: '#22b573', shape: '■', name: 'cuadrado' },
] as const;
