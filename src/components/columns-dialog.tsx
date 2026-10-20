import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import type { ColumnCount } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import {
  applyColumnSection,
  clampColumnGap,
  findColumnSection,
  removeColumnSection,
  setColumnSectionGap,
  setColumnSectionLine,
} from "@/editor/columns"
import type { Editor } from "@tiptap/core"
import { useState } from "react"
import { create } from "zustand"

type Scope = "document" | "selection"

/** Opens Columns (22.7) from Layout → Columns → More Columns…. */
export const useColumnsDialog = create<{ open: { editor: Editor | null } | null }>(() => ({ open: null }))

export function openColumnsDialog(editor: Editor | null) {
  useColumnsDialog.setState({ open: { editor } })
}

export function ColumnsDialogHost() {
  const open = useColumnsDialog((state) => state.open)
  return open ? <ColumnsDialog editor={open.editor} onClose={() => useColumnsDialog.setState({ open: null })} /> : null
}

function ColumnsDialog({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const section = editor ? findColumnSection(editor.state) : null
  const [scope, setScope] = useState<Scope>(section ? "selection" : "document")
  const [count, setCount] = useState<number>(section?.columns ?? setup.columns)
  const [gapText, setGapText] = useState(String(section?.gap ?? setup.columnGap))
  const [line, setLine] = useState(section ? section.line : setup.columnLine)
  const gap = clampColumnGap(Number(gapText))

  const apply = () => {
    if (scope === "document") {
      const columns = (count === 2 || count === 3 ? count : 1) as ColumnCount
      setPageSetup({ ...setup, columns, columnGap: gap, columnLine: columns > 1 && line })
    } else if (editor) {
      if (count === 1) {
        removeColumnSection(editor)
      } else if (applyColumnSection(editor, count as 2 | 3)) {
        const placed = findColumnSection(editor.state)
        if (placed) {
          setColumnSectionGap(editor, placed.pos, gap)
          setColumnSectionLine(editor, placed.pos, line)
        }
      }
    }
    onClose()
  }

  return (
    <DialogFrame title="Columns" width={400} onClose={onClose} onSubmit={apply}>
      <div className="tp-panel">
        <fieldset className="tp-field columns-presets">
          <legend>Presets</legend>
          {[1, 2, 3].map((value) => (
            <label key={value} className="tp-check">
              <input type="radio" name="columns-preset" checked={count === value} onChange={() => setCount(value)} />
              {value === 1 ? "One" : value === 2 ? "Two" : "Three"}
            </label>
          ))}
        </fieldset>
        <label className="tp-field">
          Number of columns
          <input
            aria-label="Number of columns"
            type="number"
            min={1}
            max={3}
            value={count}
            onChange={(event) => setCount(Math.min(3, Math.max(1, Math.round(Number(event.target.value)) || 1)))}
          />
        </label>
        <label className="tp-field">
          Spacing (cm)
          <input
            aria-label="Spacing"
            type="number"
            step={0.1}
            disabled={count < 2}
            value={gapText}
            onChange={(event) => setGapText(event.target.value)}
          />
        </label>
        <label className="tp-check">
          <input
            type="checkbox"
            checked={line}
            disabled={count < 2}
            onChange={(event) => setLine(event.target.checked)}
          />
          Line between
        </label>
        <label className="tp-field">
          Apply to
          <select aria-label="Apply to" value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
            <option value="document">Whole document</option>
            <option value="selection" disabled={!editor}>
              Selected text
            </option>
          </select>
        </label>
      </div>
      <div className="tp-field columns-preview-row">
        Preview
        <ColumnsPreview count={count} gapCm={gap} line={line && count > 1} />
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

function ColumnsPreview({ count, gapCm, line }: { count: number; gapCm: number; line: boolean }) {
  const parts = []
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      parts.push(<i key={`gap-${index}`} className={line ? "rule" : undefined} />)
    }
    parts.push(<span key={index} />)
  }
  return (
    <div
      className="columns-preview"
      data-testid="columns-preview"
      style={{ width: 140, ["--preview-gap" as string]: `${Math.min(24, Math.max(4, gapCm * 8))}px` }}
    >
      {parts}
    </div>
  )
}
