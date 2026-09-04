import {
  PLAYER_COLORS,
  type GameId,
  type HostAction,
  type Medal,
  type Player,
  type PlayerAction,
  type PlayerHud,
  type PlayerId,
  type PlayerView,
  type RoomCode,
  type RoomPhase,
  type GameInfo,
  type RoomSetup,
  type RoomSnapshot,
  type SettingValues,
  type Standing,
} from '@perty/protocol';
import { randomToken } from './rng';
import { GameRuntime } from './runtime';
import type { GameModule } from './types';

const AVATARS = ['🐙', '🦊', '🐸', '🦉', '🐲', '🦖', '🐺', '🦄', '👾', '🤖', '🐼', '🦝'];
const MAX_PLAYERS = PLAYER_COLORS.length;

interface PlayerRecord {
  player: Player;
  token: string;
  socketId: string | null;
  lastSeen: number;
}

export interface RoomHooks {
  /** Algo cambió: hay que empujar frames nuevos a la tele y a los celulares. */
  onChange(room: Room): void;
  onSfx(room: Room, name: string): void;
  /** Otra pestaña o dispositivo tomó el control de este jugador. */
  onTakeover(room: Room, socketId: string): void;
}

export interface RoomResult {
  standings: Standing[];
  medals: Medal[];
  gameId: GameId;
  gameName: string;
  /** Titular propio del juego ("Derrotaron a Vermil"); si no hay, gana el #1. */
  headline?: string;
}

export class Room {
  phase: RoomPhase = 'lobby';
  readonly hostToken = randomToken();
  readonly createdAt = Date.now();
  hostSocketId: string | null = null;

  private readonly records = new Map<PlayerId, PlayerRecord>();
  private order: PlayerId[] = [];
  private runtime: GameRuntime | null = null;
  private currentModule: GameModule | null = null;
  private result: RoomResult | null = null;
  private seq = 0;

  /** Catálogo de juegos, para que el celular del VIP pueda elegir. */
  private catalog: GameInfo[] = [];
  /** Lo que el VIP está armando en el lobby. Lo ven todos. */
  private selection: { gameId: string | null; settings: SettingValues } = {
    gameId: null,
    settings: {},
  };

  constructor(
    readonly code: RoomCode,
    private joinUrl: string,
    private readonly hooks: RoomHooks,
  ) {}

  // -- jugadores ------------------------------------------------------------

  get players(): Player[] {
    return this.order.map((id) => this.records.get(id)!.player);
  }

  get playerCount(): number {
    return this.order.length;
  }

  getPlayer(id: PlayerId): Player | null {
    return this.records.get(id)?.player ?? null;
  }

  addPlayer(
    rawName: string,
    options: { isBot?: boolean } = {},
  ): { player: Player; token: string } | { error: string } {
    if (this.order.length >= MAX_PLAYERS) return { error: 'La sala está llena' };
    const name = normalizeName(rawName);
    if (!name) return { error: 'Poné un nombre' };
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return { error: 'Ese nombre ya está en uso' };
    }

    const id = `p${++this.seq}_${randomToken().slice(0, 6)}`;
    const used = new Set(this.players.map((p) => p.emoji));
    const player: Player = {
      id,
      name,
      color: PLAYER_COLORS[this.order.length % PLAYER_COLORS.length]!,
      emoji: AVATARS.find((a) => !used.has(a)) ?? AVATARS[this.order.length % AVATARS.length]!,
      connected: true,
      // Un bot nunca manda: si lo hiciera, nadie podría arrancar la partida.
      isVip: false,
      ...(options.isBot ? { isBot: true } : {}),
    };
    const token = randomToken();
    this.records.set(id, { player, token, socketId: null, lastSeen: Date.now() });
    this.order.push(id);
    this.ensureVip();

    if (this.phase === 'game') this.runtime?.dispatch({ t: 'playerJoined', playerId: id });
    this.touch();
    return { player: this.records.get(id)!.player, token };
  }

  authenticate(id: PlayerId, token: string): boolean {
    const record = this.records.get(id);
    return !!record && record.token === token;
  }

  attachSocket(id: PlayerId, socketId: string): void {
    const record = this.records.get(id);
    if (!record) return;
    // Si el jugador ya tenía una pestaña abierta, esa queda huérfana: avisarle
    // para que muestre la pantalla de ingreso en vez de un frame congelado.
    if (record.socketId && record.socketId !== socketId) {
      this.hooks.onTakeover(this, record.socketId);
    }
    record.socketId = socketId;
    record.lastSeen = Date.now();
    record.player = { ...record.player, connected: true };
    this.touch();
  }

  detachSocket(socketId: string): void {
    let changed = false;
    for (const record of this.records.values()) {
      if (record.socketId === socketId) {
        record.socketId = null;
        record.player = { ...record.player, connected: false };
        changed = true;
      }
    }
    if (this.hostSocketId === socketId) this.hostSocketId = null;
    if (changed) this.touch();
  }

  socketIdOf(id: PlayerId): string | null {
    return this.records.get(id)?.socketId ?? null;
  }

  removePlayer(id: PlayerId): void {
    if (!this.records.delete(id)) return;
    this.order = this.order.filter((pid) => pid !== id);
    this.ensureVip();
    if (this.phase === 'game') this.runtime?.dispatch({ t: 'playerLeft', playerId: id });
    this.touch();
  }

  /**
   * La corona la lleva el primer humano que llegó. Se recalcula al entrar o
   * salir alguien, porque si quedara en manos de un bot nadie podría arrancar.
   */
  private ensureVip(): void {
    const humans = this.order
      .map((pid) => this.records.get(pid)!)
      .filter((record) => !record.player.isBot);
    const crown = humans.some((record) => record.player.isVip)
      ? humans.find((record) => record.player.isVip)
      : humans[0];

    for (const record of this.records.values()) {
      const shouldRule = record === crown;
      if (record.player.isVip !== shouldRule) {
        record.player = { ...record.player, isVip: shouldRule };
      }
    }
  }

  isVip(id: PlayerId): boolean {
    return this.records.get(id)?.player.isVip ?? false;
  }

  // -- armado de la partida (lo maneja el celular del VIP) -------------------

  setCatalog(games: GameInfo[]): void {
    this.catalog = games;
    if (!this.selection.gameId) this.selectGame(games[0]?.id ?? null);
  }

  get chosen(): { gameId: string | null; settings: SettingValues } {
    return this.selection;
  }

  selectGame(gameId: string | null): void {
    const game = this.catalog.find((candidate) => candidate.id === gameId) ?? null;
    // Al cambiar de juego arrancan sus valores por defecto, no los del anterior.
    this.selection = {
      gameId: game?.id ?? null,
      settings: Object.fromEntries((game?.settings ?? []).map((spec) => [spec.id, spec.default])),
    };
    this.touch();
  }

  setSetting(id: string, value: SettingValues[string]): void {
    const game = this.catalog.find((candidate) => candidate.id === this.selection.gameId);
    // Solo se aceptan perillas que ese juego declaró: nada inventado.
    if (!game?.settings?.some((spec) => spec.id === id)) return;
    this.selection = {
      ...this.selection,
      settings: { ...this.selection.settings, [id]: value },
    };
    this.touch();
  }

  /** Qué falta para poder arrancar, o null si ya se puede. */
  blockedReason(): string | null {
    const game = this.catalog.find((candidate) => candidate.id === this.selection.gameId);
    if (!game) return 'Elegí un juego';
    if (this.playerCount < game.minPlayers) {
      return `${game.name} necesita ${game.minPlayers} jugadores`;
    }
    return null;
  }

  get bots(): Player[] {
    return this.players.filter((player) => player.isBot);
  }

  // -- ciclo de juego -------------------------------------------------------

  startGame(module: GameModule, settings?: SettingValues): { error: string } | null {
    if (this.playerCount < module.info.minPlayers) {
      return { error: `Se necesitan al menos ${module.info.minPlayers} jugadores` };
    }
    const config = settings
      ? (module.configure?.(settings, this.playerCount) ?? module.defaultConfig(this.playerCount))
      : module.defaultConfig(this.playerCount);
    this.runtime?.destroy();
    this.result = null;
    this.currentModule = module;
    this.phase = 'game';
    this.runtime = new GameRuntime(
      module,
      config,
      () => this.players,
      Date.now() & 0x7fffffff,
      {
        onChange: () => this.touch(),
        onSfx: (name) => this.hooks.onSfx(this, name),
        onFinish: ({ standings, medals, headline }) => {
          this.phase = 'results';
          this.result = {
            standings,
            medals,
            headline,
            gameId: module.info.id,
            gameName: module.info.name,
          };
          this.touch();
        },
      },
    );
    this.runtime.dispatch({ t: 'start' });
    return null;
  }

  playerAction(id: PlayerId, action: PlayerAction): void {
    if (!this.records.has(id)) return;
    this.runtime?.dispatch({ t: 'player', playerId: id, action });
  }

  hostAction(action: HostAction): void {
    this.runtime?.dispatch({ t: 'host', action });
  }

  returnToLobby(): void {
    this.runtime?.destroy();
    this.runtime = null;
    this.currentModule = null;
    this.result = null;
    this.phase = 'lobby';
    this.touch();
  }

  get results(): RoomResult | null {
    return this.result;
  }

  // -- vistas ---------------------------------------------------------------

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      phase: this.phase,
      players: this.players,
      gameId: this.currentModule?.info.id ?? null,
      gameName: this.currentModule?.info.name ?? null,
      joinUrl: this.joinUrl,
      setup: this.phase === 'game' ? null : this.setupSummary(),
    };
  }

  /** Traduce la selección a algo legible desde el sillón. */
  private setupSummary(): RoomSetup | null {
    const game = this.catalog.find((candidate) => candidate.id === this.selection.gameId);
    if (!game) return null;

    const summary: string[] = [];
    for (const spec of game.settings ?? []) {
      const value = this.selection.settings[spec.id];
      if (spec.kind === 'choice') {
        const option = spec.options.find((entry) => String(entry.value) === String(value));
        if (option) summary.push(option.label);
      } else {
        const chosen = Array.isArray(value) ? value : spec.default;
        summary.push(
          chosen.length === spec.options.length
            ? `todas las ${spec.label.toLowerCase()}`
            : `${chosen.length} de ${spec.options.length} ${spec.label.toLowerCase()}`,
        );
      }
    }
    return { gameId: game.id, gameName: game.name, emoji: game.emoji, summary };
  }

  hostGameView(): unknown {
    if (this.phase === 'results' && this.result) {
      return { kind: 'results', ...this.result };
    }
    return this.runtime?.hostView() ?? null;
  }

  playerGameView(id: PlayerId): PlayerView {
    // En resultados el VIP ya arma la próxima partida: la tele solo muestra el
    // podio y no hace falta tocarla para seguir jugando.
    if (this.phase === 'lobby' || (this.phase === 'results' && this.isVip(id))) {
      const isVip = this.isVip(id);
      return {
        kind: 'lobby',
        isVip,
        vipName: this.players.find((player) => player.isVip)?.name ?? '—',
        playerCount: this.playerCount,
        // El catálogo pesa: solo lo recibe quien tiene que elegir.
        games: isVip ? this.catalog : [],
        selectedGameId: this.selection.gameId,
        settings: this.selection.settings,
        ...(this.blockedReason() ? { blocked: this.blockedReason()! } : {}),
      };
    }
    if (this.phase === 'results' && this.result) {
      const standing = this.result.standings.find((s) => s.playerId === id);
      const medals = this.result.medals.filter((m) => m.playerId === id);
      return {
        kind: 'verdict',
        tone: standing?.rank === 1 ? 'good' : 'neutral',
        title: standing ? `#${standing.rank} · ${standing.label}` : 'Fin del juego',
        subtitle: medals.length
          ? medals.map((m) => `${m.emoji} ${m.name}`).join(' · ')
          : 'Se terminó, a comer',
        emoji: standing?.rank === 1 ? '👑' : '🎬',
      };
    }
    return this.runtime?.playerView(id) ?? { kind: 'idle', title: 'Esperando…' };
  }

  playerHud(id: PlayerId): PlayerHud | null {
    return this.runtime?.playerHud(id) ?? null;
  }

  setJoinUrl(url: string): void {
    this.joinUrl = url;
  }

  dispose(): void {
    this.runtime?.destroy();
    this.runtime = null;
  }

  private touch(): void {
    this.hooks.onChange(this);
  }
}

function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 14);
}
