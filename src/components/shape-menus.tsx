import { openColorDialog } from "@/components/color-dialog"
import { STANDARD_COLORS, THEME_COLUMNS } from "@/components/color-menu"
import { useObjectPreview } from "@/components/object-preview-hook"
import type { ObjectRun } from "@/editor/object-preview"
import { selectedObject } from "@/editor/objects"
import { canConvertToFreeform, canEditPoints, convertToFreeform, startEditPoints } from "@/editor/edit-points"
import { SHAPE_NAMES, shapeMarkup } from "@/editor/insert-blocks"
import {
  ARROW_STYLES,
  BEVELS,
  EFFECT_PRESETS,
  GLOW_SIZES,
  GRADIENT_DIRECTIONS,
  NO_EFFECTS,
  OUTLINE_DASHES,
  OUTLINE_WEIGHTS,
  PRESET_STYLES,
  REFLECTIONS,
  ROTATIONS_3D,
  SHADOWS,
  SOFT_EDGES,
  STYLE_INTENSITIES,
  TEXTURES,
  TEXT_DIRECTIONS,
  TEXT_EFFECTS,
  THEME_ACCENTS,
  cssGradient,
  cssTexture,
  dashArray,
  effectStyle,
  shade,
  themeStyle,
} from "@/editor/shape-style"
import type { Editor } from "@tiptap/core"
import { Check, ChevronRight } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { create } from "zustand"

/**
 * Word's Shape Format menus (20.9), shared by the ribbon, the object bar (20.10) and the Format Shape pane: the
 * shapes gallery, Shape Styles, Shape Fill, Shape Outline, Shape Effects and the WordArt Styles text menus. Each
 * choice previews on the shape while the pointer is over it and goes in as one undo step when clicked.
 */

type Attrs = Record<string, unknown>
type MenuProps = { editor: Editor | null; close: () => void }

/** The Format Shape pane: open or not, and which part it shows. */
export type PaneSection = "fill" | "effects" | "layout" | "text-fill" | "text-effects" | "text-box"
export const useFormatShapePane = create<{
  open: boolean
  section: PaneSection
  show: (section?: PaneSection) => void
  hide: () => void
}>((set) => ({
  open: false,
  section: "fill",
  show: (section = "fill") => set({ open: true, section }),
  hide: () => set({ open: false }),
}))

/** The last colours used, which the split buttons' main halves apply. */
export const useShapeColors = create<{
  fill: string
  outline: string
  textFill: string
  textOutline: string
  set: (key: "fill" | "outline" | "textFill" | "textOutline", color: string) => void
}>((set) => ({
  fill: "#4472c4",
  outline: "#2f5496",
  textFill: "#c00000",
  textOutline: "#4472c4",
  set: (key, color) => set({ [key]: color }),
}))

// --- Shapes -----------------------------------------------------------------------------------------------------

export const SHAPE_CATEGORIES: { label: string; shapes: string[] }[] = [
  {
    label: "Lines",
    shapes: [
      "line",
      "arrow-line",
      "double-arrow",
      "elbow",
      "connector",
      "elbow-arrow",
      "curve",
      "curve-arrow",
      "arc",
      "scribble",
      "freeform",
    ],
  },
  {
    label: "Rectangles",
    shapes: [
      "rect",
      "round",
      "snip",
      "snip-corner",
      "snip-round",
      "round-single",
      "round-diag",
      "same-round",
      "round-top",
    ],
  },
  {
    label: "Basic Shapes",
    shapes: [
      "ellipse",
      "triangle",
      "diamond",
      "parallelogram",
      "trapezoid",
      "pentagon",
      "hexagon",
      "octagon",
      "plus",
      "cube-shape",
      "can",
      "donut",
      "no-sign",
      "block-arc",
      "pie-shape",
      "teardrop",
      "frame",
      "plaque",
      "smiley",
      "heart",
      "lightning",
      "sun",
      "moon",
      "cloud",
      "bracket-left",
      "bracket-right",
      "brace-left",
      "brace-right",
    ],
  },
  {
    label: "Block Arrows",
    shapes: [
      "arrow",
      "left-arrow",
      "up-arrow",
      "down-arrow",
      "left-right",
      "up-down",
      "quad-arrow",
      "bent-arrow",
      "uturn",
      "left-up",
      "striped-arrow",
      "notched",
      "chevron",
      "chevron-left",
    ],
  },
  { label: "Equation Shapes", shapes: ["plus-eq", "minus", "multiply", "divide", "equal", "not-equal"] },
  {
    label: "Flowchart",
    shapes: [
      "process",
      "decision",
      "data",
      "terminator",
      "document",
      "preparation",
      "manual-input",
      "display",
      "delay",
      "stored-data",
      "flow-or",
      "flow-merge",
      "flow-sort",
      "flow-extract",
      "flow-collate",
      "flow-disk",
      "flow-card",
      "flow-sum",
    ],
  },
  {
    label: "Stars and Banners",
    shapes: [
      "star4",
      "star",
      "star6",
      "star7",
      "star8",
      "star12",
      "star16",
      "burst",
      "banner",
      "ribbon-up",
      "wave",
      "double-wave",
      "scroll",
    ],
  },
  {
    label: "Callouts",
    shapes: [
      "callout",
      "rounded-callout",
      "oval-callout",
      "cloud-callout",
      "line-callout",
      "callout-2",
      "callout-3",
      "callout-accent",
      "callout-border",
    ],
  },
]

/** Shapes that are lines: they take arrows, and their fill does not apply. */
export const LINE_SHAPES = new Set(SHAPE_CATEGORIES[0]!.shapes)

const RECENT_KEY = "inkspire.recentShapes"

function recentShapes(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as unknown
    return Array.isArray(stored) ? stored.filter((name): name is string => SHAPE_NAMES.includes(String(name))) : []
  } catch {
    return []
  }
}

export function rememberShape(name: string) {
  try {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([name, ...recentShapes().filter((item) => item !== name)].slice(0, 12)),
    )
  } catch {
    // Without storage the list just starts empty next time.
  }
}

function shapeLabel(name: string) {
  return name.replace(/-/g, " ").replace(/^\w/, (letter) => letter.toUpperCase())
}

export function ShapeThumb({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 56) / 80)}
      viewBox="0 0 80 56"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: shapeMarkup(name) }}
    />
  )
}

/** Word's shapes list: Recently Used, then each category, as a grid of small pictures. */
export function ShapesList({
  onPick,
  current,
  only,
}: {
  onPick: (name: string) => void
  current?: string
  /** Just the shapes this allows (Crop to Shape leaves out lines and shapes Word has no preset for). */
  only?: (name: string) => boolean
}) {
  const recent = recentShapes()
  const categories = (recent.length ? [{ label: "Recently Used Shapes", shapes: recent }, ...SHAPE_CATEGORIES] : SHAPE_CATEGORIES)
    .map((category) => ({ ...category, shapes: only ? category.shapes.filter(only) : category.shapes }))
    .filter((category) => category.shapes.length > 0)
  return (
    <div className="shapes-list" role="listbox" aria-label="Shapes">
      {categories.map((category) => (
        <section key={category.label}>
          <h3>{category.label}</h3>
          <div className="shapes-list-grid">
            {category.shapes.map((name) => (
              <button
                key={`${category.label}-${name}`}
                type="button"
                role="option"
                aria-selected={current === name}
                aria-label={shapeLabel(name)}
                title={shapeLabel(name)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(name)}
              >
                <ShapeThumb name={name} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function insertShape(editor: Editor | null, name: string) {
  rememberShape(name)
  editor?.chain().focus().insertFigure("shape", name).run()
}

export function EditShapeMenu({ editor, close }: MenuProps) {
  const object = selectedObject(editor)
  const current = object?.name === "figure" ? String(object.attrs.variant || "") : ""
  return (
    <div className="flex w-56 flex-col">
      <MenuFlyout
        label="Change Shape"
        icon={<ShapeThumb name={current || "rect"} size={16} />}
        disabled={object?.name !== "figure"}
      >
        <ShapesList
          current={current}
          onPick={(name) => {
            rememberShape(name)
            // A new shape is drawn as the gallery draws it: points edited on the old one go.
            editor?.chain().focus().updateObject({ variant: name, kind: "shape", points: "" }).run()
            close()
          }}
        />
      </MenuFlyout>
      <MenuRow
        disabled={!canEditPoints(editor)}
        onClick={() => {
          close()
          if (editor) {
            startEditPoints(editor)
          }
        }}
      >
        Edit Points
      </MenuRow>
      <MenuRow
        disabled={!canConvertToFreeform(editor)}
        onClick={() => {
          close()
          if (editor) {
            convertToFreeform(editor)
          }
        }}
      >
        Convert to Freeform
      </MenuRow>
      <MenuRow disabled title="For connectors between shapes.">
        Reroute Connectors
      </MenuRow>
    </div>
  )
}

// --- Menu parts -------------------------------------------------------------------------------------------------

export function MenuRow({
  children,
  onClick,
  onEnter,
  disabled = false,
  checked,
  icon,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  onEnter?: () => void
  disabled?: boolean
  checked?: boolean
  icon?: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      className="shape-menu-row"
      disabled={disabled}
      title={title}
      aria-pressed={checked}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onEnter}
      onClick={onClick}
    >
      <span className="shape-menu-icon">
        {icon ?? (checked ? <Check className="size-3.5" strokeWidth={2} /> : null)}
      </span>
      <span className="shape-menu-label">{children}</span>
    </button>
  )
}

/** A row that opens a submenu to its right on hover or focus, as Word's menu flyouts do. */
export function MenuFlyout({
  label,
  icon,
  children,
  disabled = false,
  onEnter,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
  disabled?: boolean
  onEnter?: () => void
}) {
  return (
    <div className={`menu-flyout${disabled ? " is-disabled" : ""}`} onMouseEnter={onEnter}>
      <button
        type="button"
        className="shape-menu-row"
        aria-haspopup="menu"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
      >
        <span className="shape-menu-icon">{icon}</span>
        <span className="shape-menu-label">{label}</span>
        <ChevronRight className="ml-auto size-3.5 opacity-70" />
      </button>
      {disabled ? null : <div className="menu-flyout-panel">{children}</div>}
    </div>
  )
}

export function MenuSeparator() {
  return <div className="shape-menu-separator" role="separator" />
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="shape-menu-heading">{children}</div>
}

/** One choice that previews on hover and applies on click. */
export function PreviewTile({
  label,
  preview,
  run,
  close,
  children,
  className = "shape-tile",
  style,
  selected = false,
  onPick,
}: {
  label: string
  preview: ReturnType<typeof useObjectPreview>
  run: ObjectRun
  close?: () => void
  children?: ReactNode
  className?: string
  style?: CSSProperties
  selected?: boolean
  onPick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={className}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => preview?.preview(run)}
      onFocus={() => preview?.preview(run)}
      onClick={() => {
        preview?.commit(run)
        onPick?.()
        close?.()
      }}
    >
      {children}
    </button>
  )
}

export const update =
  (attrs: Attrs): ObjectRun =>
  (chain) =>
    chain.updateObject(attrs)

export function Palette({
  preview,
  apply,
  close,
  current,
  onPicked,
}: {
  preview: ReturnType<typeof useObjectPreview>
  /** The attributes for a colour; called while rendering, so it must not change state. */
  apply: (color: string) => Attrs
  close: () => void
  current?: string
  /** Remembers the colour picked (for the split button). */
  onPicked?: (color: string) => void
}) {
  const same = (color: string) => (current ?? "").toLowerCase() === color.toLowerCase()
  return (
    <div className="shape-palette">
      <MenuHeading>Theme Colors</MenuHeading>
      <div className="shape-palette-theme">
        {THEME_COLUMNS.map((column) => (
          <div key={column[0]} className="shape-palette-column">
            {column.map((color) => (
              <PreviewTile
                key={`${column[0]}-${color}`}
                label={color}
                className="shape-swatch"
                style={{ background: color }}
                selected={same(color)}
                preview={preview}
                run={update(apply(color))}
                onPick={() => onPicked?.(color)}
                close={close}
              />
            ))}
          </div>
        ))}
      </div>
      <MenuHeading>Standard Colors</MenuHeading>
      <div className="shape-palette-standard">
        {STANDARD_COLORS.map((color) => (
          <PreviewTile
            key={color}
            label={color}
            className="shape-swatch"
            style={{ background: color }}
            selected={same(color)}
            preview={preview}
            run={update(apply(color))}
            onPick={() => onPicked?.(color)}
            close={close}
          />
        ))}
      </div>
    </div>
  )
}

function attrsOf(editor: Editor | null) {
  return (selectedObject(editor)?.attrs ?? {}) as Attrs
}

// --- Shape Styles -----------------------------------------------------------------------------------------------

/** The look of a style as CSS, for its gallery chip. */
export function styleChipCss(attrs: Attrs): CSSProperties {
  const fill = String(attrs.fill || "#ffffff")
  const stroke = String(attrs.stroke || "")
  const gradient = String(attrs.fillGradient || "")
  const effects = effectStyle(attrs)
  return {
    background: gradient ? cssGradient(fill, gradient) : fill === "none" ? "transparent" : fill,
    border:
      stroke && stroke !== "none"
        ? `${Math.max(1, Number(attrs.strokeWidth) || 1)}px solid ${stroke}`
        : "1px solid transparent",
    color: fill === "#ffffff" || fill === "none" || shade(fill, 0) === "#ffc000" ? "#242424" : "#ffffff",
    filter: effects.filter,
    boxShadow: attrs.bevel
      ? "inset 1px 1px 2px rgb(255 255 255 / 0.6), inset -1px -1px 2px rgb(0 0 0 / 0.3)"
      : undefined,
  }
}

export const STYLE_ROWS: { id: string; label: string; styles: { id: string; label: string; attrs: Attrs }[] }[] = [
  ...STYLE_INTENSITIES.map((intensity) => ({
    id: intensity.id,
    label: intensity.label,
    styles: THEME_ACCENTS.map((accent) => ({
      id: `${accent.id}-${intensity.id}`,
      label: `${intensity.label} - ${accent.label}`,
      attrs: themeStyle(accent, intensity.id),
    })),
  })),
  { id: "presets", label: "Presets", styles: PRESET_STYLES },
]

/** The whole Shape Styles gallery: Theme Styles, then Presets. */
export function ShapeStylesMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const current = String(attrsOf(editor).shapeStyle || "")
  return (
    <div className="shape-styles-menu" onMouseLeave={() => preview?.restore()}>
      <MenuHeading>Theme Styles</MenuHeading>
      <div className="shape-styles-grid">
        {STYLE_ROWS.slice(0, -1).flatMap((row) =>
          row.styles.map((style) => (
            <PreviewTile
              key={style.id}
              label={style.label}
              className="shape-style-chip"
              style={styleChipCss(style.attrs)}
              selected={current === style.id}
              preview={preview}
              run={update(style.attrs)}
              close={close}
            >
              Abc
            </PreviewTile>
          )),
        )}
      </div>
      <MenuHeading>Presets</MenuHeading>
      <div className="shape-styles-grid">
        {PRESET_STYLES.map((style) => (
          <PreviewTile
            key={style.id}
            label={style.label}
            className="shape-style-chip"
            style={styleChipCss(style.attrs)}
            selected={current === style.id}
            preview={preview}
            run={update(style.attrs)}
            close={close}
          >
            Abc
          </PreviewTile>
        ))}
      </div>
      <MenuSeparator />
      <MenuRow disabled title="New shapes always start in the theme's first style.">
        Other Theme Fills
      </MenuRow>
    </div>
  )
}

/** The Shape Styles gallery on the ribbon: one row at a time, with the arrows and More. */
export function ShapeStyleRow({ editor, row }: { editor: Editor | null; row: number }) {
  const preview = useObjectPreview(editor)
  const current = String(attrsOf(editor).shapeStyle || "")
  const styles = STYLE_ROWS[row]?.styles ?? []
  return (
    <div className="shape-style-row" onMouseLeave={() => preview?.restore()}>
      {styles.map((style) => (
        <PreviewTile
          key={style.id}
          label={style.label}
          className="shape-style-chip"
          style={styleChipCss(style.attrs)}
          selected={current === style.id}
          preview={preview}
          run={update(style.attrs)}
        >
          Abc
        </PreviewTile>
      ))}
    </div>
  )
}

// --- Shape Fill -------------------------------------------------------------------------------------------------

function pickPicture(onPicture: (src: string) => void) {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "image/*"
  input.addEventListener("change", () => {
    const file = input.files?.[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        onPicture(reader.result)
      }
    })
    reader.readAsDataURL(file)
  })
  input.click()
}

export function ShapeFillMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = attrsOf(editor)
  const setColor = useShapeColors((state) => state.set)
  const fill = String(attrs.fill || "")
  const solid = (color: string) => ({ fill: color, fillGradient: "", fillImage: "", texture: "", shapeStyle: "" })
  const apply = (next: Attrs) => {
    editor?.chain().focus().updateObject(next).run()
    close()
  }
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <Palette
        preview={preview}
        current={fill}
        close={close}
        apply={(color) => solid(color)}
        onPicked={(color) => setColor("fill", color)}
      />
      <MenuSeparator />
      <MenuRow
        checked={fill === "none"}
        onEnter={() => preview?.preview(update(solid("none")))}
        onClick={() => {
          preview?.commit(update(solid("none")))
          close()
        }}
      >
        No Fill
      </MenuRow>
      <MenuRow
        onEnter={() => preview?.restore()}
        onClick={() => {
          close()
          openColorDialog(fill && fill !== "none" ? fill : "#4472c4", (color) => {
            setColor("fill", color)
            editor?.chain().focus().updateObject(solid(color)).run()
          })
        }}
      >
        More Fill Colors…
      </MenuRow>
      <MenuRow
        onEnter={() => preview?.restore()}
        onClick={() => {
          close()
          pickPicture((src) =>
            editor?.chain().focus().updateObject({ fillImage: src, texture: "", fillGradient: "" }).run(),
          )
        }}
      >
        Picture…
      </MenuRow>
      <MenuFlyout label="Gradient" onEnter={() => preview?.restore()}>
        <GradientGallery editor={editor} preview={preview} close={close} />
      </MenuFlyout>
      <MenuFlyout label="Texture" onEnter={() => preview?.restore()}>
        <div className="shape-tiles is-4">
          {TEXTURES.map((texture) => (
            <PreviewTile
              key={texture.id}
              label={texture.label}
              className="shape-texture"
              style={{ background: cssTexture(texture.id) }}
              selected={attrs.texture === texture.id}
              preview={preview}
              run={update({ texture: texture.id, fillImage: "", fillGradient: "" })}
              close={close}
            />
          ))}
        </div>
        <MenuSeparator />
        <MenuRow onClick={() => apply({ texture: "" })}>No Texture</MenuRow>
      </MenuFlyout>
    </div>
  )
}

function GradientGallery({
  editor,
  preview,
  close,
}: {
  editor: Editor | null
  preview: ReturnType<typeof useObjectPreview>
  close: () => void
}) {
  const attrs = attrsOf(editor)
  const base = String(attrs.fill && attrs.fill !== "none" ? attrs.fill : "#4472c4")
  return (
    <div className="shape-menu">
      <MenuRow
        onEnter={() => preview?.preview(update({ fillGradient: "" }))}
        onClick={() => {
          preview?.commit(update({ fillGradient: "" }))
          close()
        }}
      >
        No Gradient
      </MenuRow>
      {(["light", "dark"] as const).map((tone) => (
        <div key={tone}>
          <MenuHeading>{tone === "light" ? "Light Variations" : "Dark Variations"}</MenuHeading>
          <div className="shape-tiles is-4">
            {GRADIENT_DIRECTIONS.map((direction) => {
              const gradient = `${tone}-${direction.id}`
              return (
                <PreviewTile
                  key={gradient}
                  label={direction.label}
                  className="shape-texture"
                  style={{ background: cssGradient(base, gradient) }}
                  selected={attrs.fillGradient === gradient}
                  preview={preview}
                  run={update({ fillGradient: gradient, fillImage: "", texture: "", fill: base })}
                  close={close}
                />
              )
            })}
          </div>
        </div>
      ))}
      <MenuSeparator />
      <MenuRow
        onClick={() => {
          close()
          useFormatShapePane.getState().show("fill")
        }}
      >
        More Gradients…
      </MenuRow>
    </div>
  )
}

// --- Shape Outline ----------------------------------------------------------------------------------------------

export function ShapeOutlineMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = attrsOf(editor)
  const setColor = useShapeColors((state) => state.set)
  const stroke = String(attrs.stroke || "")
  const lines = attrs.kind === "shape" && LINE_SHAPES.has(String(attrs.variant || ""))
  const width = Number(attrs.strokeWidth) || 0
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <Palette
        preview={preview}
        current={stroke}
        close={close}
        apply={(color) => ({ stroke: color, shapeStyle: "" })}
        onPicked={(color) => setColor("outline", color)}
      />
      <MenuSeparator />
      <MenuRow
        checked={stroke === "none"}
        onEnter={() => preview?.preview(update({ stroke: "none" }))}
        onClick={() => {
          preview?.commit(update({ stroke: "none" }))
          close()
        }}
      >
        No Outline
      </MenuRow>
      <MenuRow
        onEnter={() => preview?.restore()}
        onClick={() => {
          close()
          openColorDialog(stroke && stroke !== "none" ? stroke : "#2f5496", (color) => {
            setColor("outline", color)
            editor?.chain().focus().updateObject({ stroke: color }).run()
          })
        }}
      >
        More Outline Colors…
      </MenuRow>
      <MenuFlyout label="Weight" onEnter={() => preview?.restore()}>
        <div className="shape-menu">
          {OUTLINE_WEIGHTS.map((pt) => (
            <PreviewRow
              key={pt}
              preview={preview}
              run={update({ strokeWidth: pt })}
              close={close}
              checked={width === pt}
            >
              <span className="flex w-36 items-center gap-2">
                <span className="w-9 text-right">{pt} pt</span>
                <span className="flex-1 bg-current" style={{ height: Math.max(1, (pt * 4) / 3) }} />
              </span>
            </PreviewRow>
          ))}
          <MenuSeparator />
          <MenuRow
            onClick={() => {
              close()
              useFormatShapePane.getState().show("fill")
            }}
          >
            More Lines…
          </MenuRow>
        </div>
      </MenuFlyout>
      <MenuFlyout label="Dashes" onEnter={() => preview?.restore()}>
        <div className="shape-menu">
          {OUTLINE_DASHES.map((dash) => (
            <PreviewRow
              key={dash.id || "solid"}
              preview={preview}
              run={update({ strokeDash: dash.id })}
              close={close}
              checked={(attrs.strokeDash || "") === dash.id}
              title={dash.label}
            >
              <svg width="120" height="6" aria-hidden>
                <line
                  x1="0"
                  y1="3"
                  x2="120"
                  y2="3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={dashArray(dash.id, 2) || undefined}
                  strokeLinecap={dash.id === "round-dot" ? "round" : undefined}
                />
              </svg>
            </PreviewRow>
          ))}
          <MenuSeparator />
          <MenuRow
            onClick={() => {
              close()
              useFormatShapePane.getState().show("fill")
            }}
          >
            More Lines…
          </MenuRow>
        </div>
      </MenuFlyout>
      <MenuFlyout label="Arrows" disabled={!lines} onEnter={() => preview?.restore()}>
        <div className="shape-menu">
          {ARROW_STYLES.map((arrow) => (
            <PreviewRow
              key={arrow.label}
              preview={preview}
              run={update({ arrowBegin: arrow.begin, arrowEnd: arrow.end })}
              close={close}
              checked={(attrs.arrowBegin || "") === arrow.begin && (attrs.arrowEnd || "") === arrow.end}
              title={arrow.label}
            >
              <ArrowSample begin={arrow.begin} end={arrow.end} />
            </PreviewRow>
          ))}
          <MenuSeparator />
          <MenuRow
            onClick={() => {
              close()
              useFormatShapePane.getState().show("fill")
            }}
          >
            More Arrows…
          </MenuRow>
        </div>
      </MenuFlyout>
    </div>
  )
}

export function PreviewRow({
  preview,
  run,
  close,
  checked,
  title,
  children,
}: {
  preview: ReturnType<typeof useObjectPreview>
  run: ObjectRun
  close: () => void
  checked?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <MenuRow
      checked={checked}
      title={title}
      onEnter={() => preview?.preview(run)}
      onClick={() => {
        preview?.commit(run)
        close()
      }}
    >
      {children}
    </MenuRow>
  )
}

function ArrowSample({ begin, end }: { begin: string; end: string }) {
  const head = (kind: string, at: "start" | "end") => {
    if (!kind) {
      return null
    }
    const x = at === "start" ? 4 : 116
    const sign = at === "start" ? 1 : -1
    if (kind === "oval") {
      return <circle cx={x} cy="5" r="3" fill="currentColor" />
    }
    if (kind === "diamond") {
      return <path d={`M${x - 4} 5 ${x} 1 ${x + 4} 5 ${x} 9Z`} fill="currentColor" />
    }
    const tip = at === "start" ? 0 : 120
    const path = `M${tip + sign * 8} 1 ${tip} 5 ${tip + sign * 8} 9`
    return kind === "open" ? (
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" />
    ) : (
      <path d={`${path}Z`} fill="currentColor" />
    )
  }
  return (
    <svg width="120" height="10" aria-hidden>
      <line x1={begin ? 6 : 0} y1="5" x2={end ? 114 : 120} y2="5" stroke="currentColor" strokeWidth="1.4" />
      {head(begin, "start")}
      {head(end, "end")}
    </svg>
  )
}

// --- Shape Effects ----------------------------------------------------------------------------------------------

function EffectTile({ attrs }: { attrs: Attrs }) {
  const effects = effectStyle(attrs)
  return (
    <span
      className="shape-effect-sample"
      style={
        {
          filter: effects.filter || undefined,
          transform: effects.transform || undefined,
          WebkitBoxReflect: effects.webkitBoxReflect || undefined,
          boxShadow: attrs.bevel
            ? "inset 2px 2px 3px rgb(255 255 255 / 0.65), inset -2px -2px 3px rgb(0 0 0 / 0.35)"
            : undefined,
          borderRadius: Number(attrs.softEdge) ? `${Math.min(10, Number(attrs.softEdge))}px` : undefined,
          opacity: Number(attrs.softEdge) ? 0.85 : undefined,
        } as CSSProperties
      }
    />
  )
}

function EffectGallery({
  preview,
  close,
  none,
  noneLabel,
  groups,
  current,
  options,
}: {
  preview: ReturnType<typeof useObjectPreview>
  close: () => void
  none: Attrs
  noneLabel: string
  groups: { group: string; items: { id: string; label: string; attrs: Attrs }[] }[]
  current: (attrs: Attrs) => boolean
  options: string
}) {
  return (
    <div className="shape-menu">
      <MenuRow
        onEnter={() => preview?.preview(update(none))}
        onClick={() => {
          preview?.commit(update(none))
          close()
        }}
      >
        {noneLabel}
      </MenuRow>
      {groups.map((group) => (
        <div key={group.group}>
          {group.group ? <MenuHeading>{group.group}</MenuHeading> : null}
          <div className="shape-tiles is-4">
            {group.items.map((item) => (
              <PreviewTile
                key={item.id}
                label={item.label}
                className="shape-effect-tile"
                selected={current(item.attrs)}
                preview={preview}
                run={update(item.attrs)}
                close={close}
              >
                <EffectTile attrs={item.attrs} />
              </PreviewTile>
            ))}
          </div>
        </div>
      ))}
      <MenuSeparator />
      <MenuRow
        onClick={() => {
          close()
          useFormatShapePane.getState().show("effects")
        }}
      >
        {options}
      </MenuRow>
    </div>
  )
}

export function ShapeEffectsMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = attrsOf(editor)
  const is = (key: string) => (next: Attrs) => attrs[key] === next[key]
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <MenuFlyout label="Preset" onEnter={() => preview?.restore()}>
        <EffectGallery
          preview={preview}
          close={close}
          none={NO_EFFECTS}
          noneLabel="No Presets"
          groups={[
            {
              group: "Presets",
              items: EFFECT_PRESETS.map((preset) => ({ ...preset, attrs: { ...NO_EFFECTS, ...preset.attrs } })),
            },
          ]}
          current={() => false}
          options="3-D Options…"
        />
      </MenuFlyout>
      <MenuFlyout label="Shadow" onEnter={() => preview?.restore()}>
        <EffectGallery
          preview={preview}
          close={close}
          none={{ shadow: "", effect: "" }}
          noneLabel="No Shadow"
          groups={SHADOWS.map((group) => ({
            group: group.group,
            items: group.items.map((item) => ({ ...item, attrs: { shadow: item.id } })),
          }))}
          current={is("shadow")}
          options="Shadow Options…"
        />
      </MenuFlyout>
      <MenuFlyout label="Reflection" onEnter={() => preview?.restore()}>
        <EffectGallery
          preview={preview}
          close={close}
          none={{ reflection: "" }}
          noneLabel="No Reflection"
          groups={[
            {
              group: "Reflection Variations",
              items: REFLECTIONS.map((item) => ({ ...item, attrs: { reflection: item.id } })),
            },
          ]}
          current={is("reflection")}
          options="Reflection Options…"
        />
      </MenuFlyout>
      <MenuFlyout label="Glow" onEnter={() => preview?.restore()}>
        <EffectGallery
          preview={preview}
          close={close}
          none={{ glow: "" }}
          noneLabel="No Glow"
          groups={[
            {
              group: "Glow Variations",
              items: GLOW_SIZES.flatMap((size) =>
                THEME_ACCENTS.slice(1).map((accent) => ({
                  id: `${accent.id}-${size}`,
                  label: `Glow: ${size} point; ${accent.label}`,
                  attrs: { glow: `${accent.color}:${size}` },
                })),
              ),
            },
          ]}
          current={is("glow")}
          options="Glow Options…"
        />
      </MenuFlyout>
      <MenuFlyout label="Soft Edges" onEnter={() => preview?.restore()}>
        <EffectGallery
          preview={preview}
          close={close}
          none={{ softEdge: 0 }}
          noneLabel="No Soft Edges"
          groups={[
            {
              group: "Soft Edge Variations",
              items: SOFT_EDGES.map((pt) => ({ id: String(pt), label: `${pt} Point`, attrs: { softEdge: pt } })),
            },
          ]}
          current={is("softEdge")}
          options="Soft Edges Options…"
        />
      </MenuFlyout>
      <MenuFlyout label="Bevel" onEnter={() => preview?.restore()}>
        <EffectGallery
          preview={preview}
          close={close}
          none={{ bevel: "" }}
          noneLabel="No Bevel"
          groups={[{ group: "Bevel", items: BEVELS.map((item) => ({ ...item, attrs: { bevel: item.id } })) }]}
          current={is("bevel")}
          options="3-D Options…"
        />
      </MenuFlyout>
      <MenuFlyout label="3-D Rotation" onEnter={() => preview?.restore()}>
        <EffectGallery
          preview={preview}
          close={close}
          none={{ rot3d: "" }}
          noneLabel="No Rotation"
          groups={ROTATIONS_3D.map((group) => ({
            group: group.group,
            items: group.items.map((item) => ({ ...item, attrs: { rot3d: item.id } })),
          }))}
          current={is("rot3d")}
          options="3-D Rotation Options…"
        />
      </MenuFlyout>
    </div>
  )
}

// --- WordArt Styles (text in a text box) ------------------------------------------------------------------------

/** WordArt quick styles for a text box's text. */
export const TEXT_QUICK_STYLES: { id: string; label: string; attrs: Attrs }[] = [
  {
    id: "plain",
    label: "Fill: Black, Text color 1; Shadow",
    attrs: { textFill: "#000000", textOutline: "", textEffect: "shadow" },
  },
  {
    id: "blue",
    label: "Fill: Blue, Accent color 1; Shadow",
    attrs: { textFill: "#4472c4", textOutline: "", textEffect: "shadow" },
  },
  {
    id: "orange",
    label: "Fill: Orange, Accent color 2; Outline: Orange",
    attrs: { textFill: "#ed7d31", textOutline: "#c55a11", textEffect: "" },
  },
  {
    id: "outline",
    label: "Fill: White; Outline: Blue, Accent color 1; Glow",
    attrs: { textFill: "#ffffff", textOutline: "#4472c4", textEffect: "glow" },
  },
  {
    id: "gold",
    label: "Fill: Gold, Accent color 4; Soft Bevel",
    attrs: { textFill: "#ffc000", textOutline: "", textEffect: "bevel" },
  },
  {
    id: "gray",
    label: "Fill: Gray; Reflection",
    attrs: { textFill: "#7f7f7f", textOutline: "", textEffect: "reflection" },
  },
]

export function TextQuickStyles({ editor, close }: { editor: Editor | null; close?: () => void }) {
  const preview = useObjectPreview(editor)
  return (
    <div className="shape-style-row" onMouseLeave={() => preview?.restore()}>
      {TEXT_QUICK_STYLES.map((style) => (
        <PreviewTile
          key={style.id}
          label={style.label}
          className="text-quick-style"
          style={{
            color: String(style.attrs.textFill),
            WebkitTextStroke: style.attrs.textOutline ? `0.8px ${String(style.attrs.textOutline)}` : undefined,
            textShadow:
              style.attrs.textEffect === "shadow"
                ? "1px 1px 1px rgb(0 0 0 / 0.4)"
                : style.attrs.textEffect === "glow"
                  ? "0 0 3px #ffc000"
                  : undefined,
          }}
          preview={preview}
          run={update(style.attrs)}
          close={close}
        >
          A
        </PreviewTile>
      ))}
    </div>
  )
}

export function TextFillMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const setColor = useShapeColors((state) => state.set)
  const current = String(attrsOf(editor).textFill || "")
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <Palette
        preview={preview}
        current={current}
        close={close}
        apply={(color) => ({ textFill: color })}
        onPicked={(color) => setColor("textFill", color)}
      />
      <MenuSeparator />
      <MenuRow
        onEnter={() => preview?.preview(update({ textFill: "none" }))}
        onClick={() => {
          preview?.commit(update({ textFill: "none" }))
          close()
        }}
      >
        No Fill
      </MenuRow>
      <MenuRow
        onEnter={() => preview?.preview(update({ textFill: "" }))}
        onClick={() => {
          preview?.commit(update({ textFill: "" }))
          close()
        }}
      >
        Automatic
      </MenuRow>
    </div>
  )
}

export function TextOutlineMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const setColor = useShapeColors((state) => state.set)
  const current = String(attrsOf(editor).textOutline || "")
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <Palette
        preview={preview}
        current={current}
        close={close}
        apply={(color) => ({ textOutline: color })}
        onPicked={(color) => setColor("textOutline", color)}
      />
      <MenuSeparator />
      <MenuRow
        onEnter={() => preview?.preview(update({ textOutline: "" }))}
        onClick={() => {
          preview?.commit(update({ textOutline: "" }))
          close()
        }}
      >
        No Outline
      </MenuRow>
    </div>
  )
}

export function TextEffectsMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const current = String(attrsOf(editor).textEffect || "")
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <PreviewRow preview={preview} run={update({ textEffect: "" })} close={close} checked={!current}>
        No Effect
      </PreviewRow>
      {TEXT_EFFECTS.map((effect) => (
        <PreviewRow
          key={effect.id}
          preview={preview}
          run={update({ textEffect: effect.id })}
          close={close}
          checked={current === effect.id}
        >
          {effect.label}
        </PreviewRow>
      ))}
      <MenuSeparator />
      <MenuRow
        onClick={() => {
          close()
          useFormatShapePane.getState().show("text-effects")
        }}
      >
        Text Effects Options…
      </MenuRow>
    </div>
  )
}

// --- Text -------------------------------------------------------------------------------------------------------

export function TextDirectionMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const current = String(attrsOf(editor).textDirection || "")
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      {TEXT_DIRECTIONS.map((direction) => (
        <PreviewRow
          key={direction.id || "horizontal"}
          preview={preview}
          run={update({ textDirection: direction.id })}
          close={close}
          checked={current === direction.id}
        >
          {direction.label}
        </PreviewRow>
      ))}
      <MenuSeparator />
      <MenuRow
        onClick={() => {
          close()
          useFormatShapePane.getState().show("text-box")
        }}
      >
        Text Direction Options…
      </MenuRow>
    </div>
  )
}

export function AlignTextVerticalMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const current = String(attrsOf(editor).vAlign || "top")
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      {(
        [
          ["top", "Top"],
          ["middle", "Middle"],
          ["bottom", "Bottom"],
        ] as const
      ).map(([id, label]) => (
        <PreviewRow
          key={id}
          preview={preview}
          run={update({ vAlign: id === "top" ? "" : id })}
          close={close}
          checked={current === id}
        >
          {label}
        </PreviewRow>
      ))}
    </div>
  )
}

/** Which of the ribbon's Shape Styles rows shows the current style, to open at it. */
export function styleRowOf(id: string) {
  const index = STYLE_ROWS.findIndex((row) => row.styles.some((style) => style.id === id))
  return Math.max(0, index)
}
