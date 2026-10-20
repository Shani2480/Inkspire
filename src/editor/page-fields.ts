import type { Editor } from "@tiptap/core"
import { pageFieldHtml } from "@/document/chrome-html"

/** Puts a page number (or the number of pages) field at the caret, as Word's PAGE and NUMPAGES fields. */
export function insertPageField(editor: Editor, field: "page" | "pages") {
  return editor.chain().focus().insertContent(pageFieldHtml(field)).run()
}
