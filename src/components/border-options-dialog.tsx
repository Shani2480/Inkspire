import { DialogButtons, DialogFrame, SpinField } from "@/components/word-dialog"
import type { BorderFrom, PageSetup } from "@/document/page-setup"

/** Page Border Options' check boxes. */
export type PageBorderFlags = Pick<
  PageSetup,
  "borderAlign" | "borderInFront" | "borderSurroundHeader" | "borderSurroundFooter"
>

const FLAG_FIELDS: { key: keyof PageBorderFlags; label: string; fromText: boolean }[] = [
  { key: "borderAlign", label: "Align paragraph borders and table edges with page border", fromText: true },
  { key: "borderInFront", label: "Always display in front", fromText: false },
  { key: "borderSurroundHeader", label: "Surround header", fromText: true },
  { key: "borderSurroundFooter", label: "Surround footer", fromText: true },
]
import { useState } from "react"

/** Word's order in the Options dialog, each with its place in a top, right, bottom, left list. */
const SPACE_FIELDS = [
  { index: 0, label: "Top" },
  { index: 2, label: "Bottom" },
  { index: 3, label: "Left" },
  { index: 1, label: "Right" },
]

/**
 * Borders and Shading > Options… (22.4): the distance from the text to each side of a paragraph's box, or, given
 * `from`, a page border's margins, whether they are measured from the text or the edge of the page, and its check
 * boxes (those about the text only apply when measured from it, as in Word).
 */
export function BorderOptionsDialog({
  space,
  from,
  flags,
  onDone,
  onClose,
}: {
  space: number[]
  from?: BorderFrom
  flags?: PageBorderFlags
  onDone: (space: number[], from: BorderFrom, flags?: PageBorderFlags) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(space.map(String))
  const [measure, setMeasure] = useState<BorderFrom>(from ?? "text")
  const [checks, setChecks] = useState(flags)
  return (
    <DialogFrame
      title="Border and Shading Options"
      width={320}
      level={90}
      onClose={onClose}
      onSubmit={() =>
        onDone(
          draft.map((value) => Math.min(31, Math.max(0, Number(value) || 0))),
          measure,
          checks,
        )
      }
    >
      <fieldset className="bs-options">
        <legend>{from ? "Margin" : "From text"}</legend>
        {SPACE_FIELDS.map((field) => (
          <label key={field.label} className="bs-option" htmlFor={`bs-space-${field.label}`}>
            {field.label}:
            <SpinField
              id={`bs-space-${field.label}`}
              value={draft[field.index]}
              unit="pt"
              step={1}
              max={31}
              onChange={(value) =>
                setDraft((current) => current.map((item, index) => (index === field.index ? value : item)))
              }
            />
          </label>
        ))}
        {from ? (
          <label className="bs-option bs-measure">
            Measure from:
            <select
              aria-label="Measure from"
              value={measure}
              onChange={(event) => setMeasure(event.target.value === "page" ? "page" : "text")}
            >
              <option value="text">Text</option>
              <option value="page">Edge of page</option>
            </select>
          </label>
        ) : null}
      </fieldset>
      {checks ? (
        <fieldset className="bs-options bs-checks">
          <legend>Options</legend>
          {FLAG_FIELDS.map((field) => (
            <label key={field.key} className="bs-check">
              <input
                type="checkbox"
                checked={checks[field.key]}
                disabled={field.fromText && measure !== "text"}
                onChange={(event) => setChecks({ ...checks, [field.key]: event.target.checked })}
              />
              {field.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
