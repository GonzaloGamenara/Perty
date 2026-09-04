import { AnimatePresence, motion } from 'motion/react';
import { CHOICE_SLOTS, type Choice, type Player, type RoomSnapshot } from '@perty/protocol';
import type { Hud, Outcome, StarEvent, TriviaHostView } from '@perty/games';
import { Avatar, Fade, Rolling, Stage, TimerRing, playerMap } from './bits';
import { useCountdown } from './useHost';

interface Props {
  view: TriviaHostView;
  room: RoomSnapshot;
  clockOffset: { current: number };
}

export default function TriviaStage({ view, room, clockOffset }: Props) {
  const players = playerMap(room.players);
  const glow = 'category' in view ? view.category.color : '#4dabf7';

  return (
    <Stage glowA={glow} glowB="#7c3aed">
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <AnimatePresence mode="wait">
          <Fade keyName={view.kind} className="flex min-h-0 flex-1 flex-col">
            <Body view={view} players={players} clockOffset={clockOffset} />
          </Fade>
        </AnimatePresence>
      </div>
      {view.kind === 'trivia/question' && (
        <Urgency deadline={view.endsAt} clockOffset={clockOffset} />
      )}
      <HudBar hud={view.hud} players={players} />
    </Stage>
  );
}

function Body({
  view,
  players,
  clockOffset,
}: {
  view: TriviaHostView;
  players: Map<string, Player>;
  clockOffset: { current: number };
}) {
  switch (view.kind) {
    case 'trivia/intro':
      return (
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-white/35 uppercase">
            Ronda {view.hud.round} de {view.hud.totalRounds}
          </p>
          <div className="text-[10rem] leading-none">{view.category.emoji}</div>
          <h2 className="text-7xl font-black" style={{ color: view.category.color }}>
            {view.category.name}
          </h2>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((level) => (
              <span
                key={level}
                className={`h-2 w-10 rounded-full ${level <= view.difficulty ? 'bg-white/80' : 'bg-white/15'}`}
              />
            ))}
          </div>
        </div>
      );

    case 'trivia/chaos':
      return (
        <div className="m-auto flex flex-col items-center gap-6 text-center">
          <motion.div
            initial={{ scale: 0.3, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
            className="text-[11rem] leading-none"
          >
            {view.modifier.emoji}
          </motion.div>
          <h2 className="text-8xl font-black" style={{ color: view.modifier.color }}>
            {view.modifier.name}
          </h2>
          <p className="max-w-4xl text-3xl text-balance text-white/70">
            {view.modifier.description}
          </p>
        </div>
      );

    case 'trivia/wager': {
      return (
        <div className="m-auto flex flex-col items-center gap-8 text-center">
          <div className="text-9xl">💰</div>
          <h2 className="text-6xl font-black">Apuesten sin ver la pregunta</h2>
          <div className="flex gap-8">
            {[...players.values()].map((player) => {
              const ready = view.ready.includes(player.id);
              return (
                <div key={player.id} className="flex flex-col items-center gap-2">
                  <Avatar player={player} dim={!ready} />
                  <span className="text-lg font-bold">{ready ? 'Listo' : '…'}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case 'trivia/sabotage':
      return (
        <div className="m-auto flex flex-col items-center gap-8 text-center">
          <div className="text-9xl">🔪</div>
          <h2 className="text-6xl font-black">Táchense una opción</h2>
          <p className="text-2xl text-white/50">Todavía nadie vio la pregunta.</p>
          <div className="flex flex-wrap justify-center gap-6">
            {view.pairs.map((pair) => {
              const from = players.get(pair.fromId);
              const to = players.get(pair.toId);
              if (!from || !to) return null;
              return (
                <div
                  key={pair.fromId}
                  className={`flex items-center gap-3 rounded-2xl border px-5 py-3 transition ${pair.done ? 'border-lime-400/50 bg-lime-400/10' : 'border-line bg-panel/60'}`}
                >
                  <Avatar player={from} size="sm" />
                  <span className="text-3xl">{pair.done ? '🔪' : '→'}</span>
                  <Avatar player={to} size="sm" />
                </div>
              );
            })}
          </div>
        </div>
      );

    case 'trivia/question':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <div className="flex items-start gap-8">
            <div className="flex-1">
              <p
                className="text-lg font-bold tracking-[0.2em] uppercase"
                style={{ color: view.category.color }}
              >
                {view.category.emoji} {view.category.name}
                {view.modifier && (
                  <span style={{ color: view.modifier.color }}>
                    {'  ·  '}
                    {view.modifier.emoji} {view.modifier.name}
                  </span>
                )}
              </p>
              <h2 className="mt-3 text-6xl leading-tight font-black text-balance">{view.text}</h2>
              {view.spotlight && (
                <Spotlighted spotlight={view.spotlight} players={players} />
              )}
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} />
          </div>

          <ChoiceGrid choices={view.choices} />

          <div className="flex items-center gap-4">
            {[...players.values()].map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                <Avatar player={player} size="sm" dim={!view.answered.includes(player.id)} />
                <span
                  className={`text-lg font-bold ${view.answered.includes(player.id) ? 'text-white' : 'text-white/25'}`}
                >
                  {player.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'trivia/reveal':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <h2 className="text-4xl leading-tight font-black text-white/60 text-balance">
            {view.text}
          </h2>
          <ChoiceGrid choices={view.choices} correctId={view.correctChoiceId} />
          {view.note && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.6 }}
              className="text-xl text-white/40 italic"
            >
              {view.note}
            </motion.p>
          )}
          <div className="flex flex-wrap gap-4">
            {view.outcomes.map((outcome, index) => {
              const player = players.get(outcome.playerId);
              if (!player) return null;
              return (
                <OutcomeCard
                  key={outcome.playerId}
                  outcome={outcome}
                  player={player}
                  delay={1.3 + index * 0.18}
                />
              );
            })}
          </div>
        </div>
      );

    case 'trivia/star':
      return <StarScene event={view.event} players={players} categoryName={view.category.name} />;

    case 'trivia/standings':
      return <Standings hud={view.hud} players={players} />;

    case 'trivia/done':
      return (
        <div className="m-auto text-center">
          <div className="text-9xl">🏁</div>
          <h2 className="mt-4 text-7xl font-black">Se terminó</h2>
        </div>
      );
  }
}

/** Los últimos cinco segundos laten en rojo desde los bordes de la pantalla. */
function Urgency({
  deadline,
  clockOffset,
}: {
  deadline: number;
  clockOffset: { current: number };
}) {
  const { ms } = useCountdown(deadline, clockOffset);
  if (ms <= 0 || ms > 5000) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20"
      animate={{ opacity: [0.25, 0.75, 0.25] }}
      transition={{ repeat: Infinity, duration: 0.85 }}
      style={{ boxShadow: 'inset 0 0 160px 24px rgba(239, 68, 68, 0.85)' }}
    />
  );
}

function Spotlighted({
  spotlight,
  players,
}: {
  spotlight: { playerId: string; label: string };
  players: Map<string, Player>;
}) {
  const player = players.get(spotlight.playerId);
  if (!player) return null;
  return (
    <motion.p
      animate={{ opacity: [1, 0.5, 1] }}
      transition={{ repeat: Infinity, duration: 1.2 }}
      className="mt-3 text-3xl font-black"
      style={{ color: player.color }}
    >
      {player.emoji} {player.name} <span className="text-white/60">{spotlight.label}</span>
    </motion.p>
  );
}

function Countdown({
  deadline,
  clockOffset,
}: {
  deadline: number;
  clockOffset: { current: number };
}) {
  const { ms } = useCountdown(deadline, clockOffset);
  return <TimerRing ms={ms} total={18000} />;
}

function ChoiceGrid({ choices, correctId }: { choices: Choice[]; correctId?: string }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
      {choices.map((choice) => {
        const slot = CHOICE_SLOTS[choice.slot % CHOICE_SLOTS.length]!;
        const isCorrect = correctId === choice.id;
        const dimmed = correctId !== undefined && !isCorrect;
        return (
          <motion.div
            key={choice.id}
            animate={{ scale: isCorrect ? 1.05 : 1, opacity: dimmed ? 0.12 : 1 }}
            transition={{
              // La correcta llega un pelín después: el ojo la encuentra sola.
              delay: isCorrect ? 0.2 : 0,
              type: 'spring',
              stiffness: 280,
              damping: 16,
            }}
            className={`flex items-center gap-5 rounded-3xl px-7 py-5 ${isCorrect ? 'ring-6 ring-white' : ''}`}
            style={{
              backgroundColor: slot.color,
              boxShadow: isCorrect ? '0 0 70px rgba(255,255,255,0.4)' : undefined,
            }}
          >
            <span className="text-5xl">{slot.shape}</span>
            <span className="text-4xl leading-tight font-black text-white drop-shadow">
              {choice.label}
            </span>
            {isCorrect && <span className="ml-auto text-5xl">✅</span>}
          </motion.div>
        );
      })}
    </div>
  );
}

function OutcomeCard({
  outcome,
  player,
  delay,
}: {
  outcome: Outcome;
  player: Player;
  delay: number;
}) {
  const tone = outcome.correct
    ? 'border-emerald-400/50 bg-emerald-400/10'
    : outcome.choiceId
      ? 'border-red-400/40 bg-red-400/10'
      : 'border-white/10 bg-white/5';
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 320, damping: 20 }}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${tone}`}
    >
      <Avatar player={player} size="sm" />
      <div>
        <div className="text-lg font-bold">{player.name}</div>
        <div className="text-sm text-white/50">
          {outcome.note ??
            (outcome.choiceId
              ? outcome.correct
                ? `${((outcome.ms ?? 0) / 1000).toFixed(1)}s${outcome.place === 1 ? ' · primero' : ''}`
                : 'Erró'
              : 'No contestó')}
        </div>
      </div>
      <div
        className={`ml-3 text-2xl font-black tabular-nums ${outcome.coins > 0 ? 'text-emerald-300' : outcome.coins < 0 ? 'text-red-300' : 'text-white/25'}`}
      >
        {outcome.coins > 0 ? '+' : ''}
        {outcome.coins}
      </div>
    </motion.div>
  );
}

function StarScene({
  event,
  players,
  categoryName,
}: {
  event: StarEvent;
  players: Map<string, Player>;
  categoryName: string;
}) {
  const hero = players.get(event.playerId);
  const headline =
    event.type === 'claim'
      ? 'reclamó la estrella'
      : event.type === 'steal'
        ? 'ROBÓ la estrella'
        : 'defendió su estrella';
  const rival =
    event.type === 'steal'
      ? players.get(event.fromPlayerId)
      : event.type === 'defend'
        ? players.get(event.challengerId)
        : null;

  return (
    <div className="m-auto flex flex-col items-center gap-6 text-center">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12 }}
        className="text-[12rem] leading-none"
      >
        ⭐
      </motion.div>
      <h2 className="text-6xl font-black">
        <span style={{ color: hero?.color }}>{hero?.name ?? '?'}</span>{' '}
        <span className="text-white/70">{headline}</span>
      </h2>
      <p className="text-3xl text-white/50">{categoryName}</p>
      {rival && (
        <p className="text-2xl text-white/35">
          {event.type === 'steal' ? 'se la sacó a ' : 'contra '}
          <span style={{ color: rival.color }}>{rival.name}</span>
          {event.type === 'defend' && ` · peaje de ${event.toll} monedas`}
        </p>
      )}
    </div>
  );
}

function Standings({ hud, players }: { hud: Hud; players: Map<string, Player> }) {
  const rows = [...hud.entries].sort((a, b) => b.coins - a.coins);
  const max = Math.max(1, ...rows.map((row) => row.coins));
  return (
    <div className="m-auto flex w-full max-w-5xl flex-col gap-4">
      <h2 className="mb-2 text-center text-5xl font-black">Cómo vamos</h2>
      {rows.map((row, index) => {
        const player = players.get(row.playerId);
        if (!player) return null;
        return (
          <motion.div
            key={row.playerId}
            layout
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.14, type: 'spring', stiffness: 300, damping: 26 }}
            className="flex items-center gap-5"
          >
            <span className="w-10 text-3xl font-black text-white/25">{index + 1}</span>
            <Avatar player={player} size="sm" />
            <span className="w-44 truncate text-2xl font-bold">{player.name}</span>
            <div className="h-8 flex-1 overflow-hidden rounded-full bg-white/5">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: player.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(row.coins / max) * 100}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            {row.stars > 0 && <span className="text-2xl">{'⭐'.repeat(row.stars)}</span>}
            <Rolling value={row.coins} className="w-32 text-right text-3xl font-black tabular-nums" />
          </motion.div>
        );
      })}
    </div>
  );
}

function HudBar({ hud, players }: { hud: Hud; players: Map<string, Player> }) {
  return (
    <footer className="relative z-10 flex items-center gap-6 border-t border-line bg-black/40 px-8 py-4 backdrop-blur">
      <div className="flex flex-col">
        <span className="text-xs font-bold tracking-widest text-white/30 uppercase">Ronda</span>
        <span className="text-2xl font-black tabular-nums">
          {hud.round}
          <span className="text-white/30">/{hud.totalRounds}</span>
        </span>
      </div>

      <div className="flex flex-1 items-center gap-6">
        {hud.entries.map((entry) => {
          const player = players.get(entry.playerId);
          if (!player) return null;
          return (
            <div key={entry.playerId} className="flex items-center gap-3">
              <Avatar player={player} size="sm" dim={!player.connected} />
              <div className="leading-tight">
                <div className="flex items-center gap-2 text-base font-bold">
                  {player.name}
                  {entry.streak >= 2 && <span title="racha">🔥{entry.streak}</span>}
                  {entry.stars > 0 && <span>⭐{entry.stars}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Rolling value={entry.coins} className="text-xl font-black tabular-nums" />
                  <AnimatePresence>
                    {entry.delta !== null && entry.delta !== 0 && (
                      <motion.span
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`text-sm font-black ${entry.delta > 0 ? 'text-emerald-300' : 'text-red-300'}`}
                      >
                        {entry.delta > 0 ? '+' : ''}
                        {entry.delta}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        {hud.stars.map(({ category, owner }) => {
          const player = owner ? players.get(owner) : null;
          return (
            <div
              key={category.id}
              title={`${category.name}${player ? ` · ${player.name}` : ' · libre'}`}
              className="grid size-11 place-items-center rounded-xl text-xl transition"
              style={{
                backgroundColor: player ? `${player.color}33` : '#ffffff08',
                boxShadow: player ? `inset 0 0 0 2px ${player.color}` : 'inset 0 0 0 1px #ffffff14',
                opacity: player ? 1 : 0.4,
              }}
            >
              {category.emoji}
            </div>
          );
        })}
      </div>
    </footer>
  );
}
