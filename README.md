# Kyoto Guide — Japan Trip 2026

A static, mobile-first Kyoto travel guide for December 11–15, 2026.

## Architecture

- `index.html`: page structure and Spanish-language editorial content.
- `assets/styles.css`: application styles.
- `js/main.js`: JavaScript application entry point.
- `js/modules/filters.js`: restaurant and alternative-place filters.
- `js/modules/map.js`: map, markers, place details, nearby places and geolocation.
- `js/modules/version.js`: deployed-version indicator.
- `data/*.json`: itinerary, places, restaurants, details, events and version metadata.
- `tests/`: Node.js data tests and Playwright browser tests.
- `.github/workflows/tests.yml`: automated test workflow.

Application code, identifiers, comments and technical diagnostics should be written in English. Visitor-facing content remains in Spanish.

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

The Node.js test suite validates data integrity, IDs, coordinates, detail references and event metadata. Playwright checks map initialization, marker rendering, place-detail interaction and restaurant filtering.

## Deployment

The site remains static; no build step is required. GitHub Pages must be configured to use **GitHub Actions** as its deployment source (Repository Settings → Pages → Build and deployment → Source).

The `Test and deploy` workflow runs the Node.js and Playwright suites on pull requests and pushes to `main`. The deployment job runs only for pushes to `main`, and it has an explicit dependency on both test jobs (`needs: [unit, browser]`). If either suite fails, GitHub Actions skips deployment and the currently published site remains unchanged. Pull requests run tests but never publish the site.

This protects publication even when changes are pushed directly to `main`: they may enter the branch, but they will not be deployed unless both test jobs pass. For an additional review gate, use pull requests as the normal integration path.

## Data maintenance

Keep place IDs stable across `data/places.json` and `data/details.json`. Preserve the Spanish editorial content and distinguish official event information from estimates and recommendations.
