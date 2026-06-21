# Needle Drop

A genre-based music snippet guessing game built with Next.js and React.

## Play Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/`.

## Deploy to AWS Amplify

This repo includes `amplify.yml`, so Amplify should run:

```bash
npm ci
npm run build
```

and deploy the `.next` output. Do not point Amplify at `dist`, `dist/client`, or the repo root.

Add these Amplify environment variables if you want Spotify-backed rounds:

```text
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
```

If those variables are missing, the game falls back to the bundled demo tracks.

## Deploy to GitHub Pages

GitHub Pages is static hosting, so it cannot run the `/api/spotify/tracks` route. The included GitHub Actions workflow builds a static export and disables the Spotify API so the demo-track game still works at:

```text
https://<your-github-username>.github.io/Flaggle/
```

In GitHub, set **Settings > Pages > Source** to **GitHub Actions**, then push to `main`.

For a local GitHub Pages build, run:

```bash
npm run build:pages
```

If your repository is not named `Flaggle`, change the `/Flaggle` base path in `package.json` or rely on the GitHub Actions workflow, which sets it from the repository name automatically.

## What Is Included

- Six genres: Pop, Rock, Hip-Hop, Electronic, Jazz, and R&B.
- Five-round genre runs with snippets that reveal from `0.1s` up to `8s`.
- Local session score, streak, round progress, skip, replay, and final summary.
- Thirty generated demo WAV clips under `public/audio/`.
- Optional Spotify/iTunes preview loading through `app/api/spotify/tracks/route.ts` when deployed on a server-capable host such as Amplify.
- A typed catalog and isolated audio metadata layer in `app/lib/catalog.ts`.

## Useful Commands

```bash
npm run lint
npm run build
npm run build:pages
node scripts/generate-demo-audio.mjs
```

The demo audio is synthetic and safe to bundle. Replace the catalog entries and `audioUrl` values later if you add licensed uploads or external previews.
