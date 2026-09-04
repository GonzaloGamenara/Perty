import { useEffect, useState, type ReactNode } from 'react';

/** Ancho de diseño. La altura se estira para llenar la pantalla que toque. */
const DESIGN_WIDTH = 1280;
/** Límites de altura, para que una pantalla rarísima no deforme el diseño. */
const MIN_HEIGHT = 560;
const MAX_HEIGHT = 1000;

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
  const [box, setBox] = useState({ scale: 1, height: 720 });

  useEffect(() => {
    const fit = () => {
      // innerWidth/Height y no vw/vh: en iOS las unidades de viewport mienten
      // cuando aparece o desaparece la barra del navegador.
      const width = window.innerWidth || document.documentElement.clientWidth;
      const height = window.innerHeight || document.documentElement.clientHeight;
      if (width <= 0 || height <= 0) return;

      // Se escala por ancho y la altura se acomoda: así no quedan bandas negras
      // en pantallas que no son 16:9 exacto, que son casi todas.
      let scale = width / DESIGN_WIDTH;
      let designHeight = height / scale;

      if (designHeight > MAX_HEIGHT || designHeight < MIN_HEIGHT) {
        designHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, designHeight));
        scale = Math.min(width / DESIGN_WIDTH, height / designHeight);
      }

      setBox({ scale, height: designHeight });
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
          height: box.height,
          flex: 'none',
          transform: `scale(${box.scale})`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
