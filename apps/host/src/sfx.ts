/**
 * Sonidos sintetizados: cero archivos, cero descargas, y la tele igual suena.
 * El AudioContext arranca recién con el primer click del host (Chrome exige gesto).
 */

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  void ctx.resume();
}

interface Blip {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function play(blips: Blip[], gapMs = 0): void {
  if (!ctx || ctx.state !== 'running') return;
  let at = ctx.currentTime;
  for (const blip of blips) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = blip.type ?? 'triangle';
    osc.frequency.setValueAtTime(blip.freq, at);
    if (blip.slideTo) osc.frequency.exponentialRampToValueAtTime(blip.slideTo, at + blip.duration);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(blip.gain ?? 0.16, at + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + blip.duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + blip.duration + 0.02);
    at += blip.duration + gapMs / 1000;
  }
}

const SOUNDS: Record<string, () => void> = {
  join: () => play([{ freq: 660, duration: 0.09 }, { freq: 990, duration: 0.12 }], 10),
  'round-start': () => play([{ freq: 520, duration: 0.1 }, { freq: 780, duration: 0.16 }], 20),
  question: () => play([{ freq: 880, duration: 0.08, type: 'square', gain: 0.08 }]),
  chaos: () =>
    play([
      { freq: 220, duration: 0.14, type: 'sawtooth', gain: 0.1, slideTo: 660 },
      { freq: 660, duration: 0.2, type: 'sawtooth', gain: 0.1, slideTo: 180 },
    ]),
  reveal: () => play([{ freq: 420, duration: 0.12 }, { freq: 620, duration: 0.18 }], 15),
  star: () =>
    play([
      { freq: 880, duration: 0.09 },
      { freq: 1180, duration: 0.09 },
      { freq: 1560, duration: 0.24 },
    ], 10),
  'boss-intro': () =>
    play([
      { freq: 160, duration: 0.28, type: 'sawtooth', gain: 0.12, slideTo: 90 },
      { freq: 110, duration: 0.4, type: 'sawtooth', gain: 0.1 },
    ], 20),
  'boss-hit': () =>
    play([{ freq: 320, duration: 0.09, type: 'square', gain: 0.12, slideTo: 140 }]),
  'boss-attack': () =>
    play([
      { freq: 90, duration: 0.22, type: 'sawtooth', gain: 0.13, slideTo: 300 },
      { freq: 300, duration: 0.3, type: 'sawtooth', gain: 0.13, slideTo: 80 },
    ]),
  'boss-hurt-us': () =>
    play([
      { freq: 420, duration: 0.14, type: 'square', gain: 0.12, slideTo: 120 },
      { freq: 120, duration: 0.3, type: 'sawtooth', gain: 0.1 },
    ], 10),
  'boss-lose': () =>
    play([
      { freq: 300, duration: 0.2, slideTo: 200 },
      { freq: 200, duration: 0.24, slideTo: 130 },
      { freq: 130, duration: 0.6, slideTo: 70 },
    ], 20),
  finale: () =>
    play([
      { freq: 523, duration: 0.14 },
      { freq: 659, duration: 0.14 },
      { freq: 784, duration: 0.14 },
      { freq: 1046, duration: 0.4 },
    ], 20),
};

export function playSfx(name: string): void {
  SOUNDS[name]?.();
}
