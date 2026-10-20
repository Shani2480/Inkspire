import { createExtensions } from "@/editor/extensions"
import { Editor } from "@tiptap/core"

const cache = new Map<string, string>()
let reader: Editor | null = null

/** A template as the editor renders it (cell shading, run formatting and all), for the gallery's thumbnails. */
export function templatePreviewHtml(html: string) {
  const known = cache.get(html)
  if (known !== undefined) {
    return known
  }
  let rendered = html
  try {
    reader ??= new Editor({ extensions: createExtensions().filter((extension) => extension.name !== "spellcheck") })
    reader.commands.setContent(html, { emitUpdate: false })
    rendered = reader.getHTML()
  } catch {
    // The raw template is still readable.
  }
  cache.set(html, rendered)
  return rendered
}
