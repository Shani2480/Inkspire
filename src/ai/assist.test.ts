import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let unavailable: string | null = null
const generate = vi.fn()
vi.mock("@/ai/availability", () => ({ aiUnavailableReason: async () => unavailable }))
vi.mock("@/ai/generate", () => ({
  generateAiText: (...args: unknown[]) => generate(...args),
  isAiCancelled: () => false,
}))

import {
  applyCorrection,
  assistIntent,
  findCorrection,
  parseReview,
  rangeText,
  requestReview,
  reviewStatus,
} from "@/ai/assist"
import { useDocumentStore } from "@/document/store"

describe("what a question about the selection wants", () => {
  it.each([
    ["is this sentence correct", "check"],
    ["Is this grammatically correct?", "check"],
    ["are there any errors here?", "check"],
    ["does this sound right?", "check"],
    ["check the grammar", "check"],
    ["Check this", "check"],
    ["spell check", "check"],
    ["proofread this", "proofread"],
    ["Proof-read the paragraph", "proofread"],
    ["fix the grammar", "proofread"],
    ["Fix spelling and grammar", "proofread"],
    ["correct this sentence", "proofread"],
    ["correct the typos", "proofread"],
    ["make it shorter", "other"],
    ["rewrite this more formally", "other"],
    ["what does this mean?", "other"],
    ["", "other"],
  ])("reads %j as %s", (prompt, intent) => {
    expect(assistIntent(prompt)).toBe(intent)
  })
})

describe("the model's verdict", () => {
  const source = "He go to school. i like it."

  it("takes the fixes from the JSON object, dropping ones not in the text", () => {
    const review = parseReview(
      '```json\n{"ok": false, "issues": [{"text": "He go", "suggestion": "He goes", "reason": "Agreement"}, {"text": "nope", "suggestion": "no", "reason": ""}, {"text": "like", "suggestion": "like", "reason": "same"}]}\n```',
      source,
    )
    expect(review.ok).toBe(false)
    expect(review.corrections).toEqual([{ text: "He go", suggestion: "He goes", reason: "Agreement", at: 0 }])
  })

  it("accepts a bare array, keeps a fix about spaces alone, and reads a prose reply for its verdict", () => {
    expect(parseReview('[{"text": "i like", "suggestion": "I like"}]', source).corrections).toHaveLength(1)
    expect(
      parseReview('[{"text": "  ", "suggestion": " "}, {"text": " it", "suggestion": ""}]', "a  b it").corrections,
    ).toEqual([
      { text: "  ", suggestion: " ", reason: "", at: 1 },
      { text: " it", suggestion: "", reason: "", at: 4 },
    ])
    expect(parseReview("The sentence is correct.", source)).toEqual({ ok: true, corrections: [] })
    expect(parseReview("There is a mistake.", source).ok).toBe(false)
  })

  it("is worded for one sentence or several, one error or more", () => {
    const one = { text: "He go", suggestion: "He goes", reason: "Agreement" }
    const spelt = { text: "scool", suggestion: "school", reason: "Spelling" }
    expect(reviewStatus({ ok: true, corrections: [], note: "" }, "He goes.")).toBe("The sentence is fine.")
    expect(reviewStatus({ ok: true, corrections: [], note: "" }, "He goes. She stays.")).toBe("The text is fine.")
    expect(reviewStatus({ ok: false, corrections: [one], note: "" }, "He go.")).toBe(
      "There is a grammatical error in the sentence.",
    )
    expect(reviewStatus({ ok: false, corrections: [one, spelt], note: "" }, "He go.")).toBe(
      "There are some grammatical errors in the sentence.",
    )
    expect(reviewStatus({ ok: false, corrections: [spelt], note: "" }, "A scool. Yes.")).toBe(
      "There is a spelling error in the text.",
    )
  })
})

describe("the review request", () => {
  beforeEach(() => {
    generate.mockReset()
    useDocumentStore.setState((state) => ({ pageSetup: { ...state.pageSetup, language: "en-US" } }))
  })

  it("asks the model and reads its JSON", async () => {
    unavailable = null
    generate.mockResolvedValueOnce('{"ok": false, "issues": [{"text": "He go", "suggestion": "He goes"}]}')
    const review = await requestReview("He go to school.", "r1")
    expect(review).toMatchObject({ ok: false, note: "" })
    expect(review.corrections[0]).toMatchObject({ text: "He go", suggestion: "He goes" })
    expect(generate).toHaveBeenCalledWith(
      expect.stringContaining("Proofread this American English text"),
      "He go to school.",
      expect.objectContaining({ quiet: true, requestId: "r1" }),
    )
  })

  it("falls back to the built-in rules when the AI cannot be reached, and says so", async () => {
    unavailable = "Open the desktop app to use AI."
    const review = await requestReview("i  went home", "r2")
    expect(generate).not.toHaveBeenCalled()
    expect(review.note).toBe("Open the desktop app to use AI. Checked with the built-in rules instead.")
    expect(review.corrections.map((item) => `${item.text}>${item.suggestion}`)).toEqual(["i>I", "  > "])
    unavailable = null
  })
})

describe("putting a fix in the document", () => {
  let editor: Editor | null = null

  function createEditor(content: object) {
    editor = new Editor({ extensions: [StarterKit], content })
    return editor
  }

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it("maps the checked text to positions, across runs and paragraphs", () => {
    const ed = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "He " },
            { type: "text", text: "go", marks: [{ type: "bold" }] },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "i like it." }] },
      ],
    })
    const whole = rangeText(ed.state.doc, 0, ed.state.doc.content.size)
    expect(whole.text).toBe("He go\ni like it.")
    expect(whole.map[0]).toBe(1)
    expect(whole.map[3]).toBe(4)
    expect(whole.map[6]).toBe(8)
    const range = { from: 0, to: ed.state.doc.content.size, text: whole.text }
    expect(findCorrection(ed.state.doc, range, { text: "go", suggestion: "goes", reason: "" })).toEqual({
      offset: 3,
      from: 4,
      to: 6,
    })
    expect(findCorrection(ed.state.doc, range, { text: "go\ni", suggestion: "go. I", reason: "" })).toBeNull()
    expect(findCorrection(ed.state.doc, range, { text: "went", suggestion: "go", reason: "" })).toBeNull()
  })

  it("replaces the text, keeps its marks, and moves the range's end for the next fix", () => {
    const ed = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "He " },
            { type: "text", text: "go", marks: [{ type: "bold" }] },
            { type: "text", text: " to school. i like it." },
          ],
        },
      ],
    })
    let range = { from: 1, to: ed.state.doc.content.size - 1, text: "He go to school. i like it." }
    const next = applyCorrection(ed, range, { text: "go", suggestion: "goes", reason: "" })
    expect(next).toEqual({ range: { ...range, to: range.to + 2 }, offset: 3, delta: 2 })
    expect(ed.getHTML()).toBe("<p>He <strong>goes</strong> to school. i like it.</p>")
    range = next!.range
    expect(applyCorrection(ed, range, { text: "i like", suggestion: "I like", reason: "" })).toBeTruthy()
    expect(ed.getText()).toBe("He goes to school. I like it.")
    expect(ed.state.selection.from).toBe(20)
    // The same fix a second time finds nothing left to fix.
    expect(applyCorrection(ed, range, { text: "go ", suggestion: "goes ", reason: "" })).toBeNull()
  })

  it("fixes a short text where it was flagged, not at its first match", () => {
    const text = "Then i went home,and  stayed there. It was a honest mistake."
    const ed = createEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
    const range = { from: 0, to: ed.state.doc.content.size, text }
    expect(findCorrection(ed.state.doc, range, { text: "a", suggestion: "an", reason: "", at: 43 })).toEqual({
      offset: 43,
      from: 44,
      to: 45,
    })
    expect(applyCorrection(ed, range, { text: "a", suggestion: "an", reason: "", at: 43 })?.delta).toBe(1)
    expect(ed.getText()).toBe("Then i went home,and  stayed there. It was an honest mistake.")
  })
})
