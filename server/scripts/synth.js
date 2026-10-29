// Tiny deterministic music synthesizer used to generate the demo catalogue.
//
// Every track is produced from code in this repository (oscillators + noise), so the
// audio is original work that can be released under CC0. Nothing is downloaded or
// sampled from third parties.

export const SAMPLE_RATE = 22050;

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
};

const STYLES = {
  lofi: {
    drums: 'boom-bap',
    bass: 'root',
    lead: 'sparse',
    wave: 'triangle',
    swing: 0.12,
    padLevel: 0.5,
    crackle: true,
  },
  synthwave: {
    drums: 'straight',
    bass: 'eighths',
    lead: 'arp',
    wave: 'saw',
    swing: 0,
    padLevel: 0.45,
  },
  ambient: {
    drums: 'none',
    bass: 'drone',
    lead: 'sparse',
    wave: 'sine',
    swing: 0,
    padLevel: 0.8,
    echo: true,
  },
  house: { drums: 'four', bass: 'offbeat', lead: 'stab', wave: 'saw', swing: 0, padLevel: 0.35 },
  chiptune: {
    drums: 'straight',
    bass: 'eighths',
    lead: 'arp',
    wave: 'square',
    swing: 0,
    padLevel: 0.25,
  },
  downtempo: {
    drums: 'boom-bap',
    bass: 'root',
    lead: 'melody',
    wave: 'triangle',
    swing: 0.06,
    padLevel: 0.55,
    echo: true,
  },
};

export const STYLE_NAMES = Object.keys(STYLES);

// Mulberry32: small seeded PRNG so a given seed always produces the same track.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

function osc(wave, phase) {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'square':
      return p < 0.5 ? 0.6 : -0.6;
    case 'saw':
      return (2 * p - 1) * 0.7;
    default: // triangle
      return 1 - 4 * Math.abs(p - 0.5);
  }
}

/** Adds a note into `buf` starting at sample `start`. */
function addNote(buf, { start, length, hz, wave, gain, attack = 0.01, release = 0.1, detune = 0 }) {
  const a = Math.max(1, Math.floor(attack * SAMPLE_RATE));
  const r = Math.max(1, Math.floor(release * SAMPLE_RATE));
  const end = Math.min(buf.length, start + length + r);
  let lp = 0; // one-pole low-pass to soften bright waveforms
  for (let i = Math.max(0, start); i < end; i++) {
    const t = (i - start) / SAMPLE_RATE;
    let env = 1;
    const k = i - start;
    if (k < a) env = k / a;
    else if (k > length) env = Math.max(0, 1 - (k - length) / r);
    let s = osc(wave, hz * t);
    if (detune) s = (s + osc(wave, hz * (1 + detune) * t)) * 0.5;
    lp += 0.25 * (s - lp);
    buf[i] += lp * env * gain;
  }
}

function kick(buf, start, gain) {
  const len = Math.floor(0.35 * SAMPLE_RATE);
  let phase = 0;
  for (let k = 0; k < len && start + k < buf.length; k++) {
    const t = k / SAMPLE_RATE;
    const hz = 50 + 90 * Math.exp(-t * 30);
    phase += hz / SAMPLE_RATE;
    buf[start + k] += Math.sin(2 * Math.PI * phase) * Math.exp(-t * 9) * gain;
  }
}

function noiseHit(buf, start, { gain, decay, tone = 0, rand, highpass = false }) {
  const len = Math.floor((5 / decay) * SAMPLE_RATE);
  let prev = 0;
  for (let k = 0; k < len && start + k < buf.length; k++) {
    const t = k / SAMPLE_RATE;
    let n = rand() * 2 - 1;
    if (highpass) {
      const hp = n - prev;
      prev = n;
      n = hp * 0.6;
    }
    const body = tone ? Math.sin(2 * Math.PI * tone * t) * 0.5 : 0;
    buf[start + k] += (n + body) * Math.exp(-t * decay) * gain;
  }
}

/**
 * Renders a track and returns a Float32Array of samples in [-1, 1].
 * @param {{ seed:number, style:string, bpm:number, root:number, scale:string,
 *           progression:number[], durationSec:number }} spec
 */
export function renderTrack(spec) {
  const style = STYLES[spec.style];
  if (!style) throw new Error(`Unknown style ${spec.style}`);
  const rand = prng(spec.seed);
  const scale = SCALES[spec.scale] ?? SCALES.minor;
  const total = Math.floor(spec.durationSec * SAMPLE_RATE);
  const buf = new Float32Array(total);
  const beat = (60 / spec.bpm) * SAMPLE_RATE;
  const bar = beat * 4;
  const degree = (d, octave = 0) =>
    spec.root +
    12 * octave +
    scale[((d % scale.length) + scale.length) % scale.length] +
    12 * Math.floor(d / scale.length);
  const melodyNotes = Array.from({ length: 16 }, () => Math.floor(rand() * scale.length));

  for (let barIdx = 0; barIdx * bar < total; barIdx++) {
    const barStart = Math.floor(barIdx * bar);
    const chordRoot = spec.progression[barIdx % spec.progression.length];
    // Mute drums for the first bar (intro) and every 8th bar (breakdown) for variety.
    const drumsOn = barIdx > 0 && barIdx % 8 !== 7;

    // Pad: a triad held for the bar.
    for (const step of [0, 2, 4]) {
      addNote(buf, {
        start: barStart,
        length: Math.floor(bar * 0.95),
        hz: midiToHz(degree(chordRoot + step)),
        wave: style.wave === 'square' ? 'triangle' : style.wave,
        gain: 0.07 * style.padLevel,
        attack: spec.style === 'ambient' ? 1.2 : 0.3,
        release: 0.6,
        detune: 0.004,
      });
    }

    // Bass.
    const bassHz = midiToHz(degree(chordRoot, -1) - 12);
    const bassAt = (pos, len, g = 0.22) =>
      addNote(buf, {
        start: barStart + Math.floor(pos * beat),
        length: Math.floor(len * beat),
        hz: bassHz,
        wave: 'sine',
        gain: g,
        release: 0.05,
      });
    if (style.bass === 'drone') bassAt(0, 4, 0.12);
    if (style.bass === 'root') [0, 2.5].forEach((p) => bassAt(p, 1.2));
    if (style.bass === 'eighths') for (let e = 0; e < 8; e++) bassAt(e / 2, 0.4, 0.16);
    if (style.bass === 'offbeat') for (let q = 0; q < 4; q++) bassAt(q + 0.5, 0.4);

    // Lead.
    const leadGain = 0.06;
    const leadNote = (pos, len, d) =>
      addNote(buf, {
        start: barStart + Math.floor(pos * beat),
        length: Math.floor(len * beat),
        hz: midiToHz(degree(d, 1)),
        wave: style.wave,
        gain: leadGain,
        release: 0.15,
      });
    if (style.lead === 'arp')
      for (let s = 0; s < 8; s++) leadNote(s / 2, 0.4, chordRoot + [0, 2, 4, 7][s % 4]);
    if (style.lead === 'stab') [0.5, 1.5, 2.5, 3.5].forEach((p) => leadNote(p, 0.2, chordRoot + 4));
    if (style.lead === 'melody' || style.lead === 'sparse') {
      const notes = style.lead === 'sparse' ? 3 : 6;
      for (let s = 0; s < notes; s++) {
        if (rand() < 0.25) continue;
        const pos = (s * 4) / notes;
        leadNote(pos, (4 / notes) * 0.8, melodyNotes[(barIdx * notes + s) % melodyNotes.length]);
      }
    }

    if (!drumsOn || style.drums === 'none') continue;
    const at = (pos) =>
      barStart + Math.floor(pos * beat + (pos % 1 === 0.5 ? style.swing * beat : 0));
    if (style.drums === 'four') [0, 1, 2, 3].forEach((p) => kick(buf, at(p), 0.5));
    if (style.drums === 'straight') [0, 2].forEach((p) => kick(buf, at(p), 0.45));
    if (style.drums === 'boom-bap') [0, 1.5, 2.5].forEach((p) => kick(buf, at(p), 0.45));
    [1, 3].forEach((p) => noiseHit(buf, at(p), { gain: 0.16, decay: 18, tone: 190, rand }));
    for (let e = 0; e < 8; e++) {
      noiseHit(buf, at(e / 2), { gain: e % 2 ? 0.05 : 0.035, decay: 70, rand, highpass: true });
    }
  }

  if (style.echo) {
    const d = Math.floor(beat * 0.75);
    for (let i = d; i < total; i++) buf[i] += buf[i - d] * 0.3;
  }
  if (style.crackle) {
    for (let i = 0; i < total; i++) if (rand() < 0.0004) buf[i] += (rand() - 0.5) * 0.15;
  }

  // Fade in/out and normalise to -1 dBFS.
  const fade = Math.floor(1.5 * SAMPLE_RATE);
  let peak = 0;
  for (let i = 0; i < total; i++) {
    if (i < fade) buf[i] *= i / fade;
    if (i > total - fade) buf[i] *= (total - i) / fade;
    peak = Math.max(peak, Math.abs(buf[i]));
  }
  const norm = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < total; i++) buf[i] *= norm;
  return buf;
}

/** Encodes mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples) {
  const dataBytes = samples.length * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16); // PCM chunk size
  out.writeUInt16LE(1, 20); // PCM format
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(SAMPLE_RATE, 24);
  out.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  out.writeUInt16LE(2, 32); // block align
  out.writeUInt16LE(16, 34); // bits per sample
  out.write('data', 36);
  out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return out;
}
