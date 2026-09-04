import type { GameInfo, PlayerAction, PlayerView, SettingSpec } from '@perty/protocol';
import { buzz } from './usePerty';

type LobbyView = Extract<PlayerView, { kind: 'lobby' }>;

/**
 * El lobby vive acá y no en la tele: a una smart TV no se le puede hacer clic.
 * El que abre la sala arma la partida desde su celular y todos los demás ven en
 * la pantalla grande qué está eligiendo.
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
  if (!view.isVip) {
    const game = view.games.find((candidate) => candidate.id === view.selectedGameId);
    return (
      <div className="flex h-full flex-col">
        <div className="my-auto flex flex-col items-center gap-3 text-center">
          <div className="animate-pop text-7xl">🛋️</div>
          <h2 className="text-3xl leading-tight font-black text-balance">Estás adentro</h2>
          <p className="text-base text-balance text-white/55">
            {view.vipName} está armando la partida. Mirá la tele.
          </p>
          {game && <p className="text-lg font-bold">{game.emoji} {game.name}</p>}
        </div>
        <button onClick={leave} className="mt-auto py-2 text-sm text-white/35">
          Salir de la sala
        </button>
      </div>
    );
  }

  const selected = view.games.find((game) => game.id === view.selectedGameId) ?? null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <section>
        <Label>Juego</Label>
        <div className="flex flex-col gap-2">
          {view.games.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              active={game.id === view.selectedGameId}
              enough={view.playerCount >= game.minPlayers}
              onPick={() => {
                buzz(15);
                act({ t: 'selectGame', gameId: game.id });
              }}
            />
          ))}
        </div>
      </section>

      {selected?.settings?.map((spec) => (
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

      <section>
        <Label>Jugadores · {view.playerCount}</Label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              buzz(12);
              act({ t: 'addBot' });
            }}
            className="flex-1 rounded-xl border border-line bg-panel py-3 text-sm font-bold text-white/70"
          >
            🤖 Agregar bot
          </button>
          <button
            onClick={() => act({ t: 'removeBots' })}
            className="rounded-xl border border-line bg-panel px-4 py-3 text-sm font-bold text-white/40"
          >
            Sacar
          </button>
        </div>
      </section>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {view.blocked && (
          <p className="text-center text-sm font-semibold text-amber-400">{view.blocked}</p>
        )}
        <button
          disabled={!!view.blocked}
          onClick={() => {
            buzz(25);
            act({ t: 'startGame' });
          }}
          className="rounded-2xl bg-emerald-400 py-5 text-xl font-black text-black transition active:scale-[0.98] disabled:opacity-25"
        >
          Empezar
        </button>
        <button onClick={leave} className="py-1 text-sm text-white/30">
          Salir de la sala
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-white/35 uppercase">{children}</h3>
  );
}

function GameRow({
  game,
  active,
  enough,
  onPick,
}: {
  game: GameInfo;
  active: boolean;
  enough: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-white bg-white/10' : 'border-line bg-panel'} ${enough ? '' : 'opacity-50'}`}
    >
      <span className="text-3xl">{game.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-black">{game.name}</span>
        <span className="block truncate text-xs text-white/45">
          {enough ? game.tagline : `Necesita ${game.minPlayers} jugadores`}
        </span>
      </span>
      {active && <span className="text-xl">✓</span>}
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
  if (spec.kind === 'choice') {
    const current = String(value ?? spec.default);
    return (
      <section>
        <Label>{spec.label}</Label>
        <div className="flex flex-wrap gap-2">
          {spec.options.map((option) => (
            <button
              key={String(option.value)}
              onClick={() => onChange(option.value)}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${current === String(option.value) ? 'bg-white text-black' : 'border border-line bg-panel text-white/55'}`}
            >
              {option.emoji ? `${option.emoji} ` : ''}
              {option.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const selected = Array.isArray(value) ? value : spec.default;
  const min = spec.min ?? 1;
  return (
    <section>
      <Label>{spec.label}</Label>
      <div className="flex flex-wrap gap-2">
        {spec.options.map((option) => {
          const id = String(option.value);
          const on = selected.includes(id);
          // No se puede apagar la última: el juego necesita con qué jugar.
          const locked = on && selected.length <= min;
          return (
            <button
              key={id}
              disabled={locked}
              onClick={() =>
                onChange(on ? selected.filter((item) => item !== id) : [...selected, id])
              }
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${on ? 'bg-white text-black' : 'border border-line bg-panel text-white/30'}`}
            >
              {option.emoji ? `${option.emoji} ` : ''}
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
