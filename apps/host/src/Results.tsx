import { motion } from 'motion/react';
import type { Player, ResultsView, RoomSnapshot } from '@perty/protocol';
import { Avatar, Rolling, Stage, playerMap } from './bits';

interface Props {
  view: ResultsView;
  room: RoomSnapshot;
}

const PODIUM_HEIGHT = ['h-64', 'h-48', 'h-36'];
const PODIUM_MEDAL = ['🥇', '🥈', '🥉'];

export default function Results({ view, room }: Props) {
  const players = playerMap(room.players);
  const top = view.standings.slice(0, 3);
  const rest = view.standings.slice(3);
  const champion = players.get(view.standings[0]?.playerId ?? '');

  // El podio se muestra 2º · 1º · 3º, como corresponde.
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);

  return (
    <Stage glowA="#ffd43b" glowB="#7c3aed">
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-10">
        <header className="text-center">
          <p className="text-sm font-bold tracking-[0.3em] text-white/35 uppercase">
            {view.gameName}
          </p>
          <h1 className="text-shine text-7xl font-black">
            {view.headline ?? (champion ? `Ganó ${champion.name}` : 'Fin de la partida')}
          </h1>
        </header>

        <div className="flex items-end justify-center gap-6">
          {podiumOrder.map((standing) => {
            if (!standing) return null;
            const player = players.get(standing.playerId);
            if (!player) return null;
            const index = standing.rank - 1;
            return (
              <motion.div
                key={standing.playerId}
                initial={{ y: 120, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 * (3 - index), type: 'spring', stiffness: 160, damping: 18 }}
                className="flex w-56 flex-col items-center gap-3"
              >
                <span className="text-5xl">{PODIUM_MEDAL[index] ?? ''}</span>
                <Avatar player={player} size="lg" />
                <span className="text-2xl font-black">{player.name}</span>
                <div
                  className={`flex w-full ${PODIUM_HEIGHT[index] ?? 'h-28'} flex-col items-center justify-start rounded-t-2xl pt-4`}
                  style={{ backgroundColor: `${player.color}2e`, boxShadow: `inset 0 0 0 2px ${player.color}` }}
                >
                  <Rolling value={standing.score} className="text-3xl font-black tabular-nums" />
                  <span className="text-sm text-white/45">{standing.label}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {rest.length > 0 && (
          <div className="flex justify-center gap-6 text-white/50">
            {rest.map((standing) => {
              const player = players.get(standing.playerId);
              return player ? (
                <span key={standing.playerId} className="text-lg font-bold">
                  #{standing.rank} {player.name} · {standing.label}
                </span>
              ) : null;
            })}
          </div>
        )}

        <section className="min-h-0 flex-1">
          <h2 className="mb-3 text-center text-sm font-bold tracking-[0.3em] text-white/35 uppercase">
            Medallas
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {view.medals.map((medal, index) => {
              const player = players.get(medal.playerId);
              if (!player) return null;
              return (
                <motion.div
                  key={medal.id}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.08 }}
                  className="flex w-64 items-center gap-3 rounded-2xl border border-line bg-panel/70 px-4 py-3"
                >
                  <span className="text-4xl">{medal.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-lg font-black">{medal.name}</div>
                    <div className="truncate text-sm" style={{ color: player.color }}>
                      {player.name} · {medal.detail}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        <p className="text-center text-xl text-white/35">
          {champion ? 'Armá la próxima desde el celular.' : 'Seguí desde el celular.'}
        </p>
      </div>
    </Stage>
  );
}
