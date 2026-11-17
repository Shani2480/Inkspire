import { useMemo, useState } from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { Check, DialogButtons, DialogFrame, Label, Section, SpinField, WordDialog } from "@/components/word-dialog"
import {
  DEFAULT_INDEX_INSTRUCTION,
  indexInstruction,
  indexOptions,
  type IndexOptions,
  type XeEntry,
} from "@/document/index-field"
import type { TocLeader } from "@/document/toc"
import { markAllIndexEntries } from "@/editor/index-entry"
import { bookmarksOf } from "@/editor/captions"
import { restoreSelection } from "@/editor/selection-memory"

/** References → Insert Index… and Mark Entry… (Alt+Shift+X), as Word draws them. */

type Open = { kind: "index" | "mark"; editor: Editor } | null

export const useIndexDialogs = create<{ open: Open }>(() => ({ open: null }))

export function openIndexDialog(editor: Editor | null) {
  if (editor) {
    restoreSelection(editor)
    useIndexDialogs.setState({ open: { kind: "index", editor } })
  }
}

export function openMarkEntryDialog(editor: Editor | null) {
  if (editor) {
    restoreSelection(editor)
    useIndexDialogs.setState({ open: { kind: "mark", editor } })
  }
}

export function IndexDialogsHost() {
  const open = useIndexDialogs((state) => state.open)
  const close = () => useIndexDialogs.setState({ open: null })
  if (!open) {
    return null
  }
  return open.kind === "index" ? (
    <InsertIndexDialog editor={open.editor} onClose={close} />
  ) : (
    <MarkEntryDialog editor={open.editor} onClose={close} />
  )
}

const LEADERS: { value: TocLeader; label: string }[] = [
  { value: "dot", label: "......." },
  { value: "hyphen", label: "-------" },
  { value: "underscore", label: "_______" },
  { value: "none", label: "(none)" },
]

function selectedIndex(editor: Editor) {
  const { selection } = editor.state
  return selection instanceof NodeSelection && selection.node.type.name === "documentIndex"
    ? selection.node.attrs
    : null
}

function InsertIndexDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = selectedIndex(editor)
  const base = String(existing?.instruction || DEFAULT_INDEX_INSTRUCTION)
  const [draft, setDraft] = useState<IndexOptions>(() => indexOptions({ instruction: base, leader: existing?.leader }))
  const patch = (next: Partial<IndexOptions>) => setDraft((current) => ({ ...current, ...next }))
  const accept = () => {
    editor
      .chain()
      .focus()
      .insertDocumentIndex({ instruction: indexInstruction(base, draft), leader: draft.leader })
      .run()
    onClose()
  }
  return (
    <WordDialog
      title="Index"
      width={540}
      height={440}
      tabs={[{ id: "index", label: "Index", letter: "X" }]}
      tab="index"
      onTab={() => undefined}
      keys={{ r: "index-right", b: "index-leader", o: "index-columns", i: "index-indented", n: "index-runin" }}
      initialFocus="index-right"
      onAccept={accept}
      onCancel={onClose}
    >
      <div className="grid grid-cols-[1fr_200px] gap-4">
        <Section title="Print Preview">
          <IndexPreview options={draft} />
        </Section>
        <div className="index-dialog-side">
          <span>Type:</span>
          <label className="index-dialog-radio">
            <input
              id="index-indented"
              type="radio"
              name="index-type"
              checked={!draft.runIn}
              onChange={() => patch({ runIn: false })}
            />
            <span>
              In<u>d</u>ented
            </span>
          </label>
          <label className="index-dialog-radio">
            <input
              id="index-runin"
              type="radio"
              name="index-type"
              checked={draft.runIn}
              onChange={() => patch({ runIn: true, rightAlign: false })}
            />
            <span>
              Ru<u>n</u>-in
            </span>
          </label>
          <div className="grid grid-cols-[auto_70px] items-center gap-2">
            <Label htmlFor="index-columns" text="Columns:" letter="o" />
            <SpinField
              id="index-columns"
              value={String(draft.columns)}
              unit=""
              min={1}
              max={4}
              step={1}
              onChange={(columns) => patch({ columns: Math.min(4, Math.max(1, Math.round(Number(columns) || 1))) })}
            />
          </div>
        </div>
      </div>
      <Section title="General">
        <Check
          id="index-right"
          text="Right align page numbers"
          letter="R"
          checked={draft.rightAlign && !draft.runIn}
          disabled={draft.runIn}
          onChange={(rightAlign) => patch({ rightAlign })}
        />
        <div className="grid grid-cols-[auto_150px] items-center gap-2">
          <Label htmlFor="index-leader" text="Tab leader:" letter="b" />
          <select
            id="index-leader"
            value={draft.leader}
            disabled={!draft.rightAlign || draft.runIn}
            onChange={(event) => patch({ leader: event.target.value as TocLeader })}
          >
            {LEADERS.map((leader) => (
              <option key={leader.value} value={leader.value}>
                {leader.label}
              </option>
            ))}
          </select>
        </div>
        <div className="index-dialog-buttons">
          <button
            type="button"
            className="dialog-btn"
            onClick={() => useIndexDialogs.setState({ open: { kind: "mark", editor } })}
          >
            Mark Entry…
          </button>
        </div>
      </Section>
    </WordDialog>
  )
}

/** Word's sample index, laid out with the options. */
function IndexPreview({ options }: { options: IndexOptions }) {
  const right = options.rightAlign && !options.runIn
  const page = (text: string) =>
    right ? (
      <>
        <span className="toc-preview-leader" />
        <span>{text}</span>
      </>
    ) : (
      <span>, {text}</span>
    )
  return (
    <div
      className="toc-preview index-preview"
      data-keep-light
      data-leader={options.leader}
      style={{ columnCount: options.columns }}
    >
      <div className="index-preview-letter">A</div>
      <div className="toc-preview-row">
        <span>Aristotle</span>
        {page("2")}
      </div>
      <div className="toc-preview-row">
        <span>
          Asteroid belt. <i>See</i> Jupiter
        </span>
      </div>
      <div className="toc-preview-row">
        <span>Atmosphere</span>
      </div>
      {options.runIn ? (
        <div className="toc-preview-row index-preview-runin">
          <span>Earth: exosphere, 4; ionosphere, 3</span>
        </div>
      ) : (
        <>
          <div className="toc-preview-row" style={{ paddingLeft: 14 }}>
            <span>Earth</span>
          </div>
          <div className="toc-preview-row" style={{ paddingLeft: 28 }}>
            <span>exosphere</span>
            {page("4")}
          </div>
          <div className="toc-preview-row" style={{ paddingLeft: 28 }}>
            <span>ionosphere</span>
            {page("3")}
          </div>
        </>
      )}
      <div className="index-preview-letter">B</div>
      <div className="toc-preview-row">
        <span>Big Bang Theory</span>
        {page("5")}
      </div>
    </div>
  )
}

// --- Mark Index Entry --------------------------------------------------------------------------------------------

type PageOption = "crossReference" | "current" | "range"

function MarkEntryDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const selected = useMemo(() => {
    const { from, to } = editor.state.selection
    return editor.state.doc.textBetween(from, to, " ").replace(/\s+/g, " ").trim().slice(0, 120)
  }, [editor])
  const bookmarks = useMemo(() => bookmarksOf(editor.state.doc), [editor])
  const [main, setMain] = useState(selected)
  const [sub, setSub] = useState("")
  const [pageOption, setPageOption] = useState<PageOption>("current")
  const [see, setSee] = useState("See ")
  const [range, setRange] = useState(bookmarks[0]?.id ?? "")
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  const [marked, setMarked] = useState<string | null>(null)

  const entry = (): XeEntry | null => {
    if (!main.trim()) {
      return null
    }
    const value: XeEntry = { main: main.trim() }
    if (sub.trim()) {
      value.sub = sub.trim()
    }
    if (pageOption === "crossReference" && see.trim()) {
      value.see = see.trim()
    } else {
      if (pageOption === "range" && range) {
        value.range = range
      }
      if (bold) {
        value.bold = true
      }
      if (italic) {
        value.italic = true
      }
    }
    return value
  }

  const mark = () => {
    const value = entry()
    if (!value) {
      return
    }
    editor.chain().focus().markIndexEntry(value).run()
    setMarked("1 entry marked.")
  }

  const markAll = () => {
    const value = entry()
    if (!value || !selected) {
      return
    }
    const count = markAllIndexEntries(editor, selected, value)
    setMarked(`${count} ${count === 1 ? "entry" : "entries"} marked.`)
  }

  return (
    <DialogFrame title="Mark Index Entry" width={420} onClose={onClose} onSubmit={mark}>
      <div className="mark-entry-dialog">
        <Section title="Index">
          <div className="mark-entry-grid">
            <Label htmlFor="mark-main" text="Main entry:" letter="e" />
            <input
              id="mark-main"
              className="dialog-input"
              value={main}
              autoFocus
              onChange={(event) => setMain(event.target.value)}
            />
            <Label htmlFor="mark-sub" text="Subentry:" letter="S" />
            <input
              id="mark-sub"
              className="dialog-input"
              value={sub}
              onChange={(event) => setSub(event.target.value)}
            />
          </div>
        </Section>
        <Section title="Options">
          <div className="mark-entry-options">
            <label className="index-dialog-radio">
              <input
                type="radio"
                name="mark-page"
                checked={pageOption === "crossReference"}
                onChange={() => setPageOption("crossReference")}
              />
              <span>
                <u>C</u>ross-reference:
              </span>
            </label>
            <input
              aria-label="Cross-reference text"
              className="dialog-input mark-entry-indent"
              value={see}
              disabled={pageOption !== "crossReference"}
              onChange={(event) => setSee(event.target.value)}
            />
            <label className="index-dialog-radio">
              <input
                type="radio"
                name="mark-page"
                checked={pageOption === "current"}
                onChange={() => setPageOption("current")}
              />
              <span>
                Current <u>p</u>age
              </span>
            </label>
            <label className="index-dialog-radio">
              <input
                type="radio"
                name="mark-page"
                checked={pageOption === "range"}
                disabled={bookmarks.length === 0}
                onChange={() => setPageOption("range")}
              />
              <span>
                Page <u>r</u>ange
              </span>
            </label>
            <div className="mark-entry-indent grid grid-cols-[auto_1fr] items-center gap-2">
              <Label htmlFor="mark-bookmark" text="Bookmark:" letter="o" />
              <select
                id="mark-bookmark"
                value={range}
                disabled={pageOption !== "range"}
                onChange={(event) => setRange(event.target.value)}
              >
                {bookmarks.map((bookmark) => (
                  <option key={bookmark.id} value={bookmark.id}>
                    {bookmark.text}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>
        <Section title="Page number format">
          <div className="flex gap-6">
            <Check
              id="mark-bold"
              text="Bold"
              letter="B"
              checked={bold}
              disabled={pageOption === "crossReference"}
              onChange={setBold}
            />
            <Check
              id="mark-italic"
              text="Italic"
              letter="I"
              checked={italic}
              disabled={pageOption === "crossReference"}
              onChange={setItalic}
            />
          </div>
        </Section>
        <p className="mark-entry-note" role="status">
          {marked ?? "This dialog box stays open so that you can mark multiple index entries."}
        </p>
      </div>
      <DialogButtons submit ok="Mark" okDisabled={!main.trim()} cancel={marked ? "Close" : "Cancel"} onCancel={onClose}>
        <button type="button" className="dialog-btn" disabled={!main.trim() || !selected} onClick={markAll}>
          Mark All
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}
