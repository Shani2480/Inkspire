import { requestFormatDialog } from "@/components/format-dialogs"
import { previewStyle, useStyleDialogs } from "@/components/style-dialogs"
import { useStylePanes } from "@/document/style-panes"
import { useStyleStore, type StyleDef } from "@/document/styles"
import { useDocumentEditor } from "@/editor/document-editor"
import { applyCharacterStyle, applyParagraphStyle, clearFormatting } from "@/editor/home-actions"
import {
  LINKED_STYLES,
  applyStyleFromPane,
  characterStyleAt,
  clearCharacterFormatting,
  clearParagraphFormatting,
  inspectStyles,
  paneStyles,
  paragraphStyleAt,
  revealFormatting,
  styleName,
} from "@/editor/style-inspect"
import { useDocumentStore } from "@/document/store"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { ChevronDown, X } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"

/** Word's Styles pane, Style Inspector, Reveal Formatting and Apply Styles box (Home → Styles). */

function useSelectionValue<T>(editor: Editor | null, compute: (editor: Editor) => T, fallback: T): T {
  const value = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? JSON.stringify(compute(current)) : null),
  })
  return value ? (JSON.parse(value) as T) : fallback
}

const paragraphApply = (editor: Editor) => ({
  paragraph: (id: string) => applyParagraphStyle(editor, id),
  character: (id: string) => applyCharacterStyle(editor, id),
})

function KindGlyph({ style, disableLinked }: { style: StyleDef; disableLinked: boolean }) {
  const linked = style.kind === "paragraph" && LINKED_STYLES.has(style.id) && !disableLinked
  const text = style.kind === "character" ? "a" : linked ? "¶a" : "¶"
  const label = style.kind === "character" ? "Character style" : linked ? "Linked style" : "Paragraph style"
  return (
    <span className="styles-pane-kind" aria-label={label} title={label}>
      {text}
    </span>
  )
}

/** Drags a floating window (Style Inspector, Apply Styles) by its title, as Word's float. */
function dragWindow(event: ReactPointerEvent<HTMLElement>) {
  const box = event.currentTarget.closest<HTMLElement>(".style-inspector, .apply-styles")
  if (!box || (event.target as HTMLElement).closest("button") || event.button !== 0) {
    return
  }
  const start = box.getBoundingClientRect()
  const dx = event.clientX - start.left
  const dy = event.clientY - start.top
  const move = (next: PointerEvent) => {
    const left = Math.max(0, Math.min(window.innerWidth - start.width, next.clientX - dx))
    const top = Math.max(0, Math.min(window.innerHeight - 40, next.clientY - dy))
    Object.assign(box.style, { left: `${left}px`, top: `${top}px`, right: "auto" })
  }
  const stop = () => {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", stop)
  }
  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", stop)
  event.preventDefault()
}

export function PaneHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="styles-pane-head" onPointerDown={dragWindow}>
      <h2>{title}</h2>
      <button type="button" className="comment-icon-btn" aria-label={`Close ${title}`} onClick={onClose}>
        <X className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  )
}

export function StylesPane() {
  const open = useStylePanes((state) => state.pane)
  const preview = useStylePanes((state) => state.preview)
  const disableLinked = useStylePanes((state) => state.disableLinked)
  const styles = useStyleStore((state) => state.styles)
  const editor = useDocumentEditor()
  const current = useSelectionValue(
    editor,
    (current) => ({ paragraph: paragraphStyleAt(current), character: characterStyleAt(current)?.id ?? null }),
    { paragraph: "normal", character: null as string | null },
  )
  if (!open) {
    return null
  }
  const listed = paneStyles(styles)
  const panes = useStylePanes.getState()
  const dialogs = useStyleDialogs.getState()

  return (
    <aside className="styles-pane" aria-label="Styles">
      <PaneHeader title="Styles" onClose={() => panes.togglePane(false)} />
      <div className="styles-pane-list" role="listbox" aria-label="Styles">
        <button
          type="button"
          role="option"
          aria-selected={false}
          className="styles-pane-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor && clearFormatting(editor)}
        >
          <span className="styles-pane-name">Clear All</span>
        </button>
        {listed.map((style) => {
          const selected = style.kind === "character" ? current.character === style.id : current.paragraph === style.id
          return (
            <div
              key={style.id}
              role="option"
              aria-selected={selected}
              className={`styles-pane-item${selected ? " is-current" : ""}`}
              title={style.name}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor && applyStyleFromPane(editor, style, disableLinked, paragraphApply(editor))}
            >
              <span className="styles-pane-name" style={preview ? previewFont(style) : undefined}>
                {style.name}
              </span>
              <KindGlyph style={style} disableLinked={disableLinked} />
              <button
                type="button"
                className="styles-pane-menu"
                aria-label={`${style.name} options`}
                onClick={(event) => {
                  event.stopPropagation()
                  const box = event.currentTarget.getBoundingClientRect()
                  dialogs.openChipMenu(style.id, box.left - 200, box.bottom + 2)
                }}
              >
                <ChevronDown className="size-3" strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="styles-pane-foot">
        <label className="styles-pane-check">
          <input type="checkbox" checked={preview} onChange={(event) => panes.setPreview(event.target.checked)} />
          Show Preview
        </label>
        <label className="styles-pane-check">
          <input
            type="checkbox"
            checked={disableLinked}
            onChange={(event) => panes.setDisableLinked(event.target.checked)}
          />
          Disable Linked Styles
        </label>
        <div className="styles-pane-buttons">
          <PaneButton label="New Style" onClick={() => dialogs.openNew(editor)}>
            <NewStyleIcon />
          </PaneButton>
          <PaneButton label="Style Inspector" onClick={() => panes.toggleInspector(true)}>
            <InspectIcon />
          </PaneButton>
          <PaneButton label="Manage Styles" onClick={() => dialogs.openManage()}>
            <ManageIcon />
          </PaneButton>
        </div>
      </div>
    </aside>
  )
}

/** Show Preview draws each name in its style's font, size capped so the list stays a list (as Word does). */
function previewFont(style: StyleDef) {
  const css = previewStyle({ ...style, paragraph: {} })
  const size = style.font.size ? Math.min(style.font.size, 16) : undefined
  return { ...css, fontSize: size ? `${size}pt` : undefined, lineHeight: 1.3 }
}

function PaneButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="styles-pane-button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

function NewStyleIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path className="sp-ink" d="M2.5 12.5 6 3.5h1l3.5 9M3.8 9.5h5.4" />
      <path className="sp-accent" d="M12.5 2.5v5M10 5h5" />
    </svg>
  )
}

function InspectIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path className="sp-ink" d="M2.5 11.5 5 4.5h1l2.5 7M3.4 9h4.2" />
      <circle className="sp-accent" cx="11" cy="9" r="2.5" />
      <path className="sp-accent" d="m12.8 10.8 1.9 1.9" />
    </svg>
  )
}

function ManageIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path className="sp-ink" d="M2.5 3.5h7M2.5 6.5h7M2.5 9.5h4" />
      <path className="sp-accent" d="m9 13.5.4-1.6L13 8.3l1.2 1.2-3.6 3.6z" />
    </svg>
  )
}

// --- Style Inspector ---------------------------------------------------------------------------------------------

function EraserButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="styles-pane-button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden>
        <path className="sp-ink" d="m6.5 13.5-3-3 6-6 4 4-5 5z" />
        <path className="sp-accent" d="M5 9l3 3M8 13.5h5.5" />
      </svg>
    </button>
  )
}

function InspectorBox({
  title,
  style,
  plus,
  clearStyle,
  clearPlus,
}: {
  title: string
  style: string
  plus: string[]
  clearStyle: { label: string; run: () => void }
  clearPlus: { label: string; run: () => void }
}) {
  return (
    <section className="style-inspector-box">
      <h3>{title}</h3>
      <div className="style-inspector-row">
        <span className="style-inspector-value">{style}</span>
        <EraserButton label={clearStyle.label} onClick={clearStyle.run} />
      </div>
      <div className="style-inspector-row">
        <span className={`style-inspector-value${plus.length ? "" : " is-none"}`}>
          {plus.length ? `Plus: ${plus.join(", ")}` : "Plus: <none>"}
        </span>
        <EraserButton label={clearPlus.label} onClick={clearPlus.run} />
      </div>
    </section>
  )
}

/** Word's Style Inspector: a small window that follows the selection. */
export function StyleInspector() {
  const open = useStylePanes((state) => state.inspector)
  const editor = useDocumentEditor()
  const facts = useSelectionValue(editor, inspectStyles, {
    paragraphStyle: "Normal",
    paragraphPlus: [] as string[],
    characterStyle: "Default Paragraph Font",
    characterPlus: [] as string[],
  })
  if (!open || !editor) {
    return null
  }
  const panes = useStylePanes.getState()
  return createPortal(
    <div className="style-inspector app-overlay" role="dialog" aria-label="Style Inspector">
      <PaneHeader title="Style Inspector" onClose={() => panes.toggleInspector(false)} />
      <InspectorBox
        title="Paragraph formatting"
        style={facts.paragraphStyle}
        plus={facts.paragraphPlus}
        clearStyle={{ label: "Reset to Normal paragraph style", run: () => applyParagraphStyle(editor, "normal") }}
        clearPlus={{ label: "Clear Paragraph Formatting", run: () => clearParagraphFormatting(editor) }}
      />
      <InspectorBox
        title="Text level formatting"
        style={facts.characterStyle}
        plus={facts.characterPlus}
        clearStyle={{ label: "Clear Character Style", run: () => clearCharacterFormatting(editor) }}
        clearPlus={{ label: "Clear Character Formatting", run: () => clearCharacterFormatting(editor) }}
      />
      <div className="style-inspector-foot">
        <PaneButton label="Reveal Formatting" onClick={() => panes.toggleReveal(true)}>
          <InspectIcon />
        </PaneButton>
        <PaneButton label="New Style" onClick={() => useStyleDialogs.getState().openNew(editor)}>
          <NewStyleIcon />
        </PaneButton>
        <button
          type="button"
          className="dialog-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => clearFormatting(editor)}
        >
          Clear All
        </button>
      </div>
    </div>,
    document.body,
  )
}

// --- Reveal Formatting -------------------------------------------------------------------------------------------

const SECTION_DIALOG: Record<string, (() => void) | undefined> = {
  Font: () => requestFormatDialog("font"),
  Paragraph: () => requestFormatDialog("paragraph"),
}

/** Reveal Formatting (Shift+F1): the selection's font, paragraph and section; the headings open their dialogs. */
export function RevealFormattingPane() {
  const open = useStylePanes((state) => state.reveal)
  const editor = useDocumentEditor()
  const setup = useDocumentStore((state) => state.pageSetup)
  const sections = useSelectionValue(editor, (current) => (open ? revealFormatting(current, setup) : []), [])
  const sample = useSelectionValue(
    editor,
    (current) => {
      const { from, to, empty, $from } = current.state.selection
      const text = empty ? $from.parent.textContent : current.state.doc.textBetween(from, to, " ")
      return text.trim().slice(0, 80) || "Sample Text"
    },
    "Sample Text",
  )
  if (!open) {
    return null
  }
  return (
    <aside className="styles-pane reveal-pane" aria-label="Reveal Formatting">
      <PaneHeader title="Reveal Formatting" onClose={() => useStylePanes.getState().toggleReveal(false)} />
      <div className="reveal-pane-sample">
        <span>Selected text</span>
        <p data-keep-light>{sample}</p>
      </div>
      <div className="reveal-pane-list">
        <h3>Formatting of selected text</h3>
        {sections.map((section) => {
          const openDialog = SECTION_DIALOG[section.title]
          return (
            <section key={section.title} className="reveal-pane-section">
              <h4>
                {openDialog ? (
                  <button type="button" className="reveal-pane-link" onClick={openDialog}>
                    {section.title}
                  </button>
                ) : (
                  section.title
                )}
              </h4>
              <dl>
                {section.rows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        })}
      </div>
    </aside>
  )
}

// --- Apply Styles box --------------------------------------------------------------------------------------------

/** Word's Apply Styles box (Ctrl+Shift+S): type or pick a style name and press Enter. */
export function ApplyStylesBox() {
  const open = useStylePanes((state) => state.applyBox)
  const editor = useDocumentEditor()
  const styles = useStyleStore((state) => state.styles)
  const disableLinked = useStylePanes((state) => state.disableLinked)
  const currentId = useSelectionValue(editor, paragraphStyleAt, "normal")
  const [name, setName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const currentName = styleName(currentId)

  useEffect(() => {
    if (open) {
      setName(currentName)
      requestAnimationFrame(() => inputRef.current?.select())
    }
    // Only when it opens: the box keeps what is being typed.
  }, [open])

  if (!open || !editor) {
    return null
  }
  const listed = paneStyles(styles, true)
  const match = listed.find((style) => style.name.toLowerCase() === name.trim().toLowerCase())
  const reapply = match?.id === currentId
  const close = () => useStylePanes.getState().toggleApplyBox(false)
  const apply = () => {
    if (!match) {
      return
    }
    applyStyleFromPane(editor, match, disableLinked, paragraphApply(editor))
    editor.commands.focus()
  }

  return createPortal(
    <div
      className="apply-styles app-overlay"
      role="dialog"
      aria-label="Apply Styles"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          close()
          editor.commands.focus()
        }
      }}
    >
      <PaneHeader title="Apply Styles" onClose={close} />
      <label htmlFor="apply-style-name" className="apply-styles-label">
        Style Name:
      </label>
      <input
        id="apply-style-name"
        ref={inputRef}
        list="apply-style-names"
        value={name}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            apply()
          }
        }}
      />
      <datalist id="apply-style-names">
        {listed.map((style) => (
          <option key={style.id} value={style.name} />
        ))}
      </datalist>
      <div className="apply-styles-buttons">
        <button type="button" className="dialog-btn" disabled={!match} onClick={apply}>
          {reapply ? "Reapply" : "Apply"}
        </button>
        <button
          type="button"
          className="dialog-btn"
          disabled={!match}
          onClick={() => match && useStyleDialogs.getState().openModify(match.id)}
        >
          Modify…
        </button>
        <PaneButton label="Styles" onClick={() => useStylePanes.getState().togglePane(true)}>
          <ManageIcon />
        </PaneButton>
      </div>
    </div>,
    document.body,
  )
}
