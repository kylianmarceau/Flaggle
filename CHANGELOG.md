# Changelog

## v1.1.2

- Preloads and decodes flag images in the browser for smoother flag transitions.
- Adds Amplify custom cache headers for long-lived SVG flag caching.

## v1.1.1

- Changed hints to use objective country-name clues.
- Removed continent from hints to avoid ambiguous transcontinental classifications.

## v1.1.0

- Split the site into standard static web files.
- Moved flag SVGs into `assets/flags/`.
- Moved country data into `data/countries.js`.
- Moved styling into `styles.css`.
- Moved game logic into `app.js`.
- Added a project license.

## v1.0.0

- Initial GitHub release of Flaggle.
- Added the full flag guessing game with 196 countries.
- Added hint support and a continent-grouped progress board.
