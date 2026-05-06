# Dev Toolbox

Dev Toolbox is a local-first desktop toolkit for frontend assets. The first milestone focuses on four high-value converters:

- Favicon package generator: image to `favicon.ico`, PNG icons, and optional manifest.
- WebP converter: batch image conversion, compression, resizing, and metadata control.
- WOFF2 converter: TTF/OTF/WOFF to WOFF2 with optional `@font-face` CSS.
- Background video compatibility pack: MP4, WebM, HLS `m3u8 + ts`, poster, and HTML snippet.

The app uses a GitHub-inspired light/dark interface and keeps conversion history locally in SQLite.

## Tech Stack

- Electron
- Vue 3
- TypeScript
- Vite
- Pinia
- Vue Router
- SQLite via `sql.js`
- `sharp`, `png-to-ico`, `wawoff2`, `ffmpeg-static`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run dist
```

## Project Layout

```txt
build/         Electron builder resources, desktop icons, installer assets
docs/          Project documentation and reusable conventions
src/
  electron/
    main/      Electron main process, IPC registration, native services
    preload/   Safe bridge exposed to the renderer
  renderer/    Vue app
  shared/      Shared TypeScript contracts
```

## Roadmap

Planned tools after the first milestone:

- SVG optimizer and SVG to PNG/WebP.
- App/PWA icon package generator.
- AVIF image conversion.
- Video to GIF/animated WebP.
- Video cover extraction and trimming.
- Subtitle converter: SRT/VTT/ASS.
- Font preview and Chinese font subsetting.
- CSS variable and Tailwind palette generator.
- JSON/YAML/TOML formatter and converter.
- QR code, JWT decoder, URL encoder, timestamp converter, hash generator.
