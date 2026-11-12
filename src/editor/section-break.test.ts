import { Editor } from "@tiptap/core"
import { closeHistory } from "@tiptap/pm/history"
import { afterEach, describe, expect, it } from "vitest"
import { useDocumentStore } from "@/document/store"
import { createExtensions } from "@/editor/extensions"

let editor: Editor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
  useDocumentStore.setState({ sections: [] })
})

function breaks(current: Editor) {
  const found: number[] = []
  current.state.doc.forEach((node, pos) => {
    if (node.type.name === "sectionBreak") {
      found.push(pos)
    }
  })
  return found
}

describe("a section break's section follows the break", () => {
  it("sets the section aside when the break is deleted, and brings it back with undo", () => {
    useDocumentStore.setState({ sections: [] })
    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    editor = new Editor({ extensions, content: "<p>One</p><p>Two</p>" })
    editor.commands.setTextSelection(4)
    editor.commands.insertSectionBreak("nextPage")
    const [key] = useDocumentStore.getState().sections.map((item) => item.key)
    expect(key).toBeTruthy()
    useDocumentStore.getState().setSectionSetup(key!, { columns: 3 })

    const [at] = breaks(editor)
    // A separate step from the insert, as a person deleting it later makes.
    editor.view.dispatch(closeHistory(editor.state.tr.delete(at!, at! + 1)))
    expect(breaks(editor)).toHaveLength(0)
    expect(useDocumentStore.getState().sections).toEqual([])

    editor.commands.undo()
    expect(breaks(editor)).toHaveLength(1)
    // The same section, with what was set on it.
    expect(useDocumentStore.getState().sections).toMatchObject([{ key, columns: 3 }])
  })

  it("leaves a new document's sections alone", () => {
    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    editor = new Editor({
      extensions,
      content: '<p>A</p><div data-section-break="" data-kind="nextPage" data-section="old"></div><p>B</p>',
    })
    const fresh = { key: "new", marginTop: 25, marginBottom: 25, headerFromEdge: 12, footerFromEdge: 12 }
    useDocumentStore.setState({
      sections: [{ ...fresh, differentFirstPage: false, parts: {}, opened: {} }],
    })
    editor.commands.setContent(
      '<p>C</p><div data-section-break="" data-kind="nextPage" data-section="new"></div><p>D</p>',
    )
    expect(useDocumentStore.getState().sections.map((item) => item.key)).toEqual(["new"])
  })
})
