import { useState } from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { DialogButtons, DialogFrame, Label, Section } from "@/components/word-dialog"
import {
  NOTE_FORMATS,
  NOTE_POSITIONS,
  NOTE_RESTARTS,
  formatNoteNumber,
  type NoteKind,
  type NotePosition,
  type NoteRestart,
} from "@/document/note-numbering"
import { useNoteSettings } from "@/document/note-settings"
import { useDocumentStore } from "@/document/store"
import { convertNotes, type ConvertNotes } from "@/editor/note-convert"
import { noteReferenceOf } from "@/editor/note-labels"
import { restoreSelection } from "@/editor/selection-memory"

/**
 * References > Footnotes dialog launcher: Word's Footnote and Endnote dialog. Location, number format, custom mark,
 * start at and numbering apply to the whole document (the app keeps one set of options per document); Insert puts
 * a note at the cursor with the text typed here (the app's notes hold plain text, so it is asked for here rather
 * than typed in the note area as in Word). Footnote layout (columns) is left out: notes are drawn in one column.
 */

const useFootnoteDialog = create<{ editor: Editor | null }>(() => ({ editor: null }))

export function openFootnoteDialog(editor: Editor | null) {
  if (editor) {
    restoreSelection(editor)
    useFootnoteDialog.setState({ editor })
  }
}

export function FootnoteDialogHost() {
  const editor = useFootnoteDialog((state) => state.editor)
  return editor ? <FootnoteDialog editor={editor} onClose={() => useFootnoteDialog.setState({ editor: null })} /> : null
}

function countNotes(editor: Editor) {
  const counts = { footnote: 0, endnote: 0 }
  editor.state.doc.descendants((node) => {
    const reference = noteReferenceOf(node)
    if (reference) {
      counts[reference.kind] += 1
      return false
    }
    return true
  })
  return counts
}

function FootnoteDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const saved = useNoteSettings((state) => state.settings)
  const [kind, setKind] = useState<NoteKind>("footnote")
  const [drafts, setDrafts] = useState(saved)
  const [mark, setMark] = useState("")
  const [text, setText] = useState("")
  const [converting, setConverting] = useState(false)
  const draft = drafts[kind]
  const patch = (next: Partial<typeof draft>, which: NoteKind = kind) =>
    setDrafts((current) => ({ ...current, [which]: { ...current[which], ...next } }))
  const apply = () => {
    const store = useNoteSettings.getState()
    for (const each of ["footnote", "endnote"] as const) {
      if (JSON.stringify(drafts[each]) !== JSON.stringify(store.settings[each])) {
        store.apply(each, drafts[each])
        // Word saves the options in the document, so they are a change to it.
        useDocumentStore.setState({ isDirty: true })
      }
    }
  }
  const insert = () => {
    apply()
    editor.chain().focus().insertNote(kind, text, mark).run()
    onClose()
  }
  const counts = countNotes(editor)
  const start = Math.max(1, draft.numStart)

  return (
    <>
      <DialogFrame title="Footnote and Endnote" width={400} onClose={onClose} onSubmit={() => text.trim() && insert()}>
        <div className="footnote-dialog">
          <Section title="Location">
            <div className="footnote-dialog-grid">
              {(["footnote", "endnote"] as const).map((each) => (
                <div key={each} className="contents">
                  <label className="footnote-dialog-radio">
                    <input type="radio" name="note-kind" checked={kind === each} onChange={() => setKind(each)} />
                    <span>{each === "footnote" ? "Footnotes:" : "Endnotes:"}</span>
                  </label>
                  <select
                    aria-label={each === "footnote" ? "Footnote position" : "Endnote position"}
                    value={drafts[each].pos}
                    disabled={kind !== each}
                    onChange={(event) => patch({ pos: event.target.value as NotePosition }, each)}
                  >
                    {NOTE_POSITIONS[each].map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="footnote-dialog-convert">
              <button
                type="button"
                className="dialog-btn"
                disabled={counts.footnote + counts.endnote === 0}
                onClick={() => setConverting(true)}
              >
                Convert…
              </button>
            </div>
          </Section>
          <Section title="Format">
            <div className="footnote-dialog-grid">
              <Label htmlFor="note-format" text="Number format:" letter="N" />
              <select id="note-format" value={draft.numFmt} onChange={(event) => patch({ numFmt: event.target.value })}>
                {NOTE_FORMATS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <Label htmlFor="note-mark" text="Custom mark:" letter="u" />
              <input
                id="note-mark"
                className="dialog-input"
                value={mark}
                maxLength={10}
                onChange={(event) => setMark(event.target.value)}
              />
              <Label htmlFor="note-start" text="Start at:" letter="S" />
              <div className="footnote-dialog-start">
                <input
                  id="note-start"
                  className="dialog-input"
                  type="number"
                  min={1}
                  max={16383}
                  value={start}
                  disabled={Boolean(mark.trim())}
                  onChange={(event) =>
                    patch({ numStart: Math.max(1, Math.min(16383, Number(event.target.value) || 1)) })
                  }
                />
                <span aria-label="Start at, as numbered">{formatNoteNumber(start, draft.numFmt)}</span>
              </div>
              <Label htmlFor="note-restart" text="Numbering:" letter="m" />
              <select
                id="note-restart"
                value={draft.numRestart}
                disabled={Boolean(mark.trim())}
                onChange={(event) => patch({ numRestart: event.target.value as NoteRestart })}
              >
                {NOTE_RESTARTS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </Section>
          <Section title="Note text">
            <textarea
              aria-label="Note text"
              className="dialog-input footnote-dialog-text"
              rows={2}
              maxLength={500}
              value={text}
              placeholder="Text of the note Insert puts at the cursor"
              onChange={(event) => setText(event.target.value)}
            />
          </Section>
          <Section title="Apply changes">
            <div className="footnote-dialog-grid">
              <Label htmlFor="note-scope" text="Apply changes to:" letter="p" />
              <select id="note-scope" value="document" disabled>
                <option value="document">Whole document</option>
              </select>
            </div>
          </Section>
        </div>
        <DialogButtons ok="Insert" submit okDisabled={!text.trim()} onCancel={onClose}>
          <button
            type="button"
            className="dialog-btn"
            onClick={() => {
              apply()
              onClose()
            }}
          >
            Apply
          </button>
        </DialogButtons>
      </DialogFrame>
      {converting ? (
        <ConvertNotesDialog
          counts={counts}
          onClose={() => setConverting(false)}
          onConvert={(mode) => {
            convertNotes(editor, mode)
            setConverting(false)
          }}
        />
      ) : null}
    </>
  )
}

function ConvertNotesDialog({
  counts,
  onClose,
  onConvert,
}: {
  counts: { footnote: number; endnote: number }
  onClose: () => void
  onConvert: (mode: ConvertNotes) => void
}) {
  const choices: { value: ConvertNotes; label: string; enabled: boolean }[] = [
    { value: "toEndnotes", label: "Convert all footnotes to endnotes", enabled: counts.footnote > 0 },
    { value: "toFootnotes", label: "Convert all endnotes to footnotes", enabled: counts.endnote > 0 },
    { value: "swap", label: "Swap footnotes and endnotes", enabled: counts.footnote > 0 && counts.endnote > 0 },
  ]
  const [mode, setMode] = useState<ConvertNotes>(choices.find((item) => item.enabled)?.value ?? "toEndnotes")
  return (
    <DialogFrame title="Convert Notes" width={320} level={90} onClose={onClose} onSubmit={() => onConvert(mode)}>
      <div className="footnote-dialog-options" role="radiogroup" aria-label="Convert notes">
        {choices.map((item) => (
          <label key={item.value} className={item.enabled ? undefined : "is-disabled"}>
            <input
              type="radio"
              name="convert-notes"
              checked={mode === item.value}
              disabled={!item.enabled}
              onChange={() => setMode(item.value)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
