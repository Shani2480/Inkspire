import { objectBox, objectLayoutAttributes } from "@/editor/object-frame"
import { PX_PER_MM } from "@/document/measure"
import { Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { getStroke } from "perfect-freehand"
import { create } from "zustand"

export type DrawTool = "select" | "pen" | "highlighter"

export type DrawingStroke = {
  tool: "pen" | "highlighter"
  widthMm: number
  color: string
  d: string
}

export const CANVAS_WIDTH = 480
export const CANVAS_HEIGHT = 260
export const PEN_COLORS = ["#242424", "#0f6cbd", "#d13438", "#107c10"]
export const HIGHLIGHTER_COLORS = ["#ffe600", "#7fdb6a", "#ff99d6", "#7eb6ff"]

const MIN_MM = 0.25
const MAX_MM = 20

type DrawState = {
  tool: DrawTool
  penMm: number
  highlighterMm: number
  penColor: string
  highlighterColor: string
  setTool: (tool: DrawTool) => void
  setWidthMm: (widthMm: number) => void
  setColor: (color: string) => void
}

export const useDrawStore = create<DrawState>((set) => ({
  tool: "select",
  penMm: 0.5,
  highlighterMm: 6,
  penColor: PEN_COLORS[0],
  highlighterColor: HIGHLIGHTER_COLORS[0],
  setTool: (tool) => set({ tool }),
  setWidthMm: (widthMm) =>
    set((state) => {
      const next = clampMm(widthMm)
      return state.tool === "highlighter" ? { highlighterMm: next } : { penMm: next }
    }),
  setColor: (color) =>
    set((state) => (state.tool === "highlighter" ? { highlighterColor: color } : { penColor: color })),
}))

export function activeWidthMm(state: Pick<DrawState, "tool" | "penMm" | "highlighterMm">) {
  return state.tool === "highlighter" ? state.highlighterMm : state.penMm
}

export function activeColor(state: Pick<DrawState, "tool" | "penColor" | "highlighterColor">) {
  return state.tool === "highlighter" ? state.highlighterColor : state.penColor
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
        (stroke.tool !== "pen" && stroke.tool !== "highlighter") ||
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
    const paths = parseStrokes(node.attrs.strokes).map((stroke) => [
      "path",
      {
        d: stroke.d,
        fill: stroke.color,
        ...(stroke.tool === "highlighter" ? { "fill-opacity": "0.4" } : {}),
      },
    ])
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
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node
      let points: number[][] = []
      let drawing = false
      const position = () => {
        const pos = getPos()
        return typeof pos === "number" ? pos : undefined
      }
      // With a pen chosen a drag draws; the canvas then moves by its edges or with Alt.
      const box = objectBox("drawing", editor.view, position, {
        types: ["drawingCanvas"],
        inside: () => useDrawStore.getState().tool !== "select",
      })
      const { dom, body } = box
      dom.setAttribute("data-drawing", "")
      body.classList.add("drawing-canvas")
      box.paint(node)
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
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
        for (const stroke of parseStrokes(current.attrs.strokes)) {
          svg.append(pathElement(stroke.d, stroke.color, stroke.tool === "highlighter"))
        }
        if (points.length > 0) {
          const state = useDrawStore.getState()
          const tool = state.tool === "highlighter" ? "highlighter" : "pen"
          const d = strokeToPath(points, tool, activeWidthMm(state), false)
          if (d) {
            svg.append(pathElement(d, activeColor(state), tool === "highlighter"))
          }
        }
        syncTool()
      }

      const localPoint = (event: PointerEvent) => {
        const rect = svg.getBoundingClientRect()
        const width = rect.width || CANVAS_WIDTH
        const height = rect.height || CANVAS_HEIGHT
        const x = ((event.clientX - rect.left) / width) * CANVAS_WIDTH
        const y = ((event.clientY - rect.top) / height) * CANVAS_HEIGHT
        return [x, y, event.pressure > 0 ? event.pressure : 0.5]
      }

      const commit = () => {
        const captured = points
        points = []
        drawing = false
        const state = useDrawStore.getState()
        const tool = state.tool === "highlighter" ? "highlighter" : "pen"
        const widthMm = activeWidthMm(state)
        const d = strokeToPath(captured, tool, widthMm, true)
        paint()
        if (!d) {
          return
        }
        const pos = getPos()
        if (typeof pos !== "number") {
          return
        }
        const strokes = JSON.stringify([
          ...parseStrokes(current.attrs.strokes),
          { tool, widthMm, color: activeColor(state), d },
        ])
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, strokes })
        const placed = tr.doc.nodeAt(pos)
        if (placed?.type.name === "drawingCanvas") {
          tr.setSelection(NodeSelection.create(tr.doc, pos))
        }
        editor.view.dispatch(tr)
      }

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) {
          return
        }
        const tool = useDrawStore.getState().tool
        if (tool === "select") {
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
        drawing = true
        points = [localPoint(event)]
        try {
          svg.setPointerCapture(event.pointerId)
        } catch {
          // Synthetic events cannot capture the pointer. Element listeners still receive the gesture.
        }
        paint()
      }

      const onPointerMove = (event: PointerEvent) => {
        if (!drawing) {
          return
        }
        points.push(localPoint(event))
        paint()
      }

      const onPointerUp = (event: PointerEvent) => {
        if (!drawing) {
          return
        }
        try {
          if (svg.hasPointerCapture(event.pointerId)) {
            svg.releasePointerCapture(event.pointerId)
          }
        } catch {
          // Capture was never taken.
        }
        points.push(localPoint(event))
        commit()
      }

      const onMouseDown = (event: MouseEvent) => {
        if (event.button !== 0 || useDrawStore.getState().tool === "select") {
          return
        }
        event.preventDefault()
        event.stopPropagation()
      }

      svg.addEventListener("pointerdown", onPointerDown)
      svg.addEventListener("pointermove", onPointerMove)
      svg.addEventListener("pointerup", onPointerUp)
      svg.addEventListener("pointercancel", onPointerUp)
      dom.addEventListener("mousedown", onMouseDown)
      const unsubscribe = useDrawStore.subscribe(syncTool)
      paint()

      return {
        dom,
        update(next) {
          if (next.type.name !== "drawingCanvas") {
            return false
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
          syncTool()
        },
        ignoreMutation() {
          return true
        },
        stopEvent(event) {
          return (
            useDrawStore.getState().tool !== "select" &&
            (event.type === "mousedown" || event.type.startsWith("pointer") || event.type.startsWith("touch"))
          )
        },
        destroy() {
          unsubscribe()
          svg.removeEventListener("pointerdown", onPointerDown)
          svg.removeEventListener("pointermove", onPointerMove)
          svg.removeEventListener("pointerup", onPointerUp)
          svg.removeEventListener("pointercancel", onPointerUp)
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

function strokeToPath(points: number[][], tool: "pen" | "highlighter", widthMm: number, finished: boolean) {
  if (points.length === 0) {
    return ""
  }
  const input = points.length === 1 ? [points[0], points[0]] : points
  const outline = getStroke(input, {
    size: Math.max(1, widthMm * PX_PER_MM),
    thinning: tool === "highlighter" ? 0 : 0.55,
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

function pathElement(d: string, color: string, highlighter: boolean) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", d)
  path.setAttribute("fill", color)
  if (highlighter) {
    path.setAttribute("fill-opacity", "0.4")
  }
  return path
}
