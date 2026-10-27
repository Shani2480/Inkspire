import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphText, paragraphsIn, type Inline, type WordDocument } from "@/document/docx/model"
import { findPart, openPackage, relationshipsFor } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { decodeXml } from "@/document/docx/xml"
import { addCommentReply, editCommentText, listComments, updateComment } from "@/editor/comments"
import { createExtensions } from "@/editor/extensions"
import { acceptChanges, listChanges, rejectChanges } from "@/editor/track-changes"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const MARKER = "INSERTED-MARKER"

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

async function openInEditor(name: string) {
  const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, name)))
  const opened = await openDocxBytes(bytes, name)
  // The spell checker fetches dictionaries from the dev server, which tests do not run.
  const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
  const editor = new Editor({ extensions, content: opened.view.html })
  editors.push(editor)
  return { bytes, opened, editor }
}

async function saveBytes(opened: Awaited<ReturnType<typeof openDocxBytes>>, editor: Editor) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "edited.docx",
  })
  return saved.bytes
}

async function save(opened: Awaited<ReturnType<typeof openDocxBytes>>, editor: Editor) {
  return readDocument(await openPackage(await saveBytes(opened, editor), "edited.docx"))
}

function insertMarker(editor: Editor) {
  editor
    .chain()
    .insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: MARKER }] })
    .run()
}

/** Drops revision and paragraph ids, which Word regenerates anyway. */
function normalize(xml: string) {
  return xml.replace(/<([A-Za-z0-9:]+)((?:\s+[A-Za-z0-9:]+="[^"]*")*)\s*(\/?)>/g, (_match, name, attrs, slash) => {
    const kept = String(attrs)
      .replace(/\s+(?:w:rsid[A-Za-z0-9]*|w14:paraId|w14:textId)="[^"]*"/g, "")
      .trim()
    return `<${name}${kept ? ` ${kept}` : ""}${slash}>`
  })
}

function partXml(pkg: Awaited<ReturnType<typeof openPackage>>, name: string) {
  const part = findPart(pkg, name)
  return part ? normalize(decodeXml(part.data)) : undefined
}

function inlinesOf(doc: WordDocument): Inline[] {
  const all: Inline[] = []
  const visit = (inlines: Inline[]) => {
    for (const inline of inlines) {
      all.push(inline)
      if (inline.kind === "hyperlink" || inline.kind === "ins" || inline.kind === "del") {
        visit(inline.inlines)
      }
    }
  }
  paragraphsIn(doc.blocks).forEach((paragraph) => visit(paragraph.inlines))
  doc.blocks.forEach((block) => {
    if (block.kind === "table") {
      block.rows.forEach((row) =>
        row.cells.forEach((cell) => paragraphsIn(cell.blocks).forEach((p) => visit(p.inlines))),
      )
    }
  })
  return all
}

function textOf(editor: Editor) {
  return editor.state.doc.textContent
}

const TRANSITIONAL = readdirSync(AUTHORED).filter((name) => name.endsWith(".docx") && !name.includes("strict"))

describe("an edit elsewhere leaves Word's markup alone", () => {
  it.each(TRANSITIONAL)("%s: every part but core.xml is unchanged apart from the new paragraph", async (name) => {
    const { bytes, opened, editor } = await openInEditor(name)
    insertMarker(editor)
    const written = await openPackage(await saveBytes(opened, editor), name)
    const original = await openPackage(bytes, name)
    for (const part of original.parts.filter((item) => item.name.endsWith(".xml"))) {
      if (part.name === "/docProps/core.xml") {
        continue
      }
      let saved = partXml(written, part.name)
      expect(saved, part.name).toBeDefined()
      if (part.name === "/word/document.xml") {
        saved = saved!.replace(new RegExp(`<w:p>(?:(?!</w:p>).)*${MARKER}.*?</w:p>`), "")
      }
      expect(saved, part.name).toBe(normalize(decodeXml(part.data)))
    }
  })
})

describe("Word features survive the editor", () => {
  it("shows f10 tracked changes as marks and writes them back as w:ins and w:del", async () => {
    const { opened, editor } = await openInEditor("f10_tracked_changes.docx")
    const changes = listChanges(editor.state.doc)
    expect(changes.map((change) => [change.kind, change.text.trim()])).toEqual([
      ["deletion", "delete-me"],
      ["insertion", "INSERTED"],
    ])
    insertMarker(editor)
    const kinds = inlinesOf(await save(opened, editor)).map((inline) => inline.kind)
    expect(kinds).toContain("ins")
    expect(kinds).toContain("del")
  })

  it("accepting or rejecting f10 changes in the editor settles them in the saved file", async () => {
    const accepted = await openInEditor("f10_tracked_changes.docx")
    acceptChanges(accepted.editor)
    const acceptedDoc = await save(accepted.opened, accepted.editor)
    expect(inlinesOf(acceptedDoc).some((inline) => inline.kind === "ins" || inline.kind === "del")).toBe(false)
    expect(paragraphsIn(acceptedDoc.blocks).map(paragraphText)).toContain("keep keep INSERTED")

    const rejected = await openInEditor("f10_tracked_changes.docx")
    rejectChanges(rejected.editor)
    const rejectedDoc = await save(rejected.opened, rejected.editor)
    expect(paragraphsIn(rejectedDoc.blocks).map(paragraphText)).toContain("keep delete-me keep")
  })

  it("keeps f09 comments, and writes edited text, resolution, and new replies", async () => {
    const { opened, editor } = await openInEditor("f09_comment.docx")
    const comments = listComments(editor.state.doc)
    expect(comments.map((comment) => comment.text)).toContain("COMMENT-TEXT")
    const main = comments.find((comment) => comment.text === "COMMENT-TEXT")!
    editCommentText(editor, main.id, "REWRITTEN")
    updateComment(editor, main.id, true)
    addCommentReply(editor, main.id, "A NEW REPLY")
    const doc = await save(opened, editor)
    const items = doc.comments?.items ?? []
    const texts = items.map((item) => paragraphsIn(item.blocks).map(paragraphText).join(""))
    expect(texts).toContain("REWRITTEN")
    expect(texts).toContain("A NEW REPLY")
    const ids = new Set(items.map((item) => item.id))
    const kinds = inlinesOf(doc)
    for (const id of ids) {
      expect(kinds.some((inline) => inline.kind === "commentRangeStart" && inline.id === id)).toBe(true)
    }
    expect(doc.comments?.extended?.some((item) => item.done)).toBe(true)
    expect(doc.comments?.extended?.some((item) => item.parentParaId)).toBe(true)
  })

  it("shows f08 note references as numbers and saves them as references", async () => {
    const { opened, editor } = await openInEditor("f08_footnote_endnote.docx")
    let atoms = 0
    editor.state.doc.descendants((node) => {
      if (node.type.name === "wordInline" && node.attrs.role === "note") {
        atoms += 1
      }
    })
    expect(atoms).toBe(2)
    insertMarker(editor)
    const doc = await save(opened, editor)
    const content = inlinesOf(doc).flatMap((inline) => (inline.kind === "run" ? inline.content : []))
    expect(content.some((item) => item.kind === "footnoteReference")).toBe(true)
    expect(content.some((item) => item.kind === "endnoteReference")).toBe(true)
    expect(doc.footnotes?.items.length).toBe(opened.word.footnotes?.items.length)
  })

  it("keeps the f12 table of contents field whole, though it spans paragraphs", async () => {
    const { opened, editor } = await openInEditor("f12_fields_toc.docx")
    insertMarker(editor)
    const doc = await save(opened, editor)
    const chars = inlinesOf(doc).flatMap((inline) =>
      inline.kind === "run"
        ? inline.content.filter((item) => item.kind === "fldChar").map((item) => item.fieldType)
        : [],
    )
    expect(chars.filter((type) => type === "begin")).toHaveLength(2)
    expect(chars.filter((type) => type === "end")).toHaveLength(2)
    expect(textOf(editor)).toContain("Section Title")
  })

  it("keeps f16 content controls and f17 equations as Word markup", async () => {
    for (const [name, element] of [
      ["f16_content_control.docx", "<w:sdt>"],
      ["f17_equation.docx", "<m:oMath"],
    ] as const) {
      const { opened, editor } = await openInEditor(name)
      insertMarker(editor)
      const written = await openPackage(await saveBytes(opened, editor), name)
      expect(partXml(written, "/word/document.xml"), name).toContain(element)
    }
  })

  it("opens the f17 equation to edit, and saves it as Word wrote it until it is changed", async () => {
    const { bytes, opened, editor } = await openInEditor("f17_equation.docx")
    const equation = () => {
      let found: { pos: number; attrs: Record<string, unknown> } | null = null
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "equation") {
          found = { pos, attrs: node.attrs }
        }
      })
      return found as unknown as { pos: number; attrs: Record<string, unknown> }
    }
    expect(equation().attrs).toMatchObject({ tex: "x=\\frac{a+b}{c}", display: true })
    const original = /<m:oMathPara>.*<\/m:oMathPara>/.exec(partXml(await openPackage(bytes, "f17.docx"), "/word/document.xml")!)![0]
    insertMarker(editor)
    let written = partXml(await openPackage(await saveBytes(opened, editor), "f17.docx"), "/word/document.xml")!
    expect(written).toContain(original)

    const { pos, attrs } = equation()
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, tex: "x=\\frac{a+b}{2c}" }))
    const saved = await saveBytes(opened, editor)
    written = partXml(await openPackage(saved, "f17.docx"), "/word/document.xml")!
    expect(written).not.toContain(original)
    expect(written).toMatch(/<m:oMathPara[^>]*><m:oMath>.*<m:t xml:space="preserve">2c<\/m:t>/)
    const reopened = await openDocxBytes(saved, "f17.docx")
    expect(reopened.view.html).toContain('data-tex="x=\\frac{a+b}{2c}"')
  })

  it("saves an equation made here as Word's math, in the line or on its own line, and opens it again", async () => {
    const { opened, editor } = await openInEditor("f17_equation.docx")
    editor
      .chain()
      .insertContentAt(0, {
        type: "paragraph",
        content: [
          { type: "text", text: "Area " },
          { type: "equation", attrs: { tex: "A=\\pi r^{2}" } },
          { type: "equation", attrs: { tex: "\\sum_{k=0}^{n} k", display: true } },
        ],
      })
      .run()
    const saved = await saveBytes(opened, editor)
    const written = partXml(await openPackage(saved, "new.docx"), "/word/document.xml")!
    expect(written).toMatch(/Area <\/w:t><\/w:r><m:oMath xmlns:m="[^"]+"><m:r>/)
    expect(written).toContain('<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMath><m:nary>')
    const html = (await openDocxBytes(saved, "new.docx")).view.html
    expect(html).toContain('data-tex="A=\\pi r^{2}"')
    expect(html).toMatch(/data-tex="\\sum_\{k=0\}\^\{n\}\{k\}" data-display="1"/)
  })

  it("keeps f11 hyperlink relationships and history, and links new links with the Hyperlink style", async () => {
    const { opened, editor } = await openInEditor("f11_hyperlink_bookmark.docx")
    editor
      .chain()
      .insertContentAt(0, {
        type: "paragraph",
        content: [
          { type: "text", text: "new link", marks: [{ type: "link", attrs: { href: "https://example.com/" } }] },
        ],
      })
      .run()
    const bytes = await saveBytes(opened, editor)
    const pkg = await openPackage(bytes, "edited.docx")
    const doc = readDocument(pkg)
    const links = inlinesOf(doc).filter((inline) => inline.kind === "hyperlink")
    expect(links).toHaveLength(3)
    expect(links.filter((link) => link.history)).toHaveLength(2)
    const created = links.find((link) => link.target === "https://example.com/")!
    expect(created.inlines[0]?.kind === "run" && created.inlines[0].rPr.rStyle).toBe("Hyperlink")
    const targets = relationshipsFor(pkg, "/word/document.xml").map((item) => item.target)
    expect(targets).toContain("https://example.com/")
  })

  it("keeps the numbering instance of an opened list, also for an item added in the editor", async () => {
    const { opened, editor } = await openInEditor("f05_numbering.docx")
    const sourceIds = new Set(
      paragraphsIn(opened.word.blocks)
        .map((paragraph) => paragraph.pPr.numPr?.numId)
        .filter(Boolean),
    )
    let end = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "listItem") {
        end = pos + node.nodeSize
      }
    })
    editor
      .chain()
      .focus()
      .setTextSelection(end - 2)
      .splitListItem("listItem")
      .insertContent("added item")
      .run()
    const doc = await save(opened, editor)
    const added = paragraphsIn(doc.blocks).find((paragraph) => paragraphText(paragraph) === "added item")
    expect(added?.pPr.numPr?.numId).toBeDefined()
    expect(sourceIds.has(added!.pPr.numPr!.numId)).toBe(true)
    expect(doc.numbering.instances.length).toBe(opened.word.numbering.instances.length)
  })

  it("rebuilds a cell merged across rows and columns with spanning continuation cells", async () => {
    const { opened, editor } = await openInEditor("f02_heading_style.docx")
    const cell = (text: string, attrs: Record<string, unknown> = {}) => ({
      type: "tableCell",
      attrs: { colspan: 1, rowspan: 1, ...attrs },
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })
    editor
      .chain()
      .insertContentAt(0, {
        type: "table",
        content: [
          { type: "tableRow", content: [cell("big", { colspan: 2, rowspan: 2 }), cell("r1")] },
          { type: "tableRow", content: [cell("r2")] },
          { type: "tableRow", content: [cell("a"), cell("b"), cell("c")] },
        ],
      })
      .run()
    const doc = await save(opened, editor)
    const table = doc.blocks.find((block) => block.kind === "table")
    expect(table?.kind).toBe("table")
    if (table?.kind !== "table") {
      return
    }
    const shape = table.rows.map((row) => row.cells.map((item) => [item.gridSpan ?? 1, item.vMerge ?? "-"]))
    expect(shape).toEqual([
      [
        [2, "restart"],
        [1, "-"],
      ],
      [
        [2, "continue"],
        [1, "-"],
      ],
      [
        [1, "-"],
        [1, "-"],
        [1, "-"],
      ],
    ])
  })
})
