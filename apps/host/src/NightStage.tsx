import { AnimatePresence, motion } from 'motion/react';
import type { Player, RoomSnapshot } from '@perty/protocol';
import type { NightBoardEntry, NightHostView, NightLeg } from '@perty/engine';
import { Avatar, Fade, Rolling, Stage, playerMap } from './bits';

interface Props {
  view: NightHostView;
  room: RoomSnapshot;
}

export default function NightStage({ view, room }: Props) {
  const players = playerMap(room.players);

  return (
    <Stage glowA="#6366f1" glowB="#f59e0b">
      <div className="flex min-h-0 flex-1 flex-col p-10">
        <AnimatePresence mode="wait">
          <Fade keyName={view.kind} className="flex min-h-0 flex-1 flex-col">
            <Body view={view} players={players} />
          </Fade>
        </AnimatePresence>
      </div>
    </Stage>
  );
}

function Body({
  view,
  players,
}: {
  view: NightHostView;
  players: Map<string, Player>;
}) {
  switch (view.kind) {
    case 'night/intro':
      return (
        <div className="m-auto flex flex-col items-center gap-6 text-center">
          <motion.div
            initial={{ scale: 0.4, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
            className="text-[9rem] leading-none"
          >
            🌙
          </motion.div>
          <h1 className="text-8xl font-black tracking-tight">La Noche</h1>
          <p className="text-2xl text-white/45">
            {view.games.length} juegos. Un solo campeón.
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {view.games.map((game, index) => (
              <motion.div
                key={`${game.gameId}-${index}`}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.2 }}
                className="flex w-40 flex-col items-center gap-2 rounded-3xl border border-line bg-panel/70 py-5"
              >
                <span className="text-xs font-black text-white/25">#{index + 1}</span>
                <span className="text-5xl">{game.emoji}</span>
                <span className="px-2 text-center text-sm leading-tight font-bold text-balance">
                  {game.name}
                </span>
              </motion.div>
            ))}
          </div>

          <div className="mt-2 flex gap-3 text-lg text-white/40">
            {view.events && <span>🎡 con eventos</span>}
            {view.doubleLast && <span>💥 el último vale doble</span>}
          </div>
        </div>
      );

    case 'night/board':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <header className="flex items-end gap-6">
            <div className="flex-1">
              <p className="text-sm font-bold tracking-[0.3em] text-white/35 uppercase">
                La Noche · juego {Math.min(view.leg + 1, view.total)} de {view.total}
              </p>
              {view.next ? (
                <h2 className="mt-2 flex items-center gap-4 text-6xl font-black">
                  <span className="text-7xl">{view.next.emoji}</span>
                  {view.next.name}
                </h2>
              ) : (
                <h2 className="mt-2 text-6xl font-black">Última cuenta</h2>
              )}
            </div>
            {view.doubleNext && <Tag color="#f59e0b">💥 vale doble</Tag>}
            {view.finalRound && !view.doubleNext && <Tag color="#ef4444">🏁 último · doble</Tag>}
          </header>

          <Track entries={view.entries} players={players} />

          {view.history.length > 0 && <Legs history={view.history} players={players} />}
        </div>
      );

    case 'night/event':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <div className="text-center">
            <motion.div
              initial={{ scale: 0.3, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 12 }}
              className="text-[8rem] leading-none"
            >
              {view.event.emoji}
            </motion.div>
            <h2 className="text-7xl font-black">{view.event.name}</h2>
            <p className="mt-2 text-3xl text-balance text-white/60">{view.event.description}</p>
          </div>

          <Track entries={view.entries} players={players} highlight={view.event.changes} />

          <div className="flex justify-center gap-4">
            {view.event.changes.map((change, index) => {
              const player = players.get(change.playerId);
              if (!player || change.steps === 0) return null;
              return (
                <motion.div
                  key={change.playerId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + index * 0.2 }}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-panel/70 px-5 py-3"
                >
                  <Avatar player={player} size="sm" />
                  <span className="text-xl font-bold">{player.name}</span>
                  <span
                    className={`text-3xl font-black tabular-nums ${change.steps > 0 ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {change.steps > 0 ? '+' : ''}
                    {change.steps}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      );

    case 'night/finale': {
      const champion = players.get(view.standings[0]?.playerId ?? '');
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <header className="text-center">
            <p className="text-sm font-bold tracking-[0.3em] text-white/35 uppercase">
              Se terminó la noche
            </p>
            <h1 className="text-shine text-8xl font-black">
              {champion ? champion.name : 'Fin'}
            </h1>
          </header>

          <Track entries={view.entries} players={players} />

          <Legs history={view.history} players={players} />
        </div>
      );
    }
  }
}

// ---------------------------------------------------------------------------

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <motion.span
      animate={{ scale: [1, 1.06, 1] }}
      transition={{ repeat: Infinity, duration: 1.4 }}
      className="rounded-full px-6 py-2.5 text-2xl font-black"
      style={{ backgroundColor: `${color}26`, color }}
    >
      {children}
    </motion.span>
  );
}

/**
 * La pista. Las fichas avanzan solas según cómo salió cada uno en el juego que
 * acaba de terminar: no hay turnos ni decisiones, solo el resultado hecho dibujo.
 */
function Track({
  entries,
  players,
  highlight,
}: {
  entries: NightBoardEntry[];
  players: Map<string, Player>;
  highlight?: { playerId: string; steps: number }[];
}) {
  const ordered = [...entries].sort((a, b) => b.steps - a.steps);

  return (
    <div className="flex flex-1 flex-col justify-center gap-5">
      {ordered.map((entry, index) => {
        const player = players.get(entry.playerId);
        if (!player) return null;

        // De dónde venía, para que la ficha se vea avanzar y no aparecer.
        const from =
          entry.gain && entry.steps > 0
            ? entry.progress * ((entry.steps - entry.gain) / entry.steps)
            : entry.progress;
        const change = highlight?.find((item) => item.playerId === entry.playerId);

        return (
          <div key={entry.playerId} className="flex items-center gap-5">
            <span className="w-8 text-2xl font-black text-white/20">{index + 1}</span>

            <div className="relative h-14 flex-1">
              <div className="absolute inset-y-0 top-1/2 right-0 left-0 h-2 -translate-y-1/2 rounded-full bg-white/8" />
              <motion.div
                className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: player.color, left: 0 }}
                initial={{ width: `${from * 100}%` }}
                animate={{ width: `${entry.progress * 100}%` }}
                transition={{ delay: 0.4, duration: 1.1, ease: 'easeOut' }}
              />
              <motion.div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                initial={{ left: `${from * 100}%` }}
                animate={{ left: `${entry.progress * 100}%` }}
                transition={{ delay: 0.4, duration: 1.1, ease: 'easeOut' }}
              >
                <Avatar player={player} size="sm" />
              </motion.div>
            </div>

            <div className="flex w-40 items-baseline justify-end gap-2">
              <Rolling value={entry.steps} className="text-3xl font-black tabular-nums" />
              <span className="text-sm text-white/30">pasos</span>
            </div>

            <div className="w-20 text-right">
              <AnimatePresence>
                {(change?.steps ?? entry.gain) ? (
                  <motion.span
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.5 }}
                    className={`text-2xl font-black tabular-nums ${
                      (change?.steps ?? entry.gain ?? 0) > 0 ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    {(change?.steps ?? entry.gain ?? 0) > 0 ? '+' : ''}
                    {change?.steps ?? entry.gain}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Quién ganó cada juego de la noche. */
function Legs({ history, players }: { history: NightLeg[]; players: Map<string, Player> }) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {history.map((leg, index) => {
        const winner = leg.winnerId ? players.get(leg.winnerId) : null;
        return (
          <motion.div
            key={`${leg.gameId}-${index}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 + index * 0.12 }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-panel/60 px-4 py-2.5"
          >
            <span className="text-3xl">{leg.emoji}</span>
            <div className="leading-tight">
              <div className="text-sm text-white/40">{leg.gameName}</div>
              <div className="text-lg font-black" style={{ color: winner?.color }}>
                {winner ? `👑 ${winner.name}` : '—'}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
