import { AnimatePresence, motion } from 'motion/react';
import { CHOICE_SLOTS, type Player, type RoomSnapshot } from '@perty/protocol';
import type { LiarHostView, LiarHud, LiarOption } from '@perty/games';
import { Avatar, Fade, Rolling, Stage, TimerRing, playerMap } from './bits';
import { useCountdown } from './useHost';

interface Props {
  view: LiarHostView;
  room: RoomSnapshot;
  clockOffset: { current: number };
}

export default function LiarStage({ view, room, clockOffset }: Props) {
  const players = playerMap(room.players);

  return (
    <Stage glowA="#c084fc" glowB="#f59e0b">
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

/** El hueco `____` se pinta distinto: es lo que hay que completar. */
function Prompt({ text, size = 'big' }: { text: string; size?: 'big' | 'small' }) {
  const parts = text.split('____');
  const cls = size === 'big' ? 'text-6xl' : 'text-4xl';
  return (
    <h2 className={`${cls} leading-tight font-black text-balance`}>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <span className="mx-2 inline-block min-w-32 border-b-6 border-amber-400 align-bottom" />
          )}
        </span>
      ))}
    </h2>
  );
}

function Body({
  view,
  players,
  clockOffset,
}: {
  view: LiarHostView;
  players: Map<string, Player>;
  clockOffset: { current: number };
}) {
  switch (view.kind) {
    case 'liar/intro':
      return (
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-white/35 uppercase">
            Ronda {view.hud.round} de {view.hud.totalRounds}
          </p>
          <div className="text-[10rem] leading-none">🎭</div>
          <h2 className="text-6xl font-black">Mentiroso</h2>
          <p className="text-3xl" style={{ color: view.category.color }}>
            {view.category.emoji} {view.category.name}
          </p>
        </div>
      );

    case 'liar/write':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <div className="flex items-start gap-8">
            <div className="flex-1">
              <p className="mb-3 text-lg font-bold tracking-[0.2em] text-amber-400 uppercase">
                Inventen una mentira creíble
              </p>
              <Prompt text={view.text} />
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} total={40000} />
          </div>
          <div className="mt-auto flex flex-wrap gap-6">
            {[...players.values()].map((player) => {
              const ready = view.ready.includes(player.id);
              return (
                <div key={player.id} className="flex items-center gap-3">
                  <Avatar player={player} size="sm" dim={!ready} />
                  <span className={`text-xl font-bold ${ready ? 'text-white' : 'text-white/25'}`}>
                    {player.name}
                  </span>
                  {ready && <span className="text-xl">✍️</span>}
                </div>
              );
            })}
          </div>
        </div>
      );

    case 'liar/vote':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <div className="flex items-start gap-8">
            <div className="flex-1">
              <p className="mb-2 text-lg font-bold tracking-[0.2em] text-amber-400 uppercase">
                ¿Cuál es la verdad?
              </p>
              <Prompt text={view.text} size="small" />
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} total={25000} />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-4">
            {view.options.map((option) => {
              const slot = CHOICE_SLOTS[option.slot % CHOICE_SLOTS.length]!;
              return (
                <div
                  key={option.id}
                  className="flex items-center gap-4 rounded-3xl px-6 py-4"
                  style={{ backgroundColor: slot.color }}
                >
                  <span className="text-4xl">{slot.shape}</span>
                  <span className="text-3xl leading-tight font-black text-white drop-shadow">
                    {option.text}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-5">
            {[...players.values()].map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                <Avatar player={player} size="sm" dim={!view.voted.includes(player.id)} />
                <span
                  className={`text-lg font-bold ${view.voted.includes(player.id) ? 'text-white' : 'text-white/25'}`}
                >
                  {player.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'liar/reveal':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Con el hueco todavía: la verdad se revela abajo, al final. */}
          <Prompt text={view.text} size="small" />
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {[...view.options]
              // La verdad va última: es el momento que todos esperan.
              .sort((a, b) => Number(a.truth) - Number(b.truth))
              .map((option, index) => (
                <OptionRow
                  key={option.id}
                  option={option}
                  voters={view.votesByOption[option.id] ?? []}
                  players={players}
                  delay={index * 0.9}
                />
              ))}
          </div>
          {view.accidents.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: view.options.length * 0.9 + 0.8 }}
              className="text-xl text-white/45"
            >
              🍀 {view.accidents.map((id) => players.get(id)?.name ?? '?').join(' y ')} habían
              escrito la verdad.
            </motion.p>
          )}
        </div>
      );

    case 'liar/standings':
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

    case 'liar/done':
      return (
        <div className="m-auto text-center">
          <div className="text-9xl">🎭</div>
          <h2 className="mt-4 text-7xl font-black">Se acabaron las mentiras</h2>
        </div>
      );
  }
}

function OptionRow({
  option,
  voters,
  players,
  delay,
}: {
  option: LiarOption;
  voters: string[];
  players: Map<string, Player>;
  delay: number;
}) {
  const slot = CHOICE_SLOTS[option.slot % CHOICE_SLOTS.length]!;
  const authors = option.authors.map((id) => players.get(id)).filter(Boolean) as Player[];

  return (
    <motion.div
      initial={option.truth ? { opacity: 0, scale: 0.85 } : { opacity: 0, x: -24 }}
      animate={option.truth ? { opacity: 1, scale: 1 } : { opacity: 1, x: 0 }}
      transition={
        option.truth
          ? { delay, type: 'spring', stiffness: 260, damping: 14 }
          : { delay, duration: 0.35 }
      }
      className={`flex items-center gap-4 rounded-2xl px-5 py-3 ${option.truth ? 'ring-4 ring-emerald-400' : ''}`}
      style={{
        backgroundColor: option.truth ? '#059669' : `${slot.color}bb`,
        boxShadow: option.truth ? '0 0 60px rgba(16,185,129,0.55)' : undefined,
      }}
    >
      <span className="text-3xl">{option.truth ? '✅' : slot.shape}</span>
      <span className="text-3xl font-black text-white drop-shadow">{option.text}</span>

      {option.truth ? (
        <span className="ml-3 rounded-full bg-black/30 px-3 py-1 text-sm font-black tracking-widest text-white uppercase">
          la verdad
        </span>
      ) : (
        <span className="ml-3 text-lg text-white/80">
          de {authors.map((a) => a.name).join(' y ') || '—'}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {voters.map((id, index) => {
          const player = players.get(id);
          return player ? (
            <motion.span
              key={id}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: delay + 0.35 + index * 0.12, type: 'spring', stiffness: 400 }}
              className="text-3xl"
              title={player.name}
            >
              {player.emoji}
            </motion.span>
          ) : null;
        })}
      </div>
    </motion.div>
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

function HudBar({ hud, players }: { hud: LiarHud; players: Map<string, Player> }) {
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
