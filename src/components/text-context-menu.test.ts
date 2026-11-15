import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { createExtensions } from "@/editor/extensions"
import { placeMenu, selectedWord, spellingItems } from "@/components/text-context-menu"
import { useAutoCorrect } from "@/editor/autocorrect"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe("text context menu", () => {
  const view = { width: 1300, height: 900 }

  it("opens below and right of the click when it fits", () => {
    expect(placeMenu({ x: 400, y: 200 }, 256, 486, view)).toEqual({ left: 400, top: 200 })
  })

  it("opens above the click near the bottom and left of it near the right edge, as Word does", () => {
    expect(placeMenu({ x: 1200, y: 700 }, 256, 486, view)).toEqual({ left: 944, top: 214 })
  })

  it("stays inside the window when it fits neither above nor below", () => {
    expect(placeMenu({ x: 10, y: 300 }, 256, 486, { width: 1300, height: 600 })).toEqual({ left: 10, top: 8 })
  })

  it("names the word the caret is in when nothing is selected", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((e) => e.name !== "spellcheck"),
      content: "<p>Third item’s text</p>",
    })
    editors.push(editor)
    editor.commands.setTextSelection(4)
    expect(selectedWord(editor)).toBe("Third")
    editor.commands.setTextSelection(10)
    expect(selectedWord(editor)).toBe("item’s")
    editor.commands.setTextSelection({ from: 7, to: 18 })
    expect(selectedWord(editor)).toBe("item’s")
  })

  it("puts Word's spelling section first on a misspelling: suggestions, Ignore All, AutoCorrect, Language", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((e) => e.name !== "spellcheck"),
      content: "<p>I saw teh cat and teh dog.</p>",
    })
    editors.push(editor)
    const miss = { from: 7, to: 10, word: "teh", suggestions: ["the", "tech"] }
    let language = 0
    const items = spellingItems(editor, miss, () => (language += 1))
    expect(items.map((item) => item.label)).toEqual([
      "the",
      "tech",
      "Ignore All",
      "Add to Dictionary",
      "AutoCorrect",
      "Language",
    ])
    expect(items[0].strong).toBe(true)
    expect(items[2].divided).toBe(true)
    const autocorrect = items.find((item) => item.id === "autocorrect")!.children!
    expect(autocorrect.map((child) => child.label)).toEqual(["the", "tech", "AutoCorrect Options…"])
    autocorrect[0].run()
    expect(editor.getText()).toBe("I saw the cat and teh dog.")
    expect(useAutoCorrect.getState().entries.get("teh")).toBe("the")
    items.find((item) => item.id === "language")!.children![0].run()
    expect(language).toBe(1)
  })

  it("says so when there are no suggestions", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((e) => e.name !== "spellcheck"),
      content: "<p>zzqx</p>",
    })
    editors.push(editor)
    const items = spellingItems(editor, { from: 1, to: 5, word: "zzqx", suggestions: [] }, () => undefined)
    expect(items[0]).toMatchObject({ label: "(no spelling suggestions)", disabled: true })
    expect(items.find((item) => item.id === "autocorrect")!.children!.map((child) => child.label)).toEqual([
      "AutoCorrect Options…",
    ])
  })
})

describe("spelling suggestions", () => {
  it("puts a swap of the typo's own letters first, as Word does", async () => {
    const { rankSuggestions } = await import("@/editor/spellcheck")
    expect(rankSuggestions("wrods", ["prods", "woods", "rods", "words"])).toEqual(["words", "prods", "woods", "rods"])
    expect(rankSuggestions("Teh", ["ten", "the"])).toEqual(["the", "ten"])
  })
})
