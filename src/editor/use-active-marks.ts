import { SHAPE_TEXT_SIZE, selectedShapeText } from "@/editor/shape-text"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"

export type TextAlignValue = "left" | "center" | "right" | "justify"

export type ActiveMarks = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  bulletList: boolean
  orderedList: boolean
  link: boolean
  align: TextAlignValue
  fontFamily: string
  fontSize: string
  color: string
  highlight: string
  lineHeight: string
  href: string
  headingLevel: 0 | 1 | 2 | 3
  subscript: boolean
  superscript: boolean
  underlineStyle: string
  effect: string
  namedStyle: string
  /** The Word paragraph style an opened document's paragraph shows. */
  wordStyle: string
  charStyle: string
  shading: string
  border: string
  bulletMarker: string
  numberMarker: string
  listScheme: string
}

const idleMarks: ActiveMarks = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  bulletList: false,
  orderedList: false,
  link: false,
  align: "left",
  fontFamily: "",
  fontSize: "",
  color: "",
  highlight: "",
  lineHeight: "",
  href: "",
  headingLevel: 0,
  subscript: false,
  superscript: false,
  underlineStyle: "",
  effect: "",
  namedStyle: "",
  wordStyle: "",
  charStyle: "",
  shading: "",
  border: "",
  bulletMarker: "",
  numberMarker: "",
  listScheme: "",
}

function readAlign(editor: Editor): TextAlignValue {
  const source = editor.isActive("heading") ? "heading" : "paragraph"
  const value = editor.getAttributes(source).textAlign
  if (value === "center" || value === "right" || value === "justify") {
    return value
  }
  return "left"
}

function readHeadingLevel(editor: Editor): 0 | 1 | 2 | 3 {
  if (editor.isActive("heading", { level: 1 })) {
    return 1
  }
  if (editor.isActive("heading", { level: 2 })) {
    return 2
  }
  if (editor.isActive("heading", { level: 3 })) {
    return 3
  }
  return 0
}

function readLineHeight(editor: Editor) {
  const source = editor.isActive("heading") ? "heading" : "paragraph"
  const value = editor.getAttributes(source).lineHeight
  return typeof value === "string" ? value : ""
}

export function useActiveMarks(editor: Editor | null) {
  const marks = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return idleMarks
      }

      const textStyle = current.getAttributes("textStyle")
      const highlight = current.getAttributes("highlight")
      const underline = current.getAttributes("underline")
      const block = current.getAttributes(current.isActive("heading") ? "heading" : "paragraph")
      const bullet = current.getAttributes("bulletList")
      const ordered = current.getAttributes("orderedList")

      // With a shape selected the font controls show and change its text.
      const shape = selectedShapeText(current)
      return {
        bold: shape ? Boolean(shape.attrs.textBold) : current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        link: current.isActive("link"),
        align: readAlign(current),
        fontFamily: shape
          ? String(shape.attrs.textFont || "")
          : typeof textStyle.fontFamily === "string"
            ? textStyle.fontFamily
            : "",
        fontSize: shape
          ? `${Number(shape.attrs.textSize) || SHAPE_TEXT_SIZE}pt`
          : typeof textStyle.fontSize === "string"
            ? textStyle.fontSize
            : "",
        color: shape ? String(shape.attrs.textColor || "") : typeof textStyle.color === "string" ? textStyle.color : "",
        highlight: typeof highlight.color === "string" ? highlight.color : "",
        lineHeight: readLineHeight(current),
        headingLevel: readHeadingLevel(current),
        href: typeof current.getAttributes("link").href === "string" ? current.getAttributes("link").href : "",
        subscript: current.isActive("subscript"),
        superscript: current.isActive("superscript"),
        underlineStyle: current.isActive("underline") && typeof underline.style === "string" ? underline.style : "",
        effect: typeof textStyle.effect === "string" ? textStyle.effect : "",
        namedStyle: typeof block.namedStyle === "string" ? block.namedStyle : "",
        wordStyle: typeof block.wordStyle === "string" ? block.wordStyle : "",
        charStyle: typeof textStyle.charStyle === "string" ? textStyle.charStyle : "",
        shading: typeof block.shading === "string" ? block.shading : "",
        border: typeof block.border === "string" ? block.border : "",
        bulletMarker: typeof bullet.marker === "string" ? bullet.marker : "",
        numberMarker: typeof ordered.marker === "string" ? ordered.marker : "",
        listScheme:
          (typeof ordered.scheme === "string" && ordered.scheme) ||
          (typeof bullet.scheme === "string" && bullet.scheme) ||
          "",
      } satisfies ActiveMarks
    },
  })

  return marks ?? idleMarks
}
