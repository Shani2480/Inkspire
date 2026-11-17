import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { applyCharacterStyle, applyParagraphStyle } from "@/editor/home-actions"
import { findStyle } from "@/document/styles"
import {
  applyStyleFromPane,
  characterStyleAt,
  clearParagraphFormatting,
  directCharacterFormatting,
  directParagraphFormatting,
  inspectStyles,
  paneStyles,
  paragraphStyleAt,
  revealFormatting,
  styleName,
} from "@/editor/style-inspect"
import { shortcutFor } from "@/editor/shortcuts"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"

let editor: Editor
afterEach(() => editor?.destroy())

const make = (content: string) => {
  editor = new Editor({ extensions: createExtensions(), content })
  return editor
}

const select = (text: string, length = text.length) => {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) {
      at = pos + node.text!.indexOf(text)
    }
  })
  editor.commands.setTextSelection({ from: at, to: at + length })
}

const apply = {
  paragraph: (id: string) => applyParagraphStyle(editor, id),
  character: (id: string) => applyCharacterStyle(editor, id),
}

describe("Style Inspector", () => {
  it("names the paragraph style and what the paragraph sets itself", () => {
    make('<h3>Deep</h3><p style="text-align: center">Body</p>')
    select("Deep", 0)
    expect(paragraphStyleAt(editor)).toBe("heading-3")
    expect(styleName("heading-3")).toBe("Heading 3")
    select("Body", 0)
    expect(inspectStyles(editor)).toMatchObject({ paragraphStyle: "Normal", characterStyle: "Default Paragraph Font" })
    expect(directParagraphFormatting(editor)).toEqual(["Centered"])
    clearParagraphFormatting(editor)
    expect(directParagraphFormatting(editor)).toEqual([])
  })

  it("separates a character style from formatting on top of it", () => {
    make("<p>plain strong words</p>")
    select("strong")
    applyCharacterStyle(editor, "strong")
    expect(characterStyleAt(editor)?.name).toBe("Strong")
    // Bold comes from the style, so it is not "Plus".
    expect(directCharacterFormatting(editor)).toEqual([])
    editor.chain().setItalic().run()
    expect(directCharacterFormatting(editor)).toEqual(["Italic"])
    select("plain")
    expect(characterStyleAt(editor)).toBeNull()
  })
})

describe("Reveal Formatting", () => {
  it("lists font, paragraph and section", () => {
    make("<p>Some <strong>bold</strong> text</p>")
    select("bold")
    const sections = revealFormatting(editor, DEFAULT_PAGE_SETUP)
    expect(sections.map((section) => section.title)).toEqual(["Font", "Paragraph", "Section"])
    const font = Object.fromEntries(sections[0]!.rows.map((row) => [row.label, row.value]))
    expect(font.Effects).toBe("Bold")
    expect(font.Size).toBe("12 pt")
    const paragraph = Object.fromEntries(sections[1]!.rows.map((row) => [row.label, row.value]))
    expect(paragraph["Paragraph style"]).toBe("Normal")
    expect(paragraph.Alignment).toBe("Left")
  })
})

describe("Styles pane", () => {
  it("lists shown styles, paragraph styles first", () => {
    const listed = paneStyles()
    const firstCharacter = listed.findIndex((style) => style.kind === "character")
    expect(listed.slice(firstCharacter).every((style) => style.kind === "character")).toBe(true)
    expect(listed.some((style) => style.hidden)).toBe(false)
  })

  it("applies a linked style to part of a paragraph as character formatting, unless linking is off", () => {
    make("<p>one two three</p>")
    const title = findStyle("heading-1")!
    select("two")
    expect(applyStyleFromPane(editor, title, false, apply)).toBe("linked")
    expect(editor.state.doc.firstChild!.type.name).toBe("paragraph")
    expect(editor.isActive("bold")).toBe(true)
    select("two")
    expect(applyStyleFromPane(editor, title, true, apply)).toBe("paragraph")
    expect(editor.state.doc.firstChild!.type.name).toBe("heading")
  })

  it("has Word's keys", () => {
    expect(shortcutFor("Mod+Shift+S")?.def.id).toBe("apply-styles")
    expect(shortcutFor("Mod+Alt+Shift+S")?.def.id).toBe("styles-pane")
    expect(shortcutFor("Shift+F1")?.def.id).toBe("reveal-formatting")
  })
})
