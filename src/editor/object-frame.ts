import { useViewStore } from "@/document/view"
import { bindObjectResize, type Box } from "@/editor/object-resize"
import { bindRotate, ensureRotateHandle } from "@/editor/object-rotate"
import {
  applyFrame,
  bindDrag,
  ensureResizeHandles,
  floatingAttributes,
  frameClass,
  inlineMaxWidth,
  isFloating,
  liveClasses,
  resizeAttrs,
} from "@/editor/objects"
import type { Node as ProseNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"

/**
 * The layout attributes every object shares with pictures: size, turn, wrap and place (old documents have none,
 * so the object stays in line at the size it had).
 */
export function objectLayoutAttributes(size: { width: number; height: number } = { width: 0, height: 0 }) {
  const number = (key: string, name: string, fallback: number) => ({
    default: fallback,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(name)
      const value = raw === null ? Number.NaN : Number(raw)
      return Number.isFinite(value) ? value : fallback
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = Number(attributes[key])
      return Number.isFinite(value) && value !== fallback ? { [name]: String(value) } : {}
    },
  })
  return {
    width: number("width", "data-width", size.width),
    height: number("height", "data-height", size.height),
    rotate: number("rotate", "data-rotate", 0),
    ...floatingAttributes("inline"),
  }
}

const EDGES = ["top", "right", "bottom", "left"] as const

/**
 * The frame of an object whose inside is used (a 3D model orbits, a canvas is drawn on, SmartArt is typed in): it
 * moves by its edges, as Word moves such objects by their border, or from anywhere with Alt held.
 */
function ensureMoveEdges(dom: HTMLElement) {
  if (dom.querySelector(".object-edge")) {
    return
  }
  for (const edge of EDGES) {
    const strip = document.createElement("div")
    strip.className = `object-edge object-edge-${edge}`
    strip.dataset.objectHandle = ""
    strip.contentEditable = "false"
    strip.title = "Drag to move · or hold Alt and drag anywhere"
    dom.append(strip)
  }
}

/**
 * One object frame, as pictures have: the selection border, eight resize handles, the rotate handle and moving,
 * all live (20.2, 20.5), in line or floating with any wrap. The object draws itself in `body`.
 */
export function objectBox(
  kind: string,
  view: EditorView,
  getPos: () => number | undefined,
  options: {
    types: string[]
    /** Whether a drag that starts here belongs to the object (orbit, draw, type); it then moves by its edges or Alt. */
    inside?: (event: PointerEvent) => boolean
  },
) {
  const dom = document.createElement("div")
  dom.contentEditable = "false"
  const body = document.createElement("div")
  body.className = "object-box-body"
  dom.append(body)
  ensureResizeHandles(dom)
  ensureRotateHandle(dom)
  const inside = options.inside
  if (inside) {
    ensureMoveEdges(dom)
  }
  const shownSize = (node: ProseNode): Box => {
    const zoom = useViewStore.getState().zoom || 1
    const rect = dom.getBoundingClientRect()
    return {
      width: Number(node.attrs.width) || Math.round(dom.offsetWidth || rect.width / zoom),
      height: Number(node.attrs.height) || Math.round(dom.offsetHeight || rect.height / zoom),
    }
  }
  const stopResize = bindObjectResize(dom, view, getPos, {
    types: options.types,
    start: shownSize,
    attrs: resizeAttrs,
    max: inlineMaxWidth,
  })
  const stopRotate = bindRotate(dom, view, getPos)
  const stopDrag = bindDrag(
    dom,
    view,
    getPos,
    inside ? { body: (event) => event.altKey || !inside(event), capture: true } : { body: true },
  )

  const paint = (node: ProseNode) => {
    const width = Number(node.attrs.width) || 0
    const height = Number(node.attrs.height) || 0
    dom.style.width = width ? `${width}px` : ""
    dom.style.height = height ? `${height}px` : ""
    // A sized frame is filled by its object; without a size the object keeps its own.
    body.classList.toggle("is-sized", Boolean(width && height))
    const rotate = Number(node.attrs.rotate) || 0
    if (!isFloating(node)) {
      dom.className = `object-box ${kind}-box${liveClasses(dom)}`
      Object.assign(dom.style, {
        position: "",
        left: "",
        top: "",
        zIndex: "",
        transform: rotate ? `rotate(${rotate}deg)` : "",
      })
      return
    }
    dom.className = frameClass(dom, node, `object-box ${kind}-box`)
    applyFrame(dom, node)
  }

  return {
    dom,
    body,
    paint,
    destroy() {
      stopResize()
      stopRotate()
      stopDrag()
    },
  }
}
