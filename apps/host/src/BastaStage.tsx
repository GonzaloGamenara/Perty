import { AnimatePresence, motion } from 'motion/react';
import type { Player, RoomSnapshot } from '@perty/protocol';
import type { BastaCategory, BastaCell, BastaHostView, BastaHud } from '@perty/games';
import { Avatar, Fade, Rolling, Stage, TimerRing, playerMap } from './bits';
import { useCountdown } from './useHost';

interface Props {
  view: BastaHostView;
  room: RoomSnapshot;
  clockOffset: { current: number };
}

export default function BastaStage({ view, room, clockOffset }: Props) {
  const players = playerMap(room.players);

  return (
    <Stage glowA="#f59e0b" glowB="#ec4899">
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <AnimatePresence mode="wait">
          <Fade keyName={view.kind} className="flex min-h-0 flex-1 flex-col">
            <Body view={view} players={players} clockOffset={clockOffset} />
          </Fade>
        </AnimatePresence>
      </div>
      <HudBar hud={view.hud} players={players} />
    </Stage>
  );
}

/** La letra de la ronda, que es lo único que hay que leer desde el sillón. */
function Letter({ letter, size }: { letter: string; size: 'huge' | 'big' }) {
  return (
    <motion.div
      initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 14 }}
      className={`grid shrink-0 place-items-center rounded-3xl bg-amber-400 font-black text-black ${
        size === 'huge' ? 'size-64 text-[13rem]' : 'size-32 text-8xl'
      }`}
      style={{ boxShadow: '0 0 80px rgba(245,158,11,0.45)' }}
    >
      {letter}
    </motion.div>
  );
}

function ColumnList({ columns }: { columns: BastaCategory[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {columns.map((column, index) => (
        <motion.div
          key={column.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + index * 0.12 }}
          className="flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-2"
        >
          <span className="text-2xl">{column.emoji}</span>
          <span className="text-2xl font-black">{column.label}</span>
        </motion.div>
      ))}
    </div>
  );
}

function Body({
  view,
  players,
  clockOffset,
}: {
  view: BastaHostView;
  players: Map<string, Player>;
  clockOffset: { current: number };
}) {
  switch (view.kind) {
    case 'basta/intro':
      return (
        <div className="m-auto flex flex-col items-center gap-6 text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-white/35 uppercase">
            Ronda {view.hud.round} de {view.hud.totalRounds}
          </p>
          <Letter letter={view.hud.letter} size="huge" />
          <h2 className="text-5xl font-black">Todo con {view.hud.letter}</h2>
          <ColumnList columns={view.columns} />
        </div>
      );

    case 'basta/write': {
      const total = view.columns.length;
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <div className="flex items-center gap-8">
            <Letter letter={view.hud.letter} size="big" />
            <div className="min-w-0 flex-1">
              <p className="mb-3 text-lg font-bold tracking-[0.2em] text-amber-300 uppercase">
                El primero que llena todo grita basta
              </p>
              <ColumnList columns={view.columns} />
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} total={view.totalMs} />
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-center gap-8">
            {view.progress.map((entry) => {
              const player = players.get(entry.playerId);
              if (!player) return null;
              const full = entry.filled >= total;
              return (
                <div key={entry.playerId} className="flex flex-col items-center gap-3">
                  <Avatar player={player} size="md" dim={entry.filled === 0} />
                  <span
                    className={`text-xl font-black ${full ? 'text-amber-300' : 'text-white/60'}`}
                  >
                    {player.name}
                  </span>
                  {/* Cuántas lleva, nunca qué escribió: eso arruinaría la ronda. */}
                  <div className="flex gap-1.5">
                    {view.columns.map((column, index) => (
                      <motion.span
                        key={column.id}
                        animate={{
                          backgroundColor:
                            index < entry.filled ? player.color : 'rgba(255,255,255,0.10)',
                          scale: index < entry.filled ? 1 : 0.8,
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        className="size-4 rounded-full"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case 'basta/reveal': {
      const seats = [...players.values()];
      const stopper = view.stopper ? players.get(view.stopper) : null;
      const stopperResult = view.results.find((r) => r.playerId === view.stopper);
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex items-center gap-5">
            <div className="grid size-16 place-items-center rounded-2xl bg-amber-400 text-4xl font-black text-black">
              {view.hud.letter}
            </div>
            {stopper && (
              <motion.p
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-2xl font-black"
              >
                <span className="text-3xl">🔔</span>
                <span style={{ color: stopper.color }}>{stopper.name}</span>
                <span className="text-white/50">cortó la ronda</span>
                {stopperResult && stopperResult.valid === view.columns.length && (
                  <span className="rounded-full bg-amber-400 px-3 py-0.5 text-base text-black">
                    +{view.stopBonus}
                  </span>
                )}
              </motion.p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <div
              className="grid gap-x-3 gap-y-2"
              style={{ gridTemplateColumns: `minmax(150px, 200px) repeat(${seats.length}, 1fr)` }}
            >
              <div />
              {seats.map((player) => (
                <div key={player.id} className="flex items-center gap-2 pb-1">
                  <Avatar player={player} size="sm" />
                  <span className="truncate text-lg font-bold">{player.name}</span>
                </div>
              ))}

              {view.columns.map((column, row) => (
                <Row
                  key={column.id}
                  column={column}
                  cells={view.cells[column.id] ?? []}
                  seats={seats}
                  delay={row * 1.1}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'basta/standings':
      return (
        <div className="m-auto flex w-full max-w-5xl flex-col gap-4">
          <h2 className="mb-2 text-center text-5xl font-black">Cómo vamos</h2>
          {view.standings.map((standing) => {
            const player = players.get(standing.playerId);
            if (!player) return null;
            const max = Math.max(1, ...view.standings.map((s) => s.score));
            return (
              <motion.div key={standing.playerId} layout className="flex items-center gap-5">
                <span className="w-10 text-3xl font-black text-white/25">{standing.rank}</span>
                <Avatar player={player} size="sm" />
                <span className="w-44 truncate text-2xl font-bold">{player.name}</span>
                <div className="h-8 flex-1 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: player.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(standing.score / max) * 100}%` }}
                  />
                </div>
                <Rolling
                  value={standing.score}
                  className="w-32 text-right text-3xl font-black tabular-nums"
                />
              </motion.div>
            );
          })}
        </div>
      );

    case 'basta/done':
      return (
        <div className="m-auto text-center">
          <div className="text-9xl">🔔</div>
          <h2 className="mt-4 text-7xl font-black">¡Basta!</h2>
        </div>
      );
  }
}

/**
 * Una fila por columna de la hoja. Se destapan de a una para que dé tiempo a
 * cantar las repetidas, que es cuando se arma la discusión.
 */
function Row({
  column,
  cells,
  seats,
  delay,
}: {
  column: BastaCategory;
  cells: BastaCell[];
  seats: Player[];
  delay: number;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay }}
        className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2"
      >
        <span className="text-2xl">{column.emoji}</span>
        <span className="truncate text-lg font-black text-white/70">{column.label}</span>
      </motion.div>

      {seats.map((player, index) => {
        const cell = cells.find((c) => c.playerId === player.id);
        const empty = !cell || !cell.text;
        return (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.15 + index * 0.1, type: 'spring', stiffness: 320 }}
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
              cell?.invalid ? 'bg-white/5' : cell?.shared ? 'bg-amber-500/25' : 'bg-emerald-500/25'
            }`}
          >
            <span
              className={`truncate text-xl font-black ${
                cell?.invalid ? 'text-white/25 line-through' : 'text-white'
              }`}
            >
              {empty ? '—' : cell!.text}
            </span>
            {!!cell?.points && (
              <span
                className={`shrink-0 text-sm font-black tabular-nums ${cell.shared ? 'text-amber-200' : 'text-emerald-200'}`}
              >
                {cell.points}
              </span>
            )}
          </motion.div>
        );
      })}
    </>
  );
}

function Countdown({
  deadline,
  clockOffset,
  total,
}: {
  deadline: number;
  clockOffset: { current: number };
  total: number;
}) {
  const { ms } = useCountdown(deadline, clockOffset);
  return <TimerRing ms={ms} total={total} />;
}

function HudBar({ hud, players }: { hud: BastaHud; players: Map<string, Player> }) {
  return (
    <footer className="relative z-10 flex items-center gap-6 border-t border-line bg-black/40 px-8 py-4 backdrop-blur">
      <div className="flex flex-col">
        <span className="text-xs font-bold tracking-widest text-white/30 uppercase">Ronda</span>
        <span className="text-2xl font-black tabular-nums">
          {hud.round}
          <span className="text-white/30">/{hud.totalRounds}</span>
        </span>
      </div>
      <div className="grid size-11 place-items-center rounded-xl bg-amber-400 text-2xl font-black text-black">
        {hud.letter}
      </div>
      <div className="flex flex-1 items-center gap-8">
        {hud.entries.map((entry) => {
          const player = players.get(entry.playerId);
          if (!player) return null;
          return (
            <div key={entry.playerId} className="flex items-center gap-3">
              <Avatar player={player} size="sm" dim={!player.connected} />
              <div className="leading-tight">
                <div className="text-base font-bold">{player.name}</div>
                <div className="flex items-center gap-2">
                  <Rolling value={entry.points} className="text-xl font-black tabular-nums" />
                  <AnimatePresence>
                    {entry.delta !== null && entry.delta > 0 && (
                      <motion.span
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-sm font-black text-emerald-300"
                      >
                        +{entry.delta}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </footer>
  );
}
