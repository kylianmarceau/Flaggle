# Flaggle

Flaggle is a browser-based geography guessing game. Players can switch between a flag guessing mode and a country map mode, with correct guesses tracked in a continent-grouped table with blank slots for missing countries.

## Play

Open `index.html` in any modern browser. For the best local experience, run a small static server from the repository root:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Features

- 196 playable countries
- Local SVG flag assets in `assets/flags/`
- Country Guesser mode with local world-map boundary data
- Auto-submit when the full displayed country name is typed
- Hint button with first-letter, letter-count, and word-count clues
- Continent-grouped progress table with blank slots for missing countries

## Download

Download the latest release from the GitHub Releases page:

https://github.com/kylianmarceau/Flaggle/releases

## Project Structure

- `index.html` - page markup
- `styles.css` - visual design
- `app.js` - game logic
- `data/countries.js` - country names, aliases, continents, and flag paths
- `data/world-map.js` - local country boundary data for the map mode
- `assets/flags/` - SVG flag assets
- `customHttp.yml` - AWS Amplify cache headers for static assets

## Publishing With GitHub Pages

After pushing this repository to GitHub, enable Pages from the repository settings:

1. Go to **Settings > Pages**.
2. Set **Source** to the `main` branch.
3. Set the folder to `/root`.
4. Save.

GitHub will publish the game from `index.html`.
