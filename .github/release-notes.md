Inkspire, a local, AI-first desktop word processor. See the [README](https://github.com/Shani2480/Inkspire#readme) for the feature tour.

## Download

| System                         | File                        | Install                                                                                                                                  |
| ------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 10/11                  | `Inkspire_*_x64-setup.exe`  | Run it. The installer is not code-signed, so SmartScreen asks you to confirm ("More info", then "Run anyway").                           |
| Debian, Ubuntu, Mint, Pop!\_OS | `Inkspire_*_amd64.deb`      | `sudo apt install ./Inkspire_*_amd64.deb`                                                                                                |
| Any Linux (Flatpak)            | `Inkspire_*_x86_64.flatpak` | `flatpak install --user ./Inkspire_*_x86_64.flatpak` (needs the Flathub remote for the GNOME runtime), then `flatpak run com.aiword.app` |
| Any Linux (AppImage)           | `Inkspire_*_amd64.AppImage` | `chmod +x Inkspire_*_amd64.AppImage` and run it                                                                                          |

All builds are x86_64. Pandoc, Typst and the built-in AI engine are optional downloads offered by the app on first run.
