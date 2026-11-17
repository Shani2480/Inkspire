import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { useReviewStore } from "@/document/review"
import { acceptChanges, listChanges, rejectChanges } from "@/editor/track-changes"

let editor: Editor
afterEach(() => {
  editor?.destroy()
  useReviewStore.setState({ tracking: false, protection: null })
})

const make = (content: string) => {
  editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  return editor
}

const select = (text: string) => {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) {
      at = pos + node.text!.indexOf(text)
    }
  })
  editor.commands.setTextSelection({ from: at, to: at + text.length })
}

describe("formatting changes tracked", () => {
  it("records bold and italic as one change per piece, and says what changed", () => {
    make("<p>plain <em>slanted</em> words</p>")
    useReviewStore.setState({ tracking: true })
    select("plain")
    editor.chain().setBold().run()
    const [change] = listChanges(editor.state.doc)
    expect(change).toMatchObject({ kind: "format", text: "plain", description: "Formatted: Bold" })
    select("slanted")
    editor.chain().unsetItalic().run()
    expect(listChanges(editor.state.doc).map((item) => item.description)).toContain("Formatted: Not Italic")
    // Back where it started: no change left.
    select("plain")
    editor.chain().unsetBold().run()
    expect(listChanges(editor.state.doc).map((item) => item.text)).toEqual(["slanted"])
  })

  it("accepts and rejects formatting", () => {
    make("<p>one two</p>")
    useReviewStore.setState({ tracking: true })
    select("one")
    editor.chain().setBold().setItalic().run()
    select("two")
    editor.chain().setMark("textStyle", { fontSize: "18pt" }).run()
    expect(listChanges(editor.state.doc).find((item) => item.text === "two")?.description).toBe(
      "Formatted: Font size: 18 pt",
    )
    useReviewStore.setState({ tracking: false })
    const one = listChanges(editor.state.doc).find((item) => item.text === "one")!
    rejectChanges(editor, [one.id])
    select("one")
    expect(editor.isActive("bold") || editor.isActive("italic")).toBe(false)
    acceptChanges(editor)
    expect(listChanges(editor.state.doc)).toEqual([])
    select("two")
    expect(editor.getAttributes("textStyle").fontSize).toBe("18pt")
  })

  it("does not mark formatting of text inserted while tracking", () => {
    make("<p>x</p>")
    useReviewStore.setState({ tracking: true })
    editor.commands.setTextSelection(2)
    editor.commands.insertContent("new")
    select("new")
    editor.chain().setBold().run()
    expect(listChanges(editor.state.doc).map((item) => item.kind)).toEqual(["insertion"])
  })
})

describe("formatting changes in .docx", () => {
  it("saves w:rPrChange, reads it back, and drops it once rejected", async () => {
    const { saveDocxBytes, openDocxBytes } = await import("@/document/docx/io")
    const { emptyChrome } = await import("@/document/header")
    const { findPart, openPackage } = await import("@/document/docx/opc")
    const { decodeXml } = await import("@/document/docx/xml")
    const save = async () => {
      const saved = await saveDocxBytes({
        json: editor.getJSON(),
        chrome: emptyChrome(),
        word: null,
        unchanged: false,
        fileName: "f.docx",
      })
      const pkg = await openPackage(saved.bytes, "f.docx")
      return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
    }
    make("<p>keep <em>this</em></p>")
    useReviewStore.setState({ tracking: true })
    select("this")
    editor.chain().setBold().run()
    useReviewStore.setState({ tracking: false })
    const first = await save()
    expect(first.xml).toMatch(
      /<w:rPr><w:b\/><w:i\/>.*<w:rPrChange w:id="\d+"[^>]*><w:rPr><w:i\/><\/w:rPr><\/w:rPrChange>/,
    )
    const opened = await openDocxBytes(first.bytes, "f.docx")
    editor.destroy()
    make(opened.view.html)
    const [change] = listChanges(editor.state.doc)
    expect(change).toMatchObject({ kind: "format", text: "this", description: "Formatted: Bold" })
    rejectChanges(editor)
    select("this")
    expect(editor.isActive("bold")).toBe(false)
    expect(editor.isActive("italic")).toBe(true)
    expect((await save()).xml).not.toContain("rPrChange")
  })
})
