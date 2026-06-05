# Flaggle

Flaggle is a browser-based country flag guessing game. A flag appears on screen and the player types the matching country name. Correct guesses are tracked in a continent-grouped table with blank slots for missing countries.

## Play

Open `index.html` in any modern browser. For the best local experience, run a small static server from the repository root:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Features

- 196 playable countries
- Local SVG flag assets in `assets/flags/`
- Auto-submit when the full displayed country name is typed
- Hint button with continent and first-letter clues
- Continent-grouped progress table with blank slots for missing countries

## Download

Download the latest release from the GitHub Releases page:

https://github.com/kylianmarceau/Flaggle/releases

## Project Structure

- `index.html` - page markup
- `styles.css` - visual design
- `app.js` - game logic
- `data/countries.js` - country names, aliases, continents, and flag paths
- `assets/flags/` - SVG flag assets

## Publishing With GitHub Pages

After pushing this repository to GitHub, enable Pages from the repository settings:

1. Go to **Settings > Pages**.
2. Set **Source** to the `main` branch.
3. Set the folder to `/root`.
4. Save.

GitHub will publish the game from `index.html`.
