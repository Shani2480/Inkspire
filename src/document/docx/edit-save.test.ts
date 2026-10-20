import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphText, paragraphsIn, type Paragraph, type WordDocument } from "@/document/docx/model"
import { openPackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** Opens a Word file the way the app does: docx → HTML → TipTap editor. */
async function openInEditor(name: string) {
  const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, name)))
  const opened = await openDocxBytes(bytes, name)
  // The spell checker fetches dictionaries from the dev server, which tests do not run.
  const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
  const editor = new Editor({ extensions, content: opened.view.html })
  editors.push(editor)
  return { opened, editor, original: readDocument(await openPackage(bytes, name)) }
}

/** Saves the editor content as an edited document (not the unchanged fast path) and reads it back. */
async function save(opened: Awaited<ReturnType<typeof openDocxBytes>>, editor: Editor, word = opened.word) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word,
    unchanged: false,
    fileName: "edited.docx",
  })
  return { doc: readDocument(await openPackage(saved.bytes, "edited.docx")), word: saved.word }
}

function byText(doc: WordDocument, text: string) {
  const found = paragraphsIn(doc.blocks).find((paragraph) => paragraphText(paragraph) === text)
  if (!found) {
    throw new Error(`No paragraph "${text}"`)
  }
  return found
}

/** Puts the cursor in the paragraph with this text and applies node attributes there. */
function setAttrs(editor: Editor, text: string, attrs: Record<string, unknown>) {
  let target = -1
  editor.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isTextblock && node.textContent === text) {
      target = pos
    }
  })
  expect(target, text).toBeGreaterThanOrEqual(0)
  const node = editor.state.doc.nodeAt(target)!
  editor.view.dispatch(editor.state.tr.setNodeMarkup(target, undefined, { ...node.attrs, ...attrs }))
}

function insertParagraphAtStart(editor: Editor, text: string) {
  editor
    .chain()
    .insertContentAt(0, { type: "paragraph", content: [{ type: "text", text }] })
    .run()
}

function formatting(paragraph: Paragraph) {
  return { styleId: paragraph.styleId, pPr: paragraph.pPr, markRPr: paragraph.markRPr }
}

describe("saving an edited Word document", () => {
  it("shows f03 spacing, line height, and indents in the editor", async () => {
    const { editor } = await openInEditor("f03_para_format.docx")
    let attrs: Record<string, unknown> = {}
    editor.state.doc.descendants((node) => {
      if (node.isTextblock && node.textContent === "centered, indented, spaced paragraph") {
        attrs = node.attrs
      }
    })
    expect(attrs).toMatchObject({
      textAlign: "center",
      spaceBefore: 12,
      spaceAfter: 6,
      lineHeight: "1.5",
      indent: 2,
      specialIndent: "first:0.64",
      keepNext: true,
    })
  })

  it("keeps every unedited paragraph's exact properties after an edit elsewhere", async () => {
    for (const name of ["f01_runs.docx", "f02_heading_style.docx", "f03_para_format.docx", "f19_styles_custom.docx"]) {
      const { opened, editor, original } = await openInEditor(name)
      insertParagraphAtStart(editor, "Inserted")
      const { doc } = await save(opened, editor)
      const before = paragraphsIn(original.blocks)
      const after = paragraphsIn(doc.blocks)
      expect(paragraphText(after[0]!), name).toBe("Inserted")
      expect(after.slice(1).map(formatting), name).toEqual(before.map(formatting))
    }
  })

  it("writes only the field the user changed and keeps the exact twips of the rest", async () => {
    const { opened, editor, original } = await openInEditor("f03_para_format.docx")
    setAttrs(editor, "AFTER", { spaceBefore: 18 })
    const { doc } = await save(opened, editor)
    const source = byText(original, "AFTER").pPr
    const { source: _saved, ...saved } = byText(doc, "AFTER").pPr
    const { source: _read, ...read } = source
    expect(saved).toEqual({ ...read, spacing: { ...read.spacing, before: 360 } })
  })

  it("maps editor indents and line spacing back to Word", async () => {
    const { opened, editor } = await openInEditor("f01_runs.docx")
    setAttrs(editor, "BEFORE", { indent: 3, specialIndent: "hanging:1.27", lineRule: "exact", lineHeight: "18" })
    setAttrs(editor, "AFTER", { textAlign: "justify", keepLines: true, widowControl: false })
    const { doc } = await save(opened, editor)
    expect(byText(doc, "BEFORE").pPr).toMatchObject({
      ind: { left: 1080 + 720, hanging: 720 },
      spacing: { line: 360, lineRule: "exact" },
    })
    expect(byText(doc, "AFTER").pPr).toMatchObject({ jc: "both", keepLines: true, widowControl: false })
  })

  it("keeps the paragraph style and turns a heading into body text when asked", async () => {
    const { opened, editor, original } = await openInEditor("f19_styles_custom.docx")
    const styled = paragraphsIn(original.blocks).find(
      (paragraph) => paragraph.styleId && !/^Heading/i.test(paragraph.styleId),
    )!
    insertParagraphAtStart(editor, "Inserted")
    const { doc } = await save(opened, editor)
    expect(byText(doc, paragraphText(styled)).styleId).toBe(styled.styleId)

    const headed = await openInEditor("f02_heading_style.docx")
    const heading = paragraphsIn(headed.original.blocks).find((paragraph) =>
      /^Heading1$/i.test(paragraph.styleId ?? ""),
    )!
    let at = -1
    headed.editor.state.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === "heading") {
        at = pos
      }
    })
    headed.editor
      .chain()
      .setTextSelection(at + 1)
      .setParagraph()
      .run()
    const saved = await save(headed.opened, headed.editor)
    expect(byText(saved.doc, paragraphText(heading)).styleId).toBeUndefined()
  })

  it("keeps section breaks once, even after the paragraph is split", async () => {
    const { opened, editor, original } = await openInEditor("f15_sections.docx")
    const breaks = paragraphsIn(original.blocks).filter((paragraph) => paragraph.sectionBreak)
    expect(breaks.length).toBeGreaterThan(0)
    const text = paragraphText(breaks[0]!)
    let end = -1
    editor.state.doc.descendants((node, pos) => {
      if (end < 0 && node.isTextblock && node.textContent === text) {
        end = pos + node.nodeSize - 1
      }
    })
    editor.chain().setTextSelection(end).splitBlock().run()
    const { doc } = await save(opened, editor)
    const saved = paragraphsIn(doc.blocks).filter((paragraph) => paragraph.sectionBreak)
    expect(saved.map((paragraph) => paragraph.sectionBreak)).toEqual(breaks.map((paragraph) => paragraph.sectionBreak))
  })

  it("keeps anchors across saves so a second save still finds the source", async () => {
    const { opened, editor, original } = await openInEditor("f03_para_format.docx")
    insertParagraphAtStart(editor, "First edit")
    const first = await save(opened, editor)
    insertParagraphAtStart(editor, "Second edit")
    const second = await save(opened, editor, first.word)
    expect(formatting(byText(second.doc, "AFTER"))).toEqual(formatting(byText(original, "AFTER")))
  })

  it("keeps f06 table grid, widths, borders, and layout after an edit, and uses resized widths", async () => {
    const { opened, editor, original } = await openInEditor("f06_table.docx")
    insertParagraphAtStart(editor, "Inserted")
    const { doc } = await save(opened, editor)
    const sourceTable = original.blocks.find((block) => block.kind === "table")!
    const savedTable = doc.blocks.find((block) => block.kind === "table")!
    expect(savedTable.kind === "table" && savedTable.grid).toEqual(sourceTable.kind === "table" && sourceTable.grid)
    if (savedTable.kind !== "table" || sourceTable.kind !== "table") {
      throw new Error("table expected")
    }
    expect({ width: savedTable.width, borders: savedTable.borders, layout: savedTable.layout }).toEqual({
      width: sourceTable.width,
      borders: sourceTable.borders,
      layout: sourceTable.layout,
    })

    // A drag-resize widens the whole column; fixTables would undo a change to a single cell.
    let tr = editor.state.tr
    editor.state.doc.descendants((node, pos) => {
      if ((node.type.name === "tableCell" || node.type.name === "tableHeader") && Array.isArray(node.attrs.colwidth)) {
        tr = tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          colwidth: (node.attrs.colwidth as number[]).map((width) => width + 20),
        })
      }
    })
    editor.view.dispatch(tr)
    const resized = await save(opened, editor)
    const resizedTable = resized.doc.blocks.find((block) => block.kind === "table")
    expect(resizedTable?.kind === "table" && resizedTable.grid).toEqual(
      sourceTable.grid.map((twips) => (Math.round(twips / 15) + 20) * 15),
    )
    const firstCell = resizedTable?.kind === "table" ? resizedTable.rows[0]?.cells[0] : undefined
    expect(firstCell?.width).toEqual({ value: (Math.round(sourceTable.grid[0]! / 15) + 20) * 15 * 2, type: "dxa" })
  })
})
