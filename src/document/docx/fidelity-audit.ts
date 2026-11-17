/**
 * Fidelity audit (tools/fidelity-audit.mjs): checks, run by run and paragraph by paragraph, that what the browser
 * draws for an opened .docx is what Word's own rules give. It reads the file again, resolves every run's and
 * paragraph's formatting through Word's style hierarchy (docDefaults, paragraph style, character style, toggle
 * rules, direct formatting: `resolveRunProperties`), and compares that with the computed style of the element the
 * editor drew for it (data-docx-run, data-docx). A property the projection drops or the stylesheet overrides shows
 * up as a mismatch, whatever document it is in.
 *
 * Runs in the page (it needs the DOM and computed styles). Not part of the app bundle: only the tool imports it.
 */
import { openDocxBytes } from "@/document/docx/io"
import {
  paragraphsIn,
  resolveParagraphProperties,
  resolveRunProperties,
  type Inline,
  type Paragraph,
  type Run,
  type RunProperties,
  type WordDocument,
} from "@/document/docx/model"
import { WORD_HIGHLIGHTS } from "@/document/docx/shape-import"
import { fontOf, themeFontsOf } from "@/document/docx/word-styles"

/** Word's default paragraph style, which a paragraph without its own takes. */
const defaultParagraphStyleId = (doc: WordDocument) =>
  doc.styles.styles.find((style) => style.type === "paragraph" && style.default)?.id ?? "Normal"

export type AuditFinding = {
  /** The property that differs: bold, italic, size, color, highlight, underline, strike, caps, font, align. */
  property: string
  /** What Word draws. */
  expected: string
  /** What the app draws. */
  actual: string
  /** The text it is on (shortened). */
  text: string
  /** The paragraph's style, and the run's character style, for finding the cause. */
  style: string
}

export type AuditReport = {
  runs: number
  paragraphs: number
  /** Runs and paragraphs the editor did not draw with an anchor (shapes, fields, text boxes): not checked. */
  unmatched: number
  findings: AuditFinding[]
}

const suffix = (key: string | undefined) => key?.slice(key.lastIndexOf("-") + 1) ?? ""

function runsOf(inlines: Inline[], into: Run[] = []) {
  for (const inline of inlines) {
    if (inline.kind === "run") {
      into.push(inline)
    } else if (
      inline.kind === "hyperlink" ||
      inline.kind === "ins" ||
      inline.kind === "del" ||
      inline.kind === "simpleField"
    ) {
      runsOf(inline.inlines, into)
    }
  }
  return into
}

function runText(run: Run) {
  return run.content.map((item) => (item.kind === "text" ? item.text : "")).join("")
}

function rgbOf(value: string): [number, number, number, number] | null {
  const match = /rgba?\(([^)]+)\)/.exec(value)
  if (!match) {
    return null
  }
  const parts = match[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
}

function hexOf(value: string) {
  const rgb = rgbOf(value)
  return rgb
    ? `#${rgb
        .slice(0, 3)
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")}`
    : value
}

/** The first painted background behind an element, from it up to `stop` (exclusive) or the page. */
function backgroundBehind(element: Element, stop?: Element | null): string | null {
  for (let node: Element | null = element; node && node !== stop; node = node.parentElement) {
    const rgb = rgbOf(getComputedStyle(node).backgroundColor)
    if (rgb && rgb[3] > 0.5) {
      return hexOf(getComputedStyle(node).backgroundColor)
    }
    if (node.classList.contains("page-editor")) {
      break
    }
  }
  return null
}

function decorations(element: Element, stop: Element | null) {
  const lines = new Set<string>()
  for (let node: Element | null = element; node && node !== stop?.parentElement; node = node.parentElement) {
    // The proofing squiggles are the app's, not the document's.
    if (/spell|grammar/.test(node.className.toString())) {
      continue
    }
    for (const line of getComputedStyle(node).textDecorationLine.split(" ")) {
      lines.add(line)
    }
  }
  return lines
}

const dark = (hex: string) => {
  const [red, green, blue] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ]
  return 0.299 * red + 0.587 * green + 0.114 * blue < 128
}

function shown(element: Element) {
  const box = element.getBoundingClientRect()
  return box.width > 0 || box.height > 0
}

/** The drawn element for each anchor, by its number: the first visible one (headers repeat on every page). */
function anchorsBy(attribute: string) {
  const found = new Map<string, Element>()
  for (const element of document.querySelectorAll(`[${attribute}]`)) {
    const key = suffix(element.getAttribute(attribute) ?? "")
    if (key && (!found.has(key) || (!shown(found.get(key)!) && shown(element)))) {
      found.set(key, element)
    }
  }
  return found
}

function checkRun(
  doc: WordDocument,
  paragraph: Paragraph,
  run: Run,
  element: Element,
  block: Element | null,
  findings: AuditFinding[],
) {
  const text = runText(run)
  if (!text.trim()) {
    return
  }
  const paragraphStyleId = paragraph.styleId ?? defaultParagraphStyleId(doc)
  const word: RunProperties = resolveRunProperties({
    styles: doc.styles,
    paragraphStyleId,
    characterStyleId: run.rPr.rStyle,
    direct: run.rPr,
  })
  // The innermost element around the run's first character: the marks (strong, mark, u) inside the run's span.
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  })
  const inner = walker.nextNode()?.parentElement ?? element
  const css = getComputedStyle(inner)
  const style = `${paragraphStyleId}${run.rPr.rStyle ? ` / ${run.rPr.rStyle}` : ""}`
  const add = (property: string, expected: string, actual: string) =>
    findings.push({ property, expected, actual, text: text.slice(0, 60), style })
  if (word.vanish) {
    return
  }
  const bold = Number(css.fontWeight) >= 600
  if (bold !== (word.b === true)) {
    add("bold", String(word.b === true), String(bold))
  }
  const italic = css.fontStyle === "italic" || css.fontStyle.startsWith("oblique")
  if (italic !== (word.i === true)) {
    add("italic", String(word.i === true), String(italic))
  }
  // Word's size when nothing sets one is 10 pt; sub- and superscript draw smaller on purpose.
  const size = (word.sz ?? 20) / 2
  const drawnSize = Math.round(Number.parseFloat(css.fontSize) * 0.75 * 10) / 10
  if (!word.vertAlign || word.vertAlign === "baseline") {
    if (Math.abs(drawnSize - size) > 0.3) {
      add("size", `${size}pt`, `${drawnSize}pt`)
    }
  }
  // Automatic text is judged against the paragraph's and the cell's shading; whether Word also turns it white on a
  // dark highlight is not settled here.
  const background = backgroundBehind(block ?? inner)
  const colour = hexOf(css.color)
  const expectedColour =
    word.color && word.color !== "auto"
      ? `#${word.color.toLowerCase()}`
      : background && dark(background)
        ? "#ffffff"
        : "#000000"
  if (colour !== expectedColour) {
    add("color", expectedColour, colour)
  }
  const highlight =
    word.highlight && word.highlight !== "none"
      ? WORD_HIGHLIGHTS[word.highlight]
      : word.shd?.fill && word.shd.fill !== "auto"
        ? `#${word.shd.fill.toLowerCase()}`
        : null
  const runBackground = block ? backgroundBehind(inner, block) : null
  if ((highlight ?? null) !== runBackground) {
    add("highlight", highlight ?? "none", runBackground ?? "none")
  }
  const lines = decorations(inner, block)
  const underline = Boolean(word.u && word.u.value !== "none")
  if (underline !== lines.has("underline")) {
    add("underline", String(underline), String(lines.has("underline")))
  }
  const strike = word.strike === true || word.dstrike === true
  if (strike !== lines.has("line-through")) {
    add("strike", String(strike), String(lines.has("line-through")))
  }
  const caps = css.textTransform === "uppercase"
  if (caps !== (word.caps === true)) {
    add("caps", String(word.caps === true), String(caps))
  }
  const face = fontOf(word.rFonts, themeFontsOf(doc))
  const drawnFace = css.fontFamily.split(",")[0]!.replace(/["']/g, "").trim()
  if (face && drawnFace.toLowerCase() !== face.toLowerCase()) {
    add("font", face, drawnFace)
  }
}

const ALIGN: Record<string, string> = {
  left: "left",
  start: "left",
  center: "center",
  right: "right",
  end: "right",
  both: "justify",
  distribute: "justify",
}

function checkParagraph(doc: WordDocument, paragraph: Paragraph, element: Element, findings: AuditFinding[]) {
  const paragraphStyleId = paragraph.styleId ?? defaultParagraphStyleId(doc)
  const word = resolveParagraphProperties({ styles: doc.styles, paragraphStyleId, direct: paragraph.pPr })
  const text = runsOf(paragraph.inlines).map(runText).join("")
  if (!text.trim()) {
    return
  }
  const css = getComputedStyle(element)
  const add = (property: string, expected: string, actual: string) =>
    findings.push({ property, expected, actual, text: text.slice(0, 60), style: paragraphStyleId })
  const expected = ALIGN[word.jc ?? "left"] ?? "left"
  const drawn = css.textAlign === "start" ? "left" : css.textAlign === "end" ? "right" : css.textAlign
  if (drawn !== expected) {
    add("align", expected, drawn)
  }
}

/** Audits the document open in the editor against its .docx bytes. */
export async function auditOpenDocument(bytes: Uint8Array): Promise<AuditReport> {
  const { word } = await openDocxBytes(bytes)
  const runElements = anchorsBy("data-docx-run")
  const blockElements = anchorsBy("data-docx")
  const findings: AuditFinding[] = []
  const stories = [word.blocks, ...(word.section?.references ?? []).map((story) => story.blocks)]
  let runs = 0
  let paragraphs = 0
  let unmatched = 0
  for (const paragraph of stories.flatMap((blocks) => paragraphsIn(blocks))) {
    const block = blockElements.get(suffix(paragraph.key)) ?? null
    if (block) {
      paragraphs += 1
      checkParagraph(word, paragraph, block, findings)
    } else if (runsOf(paragraph.inlines).some((run) => runText(run).trim())) {
      unmatched += 1
    }
    for (const run of runsOf(paragraph.inlines)) {
      const element = runElements.get(suffix(run.key))
      if (!element) {
        if (runText(run).trim()) {
          unmatched += 1
        }
        continue
      }
      runs += 1
      checkRun(word, paragraph, run, element, block, findings)
    }
  }
  return { runs, paragraphs, unmatched, findings }
}
