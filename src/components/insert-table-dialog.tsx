import { Check, DialogButtons, DialogFrame, Keyed, Label, Section, SpinField } from "@/components/word-dialog"
import {
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  columnsForText,
  convertTextToTable,
  guessSeparator,
  insertTableWith,
  rememberTableDefaults,
  rowsForText,
  tableDefaults,
  textForTable,
  type AutoFitBehavior,
  type TextSeparator,
} from "@/editor/table-insert"
import type { Editor } from "@tiptap/core"
import { useMemo, useState } from "react"
import { create } from "zustand"

/** Insert → Table → Insert Table… and Convert Text to Table…, Word's two table size dialogs. */
type Mode = "insert" | "convert"

export const useInsertTableDialog = create<{ open: { editor: Editor; mode: Mode } | null }>(() => ({ open: null }))

export function openInsertTableDialog(editor: Editor | null, mode: Mode) {
  if (editor && (mode === "insert" || textForTable(editor))) {
    useInsertTableDialog.setState({ open: { editor, mode } })
  }
}

export function InsertTableDialogHost() {
  const open = useInsertTableDialog((state) => state.open)
  const close = () => useInsertTableDialog.setState({ open: null })
  if (!open) {
    return null
  }
  return open.mode === "insert" ? (
    <InsertTableDialog editor={open.editor} onClose={close} />
  ) : (
    <ConvertTextDialog editor={open.editor} onClose={close} />
  )
}

type FitKind = AutoFitBehavior["kind"]

function behavior(kind: FitKind, width: string): AutoFitBehavior {
  if (kind === "fixed") {
    const value = Number(width)
    return { kind, widthCm: width !== "" && value > 0 ? value : null }
  }
  return { kind }
}

function Radio({
  name,
  text,
  letter,
  checked,
  onChange,
}: {
  name: string
  text: string
  letter: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="word-dialog-check">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        <Keyed text={text} letter={letter} />
      </span>
    </label>
  )
}

/** The AutoFit behavior group both dialogs share. */
function AutoFitGroup({
  kind,
  width,
  onKind,
  onWidth,
}: {
  kind: FitKind
  width: string
  onKind: (kind: FitKind) => void
  onWidth: (width: string) => void
}) {
  return (
    <Section title="AutoFit behavior">
      <div className="insert-table-fit">
        <Radio
          name="table-fit"
          text="Fixed column width:"
          letter="W"
          checked={kind === "fixed"}
          onChange={() => onKind("fixed")}
        />
        <SpinField
          id="table-fixed-width"
          value={width}
          unit="cm"
          step={0.1}
          min={0.1}
          max={55.88}
          autoText="Auto"
          disabled={kind !== "fixed"}
          keepValue
          onChange={onWidth}
        />
        <Radio
          name="table-fit"
          text="AutoFit to contents"
          letter="F"
          checked={kind === "contents"}
          onChange={() => onKind("contents")}
        />
        <span />
        <Radio
          name="table-fit"
          text="AutoFit to window"
          letter="D"
          checked={kind === "window"}
          onChange={() => onKind("window")}
        />
      </div>
    </Section>
  )
}

function SizeGroup({
  columns,
  rows,
  rowsDisabled,
  onColumns,
  onRows,
}: {
  columns: number
  rows: number
  rowsDisabled?: boolean
  onColumns: (value: number) => void
  onRows: (value: number) => void
}) {
  return (
    <Section title="Table size">
      <div className="insert-table-size">
        <Label htmlFor="table-columns" text="Number of columns:" letter="C" />
        <SpinField
          id="table-columns"
          value={String(columns)}
          unit=""
          step={1}
          min={1}
          max={MAX_TABLE_COLUMNS}
          onChange={(value) => onColumns(Number(value))}
        />
        <Label htmlFor="table-rows" text="Number of rows:" letter="R" />
        <SpinField
          id="table-rows"
          value={String(rows)}
          unit=""
          step={1}
          min={1}
          max={MAX_TABLE_ROWS}
          disabled={rowsDisabled}
          keepValue
          onChange={(value) => onRows(Number(value))}
        />
      </div>
    </Section>
  )
}

function widthText(autoFit: AutoFitBehavior) {
  return autoFit.kind === "fixed" && autoFit.widthCm ? String(autoFit.widthCm) : ""
}

function InsertTableDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const initial = useMemo(() => tableDefaults(), [])
  const [columns, setColumns] = useState(initial.columns)
  const [rows, setRows] = useState(initial.rows)
  const [kind, setKind] = useState<FitKind>(initial.autoFit.kind)
  const [width, setWidth] = useState(widthText(initial.autoFit))
  const [remember, setRemember] = useState(initial.remembered)

  const apply = () => {
    const autoFit = behavior(kind, width)
    rememberTableDefaults(remember ? { columns, rows, autoFit } : null)
    onClose()
    insertTableWith(editor, { rows, columns, autoFit })
  }

  return (
    <DialogFrame title="Insert Table" width={300} onClose={onClose} onSubmit={apply}>
      <div className="insert-table-dialog">
        <SizeGroup columns={columns} rows={rows} onColumns={setColumns} onRows={setRows} />
        <AutoFitGroup kind={kind} width={width} onKind={setKind} onWidth={setWidth} />
        <Check
          id="table-remember"
          text="Remember dimensions for new tables"
          letter="s"
          checked={remember}
          onChange={setRemember}
        />
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

function separatorKey(separator: TextSeparator) {
  return separator.kind
}

function ConvertTextDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const source = useMemo(() => textForTable(editor), [editor])
  const blocks = source?.blocks ?? []
  const [separator, setSeparatorState] = useState<TextSeparator>(() => guessSeparator(blocks))
  const [other, setOther] = useState("-")
  const [columns, setColumns] = useState(() => columnsForText(blocks, guessSeparator(blocks)))
  const [kind, setKind] = useState<FitKind>("fixed")
  const [width, setWidth] = useState("")
  const rows = rowsForText(blocks, separator, columns)

  const setSeparator = (next: TextSeparator) => {
    setSeparatorState(next)
    setColumns(columnsForText(blocks, next))
  }

  const apply = () => {
    onClose()
    convertTextToTable(editor, { separator, columns, autoFit: behavior(kind, width) })
  }

  const key = separatorKey(separator)
  return (
    <DialogFrame title="Convert Text to Table" width={320} onClose={onClose} onSubmit={apply}>
      <div className="insert-table-dialog">
        <SizeGroup columns={columns} rows={rows} rowsDisabled onColumns={setColumns} onRows={() => undefined} />
        <AutoFitGroup kind={kind} width={width} onKind={setKind} onWidth={setWidth} />
        <Section title="Separate text at">
          <div className="insert-table-separators">
            <Radio
              name="table-separator"
              text="Paragraphs"
              letter="P"
              checked={key === "paragraphs"}
              onChange={() => setSeparator({ kind: "paragraphs" })}
            />
            <Radio
              name="table-separator"
              text="Commas"
              letter="m"
              checked={key === "commas"}
              onChange={() => setSeparator({ kind: "commas" })}
            />
            <Radio
              name="table-separator"
              text="Tabs"
              letter="T"
              checked={key === "tabs"}
              onChange={() => setSeparator({ kind: "tabs" })}
            />
            <span className="insert-table-other">
              <Radio
                name="table-separator"
                text="Other:"
                letter="O"
                checked={key === "other"}
                onChange={() => setSeparator({ kind: "other", char: other })}
              />
              <input
                aria-label="Other separator"
                maxLength={1}
                value={other}
                onChange={(event) => {
                  setOther(event.target.value)
                  if (event.target.value) {
                    setSeparator({ kind: "other", char: event.target.value })
                  }
                }}
              />
            </span>
          </div>
        </Section>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
