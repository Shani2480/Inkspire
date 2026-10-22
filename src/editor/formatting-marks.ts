import { useEditingOptions, type EditingOptions } from "@/document/editing-options"
import { useViewStore } from "@/document/view"
import { Extension } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const SPACE = 32
const TAB = 9
const NBSP = 160
const SOFT_HYPHEN = 0xad

const MARK_OPTIONS = [
  "marksTabs",
  "marksSpaces",
  "marksParagraph",
  "marksHidden",
  "marksHyphens",
  "marksAnchors",
] as const

/** True when any mark is drawn: Show/Hide ¶ is on (all of them), or one is chosen in Options > Display. */
export function anyMarkShown(show: boolean, options: Pick<EditingOptions, (typeof MARK_OPTIONS)[number]>) {
  return show || MARK_OPTIONS.some((name) => options[name])
}

/** The classes for the page: `formatting-marks` for all marks, or one `fm-…` class for each mark chosen on its own. */
export function formattingMarkClasses(show: boolean, options: Pick<EditingOptions, (typeof MARK_OPTIONS)[number]>) {
  if (show) {
    return "formatting-marks"
  }
  return [
    options.marksTabs && "fm-tabs",
    options.marksSpaces && "fm-spaces",
    options.marksParagraph && "fm-paras",
    options.marksHidden && "fm-hidden",
    options.marksHyphens && "fm-hyphens",
    options.marksAnchors && "fm-anchors",
  ]
    .filter(Boolean)
    .join(" ")
}

/**
 * The paragraphs floating objects are anchored to: the block that follows each object that is not in line with the
 * text. With object anchors shown, each gets Word's anchor mark in the margin beside it.
 */
export function anchorParagraphs(doc: ProseNode) {
  const anchors: { from: number; to: number }[] = []
  const walk = (parent: ProseNode, base: number) => {
    let pending = false
    parent.forEach((child, offset) => {
      const pos = base + offset
      if (pending && child.isBlock) {
        anchors.push({ from: pos, to: pos + child.nodeSize })
        pending = false
      }
      const wrap = child.attrs.wrap
      if (child.isBlock && typeof wrap === "string" && wrap !== "inline") {
        pending = true
      } else if (child.isBlock && !child.isTextblock) {
        walk(child, pos + 1)
      }
    })
  }
  walk(doc, 0)
  return anchors
}

export const FormattingMarks = Extension.create({
  name: "formattingMarks",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("formattingMarks"),
        props: {
          decorations(state) {
            if (!anyMarkShown(useViewStore.getState().showFormattingMarks, useEditingOptions.getState())) {
              return null
            }

            const decorations: Decoration[] = []
            for (const anchor of anchorParagraphs(state.doc)) {
              decorations.push(Decoration.node(anchor.from, anchor.to, { class: "fmt-anchor" }))
            }
            state.doc.descendants((node, pos) => {
              if (node.type.name === "docTab") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "fmt-tab",
                    "data-fmt": String(pos),
                  }),
                )
                return
              }

              if (node.type.name === "hardBreak") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "fmt-break",
                    "data-fmt": String(pos),
                  }),
                )
                return
              }

              if (node.type.name === "pageBreak") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "fmt-page-break",
                    "data-fmt": String(pos),
                  }),
                )
                return false
              }

              if (!node.isText || !node.text) {
                return
              }

              for (let index = 0; index < node.text.length; index += 1) {
                const code = node.text.charCodeAt(index)
                let className: string | null = null
                if (code === SPACE) {
                  className = "fmt-space"
                } else if (code === TAB) {
                  className = "fmt-tab"
                } else if (code === NBSP) {
                  className = "fmt-nbsp"
                } else if (code === SOFT_HYPHEN) {
                  className = "fmt-hyphen"
                }
                if (!className) {
                  continue
                }
                const from = pos + index
                decorations.push(
                  Decoration.inline(from, from + 1, {
                    class: className,
                    "data-fmt": String(from),
                  }),
                )
              }
            })

            if (decorations.length === 0) {
              return null
            }
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
