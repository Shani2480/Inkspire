import { LineHeight } from "@tiptap/extension-text-style"

/**
 * Word measures line spacing in lines of the font (Calibri's single line is about 1.22 times its size), CSS in
 * multiples of the font size. The open Word document's stylesheet sets --word-single-line to its body font's
 * line; other documents leave it unset, so a multiple renders as before.
 */
const SCALED = /^calc\(var\(--word-single-line, 1\) \* (\d*\.?\d+)\)$/

export const WordLineHeight = LineHeight.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const declared = /(?:^|;)\s*line-height:\s*([^;]+)/i.exec(element.getAttribute("style") ?? "")?.[1]
              const value = (declared ?? element.style.lineHeight).trim()
              return SCALED.exec(value)?.[1] ?? (value || null)
            },
            renderHTML: (attributes: { lineHeight?: unknown }) => {
              const value = attributes.lineHeight
              if (value === null || value === undefined || value === "") {
                return {}
              }
              const text = String(value).trim()
              if (/[;{}<>]/.test(text)) {
                return {}
              }
              return /^\d*\.?\d+$/.test(text)
                ? { style: `line-height: calc(var(--word-single-line, 1) * ${text})` }
                : { style: `line-height: ${text}` }
            },
          },
        },
      },
    ]
  },
})
