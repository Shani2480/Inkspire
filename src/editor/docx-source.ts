import { Extension } from "@tiptap/core"

/**
 * Keeps the data-docx anchor that links a block to the Word paragraph or table it was opened from, so saving can
 * start from the original properties and only apply what was edited. Splitting a paragraph copies the anchor,
 * the same way Word copies paragraph properties on Enter.
 */
export const DocxSource = Extension.create({
  name: "docxSource",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "table", "image", "linePicture", "pageBreak", "figure", "textBox", "smartArt"],
        attributes: {
          docxKey: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-docx"),
            renderHTML: (attributes: { docxKey?: string | null }) =>
              attributes.docxKey ? { "data-docx": attributes.docxKey } : {},
          },
        },
      },
      {
        // A piece of a Word paragraph the editor cut around an in-line picture (it has no inline pictures): the text
        // "before" the first picture, "between" two, or "next" after the last; saving joins the later pieces back
        // into the paragraph (document/docx/project.ts aroundPictures). Not copied on Enter.
        types: ["paragraph", "heading"],
        attributes: {
          docxPart: {
            default: null as string | null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-docx-part"),
            renderHTML: (attributes: { docxPart?: string | null }) =>
              attributes.docxPart ? { "data-docx-part": attributes.docxPart } : {},
          },
        },
      },
      {
        // The Word paragraph style, which the opened document's stylesheet shows. Saving takes the style from
        // the source paragraph, so this only affects how the paragraph looks.
        types: ["paragraph"],
        attributes: {
          wordStyle: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-word-style"),
            renderHTML: (attributes: { wordStyle?: string | null }) =>
              attributes.wordStyle ? { "data-word-style": attributes.wordStyle } : {},
          },
          // The paragraph mark's own size and font ("14pt|Avenir"), which an empty paragraph's line takes, as in
          // Word (word-lead.ts). Saving keeps the mark from the source paragraph; a new paragraph has none.
          // The paragraph's own w:snapToGrid ("0" off the document grid, "1" on it), drawn by the grid's rules.
          snapToGrid: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-snap-to-grid"),
            renderHTML: (attributes: { snapToGrid?: string | null }) =>
              attributes.snapToGrid ? { "data-snap-to-grid": attributes.snapToGrid } : {},
          },
          markFont: {
            default: null as string | null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-mark-font"),
            renderHTML: (attributes: { markFont?: string | null }) =>
              attributes.markFont ? { "data-mark-font": attributes.markFont } : {},
          },
        },
      },
    ]
  },
})
