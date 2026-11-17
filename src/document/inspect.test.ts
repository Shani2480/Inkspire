import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { TextStyle } from "@tiptap/extension-text-style"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { inspectDocument, removeInspected } from "@/document/inspect"
import { useDocumentStore } from "@/document/store"
import { CharacterStyle } from "@/editor/character-format"
import { Comment } from "@/editor/comments"
import { Deletion, Insertion } from "@/editor/track-changes"

const CONTENT =
  '<p>Intro <span data-comment-id="c1" data-author="Alex" data-comment="Check">this</span> text.</p>' +
  '<p>Kept <span data-insertion="" data-id="i1" data-author="Alex" data-time="t">new</span>' +
  '<span data-deletion="" data-id="d1" data-author="Alex" data-time="t">old</span> words.</p>' +
  '<p>Seen <span class="text-hidden" style="font-weight: normal">secret note</span> after.</p>'

let editor: Editor
const store = useDocumentStore.getState()

beforeEach(() => {
  editor = new Editor({
    extensions: [StarterKit, TextStyle, CharacterStyle, Comment, Insertion, Deletion],
    content: CONTENT,
  })
  store.setDocumentProps({
    title: "Draft",
    author: "Alex Demo",
    company: "",
    subject: "",
    tags: "",
    comments: "",
    category: "",
  })
  store.setHeader("<p>Confidential</p>")
  store.setFooter("<p></p>")
})
afterEach(() => {
  editor.destroy()
})

const found = (kind: string) => inspectDocument(editor as never).find((item) => item.kind === kind)!.found

describe("the Document Inspector", () => {
  it("finds comments, tracked changes, properties, headers and hidden text, and changes nothing", () => {
    const before = editor.getHTML()
    expect(found("comments")).toEqual(["1 comment", "2 tracked changes"])
    expect(found("properties")).toEqual(["Title", "Author"])
    expect(found("headers")).toEqual(["Header"])
    expect(found("hidden")).toEqual(["1 passage of hidden text"])
    // Inspecting used to strip every mark; now it only reads.
    expect(editor.getHTML()).toBe(before)
  })

  it("removes one kind at a time, keeping the rest of the document's formatting", () => {
    removeInspected(editor as never, "comments")
    expect(found("comments")).toEqual([])
    // The tracked changes are accepted: the inserted word stays, the deleted one goes.
    expect(editor.getText()).toContain("Kept new words.")
    expect(editor.getText()).not.toContain("old")
    expect(found("hidden")).toHaveLength(1)

    removeInspected(editor as never, "hidden")
    expect(editor.getText()).toContain("Seen  after.")
    expect(found("hidden")).toEqual([])

    removeInspected(editor as never, "properties")
    expect(found("properties")).toEqual([])
    removeInspected(editor as never, "headers")
    expect(found("headers")).toEqual([])
    expect(useDocumentStore.getState().headerHtml).toBe("")
  })

  it("counts a header with a page number, not an empty paragraph", () => {
    store.setHeader("<p></p>")
    store.setFooter('<p><span data-page-field="page">1</span></p>')
    expect(found("headers")).toEqual(["Footer"])
  })
})
