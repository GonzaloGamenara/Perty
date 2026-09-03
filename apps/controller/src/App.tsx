import { useEffect, useState } from 'react';
import { usePerty, useWakeLock } from './usePerty';
import JoinScreen from './JoinScreen';
import PlayScreen from './PlayScreen';

export default function App() {
  const perty = usePerty();
  const [reconnecting, setReconnecting] = useState(false);

  useWakeLock(perty.status === 'in');

  // El aviso de "reconectando" espera un segundo: los micro-cortes no molestan.
  useEffect(() => {
    if (perty.status !== 'connecting') {
      setReconnecting(false);
      return;
    }
    const id = setTimeout(() => setReconnecting(true), 1000);
    return () => clearTimeout(id);
  }, [perty.status]);

  return (
    <div className="flex h-full flex-col">
      {reconnecting && (
        <div className="bg-amber-500 py-1 text-center text-xs font-semibold text-black">
          Reconectando…
        </div>
      )}
      {perty.frame ? (
        <PlayScreen
          frame={perty.frame}
          act={perty.act}
          leave={perty.leave}
          clockOffset={perty.clockOffset}
        />
      ) : (
        <JoinScreen status={perty.status} error={perty.error} onJoin={perty.join} />
      )}
    </div>
  );
}
