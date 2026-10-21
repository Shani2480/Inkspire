import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useEditingOptions } from "@/document/editing-options"
import { EditingBehavior, mergedSlice } from "@/editor/editing-behavior"

const openExternal = vi.hoisted(() => vi.fn())
vi.mock("@/document/help", () => ({ openExternal }))

function make(content = "<p>Hello world</p>") {
  const element = document.createElement("div")
  document.body.append(element)
  return new Editor({ element, extensions: [StarterKit, EditingBehavior], content })
}

function type(editor: Editor, text: string) {
  const { from, to } = editor.state.selection
  const handled = editor.view.someProp("handleTextInput", (handler) => handler(editor.view, from, to, text))
  if (!handled) {
    editor.view.dispatch(editor.state.tr.insertText(text, from, to))
  }
}

describe("advanced editing options (22.9)", () => {
  afterEach(() =>
    useEditingOptions.getState().set({
      typingReplacesSelection: true,
      overtype: false,
      insertKeyOvertype: false,
      ctrlClickLink: true,
      dragAndDrop: true,
    }),
  )

  it("typing replaces the selection, and with the option off goes in front of it", () => {
    const editor = make()
    editor.commands.setTextSelection({ from: 1, to: 6 })
    type(editor, "J")
    expect(editor.getText()).toBe("J world")

    useEditingOptions.getState().set({ typingReplacesSelection: false })
    const other = make()
    other.commands.setTextSelection({ from: 1, to: 6 })
    type(other, "J")
    expect(other.getText()).toBe("JHello world")
    expect(other.state.doc.textBetween(other.state.selection.from, other.state.selection.to)).toBe("Hello")
  })

  it("overtype replaces the next character and stops at the end of the line", () => {
    useEditingOptions.getState().set({ overtype: true })
    const editor = make()
    editor.commands.setTextSelection(1)
    type(editor, "J")
    type(editor, "e")
    expect(editor.getText()).toBe("Jello world")
    editor.commands.setTextSelection(12)
    type(editor, "!")
    expect(editor.getText()).toBe("Jello world!")
  })

  it("the Insert key switches overtype only when the option lets it", () => {
    const editor = make()
    const press = () =>
      editor.view.someProp("handleKeyDown", (handler) =>
        handler(editor.view, new KeyboardEvent("keydown", { key: "Insert" })),
      )
    expect(press()).toBeFalsy()
    expect(useEditingOptions.getState().overtype).toBe(false)
    useEditingOptions.getState().set({ insertKeyOvertype: true })
    expect(press()).toBe(true)
    expect(useEditingOptions.getState().overtype).toBe(true)
  })

  it("a link needs Ctrl+Click unless the option is off", () => {
    const editor = make('<p><a href="https://example.com">site</a> text</p>')
    const click = (init: MouseEventInit) =>
      editor.view.someProp("handleClick", (handler) => handler(editor.view, 2, new MouseEvent("click", init)))
    expect(click({})).toBeFalsy()
    expect(openExternal).not.toHaveBeenCalled()
    expect(click({ ctrlKey: true })).toBe(true)
    expect(openExternal).toHaveBeenCalledWith("https://example.com")
    openExternal.mockClear()
    useEditingOptions.getState().set({ ctrlClickLink: false })
    expect(click({})).toBe(true)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  it("Keep Text Only pastes the plain text, one paragraph for each line", () => {
    useEditingOptions.getState().set({ pasteOtherPrograms: "text" })
    const editor = make("<p>Hello world</p>")
    editor.commands.setTextSelection(6)
    const data: Record<string, string> = { "text/html": "<p><b>x</b></p>", "text/plain": "A\nB" }
    const event = Object.assign(new Event("paste", { cancelable: true }), {
      clipboardData: { getData: (type: string) => data[type] ?? "" },
    }) as unknown as ClipboardEvent
    const handled = editor.view.someProp("handlePaste", (handler) =>
      handler(editor.view, event, editor.state.doc.slice(0, 0)),
    )
    expect(handled).toBe(true)
    expect(editor.getText({ blockSeparator: "|" })).toBe("HelloA|B world")
    expect(editor.getHTML()).not.toContain("<strong>")
    useEditingOptions.getState().set({ pasteOtherPrograms: "keep" })
  })

  it("Merge Formatting keeps emphasis and drops the rest", () => {
    const editor = make("<p><strong>bold</strong> <em>it</em></p>")
    const slice = editor.state.doc.slice(0, editor.state.doc.content.size)
    const plain = mergedSlice(slice)
    expect(plain.content.textBetween(0, plain.content.size, " ")).toBe("bold it")
    const marks = new Set<string>()
    plain.content.descendants((node) => node.marks.forEach((mark) => marks.add(mark.type.name)))
    expect([...marks].sort()).toEqual(["bold", "italic"])
  })
})
