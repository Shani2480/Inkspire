import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { DOCUMENT_TEMPLATES, TEMPLATE_CATEGORIES, filterTemplates } from "@/document/templates"
import { PRO_TEMPLATES } from "@/document/templates-pro"
import { createExtensions } from "@/editor/extensions"

const KINDS = ["resume", "report", "invoice", "flyer", "newsletter"]

describe("designed templates", () => {
  it("has three styles of each of the five kinds, with unique ids", () => {
    for (const kind of KINDS) {
      expect(PRO_TEMPLATES.filter((item) => item.id.startsWith(`${kind}-`))).toHaveLength(3)
    }
    const ids = DOCUMENT_TEMPLATES.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("is found under its category", () => {
    expect(TEMPLATE_CATEGORIES.some((category) => category.id === "newsletters")).toBe(true)
    expect(filterTemplates("newsletters", "").filter((item) => item.id.startsWith("newsletter-"))).toHaveLength(3)
    expect(filterTemplates("personal", "").filter((item) => item.id.startsWith("resume-"))).toHaveLength(3)
  })

  for (const template of PRO_TEMPLATES) {
    it(`${template.id} keeps its design through Save as .docx and Open`, async () => {
      const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
      const editor = new Editor({ extensions, content: template.html })
      try {
        const html = editor.getHTML()
        expect(html).toMatch(/background-color|--cell-border/)
        expect(html).toContain("font-size")
        const saved = await saveDocxBytes({
          json: editor.getJSON(),
          chrome: emptyChrome(),
          word: null,
          unchanged: false,
          fileName: `${template.id}.docx`,
        })
        const reopened = await openDocxBytes(saved.bytes, `${template.id}.docx`)
        expect(reopened.view.html).toContain("<table")
        expect(reopened.view.html).toContain("font-size")
        if (html.includes("background-color")) {
          expect(reopened.view.html).toMatch(/background-color/)
        }
        const text = (value: string) => new DOMParser().parseFromString(value, "text/html").body.textContent ?? ""
        expect(text(reopened.view.html).replace(/\s+/g, "")).toContain(text(html).replace(/\s+/g, "").slice(0, 40))
      } finally {
        editor.destroy()
      }
    })
  }
})
