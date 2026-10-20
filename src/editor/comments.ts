import { formatDay } from "@/document/user-settings"
import type { Editor } from "@tiptap/core"
import { Mark } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { ignoreTracking } from "@/editor/track-changes"
import { useReviewStore } from "@/document/review"

export type CommentReply = {
  id: string
  author: string
  text: string
  created: string
}

export type CommentRecord = {
  id: string
  author: string
  text: string
  created: string
  resolved: boolean
  from: number
  to: number
  excerpt: string
  spans: { from: number; to: number }[]
  replies: CommentReply[]
}

function decodeComment(value: string | null) {
  if (!value) {
    return ""
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return ""
  }
}

function parseReplies(value: string | null): CommentReply[] {
  if (!value) {
    return []
  }
  try {
    const parsed = JSON.parse(decodeComment(value)) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is CommentReply => Boolean(item && typeof item === "object"))
      .map((item) => ({
        id: String((item as CommentReply).id || crypto.randomUUID()),
        author: String((item as CommentReply).author || "Me"),
        text: String((item as CommentReply).text ?? ""),
        created: String((item as CommentReply).created ?? ""),
      }))
  } catch {
    return []
  }
}

function encodeReplies(replies: CommentReply[]) {
  return encodeURIComponent(JSON.stringify(replies))
}

export function relativeCommentTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  const delta = Date.now() - date.getTime()
  if (delta < 45_000) {
    return "A few seconds ago"
  }
  if (delta < 3_600_000) {
    return `${Math.max(1, Math.floor(delta / 60_000))}m ago`
  }
  if (delta < 86_400_000) {
    return `${Math.max(1, Math.floor(delta / 3_600_000))}h ago`
  }
  if (delta < 604_800_000) {
    return `${Math.max(1, Math.floor(delta / 86_400_000))}d ago`
  }
  return formatDay(date)
}

export function authorInitials(author: string) {
  const parts = author.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return "M"
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

export const Comment = Mark.create({
  name: "comment",
  inclusive: false,
  keepOnSplit: false,
  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-comment-id") ?? "",
        renderHTML: (attributes) => ({ "data-comment-id": attributes.id }),
      },
      author: {
        default: "Me",
        parseHTML: (element) => element.getAttribute("data-author") || "Me",
        renderHTML: (attributes) => ({ "data-author": attributes.author || "Me" }),
      },
      text: {
        default: "",
        parseHTML: (element) => decodeComment(element.getAttribute("data-comment")),
        renderHTML: (attributes) => ({ "data-comment": encodeURIComponent(attributes.text ?? "") }),
      },
      created: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-time") ?? "",
        renderHTML: (attributes) => ({ "data-time": attributes.created }),
      },
      resolved: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-resolved") === "true",
        renderHTML: (attributes) => ({ "data-resolved": attributes.resolved ? "true" : "false" }),
      },
      replies: {
        default: "[]",
        parseHTML: (element) => element.getAttribute("data-replies") ?? "[]",
        renderHTML: (attributes) => ({
          "data-replies":
            typeof attributes.replies === "string"
              ? attributes.replies
              : encodeReplies(Array.isArray(attributes.replies) ? attributes.replies : []),
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, class: "comment-mark" }, 0]
  },
})

function repliesFromAttrs(value: unknown): CommentReply[] {
  if (typeof value === "string") {
    return parseReplies(value)
  }
  if (Array.isArray(value)) {
    return value as CommentReply[]
  }
  return []
}

export function listComments(doc: ProseNode) {
  const ranges: CommentRecord[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return
    }
    const mark = node.marks.find((item) => item.type.name === "comment")
    if (!mark || !mark.attrs.id) {
      return
    }
    const end = pos + node.nodeSize
    const existing = ranges.find((item) => item.id === mark.attrs.id)
    if (existing) {
      const last = existing.spans[existing.spans.length - 1]
      if (last && last.to === pos) {
        last.to = end
      } else {
        existing.spans.push({ from: pos, to: end })
      }
      existing.from = existing.spans[0].from
      existing.to = existing.spans[existing.spans.length - 1].to
      return
    }
    ranges.push({
      id: String(mark.attrs.id),
      author: String(mark.attrs.author || "Me"),
      text: String(mark.attrs.text ?? ""),
      created: String(mark.attrs.created ?? ""),
      resolved: mark.attrs.resolved === true,
      from: pos,
      to: end,
      excerpt: "",
      spans: [{ from: pos, to: end }],
      replies: repliesFromAttrs(mark.attrs.replies),
    })
  })
  return ranges.map((range) => ({
    ...range,
    excerpt: range.spans
      .map((span) => doc.textBetween(span.from, span.to, " "))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  }))
}

function rewriteComment(
  editor: Editor,
  id: string,
  next: Partial<Pick<CommentRecord, "text" | "resolved" | "replies" | "author">>,
) {
  const range = listComments(editor.state.doc).find((item) => item.id === id)
  const comment = editor.schema.marks.comment
  if (!range || !comment) {
    return false
  }
  const mark = comment.create({
    id: range.id,
    author: next.author ?? range.author,
    text: next.text ?? range.text,
    created: range.created,
    resolved: next.resolved ?? range.resolved,
    replies: encodeReplies(next.replies ?? range.replies),
  })
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      ignoreTracking(tr)
      for (const span of range.spans) {
        tr.removeMark(span.from, span.to, comment)
        tr.addMark(span.from, span.to, mark)
      }
      return true
    })
    .run()
}

/** Word-like: selection if present, otherwise the word (or line) at the caret. */
export function resolveCommentRange(doc: ProseNode, from: number, to: number): { from: number; to: number } | null {
  if (from !== to) {
    const selected = doc.textBetween(from, to, " ").trim()
    if (selected) {
      return { from, to }
    }
  }
  return wordOrLineRange(doc, from)
}

function isWordChar(ch: string) {
  return /[\p{L}\p{N}_]/u.test(ch)
}

function wordOrLineRange(doc: ProseNode, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(Math.max(1, Math.min(pos, doc.content.size)))
  if (!$pos.parent.isTextblock) {
    return null
  }
  const start = $pos.start()
  const end = $pos.end()
  if (start >= end) {
    return null
  }
  const text = doc.textBetween(start, end, "\n", "\n")
  if (!text.trim()) {
    return null
  }
  let offset = Math.min(Math.max(0, pos - start), text.length)

  // Prefer the word under/left of the caret (Word behavior).
  if (offset > 0 && (offset >= text.length || !isWordChar(text[offset] ?? ""))) {
    offset -= 1
  }

  if (!isWordChar(text[offset] ?? "")) {
    let next = offset
    while (next < text.length && !isWordChar(text[next] ?? "")) {
      next += 1
    }
    if (next < text.length) {
      offset = next
    } else {
      let prev = offset
      while (prev > 0 && !isWordChar(text[prev - 1] ?? "")) {
        prev -= 1
      }
      if (prev > 0 && isWordChar(text[prev - 1] ?? "")) {
        offset = prev - 1
      } else {
        // No word on the line — anchor the whole non-empty textblock (line/paragraph).
        return { from: start, to: end }
      }
    }
  }

  let left = offset
  let right = offset + 1
  while (left > 0 && isWordChar(text[left - 1] ?? "")) {
    left -= 1
  }
  while (right < text.length && isWordChar(text[right] ?? "")) {
    right += 1
  }
  return { from: start + left, to: start + right }
}

export function addComment(editor: Editor, text: string) {
  const body = text.trim().slice(0, 2_000)
  if (!body) {
    return false
  }
  const comment = editor.schema.marks.comment
  if (!comment) {
    return false
  }
  const selection = editor.state.selection
  const range = resolveCommentRange(editor.state.doc, selection.from, selection.to)
  const id = crypto.randomUUID()
  const attrs = {
    id,
    author: "Me",
    text: body,
    created: new Date().toISOString(),
    resolved: false,
    replies: "[]",
  }
  const applied = editor
    .chain()
    .focus()
    .command(({ tr }) => {
      ignoreTracking(tr)
      let from = range?.from ?? selection.from
      let to = range?.to ?? selection.to
      // Empty line: insert a zero-width anchor so the margin marker has a position (Word-like).
      if (!range) {
        const insertAt = selection.from
        tr.insertText("\u200b", insertAt)
        from = insertAt
        to = insertAt + 1
      }
      tr.addMark(from, to, comment.create(attrs))
      return true
    })
    .run()
  if (applied) {
    useReviewStore.getState().focusComment(id, { openPopover: true })
  }
  return applied
}

export function updateComment(editor: Editor, id: string, resolved: boolean) {
  return rewriteComment(editor, id, { resolved })
}

export function editCommentText(editor: Editor, id: string, text: string) {
  const body = text.trim().slice(0, 2_000)
  if (!body) {
    return false
  }
  return rewriteComment(editor, id, { text: body })
}

export function addCommentReply(editor: Editor, id: string, text: string) {
  const body = text.trim().slice(0, 2_000)
  if (!body) {
    return false
  }
  const range = listComments(editor.state.doc).find((item) => item.id === id)
  if (!range) {
    return false
  }
  const reply: CommentReply = {
    id: crypto.randomUUID(),
    author: "Me",
    text: body,
    created: new Date().toISOString(),
  }
  return rewriteComment(editor, id, { replies: [...range.replies, reply] })
}

export function deleteComment(editor: Editor, id: string) {
  const range = listComments(editor.state.doc).find((item) => item.id === id)
  const comment = editor.schema.marks.comment
  if (!range || !comment) {
    return false
  }
  const cleared = editor
    .chain()
    .focus()
    .command(({ tr }) => {
      ignoreTracking(tr)
      for (const span of range.spans) {
        tr.removeMark(span.from, span.to, comment)
      }
      return true
    })
    .run()
  if (cleared) {
    const review = useReviewStore.getState()
    if (review.activeCommentId === id || review.popoverCommentId === id) {
      review.clearCommentFocus()
    }
  }
  return cleared
}

export function selectComment(editor: Editor, id: string) {
  const range = listComments(editor.state.doc).find((item) => item.id === id)
  const span = range?.spans[0]
  if (!span) {
    return false
  }
  return editor.chain().focus().setTextSelection({ from: span.from, to: span.to }).scrollIntoView().run()
}
