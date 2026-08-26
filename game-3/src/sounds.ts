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

let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const len = Math.floor(c.sampleRate * 2);
    noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

interface NoiseOpts {
  duration: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq: number;
  endFreq?: number;
  q?: number;
  attack?: number;
  startAt?: number;
  /** Playback rate of the noise source; lower sounds grittier/heavier. */
  rate?: number;
}

/** Filtered white noise - the raw material for thrust and explosions. */
function playNoise(opts: NoiseOpts): void {
  const c = getCtx();
  const start = c.currentTime + (opts.startAt ?? 0);
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);
  src.loop = true;
  src.playbackRate.value = opts.rate ?? 1;

  const filter = c.createBiquadFilter();
  filter.type = opts.filter ?? "bandpass";
  filter.frequency.setValueAtTime(opts.freq, start);
  if (opts.endFreq !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(opts.endFreq, 20),
      start + opts.duration
    );
  }
  filter.Q.value = opts.q ?? 1;

  const g = c.createGain();
  const peak = opts.gain ?? 0.15;
  const attack = opts.attack ?? 0.01;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);

  src.connect(filter).connect(g).connect(c.destination);
  src.start(start);
  src.stop(start + opts.duration + 0.02);
}

export function playFlap(): void {
  // Thruster burst: a jet of filtered noise opening up, over a low engine rumble.
  playNoise({
    duration: 0.26,
    freq: 500,
    endFreq: 2600,
    filter: "bandpass",
    q: 0.7,
    gain: 0.14,
    attack: 0.008,
  });
  playNoise({
    duration: 0.2,
    freq: 900,
    endFreq: 160,
    filter: "lowpass",
    gain: 0.1,
    attack: 0.004,
    rate: 0.6,
  });
  // Faint pitch bloom gives the burst a sense of lift without sounding like a note.
  playTone({ freq: 60, endFreq: 190, duration: 0.18, type: "sawtooth", gain: 0.04, release: 0.1 });
}

export function playScore(): void {
  // Bright two-note ping for clearing a barrier
  playTone({ freq: 880, duration: 0.06, type: "square", gain: 0.1 });
  playTone({ freq: 1318, duration: 0.12, type: "square", gain: 0.1, startAt: 0.05 });
}

export function playCrash(): void {
  // Explosion: bright metallic crack, then a wide noise blast collapsing into a low rumble.
  playNoise({
    duration: 0.12,
    freq: 3000,
    endFreq: 900,
    filter: "highpass",
    gain: 0.16,
    attack: 0.001,
  });
  playNoise({
    duration: 0.9,
    freq: 2200,
    endFreq: 90,
    filter: "lowpass",
    gain: 0.26,
    attack: 0.004,
  });
  playNoise({
    duration: 1.1,
    freq: 220,
    endFreq: 45,
    filter: "lowpass",
    gain: 0.2,
    attack: 0.02,
    rate: 0.35,
    startAt: 0.03,
  });
  // Sub-bass thump under the blast; sine so it reads as impact, not pitch.
  playTone({ freq: 110, endFreq: 28, duration: 0.7, type: "sine", gain: 0.22, release: 0.35 });
}

export function playPowerUp(): void {
  // Rising arpeggio for picking up an item
  playTone({ freq: 523, duration: 0.07, type: "square", gain: 0.1 });
  playTone({ freq: 659, duration: 0.07, type: "square", gain: 0.1, startAt: 0.06 });
  playTone({ freq: 784, duration: 0.07, type: "square", gain: 0.1, startAt: 0.12 });
  playTone({ freq: 1046, duration: 0.18, type: "square", gain: 0.11, startAt: 0.18 });
}

export function playLevelClear(): void {
  // Four-note rising fanfare with a shimmer of noise on the last note.
  const notes = [523, 659, 784, 1046];
  notes.forEach((freq, i) => {
    playTone({ freq, duration: 0.14, type: "square", gain: 0.1, startAt: i * 0.12 });
    playTone({ freq: freq * 2, duration: 0.14, type: "triangle", gain: 0.05, startAt: i * 0.12 });
  });
  playTone({ freq: 1568, duration: 0.5, type: "square", gain: 0.11, startAt: 0.48, release: 0.3 });
  playNoise({
    duration: 0.6,
    freq: 4000,
    endFreq: 1200,
    filter: "bandpass",
    q: 0.8,
    gain: 0.06,
    startAt: 0.48,
  });
}

export function playClick(): void {
  // UI tap
  playTone({ freq: 600, endFreq: 900, duration: 0.07, type: "square", gain: 0.1 });
}
