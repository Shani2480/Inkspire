import { Editor } from "@tiptap/core"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"
import type { SectionChrome } from "@/document/sections"
import { useDocumentStore } from "@/document/store"
import { createExtensions } from "@/editor/extensions"

const body: { editor: Editor | null } = { editor: null }
vi.mock("@/editor/document-editor", () => ({ useBodyEditor: () => body.editor }))

const { useCaretSectionSetup } = await import("@/components/chrome-section")

const cover: SectionChrome = {
  key: "s1",
  marginTop: 25.4,
  marginBottom: 25.4,
  headerFromEdge: 12.7,
  footerFromEdge: 12.7,
  differentFirstPage: false,
  paper: "a4",
  orientation: "portrait",
  paperWidth: 0,
  paperHeight: 0,
  marginLeft: 25.4,
  marginRight: 25.4,
  parts: {},
  opened: {},
}

describe("Layout's Margins, Orientation and Size", () => {
  beforeEach(() => {
    body.editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content:
        '<p>Cover</p><div data-section-break="" data-kind="nextPage" data-section="s1" class="section-break"></div><p>Body</p>',
    })
    useDocumentStore.setState({
      sections: [cover],
      pageSetup: { ...DEFAULT_PAGE_SETUP, paper: "letter", orientation: "landscape" },
    })
  })
  afterEach(() => {
    cleanup()
    body.editor?.destroy()
    body.editor = null
  })

  it("show and change the section the caret is in", () => {
    body.editor!.commands.setTextSelection(2)
    const { result } = renderHook(() => useCaretSectionSetup())
    expect(result.current.setup).toMatchObject({ paper: "a4", orientation: "portrait" })
    act(() => result.current.update({ orientation: "landscape", marginLeft: 30 }))
    const state = useDocumentStore.getState()
    expect(state.sections[0]).toMatchObject({ orientation: "landscape", marginLeft: 30 })
    expect(state.pageSetup.marginLeft).toBe(DEFAULT_PAGE_SETUP.marginLeft)
  })

  it("change the document's own setup in its last section", () => {
    body.editor!.commands.setTextSelection(body.editor!.state.doc.content.size - 2)
    const { result } = renderHook(() => useCaretSectionSetup())
    expect(result.current.setup).toMatchObject({ paper: "letter", orientation: "landscape" })
    act(() => result.current.update({ orientation: "portrait" }))
    const state = useDocumentStore.getState()
    expect(state.pageSetup.orientation).toBe("portrait")
    expect(state.sections[0]!.orientation).toBe("portrait")
    expect(state.sections[0]!.paper).toBe("a4")
  })
})
