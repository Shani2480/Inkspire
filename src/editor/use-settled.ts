import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"

/**
 * A value worked out from the whole document (word count, accessibility check), kept while typing and worked out
 * again once typing pauses. Reading the entire document on every keystroke makes typing lag in a long document,
 * and nothing on screen needs these to be right to the letter while the cursor is still moving.
 */
export function useSettledEditorValue<T>(
  editor: Editor | null,
  compute: (editor: Editor) => T,
  fallback: T,
  deps: readonly unknown[] = [],
  delay = 350,
): T {
  const kept = useRef<{ doc: unknown; key: string; value: T; at: number } | null>(null)
  const [, refresh] = useState(0)
  const key = JSON.stringify(deps)

  const value = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return fallback
      }
      const doc = current.state.doc
      const last = kept.current
      if (last && last.key === key && (last.doc === doc || Date.now() - last.at < delay)) {
        return last.value
      }
      const next = compute(current)
      kept.current = { doc, key, value: next, at: Date.now() }
      return next
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }
    let timer = 0
    const onUpdate = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        // Typing paused: the next read works the value out afresh.
        if (kept.current && kept.current.doc !== editor.state.doc) {
          kept.current = null
          refresh((count) => count + 1)
        }
      }, delay)
    }
    editor.on("update", onUpdate)
    return () => {
      editor.off("update", onUpdate)
      window.clearTimeout(timer)
    }
  }, [editor, delay])

  return value ?? fallback
}
