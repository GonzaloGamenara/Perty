import type { BastaCategory } from './types';

/**
 * Las columnas de la hoja. Cada ronda se sortean unas pocas de acá.
 *
 * Regla al sumar: la columna tiene que tener respuestas **para casi cualquier
 * letra**. "Elemento químico" suena divertido hasta que sale la J y la ronda se
 * pudre para todos.
 */
export const BASTA_COLUMNS: BastaCategory[] = [
  { id: 'nombre', label: 'Nombre', emoji: '🙋' },
  { id: 'animal', label: 'Animal', emoji: '🐘' },
  { id: 'color', label: 'Color', emoji: '🎨' },
  { id: 'comida', label: 'Comida', emoji: '🍕' },
  { id: 'pais', label: 'País o ciudad', emoji: '🌍' },
  { id: 'cosa', label: 'Una cosa', emoji: '📦' },
  { id: 'marca', label: 'Marca', emoji: '🏷️' },
  { id: 'pelicula', label: 'Película o serie', emoji: '🎬' },
  { id: 'profesion', label: 'Profesión', emoji: '👷' },
  { id: 'fruta', label: 'Fruta o verdura', emoji: '🍎' },
  { id: 'cuerpo', label: 'Parte del cuerpo', emoji: '🦴' },
  { id: 'deporte', label: 'Deporte', emoji: '⚽' },
  { id: 'casa', label: 'Algo de la casa', emoji: '🛋️' },
  { id: 'musica', label: 'Banda o cantante', emoji: '🎸' },
  { id: 'juego', label: 'Videojuego', emoji: '🎮' },
  { id: 'ropa', label: 'Prenda de ropa', emoji: '👕' },
  { id: 'famoso', label: 'Famoso', emoji: '⭐' },
  { id: 'verbo', label: 'Un verbo', emoji: '🏃' },
];

/**
 * Letras jugables. Faltan a propósito las que dejan la hoja en blanco en
 * castellano: K, Ñ, Q, W, X, Y, Z. Con esas la ronda no es difícil, es injusta.
 */
export const BASTA_LETTERS = 'ABCDEFGHIJLMNOPRSTUV'.split('');
