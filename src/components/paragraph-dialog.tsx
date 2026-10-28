import { useStyleStore } from "@/document/styles"
import { updateBlocks } from "@/editor/block-format"
import { useDocumentEditor } from "@/editor/document-editor"
import { INDENT_MAX, INDENT_STEP_PX, clampIndent } from "@/editor/indent"
import { restoreSelection } from "@/editor/selection-memory"
import { addTabStop, parseTabStops, removeTabStop, type TabAlign } from "@/editor/tab-stops"
import type { Editor } from "@tiptap/core"
import { askDefaultScope, setNormalDefault } from "@/components/set-default-dialog"
import { Check, Keyed, Label, Section, SpinField, WordDialog, trimNumber } from "@/components/word-dialog"
import { useEffect, useState } from "react"

/** One editor indent step in centimetres: the left indent moves in these steps. */
const STEP_CM = (INDENT_STEP_PX / 96) * 2.54

/** The dialog keeps one size on both tabs, as Word's does, so switching tabs never moves it. */
const DIALOG_WIDTH = 468
const DIALOG_HEIGHT = 560

type Align = "left" | "center" | "right" | "justify"
type Special = "none" | "first" | "hanging"
type LineRule = "multiple" | "exact" | "at-least"
/** Word's Line spacing choices: three named multiples, and the three rules. */
type LineSpacing = "single" | "1.5" | "double" | "at-least" | "exact" | "multiple"
type TabName = "spacing" | "breaks"

export type ParagraphDraft = {
  align: Align
  outline: string
  collapsed: boolean
  leftCm: string
  rightCm: string
  special: Special
  specialBy: string
  mirror: boolean
  before: string
  after: string
  lineSpacing: LineSpacing
  lineAt: string
  contextual: boolean
  widow: boolean
  keepNext: boolean
  keepLines: boolean
  pageBreakBefore: boolean
  suppressLines: boolean
  dontHyphenate: boolean
  tightWrap: string
}

const EMPTY: ParagraphDraft = {
  align: "left",
  outline: "body",
  collapsed: false,
  leftCm: "0",
  rightCm: "0",
  special: "none",
  specialBy: "",
  mirror: false,
  before: "0",
  after: "8",
  lineSpacing: "multiple",
  lineAt: "1.15",
  contextual: false,
  widow: true,
  keepNext: false,
  keepLines: false,
  pageBreakBefore: false,
  suppressLines: false,
  dontHyphenate: false,
  tightWrap: "none",
}

const NAMED_MULTIPLES: Partial<Record<LineSpacing, string>> = { single: "1", "1.5": "1.5", double: "2" }

/** Word's text box tight wrap values (w:textboxTightWrap); older drafts stored "all". */
const TIGHT_WRAP = [
  { id: "none", label: "None" },
  { id: "allLines", label: "All" },
  { id: "firstAndLastLine", label: "First and last lines" },
  { id: "firstLineOnly", label: "First line only" },
  { id: "lastLineOnly", label: "Last line only" },
]

function lineSpacingOf(rule: LineRule, at: string): LineSpacing {
  if (rule !== "multiple") {
    return rule
  }
  const value = Number(at)
  return value === 1 ? "single" : value === 1.5 ? "1.5" : value === 2 ? "double" : "multiple"
}

function readDraft(editor: Editor): ParagraphDraft {
  const source = editor.isActive("heading") ? "heading" : "paragraph"
  const attrs = editor.getAttributes(source)
  const align = attrs.textAlign
  const specialRaw = String(attrs.specialIndent || "")
  const [specialKind, specialAmount] = specialRaw.split(":")
  const headingLevel = editor.isActive("heading") ? Number(editor.getAttributes("heading").level) : 0
  const outline = attrs.outlineLevel || (headingLevel >= 1 && headingLevel <= 9 ? String(headingLevel) : "body")
  const rule: LineRule = attrs.lineRule === "exact" || attrs.lineRule === "at-least" ? attrs.lineRule : "multiple"
  const lineHeight = typeof attrs.lineHeight === "string" ? attrs.lineHeight.replace("pt", "") : ""
  const plain =
    clampIndent(attrs.indent) === 0 &&
    !specialRaw &&
    (attrs.spaceBefore == null || attrs.spaceBefore === "" || Number(attrs.spaceBefore) === 0) &&
    (attrs.spaceAfter == null || Number(attrs.spaceAfter) === 8 || attrs.spaceAfter === "")
  const stored = plain ? loadDefault() : null
  const lineAt = lineHeight || (stored?.lineAt ?? (rule === "multiple" ? "1.15" : "12"))
  const special: Special = specialKind === "first" || specialKind === "hanging" ? specialKind : "none"
  const tightWrap = typeof attrs.tightWrap === "string" && attrs.tightWrap ? attrs.tightWrap : "none"
  return {
    ...(stored ?? EMPTY),
    align: align === "center" || align === "right" || align === "justify" ? align : (stored?.align ?? "left"),
    outline: outline === "body" || outline === "" ? (stored?.outline ?? "body") : String(outline),
    collapsed: Boolean(attrs.collapsed),
    leftCm: trimNumber(clampIndent(attrs.indent) * STEP_CM),
    rightCm: trimNumber(Number(attrs.indentRight) / 10 || 0),
    special,
    specialBy:
      special === "none"
        ? ""
        : specialAmount && Number.isFinite(Number(specialAmount))
          ? String(specialAmount)
          : (stored?.specialBy ?? "1.27"),
    mirror: Boolean(attrs.mirrorIndents),
    before: attrs.spaceBefore == null || attrs.spaceBefore === "" ? (stored?.before ?? "0") : String(attrs.spaceBefore),
    after: attrs.spaceAfter == null || attrs.spaceAfter === "" ? (stored?.after ?? "8") : String(attrs.spaceAfter),
    lineSpacing: lineSpacingOf(rule, lineAt),
    lineAt,
    contextual: Boolean(attrs.contextualSpacing),
    widow: attrs.widowControl !== false,
    keepNext: Boolean(attrs.keepNext),
    keepLines: Boolean(attrs.keepLines),
    pageBreakBefore: Boolean(attrs.pageBreakBefore),
    suppressLines: Boolean(attrs.suppressLineNumbers),
    dontHyphenate: Boolean(attrs.dontHyphenate),
    tightWrap: tightWrap === "all" ? "allLines" : tightWrap,
  }
}

/** A plain paragraph's formatting comes from the Normal style, when the document or the user's defaults changed it. */
function loadDefault(): ParagraphDraft | null {
  const normal = useStyleStore.getState().styles.find((style) => style.id === "normal")
  if (!normal?.changed) {
    return null
  }
  const { align, before, after, line, indent } = normal.paragraph
  return {
    ...EMPTY,
    align: align ?? EMPTY.align,
    before: before === undefined ? EMPTY.before : trimNumber(before),
    after: after === undefined ? EMPTY.after : trimNumber(after),
    lineSpacing: line === undefined ? EMPTY.lineSpacing : lineSpacingOf("multiple", trimNumber(line)),
    lineAt: line === undefined ? EMPTY.lineAt : trimNumber(line),
    leftCm: indent === undefined ? EMPTY.leftCm : trimNumber(indent),
  }
}

function lineRuleOf(spacing: LineSpacing): LineRule {
  return spacing === "exact" || spacing === "at-least" ? spacing : "multiple"
}

/**
 * Word's Set As Default: the alignment, spacing and indent become the Normal style's, for this document or for new
 * documents too.
 */
async function saveDefault(editor: Editor, draft: ParagraphDraft, onClose: () => void) {
  const scope = await askDefaultScope("paragraph formatting")
  if (!scope) {
    return
  }
  const number = (value: string) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const multiple = lineRuleOf(draft.lineSpacing) === "multiple"
  setNormalDefault(scope, {
    paragraph: {
      align: draft.align,
      before: number(draft.before),
      after: number(draft.after),
      line: multiple ? number(NAMED_MULTIPLES[draft.lineSpacing] ?? draft.lineAt) : undefined,
      indent: number(draft.leftCm),
    },
  })
  editor.commands.focus()
  onClose()
}

/** The dialog fields each paragraph attribute is set from. */
const SOURCES: Record<string, (keyof ParagraphDraft)[]> = {
  textAlign: ["align"],
  outlineLevel: ["outline"],
  collapsed: ["outline", "collapsed"],
  indent: ["leftCm"],
  indentRight: ["rightCm"],
  specialIndent: ["special", "specialBy"],
  mirrorIndents: ["mirror"],
  spaceBefore: ["before"],
  spaceAfter: ["after"],
  lineRule: ["lineSpacing", "lineAt"],
  lineHeight: ["lineSpacing", "lineAt"],
  contextualSpacing: ["contextual"],
  widowControl: ["widow"],
  keepNext: ["keepNext"],
  keepLines: ["keepLines"],
  pageBreakBefore: ["pageBreakBefore"],
  suppressLineNumbers: ["suppressLines"],
  dontHyphenate: ["dontHyphenate"],
  tightWrap: ["tightWrap"],
}

/**
 * Applies what the dialog changed, as Word does: a field left as the dialog opened with it is not written, so the
 * paragraphs keep what they had (their style's spacing, or each its own when several are selected).
 */
export function changedAttrs(attrs: Record<string, unknown>, draft: ParagraphDraft, initial: ParagraphDraft) {
  return Object.fromEntries(
    Object.entries(attrs).filter(([name]) => (SOURCES[name] ?? []).some((field) => draft[field] !== initial[field])),
  )
}

function applyDraft(editor: Editor, draft: ParagraphDraft, initial: ParagraphDraft) {
  restoreSelection(editor)
  const outline = Number(draft.outline)
  if (draft.outline !== initial.outline && draft.outline !== "body" && outline >= 1 && outline <= 6) {
    editor
      .chain()
      .focus()
      .setHeading({ level: outline as 1 | 2 | 3 | 4 | 5 | 6 })
      .run()
  } else if (draft.outline !== initial.outline && editor.isActive("heading") && draft.outline === "body") {
    editor.chain().focus().setParagraph().run()
  }
  const left = Number(draft.leftCm)
  const right = Number(draft.rightCm)
  const before = Number(draft.before)
  const after = Number(draft.after)
  const specialBy = Number(draft.specialBy)
  const lineAt = NAMED_MULTIPLES[draft.lineSpacing] ?? draft.lineAt.trim()
  const attrs = {
    textAlign: draft.align,
    outlineLevel: draft.outline === "body" ? "" : draft.outline,
    collapsed: draft.outline !== "body" && draft.collapsed,
    indent: clampIndent(Math.round((Number.isFinite(left) ? left : 0) / STEP_CM)),
    indentRight: Number.isFinite(right) ? Math.max(0, right * 10) : 0,
    specialIndent:
      draft.special === "none" || !Number.isFinite(specialBy) || specialBy <= 0 ? "" : `${draft.special}:${specialBy}`,
    mirrorIndents: draft.mirror,
    spaceBefore: Number.isFinite(before) ? before : 0,
    spaceAfter: Number.isFinite(after) ? after : 0,
    lineRule: lineRuleOf(draft.lineSpacing),
    lineHeight: lineAt || null,
    contextualSpacing: draft.contextual,
    widowControl: draft.widow,
    keepNext: draft.keepNext,
    keepLines: draft.keepLines,
    pageBreakBefore: draft.pageBreakBefore,
    suppressLineNumbers: draft.suppressLines,
    dontHyphenate: draft.dontHyphenate,
    tightWrap: draft.tightWrap,
  }
  const changed = changedAttrs(attrs, draft, initial)
  if (Object.keys(changed).length > 0) {
    updateBlocks(editor, changed)
  }
}

/** Alt+letter shortcuts, as Word's dialogs have: the letter each label underlines, and the control it focuses. */
const KEYS: Record<TabName, Record<string, string>> = {
  spacing: {
    g: "pd-align",
    o: "pd-outline",
    e: "pd-collapsed",
    l: "pd-left",
    r: "pd-right",
    s: "pd-special",
    y: "pd-by",
    m: "pd-mirror",
    b: "pd-before",
    f: "pd-after",
    n: "pd-line",
    a: "pd-at",
    c: "pd-contextual",
    t: "pd-tabs",
    d: "pd-default",
  },
  breaks: {
    w: "pd-widow",
    x: "pd-keep-next",
    k: "pd-keep-lines",
    b: "pd-page-break",
    s: "pd-suppress",
    d: "pd-hyphenate",
    r: "pd-tight",
    t: "pd-tabs",
  },
}
const TABS = [
  { id: "spacing", label: "Indents and Spacing", letter: "I" },
  { id: "breaks", label: "Line and Page Breaks", letter: "P" },
]

export function ParagraphDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const editor = useDocumentEditor()
  const [draft, setDraft] = useState<ParagraphDraft>(EMPTY)
  const [initial, setInitial] = useState<ParagraphDraft>(EMPTY)
  const [tab, setTab] = useState<TabName>("spacing")
  const [tabsOpen, setTabsOpen] = useState(false)
  const [inTextBox, setInTextBox] = useState(false)

  useEffect(() => {
    if (open && editor) {
      const read = readDraft(editor)
      setDraft(read)
      setInitial(read)
      setInTextBox(editor.isActive("textBox"))
      setTab("spacing")
      setTabsOpen(false)
    }
  }, [open, editor])

  if (!open || !editor) {
    return null
  }

  function patch(partial: Partial<ParagraphDraft>) {
    setDraft((current) => ({ ...current, ...partial }))
  }

  return (
    <WordDialog
      title="Paragraph"
      width={DIALOG_WIDTH}
      height={DIALOG_HEIGHT}
      tabs={TABS}
      tab={tab}
      onTab={(next) => setTab(next as TabName)}
      keys={KEYS[tab]}
      initialFocus="pd-align"
      suspended={tabsOpen}
      onAccept={() => {
        applyDraft(editor, draft, initial)
        onClose()
      }}
      onCancel={onClose}
      footer={
        <>
          <button id="pd-tabs" type="button" className="dialog-btn" onClick={() => setTabsOpen(true)}>
            <Keyed text="Tabs..." letter="T" />
          </button>
          <button
            id="pd-default"
            type="button"
            className="dialog-btn"
            onClick={() => void saveDefault(editor, draft, onClose)}
          >
            <Keyed text="Set As Default" letter="D" />
          </button>
        </>
      }
      overlay={tabsOpen ? <TabsPanel editor={editor} onClose={() => setTabsOpen(false)} /> : null}
    >
      {tab === "spacing" ? (
        <SpacingFields draft={draft} onChange={patch} />
      ) : (
        <BreakFields draft={draft} inTextBox={inTextBox} onChange={patch} />
      )}
      <Section title="Preview">
        <Preview draft={draft} />
      </Section>
    </WordDialog>
  )
}

function SpacingFields({
  draft,
  onChange,
}: {
  draft: ParagraphDraft
  onChange: (partial: Partial<ParagraphDraft>) => void
}) {
  const named = NAMED_MULTIPLES[draft.lineSpacing]
  const multiple = lineRuleOf(draft.lineSpacing) === "multiple"
  return (
    <>
      <Section title="General">
        <div className="word-dialog-grid">
          <Label htmlFor="pd-align" text="Alignment:" letter="g" />
          <select
            id="pd-align"
            className="w-[120px]"
            value={draft.align}
            onChange={(event) => onChange({ align: event.target.value as Align })}
          >
            <option value="left">Left</option>
            <option value="center">Centered</option>
            <option value="right">Right</option>
            <option value="justify">Justified</option>
          </select>
          <span />
          <Label htmlFor="pd-outline" text="Outline level:" letter="O" />
          <select
            id="pd-outline"
            className="w-[120px]"
            value={draft.outline}
            onChange={(event) => onChange({ outline: event.target.value })}
          >
            <option value="body">Body Text</option>
            {Array.from({ length: 9 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>
                Level {index + 1}
              </option>
            ))}
          </select>
          <Check
            id="pd-collapsed"
            text="Collapsed by default"
            letter="e"
            checked={draft.outline !== "body" && draft.collapsed}
            disabled={draft.outline === "body"}
            onChange={(collapsed) => onChange({ collapsed })}
          />
        </div>
      </Section>
      <Section title="Indentation">
        <div className="word-dialog-pair">
          <div className="word-dialog-grid">
            <Label htmlFor="pd-left" text={draft.mirror ? "Inside:" : "Left:"} letter={draft.mirror ? "I" : "L"} />
            <SpinField
              id="pd-left"
              value={draft.leftCm}
              unit="cm"
              step={STEP_CM}
              max={INDENT_MAX * STEP_CM}
              // The editor indents in steps, so a typed indent becomes the nearest step.
              snap={STEP_CM}
              onChange={(leftCm) => onChange({ leftCm })}
            />
            <Label htmlFor="pd-right" text={draft.mirror ? "Outside:" : "Right:"} letter="R" />
            <SpinField
              id="pd-right"
              value={draft.rightCm}
              unit="cm"
              step={0.1}
              max={55}
              onChange={(rightCm) => onChange({ rightCm })}
            />
          </div>
          <div className="word-dialog-stack">
            <Label htmlFor="pd-special" text="Special:" letter="S" />
            <select
              id="pd-special"
              value={draft.special}
              onChange={(event) => {
                const special = event.target.value as Special
                onChange({
                  special,
                  // Word fills in half an inch when a special indent is chosen, and clears it for (none).
                  specialBy: special === "none" ? "" : draft.specialBy || "1.27",
                })
              }}
            >
              <option value="none">(none)</option>
              <option value="first">First line</option>
              <option value="hanging">Hanging</option>
            </select>
          </div>
          <div className="word-dialog-stack">
            <Label htmlFor="pd-by" text="By:" letter="y" />
            <SpinField
              id="pd-by"
              value={draft.specialBy}
              unit="cm"
              step={0.1}
              max={55}
              disabled={draft.special === "none"}
              onChange={(specialBy) => onChange({ specialBy })}
            />
          </div>
        </div>
        <Check
          id="pd-mirror"
          text="Mirror indents"
          letter="M"
          checked={draft.mirror}
          onChange={(mirror) => onChange({ mirror })}
        />
      </Section>
      <Section title="Spacing">
        <div className="word-dialog-pair">
          <div className="word-dialog-grid">
            <Label htmlFor="pd-before" text="Before:" letter="B" />
            <SpinField
              id="pd-before"
              value={draft.before}
              unit="pt"
              step={6}
              max={1584}
              onChange={(before) => onChange({ before })}
            />
            <Label htmlFor="pd-after" text="After:" letter="f" />
            <SpinField
              id="pd-after"
              value={draft.after}
              unit="pt"
              step={6}
              max={1584}
              onChange={(after) => onChange({ after })}
            />
          </div>
          <div className="word-dialog-stack">
            <Label htmlFor="pd-line" text="Line spacing:" letter="N" />
            <select
              id="pd-line"
              value={draft.lineSpacing}
              onChange={(event) => {
                const lineSpacing = event.target.value as LineSpacing
                const rule = lineRuleOf(lineSpacing)
                const wasRule = lineRuleOf(draft.lineSpacing)
                // As in Word: Multiple starts at three lines, and Exactly or At least at 12 pt.
                const lineAt =
                  NAMED_MULTIPLES[lineSpacing] ??
                  (rule === wasRule && !NAMED_MULTIPLES[draft.lineSpacing]
                    ? draft.lineAt
                    : rule === "multiple"
                      ? "3"
                      : "12")
                onChange({ lineSpacing, lineAt })
              }}
            >
              <option value="single">Single</option>
              <option value="1.5">1.5 lines</option>
              <option value="double">Double</option>
              <option value="at-least">At least</option>
              <option value="exact">Exactly</option>
              <option value="multiple">Multiple</option>
            </select>
          </div>
          <div className="word-dialog-stack">
            <Label htmlFor="pd-at" text="At:" letter="A" />
            <SpinField
              id="pd-at"
              value={named ? "" : draft.lineAt}
              unit={multiple ? "" : "pt"}
              step={multiple ? 0.5 : 1}
              min={multiple ? 0.06 : 0.7}
              max={multiple ? 132 : 1584}
              disabled={Boolean(named)}
              onChange={(lineAt) => onChange({ lineAt })}
            />
          </div>
        </div>
        <Check
          id="pd-contextual"
          text="Don’t add space between paragraphs of the same style"
          letter="C"
          checked={draft.contextual}
          onChange={(contextual) => onChange({ contextual })}
        />
      </Section>
    </>
  )
}

function BreakFields({
  draft,
  inTextBox,
  onChange,
}: {
  draft: ParagraphDraft
  inTextBox: boolean
  onChange: (partial: Partial<ParagraphDraft>) => void
}) {
  return (
    <>
      <Section title="Pagination">
        <div className="flex flex-col gap-1.5">
          <Check
            id="pd-widow"
            text="Widow/Orphan control"
            letter="W"
            checked={draft.widow}
            onChange={(widow) => onChange({ widow })}
          />
          <Check
            id="pd-keep-next"
            text="Keep with next"
            letter="x"
            checked={draft.keepNext}
            onChange={(keepNext) => onChange({ keepNext })}
          />
          <Check
            id="pd-keep-lines"
            text="Keep lines together"
            letter="K"
            checked={draft.keepLines}
            onChange={(keepLines) => onChange({ keepLines })}
          />
          <Check
            id="pd-page-break"
            text="Page break before"
            letter="B"
            checked={draft.pageBreakBefore}
            onChange={(pageBreakBefore) => onChange({ pageBreakBefore })}
          />
        </div>
      </Section>
      <Section title="Formatting exceptions">
        <div className="flex flex-col gap-1.5">
          <Check
            id="pd-suppress"
            text="Suppress line numbers"
            letter="S"
            checked={draft.suppressLines}
            onChange={(suppressLines) => onChange({ suppressLines })}
          />
          <Check
            id="pd-hyphenate"
            text="Don’t hyphenate"
            letter="D"
            checked={draft.dontHyphenate}
            onChange={(dontHyphenate) => onChange({ dontHyphenate })}
          />
        </div>
      </Section>
      <Section title="Textbox options">
        {/* Only text in a text box wraps tightly, so Word offers it only there. */}
        <div className="word-dialog-stack w-[180px]">
          <Label htmlFor="pd-tight" text="Tight wrap:" letter="r" />
          <select
            id="pd-tight"
            value={draft.tightWrap}
            disabled={!inTextBox}
            onChange={(event) => onChange({ tightWrap: event.target.value })}
          >
            {TIGHT_WRAP.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </Section>
    </>
  )
}

/** Width of the text area the preview stands for, in centimetres (an A4 or Letter page's text width). */
const PREVIEW_TEXT_CM = 16
const PREVIEW_PX = 404
const CM = PREVIEW_PX / PREVIEW_TEXT_CM
const PT = CM * (2.54 / 72)
/** The preview's text size in pixels; one line of Multiple spacing is 1.2 of it. */
const PREVIEW_FONT = 6
const OTHER = "Previous Paragraph ".repeat(14)
const NEXT = "Following Paragraph ".repeat(14)
const SAMPLE = "Sample Text ".repeat(28)

/**
 * Word's preview: grey neighbouring paragraphs around the paragraph as set, drawn small and to scale, with its
 * indents, alignment, spacing and line spacing.
 */
function Preview({ draft }: { draft: ParagraphDraft }) {
  const number = (value: string, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
  const left = number(draft.leftCm) * CM
  const right = number(draft.rightCm) * CM
  const special = draft.special === "none" ? 0 : number(draft.specialBy) * CM
  const rule = lineRuleOf(draft.lineSpacing)
  const at = number(NAMED_MULTIPLES[draft.lineSpacing] ?? draft.lineAt, 1)
  const lineHeight = rule === "multiple" ? `${Math.max(0.5, at) * 1.2 * PREVIEW_FONT}px` : `${Math.max(3, at * PT)}px`
  return (
    <div className="word-dialog-preview" aria-hidden>
      <p className="is-other">{OTHER}</p>
      <p
        className="is-sample"
        style={{
          marginTop: Math.min(24, number(draft.before) * PT),
          marginBottom: Math.min(24, number(draft.after) * PT),
          marginLeft: left + (draft.special === "hanging" ? special : 0),
          marginRight: right,
          textIndent: draft.special === "first" ? special : draft.special === "hanging" ? -special : 0,
          textAlign: draft.align,
          lineHeight,
        }}
      >
        {SAMPLE}
      </p>
      <p className="is-other">{NEXT}</p>
    </div>
  )
}

function TabsPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const source = editor.isActive("heading") ? "heading" : "paragraph"
  const stops = parseTabStops(editor.getAttributes(source).tabStops)
  const [position, setPosition] = useState("1.27")
  const [align, setAlign] = useState<TabAlign>("left")

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/10"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div role="dialog" aria-label="Tabs" className="word-dialog-sub">
        <h3 className="mb-2 text-[13px] font-semibold">Tabs</h3>
        <div className="mb-2 grid grid-cols-2 gap-3">
          <div className="word-dialog-stack">
            <label htmlFor="pd-tab-position">Tab stop position:</label>
            <SpinField id="pd-tab-position" value={position} unit="cm" step={0.1} max={55} onChange={setPosition} />
          </div>
          <div className="word-dialog-stack">
            <label htmlFor="pd-tab-align">Alignment:</label>
            <select id="pd-tab-align" value={align} onChange={(event) => setAlign(event.target.value as TabAlign)}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="decimal">Decimal</option>
            </select>
          </div>
        </div>
        <ul className="mb-3 h-28 overflow-auto border border-[var(--dlg-border)] text-[12px]">
          {stops.length === 0 ? <li className="px-2 py-1 text-neutral-500">No tab stops</li> : null}
          {stops.map((stop) => (
            <li key={stop.id} className="flex items-center justify-between px-2 py-0.5">
              <span>
                {(stop.position / (96 / 2.54)).toFixed(2)} cm · {stop.align}
              </span>
              <button
                type="button"
                className="text-[var(--dlg-accent)]"
                onClick={() => removeTabStop(editor, stop.position)}
              >
                Clear
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="dialog-btn is-primary"
            onClick={() => {
              const cm = Number(position)
              if (Number.isFinite(cm)) {
                addTabStop(editor, (cm * 96) / 2.54, align, 700)
              }
            }}
          >
            Set
          </button>
          <button type="button" className="dialog-btn" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
