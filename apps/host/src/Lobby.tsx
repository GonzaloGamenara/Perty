import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import type { GameInfo, RoomSnapshot, SettingSpec, SettingValues } from '@perty/protocol';
import { Avatar, Stage } from './bits';

interface Props {
  room: RoomSnapshot;
  games: GameInfo[];
  onStart: (gameId: string, settings: SettingValues) => void;
}

export default function Lobby({ room, games, onStart }: Props) {
  const [qr, setQr] = useState<string>('');
  const [chosen, setChosen] = useState<GameInfo | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(room.joinUrl, {
      margin: 1,
      width: 520,
      color: { dark: '#07070d', light: '#ffffff' },
    }).then(setQr);
  }, [room.joinUrl]);

  return (
    <Stage glowA="#4dabf7" glowB="#c084fc">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,380px)_1fr] gap-8 p-8">
        <aside className="flex flex-col items-center gap-5 rounded-3xl border border-line bg-panel/70 p-7 backdrop-blur">
          <div className="text-center">
            <p className="text-sm font-bold tracking-[0.25em] text-white/40 uppercase">
              Escaneá y jugá
            </p>
            <h2 className="mt-1 text-7xl font-black tracking-tight tabular-nums">{room.code}</h2>
          </div>
          <div className="rounded-2xl bg-white p-3">
            {qr ? (
              <img src={qr} alt="Código QR para unirse" className="size-56" />
            ) : (
              <div className="size-56 animate-pulse rounded bg-white/50" />
            )}
          </div>
          <p className="text-center text-sm break-all text-white/40">{room.joinUrl}</p>

          <div className="mt-auto flex w-full flex-wrap justify-center gap-4 pt-4">
            <AnimatePresence mode="popLayout">
              {room.players.map((player) => (
                <motion.div
                  key={player.id}
                  layout
                  initial={{ opacity: 0, scale: 0.6, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                  className="flex flex-col items-center gap-1"
                >
                  <Avatar player={player} size="sm" dim={!player.connected} />
                  <span className="max-w-20 truncate text-sm font-bold">{player.name}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          {chosen ? (
            <SettingsPanel
              game={chosen}
              players={room.players.length}
              onBack={() => setChosen(null)}
              onStart={(settings) => onStart(chosen.id, settings)}
            />
          ) : (
            <GamePicker games={games} players={room.players.length} onPick={setChosen} />
          )}
        </section>
      </div>
    </Stage>
  );
}

// ---------------------------------------------------------------------------

function GamePicker({
  games,
  players,
  onPick,
}: {
  games: GameInfo[];
  players: number;
  onPick: (game: GameInfo) => void;
}) {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-6xl font-black tracking-tight">
          Perty <span className="text-white/25">lobby</span>
        </h1>
        <p className="mt-1 text-xl text-white/45">
          {players === 0
            ? 'Esperando que entre alguien…'
            : `${players} en la sala · elegí el juego`}
        </p>
      </header>

      <div className="grid grid-cols-2 content-start gap-4">
        {games.map((game) => {
          const enough = players >= game.minPlayers;
          return (
            <button
              key={game.id}
              disabled={!enough}
              onClick={() => onPick(game)}
              className="flex flex-col gap-2 rounded-3xl border border-line bg-panel p-6 text-left transition hover:border-white/40 hover:bg-white/5 disabled:opacity-30"
            >
              <span className="text-5xl">{game.emoji}</span>
              <span className="text-2xl font-black">{game.name}</span>
              <span className="text-sm text-white/45">{game.tagline}</span>
              {!enough && (
                <span className="text-xs font-bold text-amber-400">
                  Necesita {game.minPlayers} jugadores
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function SettingsPanel({
  game,
  players,
  onBack,
  onStart,
}: {
  game: GameInfo;
  players: number;
  onBack: () => void;
  onStart: (settings: SettingValues) => void;
}) {
  const specs = useMemo(() => game.settings ?? [], [game]);
  const [values, setValues] = useState<SettingValues>(() =>
    Object.fromEntries(specs.map((spec) => [spec.id, spec.default])),
  );

  const enough = players >= game.minPlayers;

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="mb-5 flex items-center gap-4">
        <span className="text-5xl">{game.emoji}</span>
        <div className="flex-1">
          <h1 className="text-5xl font-black tracking-tight">{game.name}</h1>
          <p className="text-lg text-white/45">{game.tagline}</p>
        </div>
        <button
          onClick={onBack}
          className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-white/50 transition hover:border-white/40 hover:text-white"
        >
          ← Otro juego
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2">
        {specs.map((spec) => (
          <Setting
            key={spec.id}
            spec={spec}
            value={values[spec.id]}
            onChoose={(next) => setValues((current) => ({ ...current, [spec.id]: next }))}
            onToggle={(optionId) =>
              setValues((current) =>
                spec.kind === 'toggles' ? toggle(current, spec, optionId) : current,
              )
            }
          />
        ))}
      </div>

      <button
        disabled={!enough}
        onClick={() => onStart(values)}
        className="mt-6 rounded-3xl bg-white py-6 text-3xl font-black text-black transition hover:scale-[1.01] disabled:opacity-30"
      >
        Empezar
      </button>
    </motion.div>
  );
}

/**
 * Prende o apaga una opción sobre el estado más fresco. Calcularlo en el padre
 * (y no con el array que ya tenía el hijo) evita que dos clics muy seguidos se
 * pisen: React agrupa los updates del mismo tick.
 */
function toggle(
  current: SettingValues,
  spec: Extract<SettingSpec, { kind: 'toggles' }>,
  optionId: string,
): SettingValues {
  const list = Array.isArray(current[spec.id]) ? (current[spec.id] as string[]) : spec.default;
  const on = list.includes(optionId);
  // No se puede apagar la última: el juego necesita con qué jugar.
  if (on && list.length <= (spec.min ?? 1)) return current;
  return {
    ...current,
    [spec.id]: on ? list.filter((value) => value !== optionId) : [...list, optionId],
  };
}

function Setting({
  spec,
  value,
  onChoose,
  onToggle,
}: {
  spec: SettingSpec;
  value: SettingValues[string] | undefined;
  onChoose: (next: string | number) => void;
  onToggle: (optionId: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-3">
        <h3 className="text-sm font-bold tracking-[0.2em] text-white/45 uppercase">{spec.label}</h3>
        {spec.hint && <p className="text-sm text-white/30">{spec.hint}</p>}
      </div>

      {spec.kind === 'choice' ? (
        <div className="flex flex-wrap gap-2">
          {spec.options.map((option) => {
            const active = String(value ?? spec.default) === String(option.value);
            return (
              <button
                key={String(option.value)}
                onClick={() => onChoose(option.value)}
                className={`rounded-2xl px-5 py-3 text-lg font-bold transition ${active ? 'bg-white text-black' : 'border border-line bg-panel text-white/60 hover:border-white/40'}`}
              >
                {option.emoji ? `${option.emoji} ` : ''}
                {option.label}
              </button>
            );
          })}
        </div>
      ) : (
        <Toggles spec={spec} value={value} onToggle={onToggle} />
      )}
    </div>
  );
}

function Toggles({
  spec,
  value,
  onToggle,
}: {
  spec: Extract<SettingSpec, { kind: 'toggles' }>;
  value: SettingValues[string] | undefined;
  onToggle: (optionId: string) => void;
}) {
  const selected = Array.isArray(value) ? value : spec.default;
  const min = spec.min ?? 1;

  return (
    <div className="flex flex-wrap gap-2">
      {spec.options.map((option) => {
        const id = String(option.value);
        const on = selected.includes(id);
        const locked = on && selected.length <= min;
        return (
          <button
            key={id}
            disabled={locked}
            onClick={() => onToggle(id)}
            title={locked ? `Tienen que quedar al menos ${min}` : undefined}
            className={`rounded-2xl px-4 py-2.5 text-base font-bold transition ${on ? 'bg-white text-black' : 'border border-line bg-panel text-white/35 hover:border-white/40'} ${locked ? 'cursor-not-allowed' : ''}`}
          >
            {option.emoji ? `${option.emoji} ` : ''}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
