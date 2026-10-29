import { blockFormatAttributes } from "@/editor/block-format"
import { restoreSelection } from "@/editor/selection-memory"
import { insertAlignedTab, tabStopsAttribute } from "@/editor/tab-stops"
import { cssString, parseWordLevels, WordNumbering } from "@/editor/word-markers"
import { Extension, type Editor } from "@tiptap/core"
import Heading from "@tiptap/extension-heading"
import { ListItem } from "@tiptap/extension-list"
import Paragraph from "@tiptap/extension-paragraph"
import type { Node as ProseNode, NodeRange, ResolvedPos } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { holdObserver } from "@/editor/page-grid"

export const INDENT_MAX = 8
export const INDENT_STEP_PX = 24
const LIST_INDENT_STEP = "1.75em"

const BULLET_MARKERS = ["disc", "circle", "square"]
const ORDERED_MARKERS = ["decimal", "lower-alpha", "lower-roman"]

const listMarkerKey = new PluginKey<DecorationSet>("listMarkers")

export function clampIndent(value: unknown) {
  const indent = Number(value)
  if (!Number.isInteger(indent) || indent <= 0) {
    return 0
  }
  return Math.min(INDENT_MAX, indent)
}

function indentAttribute() {
  return {
    default: 0,
    parseHTML: (element: HTMLElement) => clampIndent(element.getAttribute("data-indent")),
    renderHTML: (attributes: { indent?: number }) => {
      const indent = clampIndent(attributes.indent)
      if (indent <= 0) {
        return {}
      }
      return {
        "data-indent": String(indent),
        style: `margin-left: ${indent * INDENT_STEP_PX}px`,
      }
    },
  }
}

function listIndentAttribute() {
  return {
    default: 0,
    parseHTML: (element: HTMLElement) => clampIndent(element.getAttribute("data-indent")),
    renderHTML: (attributes: { indent?: number }) => {
      const indent = clampIndent(attributes.indent)
      if (indent <= 0) {
        return {}
      }
      return {
        "data-indent": String(indent),
        // A list from Word steps by its own levels' indent.
        style: `margin-left: calc(${indent} * var(--list-indent-step, ${LIST_INDENT_STEP}))`,
      }
    },
  }
}

export const IndentedParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute(),
      tabStops: tabStopsAttribute(),
      ...blockFormatAttributes(),
    }
  },
})

export const IndentedHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute(),
      tabStops: tabStopsAttribute(),
      ...blockFormatAttributes(),
    }
  },
})

export const IndentedListItem = ListItem.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      indent: listIndentAttribute(),
    }
  },

  addKeyboardShortcuts() {
    const shortcuts = this.parent?.() ?? {}
    delete shortcuts.Tab
    delete shortcuts["Shift-Tab"]
    return shortcuts
  },
})

export const IndentKeymap = Extension.create({
  name: "indentKeymap",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Tab: () => indentFromKeyboard(this.editor, 1),
      "Shift-Tab": () => indentFromKeyboard(this.editor, -1),
    }
  },

  addProseMirrorPlugins() {
    return [listMarkerPlugin()]
  },
})

function indentFromKeyboard(editor: Editor, direction: 1 | -1) {
  if (editor.isActive("table")) {
    return false
  }
  if (direction > 0 && insertAlignedTab(editor)) {
    return true
  }
  if (!editor.isActive("listItem") && !editor.isActive("paragraph") && !editor.isActive("heading")) {
    return false
  }
  changeIndent(editor, direction)
  return true
}

export function setListLevel(editor: Editor, level: number) {
  restoreSelection(editor)
  const target = Math.max(0, Math.min(INDENT_MAX, Math.floor(level)))
  for (let guard = 0; guard < 16; guard += 1) {
    const current = itemLevel(editor)
    if (current == null || current === target) {
      break
    }
    changeIndent(editor, current < target ? 1 : -1)
  }
  editor.commands.focus()
}

function itemLevel(editor: Editor) {
  const { $from } = editor.state.selection
  let depth = 0
  let indent = 0
  let found = false
  for (let level = $from.depth; level > 0; level -= 1) {
    const node = $from.node(level)
    if (node.type.name !== "listItem") {
      continue
    }
    if (!found) {
      indent = clampIndent(node.attrs.indent)
      found = true
    }
    depth += 1
  }
  if (!found) {
    return null
  }
  return depth - 1 + indent
}

export function changeIndent(editor: Editor, direction: 1 | -1) {
  restoreSelection(editor)
  const range = listRange(editor)
  if (range) {
    applyListIndent(editor, range, direction)
  } else if (!editor.isActive("listItem")) {
    applyBlockIndent(editor, direction)
  }
  editor.commands.focus()
}

function listRange(editor: Editor) {
  const { $from, $to } = editor.state.selection
  if (!insideListItem($from) || !insideListItem($to)) {
    return null
  }
  return $from.blockRange($to, (node) => {
    return node.childCount > 0 && node.firstChild?.type.name === "listItem"
  })
}

function insideListItem($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "listItem") {
      return true
    }
  }
  return false
}

function structuralDepth($pos: ResolvedPos) {
  let items = 0
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "listItem") {
      items += 1
    }
  }
  return Math.max(0, items - 1)
}

function applyListIndent(editor: Editor, range: NodeRange, direction: 1 | -1) {
  if (direction > 0) {
    if (range.startIndex > 0) {
      if (structuralDepth(range.$from) >= INDENT_MAX) {
        return
      }
      editor.chain().sinkListItem("listItem").run()
      return
    }
    // A leading item has no previous sibling to nest under. Step its own
    // list level so the marker and offset still change.
    shiftListIndent(editor, range, 1)
    return
  }

  if (rangeHasExtraIndent(range)) {
    shiftListIndent(editor, range, -1)
    return
  }
  editor.chain().liftListItem("listItem").run()
}

function rangeHasExtraIndent(range: NodeRange) {
  for (let index = range.startIndex; index < range.endIndex; index += 1) {
    const child = range.parent.child(index)
    if (child.type.name === "listItem" && clampIndent(child.attrs.indent) > 0) {
      return true
    }
  }
  return false
}

function shiftListIndent(editor: Editor, range: NodeRange, direction: 1 | -1) {
  const depth = structuralDepth(range.$from)
  const parentPos = range.$from.before(range.depth)
  let childPos = parentPos + 1
  const updates: { pos: number; indent: number }[] = []

  range.parent.forEach((child) => {
    const selected = childPos >= range.start && childPos < range.end
    if (selected && child.type.name === "listItem") {
      const current = clampIndent(child.attrs.indent)
      const next = current + direction
      if (next >= 0 && depth + next <= INDENT_MAX && next !== current) {
        updates.push({ pos: childPos, indent: next })
      }
    }
    childPos += child.nodeSize
  })

  if (updates.length === 0) {
    return
  }

  let transaction = editor.state.tr
  for (const update of updates) {
    const node = transaction.doc.nodeAt(update.pos)
    if (!node) {
      continue
    }
    transaction = transaction.setNodeMarkup(update.pos, undefined, {
      ...node.attrs,
      indent: update.indent,
    })
  }
  editor.view.dispatch(transaction.scrollIntoView())
}

function applyBlockIndent(editor: Editor, direction: 1 | -1) {
  const { state } = editor
  const { from, to } = state.selection
  const updates: { pos: number; indent: number }[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "paragraph" && node.type.name !== "heading") {
      return
    }
    if (insideListItem(state.doc.resolve(pos))) {
      return false
    }
    const current = clampIndent(node.attrs.indent)
    const next = Math.min(INDENT_MAX, Math.max(0, current + direction))
    if (next !== current) {
      updates.push({ pos, indent: next })
    }
  })
  if (updates.length === 0) {
    return
  }

  let transaction = state.tr
  for (const update of updates) {
    const node = transaction.doc.nodeAt(update.pos)
    if (!node) {
      continue
    }
    transaction = transaction.setNodeMarkup(update.pos, undefined, {
      ...node.attrs,
      indent: update.indent,
    })
  }
  editor.view.dispatch(transaction.scrollIntoView())
}

function markerFor(kind: "bullet" | "ordered", level: number) {
  const sequence = kind === "bullet" ? BULLET_MARKERS : ORDERED_MARKERS
  const index = ((level % sequence.length) + sequence.length) % sequence.length
  return sequence[index]
}

function listMarkerPlugin() {
  return new Plugin<DecorationSet>({
    key: listMarkerKey,
    state: {
      init(_, state) {
        return listMarkers(state.doc)
      },
      apply(tr, value) {
        if (!tr.docChanged) {
          return value.map(tr.mapping, tr.doc)
        }
        return listMarkers(tr.doc)
      },
    },
    props: {
      decorations(state) {
        return listMarkerKey.getState(state) ?? DecorationSet.empty
      },
    },
    view(view) {
      let frame = 0
      const schedule = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => fitWordMarkers(view))
      }
      schedule()
      return {
        update: schedule,
        destroy: () => cancelAnimationFrame(frame),
      }
    },
  })
}

const PT = 96 / 72
let measureContext: CanvasRenderingContext2D | null | undefined

/**
 * Word's tab after a list marker. The text starts at the item's indent when the marker ends before it; a marker that
 * runs past it (or one with no hanging indent) sends the text on to the next tab stop of the paragraph's own, or the
 * document's default ones, all measured from the margin. A centred or right-aligned marker sits on, or ends at, the
 * first line's start; one followed by a space or nothing has the text straight after it. The marker's box takes the
 * width to that point (`--word-box`), and the marker is moved within it for its alignment (`--word-shift`).
 */
export function fitWordMarkers(view: EditorView) {
  if (view.isDestroyed) {
    return
  }
  const items = view.dom.querySelectorAll<HTMLElement>("li[data-word-marker]")
  // Nothing is laid out (a headless editor): there is nothing to measure.
  if (items.length === 0 || view.dom.offsetWidth === 0) {
    return
  }
  measureContext ??= document.createElement("canvas").getContext("2d")
  const context = measureContext
  if (!context) {
    return
  }
  const origin = view.dom.getBoundingClientRect()
  const scale = origin.width / view.dom.offsetWidth
  if (!Number.isFinite(scale) || scale <= 0) {
    return
  }
  const changes: { item: HTMLElement; box: string; shift: string }[] = []
  items.forEach((item) => {
    const first = item.firstElementChild
    if (!(first instanceof HTMLElement)) {
      return
    }
    const marker = getComputedStyle(first, "::before")
    context.font = `${marker.fontStyle} ${marker.fontWeight} ${marker.fontSize} ${marker.fontFamily}`
    const width = context.measureText(item.dataset.wordText ?? "").width
    const hang = (Number(item.dataset.wordHang) || 0) * PT
    const tab = (Number(item.dataset.wordTab) || 36) * PT
    // Where the item's text starts, from the margin.
    const left = (first.getBoundingClientRect().left - origin.left) / scale
    const start = left - hang
    const justify = item.dataset.wordJustify
    const shift = justify === "right" ? -width : justify === "center" ? -width / 2 : 0
    const end = start + shift + width
    let box: number
    if (item.dataset.wordSuffix === "nothing") {
      box = Math.max(0, end - start)
    } else if (item.dataset.wordSuffix === "space") {
      box = Math.max(0, end - start) + context.measureText(" ").width
    } else {
      let stop = left
      if (end > left - 0.5) {
        const own = (first.dataset.tabStops ?? "")
          .split(",")
          .map((entry) => parseFloat(entry))
          .filter((value) => Number.isFinite(value) && value > end + 0.5)
          .sort((a, b) => a - b)
        stop = own[0] ?? (Math.floor((end + 0.5) / tab) + 1) * tab
      }
      box = Math.max(0, stop - start)
    }
    const boxValue = `${Math.round(box * 100) / 100}px`
    const shiftValue = shift ? `${Math.round(shift * 100) / 100}px` : ""
    if (
      item.style.getPropertyValue("--word-box") !== boxValue ||
      item.style.getPropertyValue("--word-shift") !== shiftValue
    ) {
      changes.push({ item, box: boxValue, shift: shiftValue })
    }
  })
  if (changes.length === 0) {
    return
  }
  holdObserver(view, () => {
    for (const change of changes) {
      change.item.style.setProperty("--word-box", change.box)
      if (change.shift) {
        change.item.style.setProperty("--word-shift", change.shift)
      } else {
        change.item.style.removeProperty("--word-shift")
      }
    }
  })
}

function listMarkers(doc: ProseNode) {
  const decorations: Decoration[] = []

  const visit = (
    node: ProseNode,
    pos: number,
    depth: number,
    kind: "bullet" | "ordered" | null,
    scheme: string | null,
    marker: string | null,
    word: WordNumbering | null = null,
  ) => {
    if (node.type.name === "bulletList" || node.type.name === "orderedList") {
      const nextKind = node.type.name === "bulletList" ? "bullet" : "ordered"
      const ownScheme = typeof node.attrs.scheme === "string" && node.attrs.scheme ? node.attrs.scheme : scheme
      const ownMarker = typeof node.attrs.marker === "string" && node.attrs.marker ? node.attrs.marker : null
      // A list from Word numbers its items by Word's levels, unless a marker has been picked for it since.
      const levels = ownMarker ? [] : parseWordLevels(node.attrs.wordLevels)
      const start = Number(node.attrs.start)
      const ownWord =
        levels.length > 0
          ? new WordNumbering(
              levels,
              node.type.name === "orderedList" && start > 0 ? start : undefined,
              Number(node.attrs.wordTab) > 0 ? Number(node.attrs.wordTab) : undefined,
            )
          : ownMarker
            ? null
            : word
      node.forEach((child, offset) => visit(child, pos + 1 + offset, depth, nextKind, ownScheme, ownMarker, ownWord))
      return
    }

    if (node.type.name === "listItem" && kind && word) {
      const drawn = word.next(depth + clampIndent(node.attrs.indent))
      if (drawn) {
        const { level } = drawn
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            "data-word-marker": "",
            // What `fitWordMarkers` needs to place the text after the marker as Word's tab does.
            "data-word-text": drawn.text,
            "data-word-hang": String(level.hang),
            "data-word-tab": String(word.tab),
            ...(level.justify ? { "data-word-justify": level.justify } : {}),
            ...(level.suffix ? { "data-word-suffix": level.suffix } : {}),
            style: [
              "list-style-type: none",
              `--word-marker: ${cssString(drawn.text)}`,
              `--word-hang: ${level.hang}pt`,
              drawn.font ? `--word-marker-font: ${cssString(drawn.font)}` : "",
              level.size ? `--word-marker-size: ${level.size}pt` : "",
              level.color ? `--word-marker-color: ${level.color}` : "",
              level.bold !== undefined ? `--word-marker-weight: ${level.bold ? 700 : 400}` : "",
              level.italic ? "--word-marker-style: italic" : "",
            ]
              .filter(Boolean)
              .join("; "),
          }),
        )
      }
      node.forEach((child, offset) => visit(child, pos + 1 + offset, depth + 1, kind, scheme, null, word))
      return
    }

    if (node.type.name === "listItem" && kind) {
      if (!(scheme === "legal" && kind === "ordered")) {
        const level = depth + clampIndent(node.attrs.indent)
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            style: `list-style-type: ${marker ?? markerFor(kind, level)}`,
          }),
        )
      }
      node.forEach((child, offset) => visit(child, pos + 1 + offset, depth + 1, kind, scheme, null))
      return
    }

    node.forEach((child, offset) => visit(child, pos + 1 + offset, depth, kind, scheme, marker, word))
  }

  doc.forEach((child, offset) => visit(child, offset, 0, null, null, null))
  return DecorationSet.create(doc, decorations)
}
