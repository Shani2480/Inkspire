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

describe("Edit in Cells", () => {
  const CELLS = path.resolve(process.cwd(), "tests/docx-fixtures/cells/fruit-saved-by-cells.xlsx")

  it("reads a workbook Cells saved and keeps the results of functions the editor does not work out", async () => {
    const { attrsFromWorkbook } = await import("@/editor/sheet-cells")
    const { shownCells } = await import("@/editor/sheet-grid")
    const { readZip, storedZip } = await import("@/document/docx/zip")
    const bytes = new Uint8Array(readFileSync(CELLS))
    const attrs = (await attrsFromWorkbook(bytes))!
    expect(JSON.parse(attrs.grid)).toEqual(GRID)
    // A function only Cells knows: its result shows while the grid is Cells', and the editor's own once it changes.
    const entries = await readZip(bytes)
    const withRound = storedZip(
      entries.map((entry) => ({
        name: entry.normalizedName,
        data:
          entry.normalizedName === "xl/worksheets/sheet1.xml"
            ? new TextEncoder().encode(
                decodeXml(entry.data).replace("<f>SUM(C2:C3)</f><v>7</v>", "<f>ROUND(B2,0)</f><v>2</v>"),
              )
            : entry.data,
      })),
    )
    const round = (await attrsFromWorkbook(withRound))!
    const grid = JSON.parse(round.grid) as string[][]
    expect(grid[3]![2]).toBe("=ROUND(B2,0)")
    expect(shownCells(grid, round.workbookGrid, round.workbookValues)(3, 2)).toBe("2")
    expect(resolveCell(grid, 3, 2)).toBe("#ERR")
    const changed = grid.map((row) => [...row])
    changed[1]![1] = "4"
    const shown = shownCells(changed, round.workbookGrid, round.workbookValues)
    expect(shown(1, 3)).toBe("16")
    // ROUND keeps Cells' result while its text is the same; written anew, it has no result for Excel to show.
    expect(shown(3, 2)).toBe("2")
    expect(
      decodeXml(
        (await readZip(sheetWorkbook(changed))).find((e) => e.normalizedName === "xl/worksheets/sheet1.xml")!.data,
      ),
    ).toContain('<c r="C4"><f>ROUND(B2,0)</f></c>')
    changed[3]![2] = "=ROUND(B2,1)"
    expect(shownCells(changed, round.workbookGrid, round.workbookValues)(3, 2)).toBe("#ERR")
  })

  it("takes Cells' saves into the sheet it sent (undoably), and saves Cells' workbook as it is", async () => {
    const { takeFromCells } = await import("@/editor/sheet-cells")
    const name = "f01_runs.docx"
    const opened = await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
    const editor = editorWith(opened.view.html)
    editor.commands.setTextSelection(1)
    const copy = "/home/alex/.cache/inkspire/edit/t - Worksheet 1.xlsx"
    editor.commands.insertContent({ type: "sheetBlock", attrs: { grid: JSON.stringify([["a"]]), cellsEdit: copy } })
    const cells = new Uint8Array(readFileSync(CELLS))
    // Cells saves seconds later: a step of its own for Undo.
    const { closeHistory } = await import("@tiptap/pm/history")
    editor.view.dispatch(closeHistory(editor.state.tr))
    expect(await takeFromCells(editor, "/elsewhere.xlsx", cells)).toBe(false)
    expect(await takeFromCells(editor, copy, cells)).toBe(true)
    const [sheet] = sheets(editor)
    expect(JSON.parse(String(sheet?.grid))).toEqual(GRID)
    // Cells keeps only the cells in use: a bigger sheet keeps its size.
    const { attrsFromWorkbook } = await import("@/editor/sheet-cells")
    const grown = JSON.parse((await attrsFromWorkbook(cells, 6, 5))!.grid) as string[][]
    expect([grown.length, grown[0]!.length, grown[1]![3], grown[5]![4]]).toEqual([6, 5, "=B2*C2", ""])
    expect(sheet?.cellsEdit).toBe(copy)
    const { xml, pkg } = await save(editor, opened)
    const id = /<o:OLEObject\b[^>]*\br:id="([^"]+)"/.exec(xml)![1]
    const part = relationshipsFor(pkg, "/word/document.xml").find((rel) => rel.id === id)!.partName!
    expect(findPart(pkg, part)!.data).toEqual(cells)
    editor.commands.undo()
    expect(JSON.parse(String(sheets(editor)[0]?.grid))).toEqual([["a"]])
  })

  it("sends Word's own workbook while the sheet is unchanged, and one made from the grid after an edit", async () => {
    const { workbookOf } = await import("@/editor/sheet-cells")
    const name = "f01_runs.docx"
    const opened = await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
    const editor = editorWith(opened.view.html)
    editor.commands.setTextSelection(1)
    editor.commands.insertContent({ type: "sheetBlock", attrs: { grid: JSON.stringify(GRID) } })
    const { bytes } = await save(editor, opened)
    const again = await openDocxBytes(bytes, "t.docx")
    const reopened = editorWith(again.view.html)
    const [sheet] = sheets(reopened)
    expect(workbookOf(sheet!)).toEqual(again.word.sheets![0]!.workbook)
    const edited = { ...sheet, grid: JSON.stringify([["x"]]) }
    expect(await readSheetGrid(workbookOf(edited))).toEqual([["x"]])
  })
})
