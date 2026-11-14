import type { Editor } from "@tiptap/core"
import type { Mark, Node as ProseNode } from "@tiptap/pm/model"

/**
 * Hyperlinks as Word's Insert Hyperlink dialog makes them: to a web page or file, to a place in this document (a
 * heading or bookmark, `#name`), or to an e-mail address (`mailto:`), with the text to display and a ScreenTip.
 */

export type LinkAtCaret = { from: number; to: number; href: string; title: string; text: string }

/** The link the caret or selection is in, with its whole extent; null when there is none. */
export function linkAtSelection(editor: Editor): LinkAtCaret | null {
  const { state } = editor
  const type = state.schema.marks.link
  if (!type) {
    return null
  }
  const { $from } = state.selection
  const mark =
    $from.marks().find((item) => item.type === type) ??
    $from.nodeAfter?.marks.find((item) => item.type === type) ??
    $from.nodeBefore?.marks.find((item) => item.type === type)
  if (!mark) {
    return null
  }
  // The stretch of this paragraph carrying the same link, around the caret.
  const start = $from.start()
  const stretches: { from: number; to: number }[] = []
  $from.parent.forEach((child, offset) => {
    if (!child.marks.some((item) => item.eq(mark))) {
      return
    }
    const at = start + offset
    const last = stretches[stretches.length - 1]
    if (last && last.to === at) {
      last.to = at + child.nodeSize
    } else {
      stretches.push({ from: at, to: at + child.nodeSize })
    }
  })
  const around = stretches.find((stretch) => stretch.from <= $from.pos && $from.pos <= stretch.to)
  if (!around) {
    return null
  }
  const { from, to } = around
  return {
    from,
    to,
    href: String(mark.attrs.href ?? ""),
    title: String(mark.attrs.title ?? ""),
    text: state.doc.textBetween(from, to, ""),
  }
}

export type Place = { kind: "top" | "heading" | "bookmark"; label: string; level?: number; pos: number; name?: string }

/** The places a link can go in this document: its top, its headings (in order) and its bookmarks (by name). */
export function documentPlaces(doc: ProseNode): Place[] {
  const headings: Place[] = []
  const bookmarks = new Map<string, number>()
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const text = node.textContent.trim()
      if (text) {
        headings.push({ kind: "heading", label: text, level: Number(node.attrs.level) || 1, pos })
      }
    }
    if (node.isText) {
      for (const mark of node.marks) {
        const id = String(mark.attrs.id ?? "")
        if (mark.type.name === "bookmark" && id && !bookmarks.has(id)) {
          bookmarks.set(id, pos)
        }
      }
    }
    return true
  })
  // Word lists the bookmarks it shows by name, leaving out hidden ones (`_Toc…`, `_Ref…`).
  const shown = [...bookmarks]
    .filter(([name]) => !name.startsWith("_"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, pos]): Place => ({ kind: "bookmark", label: name, pos, name }))
  return [{ kind: "top", label: "Top of the Document", pos: 0, name: "_top" }, ...headings, ...shown]
}

function bookmarkOn(node: ProseNode): string | null {
  let name: string | null = null
  node.descendants((child) => {
    const mark = child.marks.find((item: Mark) => item.type.name === "bookmark" && item.attrs.id)
    if (mark && !name) {
      name = String(mark.attrs.id)
    }
    return !name
  })
  return name
}

/**
 * The bookmark a link to a heading points at: the heading's own, or a new hidden one (`_Ref` and a number, as Word
 * names the bookmarks it adds) put on the heading's text.
 */
export function headingTarget(editor: Editor, headingPos: number) {
  const heading = editor.state.doc.nodeAt(headingPos)
  const mark = editor.schema.marks.bookmark
  if (!heading || !mark) {
    return null
  }
  const existing = bookmarkOn(heading)
  if (existing) {
    return existing
  }
  const taken = new Set<string>()
  editor.state.doc.descendants((node) => {
    for (const item of node.marks) {
      if (item.type === mark) {
        taken.add(String(item.attrs.id))
      }
    }
  })
  const fresh = () => `_Ref${Math.floor(100000000 + Math.random() * 899999999)}`
  let name = fresh()
  while (taken.has(name)) {
    name = fresh()
  }
  const from = headingPos + 1
  const to = headingPos + heading.nodeSize - 1
  editor.view.dispatch(editor.state.tr.addMark(from, to, mark.create({ id: name })))
  return name
}

/** A `mailto:` address with its subject, as Word writes it. */
export function mailtoHref(address: string, subject: string) {
  const to = address.trim().replace(/^mailto:/i, "")
  return subject.trim() ? `mailto:${to}?subject=${encodeURIComponent(subject.trim())}` : `mailto:${to}`
}

/** A `mailto:` link's address and subject. */
export function parseMailto(href: string) {
  const [address = "", query = ""] = href.replace(/^mailto:/i, "").split("?")
  const subject = new URLSearchParams(query).get("subject") ?? ""
  return { address: decodeURIComponent(address), subject }
}

/** An address typed without a scheme gets one, as Word adds http:// to "www.example.com". */
export function normalizeAddress(address: string) {
  const value = address.trim()
  if (!value || value.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/")) {
    return value
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `mailto:${value}`
  }
  const host = value.split("/")[0] ?? ""
  const extension = /\.([a-z0-9]+)$/i.exec(host)?.[1]?.toLowerCase() ?? ""
  if (FILE_EXTENSIONS.has(extension) && !/^www\./i.test(value)) {
    return value
  }
  return /^www\.|^[\w-]+(\.[\w-]+)+(\/|$)/i.test(value) ? `http://${value}` : value
}

/** Endings that make "name.ext" a file beside the document rather than a web address. */
const FILE_EXTENSIONS = new Set(
  "doc docx docm dot dotx pdf rtf odt txt md csv xls xlsx ppt pptx png jpg jpeg gif svg htm html zip".split(" "),
)

/**
 * Puts the link in: over `range` (the selection, or the link being edited) with `text` as what it shows. Text that
 * is unchanged keeps its formatting; new text takes the formatting at its start.
 */
export function applyLink(
  editor: Editor,
  range: { from: number; to: number },
  link: { href: string; title: string; text: string },
) {
  const type = editor.schema.marks.link
  if (!type || !link.href) {
    return false
  }
  const attrs = { href: link.href, title: link.title.trim() || null }
  const tr = editor.state.tr
  const current = editor.state.doc.textBetween(range.from, range.to, "")
  let to = range.to
  if (link.text && link.text !== current) {
    const marks = editor.state.doc
      .resolve(range.from + (range.to > range.from ? 1 : 0))
      .marks()
      .filter((mark) => mark.type !== type)
    tr.replaceWith(range.from, range.to, editor.schema.text(link.text, marks))
    to = range.from + link.text.length
  } else if (range.from === range.to) {
    const text = link.text || link.href
    tr.insertText(text, range.from)
    to = range.from + text.length
  }
  tr.removeMark(range.from, to, type)
  tr.addMark(range.from, to, type.create(attrs))
  editor.view.dispatch(tr)
  editor.commands.focus()
  return true
}

/** Takes the link off its text, keeping the text. */
export function removeLink(editor: Editor) {
  const link = linkAtSelection(editor)
  const type = editor.schema.marks.link
  if (!type) {
    return false
  }
  const { from, to } = link ?? editor.state.selection
  editor.view.dispatch(editor.state.tr.removeMark(from, to, type))
  return true
}
