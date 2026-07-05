// Procedural Doom-style MIDI-ish music driven by WebAudio.
// Original riff inspired by the driving E-pedal palm-muted feel of classic
// id Software soundtracks (e.g. E1M1) — not a transcription.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let stopFn: (() => void) | null = null;

const E2 = 82.41, G2 = 98.0, A2 = 110.0, B2 = 123.47, D3 = 146.83, E3 = 164.81;
const G3 = 196.0, A3 = 220.0, B3 = 246.94, D4 = 293.66, E4 = 329.63;

// Bass pedal riff (16th-note feel) — E pedal with chromatic stabs.
const BASS: number[] = [
  E2, E2, E2, G2, E2, E2, B2, E2,
  E2, E2, E2, G2, E2, A2, G2, E2,
  E2, E2, E2, G2, E2, E2, B2, D3,
  E2, E2, E2, G2, D3, B2, A2, G2,
];

// Lead phrase (eighth notes), 0 = rest.
const LEAD: number[] = [
  0, 0, E4, 0, G3, 0, B3, A3,
  0, E4, D4, B3, A3, G3, E3, 0,
  0, 0, B3, D4, E4, D4, B3, G3,
  A3, B3, A3, G3, E3, G3, A3, B3,
];

function playSquare(time: number, freq: number, dur: number, gain: number, detune = 0) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.value = freq;
  o.detune.value = detune;
  // Quick percussive envelope — chiptune/OPL feel.
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g).connect(master);
  o.start(time);
  o.stop(time + dur + 0.02);
}

function playKick(time: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(140, time);
  o.frequency.exponentialRampToValueAtTime(40, time + 0.12);
  g.gain.setValueAtTime(0.6, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  o.connect(g).connect(master);
  o.start(time);
  o.stop(time + 0.2);
}

function playSnare(time: number) {
  if (!ctx || !master) return;
  const len = 0.18;
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + len);
  src.connect(hp).connect(g).connect(master);
  src.start(time);
}

function playHat(time: number) {
  if (!ctx || !master) return;
  const len = 0.04;
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + len);
  src.connect(hp).connect(g).connect(master);
  src.start(time);
}

export function startDoomMusic() {
  if (stopFn) return;
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.18;
  // Light distortion via waveshaper for that gritty OPL bite.
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / curve.length) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2);
  }
  shaper.curve = curve;
  master.connect(shaper).connect(ctx.destination);

  const bpm = 156; // driving tempo
  const sixteenth = 60 / bpm / 4;
  const barSteps = 32; // two beats of 16ths per BASS row? we treat array as 32 sixteenths = 2 beats
  // Actually 32 steps at 16th notes = 8 beats = 2 bars of 4/4. Good loop length.

  let nextTime = ctx.currentTime + 0.1;
  let step = 0;
  let timer: number | null = null;

  const schedule = () => {
    if (!ctx) return;
    const ahead = ctx.currentTime + 0.25;
    while (nextTime < ahead) {
      const i = step % barSteps;
      const t = nextTime;

      // Bass — every 16th.
      const bn = BASS[i];
      if (bn) {
        playSquare(t, bn, sixteenth * 0.9, 0.22);
        playSquare(t, bn * 0.5, sixteenth * 0.9, 0.12); // sub octave
      }

      // Lead — sparser, slight delay echo.
      const ln = LEAD[i];
      if (ln) {
        playSquare(t, ln, sixteenth * 1.6, 0.14, 6);
        playSquare(t + sixteenth * 0.5, ln, sixteenth * 0.8, 0.05, -6);
      }

      // Drums: kick on every quarter, snare on 2 & 4, hats on 8ths.
      if (i % 4 === 0) playKick(t);
      if (i % 8 === 4) playSnare(t);
      if (i % 2 === 0) playHat(t);

      nextTime += sixteenth;
      step++;
    }
    timer = window.setTimeout(schedule, 60);
  };
  schedule();

  stopFn = () => {
    if (timer != null) clearTimeout(timer);
    try { ctx?.close(); } catch { /* ignore */ }
    ctx = null;
    master = null;
    stopFn = null;
  };
}

export function stopDoomMusic() {
  stopFn?.();
}

export function isDoomMusicPlaying() {
  return stopFn != null;
}
