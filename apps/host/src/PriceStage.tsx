import { AnimatePresence, motion } from 'motion/react';
import type { Player, RoomSnapshot } from '@perty/protocol';
import type { PriceHostView, PriceHud, PriceOutcome, PriceScale } from '@perty/games';
import { Avatar, Fade, Rolling, Stage, TimerRing, playerMap } from './bits';
import { useCountdown } from './useHost';

interface Props {
  view: PriceHostView;
  room: RoomSnapshot;
  clockOffset: { current: number };
}

export default function PriceStage({ view, room, clockOffset }: Props) {
  const players = playerMap(room.players);

  return (
    <Stage glowA="#22d3ee" glowB="#f59e0b">
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

const format = (value: number) => Math.round(value).toLocaleString('es-AR');

function Body({
  view,
  players,
  clockOffset,
}: {
  view: PriceHostView;
  players: Map<string, Player>;
  clockOffset: { current: number };
}) {
  switch (view.kind) {
    case 'price/intro':
      return (
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-white/35 uppercase">
            Ronda {view.hud.round} de {view.hud.totalRounds}
          </p>
          <div className="text-[10rem] leading-none">🎯</div>
          <h2 className="text-6xl font-black">El Precio Justo</h2>
          <p className="text-3xl" style={{ color: view.category.color }}>
            {view.category.emoji} {view.category.name}
          </p>
          {view.hud.noOvershoot && (
            <p className="mt-2 rounded-full bg-amber-400/15 px-5 py-2 text-xl font-bold text-amber-300">
              😬 Sin pasarse
            </p>
          )}
        </div>
      );

    case 'price/guess':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <div className="flex items-start gap-8">
            <div className="flex-1">
              <p
                className="text-lg font-bold tracking-[0.2em] uppercase"
                style={{ color: view.category.color }}
              >
                {view.category.emoji} {view.category.name}
                {view.unit ? ` · en ${view.unit}` : ''}
              </p>
              <h2 className="mt-3 text-6xl leading-tight font-black text-balance">{view.text}</h2>
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} total={25000} />
          </div>

          <div className="m-auto flex gap-10">
            {[...players.values()].map((player) => {
              const ready = view.ready.includes(player.id);
              return (
                <div key={player.id} className="flex flex-col items-center gap-2">
                  <Avatar player={player} dim={!ready} />
                  <span className="text-lg font-bold">{player.name}</span>
                  {/* El número no se muestra: se revelan todos juntos. */}
                  <span className={`text-2xl ${ready ? '' : 'opacity-20'}`}>
                    {ready ? '🔒' : '🤔'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );

    case 'price/reveal':
      return <Reveal view={view} players={players} />;

    case 'price/standings':
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

    case 'price/done':
      return (
        <div className="m-auto text-center">
          <div className="text-9xl">🎯</div>
          <h2 className="mt-4 text-7xl font-black">Se acabaron los números</h2>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------

function Reveal({
  view,
  players,
}: {
  view: Extract<PriceHostView, { kind: 'price/reveal' }>;
  players: Map<string, Player>;
}) {
  const { scale, answer, outcomes } = view;
  const guessed = outcomes.filter((o) => o.guess !== null);
  const missing = outcomes.filter((o) => o.guess === null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex items-baseline gap-6">
        <h2 className="flex-1 text-3xl font-black text-white/55 text-balance">{view.text}</h2>
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 16 }}
          className="text-right"
        >
          <div className="text-7xl font-black text-emerald-400 tabular-nums">{format(answer)}</div>
          <div className="text-sm font-bold tracking-widest text-white/30 uppercase">
            {view.unit ?? 'la respuesta'}
          </div>
        </motion.div>
      </div>

      <NumberLine scale={scale} answer={answer} outcomes={guessed} players={players} />

      <div className="flex flex-wrap justify-center gap-3">
        {outcomes.map((outcome) => {
          const player = players.get(outcome.playerId);
          return player ? (
            <OutcomeChip key={outcome.playerId} outcome={outcome} player={player} />
          ) : null;
        })}
      </div>

      {missing.length > 0 && (
        <p className="text-center text-lg text-white/35">
          {missing.map((o) => players.get(o.playerId)?.name ?? '?').join(' y ')} no tiró número.
        </p>
      )}

      {view.note && <p className="text-center text-xl text-white/40 italic">{view.note}</p>}
    </div>
  );
}

/** La recta con todas las corazonadas y, en verde, dónde estaba la verdad. */
function NumberLine({
  scale,
  answer,
  outcomes,
  players,
}: {
  scale: PriceScale;
  answer: number;
  outcomes: PriceOutcome[];
  players: Map<string, Player>;
}) {
  const span = Math.max(1e-9, scale.max - scale.min);
  const at = (value: number) =>
    `${Math.max(0, Math.min(100, ((value - scale.min) / span) * 100))}%`;

  // Los que caen cerca se escalonan hacia arriba para no taparse.
  const ordered = [...outcomes].sort((a, b) => (a.guess ?? 0) - (b.guess ?? 0));
  const level = new Map<string, number>();
  let previous: number | null = null;
  let step = 0;
  for (const outcome of ordered) {
    const pct = ((outcome.guess! - scale.min) / span) * 100;
    step = previous !== null && pct - previous < 12 ? step + 1 : 0;
    level.set(outcome.playerId, step % 3);
    previous = pct;
  }

  return (
    <div className="relative my-8 h-52">
      <div className="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded-full bg-white/12" />

      {/* La verdad */}
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ delay: 0.35, type: 'spring', stiffness: 200, damping: 18 }}
        className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ left: at(answer) }}
      >
        <div className="h-40 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.7)]" />
      </motion.div>

      {outcomes.map((outcome, index) => {
        const player = players.get(outcome.playerId);
        if (!player || outcome.guess === null) return null;
        const lift = (level.get(outcome.playerId) ?? 0) * 46;
        return (
          <motion.div
            key={outcome.playerId}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + index * 0.12 }}
            className="absolute z-20 flex -translate-x-1/2 flex-col items-center"
            style={{ left: at(outcome.guess), top: `calc(50% - ${64 + lift}px)` }}
          >
            <span className="text-2xl font-black tabular-nums" style={{ color: player.color }}>
              {format(outcome.guess)}
            </span>
            <Avatar player={player} size="sm" />
            <div className="h-3 w-0.5" style={{ backgroundColor: player.color }} />
          </motion.div>
        );
      })}

      <div className="absolute inset-x-0 top-full flex justify-between pt-2 text-sm text-white/25 tabular-nums">
        <span>{format(scale.min)}</span>
        <span>{format(scale.max)}</span>
      </div>
    </div>
  );
}

function OutcomeChip({ outcome, player }: { outcome: PriceOutcome; player: Player }) {
  const tone = outcome.exact
    ? 'border-cyan-300/60 bg-cyan-300/15'
    : outcome.over
      ? 'border-amber-400/50 bg-amber-400/10'
      : outcome.rank === 1
        ? 'border-emerald-400/50 bg-emerald-400/10'
        : 'border-line bg-panel/60';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.9 }}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${tone}`}
    >
      <Avatar player={player} size="sm" />
      <div className="leading-tight">
        <div className="text-base font-bold">{player.name}</div>
        <div className="text-sm text-white/50">
          {outcome.note ??
            (outcome.distance !== null ? `a ${format(outcome.distance)}` : 'sin número')}
        </div>
      </div>
      <span
        className={`ml-2 text-2xl font-black tabular-nums ${outcome.points > 0 ? 'text-emerald-300' : 'text-white/25'}`}
      >
        +{outcome.points}
      </span>
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

function HudBar({ hud, players }: { hud: PriceHud; players: Map<string, Player> }) {
  return (
    <footer className="relative z-10 flex items-center gap-6 border-t border-line bg-black/40 px-8 py-4 backdrop-blur">
      <div className="flex flex-col">
        <span className="text-xs font-bold tracking-widest text-white/30 uppercase">Ronda</span>
        <span className="text-2xl font-black tabular-nums">
          {hud.round}
          <span className="text-white/30">/{hud.totalRounds}</span>
        </span>
      </div>
      {hud.noOvershoot && <span className="text-2xl" title="Sin pasarse">😬</span>}
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
