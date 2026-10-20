import { objectBox, objectLayoutAttributes } from "@/editor/object-frame"
import { readItems, writeItems } from "@/editor/smartart-model"
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
export const useSmartArtItem = create<{ index: number; set: (index: number) => void }>((set) => ({
  index: 0,
  set: (index) => set({ index }),
}))

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
  const items = readItems(JSON.stringify(labels), node.attrs.levels, node.attrs.pictures)
  const levels = items.map((item) => item.level)
  const withPicture = PICTURE_LAYOUTS.includes(layout)
  dom.dataset.layout = layout
  dom.dataset.pictures = String(node.attrs.pictures || "[]")
  dom.dataset.style = String(node.attrs.style || "flat")
  dom.dir = node.attrs.rtl === true ? "rtl" : "ltr"
  for (const name of [...dom.classList].filter((item) => item.startsWith("smartart-"))) {
    dom.classList.remove(name)
  }
  dom.classList.add("smartart", `smartart-${layout}`)
  dom.replaceChildren()
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
    dom.append(cell)
  })
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
        if (cell) {
          useSmartArtItem.getState().set(Number(cell.dataset.index) || 0)
        }
      }
      const onMouseDown = (event: MouseEvent) => {
        if ((event.target as HTMLElement).closest(".smartart-cell")) {
          event.stopPropagation()
        }
      }
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
            const items = readItems(node.attrs.labels, node.attrs.levels, node.attrs.pictures)
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
            body.dataset.layout !== updated.attrs.layout
          ) {
            paintSmartArt(body, updated)
          }
          node = updated
          return true
        },
        destroy() {
          body.removeEventListener("input", onInput)
          body.removeEventListener("focusin", onFocusIn)
          body.removeEventListener("mousedown", onMouseDown)
          body.removeEventListener("click", onPick)
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
          const labels = JSON.stringify(defaultLabels(layout))
          return chain()
            .insertContent({
              type: "smartArt",
              attrs: { layout, labels, accent: "#0f6cbd" },
            })
            .run()
        },
    }
  },
})
