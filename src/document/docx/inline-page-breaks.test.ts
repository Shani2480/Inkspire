import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { createExtensions } from "@/editor/extensions"

// A page break typed among a paragraph's text (Word writes it as a run of its own, <w:br w:type="page"/>): the text
// after it starts the next page, in Word and in the app (a real contract's "12." started on the wrong page).
const SOURCE = path.resolve(process.cwd(), "tests/docx-fixtures/authored/f01_runs.docx")

const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`
const BREAK = '<w:r><w:rPr><w:b/></w:rPr><w:br w:type="page"/></w:r>'

async function documentWith(body: string) {
  const pkg = await openPackage(new Uint8Array(readFileSync(SOURCE)), "f01.docx")
  const part = findPart(pkg, pkg.mainPartName)!
  const xml = new TextDecoder().decode(part.data)
  part.data = new TextEncoder().encode(xml.replace(/<w:body>[\s\S]*?(<w:sectPr)/, `<w:body>${body}$1`))
  return writePackage(pkg)
}

async function openAndSave(bytes: Uint8Array, typedLine = false) {
  const opened = await openDocxBytes(bytes, "breaks.docx")
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: opened.view.html,
    parseOptions: { preserveWhitespace: "full" },
  })
  const json = editor.getJSON()
  editor.destroy()
  if (typedLine) {
    // The editor's own empty line at the end (its trailing node, added in the running app).
    json.content = [...(json.content ?? []), { type: "paragraph" }]
  }
  const saved = await saveDocxBytes({
    json,
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "breaks.docx",
  })
  return { json, word: readDocument(await openPackage(saved.bytes, "breaks.docx")) }
}

/** Each saved paragraph as its text, with [PB] for a page break and [B] for a bold one. */
function shape(word: Awaited<ReturnType<typeof openAndSave>>["word"]) {
  return word.blocks.flatMap((block) =>
    block.kind === "paragraph"
      ? [
          block.inlines
            .map((inline) =>
              inline.kind === "run"
                ? inline.content
                    .map((item) =>
                      item.kind === "text"
                        ? item.text
                        : item.kind === "break" && item.breakType === "page"
                          ? inline.rPr.b
                            ? "[B]"
                            : "[PB]"
                          : "",
                    )
                    .join("")
                : "",
            )
            .join(""),
        ]
      : [],
  )
}

const types = (json: { content?: { type?: string }[] }) => (json.content ?? []).map((node) => node.type)

describe("a page break among a paragraph's text", () => {
  it("at its end: the next paragraph starts the next page, and the break stays in its paragraph", async () => {
    const { json, word } = await openAndSave(
      await documentWith(`<w:p>${run("11.4 Article")}${BREAK}</w:p><w:p>${run("12. Intellectual property")}</w:p>`),
    )
    expect(types(json)).toEqual(["paragraph", "pageBreak", "paragraph"])
    expect(shape(word)).toEqual(["11.4 Article[B]", "12. Intellectual property"])
  })

  it("in its middle: the text after it opens the next page, saved as one paragraph", async () => {
    const { json, word } = await openAndSave(await documentWith(`<w:p>${run("Before")}${BREAK}${run("After")}</w:p>`))
    expect(types(json)).toEqual(["paragraph", "pageBreak", "paragraph"])
    expect(shape(word)).toEqual(["Before[B]After"])
  })

  it("alone in its paragraph: still Word's own page break paragraph", async () => {
    const { json, word } = await openAndSave(
      await documentWith(`<w:p>${run("One")}</w:p><w:p>${BREAK}</w:p><w:p>${run("Two")}</w:p>`),
    )
    expect(types(json)).toEqual(["paragraph", "pageBreak", "paragraph"])
    expect(shape(word)).toEqual(["One", "[B]", "Two"])
  })
})

describe("a document ending in a heading", () => {
  it("saves without the editor's empty line after it (a real form gained a second, empty page)", async () => {
    const heading = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run("Important information")}</w:p>`
    const { json, word } = await openAndSave(await documentWith(`<w:p>${run("Form")}</w:p>${heading}`), true)
    expect(types(json)).toEqual(["paragraph", "heading", "paragraph"])
    expect(shape(word)).toEqual(["Form", "Important information"])
  })
})
