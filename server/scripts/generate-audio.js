// Generates the demo audio files into AUDIO_DIR. Usage: node scripts/generate-audio.js [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, slugify } from './catalog.js';
import { encodeWav, renderTrack } from './synth.js';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function audioFileName(entry) {
  return `${slugify(entry.artist)}--${slugify(entry.title)}.wav`;
}

export function generateAudio({ audioDir, force = false, log = console.log }) {
  fs.mkdirSync(audioDir, { recursive: true });
  let created = 0;
  CATALOG.forEach((entry, i) => {
    const file = path.join(audioDir, audioFileName(entry));
    if (!force && fs.existsSync(file)) return;
    const samples = renderTrack({ seed: 1000 + i, ...entry.synth });
    fs.writeFileSync(file, encodeWav(samples));
    created++;
    log(`  generated ${path.basename(file)}`);
  });
  return created;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const audioDir = path.resolve(SERVER_ROOT, process.env.AUDIO_DIR ?? 'storage/audio');
  const started = Date.now();
  const n = generateAudio({ audioDir, force: process.argv.includes('--force') });
  console.log(`Generated ${n} file(s) in ${audioDir} (${Date.now() - started} ms)`);
}
