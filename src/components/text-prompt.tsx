import { useEffect, useRef, useState } from "react"
import { create } from "zustand"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"

/**
 * The app's own answer to `window.prompt`: a themed dialog that asks for one line or a few lines of text. `askText`
 * resolves with the text, or null when the dialog is cancelled; `TextPromptHost` (mounted once) shows it.
 */

export type TextPromptOptions = {
  title: string
  label: string
  value?: string
  placeholder?: string
  /** A text area for a comment or alt text; a single line (an address, a name) otherwise. */
  multiline?: boolean
  ok?: string
}

type Pending = TextPromptOptions & { resolve: (text: string | null) => void }

const usePrompt = create<{ pending: Pending | null }>(() => ({ pending: null }))

export function askText(options: TextPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    // A second request while one is open cancels the first, as a second window.prompt could not happen.
    usePrompt.getState().pending?.resolve(null)
    usePrompt.setState({ pending: { ...options, resolve } })
  })
}

function settle(text: string | null) {
  const pending = usePrompt.getState().pending
  usePrompt.setState({ pending: null })
  pending?.resolve(text)
}

export function TextPromptHost() {
  const pending = usePrompt((state) => state.pending)
  return pending ? <TextPromptDialog key={pending.title + pending.label} {...pending} /> : null
}

function TextPromptDialog({ title, label, value = "", placeholder, multiline = false, ok = "OK" }: Pending) {
  const [text, setText] = useState(value)
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => {
    // After the click that opened the dialog has finished with the editor's focus.
    const timer = window.setTimeout(() => {
      field.current?.focus()
      field.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <DialogFrame title={title} width={multiline ? 380 : 360} onClose={() => settle(null)} onSubmit={() => settle(text)}>
      <label className="text-prompt-label" htmlFor="text-prompt-field">
        {label}
      </label>
      {multiline ? (
        <textarea
          id="text-prompt-field"
          ref={field}
          rows={4}
          value={text}
          placeholder={placeholder}
          className="text-prompt-field"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds a line; Ctrl+Enter accepts.
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              settle(text)
            }
          }}
        />
      ) : (
        <input
          id="text-prompt-field"
          ref={field}
          type="text"
          value={text}
          placeholder={placeholder}
          className="text-prompt-field"
          onChange={(event) => setText(event.target.value)}
        />
      )}
      <DialogButtons submit ok={ok} onCancel={() => settle(null)} />
    </DialogFrame>
  )
}
