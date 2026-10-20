import { decimalSeparator, readLocale } from "@/document/measure"
import { Extension, Node, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

export type TabAlign = "left" | "center" | "right" | "decimal"

export type TabStop = {
  id: string
  /** CSS pixels from the left edge of the printable area. Same origin as paragraph indent. */
  position: number
  align: TabAlign
  /** What fills the space up to the stop, as in a table of contents. */
  leader?: TabLeader
}

export type TabLeader = "dot" | "hyphen" | "underscore" | "middleDot"
const LEADERS = new Set<TabLeader>(["dot", "hyphen", "underscore", "middleDot"])

const ALIGNS = new Set<TabAlign>(["left", "center", "right", "decimal"])
const DEFAULT_TAB_PX = 48
/** DOM Node.DOCUMENT_POSITION_FOLLOWING; this module's Node is TipTap's. */
const FOLLOWING = 4
const tabStopKey = new PluginKey("tabStops")

export const DocTab = Node.create({
  name: "docTab",
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,

  parseHTML() {
    return [{ tag: "span[data-tab]" }]
  },

  renderHTML() {
    return ["span", { "data-tab": "1", class: "doc-tab" }]
  },

  extendNodeSchema(extension) {
    if (extension.name !== "docTab") {
      return {}
    }
    return { leafText: () => "\t" }
  },
})

export function tabStopsAttribute() {
  return {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-tab-stops"),
    renderHTML: (attributes: { tabStops?: string | null }) => {
      const encoded = serializeTabStops(parseTabStops(attributes.tabStops))
      if (!encoded) {
        return {}
      }
      return { "data-tab-stops": encoded }
    },
  }
}

export function parseTabStops(value: unknown): TabStop[] {
  if (typeof value !== "string" || !value.trim()) {
    return []
  }
  const stops: TabStop[] = []
  for (const part of value.split(",")) {
    const [positionText, alignText, leaderText] = part.split(":")
    const position = Number(positionText)
    if (!ALIGNS.has(alignText as TabAlign) || !Number.isFinite(position) || position < 0) {
      continue
    }
    const align = alignText as TabAlign
    const rounded = Math.round(position * 10) / 10
    const leader = LEADERS.has(leaderText as TabLeader) ? (leaderText as TabLeader) : undefined
    stops.push({ id: `${align}-${Math.round(rounded * 10)}`, position: rounded, align, ...(leader ? { leader } : {}) })
  }
  stops.sort((left, right) => left.position - right.position)
  const unique: TabStop[] = []
  for (const stop of stops) {
    const previous = unique[unique.length - 1]
    if (previous && Math.abs(previous.position - stop.position) < 1) {
      continue
    }
    unique.push(stop)
  }
  return unique
}

export function serializeTabStops(stops: TabStop[]) {
  if (stops.length === 0) {
    return null
  }
  return [...stops]
    .sort((left, right) => left.position - right.position)
    .map((stop) => `${Math.round(stop.position * 10) / 10}:${stop.align}${stop.leader ? `:${stop.leader}` : ""}`)
    .join(",")
}

export function clampTabPosition(position: number, contentWidth: number) {
  if (!Number.isFinite(position)) {
    return 0
  }
  const clamped = Math.min(Math.max(0, contentWidth), Math.max(0, position))
  return Math.round(clamped * 10) / 10
}

export function activeTextBlock(editor: Editor) {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      return { node, pos: $from.before(depth) }
    }
  }
  return null
}

export function insertAlignedTab(editor: Editor) {
  if (editor.isActive("listItem") || editor.isActive("table")) {
    return false
  }
  if (!editor.isActive("paragraph") && !editor.isActive("heading")) {
    return false
  }
  const block = activeTextBlock(editor)
  if (!block) {
    return false
  }
  const tab = editor.schema.nodes.docTab
  if (!tab) {
    return false
  }
  return editor.chain().focus().insertContent({ type: "docTab" }).run()
}

export function addTabStop(editor: Editor, position: number, align: TabAlign, contentWidth: number) {
  const next = clampTabPosition(position, contentWidth)
  updateTabStops(editor, (stops) => {
    if (stops.some((stop) => Math.abs(stop.position - next) < 2)) {
      return stops
    }
    return [...stops, { id: `${align}-${Math.round(next * 10)}`, position: next, align }]
  })
}

export function moveTabStop(editor: Editor, from: number, to: number, contentWidth: number) {
  const next = clampTabPosition(to, contentWidth)
  updateTabStops(editor, (stops) =>
    stops.map((stop) => (Math.abs(stop.position - from) < 1.5 ? { ...stop, position: next } : stop)),
  )
}

export function removeTabStop(editor: Editor, position: number) {
  updateTabStops(editor, (stops) => stops.filter((stop) => Math.abs(stop.position - position) >= 1.5))
}

export const TabStops = Extension.create({
  name: "tabStops",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tabStopKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null
          }
          const ranges = rawTabRanges(newState.doc)
          const tab = newState.schema.nodes.docTab
          if (ranges.length === 0 || !tab) {
            return null
          }
          let next = newState.tr
          for (let index = ranges.length - 1; index >= 0; index -= 1) {
            const range = ranges[index]
            next = next.replaceWith(range.from, range.to, tab.create())
          }
          return next
        },
        view(view) {
          const replaceRawTabs = () => {
            if (view.isDestroyed) {
              return
            }
            const ranges = rawTabRanges(view.state.doc)
            const tab = view.state.schema.nodes.docTab
            if (ranges.length === 0 || !tab) {
              return
            }
            let next = view.state.tr
            for (let index = ranges.length - 1; index >= 0; index -= 1) {
              const range = ranges[index]
              next = next.replaceWith(range.from, range.to, tab.create())
            }
            view.dispatch(next)
          }
          const layout = () => {
            if (view.isDestroyed) {
              return
            }
            if (rawTabRanges(view.state.doc).length > 0) {
              replaceRawTabs()
              return
            }
            layoutTabStops(view)
          }
          queueMicrotask(layout)
          return {
            update(nextView, previous) {
              if (previous.doc.eq(nextView.state.doc)) {
                return
              }
              queueMicrotask(layout)
            },
          }
        },
      }),
    ]
  },
})

function rawTabRanges(doc: ProseNode) {
  const ranges: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return
    }
    for (let index = 0; index < node.text.length; index += 1) {
      if (node.text[index] === "\t") {
        ranges.push({ from: pos + index, to: pos + index + 1 })
      }
    }
  })
  return ranges
}

function updateTabStops(editor: Editor, update: (stops: TabStop[]) => TabStop[]) {
  if (editor.isDestroyed) {
    return
  }
  const blocks = tabStopLines(editor)
  if (blocks.length === 0) {
    return
  }
  let transaction = editor.state.tr
  for (const block of blocks) {
    const current = transaction.doc.nodeAt(block.pos)
    if (!current) {
      continue
    }
    const encoded = serializeTabStops(update(parseTabStops(current.attrs.tabStops)))
    if ((current.attrs.tabStops ?? null) === encoded) {
      continue
    }
    transaction = transaction.setNodeMarkup(block.pos, undefined, {
      ...current.attrs,
      tabStops: encoded,
    })
  }
  if (transaction.docChanged) {
    editor.view.dispatch(transaction)
  }
}

// A caret changes this line and every line after it. A selection changes only the selected lines.
function tabStopLines(editor: Editor) {
  const { empty, from, to } = editor.state.selection
  if (!empty) {
    const selected: { node: ProseNode; pos: number }[] = []
    editor.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === "paragraph" || node.type.name === "heading") {
        selected.push({ node, pos })
        return false
      }
    })
    return selected
  }
  const active = activeTextBlock(editor)
  if (!active) {
    return []
  }
  const onwards: { node: ProseNode; pos: number }[] = []
  let started = false
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph" && node.type.name !== "heading") {
      return
    }
    if (pos === active.pos) {
      started = true
    }
    if (started) {
      onwards.push({ node, pos })
    }
    return false
  })
  return onwards
}

let layingOut = false

function layoutTabStops(view: EditorView) {
  if (layingOut) {
    return
  }
  const editor = view.dom
  if (!(editor instanceof HTMLElement) || !editor.isConnected || rawTabRanges(view.state.doc).length > 0) {
    return
  }
  const separator = decimalSeparator(readLocale())
  layingOut = true
  try {
    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== "paragraph" && node.type.name !== "heading") {
        return
      }
      if (!node.childCount || !blockHasTab(node)) {
        return false
      }
      const stops = parseTabStops(node.attrs.tabStops)
      const dom = view.nodeDOM(pos)
      if (dom instanceof HTMLElement) {
        layoutBlock(dom, editor, stops, separator)
      }
      return false
    })
  } catch {
    // A mid-update DOM read can fail while the view is detaching.
  } finally {
    layingOut = false
  }
}

function blockHasTab(node: ProseNode) {
  let found = false
  node.descendants((child) => {
    if (child.type.name === "docTab") {
      found = true
      return false
    }
  })
  return found
}

function layoutBlock(block: HTMLElement, editor: HTMLElement, stops: TabStop[], separator: string) {
  const tabs = [...block.querySelectorAll<HTMLElement>(".doc-tab")]
  const limit = editor.clientWidth
  // In multi-page view each block is placed on its page (page-grid.ts) with its edge at the page's text margin, so
  // tabs measure from the block; otherwise from the editor, which is the text margin.
  const origin = block.dataset.gridPlaced ? block : editor
  for (let index = 0; index < tabs.length; index += 1) {
    const tab = tabs[index]
    const current = offsetWithin(tab, origin)
    const stop = resolveStop(stops, current)
    const run = stop.align === "left" ? { width: 0, decimalOffset: null } : measureRun(tab, tabs[index + 1], separator)
    const width = Math.min(limit, Math.round(spacerWidth(stop, current, run) * 100) / 100)
    const next = `${width}px`
    if (tab.style.width !== next) {
      tab.style.width = next
    }
    const leader = "leader" in stop ? stop.leader : undefined
    if (leader) {
      tab.dataset.leader = leader
    } else if (tab.dataset.leader) {
      delete tab.dataset.leader
    }
  }
}

function offsetWithin(element: HTMLElement, ancestor: HTMLElement) {
  let x = 0
  let current: HTMLElement | null = element
  let hops = 0
  while (current && current !== ancestor && hops < 12) {
    hops += 1
    x += current.offsetLeft
    const host: Element | null = current.offsetParent
    current = host instanceof HTMLElement ? host : null
  }
  return x
}

function resolveStop(stops: TabStop[], x: number) {
  const epsilon = 0.75
  const upcoming = stops.find((stop) => stop.position > x + epsilon)
  if (upcoming) {
    return upcoming
  }
  // No ruler stop is ahead of the caret. Each tab advances one standard tab width.
  return { position: x + DEFAULT_TAB_PX, align: "left" as const }
}

function spacerWidth(
  stop: { position: number; align: TabAlign },
  x: number,
  run: { width: number; decimalOffset: number | null },
) {
  let anchor = stop.position
  if (stop.align === "center") {
    anchor = stop.position - run.width / 2
  } else if (stop.align === "right") {
    anchor = stop.position - run.width
  } else if (stop.align === "decimal") {
    anchor = stop.position - (run.decimalOffset ?? run.width)
  }
  return Math.max(0, anchor - x)
}

function measureRun(tab: HTMLElement, next: HTMLElement | undefined, separator: string) {
  const block = tab.closest("p, h1, h2, h3")
  if (!(block instanceof HTMLElement)) {
    return { width: 0, decimalOffset: null }
  }
  const text = textAfterTab(tab, next).split(/[\n\r]/, 1)[0] ?? ""
  const separatorAt = decimalIndex(text, separator)
  return {
    width: renderedWidthAfter(tab, next, block) ?? measureText(text, block),
    decimalOffset: separatorAt == null ? null : measureText(text.slice(0, separatorAt), block),
  }
}

/**
 * Width of what the page shows between a tab and the next one (or the end of the paragraph), in its own fonts
 * and including fields and other atoms. Rects are summed, so text that currently wraps still counts in full.
 */
function renderedWidthAfter(tab: HTMLElement, next: HTMLElement | undefined, block: HTMLElement) {
  try {
    const range = document.createRange()
    range.setStartAfter(tab)
    if (next) {
      range.setEndBefore(next)
    } else {
      range.setEnd(block, block.childNodes.length)
    }
    // Text rects only: the rects of the elements around the text would count it twice.
    return textRectsWidth(range)
  } catch {
    return undefined
  }
}

function textRectsWidth(range: Range) {
  const root = range.commonAncestorContainer
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let width = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node) || !node.textContent) {
      continue
    }
    const part = document.createRange()
    part.selectNodeContents(node)
    if (node === range.startContainer) {
      part.setStart(node, range.startOffset)
    }
    if (node === range.endContainer) {
      part.setEnd(node, range.endOffset)
    }
    for (const rect of part.getClientRects()) {
      width += rect.width
    }
  }
  return width
}

function textAfterTab(tab: HTMLElement, next: HTMLElement | undefined) {
  const block = tab.closest("p, h1, h2, h3")
  if (!block) {
    return ""
  }
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let text = ""
  let node = walker.nextNode()
  while (node) {
    // The tab itself holds no text, so position decides what follows it.
    if (!(tab.compareDocumentPosition(node) & FOLLOWING) || tab.contains(node)) {
      node = walker.nextNode()
      continue
    }
    if (next && (next.contains(node) || next.compareDocumentPosition(node) & FOLLOWING)) {
      break
    }
    text += node.textContent ?? ""
    node = walker.nextNode()
  }
  return text
}

function measureText(sample: string, source: HTMLElement) {
  if (!sample) {
    return 0
  }
  const probe = document.createElement("span")
  const font = getComputedStyle(source).font
  probe.style.position = "absolute"
  probe.style.left = "0"
  probe.style.top = "0"
  probe.style.visibility = "hidden"
  probe.style.whiteSpace = "pre"
  probe.style.tabSize = "0"
  probe.style.font = font
  probe.textContent = sample
  document.body.appendChild(probe)
  const width = probe.offsetWidth
  probe.remove()
  return width
}

function decimalIndex(text: string, separator: string) {
  const line = text.split(/[\n\r]/, 1)[0] ?? ""
  const primary = line.indexOf(separator)
  if (primary >= 0) {
    return primary
  }
  const alternate = separator === "," ? "." : ","
  const fallback = line.indexOf(alternate)
  return fallback >= 0 ? fallback : null
}
