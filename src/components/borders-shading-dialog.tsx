import { ColorMenu } from "@/components/color-menu"
import { borderPatchOf, PageBorderPanel, type BorderPatch } from "@/components/design-dialogs"
import { BorderOptionsDialog } from "@/components/border-options-dialog"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { SHADING_PATTERNS, patternImage, patternOf, patternValue } from "@/document/docx/shading-pattern"
import { useDocumentStore } from "@/document/store"
import { borderSpaceOf, updateBlocks } from "@/editor/block-format"
import { restoreSelection } from "@/editor/selection-memory"
import { applyTextBox, hasSelectedText, selectedTextBox, selectsPartOfParagraph } from "@/editor/text-box"
import type { TextBox } from "@/document/docx/text-box"
import {
  BORDER_STYLES,
  BORDER_WEIGHTS,
  DEFAULT_PEN,
  inTable,
  parsePen,
  penLine,
  readScopedBorders,
  setBordersOnCells,
  shadeScope,
  type BorderEdge,
  type BorderPen,
  type TableScope,
} from "@/editor/table-tools"
import type { Editor } from "@tiptap/core"
import { useEffect, useState } from "react"
import { create } from "zustand"

type Tab = "borders" | "page" | "shading"
type Setting = "none" | "box" | "all" | "shadow" | "custom"
type Target = TableScope | "paragraph" | "text"

/** Opens Borders and Shading (22.4) for the editor's selection, from the Home or Table Design Borders menu. */
export const useBordersShading = create<{ open: { editor: Editor; tab: Tab; id: number } | null }>(() => ({
  open: null,
}))

let opened = 0

/** Each opening starts from what is drawn now, even when the dialog was already open. */
export function openBordersAndShading(editor: Editor, tab: Tab = "borders") {
  // A click in the ribbon drops the editor's selection; the text selected before it is what Apply to Text means.
  restoreSelection(editor)
  opened += 1
  useBordersShading.setState({ open: { editor, tab, id: opened } })
}

const BOX: BorderEdge[] = ["top", "bottom", "left", "right"]
const ALL: BorderEdge[] = [...BOX, "insideH", "insideV"]

/** The setting button that matches a set of edges: None, Box, Shadow (a box that casts one), All, or Custom. */
export function settingOf(edges: Set<BorderEdge>, table: boolean, shadow = false): Setting {
  const exactly = (names: BorderEdge[]) => edges.size === names.length && names.every((name) => edges.has(name))
  if (edges.size === 0) {
    return "none"
  }
  if (exactly(BOX)) {
    return shadow && !table ? "shadow" : "box"
  }
  if (table && exactly(ALL)) {
    return "all"
  }
  return "custom"
}

export function edgesOf(setting: Setting, current: Set<BorderEdge>): Set<BorderEdge> {
  if (setting === "none") {
    return new Set()
  }
  if (setting === "box" || setting === "shadow") {
    return new Set(BOX)
  }
  if (setting === "all") {
    return new Set(ALL)
  }
  return new Set(current)
}

const STYLE_LABELS: Record<string, string> = { solid: "Solid", dashed: "Dashed", dotted: "Dotted", double: "Double" }

/** The paragraph border the editor holds for a set of edges: "all", or sides joined by commas; null for none. */
export function paragraphBorderOf(edges: Set<BorderEdge>): string | null {
  const sides = (["top", "right", "bottom", "left"] as const).filter((side) => edges.has(side))
  return sides.length === 4 ? "all" : sides.length > 0 ? sides.join(",") : null
}

/** The sides of a paragraph's `border` value ("all", or sides joined by commas). */
export function edgesOfParagraphBorder(value: unknown): Set<BorderEdge> {
  if (value === "all") {
    return new Set(BOX)
  }
  return new Set(typeof value === "string" ? BOX.filter((side) => value.split(",").includes(side)) : [])
}

/** Word's gaps between a paragraph's text and its box, in points: top, right, bottom, left. */
const DEFAULT_SPACE = [1, 4, 1, 4]
/** The `borderSpace` value for four gaps; null when they are Word's own. */
export function borderSpaceValue(space: number[]): string | null {
  return space.every((value, index) => value === DEFAULT_SPACE[index]) ? null : space.join(" ")
}

export function BordersShadingHost() {
  const open = useBordersShading((state) => state.open)
  return open ? (
    <BordersShadingDialog
      key={open.id}
      editor={open.editor}
      initialTab={open.tab}
      onClose={() => useBordersShading.setState({ open: null })}
    />
  ) : null
}

function ColorField({
  label,
  color,
  clearLabel,
  disabled = false,
  onClear,
  onSelect,
}: {
  label: string
  color: string
  clearLabel: string
  disabled?: boolean
  onClear: () => void
  onSelect: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-neutral-500">{label}</p>
      <button
        type="button"
        className="bs-color-button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="bs-swatch" style={{ background: color || "transparent" }} aria-hidden />
        {color || clearLabel}
      </button>
      {open ? (
        <ColorMenu
          active={color}
          clearLabel={clearLabel}
          onClear={() => {
            onClear()
            setOpen(false)
          }}
          onSelect={(picked) => {
            onSelect(picked)
            setOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

function BordersShadingDialog({
  editor,
  initialTab,
  onClose,
}: {
  editor: Editor
  initialTab: Tab
  onClose: () => void
}) {
  const table = inTable(editor)
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const [tab, setTab] = useState<Tab>(initialTab)
  const textSelected = hasSelectedText(editor)
  // Part of a paragraph selected starts on Text, as in Word; otherwise the cell or the paragraph.
  const [target, setTarget] = useState<Target>(selectsPartOfParagraph(editor) ? "text" : table ? "cell" : "paragraph")
  // The dialog opens on what is drawn now (the selected text, the first cell scope, or the cursor's paragraph).
  const [current] = useState(() => {
    if (target === "text") {
      const box = selectedTextBox(editor)
      return {
        edges: new Set<BorderEdge>(box.border ? BOX : []),
        pen: parsePen(box.border) ?? DEFAULT_PEN,
        fill: box.fill,
        shadow: box.shadow,
        pattern: patternOf(box.pattern),
      }
    }
    if (table) {
      return readScopedBorders(editor, "cell")
    }
    const attrs = editor.state.selection.$from.parent.attrs
    return {
      edges: edgesOfParagraphBorder(attrs.border),
      pen: parsePen(attrs.borderPen) ?? DEFAULT_PEN,
      fill: typeof attrs.shading === "string" ? attrs.shading : null,
      shadow: attrs.borderShadow === true,
      pattern: patternOf(attrs.shadingPattern),
    }
  })
  const [edges, setEdges] = useState<Set<BorderEdge>>(current?.edges ?? new Set())
  const [pen, setPenState] = useState<BorderPen>(current?.pen ?? DEFAULT_PEN)
  const [penTouched, setPenTouched] = useState(false)
  const [shadow, setShadow] = useState(current && "shadow" in current ? current.shadow : false)
  const [space, setSpace] = useState<number[] | null>(null)
  const [options, setOptions] = useState(false)
  const [fill, setFill] = useState<string | null>(current?.fill ?? null)
  const [fillTouched, setFillTouched] = useState(false)
  const openPattern = current && "pattern" in current ? current.pattern : null
  const [patternStyle, setPatternStyle] = useState(openPattern?.pattern ?? "clear")
  const [patternColor, setPatternColor] = useState<string | null>(openPattern?.color ?? null)
  const [patternTouched, setPatternTouched] = useState(false)
  const [bordersTouched, setBordersTouched] = useState(false)
  const [pageDraft, setPageDraft] = useState<BorderPatch>(borderPatchOf(setup))
  const [pageTouched, setPageTouched] = useState(false)
  const setting = settingOf(edges, table && target === "table", shadow)
  // A new style, colour or width is applied to the lines already drawn, as in Word.
  const setPen = (update: (current: BorderPen) => BorderPen) => {
    setBordersTouched(true)
    setPenTouched(true)
    setPenState(update)
  }

  useEffect(() => {
    // Moving the Apply to choice from Cell to Table keeps the lines drawn; the inside ones then count.
    if (target === "paragraph") {
      setEdges((current) => new Set([...current].filter((edge) => BOX.includes(edge))))
    }
    // Text has a box or none.
    if (target === "text") {
      setEdges((current) => new Set(current.size > 0 ? BOX : []))
    }
  }, [target])

  const choose = (next: Setting) => {
    setBordersTouched(true)
    setShadow(next === "shadow")
    setEdges((current) => edgesOf(next, current))
  }
  const toggle = (edge: BorderEdge) => {
    setBordersTouched(true)
    setShadow(false)
    setEdges((current) => {
      const next = new Set(current)
      if (next.has(edge)) {
        next.delete(edge)
      } else {
        next.add(edge)
      }
      return next
    })
  }

  const apply = () => {
    if (target === "text") {
      const patch: Partial<TextBox> = {}
      if (bordersTouched) {
        patch.border = edges.size > 0 ? penLine(pen) : null
        patch.shadow = edges.size > 0 && shadow
      }
      if (fillTouched) {
        patch.fill = fill
      }
      if (patternTouched) {
        patch.pattern = patternValue(patternStyle, patternColor)
      }
      if (Object.keys(patch).length > 0) {
        applyTextBox(editor, patch)
      }
      if (pageTouched) {
        setPageSetup({ ...setup, ...pageDraft })
      }
      onClose()
      return
    }
    if (bordersTouched) {
      if (target === "paragraph") {
        const border = paragraphBorderOf(edges)
        const attrs = editor.state.selection.$from.parent.attrs
        // An untouched pen keeps the paragraph's own (or the app's line, when it has none); so do the gaps.
        const borderPen = !border ? null : penTouched ? penLine(pen) : (attrs.borderPen ?? null)
        const borderSpace = !border ? null : space ? borderSpaceValue(space) : (attrs.borderSpace ?? null)
        updateBlocks(editor, { border, borderPen, borderShadow: Boolean(border) && shadow, borderSpace })
      } else {
        setBordersOnCells(editor, target, edges, pen)
      }
    }
    if (target === "paragraph") {
      if (fillTouched || patternTouched) {
        // Only what was changed, so a fill or pattern left alone stays as each selected paragraph has it.
        updateBlocks(editor, {
          ...(fillTouched ? { shading: fill } : {}),
          ...(patternTouched ? { shadingPattern: patternValue(patternStyle, patternColor) } : {}),
        })
      }
    } else if (fillTouched) {
      shadeScope(editor, target, fill)
    }
    if (pageTouched) {
      setPageSetup({ ...setup, ...pageDraft })
    }
    onClose()
  }

  const targets: { id: Target; label: string }[] = [
    ...(textSelected ? [{ id: "text" as const, label: "Text" }] : []),
    ...(table
      ? [
          { id: "cell" as const, label: "Cell" },
          { id: "table" as const, label: "Table" },
        ]
      : [{ id: "paragraph" as const, label: "Paragraph" }]),
  ]
  // Text has a box or none, so its edges cannot be picked one by one.
  const byEdge = target !== "text"
  // Patterns are for a paragraph or text; cells keep a fill only.
  const patterned = target === "paragraph" || target === "text"
  const settings: { id: Setting; label: string; disabled?: boolean; note?: string }[] = [
    { id: "none", label: "None" },
    { id: "box", label: "Box" },
    ...(table && target === "table" ? [{ id: "all" as const, label: "All" }] : []),
    ...(!table || target === "text" ? [{ id: "shadow" as const, label: "Shadow" }] : []),
    ...(byEdge ? [{ id: "custom" as const, label: "Custom" }] : []),
  ]
  const applyTo = (
    <label className="bs-apply">
      Apply to:
      <select aria-label="Apply to" value={target} onChange={(event) => setTarget(event.target.value as Target)}>
        {targets.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
  const lineColor = pen.color
  const edgeLine = (edge: BorderEdge) =>
    edges.has(edge) ? `${Math.max(1, pen.width)}px ${pen.style} ${lineColor}` : "1px dotted #c8c8c8"
  const edgeButton = (edge: BorderEdge, label: string, className: string) => (
    <button
      key={edge}
      type="button"
      className={`bs-edge ${className}`}
      aria-label={label}
      aria-pressed={edges.has(edge)}
      title={label}
      onClick={() => toggle(edge)}
    />
  )

  const openSpace = space ?? borderSpaceOf(editor.state.selection.$from.parent.attrs.borderSpace) ?? DEFAULT_SPACE

  return (
    <>
      <DialogFrame
        title="Borders and Shading"
        width={560}
        onClose={onClose}
        onSubmit={apply}
        tabs={[
          { id: "borders", label: "Borders" },
          { id: "page", label: "Page Border" },
          { id: "shading", label: "Shading" },
        ]}
        tab={tab}
        onTab={(id) => setTab(id as Tab)}
      >
        {tab === "borders" ? (
          <div className="bs-grid">
            <div className="bs-settings" role="group" aria-label="Setting">
              <p className="bs-heading">Setting:</p>
              {settings.map((item) => (
                <button
                  key={`${item.id}-${item.label}`}
                  type="button"
                  className="bs-setting"
                  aria-pressed={!item.disabled && setting === item.id}
                  disabled={item.disabled}
                  title={item.note}
                  onClick={() => choose(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="bs-pen">
              <p className="bs-heading">Style:</p>
              <div className="bs-styles" role="listbox" aria-label="Style">
                {BORDER_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    role="option"
                    aria-selected={pen.style === style}
                    className="bs-style"
                    onClick={() => setPen((current) => ({ ...current, style }))}
                  >
                    <span className="pen-sample" style={{ borderTop: `2px ${style} currentColor` }} />
                    <span>{STYLE_LABELS[style] ?? style}</span>
                  </button>
                ))}
              </div>
              <ColorField
                label="Color:"
                color={pen.color === DEFAULT_PEN.color ? "" : pen.color}
                clearLabel="Automatic"
                onClear={() => setPen((current) => ({ ...current, color: DEFAULT_PEN.color }))}
                onSelect={(color) => setPen((current) => ({ ...current, color }))}
              />
              <label className="bs-apply">
                Width:
                <select
                  aria-label="Width"
                  value={pen.width}
                  onChange={(event) => setPen((current) => ({ ...current, width: Number(event.target.value) }))}
                >
                  {BORDER_WEIGHTS.map((weight) => (
                    <option key={weight} value={weight}>
                      {weight} pt
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bs-preview-column">
              <p className="bs-heading">Preview</p>
              <p className="bs-hint">
                {byEdge ? "Click on diagram below or use buttons to apply borders." : "A box goes round the text."}
              </p>
              {byEdge ? null : (
                <div className="bs-text-preview" data-keep-light aria-label="Preview">
                  <span
                    style={{
                      border: edges.size > 0 ? `${Math.max(1, pen.width)}px ${pen.style} ${lineColor}` : undefined,
                      boxShadow: setting === "shadow" ? `2px 2px 0 0 ${lineColor}` : undefined,
                    }}
                  >
                    AaBbCcYyZz
                  </span>
                </div>
              )}
              {byEdge ? (
                <div className="bs-preview" data-keep-light aria-label="Preview">
                  <div
                    className="bs-page"
                    style={{
                      borderTop: edgeLine("top"),
                      borderBottom: edgeLine("bottom"),
                      borderLeft: edgeLine("left"),
                      borderRight: edgeLine("right"),
                      boxShadow: setting === "shadow" ? `4px 4px 0 0 ${lineColor}` : undefined,
                    }}
                  >
                    {table && target === "table" ? (
                      <>
                        <span className="bs-inside-h" style={{ borderTop: edgeLine("insideH") }} />
                        <span className="bs-inside-v" style={{ borderLeft: edgeLine("insideV") }} />
                      </>
                    ) : null}
                    {table && target === "cell" ? (
                      <>
                        <span
                          className="bs-diag bs-diag-down"
                          style={edges.has("diagDown") ? { background: lineColor } : undefined}
                        />
                        <span
                          className="bs-diag bs-diag-up"
                          style={edges.has("diagUp") ? { background: lineColor } : undefined}
                        />
                      </>
                    ) : null}
                    {!table || target === "paragraph" ? <span className="bs-text-lines" aria-hidden /> : null}
                  </div>
                  {edgeButton("top", "Top Border", "bs-edge-top")}
                  {edgeButton("bottom", "Bottom Border", "bs-edge-bottom")}
                  {edgeButton("left", "Left Border", "bs-edge-left")}
                  {edgeButton("right", "Right Border", "bs-edge-right")}
                  {table && target === "table"
                    ? edgeButton("insideH", "Inside Horizontal Border", "bs-edge-inside-h")
                    : null}
                  {table && target === "table"
                    ? edgeButton("insideV", "Inside Vertical Border", "bs-edge-inside-v")
                    : null}
                  {table && target === "cell"
                    ? edgeButton("diagDown", "Diagonal Down Border", "bs-edge-diag-down")
                    : null}
                  {table && target === "cell" ? edgeButton("diagUp", "Diagonal Up Border", "bs-edge-diag-up") : null}
                </div>
              ) : null}
              <div className="bs-apply-row">
                {applyTo}
                <button
                  type="button"
                  className="dialog-btn"
                  disabled={target !== "paragraph"}
                  title={target === "paragraph" ? undefined : "A cell's distance from text is set in Table Properties"}
                  onClick={() => setOptions(true)}
                >
                  Options…
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {tab === "page" ? (
          <PageBorderPanel
            draft={pageDraft}
            setDraft={(update) => {
              setPageTouched(true)
              setPageDraft(update)
            }}
          />
        ) : null}
        {tab === "shading" ? (
          <div className="bs-grid bs-shading">
            <div>
              <ColorField
                label="Fill"
                color={fill ?? ""}
                clearLabel="No Color"
                onClear={() => {
                  setFillTouched(true)
                  setFill(null)
                }}
                onSelect={(color) => {
                  setFillTouched(true)
                  setFill(color)
                }}
              />
              <fieldset className="bs-patterns">
                <legend>Patterns</legend>
                <label className="bs-option">
                  Style:
                  <select
                    aria-label="Pattern style"
                    value={patternStyle}
                    disabled={!patterned}
                    onChange={(event) => {
                      setPatternTouched(true)
                      setPatternStyle(event.target.value)
                    }}
                  >
                    {SHADING_PATTERNS.map((pattern) => (
                      <option key={pattern.value} value={pattern.value}>
                        {pattern.label}
                      </option>
                    ))}
                  </select>
                </label>
                <ColorField
                  label="Color"
                  color={patternColor ?? ""}
                  clearLabel="Automatic"
                  disabled={!patterned || patternStyle === "clear"}
                  onClear={() => {
                    setPatternTouched(true)
                    setPatternColor(null)
                  }}
                  onSelect={(color) => {
                    setPatternTouched(true)
                    setPatternColor(color)
                  }}
                />
                {patterned ? null : <p className="bs-hint">Patterns apply to a paragraph or text.</p>}
              </fieldset>
            </div>
            <div className="bs-preview-column">
              <p className="bs-heading">Preview</p>
              <div
                className="bs-shade-preview"
                data-keep-light
                style={{
                  backgroundColor: fill ?? "#ffffff",
                  backgroundImage: (patterned && patternImage(patternValue(patternStyle, patternColor))) || undefined,
                }}
                aria-label="Preview"
              />
              {applyTo}
            </div>
          </div>
        ) : null}
        <DialogButtons submit onCancel={onClose} />
      </DialogFrame>
      {options ? (
        <BorderOptionsDialog
          space={openSpace}
          onClose={() => setOptions(false)}
          onDone={(next) => {
            setBordersTouched(true)
            setSpace(next)
            setOptions(false)
          }}
        />
      ) : null}
    </>
  )
}
