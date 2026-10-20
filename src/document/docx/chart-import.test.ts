import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, relationshipsFor, writePackage } from "@/document/docx/opc"
import { decodeXml, xmlBytes } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"
const CHART_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"
const CHART_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/**
 * f13's picture swapped for a chart, written the way Word writes one: the chart namespace is declared on c:chart
 * and is not in mc:Ignorable, and the docPr carries an a16 extension.
 */
async function chartDocument() {
  const name = "f13_inline_image.docx"
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  const main = findPart(pkg, pkg.mainPartName)!
  const xml = decodeXml(main.data)
    .replace(
      /<wp:docPr [^>]*\/>/,
      `<wp:docPr id="1" name="Chart 1"><a:extLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
        `<a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}"><a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="{1}"/></a:ext>` +
        `</a:extLst></wp:docPr>`,
    )
    .replace(
      /<a:graphicData uri="http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/picture">[\s\S]*?<\/a:graphicData>/,
      `<a:graphicData uri="${CHART_NS}"><c:chart xmlns:c="${CHART_NS}" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId99"/></a:graphicData>`,
    )
  expect(xml).toContain("<c:chart")
  main.data = xmlBytes(xml.replace(/^<\?xml[^>]*\?>\s*/, ""))
  pkg.parts.push({
    name: "/word/charts/chart1.xml",
    contentType: CHART_TYPE,
    data: xmlBytes(`<c:chartSpace xmlns:c="${CHART_NS}"/>`),
  })
  pkg.overrides.push({ partName: "/word/charts/chart1.xml", contentType: CHART_TYPE })
  relationshipsFor(pkg, pkg.mainPartName).push({
    id: "rId99",
    type: CHART_REL,
    target: "charts/chart1.xml",
    targetMode: "Internal",
    partName: "/word/charts/chart1.xml",
  })
  return writePackage(pkg)
}

describe("charts in Word documents", () => {
  it("opens a document with a chart and keeps the chart when it is edited and saved", async () => {
    const opened = await openDocxBytes(await chartDocument(), "chart.docx")
    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: opened.view.html })
    editors.push(editor)
    expect(editor.getText()).toContain("BEFORE")
    // A chart has no text of its own; the editor names it in its place.
    expect(editor.getText()).toContain("[Chart 1]")
    editor.chain().insertContentAt(1, "Edited ").run()

    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "chart.docx",
    })
    const pkg = await openPackage(saved.bytes, "chart.docx")
    const document = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    expect(document).toContain("Edited BEFORE")
    expect(document).toMatch(/<c:chart [^>]*r:id="(rId\d+)"/)
    const relId = document.match(/<c:chart [^>]*r:id="(rId\d+)"/)![1]
    const rel = relationshipsFor(pkg, pkg.mainPartName).find((item) => item.id === relId)
    expect(rel).toMatchObject({ type: CHART_REL })
    expect(findPart(pkg, rel!.partName!)).toBeDefined()
  })
})
