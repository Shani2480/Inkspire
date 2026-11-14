import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { NOTE_DEFAULTS, formatNoteNumber, noteSettingsOf, type NoteSettings } from "@/document/note-numbering"
import { applyOpenedNotes, useNoteSettings } from "@/document/note-settings"
import { noteLabels } from "@/editor/note-labels"
import { convertNotes } from "@/editor/note-convert"

let editors: Editor[] = []
afterEach(() => {
  editors.forEach((editor) => editor.destroy())
  editors = []
  applyOpenedNotes(null)
})

const make = (content: string) => {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  editors.push(editor)
  return editor
}

const FIXTURE = path.join("tests/docx-fixtures/authored", "f08_footnote_endnote.docx")

async function save(
  editor: Editor,
  word: Awaited<ReturnType<typeof openDocxBytes>>["word"] | null,
  notes?: NoteSettings,
) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: emptyChrome(),
    word,
    unchanged: false,
    fileName: "notes.docx",
    notes,
  })
  const pkg = await openPackage(saved.bytes, "notes.docx")
  const part = (name: string) => {
    const found = findPart(pkg, name)
    return found ? decodeXml(found.data) : ""
  }
  return { bytes: saved.bytes, part }
}

const labelsOf = (editor: Editor, settings: NoteSettings = NOTE_DEFAULTS, breaks: number[] = []) => [
  ...noteLabels(editor.state.doc, settings, breaks).values(),
]

describe("note numbers", () => {
  it("formats numbers as Word does", () => {
    expect([1, 2, 27].map((n) => formatNoteNumber(n, "lowerLetter"))).toEqual(["a", "b", "aa"])
    expect(formatNoteNumber(4, "upperRoman")).toBe("IV")
    expect([1, 4, 5].map((n) => formatNoteNumber(n, "chicago"))).toEqual(["*", "§", "**"])
    expect(noteSettingsOf("endnote", { numFmt: "decimal" }, { numStart: 3 })).toMatchObject({
      numFmt: "decimal",
      numStart: 3,
      pos: "docEnd",
    })
  })

  it("numbers app notes and Word notes together, with start, format, restart and custom marks", async () => {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "f08.docx")
    const editor = make(opened.view.html)
    // A note of the app's after Word's footnote: Word numbers it 2.
    editor
      .chain()
      .setTextSelection(editor.state.doc.content.size - 2)
      .insertNote("footnote", "Mine")
      .run()
    expect(labelsOf(editor)).toEqual(["1", "i", "2"])
    const settings: NoteSettings = {
      footnote: { ...NOTE_DEFAULTS.footnote, numFmt: "lowerLetter", numStart: 3 },
      endnote: { ...NOTE_DEFAULTS.endnote, numFmt: "upperRoman" },
    }
    expect(labelsOf(editor, settings)).toEqual(["c", "I", "d"])
    editor.chain().setTextSelection(2).insertNote("footnote", "Starred", "*").run()
    expect(labelsOf(editor)).toEqual(["*", "1", "i", "2"])
  })

  it("restarts each section and each page", () => {
    const editor = make("<p>a</p>")
    editor.chain().setTextSelection(2).insertNote("footnote", "one").run()
    editor
      .chain()
      .setTextSelection(editor.state.doc.content.size - 1)
      .insertContent({ type: "sectionBreak" })
      .run()
    editor.commands.insertContentAt(editor.state.doc.content.size, "<p>b</p>")
    editor
      .chain()
      .setTextSelection(editor.state.doc.content.size - 1)
      .insertNote("footnote", "two")
      .run()
    const eachSection = { ...NOTE_DEFAULTS, footnote: { ...NOTE_DEFAULTS.footnote, numRestart: "eachSect" as const } }
    expect(labelsOf(editor)).toEqual(["1", "2"])
    expect(labelsOf(editor, eachSection)).toEqual(["1", "1"])
    const eachPage = { ...NOTE_DEFAULTS, footnote: { ...NOTE_DEFAULTS.footnote, numRestart: "eachPage" as const } }
    expect(labelsOf(editor, eachPage, [editor.state.doc.content.size - 4])).toEqual(["1", "1"])
    expect(labelsOf(editor, eachPage, [])).toEqual(["1", "2"])
  })
})

describe("notes saved to .docx", () => {
  it("writes notes made in the app as Word footnotes and endnotes, custom marks included", async () => {
    const editor = make("<p>Hello world</p>")
    editor.chain().setTextSelection(6).insertNote("footnote", "A footnote").run()
    editor
      .chain()
      .setTextSelection(editor.state.doc.content.size - 1)
      .insertNote("endnote", "An endnote", "†")
      .run()
    const { part } = await save(editor, null)
    const body = part("word/document.xml")
    expect(body).toContain('<w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/>')
    expect(body).toContain('<w:endnoteReference w:customMarkFollows="1" w:id="1"/><w:t>†</w:t>')
    expect(part("word/footnotes.xml")).toContain('<w:footnote w:type="separator" w:id="-1">')
    expect(part("word/footnotes.xml")).toContain(
      '<w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> A footnote</w:t>',
    )
    expect(part("word/endnotes.xml")).toContain("An endnote")
    expect(part("word/styles.xml")).toContain('w:styleId="FootnoteText"')
    expect(part("word/settings.xml")).toContain(
      '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>',
    )
  })

  it("adds an app note after Word's own with the next free id, and reads it back", async () => {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "f08.docx")
    const editor = make(opened.view.html)
    editor
      .chain()
      .setTextSelection(editor.state.doc.content.size - 2)
      .insertNote("footnote", "Added")
      .run()
    const { bytes, part } = await save(editor, opened.word)
    expect(part("word/footnotes.xml")).toContain('<w:footnote w:id="2">')
    const again = await openDocxBytes(bytes, "again.docx")
    expect(again.word.footnotes?.items.filter((note) => !note.type).map((note) => note.id)).toEqual([1, 2])
  })

  it("saves the options to settings and every section, and an opened file brings them back", async () => {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "f08.docx")
    const editor = make(opened.view.html)
    const settings: NoteSettings = {
      footnote: { pos: "beneathText", numFmt: "chicago", numStart: 2, numRestart: "eachPage" },
      endnote: { ...NOTE_DEFAULTS.endnote, numFmt: "decimal" },
    }
    const { bytes, part } = await save(editor, opened.word, settings)
    expect(part("word/settings.xml")).toContain(
      '<w:footnotePr><w:pos w:val="beneathText"/><w:numFmt w:val="chicago"/><w:numStart w:val="2"/><w:numRestart w:val="eachPage"/><w:footnote w:id="-1"/>',
    )
    expect(part("word/document.xml")).toMatch(/<w:sectPr[^>]*><w:footnotePr><w:pos w:val="beneathText"\/>/)
    const again = await openDocxBytes(bytes, "again.docx")
    applyOpenedNotes(again.word)
    expect(useNoteSettings.getState().settings).toEqual(settings)
    expect(useNoteSettings.getState().edited).toBe(false)
  })

  it("converts Word's footnote to an endnote: the reference and the text move over", async () => {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "f08.docx")
    const editor = make(opened.view.html)
    expect(convertNotes(editor, "toEndnotes")).toBe(1)
    expect(labelsOf(editor)).toEqual(["i", "ii"])
    const { bytes, part } = await save(editor, opened.word)
    expect(part("word/document.xml")).not.toContain("footnoteReference")
    expect(part("word/document.xml")).toContain(
      '<w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="2"/>',
    )
    const endnotes = part("word/endnotes.xml")
    expect(endnotes).toContain('<w:endnote w:id="2">')
    expect(endnotes).toMatch(/<w:endnote w:id="2"><w:p[^>]*><w:pPr><w:pStyle w:val="EndnoteText"\/>/)
    expect(endnotes).toContain("FOOTNOTE-TEXT")
    expect(part("word/footnotes.xml")).not.toContain("FOOTNOTE-TEXT")
    const again = await openDocxBytes(bytes, "again.docx")
    expect(again.word.endnotes?.items.filter((note) => !note.type)).toHaveLength(2)
  })
})
