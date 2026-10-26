import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TextBoxMark } from "@/editor/character-format"
import { Editor } from "@tiptap/core"
import { TableRow } from "@tiptap/extension-table"
import { StarterKit } from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import {
  BordersShadingHost,
  borderSpaceValue,
  edgesOf,
  openBordersAndShading,
  paragraphBorderOf,
  settingOf,
} from "@/components/borders-shading-dialog"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { IndentedParagraph } from "@/editor/indent"
import {
  DEFAULT_PEN,
  FramedTable,
  ShadedTableCell,
  ShadedTableHeader,
  readScopedBorders,
  setBordersOnCells,
} from "@/editor/table-tools"

afterEach(cleanup)

function make(content: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ paragraph: false }),
      IndentedParagraph,
      FramedTable,
      TableRow,
      ShadedTableCell,
      ShadedTableHeader,
      TextBoxMark,
    ],
    content,
  })
}
const TABLE = "<table><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></table>"
const cells = (editor: Editor) => {
  const found: Record<string, unknown>[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableCell") found.push(node.attrs)
  })
  return found
}

describe("settings and edges", () => {
  it("names the setting a set of edges matches", () => {
    expect(settingOf(new Set(), false)).toBe("none")
    expect(settingOf(edgesOf("box", new Set()), false)).toBe("box")
    expect(settingOf(edgesOf("all", new Set()), true)).toBe("all")
    expect(settingOf(edgesOf("all", new Set()), false)).toBe("custom")
    expect(settingOf(new Set(["top"]), false)).toBe("custom")
    expect(settingOf(edgesOf("shadow", new Set()), false, true)).toBe("shadow")
    expect(settingOf(edgesOf("box", new Set()), true, true)).toBe("box")
  })

  it("keeps Word's own gaps as no value", () => {
    expect(borderSpaceValue([1, 4, 1, 4])).toBeNull()
    expect(borderSpaceValue([0, 4, 1, 4])).toBe("0 4 1 4")
  })

  it("writes a paragraph border value", () => {
    expect(paragraphBorderOf(new Set())).toBeNull()
    expect(paragraphBorderOf(new Set(["top", "bottom", "left", "right"]))).toBe("all")
    expect(paragraphBorderOf(new Set(["bottom", "top"]))).toBe("top,bottom")
  })
})

describe("the Borders and Shading dialog (22.4)", () => {
  it("draws a box on the paragraph, with Cell and Table not offered", async () => {
    const editor = make("<p>one</p>")
    editor.commands.setTextSelection(2)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    expect(screen.queryByRole("option", { name: "Table" })).toBeNull()
    expect((screen.getByLabelText("Apply to") as HTMLSelectElement).value).toBe("paragraph")
    fireEvent.click(screen.getByRole("button", { name: "Box" }))
    fireEvent.click(screen.getByText("OK"))
    expect(editor.state.doc.firstChild?.attrs.border).toBe("all")
    expect(screen.queryByText("Setting:")).toBeNull()
  })

  it("applies a custom bottom edge from the preview buttons", () => {
    const editor = make("<p>one</p>")
    editor.commands.setTextSelection(2)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    fireEvent.click(screen.getByLabelText("Bottom Border"))
    expect(screen.getByRole("button", { name: "Custom" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByText("OK"))
    expect(editor.state.doc.firstChild?.attrs.border).toBe("bottom")
  })

  it("draws every line of a table with the chosen pen when Apply to is Table", () => {
    const editor = make(TABLE)
    editor.commands.setTextSelection(4)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    fireEvent.change(screen.getByLabelText("Apply to"), { target: { value: "table" } })
    fireEvent.click(screen.getByRole("button", { name: "All" }))
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "2.25" } })
    fireEvent.click(screen.getByRole("option", { name: /Dashed/ }))
    fireEvent.click(screen.getByText("OK"))
    expect(cells(editor).map((attrs) => attrs.borders)).toEqual(["all", "all", "all", "all"])
    expect(cells(editor)[0].borderPen).toBe("3px dashed #404040")
  })

  it("shades the cell on the Shading tab, and the table when Apply to is Table", () => {
    const editor = make(TABLE)
    editor.commands.setTextSelection(4)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor, "shading"))
    fireEvent.click(screen.getByRole("button", { name: /No Color/ }))
    fireEvent.click(screen.getByLabelText("#ffff00"))
    fireEvent.click(screen.getByText("OK"))
    expect(cells(editor).map((attrs) => attrs.backgroundColor)).toEqual(["#ffff00", null, null, null])
  })

  it("Cancel changes nothing", () => {
    const editor = make(TABLE)
    editor.commands.setTextSelection(4)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor, "shading"))
    fireEvent.click(screen.getByRole("button", { name: /No Color/ }))
    fireEvent.click(screen.getByLabelText("#ffff00"))
    fireEvent.click(screen.getByText("Cancel"))
    expect(cells(editor).every((attrs) => attrs.backgroundColor === null)).toBe(true)
  })

  it("opens on the borders and fill the paragraph already has", () => {
    const editor = make("<p>one</p>")
    editor.commands.setTextSelection(2)
    editor.commands.updateAttributes("paragraph", { border: "top,bottom", shading: "#ffff00" })
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    expect(screen.getByLabelText("Top Border").getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByLabelText("Left Border").getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByRole("button", { name: "Custom" }).getAttribute("aria-pressed")).toBe("true")
    // Nothing was touched, so OK leaves the paragraph as it was.
    fireEvent.click(screen.getByText("OK"))
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({ border: "top,bottom", shading: "#ffff00" })
  })

  it("opens on the box a cell already has, with its pen", () => {
    const editor = make(TABLE)
    editor.commands.setTextSelection(4)
    expect(
      setBordersOnCells(editor, "cell", new Set(["top", "bottom", "left", "right"]), {
        width: 1.5,
        color: "#ff0000",
        style: "dashed",
      }),
    ).toBe(true)
    const found = readScopedBorders(editor, "cell")
    expect(found?.edges).toEqual(new Set(["top", "bottom", "left", "right"]))
    expect(found?.pen).toEqual({ width: 1.5, color: "#ff0000", style: "dashed" })
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    expect(screen.getByRole("button", { name: "Box" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("gives a paragraph Word's Shadow box with the chosen pen (22.4)", () => {
    const editor = make("<p>one</p>")
    editor.commands.setTextSelection(2)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    fireEvent.click(screen.getByRole("button", { name: "Shadow" }))
    fireEvent.click(screen.getByRole("option", { name: /Dotted/ }))
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "1.5" } })
    fireEvent.click(screen.getByText("OK"))
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({
      border: "all",
      borderPen: "2px dotted #404040",
      borderShadow: true,
    })
  })

  it("applies a new pen alone to the lines already drawn, and opens on the Shadow box", () => {
    const editor = make("<p>one</p>")
    editor.commands.setTextSelection(2)
    editor.commands.updateAttributes("paragraph", { border: "all", borderShadow: true })
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    expect(screen.getByRole("button", { name: "Shadow" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "3" } })
    fireEvent.click(screen.getByText("OK"))
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({ border: "all", borderPen: "4px solid #404040" })
    expect(editor.state.doc.firstChild?.attrs.borderShadow).toBe(true)
  })

  it("drops the shadow when one edge is clicked (Custom)", () => {
    const editor = make("<p>one</p>")
    editor.commands.setTextSelection(2)
    editor.commands.updateAttributes("paragraph", { border: "all", borderShadow: true })
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    fireEvent.click(screen.getByLabelText("Top Border"))
    fireEvent.click(screen.getByText("OK"))
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({ border: "right,bottom,left", borderShadow: false })
  })

  it("sets the distance from the text in Options… (22.4)", () => {
    const editor = make("<p>one</p>")
    editor.commands.setTextSelection(2)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    fireEvent.click(screen.getByRole("button", { name: "Box" }))
    fireEvent.click(screen.getByRole("button", { name: "Options…" }))
    expect((screen.getByLabelText("Left:") as HTMLInputElement).value).toBe("4 pt")
    fireEvent.change(screen.getByLabelText("Top:"), { target: { value: "6" } })
    fireEvent.blur(screen.getByLabelText("Top:"))
    fireEvent.change(screen.getByLabelText("Left:"), { target: { value: "10" } })
    fireEvent.blur(screen.getByLabelText("Left:"))
    fireEvent.click(screen.getAllByText("OK")[1])
    fireEvent.click(screen.getByText("OK"))
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({ border: "all", borderSpace: "6 4 1 10" })
  })

  it("lays a pattern in its colour over a paragraph's fill, and opens on it (22.4)", () => {
    const editor = make("<p>one</p><p>two</p>")
    editor.commands.setTextSelection(2)
    editor.commands.updateAttributes("paragraph", { shading: "#ffff00" })
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor, "shading"))
    fireEvent.change(screen.getByLabelText("Pattern style"), { target: { value: "pct25" } })
    fireEvent.click(screen.getByRole("button", { name: /Automatic/ }))
    fireEvent.click(screen.getByLabelText("#ff0000"))
    fireEvent.click(screen.getByText("OK"))
    // The fill was not touched, so it stays.
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({ shading: "#ffff00", shadingPattern: "pct25 #ff0000" })
    expect(editor.getHTML()).toContain('data-shading-pattern="pct25 #ff0000"')
    cleanup()
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor, "shading"))
    expect((screen.getByLabelText("Pattern style") as HTMLSelectElement).value).toBe("pct25")
    fireEvent.change(screen.getByLabelText("Pattern style"), { target: { value: "clear" } })
    fireEvent.click(screen.getByText("OK"))
    expect(editor.state.doc.firstChild?.attrs.shadingPattern).toBeNull()
  })

  it("lays a pattern over a cell, then the whole table, and opens on it (22.4)", () => {
    const editor = make(TABLE)
    editor.commands.setTextSelection(4)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor, "shading"))
    fireEvent.change(screen.getByLabelText("Pattern style"), { target: { value: "pct25" } })
    fireEvent.click(screen.getByText("OK"))
    expect(cells(editor).map((attrs) => attrs.shadingPattern)).toEqual(["pct25", null, null, null])
    act(() => openBordersAndShading(editor, "shading"))
    expect((screen.getByLabelText("Pattern style") as HTMLSelectElement).value).toBe("pct25")
    fireEvent.change(screen.getByLabelText("Apply to"), { target: { value: "table" } })
    fireEvent.change(screen.getByLabelText("Pattern style"), { target: { value: "thinHorzCross" } })
    fireEvent.click(screen.getByText("OK"))
    expect(cells(editor).every((attrs) => attrs.shadingPattern === "thinHorzCross")).toBe(true)
  })

  it("starts on Text for part of a paragraph and draws a shadowed box and fill round it (22.4)", () => {
    const editor = make("<p>one two</p>")
    editor.commands.setTextSelection({ from: 1, to: 4 })
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    expect((screen.getByLabelText("Apply to") as HTMLSelectElement).value).toBe("text")
    expect(screen.queryByRole("button", { name: "Custom" })).toBeNull()
    expect(screen.queryByLabelText("Top Border")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Shadow" }))
    fireEvent.click(screen.getByText("Shading"))
    fireEvent.click(screen.getByRole("button", { name: /No Color/ }))
    fireEvent.click(screen.getByLabelText("#ffff00"))
    fireEvent.click(screen.getByText("OK"))
    const marks = (at: number) => editor.state.doc.nodeAt(at)?.marks.map((mark) => mark.attrs) ?? []
    expect(marks(1)).toEqual([{ border: expect.stringMatching(/solid/), shadow: true, fill: "#ffff00", pattern: null }])
    expect(marks(5)).toEqual([])
    expect(editor.state.doc.firstChild?.attrs.border).toBeNull()
    // Opened again on the same text, it shows the box; None takes it off and leaves the fill.
    cleanup()
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    expect(screen.getByRole("button", { name: "Shadow" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "None" }))
    fireEvent.click(screen.getByText("OK"))
    expect(marks(1)).toEqual([{ border: null, shadow: false, fill: "#ffff00", pattern: null }])
  })

  it("offers Options… for a paragraph only", () => {
    const editor = make(TABLE)
    editor.commands.setTextSelection(4)
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor))
    expect((screen.getByRole("button", { name: "Options…" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("sets the page border's pages and its distance in Options… (22.4)", () => {
    useDocumentStore.getState().setPageSetup(DEFAULT_PAGE_SETUP)
    const editor = make("<p>one</p>")
    render(<BordersShadingHost />)
    act(() => openBordersAndShading(editor, "page"))
    fireEvent.click(screen.getByRole("button", { name: /Solid/ }))
    fireEvent.change(screen.getByLabelText("Page border applies to"), { target: { value: "first" } })
    fireEvent.click(screen.getByRole("button", { name: "Options…" }))
    expect((screen.getByLabelText("Top:") as HTMLInputElement).value).toBe("24 pt")
    fireEvent.change(screen.getByLabelText("Top:"), { target: { value: "10" } })
    fireEvent.blur(screen.getByLabelText("Top:"))
    fireEvent.change(screen.getByLabelText("Measure from"), { target: { value: "text" } })
    fireEvent.click(screen.getAllByText("OK")[1])
    fireEvent.click(screen.getByText("OK"))
    expect(useDocumentStore.getState().pageSetup).toMatchObject({
      border: "single",
      borderDisplay: "first",
      borderFrom: "text",
      borderSpace: [10, 24, 24, 24],
    })
  })

  it("reads a table's inside lines back as All", () => {
    const editor = make(TABLE)
    editor.commands.setTextSelection(4)
    setBordersOnCells(editor, "table", new Set(["top", "bottom", "left", "right", "insideH", "insideV"]), DEFAULT_PEN)
    const found = readScopedBorders(editor, "table")
    expect(settingOf(found!.edges, true)).toBe("all")
  })
})
