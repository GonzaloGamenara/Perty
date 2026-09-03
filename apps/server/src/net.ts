import os from 'node:os';

/** Primera IPv4 de LAN. Es la que va en el QR para que los celulares entren. */
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
  /** Override manual, por si algún día esto vive detrás de un dominio. */
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

/**
 * URL que abre el celular. En prod el server sirve las dos apps y el control
 * cuelga de /j; en dev apunta al Vite del controller.
 */
export function joinUrl(config: NetConfig, code: string): string {
  if (config.publicBase) {
    return `${config.publicBase.replace(/\/$/, '')}/j?c=${code}`;
  }
  const host = lanAddress();
  return config.isProd
    ? `http://${host}:${config.port}/j?c=${code}`
    : `http://${host}:${config.controllerDevPort}/?c=${code}`;
}
