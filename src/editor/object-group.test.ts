import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { afterEach, describe, expect, it } from "vitest"
import { Figure } from "@/editor/insert-blocks"
import { ObjectGrouping, useObjectSelection } from "@/editor/object-group"

let editor: Editor | null = null

function make() {
  const element = document.createElement("div")
  document.body.append(element)
  editor = new Editor({
    element,
    extensions: [StarterKit, Figure, ObjectGrouping],
    content:
      '<p>start</p><div data-figure data-kind="shape" data-variant="ellipse"></div>' +
      '<div data-figure data-kind="shape" data-variant="heart"></div>' +
      '<div data-figure data-kind="shape" data-variant="round"></div><p>end</p>',
  })
  return editor
}

function figures(current: Editor) {
  const found: number[] = []
  current.state.doc.descendants((node, pos) => {
    if (node.type.name === "figure") {
      found.push(pos)
    }
  })
  return found
}

function shiftClick(current: Editor, pos: number, shiftKey = true) {
  const dom = current.view.nodeDOM(pos) as HTMLElement
  const inner = dom.querySelector("svg") ?? dom
  inner.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, shiftKey }))
}

const picked = (current: Editor) =>
  figures(current).filter((pos) => (current.view.nodeDOM(pos) as HTMLElement).hasAttribute("data-picked"))

// jsdom has no pointer capture, which an object's own drag asks for.
HTMLElement.prototype.setPointerCapture ??= () => {}

afterEach(() => {
  editor?.destroy()
  editor = null
  useObjectSelection.getState().clear()
  document.body.innerHTML = ""
})

describe("Several picked objects", () => {
  it("adds objects with Shift+click, starting from the selected one, and frames each", () => {
    const current = make()
    const [a, b, c] = figures(current)
    current.commands.setNodeSelection(a!)
    shiftClick(current, b!)
    expect(useObjectSelection.getState().picked).toEqual([a, b])
    expect(picked(current)).toEqual([a, b])
    // The one clicked is the selection, so the ribbon shows it.
    expect((current.state.selection as NodeSelection).from).toBe(b)
    shiftClick(current, c!)
    expect(picked(current)).toEqual([a, b, c])
    // Shift+click on a picked one takes it out.
    shiftClick(current, b!)
    expect(useObjectSelection.getState().picked).toEqual([a, c])
    expect(picked(current)).toEqual([a, c])
  })

  it("follows the objects through edits and lets go when the selection leaves them", () => {
    const current = make()
    const [a, b] = figures(current)
    current.commands.setNodeSelection(a!)
    shiftClick(current, b!)
    // Typing before them moves them; the picks move with them.
    const tr = current.state.tr.insertText("xy", 2)
    current.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, b! + 2)))
    const moved = figures(current)
    expect(useObjectSelection.getState().picked).toEqual([moved[0], moved[1]])
    current.view.dispatch(current.state.tr.setSelection(TextSelection.create(current.state.doc, 2)))
    expect(useObjectSelection.getState().picked).toEqual([])
    expect(picked(current)).toEqual([])
  })

  it("leaves a plain click to the object's own selection", () => {
    const current = make()
    const [a, b] = figures(current)
    current.commands.setNodeSelection(a!)
    shiftClick(current, b!, false)
    expect(useObjectSelection.getState().picked).toEqual([])
  })
})
