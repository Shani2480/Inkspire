import { useClipboard } from "@/document/clipboard"
import { currentWordDocument } from "@/document/docx/session"
import { findStyle, wordIdForNamedStyle, type StyleDef } from "@/document/styles"
import { updateBlocks } from "@/editor/block-format"
import { chainWithSelection, restoreSelection } from "@/editor/selection-memory"
import { Extension, type Editor } from "@tiptap/core"
import type { Mark } from "@tiptap/pm/model"
import { Fragment } from "@tiptap/pm/model"
import { Plugin, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

const FORMAT_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "textStyle",
  "highlight",
  "subscript",
  "superscript",
])

const BLOCK_KEYS = [
  "textAlign",
  "lineHeight",
  "namedStyle",
  "shading",
  "border",
  "borderPen",
  "borderShadow",
  "borderSpace",
  "shadingPattern",
  "spaceBefore",
  "spaceAfter",
  "indent",
  "indentRight",
] as const

type Painter = {
  marks: readonly Mark[]
  block: Record<string, unknown> | null
  locked: boolean
}

let painter: Painter | null = null
const painterListeners = new Set<() => void>()

function emitPainter() {
  for (const listener of painterListeners) {
    listener()
  }
}

export function subscribeFormatPainter(listener: () => void) {
  painterListeners.add(listener)
  return () => painterListeners.delete(listener)
}

export function formatPainterActive() {
  return painter !== null
}

export function formatPainterLocked() {
  return painter?.locked ?? false
}

export function clearFormatPainter() {
  if (!painter) {
    return
  }
  painter = null
  emitPainter()
}

export function armFormatPainter(editor: Editor, locked: boolean) {
  if (painter && (!locked || painter.locked)) {
    clearFormatPainter()
    return
  }
  restoreSelection(editor)
  const { state } = editor
  const marks = (state.storedMarks ?? state.selection.$from.marks()).filter((mark) => FORMAT_MARKS.has(mark.type.name))
  const parent = state.selection.$from.parent
  const coversBlock =
    !state.selection.empty &&
    ((state.selection.$from.parentOffset === 0 &&
      state.selection.$to.parentOffset === state.selection.$to.parent.content.size &&
      state.selection.$from.sameParent(state.selection.$to)) ||
      !state.selection.$from.sameParent(state.selection.$to))
  const block = coversBlock ? Object.fromEntries(BLOCK_KEYS.map((key) => [key, parent.attrs[key]])) : null
  painter = { marks, block, locked }
  emitPainter()
}

function applyPainter(view: EditorView) {
  if (!painter) {
    return
  }
  const { from, to, empty } = view.state.selection
  if (empty || from === to) {
    return
  }
  let transaction = view.state.tr.removeMark(from, to)
  for (const mark of painter.marks) {
    transaction = transaction.addMark(from, to, mark)
  }
  if (painter.block) {
    const block = painter.block
    view.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== "paragraph" && node.type.name !== "heading") {
        return
      }
      const current = transaction.doc.nodeAt(pos)
      if (!current) {
        return
      }
      transaction = transaction.setNodeMarkup(pos, undefined, {
        ...current.attrs,
        ...block,
      })
    })
  }
  const locked = painter.locked
  view.dispatch(transaction)
  if (!locked) {
    painter = null
    emitPainter()
  }
}

export const FormatPainter = Extension.create({
  name: "formatPainter",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mouseup(view) {
              if (!painter) {
                return false
              }
              applyPainter(view)
              return false
            },
          },
          handleKeyDown(_view, event) {
            if (event.key === "Escape" && painter) {
              clearFormatPainter()
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})

function rememberSelection(editor: Editor) {
  const { from, to } = editor.state.selection
  const text = editor.state.doc.textBetween(from, to, "\n")
  useClipboard.getState().push({ text, html: "" })
}

export function copySelection(editor: Editor) {
  restoreSelection(editor)
  rememberSelection(editor)
  editor.commands.focus()
  document.execCommand("copy")
}

export function cutSelection(editor: Editor) {
  restoreSelection(editor)
  rememberSelection(editor)
  editor.commands.focus()
  document.execCommand("cut")
}

export async function pasteFromClipboard(editor: Editor, mode: "source" | "merge" | "text") {
  restoreSelection(editor)
  editor.commands.focus()
  try {
    if (mode === "source") {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text()
          chainWithSelection(editor).insertContent(html).run()
          return
        }
      }
    }
    const text = await navigator.clipboard.readText()
    if (!text) {
      return
    }
    if (mode === "text") {
      chainWithSelection(editor)
        .command(({ tr }) => {
          tr.insertText(text)
          return true
        })
        .run()
      return
    }
    chainWithSelection(editor).insertContent(text).run()
  } catch {
    // The browser refused the clipboard read. Leave the document unchanged.
  }
}

export function clearFormatting(editor: Editor) {
  restoreSelection(editor)
  editor.chain().focus().unsetAllMarks().clearNodes().run()
  updateBlocks(editor, {
    namedStyle: null,
    shading: null,
    border: null,
    borderPen: null,
    borderShadow: false,
    borderSpace: null,
    shadingPattern: null,
    spaceBefore: null,
    spaceAfter: null,
    lineHeight: null,
    indent: 0,
    indentRight: 0,
    textAlign: null,
  })
}

export type ParagraphStyle = "normal" | "no-spacing" | "heading-1" | "heading-2" | "title" | "subtitle" | "quote"
export type CharacterStyle = "subtle-emphasis" | "emphasis" | "intense-emphasis" | "strong"

/**
 * Applies a paragraph style: Normal, a heading, or a named style (built in or the user's own), whose look comes
 * from the stylesheet. In an opened Word document the paragraph also shows that Word style, so the document's own
 * definition draws it; saving writes the style's Word id.
 */
export function applyParagraphStyle(editor: Editor, style: ParagraphStyle | (string & {})) {
  restoreSelection(editor)
  if (style === "heading-1" || style === "heading-2") {
    const level = style === "heading-1" ? 1 : 2
    chainWithSelection(editor)
      .setHeading({ level })
      .updateAttributes("heading", { namedStyle: null, lineHeight: null })
      .run()
    return
  }

  const namedStyle = style === "normal" ? null : style
  const compact = style === "no-spacing"
  const wordStyle = currentWordDocument() && namedStyle ? (wordIdForNamedStyle(namedStyle) ?? null) : null
  const aligned = Boolean(findStyle(style)?.paragraph.align)
  chainWithSelection(editor)
    .setParagraph()
    .updateAttributes("paragraph", {
      namedStyle,
      wordStyle,
      lineHeight: compact ? "1" : null,
      spaceBefore: compact ? 0 : null,
      spaceAfter: compact ? 0 : null,
      // A left alignment left over from older files would hide the style's own.
      ...(aligned && editor.getAttributes("paragraph").textAlign === "left" ? { textAlign: null } : {}),
    })
    .run()
}

/**
 * Applies a character style as Word's look of it, set on the text (so it saves as formatting every reader shows),
 * tagged with the style so changing the style can update that text.
 */
export function applyCharacterStyle(editor: Editor, style: CharacterStyle | (string & {})) {
  const def = findStyle(style)
  if (!def) {
    return
  }
  restoreSelection(editor)
  characterChain(chainWithSelection(editor), def).run()
}

type Chain = ReturnType<Editor["chain"]>

function characterChain(chain: Chain, def: StyleDef) {
  const font = def.font
  let next = font.bold ? chain.setBold() : chain.unsetBold()
  next = font.italic ? next.setItalic() : next.unsetItalic()
  next = font.underline ? next.setUnderline() : next.unsetUnderline()
  next = font.color ? next.setColor(font.color) : next.unsetColor()
  next = font.family ? next.setFontFamily(font.family) : next
  next = font.size ? next.setFontSize(`${font.size}pt`) : next
  return next.setMark("textStyle", { charStyle: def.id })
}

/** After a character style changes, the text tagged with it takes its new look. */
export function restampCharacterStyle(editor: Editor, def: StyleDef) {
  const ranges: { from: number; to: number }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === "textStyle" && mark.attrs.charStyle === def.id)) {
      const last = ranges[ranges.length - 1]
      if (last && last.to === pos) {
        last.to = pos + node.nodeSize
      } else {
        ranges.push({ from: pos, to: pos + node.nodeSize })
      }
    }
  })
  if (ranges.length === 0) {
    return
  }
  const selection = editor.state.selection
  let chain = editor.chain()
  for (const range of ranges) {
    chain = characterChain(chain.setTextSelection(range), def)
  }
  chain.setTextSelection({ from: selection.from, to: selection.to }).run()
}

/** Text and paragraphs in a style that is deleted go back to Normal (and plain text). */
export function clearStyleFromDocument(editor: Editor, def: StyleDef) {
  const { tr } = editor.state
  const wordId = def.wordId.toLowerCase()
  editor.state.doc.descendants((node, pos) => {
    // A paragraph opened from Word carries the style as its Word id.
    const inStyle =
      node.attrs.namedStyle === def.id ||
      (typeof node.attrs.wordStyle === "string" && node.attrs.wordStyle.toLowerCase() === wordId)
    if (def.kind === "paragraph" && node.type.name === "paragraph" && inStyle) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, namedStyle: null, wordStyle: null })
    }
    if (def.kind === "character" && node.isText) {
      const mark = node.marks.find((item) => item.type.name === "textStyle" && item.attrs.charStyle === def.id)
      if (mark) {
        tr.removeMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, charStyle: null }))
        tr.addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, charStyle: null }))
      }
    }
  })
  if (tr.docChanged) {
    editor.view.dispatch(tr)
  }
}

function ensureList(editor: Editor, typeName: "bulletList" | "orderedList") {
  const other = typeName === "bulletList" ? "orderedList" : "bulletList"
  let chain = editor.chain().focus()
  if (editor.isActive(other)) {
    chain = typeName === "bulletList" ? chain.toggleOrderedList() : chain.toggleBulletList()
  }
  if (!editor.isActive(typeName)) {
    chain = typeName === "bulletList" ? chain.toggleBulletList() : chain.toggleOrderedList()
  }
  return chain
}

function stampList(
  editor: Editor,
  typeName: "bulletList" | "orderedList",
  marker: string | null,
  scheme: string | null,
) {
  ensureList(editor, typeName)
    .command(({ tr }) => {
      const { from, to } = tr.selection
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name !== typeName) {
          return
        }
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          marker,
          scheme,
        })
      })
      return true
    })
    .run()
}

let lastBulletMarker = "disc"
let lastNumberMarker = "decimal"
let lastMultilevel: "outline" | "legal" | "bullets" = "outline"

export function currentBulletMarker() {
  return lastBulletMarker
}

export function currentNumberMarker() {
  return lastNumberMarker
}

export function currentMultilevel() {
  return lastMultilevel
}

export function applyBullet(editor: Editor, marker: string) {
  lastBulletMarker = marker
  restoreSelection(editor)
  stampList(editor, "bulletList", marker, null)
}

export function applyNumbering(editor: Editor, marker: string) {
  lastNumberMarker = marker
  restoreSelection(editor)
  stampList(editor, "orderedList", marker, null)
}

export function applyMultilevel(editor: Editor, scheme: "outline" | "legal" | "bullets") {
  lastMultilevel = scheme
  restoreSelection(editor)
  if (scheme === "bullets") {
    stampList(editor, "bulletList", null, "bullets")
    return
  }
  stampList(editor, "orderedList", null, scheme)
}

export function clearList(editor: Editor) {
  restoreSelection(editor)
  if (editor.isActive("orderedList")) {
    editor.chain().focus().toggleOrderedList().run()
    return
  }
  if (editor.isActive("bulletList")) {
    editor.chain().focus().toggleBulletList().run()
  }
}

export function readNumberStart(editor: Editor) {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === "orderedList") {
      const start = Number(node.attrs.start)
      return Number.isFinite(start) && start > 0 ? start : 1
    }
  }
  return 1
}

export function setNumberStart(editor: Editor, start: number) {
  restoreSelection(editor)
  const value = Math.max(1, Math.floor(start) || 1)
  if (!editor.isActive("orderedList")) {
    applyNumbering(editor, "decimal")
  }
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const { $from } = tr.selection
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        if ($from.node(depth).type.name === "orderedList") {
          tr.setNodeMarkup($from.before(depth), undefined, { ...$from.node(depth).attrs, start: value })
          return true
        }
      }
      return false
    })
    .run()
}

export function continueNumbering(editor: Editor) {
  restoreSelection(editor)
  if (!editor.isActive("orderedList")) {
    applyNumbering(editor, "decimal")
  }
  const { state } = editor
  const { $from } = state.selection
  let currentPos = -1
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "orderedList") {
      currentPos = $from.before(depth)
      break
    }
  }
  let next = 1
  if (currentPos > 0) {
    state.doc.nodesBetween(0, currentPos, (node) => {
      if (node.type.name !== "orderedList") {
        return
      }
      const start = Number(node.attrs.start) || 1
      let count = 0
      node.forEach((child) => {
        if (child.type.name === "listItem") {
          count += 1
        }
      })
      next = start + count
    })
  }
  setNumberStart(editor, next)
}

export function pasteStored(editor: Editor, item: { text: string; html: string }) {
  restoreSelection(editor)
  if (item.html.trim()) {
    chainWithSelection(editor).insertContent(item.html).run()
    return
  }
  chainWithSelection(editor)
    .command(({ tr }) => {
      tr.insertText(item.text)
      return true
    })
    .run()
}

export function setShading(editor: Editor, color: string | null) {
  restoreSelection(editor)
  updateBlocks(editor, { shading: color })
}

export function setBlockBorder(editor: Editor, next: "bottom" | "top" | "left" | "right" | "all" | "none") {
  restoreSelection(editor)
  updateBlocks(editor, { border: next === "none" ? null : next })
}

export function sortBlocks(editor: Editor, direction: "asc" | "desc") {
  restoreSelection(editor)
  const { state } = editor
  const { from, to } = state.selection
  const $from = state.doc.resolve(from)
  let depth = 0
  for (let level = $from.depth; level > 0; level -= 1) {
    const name = $from.node(level).type.name
    if (name === "bulletList" || name === "orderedList") {
      depth = level
      break
    }
  }
  const parent = $from.node(depth)
  const base = depth === 0 ? 0 : $from.start(depth)
  const selected: { node: (typeof parent)["content"]["firstChild"]; pos: number }[] = []
  parent.forEach((node, offset) => {
    const pos = base + offset
    const end = pos + node.nodeSize
    if (end >= from && pos <= to) {
      selected.push({ node, pos })
    }
  })
  if (selected.length < 2 || selected.some((item) => !item.node)) {
    return
  }
  const sorted = [...selected].sort((left, right) => {
    const order = (left.node?.textContent ?? "").localeCompare(right.node?.textContent ?? "", undefined, {
      sensitivity: "base",
    })
    return direction === "asc" ? order : -order
  })
  const start = selected[0].pos
  const last = selected[selected.length - 1]
  const end = last.pos + (last.node?.nodeSize ?? 0)
  const fragment = Fragment.from(sorted.map((item) => item.node!))
  editor.view.dispatch(state.tr.replaceWith(start, end, fragment))
  editor.commands.focus()
}

export function selectSimilarFormatting(editor: Editor) {
  const { $from } = editor.state.selection
  const parent = $from.parent
  if (!parent.isTextblock) {
    return
  }
  const marks = $from.marks()
  const origin = $from.parentOffset
  const pieces: { from: number; to: number; marks: readonly Mark[] }[] = []
  parent.forEach((node, offset) => {
    if (node.isText) {
      pieces.push({ from: offset, to: offset + node.nodeSize, marks: node.marks })
    }
  })
  const index = pieces.findIndex((piece) => piece.from <= origin && origin <= piece.to)
  if (index < 0 || !sameMarks(pieces[index].marks, marks)) {
    return
  }
  let start = pieces[index].from
  let end = pieces[index].to
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (pieces[cursor].to !== start || !sameMarks(pieces[cursor].marks, marks)) {
      break
    }
    start = pieces[cursor].from
  }
  for (let cursor = index + 1; cursor < pieces.length; cursor += 1) {
    if (pieces[cursor].from !== end || !sameMarks(pieces[cursor].marks, marks)) {
      break
    }
    end = pieces[cursor].to
  }
  const blockStart = $from.start()
  editor
    .chain()
    .focus()
    .setTextSelection({ from: blockStart + start, to: blockStart + end })
    .run()
}

function sameMarks(left: readonly Mark[], right: readonly Mark[]) {
  return left.length === right.length && left.every((mark) => right.some((other) => other.eq(mark)))
}

/**
 * Borders → Horizontal Line: an empty paragraph with a bottom border, below the block the cursor is in (below the
 * whole table when it is in one), and a plain paragraph after it for the text to continue in; it is saved to .docx as
 * the paragraph's `w:pBdr`, as Word's own horizontal line is.
 */
export function insertHorizontalLine(editor: Editor) {
  const { state } = editor
  const at = state.selection.$from.after(1)
  const paragraph = state.schema.nodes.paragraph
  if (!paragraph) {
    return
  }
  const line = paragraph.create({ border: "bottom" })
  const after = paragraph.create()
  const tr = state.tr.insert(at, [line, after])
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + line.nodeSize + 1)))
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
}
