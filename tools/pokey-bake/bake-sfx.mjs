#!/usr/bin/env node
// bake-sfx.mjs — render Tempest POKEY sound effects to .wav, headless.
//
// Drives the vendored web-pokey core (vendor/pokey.js, MIT, by Mariusz Kryński)
// in a shimmed Node VM context — no browser, no Web Audio, no MAME. Each SFX in
// sfx-data.mjs is a timed sequence of POKEY register writes; we feed it to the
// emulator, pull one filtered sample at a time via POKEY.get(), and write a
// 16-bit mono WAV. Bake once, host the .wav on R2, play via the existing sampler.
//
// Usage:
//   node tools/pokey-bake/bake-sfx.mjs [outDir] [--rate 48000|44100|56000] [--normalize]
//
// Defaults: outDir = tools/pokey-bake/out, rate = 48000, no normalization.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { SFX } from './sfx-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const normalize = argv.includes('--normalize');
const rateFlag = argv.indexOf('--rate');
const SAMPLE_RATE = rateFlag !== -1 ? Number(argv[rateFlag + 1]) : 48000;
const outDir = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--rate')
  || join(__dirname, 'out');

if (![48000, 44100, 56000].includes(SAMPLE_RATE)) {
  console.error(`Unsupported --rate ${SAMPLE_RATE}. web-pokey supports 48000, 44100, or 56000.`);
  process.exit(1);
}

// ── load the web-pokey POKEY class headlessly ─────────────────────────────────
// pokey.js is written for an AudioWorklet: it references the globals `sampleRate`
// and `currentFrame`, extends AudioWorkletProcessor, and calls registerProcessor
// at top level. We satisfy those with a sandbox and pull the POKEY class out.
function loadPokeyClass(sampleRate) {
  const src = readFileSync(join(__dirname, 'vendor', 'pokey.js'), 'utf8')
    + '\n;globalThis.__POKEY = POKEY;'; // export the class to the sandbox global
  const sandbox = {
    sampleRate,
    currentFrame: 0,
    console,
    AudioWorkletProcessor: class {},
    registerProcessor: () => {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'vendor/pokey.js' });
  if (typeof sandbox.__POKEY !== 'function') {
    throw new Error('Failed to load POKEY class from vendor/pokey.js');
  }
  return sandbox.__POKEY;
}

const POKEY = loadPokeyClass(SAMPLE_RATE);

// ── render one SFX to a Float32 sample buffer ─────────────────────────────────
function renderSfx(spec) {
  const nSamples = Math.max(1, Math.ceil((spec.durationMs / 1000) * SAMPLE_RATE));
  const gain = spec.gain ?? 1.0;

  const p1 = new POKEY('L');
  if (spec.pokey1?.length) p1.feed(spec.pokey1.slice());
  let p2 = null;
  if (spec.pokey2?.length) {
    p2 = new POKEY('R');
    p2.feed(spec.pokey2.slice());
  }

  const out = new Float32Array(nSamples);
  let peak = 0;
  for (let i = 0; i < nSamples; i++) {
    // apply any register writes scheduled at/before this sample (time = i/rate)
    p1.processEvents(i);
    let s = p1.get();
    if (p2) {
      p2.processEvents(i);
      s = (s + p2.get()) * 0.5; // mix two chips to mono
    }
    s *= gain;
    out[i] = s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }

  if ((normalize || spec.normalize) && peak > 1e-6) {
    const k = 0.9 / peak;
    for (let i = 0; i < nSamples; i++) out[i] *= k;
    peak = 0.9;
  }
  return { out, peak };
}

// ── 16-bit mono PCM WAV writer ────────────────────────────────────────────────
function writeWav(path, samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);        // fmt chunk size
  buf.writeUInt16LE(1, 20);         // PCM
  buf.writeUInt16LE(1, 22);         // channels = 1
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);         // block align
  buf.writeUInt16LE(16, 34);        // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(path, buf);
}

// ── main ──────────────────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
console.log(`Baking ${SFX.length} SFX @ ${SAMPLE_RATE} Hz → ${outDir}\n`);
let made = 0;
let silent = 0;
for (const spec of SFX) {
  const { out, peak } = renderSfx(spec);
  const path = join(outDir, `${spec.name}.wav`);
  writeWav(path, out, SAMPLE_RATE);
  made++;
  const warn = peak < 1e-4 ? '  ⚠ SILENT — check register data' : '';
  if (warn) silent++;
  console.log(`  ✓ ${spec.name}.wav  ${(out.length / SAMPLE_RATE).toFixed(3)}s  peak=${peak.toFixed(3)}${warn}`);
}
console.log(`\nBaked ${made} file(s), 16-bit mono WAV.${silent ? `  (${silent} silent — likely placeholder/empty data)` : ''}`);
