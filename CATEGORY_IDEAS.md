# Category Expansion Ideas

Notes for growing Locato beyond flags while keeping the same **race-to-answer** mechanic
(show a prompt → first correct typed answer takes the round).

## Core abstraction

The current data model already generalizes. An "item" is:

- **prompt** — what the player sees (`flagSrc` today; could be an image or a text clue)
- **answer** — the canonical typed answer (`name` today)
- **aliases** — accepted alternatives, matched via normalization (`aliases` → `acceptedAnswers` / `byAnswer`)
- **group/tag** — optional grouping dimension for filtered sub-modes (`continent` today)

Any category that fits *(quick-to-recognize prompt) → (short canonical answer with bounded aliases)*
drops into the existing race/scoring/multiplayer code unchanged.

---

## Tier 1 — Drop-in: same shape (image → name)

Need only a new asset folder + dataset. Matching, scoring, and modes are unchanged.

- **Country outlines / silhouettes** — reuse the country dataset, swap the flag asset for an outline SVG. Reuses continent grouping for free. Highest-leverage first expansion.
- **Company / brand logos** → brand name. Strong recognition race; aliases matter ("Coke" / "Coca-Cola"). ⚠️ trademark/licensing.
- **Car-brand / tech / sports-club crests** → name. Same licensing caveat.
- **Coats of arms / national emblems** → country. Reuses the country list + grouping.
- **Landmarks** (photo → "Eiffel Tower"). Curate a tight set; alias the obvious variants. ⚠️ image licensing.
- **US state / regional subdivision flags** → state. Identical to flags, adds depth.

## Tier 2 — Cheap: text prompt → text answer (no assets)

A prompt is just a string instead of an image; everything else is the same.

- **Capitals** — flag/country → capital (or reverse). Zero new assets if a `capital` field is added to the country data. Aliases handle "Kyiv/Kiev". Excellent ROI.
- **Currencies / languages** — country → currency or official language. Reuses country data.
- **Periodic table** — element symbol (or atomic number) → element name. Finite (118), pristine canonical answers, minimal aliases; group by metal/nonmetal/period. Very clean fit.
- **Arithmetic sprint** — "7 × 8" → 56. Procedurally generated, infinite supply, perfect canonical answer, zero dataset. The purest race; group by operation/difficulty. Cheapest category to ship.
- **Country by clue** — "landlocked, borders Switzerland & France" → Andorra. Content-authoring cost, reuses everything else.

## Tier 3 — Bigger lift: new prompt rendering or input

- **Audio**: name-that-tune, national anthems, movie/TV themes → needs an audio player + clip hosting. ⚠️ heavy licensing.
- **Pop-culture images**: movie posters/stills → title, album covers → album, actor headshots → name, video-game characters, emoji-rebus → phrase. High engagement. ⚠️ licensing + alias sprawl (title variants).
- **Species / breeds / anatomy / constellations**: image → name. Doable but alias-heavy (regional/common names); needs careful curation.

---

## Recommended starting picks

1. **Country outlines** — near-zero risk, reuses 100% of existing infra including grouping; pairs thematically with flags.
2. **Capitals** — add one `capital` field, no assets, instantly doubles content.
3. **Periodic table** or **Arithmetic sprint** — proves the engine works for non-geography, non-image categories and validates the abstraction before investing in licensed image sets.

## Architecture note

Before adding the second category, generalize the model so categories are **data, not forks**:

- Rename `Country` → `Item`: `{ id, prompt (image | text), answer, aliases, tags[], group? }`.
- Keep `acceptedAnswers` / `byAnswer` / normalize untouched.
- Make the mode carry which **dataset** + **prompt renderer** it uses.

The race/scoring/multiplayer layer (Room, transports, end-game modal) is already category-agnostic —
it only passes `flagSrc` / `countryName` strings around — so the surface to generalize is small.
