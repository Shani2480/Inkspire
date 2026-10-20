import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { TableRow } from "@tiptap/extension-table"
import { CellSelection } from "@tiptap/pm/tables"
import { afterEach, describe, expect, it } from "vitest"
import {
  FramedTable,
  ShadedTableCell,
  ShadedTableHeader,
  TABLE_LOOKS,
  applyBorders,
  tableStyleOptions,
  toggleTableStyleOption,
} from "@/editor/table-tools"

const ROW = "<tr><td><p>a</p></td><td><p>b</p></td></tr>"

function tableEditor() {
  return new Editor({
    extensions: [StarterKit, FramedTable, TableRow, ShadedTableCell, ShadedTableHeader],
    content: `<table>${ROW}${ROW}</table>`,
  })
}

function borders(editor: Editor) {
  const found: (string | null)[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableCell") {
      found.push(node.attrs.borders)
    }
  })
  return found
}

describe("diagonal borders (21.30)", () => {
  it("toggles a diagonal on the selected cells and keeps their sides", () => {
    const editor = tableEditor()
    const cells: number[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "tableCell") {
        cells.push(pos)
      }
    })
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])))
    applyBorders(editor, "top")
    applyBorders(editor, "diagDown")
    expect(borders(editor).slice(0, 2)).toEqual(["top diagDown", "top diagDown"])
    applyBorders(editor, "diagUp")
    expect(borders(editor)[0]).toBe("top diagDown diagUp")
    applyBorders(editor, "all")
    expect(borders(editor)[0]).toBe("top right bottom left diagDown diagUp")
    applyBorders(editor, "diagDown")
    expect(borders(editor)[0]).toBe("top right bottom left diagUp")
    applyBorders(editor, "diagUp")
    expect(borders(editor)[0]).toBe("all")
    applyBorders(editor, "diagDown")
    applyBorders(editor, "none")
    expect(borders(editor)[0]).toBe("none")
    editor.destroy()
  })
})

describe("table borders and style options", () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  function selectAll(current: Editor) {
    const cells: number[] = []
    current.state.doc.descendants((node, pos) => {
      if (node.type.name === "tableCell") {
        cells.push(pos)
      }
    })
    current.view.dispatch(
      current.state.tr.setSelection(CellSelection.create(current.state.doc, cells[0], cells[cells.length - 1])),
    )
  }

  it("draws only the outside edges of the selected cells", () => {
    editor = tableEditor()
    selectAll(editor)
    applyBorders(editor, "outside")
    expect(borders(editor)).toEqual(["top left", "top right", "left bottom", "right bottom"].map(sortSides))
  })

  it("draws the inside edges, then clears every border", () => {
    editor = tableEditor()
    selectAll(editor)
    applyBorders(editor, "inside")
    expect(borders(editor)).toEqual(["right bottom", "left bottom", "top right", "top left"].map(sortSides))
    applyBorders(editor, "none")
    expect(borders(editor)).toEqual(["none", "none", "none", "none"])
  })

  it("keeps the pen on the cells it drew", () => {
    editor = tableEditor()
    selectAll(editor)
    applyBorders(editor, "all", { width: 3, color: "#c00000", style: "dashed" })
    const pens: unknown[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "tableCell") {
        pens.push(node.attrs.borderPen)
      }
    })
    expect(new Set(pens)).toEqual(new Set(["4px dashed #c00000"]))
    expect(borders(editor)).toEqual(["all", "all", "all", "all"])
  })

  it("turns Total Row and Last Column on and off", () => {
    editor = tableEditor()
    editor.commands.setTextSelection(3)
    toggleTableStyleOption(editor, "totalRow")
    toggleTableStyleOption(editor, "lastColumn")
    expect(tableStyleOptions(editor)).toMatchObject({ totalRow: true, lastColumn: true })
    toggleTableStyleOption(editor, "totalRow")
    expect(tableStyleOptions(editor)?.totalRow).toBe(false)
    expect(editor.getHTML()).toContain('data-last-column="1"')
  })

  it("offers the gallery's fourteen styles", () => {
    expect(TABLE_LOOKS).toHaveLength(14)
  })
})

/** The sides come out in Word's order (top, right, bottom, left) whatever order a test lists them in. */
function sortSides(value: string) {
  const order = ["top", "right", "bottom", "left"]
  return value
    .split(" ")
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .join(" ")
}
