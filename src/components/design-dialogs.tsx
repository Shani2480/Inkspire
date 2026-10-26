import { ColorMenu } from "@/components/color-menu"
import { savePageSetupDefault } from "@/document/design-format"
import {
  PAPER_SIZES,
  PAPER_SOURCES,
  clampMargin,
  cmToMm,
  mmToCm,
  paperBox,
  PAGE_SIDES,
  type BorderDisplay,
  type BorderLine,
  type PageBorder,
  type PageSide,
  type PageSetup,
  type PaperSize,
} from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { printDocument } from "@/document/commands"
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { BorderOptionsDialog } from "@/components/border-options-dialog"

export type BorderPatch = Pick<
  PageSetup,
  | "border"
  | "borderColor"
  | "borderWidth"
  | "borderLine"
  | "borderDisplay"
  | "borderFrom"
  | "borderSpace"
  | "borderSides"
  | "borderInFront"
  | "borderSurroundHeader"
  | "borderSurroundFooter"
  | "borderAlign"
>

/** The page border fields of a page setup, as the Page Border tab edits them. */
export function borderPatchOf(setup: PageSetup): BorderPatch {
  return {
    border: setup.border,
    borderColor: setup.borderColor,
    borderWidth: setup.borderWidth,
    borderLine: setup.borderLine,
    borderDisplay: setup.borderDisplay,
    borderFrom: setup.borderFrom,
    borderSpace: setup.borderSpace,
    borderSides: setup.borderSides,
    borderInFront: setup.borderInFront,
    borderSurroundHeader: setup.borderSurroundHeader,
    borderSurroundFooter: setup.borderSurroundFooter,
    borderAlign: setup.borderAlign,
  }
}

const SIDE_LABELS: Record<PageSide, string> = {
  top: "Top Border",
  bottom: "Bottom Border",
  left: "Left Border",
  right: "Right Border",
}

/** Page Border > Apply to: one section here, so the whole document and this section are the same pages. */
const BORDER_SCOPES: { id: string; label: string; display: BorderDisplay }[] = [
  { id: "document", label: "Whole document", display: "all" },
  { id: "section", label: "This section", display: "all" },
  { id: "first", label: "This section - First page only", display: "first" },
  { id: "not-first", label: "This section - All except first page", display: "not-first" },
]

type BordersRequest = {
  setup: PageSetup
  onApply: (patch: BorderPatch) => void
}

const LINE_CHOICES: { id: string; label: string; border: PageBorder; line: BorderLine; width: number | null }[] = [
  { id: "none", label: "None", border: "none", line: "solid", width: null },
  { id: "hairline", label: "Hairline", border: "single", line: "solid", width: 0.25 },
  { id: "solid", label: "Solid", border: "single", line: "solid", width: 0.5 },
  { id: "thick", label: "Thick", border: "single", line: "solid", width: 1.5 },
  { id: "dashed", label: "Dashed", border: "single", line: "dashed", width: null },
  { id: "dotted", label: "Dotted", border: "single", line: "dotted", width: null },
  { id: "groove", label: "Groove", border: "single", line: "groove", width: null },
  { id: "ridge", label: "Ridge", border: "single", line: "ridge", width: null },
  { id: "double", label: "Double", border: "double", line: "solid", width: null },
]

let bordersListener: ((request: BordersRequest) => void) | null = null
let setupListener: (() => void) | null = null

export function requestPageBorders(request: BordersRequest) {
  bordersListener?.(request)
}

export function requestPageSetup() {
  setupListener?.()
}

export function DesignDialogs() {
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const [borders, setBorders] = useState<BordersRequest | null>(null)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)

  useEffect(() => {
    bordersListener = setBorders
    setupListener = () => setPageSetupOpen(true)
    return () => {
      bordersListener = null
      setupListener = null
    }
  }, [])

  return (
    <>
      {pageSetupOpen ? (
        <PageSetupDialog
          setup={setup}
          onClose={() => setPageSetupOpen(false)}
          onApply={(next) => {
            setPageSetup(next)
            setPageSetupOpen(false)
          }}
        />
      ) : null}
      {borders ? (
        <PageBordersDialog
          setup={borders.setup}
          onClose={() => setBorders(null)}
          onApply={(patch) => {
            borders.onApply(patch)
            setBorders(null)
          }}
        />
      ) : null}
    </>
  )
}

function PageBordersDialog({
  setup,
  onClose,
  onApply,
}: {
  setup: PageSetup
  onClose: () => void
  onApply: (patch: BorderPatch) => void
}) {
  const [draft, setDraft] = useState<BorderPatch>(borderPatchOf(setup))
  return (
    <Overlay title="Borders and Shading" onClose={onClose} wide level={90}>
      <PageBorderPanel draft={draft} setDraft={setDraft} />
      <DialogActions onClose={onClose} onOk={() => onApply(draft)} />
    </Overlay>
  )
}

/** The page border's style, width, colour and preview: the Page Border tab of Borders and Shading. */
export function PageBorderPanel({
  draft,
  setDraft,
}: {
  draft: BorderPatch
  setDraft: (update: (current: BorderPatch) => BorderPatch) => void
}) {
  const activeLine = LINE_CHOICES.find(
    (item) =>
      item.border === draft.border &&
      (item.border === "double" || item.border === "none" || item.line === draft.borderLine) &&
      (item.width == null || item.width === draft.borderWidth),
  )
  const [scope, setScope] = useState(
    () => BORDER_SCOPES.find((item) => item.display === draft.borderDisplay)?.id ?? "document",
  )
  const [options, setOptions] = useState(false)

  return (
    <div className="grid grid-cols-[180px_1fr] gap-4">
      <div>
        <p className="mb-1 text-[11px] font-semibold text-neutral-500">Style</p>
        <div className="flex max-h-64 flex-col overflow-auto rounded border border-black/10">
          {LINE_CHOICES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={activeLine?.id === item.id}
              className="flex items-center gap-2 border-b border-black/5 px-2 py-1.5 text-left text-xs last:border-b-0 aria-pressed:bg-[var(--dlg-item-hover)]"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  border: item.border,
                  borderLine: item.line,
                  borderWidth: item.width ?? current.borderWidth,
                }))
              }
            >
              <LineSample item={item} color={draft.borderColor} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center justify-between text-xs text-[var(--dlg-muted)]">
          Width
          <span className="flex items-center gap-1">
            <input
              aria-label="Border width in millimeters"
              type="number"
              min={0.2}
              max={6}
              step={0.1}
              value={draft.borderWidth}
              className="h-7 w-16 rounded border border-black/15 px-2"
              onChange={(event) => {
                const width = clampBorderWidth(Number(event.target.value))
                setDraft((current) => ({
                  ...current,
                  borderWidth: width,
                  border: current.border === "none" ? "single" : current.border,
                }))
              }}
            />
            mm
          </span>
        </label>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold text-neutral-500">Color</p>
        <ColorMenu
          active={draft.borderColor}
          clearLabel="Automatic"
          onClear={() =>
            setDraft((current) => ({
              ...current,
              borderColor: "#1c1c1c",
              border: current.border === "none" ? "single" : current.border,
            }))
          }
          onSelect={(borderColor) =>
            setDraft((current) => ({
              ...current,
              borderColor,
              border: current.border === "none" ? "single" : current.border,
            }))
          }
        />
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold text-neutral-500">Preview</p>
          <p className="bs-hint">Click on diagram below or use buttons to apply borders.</p>
          <div className="bs-preview" data-keep-light aria-label="Page border preview">
            <div
              className="bs-page"
              style={{
                borderColor: draft.border === "none" ? "transparent" : draft.borderColor,
                borderStyle: PAGE_SIDES.map((side) =>
                  draft.border === "none" || !draft.borderSides.includes(side)
                    ? "none"
                    : draft.border === "double"
                      ? "double"
                      : draft.borderLine,
                ).join(" "),
                borderWidth:
                  draft.border === "none"
                    ? 0
                    : draft.border === "double"
                      ? Math.max(3, draft.borderWidth * 3)
                      : draft.borderWidth * (96 / 25.4),
              }}
            />
            {PAGE_SIDES.map((side) => (
              <button
                key={side}
                type="button"
                className={`bs-edge bs-edge-${side}`}
                aria-label={SIDE_LABELS[side]}
                title={SIDE_LABELS[side]}
                aria-pressed={draft.border !== "none" && draft.borderSides.includes(side)}
                onClick={() => setDraft((current) => toggleSide(current, side))}
              />
            ))}
          </div>
        </div>
        <div className="bs-apply-row mt-3">
          <label className="bs-apply">
            Apply to:
            <select
              aria-label="Page border applies to"
              value={scope}
              onChange={(event) => {
                const next = BORDER_SCOPES.find((item) => item.id === event.target.value) ?? BORDER_SCOPES[0]
                setScope(next.id)
                setDraft((current) => ({ ...current, borderDisplay: next.display }))
              }}
            >
              {BORDER_SCOPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="dialog-btn" onClick={() => setOptions(true)}>
            Options…
          </button>
        </div>
      </div>
      {options
        ? createPortal(
            <BorderOptionsDialog
              space={draft.borderSpace}
              from={draft.borderFrom}
              flags={{
                borderAlign: draft.borderAlign,
                borderInFront: draft.borderInFront,
                borderSurroundHeader: draft.borderSurroundHeader,
                borderSurroundFooter: draft.borderSurroundFooter,
              }}
              onClose={() => setOptions(false)}
              onDone={(borderSpace, borderFrom, flags) => {
                setDraft((current) => ({ ...current, borderSpace, borderFrom, ...flags }))
                setOptions(false)
              }}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

/**
 * A click on one side in Page Border's preview: off when it is drawn, on when it is not. With no border, the side is
 * drawn alone, in a single line; the last side clicked off leaves no border.
 */
function toggleSide(current: BorderPatch, side: PageSide): BorderPatch {
  if (current.border === "none") {
    return { ...current, border: "single", borderSides: [side] }
  }
  const sides = current.borderSides.includes(side)
    ? current.borderSides.filter((item) => item !== side)
    : PAGE_SIDES.filter((item) => item === side || current.borderSides.includes(item))
  return sides.length === 0
    ? { ...current, border: "none", borderSides: PAGE_SIDES }
    : { ...current, borderSides: sides }
}

function PageSetupDialog({
  setup,
  onClose,
  onApply,
}: {
  setup: PageSetup
  onClose: () => void
  onApply: (next: PageSetup) => void
}) {
  const differentFirstPage = useDocumentStore((state) => state.differentFirstPage)
  const setDifferentFirstPage = useDocumentStore((state) => state.setDifferentFirstPage)
  const [draft, setDraft] = useState(setup)
  const [tab, setTab] = useState<"margins" | "paper" | "layout">("margins")
  const [applyTo, setApplyTo] = useState("whole")
  const [firstPage, setFirstPage] = useState(differentFirstPage)
  const [lineNumbersOpen, setLineNumbersOpen] = useState(false)
  const [printOptionsOpen, setPrintOptionsOpen] = useState(false)

  function patch(next: Partial<PageSetup>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  function commit() {
    setDifferentFirstPage(firstPage)
    onApply(draft)
  }

  const box = paperBox({ ...draft, orientation: "portrait" })
  const previewBox = paperBox(draft)

  return (
    <Overlay title="Page Setup" onClose={onClose} wide>
      <div className="flex gap-1 border-b border-black/10">
        {(
          [
            ["margins", "Margins"],
            ["paper", "Paper"],
            ["layout", "Layout"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`-mb-px border-b-2 px-3 py-1.5 text-xs ${
              tab === id
                ? "border-[var(--dlg-accent)] text-[var(--dlg-accent)]"
                : "border-transparent text-[var(--dlg-muted)]"
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_150px] gap-4">
        <div className="min-w-0">
          {tab === "margins" ? (
            <div className="grid gap-4">
              <section>
                <p className="mb-2 text-[11px] font-semibold text-neutral-500">Margins</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <CmField
                    label="Top"
                    valueMm={draft.marginTop}
                    onChange={(mm) => patch({ marginTop: clampMargin(mm) })}
                  />
                  <CmField
                    label="Bottom"
                    valueMm={draft.marginBottom}
                    onChange={(mm) => patch({ marginBottom: clampMargin(mm) })}
                  />
                  <CmField
                    label="Left"
                    valueMm={draft.marginLeft}
                    onChange={(mm) => patch({ marginLeft: clampMargin(mm) })}
                  />
                  <CmField
                    label="Right"
                    valueMm={draft.marginRight}
                    onChange={(mm) => patch({ marginRight: clampMargin(mm) })}
                  />
                  <CmField
                    label="Gutter"
                    valueMm={draft.gutter}
                    min={0}
                    onChange={(mm) => patch({ gutter: Math.max(0, mm) })}
                  />
                  <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--dlg-muted)]">
                    Gutter position
                    <select
                      aria-label="Gutter position"
                      className="h-7 rounded border border-black/15 px-2 text-xs text-neutral-900"
                      value={draft.gutterPosition}
                      onChange={(event) => patch({ gutterPosition: event.target.value as PageSetup["gutterPosition"] })}
                    >
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="top">Top</option>
                    </select>
                  </label>
                </div>
              </section>
              <section>
                <p className="mb-2 text-[11px] font-semibold text-neutral-500">Orientation</p>
                <div className="flex gap-3">
                  <OrientationChoice
                    label="Portrait"
                    selected={draft.orientation === "portrait"}
                    landscape={false}
                    onSelect={() => patch({ orientation: "portrait" })}
                  />
                  <OrientationChoice
                    label="Landscape"
                    selected={draft.orientation === "landscape"}
                    landscape
                    onSelect={() => patch({ orientation: "landscape" })}
                  />
                </div>
              </section>
              <section>
                <p className="mb-2 text-[11px] font-semibold text-neutral-500">Pages</p>
                <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--dlg-muted)]">
                  Multiple pages
                  <select
                    aria-label="Multiple pages"
                    className="h-7 rounded border border-black/15 px-2 text-xs text-neutral-900"
                    value={draft.multiplePages}
                    onChange={(event) => patch({ multiplePages: event.target.value as PageSetup["multiplePages"] })}
                  >
                    <option value="normal">Normal</option>
                    <option value="mirror">Mirror margins</option>
                    <option value="2pages">2 pages per sheet</option>
                    <option value="book-fold">Book fold</option>
                  </select>
                </label>
              </section>
            </div>
          ) : null}

          {tab === "paper" ? (
            <div className="grid gap-4">
              <section>
                <p className="mb-2 text-[11px] font-semibold text-neutral-500">Paper size</p>
                <label className="mb-2 flex items-center justify-between gap-2 text-[11px] text-[var(--dlg-muted)]">
                  Paper size
                  <select
                    aria-label="Paper size"
                    className="h-7 rounded border border-black/15 px-2 text-xs text-neutral-900"
                    value={draft.paper}
                    onChange={(event) =>
                      patch({
                        paper: event.target.value as PaperSize,
                        paperWidth: 0,
                        paperHeight: 0,
                      })
                    }
                  >
                    {PAPER_SIZES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <CmField
                    label="Width"
                    valueMm={draft.paperWidth > 0 ? draft.paperWidth : box.width}
                    min={5}
                    max={60}
                    onChange={(mm) =>
                      patch({ paperWidth: mm, paperHeight: draft.paperHeight > 0 ? draft.paperHeight : box.height })
                    }
                  />
                  <CmField
                    label="Height"
                    valueMm={draft.paperHeight > 0 ? draft.paperHeight : box.height}
                    min={5}
                    max={60}
                    onChange={(mm) =>
                      patch({ paperHeight: mm, paperWidth: draft.paperWidth > 0 ? draft.paperWidth : box.width })
                    }
                  />
                </div>
              </section>
              <section>
                <p className="mb-2 text-[11px] font-semibold text-neutral-500">Paper source</p>
                <div className="grid grid-cols-2 gap-3">
                  <PaperSourceList
                    label="First page"
                    value={draft.paperSourceFirst}
                    onChange={(paperSourceFirst) => patch({ paperSourceFirst })}
                  />
                  <PaperSourceList
                    label="Other pages"
                    value={draft.paperSourceOther}
                    onChange={(paperSourceOther) => patch({ paperSourceOther })}
                  />
                </div>
                <button
                  type="button"
                  className="mt-3 rounded border border-black/15 px-3 py-1 text-xs"
                  onClick={() => setPrintOptionsOpen(true)}
                >
                  Print Options…
                </button>
              </section>
            </div>
          ) : null}

          {tab === "layout" ? (
            <div className="grid gap-4">
              <section>
                <p className="mb-2 text-[11px] font-semibold text-neutral-500">Section</p>
                <label className="mb-2 flex items-center justify-between gap-2 text-[11px] text-[var(--dlg-muted)]">
                  Section start
                  <select
                    aria-label="Section start"
                    className="h-7 rounded border border-black/15 px-2 text-xs text-neutral-900"
                    value={draft.sectionStart}
                    onChange={(event) => patch({ sectionStart: event.target.value as PageSetup["sectionStart"] })}
                  >
                    <option value="new-page">New page</option>
                    <option value="continuous">Continuous</option>
                    <option value="even">Even page</option>
                    <option value="odd">Odd page</option>
                    <option value="new-column">New column</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-800">
                  <input
                    type="checkbox"
                    checked={draft.suppressEndnotes}
                    onChange={(event) => patch({ suppressEndnotes: event.target.checked })}
                  />
                  Suppress endnotes
                </label>
              </section>
              <section>
                <p className="mb-2 text-[11px] font-semibold text-neutral-500">Headers and footers</p>
                <label className="mb-1 flex items-center gap-2 text-xs text-neutral-800">
                  <input
                    type="checkbox"
                    checked={draft.differentOddEven}
                    onChange={(event) => patch({ differentOddEven: event.target.checked })}
                  />
                  Different odd and even
                </label>
                <label className="mb-2 flex items-center gap-2 text-xs text-neutral-800">
                  <input type="checkbox" checked={firstPage} onChange={(event) => setFirstPage(event.target.checked)} />
                  Different first page
                </label>
                <p className="mb-1 text-[11px] text-neutral-500">From edge</p>
                <div className="grid grid-cols-2 gap-3">
                  <CmField
                    label="Header"
                    valueMm={draft.headerFromEdge}
                    min={0}
                    max={10}
                    onChange={(mm) => patch({ headerFromEdge: Math.max(0, mm) })}
                  />
                  <CmField
                    label="Footer"
                    valueMm={draft.footerFromEdge}
                    min={0}
                    max={10}
                    onChange={(mm) => patch({ footerFromEdge: Math.max(0, mm) })}
                  />
                </div>
              </section>
              <section>
                <p className="mb-2 text-[11px] font-semibold text-neutral-500">Page</p>
                <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--dlg-muted)]">
                  Vertical alignment
                  <select
                    aria-label="Vertical alignment"
                    className="h-7 rounded border border-black/15 px-2 text-xs text-neutral-900"
                    value={draft.verticalAlign}
                    onChange={(event) => patch({ verticalAlign: event.target.value as PageSetup["verticalAlign"] })}
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="justified">Justified</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="dialog-btn" onClick={() => setLineNumbersOpen(true)}>
                    Line Numbers…
                  </button>
                  <button
                    type="button"
                    className="dialog-btn"
                    onClick={() =>
                      requestPageBorders({
                        setup: draft,
                        onApply: (borderPatch) => setDraft((current) => ({ ...current, ...borderPatch })),
                      })
                    }
                  >
                    Borders…
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <aside className="flex flex-col items-center gap-2">
          <p className="text-[11px] font-semibold text-neutral-500">Preview</p>
          <PageSetupPreview setup={draft} box={previewBox} />
        </aside>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
        <label className="flex items-center gap-2 text-[11px] text-[var(--dlg-muted)]">
          Apply to
          <select
            aria-label="Apply to"
            className="h-7 rounded border border-black/15 px-2 text-xs text-neutral-900"
            value={applyTo}
            onChange={(event) => setApplyTo(event.target.value)}
          >
            <option value="whole">Whole document</option>
            <option value="section">This section</option>
            <option value="selected">Selected text</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded-md border border-black/15 px-2.5 py-1 text-xs"
          onClick={() => savePageSetupDefault(draft)}
        >
          Set As Default
        </button>
        <div className="ml-auto flex gap-2">
          <button type="button" className="dialog-btn is-primary" onClick={commit}>
            OK
          </button>
          <button type="button" className="dialog-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      {lineNumbersOpen ? (
        <LineNumbersDialog
          setup={draft}
          onClose={() => setLineNumbersOpen(false)}
          onApply={(next) => {
            patch(next)
            setLineNumbersOpen(false)
          }}
        />
      ) : null}
      {printOptionsOpen ? <PrintOptionsDialog onClose={() => setPrintOptionsOpen(false)} /> : null}
    </Overlay>
  )
}

function CmField({
  label,
  valueMm,
  onChange,
  min = 1,
  max = 6,
}: {
  label: string
  valueMm: number
  onChange: (mm: number) => void
  min?: number
  max?: number
}) {
  const cm = mmToCm(valueMm)
  function bump(delta: number) {
    const next = Math.min(max, Math.max(min, Math.round((cm + delta) * 100) / 100))
    onChange(cmToMm(next))
  }
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--dlg-muted)]">
      <span>{label}</span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex overflow-hidden rounded border border-black/15">
          <input
            aria-label={`${label} in centimeters`}
            type="number"
            min={min}
            max={max}
            step={0.01}
            value={cm}
            className="h-7 w-16 border-0 px-2 text-xs text-neutral-900"
            onChange={(event) => onChange(cmToMm(Number(event.target.value)))}
          />
          <span className="flex w-4 flex-col border-l border-black/15">
            <button
              type="button"
              aria-label={`${label} up`}
              className="flex-1 text-[8px] leading-none hover:bg-neutral-100"
              onClick={() => bump(0.01)}
            >
              ▴
            </button>
            <button
              type="button"
              aria-label={`${label} down`}
              className="flex-1 border-t border-black/15 text-[8px] leading-none hover:bg-neutral-100"
              onClick={() => bump(-0.01)}
            >
              ▾
            </button>
          </span>
        </span>
        <span>cm</span>
      </span>
    </label>
  )
}

function OrientationChoice({
  label,
  selected,
  landscape,
  onSelect,
}: {
  label: string
  selected: boolean
  landscape: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`flex flex-col items-center gap-1 rounded border px-3 py-2 text-xs ${
        selected ? "border-[var(--dlg-accent)] bg-[var(--dlg-item-hover)]" : "border-black/10"
      }`}
      onClick={onSelect}
    >
      <span
        className="border border-neutral-400 bg-white shadow-sm"
        style={{ width: landscape ? 36 : 26, height: landscape ? 26 : 36 }}
      />
      {label}
    </button>
  )
}

function PaperSourceList({
  label,
  value,
  onChange,
}: {
  label: string
  value: PageSetup["paperSourceFirst"]
  onChange: (value: PageSetup["paperSourceFirst"]) => void
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-[var(--dlg-muted)]">{label}</p>
      <div className="h-36 overflow-auto rounded border border-black/15" role="listbox" aria-label={label}>
        {PAPER_SOURCES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={value === item.id}
            className={`block w-full truncate px-2 py-1 text-left text-xs ${
              value === item.id
                ? "bg-[var(--dlg-accent)] text-[var(--dlg-accent-text)]"
                : "text-neutral-900 hover:bg-neutral-100"
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PageSetupPreview({ setup, box }: { setup: PageSetup; box: { width: number; height: number } }) {
  const scale = 110 / Math.max(box.width, box.height)
  const width = box.width * scale
  const height = box.height * scale
  const top = setup.marginTop * scale
  const right = setup.marginRight * scale
  const bottom = setup.marginBottom * scale
  const left = setup.marginLeft * scale
  return (
    <div className="relative border border-neutral-400 bg-white shadow-sm" style={{ width, height }} aria-hidden>
      <div className="absolute border border-dashed border-[var(--dlg-accent)]" style={{ top, right, bottom, left }} />
    </div>
  )
}

function LineNumbersDialog({
  setup,
  onClose,
  onApply,
}: {
  setup: PageSetup
  onClose: () => void
  onApply: (next: Partial<PageSetup>) => void
}) {
  const [mode, setMode] = useState<"none" | "continuous" | "page">(
    !setup.lineNumbers ? "none" : setup.lineNumberRestart === "page" ? "page" : "continuous",
  )
  return (
    <Overlay title="Line Numbers" onClose={onClose} level={92}>
      <fieldset className="grid gap-2 text-sm text-neutral-800">
        <legend className="mb-1 text-xs text-[var(--dlg-muted)]">Line numbers</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "none"} onChange={() => setMode("none")} /> None
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "continuous"} onChange={() => setMode("continuous")} /> Continuous
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "page"} onChange={() => setMode("page")} /> Restart Each Page
        </label>
      </fieldset>
      <DialogActions
        onClose={onClose}
        onOk={() =>
          onApply({
            lineNumbers: mode !== "none",
            lineNumberRestart: mode === "page" ? "page" : "continuous",
          })
        }
      />
    </Overlay>
  )
}

function PrintOptionsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Overlay title="Print Options" onClose={onClose} level={92}>
      <p className="text-xs text-[var(--dlg-muted)]">
        Printer-specific options open with the system print dialog. Use Print to continue.
      </p>
      <div className="word-dialog-actions">
        <button
          type="button"
          className="dialog-btn is-primary"
          onClick={() => {
            printDocument()
            onClose()
          }}
        >
          Print
        </button>
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Overlay>
  )
}

function LineSample({ item, color }: { item: (typeof LINE_CHOICES)[number]; color: string }) {
  return (
    <span
      className="inline-block w-10"
      style={{
        borderTopStyle: item.border === "none" ? "none" : item.border === "double" ? "double" : item.line,
        borderTopWidth:
          item.border === "none" ? 0 : item.border === "double" ? 4 : Math.max(1, (item.width ?? 0.75) * 1.5),
        // Automatic is drawn in the text colour, so it shows in dark mode too.
        borderTopColor: item.border === "none" ? "transparent" : color === "#1c1c1c" ? "currentColor" : color,
      }}
    />
  )
}

function clampBorderWidth(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5
  }
  return Math.min(6, Math.max(0.2, Math.round(value * 10) / 10))
}

function Overlay({
  title,
  onClose,
  wide = false,
  level = 80,
  children,
}: {
  title: string
  onClose: () => void
  wide?: boolean
  level?: number
  children: ReactNode
}) {
  return (
    <DialogFrame title={title} width={wide ? 640 : 440} onClose={onClose} level={level}>
      {children}
    </DialogFrame>
  )
}

function DialogActions({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  return <DialogButtons onOk={onOk} onCancel={onClose} />
}
