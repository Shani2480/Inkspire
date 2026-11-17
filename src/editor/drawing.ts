import { objectBox, objectLayoutAttributes } from "@/editor/object-frame"
import { PX_PER_MM } from "@/document/measure"
import { Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { getStroke } from "perfect-freehand"
import { create } from "zustand"
import { lassoPicks, movePath, movePoints, snapToRuler, strokeHit, strokesBox, type Ruler } from "@/editor/ink-geometry"

/** Select, the pens (Pen, Pencil, Highlighter: the chosen pen of that kind), Eraser and Lasso Select. */
export type DrawTool = "select" | "pen" | "pencil" | "highlighter" | "eraser" | "lasso"
export type PenKind = "pen" | "pencil" | "highlighter"

export type DrawingStroke = {
  tool: PenKind
  widthMm: number
  color: string
  d: string
  /** The points drawn, [x, y, pressure, milliseconds from the stroke's start] (strokes drawn before had none). */
  points?: number[][]
}

/** One pen in the Draw tab's gallery: what it draws, its colour and its thickness. */
export type Pen = { id: string; kind: PenKind; color: string; widthMm: number }

export const CANVAS_WIDTH = 480
export const CANVAS_HEIGHT = 260
export const PEN_COLORS = ["#242424", "#0f6cbd", "#d13438", "#107c10"]
export const HIGHLIGHTER_COLORS = ["#ffe600", "#7fdb6a", "#ff99d6", "#7eb6ff"]
/** The colours a pen's menu offers, as Word's: black, white, greys, then the bright colours. */
export const INK_COLORS = [
  "#000000",
  "#ffffff",
  "#7f7f7f",
  "#c00000",
  "#ff0000",
  "#ffc000",
  "#ffff00",
  "#92d050",
  "#00b050",
  "#00b0f0",
  "#0070c0",
  "#002060",
  "#7030a0",
  "#ff66cc",
  "#996633",
  "#5b9bd5",
]
/** Word's thicknesses, in millimetres: a pen's and a highlighter's. */
export const PEN_MM = [0.25, 0.35, 0.5, 0.75, 1, 2, 3.5]
export const HIGHLIGHTER_MM = [2, 4, 6, 8, 10]

/** Word's pens in a new Draw tab: a black pen, a red pen, a pencil and a yellow highlighter. */
export const DEFAULT_PENS: Pen[] = [
  { id: "pen-black", kind: "pen", color: "#000000", widthMm: 0.5 },
  { id: "pen-red", kind: "pen", color: "#ff0000", widthMm: 0.5 },
  { id: "pencil-grey", kind: "pencil", color: "#7f7f7f", widthMm: 1 },
  { id: "highlighter-yellow", kind: "highlighter", color: "#ffff00", widthMm: 6 },
]

const MIN_MM = 0.25
const MAX_MM = 20
const PENS_KEY = "inkspire:pens"

type DrawState = {
  tool: DrawTool
  pens: Pen[]
  /** The pen drawing when the tool is a pen kind. */
  penId: string
  /** The Ruler on the canvas, when shown. */
  ruler: Ruler | null
  /** The strokes Lasso Select holds, on the canvas at `pos`. */
  picked: { pos: number; indices: number[] } | null
  setPicked: (picked: { pos: number; indices: number[] } | null) => void
  setTool: (tool: DrawTool) => void
  choosePen: (id: string) => void
  addPen: (kind: PenKind) => void
  updatePen: (id: string, change: Partial<Pick<Pen, "color" | "widthMm">>) => void
  removePen: (id: string) => void
  setRuler: (ruler: Ruler | null) => void
  setWidthMm: (widthMm: number) => void
  setColor: (color: string) => void
}

function loadPens(): Pen[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PENS_KEY) ?? "null") as unknown
    if (Array.isArray(saved)) {
      const pens = saved.filter(
        (pen): pen is Pen =>
          Boolean(pen) &&
          typeof pen.id === "string" &&
          ["pen", "pencil", "highlighter"].includes(pen.kind) &&
          typeof pen.color === "string" &&
          typeof pen.widthMm === "number",
      )
      if (pens.length) {
        return pens
      }
    }
  } catch {
    // No saved pens (or no storage): Word's own.
  }
  return DEFAULT_PENS.map((pen) => ({ ...pen }))
}

function savePens(pens: Pen[]) {
  try {
    localStorage.setItem(PENS_KEY, JSON.stringify(pens))
  } catch {
    // The pens last this session only.
  }
}

/** The pen drawing now: the chosen one, else the first. */
export function activePen(state: Pick<DrawState, "pens" | "penId">): Pen {
  return state.pens.find((pen) => pen.id === state.penId) ?? state.pens[0] ?? DEFAULT_PENS[0]!
}

function isPenKind(tool: DrawTool): tool is PenKind {
  return tool === "pen" || tool === "pencil" || tool === "highlighter"
}

export const useDrawStore = create<DrawState>((set) => {
  const pens = loadPens()
  const changePens = (next: Pen[]) => {
    savePens(next)
    return next
  }
  return {
    tool: "select",
    pens,
    penId: pens[0]!.id,
    ruler: null,
    picked: null,
    setPicked: (picked) => set({ picked }),
    setTool: (tool) =>
      set((state) => {
        if (!isPenKind(tool)) {
          return tool === "lasso" ? { tool } : { tool, picked: null }
        }
        // "Pen" or "Highlighter" from a menu: the chosen pen if it is one, else the first of that kind.
        const current = activePen(state)
        const pen = current.kind === tool ? current : state.pens.find((item) => item.kind === tool)
        if (pen) {
          return { tool, penId: pen.id }
        }
        const added: Pen = { ...DEFAULT_PENS.find((item) => item.kind === tool)!, id: `${tool}-${Date.now()}` }
        return { tool, pens: changePens([...state.pens, added]), penId: added.id }
      }),
    choosePen: (id) =>
      set((state) => {
        const pen = state.pens.find((item) => item.id === id)
        return pen ? { tool: pen.kind, penId: pen.id } : {}
      }),
    addPen: (kind) =>
      set((state) => {
        const like = DEFAULT_PENS.find((item) => item.kind === kind)!
        const pen: Pen = { ...like, id: `${kind}-${Date.now()}` }
        return { pens: changePens([...state.pens, pen]), penId: pen.id, tool: kind }
      }),
    updatePen: (id, change) =>
      set((state) => ({
        pens: changePens(
          state.pens.map((pen) =>
            pen.id === id
              ? {
                  ...pen,
                  ...change,
                  ...(change.widthMm !== undefined ? { widthMm: clampMm(change.widthMm) } : {}),
                }
              : pen,
          ),
        ),
      })),
    removePen: (id) =>
      set((state) => {
        if (state.pens.length <= 1) {
          return {}
        }
        const next = changePens(state.pens.filter((pen) => pen.id !== id))
        const removed = state.penId === id
        return removed
          ? { pens: next, penId: next[0]!.id, tool: isPenKind(state.tool) ? next[0]!.kind : state.tool }
          : { pens: next }
      }),
    setRuler: (ruler) => set({ ruler }),
    setWidthMm: (widthMm) =>
      set((state) => {
        const pen = activePen(state)
        return {
          pens: changePens(
            state.pens.map((item) => (item.id === pen.id ? { ...item, widthMm: clampMm(widthMm) } : item)),
          ),
        }
      }),
    setColor: (color) =>
      set((state) => {
        const pen = activePen(state)
        return { pens: changePens(state.pens.map((item) => (item.id === pen.id ? { ...item, color } : item))) }
      }),
  }
})

export function activeWidthMm(state: Pick<DrawState, "pens" | "penId">) {
  return activePen(state).widthMm
}

export function activeColor(state: Pick<DrawState, "pens" | "penId">) {
  return activePen(state).color
}

export function parseStrokes(value: unknown): DrawingStroke[] {
  if (typeof value !== "string" || value.length === 0) {
    return []
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return []
      }
      const stroke = item as Partial<DrawingStroke>
      if (
        (stroke.tool !== "pen" && stroke.tool !== "pencil" && stroke.tool !== "highlighter") ||
        typeof stroke.d !== "string" ||
        stroke.d.length === 0
      ) {
        return []
      }
      return [
        {
          tool: stroke.tool,
          widthMm: typeof stroke.widthMm === "number" ? stroke.widthMm : 0.5,
          color: typeof stroke.color === "string" ? stroke.color : "#242424",
          d: stroke.d,
          ...(Array.isArray(stroke.points) &&
          stroke.points.every((point) => Array.isArray(point) && point.every((value) => typeof value === "number"))
            ? { points: stroke.points }
            : {}),
        },
      ]
    })
  } catch {
    return []
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    drawingCanvas: {
      insertDrawingCanvas: () => ReturnType
    }
  }
}

export const DrawingCanvas = Node.create({
  name: "drawingCanvas",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      strokes: {
        default: "[]",
        parseHTML: (element) => element.getAttribute("data-strokes") || "[]",
        renderHTML: (attributes) => ({ "data-strokes": attributes.strokes || "[]" }),
      },
      ...objectLayoutAttributes(),
    }
  },
  parseHTML() {
    return [{ tag: "div[data-drawing]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const paths = parseStrokes(node.attrs.strokes).map((stroke) => ["path", strokeAttributes(stroke)])
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-drawing": "", class: "drawing-canvas" }),
      ["svg", { viewBox: `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`, width: "100%", height: "100%" }, ...paths],
    ]
  },
  addCommands() {
    return {
      insertDrawingCanvas:
        () =>
        ({ state, tr }) => {
          const type = state.schema.nodes.drawingCanvas
          if (!type) {
            return false
          }
          insertSelectableBlock(state, tr, type.create())
          useDrawStore.getState().setTool("pen")
          return true
        },
    }
  },
  addKeyboardShortcuts() {
    // Strokes the lasso holds: Delete removes them (not the canvas), Esc lets go of them.
    const removePicked = () => {
      const picked = useDrawStore.getState().picked
      const selection = this.editor.state.selection
      if (!picked?.indices.length || !(selection instanceof NodeSelection) || selection.from !== picked.pos) {
        return false
      }
      const node = selection.node
      const strokes = parseStrokes(node.attrs.strokes).filter((_, index) => !picked.indices.includes(index))
      const tr = this.editor.state.tr.setNodeMarkup(picked.pos, undefined, {
        ...node.attrs,
        strokes: JSON.stringify(strokes),
      })
      tr.setSelection(NodeSelection.create(tr.doc, picked.pos))
      this.editor.view.dispatch(tr)
      useDrawStore.getState().setPicked(null)
      return true
    }
    return {
      Delete: removePicked,
      Backspace: removePicked,
      Escape: () => {
        if (!useDrawStore.getState().picked) {
          return false
        }
        useDrawStore.getState().setPicked(null)
        return true
      },
    }
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node
      let points: number[][] = []
      let started = 0
      // What a drag is doing: drawing, erasing, drawing a lasso, moving the lasso's strokes, or moving the Ruler.
      let gesture: "draw" | "erase" | "lasso" | "move" | "ruler" | null = null
      let erased: number[] = []
      let lasso: number[][] = []
      let from: number[] = [0, 0]
      let offset: number[] = [0, 0]
      let rulerStart: Ruler | null = null
      const position = () => {
        const pos = getPos()
        return typeof pos === "number" ? pos : undefined
      }
      const drawingTool = () => useDrawStore.getState().tool !== "select"
      // With a pen chosen a drag draws; the canvas then moves by its edges or with Alt.
      const box = objectBox("drawing", editor.view, position, {
        types: ["drawingCanvas"],
        inside: drawingTool,
      })
      const { dom, body } = box
      dom.setAttribute("data-drawing", "")
      body.classList.add("drawing-canvas")
      box.paint(node)
      const svg = document.createElementNS(SVG_NS, "svg")
      svg.setAttribute("viewBox", `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`)
      svg.setAttribute("width", "100%")
      svg.setAttribute("height", "100%")
      // The strokes stretch with the frame, so a point maps straight across.
      svg.setAttribute("preserveAspectRatio", "none")
      body.append(svg)

      const selected = () => {
        const pos = getPos()
        return (
          typeof pos === "number" &&
          editor.state.selection instanceof NodeSelection &&
          editor.state.selection.from === pos
        )
      }
      const picked = () => {
        const state = useDrawStore.getState().picked
        return state && state.pos === getPos() ? state.indices : []
      }

      const syncTool = () => {
        const tool = useDrawStore.getState().tool
        if (selected() && tool !== "select") {
          body.dataset.tool = tool
        } else {
          delete body.dataset.tool
        }
      }

      const paint = () => {
        svg.replaceChildren()
        const state = useDrawStore.getState()
        const strokes = parseStrokes(current.attrs.strokes)
        const held = picked()
        strokes.forEach((stroke, index) => {
          if (gesture === "erase" && erased.includes(index)) {
            return
          }
          const moving = gesture === "move" && held.includes(index)
          svg.append(strokeElement(moving ? { ...stroke, d: movePath(stroke.d, offset[0]!, offset[1]!) } : stroke))
        })
        if (gesture === "draw" && points.length > 0) {
          const pen = activePen(state)
          const d = strokeToPath(
            snapToRuler(points, rulerEdge(state.ruler, activePen(state))),
            pen.kind,
            pen.widthMm,
            false,
          )
          if (d) {
            svg.append(strokeElement({ tool: pen.kind, widthMm: pen.widthMm, color: pen.color, d }))
          }
        }
        if (held.length) {
          const bounds = strokesBox(held.map((index) => strokes[index]).filter((stroke) => stroke !== undefined))
          if (bounds) {
            const frame = document.createElementNS(SVG_NS, "rect")
            const dx = gesture === "move" ? offset[0]! : 0
            const dy = gesture === "move" ? offset[1]! : 0
            frame.setAttribute("x", String(bounds.x - 4 + dx))
            frame.setAttribute("y", String(bounds.y - 4 + dy))
            frame.setAttribute("width", String(bounds.width + 8))
            frame.setAttribute("height", String(bounds.height + 8))
            frame.setAttribute("class", "ink-lasso-frame")
            svg.append(frame)
          }
        }
        if (gesture === "lasso" && lasso.length > 1) {
          const line = document.createElementNS(SVG_NS, "polyline")
          line.setAttribute("points", lasso.map(([x, y]) => `${x},${y}`).join(" "))
          line.setAttribute("class", "ink-lasso-line")
          svg.append(line)
        }
        if (state.ruler) {
          svg.append(rulerElement(state.ruler))
        }
        syncTool()
      }

      const localPoint = (event: PointerEvent) => {
        const rect = svg.getBoundingClientRect()
        const width = rect.width || CANVAS_WIDTH
        const height = rect.height || CANVAS_HEIGHT
        const x = ((event.clientX - rect.left) / width) * CANVAS_WIDTH
        const y = ((event.clientY - rect.top) / height) * CANVAS_HEIGHT
        return [
          Math.round(x * 100) / 100,
          Math.round(y * 100) / 100,
          event.pressure > 0 ? Math.round(event.pressure * 100) / 100 : 0.5,
          Math.round(performance.now() - started),
        ]
      }

      // A change the canvas makes itself (a move) keeps what the lasso holds; any other change lets go of it.
      let own = false
      const save = (strokes: DrawingStroke[]) => {
        const pos = getPos()
        if (typeof pos !== "number") {
          return
        }
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, strokes: JSON.stringify(strokes) })
        const placed = tr.doc.nodeAt(pos)
        if (placed?.type.name === "drawingCanvas") {
          tr.setSelection(NodeSelection.create(tr.doc, pos))
        }
        own = true
        try {
          editor.view.dispatch(tr)
        } finally {
          own = false
        }
      }

      const finish = () => {
        const done = gesture
        gesture = null
        const strokes = parseStrokes(current.attrs.strokes)
        const state = useDrawStore.getState()
        if (done === "draw") {
          const pen = activePen(state)
          const line = snapToRuler(points, rulerEdge(state.ruler, activePen(state)))
          points = []
          const d = strokeToPath(line, pen.kind, pen.widthMm, true)
          paint()
          if (d) {
            save([...strokes, { tool: pen.kind, widthMm: pen.widthMm, color: pen.color, d, points: line }])
          }
        } else if (done === "erase") {
          const gone = erased
          erased = []
          paint()
          if (gone.length) {
            save(strokes.filter((_, index) => !gone.includes(index)))
          }
        } else if (done === "lasso") {
          const indices = lassoPicks(strokes, lasso)
          lasso = []
          const pos = getPos()
          state.setPicked(indices.length && typeof pos === "number" ? { pos, indices } : null)
          paint()
        } else if (done === "move") {
          const [dx, dy] = offset
          offset = [0, 0]
          const held = picked()
          if (dx || dy) {
            save(
              strokes.map((stroke, index) =>
                held.includes(index)
                  ? {
                      ...stroke,
                      d: movePath(stroke.d, dx!, dy!),
                      ...(stroke.points ? { points: movePoints(stroke.points, dx!, dy!) } : {}),
                    }
                  : stroke,
              ),
            )
          } else {
            paint()
          }
        } else {
          rulerStart = null
          paint()
        }
      }

      let erasedFrom: number[] | null = null
      // Along the whole swipe, not only where the pointer was seen: a quick swipe skips past a thin stroke.
      const eraseAt = (point: number[]) => {
        const strokes = parseStrokes(current.attrs.strokes)
        const start = erasedFrom ?? point
        const steps = Math.max(1, Math.ceil(Math.hypot(point[0]! - start[0]!, point[1]! - start[1]!) / 3))
        for (let step = 0; step <= steps; step += 1) {
          const x = start[0]! + ((point[0]! - start[0]!) * step) / steps
          const y = start[1]! + ((point[1]! - start[1]!) * step) / steps
          strokes.forEach((stroke, index) => {
            if (!erased.includes(index) && strokeHit(stroke, x, y, ERASER_RADIUS)) {
              erased.push(index)
            }
          })
        }
        erasedFrom = point
      }

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) {
          return
        }
        const onRuler = event.target instanceof Element && event.target.closest(".ink-ruler")
        const tool = useDrawStore.getState().tool
        if (tool === "select" && !onRuler) {
          return
        }
        const pos = getPos()
        if (typeof pos !== "number") {
          return
        }
        if (!selected()) {
          editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
        }
        event.preventDefault()
        event.stopPropagation()
        started = performance.now()
        const point = localPoint(event)
        if (onRuler) {
          gesture = "ruler"
          from = point
          rulerStart = useDrawStore.getState().ruler
        } else if (tool === "eraser") {
          gesture = "erase"
          erased = []
          erasedFrom = null
          eraseAt(point)
        } else if (tool === "lasso") {
          const strokes = parseStrokes(current.attrs.strokes)
          const held = picked()
          const bounds = strokesBox(held.map((index) => strokes[index]).filter((stroke) => stroke !== undefined))
          const inside =
            bounds &&
            point[0]! >= bounds.x - 4 &&
            point[0]! <= bounds.x + bounds.width + 4 &&
            point[1]! >= bounds.y - 4 &&
            point[1]! <= bounds.y + bounds.height + 4
          if (inside) {
            gesture = "move"
            from = point
            offset = [0, 0]
          } else {
            gesture = "lasso"
            lasso = [point]
            useDrawStore.getState().setPicked(null)
          }
        } else {
          gesture = "draw"
          points = [point]
        }
        try {
          svg.setPointerCapture(event.pointerId)
        } catch {
          // Synthetic events cannot capture the pointer. Element listeners still receive the gesture.
        }
        paint()
      }

      const onPointerMove = (event: PointerEvent) => {
        if (!gesture) {
          return
        }
        const point = localPoint(event)
        if (gesture === "draw") {
          points.push(point)
        } else if (gesture === "erase") {
          eraseAt(point)
        } else if (gesture === "lasso") {
          lasso.push(point)
        } else if (gesture === "move") {
          offset = [point[0]! - from[0]!, point[1]! - from[1]!]
        } else if (gesture === "ruler" && rulerStart) {
          useDrawStore.getState().setRuler({
            ...rulerStart,
            x: rulerStart.x + point[0]! - from[0]!,
            y: rulerStart.y + point[1]! - from[1]!,
          })
          return
        }
        paint()
      }

      const onPointerUp = (event: PointerEvent) => {
        if (!gesture) {
          return
        }
        try {
          if (svg.hasPointerCapture(event.pointerId)) {
            svg.releasePointerCapture(event.pointerId)
          }
        } catch {
          // Capture was never taken.
        }
        if (gesture === "draw") {
          points.push(localPoint(event))
        }
        finish()
      }

      // The mouse wheel over the Ruler turns it, a degree a notch (15 with Shift), as Word's.
      const onWheel = (event: WheelEvent) => {
        const ruler = useDrawStore.getState().ruler
        if (!ruler || !(event.target instanceof Element) || !event.target.closest(".ink-ruler")) {
          return
        }
        event.preventDefault()
        const step = (event.shiftKey ? 15 : 1) * Math.sign(event.deltaY || event.deltaX)
        useDrawStore.getState().setRuler({ ...ruler, angle: (((ruler.angle + step) % 360) + 360) % 360 })
      }

      const onMouseDown = (event: MouseEvent) => {
        const onRuler = event.target instanceof Element && event.target.closest(".ink-ruler")
        if (event.button !== 0 || (!drawingTool() && !onRuler)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
      }

      svg.addEventListener("pointerdown", onPointerDown)
      svg.addEventListener("pointermove", onPointerMove)
      svg.addEventListener("pointerup", onPointerUp)
      svg.addEventListener("pointercancel", onPointerUp)
      svg.addEventListener("wheel", onWheel, { passive: false })
      dom.addEventListener("mousedown", onMouseDown)
      const unsubscribe = useDrawStore.subscribe(paint)
      paint()

      return {
        dom,
        update(next) {
          if (next.type.name !== "drawingCanvas") {
            return false
          }
          if (next.attrs.strokes !== current.attrs.strokes && !gesture && !own) {
            // The strokes changed (undo, another edit): what the lasso held is no longer the same strokes.
            const held = useDrawStore.getState().picked
            if (held && held.pos === getPos()) {
              current = next
              useDrawStore.getState().setPicked(null)
            }
          }
          current = next
          box.paint(next)
          paint()
          return true
        },
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
          body.classList.add("ProseMirror-selectednode")
          syncTool()
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
          body.classList.remove("ProseMirror-selectednode")
          const held = useDrawStore.getState().picked
          if (held && held.pos === getPos()) {
            useDrawStore.getState().setPicked(null)
          }
          syncTool()
        },
        ignoreMutation() {
          return true
        },
        stopEvent(event) {
          const onRuler = event.target instanceof Element && event.target.closest(".ink-ruler")
          return (
            (drawingTool() || Boolean(onRuler)) &&
            (event.type === "mousedown" ||
              event.type === "wheel" ||
              event.type.startsWith("pointer") ||
              event.type.startsWith("touch"))
          )
        },
        destroy() {
          unsubscribe()
          svg.removeEventListener("pointerdown", onPointerDown)
          svg.removeEventListener("pointermove", onPointerMove)
          svg.removeEventListener("pointerup", onPointerUp)
          svg.removeEventListener("pointercancel", onPointerUp)
          svg.removeEventListener("wheel", onWheel)
          dom.removeEventListener("mousedown", onMouseDown)
          box.destroy()
        },
      }
    }
  },
})

function insertSelectableBlock(state: EditorState, tr: Transaction, node: ProseNode) {
  const $from = state.selection.$from
  const pos = $from.parent.canReplaceWith($from.index(), $from.index(), node.type)
    ? state.selection.to
    : $from.depth > 0
      ? $from.after($from.depth)
      : state.doc.content.size
  tr.insert(pos, node)
  if (tr.doc.nodeAt(pos)?.type === node.type) {
    tr.setSelection(NodeSelection.create(tr.doc, pos))
  }
}

function clampMm(value: number) {
  if (!Number.isFinite(value)) {
    return MIN_MM
  }
  return Math.min(MAX_MM, Math.max(MIN_MM, value))
}

function strokeToPath(points: number[][], tool: PenKind, widthMm: number, finished: boolean) {
  if (points.length === 0) {
    return ""
  }
  const input = points.length === 1 ? [points[0], points[0]] : points
  const outline = getStroke(input, {
    size: Math.max(1, widthMm * PX_PER_MM),
    // A pen has pressure; a pencil keeps an even line, as Word's.
    thinning: tool === "pen" ? 0.55 : tool === "pencil" ? 0.15 : 0,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: tool === "pen",
    last: finished,
  })
  return svgPathFromStroke(outline)
}

function svgPathFromStroke(stroke: number[][]) {
  if (stroke.length === 0) {
    return ""
  }
  const numbers = stroke.reduce<Array<string | number>>(
    (acc, point, index, all) => {
      const next = all[(index + 1) % all.length]
      acc.push(round(point[0]), round(point[1]), round((point[0] + next[0]) / 2), round((point[1] + next[1]) / 2))
      return acc
    },
    ["M", round(stroke[0][0]), round(stroke[0][1]), "Q"],
  )
  numbers.push("Z")
  return numbers.join(" ")
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

const SVG_NS = "http://www.w3.org/2000/svg"
/** How near, in canvas units, the eraser takes a stroke. */
const ERASER_RADIUS = 6

/** How a stroke is drawn: a highlighter see-through, a pencil a little lighter, as Word's. */
function strokeAttributes(stroke: Pick<DrawingStroke, "tool" | "color" | "d">): Record<string, string> {
  return {
    d: stroke.d,
    fill: stroke.color,
    ...(stroke.tool === "highlighter"
      ? { "fill-opacity": "0.4" }
      : stroke.tool === "pencil"
        ? { "fill-opacity": "0.8" }
        : {}),
  }
}

function strokeElement(stroke: Pick<DrawingStroke, "tool" | "color" | "d" | "widthMm">) {
  const path = document.createElementNS(SVG_NS, "path")
  for (const [name, value] of Object.entries(strokeAttributes(stroke))) {
    path.setAttribute(name, value)
  }
  return path
}

/** The line ink is laid on: just outside the Ruler's edge, by half the pen's width, so the Ruler does not hide it. */
function rulerEdge(ruler: Ruler | null, pen: Pick<Pen, "widthMm">): Ruler | null {
  if (!ruler) {
    return null
  }
  const away = (pen.widthMm * PX_PER_MM) / 2 + 1
  const radians = (ruler.angle * Math.PI) / 180
  return { ...ruler, x: ruler.x + Math.sin(radians) * away, y: ruler.y - Math.cos(radians) * away }
}

/** Word's Ruler across the canvas: its drawing edge at the top, ticks every 10 units, its turn shown in the middle. */
function rulerElement(ruler: Ruler) {
  const group = document.createElementNS(SVG_NS, "g")
  group.setAttribute("class", "ink-ruler")
  group.setAttribute("transform", `translate(${ruler.x} ${ruler.y}) rotate(${ruler.angle})`)
  const body = document.createElementNS(SVG_NS, "rect")
  body.setAttribute("x", "-1200")
  body.setAttribute("y", "0")
  body.setAttribute("width", "2400")
  body.setAttribute("height", "36")
  body.setAttribute("class", "ink-ruler-body")
  group.append(body)
  for (let at = -1200; at <= 1200; at += 10) {
    const tick = document.createElementNS(SVG_NS, "line")
    tick.setAttribute("x1", String(at))
    tick.setAttribute("x2", String(at))
    tick.setAttribute("y1", "0")
    tick.setAttribute("y2", at % 50 === 0 ? "12" : "6")
    tick.setAttribute("class", "ink-ruler-tick")
    group.append(tick)
  }
  const label = document.createElementNS(SVG_NS, "text")
  label.setAttribute("x", "0")
  label.setAttribute("y", "28")
  label.setAttribute("class", "ink-ruler-angle")
  label.textContent = `${Math.round(ruler.angle)}°`
  group.append(label)
  return group
}
