import { useState } from 'react';
import type { GameInfo, PlayerAction, PlayerView, SettingSpec } from '@perty/protocol';
import { buzz } from './usePerty';

type LobbyView = Extract<PlayerView, { kind: 'lobby' }>;

/**
 * El lobby vive acá y no en la tele: a una smart TV no se le puede hacer clic.
 *
 * Va en dos pasos a propósito. Todo junto era un scroll largo donde el botón de
 * empezar quedaba enterrado abajo; así cada pantalla tiene una sola decisión y
 * el botón principal está siempre a la vista.
 */
export default function LobbyScreen({
  view,
  act,
  leave,
}: {
  view: LobbyView;
  act: (action: PlayerAction) => void;
  leave: () => void;
}) {
  const [step, setStep] = useState<'games' | 'setup'>('games');

  if (!view.isVip) return <Waiting view={view} leave={leave} />;

  const selected = view.games.find((game) => game.id === view.selectedGameId) ?? null;

  if (step === 'games' || !selected) {
    return (
      <div className="flex h-full flex-col">
        <h2 className="mb-4 text-center text-2xl font-black">¿A qué jugamos?</h2>
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto">
          {view.games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              missing={Math.max(0, game.minPlayers - view.playerCount)}
              onPick={() => {
                buzz(18);
                act({ t: 'selectGame', gameId: game.id });
                setStep('setup');
              }}
            />
          ))}
        </div>
        <Footer view={view} act={act} leave={leave} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-center gap-3">
        <button
          onClick={() => setStep('games')}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-lg"
          aria-label="Cambiar de juego"
        >
          ←
        </button>
        <span className="text-3xl">{selected.emoji}</span>
        <span className="min-w-0 flex-1 truncate text-xl font-black">{selected.name}</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-2">
        {selected.settings?.map((spec) => (
          <Setting
            key={spec.id}
            spec={spec}
            value={view.settings[spec.id]}
            onChange={(value) => {
              buzz(10);
              act({ t: 'setSetting', id: spec.id, value });
            }}
          />
        ))}
      </div>

      <Footer view={view} act={act} leave={leave} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Waiting({ view, leave }: { view: LobbyView; leave: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="my-auto flex flex-col items-center gap-3 text-center">
        <div className="animate-pop text-7xl">🛋️</div>
        <h2 className="text-3xl leading-tight font-black text-balance">Estás adentro</h2>
        <p className="text-base text-balance text-white/55">
          {view.vipName} está armando la partida. Mirá la tele.
        </p>
      </div>
      <button onClick={leave} className="mt-auto py-2 text-sm text-white/35">
        Salir de la sala
      </button>
    </div>
  );
}

/** Barra fija de abajo: jugadores, bots y el botón que importa. */
function Footer({
  view,
  act,
  leave,
}: {
  view: LobbyView;
  act: (action: PlayerAction) => void;
  leave: () => void;
}) {
  return (
    <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-white/40">{view.playerCount} jugando</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => {
              buzz(12);
              act({ t: 'addBot' });
            }}
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-bold text-white/60"
          >
            🤖 + bot
          </button>
          <button
            onClick={() => act({ t: 'removeBots' })}
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-bold text-white/35"
          >
            sacar
          </button>
          <button onClick={leave} className="px-2 py-1.5 text-xs text-white/25">
            salir
          </button>
        </div>
      </div>

      {view.blocked && (
        <p className="text-center text-sm font-semibold text-amber-400">{view.blocked}</p>
      )}
      <button
        disabled={!!view.blocked}
        onClick={() => {
          buzz(25);
          act({ t: 'startGame' });
        }}
        className="rounded-2xl bg-emerald-400 py-4 text-xl font-black text-black transition active:scale-[0.98] disabled:opacity-25"
      >
        Empezar
      </button>
    </div>
  );
}

function GameCard({
  game,
  missing,
  onPick,
}: {
  game: GameInfo;
  /** Cuanta gente falta para poder elegirlo. Cero significa que ya entra. */
  missing: number;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      disabled={missing > 0}
      className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-panel p-4 text-center transition active:scale-[0.97] disabled:opacity-35"
    >
      <span className="text-4xl">{game.emoji}</span>
      <span className="text-sm leading-tight font-black text-balance">{game.name}</span>
      {missing > 0 && (
        <span className="text-[11px] font-bold text-amber-400">
          {missing === 1 ? 'Falta 1 jugador' : `Faltan ${missing} jugadores`}
        </span>
      )}
    </button>
  );
}

function Setting({
  spec,
  value,
  onChange,
}: {
  spec: SettingSpec;
  value: string | number | string[] | undefined;
  onChange: (value: string | number | string[]) => void;
}) {
  const selected = spec.kind === 'toggles' ? (Array.isArray(value) ? value : spec.default) : [];
  const min = spec.kind === 'toggles' ? (spec.min ?? 1) : 1;

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-xs font-bold tracking-[0.2em] text-white/40 uppercase">{spec.label}</h3>
        {spec.kind === 'toggles' && (
          <span className="text-xs text-white/25">
            {selected.length}/{spec.options.length}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {spec.options.map((option) => {
          const id = String(option.value);
          const on =
            spec.kind === 'choice' ? String(value ?? spec.default) === id : selected.includes(id);
          // No se puede apagar la última: el juego necesita con qué jugar.
          const locked = spec.kind === 'toggles' && on && selected.length <= min;

          return (
            <button
              key={id}
              disabled={locked}
              onClick={() =>
                spec.kind === 'choice'
                  ? onChange(option.value)
                  : onChange(on ? selected.filter((item) => item !== id) : [...selected, id])
              }
              className={`rounded-xl px-3.5 py-2.5 text-sm font-bold transition active:scale-95 ${
                on ? 'bg-white text-black' : 'border border-line bg-panel text-white/45'
              }`}
            >
              {option.emoji ? `${option.emoji} ` : ''}
              {option.label}
            </button>
          );
        })}
      </div>

      {spec.hint && <p className="mt-1.5 text-xs text-white/30">{spec.hint}</p>}
    </section>
  );
}
