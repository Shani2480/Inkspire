import { DialogFrame } from "@/components/word-dialog"
import { useSavePrompt } from "@/document/save-prompt"
import { useEffect, useRef } from "react"

/** Word's prompt before a modified document is closed or replaced: Save, Don't Save or Cancel. */
export function SaveChangesDialog() {
  const name = useSavePrompt((state) => state.name)
  const answer = useSavePrompt((state) => state.answer)
  const saveRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (name !== null) {
      saveRef.current?.focus()
    }
  }, [name])

  if (name === null) {
    return null
  }

  return (
    <DialogFrame title="Inkspire" width={420} level={120} onClose={() => answer("cancel")}>
      <p className="text-[13px]">Do you want to save changes to &ldquo;{name}&rdquo;?</p>
      <p className="mt-2 text-xs text-[var(--dlg-muted)]">
        Your file on disk only changes when you save. AutoSave keeps a recovery copy of your edits, so if you
        don&rsquo;t save, you can still get them back from Unsaved Documents.
      </p>
      <div className="word-dialog-actions">
        <span className="flex-1" />
        <button ref={saveRef} type="button" className="dialog-btn is-primary" onClick={() => answer("save")}>
          Save
        </button>
        <button type="button" className="dialog-btn" onClick={() => answer("discard")}>
          Don&rsquo;t Save
        </button>
        <button type="button" className="dialog-btn" onClick={() => answer("cancel")}>
          Cancel
        </button>
      </div>
    </DialogFrame>
  )
}
