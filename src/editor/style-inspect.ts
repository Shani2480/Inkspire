import type { Editor } from "@tiptap/core"
import type { Mark } from "@tiptap/pm/model"
import { BUILT_IN_STYLES, findStyle, useStyleStore, type StyleDef } from "@/document/styles"
import type { PageSetup } from "@/document/page-setup"
import { INDENT_STEP_PX } from "@/editor/indent"

/**
 * What Word's Style Inspector and Reveal Formatting show for the selection: the paragraph and character style, the
 * direct formatting on top of each ("Plus: Bold, Centered"), and the selection's whole look, section by section.
 * Lengths read in the units Word shows: points for fonts and spacing, centimetres for indents and margins.
 */

const PX_PER_CM = 96 / 2.54

/** The paragraph style at the caret: its id in the style list ("normal", "heading-1", a user style…). */
export function paragraphStyleAt(editor: Editor) {
  const { $from } = editor.state.selection
  const block = $from.parent
  if (block.type.name === "heading") {
    return `heading-${Number(block.attrs.level) || 1}`
  }
  const named = block.attrs.namedStyle
  return typeof named === "string" && named ? named : "normal"
}

/** A style's name, also for heading levels the style list does not hold (Heading 3…6). */
export function styleName(id: string) {
  const known = findStyle(id) ?? BUILT_IN_STYLES.find((style) => style.id === id)
  if (known) {
    return known.name
  }
  const heading = /^heading-(\d)$/.exec(id)
  return heading ? `Heading ${heading[1]}` : id
}

function marksAt(editor: Editor): readonly Mark[] {
  const { selection, storedMarks } = editor.state
  if (storedMarks) {
    return storedMarks
  }
  if (selection.empty) {
    return selection.$from.marks()
  }
  // The selection's first character, as Word reports the start of a selection.
  let found: readonly Mark[] | null = null
  editor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!found && node.isText) {
      found = node.marks
    }
    return !found
  })
  return found ?? selection.$from.marks()
}

/** The character style on the selection, or null for Default Paragraph Font. */
export function characterStyleAt(editor: Editor): StyleDef | null {
  const id = marksAt(editor).find((mark) => mark.type.name === "textStyle")?.attrs.charStyle
  return typeof id === "string" && id ? (findStyle(id) ?? null) : null
}

function firstFamily(stack: string) {
  return (stack.split(",")[0] ?? "").replace(/["']/g, "").trim()
}

function points(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null
}

function cm(value: number) {
  return `${Math.round(value * 100) / 100} cm`
}

/** The font the selection has: what its style gives, with the direct formatting on top. */
export type FontFacts = {
  family: string | null
  size: number | null
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  superscript: boolean
  subscript: boolean
  color: string | null
  highlight: string | null
}

function fontFacts(marks: readonly Mark[]): FontFacts {
  const has = (name: string) => marks.some((mark) => mark.type.name === name)
  const text = marks.find((mark) => mark.type.name === "textStyle")?.attrs ?? {}
  const highlight = marks.find((mark) => mark.type.name === "highlight")?.attrs.color
  return {
    family: typeof text.fontFamily === "string" && text.fontFamily ? firstFamily(text.fontFamily) : null,
    size: points(text.fontSize),
    bold: has("bold"),
    italic: has("italic"),
    underline: has("underline"),
    strike: has("strike"),
    superscript: has("superscript"),
    subscript: has("subscript"),
    color: typeof text.color === "string" && text.color ? text.color : null,
    highlight: has("highlight") ? (typeof highlight === "string" && highlight ? highlight : "yellow") : null,
  }
}

/** Direct character formatting: the run's formatting that its character style (if any) does not give it. */
export function directCharacterFormatting(editor: Editor) {
  const facts = fontFacts(marksAt(editor))
  const style = characterStyleAt(editor)?.font ?? {}
  const parts: string[] = []
  if (facts.family && facts.family !== style.family) {
    parts.push(`Font: ${facts.family}`)
  }
  if (facts.size !== null && facts.size !== style.size) {
    parts.push(`${facts.size} pt`)
  }
  if (facts.bold && !style.bold) {
    parts.push("Bold")
  }
  if (facts.italic && !style.italic) {
    parts.push("Italic")
  }
  if (facts.underline && !style.underline) {
    parts.push("Underline")
  }
  if (facts.strike) {
    parts.push("Strikethrough")
  }
  if (facts.superscript) {
    parts.push("Superscript")
  }
  if (facts.subscript) {
    parts.push("Subscript")
  }
  if (facts.color && facts.color.toLowerCase() !== (style.color ?? "").toLowerCase()) {
    parts.push(`Font color: ${facts.color}`)
  }
  if (facts.highlight) {
    parts.push(`Highlight: ${facts.highlight}`)
  }
  return parts
}

const ALIGN_NAMES: Record<string, string> = { center: "Centered", right: "Right", justify: "Justified", left: "Left" }

/** Direct paragraph formatting: what the paragraph sets itself, on top of its style. */
export function directParagraphFormatting(editor: Editor) {
  const attrs = editor.state.selection.$from.parent.attrs
  const style = findStyle(paragraphStyleAt(editor))?.paragraph ?? {}
  const parts: string[] = []
  if (typeof attrs.textAlign === "string" && attrs.textAlign && attrs.textAlign !== (style.align ?? "left")) {
    parts.push(ALIGN_NAMES[attrs.textAlign] ?? attrs.textAlign)
  }
  const left = Number(attrs.indent) || 0
  if (left > 0) {
    parts.push(`Indent: Left ${cm((left * INDENT_STEP_PX) / PX_PER_CM)}`)
  }
  const right = Number(attrs.indentRight) || 0
  if (right > 0) {
    parts.push(`Right ${cm(right / 10)}`)
  }
  const [kind, amount] = String(attrs.specialIndent ?? "").split(":")
  if ((kind === "first" || kind === "hanging") && Number(amount) > 0) {
    parts.push(`${kind === "first" ? "First line" : "Hanging"}: ${cm(Number(amount))}`)
  }
  const before = points(attrs.spaceBefore)
  if (before !== null) {
    parts.push(`Space Before: ${before} pt`)
  }
  const after = points(attrs.spaceAfter)
  if (after !== null) {
    parts.push(`After: ${after} pt`)
  }
  if (attrs.lineHeight !== null && attrs.lineHeight !== undefined && attrs.lineHeight !== "") {
    parts.push(lineSpacingText(String(attrs.lineHeight), String(attrs.lineRule ?? "multiple")))
  }
  if (attrs.shading) {
    parts.push(`Pattern: Clear (${attrs.shading})`)
  }
  if (attrs.border) {
    parts.push("Border")
  }
  return parts
}

function lineSpacingText(value: string, rule: string) {
  const number = Number.parseFloat(value)
  if (rule === "exact") {
    return `Line spacing: Exactly ${number} pt`
  }
  if (rule === "at-least") {
    return `Line spacing: At least ${number} pt`
  }
  if (number === 1) {
    return "Line spacing: single"
  }
  if (number === 1.5) {
    return "Line spacing: 1.5 lines"
  }
  if (number === 2) {
    return "Line spacing: Double"
  }
  return `Line spacing: Multiple ${number} li`
}

/** The Style Inspector's four lines. */
export function inspectStyles(editor: Editor) {
  const paragraphId = paragraphStyleAt(editor)
  const character = characterStyleAt(editor)
  return {
    paragraphStyle: styleName(paragraphId),
    paragraphPlus: directParagraphFormatting(editor),
    characterStyle: character?.name ?? "Default Paragraph Font",
    characterPlus: directCharacterFormatting(editor),
  }
}

/** Style Inspector's Clear Paragraph Formatting: the paragraph keeps its style and drops what it set itself. */
export function clearParagraphFormatting(editor: Editor) {
  const { from, to } = editor.state.selection
  const tr = editor.state.tr
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    const reset: Record<string, unknown> = {}
    for (const [name, value] of Object.entries({
      textAlign: null,
      indent: 0,
      indentRight: 0,
      specialIndent: "",
      spaceBefore: null,
      spaceAfter: null,
      lineHeight: null,
      lineRule: "multiple",
      shading: null,
      shadingPattern: null,
      border: null,
      borderPen: null,
      borderSides: null,
    })) {
      if (name in node.attrs) {
        reset[name] = value
      }
    }
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...reset })
    return false
  })
  if (tr.docChanged) {
    editor.view.dispatch(tr)
  }
  return true
}

/** Style Inspector's Clear Character Formatting (Word's Ctrl+Space): the text goes back to its paragraph style. */
export function clearCharacterFormatting(editor: Editor) {
  return editor.chain().focus().unsetAllMarks().run()
}

// --- Reveal Formatting -------------------------------------------------------------------------------------------

export type RevealSection = { title: string; rows: { label: string; value: string }[] }

/** Reveal Formatting (Shift+F1): the selection's Font, Paragraph and Section, each value as Word lists it. */
export function revealFormatting(editor: Editor, setup?: PageSetup | null): RevealSection[] {
  const paragraphId = paragraphStyleAt(editor)
  const paragraphStyle = findStyle(paragraphId) ?? findStyle("normal")
  const character = characterStyleAt(editor)
  const facts = fontFacts(marksAt(editor))
  const base = { ...paragraphStyle?.font, ...character?.font }
  const effects = [
    facts.bold || base.bold ? "Bold" : "",
    facts.italic || base.italic ? "Italic" : "",
    facts.underline || base.underline ? "Underline" : "",
    facts.strike ? "Strikethrough" : "",
    facts.superscript ? "Superscript" : "",
    facts.subscript ? "Subscript" : "",
  ].filter(Boolean)
  const font: RevealSection = {
    title: "Font",
    rows: [
      { label: "Font", value: facts.family ?? base.family ?? "(Default) +Body" },
      { label: "Size", value: `${facts.size ?? base.size ?? 12} pt` },
      ...(effects.length ? [{ label: "Effects", value: effects.join(", ") }] : []),
      { label: "Font color", value: facts.color ?? base.color ?? "Automatic" },
      ...(facts.highlight ? [{ label: "Highlight", value: facts.highlight }] : []),
      { label: "Character style", value: character?.name ?? "Default Paragraph Font" },
    ],
  }
  const attrs = editor.state.selection.$from.parent.attrs
  const para = paragraphStyle?.paragraph ?? {}
  const align = (typeof attrs.textAlign === "string" && attrs.textAlign) || para.align || "left"
  const left = (Number(attrs.indent) || 0) * INDENT_STEP_PX
  const [special, amount] = String(attrs.specialIndent ?? "").split(":")
  const before = points(attrs.spaceBefore) ?? para.before ?? 0
  const after = points(attrs.spaceAfter) ?? para.after ?? 0
  const line =
    attrs.lineHeight !== null && attrs.lineHeight !== undefined && attrs.lineHeight !== ""
      ? lineSpacingText(String(attrs.lineHeight), String(attrs.lineRule ?? "multiple"))
      : lineSpacingText(String(para.line ?? 1), "multiple")
  const paragraph: RevealSection = {
    title: "Paragraph",
    rows: [
      { label: "Paragraph style", value: styleName(paragraphId) },
      { label: "Alignment", value: ALIGN_NAMES[align] ?? align },
      {
        label: "Indentation",
        value: [
          `Left: ${cm(left / PX_PER_CM + (para.indent ?? 0))}`,
          `Right: ${cm((Number(attrs.indentRight) || 0) / 10)}`,
          ...((special === "first" || special === "hanging") && Number(amount) > 0
            ? [`${special === "first" ? "First line" : "Hanging"}: ${cm(Number(amount))}`]
            : []),
        ].join(", "),
      },
      {
        label: "Spacing",
        value: `Before: ${before} pt, After: ${after} pt, ${line.replace("Line spacing: ", "Line: ")}`,
      },
    ],
  }
  const sections = [font, paragraph]
  if (setup) {
    sections.push({
      title: "Section",
      rows: [
        {
          label: "Margins",
          value: `Left: ${cm(setup.marginLeft / 10)}, Right: ${cm(setup.marginRight / 10)}, Top: ${cm(setup.marginTop / 10)}, Bottom: ${cm(setup.marginBottom / 10)}`,
        },
        { label: "Orientation", value: setup.orientation === "landscape" ? "Landscape" : "Portrait" },
        { label: "Paper size", value: setup.paper === "a4" ? "A4" : setup.paper === "legal" ? "Legal" : "Letter" },
      ],
    })
  }
  return sections
}

/** The styles the pane lists: shown ones, paragraph styles first in the list's own order, then character styles. */
export function paneStyles(styles: StyleDef[] = useStyleStore.getState().styles, all = false) {
  const shown = styles.filter((style) => all || !style.hidden)
  return [
    ...shown.filter((style) => style.kind === "paragraph"),
    ...shown.filter((style) => style.kind === "character"),
  ]
}

// --- applying from the Styles pane -------------------------------------------------------------------------------

/** Word's built-in paragraph styles that are linked (¶a): applied to part of a paragraph they act as character styles. */
export const LINKED_STYLES = new Set(["heading-1", "heading-2", "title", "subtitle", "quote"])

/** Whether the selection is part of one paragraph's text, not all of it (where a linked style formats only the text). */
function partOfParagraph(editor: Editor) {
  const { $from, $to, empty } = editor.state.selection
  if (empty || $from.parent !== $to.parent || !$from.parent.isTextblock) {
    return false
  }
  return $from.parentOffset > 0 || $to.parentOffset < $from.parent.content.size
}

/**
 * Applies a style as the Styles pane does: a character style to the text; a paragraph style to the paragraphs, except
 * a linked one on part of a paragraph, which formats just that text, unless Disable Linked Styles is on.
 */
export function applyStyleFromPane(
  editor: Editor,
  style: StyleDef,
  disableLinked: boolean,
  apply: { paragraph: (id: string) => void; character: (id: string) => void },
) {
  if (style.kind === "character") {
    apply.character(style.id)
    return "character"
  }
  if (LINKED_STYLES.has(style.id) && !disableLinked && partOfParagraph(editor)) {
    const font = style.font
    let chain = editor.chain().focus()
    chain = font.bold ? chain.setBold() : chain
    chain = font.italic ? chain.setItalic() : chain
    chain = font.underline ? chain.setUnderline() : chain
    chain = font.color ? chain.setColor(font.color) : chain
    chain = font.family ? chain.setFontFamily(font.family) : chain
    chain = font.size ? chain.setFontSize(`${font.size}pt`) : chain
    chain.run()
    return "linked"
  }
  apply.paragraph(style.id)
  return "paragraph"
}
