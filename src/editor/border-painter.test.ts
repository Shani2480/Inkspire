import { Editor } from "@tiptap/core"
import { TableRow } from "@tiptap/extension-table"
import { StarterKit } from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import {
  BORDER_STYLE_PRESETS,
  BORDER_STYLES,
  FramedTable,
  ShadedTableCell,
  ShadedTableHeader,
  inTable,
  nearestCellSide,
  setBordersOnCells,
  shadeScope,
  paintCellEdge,
} from "@/editor/table-tools"

const RECT = { left: 100, right: 200, top: 50, bottom: 90 }

describe("the Border Painter (21.30)", () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it("finds the cell edge a click is nearest to", () => {
    expect(nearestCellSide(RECT, 150, 52)).toBe("top")
    expect(nearestCellSide(RECT, 150, 88)).toBe("bottom")
    expect(nearestCellSide(RECT, 102, 70)).toBe("left")
    expect(nearestCellSide(RECT, 198, 70)).toBe("right")
  })

  it("draws the pen on that edge of the cell and keeps edges already drawn", () => {
    editor = new Editor({
      extensions: [StarterKit, FramedTable, TableRow, ShadedTableCell, ShadedTableHeader],
      content: "<table><tr><td><p>a</p></td><td><p>b</p></td></tr></table>",
    })
    let cell = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "tableCell" && cell < 0) {
        cell = pos
      }
    })
    const view = editor.view as unknown as {
      posAtCoords: () => { pos: number; inside: number }
      nodeDOM: (pos: number) => unknown
    }
    view.posAtCoords = () => ({ pos: cell + 2, inside: cell })
    const dom = document.createElement("td")
    dom.getBoundingClientRect = () => ({ ...RECT, width: 100, height: 40, x: 100, y: 50, toJSON: () => ({}) })
    const real = view.nodeDOM.bind(view)
    view.nodeDOM = (pos) => (pos === cell ? dom : real(pos))

    expect(paintCellEdge(editor, 150, 52, { width: 3, color: "#c00000", style: "dashed" })).toBe(true)
    expect(paintCellEdge(editor, 102, 70, { width: 3, color: "#c00000", style: "dashed" })).toBe(true)
    const attrs = editor.state.doc.nodeAt(cell)?.attrs
    expect(attrs?.borders?.split(" ").sort()).toEqual(["left", "top"])
    expect(attrs?.borderPen).toBe("4px dashed #c00000")
  })

  it("has a gallery of distinct pens that the pen menus can show", () => {
    expect(BORDER_STYLE_PRESETS.length).toBeGreaterThanOrEqual(8)
    for (const preset of BORDER_STYLE_PRESETS) {
      expect(BORDER_STYLES).toContain(preset.pen.style)
    }
    expect(new Set(BORDER_STYLE_PRESETS.map((preset) => JSON.stringify(preset.pen))).size).toBe(
      BORDER_STYLE_PRESETS.length,
    )
  })
})

describe("Borders and Shading dialog on a table (22.4)", () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })
  const grid = () =>
    new Editor({
      extensions: [StarterKit, FramedTable, TableRow, ShadedTableCell, ShadedTableHeader],
      content: "<table><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></table>",
    })
  const cellAttrs = (current: Editor) => {
    const found: Record<string, unknown>[] = []
    current.state.doc.descendants((node) => {
      if (node.type.name === "tableCell") {
        found.push(node.attrs)
      }
    })
    return found
  }
  const PEN = { width: 1, color: "#112233", style: "solid" }

  it("draws a box round the whole table and the lines between cells for a grid", () => {
    editor = grid()
    editor.commands.setTextSelection(4)
    expect(inTable(editor)).toBe(true)
    setBordersOnCells(editor, "table", new Set(["top", "bottom", "left", "right"]), PEN)
    expect(cellAttrs(editor).map((attrs) => attrs.borders)).toEqual([
      "top left",
      "top right",
      "bottom left",
      "right bottom",
    ])
    setBordersOnCells(editor, "table", new Set(["top", "bottom", "left", "right", "insideH", "insideV"]), PEN)
    expect(cellAttrs(editor).map((attrs) => attrs.borders)).toEqual(["all", "all", "all", "all"])
    expect(cellAttrs(editor)[0].borderPen).toBe("1.3333333333333333px solid #112233")
  })

  it("replaces what was there, and clears it when no edge is chosen", () => {
    editor = grid()
    editor.commands.setTextSelection(4)
    setBordersOnCells(editor, "table", new Set(["insideH"]), PEN)
    expect(cellAttrs(editor).map((attrs) => attrs.borders)).toEqual(["bottom", "bottom", "top", "top"])
    setBordersOnCells(editor, "table", new Set(), PEN)
    expect(cellAttrs(editor).map((attrs) => [attrs.borders, attrs.borderPen])).toEqual(Array(4).fill(["none", null]))
  })

  it("keeps a cell scope to its own cell and adds its diagonals", () => {
    editor = grid()
    editor.commands.setTextSelection(4)
    setBordersOnCells(editor, "cell", new Set(["top", "bottom", "left", "right", "diagUp"]), PEN)
    const attrs = cellAttrs(editor)
    expect(attrs[0].borders).toBe("top right bottom left diagUp")
    expect(attrs[1].borders).toBeNull()
  })

  it("shades the cell or the table", () => {
    editor = grid()
    editor.commands.setTextSelection(4)
    shadeScope(editor, "cell", "#ffeb9c")
    expect(cellAttrs(editor).map((attrs) => attrs.backgroundColor)).toEqual(["#ffeb9c", null, null, null])
    shadeScope(editor, "table", "#c6efce")
    expect(cellAttrs(editor).every((attrs) => attrs.backgroundColor === "#c6efce")).toBe(true)
    shadeScope(editor, "table", null)
    expect(cellAttrs(editor).every((attrs) => attrs.backgroundColor === null)).toBe(true)
  })
})
