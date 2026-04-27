# TapSurge

TapSurge is an offline-first, multi-finger click-speed test for iPad competition use. It is built with Vite, TypeScript, native DOM APIs, and Canvas. No backend or network calls are required while playing.

## Features

- Fixed-duration tap tests: 10 s, 30 s, or 60 s.
- `pointerdown` based tap counting with active pointer tracking so held fingers are not double-counted.
- `performance.now()` timing, typed-array tap buffers, and preserved raw timestamps/pointer IDs for audit exports.
- Average CPS, one-second real-time CPS, max real-time CPS, and max simultaneous fingers.
- Safe iPad PWA layout with fullscreen manifest, landscape orientation, safe-area padding, and touch gesture suppression.
- Local run history stored in `localStorage`, keyed by unique run ID.
- Custom service worker for offline app-shell caching.

## Development

```sh
npm install
npm run dev
```

Open the local Vite URL in Safari or a desktop browser. For iPad testing, serve the app over HTTPS or from a trusted LAN setup, then add it to the Home Screen.

## Build

```sh
npm run build
npm run preview
```

The production output is written to `dist/`.

## iPad PWA Install

1. Open the deployed site in Safari on the iPad in landscape orientation.
2. Use Share -> Add to Home Screen.
3. Launch TapSurge from the Home Screen so it runs as a fullscreen PWA.
4. Keep the device in landscape mode and avoid leaving the app during a run; focus loss, page hide, or tab backgrounding marks the run invalid.

## Cloudflare Pages Deployment

After pushing this repository to GitHub:

1. In Cloudflare, choose Create application -> Pages -> Import from an existing Git repository.
2. Select the TapSurge repository.
3. Set the build command to `npm run build`.
4. Set the build output directory to `dist`.
5. Deploy. Cloudflare Pages installs dependencies, runs the build, and publishes the static assets on each commit.

If this project is ever converted to plain static files without a build step, use build command `exit 0` and point the output directory at the static asset folder instead.

## Audit Data

Each completed run is stored in `localStorage` under `tapsurge:run:<run-id>`. Result export downloads JSON containing:

- Run ID, start timestamp, validity, invalid reason, and exact configured duration.
- Total taps, average CPS, max real-time CPS, and max simultaneous fingers.
- `tapTimesMs` as millisecond offsets from the first valid tap.
- `pointerIds` aligned by index with `tapTimesMs`.
