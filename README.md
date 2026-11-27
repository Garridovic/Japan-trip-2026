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

The Node.js test suite validates the journey manifest, per-city datasets, ids and composite keys, references between datasets, global content, version consistency and the committed local images and their credits (regenerate them by hand with `npm run prepare:images`). Playwright checks Kyoto's map, filters, GPS and sheets, the city tabs, city isolation, URL fallbacks and responsive layouts (narrow phone, hi-res phone, tablet, desktop). Multi-city behaviour is tested with fictional cities injected through network interception; no invented content is published.

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

## Usability polish (V11.4)

Full-screen sheets (place sheet, phrase show mode, dish sheet) push a history entry (`overlay-history.js`), so the Back button or the swipe-back gesture closes the sheet instead of leaving the guide. Filter panels (`details[data-open-on-wide]`) start collapsed on phones. Dish search falls back to a typo-tolerant match when nothing matches exactly. Image catalog entries accept `exclude` (list of Commons file titles) to ban a photo.

## Offline mode (V11.5)

`sw.js` (service worker) stores the guide after the first visit so it opens without a connection. `npm run build:offline` writes `offline-manifest.json` (what to cache) and stamps a content hash into `sw.js`; CI runs it on every build (the photos are committed, so nothing is downloaded), so every deploy ships a new worker that installs a fresh cache and deletes the old one.

* **required**: HTML, JS, CSS, data, Leaflet (now in `assets/vendor/leaflet`, no CDN), icons. If one fails, the install fails and the previous version keeps working.
* **optional**: 480 px place and dish photos, downloaded in the background right after the new worker is active (never during install: the install only saves the app so the new version can take over in seconds even on a slow connection). Required + optional is the "essentials" (about 3.5 MB), saved automatically on the first visit.
* **warm**: 960 px photos ("Descargar todo", about 10 MB): automatic only on wifi/ethernet (Network Information API) and never on data saver; everywhere else (iPhone Safari has no such API) the user taps the button. 1600 px photos are cached when viewed; offline the next smaller copy is shown (1600 → 960 → 480).
* **Header chip** (`#offline-chip`): the service worker compares the cache with the manifest file by file (`verify`) and reports `missing` counts; the chip shows "Offline ✓" (everything), "Básico" (essentials only), a percentage while downloading, or a red warning when something the app needs is missing (the popover then offers "Reintentar", which re-downloads the missing files). The popover also shows the saved copy date/version, space used and saved map tiles, and has "Borrar datos sin conexión y recargar" (with confirmation; favourites are kept). A red "Sin conexión" banner appears while the network is down.
* Images: dish and place photos are WebP quality 72 (effort 6, smart subsampling). AVIF would save roughly another 40 % but needs a `<picture>` fallback for older iPhones.
* **Map tiles**: tiles you view are kept (max 700). The "Guardar mapa" button stores at most 120 tiles around the city, one by one with a pause, to respect the OpenStreetMap tile policy (no bulk downloads).
* The guide can be installed to the home screen (`manifest.webmanifest`, icons from `npm run make:icons`).
* **Updates** (`js/modules/updates.js`): a new worker installs only the required files, then `skipWaiting` + `clients.claim` make it take over. The page compares `data/version.json?fresh=…` with the one on screen; if nothing is half-done (no touch since the screen opened, no field being edited, no open sheet) it reloads onto the new version by itself, otherwise it shows "Actualizar". If the worker cannot take over within 40 s, or the old version is still showing after the reload, the saved copy is wiped once and the guide reloads from the network. The sure route (`forceFreshStart` + `reloadFresh`) has a time limit on every step, deletes the saved app, removes the worker, re-downloads every app file with `cache: 'reload'` (GitHub Pages sends `max-age=600`, so Safari may otherwise rebuild the page from old HTTP-cached files) and reloads on `?_u=<time>`, which `updates.js` takes off the address again; a 75 s watchdog reloads whatever hangs. After a reload that still shows the old version it runs once more and the version check always runs. The settings screen shows installed/published versions with "Buscar actualización" and "Forzar actualización" (`js/modules/update-settings.js`, talking to the updater through the `updates:request` / `updates:status` events). `tests/e2e/update-cycle.spec.js` runs two successive versions in a real browser (the test server fakes a new deployment per cookie).
* Recovery: open `?reset-offline` to unregister the worker and clear its caches.
* Playwright blocks service workers by default (they would hide `page.route()` mocks); only `tests/e2e/offline.spec.js` enables them.

## Viaje and Osaka (V11.7)

* **Viaje** (`data/global/lodging.json`, `js/modules/lodging*.js`): fourth view of the bottom bar with every stay in chronological order (dates, nights, address, Google Maps link, "copy address"). **The repository is public**: the data must never hold PINs, booking numbers, who paid or amounts. `tests/lodging.test.js` fails if such keys or text appear.
* **Osaka** (`data/cities/osaka/`, enabled in `data/journey.json`): same structure as Kioto. Days 15 and 16 are Victor's plan with his times; checks and proposals appear as visible "Sugerencia" notes (never applied silently). Day 17 is an optional draft (Sumiyoshi Taisha before Nara). Every place sheet lists its sources (`details[].sources`) and what is unverified (`verificationNote`). Pins marked `pinApproximate` need checking in Google Maps. Photos come from the image pipeline; pin reviewed ones with `files` in `image-catalog.json` (`files: []` = no photo on purpose). `npm run prepare:images -- --city=osaka` runs a single city.
* The service worker answers 404 for data files that are not saved, so optional datasets (a city without `events.json`) are skipped offline.

## Private trip data and PDF (V11.8)

* In **Viaje**, every stay has a private block (PIN or access code, booking number, notes). It is typed on the phone and saved **only in that device's localStorage** (`japan-trip:lodging-private`): it is never in the repository, never sent to a server and never stored by the service worker. It keeps working offline, survives "Borrar datos sin conexión", and has an export / import backup file (`japon-2026-datos-privados.json`) and a "Borrar mis datos privados" button. Nobody must paste real PINs or booking numbers into the repo; `tests/lodging.test.js` and `tests/private-notes.test.js` enforce it.
* **"Descargar PDF" exists only in Viaje.** It opens the browser's print view (`window.print()`), whose single `@media print` block hides everything except the Viaje view and writes the private data as text; choose "Guardar como PDF". The other views have no print button and no print CSS.
