import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { readSourcesXml, type BibSource } from "@/document/bibliography"
import { applyOpenedSources, sourcesForSave, useBibliography } from "@/document/bibliography-store"
import { citationAt, citationToText, editCitation } from "@/editor/bibliography"

const FIXTURE = "tests/docx-fixtures/authored/f25_citations_word.docx"

let editors: Editor[] = []
afterEach(() => {
  editors.forEach((editor) => editor.destroy())
  editors = []
  applyOpenedSources(null)
})

const make = (content: string) => {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  editors.push(editor)
  return editor
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function save(editor: Editor, word: Awaited<ReturnType<typeof openDocxBytes>>["word"] | null) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: emptyChrome(),
    word,
    unchanged: false,
    fileName: "cited.docx",
    bibliography: sourcesForSave(),
  })
  const pkg = await openPackage(saved.bytes, "cited.docx")
  const part = (name: string) => {
    const found = findPart(pkg, name)
    return found ? decodeXml(found.data) : ""
  }
  return { bytes: saved.bytes, part, pkg }
}

const fields = (editor: Editor) => {
  const out: { instr: string; result: string }[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "wordField") {
      out.push({ instr: String(node.attrs.instr), result: String(node.attrs.result) })
    }
  })
  return out
}

const book: BibSource = {
  tag: "Ada20",
  type: "Book",
  names: { Author: { people: [{ last: "Adams", first: "Ann", middle: "" }] } },
  fields: { Title: "Field Notes", Year: "2020", City: "Leeds", Publisher: "North Press" },
}

describe("Word's citations and bibliography", () => {
  it("open as citations and a bibliography, and an untouched file saves them as Word wrote them", async () => {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "word.docx")
    applyOpenedSources(opened.word)
    expect(useBibliography.getState().style).toBe("APA")
    expect(useBibliography.getState().sources).toHaveLength(9)
    const editor = make(opened.view.html)
    const shown = fields(editor)
    expect(shown[0]).toEqual({ instr: "CITATION Smi20 \\l 1033", result: "(Smith J. A., 2020)" })
    expect(shown).toHaveLength(14)
    let bibliography: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "bibliography") {
        bibliography = (node.attrs.entries as { parts: { text: string }[] }[]).map((entry) =>
          entry.parts.map((part) => part.text).join(""),
        )
      }
    })
    expect(bibliography[0]).toBe(
      "Brown, A., Lee, B., & Clark, C. (2019). Measuring Things Well. Journal of Tests, 12(3), 45-67.",
    )
    const original = await openPackage(new Uint8Array(readFileSync(FIXTURE)), "word.docx")
    const { part } = await save(editor, opened.word)
    const body = part("word/document.xml")
    expect(body).toContain('<w:sdt><w:sdtPr><w:id w:val="-1879693640"/><w:citation/></w:sdtPr>')
    expect(body).toContain('<w:pStyle w:val="Bibliography"/><w:ind w:left="720" w:hanging="720"/>')
    expect(part("customXml/item1.xml")).toBe(decodeXml(findPart(original, "customXml/item1.xml")!.data))
  })

  it("follows another style at once, and Word's bibliography with it", async () => {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "word.docx")
    applyOpenedSources(opened.word)
    const editor = make(opened.view.html)
    useBibliography.getState().setStyle("IEEE")
    await settle()
    await settle()
    expect(
      fields(editor)
        .slice(0, 3)
        .map((field) => field.result),
    ).toEqual(["[1]", "[1, p. 12]", "[1]"])
    let first = ""
    editor.state.doc.descendants((node) => {
      if (node.type.name === "bibliography") {
        const entry = (node.attrs.entries as { label?: string; parts: { text: string }[] }[])[0]!
        first = `${entry.label} ${entry.parts.map((part) => part.text).join("")}`
      }
    })
    expect(first).toBe("[1] J. A. Smith, The Art of Testing, London: Acme Press, 2020.")
    const { part } = await save(editor, opened.word)
    expect(part("customXml/item1.xml")).toContain('SelectedStyle="\\IEEE2006OfficeOnline.xsl" StyleName="IEEE"')
    expect(part("word/document.xml")).toContain("<w:t>[1]</w:t>")
  })
})

describe("citations made in the app", () => {
  it("save as Word's citation controls, BIBLIOGRAPHY field and sources part, and read back", async () => {
    const editor = make("<p>Text</p><p></p>")
    applyOpenedSources(null)
    useBibliography.getState().setStyle("APA")
    useBibliography.getState().putSource(book)
    editor
      .chain()
      .setTextSelection(5)
      .insertCitation({ tags: ["Ada20"] })
      .run()
    expect(fields(editor)).toEqual([{ instr: "CITATION Ada20 \\l 1033", result: "(Adams, 2020)" }])
    editor
      .chain()
      .setTextSelection(editor.state.doc.content.size - 1)
      .insertBibliography("References")
      .run()
    const { part, bytes, pkg } = await save(editor, null)
    const body = part("word/document.xml")
    expect(body).toMatch(
      /<w:sdt><w:sdtPr><w:id w:val="\d+"\/><w:citation\/><\/w:sdtPr><w:sdtContent><w:r><w:fldChar w:fldCharType="begin"\/><\/w:r><w:r><w:instrText xml:space="preserve"> CITATION Ada20 \\l 1033 <\/w:instrText>/,
    )
    expect(body).toMatch(/<w:sdt><w:sdtPr><w:id w:val="\d+"\/><w:bibliography\/><\/w:sdtPr><w:sdtContent><w:p>/)
    expect(body).toContain('<w:instrText xml:space="preserve"> BIBLIOGRAPHY </w:instrText>')
    expect(body).toContain("<w:r><w:rPr><w:i/><w:iCs/></w:rPr><w:t>Field Notes.</w:t></w:r>")
    expect(part("word/styles.xml")).toContain('w:styleId="Bibliography"')
    const sources = readSourcesXml(part("customXml/item1.xml"))!
    expect(sources.sources).toEqual([book])
    expect(part("customXml/itemProps1.xml")).toContain("officeDocument/2006/bibliography")
    expect(
      pkg.relationships.find((group) => group.source === "/word/document.xml")?.items.map((item) => item.target),
    ).toContain("../customXml/item1.xml")
    expect(pkg.relationships.find((group) => group.source === "/customXml/item1.xml")?.items[0]?.target).toBe(
      "itemProps1.xml",
    )

    const again = await openDocxBytes(bytes, "again.docx")
    applyOpenedSources(again.word)
    expect(useBibliography.getState().sources.map((source) => source.tag)).toEqual(["Ada20"])
    const reopened = make(again.view.html)
    expect(fields(reopened)[0]?.result).toBe("(Adams, 2020)")
    let entries = 0
    reopened.state.doc.descendants((node) => {
      entries += node.type.name === "bibliography" ? (node.attrs.entries as unknown[]).length : 0
    })
    expect(entries).toBe(1)
  })

  it("Edit Citation adds pages and suppresses the year; convert to static text keeps the result", () => {
    const editor = make("<p>Text</p>")
    useBibliography.getState().putSource(book)
    editor
      .chain()
      .setTextSelection(5)
      .insertCitation({ tags: ["Ada20"] })
      .run()
    editor.commands.setNodeSelection(5)
    const at = citationAt(editor)!
    editCitation(editor, at, { pages: "12-14", noYear: true })
    expect(fields(editor)).toEqual([{ instr: "CITATION Ada20 \\p 12-14 \\y \\l 1033", result: "(Adams, pp. 12-14)" }])
    editor.commands.setNodeSelection(5)
    citationToText(editor, citationAt(editor)!)
    expect(fields(editor)).toEqual([])
    expect(editor.state.doc.textContent).toBe("Text(Adams, pp. 12-14)")
  })

  it("a placeholder shows its name until it gets a source", async () => {
    const editor = make("<p>Text</p>")
    useBibliography.getState().putSource({ tag: "Placeholder1", type: "", names: {}, fields: {} })
    editor
      .chain()
      .setTextSelection(5)
      .insertCitation({ tags: ["Placeholder1"] })
      .run()
    expect(fields(editor)[0]?.result).toBe("(Placeholder1)")
    useBibliography.getState().putSource({ ...book, tag: "Placeholder1" }, "Placeholder1")
    await settle()
    expect(fields(editor)[0]?.result).toBe("(Adams, 2020)")
  })
})
