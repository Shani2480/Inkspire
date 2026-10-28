import { useViewStore } from "@/document/view"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { create } from "zustand"

type Attrs = Record<string, unknown>
export type CropEdge = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

/**
 * How much of the picture each side hides, as a share of the whole picture (0 to 1). A negative share is empty room
 * beside the picture inside its frame, as Word's Fit leaves (a negative `a:srcRect`).
 */
export type Crop = { l: number; t: number; r: number; b: number }

/** The least of the picture that stays visible along either side. */
const MIN_SHARE = 0.05

/** The picture's attributes: the share of each side hidden, in percent, so a saved file reads as Word's crop does. */
export function pictureCropAttributes() {
  const one = (key: string, name: string) => ({
    default: 0,
    parseHTML: (element: HTMLElement) => {
      const value = Number(element.getAttribute(name))
      return Number.isFinite(value) ? value : 0
    },
    renderHTML: (attributes: Attrs) => {
      const value = Number(attributes[key])
      return Number.isFinite(value) && value !== 0 ? { [name]: String(value) } : {}
    },
  })
  return {
    cropL: one("cropL", "data-crop-l"),
    cropT: one("cropT", "data-crop-t"),
    cropR: one("cropR", "data-crop-r"),
    cropB: one("cropB", "data-crop-b"),
  }
}

export const NO_CROP = { cropL: 0, cropT: 0, cropR: 0, cropB: 0 }

export function cropOf(attrs: Attrs): Crop {
  const side = (key: string) => Math.max(-100, Math.min(95, Number(attrs[key]) || 0)) / 100
  return { l: side("cropL"), t: side("cropT"), r: side("cropR"), b: side("cropB") }
}

export function isCropped(attrs: Attrs) {
  const crop = cropOf(attrs)
  return crop.l !== 0 || crop.t !== 0 || crop.r !== 0 || crop.b !== 0
}

/** The size of the whole picture, at the scale it is shown, given the part that shows. */
export function wholeSize(width: number, height: number, crop: Crop) {
  return {
    width: width / Math.max(MIN_SHARE, 1 - crop.l - crop.r),
    height: height / Math.max(MIN_SHARE, 1 - crop.t - crop.b),
  }
}

/**
 * The crop and the visible size after `edge` has moved by (dx, dy) pixels. The picture keeps its scale, so only
 * the visible part changes; a side cannot go back past the picture's own edge (or past the empty room Fit left)
 * or leave less than a sliver.
 */
export function croppedBy(
  edge: CropEdge,
  start: { width: number; height: number; crop: Crop },
  dx: number,
  dy: number,
) {
  const whole = wholeSize(start.width, start.height, start.crop)
  const crop = { ...start.crop }
  if (edge.includes("w")) {
    crop.l = Math.max(Math.min(0, start.crop.l), Math.min(1 - crop.r - MIN_SHARE, crop.l + dx / whole.width))
  }
  if (edge.includes("e")) {
    crop.r = Math.max(Math.min(0, start.crop.r), Math.min(1 - crop.l - MIN_SHARE, crop.r - dx / whole.width))
  }
  if (edge.includes("n")) {
    crop.t = Math.max(Math.min(0, start.crop.t), Math.min(1 - crop.b - MIN_SHARE, crop.t + dy / whole.height))
  }
  if (edge.includes("s")) {
    crop.b = Math.max(Math.min(0, start.crop.b), Math.min(1 - crop.t - MIN_SHARE, crop.b - dy / whole.height))
  }
  return {
    crop,
    width: Math.round(whole.width * (1 - crop.l - crop.r)),
    height: Math.round(whole.height * (1 - crop.t - crop.b)),
  }
}

/** Word's Crop → Aspect Ratio choices, width to height. */
export const ASPECT_RATIOS: { group: string; items: { label: string; ratio: number }[] }[] = [
  { group: "Square", items: [{ label: "1:1", ratio: 1 }] },
  {
    group: "Portrait",
    items: [
      { label: "2:3", ratio: 2 / 3 },
      { label: "3:4", ratio: 3 / 4 },
      { label: "3:5", ratio: 3 / 5 },
      { label: "4:5", ratio: 4 / 5 },
    ],
  },
  {
    group: "Landscape",
    items: [
      { label: "3:2", ratio: 3 / 2 },
      { label: "4:3", ratio: 4 / 3 },
      { label: "5:3", ratio: 5 / 3 },
      { label: "5:4", ratio: 5 / 4 },
      { label: "16:9", ratio: 16 / 9 },
      { label: "16:10", ratio: 16 / 10 },
    ],
  },
]

type Cropped = { crop: Crop; width: number; height: number }

/**
 * Aspect Ratio: the largest part of the whole picture with that width-to-height ratio, centred, at the picture's
 * scale, as Word crops to it.
 */
export function aspectRatioCrop(width: number, height: number, crop: Crop, ratio: number): Cropped {
  const whole = wholeSize(width, height, crop)
  if (whole.width / whole.height > ratio) {
    const side = (1 - (whole.height * ratio) / whole.width) / 2
    return {
      crop: { l: side, t: 0, r: side, b: 0 },
      width: Math.round(whole.height * ratio),
      height: Math.round(whole.height),
    }
  }
  const side = (1 - whole.width / ratio / whole.height) / 2
  return {
    crop: { l: 0, t: side, r: 0, b: side },
    width: Math.round(whole.width),
    height: Math.round(whole.width / ratio),
  }
}

/**
 * Fill and Fit keep the frame (the visible size) and scale the picture in it, centred: Fill so the picture covers
 * the frame, cropping what overhangs; Fit so all of the picture shows, leaving empty room beside it.
 */
export function fillCrop(width: number, height: number, crop: Crop): Cropped {
  return scaledInto(width, height, crop, Math.max)
}

export function fitCrop(width: number, height: number, crop: Crop): Cropped {
  return scaledInto(width, height, crop, Math.min)
}

function scaledInto(width: number, height: number, crop: Crop, pick: (a: number, b: number) => number): Cropped {
  const whole = wholeSize(width, height, crop)
  const scale = pick(width / whole.width, height / whole.height)
  const shownWidth = whole.width * scale
  const shownHeight = whole.height * scale
  const x = (1 - width / shownWidth) / 2
  const y = (1 - height / shownHeight) / 2
  return { crop: { l: x, t: y, r: x, b: y }, width: Math.round(width), height: Math.round(height) }
}

export function cropAttrs(crop: Crop) {
  const percent = (share: number) => Math.round(share * 10000) / 100
  return { cropL: percent(crop.l), cropT: percent(crop.t), cropR: percent(crop.r), cropB: percent(crop.b) }
}

/** Whether the selected picture is in crop mode (the crop handles show and the cropped-away parts are drawn faint). */
export const useCropMode = create<{ active: boolean; set: (active: boolean) => void }>((set) => ({
  active: false,
  set: (active) => set({ active }),
}))

/**
 * A crop in progress (21.46). Dragging the handles only previews: each frame is written without history. The crop
 * becomes one undo step when it is applied, and cancelling (Esc, leaving crop mode, selecting something else) puts
 * the picture back as it was. The picture's own pixels are never touched; the crop is two numbers per side.
 */
let pending: { view: EditorView; pos: number; original: Attrs } | null = null

export function hasPendingCrop() {
  return pending !== null
}

export function previewCrop(view: EditorView, pos: number, attrs: Attrs) {
  writeAttrs(view, pos, attrs, false)
}

function writeAttrs(view: EditorView, pos: number, attrs: Attrs, history: boolean) {
  const node = view.state.doc.nodeAt(pos)
  if (!node || node.type.name !== "image") {
    return
  }
  const tr = view.state.tr.setNodeMarkup(pos, undefined, attrs)
  tr.setSelection(NodeSelection.create(tr.doc, pos))
  if (!history) {
    tr.setMeta("addToHistory", false)
  }
  view.dispatch(tr)
}

/** Starts a crop session on the picture at `pos`, remembering how it is now; one already running there is kept. */
export function beginCrop(view: EditorView, pos: number, attrs: Attrs) {
  if (!pending || pending.pos !== pos || pending.view !== view) {
    pending = { view, pos, original: { ...attrs } }
  }
}

/** Commits the previewed crop as one undo step and leaves crop mode. */
export function applyCrop() {
  const session = pending
  pending = null
  if (session) {
    const node = session.view.state.doc.nodeAt(session.pos)
    const final = node?.type.name === "image" ? { ...node.attrs } : null
    if (final) {
      writeAttrs(session.view, session.pos, session.original, false)
      writeAttrs(session.view, session.pos, final, true)
    }
  }
  useCropMode.getState().set(false)
}

/** Drops the previewed crop: the picture returns to how it was when crop mode began. */
export function cancelCrop() {
  const session = pending
  pending = null
  if (session) {
    writeAttrs(session.view, session.pos, session.original, false)
  }
  useCropMode.getState().set(false)
}

/**
 * Aspect Ratio, Fill and Fit on the selected picture: the new crop is shown in crop mode, to be adjusted, applied or
 * cancelled like a dragged one.
 */
export function cropPicture(
  view: EditorView,
  pos: number,
  change: (width: number, height: number, crop: Crop) => Cropped,
) {
  const node = view.state.doc.nodeAt(pos)
  if (node?.type.name !== "image") {
    return false
  }
  const dom = view.nodeDOM(pos)
  const zoom = useViewStore.getState().zoom || 1
  const box = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
  const width = Number(node.attrs.width) || Math.round((box?.width ?? 0) / zoom)
  const height = Number(node.attrs.height) || Math.round((box?.height ?? 0) / zoom)
  if (!width || !height) {
    return false
  }
  beginCrop(view, pos, node.attrs)
  const next = change(width, height, cropOf(node.attrs))
  writeAttrs(view, pos, { ...node.attrs, width: next.width, height: next.height, ...cropAttrs(next.crop) }, false)
  useCropMode.getState().set(true)
  return true
}

/** Reset: the whole picture shows again, still pending until applied. */
export function resetPendingCrop() {
  if (!pending) {
    return
  }
  const node = pending.view.state.doc.nodeAt(pending.pos)
  if (node?.type.name === "image") {
    const whole = wholeSize(Number(node.attrs.width) || 0, Number(node.attrs.height) || 0, cropOf(node.attrs))
    writeAttrs(
      pending.view,
      pending.pos,
      { ...node.attrs, width: Math.round(whole.width), height: Math.round(whole.height), ...NO_CROP },
      false,
    )
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (event) => {
      if (!useCropMode.getState().active) {
        return
      }
      if (event.key === "Escape" && pending) {
        event.preventDefault()
        cancelCrop()
      } else if (event.key === "Enter" && pending) {
        event.preventDefault()
        applyCrop()
      }
    },
    true,
  )
  // Crop mode ended some other way (the picture was deselected): a crop not applied is dropped.
  useCropMode.subscribe((state, before) => {
    if (before.active && !state.active && pending) {
      cancelCrop()
    }
  })
}

const EDGES: CropEdge[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

export function ensureCropHandles(dom: HTMLElement) {
  if (dom.querySelector("[data-crop-edge]")) {
    return
  }
  for (const edge of EDGES) {
    const handle = document.createElement("div")
    handle.className = `image-crop-handle image-crop-${edge}`
    handle.dataset.cropEdge = edge
    handle.contentEditable = "false"
    dom.append(handle)
  }
}

/**
 * Drag a crop handle to hide or show the picture's edge, live, as in Word. Each frame is written without history;
 * a release keeps the preview and Apply makes it one undo step. Esc cancels the drag. The picture is not
 * resampled: the crop is two numbers per side, so it can be changed again later.
 */
export function bindPictureCrop(
  dom: HTMLElement,
  view: EditorView,
  getPos: () => number | undefined,
  /** The attributes for the new visible size: a floating picture keeps its far edge where it was. */
  placed: (
    node: ProseNode,
    box: { width: number; height: number },
    edge: CropEdge,
    from: { width: number; height: number },
  ) => Attrs,
) {
  const onDown = (event: PointerEvent) => {
    const handle = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-crop-edge]") : null
    if (event.button !== 0 || !handle || !dom.contains(handle)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const pos = getPos()
    const original = pos == null ? null : view.state.doc.nodeAt(pos)
    if (pos == null || !original || original.type.name !== "image") {
      return
    }
    beginCrop(view, pos, original.attrs)
    const edge = handle.dataset.cropEdge as CropEdge
    const zoom = useViewStore.getState().zoom || 1
    const rect = dom.getBoundingClientRect()
    const from = {
      width: Number(original.attrs.width) || Math.round(rect.width / zoom),
      height: Number(original.attrs.height) || Math.round(rect.height / zoom),
    }
    const start = { ...from, crop: cropOf(original.attrs) }
    const startX = event.clientX
    const startY = event.clientY
    let latest = { x: startX, y: startY }
    let frame = 0
    let next: Attrs | null = null

    const write = (attrs: Attrs, history: boolean) => {
      const tr = view.state.tr.setNodeMarkup(pos, undefined, attrs)
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      if (!history) {
        tr.setMeta("addToHistory", false)
      }
      view.dispatch(tr)
    }
    const compute = () => {
      const moved = croppedBy(edge, start, (latest.x - startX) / zoom, (latest.y - startY) / zoom)
      return {
        ...original.attrs,
        width: moved.width,
        height: moved.height,
        ...cropAttrs(moved.crop),
        ...placed(original, moved, edge, from),
      }
    }
    const paint = () => {
      frame = 0
      next = compute()
      write(next, false)
    }
    const move = (ev: PointerEvent) => {
      latest = { x: ev.clientX, y: ev.clientY }
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
      dom.classList.remove("is-resizing")
      // The drag only previews: it is kept (or put back to where the drag began) without history.
      write(keep && next ? next : original.attrs, false)
    }
    const up = (ev: PointerEvent) => {
      latest = { x: ev.clientX, y: ev.clientY }
      next = compute()
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
    dom.classList.add("is-resizing")
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("keydown", onKey, true)
  }
  dom.addEventListener("pointerdown", onDown)
  return () => dom.removeEventListener("pointerdown", onDown)
}
