import { useViewStore } from "@/document/view"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

export const MIN_OBJECT_SIZE = 24

export type ResizeEdge = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export type Box = { width: number; height: number }

/**
 * The size an object takes when its `edge` handle has moved by (dx, dy) document pixels. Corners keep the aspect
 * ratio, and so do sides when `keepRatio` is set (Shift in Word).
 */
export function resizedBox(edge: ResizeEdge, start: Box, dx: number, dy: number, keepRatio: boolean, max?: number) {
  const ratio = start.width / Math.max(1, start.height)
  let width = start.width
  let height = start.height
  if (edge.includes("e")) {
    width = start.width + dx
  }
  if (edge.includes("w")) {
    width = start.width - dx
  }
  if (edge.includes("s")) {
    height = start.height + dy
  }
  if (edge.includes("n")) {
    height = start.height - dy
  }
  const corner = edge.length === 2
  if (corner || keepRatio) {
    // A corner follows whichever way the pointer moved further; a side follows its own direction.
    const byWidth = corner
      ? Math.abs(width - start.width) / Math.max(1, start.width) >=
        Math.abs(height - start.height) / Math.max(1, start.height)
      : edge === "e" || edge === "w"
    if (byWidth) {
      height = width / ratio
    } else {
      width = height * ratio
    }
  }
  if (max && width > max) {
    width = max
    if (corner || keepRatio) {
      height = width / ratio
    }
  }
  if (corner || keepRatio) {
    // The smaller side stops at the minimum, and the other keeps the ratio.
    width = Math.max(width, MIN_OBJECT_SIZE, MIN_OBJECT_SIZE * ratio)
    height = width / ratio
  } else {
    width = Math.max(MIN_OBJECT_SIZE, width)
    height = Math.max(MIN_OBJECT_SIZE, height)
  }
  return { width: Math.round(width), height: Math.round(height) }
}

/** "8.2 × 5.1 cm" for a size in CSS pixels. */
export function sizeTipText(box: Box) {
  const cm = (px: number) => ((px / 96) * 2.54).toFixed(1)
  return `${cm(box.width)} × ${cm(box.height)} cm`
}

type ResizeOptions = {
  /** The node types this handle resizes. */
  types: string[]
  /** The size the object shows now, in document pixels. */
  start: (node: ProseNode, dom: HTMLElement) => Box
  /** The node's attributes at the new size; `start` is the node as the drag began. */
  attrs: (start: ProseNode, box: Box, edge: ResizeEdge, from: Box) => Record<string, unknown>
  /** The widest the object may grow (an in-line object stays within the text width). */
  max?: (node: ProseNode) => number | undefined
}

/**
 * Resize handles (`[data-resize]`) that resize the object live, as in Word: the frame follows the pointer and the
 * text reflows during the drag. Each frame is written without history; on release the original comes back and the
 * final size goes in as one undo step. Esc cancels.
 */
export function bindObjectResize(
  dom: HTMLElement,
  view: EditorView,
  getPos: () => number | undefined,
  options: ResizeOptions,
) {
  const onDown = (event: PointerEvent) => {
    const handle = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-resize]") : null
    if (event.button !== 0 || !handle || !dom.contains(handle)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const pos = getPos()
    const original = pos == null ? null : view.state.doc.nodeAt(pos)
    if (pos == null || !original || !options.types.includes(original.type.name)) {
      return
    }
    const edge = (handle.dataset.resize || "se") as ResizeEdge
    const zoom = useViewStore.getState().zoom || 1
    const from = options.start(original, dom)
    const max = options.max?.(original)
    const startX = event.clientX
    const startY = event.clientY
    let box = from
    let frame = 0
    let pointer = { x: startX, y: startY, shift: false }

    const tip = document.createElement("div")
    tip.className = "object-size-tip"
    tip.setAttribute("role", "status")
    document.body.append(tip)
    document.body.classList.add("object-resizing")
    const cursor = document.body.style.cursor
    document.body.style.cursor = getComputedStyle(handle).cursor
    dom.classList.add("is-resizing")

    const write = (attrs: Record<string, unknown>, history: boolean) => {
      const current = view.state.doc.nodeAt(pos)
      if (!current || current.type !== original.type) {
        return
      }
      const tr = view.state.tr.setNodeMarkup(pos, undefined, attrs)
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      if (!history) {
        tr.setMeta("addToHistory", false)
      }
      view.dispatch(tr)
    }

    const paint = () => {
      frame = 0
      const next = resizedBox(edge, from, (pointer.x - startX) / zoom, (pointer.y - startY) / zoom, pointer.shift, max)
      tip.textContent = sizeTipText(next)
      tip.style.left = `${pointer.x + 16}px`
      tip.style.top = `${pointer.y + 18}px`
      if (next.width === box.width && next.height === box.height) {
        return
      }
      box = next
      write({ ...original.attrs, ...options.attrs(original, box, edge, from) }, false)
    }

    const move = (ev: PointerEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey }
      if (!frame) {
        frame = requestAnimationFrame(paint)
      }
    }

    const finish = (keep: boolean) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("keydown", onKey, true)
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      tip.remove()
      document.body.classList.remove("object-resizing")
      document.body.style.cursor = cursor
      dom.classList.remove("is-resizing")
      const changed = box.width !== from.width || box.height !== from.height
      write(original.attrs, false)
      if (keep && changed) {
        write({ ...original.attrs, ...options.attrs(original, box, edge, from) }, true)
      }
    }
    const up = (ev: PointerEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey }
      paint()
      finish(true)
    }
    const cancel = () => finish(false)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault()
        ev.stopPropagation()
        finish(false)
      }
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("keydown", onKey, true)
  }
  dom.addEventListener("pointerdown", onDown)
  return () => dom.removeEventListener("pointerdown", onDown)
}
