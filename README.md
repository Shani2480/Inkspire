# Inkspire

Inkspire is a local, AI-first desktop word processor. It looks and behaves like a familiar ribbon editor (pages, headers, track changes, Office import/export) while keeping your documents and API keys on your machine. The UI is React + TipTap; the shell is [Tauri 2](https://tauri.app/).

## Features

- Page-oriented editing with rulers, zoom, headers/footers, and custom pagination
- Home / Insert / Layout / Design / Review / View / AI Tools ribbon
- AI rewrite, summarize, templates, themes, proofing, and a side chat panel (OpenAI, Anthropic, or local Ollama)
- Open and save HTML; open and save DOCX natively; ODT, RTF and PDF through Pandoc and Typst, which you choose to download (see below)
- Crash recovery drafts and a recent-files list in app data
- Keys and credentials stay in the desktop app (`$APPCONFIG`), not in the web view

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
