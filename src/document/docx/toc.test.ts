import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphText, paragraphsIn, type Block, type WordDocument } from "@/document/docx/model"
import { findPart, openPackage } from "@/document/docx/opc"
import { wordToEditor } from "@/document/docx/project"
import { readDocument, readWordXml } from "@/document/docx/wml-read"
import { decodeXml } from "@/document/docx/xml"
import { tocInstruction, tocOptions } from "@/document/toc"
import { createExtensions } from "@/editor/extensions"

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function editorWith(html: string) {
  // The spell checker fetches dictionaries from the dev server, which tests do not run.
  const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
  const editor = new Editor({ extensions, content: html })
  editors.push(editor)
  return editor
}

function tocNodes(editor: Editor) {
  const found: Record<string, unknown>[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableOfContents") {
      found.push(node.attrs)
    }
  })
  return found
}

async function save(editor: Editor, word: WordDocument | null, chrome = emptyChrome()) {
  const saved = await saveDocxBytes({ json: editor.getJSON(), chrome, word, unchanged: false, fileName: "toc.docx" })
  const pkg = await openPackage(saved.bytes, "toc.docx")
  return {
    bytes: saved.bytes,
    doc: readDocument(pkg),
    xml: decodeXml(findPart(pkg, "/word/document.xml")!.data),
    styles: decodeXml(findPart(pkg, "/word/styles.xml")!.data),
  }
}

async function reopen(bytes: Uint8Array) {
  const opened = await openDocxBytes(bytes, "toc.docx")
  return { opened, editor: editorWith(opened.view.html) }
}

function tocControl(blocks: Block[]) {
  const control = blocks.find((block) => block.kind === "raw" && block.blocks)
  if (control?.kind !== "raw") {
    throw new Error("No table of contents control")
  }
  return control
}

function fieldParagraph(text: string, page: string, anchor: string, style: string, extra = "") {
  return (
    `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9015"/></w:tabs></w:pPr>` +
    extra +
    `<w:hyperlink w:anchor="${anchor}"><w:r><w:t>${text}</w:t></w:r><w:r><w:tab/></w:r>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGEREF ${anchor} \\h</w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${page}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>`
  )
}

const FIELD_START =
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'

const HEADINGS =
  '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="1" w:name="_Toc100"/><w:r><w:t>Purpose</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:bookmarkStart w:id="2" w:name="_Toc200"/><w:r><w:t>Scope</w:t></w:r><w:bookmarkEnd w:id="2"/></w:p>'

const STYLES =
  `<w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/></w:style></w:styles>'

/** A TOC field over paragraphs, the way Word writes one without a content control. */
function fieldToc() {
  const body =
    "<w:p><w:r><w:t>Table of Contents</w:t></w:r></w:p>" +
    fieldParagraph("Purpose", "3", "_Toc100", "TOC1", FIELD_START) +
    fieldParagraph("Scope", "iv", "_Toc200", "TOC2") +
    '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
    HEADINGS
  return readWordXml({ documentXml: `<w:document ${W}><w:body>${body}</w:body></w:document>`, stylesXml: STYLES })
}

/** A TOC field inside a Table of Contents content control, as Word's Automatic Table inserts it. */
function controlToc() {
  const body =
    '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr>' +
    '<w:sdtContent><w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>Contents</w:t></w:r></w:p>' +
    fieldParagraph("Purpose", "1", "_Toc100", "TOC1", FIELD_START) +
    fieldParagraph("Scope", "2", "_Toc200", "TOC2").replace(
      "</w:hyperlink></w:p>",
      '</w:hyperlink><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
    ) +
    "</w:sdtContent></w:sdt>" +
    HEADINGS
  return readWordXml({ documentXml: `<w:document ${W}><w:body>${body}</w:body></w:document>`, stylesXml: STYLES })
}

describe("tables of contents in Word documents", () => {
  it("opens a TOC field over paragraphs as a table of contents", () => {
    const editor = editorWith(wordToEditor(fieldToc()).html)
    const [toc] = tocNodes(editor)
    expect(toc?.instruction).toBe('TOC \\o "1-2" \\h \\z \\u')
    expect(toc?.title).toBe("")
    expect(toc?.entries).toEqual([
      { level: 1, text: "Purpose", page: "3", anchor: "_Toc100" },
      { level: 2, text: "Scope", page: "iv", anchor: "_Toc200" },
    ])
    // The document's own heading paragraph stays, and no field paragraph is left behind.
    expect(editor.getText()).toContain("Table of Contents")
    expect(editor.state.doc.childCount).toBe(4)
  })

  it("opens a Table of Contents content control as a table of contents with its title", () => {
    const editor = editorWith(wordToEditor(controlToc()).html)
    const [toc] = tocNodes(editor)
    expect(toc?.title).toBe("Contents")
    expect(toc?.entries).toEqual([
      { level: 1, text: "Purpose", page: "1", anchor: "_Toc100" },
      { level: 2, text: "Scope", page: "2", anchor: "_Toc200" },
    ])
  })

  it("saves an untouched table of contents exactly as it was read", async () => {
    for (const [word, control] of [
      [fieldToc(), false],
      [controlToc(), true],
    ] as const) {
      const editor = editorWith(wordToEditor(word).html)
      const { xml } = await save(editor, word)
      expect(xml).toContain(' TOC \\o "1-2" \\h \\z \\u ')
      expect(xml.includes("<w:sdt>")).toBe(control)
      expect(xml).toContain(control ? "<w:t>2</w:t>" : "<w:t>iv</w:t>")
      expect(xml.match(/PAGEREF _Toc100/g)).toHaveLength(1)
    }
  })

  it("updates an opened table of contents from the headings, keeping their bookmarks", async () => {
    const word = fieldToc()
    const editor = editorWith(wordToEditor(word).html)
    editor.commands.updateTableOfContents()
    const [toc] = tocNodes(editor)
    expect(toc?.entries).toEqual([
      { level: 1, text: "Purpose", page: "1", anchor: "_Toc100" },
      { level: 2, text: "Scope", page: "1", anchor: "_Toc200" },
    ])
    const { doc, xml } = await save(editor, word)
    const control = tocControl(doc.blocks)
    expect(paragraphsIn(control.blocks!).map((paragraph) => paragraph.styleId)).toEqual(["TOC1", "TOC2"])
    expect(xml).toContain('<w:hyperlink w:anchor="_Toc200"')
    expect(xml).toContain("PAGEREF _Toc200 \\h")
    // The headings keep their one bookmark each.
    expect(xml.match(/w:name="_Toc100"/g)).toHaveLength(1)
  })
})

describe("tables of contents made in the editor", () => {
  const HTML = "<h1>Introduction</h1><p>Body</p><h2>Background</h2><h3>Detail</h3><h4>Too deep</h4>"

  function withToc() {
    const editor = editorWith(HTML)
    editor.chain().setTextSelection(1).insertTableOfContents().run()
    return editor
  }

  it("lists headings 1 to 3", () => {
    const [toc] = tocNodes(withToc())
    expect((toc?.entries as { text: string }[]).map((entry) => entry.text)).toEqual([
      "Introduction",
      "Background",
      "Detail",
    ])
  })

  it("saves a Word table of contents that links to bookmarked headings", async () => {
    const { doc, xml, styles } = await save(withToc(), null)
    expect(xml).toContain('<w:docPartGallery w:val="Table of Contents"/>')
    expect(xml).toContain('TOC \\o "1-3" \\h \\z \\u')
    const control = tocControl(doc.blocks)
    const paragraphs = paragraphsIn(control.blocks!)
    expect(paragraphs.map((paragraph) => paragraph.styleId)).toEqual(["TOCHeading", "TOC1", "TOC2", "TOC3"])
    expect(paragraphs.map(paragraphText)).toEqual(["Contents", "Introduction1", "Background1", "Detail1"])
    expect(paragraphs[1]?.pPr.tabs?.[0]).toMatchObject({ val: "right", leader: "dot" })
    const anchors = [...xml.matchAll(/PAGEREF (_Toc\d+)/g)].map((match) => match[1])
    expect(anchors).toHaveLength(3)
    for (const anchor of anchors) {
      expect(xml).toContain(`w:name="${anchor}"`)
    }
    // The heading too deep for the table of contents gets no bookmark.
    expect(xml.match(/<w:bookmarkStart/g)).toHaveLength(3)
    expect(styles).toContain('w:styleId="TOC1"')
    expect(styles).toContain('w:styleId="TOCHeading"')
  })

  it("reopens a saved table of contents as one and saves it again unchanged", async () => {
    const first = await save(withToc(), null)
    const { opened, editor } = await reopen(first.bytes)
    const [toc] = tocNodes(editor)
    expect(toc?.title).toBe("Contents")
    expect((toc?.entries as { anchor?: string }[]).every((entry) => entry.anchor?.startsWith("_Toc"))).toBe(true)
    const second = await save(editor, opened.word)
    expect(tocControl(second.doc.blocks).xml).toBe(tocControl(first.doc.blocks).xml)
    expect(second.xml.match(/<w:bookmarkStart/g)).toHaveLength(3)
  })

  it("follows a renamed heading through its bookmark when updated after reopening", async () => {
    const first = await save(withToc(), null)
    const { opened, editor } = await reopen(first.bytes)
    const anchor = (tocNodes(editor)[0]?.entries as { anchor?: string }[])[1]?.anchor
    let at = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.textContent === "Background" && node.type.name === "heading") {
        at = pos
      }
    })
    editor
      .chain()
      .insertContentAt(at + 1, "New ")
      .updateTableOfContents()
      .run()
    const saved = await save(editor, opened.word)
    expect(paragraphsIn(tocControl(saved.doc.blocks).blocks!).map(paragraphText)).toContain("New Background1")
    expect(saved.xml).toContain(`PAGEREF ${anchor} \\h`)
    expect(saved.xml.match(/<w:bookmarkStart/g)).toHaveLength(3)
  })
})

describe("table of contents options", () => {
  const HTML = "<h1>Introduction</h1><p>Body</p><h2>Background</h2>"

  it("edits levels, links, and page numbers in the instruction and keeps its other switches", () => {
    expect(tocInstruction('TOC \\o "1-3" \\h \\z \\u', { levels: 2, hyperlinks: false, pageNumbers: false })).toBe(
      'TOC \\o "1-2" \\z \\u \\n',
    )
    expect(tocInstruction('TOC \\o "1-3" \\z \\u \\n', { levels: 9, hyperlinks: true, pageNumbers: true })).toBe(
      'TOC \\o "1-9" \\z \\u \\h',
    )
    expect(tocOptions({ instruction: 'TOC \\o "1-4" \\n \\h', leader: "hyphen", rightAlign: false })).toEqual({
      levels: 4,
      hyperlinks: true,
      pageNumbers: false,
      rightAlign: false,
      leader: "hyphen",
    })
  })

  it("writes the leader and alignment as the entries' tab stop, and reads them back", async () => {
    const editor = editorWith(HTML)
    editor.chain().setTextSelection(1).insertTableOfContents({ leader: "hyphen" }).run()
    const hyphen = await save(editor, null)
    expect(paragraphsIn(tocControl(hyphen.doc.blocks).blocks!)[1]?.pPr.tabs?.[0]).toMatchObject({ leader: "hyphen" })
    expect(tocNodes((await reopen(hyphen.bytes)).editor)[0]).toMatchObject({ leader: "hyphen", rightAlign: true })

    editor.commands.insertTableOfContents({ rightAlign: false })
    const inline = await save(editor, null)
    const entry = paragraphsIn(tocControl(inline.doc.blocks).blocks!)[1]!
    expect(entry.pPr.tabs).toBeUndefined()
    expect(paragraphText(entry)).toBe("Introduction 1")
    expect(tocNodes((await reopen(inline.bytes)).editor)[0]).toMatchObject({ rightAlign: false })
  })

  it("leaves out page numbers with \\n and links without \\h", async () => {
    const editor = editorWith(HTML)
    editor.chain().setTextSelection(1).insertTableOfContents({ instruction: 'TOC \\o "1-3" \\z \\u \\n' }).run()
    const { doc, xml } = await save(editor, null)
    expect(paragraphsIn(tocControl(doc.blocks).blocks!).map(paragraphText)).toEqual([
      "Contents",
      "Introduction",
      "Background",
    ])
    expect(xml).not.toContain("PAGEREF")
    expect(xml).not.toContain("<w:hyperlink")
    expect(xml).not.toContain("<w:bookmarkStart")
  })

  it("replaces the table of contents from the gallery instead of adding a second one", () => {
    const editor = editorWith(HTML)
    editor.chain().setTextSelection(1).insertTableOfContents({ title: "Contents" }).run()
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertTableOfContents({ title: "Table of Contents" })
    expect(tocNodes(editor).map((toc) => toc.title)).toEqual(["Table of Contents"])
  })

  it("updates page numbers only, keeping entries as they are", () => {
    const editor = editorWith(HTML)
    editor.chain().setTextSelection(1).insertTableOfContents().run()
    const at = editor.state.doc.content.size - 1
    editor.chain().insertContentAt(at, "<h1>Later</h1>").updateTableOfContents("pages").run()
    expect((tocNodes(editor)[0]?.entries as { text: string }[]).map((entry) => entry.text)).toEqual([
      "Introduction",
      "Background",
    ])
    editor.commands.updateTableOfContents("entire")
    expect((tocNodes(editor)[0]?.entries as { text: string }[]).map((entry) => entry.text)).toContain("Later")
  })

  it("removes the table of contents", () => {
    const editor = editorWith(HTML)
    editor.chain().setTextSelection(1).insertTableOfContents().run()
    expect(editor.commands.removeTableOfContents()).toBe(true)
    expect(tocNodes(editor)).toHaveLength(0)
    expect(editor.commands.removeTableOfContents()).toBe(false)
  })
})

describe("keeping a table of contents current", () => {
  it("marks a table of contents whose headings changed until it is updated", () => {
    const editor = editorWith("<h1>Introduction</h1><h2>Background</h2>")
    editor.chain().setTextSelection(1).insertTableOfContents().run()
    const stale = () => editor.view.dom.querySelector("nav.toc-block")?.classList.contains("is-stale")
    expect(stale()).toBe(false)
    let at = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.textContent === "Background") {
        at = pos
      }
    })
    editor.commands.insertContentAt(at + 1, "New ")
    expect(stale()).toBe(true)
    editor.commands.updateTableOfContents("pages")
    expect(stale()).toBe(true)
    editor.commands.updateTableOfContents()
    expect(stale()).toBe(false)
  })

  it("lists paragraphs given an outline level deeper than the editor's headings", async () => {
    const editor = editorWith('<h1>Top</h1><p data-outline="7">Deep</p>')
    editor.chain().setTextSelection(1).insertTableOfContents({ instruction: 'TOC \\o "1-9" \\h \\z \\u' }).run()
    expect(tocNodes(editor)[0]?.entries).toMatchObject([
      { level: 1, text: "Top" },
      { level: 7, text: "Deep" },
    ])
    const { doc } = await save(editor, null)
    expect(paragraphsIn(tocControl(doc.blocks).blocks!).map((paragraph) => paragraph.styleId)).toEqual([
      "TOCHeading",
      "TOC1",
      "TOC7",
    ])
  })
})
