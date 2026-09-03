import type { Category } from './types';

/** Una estrella por categoría. Agregar una categoría = agregar una estrella. */
export const CATEGORIES: Category[] = [
  { id: 'videojuegos', name: 'Videojuegos', emoji: '🎮', color: '#4dabf7' },
  { id: 'anime', name: 'Anime', emoji: '🌸', color: '#f472b6' },
  { id: 'fantasia', name: 'Fantasía y Libros', emoji: '🐉', color: '#c084fc' },
  { id: 'programacion', name: 'Programación', emoji: '💻', color: '#51cf66' },
  { id: 'cine', name: 'Cine', emoji: '🎬', color: '#ffd43b' },
  { id: 'series', name: 'Series', emoji: '📺', color: '#ff922b' },
  { id: 'comida', name: 'Comida', emoji: '🍕', color: '#ff4d6d' },
  { id: 'cultura', name: 'Cultura General', emoji: '🌍', color: '#22d3ee' },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return (
    BY_ID.get(id) ?? { id, name: id, emoji: '❓', color: '#94a3b8' }
  );
}
