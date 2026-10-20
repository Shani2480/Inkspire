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
        /^padding-left: \d+(\.\d+)?pt$/.test(attributes.wordIndent ?? "")
          ? { "data-word-indent": attributes.wordIndent, style: attributes.wordIndent }
          : {},
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
    }
  },
})

export const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      marker: markerAttribute(),
      scheme: schemeAttribute(),
      ...wordListAttributes(),
    }
  },
})
