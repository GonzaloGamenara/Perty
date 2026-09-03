import { useEffect, useState, type ReactNode } from 'react';

/** Resolución de diseño de la tele. Todo el host se dibuja a esta medida. */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

/**
 * Dibuja la tele siempre a 1280x720 y la escala para que entre en la pantalla
 * que sea, con bandas negras si hace falta.
 *
 * Esto existe porque la vista de la tele se termina viendo en pantallas muy
 * distintas: el navegador de una smart TV, una notebook por HDMI, o un celular
 * espejado por AirPlay o Chromecast. Sin esto cada una necesitaría su propio
 * ajuste de tamaños; con esto, todas muestran exactamente el mismo diseño.
 */
export default function FitToScreen({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      // innerWidth/Height y no vw/vh: en iOS las unidades de viewport mienten
      // cuando aparece o desaparece la barra del navegador.
      const width = window.innerWidth || document.documentElement.clientWidth;
      const height = window.innerHeight || document.documentElement.clientHeight;
      const next = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
      if (next > 0) setScale(next);
    };

    fit();

    // Los navegadores de smart TV suelen reportar mal el tamaño al cargar y
    // corregirlo un rato después, sin disparar `resize`. El observer lo agarra.
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(document.documentElement);

    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    window.visualViewport?.addEventListener('resize', fit);

    // Red de seguridad: algunas teles se acomodan (overscan, barras del sistema)
    // durante los primeros segundos y no avisan con ningún evento. Se vuelve a
    // medir unas pocas veces al principio y después se deja de molestar.
    const retries = [250, 750, 1500, 3000, 5000].map((delay) =>
      window.setTimeout(fit, delay),
    );

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      for (const id of retries) window.clearTimeout(id);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#07070d',
      }}
    >
      <div
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          flex: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
