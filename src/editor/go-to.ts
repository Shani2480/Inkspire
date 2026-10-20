import type { Editor } from "@tiptap/core"

/** What Word's Go To can jump to. */
export const GO_TO_KINDS = [
  { id: "page", label: "Page", prompt: "Enter page number:" },
  { id: "bookmark", label: "Bookmark", prompt: "Enter bookmark name:" },
  { id: "comment", label: "Comment", prompt: "Enter comment number:" },
  { id: "heading", label: "Heading", prompt: "Enter heading number:" },
  { id: "table", label: "Table", prompt: "Enter table number:" },
  { id: "graphic", label: "Graphic", prompt: "Enter graphic number:" },
] as const

export type GoToKind = (typeof GO_TO_KINDS)[number]["id"]

const GRAPHICS = new Set(["image", "figure", "wordArt", "textBox", "signatureLine"])

/** Where each item of a kind starts, in document order, with a name for bookmarks. */
export function goToTargets(editor: Editor, kind: GoToKind): { pos: number; name?: string }[] {
  const { doc } = editor.state
  if (kind === "page") {
    const breaks = (editor.storage.pagination?.breaks as number[] | undefined) ?? []
    return [{ pos: 1 }, ...breaks.map((pos) => ({ pos }))]
  }
  const found: { pos: number; name?: string }[] = []
  const seen = new Set<string>()
  doc.descendants((node, pos) => {
    if (kind === "heading" && node.type.name === "heading") {
      found.push({ pos: pos + 1 })
    } else if (kind === "table" && node.type.name === "table") {
      found.push({ pos: pos + 1 })
    } else if (kind === "graphic" && GRAPHICS.has(node.type.name)) {
      found.push({ pos })
    } else if (node.isText && (kind === "bookmark" || kind === "comment")) {
      for (const mark of node.marks) {
        const id = String(mark.attrs.id ?? "")
        if (mark.type.name === kind && !seen.has(id)) {
          seen.add(id)
          found.push({ pos, name: id })
        }
      }
    }
    return true
  })
  return found
}

/**
 * Moves the cursor as Word's Go To does: to the item numbered in `entry`, by `+n` / `-n` relative to the cursor's
 * item, or (for a bookmark) to the one named. An empty entry with a `direction` goes to the next or previous item.
 * Returns false when there is nothing to go to.
 */
export function goTo(editor: Editor, kind: GoToKind, entry: string, direction: 1 | -1 = 1) {
  const targets = goToTargets(editor, kind)
  if (targets.length === 0) {
    return false
  }
  const here = editor.state.selection.from
  // The item the cursor is in: the last one starting at or before it.
  let current = -1
  targets.forEach((target, index) => {
    if (target.pos <= here) {
      current = index
    }
  })
  const text = entry.trim()
  let index: number
  if (kind === "bookmark" && text && !/^[+-]?\d+$/.test(text)) {
    index = targets.findIndex((target) => target.name?.toLowerCase() === text.toLowerCase())
  } else if (/^[+-]\d+$/.test(text)) {
    index = Math.max(0, current) + Number(text)
  } else if (/^\d+$/.test(text)) {
    index = Number(text) - 1
  } else if (direction > 0) {
    index = targets.findIndex((target) => target.pos > here)
  } else {
    index = -1
    targets.forEach((target, at) => {
      if (target.pos < here) {
        index = at
      }
    })
  }
  const target = targets[index]
  if (!target) {
    return false
  }
  const size = editor.state.doc.content.size
  const pos = Math.max(1, Math.min(target.pos, Math.max(1, size - 1)))
  editor.chain().focus().setTextSelection(pos).scrollIntoView().run()
  return true
}
