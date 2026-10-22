import { createExtensions } from "@/editor/extensions"
import { acceptChanges, listChanges, rejectChanges } from "@/editor/track-changes"
import { useReviewStore } from "@/document/review"
import { align, changeCounts, compareDocs, compareInto, parseHtml, tokens } from "@/document/compare"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"

describe("lining two texts up", () => {
  it("splits words, spaces and punctuation", () => {
    expect(tokens("The quick, brown fox.")).toEqual(["The", " ", "quick", ",", " ", "brown", " ", "fox", "."])
    expect(tokens("")).toEqual([])
  })

  it("keeps what both have and marks what went and came", () => {
    const steps = align(["a", "b", "c", "d"], ["a", "c", "x", "d"], (left, right) => left === right)
    expect(steps.map((step) => step.op)).toEqual(["same", "del", "same", "ins", "same"])
  })
})

describe("comparing two documents", () => {
  let editor: Editor | null = null

  function createEditor(html: string) {
    editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: html,
    })
    return editor
  }

  afterEach(() => {
    editor?.destroy()
    editor = null
    useReviewStore.setState({ panel: false, markup: "simple" })
  })

  const original = "<p>The quick brown fox.</p><p>Second paragraph.</p>"
  const revised = "<p>The slow brown fox jumps.</p><p>Second paragraph.</p><p>Third.</p>"

  it("marks the words that changed and the paragraphs that came, in the revised text", () => {
    const ed = createEditor(original)
    const result = compareDocs(ed.state.doc, parseHtml(ed.schema, revised), "Compared")
    expect(result.doc.textContent).toBe("The quickslow brown fox jumps.Second paragraph.Third.")
    expect(result.changes).toEqual([
      { kind: "deletion", text: "quick" },
      { kind: "insertion", text: "slow" },
      { kind: "insertion", text: " jumps" },
      { kind: "insertion", text: "Third." },
    ])
    expect(changeCounts(result.changes)).toEqual({ insertions: 3, deletions: 1 })
  })

  it("keeps a picture inside a paragraph that changed around it", () => {
    const ed = createEditor('<p>Before <img src="data:image/gif;base64,R0lGOD" alt="x"> after.</p>')
    const other = parseHtml(ed.schema, '<p>Before <img src="data:image/gif;base64,R0lGOD" alt="x"> afterwards.</p>')
    const result = compareDocs(ed.state.doc, other, "Compared")
    let pictures = 0
    result.doc.descendants((node) => {
      if (node.type.name === "image") {
        pictures += 1
      }
    })
    expect(pictures).toBe(1)
    expect(result.changes).toEqual([
      { kind: "deletion", text: "after" },
      { kind: "insertion", text: "afterwards" },
    ])
  })

  it("shows a paragraph replaced by an unrelated one as one that went and one that came", () => {
    const ed = createEditor("<p>Removed paragraph.</p>")
    const result = compareDocs(ed.state.doc, parseHtml(ed.schema, "<p>A third paragraph was added.</p>"), "Compared")
    expect(result.changes).toEqual([
      { kind: "deletion", text: "Removed paragraph." },
      { kind: "insertion", text: "A third paragraph was added." },
    ])
    expect(result.doc.childCount).toBe(2)
  })

  it("writes the comparison into the document as tracked changes to accept or reject", () => {
    const ed = createEditor(original)
    const changes = compareInto(ed, revised, { author: "Compared with b.docx", thisDocument: "original" })
    expect(changes).toHaveLength(4)
    expect(listChanges(ed.state.doc).every((change) => change.author === "Compared with b.docx")).toBe(true)
    expect(useReviewStore.getState().panel).toBe(true)
    expect(useReviewStore.getState().markup).toBe("all")
    acceptChanges(ed)
    expect(ed.getText()).toBe("The slow brown fox jumps.\n\nSecond paragraph.\n\nThird.")
    // Undo brings the document back as it was before the comparison in one step.
    ed.commands.undo()
    ed.commands.undo()
    expect(ed.getText()).toBe("The quick brown fox.\n\nSecond paragraph.")
  })

  it("rejecting everything gives the original back, whichever side this document was", () => {
    const ed = createEditor(revised)
    compareInto(ed, original, { author: "Compared", thisDocument: "revised" })
    rejectChanges(ed)
    expect(ed.getText()).toBe("The quick brown fox.\n\nSecond paragraph.")
  })
})
