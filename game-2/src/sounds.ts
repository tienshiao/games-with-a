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

export function playJump(): void {
  // Cartoonish boing: quick rise, slight drop back down
  const c = getCtx();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.22);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.14, now + 0.005);
  g.gain.setValueAtTime(0.14, now + 0.18);
  g.gain.linearRampToValueAtTime(0, now + 0.24);
  osc.connect(g).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.26);
}

export function playCoin(): void {
  // Classic two-note coin blip (B5 -> E6)
  playTone({ freq: 988, duration: 0.06, type: "square", gain: 0.12 });
  playTone({ freq: 1319, duration: 0.14, type: "square", gain: 0.12, startAt: 0.055 });
}

export function playQBlock(): void {
  // Thud + small chime to signal a block popped
  playTone({ freq: 160, endFreq: 80, duration: 0.08, type: "triangle", gain: 0.22 });
  playTone({ freq: 740, endFreq: 1200, duration: 0.1, type: "square", gain: 0.1, startAt: 0.04 });
}

export function playWarp(): void {
  // Descending swoosh for warp pipe
  playTone({ freq: 900, endFreq: 120, duration: 0.45, type: "sine", gain: 0.15 });
  playTone({ freq: 600, endFreq: 80, duration: 0.45, type: "triangle", gain: 0.08, startAt: 0.02 });
}

export function playPowerup(): void {
  // Ascending triad arpeggio - classic powerup chime
  playTone({ freq: 523, duration: 0.09, type: "square", gain: 0.13 }); // C5
  playTone({ freq: 659, duration: 0.09, type: "square", gain: 0.13, startAt: 0.08 }); // E5
  playTone({ freq: 784, duration: 0.09, type: "square", gain: 0.13, startAt: 0.16 }); // G5
  playTone({ freq: 1047, duration: 0.18, type: "square", gain: 0.13, startAt: 0.24 }); // C6
}

export function playFlap(): void {
  // Short woosh for a mid-air flap
  playTone({ freq: 380, endFreq: 520, duration: 0.12, type: "triangle", gain: 0.1 });
}

export function playHurt(): void {
  // Harsh downward blip
  playTone({ freq: 420, endFreq: 140, duration: 0.2, type: "sawtooth", gain: 0.12 });
}
