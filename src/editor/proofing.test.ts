import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { languageName, proofingLanguage, wordLanguageTag } from "@/document/languages"
import { createExtensions } from "@/editor/extensions"
import { proofingAt, setProofing } from "@/editor/proofing"
import { countStats, countWords } from "@/editor/word-count"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function make(content: string) {
  // The spell checker fetches dictionaries from the dev server, which tests do not run.
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  editors.push(editor)
  return editor
}

/** Selects the first occurrence of `text`. */
function select(editor: Editor, text: string) {
  let from = -1
  editor.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text?.includes(text)) {
      from = pos + node.text.indexOf(text)
    }
  })
  expect(from, text).toBeGreaterThanOrEqual(0)
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + text.length)))
}

async function saveXml(editor: Editor, word: Awaited<ReturnType<typeof openDocxBytes>>["word"] | null = null) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: emptyChrome(),
    word,
    unchanged: false,
    fileName: "lang.docx",
  })
  const pkg = await openPackage(saved.bytes, "lang.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, "/word/document.xml")!.data) }
}

describe("Language dialog: language and proofing on text", () => {
  it("marks the selection with a language and saves it as w:lang", async () => {
    const editor = make("<p>Hello wereld and more</p>")
    select(editor, "wereld")
    setProofing(editor, { lang: "nl-NL", noProof: false })
    select(editor, "wereld")
    expect(proofingAt(editor.state)).toEqual({ lang: "nl-NL", noProof: false })
    const { xml } = await saveXml(editor)
    expect(xml).toMatch(/<w:lang w:val="nl-NL"\/><\/w:rPr><w:t[^>]*>wereld<\/w:t>/)
    // The rest of the paragraph keeps the document's language.
    expect(xml.match(/<w:lang /g)).toHaveLength(1)
  })

  it("marks the word at the caret when nothing is selected, and what is typed next", () => {
    const editor = make("<p>one twee three</p>")
    let at = -1
    editor.state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText) {
        at = pos + node.text!.indexOf("twee") + 2
      }
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)))
    setProofing(editor, { lang: "nl-NL", noProof: false })
    const marked: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === "proofing")) {
        marked.push(node.text!)
      }
    })
    expect(marked).toEqual(["twee"])
    expect(proofingAt(editor.state).lang).toBe("nl-NL")
  })

  it("saves Do not check spelling as w:noProof and opens it again", async () => {
    const editor = make("<p>Code: xyzzy plugh</p>")
    select(editor, "xyzzy plugh")
    setProofing(editor, { lang: "en-US", noProof: true })
    const { bytes, xml } = await saveXml(editor)
    expect(xml).toContain("<w:noProof/>")
    const opened = await openDocxBytes(bytes, "lang.docx")
    expect(opened.view.html).toContain("data-no-proof")
    const again = make(opened.view.html)
    select(again, "xyzzy")
    expect(proofingAt(again.state)).toEqual({ lang: "en-US", noProof: true })
  })

  it("changes an opened run's language and keeps its other formatting", async () => {
    const first = make("<p><strong>Bonjour</strong> tout le monde</p>")
    select(first, "Bonjour")
    setProofing(first, { lang: "fr-FR", noProof: false })
    const { bytes } = await saveXml(first)
    const opened = await openDocxBytes(bytes, "lang.docx")
    const editor = make(opened.view.html)
    select(editor, "Bonjour")
    setProofing(editor, { lang: "de-DE", noProof: false })
    const { xml } = await saveXml(editor, opened.word)
    expect(xml).toMatch(/<w:b\/>.*<w:lang w:val="de-DE"\/>.*Bonjour/)
    expect(xml).not.toContain("fr-FR")
  })

  it("takes the mark off for the document's language with spelling checked", () => {
    const editor = make("<p>Hello wereld</p>")
    select(editor, "wereld")
    setProofing(editor, { lang: "nl-NL", noProof: true })
    select(editor, "wereld")
    setProofing(editor, { lang: null, noProof: false })
    expect(editor.getHTML()).not.toContain("data-proofing")
  })

  it("knows which tags it can check", () => {
    expect(proofingLanguage("nl-BE")).toBe("nl")
    expect(proofingLanguage("en-AU")).toBe("en-GB")
    expect(proofingLanguage("pl-PL")).toBeNull()
    expect(wordLanguageTag("da")).toBe("da-DK")
    expect(languageName("de-DE")).toBe("German")
  })
})

describe("Word Count", () => {
  it("counts words as Word does", () => {
    expect(countWords("  one  two-three 3.5 ")).toBe(3)
    expect(countWords("")).toBe(0)
  })

  it("counts the document, or the selection when there is one", () => {
    const editor = make("<p>One two three.</p><p></p><p>Four five</p>")
    const all = countStats(editor, { extras: true })
    expect(all).toMatchObject({ words: 5, characters: 20, charactersWithSpaces: 23, paragraphs: 2 })
    select(editor, "two three")
    expect(countStats(editor, { extras: true })).toMatchObject({ words: 2, charactersWithSpaces: 9, paragraphs: 1 })
    expect(countStats(editor, { extras: true, whole: true }).words).toBe(5)
  })
})
