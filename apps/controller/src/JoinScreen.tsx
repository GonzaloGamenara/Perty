import { useEffect, useState } from 'react';
import type { Status } from './usePerty';

interface Props {
  status: Status;
  error: string | null;
  onJoin: (code: string, name: string) => void;
}

export default function JoinScreen({ status, error, onJoin }: Props) {
  // El QR de la tele trae el código en la URL: casi siempre solo hay que poner el nombre.
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('c')?.toUpperCase() ?? '',
  );
  const [name, setName] = useState(() => localStorage.getItem('perty.name') ?? '');

  useEffect(() => {
    if (name) localStorage.setItem('perty.name', name);
  }, [name]);

  const ready = code.trim().length >= 4 && name.trim().length > 0;
  const busy = status === 'joining' || status === 'connecting';

  return (
    <form
      className="safe-top safe-bottom mx-auto flex h-full w-full max-w-md flex-col justify-center gap-6 px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onJoin(code, name);
      }}
    >
      <header className="text-center">
        <div className="text-6xl">🎉</div>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Perty</h1>
        <p className="mt-1 text-sm text-white/50">Tu celular es el control</p>
      </header>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold tracking-wider text-white/40 uppercase">
          Código de sala
        </span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABCD"
          className="w-full rounded-2xl border border-line bg-panel px-4 py-4 text-center text-3xl font-black tracking-[0.3em] outline-none focus:border-white/40"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold tracking-wider text-white/40 uppercase">
          Tu nombre
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 14))}
          enterKeyHint="go"
          className="w-full rounded-2xl border border-line bg-panel px-4 py-4 text-center text-2xl font-bold outline-none focus:border-white/40"
        />
      </label>

      {error && (
        <p className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-sm font-semibold text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || busy}
        className="rounded-2xl bg-white py-5 text-xl font-black text-black transition active:scale-[0.98] disabled:opacity-30"
      >
        {status === 'connecting' ? 'Conectando…' : status === 'joining' ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
