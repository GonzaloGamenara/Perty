import type { Room } from '@perty/engine';
import type { PlayerId, PlayerView } from '@perty/protocol';
import { BOT_NAMES, decide, makeBrain, viewKey, type Brain } from './bot-brain';

/**
 * Bots que viven adentro del server, para el botón del lobby.
 *
 * A diferencia de `npm run bots`, estos no usan socket: son jugadores normales
 * de la sala a los que el server les pasa su vista y ellos responden. Sirven
 * para probar un juego sin juntar a nadie, o para completar la mesa si falta uno.
 */
export class BotDriver {
  private readonly brains = new Map<PlayerId, Brain>();
  /** Última vista que ya respondió cada bot, para no actuar dos veces. */
  private readonly handled = new Map<PlayerId, string>();
  private readonly timers = new Map<PlayerId, NodeJS.Timeout[]>();

  add(room: Room): { player: { id: PlayerId; name: string } } | { error: string } {
    const taken = new Set(room.players.map((p) => p.name));
    const name = BOT_NAMES.find((candidate) => !taken.has(candidate));
    if (!name) return { error: 'No entran más bots' };

    const result = room.addPlayer(name, { isBot: true });
    if ('error' in result) return result;

    this.brains.set(result.player.id, makeBrain(room.bots.length - 1));
    return { player: { id: result.player.id, name: result.player.name } };
  }

  /** ¿Este jugador lo maneja el server? Los bots por socket se manejan solos. */
  knows(playerId: PlayerId): boolean {
    return this.brains.has(playerId);
  }

  removeAll(room: Room): number {
    const bots = room.bots;
    for (const bot of bots) {
      this.forget(bot.id);
      room.removePlayer(bot.id);
    }
    return bots.length;
  }

  /** El server le pasa a cada bot su vista después de cada cambio de la sala. */
  handle(room: Room, playerId: PlayerId, view: PlayerView): void {
    const brain = this.brains.get(playerId);
    if (!brain) return;

    const key = viewKey(view);
    if (this.handled.get(playerId) === key) return;
    this.handled.set(playerId, key);

    this.clearTimers(playerId);
    const plan = decide(view, brain);
    if (!plan) return;

    if (plan.kind === 'once') {
      this.schedule(playerId, setTimeout(() => room.playerAction(playerId, plan.action), plan.delayMs));
      return;
    }

    const mash = setInterval(() => room.playerAction(playerId, { t: 'tap' }), plan.intervalMs);
    this.schedule(playerId, mash);
    this.schedule(playerId, setTimeout(() => clearInterval(mash), plan.durationMs));
  }

  /** La sala se cerró o se vació: no dejar timers colgados. */
  forgetRoom(room: Room): void {
    for (const bot of room.bots) this.forget(bot.id);
  }

  private forget(playerId: PlayerId): void {
    this.clearTimers(playerId);
    this.brains.delete(playerId);
    this.handled.delete(playerId);
  }

  private schedule(playerId: PlayerId, timer: NodeJS.Timeout): void {
    const list = this.timers.get(playerId) ?? [];
    list.push(timer);
    this.timers.set(playerId, list);
  }

  private clearTimers(playerId: PlayerId): void {
    for (const timer of this.timers.get(playerId) ?? []) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.timers.delete(playerId);
  }
}
