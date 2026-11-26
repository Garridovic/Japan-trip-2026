# Japan Trip 2026 — multi-city guide (V11)

A static, mobile-first travel guide for the December 2026 trip to Japan. One application serves every city of the trip: a tab per city at the top of the page, a single `journey`, and a shared global content layer. Kyoto is the first city with content; Osaka is already declared in the journey but disabled until it has real content.

## Architecture

```text
index.html            page shell (no city content)
assets/styles.css     styles
js/main.js            entry point: loads the journey, shows the active city
js/modules/
  ids.js              id conventions and composite keys ("kyoto:fushimi")
  journey.js          pure journey helpers (enabled cities, URL → city, validation)
  city-index.js       pure lookup tables for one city (points/details by composite key)
  data.js             fetches journey, global content and the datasets of ONE city
  tabs.js             city tabs (generated from the journey, keyboard accessible)
  render.js           hero, itinerary, connections, tips, sources, footer
  filters.js          restaurants and alternative places sections with their filters
  map.js              Leaflet map, marker filters, legend, nearby places, GPS
  details.js          place detail sheet (resolved only inside the active city)
  views.js            app views (Guía, Frases, Platos): URL helpers and bottom bar controller
  phrases.js          pure phrasebook logic (validation, search, filters, favourites)
  phrases-ui.js       "Frases" section: search, chips, favourites, audio, full-screen show mode
  speech.js           Web Speech API wrapper (ja-JP voice, normal and slow rate)
  version.js          visible version, read from data/version.json
data/
  version.json        source of truth for the visible version
  journey.json        trip manifest: ordered cities, enabled flag, dates, inter-city connections
  global/tips.json    content shared by every city
  global/dishes.json  dish guide (Spanish, Japanese, romaji, meat/fish label, allergens, photo); dish-catalog.json and dish-credits.json feed `npm run prepare:dishes`
  global/phrases.json phrasebook shared by every city (Spanish, Japanese, romaji, category, 2 examples; `source` is `pdf` or `added`)
  cities/<id>/        one folder per city with content (see below)
scripts/prepare-images.js   per-city Wikimedia Commons image pipeline
tests/                      node:test data/logic tests and Playwright browser tests
```

### Data model

* **Journey** (`data/journey.json`) decides which cities exist, their order and which are `enabled`. Only enabled cities get a tab, and an enabled city must have a data folder. Inter-city travel (for example Kyoto → Osaka on 15 December) is a journey `connection`, not a place of either city; it is shown at the end of the origin city's itinerary.
* **City** (`data/cities/<id>/`): `city.json` (hero, map centre, day filters, colours, legend), `places.json`, `restaurants.json`, `details.json`, `itinerary.json` (quick cards and day-by-day plan) are required. `events.json`, `food.json` (restaurants section copy and filters), `extras.json` (alternative places cards), `sources.json` and `image-catalog.json` are optional; a section without data is hidden.
* **Global** (`data/global/`): content that applies to the whole trip. Each piece of data has exactly one owner (global, journey or one city).
* **Ids** are local to a city (`fushimi`, `food-01`). The runtime builds composite keys `<city>:<id>` so a place can never resolve the details of another city, even if two cities reuse an id.
* **Active city in the URL**: `?city=kyoto`. An unknown or disabled city falls back to the first enabled city and logs a `[journey]` warning. Only the datasets of the active city are downloaded.

### Adding a city (for example Osaka)

1. Create `data/cities/osaka/` with the same files and contracts as Kyoto (no code changes).
2. In `data/journey.json` set `"enabled": true` for the city. Its tab appears automatically.
3. Optionally add `image-catalog.json`; the image pipeline processes every enabled city that has one.

Do not copy content between cities: each city is researched and verified independently.

Application code, identifiers, comments and technical diagnostics are written in English. Visitor-facing content remains in Spanish.

## Run locally

The application uses native JavaScript ES modules and must be served over HTTP; do not open `index.html` using `file://`.

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Tests

Node.js 22 or later is recommended.

```sh
npm install
npm test
npx playwright install chromium
npm run test:e2e
```

The Node.js test suite validates the journey manifest, per-city datasets, ids and composite keys, references between datasets, global content, version consistency and (after `npm run prepare:images`) the local images. Playwright checks Kyoto's map, filters, GPS and sheets, the city tabs, city isolation, URL fallbacks and responsive layouts (narrow phone, hi-res phone, tablet, desktop). Multi-city behaviour is tested with fictional cities injected through network interception; no invented content is published.

## Deployment

The site remains static; no build step is required. GitHub Pages must be configured to use **GitHub Actions** as its deployment source (Repository Settings → Pages → Build and deployment → Source).

The `Test and deploy` workflow runs the Node.js and Playwright suites on pull requests and pushes to `main`. The deployment job runs only for pushes to `main`, and it has an explicit dependency on both test jobs (`needs: [unit, browser]`). If either suite fails, GitHub Actions skips deployment and the currently published site remains unchanged. Pull requests run tests but never publish the site.

This protects publication even when changes are pushed directly to `main`: they may enter the branch, but they will not be deployed unless both test jobs pass. For an additional review gate, use pull requests as the normal integration path.

## Data maintenance

Keep place IDs stable across a city's `places.json` and `details.json`. Preserve the Spanish editorial content and distinguish official event information from estimates and recommendations. Never invent schedules, routes, photos or transport data for a city: leave it out until it is verified.


## Local image pipeline

The deployment workflow prepares the image library before testing or publishing:

```sh
npm install
npm run prepare:images
npm test
npm run test:e2e
```

Each city's `data/cities/<id>/image-catalog.json` contains the curated place-specific Commons search terms and image counts. The preparation script uses the Wikimedia Commons API to select reusable files, downloads them, creates 480/960/1600px WebP variants in `assets/images/<id>/`, writes local responsive photo references to that city's `details.json`, and generates its `image-credits.json`. These generated files are not committed: the workflow regenerates them. Running the script locally rewrites `details.json`; discard that change before committing.

The workflow uploads one prepared-site artifact. Unit tests and Playwright validate that exact artifact, and GitHub Pages deploys that same artifact only after both test jobs pass. If Commons cannot provide enough appropriately licensed high-resolution images for a place, preparation records a warning and continues. The workflow uploads `image-preparation-report` as a downloadable artifact (Markdown and JSON) for 30 days. Missing photos do not block deployment; browser and data tests still must pass.

Only Public Domain, CC0, CC BY and CC BY-SA licenses are accepted. Images with NonCommercial or NoDerivatives restrictions are excluded. Attribution metadata is retained in each city's `image-credits.json`. The report lists the city of every issue.


### Image search fallback (V10.2)

### Version display and tolerant image preparation (V10.3.1)

The visible version indicator reads the full version (for example `V11.0.0`) from `data/version.json`. Image search, download and conversion failures are recorded per place in `image-preparation-report.md` and `.json`; they do not stop image preparation or deployment. The GitHub Actions run publishes these reports as the `image-preparation-report` artifact, available for 30 days.

The image preparation script searches Wikimedia Commons by text and, when needed, by the configured Commons category. It still validates dimensions, MIME type and reusable license metadata before downloading.


## App views (V11.3)

The page has three full-screen views chosen with the fixed bottom bar: **Guía** (the active city, with its city tabs and section navigation), **Frases** and **Platos** (both global). The URL keeps the state: `?view=frases` / `?view=platos` (the guide is the default and has no param) next to `?city=…`. Each view keeps its scroll position, search and favourites when you switch.

Dish photos come from Wikimedia Commons (CC0, public domain, CC BY, CC BY-SA) and are prepared manually with `npm run prepare:dishes` (resumable; `--force` redoes all). Set `file`, `exclude` or `skip` per dish in `data/global/dish-catalog.json` to fix a photo. The result is committed so published photos are always reviewed ones.
