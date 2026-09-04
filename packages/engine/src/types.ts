import type {
  GameInfo,
  HostAction,
  Medal,
  Player,
  PlayerAction,
  PlayerHud,
  PlayerId,
  PlayerView,
  SettingValues,
  Standing,
} from '@perty/protocol';
import type { Rng } from './rng';

export interface GameCtx {
  /** Reloj del server. Nunca uses Date.now() dentro de un juego: usá esto. */
  now: number;
  rng: Rng;
  players: Player[];
}

export type ViewCtx = Omit<GameCtx, 'rng'>;

export type GameEvent =
  | { t: 'start' }
  | { t: 'player'; playerId: PlayerId; action: PlayerAction }
  | { t: 'host'; action: HostAction }
  | { t: 'timer'; key: string }
  | { t: 'playerJoined'; playerId: PlayerId }
  | { t: 'playerLeft'; playerId: PlayerId };

export type Effect =
  /** Reprograma (pisa) el timer con esa key. */
  | { t: 'timer'; key: string; delayMs: number }
  | { t: 'cancelTimer'; key: string }
  | { t: 'sfx'; name: string }
  | {
      t: 'finish';
      standings: Standing[];
      medals: Medal[];
      /** Titular para la pantalla final. Sin esto se anuncia al primero. */
      headline?: string;
    };

export interface Reduction<S> {
  state: S;
  effects?: Effect[];
}

/**
 * Un juego es una máquina de estados pura. No conoce sockets, no toca el reloj,
 * no guarda nada. Todo lo que quiera que pase en el mundo lo pide vía effects.
 *
 * Para sumar un juego nuevo: implementá esto y registralo en @perty/games.
 */
export interface GameModule<S = any, C = any> {
  info: GameInfo;
  defaultConfig(playerCount: number): C;
  /**
   * Traduce lo que eligieron en el lobby a una config válida. Cada juego valida
   * y recorta lo suyo: el server nunca confía en los valores que llegan.
   */
  configure?(settings: SettingValues, playerCount: number): C;
  /**
   * Versión corta, para cuando el juego es una etapa de La Noche y no la noche
   * entera. Si no está, se usa la config por defecto (y la noche se hace larga).
   */
  quickConfig?(playerCount: number): C;
  create(ctx: GameCtx, config: C): Reduction<S>;
  reduce(state: S, event: GameEvent, ctx: GameCtx): Reduction<S>;
  /** Vista de la tele. Cada juego define su propia unión discriminada por `kind`. */
  hostView(state: S, ctx: ViewCtx): unknown;
  playerView(state: S, playerId: PlayerId, ctx: ViewCtx): PlayerView;
  /** Marcador propio para el celular. Opcional: no todos los juegos puntúan. */
  playerHud?(state: S, playerId: PlayerId, ctx: ViewCtx): PlayerHud | null;
}
