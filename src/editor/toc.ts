import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import {
  DEFAULT_TOC_INSTRUCTION,
  DEFAULT_TOC_TITLE,
  headingBookmark,
  readLeader,
  readTocEntries,
  tocLevelOf,
  tocLevels,
  tocOptions,
  type TocEntry,
  type TocLeader,
  type TocNodeLike,
  type TocOptions,
} from "@/document/toc"

import { useStyleStore } from "@/document/styles"

export type { TocEntry } from "@/document/toc"

/** Sent when the Update Table tab on a table of contents is clicked; the app answers with the Update dialog. */
export const TOC_UPDATE_EVENT = "inkspire-toc-update"

/** What Automatic Table 1, Automatic Table 2, and Custom Table of Contents set. */
export type TocSettings = { title?: string; instruction?: string; leader?: TocLeader; rightAlign?: boolean }

/** Update Table of Contents: Update page numbers only, or Update entire table. */
export type TocUpdate = "pages" | "entire"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      /** Inserts a table of contents, or replaces the one in the document, as Word's gallery does. */
      insertTableOfContents: (settings?: TocSettings) => ReturnType
      updateTableOfContents: (update?: TocUpdate) => ReturnType
      removeTableOfContents: () => ReturnType
    }
  }
}

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      entries: {
        default: [] as TocEntry[],
        parseHTML: (element) => readTocEntries(element.getAttribute("data-toc")),
        renderHTML: (attributes) => ({ "data-toc": JSON.stringify(readTocEntries(attributes.entries)) }),
      },
      /** The Word field instruction: the levels shown, links to headings (\h), and page numbers (no \n). */
      instruction: {
        default: DEFAULT_TOC_INSTRUCTION,
        parseHTML: (element) => element.getAttribute("data-toc-instruction") || DEFAULT_TOC_INSTRUCTION,
        renderHTML: (attributes) => ({ "data-toc-instruction": String(attributes.instruction || "") }),
      },
      /** The heading above the entries; empty when the document has its own heading paragraph. */
      title: {
        default: DEFAULT_TOC_TITLE,
        parseHTML: (element) => element.getAttribute("data-toc-title") ?? DEFAULT_TOC_TITLE,
        renderHTML: (attributes) => ({ "data-toc-title": String(attributes.title ?? "") }),
      },
      /** The tab leader before right-aligned page numbers. */
      leader: {
        default: "dot" as TocLeader,
        parseHTML: (element) => readLeader(element.getAttribute("data-toc-leader")),
        renderHTML: (attributes) => ({ "data-toc-leader": readLeader(attributes.leader) }),
      },
      rightAlign: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-toc-right-align") !== "false",
        renderHTML: (attributes) => ({ "data-toc-right-align": String(attributes.rightAlign !== false) }),
      },
      /** The Word markup it was opened from, saved again while the table of contents is unchanged. */
      source: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-toc-source") ?? "",
        renderHTML: (attributes) => (attributes.source ? { "data-toc-source": String(attributes.source) } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "nav[data-toc]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const entries = readTocEntries(node.attrs.entries)
    const title = String(node.attrs.title ?? "")
    const options = tocOptions(node.attrs)
    return [
      "nav",
      mergeAttributes(HTMLAttributes, { class: layoutClass(options) }),
      ...(title ? [["div", { class: "toc-title" }, title]] : []),
      ...(entries.length === 0
        ? [["div", { class: "toc-empty" }, "No headings in this document."]]
        : entries.map((entry) => [
            "div",
            { class: "toc-entry", "data-level": String(entry.level) },
            ["span", { class: "toc-label" }, entry.text],
            ...(options.pageNumbers && entry.page
              ? [
                  ["span", { class: "toc-leader" }],
                  ["span", { class: "toc-page" }, entry.page],
                ]
              : []),
          ])),
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("nav")
      let current = node
      const paint = () => renderToc(dom, current)
      paint()
      dom.addEventListener("mousedown", (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null
        if (target?.closest(".toc-update-tab")) {
          // Word's content control tab: select the table of contents and ask how to update it.
          event.preventDefault()
          event.stopPropagation()
          const pos = getPos()
          if (typeof pos === "number") {
            editor.commands.setNodeSelection(pos)
          }
          window.dispatchEvent(new Event(TOC_UPDATE_EVENT))
          return
        }
        const row = target?.closest<HTMLElement>(".toc-entry")
        if (!row || !(event.ctrlKey || event.metaKey) || !tocOptions(current.attrs).hyperlinks) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        const index = Number(row.dataset.index)
        followEntry(editor, readTocEntries(current.attrs.entries), index)
      })
      return {
        dom,
        ignoreMutation: () => true,
        update(next) {
          if (next.type.name !== "tableOfContents") {
            return false
          }
          current = next
          paint()
          return true
        },
      }
    }
  },

  addProseMirrorPlugins() {
    return [staleTocPlugin(this.name)]
  },

  addCommands() {
    return {
      insertTableOfContents:
        (settings = {}) =>
        ({ editor, state, tr, dispatch, commands }) => {
          const breaks = editor.storage.pagination?.breaks ?? []
          const existing = tocPositions(state, this.name)[0]
          const node = existing === undefined ? null : state.doc.nodeAt(existing)
          const attrs = { ...(node?.attrs ?? {}), ...settings }
          const entries = collectToc(state.doc, breaks, tocLevels(String(attrs.instruction || DEFAULT_TOC_INSTRUCTION)))
          if (existing === undefined) {
            return commands.insertContent({ type: this.name, attrs: { ...attrs, entries } })
          }
          if (dispatch) {
            tr.setNodeMarkup(existing, undefined, { ...attrs, entries })
          }
          return true
        },
      updateTableOfContents:
        (update = "entire") =>
        ({ editor, state, tr, dispatch }) => {
          const positions = tocPositions(state, this.name)
          if (positions.length === 0) {
            return false
          }
          if (!dispatch) {
            return true
          }
          const breaks = editor.storage.pagination?.breaks ?? []
          const headings = tocHeadings(state.doc, breaks)
          for (const pos of positions) {
            const current = tr.doc.nodeAt(pos)
            if (current?.type.name !== this.name) {
              continue
            }
            const levels = tocLevels(String(current.attrs.instruction || DEFAULT_TOC_INSTRUCTION))
            const entries =
              update === "pages"
                ? refreshPages(readTocEntries(current.attrs.entries), headings)
                : collectToc(state.doc, breaks, levels)
            tr.setNodeMarkup(pos, undefined, { ...current.attrs, entries })
          }
          return true
        },
      removeTableOfContents:
        () =>
        ({ state, tr, dispatch }) => {
          const positions = tocPositions(state, this.name)
          if (positions.length === 0) {
            return false
          }
          if (dispatch) {
            for (const pos of [...positions].reverse()) {
              const node = tr.doc.nodeAt(pos)
              if (node) {
                tr.delete(pos, pos + node.nodeSize)
              }
            }
          }
          return true
        },
    }
  },
})

const staleKey = new PluginKey<DecorationSet>("staleToc")

/**
 * Marks a table of contents whose entries no longer match the headings (text or level; pages change with layout),
 * so its Update Table tab stays in view until it is updated.
 */
function staleTocPlugin(name: string) {
  const mark = (doc: ProseNode) => {
    const marks: Decoration[] = []
    let headings: TocEntry[] | null = null
    doc.descendants((node, pos) => {
      if (node.type.name !== name) {
        return node.isBlock && !node.isTextblock
      }
      headings ??= collectToc(doc, [], 9)
      const levels = tocLevels(String(node.attrs.instruction || DEFAULT_TOC_INSTRUCTION))
      const shown = readTocEntries(node.attrs.entries).map((entry) => `${entry.level}:${entry.text}`)
      const current = headings
        .filter((heading) => heading.level <= levels)
        .map((entry) => `${entry.level}:${entry.text}`)
      if (shown.join("\n") !== current.join("\n")) {
        marks.push(Decoration.node(pos, pos + node.nodeSize, { class: "is-stale" }))
      }
      return false
    })
    return DecorationSet.create(doc, marks)
  }
  return new Plugin<DecorationSet>({
    key: staleKey,
    state: {
      init: (_config, state) => mark(state.doc),
      apply: (tr, previous) => (tr.docChanged ? mark(tr.doc) : previous),
    },
    props: {
      decorations: (state) => staleKey.getState(state),
    },
  })
}

/** The selected table of contents, or every one in the document. */
function tocPositions(state: EditorState, name: string) {
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === name) {
    return [selection.from]
  }
  const positions: number[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === name) {
      positions.push(pos)
    }
    return node.isBlock && !node.isTextblock
  })
  return positions
}

type TocHeading = TocEntry & { pos: number }

/** Every heading a table of contents could list, with its page and the bookmark an entry links to. */
function tocHeadings(doc: ProseNode, breaks: number[]): TocHeading[] {
  const headings: TocHeading[] = []
  doc.descendants((node, pos) => {
    const level = tocLevelOf({ type: node.type.name, attrs: node.attrs }, useStyleStore.getState().styles)
    if (level === null) {
      return
    }
    const text = node.textContent.replace(/\s+/g, " ").trim()
    if (!text) {
      return
    }
    let page = 1
    for (const breakPos of breaks) {
      if (breakPos <= pos) {
        page += 1
      }
    }
    const children: TocNodeLike[] = []
    node.forEach((child) => children.push({ type: child.type.name, attrs: child.attrs }))
    const heading: TocHeading = { level, text, page: String(page), pos }
    const anchor = headingBookmark(children)
    if (anchor) {
      heading.anchor = anchor
    }
    headings.push(heading)
  })
  return headings
}

export function collectToc(doc: ProseNode, breaks: number[], levels = 3): TocEntry[] {
  return tocHeadings(doc, breaks)
    .filter((heading) => heading.level <= levels)
    .map(({ pos: _pos, ...entry }) => entry)
}

/** The heading each entry stands for: the one with its bookmark, else the next one with its text. */
function matchHeadings(entries: TocEntry[], headings: TocHeading[]) {
  let cursor = 0
  return entries.map((entry) => {
    let at = entry.anchor ? headings.findIndex((heading) => heading.anchor === entry.anchor) : -1
    if (at < 0) {
      const after = headings.slice(cursor).findIndex((heading) => heading.text === entry.text)
      at = after < 0 ? headings.findIndex((heading) => heading.text === entry.text) : cursor + after
    }
    if (at >= 0) {
      cursor = at + 1
    }
    return headings[at]
  })
}

/** Update page numbers only: the entries stay as they are, with the pages their headings are on now. */
function refreshPages(entries: TocEntry[], headings: TocHeading[]): TocEntry[] {
  const matched = matchHeadings(entries, headings)
  return entries.map((entry, index) => {
    const heading = matched[index]
    return heading ? { ...entry, page: heading.page } : entry
  })
}

/** Ctrl+Click on an entry: the cursor goes to the start of its heading. */
function followEntry(editor: Editor, entries: TocEntry[], index: number) {
  const heading = matchHeadings(entries, tocHeadings(editor.state.doc, []))[index]
  if (heading) {
    editor
      .chain()
      .focus()
      .setTextSelection(heading.pos + 1)
      .scrollIntoView()
      .run()
  }
}

function layoutClass(options: TocOptions) {
  return `toc-block${options.rightAlign ? "" : " is-inline"}`
}

function renderToc(dom: HTMLElement, node: ProseNode) {
  const entries = readTocEntries(node.attrs.entries)
  const heading = String(node.attrs.title ?? "")
  const options = tocOptions(node.attrs)
  dom.className = layoutClass(options)
  dom.dataset.leader = options.leader
  dom.replaceChildren()
  const tab = document.createElement("button")
  tab.type = "button"
  tab.className = "toc-update-tab"
  tab.contentEditable = "false"
  tab.tabIndex = -1
  tab.textContent = "Update Table…"
  dom.append(tab)
  if (heading) {
    const title = document.createElement("div")
    title.className = "toc-title"
    title.textContent = heading
    dom.append(title)
  }
  if (entries.length === 0) {
    const empty = document.createElement("div")
    empty.className = "toc-empty"
    empty.textContent = "No headings in this document."
    dom.append(empty)
    return
  }
  entries.forEach((entry, index) => {
    const row = document.createElement("div")
    row.className = "toc-entry"
    row.dataset.level = String(entry.level)
    row.dataset.index = String(index)
    if (options.hyperlinks) {
      row.title = "Ctrl+Click to follow link"
    }
    const label = document.createElement("span")
    label.className = "toc-label"
    label.textContent = entry.text
    row.append(label)
    if (options.pageNumbers && entry.page) {
      const leader = document.createElement("span")
      leader.className = "toc-leader"
      const page = document.createElement("span")
      page.className = "toc-page"
      page.textContent = entry.page
      row.append(leader, page)
    }
    dom.append(row)
  })
}
