import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { editorToWord } from "@/document/docx/project"
import type { Paragraph, Table } from "@/document/docx/model"

const cell = (content: unknown[] = [{ type: "paragraph" }]) => ({
  type: "tableCell",
  attrs: { colspan: 1, rowspan: 1 },
  content,
})

function saved(attrs: Record<string, unknown> = {}, first: unknown[] = [{ type: "paragraph" }]) {
  const json = {
    type: "doc",
    content: [{ type: "table", attrs, content: [{ type: "tableRow", content: [cell(first), cell()] }] }],
  }
  const doc = editorToWord(json, emptyChrome(), {})
  return doc.blocks.find((block): block is Table => block.kind === "table")!
}

describe("tables made in the app", () => {
  it("save as Word's Table Grid: grid lines and one-line cell paragraphs", () => {
    const table = saved()
    expect(table.borders?.insideH).toEqual({ value: "single", sz: 4, space: 0, color: "auto" })
    expect(Object.keys(table.borders ?? {})).toHaveLength(6)
    const paragraph = table.rows[0]!.cells[0]!.blocks[0] as Paragraph
    expect(paragraph.pPr.spacing).toEqual({ before: 0, after: 0, line: 240, lineRule: "auto" })
  })

  it("keep the frame chosen and a paragraph's own style", () => {
    expect(saved({ frame: "none" }).borders).toBeUndefined()
    expect(Object.keys(saved({ frame: "bottom" }).borders ?? {})).toEqual(["bottom"])
    const styled = saved({}, [{ type: "paragraph", attrs: { namedStyle: "quote" } }])
    const paragraph = styled.rows[0]!.cells[0]!.blocks[0] as Paragraph
    expect(paragraph.styleId).toBe("Quote")
    expect(paragraph.pPr.spacing).toBeUndefined()
  })
})
