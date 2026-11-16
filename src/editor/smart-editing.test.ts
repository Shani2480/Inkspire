import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { TextSelection } from "@tiptap/pm/state"
import { afterEach, describe, expect, it } from "vitest"
import { useEditingOptions } from "@/document/editing-options"
import { saveBuildingBlock, deleteQuickPart, loadQuickParts } from "@/editor/quick-parts"
import {
  completionFor,
  notePaste,
  SmartEditing,
  usePasteOptions,
  wholeParagraphRange,
  wholeWordSelection,
} from "@/editor/smart-editing"

function make(content: string) {
  const element = document.createElement("div")
  document.body.append(element)
  return new Editor({ element, extensions: [StarterKit, SmartEditing], content })
}

function key(editor: Editor, name: string) {
  const event = new KeyboardEvent("keydown", { key: name })
  return editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event)) ?? false
}

function type(editor: Editor, text: string) {
  const { from, to } = editor.state.selection
  editor.view.dispatch(editor.state.tr.insertText(text, from, to))
}

describe("When selecting, automatically select entire word", () => {
  it("widens a drag across words to whole words, both ways, and leaves part of one word alone", () => {
    const editor = make("<p>The quick brown fox</p>")
    // "The quick brown fox": positions start at 1. "ick bro" → "quick brown".
    const state = editor.state
    expect(wholeWordSelection(state, 7, 14)).toEqual({ anchor: 5, head: 16 })
    expect(wholeWordSelection(state, 14, 7)).toEqual({ anchor: 16, head: 5 })
    expect(wholeWordSelection(state, 6, 9)).toBeNull()
    expect(wholeWordSelection(state, 5, 16)).toBeNull()
    editor.destroy()
  })
})

describe("Use smart paragraph selection", () => {
  afterEach(() => useEditingOptions.getState().set({ smartParagraphSelection: true }))

  it("deletes whole selected paragraphs with their marks, and not the last one of the document", () => {
    const editor = make("<p>One</p><p>Two</p><p>Three</p>")
    // Select all of "Two".
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6, 9)))
    expect(wholeParagraphRange(editor.state)).not.toBeNull()
    expect(key(editor, "Delete")).toBe(true)
    expect(editor.getHTML()).toBe("<p>One</p><p>Three</p>")

    useEditingOptions.getState().set({ smartParagraphSelection: false })
    const other = make("<p>One</p><p>Two</p>")
    other.view.dispatch(other.state.tr.setSelection(TextSelection.create(other.state.doc, 1, 4)))
    key(other, "Delete")
    expect(other.getHTML()).toBe("<p></p><p>Two</p>")

    const single = make("<p>Only</p>")
    single.view.dispatch(single.state.tr.setSelection(TextSelection.create(single.state.doc, 1, 5)))
    expect(wholeParagraphRange(single.state)).toBeNull()
    for (const item of [editor, other, single]) {
      item.destroy()
    }
  })
})

describe("Show AutoComplete suggestions", () => {
  afterEach(() => useEditingOptions.getState().set({ autoComplete: true }))

  it("offers a month, a weekday or an AutoText entry after four letters", () => {
    expect(completionFor("Sept")?.text).toBe("September")
    expect(completionFor("WEDN")?.text).toBe("WEDNESDAY")
    expect(completionFor("Sep")).toBeNull()
    expect(completionFor("September")).toBeNull()
    saveBuildingBlock({ name: "Kind regards", html: "<p>Kind regards, Alex</p>", gallery: "AutoText", category: "General", description: "" })
    expect(completionFor("kind")?.html).toContain("Kind regards, Alex")
    for (const part of loadQuickParts()) {
      deleteQuickPart(part.id)
    }
  })

  it("shows the tip as you type and puts the word in on Enter", () => {
    const editor = make("<p>Due in</p>")
    editor.commands.setTextSelection(7)
    type(editor, " Nove")
    expect(editor.view.dom.querySelector(".autocomplete-tip")?.textContent).toBe("November (Press ENTER to Insert)")
    expect(key(editor, "Enter")).toBe(true)
    expect(editor.getText()).toBe("Due in November")
    expect(editor.view.dom.querySelector(".autocomplete-tip")).toBeNull()

    useEditingOptions.getState().set({ autoComplete: false })
    type(editor, " Dece")
    expect(editor.view.dom.querySelector(".autocomplete-tip")).toBeNull()
    editor.destroy()
  })
})

describe("Show Paste Options button when content is pasted", () => {
  afterEach(() => useEditingOptions.getState().set({ pasteOptionsButton: true }))

  it("keeps the pasted range until the document changes, and not with the option off", () => {
    const editor = make("<p>Start</p>")
    editor.commands.setTextSelection(6)
    notePaste({ text: "pasted", html: "<b>pasted</b>" })
    editor.view.dispatch(editor.state.tr.insertText("pasted").setMeta("paste", true))
    expect(usePasteOptions.getState().range).toEqual({ from: 6, to: 12 })
    expect(usePasteOptions.getState().clip?.html).toBe("<b>pasted</b>")
    // Moving the cursor keeps it; typing ends it.
    editor.commands.setTextSelection(2)
    expect(usePasteOptions.getState().range).not.toBeNull()
    type(editor, "x")
    expect(usePasteOptions.getState().range).toBeNull()

    useEditingOptions.getState().set({ pasteOptionsButton: false })
    editor.view.dispatch(editor.state.tr.insertText("more").setMeta("paste", true))
    expect(usePasteOptions.getState().range).toBeNull()
    editor.destroy()
  })
})
