import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** A fixture with its body's XML changed, and its styles' when `styles` is given. */
async function edited(name: string, change: (xml: string) => string, styles?: (xml: string) => string) {
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  const part = findPart(pkg, pkg.mainPartName)!
  part.data = new TextEncoder().encode(change(decodeXml(part.data)))
  const stylesPart = findPart(pkg, "/word/styles.xml")
  if (styles && stylesPart) {
    stylesPart.data = new TextEncoder().encode(styles(decodeXml(stylesPart.data)))
  }
  return writePackage(pkg)
}

async function openAndSave(bytes: Uint8Array, edit?: (editor: Editor) => void) {
  const opened = await openDocxBytes(bytes, "t.docx")
  const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
  const editor = new Editor({ extensions, content: opened.view.html })
  editors.push(editor)
  edit?.(editor)
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "t.docx",
  })
  const pkg = await openPackage(saved.bytes, "t.docx")
  return { html: opened.view.html, editor, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
}

function imageAlign(editor: Editor) {
  let align: unknown
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") {
      align = node.attrs.textAlign
    }
  })
  return align
}

describe("a picture alone in a centred paragraph", () => {
  const centred = () =>
    edited("f13_inline_image.docx", (xml) =>
      xml.replace(/(<w:p [^>]*>)(<w:r><w:rPr><w:noProof\/>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr>$2'),
    )

  it("opens centred and saves the paragraph as it was", async () => {
    const { html, editor, xml } = await openAndSave(await centred())
    expect(html).toContain('<img style="text-align: center"')
    expect(imageAlign(editor)).toBe("center")
    expect(xml).toMatch(
      /<w:p[^>]*><w:pPr><w:jc w:val="center"\/><\/w:pPr><w:r><w:rPr><w:noProof\/><\/w:rPr><w:drawing>/,
    )
  })

  it("saves an alignment set in the editor", async () => {
    const { xml } = await openAndSave(await centred(), (editor) => {
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "image") {
          editor.chain().setNodeSelection(pos).setTextAlign("right").run()
        }
      })
    })
    expect(xml).toMatch(/<w:jc w:val="right"\/><\/w:pPr><w:r><w:rPr><w:noProof\/><\/w:rPr><w:drawing>/)
  })

  it("leaves a picture in a left-aligned paragraph as it was", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, "f13_inline_image.docx")))
    const { html, editor, xml } = await openAndSave(bytes)
    expect(html).not.toContain("text-align")
    expect(imageAlign(editor)).toBeFalsy()
    expect(xml).not.toContain("<w:jc ")
  })
})

describe("a picture alone in a paragraph whose style centres it", () => {
  const styled = () =>
    edited(
      "f13_inline_image.docx",
      (xml) => xml.replace(/(<w:p [^>]*>)(<w:r><w:rPr><w:noProof\/>)/, '$1<w:pPr><w:pStyle w:val="Figure"/></w:pPr>$2'),
      (xml) =>
        xml.replace(
          "</w:styles>",
          '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Figure"><w:name w:val="Figure"/>' +
            '<w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style></w:styles>',
        ),
    )

  it("opens centred and saves without a w:jc of its own", async () => {
    const { html, editor, xml } = await openAndSave(await styled())
    expect(html).toContain('<img style="text-align: center"')
    expect(imageAlign(editor)).toBe("center")
    expect(xml).toMatch(/<w:pPr><w:pStyle w:val="Figure"\/><\/w:pPr><w:r><w:rPr><w:noProof\/>/)
  })

  it("saves a picture set to the left with w:jc left, over its style", async () => {
    const { xml } = await openAndSave(await styled(), (editor) => {
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "image") {
          editor.chain().setNodeSelection(pos).setTextAlign("left").run()
        }
      })
    })
    expect(xml).toMatch(/<w:pStyle w:val="Figure"\/><w:jc w:val="left"\/><\/w:pPr><w:r><w:rPr><w:noProof\/>/)
  })
})

describe("a table whose cell widths differ from its grid", () => {
  const cell = (width: number, text: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`
  const table =
    '<w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2124"/>' +
    `<w:gridCol w:w="328"/><w:gridCol w:w="1548"/></w:tblGrid><w:tr>${cell(2337, "A")}${cell(340, "→")}${cell(1323, "B")}</w:tr></w:tbl>`
  const bytes = () =>
    edited("f02_heading_style.docx", (xml) =>
      xml.replace(/<w:body>[\s\S]*?(<w:sectPr[\s\S]*<\/w:body>)/, `<w:body>${table}<w:p/>$1`),
    )

  it("keeps the cells' own widths while the columns are unchanged", async () => {
    const { xml } = await openAndSave(await bytes(), (editor) => {
      // An edit elsewhere, so the document is saved from the editor rather than as read.
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, "x")
    })
    expect(xml).toContain('<w:gridCol w:w="2124"/><w:gridCol w:w="328"/><w:gridCol w:w="1548"/>')
    expect([...xml.matchAll(/<w:tcW w:w="(\d+)"/g)].map((match) => match[1])).toEqual(["2337", "340", "1323"])
  })

  it("gives resized columns the new grid's widths", async () => {
    const { xml } = await openAndSave(await bytes(), (editor) => {
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "tableCell" && node.textContent === "A") {
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: [200] }))
        }
      })
    })
    expect(xml).toContain('<w:gridCol w:w="3000"/>')
    expect([...xml.matchAll(/<w:tcW w:w="(\d+)"/g)].map((match) => match[1])[0]).toBe("3000")
  })
})

describe("a Table of Contents control without Word's gallery", () => {
  const entry = (anchor: string, text: string, page: string) =>
    `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:hyperlink w:anchor="${anchor}"><w:r><w:t>${text}</w:t></w:r>` +
    `<w:r><w:tab/></w:r><w:r><w:t>${page}</w:t></w:r></w:hyperlink></w:p>`
  const control =
    '<w:sdt><w:sdtPr><w:alias w:val="Table of Contents"/><w:id w:val="401877191"/></w:sdtPr><w:sdtContent>' +
    '<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText>TOC \\h \\o "1-2"</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:hyperlink w:anchor="_Toc1"><w:r><w:t>Why</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>3</w:t></w:r></w:hyperlink></w:p>' +
    entry("_Toc2", "How", "4") +
    '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent></w:sdt>'
  const body =
    control +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="1" w:name="_Toc1"/><w:r><w:t>Why</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="2" w:name="_Toc2"/><w:r><w:t>How</w:t></w:r><w:bookmarkEnd w:id="2"/></w:p>'

  it("opens as the editor's table of contents and saves the control as read", async () => {
    const bytes = await edited("f02_heading_style.docx", (xml) =>
      xml.replace(/<w:body>[\s\S]*?(<w:sectPr[\s\S]*<\/w:body>)/, `<w:body>${body}$1`),
    )
    const { html, xml } = await openAndSave(bytes)
    expect(html).toContain("data-toc=")
    expect(html).toContain("Why")
    expect(xml).toContain(control)
  })
})
