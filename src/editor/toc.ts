import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import {
  DEFAULT_TOC_INSTRUCTION,
  DEFAULT_TOC_TITLE,
  figureTable,
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
import { useDocumentStore } from "@/document/store"
import { sectionPageLabels } from "@/document/page-numbers"
import { captionsOf } from "@/editor/caption-items"

export type { TocEntry } from "@/document/toc"

/** Sent when the Update Table tab on a table of contents is clicked; the app answers with the Update dialog. */
export const TOC_UPDATE_EVENT = "inkspire-toc-update"

/** What Automatic Table 1, Automatic Table 2, and Custom Table of Contents set. */
export type TocSettings = { title?: string; instruction?: string; leader?: TocLeader; rightAlign?: boolean }

/** Update Table of Contents: Update page numbers only, or Update entire table. */
export type TocUpdate = "pages" | "entire"

/** Which tables an update without a selected one touches: tables of contents, of figures, or both (F9). */
export type TocKind = "contents" | "figures" | "all"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      /** Inserts a table of contents, or replaces the one in the document, as Word's gallery does. */
      insertTableOfContents: (settings?: TocSettings) => ReturnType
      updateTableOfContents: (update?: TocUpdate, kind?: TocKind) => ReturnType
      /** Inserts a Table of Figures at the cursor, or replaces the selected one. */
      insertTableOfFigures: (settings: TocSettings & { instruction: string }) => ReturnType
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
      /** Word's empty paragraph after the entries, where the field closes (docx/toc.ts). */
      endLine: {
        default: false,
        parseHTML: (element) => element.hasAttribute("data-toc-end-line"),
        renderHTML: (attributes) => (attributes.endLine ? { "data-toc-end-line": "" } : {}),
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
        ? [
            [
              "div",
              { class: "toc-empty" },
              figureTable(String(node.attrs.instruction ?? ""))
                ? "No table of figures entries found."
                : "No headings in this document.",
            ],
          ]
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
      ...(node.attrs.endLine ? [["p", { class: "toc-end-line" }, ["br"]]] : []),
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
        followEntry(
          editor,
          readTocEntries(current.attrs.entries),
          index,
          String(current.attrs.instruction || DEFAULT_TOC_INSTRUCTION),
        )
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
          const existing = tocPositions(state, this.name, "contents")[0]
          const node = existing === undefined ? null : state.doc.nodeAt(existing)
          const attrs = { ...(node?.attrs ?? {}), ...settings }
          const entries = tocEntries(
            state.doc,
            String(attrs.instruction || DEFAULT_TOC_INSTRUCTION),
            breaks,
            laidOutLabels(editor.storage.pagination),
          )
          if (existing === undefined) {
            return commands.insertContent({ type: this.name, attrs: { ...attrs, entries } })
          }
          if (dispatch) {
            tr.setNodeMarkup(existing, undefined, { ...attrs, entries })
          }
          return true
        },
      insertTableOfFigures:
        (settings) =>
        ({ editor, state, tr, dispatch, commands }) => {
          const { selection } = state
          const selected =
            selection instanceof NodeSelection &&
            selection.node.type.name === this.name &&
            figureTable(String(selection.node.attrs.instruction ?? ""))
              ? selection.from
              : undefined
          const entries = tocEntries(
            state.doc,
            settings.instruction,
            editor.storage.pagination?.breaks ?? [],
            laidOutLabels(editor.storage.pagination),
          )
          const attrs = { title: "", ...settings, entries }
          if (selected === undefined) {
            return commands.insertContent({ type: this.name, attrs })
          }
          if (dispatch) {
            tr.setNodeMarkup(selected, undefined, { ...state.doc.nodeAt(selected)!.attrs, ...attrs, source: "" })
          }
          return true
        },
      updateTableOfContents:
        (update = "entire", kind = "all") =>
        ({ editor, state, tr, dispatch }) => {
          const positions = tocPositions(state, this.name, kind)
          if (positions.length === 0) {
            return false
          }
          if (!dispatch) {
            return true
          }
          const breaks = editor.storage.pagination?.breaks ?? []
          const labels = laidOutLabels(editor.storage.pagination)
          for (const pos of positions) {
            const current = tr.doc.nodeAt(pos)
            if (current?.type.name !== this.name) {
              continue
            }
            const instruction = String(current.attrs.instruction || DEFAULT_TOC_INSTRUCTION)
            const entries =
              update === "pages"
                ? refreshPages(
                    readTocEntries(current.attrs.entries),
                    tocTargets(state.doc, instruction, breaks, labels),
                  )
                : tocEntries(state.doc, instruction, breaks, labels)
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
    doc.descendants((node, pos) => {
      if (node.type.name !== name) {
        return node.isBlock && !node.isTextblock
      }
      const instruction = String(node.attrs.instruction || DEFAULT_TOC_INSTRUCTION)
      const shown = readTocEntries(node.attrs.entries).map((entry) => `${entry.level}:${entry.text}`)
      const current = tocEntries(doc, instruction, []).map((entry) => `${entry.level}:${entry.text}`)
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

/** The selected table of contents or figures, or every one of the kind in the document. */
function tocPositions(state: EditorState, name: string, kind: TocKind = "all") {
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === name) {
    return [selection.from]
  }
  const positions: number[] = []
  state.doc.descendants((node, pos) => {
    const figures = node.type.name === name && figureTable(String(node.attrs.instruction ?? "")) !== null
    if (node.type.name === name && (kind === "all" || (kind === "figures") === figures)) {
      positions.push(pos)
    }
    return node.isBlock && !node.isTextblock
  })
  return positions
}

type TocHeading = TocEntry & { pos: number }

/** The number each laid-out page shows, with each section's own page numbering (Format Page Numbers). */
function laidOutLabels(
  pagination: { pageCount?: number; pageSections?: string[]; sectionStarts?: boolean[] } | undefined,
): string[] {
  if (!pagination?.pageCount) {
    return []
  }
  const { sections, pageSetup } = useDocumentStore.getState()
  return sectionPageLabels(
    pagination.pageCount,
    pagination.pageSections ?? [],
    pagination.sectionStarts ?? [],
    sections,
    pageSetup,
  )
}

/** Every heading a table of contents could list, with its page and the bookmark an entry links to. */
function tocHeadings(doc: ProseNode, breaks: number[], labels: string[] = []): TocHeading[] {
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
    const heading: TocHeading = { level, text, page: labels[page - 1] ?? String(page), pos }
    const anchor = headingBookmark(children)
    if (anchor) {
      heading.anchor = anchor
    }
    headings.push(heading)
  })
  return headings
}

export function collectToc(doc: ProseNode, breaks: number[], levels = 3, labels: string[] = []): TocEntry[] {
  return tocHeadings(doc, breaks, labels)
    .filter((heading) => heading.level <= levels)
    .map(({ pos: _pos, ...entry }) => entry)
}

function pageOf(pos: number, breaks: number[], labels: string[]) {
  let page = 1
  for (const breakPos of breaks) {
    if (breakPos <= pos) {
      page += 1
    }
  }
  return labels[page - 1] ?? String(page)
}

/** What a table lists: the headings for a table of contents, the captions of its label for a Table of Figures. */
function tocTargets(doc: ProseNode, instruction: string, breaks: number[], labels: string[] = []): TocHeading[] {
  const figures = figureTable(instruction)
  if (!figures) {
    return tocHeadings(doc, breaks, labels).filter((heading) => heading.level <= tocLevels(instruction))
  }
  return captionsOf(doc, figures.label).map((caption) => {
    const node = doc.nodeAt(caption.pos)
    const children: TocNodeLike[] = []
    node?.forEach((child) => children.push({ type: child.type.name, attrs: child.attrs }))
    const anchor = headingBookmark(children)
    const target: TocHeading = {
      level: 1,
      text: figures.includeLabel ? caption.text : caption.body,
      page: pageOf(caption.pos, breaks, labels),
      pos: caption.pos,
    }
    return anchor ? { ...target, anchor } : target
  })
}

export function tocEntries(doc: ProseNode, instruction: string, breaks: number[], labels: string[] = []): TocEntry[] {
  return tocTargets(doc, instruction, breaks, labels).map(({ pos: _pos, ...entry }) => entry)
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
function followEntry(editor: Editor, entries: TocEntry[], index: number, instruction: string) {
  const heading = matchHeadings(entries, tocTargets(editor.state.doc, instruction, []))[index]
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
  dom.toggleAttribute("data-toc-end-line", node.attrs.endLine === true)
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
    empty.textContent = figureTable(String(node.attrs.instruction ?? ""))
      ? "No table of figures entries found."
      : "No headings in this document."
    dom.append(empty)
    appendEndLine(dom, node)
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
  appendEndLine(dom, node)
}

/** The empty paragraph Word shows below the entries when the field closes in a paragraph of its own. */
function appendEndLine(dom: HTMLElement, node: ProseNode) {
  if (node.attrs.endLine) {
    const line = document.createElement("p")
    line.className = "toc-end-line"
    line.append(document.createElement("br"))
    dom.append(line)
  }
}

/** The page number (as the page shows it) of a document position, from the last layout; null before one. */
export function pageLabelAt(editor: Editor, pos: number): string | null {
  const pagination = editor.storage.pagination as
    { breaks?: number[]; pageCount?: number; pageSections?: string[]; sectionStarts?: boolean[] } | undefined
  const breaks = pagination?.breaks ?? []
  let page = 1
  for (const breakPos of breaks) {
    if (breakPos <= pos) {
      page += 1
    }
  }
  const labels = laidOutLabels(pagination)
  return labels[page - 1] ?? String(page)
}
