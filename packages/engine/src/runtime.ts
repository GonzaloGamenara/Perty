import type { Medal, Player, PlayerHud, PlayerId, PlayerView, Standing } from '@perty/protocol';
import { createRng, type Rng } from './rng';
import type { Effect, GameCtx, GameEvent, GameModule } from './types';

export interface RuntimeHooks {
  /** El estado cambió: hay que empujar frames nuevos. */
  onChange(): void;
  onSfx(name: string): void;
  onFinish(result: { standings: Standing[]; medals: Medal[]; headline?: string }): void;
}

/**
 * Corre un GameModule: le da reloj, RNG y timers reales, y serializa los
 * eventos para que el reducer nunca corra concurrente.
 */
export class GameRuntime<S = unknown> {
  private state: S;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly rng: Rng;
  private alive = true;

  constructor(
    readonly module: GameModule<S>,
    config: unknown,
    private players: () => Player[],
    seed: number,
    private readonly hooks: RuntimeHooks,
  ) {
    this.rng = createRng(seed);
    const { state, effects } = module.create(this.ctx(), config);
    this.state = state;
    this.applyEffects(effects);
  }

  private ctx(): GameCtx {
    return { now: Date.now(), rng: this.rng, players: this.players() };
  }

  dispatch(event: GameEvent): void {
    if (!this.alive) return;
    const { state, effects } = this.module.reduce(this.state, event, this.ctx());
    this.state = state;
    this.applyEffects(effects);
    this.hooks.onChange();
  }

  private applyEffects(effects: Effect[] | undefined): void {
    if (!effects?.length) return;
    for (const effect of effects) {
      switch (effect.t) {
        case 'timer': {
          this.clearTimer(effect.key);
          const handle = setTimeout(() => {
            this.timers.delete(effect.key);
            this.dispatch({ t: 'timer', key: effect.key });
          }, Math.max(0, effect.delayMs));
          this.timers.set(effect.key, handle);
          break;
        }
        case 'cancelTimer':
          this.clearTimer(effect.key);
          break;
        case 'sfx':
          this.hooks.onSfx(effect.name);
          break;
        case 'finish':
          this.hooks.onFinish({
            standings: effect.standings,
            medals: effect.medals,
            headline: effect.headline,
          });
          break;
      }
    }
  }

  private clearTimer(key: string): void {
    const handle = this.timers.get(key);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(key);
    }
  }

  hostView(): unknown {
    return this.module.hostView(this.state, { now: Date.now(), players: this.players() });
  }

  playerView(playerId: PlayerId): PlayerView {
    return this.module.playerView(this.state, playerId, {
      now: Date.now(),
      players: this.players(),
    });
  }

  playerHud(playerId: PlayerId): PlayerHud | null {
    return (
      this.module.playerHud?.(this.state, playerId, {
        now: Date.now(),
        players: this.players(),
      }) ?? null
    );
  }

  /** Solo para tests y debugging. */
  peek(): S {
    return this.state;
  }

  destroy(): void {
    this.alive = false;
    for (const handle of this.timers.values()) clearTimeout(handle);
    this.timers.clear();
  }
}
