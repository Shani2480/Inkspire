import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { anchorParagraphs, anyMarkShown, formattingMarkClasses } from "@/editor/formatting-marks"
import { createExtensions } from "@/editor/extensions"

const none = {
  marksTabs: false,
  marksSpaces: false,
  marksParagraph: false,
  marksHidden: false,
  marksHyphens: false,
  marksAnchors: false,
}

describe("per-mark formatting marks (22.9)", () => {
  it("show nothing until a mark is chosen or Show/Hide ¶ is on", () => {
    expect(anyMarkShown(false, none)).toBe(false)
    expect(formattingMarkClasses(false, none)).toBe("")
    expect(anyMarkShown(false, { ...none, marksSpaces: true })).toBe(true)
    expect(anyMarkShown(true, none)).toBe(true)
  })

  it("give one class for each mark chosen on its own", () => {
    expect(formattingMarkClasses(false, { ...none, marksTabs: true, marksHyphens: true })).toBe("fm-tabs fm-hyphens")
    expect(formattingMarkClasses(false, { ...none, marksParagraph: true, marksHidden: true })).toBe(
      "fm-paras fm-hidden",
    )
  })

  it("Show/Hide ¶ shows all of them with the one class", () => {
    expect(formattingMarkClasses(true, { ...none, marksTabs: true })).toBe("formatting-marks")
    expect(formattingMarkClasses(false, { ...none, marksAnchors: true })).toBe("fm-anchors")
  })
})

describe("object anchors (22.19)", () => {
  it("mark the paragraph after a floating object, not after one in line with the text", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: '<p>Intro</p><p><img src="a.png" width="40" height="20"></p><p>Anchor</p><p>After</p>',
    })
    expect(anchorParagraphs(editor.state.doc)).toEqual([])
    let picture = -1
    editor.state.doc.descendants((node, pos) => {
      if (picture < 0 && typeof node.attrs.wrap === "string") {
        picture = pos
      }
    })
    expect(picture).toBeGreaterThan(-1)
    editor.commands.setNodeSelection(picture)
    editor.commands.setObjectWrap("square")
    const anchors = anchorParagraphs(editor.state.doc)
    expect(anchors).toHaveLength(1)
    expect(editor.state.doc.nodeAt(anchors[0].from)?.textContent).toBe("Anchor")
    editor.destroy()
  })
})
