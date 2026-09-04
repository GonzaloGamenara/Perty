import { AnimatePresence, motion } from 'motion/react';
import type { Player, RoomSnapshot } from '@perty/protocol';
import type { PollHostView, PollHud, PollRevealGroup } from '@perty/games';
import { Avatar, Fade, Rolling, Stage, TimerRing, WaitingCard, playerMap } from './bits';
import { useCountdown } from './useHost';

interface Props {
  view: PollHostView;
  room: RoomSnapshot;
  clockOffset: { current: number };
}

export default function PollStage({ view, room, clockOffset }: Props) {
  const players = playerMap(room.players);

  return (
    <Stage glowA="#34d399" glowB="#a78bfa">
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

function Body({
  view,
  players,
  clockOffset,
}: {
  view: PollHostView;
  players: Map<string, Player>;
  clockOffset: { current: number };
}) {
  switch (view.kind) {
    case 'poll/intro': {
      const cow = view.hud.cow ? players.get(view.hud.cow) : null;
      return (
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-white/35 uppercase">
            Ronda {view.hud.round} de {view.hud.totalRounds}
          </p>
          <div className="text-[10rem] leading-none">🐑</div>
          <h2 className="text-6xl font-black">Encuesta</h2>
          <p className="text-3xl text-emerald-300">No gana el que tiene razón</p>
          {cow && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-2 flex items-center gap-3 rounded-full bg-white/10 px-6 py-2"
            >
              <span className="text-3xl">🐄</span>
              <span className="text-2xl font-bold" style={{ color: cow.color }}>
                {cow.name} tiene la vaca
              </span>
            </motion.div>
          )}
        </div>
      );
    }

    case 'poll/write':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <div className="flex items-start gap-8">
            <div className="flex-1">
              <p className="mb-3 text-lg font-bold tracking-[0.2em] text-emerald-300 uppercase">
                Escriban lo mismo que el resto
              </p>
              <h2 className="text-6xl leading-tight font-black text-balance">{view.text}</h2>
              {view.hint && <p className="mt-3 text-2xl text-white/40">{view.hint}</p>}
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} total={25000} />
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-6">
            {[...players.values()].map((player) => (
              <WaitingCard
                key={player.id}
                player={player}
                ready={view.ready.includes(player.id)}
                tight={players.size > 5}
              />
            ))}
          </div>
        </div>
      );

    case 'poll/reveal': {
      const total = Math.max(1, ...view.groups.map((g) => g.members.length));
      const cowPlayer = view.cowMoved ? players.get(view.cowMoved) : null;
      const tail = view.groups.length * 0.75;
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex items-baseline gap-5">
            <h2 className="text-3xl font-black text-balance text-white/60">{view.text}</h2>
            {view.unanimous && (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: tail, type: 'spring', stiffness: 320 }}
                className="rounded-full bg-amber-400 px-4 py-1 text-lg font-black tracking-widest text-black uppercase"
              >
                🔮 pensaron todos igual
              </motion.span>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
            {view.groups.map((group, index) => (
              <GroupRow
                key={group.id}
                group={group}
                players={players}
                max={total}
                delay={index * 0.75}
              />
            ))}
          </div>

          <div className="flex h-10 items-center gap-6">
            {view.noDeal && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: tail }}
                className="text-2xl font-bold text-white/45"
              >
                Sin mayoría: esta ronda no paga.
              </motion.p>
            )}
            {cowPlayer && (
              <motion.p
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: tail + 0.3, type: 'spring', stiffness: 200, damping: 16 }}
                className="flex items-center gap-3 text-2xl font-black"
              >
                <span className="text-4xl">🐄</span>
                <span style={{ color: cowPlayer.color }}>La vaca es de {cowPlayer.name}</span>
              </motion.p>
            )}
            {view.blanks.length > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: tail + 0.5 }}
                className="ml-auto text-xl text-white/40"
              >
                👻 {view.blanks.map((id) => players.get(id)?.name ?? '?').join(' y ')} no contestó.
              </motion.p>
            )}
          </div>
        </div>
      );
    }

    case 'poll/standings':
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
                <span className="w-44 truncate text-2xl font-bold">
                  {player.name}
                  {view.hud.cow === player.id && ' 🐄'}
                </span>
                <div className="h-8 flex-1 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: player.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.max(0, standing.score) / max) * 100}%` }}
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

    case 'poll/done':
      return (
        <div className="m-auto text-center">
          <div className="text-9xl">🐑</div>
          <h2 className="mt-4 text-7xl font-black">Se cerró la encuesta</h2>
        </div>
      );
  }
}

/**
 * Cada respuesta es una barra tan ancha como gente la escribió, así el rebaño
 * se ve de una: la fila larga es lo que pensó la mesa, y las cortas los raros.
 */
function GroupRow({
  group,
  players,
  max,
  delay,
}: {
  group: PollRevealGroup;
  players: Map<string, Player>;
  max: number;
  delay: number;
}) {
  const members = group.members.map((id) => players.get(id)).filter(Boolean) as Player[];
  const width = `${Math.max(28, (group.members.length / max) * 100)}%`;

  return (
    <div className="flex items-center gap-4">
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width, opacity: 1 }}
        transition={{ delay, duration: 0.5, ease: 'easeOut' }}
        className={`flex items-center gap-4 overflow-hidden rounded-2xl px-6 py-4 ${group.winner ? 'ring-4 ring-emerald-300' : ''}`}
        style={{
          backgroundColor: group.winner ? '#059669' : 'rgba(255,255,255,0.07)',
          boxShadow: group.winner ? '0 0 60px rgba(16,185,129,0.4)' : undefined,
        }}
      >
        <span className="shrink-0 text-3xl">{group.winner ? '🐑' : '🦄'}</span>
        <span className="truncate text-3xl font-black text-white drop-shadow">{group.text}</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.4 }}
        className="flex shrink-0 items-center gap-2"
      >
        {members.map((member) => (
          <Avatar key={member.id} player={member} size="sm" />
        ))}
      </motion.div>

      {group.points > 0 && (
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + 0.55 }}
          className="text-2xl font-black text-emerald-200 tabular-nums"
        >
          +{group.points.toLocaleString('es-AR')}
        </motion.span>
      )}
    </div>
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

function HudBar({ hud, players }: { hud: PollHud; players: Map<string, Player> }) {
  return (
    <footer className="relative z-10 flex items-center gap-6 border-t border-line bg-black/40 px-8 py-4 backdrop-blur">
      <div className="flex flex-col">
        <span className="text-xs font-bold tracking-widest text-white/30 uppercase">Ronda</span>
        <span className="text-2xl font-black tabular-nums">
          {hud.round}
          <span className="text-white/30">/{hud.totalRounds}</span>
        </span>
      </div>
      <div className="flex flex-1 items-center gap-8">
        {hud.entries.map((entry) => {
          const player = players.get(entry.playerId);
          if (!player) return null;
          return (
            <div key={entry.playerId} className="flex items-center gap-3">
              <div className="relative">
                <Avatar player={player} size="sm" dim={!player.connected} />
                {hud.cow === player.id && (
                  <motion.span
                    layoutId="cow"
                    className="absolute -top-3 -left-3 text-2xl"
                    transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                  >
                    🐄
                  </motion.span>
                )}
              </div>
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
