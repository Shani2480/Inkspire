import { objectBox, objectLayoutAttributes } from "@/editor/object-frame"
import { blockEnd, readItems, writeItems, type SmartArtItem } from "@/editor/smartart-model"
import { Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { create } from "zustand"

export type SmartArtLayout =
  | "list"
  | "vlist"
  | "blocklist"
  | "process"
  | "chevron"
  | "stepup"
  | "cycle"
  | "hierarchy"
  | "relationship"
  | "venn"
  | "matrix"
  | "pyramid"
  | "piclist"
  | "vpiclist"

export const SMARTART_LAYOUTS: { id: SmartArtLayout; label: string; items: number }[] = [
  { id: "list", label: "Basic List", items: 3 },
  { id: "vlist", label: "Vertical List", items: 3 },
  { id: "blocklist", label: "Basic Block List", items: 5 },
  { id: "process", label: "Process", items: 4 },
  { id: "chevron", label: "Chevron Process", items: 3 },
  { id: "stepup", label: "Step Up Process", items: 3 },
  { id: "cycle", label: "Cycle", items: 4 },
  { id: "hierarchy", label: "Hierarchy", items: 3 },
  { id: "relationship", label: "Relationship", items: 4 },
  { id: "venn", label: "Basic Venn", items: 3 },
  { id: "matrix", label: "Matrix", items: 4 },
  { id: "pyramid", label: "Pyramid", items: 3 },
  { id: "piclist", label: "Picture Caption List", items: 3 },
  { id: "vpiclist", label: "Vertical Picture List", items: 3 },
]

/** Layouts with a picture placeholder in every shape. */
export const PICTURE_LAYOUTS: SmartArtLayout[] = ["piclist", "vpiclist"]

export type SmartArtStyle = "flat" | "subtle" | "intense"

export const SMARTART_STYLES: { id: SmartArtStyle; label: string }[] = [
  { id: "flat", label: "Simple Fill" },
  { id: "subtle", label: "Subtle Effect" },
  { id: "intense", label: "Intense Effect" },
]

/** The item the Design tab acts on: the last one the caret was in (22.1). */
export const useSmartArtItem = create<{
  index: number
  /** Shapes picked besides the active one with Ctrl+click: the Format tab changes them all. */
  more: number[]
  set: (index: number) => void
  toggle: (index: number) => void
}>((set) => ({
  index: 0,
  more: [],
  set: (index) => set({ index, more: [] }),
  toggle: (index) =>
    set((state) =>
      index === state.index
        ? state
        : { more: state.more.includes(index) ? state.more.filter((at) => at !== index) : [...state.more, index] },
    ),
}))

/** The shapes the Format tab acts on: the active one and any picked with it. */
export function pickedItems(index: number, more: number[], count: number) {
  return [...new Set([index, ...more])].filter((at) => at >= 0 && at < count)
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    smartArt: {
      insertSmartArt: (layout: SmartArtLayout) => ReturnType
    }
  }
}

function defaultLabels(layout: SmartArtLayout) {
  const count = SMARTART_LAYOUTS.find((item) => item.id === layout)?.items ?? 3
  return Array.from({ length: count }, (_, index) => `Text ${index + 1}`)
}

const cellText = (cell: HTMLElement) => (cell.querySelector(".smartart-text") ?? cell).textContent ?? ""

function paintSmartArt(dom: HTMLElement, node: ProseNode) {
  const layout = String(node.attrs.layout || "list") as SmartArtLayout
  let labels: string[] = []
  try {
    labels = JSON.parse(String(node.attrs.labels || "[]")) as string[]
  } catch {
    labels = defaultLabels(layout)
  }
  if (!labels.length) {
    labels = defaultLabels(layout)
  }
  const accent = String(node.attrs.accent || "#0f6cbd")
  const items = readItems(JSON.stringify(labels), node.attrs.levels, node.attrs.pictures, node.attrs.looks)
  const levels = items.map((item) => item.level)
  const withPicture = PICTURE_LAYOUTS.includes(layout)
  dom.dataset.layout = layout
  dom.dataset.pictures = String(node.attrs.pictures || "[]")
  dom.dataset.looks = String(node.attrs.looks || "[]")
  dom.style.setProperty("--smartart-line", accent)
  dom.dataset.style = String(node.attrs.style || "flat")
  dom.dir = node.attrs.rtl === true ? "rtl" : "ltr"
  for (const name of [...dom.classList].filter((item) => item.startsWith("smartart-"))) {
    dom.classList.remove(name)
  }
  dom.classList.add("smartart", `smartart-${layout}`)
  dom.replaceChildren()
  const cells: HTMLElement[] = []
  labels.forEach((label, index) => {
    const cell = document.createElement("div")
    cell.className = "smartart-cell"
    cell.contentEditable = "true"
    cell.spellcheck = false
    cell.dataset.index = String(index)
    cell.dataset.level = String(levels[index] ?? 0)
    if (withPicture) {
      // The picture is a slot beside the text; clicking it picks a file (see onPick below).
      const slot = document.createElement("span")
      slot.className = "smartart-picture"
      slot.contentEditable = "false"
      slot.dataset.index = String(index)
      slot.title = "Insert Picture"
      const source = items[index]?.picture
      if (source) {
        const image = document.createElement("img")
        image.src = source
        image.alt = ""
        slot.append(image)
      }
      const text = document.createElement("span")
      text.className = "smartart-text"
      text.textContent = label
      cell.append(slot, text)
    } else {
      cell.textContent = label
    }
    cell.style.setProperty("--smartart-accent", accent)
    if (layout === "process" && index < labels.length - 1) {
      cell.dataset.arrow = "1"
    }
    paintLook(cell, items[index])
    cells.push(cell)
  })
  if (layout === "cycle") {
    paintCycle(dom, cells)
    return
  }
  if (layout === "hierarchy") {
    // Hierarchy draws the outline as a tree: each item over a row of the items under it, joined by lines.
    const tree = document.createElement("div")
    tree.className = "smartart-tree"
    growTree(items, cells, 0, cells.length, tree)
    dom.append(tree)
  } else {
    dom.append(...cells)
  }
}

const SVG_NS = "http://www.w3.org/2000/svg"
const CYCLE_SIZE = 300
const CYCLE_RADIUS = 105

/**
 * Basic Cycle: the shapes evenly round a ring, the first at the top, each joined to the next by an arrow that runs
 * clockwise along the ring, as Word draws it.
 */
function paintCycle(dom: HTMLElement, cells: HTMLElement[]) {
  const ring = document.createElement("div")
  ring.className = "smartart-ring"
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("viewBox", `0 0 ${CYCLE_SIZE} ${CYCLE_SIZE}`)
  svg.setAttribute("aria-hidden", "true")
  const marker = document.createElementNS(SVG_NS, "marker")
  const id = `smartart-arrow-${Math.random().toString(36).slice(2, 9)}`
  marker.id = id
  marker.setAttribute("viewBox", "0 0 10 10")
  marker.setAttribute("refX", "6")
  marker.setAttribute("refY", "5")
  marker.setAttribute("markerWidth", "5")
  marker.setAttribute("markerHeight", "5")
  marker.setAttribute("orient", "auto-start-reverse")
  const head = document.createElementNS(SVG_NS, "path")
  head.setAttribute("d", "M0 0L10 5L0 10z")
  head.setAttribute("class", "smartart-ring-head")
  marker.append(head)
  const defs = document.createElementNS(SVG_NS, "defs")
  defs.append(marker)
  svg.append(defs)
  const count = cells.length
  const center = CYCLE_SIZE / 2
  const angle = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, count)
  // The arrows leave room for the shapes at each end: about a shape's half width along the ring.
  const gap = Math.min(Math.PI / Math.max(2, count), 0.5)
  if (count > 1) {
    for (let index = 0; index < count; index += 1) {
      const from = angle(index) + gap
      const to = angle(index + 1) - gap
      if (to <= from) {
        continue
      }
      const point = (value: number) =>
        `${(center + CYCLE_RADIUS * Math.cos(value)).toFixed(1)} ${(center + CYCLE_RADIUS * Math.sin(value)).toFixed(1)}`
      const arc = document.createElementNS(SVG_NS, "path")
      arc.setAttribute("d", `M${point(from)}A${CYCLE_RADIUS} ${CYCLE_RADIUS} 0 0 1 ${point(to)}`)
      arc.setAttribute("class", "smartart-ring-arrow")
      arc.setAttribute("marker-end", `url(#${id})`)
      svg.append(arc)
    }
  }
  ring.append(svg)
  cells.forEach((cell, index) => {
    cell.style.left = `${center + CYCLE_RADIUS * Math.cos(angle(index))}px`
    cell.style.top = `${center + CYCLE_RADIUS * Math.sin(angle(index))}px`
    ring.append(cell)
  })
  dom.append(ring)
}

/** The items from `start` to `end` as branches of `parent`, each holding its own block's items under it. */
function growTree(items: SmartArtItem[], cells: HTMLElement[], start: number, end: number, parent: HTMLElement) {
  let index = start
  while (index < end) {
    const stop = Math.min(end, blockEnd(items, index))
    const branch = document.createElement("div")
    branch.className = "smartart-branch"
    branch.append(cells[index]!)
    if (stop > index + 1) {
      const children = document.createElement("div")
      children.className = "smartart-children"
      growTree(items, cells, index + 1, stop, children)
      branch.append(children)
    }
    parent.append(branch)
    index = stop
  }
}

/** A shape's own look from the SmartArt Format tab, over the graphic's colours and style. */
function paintLook(cell: HTMLElement, item: SmartArtItem | undefined) {
  const look = item?.look
  if (!look) {
    return
  }
  if (look.shape) {
    cell.dataset.shape = look.shape
  }
  if (look.fill) {
    cell.style.background = look.fill
  }
  if (look.line) {
    cell.style.borderColor = look.line
  }
  if (look.text) {
    cell.style.color = look.text
  }
  if (look.outline) {
    cell.style.setProperty("-webkit-text-stroke", `0.6px ${look.outline}`)
  }
  if (look.effect) {
    cell.dataset.effect = look.effect
  }
  if (look.size) {
    // Larger and Smaller: a tenth of the shape's size a step, as Word grows and shrinks a shape.
    cell.style.setProperty("zoom", String(Math.round((1 + look.size / 10) * 100) / 100))
  }
}

export const SmartArt = Node.create({
  name: "smartArt",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      layout: {
        default: "list",
        parseHTML: (element) => element.getAttribute("data-layout") || "list",
        renderHTML: (attributes) => ({ "data-layout": attributes.layout }),
      },
      labels: {
        default: JSON.stringify(defaultLabels("list")),
        parseHTML: (element) => element.getAttribute("data-labels") || JSON.stringify(defaultLabels("list")),
        renderHTML: (attributes) => ({ "data-labels": attributes.labels }),
      },
      levels: {
        default: "[]",
        parseHTML: (element) => element.getAttribute("data-levels") || "[]",
        renderHTML: (attributes) => ({ "data-levels": attributes.levels || "[]" }),
      },
      rtl: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-rtl") === "1",
        renderHTML: (attributes) => ({ "data-rtl": attributes.rtl === true ? "1" : "0" }),
      },
      style: {
        default: "flat",
        parseHTML: (element) => element.getAttribute("data-smartart-style") || "flat",
        renderHTML: (attributes) => ({ "data-smartart-style": attributes.style || "flat" }),
      },
      pictures: {
        default: "[]",
        parseHTML: (element) => element.getAttribute("data-pictures") || "[]",
        renderHTML: (attributes) => ({ "data-pictures": attributes.pictures || "[]" }),
      },
      /** Each shape's own look from the SmartArt Format tab (`SmartArtLook`), or [] when none has one. */
      looks: {
        default: "[]",
        parseHTML: (element) => element.getAttribute("data-looks") || "[]",
        renderHTML: (attributes) =>
          attributes.looks && attributes.looks !== "[]" ? { "data-looks": attributes.looks } : {},
      },
      accent: {
        default: "#0f6cbd",
        parseHTML: (element) => element.getAttribute("data-accent") || "#0f6cbd",
        renderHTML: (attributes) => ({ "data-accent": attributes.accent || "#0f6cbd" }),
      },
      ...objectLayoutAttributes(),
    }
  },
  parseHTML() {
    return [{ tag: "div[data-smartart]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-smartart": "", class: "smartart" })]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const position = () => {
        const pos = typeof getPos === "function" ? getPos() : null
        return typeof pos === "number" ? pos : undefined
      }
      // A drag in a shape's text selects text; the SmartArt moves by its edges, its background, or with Alt.
      const box = objectBox("smartart", editor.view, position, {
        types: ["smartArt"],
        inside: (event) => event.target instanceof Element && Boolean(event.target.closest(".smartart-cell")),
      })
      const { dom, body } = box
      dom.setAttribute("data-smartart", "")
      box.paint(node)
      paintSmartArt(body, node)

      const onInput = () => {
        const labels = [...body.querySelectorAll<HTMLElement>(".smartart-cell")].map(cellText)
        const pos = position()
        if (pos === undefined) {
          return
        }
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, labels: JSON.stringify(labels) })
            return true
          })
          .run()
      }
      const onFocusIn = (event: FocusEvent) => {
        const cell = (event.target as HTMLElement).closest<HTMLElement>(".smartart-cell")
        if (cell && !picking) {
          useSmartArtItem.getState().set(Number(cell.dataset.index) || 0)
        }
      }
      // Ctrl+click (or Shift+click) adds a shape to those the Format tab changes, as in Word.
      let picking = false
      const onMouseDown = (event: MouseEvent) => {
        const cell = (event.target as HTMLElement).closest<HTMLElement>(".smartart-cell")
        if (!cell) {
          return
        }
        event.stopPropagation()
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          event.preventDefault()
          picking = true
          useSmartArtItem.getState().toggle(Number(cell.dataset.index) || 0)
          queueMicrotask(() => {
            picking = false
          })
        }
      }
      const markPicked = () => {
        const { index, more } = useSmartArtItem.getState()
        const picked = more.length > 0 ? new Set([index, ...more]) : new Set<number>()
        body.querySelectorAll<HTMLElement>(".smartart-cell").forEach((cell) => {
          cell.toggleAttribute("data-picked", picked.has(Number(cell.dataset.index)))
        })
      }
      const unsubscribe = useSmartArtItem.subscribe(markPicked)
      const onPick = (event: MouseEvent) => {
        const slot = (event.target as HTMLElement).closest<HTMLElement>(".smartart-picture")
        const pos = position()
        if (!slot || pos === undefined) {
          return
        }
        const index = Number(slot.dataset.index) || 0
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/*"
        input.addEventListener("change", () => {
          const file = input.files?.[0]
          if (!file) {
            return
          }
          const reader = new FileReader()
          reader.addEventListener("load", () => {
            const items = readItems(node.attrs.labels, node.attrs.levels, node.attrs.pictures, node.attrs.looks)
            if (items[index]) {
              items[index] = { ...items[index]!, picture: String(reader.result) }
              editor.chain().updateAttributes("smartArt", writeItems(items)).run()
            }
          })
          reader.readAsDataURL(file)
        })
        input.click()
      }

      body.addEventListener("input", onInput)
      body.addEventListener("focusin", onFocusIn)
      body.addEventListener("mousedown", onMouseDown)
      body.addEventListener("click", onPick)

      return {
        dom,
        update(updated) {
          if (updated.type.name !== "smartArt") {
            return false
          }
          box.paint(updated)
          const active = document.activeElement
          const editing = active instanceof HTMLElement && body.contains(active)
          // While typing in a shape the text is already on screen; any other change (the Design tab's) repaints.
          const shown = JSON.stringify([...body.querySelectorAll<HTMLElement>(".smartart-cell")].map(cellText))
          const levelsShown = JSON.stringify(
            [...body.querySelectorAll<HTMLElement>(".smartart-cell")].map((cell) => Number(cell.dataset.level) || 0),
          )
          const levelsNow = JSON.stringify(
            readItems(updated.attrs.labels, updated.attrs.levels).map((item) => item.level),
          )
          const picturesNow = String(updated.attrs.pictures || "[]")
          const picturesShown = String(body.dataset.pictures || "[]")
          if (
            !editing ||
            shown !== updated.attrs.labels ||
            levelsShown !== levelsNow ||
            picturesShown !== picturesNow ||
            String(body.dataset.looks || "[]") !== String(updated.attrs.looks || "[]") ||
            body.dataset.layout !== updated.attrs.layout
          ) {
            paintSmartArt(body, updated)
            markPicked()
          }
          node = updated
          return true
        },
        destroy() {
          body.removeEventListener("input", onInput)
          body.removeEventListener("focusin", onFocusIn)
          body.removeEventListener("mousedown", onMouseDown)
          body.removeEventListener("click", onPick)
          unsubscribe()
          box.destroy()
        },
        ignoreMutation: () => true,
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
          body.classList.add("is-selected")
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
          body.classList.remove("is-selected")
        },
      }
    }
  },
  addCommands() {
    return {
      insertSmartArt:
        (layout) =>
        ({ chain }) => {
          const texts = defaultLabels(layout)
          const labels = JSON.stringify(texts)
          // An organization chart starts as Word's does: one shape at the top and the others under it.
          const levels = JSON.stringify(texts.map((_, index) => (layout === "hierarchy" && index > 0 ? 1 : 0)))
          return chain()
            .insertContent({
              type: "smartArt",
              attrs: { layout, labels, levels, accent: "#0f6cbd" },
            })
            .run()
        },
    }
  },
})
