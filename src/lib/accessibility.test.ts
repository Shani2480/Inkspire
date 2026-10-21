import { createExtensions } from "@/editor/extensions"
import { checkAccessibility, isWeakAlt, listAccessibilityIssues, readableColor } from "@/lib/accessibility"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"

function editorOf(html: string) {
  return new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content: html })
}

const kinds = (html: string) => checkAccessibility(editorOf(html)).map((issue) => issue.kind)

describe("accessibility rules", () => {
  it("flags pictures with no, file-name or generic alt text", () => {
    expect(kinds('<p>a <img src="data:image/png;base64,AA=="></p>')).toContain("missing-alt")
    expect(kinds('<p><img src="data:image/png;base64,AA==" alt="red.png"></p>')).toContain("weak-alt")
    expect(kinds('<p><img src="data:image/png;base64,AA==" alt="A red kite over a beach"></p>')).toEqual([])
    expect(isWeakAlt("Screenshot 2024")).toBe(true)
    expect(isWeakAlt("A graph of sales")).toBe(false)
  })

  it("flags empty headings and skipped levels, and fixes the level", () => {
    const issues = checkAccessibility(editorOf("<h1>Title</h1><h3>Deep</h3><h2></h2>"))
    expect(issues.map((issue) => issue.kind)).toEqual(["heading-skip", "empty-heading"])
    expect(issues[0]!.fix).toEqual({ type: "heading-level", level: 2 })
  })

  it("flags generic link text", () => {
    expect(
      kinds('<p><a href="https://a.com">click here</a> and <a href="https://a.com">Pricing plans</a></p>'),
    ).toEqual(["link-text"])
    expect(kinds('<p><a href="https://a.com">https://a.com</a></p>')).toEqual(["link-text"])
  })

  it("flags a table without a header row or alt text", () => {
    expect(kinds("<table><tr><td>a</td></tr></table>")).toEqual(["table-header", "table-alt"])
  })

  it("flags low contrast text and proposes a readable colour", () => {
    const issues = checkAccessibility(editorOf('<p><span style="color: #dddddd">pale</span></p>'))
    expect(issues.map((issue) => issue.kind)).toEqual(["contrast"])
    expect(issues[0]!.fix?.type).toBe("color")
    expect(readableColor("#dddddd", "#ffffff")).not.toBe("#dddddd")
    expect(kinds('<p><span style="color: #222222">dark</span></p>')).toEqual([])
  })

  it("flags runs of empty paragraphs but not one", () => {
    expect(kinds("<p>a</p><p></p><p>b</p>")).toEqual([])
    expect(kinds("<p>a</p><p></p><p></p><p></p><p>b</p>")).toEqual(["empty-paragraphs"])
  })

  it("keeps the plain list for the status bar", () => {
    expect(listAccessibilityIssues(editorOf("<h2></h2>"))).toEqual(["Heading 2 is empty."])
  })
})
