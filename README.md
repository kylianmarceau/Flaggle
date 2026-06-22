# Needle Drop

A genre-based music snippet guessing game built with Next.js and React.

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

## Spotify Previews

The app can fetch Spotify search results from `/api/spotify/tracks` when these
environment variables are set:

```bash
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

If the credentials are missing, or if Spotify does not return enough playable
preview URLs, the game falls back to the bundled demo clips.

## Hosting On AWS Amplify

1. Push this repo to GitHub, GitLab, Bitbucket, or AWS CodeCommit.
2. In AWS Amplify, create a new app and connect the repository branch you want
   to deploy.
3. Keep the included `amplify.yml` build settings, or paste these settings into
   the Amplify console:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - "**/*"
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

4. Add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in Amplify environment
   variables if you want live Spotify-backed rounds.
5. Deploy the branch. Amplify will run the build and host the Next.js app.
