import { validateTheme, type DocumentTheme as ThemeChoice } from "@/ai/themes"
import { ignoreTracking } from "@/editor/track-changes"
import { Extension } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

type ThemeOverlay = {
  preview: ThemeChoice | null
  choices: ThemeChoice[]
}

const themeOverlayKey = new PluginKey<ThemeOverlay>("themeOverlay")

const PREVIEW_VARS = [
  "--theme-font",
  "--theme-heading",
  "--theme-color",
  "--theme-accent",
  "--theme-h1",
  "--theme-h2",
  "--theme-h3",
  "--theme-spacing",
]

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentTheme: {
      previewTheme: (theme: ThemeChoice | null) => ReturnType
      applyTheme: (theme: ThemeChoice) => ReturnType
      showThemeChoices: (themes: unknown[]) => ReturnType
    }
  }
}

export function themeChoices(state: EditorState) {
  return themeOverlayKey.getState(state)?.choices ?? []
}

export function paintThemePreview(dom: HTMLElement, theme: ThemeChoice) {
  dom.classList.add("theme-preview")
  dom.style.setProperty("--theme-font", theme.fontFamily)
  dom.style.setProperty("--theme-heading", theme.headingFont)
  dom.style.setProperty("--theme-color", theme.textColor)
  dom.style.setProperty("--theme-accent", theme.accent)
  dom.style.setProperty("--theme-h1", `${theme.headingSizes.h1}pt`)
  dom.style.setProperty("--theme-h2", `${theme.headingSizes.h2}pt`)
  dom.style.setProperty("--theme-h3", `${theme.headingSizes.h3}pt`)
  dom.style.setProperty("--theme-spacing", theme.paragraphSpacing)
}

export function clearThemePreview(dom: HTMLElement) {
  dom.classList.remove("theme-preview")
  for (const name of PREVIEW_VARS) {
    dom.style.removeProperty(name)
  }
}

function selectionStyle(state: EditorState, theme: ThemeChoice) {
  const parent = state.selection.$from.parent
  if (parent.type.name === "heading") {
    const level = parent.attrs.level
    const size = level === 2 ? theme.headingSizes.h2 : level === 3 ? theme.headingSizes.h3 : theme.headingSizes.h1
    return `font-family: ${theme.headingFont}; color: ${theme.accent}; font-size: ${size}pt; line-height: 1.25`
  }
  return `font-family: ${theme.fontFamily}; color: ${theme.textColor}; line-height: ${theme.paragraphSpacing}`
}

export const DocumentTheme = Extension.create({
  name: "documentTheme",
  addCommands() {
    return {
      showThemeChoices:
        (themes) =>
        ({ state, dispatch }) => {
          const choices = themes.map((theme) => validateTheme(theme)).filter((theme) => theme !== null)
          dispatch?.(state.tr.setMeta(themeOverlayKey, { choices }).setMeta("addToHistory", false))
          return true
        },
      previewTheme:
        (theme) =>
        ({ editor, state, dispatch }) => {
          const dom = editor.view.dom
          const validated = theme ? validateTheme(theme) : null
          if (!validated) {
            clearThemePreview(dom)
            if (themeOverlayKey.getState(state)?.preview) {
              dispatch?.(state.tr.setMeta(themeOverlayKey, { preview: null }).setMeta("addToHistory", false))
            }
            return true
          }
          if (state.selection.empty) {
            if (themeOverlayKey.getState(state)?.preview) {
              dispatch?.(state.tr.setMeta(themeOverlayKey, { preview: null }).setMeta("addToHistory", false))
            }
            paintThemePreview(dom, validated)
            return true
          }
          clearThemePreview(dom)
          dispatch?.(state.tr.setMeta(themeOverlayKey, { preview: validated }).setMeta("addToHistory", false))
          return true
        },
      applyTheme:
        (theme) =>
        ({ state, dispatch, editor }) => {
          const validated = validateTheme(theme)
          const textStyle = state.schema.marks.textStyle
          if (!validated || !textStyle) {
            return false
          }
          clearThemePreview(editor.view.dom)
          const range = state.selection.empty
            ? { from: 0, to: state.doc.content.size }
            : { from: state.selection.from, to: state.selection.to }
          const blocks: number[] = []
          state.doc.nodesBetween(range.from, range.to, (node, pos) => {
            if (node.type.name === "paragraph" || node.type.name === "heading") {
              blocks.push(pos)
            }
          })

          let tr = state.tr
          tr = tr.setMeta(themeOverlayKey, { preview: null })
          ignoreTracking(tr)
          for (const pos of blocks) {
            const node = tr.doc.nodeAt(pos)
            if (!node) {
              continue
            }
            if (node.attrs.lineHeight !== validated.paragraphSpacing) {
              tr = tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                lineHeight: validated.paragraphSpacing,
              })
            }
            const current = tr.doc.nodeAt(pos)
            if (!current) {
              continue
            }
            const start = Math.max(range.from, pos + 1)
            const end = Math.min(range.to, pos + current.nodeSize - 1)
            if (start >= end) {
              continue
            }
            const heading = current.type.name === "heading"
            const level = current.attrs.level
            const size =
              level === 2
                ? validated.headingSizes.h2
                : level === 3
                  ? validated.headingSizes.h3
                  : validated.headingSizes.h1
            const attrs = heading
              ? {
                  fontFamily: validated.headingFont,
                  color: validated.accent,
                  fontSize: `${size}pt`,
                }
              : {
                  fontFamily: validated.fontFamily,
                  color: validated.textColor,
                }
            tr = tr.removeMark(start, end, textStyle)
            tr = tr.addMark(start, end, textStyle.create(attrs))
          }
          if (state.selection.empty) {
            tr = tr.setStoredMarks([
              textStyle.create({
                fontFamily: validated.fontFamily,
                color: validated.textColor,
              }),
            ])
          }
          dispatch?.(tr)
          return true
        },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<ThemeOverlay>({
        key: themeOverlayKey,
        state: {
          init: () => ({ preview: null, choices: [] }),
          apply(tr, value) {
            const meta = tr.getMeta(themeOverlayKey) as Partial<ThemeOverlay> | undefined
            if (!meta) {
              return value
            }
            return {
              preview: "preview" in meta ? (meta.preview ?? null) : value.preview,
              choices: meta.choices ?? value.choices,
            }
          },
        },
        props: {
          decorations(state) {
            const preview = themeOverlayKey.getState(state)?.preview
            if (!preview || state.selection.empty) {
              return null
            }
            return DecorationSet.create(state.doc, [
              Decoration.inline(state.selection.from, state.selection.to, {
                class: "theme-preview-range",
                style: selectionStyle(state, preview),
              }),
            ])
          },
        },
      }),
    ]
  },
})
