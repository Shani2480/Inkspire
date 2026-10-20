import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { SheetBlock } from "@/editor/sheet-block"

describe("embedded spreadsheet", () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  function open() {
    const element = document.createElement("div")
    document.body.append(element)
    editor = new Editor({ element, extensions: [StarterKit, SheetBlock], content: "<p>Before</p>" })
    editor.commands.insertSheetBlock()
    return { element, editor }
  }

  const cell = (element: HTMLElement, ref: string) => element.querySelector<HTMLInputElement>(`input[title="${ref}"]`)!

  it("keeps typed cells in the grid, with formulas worked out", () => {
    const { element, editor: current } = open()
    const a1 = cell(element, "A1")
    a1.value = "12"
    a1.dispatchEvent(new Event("change"))
    cell(element, "B1").value = "=A1*2"
    cell(element, "B1").dispatchEvent(new Event("change"))
    const grid = JSON.parse(current.getJSON().content!.find((node) => node.type === "sheetBlock")!.attrs!.grid)
    expect(grid[0].slice(0, 2)).toEqual(["12", "=A1*2"])
    expect(element.querySelectorAll("table.sheet-grid")).toHaveLength(1)
    expect(element.querySelectorAll(".sheet-cell-value")[1]!.textContent).toBe("24")
  })

  it("moves between cells with Tab and Enter, saving the one it leaves, without rebuilding the grid", () => {
    const { element, editor: current } = open()
    const table = element.querySelector("table")
    const a1 = cell(element, "A1")
    a1.focus()
    a1.value = "5"
    a1.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(cell(element, "B1"))
    cell(element, "B1").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(cell(element, "B2"))
    expect(element.querySelector("table")).toBe(table)
    expect(current.getHTML()).toContain("5")
  })
})
