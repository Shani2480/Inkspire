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
        types: ["paragraph", "heading", "table", "image", "pageBreak", "figure", "textBox"],
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
        },
      },
    ]
  },
})
