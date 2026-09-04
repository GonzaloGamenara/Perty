import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import type { RoomSnapshot } from '@perty/protocol';
import { Avatar, Stage } from './bits';

/**
 * La tele en el lobby es solo una pantalla: muestra cómo entrar, quién está y
 * qué está armando el que manda desde su celular. No hay nada para clickear
 * acá, porque a una smart TV no se le puede hacer clic.
 */
export default function Lobby({ room }: { room: RoomSnapshot }) {
  const [qr, setQr] = useState<string>('');

  useEffect(() => {
    void QRCode.toDataURL(room.joinUrl, {
      margin: 1,
      width: 520,
      color: { dark: '#07070d', light: '#ffffff' },
    }).then(setQr);
  }, [room.joinUrl]);

  const vip = room.players.find((player) => player.isVip);

  return (
    <Stage glowA="#4dabf7" glowB="#c084fc">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,400px)_1fr] gap-10 p-10">
        <aside className="flex flex-col items-center justify-center gap-5 rounded-3xl border border-line bg-panel/70 p-8 backdrop-blur">
          <p className="text-sm font-bold tracking-[0.25em] text-white/40 uppercase">
            Escaneá y jugá
          </p>
          <h2 className="text-8xl leading-none font-black tracking-tight tabular-nums">
            {room.code}
          </h2>
          <div className="rounded-2xl bg-white p-3">
            {qr ? (
              <img src={qr} alt="Código QR para unirse" className="size-56" />
            ) : (
              <div className="size-56 animate-pulse rounded bg-white/50" />
            )}
          </div>
          <p className="text-center text-sm break-all text-white/40">{room.joinUrl}</p>
        </aside>

        <section className="flex min-h-0 flex-col">
          <header>
            <h1 className="text-7xl font-black tracking-tight">
              Perty <span className="text-white/25">lobby</span>
            </h1>
            <p className="mt-1 text-2xl text-white/45">
              {room.players.length === 0
                ? 'Esperando que entre alguien…'
                : `${room.players.length} en la sala`}
            </p>
          </header>

          <div className="mt-8 flex flex-wrap gap-6">
            <AnimatePresence mode="popLayout">
              {room.players.map((player) => (
                <motion.div
                  key={player.id}
                  layout
                  initial={{ opacity: 0, scale: 0.6, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                  className="flex flex-col items-center gap-2"
                >
                  <Avatar player={player} dim={!player.connected} />
                  <span className="max-w-24 truncate text-lg font-bold">{player.name}</span>
                  {player.isVip && (
                    <span className="text-[10px] font-black tracking-widest text-amber-300 uppercase">
                      manda
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="mt-auto">
            {room.setup && room.players.length > 0 ? (
              <motion.div
                key={room.setup.gameId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl border border-line bg-panel/60 p-6"
              >
                <p className="text-sm font-bold tracking-[0.25em] text-white/35 uppercase">
                  {vip ? `${vip.name} está armando` : 'Armando la partida'}
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <span className="text-6xl">{room.setup.emoji}</span>
                  <span className="text-5xl font-black">{room.setup.gameName}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {room.setup.summary.map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-white/8 px-4 py-1.5 text-lg font-bold text-white/60"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </motion.div>
            ) : (
              <p className="text-2xl text-white/35">
                Entrá con el celular y armá la partida desde ahí.
              </p>
            )}
          </div>
        </section>
      </div>
    </Stage>
  );
}
