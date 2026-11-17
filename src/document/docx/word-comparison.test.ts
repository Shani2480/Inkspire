import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { formatPicture, dateFieldResult } from "@/document/field-date"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { blockFromProperties, propertiesFromBlock } from "@/document/docx/block-format"
import { openPackage } from "@/document/docx/opc"
import { documentStyleSheet } from "@/document/docx/word-styles"
import { wordLines } from "@/document/docx/project"
import { decodeXml } from "@/document/docx/xml"
import { borderSidesStyle } from "@/document/paragraph-sides"
import { NOTE_MARK } from "@/document/note-numbering"

/** What the fixtures look like in Word itself (rendered in Word, 2026-11-14), and Inkspire drawing them so. */
const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const CASES = path.resolve(process.cwd(), "tests/docx-fixtures/cases")

const open = (file: string) => openDocxBytes(new Uint8Array(readFileSync(file)), path.basename(file))

describe("list items with their own indent", () => {
  it("moves an item whose own left indent differs from its level's", async () => {
    const { view } = await open(path.join(AUTHORED, "f05_numbering.docx"))
    // Level 0 indents 720; the second and third items say 1080: 18 pt further in.
    expect(view.html.match(/<li[^>]*>/g)).toEqual(["<li>", '<li data-word-shift="18">', '<li data-word-shift="18">'])
  })

  it("draws the marker at the text's start when the item's first-line indent is 0", async () => {
    const { view } = await open(path.join(AUTHORED, "combined.docx"))
    const cell = /<td[^>]*>(.*?)<\/td>/.exec(view.html)![1]!
    // c11 keeps its level's hanging indent; c12 sets w:firstLine="0".
    expect(cell.match(/<li[^>]*>/g)).toEqual(["<li>", '<li data-word-own-hang="0">'])
  })
})

describe("footnotes and endnotes", () => {
  it("carries each note's text, with a mark for its number (the editor labels it), and each kind's separator", async () => {
    const { view } = await open(path.join(AUTHORED, "f08_footnote_endnote.docx"))
    expect(view.notes?.footnote["1"]).toContain('data-word-style="FootnoteText"')
    expect(view.notes?.footnote["1"]).toContain(`data-word-rstyle="FootnoteReference">${NOTE_MARK}<`)
    expect(view.notes?.endnote["1"]).toContain(`data-word-rstyle="EndnoteReference">${NOTE_MARK}<`)
    expect(view.notes?.separator.footnote).toContain("word-note-separator")
  })

  it("gives the separator's paragraph one of Word's lines, as the editor draws a paragraph's spacing", async () => {
    // Word's separator paragraph says line 240 (single): one line of the font, not one font size.
    const { view } = await open(path.join(AUTHORED, "f08_footnote_endnote.docx"))
    expect(view.notes?.separator.endnote).toMatch(
      /<p data-word-lead="" style="[^"]*line-height: calc\(var\(--word-single-line, 1\) \* 1\)/,
    )
    expect(wordLines('<p style="line-height: 1.5; margin-bottom: 0pt">x</p><p style="line-height: 18pt">y</p>')).toBe(
      '<p data-word-lead="" style="line-height: calc(var(--word-single-line, 1) * 1.5); margin-bottom: 0pt">x</p><p style="line-height: 18pt">y</p>',
    )
  })

  it("draws a superscript character style raised and smaller", async () => {
    const { word } = await open(path.join(AUTHORED, "f08_footnote_endnote.docx"))
    expect(documentStyleSheet(word)).toMatch(/\[data-word-rstyle="FootnoteReference"\] \{[^}]*vertical-align: super/)
  })
})

describe("a paragraph box whose sides differ", () => {
  it("keeps each side's own line: a red single top over a blue double bottom", async () => {
    const { view, word } = await open(path.join(AUTHORED, "f23_paragraph_box.docx"))
    expect(view.html).toContain('data-border-sides="top:single,12,C00000;bottom:double,18,0070C0"')
    expect(borderSidesStyle("top:single,12,C00000;bottom:double,18,0070C0")).toEqual([
      "--para-top: 2px solid #c00000",
      "--para-line-top: 2px",
      // Word draws each line of a double at the border's width, with a gap between.
      "--para-bottom: 9px double #0070c0",
      "--para-line-bottom: 9px",
    ])
    const paragraph = word.blocks.find((block) => block.kind === "paragraph" && block.pPr.borders?.bottom)
    const pPr = paragraph?.kind === "paragraph" ? paragraph.pPr : {}
    // An edit elsewhere in the paragraph (its alignment) keeps both sides as Word wrote them.
    const edited = { ...blockFromProperties(pPr), textAlign: "center" }
    expect(propertiesFromBlock(edited, pPr).borders).toEqual(pPr.borders)
  })
})

describe("styles drawn as Word draws them", () => {
  it("draws a style's own font over the theme font it inherits", async () => {
    const { word } = await open(path.join(AUTHORED, "f19_styles_custom.docx"))
    expect(documentStyleSheet(word)).toMatch(/p\[data-word-style="ProbeParaStyle"\] \{ font-family: 'Courier New'/)
  })

  it("draws line numbers in the Line Number style", async () => {
    const { word } = await open(path.join(AUTHORED, "f23_paragraph_box.docx"))
    expect(documentStyleSheet(word)).toMatch(/\.page-editor \.line-number \{ font-family: [^;]+; font-size: \d+pt/)
  })

  it("uses Word's own defaults where the file has none", async () => {
    // No styles part: the theme's body font (Aptos) at 12 pt, 8 pt after, line 278/240, as Word saves such a file.
    const none = documentStyleSheet((await open(path.join(CASES, "r06_missing_styles_part.docx"))).word)
    expect(none).toMatch(/^:root \.page-editor \{ font-family: 'Aptos'[^;]*; font-size: 12pt/)
    expect(none).toMatch(/:root \.page-editor p, :root \.page-editor li > p \{ margin-top: 0pt; margin-bottom: 8pt/)
    // A styles part without w:pPrDefault keeps its own run defaults and takes Word's paragraph spacing.
    const noParagraph = await open(path.join(CASES, "w03_space_handling.docx"))
    expect(noParagraph.word.styles.docDefaults.pPr).toEqual({})
    expect(documentStyleSheet(noParagraph.word)).toMatch(/li > p \{ margin-top: 0pt; margin-bottom: 8pt/)
  })
})

describe("content controls", () => {
  it("shows a control's content with its runs' styles (Placeholder Text)", async () => {
    const { view } = await open(path.join(AUTHORED, "f16_content_control.docx"))
    const shown = [...view.html.matchAll(/data-shown="([^"]*)"/g)].map((match) => match[1]!.replace(/&quot;/g, '"'))
    expect(shown[1]).toContain('data-word-rstyle="PlaceholderText"')
  })
})

describe("DATE and TIME fields", () => {
  const now = new Date(2026, 10, 14, 15, 7, 9)

  it("show the moment the document opens, as Word updates them", () => {
    expect(dateFieldResult(' DATE \\@ "d MMMM yyyy" ', now, "en-US")).toBe("14 November 2026")
    expect(dateFieldResult(' TIME \\@ "HH:mm" ', now, "en-US")).toBe("15:07")
    expect(dateFieldResult(" DATE  \\* MERGEFORMAT ", now, "en-US")).toBe("11/14/2026")
    expect(dateFieldResult(" CREATEDATE ", now)).toBeNull()
    expect(formatPicture(now, "dddd, MMM d 'at' h:mm am/pm", "en-US")).toBe("Saturday, Nov 14 at 3:07 pm")
  })

  it("opens a DATE field with today's date", async () => {
    const { view } = await open(path.join(AUTHORED, "f12_fields_toc.docx"))
    expect(view.html).toContain(`data-text="${new Date().toLocaleDateString()}"`)
  })
})

describe("values Word does not allow", () => {
  it("are left out on save, so Word opens the file", async () => {
    const opened = await open(path.join(CASES, "x12_bad_attr_value.docx"))
    const saved = await saveDocxBytes({
      json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "MARKER-A" }] }] },
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: true,
      fileName: "x12.docx",
    })
    const pkg = await openPackage(saved.bytes, "x12.docx")
    const xml = decodeXml(pkg.parts.find((part) => part.name === "/word/document.xml")!.data)
    expect(xml).toContain("MARKER-A")
    expect(xml).not.toContain('w:val="abc"')
    expect(xml).not.toContain('w:val="sideways"')
  })
})

describe("a picture alone in a list item", () => {
  it("opens with a blank line in the picture paragraph's style, which carries the bullet", async () => {
    const { view } = await open(path.join(AUTHORED, "combined.docx"))
    expect(view.html).toMatch(/<li[^>]*><p data-word-style="ListParagraph"><\/p><span [^>]*><img /)
  })
})
