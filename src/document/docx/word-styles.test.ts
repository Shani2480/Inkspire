import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphsIn, type Run } from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { documentStyleSheet, fontStack, themeFontsOf } from "@/document/docx/word-styles"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function source(name: string) {
  return new Uint8Array(readFileSync(path.join(AUTHORED, name)))
}

/** f01 with its "BEFORE" run set in the theme's heading font, the way Word marks theme fonts on a run. */
async function themeFontRun() {
  const pkg = await openPackage(source("f01_runs.docx"), "f01_runs.docx")
  const part = findPart(pkg, pkg.mainPartName)!
  const xml = decodeXml(part.data).replace(
    "<w:r><w:t>BEFORE</w:t></w:r>",
    `<w:r><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/></w:rPr><w:t>BEFORE</w:t></w:r>`,
  )
  part.data = new TextEncoder().encode(xml)
  return writePackage(pkg)
}

function runWithText(runs: Run[], text: string) {
  return runs.find((run) => run.content.some((item) => item.kind === "text" && item.text === text))
}

function runsOf(blocks: Parameters<typeof paragraphsIn>[0]) {
  return paragraphsIn(blocks).flatMap((paragraph) =>
    paragraph.inlines.filter((inline): inline is Run => inline.kind === "run"),
  )
}

async function openInEditor(bytes: Uint8Array) {
  const opened = await openDocxBytes(bytes, "styles.docx")
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: opened.view.html,
  })
  editors.push(editor)
  return { opened, editor }
}

async function save(opened: Awaited<ReturnType<typeof openDocxBytes>>, editor: Editor) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "styles.docx",
  })
  return readDocument(await openPackage(saved.bytes, "styles.docx"))
}

describe("the editor shows Word's styles", () => {
  it("reads the theme fonts", async () => {
    const opened = await openDocxBytes(source("f02_heading_style.docx"), "f02.docx")
    const theme = themeFontsOf(opened.word)
    expect(theme.minorLatin).toBeTruthy()
    expect(theme.majorLatin).toBeTruthy()
  })

  it("puts document defaults on the page, heading styles on headings, and other styles by id", async () => {
    const opened = await openDocxBytes(source("f02_heading_style.docx"), "f02.docx")
    const theme = themeFontsOf(opened.word)
    const css = documentStyleSheet(opened.word)
    const line = (selector: string) => css.split("\n").find((item) => item.startsWith(`${selector} {`)) ?? ""
    const page = line(":root .page-editor")
    expect(page).toContain(`font-family: ${fontStack(theme.minorLatin)}`)
    expect(page).toMatch(/font-size: \d+(\.\d+)?pt/)
    const heading = line(":root .page-editor h1")
    expect(heading).toContain(`font-family: ${fontStack(theme.majorLatin)}`)
    // Heading 1 has spacing before 18pt and after 4pt in this file.
    expect(heading).toContain("margin-top: 18pt")
    expect(heading).toContain("margin-bottom: 4pt")
    expect(css).toContain('[data-word-rstyle="Heading1Char"]')
  })

  it("names Office fonts' metric-compatible stand-ins", () => {
    expect(fontStack("Calibri")).toBe("'Calibri', 'Carlito', sans-serif")
    expect(fontStack("Times New Roman")).toBe("'Times New Roman', 'Liberation Serif', 'Tinos', serif")
    expect(fontStack("Some Font")).toBe("'Some Font', sans-serif")
  })

  it("tags paragraphs and runs with their Word styles", async () => {
    const combined = await openDocxBytes(source("combined.docx"), "combined.docx")
    expect(combined.view.html).toContain('data-word-style="ListParagraph"')
    const links = await openDocxBytes(source("f11_hyperlink_bookmark.docx"), "f11.docx")
    expect(links.view.html).toContain('data-word-rstyle="Hyperlink"')
    // The editor keeps both, so the stylesheet still applies after it renders the document.
    const shown = [
      (await openInEditor(source("combined.docx"))).editor,
      (await openInEditor(source("f11_hyperlink_bookmark.docx"))).editor,
    ]
    expect(shown[0]!.getHTML()).toContain('data-word-style="ListParagraph"')
    expect(shown[1]!.getHTML()).toContain('data-word-rstyle="Hyperlink"')
  })

  it("shows a run's theme font and saves it unchanged after an edit elsewhere", async () => {
    const bytes = await themeFontRun()
    const { opened, editor } = await openInEditor(bytes)
    const theme = themeFontsOf(opened.word)
    expect(opened.view.html).toContain(`font-family: ${fontStack(theme.majorLatin)}`)
    editor
      .chain()
      .insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: "edited" }] })
      .run()
    const doc = await save(opened, editor)
    expect(runWithText(runsOf(doc.blocks), "BEFORE")?.rPr.rFonts).toEqual({
      asciiTheme: "majorHAnsi",
      hAnsiTheme: "majorHAnsi",
    })
  })

  it("replaces a run's theme font when the user picks another font", async () => {
    const bytes = await themeFontRun()
    const { opened, editor } = await openInEditor(bytes)
    let from = -1
    editor.state.doc.descendants((node, pos) => {
      if (from < 0 && node.isText && node.text === "BEFORE") {
        from = pos
      }
    })
    editor
      .chain()
      .setTextSelection({ from, to: from + "BEFORE".length })
      .setFontFamily("Georgia")
      .run()
    const doc = await save(opened, editor)
    const fonts = runWithText(runsOf(doc.blocks), "BEFORE")?.rPr.rFonts
    expect(fonts?.ascii).toBe("Georgia")
    expect(fonts?.asciiTheme).toBeUndefined()
  })
})
