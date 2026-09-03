import os from 'node:os';

/** Primera IPv4 de LAN. Es la que va en el QR cuando se juega en la misma casa. */
export function lanAddress(): string {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return 'localhost';
}

export interface NetConfig {
  port: number;
  isProd: boolean;
  /** Puerto del dev server del controller (Vite), solo en desarrollo. */
  controllerDevPort: number;
  /** Override manual. Solo hace falta si la URL pública no es por la que entra la tele. */
  publicBase: string | null;
}

export function readNetConfig(): NetConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    isProd: process.env.NODE_ENV === 'production',
    controllerDevPort: Number(process.env.PERTY_CONTROLLER_PORT ?? 5174),
    publicBase: process.env.PERTY_PUBLIC_URL ?? null,
  };
}

type Headers = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Por qué URL entró la tele. Detrás de un proxy (Render, Fly, Railway) el host
 * real viene en las cabeceras `x-forwarded-*`, no en el socket.
 */
export function originFromHeaders(headers: Headers): string | null {
  const origin = first(headers['origin']);
  if (origin) return origin;
  const host = first(headers['x-forwarded-host']) ?? first(headers['host']);
  if (!host) return null;
  return `${first(headers['x-forwarded-proto']) ?? 'http'}://${host}`;
}

/** Un QR con localhost no lo puede abrir ningún celular: no sirve como base. */
function usableOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    const local = ['localhost', '127.0.0.1', '::1', '[::1]'];
    return local.includes(url.hostname) ? null : url.origin;
  } catch {
    return null;
  }
}

/**
 * URL que abre el celular. El orden importa:
 *  1. `PERTY_PUBLIC_URL`, si alguien lo puso a mano.
 *  2. La URL por la que entró la tele: es la única que seguro funciona, tanto
 *     en la LAN de una casa como detrás del dominio de un hosting.
 *  3. La IP de LAN de esta máquina, como último recurso.
 */
export function joinUrl(config: NetConfig, code: string, origin?: string | null): string {
  if (config.publicBase) {
    return `${config.publicBase.replace(/\/$/, '')}/j?c=${code}`;
  }
  // En desarrollo el control lo sirve Vite en otro puerto, no este server.
  if (!config.isProd) {
    return `http://${lanAddress()}:${config.controllerDevPort}/?c=${code}`;
  }
  const base = usableOrigin(origin) ?? `http://${lanAddress()}:${config.port}`;
  return `${base}/j?c=${code}`;
}
