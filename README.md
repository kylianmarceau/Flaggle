# Needle Drop

A genre-based music snippet guessing game built with vinext and React.

## Play Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/`.

## What Is Included

- Six genres: Pop, Rock, Hip-Hop, Electronic, Jazz, and R&B.
- Five-round genre runs with snippets that reveal from `0.1s` up to `8s`.
- Local session score, streak, round progress, skip, replay, and final summary.
- Thirty generated demo WAV clips under `public/audio/`.
- A typed catalog and isolated audio metadata layer in `app/lib/catalog.ts`.

## Useful Commands

```bash
npm run lint
npm run build
node scripts/generate-demo-audio.mjs
```

The demo audio is synthetic and safe to bundle. Replace the catalog entries and
`audioUrl` values later if you add licensed uploads or external previews.
