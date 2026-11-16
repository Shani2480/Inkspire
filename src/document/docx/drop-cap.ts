import type { Paragraph, Run, RunProperties } from "@/document/docx/model"
import { paragraphText } from "@/document/docx/model"
import { dropCapLines } from "@/editor/block-format"

/**
 * Word keeps a drop cap as a paragraph of its own, framed (w:framePr w:dropCap) and holding the large letter, before
 * the paragraph it starts. The editor keeps it on that paragraph instead (`dropCap` and its lines, distance and
 * font), with the letter as the paragraph's first, so it types, wraps and moves with its text. Opening joins the two;
 * saving splits them again as Word writes them.
 */

/** Word's own numbers for a 3-line drop cap on 11 pt text: the letter's size, its exact line and its drop. */
const WORD_SIZE = 164
const WORD_LINE = 1373
const WORD_POSITION = -14
const WORD_BODY = 22

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** The letter(s) a Word drop-cap frame holds, and the font they are in. */
export function dropCapOf(frame: Paragraph) {
  const letter = paragraphText(frame, false).trim()
  if (!frame.pPr.dropCap || !letter) {
    return null
  }
  const run = frame.inlines.find((inline): inline is Run => inline.kind === "run")
  const font = run?.rPr.rFonts?.ascii ?? run?.rPr.rFonts?.hAnsi ?? frame.markRPr.rFonts?.ascii ?? ""
  return { letter, font, ...frame.pPr.dropCap }
}

/** The paragraph's HTML with the frame's letter at its start, marked as its drop cap. */
export function withDropCap(html: string, frame: Paragraph) {
  const cap = dropCapOf(frame)
  if (!cap) {
    return html
  }
  const attrs = [
    ` data-drop-cap="${cap.kind === "margin" ? "margin" : "dropped"}"`,
    ` data-drop-lines="${dropCapLines(cap.lines)}"`,
    cap.hSpace ? ` data-drop-distance="${Math.round((cap.hSpace / 20) * 10) / 10}"` : "",
    cap.font ? ` data-drop-font="${escapeHtml(cap.font)}"` : "",
  ].join("")
  return html.replace(/<(p|h[1-6])\b([^>]*)>/, (_match, tag: string, rest: string) => {
    return `<${tag}${rest}${attrs}>${escapeHtml(cap.letter)}`
  })
}

/**
 * The frame paragraph Word keeps a drop cap in, taking the first letter off `paragraph` (from the editor's
 * paragraph with `dropCap`). Sized as Word sizes it: its 3-line numbers scaled by the lines and the text's size.
 */
export function splitDropCap(paragraph: Paragraph, attrs: Record<string, unknown> | undefined): Paragraph | null {
  const kind = attrs?.dropCap === "margin" ? "margin" : attrs?.dropCap === "dropped" ? "drop" : null
  if (!kind) {
    return null
  }
  const index = paragraph.inlines.findIndex(
    (inline) => inline.kind === "run" && inline.content.some((item) => item.kind === "text" && item.text.length > 0),
  )
  const run = paragraph.inlines[index]
  if (!run || run.kind !== "run") {
    return null
  }
  const at = run.content.findIndex((item) => item.kind === "text" && item.text.length > 0)
  const item = run.content[at]
  if (!item || item.kind !== "text") {
    return null
  }
  const letter = [...item.text][0]!
  const rest = item.text.slice(letter.length)
  const content = [...run.content]
  if (rest) {
    content[at] = { ...item, text: rest }
  } else {
    content.splice(at, 1)
  }
  paragraph.inlines = [...paragraph.inlines]
  if (content.length > 0) {
    paragraph.inlines[index] = { ...run, content }
  } else {
    paragraph.inlines.splice(index, 1)
  }

  const lines = dropCapLines(attrs?.dropCapLines)
  const body = run.rPr.sz ?? paragraph.markRPr.sz ?? WORD_BODY
  const scale = (body / WORD_BODY) * (lines / 3)
  const size = Math.max(2, Math.round(WORD_SIZE * scale))
  const font = typeof attrs?.dropCapFont === "string" ? attrs.dropCapFont.trim() : ""
  const rPr: RunProperties = {
    ...structuredClone(run.rPr),
    sz: size,
    szCs: size,
    position: Math.round(WORD_POSITION * scale),
  }
  if (font) {
    rPr.rFonts = { ascii: font, hAnsi: font, cs: font }
  }
  const distance = Math.max(0, Number(attrs?.dropCapDistance) || 0)
  const frame: Paragraph = {
    kind: "paragraph",
    pPr: {
      keepNext: true,
      dropCap: { kind, lines, ...(distance > 0 ? { hSpace: Math.round(distance * 20) } : {}) },
      spacing: { after: 0, line: Math.round(WORD_LINE * scale), lineRule: "exact" },
    },
    markRPr: structuredClone(rPr),
    inlines: [{ kind: "run", rPr, content: [{ kind: "text", text: letter }] }],
  }
  if (paragraph.styleId) {
    frame.styleId = paragraph.styleId
  }
  return frame
}
