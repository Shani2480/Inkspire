import { useEffect, useState } from "react"
import { create } from "zustand"
import { Check, DialogButtons, DialogFrame, Label, Section, WordDialog } from "@/components/word-dialog"
import { DEFAULT_TOC_INSTRUCTION, tocInstruction, tocOptions, type TocLeader, type TocOptions } from "@/document/toc"
import { useDocumentEditor } from "@/editor/document-editor"
import { TOC_UPDATE_EVENT, type TocUpdate } from "@/editor/toc"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"

type TocDialog = "custom" | "update" | null

export const useTocDialog = create<{ dialog: TocDialog; open: (dialog: TocDialog) => void }>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
}))

const LEADERS: { value: TocLeader; label: string }[] = [
  { value: "dot", label: "......." },
  { value: "hyphen", label: "-------" },
  { value: "underscore", label: "_______" },
  { value: "none", label: "(none)" },
]

/** The Custom Table of Contents and Update Table of Contents dialogs, and the Update Table tab's request. */
export function TocDialogHost() {
  const editor = useDocumentEditor()
  const dialog = useTocDialog((state) => state.dialog)
  const open = useTocDialog((state) => state.open)

  useEffect(() => {
    const request = () => open("update")
    window.addEventListener(TOC_UPDATE_EVENT, request)
    return () => window.removeEventListener(TOC_UPDATE_EVENT, request)
  }, [open])

  if (!editor || !dialog) {
    return null
  }
  const close = () => open(null)
  return dialog === "custom" ? (
    <CustomTocDialog editor={editor} onClose={close} />
  ) : (
    <UpdateTocDialog editor={editor} onClose={close} />
  )
}

/** The table of contents the dialogs work on: the selected one, else the first in the document. */
function currentToc(editor: Editor): Record<string, unknown> | null {
  const { selection } = editor.state
  if (selection instanceof NodeSelection && selection.node.type.name === "tableOfContents") {
    return selection.node.attrs
  }
  let found: Record<string, unknown> | null = null
  editor.state.doc.descendants((node) => {
    if (!found && node.type.name === "tableOfContents") {
      found = node.attrs
    }
    return !found
  })
  return found
}

function CustomTocDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = currentToc(editor)
  const [draft, setDraft] = useState<TocOptions>(() => tocOptions(existing ?? {}))
  const patch = (next: Partial<TocOptions>) => setDraft((current) => ({ ...current, ...next }))
  const accept = () => {
    const base = String(existing?.instruction || DEFAULT_TOC_INSTRUCTION)
    editor
      .chain()
      .focus()
      .insertTableOfContents({
        instruction: tocInstruction(base, draft),
        leader: draft.leader,
        rightAlign: draft.rightAlign,
        // Word's custom table has no heading of its own; one being replaced keeps its heading.
        title: existing ? String(existing.title ?? "") : "",
      })
      .run()
    onClose()
  }
  return (
    <WordDialog
      title="Table of Contents"
      width={520}
      height={375}
      tabs={[{ id: "toc", label: "Table of Contents", letter: "C" }]}
      tab="toc"
      onTab={() => undefined}
      keys={{ s: "toc-pages", r: "toc-right", b: "toc-leader", h: "toc-links", l: "toc-levels" }}
      initialFocus="toc-pages"
      onAccept={accept}
      onCancel={onClose}
    >
      <div className="grid grid-cols-[1fr_190px] gap-4">
        <Section title="Print Preview">
          <TocPreview options={draft} />
        </Section>
        <div className="flex flex-col gap-2 pt-6">
          <Check
            id="toc-pages"
            text="Show page numbers"
            letter="S"
            checked={draft.pageNumbers}
            onChange={(pageNumbers) => patch({ pageNumbers })}
          />
          <Check
            id="toc-right"
            text="Right align page numbers"
            letter="R"
            checked={draft.rightAlign}
            disabled={!draft.pageNumbers}
            onChange={(rightAlign) => patch({ rightAlign })}
          />
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <Label htmlFor="toc-leader" text="Tab leader:" letter="b" />
            <select
              id="toc-leader"
              value={draft.leader}
              disabled={!draft.pageNumbers || !draft.rightAlign}
              onChange={(event) => patch({ leader: event.target.value as TocLeader })}
            >
              {LEADERS.map((leader) => (
                <option key={leader.value} value={leader.value}>
                  {leader.label}
                </option>
              ))}
            </select>
          </div>
          <Check
            id="toc-links"
            text="Use hyperlinks"
            letter="h"
            checked={draft.hyperlinks}
            onChange={(hyperlinks) => patch({ hyperlinks })}
          />
        </div>
      </div>
      <Section title="General">
        <div className="grid grid-cols-[auto_64px] items-center gap-2">
          <Label htmlFor="toc-levels" text="Show levels:" letter="L" />
          <input
            id="toc-levels"
            type="number"
            min={1}
            max={9}
            className="word-dialog-spin"
            value={draft.levels}
            onChange={(event) => {
              const levels = Math.min(9, Math.max(1, Math.round(Number(event.target.value) || 1)))
              patch({ levels: levels as TocOptions["levels"] })
            }}
          />
        </div>
      </Section>
    </WordDialog>
  )
}

/** Headings 1 to n as the table of contents would list them on paper. */
function TocPreview({ options }: { options: TocOptions }) {
  const rows = Array.from({ length: Math.min(options.levels, 4) }, (_, index) => index + 1)
  return (
    <div className="toc-preview" data-keep-light data-leader={options.leader}>
      {rows.map((level) => (
        <div key={level} className="toc-preview-row" style={{ paddingLeft: `${(level - 1) * 14}px` }}>
          <span className={options.hyperlinks ? "is-link" : undefined}>{`Heading ${level}`}</span>
          {options.pageNumbers ? (
            <>
              {options.rightAlign ? <span className="toc-preview-leader" /> : null}
              <span>{2 * level - 1}</span>
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function UpdateTocDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [update, setUpdate] = useState<TocUpdate>("pages")
  return (
    <DialogFrame
      title="Update Table of Contents"
      width={360}
      onClose={onClose}
      onSubmit={() => {
        editor.chain().focus().updateTableOfContents(update).run()
        onClose()
      }}
    >
      <p className="mb-2 text-xs">Updating the table of contents. Select one of the following options:</p>
      <div className="flex flex-col gap-1.5 pl-3 text-xs">
        {(
          [
            ["pages", "Update page numbers only"],
            ["entire", "Update entire table"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="toc-update"
              checked={update === value}
              autoFocus={update === value}
              onChange={() => setUpdate(value)}
            />
            {label}
          </label>
        ))}
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
