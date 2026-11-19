import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { leadBase, leadStyleSheet, wordDescent } from "@/document/line-lead"
import { createExtensions } from "@/editor/extensions"
import { leadOf } from "@/editor/word-lead"

describe("Word's place for text in a line", () => {
  it("index.css carries the page rules as line-lead.ts writes them", () => {
    const css = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8")
    expect(css).toContain(leadStyleSheet())
  })

  it("puts an exact line's baseline at 80% and keeps a multiple's where a single line has it", () => {
    expect(leadBase("exact")).toBe("0.8lh")
    expect(leadBase("multiple")).toContain("var(--word-single-line")
    expect(leadBase("atLeast")).toMatch(/^max\(1lh - /)
  })

  it("knows Word's descent of the common fonts", () => {
    expect(wordDescent("Calibri")).toBe(0.27)
    expect(wordDescent("Aptos")).toBe(0.282)
    expect(wordDescent("Some Other Font")).toBe(0.23)
  })
})

describe("paragraphs with taller content", () => {
  const extensions = () => createExtensions().filter((extension) => extension.name !== "spellcheck")
  const first = (html: string) => {
    const editor = new Editor({ extensions: extensions(), content: html })
    const node = editor.state.doc.firstChild!
    editor.destroy()
    return leadOf(node)
  }

  it("leaves plain text to the trim", () => {
    expect(first("<p>Plain <strong>bold</strong> text</p>")).toEqual({ tall: false, size: undefined, family: undefined })
  })

  it("gives a paragraph the one size and font all of its text has", () => {
    expect(first('<p><span style="font-size: 16pt; font-family: Georgia">Big text</span></p>')).toEqual({
      tall: false,
      size: "16pt",
      family: "Georgia",
    })
  })

  it("marks runs of different sizes as taller content", () => {
    expect(first('<p>Small <span style="font-size: 20pt">big</span></p>')).toEqual({ tall: true, mixed: true })
  })
})
