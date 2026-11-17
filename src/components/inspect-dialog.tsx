import { useState } from "react"
import { create } from "zustand"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import {
  INSPECT_KINDS,
  inspectDocument,
  removeInspected,
  type InspectFinding,
  type InspectKind,
} from "@/document/inspect"
import { useBodyEditor } from "@/editor/document-editor"

/** Whether the Document Inspector is open (File > Info > Check for Issues > Inspect Document). */
export const useInspectDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

/**
 * Word's Document Inspector: tick what to look for and Inspect; then each kind shows what was found, with Remove All,
 * and Reinspect looks again.
 */
export function InspectDialogHost() {
  const open = useInspectDialog((state) => state.open)
  if (!open) {
    return null
  }
  return <InspectDialog />
}

function InspectDialog() {
  const hide = useInspectDialog((state) => state.hide)
  const editor = useBodyEditor()
  const [chosen, setChosen] = useState<Set<InspectKind>>(() => new Set(INSPECT_KINDS.map((item) => item.kind)))
  const [results, setResults] = useState<InspectFinding[] | null>(null)
  const [removed, setRemoved] = useState<Set<InspectKind>>(() => new Set())

  const inspect = () => {
    setRemoved(new Set())
    setResults(inspectDocument(editor).filter((finding) => chosen.has(finding.kind)))
  }
  const removeAll = (kind: InspectKind) => {
    removeInspected(editor, kind)
    setRemoved((current) => new Set(current).add(kind))
  }
  const toggle = (kind: InspectKind) =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(kind)) {
        next.delete(kind)
      } else {
        next.add(kind)
      }
      return next
    })

  return (
    <DialogFrame title="Document Inspector" width={520} onClose={hide}>
      {results ? (
        <>
          <p className="text-xs">Review the inspection results.</p>
          <ul className="inspect-results" aria-label="Inspection results">
            {results.map((finding) => {
              const info = INSPECT_KINDS.find((item) => item.kind === finding.kind)!
              const done = removed.has(finding.kind)
              const found = finding.found.length > 0 && !done
              return (
                <li key={finding.kind} className={found ? "inspect-row is-found" : "inspect-row"}>
                  <span className="inspect-mark" aria-hidden="true">
                    {found ? "!" : "✓"}
                  </span>
                  <div className="inspect-text">
                    <strong>{info.title}</strong>
                    {done ? (
                      <span>{info.removed}</span>
                    ) : found ? (
                      <>
                        <span>The following items were found:</span>
                        <ul>
                          {finding.found.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <span>No items were found.</span>
                    )}
                  </div>
                  {found ? (
                    <button type="button" className="dialog-btn" onClick={() => removeAll(finding.kind)}>
                      Remove All
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className="inspect-note">Some changes cannot be undone.</p>
          <DialogButtons ok="Reinspect" onOk={inspect} cancel="Close" onCancel={hide} />
        </>
      ) : (
        <>
          <p className="text-xs">To check the document for the selected content, click Inspect.</p>
          <ul className="inspect-results" aria-label="What to inspect">
            {INSPECT_KINDS.map((item) => (
              <li key={item.kind} className="inspect-row">
                <input
                  type="checkbox"
                  id={`inspect-${item.kind}`}
                  checked={chosen.has(item.kind)}
                  onChange={() => toggle(item.kind)}
                />
                <label className="inspect-text" htmlFor={`inspect-${item.kind}`}>
                  <strong>{item.title}</strong>
                  <span>{item.checks}</span>
                </label>
              </li>
            ))}
          </ul>
          <DialogButtons ok="Inspect" okDisabled={chosen.size === 0} onOk={inspect} cancel="Close" onCancel={hide} />
        </>
      )}
    </DialogFrame>
  )
}
