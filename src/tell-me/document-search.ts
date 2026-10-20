import type { Editor } from "@tiptap/core"
import { listComments } from "@/editor/comments"
import { findTextRanges } from "@/editor/find"
import { flashDocumentRange } from "@/tell-me/flash"
import type { TellMeScopes } from "@/tell-me/settings"

export type DocumentSearchSource = "text" | "comment" | "bookmark"

export type DocumentSearchHit = {
  id: string
  from: number
  to: number
  snippet: string
  matchStart: number
  matchEnd: number
  location: string
  source: DocumentSearchSource
}

const RESULT_LIMIT = 16
const CONTEXT = 42

export function searchDocumentText(
  editor: Editor | null,
  query: string,
  scopes: Pick<TellMeScopes, "text" | "comments" | "bookmarks"> = {
    text: true,
    comments: true,
    bookmarks: true,
  },
): DocumentSearchHit[] {
  const trimmed = query.trim()
  if (!editor || !trimmed) {
    return []
  }

  const needle = trimmed.toLocaleLowerCase()
  const hits: DocumentSearchHit[] = []

  if (scopes.text) {
    const ranges = findTextRanges(editor, trimmed, false)
    for (const [index, range] of ranges.entries()) {
      if (hits.length >= RESULT_LIMIT) {
        break
      }
      hits.push(hitFromRange(editor, range.from, range.to, trimmed, `doc-${index}-${range.from}`, "text"))
    }
  }

  if (scopes.comments) {
    for (const comment of listComments(editor.state.doc)) {
      if (hits.length >= RESULT_LIMIT) {
        break
      }
      const haystack = `${comment.text} ${comment.replies.map((reply) => reply.text).join(" ")}`.toLocaleLowerCase()
      const found = haystack.indexOf(needle)
      if (found < 0) {
        continue
      }
      const snippet = (comment.text || comment.excerpt || "Comment").replace(/\s+/g, " ")
      const matchStart = Math.max(0, snippet.toLocaleLowerCase().indexOf(needle))
      hits.push({
        id: `comment-${comment.id}`,
        from: comment.from,
        to: comment.to,
        snippet,
        matchStart: matchStart < 0 ? 0 : matchStart,
        matchEnd: matchStart < 0 ? 0 : matchStart + trimmed.length,
        location: "Comment",
        source: "comment",
      })
    }
  }

  if (scopes.bookmarks) {
    for (const bookmark of listBookmarkHits(editor, needle)) {
      if (hits.length >= RESULT_LIMIT) {
        break
      }
      hits.push(bookmark)
    }
  }

  return hits
}

function listBookmarkHits(editor: Editor, needle: string): DocumentSearchHit[] {
  const hits: DocumentSearchHit[] = []
  const seen = new Set<string>()
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return
    }
    for (const mark of node.marks) {
      if (mark.type.name !== "bookmark" || !mark.attrs.id) {
        continue
      }
      const id = String(mark.attrs.id)
      if (seen.has(id)) {
        continue
      }
      const name = id
      if (!name.toLocaleLowerCase().includes(needle)) {
        continue
      }
      seen.add(id)
      const matchStart = Math.max(0, name.toLocaleLowerCase().indexOf(needle))
      hits.push({
        id: `bookmark-${id}`,
        from: pos,
        to: pos + Math.max(1, node.nodeSize),
        snippet: name,
        matchStart,
        matchEnd: matchStart + needle.length,
        location: "Bookmark",
        source: "bookmark",
      })
    }
  })
  return hits
}

function hitFromRange(
  editor: Editor,
  from: number,
  to: number,
  trimmed: string,
  id: string,
  source: DocumentSearchSource,
): DocumentSearchHit {
  const block = blockTextAround(editor, from)
  const local = Math.max(0, from - block.from)
  const start = Math.max(0, local - CONTEXT)
  const end = Math.min(block.text.length, local + trimmed.length + CONTEXT)
  const prefix = start > 0 ? "…" : ""
  const suffix = end < block.text.length ? "…" : ""
  const slice = block.text.slice(start, end)
  const matchStart = local - start + prefix.length
  return {
    id,
    from,
    to,
    snippet: `${prefix}${slice}${suffix}`.replace(/\s+/g, " "),
    matchStart,
    matchEnd: matchStart + trimmed.length,
    location: locationForPos(editor, from),
    source,
  }
}

export function jumpToDocumentHit(editor: Editor, hit: DocumentSearchHit) {
  editor.chain().focus().setTextSelection({ from: hit.from, to: hit.to }).scrollIntoView().run()
  flashDocumentRange(editor, hit.from, hit.to)
}

function blockTextAround(editor: Editor, pos: number) {
  const $pos = editor.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.isTextblock) {
      const from = $pos.before(depth) + 1
      return { from, text: node.textContent }
    }
  }
  return { from: pos, text: editor.state.doc.textBetween(Math.max(0, pos - CONTEXT), pos + CONTEXT, " ") }
}

function locationForPos(editor: Editor, pos: number) {
  const $pos = editor.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.type.name === "heading") {
      return `Heading ${node.attrs.level ?? 1}`
    }
  }

  const breaks = (editor.storage.pagination?.breaks as number[] | undefined) ?? []
  let page = 1
  for (const breakPos of breaks) {
    if (breakPos <= pos) {
      page += 1
    }
  }
  return `Page ${page}`
}
