export type TrackGenre =
  | "Pop"
  | "Rock"
  | "Hip-Hop"
  | "Electronic"
  | "Jazz"
  | "R&B";

export type Track = {
  id: string;
  title: string;
  artist: string;
  genre: TrackGenre;
  audioUrl: string;
  color: string;
  artworkUrl?: string;
  externalUrl?: string;
  source?: "demo" | "spotify";
  previewProvider?: "spotify" | "itunes";
};

export type SnippetStep = {
  label: string;
  seconds: number;
  points: number;
};

export type RoundResult = {
  track: Track;
  guessed: boolean;
  attempts: number;
  points: number;
};

export const SNIPPET_STEPS: SnippetStep[] = [
  { label: "0.1s", seconds: 0.1, points: 1000 },
  { label: "0.5s", seconds: 0.5, points: 850 },
  { label: "1s", seconds: 1, points: 700 },
  { label: "2s", seconds: 2, points: 520 },
  { label: "4s", seconds: 4, points: 330 },
  { label: "8s", seconds: 8, points: 150 },
];

export const GENRES: TrackGenre[] = [
  "Pop",
  "Rock",
  "Hip-Hop",
  "Electronic",
  "Jazz",
  "R&B",
];

export const TRACKS: Track[] = [
  { id: "pop-neon-summer", title: "Neon Summer", artist: "The Dayglow Set", genre: "Pop", audioUrl: "/audio/pop-neon-summer.wav", color: "#f9738a" },
  { id: "pop-glass-hearts", title: "Glass Hearts", artist: "Mira Vale", genre: "Pop", audioUrl: "/audio/pop-glass-hearts.wav", color: "#f59e0b" },
  { id: "pop-late-night-lights", title: "Late Night Lights", artist: "Cassia Blue", genre: "Pop", audioUrl: "/audio/pop-late-night-lights.wav", color: "#38bdf8" },
  { id: "pop-sugar-static", title: "Sugar Static", artist: "Luna Arcade", genre: "Pop", audioUrl: "/audio/pop-sugar-static.wav", color: "#fb7185" },
  { id: "pop-paper-moon", title: "Paper Moon", artist: "Juniper Lane", genre: "Pop", audioUrl: "/audio/pop-paper-moon.wav", color: "#a3e635" },
  { id: "rock-redline-riff", title: "Redline Riff", artist: "Northbound Voltage", genre: "Rock", audioUrl: "/audio/rock-redline-riff.wav", color: "#ef4444" },
  { id: "rock-iron-weather", title: "Iron Weather", artist: "The Overdrives", genre: "Rock", audioUrl: "/audio/rock-iron-weather.wav", color: "#64748b" },
  { id: "rock-motor-sun", title: "Motor Sun", artist: "Basement Signal", genre: "Rock", audioUrl: "/audio/rock-motor-sun.wav", color: "#f97316" },
  { id: "rock-city-amp", title: "City Amp", artist: "Violet Road", genre: "Rock", audioUrl: "/audio/rock-city-amp.wav", color: "#7c3aed" },
  { id: "rock-ghost-chorus", title: "Ghost Chorus", artist: "Silver Switch", genre: "Rock", audioUrl: "/audio/rock-ghost-chorus.wav", color: "#0891b2" },
  { id: "hiphop-corner-boom", title: "Corner Boom", artist: "Metro Pines", genre: "Hip-Hop", audioUrl: "/audio/hiphop-corner-boom.wav", color: "#22c55e" },
  { id: "hiphop-midnight-tape", title: "Midnight Tape", artist: "Juno Knox", genre: "Hip-Hop", audioUrl: "/audio/hiphop-midnight-tape.wav", color: "#a855f7" },
  { id: "hiphop-cipher-step", title: "Cipher Step", artist: "Rue & Static", genre: "Hip-Hop", audioUrl: "/audio/hiphop-cipher-step.wav", color: "#eab308" },
  { id: "hiphop-low-rider-loop", title: "Low Rider Loop", artist: "East Deck", genre: "Hip-Hop", audioUrl: "/audio/hiphop-low-rider-loop.wav", color: "#14b8a6" },
  { id: "hiphop-bodega-bells", title: "Bodega Bells", artist: "Niko Frame", genre: "Hip-Hop", audioUrl: "/audio/hiphop-bodega-bells.wav", color: "#f43f5e" },
  { id: "electronic-pixel-rain", title: "Pixel Rain", artist: "Vector Choir", genre: "Electronic", audioUrl: "/audio/electronic-pixel-rain.wav", color: "#06b6d4" },
  { id: "electronic-circuit-bloom", title: "Circuit Bloom", artist: "Aster Mode", genre: "Electronic", audioUrl: "/audio/electronic-circuit-bloom.wav", color: "#8b5cf6" },
  { id: "electronic-afterimage", title: "Afterimage", artist: "Kite Machine", genre: "Electronic", audioUrl: "/audio/electronic-afterimage.wav", color: "#10b981" },
  { id: "electronic-soft-launch", title: "Soft Launch", artist: "Night Render", genre: "Electronic", audioUrl: "/audio/electronic-soft-launch.wav", color: "#60a5fa" },
  { id: "electronic-signal-garden", title: "Signal Garden", artist: "Echo Parcel", genre: "Electronic", audioUrl: "/audio/electronic-signal-garden.wav", color: "#f472b6" },
  { id: "jazz-blue-steps", title: "Blue Steps", artist: "Marin Trio", genre: "Jazz", audioUrl: "/audio/jazz-blue-steps.wav", color: "#2563eb" },
  { id: "jazz-window-seat", title: "Window Seat", artist: "Ada Miles Quartet", genre: "Jazz", audioUrl: "/audio/jazz-window-seat.wav", color: "#d97706" },
  { id: "jazz-copper-lamp", title: "Copper Lamp", artist: "The Ninths", genre: "Jazz", audioUrl: "/audio/jazz-copper-lamp.wav", color: "#b45309" },
  { id: "jazz-sidewalk-swing", title: "Sidewalk Swing", artist: "Vera Reed", genre: "Jazz", audioUrl: "/audio/jazz-sidewalk-swing.wav", color: "#0f766e" },
  { id: "jazz-smoke-ring", title: "Smoke Ring", artist: "Orion Brass", genre: "Jazz", audioUrl: "/audio/jazz-smoke-ring.wav", color: "#7c2d12" },
  { id: "rnb-honeyline", title: "Honeyline", artist: "Sable & Co.", genre: "R&B", audioUrl: "/audio/rnb-honeyline.wav", color: "#db2777" },
  { id: "rnb-velvet-floor", title: "Velvet Floor", artist: "Noelle Park", genre: "R&B", audioUrl: "/audio/rnb-velvet-floor.wav", color: "#9333ea" },
  { id: "rnb-slow-orbit", title: "Slow Orbit", artist: "Mason Vale", genre: "R&B", audioUrl: "/audio/rnb-slow-orbit.wav", color: "#0d9488" },
  { id: "rnb-gold-room", title: "Gold Room", artist: "Aria North", genre: "R&B", audioUrl: "/audio/rnb-gold-room.wav", color: "#ca8a04" },
  { id: "rnb-soft-echo", title: "Soft Echo", artist: "The Kinfolk", genre: "R&B", audioUrl: "/audio/rnb-soft-echo.wav", color: "#be185d" },
];

export function tracksForGenre(genre: TrackGenre) {
  return TRACKS.filter((track) => track.genre === genre);
}

export function normalizeGuess(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9& ]/g, "")
    .replace(/\s+/g, " ");
}
