import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { findMatches, findTextRanges, replaceTextRanges, soundex, wildcardPattern, wordForms } from "@/editor/find"

let editor: Editor
const make = (content: string) => {
  editor = new Editor({ extensions: [StarterKit], content })
  return editor
}
afterEach(() => editor?.destroy())

const texts = (query: string, options = {}) => findMatches(editor.state.doc, query, options).map((match) => match.text)

describe("Find", () => {
  it("finds a word across formatting changes and maps it back to the document", () => {
    make("<p>A <strong>bo</strong>ld move.</p>")
    const [match] = findTextRanges(editor, "bold")
    expect(editor.state.doc.textBetween(match!.from, match!.to)).toBe("bold")
  })

  it("matches case, whole words, prefixes and suffixes", () => {
    make("<p>Cat cat concat category CATS</p>")
    expect(texts("cat")).toEqual(["Cat", "cat", "cat", "cat", "CAT"])
    expect(texts("cat", { matchCase: true })).toEqual(["cat", "cat", "cat"])
    expect(texts("cat", { wholeWord: true })).toEqual(["Cat", "cat"])
    expect(texts("cat", { prefix: true })).toEqual(["Cat", "cat", "cat", "CAT"])
    expect(texts("cat", { suffix: true })).toEqual(["Cat", "cat", "cat"])
  })

  it("ignores punctuation and white space when asked", () => {
    make("<p>e-mail and e mail and email</p>")
    expect(texts("email", { ignorePunctuation: true })).toEqual(["e-mail", "email"])
    expect(texts("email", { ignoreSpace: true })).toEqual(["e mail", "email"])
  })

  it("finds Word's wildcards", () => {
    make("<p>sat set sit soot 2024 2025 color colour</p>")
    expect(texts("s?t", { wildcards: true })).toEqual(["sat", "set", "sit"])
    expect(texts("<s*t>", { wildcards: true })).toEqual(["sat", "set", "sit", "soot"])
    expect(texts("[0-9]{4}", { wildcards: true })).toEqual(["2024", "2025"])
    expect(texts("colo[!r]@r", { wildcards: true })).toEqual(["colour"])
    expect(wildcardPattern("a\\?")).toBe("a\\?")
  })

  it("finds words that sound alike and every form of a word", () => {
    make("<p>Smith met Smyth. She writes, wrote and is writing; tries and tried.</p>")
    expect(texts("Smith", { soundsLike: true })).toEqual(["Smith", "Smyth"])
    expect(texts("write", { wordForms: true })).toEqual(["writes", "wrote", "writing"])
    expect(texts("try", { wordForms: true })).toEqual(["tries", "tried"])
    expect(soundex("Robert")).toBe(soundex("Rupert"))
    expect(wordForms("stop")).toContain("stopped")
  })

  it("finds Word's special characters, a paragraph mark between paragraphs", () => {
    make("<p>One</p><p>Two 42</p>")
    expect(texts("One^pTwo")).toEqual(["One Two"])
    expect(texts("^#^#")).toEqual(["42"])
  })
})

describe("Replace", () => {
  it("keeps the formatting where the match starts, and puts in ^& and wildcard groups", () => {
    make("<p>Hello <em>world</em></p>")
    replaceTextRanges(editor, findTextRanges(editor, "world"), "[^&]")
    expect(editor.getHTML()).toBe("<p>Hello <em>[world]</em></p>")
    make("<p>Doe, Jane</p>")
    replaceTextRanges(editor, findTextRanges(editor, "(<*>), (<*>)", { wildcards: true }), "\\2 \\1", true)
    expect(editor.getText()).toBe("Jane Doe")
  })

  it("splits the paragraph for ^p and joins paragraphs when the match holds one", () => {
    make("<p>a; b</p>")
    replaceTextRanges(editor, findTextRanges(editor, "; "), "^p")
    expect(editor.getHTML()).toBe("<p>a</p><p>b</p>")
    replaceTextRanges(editor, findTextRanges(editor, "^p"), " + ")
    expect(editor.getHTML()).toBe("<p>a + b</p>")
  })
})
