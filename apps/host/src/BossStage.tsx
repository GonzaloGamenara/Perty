import { AnimatePresence, motion } from 'motion/react';
import { CHOICE_SLOTS, type Choice, type Player, type RoomSnapshot } from '@perty/protocol';
import type { BossHostView, BossHud, MechanicHostView } from '@perty/games';
import { Avatar, Fade, Rolling, Stage, TimerRing, playerMap } from './bits';
import { useCountdown } from './useHost';

interface Props {
  view: BossHostView;
  room: RoomSnapshot;
  clockOffset: { current: number };
}

export default function BossStage({ view, room, clockOffset }: Props) {
  const players = playerMap(room.players);

  return (
    <Stage glowA={view.hud.color} glowB="#7f1d1d">
      <BossBar hud={view.hud} />
      <div className="flex min-h-0 flex-1 flex-col px-8 pb-4">
        <AnimatePresence mode="wait">
          <Fade keyName={view.kind} className="flex min-h-0 flex-1 flex-col">
            <Body view={view} players={players} clockOffset={clockOffset} />
          </Fade>
        </AnimatePresence>
      </div>
      <DamageBar hud={view.hud} players={players} />
    </Stage>
  );
}

// ---------------------------------------------------------------------------

function BossBar({ hud }: { hud: BossHud }) {
  const hpRatio = Math.max(0, hud.hp / hud.maxHp);
  const chargeRatio = Math.min(1, hud.charge / hud.chargeMax);
  const cornered = hpRatio < 0.25;

  return (
    <header className="relative z-10 flex items-center gap-6 px-8 pt-6 pb-4">
      {/* La sacudida se rearma con cada cambio de vida: acusa el golpe. */}
      <motion.div
        key={hud.hp}
        animate={{ x: [0, -10, 9, -6, 4, 0] }}
        transition={{ duration: 0.45 }}
        className="shrink-0"
      >
        <motion.div
          animate={cornered ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ repeat: cornered ? Infinity : 0, duration: 1.1 }}
          className="text-7xl leading-none"
        >
          {hud.emoji}
        </motion.div>
      </motion.div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <h1 className="text-4xl font-black" style={{ color: hud.color }}>
            {hud.name}
          </h1>
          <span className="truncate text-lg text-white/40">{hud.title}</span>
          <span className="ml-auto text-lg font-bold text-white/35 tabular-nums">
            <Rolling value={Math.max(0, hud.hp)} /> / {hud.maxHp.toLocaleString('es-AR')}
          </span>
        </div>

        {/* Dos barras: la roja se queda atrás un instante y muestra el mordisco. */}
        <div className="relative mt-2 h-6 overflow-hidden rounded-full bg-white/8">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-red-400/70"
            initial={{ width: '100%' }}
            animate={{ width: `${hpRatio * 100}%` }}
            transition={{ delay: 0.55, duration: 0.7, ease: 'easeOut' }}
          />
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${cornered ? 'bg-red-500' : 'bg-emerald-500'}`}
            initial={{ width: '100%' }}
            animate={{ width: `${hpRatio * 100}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          />
        </div>

        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs font-bold tracking-widest text-white/30 uppercase">Ataque</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full bg-fuchsia-500"
              initial={{ width: 0 }}
              animate={{ width: `${chargeRatio * 100}%` }}
            />
          </div>
          {hud.combo >= 2 && (
            <span className="text-sm font-black text-amber-300">🔥 combo x{hud.combo}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <motion.div key={hud.hearts} className="flex gap-1 text-3xl">
          {Array.from({ length: hud.maxHearts }, (_, index) => {
            const alive = index < hud.hearts;
            return (
              <motion.span
                key={index}
                animate={alive ? { scale: 1 } : { scale: [1.6, 0.9, 1], rotate: [0, -20, 0] }}
                transition={{ duration: 0.5 }}
                className={alive ? '' : 'opacity-15 grayscale'}
              >
                ❤️
              </motion.span>
            );
          })}
        </motion.div>
        <span className="text-xs font-bold tracking-widest text-white/30 uppercase">
          ronda {hud.round}/{hud.maxRounds}
        </span>
      </div>
    </header>
  );
}

function DamageBar({ hud, players }: { hud: BossHud; players: Map<string, Player> }) {
  const max = Math.max(1, ...hud.damage.map((d) => d.damage));
  return (
    <footer className="relative z-10 flex items-center gap-8 border-t border-line bg-black/40 px-8 py-3 backdrop-blur">
      {hud.damage.map((entry) => {
        const player = players.get(entry.playerId);
        if (!player) return null;
        return (
          <div key={entry.playerId} className="flex flex-1 items-center gap-3">
            <Avatar player={player} size="sm" dim={!player.connected} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{player.name}</div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: player.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(entry.damage / max) * 100}%` }}
                />
              </div>
            </div>
            <Rolling value={entry.damage} className="text-lg font-black tabular-nums" />
          </div>
        );
      })}
    </footer>
  );
}

// ---------------------------------------------------------------------------

function Body({
  view,
  players,
  clockOffset,
}: {
  view: BossHostView;
  players: Map<string, Player>;
  clockOffset: { current: number };
}) {
  switch (view.kind) {
    case 'boss/intro':
      return (
        <div className="m-auto max-w-5xl text-center">
          <p className="text-2xl font-bold tracking-[0.3em] text-white/35 uppercase">
            Aparece {view.hud.title}
          </p>
          <p className="mt-6 text-5xl leading-tight font-black text-balance italic">
            «{view.taunt}»
          </p>
        </div>
      );

    case 'boss/question':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          <div className="flex items-start gap-8">
            <div className="flex-1">
              <p
                className="text-lg font-bold tracking-[0.2em] uppercase"
                style={{ color: view.category.color }}
              >
                {view.category.emoji} {view.category.name}
              </p>
              <h2 className="mt-2 text-5xl leading-tight font-black text-balance">{view.text}</h2>
            </div>
            <Countdown deadline={view.endsAt} clockOffset={clockOffset} total={16000} />
          </div>
          <ChoiceGrid choices={view.choices} />
          <AnsweredStrip players={players} answered={view.answered} />
        </div>
      );

    case 'boss/reveal':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          <div className="flex items-center gap-6">
            <h2 className="flex-1 text-3xl font-black text-white/50 text-balance">{view.text}</h2>
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="text-right"
            >
              <div className="text-7xl font-black text-red-400 tabular-nums">
                -{view.roundDamage.toLocaleString('es-AR')}
              </div>
              <div className="text-sm font-bold tracking-widest text-white/30 uppercase">daño</div>
            </motion.div>
          </div>
          <ChoiceGrid choices={view.choices} correctId={view.correctChoiceId} />
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="text-2xl text-white/45 italic"
          >
            «{view.taunt}»
          </motion.p>
        </div>
      );

    case 'boss/telegraph':
      return (
        <div className="m-auto flex flex-col items-center gap-5 text-center">
          <motion.p
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ repeat: Infinity, duration: 0.9 }}
            className="text-2xl font-black tracking-[0.4em] text-red-400 uppercase"
          >
            El jefe ataca
          </motion.p>
          <motion.div
            initial={{ scale: 0.4, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 13 }}
            className="text-[9rem] leading-none"
          >
            {view.mechanic.emoji}
          </motion.div>
          <h2 className="text-7xl font-black">{view.mechanic.name}</h2>
          <p className="max-w-4xl text-3xl text-balance text-white/65">
            {view.mechanic.description}
          </p>
          <p className="text-xl text-white/35 italic">«{view.taunt}»</p>
        </div>
      );

    case 'boss/mechanic':
      return (
        <MechanicBody mechanic={view.mechanic} players={players} clockOffset={clockOffset} />
      );

    case 'boss/mechanicResult':
      return (
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <div className="text-[9rem] leading-none">{view.outcome.survived ? '🛡️' : '💔'}</div>
          <h2
            className={`text-7xl font-black ${view.outcome.survived ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {view.outcome.headline}
          </h2>
          <p className="text-3xl text-white/50">{view.outcome.detail}</p>
        </div>
      );

    case 'boss/finale':
      return (
        <div className="m-auto flex flex-col items-center gap-5 text-center">
          <div className="text-[10rem] leading-none">{view.won ? '🏆' : '💀'}</div>
          <h2 className="text-8xl font-black">
            {view.won ? '¡Lo bajaron!' : `Ganó ${view.hud.name}`}
          </h2>
          <p className="max-w-5xl text-3xl text-balance text-white/55 italic">«{view.taunt}»</p>
        </div>
      );
  }
}

function MechanicBody({
  mechanic,
  players,
  clockOffset,
}: {
  mechanic: MechanicHostView;
  players: Map<string, Player>;
  clockOffset: { current: number };
}) {
  if (mechanic.kind === 'barrido') {
    const ratio = Math.min(1, mechanic.progress / mechanic.target);
    return (
      <div className="m-auto flex w-full max-w-5xl flex-col items-center gap-6 text-center">
        <h2 className="text-6xl font-black">{mechanic.name}</h2>
        <p className="text-2xl text-white/55">{mechanic.instruction}</p>
        <div className="h-16 w-full overflow-hidden rounded-full bg-white/8">
          <motion.div
            className={`h-full rounded-full ${ratio >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`}
            initial={{ width: 0 }}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ duration: 0.12 }}
          />
        </div>
        <p className="text-5xl font-black tabular-nums">
          {mechanic.progress}
          <span className="text-white/30"> / {mechanic.target}</span>
        </p>
        <div className="flex gap-8">
          {mechanic.taps.map((entry) => {
            const player = players.get(entry.playerId);
            if (!player) return null;
            return (
              <div key={entry.playerId} className="flex flex-col items-center gap-1">
                <Avatar player={player} size="sm" />
                <span className="text-2xl font-black tabular-nums">{entry.count}</span>
              </div>
            );
          })}
        </div>
        <Countdown deadline={mechanic.endsAt} clockOffset={clockOffset} total={7000} />
      </div>
    );
  }

  if (mechanic.kind === 'escudo') {
    return (
      <div className="m-auto flex w-full max-w-6xl flex-col items-center gap-6 text-center">
        <h2 className="text-5xl font-black">{mechanic.name}</h2>
        <p className="text-2xl text-white/55">{mechanic.instruction}</p>

        <div className="flex gap-5">
          {mechanic.runes.map((rune, index) => {
            const slot = CHOICE_SLOTS[index % CHOICE_SLOTS.length]!;
            const takenBy = mechanic.picks.filter((pick) => pick.runeId === rune.id);
            return (
              <div
                key={rune.id}
                className="flex w-44 flex-col items-center gap-2 rounded-3xl px-4 py-5"
                style={{ backgroundColor: slot.color }}
              >
                <span className="text-6xl">{rune.glyph}</span>
                <span className="text-xl font-black text-white">{rune.name}</span>
                <span className="text-3xl">{slot.shape}</span>
                <div className="flex min-h-8 gap-1">
                  {takenBy.map((pick) => {
                    const player = players.get(pick.playerId);
                    return player ? (
                      <span key={pick.playerId} className="text-2xl">
                        {player.emoji}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {mechanic.clash && (
          <motion.p
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 0.7 }}
            className="text-3xl font-black text-red-400"
          >
            ¡Están repitiendo runa!
          </motion.p>
        )}
        <Countdown deadline={mechanic.endsAt} clockOffset={clockOffset} total={15000} />
      </div>
    );
  }

  const marked = players.get(mechanic.markedId);
  return (
    <div className="m-auto flex w-full max-w-5xl flex-col items-center gap-6 text-center">
      <h2 className="text-5xl font-black">{mechanic.name}</h2>
      {marked && (
        <div className="flex items-center gap-4">
          <Avatar player={marked} size="lg" />
          <div className="text-left">
            <p className="text-5xl font-black" style={{ color: marked.color }}>
              {marked.name}
            </p>
            <p className="text-2xl text-white/55">tiene la pregunta. Que la dicte.</p>
          </div>
        </div>
      )}
      {/* Sin texto a propósito: la información la tiene solo el marcado. */}
      <div className="flex gap-4">
        {mechanic.choices.map((choice) => {
          const slot = CHOICE_SLOTS[choice.slot % CHOICE_SLOTS.length]!;
          return (
            <div
              key={choice.id}
              className="grid size-28 place-items-center rounded-3xl text-6xl"
              style={{ backgroundColor: slot.color }}
            >
              {slot.shape}
            </div>
          );
        })}
      </div>
      <AnsweredStrip players={players} answered={mechanic.answered} except={mechanic.markedId} />
      <Countdown deadline={mechanic.endsAt} clockOffset={clockOffset} total={22000} />
    </div>
  );
}

// ---------------------------------------------------------------------------

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
            animate={{ scale: isCorrect ? 1.04 : 1, opacity: dimmed ? 0.12 : 1 }}
            transition={{
              delay: isCorrect ? 0.2 : 0,
              type: 'spring',
              stiffness: 280,
              damping: 16,
            }}
            className={`flex items-center gap-5 rounded-3xl px-7 py-4 ${isCorrect ? 'ring-6 ring-white' : ''}`}
            style={{
              backgroundColor: slot.color,
              boxShadow: isCorrect ? '0 0 70px rgba(255,255,255,0.4)' : undefined,
            }}
          >
            <span className="text-4xl">{slot.shape}</span>
            <span className="text-3xl leading-tight font-black text-white drop-shadow">
              {choice.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

function AnsweredStrip({
  players,
  answered,
  except,
}: {
  players: Map<string, Player>;
  answered: string[];
  except?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      {[...players.values()]
        .filter((player) => player.id !== except)
        .map((player) => (
          <div key={player.id} className="flex items-center gap-2">
            <Avatar player={player} size="sm" dim={!answered.includes(player.id)} />
            <span
              className={`text-lg font-bold ${answered.includes(player.id) ? 'text-white' : 'text-white/25'}`}
            >
              {player.name}
            </span>
          </div>
        ))}
    </div>
  );
}
