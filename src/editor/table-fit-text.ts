import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

const key = new PluginKey<DecorationSet>("tableFitText")

/**
 * How each paragraph of a Fit text cell is fitted, by the paragraph's position: px added after every character when
 * the text is shorter than the cell, or the factor it is narrowed by when it is longer.
 */
type Fit = { spacing: number; scale: number }
type Spacings = Map<number, Fit>

/**
 * Table Properties → Cell → Options… → Fit text (Word's `w:tcFitText`): the space between the characters of each
 * paragraph in the cell grows or shrinks so its text runs the cell's width on one line. The cell keeps its text on one
 * line (`index.css`); here each paragraph's natural width is measured and its letter spacing set to fill the rest.
 * Text longer than the cell is narrowed instead, as Word condenses it, so its characters do not run into each other.
 */
export const TableFitText = Extension.create({
  name: "tableFitText",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply: (transaction, decorations) => {
            const next = transaction.getMeta(key) as DecorationSet | undefined
            return next ?? decorations.map(transaction.mapping, transaction.doc)
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
        view: (view) => {
          let frame = 0
          const schedule = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => refit(view))
          }
          schedule()
          void document.fonts?.ready.then(schedule)
          return {
            update: (current, previous) => {
              if (!current.state.doc.eq(previous.doc)) {
                schedule()
              }
            },
            destroy: () => cancelAnimationFrame(frame),
          }
        },
      }),
    ]
  },
})

function fitCells(doc: PMNode) {
  const paragraphs: { pos: number; cellPos: number }[] = []
  doc.descendants((node, pos) => {
    if ((node.type.name === "tableCell" || node.type.name === "tableHeader") && node.attrs.fitText === true) {
      node.forEach((child, offset) => {
        if (child.isTextblock && child.textContent.length > 0) {
          paragraphs.push({ pos: pos + 1 + offset, cellPos: pos })
        }
      })
      return false
    }
    return node.type.name !== "paragraph"
  })
  return paragraphs
}

/** The fit that makes the paragraph's text exactly as wide as the cell's text area, or null when it can't be read. */
function fitFor(view: EditorView, pos: number, cellPos: number): Fit | null {
  const paragraph = view.nodeDOM(pos)
  const cell = view.nodeDOM(cellPos)
  if (!(paragraph instanceof HTMLElement) || !(cell instanceof HTMLElement)) {
    return null
  }
  const cellStyle = getComputedStyle(cell)
  const style = getComputedStyle(paragraph)
  const room =
    cell.clientWidth -
    parseFloat(cellStyle.paddingLeft) -
    parseFloat(cellStyle.paddingRight) -
    parseFloat(style.marginLeft) -
    parseFloat(style.marginRight) -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight) -
    Math.max(0, parseFloat(style.textIndent) || 0)
  const range = document.createRange()
  range.selectNodeContents(paragraph)
  const characters = range.toString().length
  if (characters === 0 || !(room > 0)) {
    return null
  }
  // The drawn width includes the spacing already set after each character and the narrowing already applied.
  const current = parseFloat(style.letterSpacing) || 0
  const narrowed = /^matrix\(([^,]+),/.exec(style.transform)
  const scale = narrowed ? Number(narrowed[1]) || 1 : 1
  const natural = range.getBoundingClientRect().width / scale - current * characters
  if (natural > room) {
    return { spacing: 0, scale: Math.round((room / natural) * 1000) / 1000 }
  }
  return { spacing: Math.round(((room - natural) / characters) * 100) / 100, scale: 1 }
}

function refit(view: EditorView) {
  if (view.isDestroyed) {
    return
  }
  const { doc } = view.state
  const spacings: Spacings = new Map()
  for (const { pos, cellPos } of fitCells(doc)) {
    const fit = fitFor(view, pos, cellPos)
    if (fit) {
      spacings.set(pos, fit)
    }
  }
  const old = key.getState(view.state) ?? DecorationSet.empty
  const before: Spacings = new Map(old.find().map((decoration) => [decoration.from, decoration.spec as Fit]))
  const same =
    before.size === spacings.size &&
    [...spacings].every(([pos, fit]) => {
      const was = before.get(pos)
      return was !== undefined && Math.abs(was.spacing - fit.spacing) < 0.05 && Math.abs(was.scale - fit.scale) < 0.002
    })
  if (same) {
    return
  }
  const decorations = [...spacings].map(([pos, fit]) => {
    const node = doc.nodeAt(pos)!
    const style = fit.scale < 1 ? `transform: scaleX(${fit.scale})` : `letter-spacing: ${fit.spacing}px`
    return Decoration.node(pos, pos + node.nodeSize, { style, class: "fit-text" }, fit)
  })
  view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(doc, decorations)).setMeta("addToHistory", false))
}
