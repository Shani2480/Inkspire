import { openColorDialog } from "@/components/color-dialog"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { SCHEME_SLOTS, SLOT_LABELS, stackOf } from "@/document/design"
import { ensureSystemFonts, useFontChoices } from "@/editor/system-fonts"
import { useEffect, useState } from "react"

/**
 * Design > Colors > Customize Colors…: Word's Create New Theme Colors. Each of the twelve theme colours gets a
 * colour button, the sample on the right shows the scheme on a light and a dark background, and Save keeps the
 * scheme by its name for every document and applies it to this one.
 */
export function ThemeColorsDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: { name: string; colors: string[] }
  onSave: (scheme: { name: string; colors: string[] }) => void
  onClose: () => void
}) {
  const [colors, setColors] = useState(initial.colors)
  const [name, setName] = useState(initial.name)
  const pick = (index: number) =>
    openColorDialog(colors[index] ?? "#000000", (color) =>
      setColors((current) => current.map((value, at) => (at === index ? color.toLowerCase() : value))),
    )
  return (
    <DialogFrame
      title="Create New Theme Colors"
      width={520}
      onClose={onClose}
      onSubmit={() => name.trim() && onSave({ name: name.trim(), colors })}
    >
      <div className="theme-dialog">
        <fieldset className="theme-dialog-colors">
          <legend>Theme colors</legend>
          {SCHEME_SLOTS.map((slot, index) => (
            <div key={slot} className="theme-dialog-color-row">
              <span>{SLOT_LABELS[index]}</span>
              <button
                type="button"
                className="theme-dialog-swatch"
                aria-label={`${SLOT_LABELS[index]} ${colors[index]}`}
                onClick={() => pick(index)}
              >
                <span style={{ background: colors[index] }} />
              </button>
            </div>
          ))}
        </fieldset>
        <fieldset className="theme-dialog-sample">
          <legend>Sample</legend>
          <div className="theme-dialog-samples" data-keep-light>
            <ColorSample colors={colors} dark={false} />
            <ColorSample colors={colors} dark />
          </div>
        </fieldset>
      </div>
      <div className="theme-dialog-name">
        <label htmlFor="theme-colors-name">Name:</label>
        <input
          id="theme-colors-name"
          className="dialog-input"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <DialogButtons ok="Save" submit okDisabled={!name.trim()} onCancel={onClose}>
        <button type="button" className="dialog-btn" onClick={() => setColors(initial.colors)}>
          Reset
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}

/** Word's sample: text on the background, the six accents as bars, and the two hyperlink colours. */
function ColorSample({ colors, dark }: { colors: string[]; dark: boolean }) {
  const [dk1, lt1, dk2, lt2] = colors
  const background = dark ? dk2 : lt1
  const text = dark ? lt1 : dk1
  const band = dark ? lt2 : dk2
  return (
    <div className="theme-dialog-swatches" style={{ background, color: text }} aria-hidden>
      <span className="theme-dialog-sample-text" style={{ background: band, color: dark ? dk2 : lt1 }}>
        Text
      </span>
      <span className="theme-dialog-sample-text">Text</span>
      <span className="theme-dialog-bars">
        {colors.slice(4, 10).map((color, index) => (
          <span key={index} style={{ background: color, height: `${40 + ((index * 23) % 50)}%` }} />
        ))}
      </span>
      <span className="theme-dialog-links">
        <u style={{ color: colors[10] }}>Hyperlink</u>
        <u style={{ color: colors[11] }}>Hyperlink</u>
      </span>
    </div>
  )
}

/**
 * Design > Fonts > Customize Fonts…: Word's Create New Theme Fonts, a heading and a body font with a sample of
 * each, saved by name.
 */
export function ThemeFontsDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: { name: string; major: string; minor: string }
  onSave: (scheme: { name: string; major: string; minor: string }) => void
  onClose: () => void
}) {
  const fonts = useFontChoices()
  useEffect(() => {
    void ensureSystemFonts()
  }, [])
  const [major, setMajor] = useState(initial.major)
  const [minor, setMinor] = useState(initial.minor)
  const [name, setName] = useState(initial.name)
  const names = [...new Set([initial.major, initial.minor, ...fonts.map((font) => font.label)])].sort((a, b) =>
    a.localeCompare(b),
  )
  const select = (id: string, value: string, onChange: (value: string) => void) => (
    <select id={id} className="dialog-input" value={value} onChange={(event) => onChange(event.target.value)}>
      {names.map((font) => (
        <option key={font} value={font}>
          {font}
        </option>
      ))}
    </select>
  )
  return (
    <DialogFrame
      title="Create New Theme Fonts"
      width={480}
      onClose={onClose}
      onSubmit={() => name.trim() && onSave({ name: name.trim(), major, minor })}
    >
      <div className="theme-fonts-dialog">
        <div className="theme-fonts-fields">
          <label htmlFor="theme-heading-font">Heading font:</label>
          {select("theme-heading-font", major, setMajor)}
          <label htmlFor="theme-body-font">Body font:</label>
          {select("theme-body-font", minor, setMinor)}
        </div>
        <fieldset className="theme-fonts-sample">
          <legend>Sample</legend>
          <div className="theme-fonts-sample-box" data-keep-light aria-hidden>
            <span style={{ fontFamily: stackOf(major) }}>Heading</span>
            <span style={{ fontFamily: stackOf(minor) }}>Body text body text body text. Body text body text.</span>
          </div>
        </fieldset>
      </div>
      <div className="theme-dialog-name">
        <label htmlFor="theme-fonts-name">Name:</label>
        <input
          id="theme-fonts-name"
          className="dialog-input"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <DialogButtons ok="Save" submit okDisabled={!name.trim()} onCancel={onClose} />
    </DialogFrame>
  )
}

/** "Custom 1", "Custom 2"…: the first name no saved scheme has, as Word suggests. */
export function nextCustomName(taken: string[]) {
  let n = 1
  while (taken.includes(`Custom ${n}`)) {
    n += 1
  }
  return `Custom ${n}`
}
