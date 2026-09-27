# Signal — the Identity-MD feed

A responsive chronological reader for Identity-MD and $IMD coverage, with expandable entries, source and content filters, search, bookmarks, hide/undo/restore, and day, dusk, and night themes. Desktop readers can choose timeline, two-column grid, or compact views. Preferences and saved/hidden IDs stay in this browser; no account or wallet is required.

**The included export is a clearly labeled preview with eight original sample entries.** These are not real social posts, announcements, or current news. Source links open the official project or relevant platform searches. The working collector is included, but continuous live publication needs accessible sources and an external schedule. The public Bluesky search returned HTTP 403 during validation; no X credentials or publisher feed URLs were supplied. No live results or coverage claims have been invented.

## Install, run, and rebuild

Use Node.js 22.12+ (validated with Node 24.9.0) and npm.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Open the URL printed by Vite. `npm run build` creates `dist/index.html`, relative JavaScript/CSS/font assets, illustrations, and `dist/feed.json`. The output is ready for a static host. `npm run preview` serves the built export, not the source.

For an environment where dependencies must live outside the repository:

```sh
mkdir -p /tmp/imd-feed-deps
cp package.json package-lock.json /tmp/imd-feed-deps/
npm ci --prefix /tmp/imd-feed-deps
IMD_DEPENDENCIES=/tmp/imd-feed-deps npm run typecheck
IMD_DEPENDENCIES=/tmp/imd-feed-deps npm test
IMD_DEPENDENCIES=/tmp/imd-feed-deps npm run build
```

The `IMD_DEPENDENCIES` override is used only by the build/check/collector tools; it is never embedded into the website. The delivered lockfile is the installation source of truth.

## Publish the static site

Upload **the contents of `dist/` together**, including `feed.json` and `assets/`, to any static web host, IPFS gateway directory, or ENS content directory. Vite uses `base: './'`; the application has no server routes or rewrite requirement. Open the directory URL with its trailing slash. A nested path such as `/news/` works; it was tested at `/preview/`.

The publisher serves this export directly and does not need to build it. Source, lockfile, and the finished export are included together. Do not publish `service/`, credentials, or dependency directories. For a live feed, serve `feed.json` with revalidation (`Cache-Control: no-cache` or a short max-age) and hashed assets with immutable caching. Updating a pinned IPFS/ENS deployment also requires republishing the new snapshot and updating its content reference; a static immutable snapshot cannot change by itself.

## Enable live collection

1. Edit `service/sources.json`. `service/sources.example.json` shows each supported adapter. Example URLs and channel IDs are disabled placeholders and must be replaced with actual publication feeds.
2. Configure RSS, Atom, or JSON Feed URLs for approved publications and communities; YouTube channel Atom feeds work with `origin: "YouTube", kind: "Video"`. Other sites are grouped as Web & blogs unless an origin is specified. Use top-level publication feeds, not comment feeds.
3. Bluesky uses public search. Availability varies by provider, region, and rate limits. X uses its recent-search API; enable its entry and supply an authorized `IMD_X_BEARER_TOKEN` through your host’s secret manager/process environment. API access may require an appropriate paid tier. No credentials are shipped or read by the browser.
4. Collect once and inspect the result:

```sh
npm run collect -- --config service/sources.json --state /tmp/imd-signal/state.json
npm run build
npm run preview
```

A successful collection replaces `public/feed.json` with live entries and actual collection timestamps. An empty successful search produces an empty live feed. All-source failure leaves the existing export untouched and exits with status 1; it never turns sample entries into live entries. On partial failure, earlier entries from unavailable sources remain, with a visible source-unavailable notice. A skipped run within the cadence/backoff period exits without publishing. The most recent snapshot timestamp remains visible, including when the collector has stopped.

Schedule collection every **15 minutes** (96 checks per source per day). The collector enforces that minimum interval, sends ETag/Last-Modified conditions where supported, caps source responses at 2 MiB, times out each source after 15 seconds, respects Retry-After, and backs off unavailable sources. It uses a lock to prevent concurrent runs and atomic file replacement. Configure canonical HTTPS URLs: redirects deliberately fail instead of forwarding authorization or silently switching endpoints. Keep cache state on persistent storage for conditional requests and failure recovery; the default state path is under the system temp directory. After a crashed process, verify no collector is running before removing its `.lock` file.

Example host-side cron (adapt paths and Node executable):

```cron
*/15 * * * * cd /srv/imd-signal && /usr/bin/node service/collect.mjs --config service/sources.json --state /var/lib/imd-signal/state.json --output /srv/www/signal/feed.json >> /var/log/imd-signal.log 2>&1
```

The collector can write directly to an already published `feed.json`; a frontend rebuild is unnecessary for data-only changes. Give the process permission to write the chosen state and output paths. Do not schedule the static preview server or expose the collector as a public endpoint.

The browser rechecks its same-origin snapshot every **5 minutes while visible**, and on manual refresh. New content waits behind a “Show new signals” button. This gives a typical freshness budget of up to 20 minutes without continuously polling each social service or changing the reader’s position.

## Curation and coverage limits

`service/filter.mjs` checks project relevance, text substance, obvious spam patterns, reply/repost metadata, tracking-normalized original URLs, token-set similarity, and shared image URLs/media keys. It keeps the earliest available original and publishes newest-first. Related memes and single-image entries bypass the text-length threshold. Off-topic images do not. Sources are capped at 100 entries per response, the export at 500 entries, with a 60-day retention window.

These are deterministic heuristics, not a guarantee of accuracy or an endorsement of claims. They can miss paraphrases, altered images, obfuscated spam, or relevance that requires understanding an image. Media matching is not perceptual image analysis. “Earliest” means earliest among collected entries, not proof of global authorship. API search limits can omit busy-period posts; this is a current-feed service, not a complete historical archive. RSS/JSON endpoints must expose reply/repost metadata for those relationships to be detectable. Broad coverage depends on the configured sources; there is no universal scraper that bypasses platform access restrictions.

Entries expand to the original text available from the source, which may be an excerpt for a publication. Videos link to their original player; arbitrary third-party scripts/iframes and HTML are not embedded. Samples have no attached playable video. Live remote images require access to their original host and gracefully disappear if they fail. All assets required by the shipped preview are local.

Bookmarks store IDs, not permanent copies; they remain available while the entry remains in the snapshot. Storage denial does not prevent use, but preferences then last only for the current page session.

## Checks performed

Latest local validation: the production build and strict typecheck passed; all 15 service tests and 22 browser check groups passed. Four automated axe scans reported zero violations in the tested states. The final export was rebuilt and confirmed byte-identical to the browser-checked files.

Actual local results and six-domain Better Interface review are recorded in [`artifacts/validation.md`](artifacts/validation.md). Reproducible service and browser checks are included.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run validate:browser
```

The browser script owns and closes a local HTTP server and Chromium session within one foreground process. It serves the actual export at `/preview/`, exercises primary interactions and error recovery, runs axe checks, measures selected rendered text/background contrast pairs, and writes screenshots and `artifacts/browser-results.json`. To keep browser downloads outside the repository, set `PLAYWRIGHT_BROWSERS_PATH=/tmp/imd-browsers` for installation and validation. The assignment’s browser connector could not launch its missing Chrome; direct Playwright supplied the rendered checks instead.

See [`DESIGN.md`](DESIGN.md) for actual design tokens, components, typography, and breakpoints. See [`NOTICE.md`](NOTICE.md) for design-guide, font, and artwork attribution. No dependency archives, caches, submodules, or vendored registry are part of the deliverable.
