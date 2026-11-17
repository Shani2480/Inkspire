import { Extension } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

/**
 * Word draws paragraphs that follow each other with the same borders and indents as one box (U27): the top line
 * over the first, the bottom line under the last, the sides running through the space between them, and the
 * between line (w:between, Inside Horizontal Border) between each two. Each paragraph is told whether it joins the
 * one before and the one after (`data-border-join`), and how far the next one is (`--para-join-gap`), so its side
 * lines can reach it; the gaps are measured after each draw.
 */

const BLOCKS = new Set(["paragraph", "heading"])
const KEY_ATTRS = [
  "border",
  "borderPen",
  "borderSides",
  "borderBetween",
  "borderShadow",
  "borderFrame",
  "borderSpace",
  "indent",
  "indentRight",
] as const

function boxKey(node: ProseNode) {
  if (!BLOCKS.has(node.type.name)) {
    return null
  }
  const { border, borderBetween } = node.attrs
  if ((!border || border === "none") && !borderBetween) {
    return null
  }
  return JSON.stringify(KEY_ATTRS.map((name) => node.attrs[name] ?? null))
}

type Joins = Map<number, { prev: boolean; next: boolean }>

/** Which boxed paragraphs join their neighbours, by position. */
export function boxJoins(doc: ProseNode): Joins {
  const joins: Joins = new Map()
  const visit = (parent: ProseNode, start: number) => {
    let previous: { pos: number; key: string } | null = null
    parent.forEach((child, offset) => {
      const pos = start + offset
      const key = boxKey(child)
      if (key && previous && previous.key === key) {
        joins.get(previous.pos)!.next = true
        joins.set(pos, { prev: true, next: false })
      } else if (key) {
        joins.set(pos, { prev: false, next: false })
      }
      previous = key ? { pos, key } : null
      if (!child.isTextblock && child.childCount > 0) {
        visit(child, pos + 1)
      }
    })
  }
  visit(doc, 0)
  return joins
}

type GroupState = { joins: Joins; gaps: Map<number, number>; decorations: DecorationSet }

const key = new PluginKey<GroupState>("paragraphBoxGroups")

function build(doc: ProseNode, gaps: Map<number, number>): GroupState {
  const joins = boxJoins(doc)
  const decorations: Decoration[] = []
  for (const [pos, join] of joins) {
    if (!join.prev && !join.next) {
      continue
    }
    const node = doc.nodeAt(pos)
    if (!node) {
      continue
    }
    const gap = join.next ? (gaps.get(pos) ?? 0) : 0
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        "data-border-join": [join.prev ? "prev" : "", join.next ? "next" : ""].filter(Boolean).join(" "),
        ...(gap > 0 ? { style: `--para-join-gap: ${gap}px` } : {}),
      }),
    )
  }
  return { joins, gaps, decorations: decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty }
}

/** The space between each joined paragraph and the next, as drawn (layout pixels, unaffected by zoom). */
function measure(view: EditorView, state: EditorState) {
  const gaps = new Map<number, number>()
  for (const [pos, join] of key.getState(state)?.joins ?? []) {
    if (!join.next) {
      continue
    }
    const element = view.nodeDOM(pos)
    const next = element instanceof HTMLElement ? element.nextElementSibling : null
    if (
      !(element instanceof HTMLElement) ||
      !(next instanceof HTMLElement) ||
      next.offsetParent !== element.offsetParent
    ) {
      continue
    }
    const gap = next.offsetTop - (element.offsetTop + element.offsetHeight)
    // Across a page break the next paragraph is far away: the box stops at the page.
    if (gap > 0 && gap < 200) {
      gaps.set(pos, Math.round(gap * 10) / 10)
    }
  }
  return gaps
}

function sameGaps(left: Map<number, number>, right: Map<number, number>) {
  return left.size === right.size && [...left].every(([pos, gap]) => Math.abs((right.get(pos) ?? -1) - gap) < 0.5)
}

export const ParagraphBoxGroups = Extension.create({
  name: "paragraphBoxGroups",

  addProseMirrorPlugins() {
    return [
      new Plugin<GroupState>({
        key,
        state: {
          init: (_, state) => build(state.doc, new Map()),
          apply: (tr, old) => {
            const gaps = tr.getMeta(key) as Map<number, number> | undefined
            if (gaps) {
              return build(tr.doc, gaps)
            }
            if (!tr.docChanged) {
              return old
            }
            const mapped = new Map<number, number>()
            for (const [pos, gap] of old.gaps) {
              mapped.set(tr.mapping.map(pos), gap)
            }
            return build(tr.doc, mapped)
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
        },
        view: (view) => {
          let frame = 0
          const check = () => {
            frame = 0
            const state = key.getState(view.state)
            if (!state || [...state.joins.values()].every((join) => !join.next)) {
              return
            }
            const gaps = measure(view, view.state)
            if (!sameGaps(gaps, state.gaps)) {
              view.dispatch(view.state.tr.setMeta(key, gaps).setMeta("addToHistory", false))
            }
          }
          const schedule = () => {
            if (!frame && typeof requestAnimationFrame !== "undefined") {
              frame = requestAnimationFrame(check)
            }
          }
          schedule()
          return {
            update: schedule,
            destroy: () => {
              if (frame) {
                cancelAnimationFrame(frame)
              }
            },
          }
        },
      }),
    ]
  },
})
