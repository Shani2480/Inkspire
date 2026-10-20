import { FONT_FAMILIES, FONT_SIZES } from "@/components/ribbon/options"
import { Check, DialogButtons, DialogFrame, Label, Section } from "@/components/word-dialog"
import {
  BUILT_IN_STYLES,
  findStyle,
  fontCss,
  newStyleId,
  newWordId,
  paragraphCss,
  resetDefaultStyles,
  saveDefaultStyles,
  savedDefaultIds,
  useStyleStore,
  type StyleDef,
  type StyleFont,
  type StyleParagraph,
} from "@/document/styles"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  applyCharacterStyle,
  applyParagraphStyle,
  clearStyleFromDocument,
  restampCharacterStyle,
} from "@/editor/home-actions"
import type { Editor } from "@tiptap/core"
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { create } from "zustand"

type Editing = { kind: "modify"; id: string } | { kind: "new"; seed: StyleDef } | null

type StyleDialogState = {
  editing: Editing
  manage: boolean
  /** The gallery chip a right click opened a menu on, and where. */
  chipMenu: { id: string; x: number; y: number } | null
  openModify: (id: string) => void
  openNew: (editor: Editor | null) => void
  openManage: () => void
  openChipMenu: (id: string, x: number, y: number) => void
  closeEditing: () => void
  closeManage: () => void
  closeChipMenu: () => void
}

export const useStyleDialogs = create<StyleDialogState>((set) => ({
  editing: null,
  manage: false,
  chipMenu: null,
  openModify: (id) => set({ editing: { kind: "modify", id }, chipMenu: null }),
  openNew: (editor) => set({ editing: { kind: "new", seed: seedFromSelection(editor) }, chipMenu: null }),
  openManage: () => set({ manage: true, chipMenu: null }),
  openChipMenu: (id, x, y) => set({ chipMenu: { id, x, y } }),
  closeEditing: () => set({ editing: null }),
  closeManage: () => set({ manage: false }),
  closeChipMenu: () => set({ chipMenu: null }),
}))

/**
 * A new style "from formatting", as Word's Create a Style makes it: the paragraph's style with the selection's
 * font and the paragraph's alignment on top, named Style1, Style2…
 */
export function seedFromSelection(editor: Editor | null): StyleDef {
  const styles = useStyleStore.getState().styles
  const base = findStyle(currentParagraphStyle(editor)) ?? BUILT_IN_STYLES[0]!
  const font: StyleFont = { ...base.font }
  const paragraph: StyleParagraph = { ...base.paragraph }
  if (editor) {
    const text = editor.getAttributes("textStyle")
    const block = editor.getAttributes(editor.isActive("heading") ? "heading" : "paragraph")
    const family = typeof text.fontFamily === "string" ? firstFamily(text.fontFamily) : ""
    const size = typeof text.fontSize === "string" ? Number.parseFloat(text.fontSize) : Number.NaN
    if (family) {
      font.family = family
    }
    if (Number.isFinite(size)) {
      font.size = size
    }
    font.bold = Boolean(base.font.bold || editor.isActive("bold"))
    font.italic = Boolean(base.font.italic || editor.isActive("italic"))
    font.underline = Boolean(base.font.underline || editor.isActive("underline"))
    if (typeof text.color === "string" && text.color) {
      font.color = text.color
    }
    if (block.textAlign === "center" || block.textAlign === "right" || block.textAlign === "justify") {
      paragraph.align = block.textAlign
    }
  }
  let n = 1
  while (styles.some((style) => style.name.toLowerCase() === `style${n}`)) {
    n += 1
  }
  return {
    id: "",
    name: `Style${n}`,
    kind: "paragraph",
    builtIn: false,
    wordId: "",
    basedOn: base.kind === "paragraph" ? base.id : "normal",
    next: "normal",
    font,
    paragraph,
  }
}

function currentParagraphStyle(editor: Editor | null) {
  if (!editor) {
    return "normal"
  }
  if (editor.isActive("heading")) {
    const level = editor.getAttributes("heading").level
    return level === 1 || level === 2 ? `heading-${level}` : "normal"
  }
  const named = editor.getAttributes("paragraph").namedStyle
  return typeof named === "string" && named ? named : "normal"
}

function firstFamily(stack: string) {
  return (stack.split(",")[0] ?? "").replace(/["']/g, "").trim()
}

/** The style's look as inline CSS, for previews. */
export function previewStyle(style: Pick<StyleDef, "font" | "paragraph" | "kind">): CSSProperties {
  const css: Record<string, string> = {}
  const declarations = [...fontCss(style.font), ...(style.kind === "paragraph" ? paragraphCss(style.paragraph) : [])]
  for (const declaration of declarations) {
    const at = declaration.indexOf(":")
    const name = declaration
      .slice(0, at)
      .trim()
      .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    css[name] = declaration.slice(at + 1).trim()
  }
  return css as CSSProperties
}

/** Word's one-line summary under the preview: "Font: Georgia, 14 pt, Bold, Centered, Space After: 6 pt…". */
export function describeStyle(style: StyleDef, styles: StyleDef[]) {
  const parts: string[] = []
  const font = style.font
  parts.push(`Font: ${font.family || "(Default)"}`)
  if (font.size) {
    parts.push(`${font.size} pt`)
  }
  if (font.bold) {
    parts.push("Bold")
  }
  if (font.italic) {
    parts.push("Italic")
  }
  if (font.underline) {
    parts.push("Underline")
  }
  if (font.color) {
    parts.push(`Font color: ${font.color}`)
  }
  if (style.kind === "paragraph") {
    const para = style.paragraph
    if (para.align && para.align !== "left") {
      parts.push(para.align === "center" ? "Centered" : para.align === "right" ? "Right" : "Justified")
    }
    if (para.line !== undefined) {
      parts.push(`Line spacing: ${para.line === 1 ? "single" : `Multiple ${para.line} li`}`)
    }
    if (para.before) {
      parts.push(`Space Before: ${para.before} pt`)
    }
    if (para.after !== undefined) {
      parts.push(`After: ${para.after} pt`)
    }
    if (para.indent) {
      parts.push(`Indent: Left ${para.indent} cm`)
    }
  }
  const basedOn = styles.find((item) => item.id === style.basedOn)
  if (basedOn && style.id !== "normal") {
    parts.push(`Based on: ${basedOn.name}`)
  }
  return parts.join(", ")
}

/** Modify Style, Create New Style, Manage Styles and the gallery's right-click menu. */
export function StyleDialogs() {
  const editing = useStyleDialogs((state) => state.editing)
  const manage = useStyleDialogs((state) => state.manage)
  return (
    <>
      <StyleChipMenu />
      {manage ? <ManageStylesDialog /> : null}
      {editing ? <ModifyStyleDialog key={editing.kind === "modify" ? editing.id : "new"} editing={editing} /> : null}
    </>
  )
}

const ALIGNMENTS: { id: NonNullable<StyleParagraph["align"]>; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "center", label: "Centered" },
  { id: "right", label: "Right" },
  { id: "justify", label: "Justified" },
]

const LINE_CHOICES = [1, 1.15, 1.5, 2]

function ModifyStyleDialog({ editing }: { editing: NonNullable<Editing> }) {
  const editor = useDocumentEditor()
  const styles = useStyleStore((state) => state.styles)
  const close = useStyleDialogs((state) => state.closeEditing)
  const creating = editing.kind === "new"
  const original = creating ? editing.seed : findStyle(editing.id)
  const [draft, setDraft] = useState<StyleDef | null>(original ? structuredClone(original) : null)
  const [inGallery, setInGallery] = useState(!original?.hidden)
  const [scope, setScope] = useState<"document" | "defaults">("document")
  const [error, setError] = useState("")

  if (!draft || !original) {
    return null
  }

  const setFont = (patch: Partial<StyleFont>) => setDraft({ ...draft, font: { ...draft.font, ...patch } })
  const setParagraph = (patch: Partial<StyleParagraph>) =>
    setDraft({ ...draft, paragraph: { ...draft.paragraph, ...patch } })
  const paragraphStyles = styles.filter((style) => style.kind === "paragraph" && style.id !== draft.id)
  const families = familyChoices(draft.font.family)
  const line = draft.paragraph.line ?? 1
  const lines = LINE_CHOICES.includes(line) ? LINE_CHOICES : [...LINE_CHOICES, line].sort((a, b) => a - b)

  const accept = () => {
    const name = draft.name.trim()
    if (!name) {
      setError("Type a name for the style.")
      return
    }
    const clash = styles.find((style) => style.name.toLowerCase() === name.toLowerCase() && style.id !== draft.id)
    if (clash) {
      setError(`There is already a style named “${clash.name}”. Choose another name.`)
      return
    }
    const store = useStyleStore.getState()
    let id = draft.id
    if (creating) {
      id = newStyleId(name, styles)
      store.add({ ...draft, id, name, wordId: newWordId(name, styles), hidden: !inGallery, builtIn: false })
    } else {
      store.update(id, { ...draft, name, hidden: !inGallery })
    }
    const saved = findStyle(id)
    if (saved && editor) {
      if (creating) {
        // As in Word, the selection takes the style it was made from.
        if (saved.kind === "paragraph") {
          applyParagraphStyle(editor, saved.id)
        } else {
          applyCharacterStyle(editor, saved.id)
        }
      } else if (saved.kind === "character") {
        restampCharacterStyle(editor, saved)
      }
    }
    if (saved && scope === "defaults") {
      saveDefaultStyles([saved])
    }
    close()
  }

  return (
    <DialogFrame
      title={creating ? "Create New Style from Formatting" : "Modify Style"}
      width={520}
      level={110}
      onClose={close}
      onSubmit={accept}
    >
      <Section title="Properties">
        <div className="style-dialog-grid">
          <Label htmlFor="sd-name" text="Name:" letter="N" />
          <input
            id="sd-name"
            className="word-dialog-text"
            value={draft.name}
            autoFocus
            disabled={draft.builtIn}
            onChange={(event) => {
              setError("")
              setDraft({ ...draft, name: event.target.value })
            }}
          />
          <Label htmlFor="sd-type" text="Style type:" letter="T" />
          <select
            id="sd-type"
            value={draft.kind}
            disabled={!creating}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as StyleDef["kind"] })}
          >
            <option value="paragraph">Paragraph</option>
            <option value="character">Character</option>
          </select>
          <Label htmlFor="sd-based" text="Style based on:" letter="B" />
          <select
            id="sd-based"
            value={draft.basedOn ?? ""}
            disabled={draft.kind !== "paragraph" || draft.id === "normal"}
            onChange={(event) => setDraft({ ...draft, basedOn: event.target.value || undefined })}
          >
            <option value="">(no style)</option>
            {paragraphStyles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
          <Label htmlFor="sd-next" text="Style for following paragraph:" letter="S" />
          <select
            id="sd-next"
            value={draft.next ?? "normal"}
            disabled={draft.kind !== "paragraph"}
            onChange={(event) => setDraft({ ...draft, next: event.target.value })}
          >
            {styles
              .filter((style) => style.kind === "paragraph")
              .map((style) => (
                <option key={style.id} value={style.id}>
                  {style.id === draft.id ? draft.name || style.name : style.name}
                </option>
              ))}
            {creating && draft.kind === "paragraph" ? <option value="">{draft.name || "(this style)"}</option> : null}
          </select>
        </div>
      </Section>
      <Section title="Formatting">
        <div className="style-dialog-row">
          <select
            aria-label="Font"
            className="w-[150px]"
            value={draft.font.family ?? ""}
            onChange={(event) => setFont({ family: event.target.value || undefined })}
          >
            <option value="">(Default)</option>
            {families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
          <select
            aria-label="Font size"
            className="w-[64px]"
            value={draft.font.size ?? ""}
            onChange={(event) => setFont({ size: event.target.value ? Number(event.target.value) : undefined })}
          >
            <option value="">—</option>
            {sizeChoices(draft.font.size).map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <ToggleButton
            label="Bold"
            pressed={Boolean(draft.font.bold)}
            onClick={() => setFont({ bold: !draft.font.bold })}
          >
            <b>B</b>
          </ToggleButton>
          <ToggleButton
            label="Italic"
            pressed={Boolean(draft.font.italic)}
            onClick={() => setFont({ italic: !draft.font.italic })}
          >
            <i className="font-serif">I</i>
          </ToggleButton>
          <ToggleButton
            label="Underline"
            pressed={Boolean(draft.font.underline)}
            onClick={() => setFont({ underline: !draft.font.underline })}
          >
            <u>U</u>
          </ToggleButton>
          <label className="style-dialog-color" title="Font color">
            <input
              type="color"
              aria-label="Font color"
              value={draft.font.color ?? "#000000"}
              onChange={(event) => setFont({ color: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="dialog-btn style-dialog-auto"
            disabled={!draft.font.color}
            onClick={() => setFont({ color: undefined })}
          >
            Automatic
          </button>
        </div>
        {draft.kind === "paragraph" ? (
          <div className="style-dialog-row">
            <div className="style-dialog-segment" role="radiogroup" aria-label="Alignment">
              {ALIGNMENTS.map((align) => (
                <ToggleButton
                  key={align.id}
                  label={align.label}
                  role="radio"
                  pressed={(draft.paragraph.align ?? "left") === align.id}
                  onClick={() => setParagraph({ align: align.id })}
                >
                  <AlignGlyph align={align.id} />
                </ToggleButton>
              ))}
            </div>
            <label className="style-dialog-field">
              Line
              <select
                aria-label="Line spacing"
                value={line}
                onChange={(event) => setParagraph({ line: Number(event.target.value) })}
              >
                {lines.map((value) => (
                  <option key={value} value={value}>
                    {value === 1 ? "Single" : value}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Before"
              unit="pt"
              value={draft.paragraph.before}
              onChange={(before) => setParagraph({ before })}
            />
            <NumberField
              label="After"
              unit="pt"
              value={draft.paragraph.after}
              onChange={(after) => setParagraph({ after })}
            />
            <NumberField
              label="Indent"
              unit="cm"
              step={0.25}
              value={draft.paragraph.indent}
              onChange={(indent) => setParagraph({ indent })}
            />
          </div>
        ) : null}
        <div className="style-dialog-preview" data-keep-light aria-label="Preview">
          <p className="style-dialog-preview-muted">
            Previous Paragraph Previous Paragraph Previous Paragraph Previous Paragraph Previous Paragraph
          </p>
          <p style={previewStyle(draft)}>
            {draft.kind === "paragraph"
              ? "Sample Text Sample Text Sample Text Sample Text Sample Text Sample Text Sample Text Sample Text"
              : "Sample Text"}
          </p>
          <p className="style-dialog-preview-muted">
            Following Paragraph Following Paragraph Following Paragraph Following Paragraph
          </p>
        </div>
        <p className="style-dialog-summary">{describeStyle(draft, styles)}</p>
      </Section>
      <div className="style-dialog-options">
        <Check
          id="sd-gallery"
          text="Add to the Styles gallery"
          letter="S"
          checked={inGallery}
          onChange={setInGallery}
        />
        <div className="style-dialog-scope" role="radiogroup" aria-label="Where the style applies">
          <label>
            <input type="radio" name="sd-scope" checked={scope === "document"} onChange={() => setScope("document")} />
            Only in this document
          </label>
          <label>
            <input type="radio" name="sd-scope" checked={scope === "defaults"} onChange={() => setScope("defaults")} />
            New documents based on this template
          </label>
        </div>
      </div>
      {error ? (
        <p role="alert" className="style-dialog-error">
          {error}
        </p>
      ) : null}
      <DialogButtons submit onCancel={close} />
    </DialogFrame>
  )
}

function familyChoices(current: string | undefined) {
  const names: string[] = ["Aptos", "Calibri", "Cambria", ...FONT_FAMILIES.map((font) => font.label)]
  if (current && !names.includes(current)) {
    names.unshift(current)
  }
  return [...new Set(names)]
}

function sizeChoices(current: number | undefined) {
  const sizes: number[] = [...FONT_SIZES]
  if (current && !sizes.includes(current)) {
    sizes.push(current)
    sizes.sort((a, b) => a - b)
  }
  return sizes
}

function ToggleButton({
  label,
  pressed,
  onClick,
  role,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  role?: "radio"
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      role={role}
      aria-pressed={role ? undefined : pressed}
      aria-checked={role ? pressed : undefined}
      className={`style-dialog-toggle${pressed ? " is-on" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function NumberField({
  label,
  unit,
  value,
  step = 1,
  onChange,
}: {
  label: string
  unit: string
  value: number | undefined
  step?: number
  onChange: (value: number | undefined) => void
}) {
  return (
    <label className="style-dialog-field">
      {label}
      <span className="style-dialog-number">
        <input
          type="number"
          min={0}
          step={step}
          value={value ?? ""}
          aria-label={`${label} (${unit})`}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)))
          }
        />
        <span>{unit}</span>
      </span>
    </label>
  )
}

function AlignGlyph({ align }: { align: NonNullable<StyleParagraph["align"]> }) {
  const lines: [number, number][] =
    align === "left"
      ? [
          [2, 14],
          [2, 10],
          [2, 14],
          [2, 9],
        ]
      : align === "center"
        ? [
            [2, 14],
            [4, 12],
            [2, 14],
            [5, 11],
          ]
        : align === "right"
          ? [
              [2, 14],
              [6, 14],
              [2, 14],
              [7, 14],
            ]
          : [
              [2, 14],
              [2, 14],
              [2, 14],
              [2, 14],
            ]
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {lines.map(([from, to], index) => (
        <path
          key={index}
          d={`M${from} ${3.5 + index * 3}H${to}`}
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function ManageStylesDialog() {
  const editor = useDocumentEditor()
  const styles = useStyleStore((state) => state.styles)
  const close = useStyleDialogs((state) => state.closeManage)
  const openModify = useStyleDialogs((state) => state.openModify)
  const openNew = useStyleDialogs((state) => state.openNew)
  const [selectedId, setSelectedId] = useState(styles[0]?.id ?? "normal")
  const [defaults, setDefaults] = useState(() => savedDefaultIds())
  const [confirm, setConfirm] = useState<null | "delete" | "reset">(null)
  const [notice, setNotice] = useState("")
  const selected = styles.find((style) => style.id === selectedId) ?? styles[0]

  useEffect(() => {
    if (!styles.some((style) => style.id === selectedId) && styles[0]) {
      setSelectedId(styles[0].id)
    }
  }, [styles, selectedId])

  const sorted = useMemo(
    () =>
      [...styles].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "paragraph" ? -1 : 1)),
    [styles],
  )

  if (!selected) {
    return null
  }

  const remove = () => {
    if (editor) {
      clearStyleFromDocument(editor, selected)
    }
    useStyleStore.getState().remove(selected.id)
    setConfirm(null)
    setNotice(`Deleted “${selected.name}”.`)
  }

  return (
    <DialogFrame title="Manage Styles" width={600} level={100} onClose={close}>
      <div className="style-manage">
        <div className="style-manage-list" role="listbox" aria-label="Styles" tabIndex={0}>
          {sorted.map((style) => (
            <div
              key={style.id}
              role="option"
              aria-selected={style.id === selected.id}
              className={`style-manage-item${style.id === selected.id ? " is-selected" : ""}`}
              onClick={() => {
                setSelectedId(style.id)
                setNotice("")
              }}
              onDoubleClick={() => openModify(style.id)}
            >
              <StyleKindGlyph kind={style.kind} />
              <span className="min-w-0 flex-1 truncate">{style.name}</span>
              {style.hidden ? <span className="style-manage-tag">Hidden</span> : null}
              {defaults.has(style.id) ? <span className="style-manage-tag is-default">Default</span> : null}
            </div>
          ))}
        </div>
        <div className="style-manage-side">
          <div className="style-manage-preview" data-keep-light>
            <span style={previewStyle(selected)}>{selected.kind === "paragraph" ? "AaBbCcDd" : "AaBbCc"}</span>
          </div>
          <p className="style-dialog-summary">{describeStyle(selected, styles)}</p>
          <div className="style-manage-actions">
            <button type="button" className="dialog-btn" onClick={() => openModify(selected.id)}>
              Modify…
            </button>
            <button type="button" className="dialog-btn" onClick={() => openNew(editor)}>
              New Style…
            </button>
            <button
              type="button"
              className="dialog-btn"
              disabled={selected.builtIn}
              title={selected.builtIn ? "Built-in styles can be changed or hidden, not deleted." : undefined}
              onClick={() => setConfirm("delete")}
            >
              Delete
            </button>
            <button
              type="button"
              className="dialog-btn"
              onClick={() => useStyleStore.getState().update(selected.id, { hidden: !selected.hidden })}
            >
              {selected.hidden ? "Show in Gallery" : "Hide from Gallery"}
            </button>
          </div>
          <div className="style-manage-defaults">
            <span className="style-manage-heading">New documents</span>
            <button
              type="button"
              className="dialog-btn"
              onClick={() => {
                saveDefaultStyles([selected])
                setDefaults(savedDefaultIds())
                setNotice(`New documents will use this “${selected.name}”.`)
              }}
            >
              Set as Default
            </button>
            <button
              type="button"
              className="dialog-btn"
              disabled={defaults.size === 0}
              onClick={() => setConfirm("reset")}
            >
              Reset Defaults…
            </button>
          </div>
          <p className="style-manage-notice" role="status">
            {notice}
          </p>
        </div>
      </div>
      <div className="word-dialog-actions">
        <span className="flex-1" />
        <button type="button" className="dialog-btn is-primary" onClick={close}>
          Close
        </button>
      </div>
      {confirm ? (
        <DialogFrame
          title={confirm === "delete" ? "Delete Style" : "Reset Defaults"}
          width={380}
          level={140}
          onClose={() => setConfirm(null)}
        >
          <p className="text-[13px]">
            {confirm === "delete"
              ? `Do you want to delete the style “${selected.name}” from this document? Text in it goes back to Normal.`
              : "New documents will start with the built-in styles again. Open documents keep theirs."}
          </p>
          <DialogButtons
            ok={confirm === "delete" ? "Delete" : "Reset"}
            onCancel={() => setConfirm(null)}
            onOk={() => {
              if (confirm === "delete") {
                remove()
                return
              }
              resetDefaultStyles()
              setDefaults(savedDefaultIds())
              setConfirm(null)
              setNotice("New documents will use the built-in styles.")
            }}
          />
        </DialogFrame>
      ) : null}
    </DialogFrame>
  )
}

function StyleKindGlyph({ kind }: { kind: StyleDef["kind"] }) {
  return (
    <span className="style-manage-kind" aria-label={kind === "paragraph" ? "Paragraph style" : "Character style"}>
      {kind === "paragraph" ? "¶" : "a"}
    </span>
  )
}

/** Word's right-click menu on a style in the gallery. */
function StyleChipMenu() {
  const menu = useStyleDialogs((state) => state.chipMenu)
  const closeMenu = useStyleDialogs((state) => state.closeChipMenu)
  const openModify = useStyleDialogs((state) => state.openModify)
  const editor = useDocumentEditor()
  const style = useStyleStore((state) => state.styles.find((item) => item.id === menu?.id))
  const [deleting, setDeleting] = useState<StyleDef | null>(null)

  useEffect(() => {
    if (!menu) {
      return
    }
    const away = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest("[data-style-chip-menu]"))) {
        closeMenu()
      }
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu()
      }
    }
    window.addEventListener("mousedown", away, true)
    window.addEventListener("keydown", key, true)
    window.addEventListener("resize", closeMenu)
    return () => {
      window.removeEventListener("mousedown", away, true)
      window.removeEventListener("keydown", key, true)
      window.removeEventListener("resize", closeMenu)
    }
  }, [menu, closeMenu])

  const updateToMatch = () => {
    if (!style) {
      return
    }
    const seed = seedFromSelection(editor)
    useStyleStore
      .getState()
      .update(
        style.id,
        style.kind === "paragraph" ? { font: seed.font, paragraph: seed.paragraph } : { font: seed.font },
      )
    const saved = findStyle(style.id)
    if (saved?.kind === "character" && editor) {
      restampCharacterStyle(editor, saved)
    }
    closeMenu()
  }

  return (
    <>
      {menu && style
        ? createPortal(
            <div
              data-style-chip-menu
              className="object-menu"
              role="menu"
              aria-label={`${style.name} style`}
              style={{ left: Math.min(menu.x, window.innerWidth - 260), top: menu.y }}
              onMouseDown={(event) => event.preventDefault()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <MenuItem onClick={updateToMatch}>Update {style.name} to Match Selection</MenuItem>
              <MenuItem onClick={() => openModify(style.id)}>Modify…</MenuItem>
              <div className="object-menu-sep" />
              <MenuItem
                onClick={() => {
                  useStyleStore.getState().update(style.id, { hidden: true })
                  closeMenu()
                }}
              >
                Remove from Style Gallery
              </MenuItem>
              {style.builtIn ? null : (
                <MenuItem
                  onClick={() => {
                    setDeleting(style)
                    closeMenu()
                  }}
                >
                  Delete {style.name}…
                </MenuItem>
              )}
            </div>,
            document.body,
          )
        : null}
      {deleting ? (
        <DialogFrame title="Delete Style" width={380} level={140} onClose={() => setDeleting(null)}>
          <p className="text-[13px]">
            Do you want to delete the style “{deleting.name}” from this document? Text in it goes back to Normal.
          </p>
          <DialogButtons
            ok="Delete"
            onCancel={() => setDeleting(null)}
            onOk={() => {
              if (editor) {
                clearStyleFromDocument(editor, deleting)
              }
              useStyleStore.getState().remove(deleting.id)
              setDeleting(null)
            }}
          />
        </DialogFrame>
      ) : null}
    </>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" className="object-menu-item" onClick={onClick}>
      <span>{children}</span>
    </button>
  )
}
