import { Extension } from "@tiptap/core"
import { isHistoryTransaction } from "@tiptap/pm/history"
import { DOMSerializer, Fragment, Slice, type Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { ReplaceStep } from "@tiptap/pm/transform"
import type { EditorView } from "@tiptap/pm/view"
import { create } from "zustand"
import { paintTextBoxBody } from "@/editor/objects"

/**
 * Linked text boxes (Shape Format → Text → Create Link): one text flowing from box to box, as in Word. Each box in a
 * chain has the chain's `linkId` and its place in it (`linkSeq`). The text is kept in the boxes themselves, each
 * holding what fits in it, so it is typed and selected where it is seen; after each change it is flowed again, what
 * no longer fits moving on to the next box and what now fits coming back. The last box clips what is left, as
 * Word's does.
 */

export type ChainBox = { pos: number; node: ProseNode }

/** Every chain in the document, each in its order. */
export function textBoxChains(doc: ProseNode) {
  const chains = new Map<string, ChainBox[]>()
  doc.descendants((node, pos) => {
    if (node.type.name === "textBox" && node.attrs.linkId) {
      const id = String(node.attrs.linkId)
      chains.set(id, [...(chains.get(id) ?? []), { pos, node }])
    }
    return node.type.name !== "textBox"
  })
  for (const boxes of chains.values()) {
    boxes.sort((a, b) => Number(a.node.attrs.linkSeq) - Number(b.node.attrs.linkSeq))
  }
  return chains
}

/** The chain the text box at `pos` is in, and its place in it; null when it is not linked. */
export function chainAt(doc: ProseNode, pos: number) {
  const node = doc.nodeAt(pos)
  if (node?.type.name !== "textBox" || !node.attrs.linkId) {
    return null
  }
  const boxes = textBoxChains(doc).get(String(node.attrs.linkId)) ?? []
  const index = boxes.findIndex((box) => box.pos === pos)
  return index < 0 ? null : { boxes, index }
}

/** Whether the box at `pos` passes its text on to another: Create Link becomes Break Link, as in Word. */
export function hasNextBox(doc: ProseNode, pos: number) {
  const chain = chainAt(doc, pos)
  return Boolean(chain && chain.index < chain.boxes.length - 1)
}

/** Word links only to a text box that is empty and in no chain, and never back into the source's own chain. */
export function canLinkTo(doc: ProseNode, source: number, target: number) {
  const from = doc.nodeAt(source)
  const to = doc.nodeAt(target)
  return Boolean(
    from?.type.name === "textBox" &&
    to?.type.name === "textBox" &&
    source !== target &&
    !hasNextBox(doc, source) &&
    !to.attrs.linkId &&
    to.content.size === 0,
  )
}

let chainCount = 0

function newChainId() {
  chainCount += 1
  return `chain-${Date.now().toString(36)}-${chainCount}`
}

/**
 * Links the box at `source` to the empty one at `target`: the text that does not fit in the source flows into it.
 * A box whose height follows its text gets the height it has now (`heights`), as a linked box has a set size.
 */
export function linkTextBoxes(
  state: EditorState,
  source: number,
  target: number,
  heights: Record<number, number> = {},
): Transaction | null {
  if (!canLinkTo(state.doc, source, target)) {
    return null
  }
  const from = state.doc.nodeAt(source)!
  const to = state.doc.nodeAt(target)!
  const id = String(from.attrs.linkId || "") || newChainId()
  const seq = from.attrs.linkId ? Number(from.attrs.linkSeq) || 0 : 0
  const height = (node: ProseNode, pos: number) => Number(node.attrs.height) || Math.round(heights[pos] ?? 72)
  const tr = state.tr
  tr.setNodeMarkup(source, undefined, { ...from.attrs, linkId: id, linkSeq: seq, height: height(from, source) })
  tr.setNodeMarkup(target, undefined, { ...to.attrs, linkId: id, linkSeq: seq + 1, height: height(to, target) })
  return tr.setSelection(NodeSelection.create(tr.doc, source))
}

/**
 * Break Link on the box at `pos`: it keeps the text from the boxes after it (clipped, as in Word), and they are
 * emptied and form a chain of their own, or stand alone when only one is left.
 */
export function breakTextBoxLink(state: EditorState, pos: number): Transaction | null {
  const chain = chainAt(state.doc, pos)
  if (!chain || chain.index === chain.boxes.length - 1) {
    return null
  }
  const after = chain.boxes.slice(chain.index + 1)
  const text = after.reduce((all, box) => all.append(box.node.content), Fragment.empty)
  const id = after.length > 1 ? newChainId() : ""
  const tr = state.tr
  // From the last box back, so the places before stay good.
  for (let place = after.length - 1; place >= 0; place -= 1) {
    const box = after[place]!
    tr.replaceWith(box.pos + 1, box.pos + 1 + box.node.content.size, Fragment.empty)
    tr.setNodeMarkup(box.pos, undefined, { ...box.node.attrs, linkId: id, linkSeq: id ? place : 0 })
  }
  const own = chain.boxes[chain.index]!
  tr.insert(own.pos + 1 + own.node.content.size, text)
  if (chain.index === 0) {
    tr.setNodeMarkup(own.pos, undefined, { ...own.node.attrs, linkId: "", linkSeq: 0 })
  }
  return tr.setSelection(NodeSelection.create(tr.doc, own.pos))
}

/**
 * Where the chain's text breaks between its boxes: for each box but the last, the end of what fits in it (offsets
 * into `text`), found by halving and moved back to the start of a word where there is one, as lines break. `fits`
 * says whether a piece of the text fits in box `index`; null is a box that grows with its text.
 */
export function flowBreaks(text: Fragment, boxes: number, fits: (index: number, piece: Fragment) => boolean | null) {
  const breaks: number[] = []
  let start = 0
  for (let index = 0; index < boxes - 1; index += 1) {
    const whole = fits(index, text.cut(start))
    if (whole !== false) {
      breaks.push(text.size)
      start = text.size
      continue
    }
    let low = start
    let high = text.size
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2)
      if (fits(index, text.cut(start, middle))) {
        low = middle
      } else {
        high = middle
      }
    }
    // Back to after the last space, so a word is not split between boxes (one longer than the box is).
    const kept = text.textBetween(start, low, undefined, "\uFFFC")
    const space = kept.lastIndexOf(" ")
    const end = space >= 0 && low < text.size ? start + space + 1 : low
    breaks.push(end)
    start = end
  }
  return breaks
}

/** The transaction that puts each box's share of the chain's text in it, the cursor kept in the text; or null. */
export function flowChain(state: EditorState, boxes: ChainBox[], breaks: number[]): Transaction | null {
  const text = boxes.reduce((all, box) => all.append(box.node.content), Fragment.empty)
  const ends = [...breaks, text.size]
  const pieces = ends.map((end, index) => text.cut(index ? ends[index - 1]! : 0, end))
  if (pieces.every((piece, index) => piece.eq(boxes[index]!.node.content))) {
    return null
  }
  // The cursor (or selection) by its place in the chain's text, to put back in whichever box that is now in.
  const offsetOf = (pos: number) => {
    let before = 0
    for (const box of boxes) {
      const start = box.pos + 1
      if (pos >= start && pos <= start + box.node.content.size) {
        return before + pos - start
      }
      before += box.node.content.size
    }
    return null
  }
  const { anchor, head } = state.selection
  const kept = state.selection instanceof TextSelection ? [offsetOf(anchor), offsetOf(head)] : [null, null]
  const tr = state.tr
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index]!
    tr.replaceWith(box.pos + 1, box.pos + 1 + box.node.content.size, pieces[index]!)
  }
  if (kept[0] !== null && kept[1] !== null) {
    const place = (offset: number) => {
      let before = 0
      for (let index = 0; index < boxes.length; index += 1) {
        const size = pieces[index]!.size
        // At a break, the end of the box before: the cursor stays on the line it was typed on.
        if (offset <= before + size || index === boxes.length - 1) {
          return tr.mapping.map(boxes[index]!.pos) + 1 + Math.min(size, offset - before)
        }
        before += size
      }
      return 0
    }
    tr.setSelection(TextSelection.create(tr.doc, place(kept[0]), place(kept[1])))
  }
  return tr
}

/** Measures whether a piece of text fits in a box, as its page draws it, in a probe out of sight. */
class Probe {
  private readonly root = document.createElement("div")

  constructor(private readonly view: EditorView) {
    this.root.setAttribute("aria-hidden", "true")
    Object.assign(this.root.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      visibility: "hidden",
      pointerEvents: "none",
    })
    document.body.append(this.root)
  }

  fits(box: ChainBox, piece: Fragment): boolean | null {
    const height = Number(box.node.attrs.height) || 0
    const live = this.view.nodeDOM(box.pos)
    const liveBody = live instanceof HTMLElement ? live.querySelector<HTMLElement>(".text-box-body") : null
    if (!height || !liveBody) {
      return null
    }
    const frame = document.createElement("div")
    frame.className = "text-box"
    frame.dataset.border = String(box.node.attrs.border || "single")
    frame.style.width = `${Math.max(80, Number(box.node.attrs.width) || 200)}px`
    const body = document.createElement("div")
    body.className = "text-box-body"
    paintTextBoxBody(body, box.node)
    const font = getComputedStyle(liveBody)
    Object.assign(body.style, {
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      lineHeight: font.lineHeight,
      letterSpacing: font.letterSpacing,
      textAlign: font.textAlign,
      height: `${height}px`,
      minHeight: "0",
      overflow: "hidden",
    })
    body.append(DOMSerializer.fromSchema(this.view.state.schema).serializeFragment(piece))
    frame.append(body)
    this.root.replaceChildren(frame)
    const fits = body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1
    this.root.replaceChildren()
    return fits
  }

  destroy() {
    this.root.remove()
  }
}

type FlowState = {
  /** The last change made to the document, which a flow following it joins in the undo history. */
  last: Transaction | null
  /** When the text of a chain was last typed or flowed (as recorded for undo); 0 after any other change. */
  typed: number
}

const flowKey = new PluginKey<FlowState>("textBoxFlow")

/** The typing that crosses from box to box undoes as one, as history groups typing that stays in one place. */
const GROUP_DELAY = 500

/**
 * Marks `tr` as a chain's flow: undone with the change that caused it (the last one made), or kept out of the undo
 * history when there is none, as after an undo, whose redo brings it back.
 */
export function asFlow(tr: Transaction, state: EditorState) {
  const last = flowKey.getState(state)?.last
  tr.setMeta(flowKey, true)
  return last ? tr.setMeta("appendedTransaction", last) : tr.setMeta("addToHistory", false)
}

/** Whether every change `tr` makes is to the text of a linked box. */
function inChain(tr: Transaction) {
  return tr.steps.every((step, index) => {
    const doc = tr.docs[index]!
    const ranges: [number, number][] = []
    step.getMap().forEach((from, to) => ranges.push([from, to]))
    if (!ranges.length && "from" in step && "to" in step) {
      ranges.push([Number(step.from), Number(step.to)])
    }
    return ranges.every(([from, to]) => {
      const $from = doc.resolve(from)
      return $from.parent.type.name === "textBox" && Boolean($from.parent.attrs.linkId) && to <= $from.end()
    })
  })
}

/** Whether `tr` deletes a whole linked box (or moves one, which deletes it and puts it back). */
function deletesLinkedBox(tr: Transaction) {
  return tr.steps.some((step, index) => {
    if (!(step instanceof ReplaceStep) || step.from === step.to) {
      return false
    }
    let found = false
    tr.docs[index]!.nodesBetween(step.from, step.to, (node, pos) => {
      if (node.type.name === "textBox") {
        found ||= Boolean(node.attrs.linkId) && pos >= step.from && pos + node.nodeSize <= step.to
        return false
      }
      return !found
    })
    return found
  })
}

/**
 * After linked boxes are deleted, their text goes to the box before them in what is left of the chain (or the one
 * after, when none is before), so none of it is lost; a chain left with one box is no chain.
 */
export function keepDeletedText(before: ProseNode, state: EditorState): Transaction | null {
  const now = textBoxChains(state.doc)
  const tr = state.tr
  for (const [id, boxes] of textBoxChains(before)) {
    const left = now.get(id) ?? []
    const kept = new Set(left.map((box) => Number(box.node.attrs.linkSeq)))
    const gone = boxes.filter((box) => !kept.has(Number(box.node.attrs.linkSeq)))
    if (!gone.length || !left.length) {
      continue
    }
    // Text for the start of the first box left, and for the end of each box left.
    let start = Fragment.empty
    const ends = new Map<ChainBox, Fragment>()
    for (const box of gone) {
      const seq = Number(box.node.attrs.linkSeq)
      const target = left.filter((item) => Number(item.node.attrs.linkSeq) < seq).pop()
      if (target) {
        ends.set(target, (ends.get(target) ?? Fragment.empty).append(box.node.content))
      } else {
        start = start.append(box.node.content)
      }
    }
    for (const [box, text] of ends) {
      if (text.size) {
        tr.insert(tr.mapping.map(box.pos + box.node.nodeSize - 1, -1), text)
      }
    }
    if (start.size) {
      tr.insert(tr.mapping.map(left[0]!.pos + 1), start)
    }
    if (left.length === 1) {
      const pos = tr.mapping.map(left[0]!.pos)
      tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, linkId: "", linkSeq: 0 })
    }
  }
  return tr.docChanged ? tr : null
}

function unlinkFragment(fragment: Fragment): Fragment {
  const nodes: ProseNode[] = []
  fragment.forEach((node) => {
    if (node.type.name === "textBox") {
      nodes.push(
        node.attrs.linkId
          ? node.type.create({ ...node.attrs, linkId: "", linkSeq: 0 }, node.content, node.marks)
          : node,
      )
    } else {
      nodes.push(node.isLeaf ? node : node.copy(unlinkFragment(node.content)))
    }
  })
  return Fragment.from(nodes)
}

/** A pasted or copied box stands alone, out of the chain it was copied from, as in Word. */
export function unlinkSlice(slice: Slice) {
  return new Slice(unlinkFragment(slice.content), slice.openStart, slice.openEnd)
}

/** The flow of every chain, after each change to the document and once it is first shown. */
class Flow {
  private readonly probe: Probe
  private frame = 0

  constructor(private readonly view: EditorView) {
    this.probe = new Probe(view)
    this.schedule()
    void document.fonts?.ready.then(() => this.schedule())
  }

  schedule = () => {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.run())
  }

  private run() {
    if (this.view.isDestroyed) {
      return
    }
    for (const boxes of textBoxChains(this.view.state.doc).values()) {
      if (boxes.length < 2) {
        continue
      }
      const text = boxes.reduce((all, box) => all.append(box.node.content), Fragment.empty)
      const breaks = flowBreaks(text, boxes.length, (index, piece) => this.probe.fits(boxes[index]!, piece))
      const tr = flowChain(this.view.state, boxes, breaks)
      if (tr) {
        // Part of the change that caused it, for undo: with the typing it follows, or an undo's own redo.
        this.view.dispatch(asFlow(tr, this.view.state))
        // The rest are flowed against the document as it is now.
        this.schedule()
        return
      }
    }
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.probe.destroy()
  }
}

/** Picking the box to link to after Create Link: the box text flows from, while the pick goes on. */
export const useTextBoxLinking = create<{ source: number | null }>(() => ({ source: null }))

/** Create Link: the next click on an empty text box links it; Escape or a click elsewhere gives up. */
export function startLinking(view: EditorView, source: number) {
  useTextBoxLinking.setState({ source })
  document.documentElement.dataset.linkingTextBox = ""
  const stop = () => {
    useTextBoxLinking.setState({ source: null })
    delete document.documentElement.dataset.linkingTextBox
    window.removeEventListener("pointerdown", onDown, true)
    window.removeEventListener("keydown", onKey, true)
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      stop()
    }
  }
  const onDown = (event: PointerEvent) => {
    const element = event.target instanceof Element ? event.target.closest(".text-box") : null
    let target: number | null = null
    view.state.doc.descendants((node, pos) => {
      if (target === null && node.type.name === "textBox" && view.nodeDOM(pos) === element) {
        target = pos
      }
      return target === null
    })
    stop()
    if (target === null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const heights: Record<number, number> = {}
    for (const pos of [source, target]) {
      const dom = view.nodeDOM(pos)
      const body = dom instanceof HTMLElement ? dom.querySelector<HTMLElement>(".text-box-body") : null
      heights[pos] = body?.offsetHeight ?? 72
    }
    const tr = linkTextBoxes(view.state, source, target, heights)
    if (tr) {
      view.dispatch(tr)
      view.focus()
    }
  }
  window.addEventListener("pointerdown", onDown, true)
  window.addEventListener("keydown", onKey, true)
  return stop
}

export const TextBoxFlow = Extension.create({
  name: "textBoxFlow",

  addProseMirrorPlugins() {
    return [
      new Plugin<FlowState>({
        key: flowKey,
        state: {
          init: () => ({ last: null, typed: 0 }),
          apply: (tr, value) => {
            if (!tr.docChanged) {
              return value
            }
            if (tr.getMeta(flowKey)) {
              return tr.getMeta("addToHistory") === false ? value : { ...value, typed: tr.time }
            }
            const typed = !isHistoryTransaction(tr) && tr.getMeta("addToHistory") !== false && inChain(tr)
            return { last: tr, typed: typed ? tr.time : 0 }
          },
        },
        // Typing that goes on in a chain soon after the last joins its undo step, though a flow has moved it to
        // another box (history only joins typing next to the last).
        filterTransaction: (tr, state) => {
          const { last, typed } = flowKey.getState(state)!
          if (
            typed &&
            last &&
            tr.docChanged &&
            tr.time - typed < GROUP_DELAY &&
            !tr.getMeta(flowKey) &&
            !tr.getMeta("appendedTransaction") &&
            tr.getMeta("addToHistory") !== false &&
            !isHistoryTransaction(tr) &&
            inChain(tr)
          ) {
            tr.setMeta("appendedTransaction", last)
          }
          return true
        },
        appendTransaction: (transactions, before, state) =>
          transactions.some((tr) => isHistoryTransaction(tr) || tr.getMeta(flowKey)) ||
          !transactions.some(deletesLinkedBox)
            ? null
            : keepDeletedText(before.doc, state),
        props: {
          // A box moved by dragging keeps its place in its chain; a copy does not.
          transformPasted: (slice, view) => (view.dragging?.move ? slice : unlinkSlice(slice)),
        },
        view: (view) => {
          const flow = new Flow(view)
          window.addEventListener("resize", flow.schedule)
          return {
            update: (next, previous) => {
              if (!next.state.doc.eq(previous.doc)) {
                flow.schedule()
              }
            },
            destroy: () => {
              window.removeEventListener("resize", flow.schedule)
              flow.destroy()
            },
          }
        },
      }),
    ]
  },
})
