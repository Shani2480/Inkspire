import { textBoxAttributes, textBoxOfElement, type TextBox } from "@/document/docx/text-box"
import { effectCss } from "@/editor/text-effects"
import { Extension, getStyleProperty, Mark } from "@tiptap/core"
import Underline from "@tiptap/extension-underline"
import { underlineCss } from "@/document/underlines"
import type { MarkType, Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export const StyledUnderline = Underline.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // The underline type (document/underlines.ts): Single (solid) to Wave double, and Words only.
      style: {
        default: "solid",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-underline") || element.style.textDecorationStyle || "solid",
        renderHTML: (attributes: { style?: string; color?: string | null }) => {
          if ((!attributes.style || attributes.style === "solid") && !attributes.color) {
            return {}
          }
          return {
            style: underlineCss(attributes.style, attributes.color),
            "data-underline": attributes.style || "solid",
          }
        },
      },
      color: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-underline-color") || getStyleProperty(element, "text-decoration-color"),
        renderHTML: (attributes: { color?: string | null }) =>
          attributes.color ? { "data-underline-color": attributes.color } : {},
      },
    }
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), wordsOnlyUnderline(this.type)]
  },
})

/**
 * Words only: the mark draws no line, and each word under it gets its own, so the spaces between stay clear (Word's
 * w:u w:val="words"). CSS cannot take a line off part of an element, so the words are decorated instead.
 */
function wordsOnlyUnderline(type: MarkType) {
  const build = (doc: ProseNode) => {
    const decorations: Decoration[] = []
    doc.descendants((node, pos) => {
      if (!node.isText) {
        return
      }
      const mark = node.marks.find((item) => item.type === type && item.attrs.style === "words")
      if (!mark) {
        return
      }
      const color = typeof mark.attrs.color === "string" && mark.attrs.color ? mark.attrs.color : null
      for (const match of (node.text ?? "").matchAll(/\S+/g)) {
        decorations.push(
          Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
            class: "underline-word",
            style: underlineCss("solid", color),
          }),
        )
      }
    })
    return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty
  }
  const key = new PluginKey<DecorationSet>("wordsOnlyUnderline")
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_, state) => build(state.doc),
      // Only an edit can change which words are underlined.
      apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
    },
    props: {
      decorations: (state) => key.getState(state),
    },
  })
}

export const SubscriptMark = Mark.create({
  name: "subscript",
  excludes: "superscript",
  parseHTML: () => [{ tag: "sub" }],
  renderHTML: () => ["sub", { style: "font-size: 0.75em" }, 0],
})

export const SuperscriptMark = Mark.create({
  name: "superscript",
  excludes: "subscript",
  parseHTML: () => [{ tag: "sup" }],
  renderHTML: () => ["sup", { style: "font-size: 0.75em" }, 0],
})

/** Borders and Shading applied to text (22.4): a box round the run, Word's shadow, and its fill and pattern. */
export const TextBoxMark = Mark.create({
  name: "textBorder",
  addAttributes() {
    const attribute = <T>(fallback: T, read: (element: HTMLElement) => T) => ({
      default: fallback,
      parseHTML: read,
      renderHTML: () => ({}),
    })
    return {
      border: attribute<string | null>(null, (element) => textBoxOfElement(element).border),
      shadow: attribute(false, (element) => textBoxOfElement(element).shadow),
      fill: attribute<string | null>(null, (element) => textBoxOfElement(element).fill),
      pattern: attribute<string | null>(null, (element) => textBoxOfElement(element).pattern),
    }
  },
  parseHTML: () => [{ tag: "span[data-text-border]" }],
  renderHTML: ({ mark }) => ["span", textBoxAttributes(mark.attrs as TextBox), 0],
})

export const CharacterStyle = Extension.create({
  name: "characterStyle",

  addOptions() {
    return { types: ["textStyle"] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element: HTMLElement) => getStyleProperty(element, "letter-spacing"),
            renderHTML: (attributes: { letterSpacing?: string | null }) => {
              if (!attributes.letterSpacing) {
                return {}
              }
              return { style: `letter-spacing: ${attributes.letterSpacing}` }
            },
          },
          baseline: {
            default: null,
            parseHTML: (element: HTMLElement) => getStyleProperty(element, "vertical-align"),
            renderHTML: (attributes: { baseline?: string | null }) => {
              if (!attributes.baseline || attributes.baseline === "baseline") {
                return {}
              }
              return { style: `vertical-align: ${attributes.baseline}` }
            },
          },
          scale: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-scale"),
            renderHTML: (attributes: { scale?: string | null }) => {
              if (attributes.scale == null || attributes.scale === "") {
                return {}
              }
              const scale = Number(attributes.scale)
              if (!Number.isFinite(scale) || scale === 1) {
                return {}
              }
              return {
                "data-scale": String(scale),
                style: `display: inline-block; transform: scaleX(${scale}); transform-origin: left center`,
              }
            },
          },
          fontVariant: {
            default: null,
            parseHTML: (element: HTMLElement) => getStyleProperty(element, "font-variant"),
            renderHTML: (attributes: { fontVariant?: string | null }) => {
              if (!attributes.fontVariant) {
                return {}
              }
              return { style: `font-variant: ${attributes.fontVariant}` }
            },
          },
          textTransform: {
            default: null,
            parseHTML: (element: HTMLElement) => getStyleProperty(element, "text-transform"),
            renderHTML: (attributes: { textTransform?: string | null }) => {
              if (!attributes.textTransform || attributes.textTransform === "none") {
                return {}
              }
              return { style: `text-transform: ${attributes.textTransform}` }
            },
          },
          hidden: {
            default: null,
            parseHTML: (element: HTMLElement) => (element.classList.contains("text-hidden") ? "1" : null),
            renderHTML: (attributes: { hidden?: string | null }) => {
              if (attributes.hidden !== "1") {
                return {}
              }
              return { class: "text-hidden" }
            },
          },
          doubleStrike: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.style.textDecorationStyle === "double" &&
              element.style.textDecorationLine.includes("line-through")
                ? "1"
                : null,
            renderHTML: (attributes: { doubleStrike?: string | null }) => {
              if (attributes.doubleStrike !== "1") {
                return {}
              }
              return { style: "text-decoration: line-through double" }
            },
          },
          charStyle: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-char-style"),
            renderHTML: (attributes: { charStyle?: string | null }) => {
              if (!attributes.charStyle) {
                return {}
              }
              return { "data-char-style": attributes.charStyle }
            },
          },
          effect: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-effect"),
            renderHTML: (attributes: { effect?: string | null }) => {
              const style = effectCss(attributes.effect)
              if (!style) {
                return {}
              }
              return { "data-effect": String(attributes.effect), style }
            },
          },
          features: {
            default: null,
            parseHTML: (element: HTMLElement) => getStyleProperty(element, "font-feature-settings"),
            renderHTML: (attributes: { features?: string | null }) => {
              if (!attributes.features) {
                return {}
              }
              return { style: `font-feature-settings: ${attributes.features}` }
            },
          },
          kerning: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-kerning"),
            renderHTML: (attributes: { kerning?: string | null; fontSize?: string | null }) => {
              if (attributes.kerning == null || attributes.kerning === "") {
                return {}
              }
              const at = Number(attributes.kerning)
              if (!Number.isFinite(at)) {
                return {}
              }
              const size = Number.parseFloat(attributes.fontSize || "12")
              if (!Number.isFinite(size) || size < at) {
                return { "data-kerning": String(at) }
              }
              return { "data-kerning": String(at), style: "font-kerning: auto" }
            },
          },
        },
      },
    ]
  },
})
