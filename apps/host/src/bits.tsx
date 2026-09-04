import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Player, PlayerId } from '@perty/protocol';

/** Índice por id: las vistas de juego mandan playerIds, no jugadores enteros. */
export function playerMap(players: Player[]): Map<PlayerId, Player> {
  return new Map(players.map((player) => [player.id, player]));
}

/** Contador que "rueda" hasta el valor nuevo: las monedas se sienten más. */
export function Rolling({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  // El valor mostrado vive en un ref: si el efecto dependiera del estado se
  // reiniciaría en cada frame y la animación nunca llegaría al destino.
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const start = performance.now();
    const delta = value - from;
    const duration = 550;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + delta * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{shown.toLocaleString('es-AR')}</span>;
}

export function Avatar({
  player,
  size = 'md',
  dim,
}: {
  player: Player;
  size?: 'sm' | 'md' | 'lg';
  dim?: boolean;
}) {
  const px = size === 'lg' ? 'size-24 text-5xl' : size === 'sm' ? 'size-10 text-xl' : 'size-16 text-3xl';
  return (
    <div className="relative">
      <div
        className={`grid ${px} place-items-center rounded-2xl transition-opacity ${dim ? 'opacity-30' : ''}`}
        style={{ backgroundColor: `${player.color}26`, boxShadow: `inset 0 0 0 3px ${player.color}` }}
      >
        {player.emoji}
      </div>
      {player.isBot && (
        <span
          title="Bot"
          className="absolute -right-1 -bottom-1 rounded-full bg-black/70 px-1 text-[11px] leading-tight"
        >
          🤖
        </span>
      )}
    </div>
  );
}

/**
 * Mientras escriben no hay nada que mirar, así que la espera es el show: una
 * carta por cabeza que se prende cuando esa persona manda lo suyo. La usan los
 * juegos de escribir (Superlativos, Encuesta).
 */
export function WaitingCard({
  player,
  ready,
  tight,
}: {
  player: Player;
  ready: boolean;
  /** Con mucha gente las cartas se acomodan en dos filas y tienen que achicarse. */
  tight: boolean;
}) {
  return (
    <motion.div
      animate={ready ? { scale: 1, y: -10 } : { scale: 0.94, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      className={`flex flex-col items-center gap-3 rounded-3xl border-4 px-4 ${tight ? 'w-40 py-3' : 'w-48 py-6'}`}
      style={{
        borderColor: ready ? player.color : 'rgba(255,255,255,0.10)',
        backgroundColor: ready ? `${player.color}22` : 'rgba(255,255,255,0.03)',
      }}
    >
      <Avatar player={player} size={tight ? 'sm' : 'md'} dim={!ready} />
      <span className={`text-xl font-black ${ready ? 'text-white' : 'text-white/30'}`}>
        {player.name}
      </span>
      <div className={`flex items-center ${tight ? 'h-8' : 'h-10'}`}>
        {ready ? (
          <motion.span
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 14 }}
            className="text-3xl"
          >
            ✍️
          </motion.span>
        ) : (
          <span className="text-sm font-bold tracking-[0.2em] text-white/25 uppercase">
            pensando
          </span>
        )}
      </div>
    </motion.div>
  );
}

export function TimerRing({ ms, total }: { ms: number; total: number }) {
  const ratio = Math.max(0, Math.min(1, ms / total));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const urgent = ms < 5000;
  return (
    <div className="relative grid size-32 place-items-center">
      <svg className="absolute -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} className="fill-none stroke-white/10" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          className={`fill-none transition-colors ${urgent ? 'stroke-red-500' : 'stroke-white'}`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <span
        className={`text-4xl font-black tabular-nums ${urgent ? 'animate-pulse text-red-400' : ''}`}
      >
        {Math.ceil(ms / 1000)}
      </span>
    </div>
  );
}

export function Stage({
  children,
  glowA,
  glowB,
}: {
  children: React.ReactNode;
  glowA?: string;
  glowB?: string;
}) {
  return (
    <div
      className="stage-bg relative flex h-full flex-col overflow-hidden"
      style={{ '--glow-a': glowA, '--glow-b': glowB } as React.CSSProperties}
    >
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function Fade({
  keyName,
  children,
  className,
}: {
  keyName: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      key={keyName}
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
