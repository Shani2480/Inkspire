import { createExtensions } from "@/editor/extensions"
import { useDocumentStore } from "@/document/store"
import { Editor } from "@tiptap/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let unavailable: string | null = null
const generate = vi.fn()
vi.mock("@/ai/availability", () => ({ aiUnavailableReason: async () => unavailable }))
vi.mock("@/ai/generate", () => ({
  generateAiText: (...args: unknown[]) => generate(...args),
  isAiCancelled: () => false,
}))

import { coverHtml, insertGeneratedCover, parseCoverText, plainCover, requestCoverText } from "@/ai/cover-page"

const brief = { title: "quarterly report", subtitle: "", tone: "Formal" }

describe("the cover the model writes", () => {
  beforeEach(() => {
    generate.mockReset()
    useDocumentStore.setState((state) => ({ documentProps: { ...state.documentProps, author: "Ada" } }))
  })

  it("reads the JSON object, cleaning each line and falling back to the brief", () => {
    const cover = parseCoverText(
      '```json\n{"title": "  Quarterly\\n Report ", "subtitle": "", "tagline": "Results for Q3", "byline": 7}\n```',
      brief,
    )
    expect(cover).toMatchObject({ title: "Quarterly Report", subtitle: "", tagline: "Results for Q3" })
    expect(cover?.byline).toMatch(/^Ada · /)
    expect(parseCoverText("Sorry, no.", brief)).toBeNull()
  })

  it("asks the model with the brief, the author and the opening text", async () => {
    unavailable = null
    generate.mockResolvedValueOnce(
      '{"title": "Quarterly Report", "subtitle": "Q3 results", "tagline": "", "byline": "Ada"}',
    )
    const result = await requestCoverText(brief, null, "c1")
    expect(result).toEqual({
      blocked: null,
      cover: { title: "Quarterly Report", subtitle: "Q3 results", tagline: "", byline: "Ada" },
    })
    const context = JSON.parse(generate.mock.calls[0][1] as string) as Record<string, string>
    expect(context).toMatchObject({ title: "quarterly report", tone: "Formal", author: "Ada" })
    expect(generate.mock.calls[0][2]).toMatchObject({ plain: true, quiet: true, requestId: "c1" })
  })

  it("gives the plain cover and the reason when the AI cannot be reached", async () => {
    unavailable = "Open the desktop app to use AI."
    const result = await requestCoverText(brief, null, "c2")
    expect(result.blocked).toBe("Open the desktop app to use AI.")
    expect(result.cover).toEqual(plainCover(brief))
    expect(generate).not.toHaveBeenCalled()
    unavailable = null
  })
})

describe("the cover in the document", () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it("is a Title, a Subtitle, a rule, the lines and a page break, escaped", () => {
    expect(coverHtml({ title: "A & B", subtitle: "Sub", tagline: "Tag <1>", byline: "Ada" })).toBe(
      '<p data-style="title" style="text-align: center">A &amp; B</p>' +
        '<p data-style="subtitle" style="text-align: center">Sub</p><hr>' +
        '<p style="text-align: center">Tag &lt;1&gt;</p><p style="text-align: center">Ada</p><div data-page-break></div>',
    )
  })

  it("goes to the front of the document in place of a gallery cover page", () => {
    editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: "<p>Body text.</p>",
    })
    editor.commands.insertCoverPage("sideline")
    expect(editor.state.doc.firstChild?.type.name).toBe("coverPage")
    insertGeneratedCover(editor, { title: "Report", subtitle: "Q3", tagline: "", byline: "Ada" })
    const blocks: string[] = []
    editor.state.doc.forEach((node) =>
      blocks.push(`${node.type.name}:${node.attrs.namedStyle ?? ""}:${node.textContent}`),
    )
    expect(blocks).toEqual([
      "paragraph:title:Report",
      "paragraph:subtitle:Q3",
      "horizontalRule::",
      "paragraph::Ada",
      "pageBreak::",
      "paragraph::Body text.",
    ])
    expect(editor.state.doc.firstChild?.attrs.textAlign).toBe("center")
  })
})
