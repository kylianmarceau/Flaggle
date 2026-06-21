import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "audio");

const sampleRate = 16000;
const duration = 8.5;
const tracks = [
  ["pop-neon-summer", 261.63, 1.0],
  ["pop-glass-hearts", 293.66, 1.08],
  ["pop-late-night-lights", 329.63, 0.95],
  ["pop-sugar-static", 349.23, 1.12],
  ["pop-paper-moon", 392.0, 0.9],
  ["rock-redline-riff", 146.83, 1.45],
  ["rock-iron-weather", 164.81, 1.35],
  ["rock-motor-sun", 174.61, 1.5],
  ["rock-city-amp", 196.0, 1.28],
  ["rock-ghost-chorus", 220.0, 1.38],
  ["hiphop-corner-boom", 123.47, 0.72],
  ["hiphop-midnight-tape", 138.59, 0.78],
  ["hiphop-cipher-step", 155.56, 0.7],
  ["hiphop-low-rider-loop", 164.81, 0.74],
  ["hiphop-bodega-bells", 185.0, 0.68],
  ["electronic-pixel-rain", 440.0, 1.8],
  ["electronic-circuit-bloom", 493.88, 1.65],
  ["electronic-afterimage", 523.25, 1.72],
  ["electronic-soft-launch", 587.33, 1.6],
  ["electronic-signal-garden", 659.25, 1.7],
  ["jazz-blue-steps", 196.0, 0.58],
  ["jazz-window-seat", 220.0, 0.62],
  ["jazz-copper-lamp", 246.94, 0.55],
  ["jazz-sidewalk-swing", 261.63, 0.64],
  ["jazz-smoke-ring", 293.66, 0.6],
  ["rnb-honeyline", 174.61, 0.84],
  ["rnb-velvet-floor", 196.0, 0.88],
  ["rnb-slow-orbit", 220.0, 0.8],
  ["rnb-gold-room", 246.94, 0.86],
  ["rnb-soft-echo", 261.63, 0.82],
];

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function envelope(phase) {
  const attack = Math.min(phase / 0.04, 1);
  const release = Math.min((1 - phase) / 0.1, 1);
  return Math.max(0, Math.min(attack, release));
}

function sampleFor(trackIndex, baseFrequency, swing, t) {
  const pattern = [0, 4, 7, 12, 7, 4, 9, 7];
  const beatLength = 0.32 * swing;
  const noteIndex = Math.floor(t / beatLength) % pattern.length;
  const notePhase = (t % beatLength) / beatLength;
  const semitone = pattern[(noteIndex + trackIndex) % pattern.length];
  const frequency = baseFrequency * 2 ** (semitone / 12);
  const lead =
    Math.sin(2 * Math.PI * frequency * t) * 0.46 +
    Math.sin(2 * Math.PI * frequency * 2.01 * t) * 0.14;
  const bass = Math.sin(2 * Math.PI * (baseFrequency / 2) * t) * 0.23;
  const kick = noteIndex % 2 === 0 && notePhase < 0.16
    ? Math.sin(2 * Math.PI * 55 * t) * (1 - notePhase / 0.16) * 0.42
    : 0;
  const hat = noteIndex % 2 === 1 && notePhase < 0.08
    ? Math.sin(2 * Math.PI * 6200 * t) * (1 - notePhase / 0.08) * 0.05
    : 0;
  return (lead + bass + kick + hat) * envelope(notePhase) * 0.64;
}

function makeWav(trackIndex, baseFrequency, swing) {
  const totalSamples = sampleRate * duration;
  const bytesPerSample = 2;
  const dataSize = totalSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const fadeOut = Math.min((duration - t) / 0.4, 1);
    const value = Math.max(
      -1,
      Math.min(1, sampleFor(trackIndex, baseFrequency, swing, t) * fadeOut),
    );
    view.setInt16(44 + i * bytesPerSample, value * 0x7fff, true);
  }

  return Buffer.from(buffer);
}

mkdirSync(outDir, { recursive: true });
tracks.forEach(([id, baseFrequency, swing], index) => {
  writeFileSync(
    join(outDir, `${id}.wav`),
    makeWav(index, baseFrequency, swing),
  );
});
