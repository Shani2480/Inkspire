import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphsIn, paragraphText, resolveRunProperties, type Run } from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { autoColorRule, runOffTokens } from "@/document/docx/word-styles"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

/**
 * The shapes that made a registration form open "weird": runs that switch off their heading style's bold and
 * italic, character styles over bold paragraph styles, highlights, automatic text on a dark cell, a row whose
 * borders are its own (w:tblPrEx), a left paragraph in a centred style, and a run's colour and size under a
 * character style that sets others.
 */
const STYLES =
  `<w:style w:type="paragraph" w:styleId="LoudP"><w:name w:val="Loud"/><w:basedOn w:val="Normal"/>` +
  `<w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:i/></w:rPr></w:style>` +
  `<w:style w:type="character" w:styleId="StrongC"><w:name w:val="Strong C"/><w:rPr><w:b/></w:rPr></w:style>` +
  `<w:style w:type="character" w:styleId="GreenC"><w:name w:val="Green C"/>` +
  `<w:rPr><w:color w:val="58800B"/><w:sz w:val="21"/></w:rPr></w:style>`

const OFF = `<w:b w:val="0"/><w:i w:val="0"/>`
const BODY =
  `<w:p><w:pPr><w:pStyle w:val="LoudP"/><w:jc w:val="left"/></w:pPr>` +
  `<w:r><w:rPr>${OFF}<w:highlight w:val="yellow"/></w:rPr><w:t>plain yellow</w:t></w:r>` +
  `<w:r><w:t xml:space="preserve"> loud</w:t></w:r></w:p>` +
  `<w:p><w:pPr><w:pStyle w:val="LoudP"/></w:pPr>` +
  `<w:r><w:rPr><w:rStyle w:val="StrongC"/></w:rPr><w:t>toggled off</w:t></w:r></w:p>` +
  `<w:p><w:r><w:rPr><w:rStyle w:val="GreenC"/><w:color w:val="auto"/><w:sz w:val="18"/></w:rPr>` +
  `<w:t>own colour and size</w:t></w:r></w:p>` +
  `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid>` +
  `<w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="222A35"/></w:tcPr>` +
  `<w:p><w:r><w:t>white on dark</w:t></w:r></w:p></w:tc></w:tr>` +
  `<w:tr><w:tblPrEx><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
  `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPrEx>` +
  `<w:tc><w:p><w:r><w:t>row borders</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`

async function overridesDocx() {
  const name = "f02_heading_style.docx"
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  const edit = (partName: string, change: (xml: string) => string) => {
    const part = findPart(pkg, partName)!
    part.data = new TextEncoder().encode(change(decodeXml(part.data)))
  }
  edit("/word/styles.xml", (xml) => xml.replace("</w:styles>", `${STYLES}</w:styles>`))
  edit("/word/document.xml", (xml) => xml.replace(/<w:body>[\s\S]*?(<w:sectPr)/, `<w:body>${BODY}$1`))
  return writePackage(pkg)
}

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function editorWith(html: string) {
  const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
  const editor = new Editor({ extensions, content: html })
  editors.push(editor)
  return editor
}

function runWith(doc: Awaited<ReturnType<typeof openDocxBytes>>["word"], text: string) {
  for (const paragraph of paragraphsIn(doc.blocks)) {
    for (const inline of paragraph.inlines) {
      if (inline.kind === "run" && inline.content.some((item) => item.kind === "text" && item.text === text)) {
        return { paragraph, run: inline as Run }
      }
    }
  }
  throw new Error(`No run "${text}"`)
}

describe("runs that turn off what their styles turn on", () => {
  it("marks the bold and italic a run turns off, and a character style's bold Word's toggle rule cancels", async () => {
    const { word } = await openDocxBytes(await overridesDocx(), "overrides.docx")
    const plain = runWith(word, "plain yellow")
    expect(runOffTokens(word, plain.paragraph.styleId, plain.run.rPr)).toEqual(["b", "i"])
    expect(runOffTokens(word, plain.paragraph.styleId, runWith(word, " loud").run.rPr)).toEqual([])
    // Bold paragraph style + bold character style = not bold in Word; italic stays.
    const toggled = runWith(word, "toggled off")
    expect(runOffTokens(word, toggled.paragraph.styleId, toggled.run.rPr)).toEqual(["b"])
    expect(
      resolveRunProperties({ styles: word.styles, paragraphStyleId: "LoudP", characterStyleId: "StrongC" }),
    ).toMatchObject({ b: false, i: true })
    // A run setting its colour back to automatic under a character style's colour.
    const own = runWith(word, "own colour and size")
    expect(runOffTokens(word, own.paragraph.styleId, own.run.rPr)).toEqual(["color"])
  })

  it("carries the tokens, the highlight and the alignment through the editor", async () => {
    const opened = await openDocxBytes(await overridesDocx(), "overrides.docx")
    const html = editorWith(opened.view.html).getHTML()
    expect(html).toMatch(/data-docx-run="[^"]+" data-run-off="b i"/)
    expect(html).toMatch(/data-run-off="b"/)
    expect(html).toContain(`data-color="#ffff00"`)
    expect(html).toMatch(/data-word-style="LoudP" style="text-align: left/)
    // The run's own size sits inside the run's span, which carries the character style, so it wins.
    expect(html).toMatch(
      /<span data-docx-run="[^"]+" data-run-off="color" data-word-rstyle="GreenC"><span style="[^"]*font-size: 9pt/,
    )
  })

  it("saves the run as Word wrote it, and a highlight added in the editor as w:highlight", async () => {
    const opened = await openDocxBytes(await overridesDocx(), "overrides.docx")
    const editor = editorWith(opened.view.html)
    let from = -1
    editor.state.doc.descendants((node, pos) => {
      if (from < 0 && node.isText && node.text === " loud") {
        from = pos
      }
    })
    editor
      .chain()
      .setTextSelection({ from, to: from + 5 })
      .setHighlight({ color: "#00ff00" })
      .run()
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const doc = readDocument(await openPackage(saved.bytes, "edited.docx"))
    const first = paragraphsIn(doc.blocks).find((paragraph) => paragraphText(paragraph).startsWith("plain"))!
    const runs = first.inlines.filter((inline): inline is Run => inline.kind === "run")
    expect(runs[0]?.rPr).toMatchObject({ b: false, i: false, highlight: "yellow" })
    expect(
      runs.find((run) => run.content.some((item) => item.kind === "text" && item.text.includes("loud")))?.rPr,
    ).toMatchObject({ highlight: "green" })
    expect(first.pPr.jc).toBe("left")
  })
})

describe("tables", () => {
  it("draws a row's own borders (w:tblPrEx) and turns automatic text white on a dark cell", async () => {
    const opened = await openDocxBytes(await overridesDocx(), "overrides.docx")
    const html = editorWith(opened.view.html).getHTML()
    expect(html).toMatch(
      /<tr[^>]*data-word-frame="--wb-top: 0.5pt solid #000000; --wb-insideH: 0.5pt solid #000000; --wb-w-top: 0.667px; --wb-w-insideH: 0.667px"/,
    )
    expect(html).toContain("--word-auto-color: #ffffff")
  })

  it("picks white only for dark fills", () => {
    expect(autoColorRule("#222A35")).toBe("--word-auto-color: #ffffff")
    expect(autoColorRule("rgb(34, 42, 53)")).toBe("--word-auto-color: #ffffff")
    expect(autoColorRule("#FFFF00")).toBe("")
    expect(autoColorRule("#D9E2F3")).toBe("")
    expect(autoColorRule("rgba(0, 0, 0, 0)")).toBe("")
    expect(autoColorRule(undefined)).toBe("")
  })
})

describe("fonts", () => {
  it("lets a run's named font replace a theme font it inherits", () => {
    const styles = {
      docDefaults: { rPr: { rFonts: { asciiTheme: "minorHAnsi", hAnsiTheme: "minorHAnsi" } }, pPr: {} },
      styles: [],
      latentStyles: undefined,
    } as unknown as Parameters<typeof resolveRunProperties>[0]["styles"]
    const resolved = resolveRunProperties({ styles, direct: { rFonts: { ascii: "Arial", hAnsi: "Arial" } } })
    expect(resolved.rFonts).toMatchObject({ ascii: "Arial", hAnsi: "Arial" })
    expect(resolved.rFonts?.asciiTheme).toBeUndefined()
    expect(resolveRunProperties({ styles }).rFonts).toMatchObject({ asciiTheme: "minorHAnsi" })
  })
})
