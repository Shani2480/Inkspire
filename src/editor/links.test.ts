import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { Bookmark } from "@/editor/insert-blocks"
import {
  applyLink,
  documentPlaces,
  headingTarget,
  linkAtSelection,
  mailtoHref,
  normalizeAddress,
  parseMailto,
  removeLink,
} from "@/editor/links"

let editor: Editor
const make = (content: string) => {
  editor = new Editor({ extensions: [StarterKit, Bookmark], content })
  return editor
}
afterEach(() => editor?.destroy())

describe("links", () => {
  it("finds the whole link around the caret, with its address and ScreenTip", () => {
    make('<p>See <a href="https://example.com" title="Example">the site</a> now.</p>')
    editor.commands.setTextSelection(9)
    expect(linkAtSelection(editor)).toMatchObject({
      href: "https://example.com",
      title: "Example",
      text: "the site",
    })
    editor.commands.setTextSelection(2)
    expect(linkAtSelection(editor)).toBeNull()
  })

  it("links the selection, retypes its text, and takes the link off again", () => {
    make("<p>Read the guide today.</p>")
    applyLink(editor, { from: 6, to: 15 }, { href: "https://example.com/guide", title: "Guide", text: "our guide" })
    expect(editor.getHTML()).toContain(
      '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/guide" title="Guide">our guide</a>',
    )
    editor.commands.setTextSelection(8)
    removeLink(editor)
    expect(editor.getHTML()).toBe("<p>Read our guide today.</p>")
  })

  it("inserts the address itself where nothing is selected and no text is given", () => {
    make("<p>Go .</p>")
    applyLink(editor, { from: 4, to: 4 }, { href: "https://example.com", title: "", text: "" })
    expect(editor.getText()).toBe("Go https://example.com.")
  })

  it("lists the document's top, headings and shown bookmarks, and bookmarks a heading once", () => {
    make(
      '<h1>Intro</h1><p>x</p><h2>Details</h2><p><span data-bookmark="Budget">y</span><span data-bookmark="_Toc1">z</span></p>',
    )
    const places = documentPlaces(editor.state.doc)
    expect(places.map((place) => place.label)).toEqual(["Top of the Document", "Intro", "Details", "Budget"])
    const details = places.find((place) => place.label === "Details")!
    const name = headingTarget(editor, details.pos)!
    expect(name).toMatch(/^_Ref\d{9}$/)
    expect(headingTarget(editor, details.pos)).toBe(name)
  })

  it("writes and reads mail links, and completes a bare address", () => {
    expect(mailtoHref("alex@example.com", "Hello there")).toBe("mailto:alex@example.com?subject=Hello%20there")
    expect(parseMailto("mailto:alex@example.com?subject=Hello%20there")).toEqual({
      address: "alex@example.com",
      subject: "Hello there",
    })
    expect(normalizeAddress("www.example.com")).toBe("http://www.example.com")
    expect(normalizeAddress("alex@example.com")).toBe("mailto:alex@example.com")
    expect(normalizeAddress("https://example.com")).toBe("https://example.com")
    expect(normalizeAddress("notes.docx")).toBe("notes.docx")
  })
})

describe("a link's ScreenTip in Word", () => {
  it("is saved as w:tooltip and read back as the link's title", async () => {
    const { readFileSync } = await import("node:fs")
    const path = await import("node:path")
    const { openDocxBytes, saveDocxBytes } = await import("@/document/docx/io")
    const { openPackage } = await import("@/document/docx/opc")
    const { decodeXml } = await import("@/document/docx/xml")
    const file = path.resolve(process.cwd(), "tests/docx-fixtures/authored/f11_hyperlink_bookmark.docx")
    const opened = await openDocxBytes(new Uint8Array(readFileSync(file)), "f11.docx")
    const link = { type: "link", attrs: { href: "https://example.com", title: "Opens the example site" } }
    const saved = await saveDocxBytes({
      json: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Example", marks: [link] }] }],
      },
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "f11.docx",
    })
    const pkg = await openPackage(saved.bytes, "f11.docx")
    const xml = decodeXml(pkg.parts.find((part) => part.name === "/word/document.xml")!.data)
    expect(xml).toContain('w:tooltip="Opens the example site"')
    const reopened = await openDocxBytes(saved.bytes, "f11.docx")
    expect(reopened.view.html).toContain('title="Opens the example site"')
  })
})
