import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, relationshipsFor } from "@/document/docx/opc"
import { readSheetGrid, sheetWorkbook } from "@/document/docx/sheet-object"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"
import { columnIndex, columnName, parseGrid, resolveCell } from "@/editor/sheet-grid"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function editorWith(content: string) {
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content,
  })
  editors.push(editor)
  return editor
}

const GRID = [
  ["Fruit", "Price", "Count", ""],
  ["Apples", "1.5", "4", "=B2*C2"],
  ["Pears", "2", "3", "=B3*C3"],
  ["Total", "", "=SUM(C2:C3)", "=SUM(D2:D3)"],
]

function sheets(editor: Editor) {
  const out: Record<string, unknown>[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "sheetBlock") {
      out.push(node.attrs)
    }
  })
  return out
}

async function save(editor: Editor, opened: Awaited<ReturnType<typeof openDocxBytes>>) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "t.docx",
  })
  if (process.env.SHEET_OUT) {
    const { writeFileSync } = await import("node:fs")
    writeFileSync(process.env.SHEET_OUT, saved.bytes)
  }
  const pkg = await openPackage(saved.bytes, "t.docx")
  return { bytes: saved.bytes, pkg, xml: decodeXml(findPart(pkg, "/word/document.xml")!.data) }
}

describe("Excel Spreadsheet (U29)", () => {
  it("names cells as Excel does and works out arithmetic, SUM, AVERAGE, MIN, MAX and COUNT", () => {
    expect([0, 25, 26, 51, 701].map(columnName)).toEqual(["A", "Z", "AA", "AZ", "ZZ"])
    expect(["A", "Z", "AA", "ZZ"].map(columnIndex)).toEqual([0, 25, 26, 701])
    expect(resolveCell(GRID, 1, 3)).toBe("6")
    expect(resolveCell(GRID, 3, 2)).toBe("7")
    expect(resolveCell(GRID, 3, 3)).toBe("12")
    const more = [
      ["=AVERAGE(A2:A4)", "=MIN(A2:A4)+MAX(A2:A4)", "=COUNT(A1:A4)", "=A1+C1", "=F1", "=E1*2"],
      ["2"],
      ["x"],
      ["7"],
    ]
    const grid = parseGrid(JSON.stringify(more))
    expect(grid[1]).toEqual(["2", "", "", "", "", ""])
    expect([0, 1, 2].map((col) => resolveCell(grid, 0, col))).toEqual(["4.5", "9", "3"])
    expect(resolveCell(grid, 0, 3)).toBe("7.5")
    // Cells that refer to each other can't be worked out.
    expect(resolveCell(grid, 0, 4)).toBe("#ERR")
    expect(resolveCell(grid, 0, 5)).toBe("#ERR")
  })

  it("keeps the grid in Excel's workbook: text, numbers and formulas with their values", async () => {
    const workbook = sheetWorkbook(GRID)
    const { readZip } = await import("@/document/docx/zip")
    const sheet = decodeXml(
      (await readZip(workbook)).find((item) => item.normalizedName === "xl/worksheets/sheet1.xml")!.data,
    )
    expect(sheet).toContain('<c r="B2"><v>1.5</v></c>')
    expect(sheet).toContain('<c r="D2"><f>B2*C2</f><v>6</v></c>')
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Fruit</t></is></c>')
    expect(await readSheetGrid(workbook)).toEqual(GRID)
  })

  it("saves the sheet as Word's embedded Excel worksheet, opens it again, and keeps an untouched one as it was", async () => {
    const name = "f01_runs.docx"
    const opened = await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
    const editor = editorWith(opened.view.html)
    editor.commands.setTextSelection(1)
    editor.commands.insertContent({ type: "sheetBlock", attrs: { grid: JSON.stringify(GRID) } })
    const { xml, pkg, bytes } = await save(editor, opened)
    const object = /<w:object\b[\s\S]*?<\/w:object>/.exec(xml)?.[0] ?? ""
    expect(object).toMatch(/w:dxaOrig="3840" w:dyaOrig="1200"/)
    expect(object).toMatch(/<v:shape id="_x0000_i\d+" type="#_x0000_t75" style="width:192pt;height:60pt" o:ole="">/)
    expect(object).toMatch(
      /<o:OLEObject Type="Embed" ProgID="Excel.Sheet.12" ShapeID="_x0000_i\d+" DrawAspect="Content"/,
    )
    const packageId = /<o:OLEObject\b[^>]*\br:id="([^"]+)"/.exec(object)![1]
    const imageId = /<v:imagedata r:id="([^"]+)"/.exec(object)![1]
    const rels = relationshipsFor(pkg, "/word/document.xml")
    const workbook = rels.find((rel) => rel.id === packageId)
    expect(workbook?.type).toMatch(/\/package$/)
    expect(rels.find((rel) => rel.id === imageId)?.type).toMatch(/\/image$/)
    expect(await readSheetGrid(findPart(pkg, workbook!.partName!)!.data)).toEqual(GRID)

    // Opened again, it is the sheet, and saved untouched it stays the same object and workbook.
    const again = await openDocxBytes(bytes, "t.docx")
    const reopened = editorWith(again.view.html)
    const [sheet] = sheets(reopened)
    expect(JSON.parse(String(sheet?.grid))).toEqual(GRID)
    expect(sheet?.sheetSource).toBe(sheet?.grid)
    expect(sheet?.docxKey).toBeTruthy()
    const kept = await save(reopened, again)
    expect(/<w:object\b[\s\S]*?<\/w:object>/.exec(kept.xml)?.[0]).toBe(object)
    expect(kept.xml.match(/<w:object\b/g)).toHaveLength(1)

    // A changed cell writes the sheet anew.
    let pos = -1
    reopened.state.doc.descendants((node, at) => {
      if (node.type.name === "sheetBlock") {
        pos = at
      }
    })
    const changed = GRID.map((row) => [...row])
    changed[1]![1] = "3"
    const node = reopened.state.doc.nodeAt(pos)!
    reopened.view.dispatch(
      reopened.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, grid: JSON.stringify(changed) }),
    )
    const edited = await save(reopened, again)
    const newId = /<o:OLEObject\b[^>]*\br:id="([^"]+)"/.exec(edited.xml)![1]
    const part = relationshipsFor(edited.pkg, "/word/document.xml").find((rel) => rel.id === newId)!.partName!
    const grid = await readSheetGrid(findPart(edited.pkg, part)!.data)
    expect(grid?.[1]?.[1]).toBe("3")
  })
})
