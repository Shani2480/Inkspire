import { applyFontColor, applyFontFamily, setShapeText } from "@/editor/shape-text"
import { openBordersAndShading } from "@/components/borders-shading-dialog"
import { ColorMenu } from "@/components/color-menu"
import { FontMenuList } from "@/components/font-menu"
import { requestFormatDialog } from "@/components/format-dialogs"
import { FONT_FAMILIES, FONT_SIZES, LINE_SPACINGS } from "@/components/ribbon/options"
import { MenuButton } from "@/components/ribbon/ribbon-button"
import { useViewStore } from "@/document/view"
import { changeCase, setLineSpacing, type CaseKind } from "@/editor/actions"
import { useStyleDialogs } from "@/components/style-dialogs"
import { useStyleStore, type StyleDef } from "@/document/styles"
import {
  applyCharacterStyle,
  applyParagraphStyle,
  clearFormatting,
  pasteFromClipboard,
  selectSimilarFormatting,
  setBlockBorder,
  setShading,
} from "@/editor/home-actions"
import { chainWithSelection } from "@/editor/selection-memory"
import type { useActiveMarks } from "@/editor/use-active-marks"
import type { Editor } from "@tiptap/core"
import { useMemo, type CSSProperties } from "react"

/** The Home tab's menus, shared by the classic and the single line ribbon. */

export type Marks = ReturnType<typeof useActiveMarks>

const CASE_OPTIONS: { id: CaseKind; label: string }[] = [
  { id: "sentence", label: "Sentence case" },
  { id: "lower", label: "lowercase" },
  { id: "upper", label: "UPPERCASE" },
  { id: "title", label: "Capitalize Each Word" },
]

const UNDERLINES = [
  { id: "solid", label: "Underline" },
  { id: "double", label: "Double underline" },
  { id: "dotted", label: "Dotted underline" },
  { id: "dashed", label: "Dashed underline" },
  { id: "wavy", label: "Wave underline" },
]

export const BORDERS = [
  { id: "bottom", label: "Bottom Border" },
  { id: "top", label: "Top Border" },
  { id: "left", label: "Left Border" },
  { id: "right", label: "Right Border" },
  { id: "all", label: "All Borders" },
  { id: "none", label: "No Border" },
] as const

export type BorderId = (typeof BORDERS)[number]["id"]

export type GalleryStyle = {
  id: string
  label: string
  kind: "paragraph" | "character"
  style: CSSProperties
}

/** How the built-in styles' samples look in the gallery while unchanged: ribbon colours, so they read in dark mode. */
const PRESET_LOOK: Record<string, CSSProperties> = {
  normal: { fontSize: 13, color: "var(--app-ribbon-text)" },
  "no-spacing": { fontSize: 13, color: "var(--app-ribbon-text)" },
  "heading-1": { fontSize: 16, fontWeight: 650, color: "var(--icon-accent-color)" },
  "heading-2": { fontSize: 14, fontWeight: 650, color: "var(--icon-accent-color)" },
  title: { fontSize: 18, fontWeight: 300, color: "var(--icon-accent-color)" },
  subtitle: { fontSize: 12, color: "var(--app-ribbon-muted)" },
  "subtle-emphasis": { fontSize: 12, fontStyle: "italic", color: "var(--app-ribbon-muted)" },
  emphasis: { fontSize: 12, fontStyle: "italic", color: "var(--app-ribbon-text)" },
  "intense-emphasis": { fontSize: 12, fontStyle: "italic", fontWeight: 700, color: "var(--icon-accent-color)" },
  strong: { fontSize: 12, fontWeight: 700, color: "var(--app-ribbon-text)" },
  quote: { fontSize: 12, fontStyle: "italic", color: "var(--app-ribbon-muted)" },
}

/** A gallery sample drawn from the style's own definition, scaled to fit a chip. */
export function sampleLook(def: StyleDef): CSSProperties {
  const size = def.font.size ?? 12
  const color = def.font.color && !isNearBlack(def.font.color) ? def.font.color : "var(--app-ribbon-text)"
  return {
    fontSize: Math.round(Math.min(18, Math.max(11, 6 + size * 0.55))),
    fontWeight: def.font.bold ? 700 : 400,
    fontStyle: def.font.italic ? "italic" : "normal",
    textDecoration: def.font.underline ? "underline" : "none",
    fontFamily: def.font.family ? `"${def.font.family}", var(--font-sans)` : undefined,
    color,
  }
}

function isNearBlack(color: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(color)
  if (!match) {
    return false
  }
  const value = Number.parseInt(match[1]!, 16)
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b < 90
}

/** The Styles gallery: the document's styles that are not hidden, in order. */
export function galleryStyles(styles: StyleDef[]): GalleryStyle[] {
  return styles
    .filter((style) => !style.hidden)
    .map((style) => ({
      id: style.id,
      label: style.name,
      kind: style.kind,
      style: style.changed || !PRESET_LOOK[style.id] ? sampleLook(style) : PRESET_LOOK[style.id]!,
    }))
}

export function useGalleryStyles() {
  const styles = useStyleStore((state) => state.styles)
  return useMemo(() => galleryStyles(styles), [styles])
}

/** The style the cursor is in: a character style tag first, then the paragraph's style. */
export function activeStyleId(marks: Marks, styles: StyleDef[] = useStyleStore.getState().styles) {
  const known = (id: string) => styles.some((style) => style.id === id)
  if (marks.charStyle && known(marks.charStyle)) {
    return marks.charStyle
  }
  if (marks.headingLevel === 1) {
    return "heading-1"
  }
  if (marks.headingLevel === 2) {
    return "heading-2"
  }
  if (marks.namedStyle && known(marks.namedStyle)) {
    return marks.namedStyle
  }
  if (marks.wordStyle) {
    const word = styles.find((style) => style.wordId.toLowerCase() === marks.wordStyle.toLowerCase())
    if (word) {
      return word.id
    }
  }
  return "normal"
}

export function applyGalleryStyle(editor: Editor, style: Pick<GalleryStyle, "id" | "kind">) {
  if (style.kind === "character") {
    applyCharacterStyle(editor, style.id)
    return
  }
  applyParagraphStyle(editor, style.id)
}

/**
 * The font name and size the font boxes show where the text has none of its own: its style's, through the styles it
 * is based on, then Normal's, as Word shows them. The family is "" when it is the theme's body font.
 */
export function styleFontAt(marks: Marks, styles: StyleDef[]) {
  const font: { family: string; size: string } = { family: "", size: "" }
  const seen = new Set<string>()
  for (let id: string | undefined = activeStyleId(marks, styles); id && !seen.has(id);) {
    seen.add(id)
    const style = styles.find((item) => item.id === id)
    font.family ||= style?.font.family ?? ""
    font.size ||= style?.font.size ? `${style.font.size}pt` : ""
    id = style?.basedOn ?? (id === "normal" ? undefined : "normal")
  }
  return font
}

export function useStyleFont(marks: Marks) {
  const styles = useStyleStore((state) => state.styles)
  return styleFontAt(marks, styles)
}

export function themeBodyLabel(bodyFont: string) {
  if (!bodyFont) {
    return "Aptos (Body)"
  }
  const known = FONT_FAMILIES.find((font) => font.value === bodyFont)
  const name = known?.label ?? bodyFont.split(",")[0].replace(/"/g, "").trim()
  return `${name} (Body)`
}

export function PasteMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const paste = (mode: "source" | "merge" | "text") => {
    if (editor) {
      void pasteFromClipboard(editor, mode)
    }
    close()
  }

  return (
    <div className="flex w-52 flex-col">
      <MenuButton onClick={() => paste("source")}>Keep Source Formatting</MenuButton>
      <MenuButton onClick={() => paste("merge")}>Merge Formatting</MenuButton>
      <MenuButton onClick={() => paste("text")}>
        <span className="mr-2 inline-flex size-4 items-center justify-center text-[12px] font-normal text-[var(--app-ribbon-text)]">
          A
        </span>
        Keep Text Only
      </MenuButton>
    </div>
  )
}

export function FontNameMenu({
  editor,
  marks,
  bodyLabel,
  close,
}: {
  editor: Editor | null
  marks: Marks
  bodyLabel: string
  close: () => void
}) {
  return (
    <FontMenuList
      active={marks.fontFamily}
      bodyLabel={bodyLabel}
      onBody={() => {
        if (editor) {
          applyFontFamily(editor, "")
        }
        close()
      }}
      onSelect={(value) => {
        if (editor) {
          applyFontFamily(editor, value)
        }
        close()
      }}
    />
  )
}

export function FontSizeMenu({ editor, marks, close }: { editor: Editor | null; marks: Marks; close: () => void }) {
  return (
    <div className="flex max-h-64 w-20 flex-col overflow-auto">
      {FONT_SIZES.map((size) => (
        <MenuButton
          key={size}
          selected={marks.fontSize === `${size}pt`}
          onClick={() => {
            if (editor && !setShapeText(editor, { textSize: size })) {
              chainWithSelection(editor).setFontSize(`${size}pt`).run()
            }
            close()
          }}
        >
          {size}
        </MenuButton>
      ))}
    </div>
  )
}

export function CaseMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  return (
    <div className="flex w-48 flex-col">
      {CASE_OPTIONS.map((option) => (
        <MenuButton
          key={option.id}
          onClick={() => {
            if (editor) {
              changeCase(editor, option.id)
            }
            close()
          }}
        >
          {option.label}
        </MenuButton>
      ))}
    </div>
  )
}

export function UnderlineMenu({ editor, marks, close }: { editor: Editor | null; marks: Marks; close: () => void }) {
  return (
    <div className="flex w-44 flex-col">
      {UNDERLINES.map((style) => (
        <MenuButton
          key={style.id}
          selected={marks.underlineStyle === style.id}
          onClick={() => {
            if (editor) {
              chainWithSelection(editor).setMark("underline", { style: style.id }).run()
            }
            close()
          }}
        >
          <span
            style={{
              textDecoration: "underline",
              textDecorationStyle: style.id as CSSProperties["textDecorationStyle"],
            }}
          >
            {style.label}
          </span>
        </MenuButton>
      ))}
      <MenuButton
        onClick={() => {
          if (editor) {
            chainWithSelection(editor).unsetUnderline().run()
          }
          close()
        }}
      >
        No underline
      </MenuButton>
    </div>
  )
}

export function HighlightMenu({
  editor,
  marks,
  onPick,
  close,
}: {
  editor: Editor | null
  marks: Marks
  onPick: (color: string) => void
  close: () => void
}) {
  return (
    <ColorMenu
      palette="highlight"
      active={marks.highlight}
      clearLabel="No Color"
      onClear={() => {
        if (editor) {
          chainWithSelection(editor).unsetHighlight().run()
        }
        close()
      }}
      onSelect={(color) => {
        onPick(color)
        if (editor) {
          chainWithSelection(editor).setHighlight({ color }).run()
        }
        close()
      }}
    />
  )
}

export function FontColorMenu({
  editor,
  marks,
  onPick,
  close,
}: {
  editor: Editor | null
  marks: Marks
  onPick: (color: string) => void
  close: () => void
}) {
  return (
    <ColorMenu
      active={marks.color}
      clearLabel="Automatic"
      onClear={() => {
        if (editor) {
          applyFontColor(editor, "")
        }
        close()
      }}
      onSelect={(color) => {
        onPick(color)
        if (editor) {
          applyFontColor(editor, color)
        }
        close()
      }}
    />
  )
}

export function LineSpacingMenu({ editor, marks, close }: { editor: Editor | null; marks: Marks; close: () => void }) {
  return (
    <div className="flex w-44 flex-col">
      <MenuButton
        selected={!marks.lineHeight}
        onClick={() => {
          if (editor) {
            setLineSpacing(editor, null)
          }
          close()
        }}
      >
        Default
      </MenuButton>
      {LINE_SPACINGS.map((spacing) => (
        <MenuButton
          key={spacing.value}
          selected={marks.lineHeight === spacing.value}
          onClick={() => {
            if (editor) {
              setLineSpacing(editor, spacing.value)
            }
            close()
          }}
        >
          {spacing.label}
        </MenuButton>
      ))}
      <MenuButton
        onClick={() => {
          requestFormatDialog("paragraph")
          close()
        }}
      >
        Paragraph spacing…
      </MenuButton>
    </div>
  )
}

export function ShadingMenu({
  editor,
  marks,
  onPick,
  close,
}: {
  editor: Editor | null
  marks: Marks
  onPick?: (color: string) => void
  close: () => void
}) {
  return (
    <ColorMenu
      active={marks.shading}
      clearLabel="No Color"
      onClear={() => {
        if (editor) {
          setShading(editor, null)
        }
        close()
      }}
      onSelect={(color) => {
        onPick?.(color)
        if (editor) {
          setShading(editor, color)
        }
        close()
      }}
    />
  )
}

export function BordersMenu({
  editor,
  marks,
  onPick,
  close,
}: {
  editor: Editor | null
  marks: Marks
  onPick: (border: BorderId) => void
  close: () => void
}) {
  return (
    <div className="w-[188px] p-1">
      <div className="grid grid-cols-3 gap-1">
        {BORDERS.map((border) => (
          <button
            key={border.id}
            type="button"
            aria-label={border.label}
            aria-pressed={marks.border === border.id || (border.id === "none" && !marks.border)}
            title={border.label}
            className="flex h-12 items-center justify-center rounded border border-[#e1e1e1] bg-white aria-pressed:border-[var(--app-theme-primary)] aria-pressed:bg-[var(--app-theme-light)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onPick(border.id)
              if (editor) {
                setBlockBorder(editor, border.id)
              }
              close()
            }}
          >
            <BorderSample id={border.id} />
          </button>
        ))}
      </div>
      <div className="my-1 border-t border-[var(--app-popover-border)]" />
      <MenuButton
        onClick={() => {
          if (editor) {
            openBordersAndShading(editor)
          }
          close()
        }}
      >
        Borders and Shading…
      </MenuButton>
    </div>
  )
}

function BorderSample({ id }: { id: string }) {
  const side = (edge: string) => (id === "all" || id === edge ? "1.5px solid #242424" : "1px solid #e1e1e1")
  return (
    <span
      className="block h-7 w-9 bg-white"
      style={{
        borderTop: side("top"),
        borderRight: side("right"),
        borderBottom: side("bottom"),
        borderLeft: side("left"),
      }}
    />
  )
}

/** More styles: every style of the document, then Create a Style, Clear Formatting and Manage Styles, as in Word. */
export function StylesMenu({
  editor,
  activeId,
  onApply,
  close,
}: {
  editor: Editor | null
  activeId: string
  onApply: (style: GalleryStyle) => void
  close: () => void
}) {
  const styles = useGalleryStyles()
  return (
    <div className="flex w-60 flex-col">
      <div className="flex max-h-72 flex-col overflow-auto">
        {styles.map((style) => (
          <MenuButton
            key={style.id}
            selected={activeId === style.id}
            onClick={() => {
              onApply(style)
              close()
            }}
          >
            <span style={style.style}>{style.label}</span>
          </MenuButton>
        ))}
      </div>
      <div className="my-1 border-t border-[var(--app-ribbon-border,#e1e1e1)]" />
      <MenuButton
        onClick={() => {
          close()
          useStyleDialogs.getState().openNew(editor)
        }}
      >
        Create a Style…
      </MenuButton>
      <MenuButton
        onClick={() => {
          close()
          if (editor) {
            clearFormatting(editor)
          }
        }}
      >
        Clear Formatting
      </MenuButton>
      <MenuButton
        onClick={() => {
          close()
          useStyleDialogs.getState().openManage()
        }}
      >
        Manage Styles…
      </MenuButton>
    </div>
  )
}

export function FindMenu({ close }: { close: () => void }) {
  const openFind = useViewStore((state) => state.openFind)
  const openGoTo = useViewStore((state) => state.openGoTo)

  return (
    <div className="flex w-48 flex-col">
      <MenuButton
        onClick={() => {
          openFind(false)
          close()
        }}
      >
        Find
      </MenuButton>
      <MenuButton
        onClick={() => {
          openFind(false)
          close()
        }}
      >
        Advanced Find…
      </MenuButton>
      <MenuButton
        onClick={() => {
          openGoTo()
          close()
        }}
      >
        Go To…
      </MenuButton>
    </div>
  )
}

export function SelectMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  return (
    <div className="flex w-64 flex-col">
      <MenuButton
        onClick={() => {
          editor?.chain().focus().selectAll().run()
          close()
        }}
      >
        Select All
      </MenuButton>
      <MenuButton
        onClick={() => {
          if (editor) {
            selectSimilarFormatting(editor)
          }
          close()
        }}
      >
        Select Text with Similar Formatting
      </MenuButton>
    </div>
  )
}
