import { Node, mergeAttributes } from "@tiptap/core"
import { Fragment, type Node as ProseNode } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"

export type CoverVariant =
  | "sideline"
  | "motion"
  | "whisp"
  | "banded"
  | "facet"
  | "austin"
  | "filigree"
  | "grid"
  | "integral"
  | "ion-dark"
  | "ion-light"
  | "retrospect"
  | "semaphore"
  | "slice"

export const COVER_PAGES: { id: CoverVariant; label: string; title: string; subtitle: string }[] = [
  { id: "sideline", label: "Sideline", title: "Document Title", subtitle: "Subtitle" },
  { id: "motion", label: "Motion", title: "Document Title", subtitle: "A short description" },
  { id: "whisp", label: "Whisp", title: "Document Title", subtitle: "Subtitle" },
  { id: "banded", label: "Banded", title: "Document Title", subtitle: "Subtitle" },
  { id: "facet", label: "Facet", title: "Document Title", subtitle: "Subtitle" },
  { id: "austin", label: "Austin", title: "Document Title", subtitle: "Subtitle" },
  { id: "filigree", label: "Filigree", title: "Document Title", subtitle: "Subtitle" },
  { id: "grid", label: "Grid", title: "Document Title", subtitle: "Subtitle" },
  { id: "integral", label: "Integral", title: "Document Title", subtitle: "Subtitle" },
  { id: "ion-dark", label: "Ion (Dark)", title: "Document Title", subtitle: "Subtitle" },
  { id: "ion-light", label: "Ion (Light)", title: "Document Title", subtitle: "Subtitle" },
  { id: "retrospect", label: "Retrospect", title: "Document Title", subtitle: "Subtitle" },
  { id: "semaphore", label: "Semaphore", title: "Document Title", subtitle: "Subtitle" },
  { id: "slice", label: "Slice", title: "Document Title", subtitle: "Subtitle" },
]

const SAVED_KEY = "aiword.cover-gallery"

export type SavedCover = { name: string; variant: CoverVariant; title: string; subtitle: string }

/** Covers the user saved with "Save Selection to Cover Page Gallery…"; kept in this browser only. */
export function savedCovers(): SavedCover[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]") as unknown
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is SavedCover =>
            Boolean(item) &&
            typeof item.name === "string" &&
            COVER_PAGES.some((cover) => cover.id === item.variant) &&
            typeof item.title === "string" &&
            typeof item.subtitle === "string",
        )
      : []
  } catch {
    return []
  }
}

/** Takes a saved cover out of the gallery. */
export function deleteSavedCover(name: string) {
  const next = savedCovers().filter((item) => item.name !== name)
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  } catch {
    // Without storage nothing was kept to remove.
  }
  return next
}

/** Gives a saved cover a new name; a name already in the gallery, or an empty one, changes nothing. */
export function renameSavedCover(name: string, to: string) {
  const next = to.trim().slice(0, 24)
  const covers = savedCovers()
  if (!next || next === name || covers.some((item) => item.name === next)) {
    return covers
  }
  const renamed = covers.map((item) => (item.name === name ? { ...item, name: next } : item))
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(renamed))
  } catch {
    // Without storage the old name stays.
  }
  return renamed
}

export function saveCover(cover: SavedCover) {
  const next = [...savedCovers().filter((item) => item.name !== cover.name), cover].slice(-12)
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  } catch {
    // Without storage the cover is simply not kept.
  }
  return next
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    coverPage: {
      insertCoverPage: (variant: CoverVariant, title?: string, subtitle?: string) => ReturnType
      removeCoverPage: () => ReturnType
    }
  }
}

function paintCover(dom: HTMLElement, node: ProseNode) {
  const variant = String(node.attrs.variant || "sideline") as CoverVariant
  const title = String(node.attrs.title || "Document Title")
  const subtitle = String(node.attrs.subtitle || "Subtitle")
  dom.dataset.cover = variant
  dom.className = `cover-page cover-${variant}`
  dom.replaceChildren()
  const titleEl = document.createElement("div")
  titleEl.className = "cover-title"
  titleEl.textContent = title
  const subEl = document.createElement("div")
  subEl.className = "cover-subtitle"
  subEl.textContent = subtitle
  dom.append(titleEl, subEl)
}

export const CoverPage = Node.create({
  name: "coverPage",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      variant: {
        default: "sideline",
        parseHTML: (element) => element.getAttribute("data-cover") || "sideline",
        renderHTML: (attributes) => ({ "data-cover": attributes.variant }),
      },
      title: {
        default: "Document Title",
        parseHTML: (element) => element.getAttribute("data-title") || "Document Title",
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
      subtitle: {
        default: "Subtitle",
        parseHTML: (element) => element.getAttribute("data-subtitle") || "Subtitle",
        renderHTML: (attributes) => ({ "data-subtitle": attributes.subtitle }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-cover-page]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-cover-page": "", class: "cover-page" })]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      paintCover(dom, node)
      return {
        dom,
        update(next) {
          if (next.type.name !== "coverPage") {
            return false
          }
          paintCover(dom, next)
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },

  addCommands() {
    return {
      insertCoverPage:
        (variant, title, subtitle) =>
        ({ state, tr, dispatch }) => {
          const coverType = state.schema.nodes.coverPage
          const breakType = state.schema.nodes.pageBreak
          if (!coverType || !breakType || !dispatch) {
            return false
          }
          const preset = COVER_PAGES.find((item) => item.id === variant) ?? COVER_PAGES[0]
          const from = 0
          let to = 0
          const first = state.doc.firstChild
          if (first?.type.name === "coverPage") {
            to = first.nodeSize
            const next = state.doc.childCount > 1 ? state.doc.child(1) : null
            if (next?.type.name === "pageBreak") {
              to += next.nodeSize
            }
          }
          const cover = coverType.create({
            variant,
            title: title ?? preset.title,
            subtitle: subtitle ?? preset.subtitle,
          })
          const block = Fragment.from([cover, breakType.create()])
          if (to > from) {
            tr.replaceWith(from, to, block)
          } else {
            tr.insert(0, block)
          }
          const caret = TextSelection.findFrom(tr.doc.resolve(Math.min(block.size + 1, tr.doc.content.size)), 1, true)
          if (caret) {
            tr.setSelection(caret)
          }
          tr.scrollIntoView()
          dispatch(tr)
          return true
        },
      removeCoverPage:
        () =>
        ({ state, tr, dispatch }) => {
          const first = state.doc.firstChild
          if (first?.type.name !== "coverPage" || !dispatch) {
            return false
          }
          let to = first.nodeSize
          const next = state.doc.childCount > 1 ? state.doc.child(1) : null
          if (next?.type.name === "pageBreak") {
            to += next.nodeSize
          }
          tr.delete(0, to)
          dispatch(tr)
          return true
        },
    }
  },
})
