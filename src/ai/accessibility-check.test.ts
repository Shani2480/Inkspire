import { accessibilityItems, parseSuggestions } from "@/ai/accessibility-check"
import { createExtensions } from "@/editor/extensions"
import { checkAccessibility } from "@/lib/accessibility"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"

const items = [
  { id: "a", kind: "alt" as const, context: "{}" },
  { id: "t", kind: "table" as const, context: "{}" },
]

describe("AI accessibility suggestions", () => {
  it("keeps only the ids that were asked about, with clamped text", () => {
    const raw =
      '```json\n[{"id":"a","text":"A red kite"},{"id":"zzz","text":"x"},{"id":"t","title":"Sales","text":"Quarterly sales"},{"id":"a2"}]\n```'
    expect(parseSuggestions(raw, items)).toEqual({
      a: { text: "A red kite" },
      t: { text: "Quarterly sales", title: "Sales" },
    })
    expect(parseSuggestions("not json", items)).toEqual({})
    expect(parseSuggestions(JSON.stringify([{ id: "a", text: "x".repeat(500) }]), items).a!.text).toHaveLength(150)
  })

  it("describes each picture, link and table with the text around it", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((e) => e.name !== "spellcheck"),
      content:
        '<h2>Results</h2><p>Sales grew <img src="data:image/png;base64,AA=="> a lot, <a href="https://a.com/q3">click here</a> now.</p><table><tr><td>Q1</td><td>5</td></tr></table>',
    })
    const found = accessibilityItems(editor, checkAccessibility(editor))
    expect(found.map((item) => item.kind).sort()).toEqual(["alt", "link", "table"])
    const link = JSON.parse(found.find((item) => item.kind === "link")!.context)
    expect(link.address).toBe("https://a.com/q3")
    expect(JSON.parse(found.find((item) => item.kind === "alt")!.context).section).toBe("Results")
  })
})
