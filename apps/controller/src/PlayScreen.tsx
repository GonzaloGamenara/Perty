import { useState } from 'react';
import {
  CHOICE_SLOTS,
  type PlayerAction,
  type PlayerFrame,
  type PlayerView,
} from '@perty/protocol';
import { buzz, useCountdown } from './usePerty';

interface Props {
  frame: PlayerFrame;
  act: (action: PlayerAction) => void;
  leave: () => void;
  clockOffset: { current: number };
}

export default function PlayScreen({ frame, act, leave, clockOffset }: Props) {
  const { me, hud, view } = frame;

  return (
    <div className="flex h-full flex-col">
      <header className="safe-top flex items-center gap-3 px-4 pb-3">
        <div
          className="grid size-11 shrink-0 place-items-center rounded-xl text-2xl"
          style={{ backgroundColor: `${me.color}33`, boxShadow: `inset 0 0 0 2px ${me.color}` }}
        >
          {me.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base leading-tight font-bold">{me.name}</div>
          <div className="truncate text-xs text-white/45">
            {hud ? (
              <>
                <span className="font-semibold text-white/70">{hud.scoreLabel}</span>
                {hud.extra ? `  ·  ${hud.extra}` : ''}
              </>
            ) : (
              `Sala ${frame.room.code}`
            )}
          </div>
        </div>
        {hud?.rank && (
          <div className="shrink-0 rounded-lg bg-white/8 px-2.5 py-1 text-sm font-black">
            #{hud.rank}
          </div>
        )}
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <ViewBody view={view} act={act} clockOffset={clockOffset} leave={leave} />
      </main>
    </div>
  );
}

function ViewBody({
  view,
  act,
  clockOffset,
  leave,
}: {
  view: PlayerView;
  act: (action: PlayerAction) => void;
  clockOffset: { current: number };
  leave: () => void;
}) {
  switch (view.kind) {
    case 'lobby':
      return <Lobby canStart={view.canStart} act={act} leave={leave} />;

    case 'idle':
      return (
        <Centered emoji={view.emoji} title={view.title} subtitle={view.subtitle} />
      );

    case 'choices':
      return <Choices view={view} act={act} clockOffset={clockOffset} />;

    case 'wager':
      return <Wager view={view} act={act} clockOffset={clockOffset} />;

    case 'verdict':
      return <Verdict view={view} />;

    case 'buzzer':
      return (
        <button
          disabled={!view.armed || view.pressed}
          onPointerDown={() => {
            buzz(30);
            act({ t: 'buzz' });
          }}
          className="my-auto aspect-square w-full rounded-full bg-red-500 text-4xl font-black text-white transition active:scale-95 disabled:opacity-30"
        >
          {view.label}
        </button>
      );

    case 'tapper':
      return <Tapper view={view} act={act} clockOffset={clockOffset} />;

    case 'text':
      return <TextEntry view={view} act={act} clockOffset={clockOffset} />;
  }
}

// ---------------------------------------------------------------------------

function Centered({
  emoji,
  title,
  subtitle,
}: {
  emoji?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="my-auto flex flex-col items-center gap-3 text-center">
      {emoji && <div className="animate-pop text-7xl">{emoji}</div>}
      <h2 className="text-3xl leading-tight font-black text-balance">{title}</h2>
      {subtitle && <p className="text-base text-balance text-white/55">{subtitle}</p>}
    </div>
  );
}

function Lobby({
  canStart,
  act,
  leave,
}: {
  canStart: boolean;
  act: (action: PlayerAction) => void;
  leave: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <Centered emoji="🛋️" title="Estás adentro" subtitle="Mirá la tele" />
      <div className="mt-auto flex flex-col gap-3">
        {canStart && (
          <button
            onClick={() => {
              buzz(20);
              act({ t: 'ready', value: true });
            }}
            className="rounded-2xl bg-emerald-400 py-5 text-xl font-black text-black transition active:scale-[0.98]"
          >
            Empezar la partida
          </button>
        )}
        <button onClick={leave} className="py-2 text-sm text-white/35">
          Salir de la sala
        </button>
      </div>
    </div>
  );
}

function TimerBar({
  deadline,
  clockOffset,
}: {
  deadline?: number;
  clockOffset: { current: number };
}) {
  const { ms, seconds, active } = useCountdown(deadline, clockOffset);
  if (!active) return null;
  const urgent = ms < 5000;
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-red-500' : 'bg-white/70'}`}
          style={{ width: `${Math.min(100, (ms / 20000) * 100)}%` }}
        />
      </div>
      <span
        className={`w-8 text-right text-lg font-black tabular-nums ${urgent ? 'text-red-400' : 'text-white/60'}`}
      >
        {seconds}
      </span>
    </div>
  );
}

function Choices({
  view,
  act,
  clockOffset,
}: {
  view: Extract<PlayerView, { kind: 'choices' }>;
  act: (action: PlayerAction) => void;
  clockOffset: { current: number };
}) {
  const locked = view.locked;
  return (
    <div className="flex h-full flex-col">
      <TimerBar deadline={view.deadline} clockOffset={clockOffset} />
      {view.prompt && (
        <p className="mb-3 text-center text-lg leading-snug font-bold text-balance">
          {view.prompt}
        </p>
      )}
      {view.hint && (
        <p className="mb-3 text-center text-xs font-semibold tracking-wide text-white/40 uppercase">
          {view.hint}
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        {view.choices.map((choice) => {
          const slot = CHOICE_SLOTS[choice.slot % CHOICE_SLOTS.length]!;
          const isMine = locked === choice.id;
          const dimmed = locked && !isMine;
          return (
            <button
              key={choice.id}
              disabled={!!locked}
              onPointerDown={() => {
                buzz(18);
                act({ t: 'choose', choiceId: choice.id });
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl p-3 text-center transition ${dimmed ? 'opacity-20' : 'opacity-100'} ${isMine ? 'ring-4 ring-white' : ''} active:scale-[0.97]`}
              style={{ backgroundColor: slot.color }}
            >
              <span className={view.blind ? 'text-6xl' : 'text-2xl'}>{slot.shape}</span>
              {!view.blind && (
                <span className="text-base leading-tight font-bold text-balance text-white drop-shadow">
                  {choice.label}
                </span>
              )}
              {view.blind && (
                <span className="text-xs font-bold text-white/80 uppercase">{slot.name}</span>
              )}
            </button>
          );
        })}
      </div>
      {locked && (
        <p className="mt-3 text-center text-sm font-semibold text-white/40">
          Respuesta enviada · esperando al resto
        </p>
      )}
    </div>
  );
}

function Wager({
  view,
  act,
  clockOffset,
}: {
  view: Extract<PlayerView, { kind: 'wager' }>;
  act: (action: PlayerAction) => void;
  clockOffset: { current: number };
}) {
  return (
    <div className="flex h-full flex-col">
      <TimerBar deadline={view.deadline} clockOffset={clockOffset} />
      <div className="my-auto flex flex-col gap-4">
        <div className="text-center">
          <div className="text-6xl">💰</div>
          <h2 className="mt-2 text-2xl font-black">{view.prompt}</h2>
          {view.hint && <p className="mt-1 text-sm text-white/50">{view.hint}</p>}
        </div>
        <div className="flex flex-col gap-3">
          {view.options.map((option) => {
            const isMine = view.locked === option.value;
            return (
              <button
                key={option.value}
                disabled={option.disabled || view.locked !== undefined}
                onPointerDown={() => {
                  buzz(18);
                  act({ t: 'wager', value: option.value });
                }}
                className={`rounded-2xl py-5 text-2xl font-black transition active:scale-[0.98] disabled:opacity-25 ${isMine ? 'bg-emerald-400 text-black' : 'bg-panel text-white'}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Verdict({ view }: { view: Extract<PlayerView, { kind: 'verdict' }> }) {
  const tone =
    view.tone === 'good'
      ? 'from-emerald-500/30 text-emerald-300'
      : view.tone === 'bad'
        ? 'from-red-500/25 text-red-300'
        : 'from-white/10 text-white/70';
  return (
    <div
      className={`my-auto flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-b ${tone} to-transparent px-4 py-10 text-center`}
    >
      <div className="animate-pop text-8xl">{view.emoji ?? '❔'}</div>
      <h2 className="text-3xl font-black text-white text-balance">{view.title}</h2>
      {view.subtitle && <p className="text-base text-white/60 text-balance">{view.subtitle}</p>}
      {view.delta !== undefined && view.delta !== 0 && (
        <p className="text-4xl font-black tabular-nums">
          {view.delta > 0 ? '+' : ''}
          {view.delta.toLocaleString('es-AR')}
          {view.deltaSuffix ? ` ${view.deltaSuffix}` : ''}
        </p>
      )}
    </div>
  );
}

function Tapper({
  view,
  act,
  clockOffset,
}: {
  view: Extract<PlayerView, { kind: 'tapper' }>;
  act: (action: PlayerAction) => void;
  clockOffset: { current: number };
}) {
  return (
    <div className="flex h-full flex-col">
      <TimerBar deadline={view.deadline} clockOffset={clockOffset} />
      <button
        onPointerDown={() => {
          buzz(8);
          act({ t: 'tap' });
        }}
        className="my-auto flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-full bg-fuchsia-500 transition active:scale-95"
      >
        <span className="text-5xl font-black tabular-nums">{view.count}</span>
        <span className="text-lg font-bold">{view.label}</span>
      </button>
    </div>
  );
}

function TextEntry({
  view,
  act,
  clockOffset,
}: {
  view: Extract<PlayerView, { kind: 'text' }>;
  act: (action: PlayerAction) => void;
  clockOffset: { current: number };
}) {
  const [text, setText] = useState('');
  const sent = view.submitted !== undefined;
  // En modo numérico solo pasan dígitos: nada de "como 500" ni "500!".
  const clean = (raw: string) =>
    view.numeric ? raw.replace(/[^0-9]/g, '').slice(0, view.maxLength) : raw;

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!sent && text.trim()) act({ t: 'submitText', text: text.trim() });
      }}
    >
      <TimerBar deadline={view.deadline} clockOffset={clockOffset} />
      <div className="my-auto flex flex-col gap-4">
      <h2 className="text-center text-2xl font-black text-balance">{view.prompt}</h2>
      {view.hint && <p className="-mt-2 text-center text-sm text-white/45">{view.hint}</p>}
      <input
        value={sent ? view.submitted : text}
        disabled={sent}
        maxLength={view.maxLength}
        placeholder={view.placeholder}
        inputMode={view.numeric ? 'numeric' : 'text'}
        onChange={(event) => setText(clean(event.target.value))}
        enterKeyHint="send"
        className={`rounded-2xl border border-line bg-panel px-4 py-4 text-center font-bold outline-none focus:border-white/40 disabled:opacity-50 ${view.numeric ? 'text-4xl tabular-nums' : 'text-xl'}`}
      />
      <button
        type="submit"
        disabled={sent || !text.trim()}
        className="rounded-2xl bg-white py-4 text-lg font-black text-black disabled:opacity-25"
      >
        {sent ? 'Enviado' : 'Enviar'}
      </button>
      </div>
    </form>
  );
}
