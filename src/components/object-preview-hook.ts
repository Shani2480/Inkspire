import { objectPreview } from "@/editor/object-preview"
import type { Editor } from "@tiptap/core"
import { useEffect, useMemo } from "react"

/** A live preview session for a menu or dialog; whatever is still previewed when it closes is taken back. */
export function useObjectPreview(editor: Editor | null) {
  const session = useMemo(() => (editor ? objectPreview(editor) : null), [editor])
  useEffect(() => () => session?.restore(), [session])
  return session
}
