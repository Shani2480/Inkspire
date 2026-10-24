# Build and test Inkspire on Windows

Inkspire is a web app (Vite + React + TipTap) inside a Tauri 2 desktop shell. Nothing in it is Linux-only: the
same source builds a native Windows app, and the Rust shell already has its Windows branches. You rebuild from
source on the Windows machine; a build made on Linux does not run on Windows.

## 1. Install the tools

| Tool                                                                    | Why                  | Where                                                                                                  |
| ----------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| Git for Windows                                                         | clone the repository | https://git-scm.com/download/win                                                                       |
| Node.js 22 LTS or newer                                                 | web app, tests, lint | https://nodejs.org                                                                                     |
| Rust (rustup, stable, MSVC toolchain)                                   | the desktop shell    | https://rustup.rs                                                                                      |
| Visual Studio Build Tools 2022, "Desktop development with C++" workload | the Rust linker      | https://visualstudio.microsoft.com/visual-cpp-build-tools/                                             |
| WebView2 runtime                                                        | the desktop window   | already on Windows 10/11 with Edge; otherwise https://developer.microsoft.com/microsoft-edge/webview2/ |

Only the first two are needed for the web app and the tests. The rest are for the desktop window and the installer.
Install the Build Tools before Rust, or run `rustup default stable-msvc` afterwards. Restart the terminal once so
`node`, `npm`, `cargo` and `git` are on the PATH.

## 2. Get the code

Keep LF line endings (Prettier and the tests expect them):

```powershell
git config --global core.autocrlf false
git clone https://github.com/Shani2480/Inkspire.git
cd Inkspire
npm install
```

Clone into a short path such as `C:\src\Inkspire`. The Rust build creates deep paths under `src-tauri\target`,
and Windows limits paths to 260 characters unless long paths are enabled.

## 3. Web app and tests (no Rust needed)

```powershell
npm run dev          # http://localhost:1420, the web build in your browser
npm test             # Vitest
npm run lint         # ESLint + Prettier check
npm run build        # typecheck + production web build into dist\
```

The web build has no native shell, so file dialogs use the browser's, there is no "Open Containing Folder",
and AI keys cannot be stored. Everything else, including .docx open and save, works. Drop a .docx onto the window
to open it.

## 4. Desktop app

```powershell
npm run tauri dev    # live desktop window, reloads on changes
npm run tauri build  # release build and installers
```

The first `tauri` run compiles every Rust dependency and takes several minutes; later runs are incremental.
`tauri build` leaves:

- `src-tauri\target\release\inkspire.exe` (a portable executable)
- `src-tauri\target\release\bundle\msi\` (Windows Installer)
- `src-tauri\target\release\bundle\nsis\` (setup .exe)

Rust unit tests:

```powershell
cd src-tauri
cargo test --lib
```

## 5. What does not come with the repository

The notes travel with the repository: `docs/next-todo.md` (the plan and every dated fix), `docs/verify-list.md`
(what still needs a check in Word, Chrome or the desktop app) and `docs/changes.md` (chronological log).

These folders are ignored by git on purpose and live only on the Linux machine. Copy them by hand (USB stick,
cloud folder) into the same places if you want them on Windows:

| Folder or file               | What it is                                              |
| ---------------------------- | ------------------------------------------------------- |
| `screenshots/`               | reference screenshots of Word the UI is matched against |
| `tools/`                     | check tooling, including the .NET docx validator        |
| `scripts/`                   | local helper scripts                                    |
| `.cursor/`                   | editor rules                                            |
| `123.docx`, `Document1.docx` | test documents                                          |

The AI chat history and the Claude Code conversation do not move with the folder; the code, the git history and
the notes do.

## 6. What to check on Windows first

Windows is where Word lives, so the Word items on `docs/verify-list.md` become easy to check: open a .docx saved by
the app in Word and compare. The desktop webview on Windows is WebView2 (Chromium), so what you saw in Chrome is
what the desktop window shows; the desktop items on the verify list (Open Containing Folder, the first-run author
and locale detection, the rotated shape from Word) have never been run on Windows and should be tried.

## 7. If something fails

- `link.exe not found` or `MSVC not found`: the C++ workload of the Build Tools is missing, or Rust was installed
  with the GNU toolchain; run `rustup default stable-msvc`.
- `error: failed to run custom build command for webview2-com-sys` or a WebView2 error at start: install the
  WebView2 runtime from the link above.
- Prettier reports every file: line endings were converted to CRLF; set `core.autocrlf false` and clone again.
- Path too long errors from cargo: clone into a shorter path, or enable long paths
  (`git config --global core.longpaths true` and the Windows "Enable Win32 long paths" policy).
