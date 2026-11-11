import { useDocumentStore } from "@/document/store"
import type { SectionSetupPatch } from "@/document/sections"
import { useBodyEditor } from "@/editor/document-editor"
import { useEditorState } from "@tiptap/react"

/** What the Header & Footer tab and the page's First page check box change for the section of a page. */
export type PageSectionSetup = {
  differentFirstPage: boolean
  headerFromEdge: number
  footerFromEdge: number
  /** Changes the section's own setting; the document's own (last) section's are the document's. */
  set: (patch: Pick<SectionSetupPatch, "differentFirstPage" | "headerFromEdge" | "footerFromEdge">) => void
}

/** The section page `page` is in: its Different first page and header and footer distances, and how to change them. */
export function usePageSectionSetup(page: number): PageSectionSetup {
  const body = useBodyEditor()
  const key =
    useEditorState({
      editor: body,
      selector: ({ editor }) => editor?.storage.pagination?.pageSections?.[page] ?? "",
    }) ?? ""
  const section = useDocumentStore((state) => (key ? state.sections.find((item) => item.key === key) : undefined))
  const own = useDocumentStore((state) => state.differentFirstPage)
  const setup = useDocumentStore((state) => state.pageSetup)
  if (section) {
    return {
      differentFirstPage: section.differentFirstPage,
      headerFromEdge: section.headerFromEdge,
      footerFromEdge: section.footerFromEdge,
      set: (patch) => useDocumentStore.getState().setSectionSetup(section.key, patch),
    }
  }
  return {
    differentFirstPage: own,
    headerFromEdge: setup.headerFromEdge,
    footerFromEdge: setup.footerFromEdge,
    set: (patch) => {
      const store = useDocumentStore.getState()
      if (patch.differentFirstPage !== undefined) {
        store.setDifferentFirstPage(patch.differentFirstPage)
      }
      const { headerFromEdge, footerFromEdge } = patch
      if (headerFromEdge !== undefined || footerFromEdge !== undefined) {
        store.setPageSetup({
          ...store.pageSetup,
          ...(headerFromEdge !== undefined ? { headerFromEdge } : {}),
          ...(footerFromEdge !== undefined ? { footerFromEdge } : {}),
        })
      }
    },
  }
}
