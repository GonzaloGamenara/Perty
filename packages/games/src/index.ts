import { GameRegistry } from '@perty/engine';
import { bossGame } from './boss';
import { liarGame } from './liar';
import { priceGame } from './price';
import { triviaGame } from './trivia';

/** Todos los juegos disponibles. Sumar uno = una línea más acá. */
export function createRegistry(): GameRegistry {
  return new GameRegistry()
    .register(triviaGame)
    .register(bossGame)
    .register(liarGame)
    .register(priceGame);
}

export { triviaGame, TRIVIA_INFO, defaultTriviaConfig } from './trivia';
export type * from './trivia/types';
export { CATEGORIES, getCategory } from './trivia/categories';
export { MODIFIERS, getModifier } from './trivia/modifiers';
export { QUESTIONS } from './trivia/questions';
export { SCORING } from './trivia/scoring';
export { bossGame, BOSS_INFO, defaultBossConfig, BOSSES, MECHANICS } from './boss';
export type * from './boss/types';
export { liarGame, LIAR_INFO, defaultLiarConfig, LIAR_PROMPTS, normalize } from './liar';
export type * from './liar/types';
export { priceGame, PRICE_INFO, defaultPriceConfig, PRICE_QUESTIONS, parseGuess, buildScale } from './price';
export type * from './price/types';
export { NIGHT_ID, nightInfo, buildNightConfig } from './night';
