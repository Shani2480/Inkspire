import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AutoCorrect, useAutoCorrect } from "@/editor/autocorrect"
import {
  AUTOCORRECT_DEFAULTS,
  BUILT_IN_REPLACEMENTS,
  correctWord,
  listTrigger,
  smartQuote,
} from "@/editor/autocorrect-rules"
import { SubscriptMark, SuperscriptMark } from "@/editor/character-format"
import { StyledBulletList, StyledOrderedList } from "@/editor/lists"

const ENTRIES = new Map(BUILT_IN_REPLACEMENTS)
const fix = (before: string, context = {}) =>
  correctWord(before, AUTOCORRECT_DEFAULTS, ENTRIES, context)
    .sort((a, b) => b.from - a.from)
    .reduce((text, c) => text.slice(0, c.from) + c.text + text.slice(c.to), before)

describe("AutoCorrect rules", () => {
  it("replaces slips in the case they were typed", () => {
    expect(fix("I saw teh")).toBe("I saw the")
    expect(fix("Teh")).toBe("The")
    expect(fix("so i")).toBe("so I")
    expect(fix("we dont")).toBe("we don’t")
  })

  it("capitalises a sentence's first word, but not after an abbreviation or in an address", () => {
    expect(fix("hello")).toBe("Hello")
    expect(fix("It ends. then")).toBe("It ends. Then")
    expect(fix("Really? yes")).toBe("Really? Yes")
    expect(fix("Apples, pears etc. and")).toBe("Apples, pears etc. and")
    expect(fix("See e.g. this")).toBe("See e.g. this")
    expect(fix("www.example.com")).toBe("www.example.com")
  })

  it("corrects TWo INitial CApitals and names of days, keeping known plurals", () => {
    expect(fix("It was THursday")).toBe("It was Thursday")
    expect(fix("on monday")).toBe("on Monday")
    expect(fix("All IDs")).toBe("All IDs")
  })

  it("raises an ordinal's suffix and turns hyphens into dashes", () => {
    const [ordinal] = correctWord("the 21st", AUTOCORRECT_DEFAULTS, ENTRIES)
    expect(ordinal).toEqual({ from: 6, to: 8, text: "st", superscript: true })
    expect(correctWord("the 21th", AUTOCORRECT_DEFAULTS, ENTRIES)).toEqual([])
    expect(fix("Wait--what")).toBe("Wait—what")
    expect(fix("Wait - what")).toBe("Wait – what")
  })

  it("curls quotes by what comes before them", () => {
    expect(smartQuote("", '"')).toBe("“")
    expect(smartQuote("said", '"')).toBe("”")
    expect(smartQuote("don", "'")).toBe("’")
    expect(smartQuote("(", "'")).toBe("‘")
  })

  it("starts lists from Word's triggers only", () => {
    expect(listTrigger("*", AUTOCORRECT_DEFAULTS)).toEqual({ kind: "bullet", marker: null, start: 1 })
    expect(listTrigger("3)", AUTOCORRECT_DEFAULTS)).toEqual({ kind: "ordered", marker: null, start: 3 })
    expect(listTrigger("b.", AUTOCORRECT_DEFAULTS)).toEqual({ kind: "ordered", marker: "lower-alpha", start: 2 })
    expect(listTrigger("#", AUTOCORRECT_DEFAULTS)).toBeNull()
    expect(listTrigger("*", { ...AUTOCORRECT_DEFAULTS, autoBullets: false })).toBeNull()
  })
})

describe("AutoCorrect while typing", () => {
  let editor: Editor

  beforeEach(() => {
    useAutoCorrect.getState().set(AUTOCORRECT_DEFAULTS)
    editor = new Editor({
      extensions: [
        StarterKit.configure({ bulletList: false, orderedList: false }),
        StyledBulletList,
        StyledOrderedList,
        SubscriptMark,
        SuperscriptMark,
        AutoCorrect,
      ],
      content: "<p></p>",
      enableInputRules: ["horizontalRule"],
    })
  })
  afterEach(() => {
    editor.destroy()
  })

  /** Types each character as a keystroke does: through handleTextInput, else as plain text. */
  const type = (text: string) => {
    for (const char of text) {
      const { view } = editor
      const { from, to } = view.state.selection
      const handled = view.someProp("handleTextInput", (handle) => handle(view, from, to, char, () => view.state.tr))
      if (!handled) {
        view.dispatch(view.state.tr.insertText(char, from, to))
      }
    }
  }

  it("corrects as a word ends, and Undo brings back what was typed", () => {
    type("teh ")
    expect(editor.getText()).toBe("The ")
    editor.commands.undo()
    expect(editor.getText()).toBe("teh ")
  })

  it("types curly quotes and an ordinal in superscript", () => {
    type('He said "it\'s the 2nd" ')
    expect(editor.getText()).toBe("He said “it’s the 2nd” ")
    expect(editor.getHTML()).toMatch(/2<sup[^>]*>nd<\/sup>/)
  })

  it("turns (c) into © as soon as it is typed", () => {
    type("Made (c)")
    expect(editor.getText()).toBe("Made ©")
  })

  it('starts a numbered list from "1. " and leaves Markdown\'s "# " as text', () => {
    type("1. First")
    expect(editor.getHTML()).toMatch(/^<ol><li><p>First<\/p><\/li><\/ol>/)
    editor.commands.setContent("<p></p>")
    type("# Not a heading")
    expect(editor.getHTML()).toBe("<p># Not a heading</p>")
  })

  it("does nothing with an option off", () => {
    useAutoCorrect.getState().set({ replaceText: false, capsSentence: false })
    type("teh ")
    expect(editor.getText()).toBe("teh ")
  })
})
