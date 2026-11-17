import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { formatSequence, parseInstruction, wordBookmarkName } from "@/document/field-instructions"
import { collectBookmarks } from "@/editor/word-field"
import {
  captionsOf,
  insertCaption,
  insertCrossReference,
  nextCaptionNumber,
  headingsOf,
  bookmarksOf,
} from "@/editor/captions"

let editor: Editor
afterEach(() => editor?.destroy())

const make = (content: string) => {
  editor = new Editor({ extensions: createExtensions(), content })
  return editor
}

const caretIn = (text: string, offset = 0) => {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) {
      at = pos + node.text!.indexOf(text) + offset
    }
  })
  editor.commands.setTextSelection(at)
}

const paragraphs = () => {
  const out: string[] = []
  editor.state.doc.descendants((node) => {
    if (node.isTextblock) {
      out.push(node.textContent)
      return false
    }
    return true
  })
  return out
}

async function saveXml() {
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

const caption = (label = "Figure", text = ": A chart") =>
  insertCaption(editor, { label, text, position: "below", excludeLabel: false, format: "ARABIC" })

describe("field instructions", () => {
  it("parse switches and format numbers", () => {
    const parsed = parseInstruction(" SEQ Figure \\* ROMAN \\r 3 \\h ")
    expect(parsed.kind).toBe("SEQ")
    expect(parsed.argument).toBe("Figure")
    expect(parsed.switches.get("*")).toBe("ROMAN")
    expect(parsed.switches.get("r")).toBe("3")
    expect(parsed.switches.has("h")).toBe(true)
    expect([1, 4, 9, 27].map((value) => formatSequence(value, "ROMAN"))).toEqual(["I", "IV", "IX", "XXVII"])
    expect([1, 26, 27].map((value) => formatSequence(value, "alphabetic"))).toEqual(["a", "z", "aa"])
    expect(wordBookmarkName("my place 2")).toBe("my_place_2")
    expect(wordBookmarkName("2nd")).toBe("B2nd")
  })
})

describe("Insert Caption", () => {
  it("numbers captions in document order and renumbers when one is added before", () => {
    make("<p>first</p><p>second</p>")
    caretIn("second")
    caption("Figure", ": Second")
    caretIn("first")
    caption("Figure", ": First")
    expect(paragraphs()).toEqual(["first", "Figure 1: First", "second", "Figure 2: Second"])
    expect(editor.state.doc.child(1).attrs.namedStyle).toBe("caption")
    expect(nextCaptionNumber(editor.state.doc, "Figure", editor.state.doc.content.size)).toBe(3)
    caretIn("first")
    caption("Table", "")
    expect(paragraphs()[1]).toBe("Table 1")
  })

  it("can leave the label out and number in other formats", () => {
    make("<p>x</p>")
    caretIn("x")
    insertCaption(editor, {
      label: "Figure",
      text: " Map",
      position: "below",
      excludeLabel: true,
      format: "ALPHABETIC",
    })
    expect(paragraphs()[1]).toBe("A Map")
  })

  it("goes above or below a selected table", () => {
    make("<table><tr><td><p>cell</p></td></tr></table>")
    caretIn("cell")
    insertCaption(editor, { label: "Table", text: "", position: "above", excludeLabel: false, format: "ARABIC" })
    expect(editor.state.doc.child(0).type.name).toBe("paragraph")
    expect(editor.state.doc.child(1).type.name).toBe("table")
  })
})

describe("Cross-reference", () => {
  it("refers to a caption's label and number, its text and its place, and follows renumbering", () => {
    make("<p>intro</p><p>body</p><p>see it</p>")
    caretIn("body")
    caption("Figure", ": Sales")
    const target = captionsOf(editor.state.doc, "Figure")[0]!
    expect(target.text).toBe("Figure 1: Sales")
    caretIn("see it", 4)
    const ref = { type: "Figure", item: String(target.pos), hyperlink: true, includeAboveBelow: false }
    insertCrossReference(editor, { ...ref, to: "labelNumber" })
    editor.commands.insertContent(" / ")
    insertCrossReference(editor, {
      ...ref,
      item: String(captionsOf(editor.state.doc, "Figure")[0]!.pos),
      to: "captionText",
    })
    editor.commands.insertContent(" / ")
    insertCrossReference(editor, {
      ...ref,
      item: String(captionsOf(editor.state.doc, "Figure")[0]!.pos),
      to: "aboveBelow",
    })
    expect(paragraphs().at(-1)).toBe("see Figure 1 / Sales / aboveit")
    // A new figure before it: the caption and the reference both become Figure 2.
    caretIn("intro")
    caption("Figure", ": Earlier")
    expect(paragraphs()).toContain("Figure 2: Sales")
    expect(paragraphs().at(-1)).toBe("see Figure 2 / Sales / aboveit")
  })

  it("refers to headings and bookmarks", () => {
    make("<h2>Results</h2><p>text</p>")
    caretIn("text")
    editor.commands.setTextSelection({ from: editor.state.selection.from, to: editor.state.selection.from + 4 })
    editor.chain().insertBookmark("Spot").run()
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    expect(bookmarksOf(editor.state.doc).map((item) => item.text)).toEqual(["Spot"])
    const heading = headingsOf(editor.state.doc)[0]!
    insertCrossReference(editor, {
      type: "Heading",
      item: String(heading.pos),
      to: "text",
      hyperlink: false,
      includeAboveBelow: true,
    })
    editor.commands.insertContent(" ")
    insertCrossReference(editor, {
      type: "Bookmark",
      item: "Spot",
      to: "text",
      hyperlink: false,
      includeAboveBelow: false,
    })
    expect(paragraphs().at(-1)).toBe("textResults above text")
    expect(collectBookmarks(editor.state.doc).get("Spot")?.text).toBe("text")
  })
})

describe("fields and bookmarks in .docx", () => {
  it("saves captions and references as Word fields and bookmarks, and reads them back", async () => {
    make("<p>body</p><p>see it</p>")
    caretIn("body")
    caption("Figure", ": Sales")
    caretIn("see it", 4)
    const pos = captionsOf(editor.state.doc, "Figure")[0]!.pos
    insertCrossReference(editor, {
      type: "Figure",
      item: String(pos),
      to: "labelNumber",
      hyperlink: true,
      includeAboveBelow: false,
    })
    const { bytes, xml } = await saveXml()
    expect(xml).toContain('w:instr=" SEQ Figure \\* ARABIC "')
    expect(xml).toMatch(/<w:bookmarkStart w:id="\d+" w:name="_Ref\d+"\/>/)
    expect(xml).toMatch(/w:instr=" REF _Ref\d+ \\h "/)
    expect(xml).toContain('<w:pStyle w:val="Caption"/>')
    const opened = await openDocxBytes(bytes, "f.docx")
    editor.destroy()
    editor = new Editor({ extensions: createExtensions(), content: opened.view.html })
    expect(paragraphs()).toEqual(["body", "Figure 1: Sales", "see Figure 1it"])
    let fields = 0
    editor.state.doc.descendants((node) => {
      fields += node.type.name === "wordField" ? 1 : 0
    })
    expect(fields).toBe(2)
    // Opened and saved untouched: the fields go back as they were read.
    const again = await saveXml()
    expect(again.xml).toContain('w:instr=" SEQ Figure \\* ARABIC "')
  })
})
