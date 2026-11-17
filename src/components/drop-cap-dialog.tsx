import { DialogButtons, DialogFrame, Keyed, Label, Section, SpinField } from "@/components/word-dialog"
import { dropCapLines, updateBlocks } from "@/editor/block-format"
import { useFontChoices } from "@/editor/system-fonts"
import type { Editor } from "@tiptap/core"
import { useMemo, useState } from "react"
import { create } from "zustand"

/** Insert > Drop Cap > Drop Cap Options…, Word's dialog: Position, then Font, Lines to drop and Distance from text. */
export type DropCapKind = "dropped" | "margin" | null

export const useDropCapDialog = create<{ editor: Editor | null }>(() => ({ editor: null }))

export function openDropCapDialog(editor: Editor | null) {
  if (editor) {
    useDropCapDialog.setState({ editor })
  }
}

/** The drop cap of the paragraph the cursor is in. */
export function currentDropCap(editor: Editor) {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.isTextblock) {
      const kind = node.attrs.dropCap === "dropped" || node.attrs.dropCap === "margin" ? node.attrs.dropCap : null
      return {
        kind: kind as DropCapKind,
        lines: dropCapLines(node.attrs.dropCapLines),
        distance: Math.max(0, Number(node.attrs.dropCapDistance) || 0),
        font: typeof node.attrs.dropCapFont === "string" ? node.attrs.dropCapFont : "",
      }
    }
  }
  return { kind: null as DropCapKind, lines: 3, distance: 0, font: "" }
}

/** Sets the paragraph's drop cap: None clears every option, as Word's does. */
export function applyDropCap(
  editor: Editor,
  cap: { kind: DropCapKind; lines?: number; distance?: number; font?: string },
) {
  updateBlocks(
    editor,
    cap.kind
      ? {
          dropCap: cap.kind,
          dropCapLines: cap.lines && cap.lines !== 3 ? dropCapLines(cap.lines) : null,
          dropCapDistance: cap.distance && cap.distance > 0 ? Math.round(cap.distance * 10) / 10 : null,
          dropCapFont: cap.font || null,
        }
      : { dropCap: null, dropCapLines: null, dropCapDistance: null, dropCapFont: null },
  )
}

const POINTS_PER_CM = 72 / 2.54

/** A font choice is a CSS stack ("Georgia, serif"); Word keeps the family's name. */
function familyOf(stack: string) {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "")
}

/** The Position pictures, as Word's: the letter beside lines of text, dropped into them or hanging in the margin. */
export function DropCapPicture({ kind }: { kind: DropCapKind }) {
  const lines = [10, 16, 22, 28, 34]
  // The text block: from 8 (no drop cap, dropped) or 20 (in margin, the letter left of it), to 44.
  const left = kind === "margin" ? 20 : 8
  return (
    <svg width="48" height="40" viewBox="0 0 48 40" aria-hidden className="drop-cap-picture">
      {lines.map((y, index) => (
        <line
          key={y}
          x1={kind === "dropped" && index < 3 ? 27 : left}
          x2="44"
          y1={y}
          y2={y}
          stroke="var(--icon-muted-color, #a0a0a0)"
          strokeWidth="1.5"
        />
      ))}
      {kind ? (
        <text
          x={kind === "margin" ? 0 : 7}
          y="26"
          fontSize="20"
          fontFamily="Georgia, serif"
          fill="var(--icon-base-color, currentColor)"
        >
          W
        </text>
      ) : null}
    </svg>
  )
}

const POSITIONS: { kind: DropCapKind; label: string; letter: string }[] = [
  { kind: null, label: "None", letter: "N" },
  { kind: "dropped", label: "Dropped", letter: "D" },
  { kind: "margin", label: "In margin", letter: "M" },
]

export function DropCapDialogHost() {
  const editor = useDropCapDialog((state) => state.editor)
  return editor ? <DropCapDialog editor={editor} onClose={() => useDropCapDialog.setState({ editor: null })} /> : null
}

function DropCapDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const initial = useMemo(() => currentDropCap(editor), [editor])
  const fonts = useFontChoices()
  const [kind, setKind] = useState<DropCapKind>(initial.kind)
  const [font, setFont] = useState(initial.font)
  const [lines, setLines] = useState(String(initial.lines))
  const [distance, setDistance] = useState(String(Math.round((initial.distance / POINTS_PER_CM) * 100) / 100))
  const off = kind === null
  const families = fonts.map((choice) => ({ value: familyOf(choice.value), label: choice.label }))
  const shown =
    font && !families.some((choice) => choice.value === font) ? [{ value: font, label: font }, ...families] : families

  const apply = () => {
    onClose()
    applyDropCap(editor, {
      kind,
      lines: Number(lines),
      distance: (Number(distance) || 0) * POINTS_PER_CM,
      font,
    })
  }

  return (
    <DialogFrame title="Drop Cap" width={300} onClose={onClose} onSubmit={apply}>
      <div className="drop-cap-dialog">
        <Section title="Position">
          <div className="drop-cap-positions" role="radiogroup" aria-label="Position">
            {POSITIONS.map((position) => (
              <label key={position.label} className="drop-cap-position">
                <input
                  type="radio"
                  name="drop-cap-position"
                  checked={kind === position.kind}
                  onChange={() => setKind(position.kind)}
                />
                <span className="drop-cap-position-picture">
                  <DropCapPicture kind={position.kind} />
                </span>
                <span>
                  <Keyed text={position.label} letter={position.letter} />
                </span>
              </label>
            ))}
          </div>
        </Section>
        <Section title="Options">
          <div className="drop-cap-options">
            <Label htmlFor="drop-cap-font" text="Font:" letter="F" />
            <select id="drop-cap-font" disabled={off} value={font} onChange={(event) => setFont(event.target.value)}>
              <option value="">(Same as text)</option>
              {shown.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
            <Label htmlFor="drop-cap-lines" text="Lines to drop:" letter="L" />
            <SpinField
              id="drop-cap-lines"
              value={lines}
              unit=""
              step={1}
              min={1}
              max={10}
              disabled={off}
              keepValue
              onChange={setLines}
            />
            <Label htmlFor="drop-cap-distance" text="Distance from text:" letter="x" />
            <SpinField
              id="drop-cap-distance"
              value={distance}
              unit="cm"
              step={0.1}
              min={0}
              max={5}
              disabled={off}
              keepValue
              onChange={setDistance}
            />
          </div>
        </Section>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
