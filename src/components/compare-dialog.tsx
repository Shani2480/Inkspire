/**
 * Review > Compare, as Word's dialog: the original and the revised document, one of them the open one and the other
 * a file; Compare writes the differences into the document as tracked changes (the Review pane lists them, each
 * accepted or rejected there) and asks the AI for a short summary of what changed.
 */
import { requestCompareSummary } from "@/ai/compare-summary"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { openFilters, readFileHtml, errorMessage } from "@/document/commands"
import { changeCounts, compareInto, type CompareChange } from "@/document/compare"
import { openLocalFile, type OpenedFile } from "@/lib/file-io"
import type { Editor } from "@tiptap/core"
import { useState } from "react"
import { create } from "zustand"

export const useCompareDialog = create<{ editor: Editor | null }>(() => ({ editor: null }))

export function openCompare(editor: Editor) {
  useCompareDialog.setState({ editor })
}

export function CompareDialogHost() {
  const editor = useCompareDialog((state) => state.editor)
  return editor ? <CompareDialog editor={editor} onClose={() => useCompareDialog.setState({ editor: null })} /> : null
}

type Role = "original" | "revised"

type Stage =
  { kind: "pick" } | { kind: "comparing" } | { kind: "done"; changes: CompareChange[]; lines: string[]; note: string }

export function CompareDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [file, setFile] = useState<OpenedFile | null>(null)
  // Which the open document is; the file is the other one.
  const [thisDocument, setThisDocument] = useState<Role>("original")
  const [stage, setStage] = useState<Stage>({ kind: "pick" })
  const [error, setError] = useState("")

  const choose = async () => {
    const picked = await openLocalFile(openFilters(), "Compare with")
    if (picked) {
      setFile(picked)
      setError("")
    }
  }

  const compare = async () => {
    if (!file) {
      return
    }
    setStage({ kind: "comparing" })
    setError("")
    try {
      const html = await readFileHtml(file)
      const changes = compareInto(editor, html, { author: `Compared with ${file.name}`, thisDocument })
      if (changes.length === 0) {
        setStage({ kind: "done", changes, lines: [], note: "The two versions have the same text." })
        return
      }
      const summary = await requestCompareSummary(changes, crypto.randomUUID())
      setStage({ kind: "done", changes, lines: summary.lines, note: summary.blocked ?? "" })
    } catch (failure) {
      setStage({ kind: "pick" })
      setError(errorMessage(failure))
    }
  }

  const picker = (role: Role) => (
    <div className="compare-row">
      <span className="compare-label">{role === "original" ? "Original document" : "Revised document"}</span>
      {thisDocument === role ? (
        <span className="compare-this">This document</span>
      ) : (
        <button type="button" className="dialog-btn compare-choose" onClick={() => void choose()}>
          {file ? file.name : "Choose file…"}
        </button>
      )}
    </div>
  )

  const counts = stage.kind === "done" ? changeCounts(stage.changes) : null

  return (
    <DialogFrame
      title="Compare Documents"
      width={460}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        if (stage.kind === "pick") {
          void compare()
        } else {
          onClose()
        }
      }}
    >
      {stage.kind === "done" ? (
        <div className="compare-result" aria-live="polite">
          <p className="compare-counts">
            {counts?.insertions} {counts?.insertions === 1 ? "insertion" : "insertions"}, {counts?.deletions}{" "}
            {counts?.deletions === 1 ? "deletion" : "deletions"}
            {stage.changes.length ? ", marked in the document. Accept or reject each in the Review pane." : "."}
          </p>
          {stage.lines.length ? (
            <ul className="compare-summary">
              {stage.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : null}
          {stage.note ? <p className="compare-note">{stage.note}</p> : null}
        </div>
      ) : (
        <div className="compare-pick">
          {picker("original")}
          {picker("revised")}
          <button
            type="button"
            className="compare-swap"
            onClick={() => setThisDocument((role) => (role === "original" ? "revised" : "original"))}
          >
            ⇄ Swap
          </button>
          <p className="compare-note">
            The differences are written into this document as tracked changes, with a short summary from the AI.
          </p>
          {stage.kind === "comparing" ? <p className="compare-note">Comparing…</p> : null}
          {error ? (
            <p role="alert" className="compare-error">
              {error}
            </p>
          ) : null}
        </div>
      )}
      {stage.kind === "done" ? (
        <div className="word-dialog-actions">
          <span className="flex-1" />
          <button type="submit" className="dialog-btn is-primary">
            Close
          </button>
        </div>
      ) : (
        <DialogButtons submit ok="Compare" okDisabled={stage.kind === "comparing" || !file} onCancel={onClose} />
      )}
    </DialogFrame>
  )
}
