import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { createExtensions } from "@/editor/extensions"
import { BLOCK_GALLERIES, loadQuickParts, saveBuildingBlock } from "@/editor/quick-parts"
import { builtInQuickTables, monthRows, quickTableContent, quickTablePreview } from "@/editor/quick-tables"

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

function editorWith(content: string) {
  const editor = new Editor({ extensions: createExtensions().filter((item) => item.name !== "spellcheck"), content })
  editors.push(editor)
  return editor
}

describe("Quick Tables (U29)", () => {
  it("lays a month out Monday first", () => {
    // 1 July 2027 is a Thursday; 31 July a Saturday.
    const rows = monthRows(2027, 6)
    expect(rows[0]).toEqual(["", "", "", "1", "2", "3", "4"])
    expect(rows.at(-1)).toEqual(["26", "27", "28", "29", "30", "31", ""])
  })

  it("has Word's built-in tables, by Word's names, and the Tables gallery", () => {
    expect(builtInQuickTables().map((table) => table.name)).toEqual([
      "Calendar 1",
      "Calendar 2",
      "Double Table",
      "Matrix",
      "Tabular List",
      "With Subheads 1",
      "With Subheads 2",
    ])
    expect(BLOCK_GALLERIES).toContain("Tables")
    for (const table of builtInQuickTables()) {
      expect(quickTablePreview(table)).toMatch(/^<table class="quick-table-preview"/)
    }
  })

  it("keeps a table saved with Save Selection to Quick Tables Gallery in the Tables gallery", () => {
    localStorage.clear()
    saveBuildingBlock({
      name: "Rota",
      html: "<table><tr><td><p>Mon</p></td></tr></table>",
      gallery: "Tables",
      category: "General",
      description: "",
    })
    expect(loadQuickParts().map((part) => [part.name, part.gallery])).toEqual([["Rota", "Tables"]])
  })

  it("inserts each as a table with its rows, and saves its borders, shading and colours to Word", async () => {
    const editor = editorWith("<p>Before</p>")
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertContent(
      builtInQuickTables().flatMap((table) => [
        { type: "paragraph", content: [{ type: "text", text: table.name }] },
        quickTableContent(table),
      ]),
    )
    const tables: number[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "table") {
        tables.push(node.childCount)
        return false
      }
      return true
    })
    expect(tables).toEqual(builtInQuickTables().map((table) => table.rows.length))
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "quick-tables.docx",
    })
    if (process.env.QUICK_TABLES_OUT) {
      const { writeFileSync } = await import("node:fs")
      writeFileSync(process.env.QUICK_TABLES_OUT, saved.bytes)
    }
    const pkg = await openPackage(saved.bytes, "quick-tables.docx")
    const xml = decodeXml(findPart(pkg, "/word/document.xml")!.data)
    expect(xml.match(/<w:tbl>/g)).toHaveLength(7)
    // Calendar 1's title: across the week, white on blue, 18 pt.
    expect(xml).toMatch(
      /<w:gridSpan w:val="7"\/><w:tcBorders>[\s\S]*?<w:shd w:val="clear" w:color="auto" w:fill="4472C4"\/>/,
    )
    expect(xml).toContain('<w:color w:val="FFFFFF"/><w:sz w:val="36"/>')
    // A day's bottom line: Word's half point (sz 4), in the line colour.
    expect(xml).toContain('<w:bottom w:val="single" w:sz="4" w:space="0" w:color="8EAADB"/>')
    expect(xml).toContain("Community garden, kg")
    // A table made in the app keeps its columns in Word (a width on each cell, as Word's Insert Table writes) and its
    // text away from the cell's sides (Word's Normal Table margins).
    expect(xml).toMatch(/<w:gridSpan w:val="7"\/>/)
    expect(xml).toMatch(/<w:tc><w:tcPr><w:tcW w:w="\d+" w:type="dxa"\/>/)
    const styles = decodeXml(findPart(pkg, "/word/styles.xml")!.data)
    expect(styles).toContain('w:styleId="TableNormal"')
    expect(styles).toContain('<w:left w:w="108" w:type="dxa"/>')
  })
})
