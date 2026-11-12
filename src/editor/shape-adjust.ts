import { dragAdjustHandle, hasAdjustHandles, presetHandles, presetSegments } from "@/document/docx/preset-geometry"
import { VARIANT_OF_PRESET } from "@/document/docx/shape-import"
import { useViewStore } from "@/document/view"
import { pathString, POINTS_BOX, type Point } from "@/editor/shape-points"
import type { Node as ProseNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"

/**
 * Word's yellow adjustment handles (Shape Format): the diamonds on a selected shape that change its own proportions,
 * as a rounded rectangle's corners or the Division sign's dots and bar, without changing its size. They move the
 * preset's adjust values (`a:avLst`), so the shape is then drawn from Word's own geometry at those values: its
 * `geometry` attribute names the preset and `adjust` holds the values as JSON.
 */

const PRESET_OF_VARIANT = new Map(Object.entries(VARIANT_OF_PRESET).map(([preset, variant]) => [variant, preset]))

type Attrs = Record<string, unknown>

/** The adjust values a shape's handles set; empty while it has Word's defaults. */
export function adjustOf(attrs: Attrs): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(String(attrs.adjust || "{}"))
    if (!parsed || typeof parsed !== "object") {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
    )
  } catch {
    return {}
  }
}

/** The Word preset a shape is: the one it is drawn from, else the one its gallery drawing saves as. */
export function presetOfShape(attrs: Attrs) {
  return String(attrs.geometry || "") || PRESET_OF_VARIANT.get(String(attrs.variant ?? "")) || ""
}

/** A shape drawn from Word's geometry (its `geometry` attribute), as points in the 100 by 100 box; "" for any other. */
export function geometryPoints(attrs: Attrs, width: number, height: number) {
  const geometry = String(attrs.geometry || "")
  if (!geometry || attrs.points) {
    return ""
  }
  const segments = presetSegments(geometry, width, height, adjustOf(attrs))
  return segments ? pathString(segments) : ""
}

/** Whether a figure shows adjustment handles: a shape, not edited point by point, whose preset has them. */
export function showsAdjustHandles(attrs: Attrs) {
  return attrs.kind === "shape" && !attrs.points && hasAdjustHandles(presetOfShape(attrs))
}

/** The shape's size the handles are worked out at: its own, or the gallery's default. */
function sizeOf(attrs: Attrs): [number, number] {
  return [Number(attrs.width) || 120, Number(attrs.height) || 72]
}

/** Where the handles sit, in percent of the shape's box, flipped with the shape. */
export function adjustHandlePlaces(attrs: Attrs): Point[] {
  if (!showsAdjustHandles(attrs)) {
    return []
  }
  const [width, height] = sizeOf(attrs)
  return presetHandles(presetOfShape(attrs), width, height, adjustOf(attrs)).map(([x, y]) => [
    attrs.flipH ? POINTS_BOX - x : x,
    attrs.flipV ? POINTS_BOX - y : y,
  ])
}

/** The attributes after handle `index` is dragged to `target` (percent of the shape's box, as shown). */
export function adjustedAttrs(attrs: Attrs, index: number, target: Point): Attrs {
  const preset = presetOfShape(attrs)
  const [width, height] = sizeOf(attrs)
  const unflipped: Point = [
    attrs.flipH ? POINTS_BOX - target[0] : target[0],
    attrs.flipV ? POINTS_BOX - target[1] : target[1],
  ]
  const adjust = dragAdjustHandle(preset, width, height, adjustOf(attrs), index, unflipped)
  return { ...attrs, geometry: preset, adjust: JSON.stringify(adjust) }
}

/** Puts the handles on a figure's node view, one per handle of its preset; removes them when it has none. */
export function paintAdjustHandles(dom: HTMLElement, node: ProseNode) {
  const places = adjustHandlePlaces(node.attrs)
  const existing = [...dom.querySelectorAll<HTMLElement>(":scope > [data-adjust]")]
  existing.slice(places.length).forEach((handle) => handle.remove())
  places.forEach(([x, y], index) => {
    let handle = existing[index]
    if (!handle) {
      handle = document.createElement("div")
      handle.className = "shape-adjust-handle"
      handle.dataset.adjust = String(index)
      handle.contentEditable = "false"
      handle.title = "Adjust the shape"
      dom.append(handle)
    }
    handle.style.left = `${x}%`
    handle.style.top = `${y}%`
  })
}

/**
 * Dragging a handle: the shape follows the pointer without a history step, Esc puts it back, and letting go keeps
 * it as one undo step. Returns the cleanup.
 */
export function bindAdjustHandles(dom: HTMLElement, view: EditorView, getPos: () => number | undefined) {
  const onDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-adjust]") : null
    if (!target || event.button !== 0 || target.parentElement !== dom) {
      return
    }
    const pos = getPos()
    const node = pos === undefined ? null : view.state.doc.nodeAt(pos)
    if (pos === undefined || !node || node.type.name !== "figure") {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const index = Number(target.dataset.adjust)
    const start = node.attrs
    let latest: Attrs = start
    let frame = 0
    const box = () => (dom.querySelector("svg") ?? dom).getBoundingClientRect()
    // The outline as it was: the node is the same when nothing is kept, so the view does not draw it again.
    const startD = dom.querySelector("svg path[data-shape-points]")?.getAttribute("d") ?? null
    const preview = (attrs: Attrs) => {
      const svg = dom.querySelector<SVGSVGElement>("svg")
      const [width, height] = sizeOf(attrs)
      const d = geometryPoints(attrs, width, height)
      const path = svg?.querySelector<SVGPathElement>("path[data-shape-points]")
      if (svg && path && d) {
        path.setAttribute("d", d)
      } else {
        // The first move turns the gallery drawing into Word's geometry: draw it once through the node.
        commit(attrs, false)
      }
      paintAdjustHandles(dom, node.type.create(attrs))
    }
    const commit = (attrs: Attrs, history: boolean) => {
      const at = getPos()
      if (at === undefined) {
        return
      }
      const tr = view.state.tr.setNodeMarkup(at, undefined, attrs)
      if (!history) {
        tr.setMeta("addToHistory", false)
      }
      view.dispatch(tr)
    }
    const onMove = (move: PointerEvent) => {
      const rect = box()
      if (!(rect.width > 0) || !(rect.height > 0)) {
        return
      }
      // A rotated shape: the pointer is turned back about the shape's centre before it is read.
      const turn = ((Number(start.rotate) || 0) * Math.PI) / 180
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = move.clientX - cx
      const dy = move.clientY - cy
      const zoom = useViewStore.getState().zoom || 1
      const [width, height] = sizeOf(start)
      const x = (dx * Math.cos(-turn) - dy * Math.sin(-turn)) / zoom
      const y = (dx * Math.sin(-turn) + dy * Math.cos(-turn)) / zoom
      const target: Point = [(x / width + 0.5) * POINTS_BOX, (y / height + 0.5) * POINTS_BOX]
      latest = adjustedAttrs(start, index, target)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => preview(latest))
    }
    const finish = (keep: boolean) => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onCancel)
      window.removeEventListener("keydown", onKey, true)
      dom.classList.remove("is-adjusting")
      // Back to where it started without a step, then the change (if any) as the one undo step.
      commit(start, false)
      if (keep && latest !== start) {
        commit(latest, true)
      } else {
        const path = dom.querySelector("svg path[data-shape-points]")
        if (path && startD !== null) {
          path.setAttribute("d", startD)
        }
        paintAdjustHandles(dom, node)
      }
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    const onKey = (key: KeyboardEvent) => {
      if (key.key === "Escape") {
        key.preventDefault()
        key.stopPropagation()
        finish(false)
      }
    }
    dom.classList.add("is-adjusting")
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
    window.addEventListener("keydown", onKey, true)
  }
  dom.addEventListener("pointerdown", onDown, true)
  return () => dom.removeEventListener("pointerdown", onDown, true)
}
