import { BulletList, OrderedList } from "@tiptap/extension-list"

function markerAttribute() {
  return {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-marker"),
    renderHTML: (attributes: { marker?: string | null }) => {
      if (!attributes.marker) {
        return {}
      }
      return {
        "data-marker": attributes.marker,
        style: `list-style-type: ${attributes.marker}`,
      }
    },
  }
}

function schemeAttribute() {
  return {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-scheme"),
    renderHTML: (attributes: { scheme?: string | null }) => {
      if (!attributes.scheme) {
        return {}
      }
      return { "data-scheme": attributes.scheme }
    },
  }
}

/** A list opened from Word: spaced and indented as its numbering level says. Display only. */
function wordListAttributes() {
  return {
    wordList: {
      default: false,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-word-list") === "1",
      renderHTML: (attributes: { wordList?: boolean }) => (attributes.wordList ? { "data-word-list": "1" } : {}),
    },
    wordIndent: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-word-indent") ?? "",
      renderHTML: (attributes: { wordIndent?: string }) =>
        /^padding-left: \d+(\.\d+)?pt(; --list-indent-step: \d+(\.\d+)?pt)?$/.test(attributes.wordIndent ?? "")
          ? { "data-word-indent": attributes.wordIndent, style: attributes.wordIndent }
          : {},
    },
    /** The document's default tab stops in pt (`word-markers.ts`). */
    wordTab: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-word-tab") ?? "",
      renderHTML: (attributes: { wordTab?: string }) =>
        attributes.wordTab ? { "data-word-tab": attributes.wordTab } : {},
    },
    /** Word's marker for each level (`word-markers.ts`), drawn by the list marker decorations. */
    wordLevels: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-word-levels") ?? "",
      renderHTML: (attributes: { wordLevels?: string }) =>
        attributes.wordLevels ? { "data-word-levels": attributes.wordLevels } : {},
    },
  }
}

/**
 * Word's Adjust List Indents for the list's first level: where the marker starts and the text starts (pt from the
 * margin), what follows the marker, and a tab stop (`list-numbering.ts` reads and writes it). JSON, "" when unset.
 */
export type ListIndent = { number: number; text: number; follow: "tab" | "space" | "nothing"; tab: number | null }

export function parseListIndent(value: unknown): ListIndent | null {
  if (typeof value !== "string" || !value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as Partial<ListIndent>
    const number = Number(parsed.number)
    const text = Number(parsed.text)
    if (!Number.isFinite(number) || !Number.isFinite(text)) {
      return null
    }
    const follow = parsed.follow === "space" || parsed.follow === "nothing" ? parsed.follow : "tab"
    const tab = Number.isFinite(parsed.tab) && parsed.tab !== null ? Number(parsed.tab) : null
    return { number: Math.max(0, number), text: Math.max(0, text), follow, tab }
  } catch {
    return null
  }
}

function listIndentAttribute() {
  return {
    listIndent: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-list-indent") ?? "",
      renderHTML: (attributes: { listIndent?: string }) => {
        const indent = parseListIndent(attributes.listIndent)
        // After the opened list's own indent, so this padding wins.
        return indent ? { "data-list-indent": attributes.listIndent, style: `padding-left: ${indent.text}pt` } : {}
      },
    },
  }
}

export const StyledBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      marker: markerAttribute(),
      scheme: schemeAttribute(),
      ...wordListAttributes(),
      ...listIndentAttribute(),
    }
  },
})

/**
 * How a numbered list counts, as Word's Restart at 1, Continue Numbering and Set Numbering Value leave it. A list
 * that continues takes its `start` from the list before it of the same family (`list-numbering.ts` keeps it up to
 * date); one that does not starts at its own `start`.
 */
function numberingAttributes() {
  return {
    continueList: {
      default: false,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-continue") === "1",
      renderHTML: (attributes: { continueList?: boolean }) => (attributes.continueList ? { "data-continue": "1" } : {}),
    },
    /** The Word list (abstract numbering) a list opened from Word counts with; "" for the app's own lists. */
    listFamily: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-list-family") ?? "",
      renderHTML: (attributes: { listFamily?: string }) =>
        attributes.listFamily ? { "data-list-family": attributes.listFamily } : {},
    },
    /** "start|continue" as the list was opened, so a list whose numbering was not changed is saved as Word wrote it. */
    openedAs: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-opened") ?? "",
      renderHTML: (attributes: { openedAs?: string }) =>
        attributes.openedAs ? { "data-opened": attributes.openedAs } : {},
    },
  }
}

export const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      marker: markerAttribute(),
      scheme: schemeAttribute(),
      ...wordListAttributes(),
      ...numberingAttributes(),
      ...listIndentAttribute(),
    }
  },
})
