# Inkspire

Inkspire is a local, AI-first desktop word processor. It looks and behaves like a familiar ribbon editor (pages, headers, track changes, Office import/export) while keeping your documents and API keys on your machine. The UI is React + TipTap; the shell is [Tauri 2](https://tauri.app/).

![Inkspire editing a report with headings, a styled table and an equation](docs/images/overview.png)

## Download

Installers are on the [Releases page](https://github.com/Shani2480/Inkspire/releases/latest): a setup `.exe` for Windows, and a `.deb`, Flatpak and AppImage for Linux (x86_64). The Windows installer is not code-signed yet, so SmartScreen asks you to confirm before it runs.

## Features

- Page-oriented editing with rulers, zoom, headers/footers, and custom pagination (keep with next, page break before, table rows that split across pages under a repeated header row)
- Home / Insert / Design / Layout / References / Review / View / AI Tools ribbon, with contextual tabs for tables, pictures, shapes, charts, SmartArt and equations
- Charts (column, line, pie, treemap, filled maps and more) with an embedded data sheet, chart elements, styles and filters
- SmartArt diagrams, shapes, WordArt, text boxes and pictures, with Square, Tight, Through, Top and Bottom, Behind and In Front of Text wrapping and editable wrap points
- Equations, tables with table styles, footnotes, tables of contents, citations and cross-references
- Comments and tracked changes with a reviewing pane
- AI rewrite, summarize, templates, themes, proofing, and a side chat panel (OpenAI, Anthropic, or local Ollama)
- Open and save HTML; open and save DOCX natively; ODT, RTF and PDF through Pandoc and Typst, which you choose to download (see below)
- Light and dark themes
- Crash recovery drafts and a recent-files list in app data
- Keys and credentials stay in the desktop app (`$APPCONFIG`), not in the web view

## Tour

### Charts

Insert a chart from the ribbon, edit its numbers in the docked data sheet, and turn chart elements on and off from the buttons beside it.

![A column chart with the Chart Elements panel open](docs/images/charts.png)

### SmartArt

Hierarchy, process, cycle, list, matrix and pyramid layouts. Diagrams are saved as Word's own SmartArt, so they stay editable in Microsoft Word.

![An organisation chart drawn with the SmartArt Hierarchy layout](docs/images/smartart.png)

### Shapes and text wrapping

Shapes, pictures and text boxes float on the page with Word's wrapping options, and the Shape Format tab offers fills, outlines, effects and arrangement.

![A shape with Square wrapping and the Shape Format tab](docs/images/shapes.png)

### Review

Comments, tracked insertions and deletions, and accept or reject from the Reviewing Pane.

![A comment and a tracked change in the Reviewing Pane](docs/images/review.png)

### AI tools

Summarize, rewrite, build templates and chat about the document with a built-in engine, a local Ollama model, OpenAI or Anthropic.

![The AI chat panel beside a document](docs/images/ai.png)

### File and templates

The File view opens recent documents and starts new ones from templates.

![The File view with templates and recent documents](docs/images/file.png)

### Dark mode

![The Insert tab in dark mode](docs/images/dark-mode.png)

## Requirements

- Node.js 22+ (npm)
- [Rust](https://rustup.rs/) stable (edition 2024; recent rustc)
- Platform webview: WebKitGTK (Linux), WebView2 (Windows), or system WebView (macOS)
- Optional, downloaded by the app when you choose: Pandoc (ODT/RTF, PDF) and Typst (PDF), plus the built-in AI engine

## Setup

On Windows, follow [WINDOWS.md](WINDOWS.md) (tools to install, cloning with LF line endings, the desktop build and installers, and what does not travel with the repository).

```bash
npm install
```

### Pandoc and Typst (optional downloads)

Nothing is bundled. The first-run setup offers Pandoc 3.12.1 (~35 MB) and Typst 0.15.1 (~17 MB) as unticked choices, and the app asks again when ODT, RTF or PDF is used and a tool is missing. Downloads come from the projects' GitHub releases, are checked against a pinned SHA-256, and live in the app's data folder. A copy already on your `PATH` is used instead. The pinned list is in `src-tauri/src/tools.rs`.

### AI keys

1. Run the desktop app (`npm run tauri dev`).
2. Open **AI Tools → AI keys** (or the keys dialog from the AI UI).
3. Choose a provider: **Local Ollama**, **OpenAI**, or **Anthropic**.
4. Paste keys for OpenAI/Anthropic and use **Test connection**. Ollama needs a local server (default `http://127.0.0.1:11434`); no cloud key.
5. Pick a model per provider if you want something other than the defaults.

Keys are stored by the Rust side under the app config directory with owner-only permissions. They are never written into document HTML.

## Develop

Web UI only (no native shell / no AI key IPC):

```bash
npm run dev
```

Full desktop app:

```bash
npm run tauri dev
```

Useful scripts:

| Command                            | What it does                                                            |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `npm run build`                    | Typecheck + Vite production build                                       |
| `npm test`                         | Vitest                                                                  |
| `npm run lint`                     | ESLint + Prettier check                                                 |
| `cd src-tauri && cargo test --lib` | Rust unit tests (the Pandoc round-trip runs when Pandoc is on the PATH) |

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint, Vitest, `npm run build`, and `cargo test --lib` on push/PR.

Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds the `.deb` and AppImage on Ubuntu 22.04, a Flatpak from that `.deb` (`packaging/flatpak/`), and the Windows setup `.exe`, and publishes them as a GitHub release.
