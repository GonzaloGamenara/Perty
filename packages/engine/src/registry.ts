import type { GameId, GameInfo } from '@perty/protocol';
import type { GameModule } from './types';

/**
 * Catálogo de juegos. El engine no conoce ninguno: los módulos se registran
 * desde afuera (ver @perty/games), así sumar un juego no toca el núcleo.
 */
export class GameRegistry {
  private readonly modules = new Map<GameId, GameModule>();

  register(module: GameModule): this {
    this.modules.set(module.info.id, module);
    return this;
  }

  get(id: GameId): GameModule | null {
    return this.modules.get(id) ?? null;
  }

  catalog(): GameInfo[] {
    return [...this.modules.values()].map((m) => m.info);
  }
}
