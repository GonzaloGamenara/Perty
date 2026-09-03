import { useEffect } from 'react';
import type { ResultsView } from '@perty/protocol';
import type {
  BossHostView,
  LiarHostView,
  PriceHostView,
  TriviaHostView,
} from '@perty/games';
import BossStage from './BossStage';
import LiarStage from './LiarStage';
import Lobby from './Lobby';
import PriceStage from './PriceStage';
import Results from './Results';
import TriviaStage from './TriviaStage';
import { Stage } from './bits';
import { useHost } from './useHost';

type GameView = TriviaHostView | BossHostView | LiarHostView | PriceHostView | ResultsView | null;

export default function App() {
  const host = useHost();
  const { action } = host;

  // Barra espaciadora = adelantar. Sirve para saltear una pregunta que nadie sabe.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        action({ t: 'advance' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [action]);

  if (!host.frame) {
    return <Splash status={host.status} error={host.error} onCreate={host.createRoom} />;
  }

  const { room } = host.frame;
  const game = host.frame.game as GameView;

  if (room.phase === 'lobby' || !game) {
    return (
      <Lobby
        room={room}
        games={host.games}
        onStart={host.startGame}
        onAddBot={host.addBot}
        onRemoveBots={host.removeBots}
      />
    );
  }

  if (game.kind === 'results') {
    return (
      <Results
        view={game}
        room={room}
        onReplay={() => host.startGame(game.gameId)}
        onLobby={host.backToLobby}
      />
    );
  }

  if (game.kind.startsWith('boss/')) {
    return <BossStage view={game as BossHostView} room={room} clockOffset={host.clockOffset} />;
  }

  if (game.kind.startsWith('liar/')) {
    return <LiarStage view={game as LiarHostView} room={room} clockOffset={host.clockOffset} />;
  }

  if (game.kind.startsWith('price/')) {
    return <PriceStage view={game as PriceHostView} room={room} clockOffset={host.clockOffset} />;
  }

  return <TriviaStage view={game as TriviaHostView} room={room} clockOffset={host.clockOffset} />;
}

function Splash({
  status,
  error,
  onCreate,
}: {
  status: string;
  error: string | null;
  onCreate: () => void;
}) {
  return (
    <Stage glowA="#4dabf7" glowB="#f472b6">
      <div className="m-auto flex flex-col items-center gap-8 text-center">
        <div className="text-[9rem] leading-none">🎉</div>
        <div>
          <h1 className="text-9xl font-black tracking-tight">Perty</h1>
          <p className="mt-2 text-2xl text-white/45">
            La tele es el tablero. Los celulares, los controles.
          </p>
        </div>
        <button
          onClick={onCreate}
          disabled={status === 'connecting'}
          className="rounded-3xl bg-white px-14 py-6 text-3xl font-black text-black transition hover:scale-[1.03] disabled:opacity-30"
        >
          {status === 'connecting' ? 'Conectando…' : 'Crear sala'}
        </button>
        {error && <p className="text-lg font-semibold text-red-400">{error}</p>}
      </div>
    </Stage>
  );
}
