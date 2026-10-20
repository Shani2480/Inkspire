import { openBordersAndShading } from "@/components/borders-shading-dialog"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import {
  applyTableProperties,
  tableLayoutState,
  type CellPad,
  type TableAlign,
  type TableProperties,
} from "@/editor/table-layout"
import type { Editor } from "@tiptap/core"
import { useState } from "react"
import { create } from "zustand"

type Tab = "table" | "row" | "column" | "cell" | "alt"

/** Opens Table Properties (22.10) for the table the editor's selection is in. */
export const useTableProperties = create<{ open: { editor: Editor; tab: Tab } | null }>(() => ({ open: null }))

export function openTableProperties(editor: Editor, tab: Tab = "table") {
  if (tableLayoutState(editor)) {
    useTableProperties.setState({ open: { editor, tab } })
  }
}

export function TablePropertiesHost() {
  const open = useTableProperties((state) => state.open)
  return open ? (
    <TablePropertiesDialog
      key={`${open.tab}`}
      editor={open.editor}
      initialTab={open.tab}
      onClose={() => useTableProperties.setState({ open: null })}
    />
  ) : null
}

const PADS: { id: CellPad; label: string }[] = [
  { id: "narrow", label: "Narrow" },
  { id: "normal", label: "Normal" },
  { id: "wide", label: "Wide" },
]
const ALIGNS: { id: TableAlign; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
]
const VERTICAL = [
  { id: "top", label: "Top" },
  { id: "middle", label: "Center" },
  { id: "bottom", label: "Bottom" },
] as const

function TablePropertiesDialog({
  editor,
  initialTab,
  onClose,
}: {
  editor: Editor
  initialTab: Tab
  onClose: () => void
}) {
  const state = tableLayoutState(editor)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [draft, setDraft] = useState<TableProperties>({
    cellPad: state?.cellPad ?? "normal",
    gridlines: state?.gridlines ?? true,
    headerRow: state?.headerRow ?? false,
    rowHeightCm: state?.rowHeightSet ? state.heightCm : null,
    columnWidthCm: state?.widthCm ?? 0,
    valign: state?.valign ?? "top",
    align: state?.align ?? "left",
    altTitle: state?.altTitle ?? "",
    altDesc: state?.altDesc ?? "",
  })
  const [heightText, setHeightText] = useState(state?.heightCm ? state.heightCm.toFixed(2) : "")
  const [widthText, setWidthText] = useState(state?.widthCm ? state.widthCm.toFixed(2) : "")
  const patch = (next: Partial<TableProperties>) => setDraft((current) => ({ ...current, ...next }))
  const number = (text: string) => {
    const value = Number(text)
    return value > 0 ? value : null
  }

  return (
    <DialogFrame
      title="Table Properties"
      width={440}
      onClose={onClose}
      onSubmit={() => {
        applyTableProperties(editor, draft)
        onClose()
      }}
      tabs={[
        { id: "table", label: "Table" },
        { id: "row", label: "Row" },
        { id: "column", label: "Column" },
        { id: "cell", label: "Cell" },
        { id: "alt", label: "Alt Text" },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as Tab)}
      bodyHeight={230}
    >
      {tab === "table" ? (
        <div className="tp-panel">
          <div role="group" aria-label="Table alignment">
            <p className="tp-heading">Alignment</p>
            <div className="tp-choices">
              {ALIGNS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="dialog-btn"
                  aria-pressed={draft.align === item.id}
                  onClick={() => patch({ align: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <label className="tp-field">
            Cell margins
            <select
              aria-label="Cell margins"
              value={draft.cellPad}
              onChange={(event) => patch({ cellPad: event.target.value as CellPad })}
            >
              {PADS.map((pad) => (
                <option key={pad.id} value={pad.id}>
                  {pad.label}
                </option>
              ))}
            </select>
          </label>
          <label className="tp-check">
            <input
              type="checkbox"
              checked={draft.gridlines}
              onChange={(event) => patch({ gridlines: event.target.checked })}
            />
            View gridlines
          </label>
          <label className="tp-check">
            <input
              type="checkbox"
              checked={draft.headerRow}
              onChange={(event) => patch({ headerRow: event.target.checked })}
            />
            Repeat as header row at the top of each page
          </label>
          <button
            type="button"
            className="dialog-btn"
            onClick={() => {
              onClose()
              openBordersAndShading(editor)
            }}
          >
            Borders and Shading…
          </button>
        </div>
      ) : null}
      {tab === "row" ? (
        <div className="tp-panel">
          <label className="tp-check">
            <input
              type="checkbox"
              checked={draft.rowHeightCm !== null}
              onChange={(event) => {
                const on = event.target.checked
                patch({ rowHeightCm: on ? (number(heightText) ?? state?.heightCm ?? 0.6) : null })
                if (on && !number(heightText)) {
                  setHeightText((state?.heightCm ?? 0.6).toFixed(2))
                }
              }}
            />
            Specify height
          </label>
          <label className="tp-field">
            Height (cm)
            <input
              aria-label="Row height in centimetres"
              inputMode="decimal"
              disabled={draft.rowHeightCm === null}
              value={heightText}
              onChange={(event) => {
                setHeightText(event.target.value)
                const value = number(event.target.value)
                if (value !== null) patch({ rowHeightCm: value })
              }}
            />
          </label>
          <p className="tp-note">A row cannot yet be kept from breaking across pages.</p>
        </div>
      ) : null}
      {tab === "column" ? (
        <div className="tp-panel">
          <label className="tp-field">
            Width (cm)
            <input
              aria-label="Column width in centimetres"
              inputMode="decimal"
              value={widthText}
              onChange={(event) => {
                setWidthText(event.target.value)
                const value = number(event.target.value)
                if (value !== null) patch({ columnWidthCm: value })
              }}
            />
          </label>
        </div>
      ) : null}
      {tab === "cell" ? (
        <div className="tp-panel" role="group" aria-label="Vertical alignment">
          <p className="tp-heading">Vertical alignment</p>
          <div className="tp-choices">
            {VERTICAL.map((item) => (
              <button
                key={item.id}
                type="button"
                className="dialog-btn"
                aria-pressed={draft.valign === item.id}
                onClick={() => patch({ valign: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {tab === "alt" ? (
        <div className="tp-panel">
          <label className="tp-field">
            Title
            <input
              aria-label="Alt text title"
              value={draft.altTitle}
              onChange={(event) => patch({ altTitle: event.target.value })}
            />
          </label>
          <label className="tp-field">
            Description
            <textarea
              aria-label="Alt text description"
              rows={4}
              value={draft.altDesc}
              onChange={(event) => patch({ altDesc: event.target.value })}
            />
          </label>
          <p className="tp-note">Read out to people who cannot see the table.</p>
        </div>
      ) : null}
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
