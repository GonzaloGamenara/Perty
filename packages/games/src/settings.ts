import type { SettingValues } from '@perty/protocol';

/**
 * Lectores de perillas. Lo que llega del lobby es texto de un cliente: acá se
 * valida contra la lista de valores permitidos y, ante cualquier cosa rara, se
 * usa el default. Ningún juego confía en el valor crudo.
 */

export function readChoice<T extends string | number>(
  settings: SettingValues | undefined,
  id: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = settings?.[id];
  if (typeof raw !== 'string' && typeof raw !== 'number') return fallback;
  // El lobby manda números como texto cuando viajan por el socket.
  const match = allowed.find((option) => String(option) === String(raw));
  return match ?? fallback;
}

export function readToggles(
  settings: SettingValues | undefined,
  id: string,
  allowed: readonly string[],
  fallback: string[],
  min = 1,
): string[] {
  const raw = settings?.[id];
  if (!Array.isArray(raw)) return fallback;
  const valid = raw.filter((value): value is string => typeof value === 'string' && allowed.includes(value));
  const unique = [...new Set(valid)];
  return unique.length >= min ? unique : fallback;
}
