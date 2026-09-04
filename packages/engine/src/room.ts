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
import {
  applyResults,
  boardEntries,
  createNight,
  nightMedals,
  nightStandings,
  rollEvent,
  type NightConfig,
  type NightHostView,
  type NightState,
} from './night';
import { createRng, randomToken, type Rng } from './rng';
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
  /** La Noche encadena juegos, así que la sala necesita poder buscarlos. */
  private resolveGame: ((id: GameId) => GameModule | null) | null = null;
  private nightState: NightState | null = null;
  private nightTimer: NodeJS.Timeout | null = null;
  private nightRng: Rng = createRng(1);
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

  /** La sala arranca juegos sola durante La Noche: necesita cómo encontrarlos. */
  setResolver(resolve: (id: GameId) => GameModule | null): void {
    this.resolveGame = resolve;
  }

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
    return this.startModule(module, config);
  }

  private startModule(module: GameModule, config: unknown): { error: string } | null {
    if (this.playerCount < module.info.minPlayers) {
      return { error: `Se necesitan al menos ${module.info.minPlayers} jugadores` };
    }
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
          if (this.nightState) {
            this.finishNightLeg(module.info, standings, medals);
            return;
          }
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
    this.clearNightTimer();
    this.nightState = null;
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
      setup: this.phase === 'game' || this.phase === 'night' ? null : this.setupSummary(),
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
    if (this.phase === 'night') return this.nightView();
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
    if (this.phase === 'night' && this.nightState) {
      const standings = nightStandings(this.nightState, this.players);
      const mine = standings.find((entry) => entry.playerId === id);
      return {
        kind: 'idle',
        title: mine ? `Vas #${mine.rank}` : 'La Noche',
        subtitle: mine?.label,
        emoji: mine?.rank === 1 ? '👑' : '🌙',
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
    this.clearNightTimer();
    this.runtime?.destroy();
    this.runtime = null;
  }

  // -- La Noche --------------------------------------------------------------

  get night(): NightState | null {
    return this.nightState;
  }

  startNight(config: NightConfig): { error: string } | null {
    if (config.gameIds.length === 0) return { error: 'Elegí al menos un juego' };
    this.runtime?.destroy();
    this.runtime = null;
    this.result = null;
    this.nightRng = createRng(Date.now() & 0x7fffffff);
    this.nightState = createNight(config, this.players, Date.now());
    this.phase = 'night';
    this.scheduleNight(config.introMs);
    this.touch();
    return null;
  }

  /** Terminó un juego de la noche: se reparten pasos y se muestra el tablero. */
  private finishNightLeg(info: GameInfo, standings: Standing[], medals: Medal[]): void {
    const night = this.nightState;
    if (!night) return;

    const scored = applyResults(
      night,
      { gameId: info.id, gameName: info.name, emoji: info.emoji },
      standings,
      medals,
    );
    this.nightState = {
      ...scored,
      index: scored.index + 1,
      phase: { kind: 'board', endsAt: Date.now() + scored.config.boardMs },
    };
    this.runtime?.destroy();
    this.runtime = null;
    this.phase = 'night';
    this.scheduleNight(scored.config.boardMs);
    this.touch();
  }

  /** Se cumplió el tiempo del intermedio: qué sigue. */
  private advanceNight(): void {
    const night = this.nightState;
    if (!night) return;
    const { config } = night;

    switch (night.phase.kind) {
      case 'intro':
        return this.startNightLeg();

      case 'board': {
        if (night.index >= config.gameIds.length) return this.enterNightFinale();
        // El evento va entre juego y juego, nunca antes del primero.
        if (config.events && night.index > 0) return this.enterNightEvent();
        return this.startNightLeg();
      }

      case 'event':
        return this.startNightLeg();

      case 'finale':
        return this.endNight();

      default:
        return;
    }
  }

  private startNightLeg(): void {
    const night = this.nightState;
    if (!night) return;

    const gameId = night.config.gameIds[night.index];
    const module = gameId ? this.resolveGame?.(gameId) : null;

    // Si el juego no está o falta gente, se saltea y sigue la noche.
    if (!module || this.playerCount < module.info.minPlayers) {
      this.nightState = {
        ...night,
        index: night.index + 1,
        phase: { kind: 'board', endsAt: Date.now() + night.config.boardMs },
      };
      this.scheduleNight(night.config.boardMs);
      this.touch();
      return;
    }

    this.nightState = { ...night, phase: { kind: 'playing' }, lastGain: {} };
    this.clearNightTimer();
    // Una etapa de la noche es una versión corta del juego, no la partida entera.
    this.startModule(
      module,
      module.quickConfig?.(this.playerCount) ?? module.defaultConfig(this.playerCount),
    );
  }

  private enterNightEvent(): void {
    const night = this.nightState;
    if (!night) return;
    const rolled = rollEvent(night, this.players, this.nightRng);
    const endsAt = Date.now() + night.config.eventMs;
    this.nightState =
      rolled.phase.kind === 'event'
        ? { ...rolled, phase: { ...rolled.phase, endsAt } }
        : { ...rolled, phase: { kind: 'board', endsAt } };
    this.scheduleNight(night.config.eventMs);
    this.touch();
  }

  private enterNightFinale(): void {
    const night = this.nightState;
    if (!night) return;
    this.nightState = {
      ...night,
      phase: { kind: 'finale', endsAt: Date.now() + night.config.finaleMs },
    };
    this.scheduleNight(night.config.finaleMs);
    this.touch();
  }

  private endNight(): void {
    const night = this.nightState;
    if (!night) return;
    const standings = nightStandings(night, this.players);
    const champion = this.players.find((player) => player.id === standings[0]?.playerId);

    this.nightState = null;
    this.phase = 'results';
    this.result = {
      standings,
      medals: nightMedals(night),
      headline: champion ? `${champion.name} se lleva la noche` : 'Fin de la noche',
      gameId: 'night',
      gameName: 'La Noche',
    };
    this.touch();
  }

  private scheduleNight(delayMs: number): void {
    this.clearNightTimer();
    this.nightTimer = setTimeout(() => {
      this.nightTimer = null;
      this.advanceNight();
    }, Math.max(0, delayMs));
  }

  private clearNightTimer(): void {
    if (this.nightTimer) {
      clearTimeout(this.nightTimer);
      this.nightTimer = null;
    }
  }

  /** Lo que ve la tele en los intermedios de la noche. */
  private nightView(): NightHostView | null {
    const night = this.nightState;
    if (!night) return null;
    const entries = boardEntries(night, this.players);
    const card = (index: number) => {
      const gameId = night.config.gameIds[index];
      const info = this.catalog.find((game) => game.id === gameId);
      return info ? { gameId: info.id, name: info.name, emoji: info.emoji } : null;
    };

    switch (night.phase.kind) {
      case 'intro':
        return {
          kind: 'night/intro',
          games: night.config.gameIds.flatMap((_, index) => card(index) ?? []),
          events: night.config.events,
          doubleLast: night.config.doubleLast,
        };
      case 'board':
        return {
          kind: 'night/board',
          leg: night.index,
          total: night.config.gameIds.length,
          next: card(night.index),
          entries,
          history: night.history,
          doubleNext: night.doubleNext,
          finalRound:
            night.config.doubleLast && night.index === night.config.gameIds.length - 1,
        };
      case 'event':
        return { kind: 'night/event', event: night.phase.event, entries };
      case 'finale':
        return {
          kind: 'night/finale',
          standings: nightStandings(night, this.players),
          history: night.history,
          entries,
        };
      default:
        return null;
    }
  }

  private touch(): void {
    this.hooks.onChange(this);
  }
}

function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 14);
}
