import { Extension } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { singleLine } from "@/document/docx/word-styles"
import { wordDescent } from "@/document/line-lead"
import { isFloating } from "@/editor/objects"

/**
 * index.css places the text in its lines as Word does by trimming each paragraph to its own font
 * (document/line-lead.ts). A paragraph whose text all has one size or font of its own takes it on here, so the trim
 * is measured from that text; one whose lines hold something taller than the rest (an inline picture or object,
 * runs of different sizes) is marked data-word-tall and not trimmed, as a taller first line would otherwise spill
 * over the paragraph above. One with an object keeps the browser's placement; one with runs of different sizes is
 * also marked data-word-mixed, its text in .word-lead-run boxes that index.css places as Word does.
 */
const TEXT_LIKE = new Set([
  "text",
  "hardBreak",
  "docTab",
  "bookmark",
  "dateField",
  "formulaField",
  "ifField",
  "wordField",
  "wordInline",
  "note",
  "docxRun",
])

/**
 * How a paragraph's lines are placed: "tall" when they hold something taller than the paragraph's text (an inline
 * picture or object, or runs of different sizes or fonts); otherwise the size and font all of its text has, if any, which
 * the paragraph takes on so the line placement is measured from that text.
 */
export function leadOf(
  block: ProseNode,
): { tall: true; mixed?: true } | { tall: false; size?: string; family?: string } {
  let tall = false
  const sizes = new Set<string | undefined>()
  const families = new Set<string | undefined>()
  block.descendants((node) => {
    if (tall) {
      return false
    }
    if (node.isText) {
      const style = node.marks.find((mark) => mark.type.name === "textStyle")
      sizes.add((style?.attrs.fontSize as string | null | undefined) || undefined)
      families.add((style?.attrs.fontFamily as string | null | undefined) || undefined)
    } else if (node.isInline && !TEXT_LIKE.has(node.type.name) && !isFloating(node)) {
      tall = true
    }
    return false
  })
  if (tall) {
    return { tall: true }
  }
  if (sizes.size > 1 || families.size > 1) {
    // Only text of different sizes or fonts: each run is placed as Word does (document/line-lead.ts
    // multipleLineVars). A line holding a font whose single line is taller (Segoe UI in Calibri text) is as tall as
    // that font's line, its text where that font's ascent puts it (checked in Word 2026-11-19).
    return { tall: true, mixed: true }
  }
  const [size] = sizes
  const [family] = families.size === 1 ? families : [undefined]
  return { tall: false, size, family }
}

/** The first family of a CSS font list, unquoted: the Word font it stands for. */
function firstFamily(list: string) {
  return list
    .split(",")[0]!
    .trim()
    .replace(/^["']|["']$/g, "")
}

function attributesFor(block: ProseNode): Record<string, string> | null {
  const lead = leadOf(block)
  if (lead.tall) {
    return lead.mixed ? { "data-word-tall": "", "data-word-mixed": "" } : { "data-word-tall": "" }
  }
  const style: string[] = []
  if (lead.size) {
    style.push(`font-size: ${lead.size}`)
  }
  if (lead.family) {
    const face = firstFamily(lead.family)
    style.push(`--word-single-line: ${singleLine(face)}`, `--word-descent: ${wordDescent(face)}`)
  }
  return style.length > 0 ? { style: style.join("; ") } : null
}

function leadBox(line: number | null) {
  const box = document.createElement("span")
  box.className = "word-lead-run"
  if (line !== null) {
    box.style.setProperty("--word-single-line", String(line))
  }
  return box
}

function decorate(doc: ProseNode, from = 0, to = doc.content.size, set = DecorationSet.empty) {
  const added: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    const attributes = attributesFor(node)
    if (attributes) {
      added.push(Decoration.node(pos, pos + node.nodeSize, attributes))
    }
    if (attributes && "data-word-mixed" in attributes) {
      // Each piece of text in a box of its own, so the page can place it in its line (.word-lead-run, index.css).
      node.forEach((child, offset) => {
        const from = pos + 1 + offset
        // A run in another font has that font's single line, as in Word.
        const family = child.marks.find((mark) => mark.type.name === "textStyle")?.attrs.fontFamily as
          string | null | undefined
        const line = family ? singleLine(firstFamily(family)) : null
        if (child.isText) {
          const own = line === null ? {} : { style: `--word-single-line: ${line}` }
          added.push(Decoration.inline(from, from + child.nodeSize, { class: "word-lead-run", ...own }))
        } else if (child.type.name === "hardBreak") {
          // A line break alone on its line gives it no height: an empty box after it does, in the break's font.
          added.push(
            Decoration.widget(from + child.nodeSize, () => leadBox(line), {
              side: -1,
              key: `word-lead-break-${line ?? ""}`,
            }),
          )
        }
      })
    }
    return false
  })
  return set.add(doc, added)
}

const key = new PluginKey<DecorationSet>("wordLead")

export const WordLead = Extension.create({
  name: "wordLead",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state: EditorState) => decorate(state.doc),
          apply(tr, old) {
            if (!tr.docChanged) {
              return old
            }
            // Only the paragraphs a change touched are looked at again.
            let set = old.map(tr.mapping, tr.doc)
            const ranges: [number, number][] = []
            tr.mapping.maps.forEach((map, index) => {
              map.forEach((_oldStart, _oldEnd, start, end) => {
                const rest = tr.mapping.slice(index + 1)
                ranges.push([rest.map(start, -1), rest.map(end, 1)])
              })
            })
            for (const [start, end] of ranges) {
              const from = Math.max(0, Math.min(start, tr.doc.content.size))
              const to = Math.max(from, Math.min(end, tr.doc.content.size))
              const $from = tr.doc.resolve(from)
              const $to = tr.doc.resolve(to)
              const a = $from.depth > 0 ? $from.before(1) : from
              const b = $to.depth > 0 ? $to.after(1) : to
              set = set.remove(set.find(a, b))
              set = decorate(tr.doc, a, b, set)
            }
            return set
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ]
  },
})
