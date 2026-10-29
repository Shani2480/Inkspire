import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { createExtensions } from "@/editor/extensions"
import { bulletGlyph, formatNumber, WordNumbering, type WordLevel } from "@/editor/word-markers"

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
