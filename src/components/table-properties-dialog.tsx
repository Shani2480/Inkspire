import { openBordersAndShading } from "@/components/borders-shading-dialog"
import { Check, DialogButtons, DialogFrame, Keyed, Label, Section, SpinField } from "@/components/word-dialog"
import { applyTableDialog, tableDialogState, type TableDialogState, type TableDraft } from "@/editor/table-dialog"
import { PX_PER_CM, WORD_MARGINS, type Margins, type PreferredWidth } from "@/editor/table-props"
import type { Editor } from "@tiptap/core"
import { useState, type ReactNode } from "react"
import { create } from "zustand"

type Tab = "table" | "row" | "column" | "cell" | "alt"

/** Opens Table Properties (22.10) for the table the editor's selection is in. */
export const useTableProperties = create<{ open: { editor: Editor; tab: Tab } | null }>(() => ({ open: null }))

export function openTableProperties(editor: Editor, tab: Tab = "table") {
  if (tableDialogState(editor)) {
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

const round = (value: number) => Math.round(value * 100) / 100

/** Word's icon tiles (Alignment, Text wrapping, Vertical alignment): a picture over its name. */
function Tile({
  label,
  letter,
  pressed,
  disabled = false,
  title,
  onClick,
  children,
}: {
  label: string
  letter: string
  pressed: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="tp-tile"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <svg viewBox="0 0 40 32" aria-hidden>
        {children}
      </svg>
      <span>
        <Keyed text={label} letter={letter} />
      </span>
    </button>
  )
}

/** The little table on the Alignment tiles, set left, centred or right between the margins. */
function TableIcon({ x }: { x: number }) {
  return (
    <>
      <path d="M3 3v26M37 3v26" className="tp-tile-margin" />
      {[7, 11, 15, 19, 23].map((y) => (
        <path key={y} d={`M${x} ${y}h18`} className="tp-tile-line" />
      ))}
      <rect x={x} y={5} width={18} height={20} className="tp-tile-table" />
      <path d={`M${x + 9} 5v20M${x} 15h18`} className="tp-tile-grid" />
    </>
  )
}

function TextLines({ top }: { top: number }) {
  return (
    <>
      {[0, 4, 8].map((dy) => (
        <path key={dy} d={`M12 ${top + dy}h16`} className="tp-tile-line" />
      ))}
    </>
  )
}

/** Preferred width with Measure in, as on the Table, Column and Cell tabs. */
function PreferredWidthFields({
  id,
  width,
  fallback,
  onChange,
}: {
  id: string
  width: PreferredWidth | null
  /** The width the box shows once ticked, in centimetres. */
  fallback: number
  onChange: (width: PreferredWidth | null) => void
}) {
  const unit = width?.unit ?? "cm"
  return (
    <div className="tp-size-row">
      <Check
        id={`${id}-on`}
        text="Preferred width:"
        letter="w"
        checked={width !== null}
        onChange={(on) => onChange(on ? { value: round(fallback), unit: "cm" } : null)}
      />
      <SpinField
        id={`${id}-value`}
        value={width ? String(width.value) : ""}
        unit={unit === "pct" ? "%" : "cm"}
        step={unit === "pct" ? 1 : 0.1}
        min={0}
        max={unit === "pct" ? 600 : 55.88}
        disabled={width === null}
        onChange={(value) => onChange({ value: Number(value), unit })}
      />
      <Label htmlFor={`${id}-unit`} text="Measure in:" letter="M" />
      <select
        id={`${id}-unit`}
        value={unit}
        disabled={width === null}
        onChange={(event) => {
          if (!width) {
            return
          }
          const next = event.target.value as PreferredWidth["unit"]
          onChange({ value: next === "pct" ? 100 : round(fallback), unit: next })
        }}
      >
        <option value="cm">Centimeters</option>
        <option value="pct">Percent</option>
      </select>
    </div>
  )
}

/** Four margins in two columns, Top and Bottom over Left and Right, as on Table Options and Cell Options. */
function MarginFields({
  id,
  margins,
  disabled = false,
  onChange,
}: {
  id: string
  margins: Margins
  disabled?: boolean
  onChange: (margins: Margins) => void
}) {
  const field = (side: keyof Margins, text: string, letter: string) => (
    <>
      <Label htmlFor={`${id}-${side}`} text={text} letter={letter} />
      <SpinField
        id={`${id}-${side}`}
        value={String(margins[side])}
        unit="cm"
        step={0.1}
        min={0}
        max={55.88}
        disabled={disabled}
        onChange={(value) => onChange({ ...margins, [side]: Number(value) })}
      />
    </>
  )
  return (
    <div className="tp-margins">
      {field("top", "Top:", "T")}
      {field("left", "Left:", "L")}
      {field("bottom", "Bottom:", "B")}
      {field("right", "Right:", "R")}
    </div>
  )
}

function TableOptionsDialog({
  draft,
  onApply,
  onClose,
}: {
  draft: TableDraft
  onApply: (next: Partial<TableDraft>) => void
  onClose: () => void
}) {
  const [margins, setMargins] = useState(draft.margins)
  const [spacing, setSpacing] = useState(draft.cellSpacing)
  const [autoResize, setAutoResize] = useState(draft.autoResize)
  return (
    <DialogFrame
      title="Table Options"
      width={340}
      level={90}
      onClose={onClose}
      onSubmit={() => {
        const marginsSet = draft.marginsSet || JSON.stringify(margins) !== JSON.stringify(draft.margins)
        onApply({ margins, marginsSet, cellSpacing: spacing, autoResize })
        onClose()
      }}
    >
      <div className="tp-stack">
        <Section title="Default cell margins">
          <MarginFields id="tp-table-margin" margins={margins} onChange={setMargins} />
        </Section>
        <Section title="Default cell spacing">
          <div className="tp-size-row">
            <Check
              id="tp-spacing-on"
              text="Allow spacing between cells"
              letter="s"
              checked={spacing !== null}
              onChange={(on) => setSpacing(on ? 0.1 : null)}
            />
            <SpinField
              id="tp-spacing"
              value={spacing === null ? "" : String(spacing)}
              unit="cm"
              step={0.1}
              min={0}
              max={3.35}
              disabled={spacing === null}
              onChange={(value) => setSpacing(Number(value))}
            />
          </div>
        </Section>
        <Section title="Options">
          <Check
            id="tp-auto-resize"
            text="Automatically resize to fit contents"
            letter="z"
            checked={autoResize}
            onChange={setAutoResize}
          />
        </Section>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

function CellOptionsDialog({
  draft,
  onApply,
  onClose,
}: {
  draft: TableDraft
  onApply: (next: Partial<TableDraft>) => void
  onClose: () => void
}) {
  const [same, setSame] = useState(draft.cellMargins === null)
  const [margins, setMargins] = useState(draft.cellMargins ?? draft.margins ?? WORD_MARGINS)
  const [wrap, setWrap] = useState(!draft.noWrap)
  const [fit, setFit] = useState(draft.fitText)
  return (
    <DialogFrame
      title="Cell Options"
      width={340}
      level={90}
      onClose={onClose}
      onSubmit={() => {
        onApply({ cellMargins: same ? null : margins, noWrap: !wrap, fitText: fit })
        onClose()
      }}
    >
      <div className="tp-stack">
        <Section title="Cell margins">
          <Check id="tp-cell-same" text="Same as the whole table" letter="S" checked={same} onChange={setSame} />
          <MarginFields id="tp-cell-margin" margins={margins} disabled={same} onChange={setMargins} />
        </Section>
        <Section title="Options">
          <Check id="tp-cell-wrap" text="Wrap text" letter="W" checked={wrap} onChange={setWrap} />
          <Check id="tp-cell-fit" text="Fit text" letter="F" checked={fit} onChange={setFit} />
        </Section>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/** "Row 2:", or "Rows 1-3:" while the selection covers several. */
function rangeLabel(word: string, range: [number, number]) {
  return range[0] === range[1] ? `${word} ${range[0] + 1}:` : `${word}s ${range[0] + 1}-${range[1] + 1}:`
}

function TablePropertiesDialog({
  editor,
  initialTab,
  onClose,
}: {
  editor: Editor
  initialTab: Tab
  onClose: () => void
}) {
  const [state] = useState<TableDialogState | null>(() => tableDialogState(editor))
  const [tab, setTab] = useState<Tab>(initialTab)
  const [draft, setDraft] = useState<TableDraft | null>(() => state?.draft ?? null)
  const [rows, setRows] = useState<[number, number]>(() => state?.rowRange ?? [0, 0])
  const [columns, setColumns] = useState<[number, number]>(() => state?.columnRange ?? [0, 0])
  const [sub, setSub] = useState<"table" | "cell" | null>(null)
  if (!state || !draft) {
    return null
  }
  const patch = (next: Partial<TableDraft>) => setDraft((current) => (current ? { ...current, ...next } : current))
  const tableWidth = state.drawn.reduce((sum, width) => sum + width, 0)
  const row = draft.rows[rows[0]]!
  const patchRows = (next: Partial<TableDraft["rows"][number]>) =>
    patch({
      rows: draft.rows.map((item, index) => (index >= rows[0] && index <= rows[1] ? { ...item, ...next } : item)),
    })
  const column = draft.columns[columns[0]]!
  const patchColumns = (width: PreferredWidth | null) =>
    patch({
      columns: draft.columns.map((item, index) => (index >= columns[0] && index <= columns[1] ? { width } : item)),
    })
  const rowHeight = (() => {
    const dom = editor.view.nodeDOM(row.pos)
    return dom instanceof HTMLElement && dom.offsetHeight ? dom.offsetHeight / PX_PER_CM : 0.6
  })()

  return (
    <>
      <DialogFrame
        title="Table Properties"
        width={470}
        onClose={onClose}
        onSubmit={() => {
          applyTableDialog(editor, state, draft)
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
        bodyHeight={372}
        bodyClassName="tp-body"
      >
        {tab === "table" ? (
          <div className="tp-stack">
            <Section title="Size">
              <PreferredWidthFields
                id="tp-table-width"
                width={draft.prefWidth}
                fallback={tableWidth / PX_PER_CM}
                onChange={(prefWidth) => patch({ prefWidth })}
              />
            </Section>
            <Section title="Alignment">
              <div className="tp-tiles-row">
                <div className="tp-tiles" role="group" aria-label="Alignment">
                  <Tile
                    label="Left"
                    letter="L"
                    pressed={draft.align === "left"}
                    onClick={() => patch({ align: "left" })}
                  >
                    <TableIcon x={4} />
                  </Tile>
                  <Tile
                    label="Center"
                    letter="C"
                    pressed={draft.align === "center"}
                    onClick={() => patch({ align: "center" })}
                  >
                    <TableIcon x={11} />
                  </Tile>
                  <Tile
                    label="Right"
                    letter="h"
                    pressed={draft.align === "right"}
                    onClick={() => patch({ align: "right" })}
                  >
                    <TableIcon x={18} />
                  </Tile>
                </div>
                <div className="tp-indent">
                  <Label htmlFor="tp-indent" text="Indent from left:" letter="I" />
                  <SpinField
                    id="tp-indent"
                    value={String(draft.indent)}
                    unit="cm"
                    step={0.1}
                    min={-55.88}
                    max={55.88}
                    disabled={draft.align !== "left"}
                    onChange={(value) => patch({ indent: Number(value) })}
                  />
                </div>
              </div>
            </Section>
            <Section title="Text wrapping">
              <div className="tp-tiles-row">
                <div className="tp-tiles" role="group" aria-label="Text wrapping">
                  <Tile label="None" letter="N" pressed onClick={() => undefined}>
                    <path d="M8 4h24M8 8h24" className="tp-tile-line" />
                    <rect x={12} y={11} width={16} height={11} className="tp-tile-table" />
                    <path d="M8 26h24M8 30h24" className="tp-tile-line" />
                  </Tile>
                  <Tile
                    label="Around"
                    letter="A"
                    pressed={false}
                    disabled
                    title="Tables that text flows around are not available yet"
                    onClick={() => undefined}
                  >
                    <path d="M4 4h32M4 8h32M4 12h12M4 16h12M4 20h12M4 26h32M4 30h32" className="tp-tile-line" />
                    <rect x={19} y={10} width={16} height={12} className="tp-tile-table" />
                  </Tile>
                </div>
                <button type="button" className="dialog-btn tp-end" disabled>
                  <Keyed text="Positioning..." letter="P" />
                </button>
              </div>
            </Section>
            <div className="tp-foot">
              <button
                type="button"
                className="dialog-btn"
                onClick={() => {
                  applyTableDialog(editor, state, draft)
                  onClose()
                  openBordersAndShading(editor)
                }}
              >
                <Keyed text="Borders and Shading..." letter="B" />
              </button>
              <button type="button" className="dialog-btn" onClick={() => setSub("table")}>
                <Keyed text="Options..." letter="O" />
              </button>
            </div>
          </div>
        ) : null}
        {tab === "row" ? (
          <div className="tp-stack">
            <p className="tp-range">{rangeLabel("Row", rows)}</p>
            <Section title="Size">
              <div className="tp-size-row">
                <Check
                  id="tp-row-height-on"
                  text="Specify height:"
                  letter="S"
                  checked={row.height !== null}
                  onChange={(on) => patchRows({ height: on ? round(rowHeight) : null })}
                />
                <SpinField
                  id="tp-row-height"
                  value={row.height === null ? "" : String(row.height)}
                  unit="cm"
                  step={0.1}
                  min={0}
                  max={55.88}
                  disabled={row.height === null}
                  onChange={(value) => patchRows({ height: Number(value) || null })}
                />
                <Label htmlFor="tp-row-rule" text="Row height is:" letter="i" />
                <select
                  id="tp-row-rule"
                  value={row.rule}
                  disabled={row.height === null}
                  onChange={(event) => patchRows({ rule: event.target.value as "atLeast" | "exact" })}
                >
                  <option value="atLeast">At least</option>
                  <option value="exact">Exactly</option>
                </select>
              </div>
            </Section>
            <Section title="Options">
              <Check
                id="tp-row-break"
                text="Allow row to break across pages"
                letter="k"
                checked={!row.cantSplit}
                onChange={(on) => patchRows({ cantSplit: !on })}
              />
              <Check
                id="tp-row-header"
                text="Repeat as header row at the top of each page"
                letter="R"
                checked={draft.headerRow}
                disabled={rows[0] !== 0}
                onChange={(on) => patch({ headerRow: on })}
              />
            </Section>
            <div className="tp-foot">
              <button
                type="button"
                className="dialog-btn"
                disabled={rows[0] === 0}
                onClick={() => setRows([rows[0] - 1, rows[0] - 1])}
              >
                ▲ <Keyed text="Previous Row" letter="P" />
              </button>
              <button
                type="button"
                className="dialog-btn"
                disabled={rows[1] >= draft.rows.length - 1}
                onClick={() => setRows([rows[1] + 1, rows[1] + 1])}
              >
                ▼ <Keyed text="Next Row" letter="N" />
              </button>
            </div>
          </div>
        ) : null}
        {tab === "column" ? (
          <div className="tp-stack">
            <p className="tp-range">{rangeLabel("Column", columns)}</p>
            <Section title="Size">
              <PreferredWidthFields
                id="tp-column-width"
                width={column.width}
                fallback={(state.drawn[columns[0]] ?? 96) / PX_PER_CM}
                onChange={patchColumns}
              />
            </Section>
            <div className="tp-foot">
              <button
                type="button"
                className="dialog-btn"
                disabled={columns[0] === 0}
                onClick={() => setColumns([columns[0] - 1, columns[0] - 1])}
              >
                ◄ <Keyed text="Previous Column" letter="P" />
              </button>
              <button
                type="button"
                className="dialog-btn"
                disabled={columns[1] >= draft.columns.length - 1}
                onClick={() => setColumns([columns[1] + 1, columns[1] + 1])}
              >
                ► <Keyed text="Next Column" letter="N" />
              </button>
            </div>
          </div>
        ) : null}
        {tab === "cell" ? (
          <div className="tp-stack">
            <Section title="Size">
              <PreferredWidthFields
                id="tp-cell-width"
                width={draft.cellWidth}
                fallback={(state.drawn[state.columnRange[0]] ?? 96) / PX_PER_CM}
                onChange={(cellWidth) => patch({ cellWidth })}
              />
            </Section>
            <Section title="Vertical alignment">
              <div className="tp-tiles" role="group" aria-label="Vertical alignment">
                <Tile label="Top" letter="p" pressed={draft.valign === "top"} onClick={() => patch({ valign: "top" })}>
                  <rect x={8} y={3} width={24} height={26} className="tp-tile-table" />
                  <TextLines top={7} />
                </Tile>
                <Tile
                  label="Center"
                  letter="C"
                  pressed={draft.valign === "middle"}
                  onClick={() => patch({ valign: "middle" })}
                >
                  <rect x={8} y={3} width={24} height={26} className="tp-tile-table" />
                  <TextLines top={12} />
                </Tile>
                <Tile
                  label="Bottom"
                  letter="B"
                  pressed={draft.valign === "bottom"}
                  onClick={() => patch({ valign: "bottom" })}
                >
                  <rect x={8} y={3} width={24} height={26} className="tp-tile-table" />
                  <TextLines top={17} />
                </Tile>
              </div>
            </Section>
            <div className="tp-foot">
              <span />
              <button type="button" className="dialog-btn" onClick={() => setSub("cell")}>
                <Keyed text="Options..." letter="O" />
              </button>
            </div>
          </div>
        ) : null}
        {tab === "alt" ? (
          <div className="tp-stack">
            <div className="word-dialog-stack">
              <Label htmlFor="tp-alt-title" text="Title:" letter="T" />
              <input
                id="tp-alt-title"
                className="tp-input"
                value={draft.altTitle}
                onChange={(event) => patch({ altTitle: event.target.value })}
              />
            </div>
            <div className="word-dialog-stack">
              <Label htmlFor="tp-alt-desc" text="Description:" letter="D" />
              <textarea
                id="tp-alt-desc"
                className="tp-input"
                rows={7}
                value={draft.altDesc}
                onChange={(event) => patch({ altDesc: event.target.value })}
              />
            </div>
          </div>
        ) : null}
        <DialogButtons submit onCancel={onClose} />
      </DialogFrame>
      {sub === "table" ? <TableOptionsDialog draft={draft} onApply={patch} onClose={() => setSub(null)} /> : null}
      {sub === "cell" ? <CellOptionsDialog draft={draft} onApply={patch} onClose={() => setSub(null)} /> : null}
    </>
  )
}
