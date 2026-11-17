import { DialogFrame } from "@/components/word-dialog"
import { useMacroPrompt } from "@/document/macro-prompt"
import { useEffect, useRef } from "react"

/** Word's "cannot be saved in a macro-free document" prompt. */
export function MacroPromptDialog() {
  const open = useMacroPrompt((state) => state.open)
  const answer = useMacroPrompt((state) => state.answer)
  const noRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      noRef.current?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <DialogFrame title="Inkspire" width={460} level={120} onClose={() => answer(false)}>
      <p className="text-[13px]">The following cannot be saved in a macro-free document:</p>
      <p className="mt-1 pl-4 text-[13px]">&bull; VBA project</p>
      <p className="mt-2 text-[13px]">
        To save a file with these features, click No to return to Save As, and then choose a macro-enabled file type
        (.docm or .dotm).
      </p>
      <p className="mt-2 text-[13px]">To continue saving as a macro-free document, click Yes.</p>
      <div className="word-dialog-actions">
        <span className="flex-1" />
        <button type="button" className="dialog-btn is-primary" onClick={() => answer(true)}>
          Yes
        </button>
        <button ref={noRef} type="button" className="dialog-btn" onClick={() => answer(false)}>
          No
        </button>
      </div>
    </DialogFrame>
  )
}
