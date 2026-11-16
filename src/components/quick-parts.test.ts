import { Editor } from "@tiptap/core"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { insertBuildingBlock, insertField } from "@/components/quick-parts-dialogs"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { useDocumentStore } from "@/document/store"
import { createExtensions } from "@/editor/extensions"
import { loadQuickParts, saveBuildingBlock, updateBuildingBlock } from "@/editor/quick-parts"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

beforeEach(() => {
  localStorage.clear()
  useDocumentStore.setState({
    fileName: "Report.docx",
    documentProps: {
      ...useDocumentStore.getState().documentProps,
      title: "Quarterly Report",
      subject: "Sales",
      tags: "north, south",
      comments: "Draft for review",
      author: "Alex Doe",
      company: "Example Ltd",
      category: "Reports",
      createdAt: "2026-01-02T09:30:00Z",
    },
  })
})

function make(html = "<p>Start </p>") {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content: html })
  editors.push(editor)
  editor.commands.setTextSelection(editor.state.doc.content.size - 1)
  return editor
}

const results = (editor: Editor) => {
  const out: string[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "wordField") {
      out.push(`${node.attrs.instr} => ${node.attrs.result}`)
    }
  })
  return out
}

describe("Insert > Quick Parts", () => {
  it("inserts fields with their results worked out", () => {
    const editor = make()
    insertField(editor, "AUTHOR \\* MERGEFORMAT")
    insertField(editor, "DOCPROPERTY Company \\* Upper")
    insertField(editor, "NUMWORDS")
    insertField(editor, 'QUOTE "Thanks" \\* Lower')
    expect(results(editor)).toEqual([
      "AUTHOR \\* MERGEFORMAT => Alex Doe",
      "DOCPROPERTY Company \\* Upper => EXAMPLE LTD",
      // Start + Alex Doe + EXAMPLE LTD, the fields' results count as the text.
      expect.stringMatching(/^NUMWORDS => \d+$/),
      'QUOTE "Thanks" \\* Lower => thanks',
    ])
  })

  it("keeps building blocks with a gallery, category and description, and inserts them", () => {
    saveBuildingBlock({ name: "Sign-off", html: "<p>Kind regards</p>", gallery: "AutoText", category: "Letters", description: "Closing" })
    // Older parts (name and html only) read as Quick Parts in General.
    localStorage.setItem(
      "aiword-quick-parts",
      JSON.stringify([...JSON.parse(localStorage.getItem("aiword-quick-parts")!), { id: "old", name: "Old", html: "<p>Old</p>" }]),
    )
    const parts = loadQuickParts()
    expect(parts.map((part) => `${part.name}|${part.gallery}|${part.category}|${part.description}`)).toEqual([
      "Sign-off|AutoText|Letters|Closing",
      "Old|Quick Parts|General|",
    ])
    updateBuildingBlock("old", { name: "Renamed", category: "" })
    expect(loadQuickParts()[1]).toMatchObject({ name: "Renamed", category: "General" })
    const editor = make()
    insertBuildingBlock(editor, loadQuickParts()[0]!)
    expect(editor.getText()).toContain("Kind regards")
  })

  it("saves the fields and the Category and Company properties for Word, and reads them back", async () => {
    const editor = make("<p>Fields: </p>")
    for (const instr of [
      "AUTHOR \\* MERGEFORMAT",
      "TITLE \\* Upper",
      "DOCPROPERTY Company",
      "DOCPROPERTY Category",
      "NUMPAGES \\* roman",
      'QUOTE "hello" \\* Caps',
      "SYMBOL 169",
      'SECTIONPAGES \\* CardText',
      'FILENAME \\* Lower',
      'MERGEFIELD FirstName',
    ]) {
      insertField(editor, instr)
      editor.commands.insertContent(" | ")
    }
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "quick-parts-fields.docx",
      props: useDocumentStore.getState().documentProps,
    })
    if (process.env.QUICK_PARTS_OUT) {
      writeFileSync(path.join(process.env.QUICK_PARTS_OUT, "quick-parts-fields.docx"), saved.bytes)
    }
    const pkg = await openPackage(saved.bytes, "quick-parts-fields.docx")
    const xml = decodeXml(findPart(pkg, "/word/document.xml")!.data)
    expect(xml).toContain('w:instr=" DOCPROPERTY Company "')
    expect(decodeXml(findPart(pkg, "/docProps/core.xml")!.data)).toContain("<cp:category>Reports</cp:category>")
    expect(decodeXml(findPart(pkg, "/docProps/app.xml")!.data)).toContain("<Company>Example Ltd</Company>")
    const opened = await openDocxBytes(saved.bytes, "quick-parts-fields.docx")
    expect(opened.view.props).toMatchObject({ category: "Reports", company: "Example Ltd" })
  })
})

describe("field formats, for Word in the VM", () => {
  it("saves a document of fields Word can recompute (QUICK_PARTS_OUT)", async () => {
    const editor = make('<h1>Introduction</h1><p>Formats: </p>')
    const instrs = [
      'QUOTE "123" \\* CardText',
      'QUOTE "21" \\* OrdText',
      'QUOTE "23" \\* Ordinal',
      'QUOTE "255" \\* Hex',
      'QUOTE "12.5" \\* DollarText',
      'QUOTE "14" \\* ROMAN',
      'QUOTE "28" \\* ALPHABETIC',
      'QUOTE "1234.5" \\# "#,##0.00"',
      'QUOTE "-12" \\# "$#,##0.00;($#,##0.00)"',
      "QUOTE 65",
      'QUOTE "mixed Case text" \\* FirstCap',
      'QUOTE "mixed case text" \\* Caps',
      'CREATEDATE \\@ "dddd, MMMM d, yyyy"',
      "CREATEDATE",
      'STYLEREF "Heading 1"',
      "SECTION",
      "PAGE \\* ALPHABETIC",
      "NUMPAGES \\* CardText",
      "MACROBUTTON NoMacro Click here",
      'MACROBUTTON NoMacro "Quoted text"',
      "SYMBOL 65",
      "TITLE \\* Lower",
      "KEYWORDS",
      "COMMENTS",
      "SUBJECT \\* Upper",
      "INFO Author",
    ]
    for (const instr of instrs) {
      insertField(editor, instr)
      editor.commands.insertContent(" | ")
    }
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "field-formats.docx",
      props: { ...useDocumentStore.getState().documentProps, createdAt: "2026-01-02T09:30:00Z" },
    })
    if (process.env.QUICK_PARTS_OUT) {
      writeFileSync(path.join(process.env.QUICK_PARTS_OUT, "field-formats.docx"), saved.bytes)
      writeFileSync(path.join(process.env.QUICK_PARTS_OUT, "field-formats.app.txt"), results(editor).join("\n"))
    }
    expect(results(editor)).toHaveLength(instrs.length)
  })
})

describe("Company in a file that already has app.xml", () => {
  it("replaces it in place, with one XML declaration", async () => {
    const editor = make("<p>Hi</p>")
    const first = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "a.docx",
      props: useDocumentStore.getState().documentProps,
    })
    const { word, view } = await openDocxBytes(first.bytes, "a.docx")
    const again = await saveDocxBytes({
      json: view.json as never,
      chrome: emptyChrome(),
      word,
      unchanged: true,
      fileName: "a.docx",
      props: { ...view.props, company: "New Co & Sons" },
    })
    const app = decodeXml(findPart(await openPackage(again.bytes, "a.docx"), "/docProps/app.xml")!.data)
    expect(app.match(/<\?xml/g) ?? []).toHaveLength(1)
    expect(app).toContain("<Company>New Co &amp; Sons</Company>")
    expect(app).not.toContain("Example Ltd")
  })
})
