import { DialogFrame } from "@/components/word-dialog"
import { useQuitPrompt } from "@/document/quit-prompt"
import { useEffect, useRef } from "react"

/** Asked before Android's Back closes Inkspire: the app tells it will close, and offers to save what isn't. */
export function QuitDialog() {
  const open = useQuitPrompt((state) => state.open)
  const unsaved = useQuitPrompt((state) => state.unsaved)
  const answer = useQuitPrompt((state) => state.answer)
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      firstRef.current?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <DialogFrame title="Inkspire" width={380} level={120} onClose={() => answer("cancel")}>
      <p className="text-[13px]">Inkspire will close.</p>
      {unsaved ? (
        <p className="mt-2 text-xs text-[var(--dlg-muted)]">
          This document has changes that aren&rsquo;t saved. Save them before Inkspire closes?
        </p>
      ) : null}
      <div className="word-dialog-actions flex-wrap">
        <span className="flex-1" />
        {unsaved ? (
          <>
            <button ref={firstRef} type="button" className="dialog-btn is-primary" onClick={() => answer("save")}>
              Save and Quit
            </button>
            <button type="button" className="dialog-btn" onClick={() => answer("quit")}>
              Quit Without Saving
            </button>
          </>
        ) : (
          <button ref={firstRef} type="button" className="dialog-btn is-primary" onClick={() => answer("quit")}>
            Quit
          </button>
        )}
        <button type="button" className="dialog-btn" onClick={() => answer("cancel")}>
          Cancel
        </button>
      </div>
    </DialogFrame>
  )
}
