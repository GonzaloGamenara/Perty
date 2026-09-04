import { AnimatePresence, motion } from 'motion/react';
import { CHOICE_SLOTS, type Player, type RoomSnapshot } from '@perty/protocol';
import type { QuipHostView, QuipHud, QuipReveal } from '@perty/games';
import { Avatar, Fade, Rolling, Stage, TimerRing, playerMap } from './bits';
import { useCountdown } from './useHost';

interface Props {
  view: QuipHostView;
  room: RoomSnapshot;
  clockOffset: { current: number };
}

export default function QuipsStage({ view, room, clockOffset }: Props) {
  const players = playerMap(room.players);

  return (
    <Stage glowA="#fb7185" glowB="#38bdf8">
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

const TONE = {
  clasico: { label: 'Clásico', emoji: '🎪', color: '#fb7185' },
  nerd: { label: 'Nerd', emoji: '🤓', color: '#38bdf8' },
  personal: { label: 'Personal', emoji: '🫵', color: '#fbbf24' },
} as const;

/** Cuantas más respuestas hay, más chico entra todo. */
function scaleFor(count: number): { text: string; pad: string; avatar: 'sm' | 'md' } {
  if (count <= 4) return { text: 'text-4xl', pad: 'px-6 py-5', avatar: 'md' };
  if (count <= 6) return { text: 'text-3xl', pad: 'px-5 py-4', avatar: 'sm' };
  return { text: 'text-2xl', pad: 'px-4 py-3', avatar: 'sm' };
}

function Body({
  view,
  players,
  clockOffset,
}: {
  view: QuipHostView;
  players: Map<string, Player>;
  clockOffset: { current: number };
}) {
  switch (view.kind) {
    case 'quips/intro': {
      const tone = TONE[view.tone];
      const subject = view.subject ? players.get(view.subject) : null;
      return (
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-white/35 uppercase">
            Ronda {view.hud.round} de {view.hud.totalRounds}
          </p>
          <div className="text-[10rem] leading-none">✍️</div>
          <h2 className="text-6xl font-black">Superlativos</h2>
          {subject ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 16 }}
              className="flex items-center gap-4 rounded-full bg-white/10 px-8 py-3"
            >
              <span className="text-3xl">🫵</span>
              <Avatar player={subject} size="sm" />
              <span className="text-3xl font-black" style={{ color: subject.color }}>
                Esta va sobre {subject.name}
              </span>
            </motion.div>
          ) : (
            <p className="text-3xl" style={{ color: tone.color }}>
              {tone.emoji} {tone.label}
            </p>
          )}
        </div>
      );
    }

    case 'quips/write':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <div className="flex items-start gap-8">
            <div className="flex-1">
              <p className="mb-3 text-lg font-bold tracking-[0.2em] text-rose-300 uppercase">
                Escriban la mejor respuesta
              </p>
              <h2 className="text-6xl leading-tight font-black text-balance">{view.text}</h2>
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} total={50000} />
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-6">
            {[...players.values()].map((player) => (
              <WriteCard
                key={player.id}
                player={player}
                ready={view.ready.includes(player.id)}
                tight={players.size > 5}
              />
            ))}
          </div>
        </div>
      );

    case 'quips/vote': {
      const size = scaleFor(view.options.length);
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <div className="flex items-start gap-8">
            <div className="flex-1">
              <p className="mb-2 text-lg font-bold tracking-[0.2em] text-rose-300 uppercase">
                Voten la mejor
              </p>
              <h2 className="text-4xl leading-tight font-black text-balance">{view.text}</h2>
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} total={30000} />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 content-center gap-4">
            {view.options.map((option) => {
              const slot = CHOICE_SLOTS[option.slot % CHOICE_SLOTS.length]!;
              return (
                <div
                  key={option.id}
                  className={`flex items-center gap-4 rounded-3xl ${size.pad}`}
                  style={{ backgroundColor: slot.color }}
                >
                  <span className="shrink-0 text-4xl">{slot.shape}</span>
                  <span
                    className={`${size.text} leading-tight font-black text-balance text-white drop-shadow`}
                  >
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
    }

    case 'quips/reveal':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <h2 className="text-3xl leading-tight font-black text-balance text-white/60">
            {view.text}
          </h2>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
            {view.entries.map((entry, index) => (
              <RevealRow
                key={entry.id}
                entry={entry}
                players={players}
                count={view.entries.length}
                delay={index * 1.1}
              />
            ))}
          </div>
          {view.blanks.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: view.entries.length * 1.1 + 0.6 }}
              className="text-xl text-white/40"
            >
              👻 {view.blanks.map((id) => players.get(id)?.name ?? '?').join(' y ')} no escribió
              nada.
            </motion.p>
          )}
        </div>
      );

    case 'quips/standings':
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

    case 'quips/done':
      return (
        <div className="m-auto text-center">
          <div className="text-9xl">✍️</div>
          <h2 className="mt-4 text-7xl font-black">No queda nada por decir</h2>
        </div>
      );
  }
}

/**
 * Mientras escriben no hay nada que mirar, así que la espera es el show: una
 * carta por cabeza que se prende cuando esa persona manda su respuesta.
 */
function WriteCard({
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

/**
 * Las respuestas se destapan de menos a más votada, así que la última fila que
 * aparece es siempre la ganadora.
 */
function RevealRow({
  entry,
  players,
  count,
  delay,
}: {
  entry: QuipReveal;
  players: Map<string, Player>;
  count: number;
  delay: number;
}) {
  const slot = CHOICE_SLOTS[entry.slot % CHOICE_SLOTS.length]!;
  const size = scaleFor(count);
  const authors = entry.authors.map((id) => players.get(id)).filter(Boolean) as Player[];

  return (
    <motion.div
      initial={{ opacity: 0, x: -28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.35 }}
      className={`flex items-center gap-4 rounded-2xl ${size.pad} ${entry.win ? 'ring-4 ring-amber-300' : ''}`}
      style={{
        backgroundColor: entry.win ? slot.color : `${slot.color}77`,
        boxShadow: entry.win ? '0 0 60px rgba(251,191,36,0.45)' : undefined,
      }}
    >
      <span className="shrink-0 text-3xl">{entry.win ? '🏆' : slot.shape}</span>
      <span className={`${size.text} font-black text-balance text-white drop-shadow`}>
        {entry.text}
      </span>

      {/* El autor se revela un toque después que la respuesta: primero la risa. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.45 }}
        className="ml-3 flex shrink-0 items-center gap-2"
      >
        {authors.map((author) => (
          <Avatar key={author.id} player={author} size={size.avatar} />
        ))}
        <span className="text-lg font-bold text-white/85">
          {authors.map((a) => a.name).join(' y ') || '—'}
        </span>
      </motion.div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {entry.sweep && (
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.7, type: 'spring', stiffness: 400 }}
            className="rounded-full bg-black/40 px-3 py-1 text-sm font-black tracking-widest text-amber-300 uppercase"
          >
            arrasó
          </motion.span>
        )}
        <div className="flex items-center gap-1">
          {entry.voters.map((id, index) => {
            const player = players.get(id);
            return player ? (
              <motion.span
                key={id}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: delay + 0.55 + index * 0.14, type: 'spring', stiffness: 400 }}
                className="text-3xl"
                title={player.name}
              >
                {player.emoji}
              </motion.span>
            ) : null;
          })}
        </div>
        {entry.points > 0 && (
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + 0.8 }}
            className="w-28 text-right text-2xl font-black text-emerald-200 tabular-nums"
          >
            +{entry.points.toLocaleString('es-AR')}
          </motion.span>
        )}
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

function HudBar({ hud, players }: { hud: QuipHud; players: Map<string, Player> }) {
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
