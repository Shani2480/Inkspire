import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { editingAllowed, useReviewStore, type DocumentProtection } from "@/document/review"
import { addComment, listComments } from "@/editor/comments"
import { listChanges } from "@/editor/track-changes"

let editor: Editor
afterEach(() => {
  editor?.destroy()
  useReviewStore.setState({ tracking: false, protection: null })
})

const make = (content: string) => {
  editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  return editor
}

const protect = (protection: Partial<DocumentProtection>) =>
  useReviewStore.setState({ protection: { edit: "readOnly", enforced: true, formatting: false, ...protection } })

describe("Restrict Editing", () => {
  it("stops typing when only comments are allowed, and lets comments through", () => {
    make("<p>Some words here</p>")
    protect({ edit: "comments" })
    editor.commands.setTextSelection({ from: 1, to: 5 })
    editor.commands.insertContent("Other")
    expect(editor.state.doc.textContent).toBe("Some words here")
    expect(addComment(editor, "A note")).toBe(true)
    expect(listComments(editor.state.doc)).toHaveLength(1)
    // A comment on an empty line puts in its zero-width anchor.
    useReviewStore.setState({ protection: null })
    editor.commands.setContent("<p>Text</p><p></p>")
    protect({ edit: "comments" })
    editor.commands.setTextSelection(7)
    expect(addComment(editor, "On an empty line")).toBe(true)
    expect(listComments(editor.state.doc)).toHaveLength(1)
    expect(editor.state.doc.textContent).toBe("Text\u200b")
  })

  it("lets nothing change when read only, and everything once it is not enforced", () => {
    make("<p>Fixed</p>")
    protect({ edit: "readOnly" })
    editor.commands.setTextSelection(1)
    editor.commands.insertContent("Not ")
    expect(editor.state.doc.textContent).toBe("Fixed")
    protect({ edit: "readOnly", enforced: false })
    editor.commands.insertContent("Now ")
    expect(editor.state.doc.textContent).toBe("Now Fixed")
  })

  it("limits formatting to styles: bold is refused, typing is not", () => {
    make("<p>Plain</p>")
    protect({ edit: "none", formatting: true })
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.chain().setBold().run()
    expect(editor.getHTML()).not.toContain("<strong>")
    editor.commands.setTextSelection(6)
    editor.commands.insertContent(" text")
    expect(editor.state.doc.textContent).toBe("Plain text")
  })

  it("tracked changes protection keeps editing on and Track Changes locked", () => {
    make("<p>Draft</p>")
    protect({ edit: "trackedChanges" })
    useReviewStore.getState().setTracking(true)
    useReviewStore.getState().setTracking(false)
    expect(useReviewStore.getState().tracking).toBe(true)
    editor.commands.setTextSelection(6)
    editor.commands.insertContent(" two")
    expect(listChanges(editor.state.doc).map((change) => change.kind)).toEqual(["insertion"])
  })

  it("says what may be changed", () => {
    expect(editingAllowed({ protection: null })).toBe("all")
    expect(editingAllowed({ protection: { edit: "forms", enforced: true, formatting: false } })).toBe("forms")
    expect(editingAllowed({ protection: { edit: "comments", enforced: false, formatting: false } })).toBe("all")
    expect(editingAllowed({ protection: { edit: "none", enforced: true, formatting: true } })).toBe("all")
  })
})
