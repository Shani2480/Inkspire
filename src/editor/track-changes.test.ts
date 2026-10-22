import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { acceptChanges, Deletion, Insertion, listChanges, rejectChanges } from "@/editor/track-changes"

function createTrackEditor(content: string) {
  return new Editor({
    extensions: [StarterKit, Insertion, Deletion],
    content,
  })
}

describe("track changes accept/reject", () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it("accepts an insertion and removes a deletion", () => {
    editor = createTrackEditor(
      '<p>Hello <span data-insertion="" data-id="ins-1" data-author="Me" data-time="t">world</span> <span data-deletion="" data-id="del-1" data-author="Me" data-time="t">gone</span></p>',
    )

    expect(listChanges(editor.state.doc)).toHaveLength(2)
    expect(acceptChanges(editor)).toBe(true)
    expect(listChanges(editor.state.doc)).toHaveLength(0)
    expect(editor.getText()).toContain("world")
    expect(editor.getText()).not.toContain("gone")
  })

  it("rejects an insertion and keeps a deletion as plain text", () => {
    editor = createTrackEditor(
      '<p>Keep <span data-insertion="" data-id="ins-2" data-author="Me" data-time="t">new</span> <span data-deletion="" data-id="del-2" data-author="Me" data-time="t">old</span></p>',
    )

    expect(rejectChanges(editor)).toBe(true)
    expect(listChanges(editor.state.doc)).toHaveLength(0)
    expect(editor.getText()).toContain("old")
    expect(editor.getText()).not.toContain("new")
  })

  it("takes a whole paragraph away with its text when it came or went, keeping the only paragraph", () => {
    editor = createTrackEditor(
      '<p>Stays.</p><p><span data-insertion="" data-id="para" data-author="Me" data-time="t">Whole new paragraph.</span></p><p><span data-deletion="" data-id="old" data-author="Me" data-time="t">Old paragraph.</span></p>',
    )
    expect(rejectChanges(editor, ["para"])).toBe(true)
    expect(editor.getHTML()).toBe(
      '<p>Stays.</p><p><span data-id="old" data-author="Me" data-time="t" data-deletion="" class="track-deletion">Old paragraph.</span></p>',
    )
    expect(acceptChanges(editor)).toBe(true)
    expect(editor.getHTML()).toBe("<p>Stays.</p>")

    editor.destroy()
    editor = createTrackEditor(
      '<p><span data-insertion="" data-id="only" data-author="Me" data-time="t">All of it.</span></p>',
    )
    expect(rejectChanges(editor)).toBe(true)
    expect(editor.getHTML()).toBe("<p></p>")
  })

  it("accepts only the requested change id", () => {
    editor = createTrackEditor(
      '<p><span data-insertion="" data-id="keep" data-author="Me" data-time="t">A</span><span data-insertion="" data-id="drop" data-author="Me" data-time="t">B</span></p>',
    )

    expect(acceptChanges(editor, ["keep"])).toBe(true)
    const remaining = listChanges(editor.state.doc)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe("drop")
    expect(editor.getText()).toContain("AB")
  })
})
