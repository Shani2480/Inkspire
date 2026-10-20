import { openColorDialog } from "@/components/color-dialog"
import { ColorMenu } from "@/components/color-menu"
import { MenuButton } from "@/components/ribbon/ribbon-button"
import { FONT_SIZES } from "@/components/ribbon/options"
import { effectPreviewStyle, TextEffectsMenu } from "@/components/text-effects-menu"
import { Check, Keyed, Label, Section, SpinField, WordDialog } from "@/components/word-dialog"
import { ensureSystemFonts, useFontChoices, type FontChoice } from "@/editor/system-fonts"
import { useDocumentEditor } from "@/editor/document-editor"
import { askDefaultScope, setNormalDefault } from "@/components/set-default-dialog"
import { chainWithSelection, restoreSelection } from "@/editor/selection-memory"
import type { Editor } from "@tiptap/core"
import { useEffect, useRef, useState, type CSSProperties } from "react"

const THEME_BODY = ""
const THEME_HEADINGS = "var(--doc-heading-font)"

const UNDERLINES = [
  { id: "solid", label: "Single" },
  { id: "double", label: "Double" },
  { id: "dotted", label: "Dotted" },
  { id: "dashed", label: "Dashed" },
  { id: "wavy", label: "Wave" },
] as const

const SCALES = ["80%", "90%", "100%", "110%", "120%", "150%", "200%"]
const LIGATURES = [
  { id: "none", label: "None" },
  { id: "standard", label: "Standard" },
  { id: "contextual", label: "Standard and Contextual" },
  { id: "all", label: "All" },
]
const NUMBER_SPACING = [
  { id: "default", label: "Default" },
  { id: "proportional", label: "Proportional" },
  { id: "tabular", label: "Tabular" },
]
const NUMBER_FORMS = [
  { id: "default", label: "Default" },
  { id: "lining", label: "Lining" },
  { id: "old-style", label: "Old-style" },
]

type FontDraft = {
  family: string
  size: string
  bold: boolean
  italic: boolean
  color: string
  underlineStyle: string
  underlineColor: string
  strike: boolean
  doubleStrike: boolean
  superscript: boolean
  subscript: boolean
  smallCaps: boolean
  allCaps: boolean
  hidden: boolean
  effect: string
  scale: string
  spacing: "normal" | "expanded" | "condensed"
  spacingBy: string
  position: "normal" | "raised" | "lowered"
  positionBy: string
  kerning: boolean
  kerningAt: string
  ligatures: string
  numberSpacing: string
  numberForms: string
  stylistic: string
  contextual: boolean
}

const EMPTY: FontDraft = {
  family: THEME_BODY,
  size: "12",
  bold: false,
  italic: false,
  color: "",
  underlineStyle: "none",
  underlineColor: "",
  strike: false,
  doubleStrike: false,
  superscript: false,
  subscript: false,
  smallCaps: false,
  allCaps: false,
  hidden: false,
  effect: "",
  scale: "100%",
  spacing: "normal",
  spacingBy: "1",
  position: "normal",
  positionBy: "1",
  kerning: true,
  kerningAt: "1",
  ligatures: "contextual",
  numberSpacing: "default",
  numberForms: "default",
  stylistic: "default",
  contextual: false,
}

function normalizeFamily(value: string) {
  if (!value || value === "var(--font-sans)") {
    return value === "var(--font-sans)" ? THEME_HEADINGS : THEME_BODY
  }
  return value
}

function readDraft(editor: Editor): FontDraft {
  const text = editor.getAttributes("textStyle")
  const underline = editor.getAttributes("underline")
  const spacing = readOffset(typeof text.letterSpacing === "string" ? text.letterSpacing : "", "condensed", "expanded")
  const position = readOffset(typeof text.baseline === "string" ? text.baseline : "", "lowered", "raised")
  const features = typeof text.features === "string" ? text.features : ""
  const scale = Number(text.scale)
  return {
    ...EMPTY,
    family: normalizeFamily(typeof text.fontFamily === "string" ? text.fontFamily : ""),
    size: typeof text.fontSize === "string" ? text.fontSize.replace(/pt$/i, "") : "12",
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    color: typeof text.color === "string" ? text.color : "",
    underlineStyle: editor.isActive("underline")
      ? typeof underline.style === "string" && underline.style
        ? underline.style
        : "solid"
      : "none",
    underlineColor: typeof underline.color === "string" ? underline.color : "",
    strike: editor.isActive("strike"),
    doubleStrike: text.doubleStrike === "1",
    superscript: editor.isActive("superscript"),
    subscript: editor.isActive("subscript"),
    smallCaps: text.fontVariant === "small-caps",
    allCaps: text.textTransform === "uppercase",
    hidden: text.hidden === "1",
    effect: typeof text.effect === "string" ? text.effect : "",
    scale: Number.isFinite(scale) && scale > 0 ? `${Math.round(scale * 100)}%` : "100%",
    spacing: spacing.mode,
    spacingBy: spacing.by,
    position: position.mode,
    positionBy: position.by,
    kerning: text.kerning != null && text.kerning !== "",
    kerningAt: typeof text.kerning === "string" && text.kerning ? text.kerning : "1",
    ligatures: readChoice(
      features,
      [
        ["dlig", "all"],
        ["clig", "contextual"],
        ["liga", "standard"],
      ],
      features.includes('"liga" 0') || features.includes("liga 0") ? "none" : "contextual",
    ),
    numberSpacing: features.includes("tnum") ? "tabular" : features.includes("pnum") ? "proportional" : "default",
    numberForms: features.includes("onum") ? "old-style" : features.includes("lnum") ? "lining" : "default",
    stylistic: features.match(/ss0(\d)/)?.[1] ?? "default",
    contextual: features.includes("calt"),
  }
}

function readOffset<Negative extends string, Positive extends string>(
  value: string,
  negative: Negative,
  positive: Positive,
) {
  const amount = Number.parseFloat(value)
  if (!value || !Number.isFinite(amount) || amount === 0) {
    return { mode: "normal" as const, by: "1" }
  }
  return { mode: amount < 0 ? negative : positive, by: String(Math.abs(amount)) }
}

function readChoice(features: string, pairs: [string, string][], fallback: string) {
  for (const [token, id] of pairs) {
    if (features.includes(token)) {
      return id
    }
  }
  return fallback
}

function featureList(draft: FontDraft) {
  const features: string[] = []
  if (draft.ligatures === "none") {
    features.push('"liga" 0', '"clig" 0')
  } else if (draft.ligatures === "standard") {
    features.push('"liga" 1')
  } else if (draft.ligatures === "contextual") {
    features.push('"liga" 1', '"clig" 1')
  } else if (draft.ligatures === "all") {
    features.push('"liga" 1', '"clig" 1', '"dlig" 1')
  }
  if (draft.numberSpacing === "proportional") {
    features.push('"pnum" 1')
  }
  if (draft.numberSpacing === "tabular") {
    features.push('"tnum" 1')
  }
  if (draft.numberForms === "lining") {
    features.push('"lnum" 1')
  }
  if (draft.numberForms === "old-style") {
    features.push('"onum" 1')
  }
  if (draft.stylistic !== "default") {
    features.push(`"ss0${draft.stylistic}" 1`)
  }
  if (draft.contextual) {
    features.push('"calt" 1')
  }
  return features.join(", ")
}

function applyDraft(editor: Editor, draft: FontDraft) {
  let chain = chainWithSelection(editor)
  chain = draft.family ? chain.setFontFamily(draft.family) : chain.unsetFontFamily()
  chain = draft.size ? chain.setFontSize(`${draft.size}pt`) : chain.unsetFontSize()
  chain = draft.bold ? chain.setBold() : chain.unsetBold()
  chain = draft.italic ? chain.setItalic() : chain.unsetItalic()
  chain = draft.color ? chain.setColor(draft.color) : chain.unsetColor()
  chain = draft.strike ? chain.setStrike() : chain.unsetStrike()
  chain = draft.subscript ? chain.setMark("subscript") : chain.unsetMark("subscript")
  chain = draft.superscript ? chain.setMark("superscript") : chain.unsetMark("superscript")
  chain =
    draft.underlineStyle === "none"
      ? chain.unsetUnderline()
      : chain.setMark("underline", {
          style: draft.underlineStyle,
          color: draft.underlineColor || null,
        })

  const spacingBy = Number(draft.spacingBy) || 0
  const positionBy = Number(draft.positionBy) || 0
  const scale = Number(draft.scale.replace("%", "")) / 100
  chain
    .setMark("textStyle", {
      letterSpacing:
        draft.spacing === "normal" || spacingBy === 0
          ? null
          : `${draft.spacing === "condensed" ? -spacingBy : spacingBy}pt`,
      baseline:
        draft.position === "normal" || positionBy === 0
          ? null
          : `${draft.position === "lowered" ? -positionBy : positionBy}pt`,
      scale: !Number.isFinite(scale) || scale === 1 ? null : String(scale),
      fontVariant: draft.smallCaps ? "small-caps" : null,
      textTransform: draft.allCaps ? "uppercase" : null,
      hidden: draft.hidden ? "1" : null,
      doubleStrike: draft.doubleStrike ? "1" : null,
      effect: draft.effect || null,
      features: featureList(draft) || null,
      kerning: draft.kerning ? draft.kerningAt || "1" : null,
    })
    .removeEmptyTextStyle()
    .run()
}

/** One size on every tab, as Word's dialogs keep, so switching tabs never moves the dialog. */
const DIALOG_WIDTH = 480
const DIALOG_HEIGHT = 592

type TabName = "font" | "advanced" | "effects"

const TABS = [
  { id: "font", label: "Font", letter: "n" },
  { id: "advanced", label: "Advanced", letter: "v" },
  { id: "effects", label: "Text Effects", letter: "x" },
]

/** Alt+letter shortcuts on each tab: the letter each label underlines, and the control it reaches. */
const KEYS: Record<TabName, Record<string, string>> = {
  font: {
    f: "fd-font",
    y: "fd-style",
    s: "fd-size",
    c: "fd-color",
    u: "fd-underline",
    i: "fd-underline-color",
    k: "fd-strike",
    l: "fd-double-strike",
    p: "fd-superscript",
    b: "fd-subscript",
    m: "fd-small-caps",
    a: "fd-all-caps",
    h: "fd-hidden",
    d: "fd-default",
    e: "fd-effects",
  },
  advanced: {
    c: "fd-scale",
    s: "fd-spacing",
    b: "fd-spacing-by",
    p: "fd-position",
    y: "fd-position-by",
    k: "fd-kerning",
    o: "fd-kerning-at",
    l: "fd-ligatures",
    m: "fd-number-spacing",
    f: "fd-number-forms",
    t: "fd-stylistic",
    a: "fd-contextual",
    d: "fd-default",
    e: "fd-effects",
  },
  effects: { d: "fd-default", e: "fd-effects" },
}

/** Font styles, each shown in its own style as Word lists them. */
const STYLES = [
  { id: "regular", label: "Regular" },
  { id: "italic", label: "Italic", style: { fontStyle: "italic" } },
  { id: "bold", label: "Bold", style: { fontWeight: 700 } },
  { id: "both", label: "Bold Italic", style: { fontStyle: "italic", fontWeight: 700 } },
]

export function FontDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const editor = useDocumentEditor()
  const [tab, setTab] = useState<TabName>("font")
  const [draft, setDraft] = useState<FontDraft>(EMPTY)
  const [picking, setPicking] = useState(false)
  const fonts = useFontChoices()

  useEffect(() => {
    if (open) {
      void ensureSystemFonts()
    }
  }, [open])

  useEffect(() => {
    if (open && editor) {
      restoreSelection(editor)
      setDraft(readDraft(editor))
      setTab("font")
      setPicking(false)
    }
  }, [open, editor])

  if (!open || !editor) {
    return null
  }

  function patch(next: Partial<FontDraft>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  /** Word's Set As Default: the font becomes the Normal style's, for this document or for new ones too. */
  async function saveDefault() {
    const size = Number(draft.size)
    const label = fontOptions.find((option) => option.id === draft.family)?.label ?? "+Body"
    const scope = await askDefaultScope(`font to ${label.replace(/,.*$/, "")}, ${draft.size || 12} pt`)
    if (!scope) {
      return
    }
    setNormalDefault(scope, {
      font: {
        family: draft.family || undefined,
        size: Number.isFinite(size) && size > 0 ? size : undefined,
        bold: draft.bold,
        italic: draft.italic,
        underline: draft.underlineStyle !== "none",
        color: /^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : undefined,
      },
    })
    onClose()
  }

  const fontOptions = [
    { id: THEME_BODY, label: "+Body" },
    { id: THEME_HEADINGS, label: "+Headings" },
    ...fonts.map((font) => ({ id: font.value, label: font.label })),
  ]

  return (
    <WordDialog
      title="Font"
      width={DIALOG_WIDTH}
      height={DIALOG_HEIGHT}
      tabs={TABS}
      tab={tab}
      onTab={(next) => setTab(next as TabName)}
      keys={KEYS[tab]}
      initialFocus="fd-font"
      suspended={picking}
      onAccept={() => {
        applyDraft(editor, draft)
        onClose()
      }}
      onCancel={onClose}
      footer={
        <>
          <button id="fd-default" type="button" className="dialog-btn" onClick={() => void saveDefault()}>
            <Keyed text="Set As Default" letter="D" />
          </button>
          <button id="fd-effects" type="button" className="dialog-btn" onClick={() => setTab("effects")}>
            <Keyed text="Text Effects..." letter="E" />
          </button>
        </>
      }
    >
      {tab === "font" ? (
        <>
          <div className="grid grid-cols-[1fr_118px_64px] gap-x-3">
            <ListCombo
              id="fd-font"
              label="Font:"
              letter="F"
              value={draft.family}
              options={fontOptions}
              faces
              onChange={(family) => patch({ family })}
            />
            <ListCombo
              id="fd-style"
              label="Font style:"
              letter="y"
              value={draft.bold && draft.italic ? "both" : draft.bold ? "bold" : draft.italic ? "italic" : "regular"}
              options={STYLES}
              onChange={(style) =>
                patch({
                  bold: style === "bold" || style === "both",
                  italic: style === "italic" || style === "both",
                })
              }
            />
            <ListCombo
              id="fd-size"
              label="Size:"
              letter="S"
              value={draft.size}
              options={FONT_SIZES.map((size) => ({ id: String(size), label: String(size) }))}
              free={(typed) => {
                // Word takes any size from 1 to 1638 points, in half points.
                const size = Math.round(Number(typed) * 2) / 2
                return Number.isFinite(size) && size >= 1 && size <= 1638 ? String(size) : null
              }}
              onChange={(size) => patch({ size })}
            />
          </div>
          <div className="grid grid-cols-3 gap-x-3">
            <div className="word-dialog-stack">
              <Label htmlFor="fd-color" text="Font color:" letter="C" />
              <ColorPick
                id="fd-color"
                value={draft.color}
                onOpenChange={setPicking}
                onChange={(color) => patch({ color })}
              />
            </div>
            <div className="word-dialog-stack">
              <Label htmlFor="fd-underline" text="Underline style:" letter="U" />
              <select
                id="fd-underline"
                value={draft.underlineStyle}
                onChange={(event) => patch({ underlineStyle: event.target.value })}
              >
                <option value="none">(none)</option>
                {UNDERLINES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="word-dialog-stack">
              <Label htmlFor="fd-underline-color" text="Underline color:" letter="I" />
              <ColorPick
                id="fd-underline-color"
                value={draft.underlineColor}
                disabled={draft.underlineStyle === "none"}
                onOpenChange={setPicking}
                onChange={(underlineColor) => patch({ underlineColor })}
              />
            </div>
          </div>
          <Section title="Effects">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <Check
                id="fd-strike"
                text="Strikethrough"
                letter="k"
                checked={draft.strike}
                onChange={(strike) => patch({ strike, doubleStrike: strike ? false : draft.doubleStrike })}
              />
              <Check
                id="fd-small-caps"
                text="Small caps"
                letter="m"
                checked={draft.smallCaps}
                onChange={(smallCaps) => patch({ smallCaps, allCaps: smallCaps ? false : draft.allCaps })}
              />
              <Check
                id="fd-double-strike"
                text="Double strikethrough"
                letter="l"
                checked={draft.doubleStrike}
                onChange={(doubleStrike) => patch({ doubleStrike, strike: doubleStrike ? false : draft.strike })}
              />
              <Check
                id="fd-all-caps"
                text="All caps"
                letter="A"
                checked={draft.allCaps}
                onChange={(allCaps) => patch({ allCaps, smallCaps: allCaps ? false : draft.smallCaps })}
              />
              <Check
                id="fd-superscript"
                text="Superscript"
                letter="p"
                checked={draft.superscript}
                onChange={(superscript) => patch({ superscript, subscript: superscript ? false : draft.subscript })}
              />
              <Check
                id="fd-hidden"
                text="Hidden"
                letter="H"
                checked={draft.hidden}
                onChange={(hidden) => patch({ hidden })}
              />
              <Check
                id="fd-subscript"
                text="Subscript"
                letter="b"
                checked={draft.subscript}
                onChange={(subscript) => patch({ subscript, superscript: subscript ? false : draft.superscript })}
              />
            </div>
          </Section>
        </>
      ) : tab === "advanced" ? (
        <>
          <Section title="Character Spacing">
            <div className="grid grid-cols-[72px_130px_auto_84px] items-center gap-x-2 gap-y-2">
              <Label htmlFor="fd-scale" text="Scale:" letter="c" />
              <select id="fd-scale" value={draft.scale} onChange={(event) => patch({ scale: event.target.value })}>
                {SCALES.map((scale) => (
                  <option key={scale}>{scale}</option>
                ))}
              </select>
              <span />
              <span />
              <Label htmlFor="fd-spacing" text="Spacing:" letter="S" />
              <select
                id="fd-spacing"
                value={draft.spacing}
                onChange={(event) => patch({ spacing: event.target.value as FontDraft["spacing"] })}
              >
                <option value="normal">Normal</option>
                <option value="expanded">Expanded</option>
                <option value="condensed">Condensed</option>
              </select>
              <Label htmlFor="fd-spacing-by" text="By:" letter="B" />
              <SpinField
                id="fd-spacing-by"
                value={draft.spacing === "normal" ? "" : draft.spacingBy}
                unit="pt"
                step={0.1}
                max={1584}
                disabled={draft.spacing === "normal"}
                onChange={(spacingBy) => patch({ spacingBy })}
              />
              <Label htmlFor="fd-position" text="Position:" letter="P" />
              <select
                id="fd-position"
                value={draft.position}
                onChange={(event) => patch({ position: event.target.value as FontDraft["position"] })}
              >
                <option value="normal">Normal</option>
                <option value="raised">Raised</option>
                <option value="lowered">Lowered</option>
              </select>
              <Label htmlFor="fd-position-by" text="By:" letter="y" />
              <SpinField
                id="fd-position-by"
                value={draft.position === "normal" ? "" : draft.positionBy}
                unit="pt"
                step={0.5}
                max={1584}
                disabled={draft.position === "normal"}
                onChange={(positionBy) => patch({ positionBy })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Check
                id="fd-kerning"
                text="Kerning for fonts:"
                letter="K"
                checked={draft.kerning}
                onChange={(kerning) => patch({ kerning })}
              />
              <span className="w-[76px]">
                <SpinField
                  id="fd-kerning-at"
                  value={draft.kerningAt}
                  unit=""
                  step={1}
                  min={1}
                  max={1638}
                  disabled={!draft.kerning}
                  onChange={(kerningAt) => patch({ kerningAt })}
                />
              </span>
              <Label htmlFor="fd-kerning-at" text="Points and above" letter="o" />
            </div>
          </Section>
          <Section title="OpenType Features">
            <div className="grid grid-cols-[96px_190px] items-center gap-x-2 gap-y-2">
              <Label htmlFor="fd-ligatures" text="Ligatures:" letter="L" />
              <select
                id="fd-ligatures"
                value={draft.ligatures}
                onChange={(event) => patch({ ligatures: event.target.value })}
              >
                {LIGATURES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Label htmlFor="fd-number-spacing" text="Number spacing:" letter="m" />
              <select
                id="fd-number-spacing"
                value={draft.numberSpacing}
                onChange={(event) => patch({ numberSpacing: event.target.value })}
              >
                {NUMBER_SPACING.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Label htmlFor="fd-number-forms" text="Number forms:" letter="f" />
              <select
                id="fd-number-forms"
                value={draft.numberForms}
                onChange={(event) => patch({ numberForms: event.target.value })}
              >
                {NUMBER_FORMS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Label htmlFor="fd-stylistic" text="Stylistic sets:" letter="t" />
              <select
                id="fd-stylistic"
                value={draft.stylistic}
                onChange={(event) => patch({ stylistic: event.target.value })}
              >
                <option value="default">Default</option>
                {["1", "2", "3", "4"].map((set) => (
                  <option key={set} value={set}>
                    {set}
                  </option>
                ))}
              </select>
            </div>
            <Check
              id="fd-contextual"
              text="Use Contextual Alternates"
              letter="A"
              checked={draft.contextual}
              onChange={(contextual) => patch({ contextual })}
            />
          </Section>
        </>
      ) : (
        <Section title="Text Effects">
          <div className="rounded-[3px] border border-[var(--dlg-panel-border)] p-1">
            <TextEffectsMenu
              layout="panel"
              active={draft.effect}
              onClose={() => undefined}
              onPick={(effect, color) => patch(color ? { effect, color } : { effect })}
            />
          </div>
        </Section>
      )}
      <Section title="Preview">
        <FontPreview draft={draft} fonts={fonts} />
      </Section>
    </WordDialog>
  )
}

/** Word's preview: the font's name drawn as set, over a rule, with what kind of font it is. */
function FontPreview({ draft, fonts }: { draft: FontDraft; fonts: FontChoice[] }) {
  const isThemeBody = draft.family === THEME_BODY
  const isThemeHeadings = draft.family === THEME_HEADINGS
  const name = isThemeBody
    ? "+Body"
    : isThemeHeadings
      ? "+Headings"
      : (fonts.find((font) => font.value === draft.family)?.label ?? (draft.family.replace(/^"|"$/g, "") || "Preview"))
  const style: CSSProperties = {
    fontFamily: isThemeBody ? "var(--doc-body-font, Aptos, Calibri, sans-serif)" : draft.family || undefined,
    fontSize: draft.size ? `${Math.min(Number(draft.size) || 12, 26)}pt` : undefined,
    fontWeight: draft.bold ? 700 : 400,
    fontStyle: draft.italic ? "italic" : "normal",
    color: draft.effect === "outline" ? "transparent" : draft.color || "#242424",
    opacity: draft.hidden ? 0.35 : undefined,
    textDecoration: [
      draft.underlineStyle !== "none" ? "underline" : "",
      draft.strike || draft.doubleStrike ? "line-through" : "",
    ]
      .filter(Boolean)
      .join(" "),
    textDecorationStyle: (draft.doubleStrike
      ? "double"
      : draft.underlineStyle !== "none"
        ? draft.underlineStyle
        : undefined) as CSSProperties["textDecorationStyle"],
    textDecorationColor: draft.underlineColor || undefined,
    fontVariant: draft.smallCaps ? "small-caps" : undefined,
    textTransform: draft.allCaps ? "uppercase" : undefined,
    letterSpacing:
      draft.spacing === "normal" ? undefined : `${draft.spacing === "condensed" ? "-" : ""}${draft.spacingBy}pt`,
    fontFeatureSettings: featureList(draft) || undefined,
    verticalAlign: draft.superscript
      ? "super"
      : draft.subscript
        ? "sub"
        : draft.position === "raised"
          ? "super"
          : draft.position === "lowered"
            ? "sub"
            : undefined,
    display: "inline-block",
    transform: draft.scale !== "100%" ? `scaleX(${Number(draft.scale.replace("%", "")) / 100})` : undefined,
    whiteSpace: "nowrap",
    ...effectPreviewStyle(draft.effect),
  }
  const note = isThemeBody
    ? "This is the body theme font. The current document theme defines which font will be used."
    : isThemeHeadings
      ? "This is the heading theme font. The current document theme defines which font will be used."
      : "This font will be used on both printer and screen."
  return (
    <div className="flex flex-col gap-1.5">
      <div className="word-dialog-font-preview" aria-hidden>
        <span style={style}>{name}</span>
      </div>
      <p className="text-[11px] leading-snug text-[var(--dlg-muted)]">{note}</p>
    </div>
  )
}

/** Height of one row in a dialog list box. */
const LIST_ROW = 18
const LIST_ROWS = 6

/**
 * Word's combo of a text box over a list (Font, Font style, Size): typing finds the first entry that starts with
 * what was typed, the arrow keys move through the list, and leaving the box takes the entry (or, with `free`, a
 * value not in the list). Only the rows in view are drawn, since a system can have hundreds of fonts.
 */
function ListCombo({
  id,
  label,
  letter,
  value,
  options,
  faces = false,
  free,
  onChange,
}: {
  id: string
  label: string
  letter: string
  value: string
  options: { id: string; label: string; style?: CSSProperties }[]
  faces?: boolean
  free?: (typed: string) => string | null
  onChange: (id: string) => void
}) {
  const selected = options.findIndex((option) => option.id === value)
  const shown = selected >= 0 ? options[selected]!.label : value
  const [text, setText] = useState(shown)
  const [typing, setTyping] = useState(false)
  const [top, setTop] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!typing) {
      setText(shown)
    }
  }, [shown, typing])

  const match = (typed: string) => {
    const lower = typed.trim().toLowerCase()
    if (!lower) {
      return -1
    }
    const exact = options.findIndex((option) => option.label.toLowerCase() === lower)
    return exact >= 0 ? exact : options.findIndex((option) => option.label.toLowerCase().startsWith(lower))
  }
  const highlighted = typing ? match(text) : selected

  // Keep the highlighted entry in view.
  useEffect(() => {
    const list = listRef.current
    if (!list || highlighted < 0) {
      return
    }
    const rowTop = highlighted * LIST_ROW
    if (rowTop < list.scrollTop || rowTop + LIST_ROW > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, rowTop - LIST_ROW * 2)
      setTop(list.scrollTop)
    }
  }, [highlighted])

  const choose = (index: number) => {
    const option = options[index]
    if (option) {
      setTyping(false)
      setText(option.label)
      onChange(option.id)
    }
  }

  const commit = () => {
    if (!typing) {
      return
    }
    setTyping(false)
    const exactly = options.findIndex((option) => option.label.toLowerCase() === text.trim().toLowerCase())
    const freeValue = exactly < 0 && free ? free(text.trim()) : null
    if (freeValue != null) {
      onChange(freeValue)
      return
    }
    const index = exactly >= 0 ? exactly : match(text)
    if (index >= 0) {
      choose(index)
    } else {
      setText(shown)
    }
  }

  const first = Math.max(0, Math.floor(top / LIST_ROW) - 4)
  const last = Math.min(options.length, Math.ceil((top + LIST_ROW * LIST_ROWS) / LIST_ROW) + 4)

  return (
    <div className="word-dialog-stack min-w-0">
      <Label htmlFor={id} text={label} letter={letter} />
      <input
        id={id}
        role="combobox"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        className="word-dialog-text"
        value={text}
        onChange={(event) => {
          setTyping(true)
          setText(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            const from = highlighted >= 0 ? highlighted : selected
            choose(Math.min(options.length - 1, Math.max(0, from + (event.key === "ArrowDown" ? 1 : -1))))
          } else if (event.key === "Enter") {
            commit()
          }
        }}
      />
      <div
        id={`${id}-list`}
        ref={listRef}
        role="listbox"
        aria-label={label.replace(":", "")}
        tabIndex={-1}
        className="word-dialog-list"
        style={{ height: LIST_ROW * LIST_ROWS + 2 }}
        onScroll={(event) => setTop(event.currentTarget.scrollTop)}
      >
        <div className="relative" style={{ height: options.length * LIST_ROW }}>
          {options.slice(first, last).map((option, offset) => {
            const index = first + offset
            return (
              <div
                key={option.id || option.label}
                role="option"
                aria-selected={index === highlighted}
                className="word-dialog-option"
                style={{
                  top: index * LIST_ROW,
                  height: LIST_ROW,
                  fontFamily: faces && option.id ? option.id : undefined,
                  ...option.style,
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                {option.label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** A colour box that opens Word's colour palette, with Automatic and More Colors. */
function ColorPick({
  id,
  value,
  disabled = false,
  onOpenChange,
  onChange,
}: {
  id: string
  value: string
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onChange: (color: string) => void
}) {
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setMenu(null)
    onOpenChange(false)
    buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!menu) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    }
    const onDown = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (!target?.closest(".word-dialog-colors") && !buttonRef.current?.contains(target)) {
        close()
      }
    }
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("mousedown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("mousedown", onDown, true)
    }
  })

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="word-dialog-color"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={menu !== null}
        onClick={() => {
          if (menu) {
            close()
            return
          }
          const box = buttonRef.current!.getBoundingClientRect()
          setMenu({ left: box.left, top: box.bottom + 2 })
          onOpenChange(true)
        }}
      >
        <span className="word-dialog-swatch" style={{ background: value || "#000000" }} />
        <span className="flex-1 truncate text-left">{value ? value.toUpperCase() : "Automatic"}</span>
        <svg viewBox="0 0 8 4" aria-hidden>
          <path d="M0 0 4 4 8 0Z" />
        </svg>
      </button>
      {menu ? (
        <div className="word-dialog-colors" style={{ left: menu.left, top: menu.top }}>
          <ColorMenu
            active={value}
            clearLabel="Automatic"
            onClear={() => {
              onChange("")
              close()
            }}
            onSelect={(color) => {
              onChange(color)
              close()
            }}
          />
          <div className="px-2 pb-2">
            <MenuButton
              onClick={() => {
                close()
                openColorDialog(value || "#242424", onChange)
              }}
            >
              More Colors...
            </MenuButton>
          </div>
        </div>
      ) : null}
    </>
  )
}
