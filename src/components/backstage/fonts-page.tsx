import { formatBytes } from "@/ai/local"
import { openExternal } from "@/document/help"
import { APTOS_DOWNLOAD, OPTIONAL_FONTS, fontSize, useOptionalFonts } from "@/document/optional-fonts"

/**
 * Options > Fonts (U39). Word has no such page: it relies on Office's fonts being installed. Inkspire runs where
 * they are not (Linux, the web), so it offers free fonts with the same widths, each with its size and licence.
 */
export function FontsPage() {
  const status = useOptionalFonts((state) => state.status)
  const progress = useOptionalFonts((state) => state.progress)
  const { download, remove } = useOptionalFonts.getState()
  const missing = OPTIONAL_FONTS.filter((font) => status[font.id] === "missing" || status[font.id] === "failed")
  const total = missing.reduce((sum, font) => sum + fontSize(font), 0)
  return (
    <section className="backstage-card">
      <h2 className="backstage-card-title">Fonts</h2>
      <h3 className="options-sub">Download fonts</h3>
      <p className="backstage-muted">
        Free fonts with the same letter widths as Office&rsquo;s, so documents written in Calibri, Cambria or Arial
        break their lines and pages as in Word where those fonts are missing. Your documents keep their own font names,
        and where the Office font is installed it is still used.
      </p>
      <div className="options-fonts-list" role="table" aria-label="Optional fonts">
        <div role="row" className="options-fonts-row is-head">
          <span role="columnheader">Font</span>
          <span role="columnheader">Stands in for</span>
          <span role="columnheader">Size</span>
          <span role="columnheader" aria-label="Action" />
        </div>
        {OPTIONAL_FONTS.map((font) => {
          const state = status[font.id]
          const size = fontSize(font)
          return (
            <div role="row" key={font.id} className="options-fonts-row">
              <span role="cell">
                <span className="options-fonts-name" style={{ fontFamily: `"${font.family}", sans-serif` }}>
                  {font.family}
                </span>
                <span className="backstage-muted options-fonts-licence">{font.licence}</span>
              </span>
              <span role="cell">{font.standsFor.join(", ")}</span>
              <span role="cell" className="backstage-muted">
                {state === "downloading"
                  ? `${Math.round(((progress[font.id] ?? 0) / size) * 100)}%`
                  : formatBytes(size)}
              </span>
              <span role="cell" className="options-fonts-action">
                {state === "installed" ? (
                  <button type="button" className="dialog-btn" onClick={() => void remove(font.id)}>
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dialog-btn"
                    disabled={state === "downloading"}
                    onClick={() => void download([font.id])}
                  >
                    {state === "downloading" ? "Downloading…" : state === "failed" ? "Try Again" : "Download"}
                  </button>
                )}
              </span>
              {state === "failed" ? (
                <span role="cell" className="options-fonts-error">
                  Couldn&rsquo;t download {font.family}. Downloading fonts needs an internet connection.
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="options-fonts-all">
        <button
          type="button"
          className="dialog-btn"
          disabled={missing.length === 0}
          onClick={() => void download(missing.map((font) => font.id))}
        >
          Download All{missing.length ? ` (${formatBytes(total)})` : ""}
        </button>
      </div>
      <h3 className="options-sub">Aptos</h3>
      <p className="backstage-muted">
        Aptos, Office&rsquo;s default font since 2023, may only be downloaded from Microsoft. Install it on your system
        and Inkspire uses it.{" "}
        <button type="button" className="backstage-link" onClick={() => void openExternal(APTOS_DOWNLOAD)}>
          Get Aptos from Microsoft
        </button>
      </p>
    </section>
  )
}
