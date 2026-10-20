import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphText, paragraphsIn } from "@/document/docx/model"
import { findPart, openPackage } from "@/document/docx/opc"
import { editorToWord, wordToEditor } from "@/document/docx/project"
import { readDocument } from "@/document/docx/wml-read"
import { decodeXml } from "@/document/docx/xml"

const CASES = path.resolve(process.cwd(), "tests/docx-fixtures/cases")

function headingText(html: string) {
  return new DOMParser().parseFromString(html, "text/html").querySelector("h1")?.textContent
}

describe("docx editor projection", () => {
  it("turns a Heading1 style into a heading and back into Heading1", () => {
    const word = editorToWord(
      {
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] }],
      },
      emptyChrome(),
      {},
      null,
    )
    expect(word.blocks[0]).toMatchObject({ kind: "paragraph", styleId: "Heading1" })
    expect(word.styles.styles.some((style) => style.id === "Heading1")).toBe(true)
    expect(headingText(wordToEditor(word).html)).toBe("Title")
  })

  it("keeps bold text across the projection", () => {
    const word = editorToWord(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello", marks: [{ type: "bold" }] }],
          },
        ],
      },
      emptyChrome(),
      {},
      null,
    )
    expect(wordToEditor(word).html).toContain("<strong>Hello</strong>")
  })

  it("saves an unedited open through the word document", async () => {
    const name = "00_baseline.docx"
    const opened = await openDocxBytes(new Uint8Array(readFileSync(path.join(CASES, name))), name)
    expect(opened.view.html).toContain("MARKER-BASE")
    const saved = await saveDocxBytes({
      json: { type: "doc", content: [] },
      chrome: opened.view.chrome,
      word: opened.word,
      unchanged: true,
      fileName: name,
    })
    const again = readDocument(await openPackage(saved.bytes, name))
    expect(
      paragraphsIn(again.blocks)
        .map((paragraph) => paragraphText(paragraph))
        .join(""),
    ).toContain("MARKER-BASE")
  })

  it("keeps an unknown part when an opened file is saved without edits", async () => {
    const name = "r09_unknown_part_preserved.docx"
    const source = new Uint8Array(readFileSync(path.join(CASES, name)))
    const opened = await openDocxBytes(source, name)
    const saved = await saveDocxBytes({
      json: { type: "doc", content: [] },
      chrome: opened.view.chrome,
      word: opened.word,
      unchanged: true,
      fileName: name,
    })
    const written = await openPackage(saved.bytes, name)
    const original = await openPackage(source, name)
    expect(findPart(written, "/word/probe/blob.xml")?.data).toEqual(findPart(original, "/word/probe/blob.xml")?.data)
  })

  it("keeps an unknown part when an opened file is edited and saved", async () => {
    const name = "r09_unknown_part_preserved.docx"
    const source = new Uint8Array(readFileSync(path.join(CASES, name)))
    const opened = await openDocxBytes(source, name)
    const saved = await saveDocxBytes({
      json: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Edited marker" }] }],
      },
      chrome: opened.view.chrome,
      word: opened.word,
      unchanged: false,
      fileName: name,
    })
    const written = await openPackage(saved.bytes, name)
    const original = await openPackage(source, name)
    expect(findPart(written, "/word/probe/blob.xml")?.data).toEqual(findPart(original, "/word/probe/blob.xml")?.data)
    const again = readDocument(written)
    expect(
      paragraphsIn(again.blocks)
        .map((paragraph) => paragraphText(paragraph))
        .join(""),
    ).toContain("Edited marker")
  })

  it("writes a created heading as a Word heading style", async () => {
    const saved = await saveDocxBytes({
      json: {
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Created" }] }],
      },
      chrome: emptyChrome(),
      props: { title: "Created note" },
      word: null,
      unchanged: false,
      fileName: "created.docx",
    })
    const pkg = await openPackage(saved.bytes, "created.docx")
    const xml = decodeXml(findPart(pkg, "/word/document.xml")!.data)
    expect(xml).toContain('w:val="Heading1"')
    expect(decodeXml(findPart(pkg, "/docProps/core.xml")!.data)).toContain("Created note")
    const opened = await openDocxBytes(saved.bytes, "created.docx")
    expect(headingText(opened.view.html)).toBe("Created")
    expect(opened.view.props.title).toBe("Created note")
  })
})
