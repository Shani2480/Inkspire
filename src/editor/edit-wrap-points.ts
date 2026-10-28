import { findObject, objectWrap } from "@/editor/objects"
import {
  WRAP_BOX,
  autoContourOf,
  parseWrapPoints,
  polygonOfRows,
  wrapPointsString,
  type WrapPoint,
} from "@/editor/wrap-contour"
import { Extension, type Editor } from "@tiptap/core"
import { closeHistory } from "@tiptap/pm/history"
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/**
 * Word's Edit Wrap Points (Wrap Text menu, for Tight and Through): the outline text wraps around, drawn as a red
 * dashed line with a black handle on each point over the object. Drag a handle to move its point, drag the line to
 * add a point there and move it, Ctrl+click a handle to delete its point. Escape, or a click away, ends it. The points
 * are kept in Word's 21600 box over the object (`wrapPoints`), so they stretch with it and save as `wp:wrapPolygon`.
 */

const key = new PluginKey<{ pos: number | null }>("editWrapPoints")

/** How near (in screen pixels) a press must be to the outline to take hold of it. */
const REACH = 6

/** The selected object, when Edit Wrap Points applies to it: floating with Tight or Through, and not turned. */
function editable(state: EditorState) {
  const found = findObject(state)
  if (!found) {
    return null
  }
  const wrap = objectWrap(found.node.attrs.wrap)
  if ((wrap !== "tight" && wrap !== "through") || Number(found.node.attrs.rotate) || 0) {
    return null
  }
  return found
}

export function canEditWrapPoints(editor: Editor | null) {
  return Boolean(editor && editable(editor.state))
}

export function startEditWrapPoints(editor: Editor) {
  const found = editable(editor.state)
  if (!found) {
    return false
  }
  if (!(editor.state.selection instanceof NodeSelection && editor.state.selection.from === found.pos)) {
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, found.pos)))
  }
  editor.view.dispatch(editor.state.tr.setMeta(key, { pos: found.pos }))
  return true
}

export function stopEditWrapPoints(view: EditorView) {
  if (key.getState(view.state)?.pos != null) {
    view.dispatch(view.state.tr.setMeta(key, { pos: null }))
  }
}

export function editingWrapPointsAt(view: EditorView) {
  return key.getState(view.state)?.pos ?? null
}

/** The point on the segment from `a` to `b` nearest `p`, as a fraction along it, and how far `p` is from it. */
function nearestOnSegment(a: WrapPoint, b: WrapPoint, p: WrapPoint) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length))
  return { t, distance: Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) }
}

/** The points with one added on the segment nearest `at`, and its index; null when no segment is within `reach`. */
export function insertWrapPoint(points: WrapPoint[], at: WrapPoint, reach: number) {
  let best: { index: number; distance: number } | null = null
  points.forEach((from, index) => {
    const { distance } = nearestOnSegment(from, points[(index + 1) % points.length]!, at)
    if (!best || distance < best.distance) {
      best = { index, distance }
    }
  })
  const found = best as { index: number; distance: number } | null
  if (!found || found.distance > reach) {
    return null
  }
  const next = [...points]
  next.splice(found.index + 1, 0, [Math.round(at[0]), Math.round(at[1])])
  return { points: next, index: found.index + 1 }
}

/** The points without the one at `index`; an outline keeps at least three. */
export function deleteWrapPoint(points: WrapPoint[], index: number) {
  return points.length <= 3 ? points : points.filter((_point, at) => at !== index)
}

class WrapPointsOverlay {
  private readonly root: HTMLDivElement
  private readonly outline: SVGPolygonElement
  private readonly target: SVGPolygonElement
  private handles: HTMLDivElement[] = []
  private pos: number | null = null
  private points: WrapPoint[] = []
  private pressing = false
  private frame = { left: 0, top: 0, width: 1, height: 1 }
  private marked: HTMLElement | null = null

  constructor(private readonly view: EditorView) {
    this.root = document.createElement("div")
    this.root.className = "edit-points edit-wrap-points"
    this.root.hidden = true
    const svgNs = "http://www.w3.org/2000/svg"
    const svg = document.createElementNS(svgNs, "svg")
    svg.setAttribute("viewBox", `0 0 ${WRAP_BOX} ${WRAP_BOX}`)
    svg.setAttribute("preserveAspectRatio", "none")
    this.outline = document.createElementNS(svgNs, "polygon")
    this.outline.setAttribute("class", "edit-points-outline")
    this.outline.setAttribute("vector-effect", "non-scaling-stroke")
    this.target = document.createElementNS(svgNs, "polygon")
    this.target.setAttribute("class", "edit-points-target")
    this.target.setAttribute("vector-effect", "non-scaling-stroke")
    this.target.style.strokeWidth = `${REACH * 2}px`
    svg.append(this.outline, this.target)
    this.root.append(svg)
    document.body.append(this.root)
    this.target.addEventListener("pointerdown", this.onOutlineDown)
    this.root.addEventListener("mousedown", (event) => event.preventDefault())
    this.root.addEventListener("contextmenu", (event) => event.preventDefault())
    window.addEventListener("scroll", this.place, true)
    window.addEventListener("resize", this.place)
    window.addEventListener("pointerdown", this.onAnyDown, true)
    window.addEventListener("keydown", this.onKey, true)
  }

  private mark(dom: HTMLElement | null) {
    if (this.marked !== dom) {
      this.marked?.removeAttribute("data-editing-points")
      this.marked = dom
    }
    dom?.setAttribute("data-editing-points", "")
  }

  update() {
    const pos = editingWrapPointsAt(this.view)
    const node = pos == null ? null : this.view.state.doc.nodeAt(pos)
    const selection = this.view.state.selection
    const selected = selection instanceof NodeSelection && selection.from === pos
    if (pos == null || !node || !editable(this.view.state) || (!selected && !this.pressing)) {
      this.mark(null)
      this.pos = null
      this.root.hidden = true
      if (pos != null) {
        // Selecting something else, or a wrap other than Tight or Through, ends it (after this view update).
        queueMicrotask(() => {
          if (editingWrapPointsAt(this.view) === pos && (!editable(this.view.state) || !this.isSelected(pos))) {
            stopEditWrapPoints(this.view)
          }
        })
      }
      return
    }
    this.pos = pos
    const own = parseWrapPoints(node.attrs.wrapPoints)
    this.points = own.length > 0 ? own : polygonOfRows(autoContourOf(node))
    const dom = this.view.nodeDOM(pos)
    this.mark(dom instanceof HTMLElement ? dom : null)
    this.root.hidden = false
    this.place()
    this.draw()
  }

  private isSelected(pos: number) {
    const selection = this.view.state.selection
    return selection instanceof NodeSelection && selection.from === pos
  }

  private place = () => {
    if (this.pos == null) {
      return
    }
    const dom = this.view.nodeDOM(this.pos)
    if (!(dom instanceof HTMLElement)) {
      return
    }
    const box = dom.getBoundingClientRect()
    this.frame = { left: box.left, top: box.top, width: Math.max(1, box.width), height: Math.max(1, box.height) }
    Object.assign(this.root.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    })
  }

  private draw() {
    const list = this.points.map(([x, y]) => `${x},${y}`).join(" ")
    this.outline.setAttribute("points", list)
    this.target.setAttribute("points", list)
    while (this.handles.length < this.points.length) {
      const handle = document.createElement("div")
      handle.className = "edit-points-handle"
      handle.addEventListener("pointerdown", this.onHandleDown)
      this.root.append(handle)
      this.handles.push(handle)
    }
    this.handles.forEach((handle, index) => {
      const point = this.points[index]
      handle.hidden = !point
      if (point) {
        handle.dataset.index = String(index)
        handle.style.left = `${(point[0] / WRAP_BOX) * 100}%`
        handle.style.top = `${(point[1] / WRAP_BOX) * 100}%`
      }
    })
  }

  /** A point under the pointer, in Word's box. */
  private boxPoint(clientX: number, clientY: number): WrapPoint {
    return [
      ((clientX - this.frame.left) / this.frame.width) * WRAP_BOX,
      ((clientY - this.frame.top) / this.frame.height) * WRAP_BOX,
    ]
  }

  private commit(points: WrapPoint[]) {
    const pos = this.pos
    const node = pos == null ? null : this.view.state.doc.nodeAt(pos)
    if (pos == null || !node) {
      return
    }
    const value = wrapPointsString(points)
    const tr = this.view.state.tr
    if (value !== node.attrs.wrapPoints || node.attrs.wrapEdited !== true) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, wrapPoints: value, wrapEdited: true })
    }
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    // Each change is its own undo step.
    this.view.dispatch(closeHistory(tr))
  }

  /** Follows the pointer with the point at `index` until it is let go, then writes the outline as one step. */
  private dragPoint(index: number, start: WrapPoint[], event: PointerEvent, changed: boolean) {
    this.pressing = true
    const startX = event.clientX
    const startY = event.clientY
    const origin = start[index]!
    let latest = start
    const move = (moved: PointerEvent) => {
      const dx = ((moved.clientX - startX) / this.frame.width) * WRAP_BOX
      const dy = ((moved.clientY - startY) / this.frame.height) * WRAP_BOX
      latest = start.map((point, at) =>
        at === index ? [Math.round(origin[0] + dx), Math.round(origin[1] + dy)] : point,
      )
      this.points = latest
      this.draw()
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      this.pressing = false
      if (latest !== start || changed) {
        this.commit(latest)
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  private onHandleDown = (event: PointerEvent) => {
    const index = Number((event.currentTarget as HTMLElement).dataset.index)
    if (event.button !== 0 || !Number.isFinite(index)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.ctrlKey || event.metaKey) {
      const next = deleteWrapPoint(this.points, index)
      if (next !== this.points) {
        this.commit(next)
      }
      return
    }
    this.dragPoint(index, this.points, event, false)
  }

  /** A press on the outline adds a point there, which the drag then moves, as in Word. */
  private onOutlineDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const reach = (REACH / Math.min(this.frame.width, this.frame.height)) * WRAP_BOX
    const added = insertWrapPoint(this.points, this.boxPoint(event.clientX, event.clientY), reach)
    if (!added) {
      return
    }
    this.points = added.points
    this.draw()
    this.dragPoint(added.index, added.points, event, true)
  }

  private onAnyDown = (event: PointerEvent) => {
    if (this.pos == null || !(event.target instanceof Node)) {
      return
    }
    const dom = this.view.nodeDOM(this.pos)
    if (this.root.contains(event.target) || (dom instanceof Node && dom.contains(event.target))) {
      return
    }
    stopEditWrapPoints(this.view)
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.pos != null) {
      event.preventDefault()
      event.stopPropagation()
      stopEditWrapPoints(this.view)
    }
  }

  destroy() {
    this.mark(null)
    window.removeEventListener("keydown", this.onKey, true)
    window.removeEventListener("scroll", this.place, true)
    window.removeEventListener("resize", this.place)
    window.removeEventListener("pointerdown", this.onAnyDown, true)
    this.root.remove()
  }
}

export const EditWrapPoints = Extension.create({
  name: "editWrapPoints",

  addProseMirrorPlugins() {
    return [
      new Plugin<{ pos: number | null }>({
        key,
        state: {
          init: () => ({ pos: null }),
          apply(tr, value) {
            const meta = tr.getMeta(key) as { pos: number | null } | undefined
            if (meta) {
              return { pos: meta.pos }
            }
            return value.pos == null ? value : { pos: tr.mapping.map(value.pos) }
          },
        },
        view: (view) => {
          const overlay = new WrapPointsOverlay(view)
          overlay.update()
          return { update: () => overlay.update(), destroy: () => overlay.destroy() }
        },
      }),
    ]
  },
})
