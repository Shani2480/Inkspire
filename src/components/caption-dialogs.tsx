import { askText } from "@/components/text-prompt"
import { Check, DialogButtons, DialogFrame, Label } from "@/components/word-dialog"
import {
  BUILT_IN_LABELS,
  NUMBER_FORMATS,
  addCaptionLabel,
  bookmarksOf,
  captionLabels,
  captionTarget,
  captionsOf,
  headingsOf,
  insertCaption,
  insertCrossReference,
  nextCaptionNumber,
  referenceChoices,
  referenceLabels,
  removeCaptionLabel,
  type NumberFormat,
  type ReferenceItem,
  type ReferenceTo,
  type ReferenceType,
} from "@/editor/captions"
import { formatSequence } from "@/document/field-instructions"
import { restoreSelection } from "@/editor/selection-memory"
import type { Editor } from "@tiptap/core"
import { useMemo, useState } from "react"
import { create } from "zustand"

/** References → Insert Caption… and Cross-reference…, as Word draws them. */

type Open = { kind: "caption" | "crossReference"; editor: Editor } | null

export const useCaptionDialogs = create<{ open: Open }>(() => ({ open: null }))

export function openCaptionDialog(editor: Editor | null) {
  if (editor) {
    restoreSelection(editor)
    useCaptionDialogs.setState({ open: { kind: "caption", editor } })
  }
}

export function openCrossReferenceDialog(editor: Editor | null) {
  if (editor) {
    restoreSelection(editor)
    useCaptionDialogs.setState({ open: { kind: "crossReference", editor } })
  }
}

export function CaptionDialogsHost() {
  const open = useCaptionDialogs((state) => state.open)
  const close = () => useCaptionDialogs.setState({ open: null })
  if (!open) {
    return null
  }
  return open.kind === "caption" ? (
    <InsertCaptionDialog editor={open.editor} onClose={close} />
  ) : (
    <CrossReferenceDialog editor={open.editor} onClose={close} />
  )
}

// Word keeps the last label, position and numbering for the session.
const lastCaption: { label: string; format: NumberFormat; position: Record<string, "above" | "below"> } = {
  label: "Figure",
  format: "ARABIC",
  position: {},
}

function InsertCaptionDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const target = useMemo(() => captionTarget(editor), [editor])
  const [labels, setLabels] = useState(captionLabels)
  const [label, setLabel] = useState(
    target?.kind === "table" && lastCaption.label === "Figure" ? "Table" : lastCaption.label,
  )
  const [text, setText] = useState("")
  const [position, setPosition] = useState<"above" | "below">(
    lastCaption.position[label] ?? (label === "Table" ? "above" : "below"),
  )
  const [exclude, setExclude] = useState(false)
  const [format, setFormat] = useState<NumberFormat>(lastCaption.format)
  const [numbering, setNumbering] = useState(false)

  const at = target ? (position === "above" ? target.from : target.to) : editor.state.selection.to
  const number = formatSequence(nextCaptionNumber(editor.state.doc, label, at), format)
  const prefix = exclude ? number : `${label} ${number}`

  const changeLabel = (next: string) => {
    setLabel(next)
    setPosition(lastCaption.position[next] ?? (next === "Table" ? "above" : "below"))
  }

  const apply = () => {
    lastCaption.label = label
    lastCaption.format = format
    lastCaption.position[label] = position
    onClose()
    insertCaption(editor, { label, text, position, excludeLabel: exclude, format })
  }

  return (
    <DialogFrame title="Caption" width={400} onClose={onClose} onSubmit={apply}>
      <div className="caption-dialog">
        <Label htmlFor="caption-text" text="Caption:" letter="C" />
        <div className="caption-dialog-text">
          <span aria-hidden>{prefix}</span>
          <input
            id="caption-text"
            aria-label={`Caption text after ${prefix}`}
            value={text}
            autoFocus
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <fieldset className="caption-dialog-options">
          <legend>Options</legend>
          <Label htmlFor="caption-label" text="Label:" letter="L" />
          <select id="caption-label" value={label} onChange={(event) => changeLabel(event.target.value)}>
            {labels.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Label htmlFor="caption-position" text="Position:" letter="P" />
          <select
            id="caption-position"
            value={position}
            disabled={!target}
            onChange={(event) => setPosition(event.target.value as "above" | "below")}
          >
            <option value="above">Above selected item</option>
            <option value="below">Below selected item</option>
          </select>
        </fieldset>
        <Check
          id="caption-exclude"
          text="Exclude label from caption"
          letter="E"
          checked={exclude}
          onChange={setExclude}
        />
        <div className="caption-dialog-buttons">
          <button
            type="button"
            className="dialog-btn"
            onClick={() => {
              void askText({ title: "New Label", label: "Label:", value: "" }).then((value) => {
                const added = value ? addCaptionLabel(value) : null
                if (added) {
                  setLabels(captionLabels())
                  changeLabel(added)
                }
              })
            }}
          >
            New Label…
          </button>
          <button
            type="button"
            className="dialog-btn"
            disabled={BUILT_IN_LABELS.includes(label)}
            onClick={() => {
              removeCaptionLabel(label)
              setLabels(captionLabels())
              changeLabel("Figure")
            }}
          >
            Delete Label
          </button>
          <button type="button" className="dialog-btn" onClick={() => setNumbering(true)}>
            Numbering…
          </button>
        </div>
      </div>
      <DialogButtons submit onCancel={onClose} />
      {numbering ? (
        <NumberingDialog
          format={format}
          onClose={() => setNumbering(false)}
          onApply={(next) => {
            setFormat(next)
            setNumbering(false)
          }}
        />
      ) : null}
    </DialogFrame>
  )
}

function NumberingDialog({
  format,
  onClose,
  onApply,
}: {
  format: NumberFormat
  onClose: () => void
  onApply: (format: NumberFormat) => void
}) {
  const [value, setValue] = useState(format)
  return (
    <DialogFrame title="Caption Numbering" width={300} level={110} onClose={onClose} onSubmit={() => onApply(value)}>
      <div className="caption-numbering">
        <Label htmlFor="caption-format" text="Format:" letter="o" />
        <select id="caption-format" value={value} onChange={(event) => setValue(event.target.value as NumberFormat)}>
          {NUMBER_FORMATS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sample}
            </option>
          ))}
        </select>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

// --- Cross-reference ---------------------------------------------------------------------------------------------

const lastReference: { type: ReferenceType; to: Record<string, ReferenceTo>; hyperlink: boolean } = {
  type: "Heading",
  to: {},
  hyperlink: true,
}

function itemsFor(editor: Editor, type: ReferenceType): ReferenceItem[] {
  if (type === "Heading") {
    return headingsOf(editor.state.doc)
  }
  if (type === "Bookmark") {
    return bookmarksOf(editor.state.doc)
  }
  return captionsOf(editor.state.doc, type)
}

function listTitle(type: ReferenceType) {
  if (type === "Heading") {
    return "For which heading:"
  }
  if (type === "Bookmark") {
    return "For which bookmark:"
  }
  return "For which caption:"
}

function CrossReferenceDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const types = useMemo(() => ["Heading", "Bookmark", ...referenceLabels(editor.state.doc)], [editor])
  const [type, setType] = useState<ReferenceType>(types.includes(lastReference.type) ? lastReference.type : "Heading")
  const choices = referenceChoices(type)
  const [to, setTo] = useState<ReferenceTo>(lastReference.to[type] ?? choices[0]!.id)
  const [hyperlink, setHyperlink] = useState(lastReference.hyperlink)
  const [aboveBelow, setAboveBelow] = useState(false)
  const [version, setVersion] = useState(0)
  const items = useMemo(() => itemsFor(editor, type), [editor, type, version])
  const [selected, setSelected] = useState<string | null>(null)
  const chosen = items.find((item) => item.id === selected) ?? items[0] ?? null
  const [inserted, setInserted] = useState(false)

  const changeType = (next: ReferenceType) => {
    setType(next)
    setTo(lastReference.to[next] ?? referenceChoices(next)[0]!.id)
    setSelected(null)
  }

  const insert = () => {
    if (!chosen) {
      return
    }
    lastReference.type = type
    lastReference.to[type] = to
    lastReference.hyperlink = hyperlink
    insertCrossReference(editor, { type, to, item: chosen.id, hyperlink, includeAboveBelow: aboveBelow })
    setInserted(true)
    // The positions moved: list the items again, keeping the choice.
    setVersion((value) => value + 1)
    if (type !== "Bookmark") {
      setSelected(null)
    }
  }

  return (
    <DialogFrame title="Cross-reference" width={460} onClose={onClose} onSubmit={insert}>
      <div className="xref-dialog">
        <div className="xref-dialog-pair">
          <div className="xref-dialog-field">
            <Label htmlFor="xref-type" text="Reference type:" letter="t" />
            <select id="xref-type" value={type} onChange={(event) => changeType(event.target.value)}>
              {types.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="xref-dialog-field">
            <Label htmlFor="xref-to" text="Insert reference to:" letter="r" />
            <select id="xref-to" value={to} onChange={(event) => setTo(event.target.value as ReferenceTo)}>
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="xref-dialog-pair">
          <Check id="xref-link" text="Insert as hyperlink" letter="h" checked={hyperlink} onChange={setHyperlink} />
          <Check
            id="xref-above"
            text="Include above/below"
            letter="n"
            checked={aboveBelow && to !== "aboveBelow"}
            disabled={to === "aboveBelow"}
            onChange={setAboveBelow}
          />
        </div>
        <span className="xref-dialog-list-title">{listTitle(type)}</span>
        <div className="xref-dialog-list" role="listbox" aria-label={listTitle(type)} tabIndex={0}>
          {items.length === 0 ? (
            <p className="xref-dialog-empty">
              {type === "Heading"
                ? "There are no headings in this document."
                : type === "Bookmark"
                  ? "There are no bookmarks in this document."
                  : `There are no ${type.toLowerCase()} captions in this document.`}
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                role="option"
                aria-selected={item.id === chosen?.id}
                className={`xref-dialog-item${item.id === chosen?.id ? " is-selected" : ""}`}
                onClick={() => setSelected(item.id)}
                onDoubleClick={() => {
                  setSelected(item.id)
                  insert()
                }}
              >
                {item.text}
              </div>
            ))
          )}
        </div>
      </div>
      <DialogButtons
        submit
        ok="Insert"
        okDisabled={!chosen}
        cancel={inserted ? "Close" : "Cancel"}
        onCancel={onClose}
      />
    </DialogFrame>
  )
}
