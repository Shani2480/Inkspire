import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { openPackage } from "@/document/docx/opc"
import { aroundPictures } from "@/document/docx/project"
import { readDocument } from "@/document/docx/wml-read"
import { createExtensions } from "@/editor/extensions"

// Word paragraphs holding in-line pictures among their text: before a picture, after one, between two, in a numbered
// item, and spaced and indented (made for this test; Word renders it the same before and after a save, 2026-11-19).
const FIXTURE = path.resolve(process.cwd(), "tests/docx-fixtures/cases/w16_pictures_among_text.docx")

async function openAndSave() {
  const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "w16.docx")
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: opened.view.html,
    // As the app opens a Word document: every space in it is text.
    parseOptions: { preserveWhitespace: "full" },
  })
  const json = editor.getJSON()
  const html = editor.getHTML()
  editor.destroy()
  const saved = await saveDocxBytes({
    json,
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "w16.docx",
  })
  return { html, word: readDocument(await openPackage(saved.bytes, "w16.docx")) }
}

/** Each saved paragraph as its text, with [P] for a picture. */
function shape(word: Awaited<ReturnType<typeof openAndSave>>["word"]) {
  return word.blocks.flatMap((block) =>
    block.kind === "paragraph"
      ? [
          block.inlines
            .map((inline) =>
              inline.kind === "run"
                ? inline.content
                    .map((item) => (item.kind === "text" ? item.text : item.kind === "drawing" ? "[P]" : ""))
                    .join("")
                : "",
            )
            .join(""),
        ]
      : [],
  )
}

describe("in-line pictures among a paragraph's text", () => {
  it("cuts the paragraph around each picture, every piece keeping the paragraph", () => {
    const html = aroundPictures(
      '<p data-docx="k1" style="margin-top: 6pt"><span>One </span><span><img src="a.png"></span><span> two</span></p>',
    )
    expect(html).toBe(
      '<p data-docx="k1" style="margin-top: 6pt" data-docx-part="before"><span>One </span><span></span></p>' +
        '<img src="a.png">' +
        '<p data-docx="k1" style="margin-top: 6pt" data-docx-part="next"><span></span><span> two</span></p>',
    )
    // A picture placed on the page is drawn apart already; a paragraph without pictures is left alone.
    const floating = '<p data-docx="k2">Text<img data-wrap="square" src="b.png"></p>'
    expect(aroundPictures(floating)).toBe(floating)
  })

  it("saves each paragraph whole, with its spaces, numbering and spacing", async () => {
    const { html, word } = await openAndSave()
    expect(html).toContain('data-docx-part="between"')
    expect(shape(word)).toEqual([
      "R0 start",
      "[P] R1 picture first then text",
      "R2 text then picture [P]",
      "R3 one [P] two [P] three",
      "R4 numbered item [P] end",
      "[P] R5 numbered, picture first",
      "R6 spaced and indented [P] after the picture, and a long run of words to wrap onto another line of the paragraph to see the indent",
      "R7 end",
    ])
    const paragraphs = word.blocks.filter((block) => block.kind === "paragraph")
    expect(paragraphs[4]?.pPr.numPr?.numId).toBe(1)
    expect(paragraphs[5]?.pPr.numPr?.numId).toBe(1)
    expect(paragraphs[6]?.pPr.spacing).toMatchObject({ before: 240, after: 240 })
    expect(paragraphs[6]?.pPr.ind?.firstLine).toBe(720)
  })
})
