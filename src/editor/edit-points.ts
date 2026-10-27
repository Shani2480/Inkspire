import { openCommandMenu, type MenuItem } from "@/components/command-menu"
import { useViewStore } from "@/document/view"
import { shapeMarkup, shapeViewBox } from "@/editor/insert-blocks"
import { isFloating } from "@/editor/objects"
import {
  POINTS_BOX,
  addPoint,
  anchorsOf,
  bendSegment,
  closePath,
  deletePoint,
  deleteSegment,
  figureOf,
  fitPoints,
  handlesAt,
  moveHandle,
  movePoint,
  nearestSegment,
  openPath,
  parsePath,
  pathString,
  pointKind,
  pointsFromMarkup,
  setPointKind,
  setSegmentKind,
  type PointKind,
  type Segment,
} from "@/editor/shape-points"
import { Extension, type Editor } from "@tiptap/core"
import { closeHistory } from "@tiptap/pm/history"
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/**
 * Word's Edit Points (Shape Format → Edit Shape, or the shape's right-click menu): black handles on each point of the
 * shape's outline. Drag one to move it (one undo step a drag), Ctrl+click a point to delete it, Ctrl+click the
 * outline to add one, drag the outline to bend it. A point clicked shows its curve handles, to drag; right-click a point or the outline for
 * Word's menu (Smooth, Straight and Corner Point; Straight and Curved Segment; Open and Close Path; Delete Segment).
 * Escape, or a click away from the shape, ends it. A gallery shape becomes points when it begins.
 */

const key = new PluginKey<{ pos: number | null }>("editPoints")

/** Whether the selected shape can have its points edited: a drawn shape (not text, an icon or a chart). */
export function canEditPoints(editor: Editor | null) {
  const selection = editor?.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "figure") {
    return false
  }
  const { kind, variant, points } = selection.node.attrs
  return kind === "shape" && (Boolean(points) || pointsFromMarkup(shapeMarkup(String(variant)), "0 0 80 56") !== null)
}

/**
 * Convert to Freeform: turns the selected gallery shape into points, drawn the same, so it saves as Word's freeform
 * (`a:custGeom`). Gives the transaction, not yet dispatched; null when the shape cannot be.
 */
function toPoints(editor: Editor) {
  const selection = editor.state.selection
  if (!canEditPoints(editor) || !(selection instanceof NodeSelection)) {
    return null
  }
  const node = selection.node
  const tr = editor.state.tr
  if (!node.attrs.points) {
    const variant = String(node.attrs.variant)
    const segments = pointsFromMarkup(shapeMarkup(variant), shapeViewBox(variant))
    if (!segments) {
      return null
    }
    tr.setNodeMarkup(selection.from, undefined, { ...node.attrs, points: pathString(segments) })
    tr.setSelection(NodeSelection.create(tr.doc, selection.from))
  }
  return tr
}

/** Whether the selected shape is still a gallery shape that Convert to Freeform would turn into points. */
export function canConvertToFreeform(editor: Editor | null) {
  return canEditPoints(editor) && !(editor!.state.selection as NodeSelection).node.attrs.points
}

export function convertToFreeform(editor: Editor) {
  const tr = toPoints(editor)
  if (tr?.docChanged) {
    editor.view.dispatch(tr)
  }
  return Boolean(tr?.docChanged)
}

/** Starts Edit Points on the selected shape, turning it into points first if it is a gallery shape. */
export function startEditPoints(editor: Editor) {
  const tr = toPoints(editor)
  if (!tr) {
    return false
  }
  editor.view.dispatch(tr.setMeta(key, { pos: editor.state.selection.from }))
  return true
}

export function stopEditPoints(view: EditorView) {
  if (key.getState(view.state)?.pos != null) {
    view.dispatch(view.state.tr.setMeta(key, { pos: null }))
  }
}

export function editingPointsAt(view: EditorView) {
  return key.getState(view.state)?.pos ?? null
}

/** How near (in screen pixels) a Ctrl+click must be to the outline to add a point there. */
const REACH = 6

class PointsOverlay {
  private readonly root: HTMLDivElement
  private readonly outline: SVGPathElement
  private readonly target: SVGPathElement
  private handles: HTMLDivElement[] = []
  /** The picked point's curve handles, coming in and going out, and the lines to them. */
  private readonly tangentLine: SVGPathElement
  private readonly tangents: Record<"in" | "out", HTMLDivElement>
  /** The point picked last (its segment's index), whose curve handles show. */
  private selected: number | null = null
  /** Kinds set from the menu this session: a Corner point keeps its handles apart even while they are in line. */
  private kinds = new Map<number, PointKind>()
  private pos: number | null = null
  /** A handle or the outline is being pressed: the shape may lose its selection meanwhile, which must not end it. */
  private pressing = false
  private segments: Segment[] = []
  private frame = { left: 0, top: 0, width: 0, height: 0, rotate: 0, flipH: false, flipV: false }

  constructor(private readonly view: EditorView) {
    this.root = document.createElement("div")
    this.root.className = "edit-points"
    this.root.hidden = true
    const svgNs = "http://www.w3.org/2000/svg"
    const svg = document.createElementNS(svgNs, "svg")
    svg.setAttribute("viewBox", `0 0 ${POINTS_BOX} ${POINTS_BOX}`)
    svg.setAttribute("preserveAspectRatio", "none")
    this.outline = document.createElementNS(svgNs, "path")
    this.outline.setAttribute("class", "edit-points-outline")
    this.outline.setAttribute("vector-effect", "non-scaling-stroke")
    // A wide invisible stroke to Ctrl+click on when adding a point.
    this.target = document.createElementNS(svgNs, "path")
    this.target.setAttribute("class", "edit-points-target")
    this.target.setAttribute("vector-effect", "non-scaling-stroke")
    this.target.style.strokeWidth = `${REACH * 2}px`
    this.tangentLine = document.createElementNS(svgNs, "path")
    this.tangentLine.setAttribute("class", "edit-points-tangent-line")
    this.tangentLine.setAttribute("vector-effect", "non-scaling-stroke")
    svg.append(this.outline, this.tangentLine, this.target)
    this.root.append(svg)
    const tangent = (side: "in" | "out") => {
      const handle = document.createElement("div")
      handle.className = "edit-points-tangent"
      handle.hidden = true
      handle.addEventListener("pointerdown", (event) => this.onTangentDown(event, side))
      this.root.append(handle)
      return handle
    }
    this.tangents = { in: tangent("in"), out: tangent("out") }
    this.root.addEventListener("contextmenu", this.onMenu)
    document.body.append(this.root)
    this.target.addEventListener("pointerdown", this.onOutlineDown)
    // A press here must not move the page's text selection: that would deselect the shape and end Edit Points.
    this.root.addEventListener("mousedown", (event) => event.preventDefault())
    window.addEventListener("scroll", this.place, true)
    window.addEventListener("resize", this.place)
    window.addEventListener("pointerdown", this.onAnyDown, true)
    // Escape ends it wherever the focus is (the ribbon's Edit Points button keeps it after a click).
    window.addEventListener("keydown", this.onKey, true)
  }

  /** The shape being edited is marked, so its resize and rotate handles step aside for the points, as in Word. */
  private marked: HTMLElement | null = null

  private mark(dom: HTMLElement | null) {
    if (this.marked !== dom) {
      this.marked?.removeAttribute("data-editing-points")
      this.marked = dom
    }
    dom?.setAttribute("data-editing-points", "")
  }

  update() {
    this.mark(null)
    const pos = editingPointsAt(this.view)
    const node = pos == null ? null : this.view.state.doc.nodeAt(pos)
    if (pos == null || !node || node.type.name !== "figure" || !node.attrs.points) {
      this.pos = null
      this.selected = null
      this.kinds.clear()
      this.root.hidden = true
      return
    }
    const selection = this.view.state.selection
    if (!this.pressing && !(selection instanceof NodeSelection && selection.from === pos)) {
      // Selecting something else ends it (after this update: a view update must not dispatch).
      this.pos = null
      this.root.hidden = true
      queueMicrotask(() => {
        const now = this.view.state.selection
        if (editingPointsAt(this.view) === pos && !(now instanceof NodeSelection && now.from === pos)) {
          stopEditPoints(this.view)
        }
      })
      return
    }
    this.pos = pos
    const dom = this.view.nodeDOM(pos)
    this.mark(dom instanceof HTMLElement ? dom : null)
    this.segments = parsePath(String(node.attrs.points))
    this.frame.rotate = Number(node.attrs.rotate) || 0
    this.frame.flipH = Boolean(node.attrs.flipH)
    this.frame.flipV = Boolean(node.attrs.flipV)
    this.root.hidden = false
    this.place()
    this.draw()
  }

  /** Lays the overlay over the shape as it is on screen: its size at this zoom, turned and flipped with it. */
  private place = () => {
    if (this.pos == null) {
      return
    }
    const dom = this.view.nodeDOM(this.pos)
    const svg = dom instanceof HTMLElement ? dom.querySelector("svg") : null
    const node = this.view.state.doc.nodeAt(this.pos)
    if (!svg || !node) {
      return
    }
    const zoom = useViewStore.getState().zoom || 1
    const box = svg.getBoundingClientRect()
    const width = (Number(node.attrs.width) || box.width / zoom) * zoom
    const height = (Number(node.attrs.height) || box.height / zoom) * zoom
    this.frame = {
      ...this.frame,
      left: box.left + box.width / 2 - width / 2,
      top: box.top + box.height / 2 - height / 2,
      width,
      height,
    }
    const flip = `scale(${this.frame.flipH ? -1 : 1}, ${this.frame.flipV ? -1 : 1})`
    Object.assign(this.root.style, {
      left: `${this.frame.left}px`,
      top: `${this.frame.top}px`,
      width: `${width}px`,
      height: `${height}px`,
      transform: `rotate(${this.frame.rotate}deg) ${flip}`,
    })
  }

  private draw() {
    const d = pathString(this.segments)
    this.outline.setAttribute("d", d)
    this.target.setAttribute("d", d)
    const anchors = anchorsOf(this.segments)
    while (this.handles.length < anchors.length) {
      const handle = document.createElement("div")
      handle.className = "edit-points-handle"
      handle.addEventListener("pointerdown", this.onHandleDown)
      this.root.append(handle)
      this.handles.push(handle)
    }
    const place = (element: HTMLElement, at: [number, number]) => {
      element.style.left = `${(at[0] / POINTS_BOX) * 100}%`
      element.style.top = `${(at[1] / POINTS_BOX) * 100}%`
    }
    this.handles.forEach((handle, index) => {
      const anchor = anchors[index]
      handle.hidden = !anchor
      if (anchor) {
        handle.dataset.index = String(anchor.index)
        handle.toggleAttribute("data-selected", anchor.index === this.selected)
        place(handle, anchor.at)
      }
    })
    // The picked point's curve handles, where curves meet it.
    const picked = anchors.some((anchor) => anchor.index === this.selected) ? this.selected : null
    const handles = picked == null ? null : handlesAt(this.segments, picked)
    let lines = ""
    for (const side of ["in", "out"] as const) {
      const handle = handles?.[side]
      this.tangents[side].hidden = !handle
      if (handles && handle) {
        place(this.tangents[side], handle.at)
        lines += `M${handles.at[0]} ${handles.at[1]} L${handle.at[0]} ${handle.at[1]} `
      }
    }
    this.tangentLine.setAttribute("d", lines.trim())
  }

  /** Screen movement as movement in the points' box, undoing the shape's turn and flips. */
  private toBox(dx: number, dy: number): [number, number] {
    const turn = (-this.frame.rotate * Math.PI) / 180
    let x = dx * Math.cos(turn) - dy * Math.sin(turn)
    let y = dx * Math.sin(turn) + dy * Math.cos(turn)
    if (this.frame.flipH) {
      x = -x
    }
    if (this.frame.flipV) {
      y = -y
    }
    return [(x / this.frame.width) * POINTS_BOX, (y / this.frame.height) * POINTS_BOX]
  }

  /** A point under the pointer, in the points' box. */
  private boxPoint(clientX: number, clientY: number): [number, number] {
    const cx = this.frame.left + this.frame.width / 2
    const cy = this.frame.top + this.frame.height / 2
    const [x, y] = this.toBox(clientX - cx, clientY - cy)
    return [x + POINTS_BOX / 2, y + POINTS_BOX / 2]
  }

  /** Shows the shape with `segments` straight away, before the change is written. */
  private preview(segments: Segment[]) {
    this.segments = segments
    this.draw()
    const dom = this.pos == null ? null : this.view.nodeDOM(this.pos)
    const path = dom instanceof HTMLElement ? dom.querySelector("path[data-shape-points]") : null
    path?.setAttribute("d", pathString(segments))
  }

  private commit(segments: Segment[]) {
    const pos = this.pos
    const node = pos == null ? null : this.view.state.doc.nodeAt(pos)
    if (pos == null || !node) {
      return
    }
    const tr = this.view.state.tr
    const attrs: Record<string, unknown> = { ...node.attrs, points: pathString(segments) }
    // The box fits the outline again, as Word's does: a point dragged out grows it, one pulled in shrinks it.
    const zoom = useViewStore.getState().zoom || 1
    const fit = fitPoints(segments, {
      width: Number(node.attrs.width) || this.frame.width / zoom,
      height: Number(node.attrs.height) || this.frame.height / zoom,
      rotate: this.frame.rotate,
      flipH: this.frame.flipH,
      flipV: this.frame.flipV,
    })
    if (fit) {
      Object.assign(attrs, {
        points: pathString(fit.segments),
        width: Math.round(fit.width * 100) / 100,
        height: Math.round(fit.height * 100) / 100,
      })
      // A floating shape's corner moves so the outline stays where it was drawn; an inline one flows with the text.
      if (isFloating(node)) {
        if (!node.attrs.alignH) {
          attrs.x = Number(node.attrs.x) + fit.dx
        }
        if (!node.attrs.alignV) {
          if (node.attrs.anchoring === "fixed") {
            attrs.y = Number(node.attrs.y) + fit.dy
          } else {
            attrs.dy = Number(node.attrs.dy) + fit.dy
          }
        }
      }
    }
    if (Object.keys(attrs).some((name) => attrs[name] !== node.attrs[name])) {
      tr.setNodeMarkup(pos, undefined, attrs)
    }
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    // Each change is its own undo step, however quickly they follow one another.
    this.view.dispatch(closeHistory(tr))
  }

  private onHandleDown = (event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement
    const index = Number(handle.dataset.index)
    if (event.button !== 0 || !Number.isFinite(index)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.ctrlKey || event.metaKey) {
      this.reshape(deletePoint(this.segments, index))
      return
    }
    this.selected = index
    this.draw()
    this.pressing = true
    const start = this.segments
    const startX = event.clientX
    const startY = event.clientY
    let latest = start
    const move = (moved: PointerEvent) => {
      const [dx, dy] = this.toBox(moved.clientX - startX, moved.clientY - startY)
      latest = movePoint(start, index, dx, dy)
      this.preview(latest)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      this.pressing = false
      this.commit(latest)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  /** Ctrl+click on the outline adds a point; a drag bends the line or curve under the pointer, as in Word. */
  private onOutlineDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const [x, y] = this.boxPoint(event.clientX, event.clientY)
    const reach = (REACH / Math.min(this.frame.width, this.frame.height)) * POINTS_BOX
    if (event.ctrlKey || event.metaKey) {
      const added = addPoint(this.segments, x, y, reach)
      if (added) {
        this.reshape(added)
      }
      return
    }
    const found = nearestSegment(this.segments, x, y)
    if (!found || found.distance > reach) {
      return
    }
    this.pressing = true
    const start = this.segments
    const startX = event.clientX
    const startY = event.clientY
    let latest = start
    const move = (moved: PointerEvent) => {
      const [dx, dy] = this.toBox(moved.clientX - startX, moved.clientY - startY)
      latest = bendSegment(start, found.index, found.t, dx, dy)
      this.preview(latest)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      this.pressing = false
      if (latest === start) {
        return
      }
      // A close's line bent becomes a curve of its own: the points after it move along.
      if (latest.length !== start.length) {
        this.reshape(latest)
      } else {
        this.commit(latest)
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  /** A change that adds or takes away points: the picked point and the kinds set by index no longer apply. */
  private reshape(segments: Segment[]) {
    if (segments === this.segments) {
      return
    }
    this.selected = null
    this.kinds.clear()
    this.commit(segments)
  }

  /** Dragging one of the picked point's curve handles, its other handle following by the point's kind. */
  private onTangentDown = (event: PointerEvent, side: "in" | "out") => {
    const index = this.selected
    if (event.button !== 0 || index == null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    this.pressing = true
    const start = this.segments
    const kind = this.kinds.get(index) ?? pointKind(start, index)
    const startX = event.clientX
    const startY = event.clientY
    let latest = start
    const move = (moved: PointerEvent) => {
      const [dx, dy] = this.toBox(moved.clientX - startX, moved.clientY - startY)
      latest = moveHandle(start, index, side, dx, dy, kind)
      this.preview(latest)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      this.pressing = false
      if (latest !== start) {
        this.commit(latest)
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  /** Word's right-click menus: one for a point, one for the line or curve between two. */
  private onMenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const segments = this.segments
    const exit: MenuItem = { label: "Exit Edit Points", run: () => stopEditPoints(this.view) }
    const handle = event.target instanceof Element ? event.target.closest<HTMLElement>(".edit-points-handle") : null
    if (handle) {
      const index = Number(handle.dataset.index)
      this.selected = index
      this.draw()
      const closed = figureOf(segments, index).closed
      const kind = (next: PointKind) => () => {
        const changed = setPointKind(this.segments, index, next)
        if (changed.length !== this.segments.length) {
          // A close's line became a curve of its own: the points after this one have moved along.
          this.kinds.clear()
        }
        this.kinds.set(index, next)
        if (changed !== this.segments) {
          this.commit(changed)
        }
      }
      openCommandMenu(
        [
          { label: "Delete Point", run: () => this.reshape(deletePoint(this.segments, index)) },
          { label: "Open Path", disabled: !closed, run: () => this.reshape(openPath(this.segments, index)) },
          { label: "Close Path", disabled: closed, run: () => this.reshape(closePath(this.segments, index)) },
          "-",
          { label: "Smooth Point", run: kind("smooth") },
          { label: "Straight Point", run: kind("straight") },
          { label: "Corner Point", run: kind("corner") },
          "-",
          exit,
        ],
        event.clientX,
        event.clientY,
        "Edit Points",
      )
      return
    }
    const [x, y] = this.boxPoint(event.clientX, event.clientY)
    const reach = (REACH / Math.min(this.frame.width, this.frame.height)) * POINTS_BOX
    const found = nearestSegment(segments, x, y)
    if (!found || found.distance > reach) {
      return
    }
    const segment = segments[found.index]!
    const closed = figureOf(segments, found.index).closed
    openCommandMenu(
      [
        { label: "Add Point", run: () => this.reshape(addPoint(this.segments, x, y, reach) ?? this.segments) },
        { label: "Delete Segment", run: () => this.reshape(deleteSegment(this.segments, found.index)) },
        {
          label: "Open Path",
          disabled: !closed,
          // Cut where it was clicked: a point is added there, and the path opens at it.
          run: () => {
            const added = addPoint(this.segments, x, y, reach)
            this.reshape(added ? openPath(added, found.index) : this.segments)
          },
        },
        { label: "Close Path", disabled: closed, run: () => this.reshape(closePath(this.segments, found.index)) },
        "-",
        {
          label: "Straight Segment",
          disabled: segment.kind !== "C",
          run: () => this.commit(setSegmentKind(this.segments, found.index, "straight")),
        },
        {
          label: "Curved Segment",
          disabled: segment.kind === "C",
          run: () => this.reshape(setSegmentKind(this.segments, found.index, "curved")),
        },
        "-",
        exit,
      ],
      event.clientX,
      event.clientY,
      "Edit Points",
    )
  }

  /** A press away from the shape and its handles ends Edit Points, as in Word. */
  private onAnyDown = (event: PointerEvent) => {
    if (this.pos == null || !(event.target instanceof Node)) {
      return
    }
    const dom = this.view.nodeDOM(this.pos)
    const onMenu = event.target instanceof Element && event.target.closest(".command-menu, .command-menu-backdrop")
    if (onMenu || this.root.contains(event.target) || (dom instanceof Node && dom.contains(event.target))) {
      return
    }
    stopEditPoints(this.view)
  }

  private onKey = (event: KeyboardEvent) => {
    // With a menu open, Escape closes the menu alone.
    if (event.key === "Escape" && this.pos != null && !document.querySelector(".command-menu")) {
      event.preventDefault()
      event.stopPropagation()
      stopEditPoints(this.view)
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

export const EditPoints = Extension.create({
  name: "editPoints",

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
            if (value.pos == null) {
              return value
            }
            // Selecting something else ends it too, which the overlay sees to: a press on a handle can move the
            // selection for a moment.
            const pos = tr.mapping.map(value.pos)
            return tr.doc.nodeAt(pos)?.type.name === "figure" ? { pos } : { pos: null }
          },
        },
        view: (view) => {
          const overlay = new PointsOverlay(view)
          overlay.update()
          return { update: () => overlay.update(), destroy: () => overlay.destroy() }
        },
      }),
    ]
  },
})
