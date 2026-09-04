import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  EV,
  type GameInfo,
  type HostAction,
  type HostFrame,
  type SettingValues,
} from '@perty/protocol';
import { playSfx, unlockAudio } from './sfx';

const SERVER_URL = import.meta.env.PROD
  ? window.location.origin
  : `${window.location.protocol}//${window.location.hostname}:3000`;

export const socket = io(SERVER_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

const SESSION_KEY = 'perty.host';

interface HostSession {
  code: string;
  hostToken: string;
}

function loadSession(): HostSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as HostSession) : null;
  } catch {
    return null;
  }
}

export type HostStatus = 'connecting' | 'idle' | 'live';

export function useHost() {
  const [frame, setFrame] = useState<HostFrame | null>(null);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [status, setStatus] = useState<HostStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const clockOffset = useRef(0);

  useEffect(() => {
    const onFrame = (next: HostFrame) => {
      clockOffset.current = next.serverNow - Date.now();
      setFrame(next);
      setStatus('live');
    };

    const onConnect = () => {
      const session = loadSession();
      if (!session) {
        setStatus('idle');
        return;
      }
      // La tele se puede refrescar sin perder la sala.
      socket.emit(
        EV.hostResume,
        session,
        (ack: { ok: boolean; games?: GameInfo[] }) => {
          if (ack?.ok) {
            setGames(ack.games ?? []);
            setStatus('live');
          } else {
            localStorage.removeItem(SESSION_KEY);
            setStatus('idle');
          }
        },
      );
    };

    // Si en unos segundos no hubo conexión, hay algo mal: mejor decirlo que
    // dejar un "Conectando..." eterno.
    const stall = setTimeout(() => {
      if (!socket.connected) setStalled(true);
    }, 6000);
    const onceConnected = () => setStalled(false);

    socket.on('connect', onConnect);
    socket.on('connect', onceConnected);
    socket.on(EV.hostFrame, onFrame);
    socket.on(EV.sfx, playSfx);
    if (socket.connected) onConnect();

    return () => {
      clearTimeout(stall);
      socket.off('connect', onConnect);
      socket.off('connect', onceConnected);
      socket.off(EV.hostFrame, onFrame);
      socket.off(EV.sfx, playSfx);
    };
  }, []);

  const createRoom = useCallback(() => {
    unlockAudio();
    setError(null);
    socket.emit(
      EV.hostCreate,
      {},
      (ack: { ok: boolean; code?: string; hostToken?: string; games?: GameInfo[]; error?: string }) => {
        if (!ack?.ok) {
          setError(ack?.error ?? 'No se pudo crear la sala');
          return;
        }
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ code: ack.code, hostToken: ack.hostToken }),
        );
        setGames(ack.games ?? []);
        setStatus('live');
      },
    );
  }, []);

  const startGame = useCallback((gameId: string, settings?: SettingValues) => {
    unlockAudio();
    socket.emit(EV.hostStart, { gameId, settings }, (ack: { ok: boolean; error?: string }) => {
      if (!ack?.ok) setError(ack?.error ?? 'No se pudo empezar');
    });
  }, []);

  const action = useCallback((a: HostAction) => socket.emit(EV.hostAction, a), []);
  const backToLobby = useCallback(() => socket.emit(EV.hostReturnToLobby), []);

  const closeRoom = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setFrame(null);
    setStatus('idle');
  }, []);

  return {
    frame,
    games,
    status,
    stalled,
    error,
    createRoom,
    startGame,
    action,
    backToLobby,
    closeRoom,
    clockOffset,
  };
}

/** Cuenta regresiva sincronizada con el server. */
export function useCountdown(deadline: number | undefined, offsetRef: { current: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadline]);
  if (!deadline) return { ms: 0, seconds: 0, active: false };
  const ms = Math.max(0, deadline - (now + offsetRef.current));
  return { ms, seconds: Math.ceil(ms / 1000), active: true };
}
