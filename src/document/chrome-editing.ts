import type { Editor } from "@tiptap/core"
import { create } from "zustand"

/**
 * The header or footer editor the caret is in while a header or footer is being edited. The ribbon and the dialogs act
 * on it instead of the body then, so a picture or a style applies to the header.
 */
export const useActiveChromeEditor = create<{ editor: Editor | null; activate: (editor: Editor | null) => void }>(
  (set) => ({
    editor: null,
    activate: (editor) => set({ editor }),
  }),
)

export type ChromeStory = "first" | "even" | "default"

/** Which of the header (or footer) stories a page shows: the first page's, the even pages', or the shared one. */
export function chromeStory(page: number, differentFirstPage: boolean, differentOddEven: boolean): ChromeStory {
  if (differentFirstPage && page === 0) {
    return "first"
  }
  return differentOddEven && page % 2 === 1 ? "even" : "default"
}

/**
 * Word's Previous and Next on the Header & Footer tab: the page where the previous or next header story first shows,
 * in page order, or `null` when there is none. With one section they step between the first-page, even and odd
 * headers; without those options there is only one story and both are off.
 */
export function chromeStep(
  page: number,
  pages: number,
  differentFirstPage: boolean,
  differentOddEven: boolean,
  step: 1 | -1,
): number | null {
  const story = (index: number) => chromeStory(index, differentFirstPage, differentOddEven)
  const starts: number[] = []
  const seen = new Set<ChromeStory>()
  for (let index = 0; index < pages; index++) {
    if (!seen.has(story(index))) {
      seen.add(story(index))
      starts.push(index)
    }
  }
  const at = starts.indexOf(starts.find((start) => story(start) === story(page)) ?? -1)
  const target = starts[at + step]
  return at < 0 || target === undefined ? null : target
}
