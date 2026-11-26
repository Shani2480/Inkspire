import type { Node as ProseNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import { holdObserver } from "@/editor/page-grid"

/**
 * Word lets a justified line take one more word when the line runs over a little, squeezing its spaces to fit (a
 * left-aligned line gets none). CSS justification only stretches spaces, so its lines break a word earlier. Measured
 * in Word 2026-11-26: lines of one repeated letter get about one space; ordinary text (120 paragraphs of Arial 11 pt)
 * up to four, and an allowance of two spaces a line breaks the most paragraphs as Word does (96 of 120, against 75
 * with one space and 26 with none). Narrowing the spaces of a justified paragraph by that allowance shared over a
 * line's spaces gives each line about it: justification widens them back on every line but the last, whose spaces
 * stay a little narrower (a tenth of a space, hardly to be seen).
 *
 * The narrowing depends on how many spaces a line of the paragraph holds, measured once for each version of the
 * paragraph; the paginator applies it before laying out the pages (pages.ts, `applySqueezes`).
 */
/** Each version of a paragraph's word spacing, and the width it was measured at (a new width measures again). */
const squeezes = new WeakMap<ProseNode, { value: string; width: number }>()

let context: CanvasRenderingContext2D | null | undefined

function canvas() {
  if (context === undefined) {
    context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d")
  }
  return context
}

function spaceWidth(style: CSSStyleDeclaration) {
  const context = canvas()
  if (!context) {
    return 0
  }
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return context.measureText(" ").width
}

/**
 * How much wider the engine sets this text than the font's own widths, as a fraction (0 where it does not). At a
 * device pixel ratio of 1 WebKitGTK rounds each glyph's advance to whole pixels: a line of Arial 11 pt came out
 * 0.7% wider than at 2x, and Word sets the true widths. The same text at a size where rounding is lost in the size
 * gives the true width.
 */
function widthInflation(text: string, style: CSSStyleDeclaration) {
  const context = canvas()
  const size = parseFloat(style.fontSize)
  if (!context || !(size > 0) || !text.trim()) {
    return 0
  }
  const font = (px: number) => `${style.fontStyle} ${style.fontWeight} ${px}px ${style.fontFamily}`
  const sample = text.slice(0, 400)
  context.font = font(size)
  const set = context.measureText(sample).width
  context.font = font(TRUE_SIZE)
  const exact = (context.measureText(sample).width * size) / TRUE_SIZE
  return exact > 0 ? Math.max(0, set / exact - 1) : 0
}

/** A font size large enough that whole-pixel rounding of each glyph is negligible. */
const TRUE_SIZE = 1000

/** The style of the text the paragraph's first space is in (a run's own font and size, not the paragraph's). */
function textStyle(dom: HTMLElement) {
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.textContent?.includes(" ") && text.parentElement) {
      return getComputedStyle(text.parentElement)
    }
  }
  return null
}

/** The line boxes of the paragraph's text: each line's left and right edge, in screen pixels. */
function lineExtents(dom: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(dom)
  const lines: { top: number; left: number; right: number }[] = []
  for (const rect of range.getClientRects()) {
    if (rect.width <= 0 || rect.height <= 0) {
      continue
    }
    const line = lines.find((item) => Math.abs(item.top - rect.top) < rect.height / 2)
    if (line) {
      line.left = Math.min(line.left, rect.left)
      line.right = Math.max(line.right, rect.right)
    } else {
      lines.push({ top: rect.top, left: rect.left, right: rect.right })
    }
  }
  return lines.sort((a, b) => a.top - b.top)
}

/** How many spaces' width a justified line may run over (see above). */
export const JUSTIFY_ALLOWANCE = 2

/**
 * The word spacing (a negative length, or "" for none) that gives a justified paragraph's lines Word's allowance. Only for a paragraph of two lines or more: one line long, nothing breaks.
 */
export function measureSqueeze(text: string, dom: HTMLElement): string {
  const style = getComputedStyle(dom)
  if (style.textAlign !== "justify") {
    return ""
  }
  const spaces = text.match(/ /g)?.length ?? 0
  if (spaces < 2) {
    return ""
  }
  const lines = lineExtents(dom)
  if (lines.length < 2) {
    return ""
  }
  // A justified line fills the text's width: the widest line but the last is that width.
  const width = Math.max(...lines.slice(0, -1).map((line) => line.right - line.left))
  const total = lines.reduce((sum, line) => sum + line.right - line.left, 0)
  const runStyle = textStyle(dom) ?? style
  const space = spaceWidth(runStyle)
  if (!(width > 0) || !(space > 0)) {
    return ""
  }
  // Spaces a full line holds (a ratio of screen widths, whatever the zoom), and the allowance (CSS pixels, as the
  // word spacing is) shared over them, with what the engine's rounding adds to a full line taken back too.
  const perLine = (spaces * width) / total
  const rounding = widthInflation(text, runStyle) * dom.clientWidth
  const share = (JUSTIFY_ALLOWANCE * space + rounding) / Math.max(1, perLine)
  return share >= 0.01 ? `${-Math.round(share * 100) / 100}px` : ""
}

/**
 * Gives every paragraph its word spacing before the pages are laid out: each new version of a paragraph is measured
 * first, all of them, and then the spacing is set on all, so the page is laid out again once and not once for each
 * paragraph (a long justified document opened a second slower).
 */
export function applySqueezes(view: EditorView) {
  const pending: [HTMLElement, string][] = []
  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) {
      return false
    }
    const width = dom.clientWidth
    let value = squeezes.get(node)?.width === width ? squeezes.get(node)!.value : undefined
    if (value === undefined) {
      value = measureSqueeze(node.textContent, dom)
      squeezes.set(node, { value, width })
    }
    if (dom.style.wordSpacing !== value) {
      pending.push([dom, value])
    }
    return false
  })
  if (pending.length > 0) {
    holdObserver(view, () => {
      for (const [dom, value] of pending) {
        dom.style.wordSpacing = value
      }
    })
  }
}
