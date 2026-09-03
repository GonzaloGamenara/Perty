import type { BossDef } from './types';

/**
 * Cada jefe es una personalidad, no solo números: las frases son lo que hace
 * que la mesa le agarre bronca. Sumar un jefe es agregar un objeto acá.
 */
export const BOSSES: BossDef[] = [
  {
    id: 'compilador',
    name: 'El Compilador',
    title: 'Guardián del Punto y Coma',
    emoji: '🖥️',
    color: '#51cf66',
    hpPerPlayer: 1400,
    chargePerMiss: 34,
    chargePerRound: 12,
    chargeMax: 100,
    favorites: ['programacion', 'videojuegos'],
    attacks: ['barrido', 'marca', 'escudo'],
    taunts: {
      intro: 'Encontré 4 errores. Son ustedes.',
      hurt: [
        'Warning: eso casi me duele.',
        'Compilado con advertencias.',
        'Segmentation fault… mío.',
        'Bien. Pero el linter los odia igual.',
      ],
      attack: [
        'Recompilando. Aguanten.',
        'Undefined is not a function. La función eran ustedes.',
        'Esto va a tardar. Como siempre.',
      ],
      victory: 'Build failed. Como su fin de semana.',
      defeat: 'Exit code 0… los felicito. Me duele decirlo.',
    },
  },
  {
    id: 'spoilerus',
    name: 'Spoilerus',
    title: 'Devorador de Finales',
    emoji: '📺',
    color: '#ff922b',
    hpPerPlayer: 1300,
    chargePerMiss: 30,
    chargePerRound: 15,
    chargeMax: 100,
    favorites: ['series', 'cine', 'anime'],
    attacks: ['marca', 'escudo', 'barrido'],
    taunts: {
      intro: 'Ya vi cómo termina esto. Ustedes no.',
      hurt: [
        'Eso no estaba en el guion.',
        'Interesante. Igual muere el perro.',
        'Spoiler: eso no alcanza.',
        'Buena escena. Lástima el final.',
      ],
      attack: [
        'Corte a: ustedes sufriendo.',
        'Temporada nueva, mismo desastre.',
        'Esta parte no la vieron venir.',
      ],
      victory: 'Cancelada tras una temporada.',
      defeat: 'Renovada. Ganaron. No me lo esperaba, y eso nunca me pasa.',
    },
  },
  {
    id: 'dragon',
    name: 'Vermil',
    title: 'El de la Última Página',
    emoji: '🐲',
    color: '#c084fc',
    hpPerPlayer: 1600,
    chargePerMiss: 28,
    chargePerRound: 10,
    chargeMax: 100,
    favorites: ['fantasia', 'cultura'],
    attacks: ['escudo', 'barrido', 'marca'],
    taunts: {
      intro: 'Llevo mil años esperando a alguien que sepa mi nombre.',
      hurt: [
        'Escama menos, rencor más.',
        'Los héroes de antes pegaban más fuerte.',
        'Eso lo voy a recordar.',
        'Un raspón. Nada más.',
      ],
      attack: [
        'Respiren hondo. Yo también.',
        'La página se da vuelta sola.',
        'Vengan más juntos, así los agarro a todos.',
      ],
      victory: 'Vuelvan cuando hayan leído el segundo tomo.',
      defeat: 'Está bien. Escriban ese final ustedes.',
    },
  },
];

const BY_ID = new Map(BOSSES.map((boss) => [boss.id, boss]));

export function getBoss(id: string | null | undefined): BossDef | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}
