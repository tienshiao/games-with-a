let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

interface ToneOpts {
  freq: number;
  endFreq?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  startAt?: number;
}

function playTone(opts: ToneOpts): void {
  const c = getCtx();
  const start = c.currentTime + (opts.startAt ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(opts.endFreq, 0.0001),
      start + opts.duration
    );
  }
  const peak = opts.gain ?? 0.18;
  const attack = opts.attack ?? 0.005;
  const release = opts.release ?? 0.03;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.setValueAtTime(peak, start + Math.max(opts.duration - release, attack));
  g.gain.linearRampToValueAtTime(0, start + opts.duration);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + opts.duration + 0.02);
}

export function playFlap(): void {
  // Short upward thruster blip
  playTone({ freq: 220, endFreq: 480, duration: 0.12, type: "triangle", gain: 0.12 });
  playTone({ freq: 90, endFreq: 60, duration: 0.1, type: "sawtooth", gain: 0.05 });
}

export function playScore(): void {
  // Bright two-note ping for clearing a barrier
  playTone({ freq: 880, duration: 0.06, type: "square", gain: 0.1 });
  playTone({ freq: 1318, duration: 0.12, type: "square", gain: 0.1, startAt: 0.05 });
}

export function playCrash(): void {
  // Noisy descending boom
  playTone({ freq: 320, endFreq: 50, duration: 0.5, type: "sawtooth", gain: 0.2 });
  playTone({ freq: 180, endFreq: 40, duration: 0.45, type: "square", gain: 0.12, startAt: 0.02 });
}

export function playClick(): void {
  // UI tap
  playTone({ freq: 600, endFreq: 900, duration: 0.07, type: "square", gain: 0.1 });
}
