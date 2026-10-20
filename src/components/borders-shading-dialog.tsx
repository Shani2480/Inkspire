import { ColorMenu } from "@/components/color-menu"
import { PageBorderPanel, type BorderPatch } from "@/components/design-dialogs"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { useDocumentStore } from "@/document/store"
import { updateBlocks } from "@/editor/block-format"
import {
  BORDER_STYLES,
  BORDER_WEIGHTS,
  DEFAULT_PEN,
  inTable,
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
type Setting = "none" | "box" | "all" | "custom"
type Target = TableScope | "paragraph"

/** Opens Borders and Shading (22.4) for the editor's selection, from the Home or Table Design Borders menu. */
export const useBordersShading = create<{ open: { editor: Editor; tab: Tab } | null }>(() => ({ open: null }))

export function openBordersAndShading(editor: Editor, tab: Tab = "borders") {
  useBordersShading.setState({ open: { editor, tab } })
}

const BOX: BorderEdge[] = ["top", "bottom", "left", "right"]
const ALL: BorderEdge[] = [...BOX, "insideH", "insideV"]

/** The setting button that matches a set of edges: None, Box, All, or Custom for anything else. */
export function settingOf(edges: Set<BorderEdge>, table: boolean): Setting {
  const exactly = (names: BorderEdge[]) => edges.size === names.length && names.every((name) => edges.has(name))
  if (edges.size === 0) {
    return "none"
  }
  if (exactly(BOX)) {
    return "box"
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
  if (setting === "box") {
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

export function BordersShadingHost() {
  const open = useBordersShading((state) => state.open)
  return open ? (
    <BordersShadingDialog
      key={open.tab}
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
  onClear,
  onSelect,
}: {
  label: string
  color: string
  clearLabel: string
  onClear: () => void
  onSelect: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-neutral-500">{label}</p>
      <button type="button" className="bs-color-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
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
  // The dialog opens on what is drawn now (the first cell scope, or the paragraph the cursor is in).
  const [current] = useState(() => {
    if (table) {
      return readScopedBorders(editor, "cell")
    }
    const attrs = editor.state.selection.$from.parent.attrs
    return {
      edges: edgesOfParagraphBorder(attrs.border),
      pen: DEFAULT_PEN,
      fill: typeof attrs.shading === "string" ? attrs.shading : null,
    }
  })
  const [edges, setEdges] = useState<Set<BorderEdge>>(current?.edges ?? new Set())
  const [pen, setPen] = useState<BorderPen>(current?.pen ?? DEFAULT_PEN)
  const [target, setTarget] = useState<Target>(table ? "cell" : "paragraph")
  const [fill, setFill] = useState<string | null>(current?.fill ?? null)
  const [fillTouched, setFillTouched] = useState(false)
  const [bordersTouched, setBordersTouched] = useState(false)
  const [pageDraft, setPageDraft] = useState<BorderPatch>({
    border: setup.border,
    borderColor: setup.borderColor,
    borderWidth: setup.borderWidth,
    borderLine: setup.borderLine,
  })
  const [pageTouched, setPageTouched] = useState(false)
  const setting = settingOf(edges, table && target === "table")

  useEffect(() => {
    // Moving the Apply to choice from Cell to Table keeps the lines drawn; the inside ones then count.
    if (target === "paragraph") {
      setEdges((current) => new Set([...current].filter((edge) => BOX.includes(edge))))
    }
  }, [target])

  const choose = (next: Setting) => {
    setBordersTouched(true)
    setEdges((current) => edgesOf(next, current))
  }
  const toggle = (edge: BorderEdge) => {
    setBordersTouched(true)
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
    if (bordersTouched) {
      if (target === "paragraph") {
        updateBlocks(editor, { border: paragraphBorderOf(edges) })
      } else {
        setBordersOnCells(editor, target, edges, pen)
      }
    }
    if (fillTouched) {
      if (target === "paragraph") {
        updateBlocks(editor, { shading: fill })
      } else {
        shadeScope(editor, target, fill)
      }
    }
    if (pageTouched) {
      setPageSetup({ ...setup, ...pageDraft })
    }
    onClose()
  }

  const targets: { id: Target; label: string }[] = table
    ? [
        { id: "cell", label: "Cell" },
        { id: "table", label: "Table" },
      ]
    : [{ id: "paragraph", label: "Paragraph" }]
  const settings: { id: Setting; label: string; disabled?: boolean; note?: string }[] = [
    { id: "none", label: "None" },
    { id: "box", label: "Box" },
    ...(table && target === "table" ? [{ id: "all" as const, label: "All" }] : []),
    ...(!table
      ? [{ id: "custom" as const, label: "Shadow", disabled: true, note: "Shadow borders are not supported" }]
      : []),
    { id: "custom", label: "Custom" },
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

  return (
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
            <p className="bs-hint">Click on diagram below or use buttons to apply borders.</p>
            <div className="bs-preview" data-keep-light aria-label="Preview">
              <div
                className="bs-page"
                style={{
                  borderTop: edgeLine("top"),
                  borderBottom: edgeLine("bottom"),
                  borderLeft: edgeLine("left"),
                  borderRight: edgeLine("right"),
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
                {!table ? <span className="bs-text-lines" aria-hidden /> : null}
              </div>
              {edgeButton("top", "Top Border", "bs-edge-top")}
              {edgeButton("bottom", "Bottom Border", "bs-edge-bottom")}
              {edgeButton("left", "Left Border", "bs-edge-left")}
              {edgeButton("right", "Right Border", "bs-edge-right")}
              {table && target === "table"
                ? edgeButton("insideH", "Inside Horizontal Border", "bs-edge-inside-h")
                : null}
              {table && target === "table" ? edgeButton("insideV", "Inside Vertical Border", "bs-edge-inside-v") : null}
              {table && target === "cell" ? edgeButton("diagDown", "Diagonal Down Border", "bs-edge-diag-down") : null}
              {table && target === "cell" ? edgeButton("diagUp", "Diagonal Up Border", "bs-edge-diag-up") : null}
            </div>
            {applyTo}
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
            <p className="bs-hint">Patterns are not supported.</p>
          </div>
          <div className="bs-preview-column">
            <p className="bs-heading">Preview</p>
            <div
              className="bs-shade-preview"
              data-keep-light
              style={{ background: fill ?? "#ffffff" }}
              aria-label="Preview"
            />
            {applyTo}
          </div>
        </div>
      ) : null}
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
