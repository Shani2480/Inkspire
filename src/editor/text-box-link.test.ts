import { Editor } from "@tiptap/core"
import { undo } from "@tiptap/pm/history"
import { TextSelection } from "@tiptap/pm/state"
import { StarterKit } from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"
import { TextBox } from "@/editor/objects"
import {
  breakTextBoxLink,
  canLinkTo,
  chainAt,
  flowBreaks,
  flowChain,
  hasNextBox,
  linkTextBoxes,
  textBoxChains,
} from "@/editor/text-box-link"

function make(...texts: string[]) {
  return new Editor({
    extensions: [StarterKit, TextBox],
    content: texts.map((text) => `<div data-text-box>${text}</div>`).join("") + "<p>end</p>",
  })
}

function boxes(editor: Editor) {
  const found: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "textBox") {
      found.push(pos)
    }
  })
  return found
}

const texts = (editor: Editor) => boxes(editor).map((pos) => editor.state.doc.nodeAt(pos)!.textContent)

/** Links every box to the next, the way Create Link does one at a time. */
function chain(editor: Editor) {
  for (let index = 0; index < boxes(editor).length - 1; index += 1) {
    const at = boxes(editor)
    editor.view.dispatch(linkTextBoxes(editor.state, at[index]!, at[index + 1]!, { [at[index]!]: 60, [at[index + 1]!]: 60 })!)
  }
}

describe("Linked text boxes (Create Link)", () => {
  it("links only to an empty box in no chain, and orders the chain", () => {
    const editor = make("one two three", "", "taken")
    const [first, second, third] = boxes(editor) as [number, number, number]
    expect(canLinkTo(editor.state.doc, first, second)).toBe(true)
    // Not to a box with text, nor to itself.
    expect(canLinkTo(editor.state.doc, first, third)).toBe(false)
    expect(canLinkTo(editor.state.doc, first, first)).toBe(false)
    editor.view.dispatch(linkTextBoxes(editor.state, first, second, { [first]: 50, [second]: 40 })!)
    const linked = editor.state.doc.nodeAt(first)!.attrs
    // A box as high as its text gets the height it had, as a linked box keeps its size.
    expect(linked).toMatchObject({ linkSeq: 0, height: 50 })
    expect(editor.state.doc.nodeAt(second)!.attrs).toMatchObject({ linkId: linked.linkId, linkSeq: 1, height: 40 })
    expect(hasNextBox(editor.state.doc, first)).toBe(true)
    expect(hasNextBox(editor.state.doc, second)).toBe(false)
    expect(chainAt(editor.state.doc, second)!.index).toBe(1)
    // A box that passes its text on cannot link again (its button is Break Link), and a box in a chain is taken.
    expect(canLinkTo(editor.state.doc, first, boxes(editor)[2]!)).toBe(false)
    expect(canLinkTo(editor.state.doc, third, second)).toBe(false)
  })

  it("finds where the text breaks between boxes, at the start of a word", () => {
    const editor = make("aaa bbb ccc ddd", "", "")
    const text = editor.state.doc.nodeAt(boxes(editor)[0]!)!.content
    // Ten characters fit in each box.
    const fits = (_: number, piece: typeof text) => piece.size <= 10
    expect(flowBreaks(text, 3, fits)).toEqual([8, 15])
    // A box that grows with its text takes all of it.
    expect(flowBreaks(text, 2, () => null)).toEqual([15])
    // A word longer than the box breaks inside it.
    const long = make("abcdefghijklmnop").state.doc.firstChild!.content
    expect(flowBreaks(long, 2, (_, piece) => piece.size <= 10)).toEqual([10])
  })

  it("moves the text into the boxes, the cursor going with the text it was in", () => {
    const editor = make("aaa bbb ccc", "")
    chain(editor)
    const [first] = boxes(editor) as [number]
    // The cursor after "ccc".
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, first + 1 + 11)))
    const chained = [...textBoxChains(editor.state.doc).values()][0]!
    editor.view.dispatch(flowChain(editor.state, chained, [8])!)
    expect(texts(editor)).toEqual(["aaa bbb ", "ccc"])
    const second = boxes(editor)[1]!
    expect(editor.state.selection.head).toBe(second + 1 + 3)
    // Already flowed: nothing to do.
    expect(flowChain(editor.state, [...textBoxChains(editor.state.doc).values()][0]!, [8])).toBeNull()
    // Text that fits again comes back.
    editor.view.dispatch(flowChain(editor.state, [...textBoxChains(editor.state.doc).values()][0]!, [11])!)
    expect(texts(editor)).toEqual(["aaa bbb ccc", ""])
  })

  it("undoes the flow with the typing that caused it", () => {
    const editor = make("aaa bbb", "")
    chain(editor)
    const [first] = boxes(editor) as [number]
    const typing = editor.state.tr.insertText(" ccc", first + 1 + 7)
    editor.view.dispatch(typing)
    const flow = flowChain(editor.state, [...textBoxChains(editor.state.doc).values()][0]!, [8])!
    editor.view.dispatch(flow.setMeta("appendedTransaction", typing))
    expect(texts(editor)).toEqual(["aaa bbb ", "ccc"])
    undo(editor.state, editor.view.dispatch)
    expect(texts(editor)).toEqual(["aaa bbb", ""])
  })

  it("breaks a link: the box keeps the text after it, and the boxes after it stay linked to each other", () => {
    const editor = make("one", "", "")
    chain(editor)
    const chained = [...textBoxChains(editor.state.doc).values()][0]!
    expect(chained).toHaveLength(3)
    editor.view.dispatch(editor.state.tr.insertText(" two ", chained[1]!.pos + 1).insertText("three", chained[2]!.pos + 1 + 5))
    expect(texts(editor)).toEqual(["one", " two ", "three"])
    editor.view.dispatch(breakTextBoxLink(editor.state, boxes(editor)[0]!)!)
    expect(texts(editor)).toEqual(["one two three", "", ""])
    const [first, second, third] = boxes(editor).map((pos) => editor.state.doc.nodeAt(pos)!.attrs)
    expect(first!.linkId).toBe("")
    expect(second!.linkId).not.toBe("")
    expect(third).toMatchObject({ linkId: second!.linkId, linkSeq: 1 })
    expect(breakTextBoxLink(editor.state, boxes(editor)[2]!)).toBeNull()
  })
})
