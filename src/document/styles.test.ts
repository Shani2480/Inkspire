import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphsIn } from "@/document/docx/model"
import { editorToWord } from "@/document/docx/project"
import {
  BUILT_IN_STYLES,
  catalogWithStyles,
  defaultStyles,
  mergeStyles,
  newStyleId,
  packStyles,
  resetDefaultStyles,
  saveDefaultStyles,
  styleSheetFor,
  stylesFromWord,
  unpackStyles,
  wordStyleFor,
  type StyleDef,
} from "@/document/styles"

function edited(id: string, patch: Partial<StyleDef>): StyleDef[] {
  return BUILT_IN_STYLES.map((style) => (style.id === id ? { ...style, ...patch, changed: true } : style))
}

const custom: StyleDef = {
  id: "custom-callout",
  name: "Callout",
  kind: "paragraph",
  builtIn: false,
  wordId: "Callout",
  basedOn: "normal",
  next: "normal",
  font: { family: "Georgia", size: 14, bold: true, color: "#c00000" },
  paragraph: { align: "center", before: 6, after: 12, line: 1.15, indent: 1 },
  changed: true,
}

describe("document styles", () => {
  it("writes CSS only for the styles changed in the document", () => {
    expect(styleSheetFor(BUILT_IN_STYLES)).toBe("")
    const css = styleSheetFor(edited("title", { font: { size: 30, color: "#112233" } }))
    expect(css).toContain('[data-style="title"]')
    expect(css).toContain("font-size: 30pt")
    expect(css).toContain("#112233")
    expect(css).not.toContain('"subtitle"')
  })

  it("draws a changed heading on its heading element", () => {
    const css = styleSheetFor(edited("heading-1", { font: { size: 20, bold: false } }))
    expect(css).toMatch(/\.page-editor h1\b/)
  })

  it("turns a style into Word's units", () => {
    const style = wordStyleFor(custom, [...BUILT_IN_STYLES, custom])
    expect(style).toMatchObject({ id: "Callout", type: "paragraph", basedOn: "Normal", next: "Normal" })
    expect(style.rPr).toMatchObject({ sz: 28, b: true, color: "C00000", rFonts: { ascii: "Georgia" } })
    expect(style.pPr).toMatchObject({
      jc: "center",
      spacing: { before: 120, after: 240, line: 276, lineRule: "auto" },
      ind: { left: 567 },
    })
  })

  it("adds new and changed styles to the catalog and leaves the rest", () => {
    const styles = [...edited("title", { font: { size: 30 } }), custom]
    const catalog = catalogWithStyles({ styles: [] } as never, styles, new Set())
    const ids = catalog.styles.map((style) => style.id)
    expect(ids).toContain("Title")
    expect(ids).toContain("Callout")
    expect(ids).not.toContain("Subtitle")
  })

  it("keeps the styles through the app's HTML format", () => {
    const styles = [...edited("normal", { font: { size: 11 } }), custom]
    const packed = packStyles(styles) + "<p>Hello</p>"
    const unpacked = unpackStyles(packed)
    expect(unpacked.html).toBe("<p>Hello</p>")
    expect(unpacked.styles?.find((style) => style.id === "normal")?.font.size).toBe(11)
    expect(unpacked.styles?.find((style) => style.id === "custom-callout")?.name).toBe("Callout")
    expect(packStyles(BUILT_IN_STYLES)).toBe("")
    expect(unpackStyles("<p>x</p>").styles).toBeNull()
  })

  it("gives new styles ids that do not clash", () => {
    expect(newStyleId("Callout", [...BUILT_IN_STYLES, custom])).not.toBe("custom-callout")
    expect(newStyleId("Fresh Look", BUILT_IN_STYLES)).toBe("custom-fresh-look")
  })

  it("saves chosen styles as the defaults of new documents", () => {
    resetDefaultStyles()
    expect(defaultStyles()).toEqual(BUILT_IN_STYLES)
    saveDefaultStyles([{ ...custom }])
    const defaults = defaultStyles()
    expect(defaults.find((style) => style.id === "custom-callout")?.font.size).toBe(14)
    expect(mergeStyles(BUILT_IN_STYLES, [custom])).toHaveLength(BUILT_IN_STYLES.length + 1)
    resetDefaultStyles()
    expect(defaultStyles()).toEqual(BUILT_IN_STYLES)
  })

  it("saves a custom style and a Title paragraph to .docx and reads them back", async () => {
    const styles = [...edited("title", { font: { size: 30, color: "#112233" } }), custom]
    const json = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { namedStyle: "title" }, content: [{ type: "text", text: "Big" }] },
        { type: "paragraph", attrs: { namedStyle: "custom-callout" }, content: [{ type: "text", text: "Note" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    }
    const word = editorToWord(json, emptyChrome(), {}, null, styles)
    expect(paragraphsIn(word.blocks).map((paragraph) => paragraph.styleId)).toEqual(["Title", "Callout", undefined])

    const saved = await saveDocxBytes({
      json,
      chrome: emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "s.docx",
      styles,
    })
    const reopened = await openDocxBytes(saved.bytes, "s.docx")
    const read = stylesFromWord(reopened.word)
    const title = read.find((style) => style.id === "title")
    expect(title?.font).toMatchObject({ size: 30, color: "#112233" })
    const callout = read.find((style) => style.wordId === "Callout")
    expect(callout).toMatchObject({ name: "Callout", kind: "paragraph" })
    expect(callout?.font).toMatchObject({ size: 14, bold: true, family: "Georgia" })
    expect(callout?.paragraph).toMatchObject({ align: "center", before: 6, after: 12, indent: 1 })
  })
})
