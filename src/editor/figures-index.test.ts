import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { insertCaption } from "@/editor/captions"
import { figureInstruction, figureTable, readTocEntries } from "@/document/toc"
import {
  indexEntries,
  indexInstruction,
  indexLineText,
  indexLines,
  indexOptions,
  parseXe,
  readIndexEntries,
  xeInstruction,
} from "@/document/index-field"
import { markAllIndexEntries } from "@/editor/index-entry"

let editor: Editor
afterEach(() => editor?.destroy())

const make = (content: string) => {
  editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  return editor
}

const caretIn = (text: string, offset = 0, length = 0) => {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) {
      at = pos + node.text!.indexOf(text) + offset
    }
  })
  editor.commands.setTextSelection({ from: at, to: at + length })
}

const nodesOf = (type: string) => {
  const out: Record<string, unknown>[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) {
      out.push(node.attrs)
    }
  })
  return out
}

async function save() {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "f.docx",
  })
  const pkg = await openPackage(saved.bytes, "f.docx")
  return {
    bytes: saved.bytes,
    xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data),
    styles: decodeXml(findPart(pkg, "/word/styles.xml")!.data),
  }
}

async function reopen(bytes: Uint8Array) {
  const opened = await openDocxBytes(bytes, "f.docx")
  editor.destroy()
  editor = new Editor({
    extensions: createExtensions().filter((e) => e.name !== "spellcheck"),
    content: opened.view.html,
  })
}

const figures = (label = "Figure", includeLabel = true) =>
  figureInstruction({ label, includeLabel, hyperlinks: true, pageNumbers: true })

describe("Table of Figures", () => {
  const document = () => {
    make("<p>start</p><h1>Chapter</h1><p>one</p><p>two</p><p>three</p>")
    for (const [text, label, caption] of [
      ["one", "Figure", ": Sales"],
      ["two", "Table", ": Costs"],
      ["three", "Figure", ": Staff"],
    ] as const) {
      caretIn(text)
      insertCaption(editor, { label, text: caption, position: "below", excludeLabel: false, format: "ARABIC" })
    }
  }

  it("lists the captions of one label, with or without label and number", () => {
    expect(figures()).toBe('TOC \\h \\z \\c "Figure"')
    expect(figureTable('TOC \\h \\z \\a "Table"')).toEqual({ label: "Table", includeLabel: false })
    expect(figureTable('TOC \\o "1-3" \\h \\z \\u')).toBeNull()
    document()
    caretIn("start")
    editor.commands.insertTableOfFigures({ instruction: figures(), title: "" })
    const [table] = nodesOf("tableOfContents")
    expect(readTocEntries(table!.entries).map((entry) => entry.text)).toEqual(["Figure 1: Sales", "Figure 2: Staff"])
    // A table of contents goes in beside it, it does not replace it.
    caretIn("start")
    editor.commands.insertTableOfContents()
    expect(nodesOf("tableOfContents")).toHaveLength(2)
    caretIn("start")
    editor.commands.insertTableOfFigures({ instruction: figures("Table", false), title: "" })
    const tables = nodesOf("tableOfContents").filter((attrs) => figureTable(String(attrs.instruction)))
    expect(tables.map((attrs) => readTocEntries(attrs.entries).map((entry) => entry.text))).toContainEqual(["Costs"])
  })

  it("updates with new captions, and only tables of figures when asked", () => {
    document()
    caretIn("start")
    editor.commands.insertTableOfFigures({ instruction: figures(), title: "" })
    caretIn("start")
    editor.commands.insertTableOfContents()
    caretIn("start")
    insertCaption(editor, { label: "Figure", text: ": Logo", position: "below", excludeLabel: false, format: "ARABIC" })
    editor.commands.setTextSelection(1)
    editor.commands.updateTableOfContents("entire", "figures")
    const figureTables = nodesOf("tableOfContents").filter((attrs) => figureTable(String(attrs.instruction)))
    expect(readTocEntries(figureTables[0]!.entries).map((entry) => entry.text)).toEqual([
      "Figure 1: Logo",
      "Figure 2: Sales",
      "Figure 3: Staff",
    ])
  })

  it("is saved as Word's TOC \\c field over Table of Figures paragraphs, linked to the captions, and read back", async () => {
    document()
    caretIn("start")
    editor.commands.insertTableOfFigures({ instruction: figures(), title: "" })
    const { bytes, xml, styles } = await save()
    expect(xml).toMatch(/<w:instrText[^>]*> TOC \\h \\z \\c "Figure" <\/w:instrText>/)
    expect(xml).toContain('<w:pStyle w:val="TableofFigures"/>')
    expect(xml).not.toContain("Table of Contents")
    const pagerefs = [...xml.matchAll(/PAGEREF (_Toc\d+) \\h/g)].map((match) => match[1])
    expect(pagerefs).toHaveLength(2)
    for (const name of pagerefs) {
      expect(xml).toContain(`w:name="${name}"`)
    }
    expect(styles).toContain('w:styleId="TableofFigures"')
    await reopen(bytes)
    const [table] = nodesOf("tableOfContents")
    expect(figureTable(String(table!.instruction))).toEqual({ label: "Figure", includeLabel: true })
    expect(readTocEntries(table!.entries).map((entry) => entry.text)).toEqual(["Figure 1: Sales", "Figure 2: Staff"])
    const again = await save()
    expect(again.xml).toMatch(/ TOC \\h \\z \\c "Figure" /)
  })
})

describe("Index", () => {
  it("reads and writes XE fields", () => {
    expect(parseXe('XE "Fruit:Apple" \\b')).toEqual({ main: "Fruit", sub: "Apple", bold: true })
    expect(parseXe('XE "Pear" \\t "See Fruit"')).toEqual({ main: "Pear", see: "See Fruit" })
    expect(xeInstruction({ main: "Fruit", sub: "Apple", italic: true })).toBe('XE "Fruit:Apple" \\i')
    expect(parseXe(xeInstruction({ main: "Data", range: "Chapter2" }))).toEqual({ main: "Data", range: "Chapter2" })
  })

  it("sorts entries, merges pages and lays the lines out indented or run-in", () => {
    const entries = indexEntries([
      { entry: { main: "pear" }, page: "4" },
      { entry: { main: "Apple" }, page: "2" },
      { entry: { main: "Apple" }, page: "2" },
      { entry: { main: "Apple", bold: true }, page: "5" },
      { entry: { main: "Fruit", sub: "Plum" }, page: "3" },
      { entry: { main: "Fig", see: "See Fruit" }, page: "9" },
    ])
    expect(entries.map((entry) => [entry.main, entry.sub ?? ""])).toEqual([
      ["Apple", ""],
      ["Fig", ""],
      ["Fruit", ""],
      ["Fruit", "Plum"],
      ["pear", ""],
    ])
    const indented = indexOptions({ instruction: 'INDEX \\c "2" \\z "1033"' })
    expect(indented).toMatchObject({ runIn: false, columns: 2, rightAlign: false })
    expect(indexLines(entries, indented).map((line) => indexLineText(line, indented))).toEqual([
      "Apple, 2, 5",
      "Fig. See Fruit",
      "Fruit",
      "Plum, 3",
      "pear, 4",
    ])
    const runIn = indexOptions({
      instruction: indexInstruction('INDEX \\c "2" \\z "1033"', { runIn: true, columns: 1, rightAlign: false }),
    })
    expect(runIn).toMatchObject({ runIn: true, columns: 1 })
    expect(indexLines(entries, runIn).map((line) => indexLineText(line, runIn))[2]).toBe("Fruit: Plum, 3")
    const right = indexInstruction('INDEX \\c "2" \\z "1033"', { runIn: false, columns: 2, rightAlign: true })
    expect(right).toBe('INDEX \\e "\t" \\c "2" \\z "1033"')
    expect(indexOptions({ instruction: right }).rightAlign).toBe(true)
  })

  it("marks entries, lists them with pages, and updates", () => {
    make("<p>An apple a day.</p><p>Pears and apple pie.</p>")
    caretIn("apple", 0, 5)
    editor.commands.markIndexEntry()
    expect(nodesOf("wordField").map((attrs) => attrs.instr)).toEqual(['XE "apple"'])
    // Mark All: every other paragraph with the word, once each.
    expect(markAllIndexEntries(editor, "Pears", { main: "Fruit", sub: "Pear" })).toBe(1)
    expect(editor.state.doc.textContent).toBe("An apple a day.Pears and apple pie.")
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertDocumentIndex()
    const [index] = nodesOf("documentIndex")
    expect(
      readIndexEntries(index!.entries).map((entry) => [entry.main, entry.sub ?? "", entry.pages.map((p) => p.text)]),
    ).toEqual([
      ["apple", "", ["1"]],
      ["Fruit", "", []],
      ["Fruit", "Pear", ["1"]],
    ])
    caretIn("day", 0, 3)
    editor.commands.markIndexEntry({ main: "Day", italic: true })
    editor.commands.updateDocumentIndex()
    expect(readIndexEntries(nodesOf("documentIndex")[0]!.entries).map((entry) => entry.main)).toContain("Day")
  })

  it("saves XE and INDEX fields and reads the index back", async () => {
    make("<p>An apple a day.</p><p>end</p>")
    caretIn("apple", 0, 5)
    editor.commands.markIndexEntry({ main: "apple", bold: true })
    caretIn("end")
    editor.commands.insertDocumentIndex({ instruction: 'INDEX \\e "\t" \\c "2" \\z "1033"' })
    const { bytes, xml, styles } = await save()
    expect(xml).toMatch(/w:instr=" XE &quot;apple&quot; \\b "|w:instr=" XE "apple" \\b "/)
    expect(xml).toMatch(/<w:instrText[^>]*> INDEX \\e "\t" \\c "2" \\z "1033" <\/w:instrText>/)
    expect(xml).toContain('<w:pStyle w:val="Index1"/>')
    expect(xml).toMatch(/<w:tab w:val="right" w:leader="dot"/)
    expect(styles).toContain('w:styleId="Index1"')
    await reopen(bytes)
    const [index] = nodesOf("documentIndex")
    expect(readIndexEntries(index!.entries)).toEqual([{ main: "apple", pages: [{ text: "1" }] }])
    expect(nodesOf("wordField").map((attrs) => String(attrs.instr).trim())).toEqual(['XE "apple" \\b'])
    const again = await save()
    expect(again.xml).toMatch(/ INDEX \\e "\t" \\c "2" \\z "1033" /)
  })
})
