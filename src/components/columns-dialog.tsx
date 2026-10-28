import { Check, DialogButtons, DialogFrame, SpinField } from "@/components/word-dialog"
import {
  COLUMN_PRESET_NAMES,
  columnPreset,
  columnsAreEqual,
  equalColumns,
  maxColumnCount,
  MIN_COLUMN_CM,
  presetColumns,
  resizeColumn,
  type ColumnPreset,
  type ColumnWidth,
} from "@/document/column-widths"
import { contentWidthCm, setupColumns } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import {
  applyColumnSection,
  applyColumnsFromHere,
  clampColumnGap,
  findColumnSection,
  removeColumnSection,
  setColumnSectionGap,
  setColumnSectionLine,
} from "@/editor/columns"
import type { Editor } from "@tiptap/core"
import { useState } from "react"
import { create } from "zustand"

/** Columns dialog's Apply to: Whole document, This point forward (to the end, as Word's new section), Selected text. */
type Scope = "document" | "forward" | "selection"

/** Opens Columns (22.7) from Layout → Columns → More Columns…. */
export const useColumnsDialog = create<{ open: { editor: Editor | null } | null }>(() => ({ open: null }))

export function openColumnsDialog(editor: Editor | null) {
  useColumnsDialog.setState({ open: { editor } })
}

export function ColumnsDialogHost() {
  const open = useColumnsDialog((state) => state.open)
  return open ? <ColumnsDialog editor={open.editor} onClose={() => useColumnsDialog.setState({ open: null })} /> : null
}

const PRESETS: ColumnPreset[] = ["one", "two", "three", "left", "right"]

function ColumnsDialog({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const section = editor ? findColumnSection(editor.state) : null
  const textCm = contentWidthCm(setup)
  const [scope, setScope] = useState<Scope>(section ? "selection" : "document")
  const [columns, setColumns] = useState<ColumnWidth[]>(() =>
    section ? equalColumns(textCm, section.columns, section.gap) : setupColumns(setup),
  )
  const [equal, setEqual] = useState(section ? true : setup.columns < 2 || !setup.columnWidths)
  const [line, setLine] = useState(section ? section.line : setup.columnLine)
  const [newColumn, setNewColumn] = useState(false)
  const count = columns.length
  const spacing = count > 1 ? columns[0].space : setup.columnGap
  // Selected text and This point forward become a block of equal columns: the browser draws only those there.
  const equalOnly = scope !== "document"
  const preset = columnPreset(count, equal ? undefined : columns, textCm, spacing)
  const most = maxColumnCount(textCm, Math.min(spacing, 1.27))

  const pickPreset = (choice: ColumnPreset) => {
    const picked = presetColumns(choice, textCm, clampColumnGap(spacing))
    setColumns(picked.widths ?? equalColumns(textCm, picked.count, clampColumnGap(spacing)))
    setEqual(!picked.widths)
  }

  const setCount = (value: number) => {
    const next = Math.max(1, Math.min(most, Math.round(value) || 1))
    setColumns(equalColumns(textCm, next, clampColumnGap(spacing)))
    setEqual(true)
  }

  const change = (index: number, field: "width" | "space", value: number) => {
    setColumns(resizeColumn(columns, index, field, value, textCm, equal))
  }

  const toggleEqual = (checked: boolean) => {
    setEqual(checked)
    if (checked && count > 1) {
      setColumns(equalColumns(textCm, count, columns[0].space))
    }
  }

  const changeScope = (next: Scope) => {
    setScope(next)
    if (next !== "document" && !equal) {
      setColumns(equalColumns(textCm, count, columns[0].space))
      setEqual(true)
    }
  }

  const apply = () => {
    const gap = clampColumnGap(spacing)
    if (scope === "document") {
      const unequal = count > 1 && !equal && !columnsAreEqual(columns)
      setPageSetup({
        ...setup,
        columns: count,
        columnGap: gap,
        columnLine: count > 1 && line,
        columnWidths: unequal ? columns : undefined,
      })
    } else if (editor) {
      const placed =
        count === 1
          ? (removeColumnSection(editor), null)
          : scope === "forward" && !section
            ? applyColumnsFromHere(editor, count, newColumn) && findColumnSection(editor.state)
            : applyColumnSection(editor, count) && findColumnSection(editor.state)
      if (placed) {
        setColumnSectionGap(editor, placed.pos, gap)
        setColumnSectionLine(editor, placed.pos, line)
      }
    }
    onClose()
  }

  return (
    <DialogFrame title="Columns" width={440} onClose={onClose} onSubmit={apply}>
      <div className="columns-dialog">
        <fieldset className="columns-presets-row">
          <legend>Presets</legend>
          <div className="tp-tiles">
            {PRESETS.map((choice) => (
              <button
                key={choice}
                type="button"
                className="tp-tile"
                aria-label={COLUMN_PRESET_NAMES[choice]}
                aria-pressed={preset === choice}
                disabled={equalOnly && (choice === "left" || choice === "right")}
                onClick={() => pickPreset(choice)}
              >
                <PresetGlyph preset={choice} />
                <span>{COLUMN_PRESET_NAMES[choice]}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="columns-count-row">
          <label htmlFor="columns-count">Number of columns:</label>
          <SpinField
            id="columns-count"
            value={String(count)}
            unit=""
            step={1}
            min={1}
            max={most}
            onChange={(value) => setCount(Number(value))}
          />
          <Check
            id="columns-line"
            text="Line between"
            letter="B"
            checked={line && count > 1}
            disabled={count < 2}
            onChange={setLine}
          />
        </div>
        <div className="columns-body">
          <fieldset className="columns-widths">
            <legend>Width and spacing</legend>
            <div className="columns-widths-grid" role="table" aria-label="Width and spacing">
              <span role="columnheader">Col #:</span>
              <span role="columnheader">Width:</span>
              <span role="columnheader">Spacing:</span>
              {columns.map((column, index) => {
                const locked = equal && index > 0
                const last = index === count - 1
                return (
                  <div key={`${count}-${index}`} role="row" className="columns-widths-row">
                    <span role="cell">{index + 1}:</span>
                    <label htmlFor={`columns-width-${index}`} className="sr-only">
                      {`Column ${index + 1} width`}
                    </label>
                    <SpinField
                      id={`columns-width-${index}`}
                      value={String(column.width)}
                      unit="cm"
                      step={0.1}
                      min={MIN_COLUMN_CM}
                      max={textCm}
                      disabled={count < 2 || locked}
                      onChange={(value) => change(index, "width", Number(value))}
                    />
                    <label htmlFor={`columns-space-${index}`} className="sr-only">
                      {index === 0 ? "Spacing" : `Column ${index + 1} spacing`}
                    </label>
                    <SpinField
                      id={`columns-space-${index}`}
                      value={last ? "" : String(column.space)}
                      unit="cm"
                      step={0.1}
                      min={0}
                      max={textCm}
                      disabled={count < 2 || locked || last}
                      onChange={(value) => change(index, "space", Number(value))}
                    />
                  </div>
                )
              })}
            </div>
            <Check
              id="columns-equal"
              text="Equal column width"
              letter="E"
              checked={equal || count < 2}
              disabled={count < 2 || equalOnly}
              onChange={toggleEqual}
            />
          </fieldset>
          <div className="columns-preview-row">
            <span>Preview</span>
            <ColumnsPreview columns={columns} line={line && count > 1} />
          </div>
        </div>
        <div className="columns-apply-row">
          <label htmlFor="columns-apply">Apply to:</label>
          <select
            id="columns-apply"
            aria-label="Apply to"
            value={scope}
            onChange={(event) => changeScope(event.target.value as Scope)}
          >
            <option value="document">Whole document</option>
            <option value="forward" disabled={!editor}>
              This point forward
            </option>
            <option value="selection" disabled={!editor}>
              Selected text
            </option>
          </select>
          <Check
            id="columns-new"
            text="Start new column"
            letter="U"
            checked={newColumn && scope === "forward"}
            disabled={scope !== "forward" || Boolean(section)}
            onChange={setNewColumn}
          />
        </div>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/** A preset's page: Word's column glyph, with Left and Right a third and two thirds wide. */
function PresetGlyph({ preset }: { preset: ColumnPreset }) {
  const shares = preset === "left" ? [1, 2] : preset === "right" ? [2, 1] : preset === "three" ? [1, 1, 1] : null
  const parts = shares ?? (preset === "two" ? [1, 1] : [1])
  const total = parts.reduce((sum, share) => sum + share, 0)
  const room = 32 - (parts.length - 1) * 3
  let x = 6
  return (
    <svg viewBox="0 0 44 36" aria-hidden>
      {parts.map((share, index) => {
        const width = (room * share) / total
        const left = x
        x += width + 3
        return Array.from({ length: 6 }, (_, row) => (
          <line
            key={`${index}-${row}`}
            className="tp-tile-line"
            x1={left}
            x2={left + width}
            y1={7 + row * 4.4}
            y2={7 + row * 4.4}
          />
        ))
      })}
    </svg>
  )
}

function ColumnsPreview({ columns, line }: { columns: ColumnWidth[]; line: boolean }) {
  const total = columns.reduce(
    (sum, column, index) => sum + column.width + (index < columns.length - 1 ? column.space : 0),
    0,
  )
  const scale = 124 / Math.max(total, 0.01)
  const parts = []
  for (let index = 0; index < columns.length; index += 1) {
    if (index > 0) {
      const gap = Math.max(2, columns[index - 1].space * scale)
      parts.push(
        <i
          key={`gap-${index}`}
          className={line ? "rule" : undefined}
          style={{ ["--preview-gap" as string]: `${gap}px` }}
        />,
      )
    }
    parts.push(<span key={index} style={{ flexGrow: columns[index].width }} />)
  }
  return (
    <div className="columns-preview" data-testid="columns-preview" style={{ width: 140 }}>
      {parts}
    </div>
  )
}
