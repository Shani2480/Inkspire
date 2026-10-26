import { DialogButtons, DialogFrame, SpinField } from "@/components/word-dialog"
import type { BorderFrom } from "@/document/page-setup"
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
 * `from`, a page border's margins and whether they are measured from the text or the edge of the page.
 */
export function BorderOptionsDialog({
  space,
  from,
  onDone,
  onClose,
}: {
  space: number[]
  from?: BorderFrom
  onDone: (space: number[], from: BorderFrom) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(space.map(String))
  const [measure, setMeasure] = useState<BorderFrom>(from ?? "text")
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
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
