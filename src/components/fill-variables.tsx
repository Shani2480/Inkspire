import { findPlaceholders, replacePlaceholders } from "@/ai/templates"
import { useAiSettings } from "@/ai/settings"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { useDocumentEditor } from "@/editor/document-editor"
import { useEffect, useState, type FormEvent } from "react"

export function FillVariablesDialog() {
  const open = useAiSettings((state) => state.variablesOpen)
  const setOpen = useAiSettings((state) => state.setVariablesOpen)
  const editor = useDocumentEditor()
  const [tokens, setTokens] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !editor) {
      return
    }
    const found = findPlaceholders(editor)
    setTokens(found)
    setValues(Object.fromEntries(found.map((token) => [token, ""])))
  }, [open, editor])

  if (!open) {
    return null
  }

  const filled = tokens.some((token) => values[token]?.trim())

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!editor || !filled) {
      return
    }
    replacePlaceholders(editor, values)
    editor.commands.focus()
    setOpen(false)
  }

  return (
    <DialogFrame title="Fill Variables" width={440} onClose={() => setOpen(false)} onSubmit={onSubmit}>
      <p className="mb-3 text-xs text-neutral-500">
        {tokens.length === 0
          ? "No placeholders in this document"
          : `${tokens.length} placeholder${tokens.length === 1 ? "" : "s"} found`}
      </p>
      <div className="flex max-h-[50vh] flex-col gap-3 overflow-auto">
        {tokens.length === 0 ? (
          <p className="text-sm text-neutral-600">
            Generate a template that uses square brackets, such as [Client Name], then return here to fill them in.
          </p>
        ) : (
          tokens.map((token) => (
            <label key={token} className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              {token}
              <input
                value={values[token] ?? ""}
                autoComplete="off"
                className="h-8 rounded-md border border-black/10 px-2 text-sm font-normal text-neutral-900 outline-none focus:border-neutral-400"
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [token]: event.target.value,
                  }))
                }
              />
            </label>
          ))
        )}
      </div>

      <DialogButtons submit ok="Apply to Document" okDisabled={!filled} onCancel={() => setOpen(false)} />
    </DialogFrame>
  )
}
