import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { createExtensions } from "@/editor/extensions"
import { bulletGlyph, formatNumber, withWordMarkers, WordNumbering, type WordLevel } from "@/editor/word-markers"

const level = (text: string, format: string, extra: Partial<WordLevel> = {}): WordLevel => ({
  text,
  format,
  start: 1,
  hang: 18,
  ...extra,
})

describe("Word's list markers", () => {
  it("formats numbers as Word's formats do", () => {
    expect(formatNumber(4, "lowerLetter")).toBe("d")
    expect(formatNumber(28, "upperLetter")).toBe("BB")
    expect(formatNumber(14, "lowerRoman")).toBe("xiv")
    expect(formatNumber(9, "upperRoman")).toBe("IX")
    expect(formatNumber(3, "decimalZero")).toBe("03")
    expect(formatNumber(12, "ordinal")).toBe("12th")
  })

  it("draws the symbol fonts' bullets without the fonts", () => {
    expect(bulletGlyph("", "Symbol")).toEqual({ text: "•" })
    expect(bulletGlyph("", "Wingdings")).toEqual({ text: "▪" })
    expect(bulletGlyph("o", "Courier New")).toEqual({ text: "o", font: "Courier New" })
  })

  it("numbers each level, restarting a level after an item above it, with %1.%2 from both", () => {
    const numbering = new WordNumbering([
      level("%1.", "decimal"),
      level("%1.%2", "decimal"),
      level("%3)", "lowerLetter"),
    ])
    const texts = [0, 1, 1, 2, 0, 1].map((at) => numbering.next(at)!.text)
    expect(texts).toEqual(["1.", "1.1", "1.2", "a)", "2.", "2.1"])
  })

  it("continues level 0 from the list's start", () => {
    const numbering = new WordNumbering([level("%1)", "lowerLetter")], 3)
    expect(numbering.next(0)!.text).toBe("c)")
  })

  it("marks each item of a Word list in the editor, and renumbers after an edit", () => {
    const levels = JSON.stringify([level("%1.", "decimal", { hang: 18 }), level("%2)", "lowerLetter", { hang: 18 })])
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: `<ol data-word-list="1" data-word-levels='${levels}'><li><p>one</p></li><li data-indent="1"><p>sub</p></li><li><p>two</p></li></ol>`,
    })
    const markers = () =>
      [...editor.view.dom.querySelectorAll<HTMLElement>("li[data-word-marker]")].map((li) =>
        li.style.getPropertyValue("--word-marker").trim(),
      )
    expect(markers()).toEqual(['"1."', '"a)"', '"2."'])
    editor.commands.setTextSelection(4)
    editor.commands.splitListItem("listItem")
    expect(markers()).toEqual(['"1."', '"2."', '"a)"', '"3."'])
    editor.destroy()
  })
})

describe("Word's list level options", () => {
  it("writes every number as a decimal on a legal level", () => {
    const numbering = new WordNumbering([level("%1.", "upperRoman"), level("%1.%2", "lowerLetter", { legal: true })])
    expect([0, 1].map((at) => numbering.next(at)!.text)).toEqual(["I.", "1.1"])
  })

  it("keeps counting a level whose lvlRestart is 0, or names a level above the item", () => {
    const never = new WordNumbering([level("%1.", "decimal"), level("%2)", "decimal", { restart: 0 })])
    expect([1, 1, 0, 1].map((at) => never.next(at)!.text)).toEqual(["1)", "2)", "1.", "3)"])
    const afterFirst = new WordNumbering([
      level("%1.", "decimal"),
      level("%2.", "decimal"),
      level("%3)", "decimal", { restart: 1 }),
    ])
    // Level 2 starts again after level 0 only, not after level 1.
    expect([2, 2, 1, 2, 0, 2].map((at) => afterFirst.next(at)!.text)).toEqual(["1)", "2)", "1.", "3)", "1.", "1)"])
  })

  it("writes the markers into exported HTML as each item's list-style-type", () => {
    const levels = JSON.stringify([level("%1.", "decimal"), level("%2)", "lowerLetter", { suffix: "nothing" })])
    const html = withWordMarkers(
      `<ol start="3" data-word-levels='${levels}'><li><p>one</p></li><li data-indent="1"><p>sub</p></li><li><p>two</p></li></ol>`,
    )
    const items = new DOMParser().parseFromString(html, "text/html").querySelectorAll("li")
    expect([...items].map((item) => item.style.listStyleType)).toEqual(['"3. "', '"a)"', '"4. "'])
  })

  it("draws the level's own look on the item: alignment, suffix and run format", () => {
    const levels = JSON.stringify([
      level("%1.", "decimal", { justify: "right", suffix: "space", size: 16, color: "#c00000", bold: true }),
    ])
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: `<ol data-word-list="1" data-word-tab="36" data-word-levels='${levels}'><li><p>one</p></li></ol>`,
    })
    const item = editor.view.dom.querySelector<HTMLElement>("li[data-word-marker]")!
    expect(item.dataset.wordJustify).toBe("right")
    expect(item.dataset.wordSuffix).toBe("space")
    expect(item.dataset.wordTab).toBe("36")
    expect(item.style.getPropertyValue("--word-marker-size")).toBe("16pt")
    expect(item.style.getPropertyValue("--word-marker-color")).toBe("#c00000")
    expect(item.style.getPropertyValue("--word-marker-weight")).toBe("700")
    editor.destroy()
  })
})
