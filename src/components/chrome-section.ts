import { useDocumentStore } from "@/document/store"
import type { SectionSetupPatch } from "@/document/sections"
import { useBodyEditor } from "@/editor/document-editor"
import type { PagePlaces, SlotState } from "@/document/section-slots"
import type { Editor } from "@tiptap/core"
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

/** The headers and footers the store holds, for the lookups in `section-slots.ts`. */
export function slotStateNow(): SlotState {
  const state = useDocumentStore.getState()
  return {
    sections: state.sections,
    linkedSlots: state.linkedSlots,
    differentFirstPage: state.differentFirstPage,
    differentOddEven: state.pageSetup.differentOddEven,
  }
}

/** Each page's section and whether it starts it, from the body's paginator (see `PagePlaces`). */
export function pagePlacesOf(body: Editor | null): PagePlaces {
  const storage = body?.storage.pagination
  return { keys: storage?.pageSections ?? [], starts: storage?.sectionStarts ?? [] }
}

/** `pagePlacesOf`, kept current as the body is laid out again. */
export function usePagePlaces(): PagePlaces {
  const body = useBodyEditor()
  const value =
    useEditorState({
      editor: body,
      selector: ({ editor }) => {
        const storage = editor?.storage.pagination
        return `${(storage?.pageSections ?? []).join("\u0001")}\u0002${(storage?.sectionStarts ?? []).map(Number).join("")}`
      },
    }) ?? ""
  const [keys, starts] = value.split("\u0002")
  return {
    keys: keys ? keys.split("\u0001") : [],
    starts: (starts ?? "").split("").map((item) => item === "1"),
  }
}

/** `slotStateNow`, kept current. */
export function useSlotState(): SlotState {
  const sections = useDocumentStore((state) => state.sections)
  const linkedSlots = useDocumentStore((state) => state.linkedSlots)
  const differentFirstPage = useDocumentStore((state) => state.differentFirstPage)
  const differentOddEven = useDocumentStore((state) => state.pageSetup.differentOddEven)
  return { sections, linkedSlots, differentFirstPage, differentOddEven }
}
