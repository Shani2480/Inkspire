import { getSchema } from "@tiptap/core"
import { DOMParser as ProseMirrorParser, type Schema } from "@tiptap/pm/model"
import { createExtensions } from "@/editor/extensions"
import type { JsonNode } from "@/document/docx/inlines"

let schema: Schema | null = null

/** The editor's JSON for a header or footer's HTML, read with the same schema the editor uses. */
export function chromeJson(html: string): JsonNode {
  schema ??= getSchema(createExtensions().filter((extension) => extension.name !== "spellcheck"))
  const body = new window.DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body
  return ProseMirrorParser.fromSchema(schema).parse(body, { preserveWhitespace: "full" }).toJSON() as JsonNode
}
