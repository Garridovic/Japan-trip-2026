# Kyoto Guide — Japan Trip 2026

A static, mobile-first Kyoto travel guide for December 11–15, 2026.

## Architecture

- `index.html`: page structure and Spanish-language editorial content.
- `assets/styles.css`: application styles.
- `js/main.js`: JavaScript application entry point.
- `js/modules/filters.js`: restaurant and alternative-place filters.
- `js/modules/map.js`: map, markers, place details, nearby places and geolocation.
- `js/modules/version.js`: deployed-version indicator.
- `data/*.json`: itinerary, places, restaurants, details, events, image catalog, image credits and version metadata.
- `scripts/prepare-images.js`: downloads curated Wikimedia Commons images, checks reuse licenses, creates responsive local WebP variants and rewrites `details.json`.
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


## Local image pipeline

The deployment workflow prepares the image library before testing or publishing:

```sh
npm install
npm run prepare:images
npm test
npm run test:e2e
```

`data/image-catalog.json` contains the curated place-specific Commons search terms and image counts. The preparation script uses the Wikimedia Commons API to select reusable files, downloads them, creates 480/960/1600px WebP variants in `assets/images/`, writes local responsive photo references to `data/details.json`, and generates `data/image-credits.json`.

The workflow uploads one prepared-site artifact. Unit tests and Playwright validate that exact artifact, and GitHub Pages deploys that same artifact only after both test jobs pass. If Commons cannot provide enough appropriately licensed high-resolution images for a place, preparation records a warning and continues. The workflow uploads `image-preparation-report` as a downloadable artifact (Markdown and JSON) for 30 days. Missing photos do not block deployment; browser and data tests still must pass.

Only Public Domain, CC0, CC BY and CC BY-SA licenses are accepted. Images with NonCommercial or NoDerivatives restrictions are excluded. Attribution metadata is retained in `data/image-credits.json`.


### Image search fallback (V10.2)

### Version display and tolerant image preparation (V10.3.1)

The visible version indicator reads the full version (for example `V10.3.1`) from `data/version.json`. Image search, download and conversion failures are recorded per place in `image-preparation-report.md` and `.json`; they do not stop image preparation or deployment. The GitHub Actions run publishes these reports as the `image-preparation-report` artifact, available for 30 days.

The image preparation script searches Wikimedia Commons by text and, when needed, by the configured Commons category. It still validates dimensions, MIME type and reusable license metadata before downloading.
