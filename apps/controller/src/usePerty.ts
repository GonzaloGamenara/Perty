import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { EV, type PlayerAction, type PlayerFrame } from '@perty/protocol';

const SERVER_URL = import.meta.env.PROD
  ? window.location.origin
  : `${window.location.protocol}//${window.location.hostname}:3000`;

export const socket = io(SERVER_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

interface Session {
  code: string;
  playerId: string;
  token: string;
}

const SESSION_KEY = 'perty.session';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* modo incógnito: se juega igual, sin reconexión automática */
  }
}

export type Status = 'connecting' | 'out' | 'joining' | 'in';

export function usePerty() {
  const [frame, setFrame] = useState<PlayerFrame | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  /** serverNow - Date.now(): así los deadlines del server valen en este celu. */
  const clockOffset = useRef(0);

  useEffect(() => {
    const onFrame = (next: PlayerFrame) => {
      clockOffset.current = next.serverNow - Date.now();
      setFrame(next);
      setStatus('in');
    };

    const onConnect = () => {
      const session = loadSession();
      if (!session) {
        setStatus('out');
        return;
      }
      socket.emit(EV.playerResume, session, (ack: { ok: boolean }) => {
        if (!ack?.ok) {
          saveSession(null);
          setFrame(null);
          setStatus('out');
        }
      });
    };

    const onDisconnect = () => setStatus((s) => (s === 'in' ? 'connecting' : s));

    // El jugador abrió el control en otro lado: esta pantalla ya no manda.
    const onKicked = (reason: string) => {
      setFrame(null);
      setError(reason);
      setStatus('out');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(EV.playerFrame, onFrame);
    socket.on(EV.playerKicked, onKicked);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(EV.playerFrame, onFrame);
      socket.off(EV.playerKicked, onKicked);
    };
  }, []);

  const join = useCallback((code: string, name: string) => {
    setStatus('joining');
    setError(null);
    socket.emit(
      EV.playerJoin,
      { code: code.trim().toUpperCase(), name: name.trim() },
      (ack: { ok: boolean; error?: string; playerId?: string; token?: string; code?: string }) => {
        if (!ack?.ok) {
          setError(ack?.error ?? 'No se pudo entrar');
          setStatus('out');
          return;
        }
        saveSession({ code: ack.code!, playerId: ack.playerId!, token: ack.token! });
      },
    );
  }, []);

  const act = useCallback((action: PlayerAction) => {
    socket.emit(EV.playerAction, action);
  }, []);

  const leave = useCallback(() => {
    saveSession(null);
    setFrame(null);
    setStatus('out');
  }, []);

  return { frame, status, error, join, act, leave, clockOffset };
}

/** Cuenta regresiva contra el reloj del server. */
export function useCountdown(deadline: number | undefined, offsetRef: { current: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return { ms: 0, seconds: 0, active: false };
  const ms = Math.max(0, deadline - (now + offsetRef.current));
  return { ms, seconds: Math.ceil(ms / 1000), active: true };
}

/** Evita que el celu se bloquee en medio de una ronda. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        /* el navegador dijo que no; se juega igual */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

export function buzz(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS no vibra y no pasa nada */
  }
}
