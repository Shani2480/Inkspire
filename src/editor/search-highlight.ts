import { Extension } from "@tiptap/core"
import type { Editor } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { findMatches, type FindOptions } from "@/editor/find"

/**
 * The Navigation pane's search: every match in the document is highlighted while the search box holds text, as
 * Word does, and the highlight follows edits. `setSearchHighlight` with an empty query clears it.
 */

type SearchState = { query: string; options: Partial<FindOptions>; decorations: DecorationSet }

const searchKey = new PluginKey<SearchState>("searchHighlight")

function decorate(doc: Parameters<typeof findMatches>[0], query: string, options: Partial<FindOptions>) {
  if (!query) {
    return DecorationSet.empty
  }
  const decorations = findMatches(doc, query, options)
    .filter((match) => match.to > match.from)
    .map((match) => Decoration.inline(match.from, match.to, { class: "search-hit" }))
  return DecorationSet.create(doc, decorations)
}

export function setSearchHighlight(editor: Editor, query: string, options: Partial<FindOptions> = {}) {
  if (editor.isDestroyed) {
    return
  }
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, options }))
}

export const SearchHighlight = Extension.create({
  name: "searchHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ query: "", options: {}, decorations: DecorationSet.empty }),
          apply(tr, value) {
            const meta = tr.getMeta(searchKey) as { query: string; options: Partial<FindOptions> } | undefined
            if (meta) {
              return { ...meta, decorations: decorate(tr.doc, meta.query, meta.options) }
            }
            if (tr.docChanged && value.query) {
              return { ...value, decorations: decorate(tr.doc, value.query, value.options) }
            }
            return value
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.decorations ?? null,
        },
      }),
    ]
  },
})
