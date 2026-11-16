import { Check, DialogButtons, DialogFrame, Label } from "@/components/word-dialog"
import {
  buildInstruction,
  DATE_PICTURES,
  DOC_PROPERTIES,
  FIELD_CATEGORIES,
  FIELDS,
  INFO_TYPES,
  NUMBER_FORMATS,
  NUMERIC_PICTURES,
  TEXT_FORMATS,
  type FieldProperty,
  type FieldSpec,
} from "@/document/field-catalog"
import { formatPicture } from "@/document/field-date"
import { useStyleStore } from "@/document/styles"
import { useUserSettings } from "@/document/user-settings"
import {
  BLOCK_GALLERIES,
  deleteQuickPart,
  loadQuickParts,
  saveBuildingBlock,
  updateBuildingBlock,
  type BlockGallery,
  type QuickPart,
} from "@/editor/quick-parts"
import { chainWithSelection, restoreSelection, syncSelectionMemory } from "@/editor/selection-memory"
import { collectBookmarks } from "@/editor/word-field"
import type { Editor } from "@tiptap/core"
import { useMemo, useState } from "react"
import { create } from "zustand"

/**
 * Insert > Quick Parts: Word's Field dialog, Create New Building Block (Save Selection to Quick Part Gallery and
 * to AutoText Gallery) and the Building Blocks Organizer. Word's own building blocks (cover pages, headers, page
 * numbers…) live in Building Blocks.dotx, which the app does not have: the Organizer lists the user's own blocks.
 */

type Open =
  | { kind: "field"; editor: Editor }
  | { kind: "create"; editor: Editor; gallery: BlockGallery; html: string; text: string }
  | { kind: "organizer"; editor: Editor }
  | null

export const useQuickPartsDialogs = create<{ open: Open; parts: QuickPart[]; reload: () => void }>((set) => ({
  open: null,
  parts: loadQuickParts(),
  reload: () => set({ parts: loadQuickParts() }),
}))

export function openFieldDialog(editor: Editor | null) {
  if (editor) {
    restoreSelection(editor)
    useQuickPartsDialogs.setState({ open: { kind: "field", editor } })
  }
}

export function openCreateBuildingBlock(editor: Editor | null, gallery: BlockGallery, html: string, text: string) {
  if (editor && html) {
    restoreSelection(editor)
    useQuickPartsDialogs.setState({ open: { kind: "create", editor, gallery, html, text } })
  }
}

export function openBuildingBlocksOrganizer(editor: Editor | null) {
  if (editor) {
    restoreSelection(editor)
    useQuickPartsDialogs.setState({ open: { kind: "organizer", editor } })
  }
}

/** Inserts a building block at the selection. */
export function insertBuildingBlock(editor: Editor, part: QuickPart) {
  chainWithSelection(editor).insertContent(part.html).run()
  syncSelectionMemory(editor)
}

/** Inserts a field, its result worked out by the field plugin straight away. */
export function insertField(editor: Editor, instr: string) {
  chainWithSelection(editor)
    .insertContent({ type: "wordField", attrs: { instr: instr.trim(), result: "" } })
    .run()
  syncSelectionMemory(editor)
}

export function QuickPartsDialogsHost() {
  const open = useQuickPartsDialogs((state) => state.open)
  const close = () => useQuickPartsDialogs.setState({ open: null })
  if (!open) {
    return null
  }
  if (open.kind === "field") {
    return <FieldDialog editor={open.editor} onClose={close} />
  }
  if (open.kind === "create") {
    return (
      <CreateBuildingBlockDialog
        initial={{ name: suggested(open.text), gallery: open.gallery }}
        onClose={close}
        onSave={(fields) => {
          saveBuildingBlock({ ...fields, html: open.html })
          useQuickPartsDialogs.getState().reload()
          close()
        }}
      />
    )
  }
  return <BuildingBlocksOrganizer editor={open.editor} onClose={close} />
}

function suggested(text: string) {
  return text.replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ").slice(0, 32)
}

// --- Field ---------------------------------------------------------------------------------------------------------

type SwitchState = Record<string, { on: boolean; value: string }>

/** The arguments a field's properties give, in order (formats are switches, not arguments). */
const argumentProperties = (spec: FieldSpec) =>
  (spec.properties ?? []).filter(
    (item) => item.kind !== "date" && item.kind !== "text-format" && item.kind !== "number-format",
  )

/**
 * Word's Field dialog: a category and a field name on the left, the field's properties (format lists, a name or a
 * bookmark) in the middle and its options (switches) on the right, its description below. Field Codes shows the
 * instruction to edit by hand. Fields that Word inserts through a dialog of their own (TOC, Index, Hyperlink…) are
 * inserted here with their switches; the app works out results for the fields it has data for.
 */
export function FieldDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [category, setCategory] = useState<string>("(All)")
  const [name, setName] = useState("Author")
  const [args, setArgs] = useState<string[]>([])
  const [datePicture, setDatePicture] = useState("")
  const [textFormat, setTextFormat] = useState("")
  const [numberFormat, setNumberFormat] = useState("")
  const [numberPicture, setNumberPicture] = useState("")
  const [switches, setSwitches] = useState<SwitchState>({})
  const [preserve, setPreserve] = useState(true)
  const [codes, setCodes] = useState<string | null>(null)
  const locale = useUserSettings((state) => state.locale) || undefined

  const fields = useMemo(
    () => FIELDS.filter((field) => category === "(All)" || field.categories.includes(category as never)),
    [category],
  )
  const spec = FIELDS.find((field) => field.name === name) ?? fields[0]!
  const bookmarks = useMemo(() => [...collectBookmarks(editor.state.doc).keys()].sort(), [editor])
  const styles = useStyleStore((state) => state.styles)
  const styleNames = useMemo(
    () => [
      ...new Set([
        ...["Heading 1", "Heading 2", "Heading 3"],
        ...styles.filter((style) => style.kind === "paragraph").map((style) => style.name),
      ]),
    ],
    [styles],
  )

  const choose = (next: string) => {
    setName(next)
    setArgs([])
    setDatePicture("")
    setTextFormat("")
    setNumberFormat("")
    setNumberPicture("")
    setSwitches({})
    setCodes(null)
  }

  const instruction = () =>
    buildInstruction(
      spec,
      { args, datePicture, textFormat: textFormat || numberFormat, numberPicture },
      (spec.switches ?? [])
        .filter((item) => switches[item.flag]?.on)
        .map((item) => ({ flag: item.flag, value: item.value ? switches[item.flag]!.value : undefined })),
      preserve,
    )

  const ok = () => {
    const instr = codes ?? instruction()
    if (instr.trim()) {
      insertField(editor, instr)
    }
    onClose()
  }

  const setArg = (index: number, value: string) =>
    setArgs((current) => {
      const next = [...current]
      next[index] = value
      return next
    })

  const now = new Date()
  const properties = spec.properties ?? []
  const argProps: FieldProperty[] = argumentProperties(spec)

  const property = (item: FieldProperty, key: number) => {
    const argIndex = argProps.indexOf(item)
    switch (item.kind) {
      case "date":
        return (
          <div key={key} className="field-dialog-stack">
            <Label htmlFor="field-date" text="Date formats:" letter="D" />
            <input
              className="word-dialog-text"
              id="field-date"

              value={datePicture}
              onChange={(event) => setDatePicture(event.target.value)}
            />
            <List
              label="Date formats"
              items={DATE_PICTURES.map((picture) => [formatPicture(now, picture, locale), picture])}
              value={datePicture}
              onChange={setDatePicture}
            />
          </div>
        )
      case "text-format":
        return (
          <div key={key} className="field-dialog-stack">
            <span>Format:</span>
            <List label="Format" items={TEXT_FORMATS} value={textFormat} onChange={setTextFormat} short />
          </div>
        )
      case "number-format":
        return (
          <div key={key} className="field-dialog-pair">
            <div className="field-dialog-stack">
              <span>Format:</span>
              <List label="Number format" items={NUMBER_FORMATS} value={numberFormat} onChange={setNumberFormat} />
            </div>
            <div className="field-dialog-stack">
              <Label htmlFor="field-numeric" text="Numeric format:" letter="N" />
              <input
                className="word-dialog-text"
                id="field-numeric"

                value={numberPicture}
                onChange={(event) => setNumberPicture(event.target.value)}
              />
              <List
                label="Numeric format"
                items={NUMERIC_PICTURES.map((picture) => [picture, picture])}
                value={numberPicture}
                onChange={setNumberPicture}
              />
            </div>
          </div>
        )
      case "text":
        return (
          <div key={key} className="field-dialog-stack">
            <label htmlFor={`field-arg-${argIndex}`}>{item.label}</label>
            <input
              className="word-dialog-text"
              id={`field-arg-${argIndex}`}

              value={args[argIndex] ?? ""}
              onChange={(event) => setArg(argIndex, event.target.value)}
            />
          </div>
        )
      case "property":
        return (
          <div key={key} className="field-dialog-stack">
            <span>Property:</span>
            <List
              label="Property"
              items={DOC_PROPERTIES.map((item) => [item, item])}
              value={args[argIndex] ?? ""}
              onChange={(value) => setArg(argIndex, value)}
            />
          </div>
        )
      case "bookmark":
        return (
          <div key={key} className="field-dialog-stack">
            <span>Bookmark name:</span>
            <List
              label="Bookmark name"
              items={bookmarks.map((item) => [item, item])}
              value={args[argIndex] ?? ""}
              onChange={(value) => setArg(argIndex, value)}
              empty="There are no bookmarks in this document."
            />
          </div>
        )
      case "style":
        return (
          <div key={key} className="field-dialog-stack">
            <span>Style name:</span>
            <List
              label="Style name"
              items={styleNames.map((item) => [item, item])}
              value={args[argIndex] ?? ""}
              onChange={(value) => setArg(argIndex, value)}
            />
          </div>
        )
      case "info":
        return (
          <div key={key} className="field-dialog-stack">
            <span>Info categories:</span>
            <List
              label="Info categories"
              items={INFO_TYPES.map((item) => [item, item])}
              value={args[argIndex] ?? ""}
              onChange={(value) => setArg(argIndex, value)}
            />
          </div>
        )
    }
  }

  return (
    <DialogFrame
      title="Field"
      width={760}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        ok()
      }}
    >
      <div className="field-dialog">
        <section className="field-dialog-column">
          <h3>Please choose a field</h3>
          <Label htmlFor="field-category" text="Categories:" letter="C" />
          <select
            id="field-category"

            value={category}
            onChange={(event) => {
              const next = event.target.value
              setCategory(next)
              // A field outside the new category gives way to the category's first, as in Word.
              if (next !== "(All)" && !spec.categories.includes(next as never)) {
                const first = FIELDS.find((field) => field.categories.includes(next as never))
                if (first) {
                  choose(first.name)
                }
              }
            }}
          >
            {FIELD_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <span>Field names:</span>
          <List
            label="Field names"
            items={fields.map((field) => [field.name, field.name])}
            value={spec.name}
            onChange={choose}
            onActivate={ok}
            grow
          />
        </section>
        {codes !== null ? (
          <section className="field-dialog-column field-dialog-wide">
            <h3>Advanced field properties</h3>
            <Label htmlFor="field-codes" text="Field codes:" letter="F" />
            <input
              className="word-dialog-text"
              id="field-codes"

              value={codes}
              autoFocus
              onChange={(event) => setCodes(event.target.value)}
            />
            <p className="field-dialog-note">{syntaxOf(spec)}</p>
          </section>
        ) : (
          <>
            <section className="field-dialog-column">
              <h3>Field properties</h3>
              {properties.length === 0 ? (
                <p className="field-dialog-note">Click the OK button to insert the field.</p>
              ) : (
                properties.map(property)
              )}
            </section>
            <section className="field-dialog-column">
              <h3>Field options</h3>
              {(spec.switches ?? []).length === 0 ? (
                <p className="field-dialog-note">No field options available for this field.</p>
              ) : (
                (spec.switches ?? []).map((item, index) => (
                  <div key={item.flag} className="field-dialog-switch">
                    <Check
                      id={`field-switch-${index}`}
                      text={item.label}
                      letter=""
                      checked={!!switches[item.flag]?.on}
                      onChange={(on) =>
                        setSwitches((current) => ({
                          ...current,
                          [item.flag]: { on, value: current[item.flag]?.value ?? "" },
                        }))
                      }
                    />
                    {item.value ? (
                      <input
                        className="word-dialog-text"
                        aria-label={`${item.label}: ${item.value}`}

                        placeholder={item.value}
                        disabled={!switches[item.flag]?.on}
                        value={switches[item.flag]?.value ?? ""}
                        onChange={(event) =>
                          setSwitches((current) => ({
                            ...current,
                            [item.flag]: { on: true, value: event.target.value },
                          }))
                        }
                      />
                    ) : null}
                  </div>
                ))
              )}
              <span className="flex-1" />
              <Check
                id="field-preserve"
                text="Preserve formatting during updates"
                letter="v"
                checked={preserve}
                onChange={setPreserve}
              />
            </section>
          </>
        )}
      </div>
      <div className="field-dialog-description">
        <strong>Description:</strong>
        <span>{spec.description}</span>
      </div>
      <DialogButtons onOk={ok} onCancel={onClose}>
        <button type="button" className="dialog-btn" onClick={() => setCodes(codes === null ? instruction() : null)}>
          {codes === null ? "Field Codes" : "Hide Codes"}
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}

/** The field's syntax line under Field codes, as Word shows it ("AUTHOR ["NewName"]"). */
function syntaxOf(spec: FieldSpec) {
  const args = (spec.properties ?? [])
    .filter((item): item is Extract<FieldProperty, { kind: "text" }> => item.kind === "text")
    .map((item) => `[${item.quoted ? `"${item.label.replace(/:$/, "")}"` : item.label.replace(/:$/, "")}]`)
  const switches = (spec.switches ?? []).map((item) => `[${item.flag}${item.value ? ` ${item.value}` : ""}]`)
  return ["Syntax:", spec.name === "=" ? "=" : spec.name.replace(/-/g, "").toUpperCase(), ...args, ...switches].join(
    " ",
  )
}

/** A single-choice list box: [shown text, value] pairs; a click chooses, a double click (or Enter) confirms. */
function List({
  label,
  items,
  value,
  onChange,
  onActivate,
  empty,
  grow = false,
  short = false,
}: {
  label: string
  items: [string, string][]
  value: string
  onChange: (value: string) => void
  onActivate?: () => void
  empty?: string
  grow?: boolean
  short?: boolean
}) {
  const index = items.findIndex(([, item]) => item === value)
  return (
    <div
      className={`field-dialog-list${grow ? " is-grow" : ""}${short ? " is-short" : ""}`}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault()
          const next = Math.min(items.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))
          if (items[next]) {
            onChange(items[next]![1])
            event.currentTarget.children[next]?.scrollIntoView({ block: "nearest" })
          }
        }
      }}
    >
      {items.length === 0 && empty ? <p className="field-dialog-note">{empty}</p> : null}
      {items.map(([text, item]) => (
        <div
          key={`${text}|${item}`}
          role="option"
          aria-selected={item === value}
          className={`field-dialog-item${item === value ? " is-selected" : ""}`}
          onClick={() => onChange(item)}
          onDoubleClick={() => {
            onChange(item)
            onActivate?.()
          }}
        >
          {text}
        </div>
      ))}
    </div>
  )
}

// --- Create New Building Block -----------------------------------------------------------------------------------

type BlockForm = { name: string; gallery: BlockGallery; category: string; description: string }

/** Word's Create New Building Block (also Modify Building Block from the Organizer's Edit Properties…). */
export function CreateBuildingBlockDialog({
  initial,
  title = "Create New Building Block",
  onClose,
  onSave,
}: {
  initial: Partial<BlockForm>
  title?: string
  onClose: () => void
  onSave: (fields: BlockForm) => void
}) {
  const parts = useQuickPartsDialogs((state) => state.parts)
  const [form, setForm] = useState<BlockForm>({
    name: initial.name ?? "",
    gallery: initial.gallery ?? "Quick Parts",
    category: initial.category ?? "General",
    description: initial.description ?? "",
  })
  const categories = [...new Set(["General", ...parts.map((part) => part.category)])]
  const set = (patch: Partial<BlockForm>) => setForm((current) => ({ ...current, ...patch }))
  return (
    <DialogFrame
      title={title}
      width={380}
      level={110}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        if (form.name.trim()) {
          onSave(form)
        }
      }}
    >
      <div className="block-dialog-grid">
        <Label htmlFor="block-name" text="Name:" letter="N" />
        <input
          className="word-dialog-text"
          id="block-name"
          value={form.name}
          autoFocus
          onChange={(event) => set({ name: event.target.value })}
        />
        <Label htmlFor="block-gallery" text="Gallery:" letter="G" />
        <select
          id="block-gallery"
          value={form.gallery}
          onChange={(event) => set({ gallery: event.target.value as BlockGallery })}
        >
          {BLOCK_GALLERIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <Label htmlFor="block-category" text="Category:" letter="C" />
        <input
          className="word-dialog-text"
          id="block-category"

          list="block-categories"
          value={form.category}
          onChange={(event) => set({ category: event.target.value })}
        />
        <datalist id="block-categories">
          {categories.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <Label htmlFor="block-description" text="Description:" letter="D" />
        <input
          className="word-dialog-text"
          id="block-description"
          value={form.description}
          onChange={(event) => set({ description: event.target.value })}
        />
        <span>Save in:</span>
        <select aria-label="Save in" disabled value="app">
          <option value="app">Building Blocks (this app)</option>
        </select>
        <span>Options:</span>
        <select aria-label="Options" disabled value="content">
          <option value="content">Insert content only</option>
        </select>
      </div>
      <DialogButtons submit okDisabled={!form.name.trim()} onCancel={onClose} />
    </DialogFrame>
  )
}

// --- Building Blocks Organizer -----------------------------------------------------------------------------------

type SortKey = "name" | "gallery" | "category"

/** Word's Building Blocks Organizer: the user's blocks by Name, Gallery, Category and Template, with a preview. */
export function BuildingBlocksOrganizer({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const parts = useQuickPartsDialogs((state) => state.parts)
  const reload = useQuickPartsDialogs((state) => state.reload)
  const [sort, setSort] = useState<SortKey>("gallery")
  const [selected, setSelected] = useState<string | null>(parts[0]?.id ?? null)
  const [editing, setEditing] = useState<QuickPart | null>(null)
  const sorted = useMemo(
    () => [...parts].sort((a, b) => a[sort].localeCompare(b[sort]) || a.name.localeCompare(b.name)),
    [parts, sort],
  )
  const current = parts.find((part) => part.id === selected) ?? null
  const insert = () => {
    if (current) {
      insertBuildingBlock(editor, current)
      onClose()
    }
  }
  return (
    <DialogFrame title="Building Blocks Organizer" width={720} onClose={onClose}>
      <div className="organizer-dialog">
        <div className="organizer-left">
          <span>Building blocks:</span>
          <div className="organizer-table" role="grid" aria-label="Building blocks">
            <div className="organizer-row is-head" role="row">
              {(["name", "gallery", "category"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="columnheader"
                  aria-sort={sort === key ? "ascending" : "none"}
                  onClick={() => setSort(key)}
                >
                  {key[0]!.toUpperCase() + key.slice(1)}
                </button>
              ))}
              <span role="columnheader">Template</span>
            </div>
            {sorted.length === 0 ? (
              <p className="field-dialog-note">
                No building blocks yet. Select text, then use Save Selection to Quick Part Gallery.
              </p>
            ) : (
              sorted.map((part) => (
                <div
                  key={part.id}
                  role="row"
                  aria-selected={part.id === selected}
                  className={`organizer-row${part.id === selected ? " is-selected" : ""}`}
                  onClick={() => setSelected(part.id)}
                  onDoubleClick={() => {
                    setSelected(part.id)
                    insertBuildingBlock(editor, part)
                    onClose()
                  }}
                >
                  <span role="gridcell">{part.name}</span>
                  <span role="gridcell">{part.gallery}</span>
                  <span role="gridcell">{part.category}</span>
                  <span role="gridcell">Building Blocks</span>
                </div>
              ))
            )}
          </div>
          <div className="organizer-actions">
            <button
              type="button"
              className="dialog-btn"
              disabled={!current}
              onClick={() => current && setEditing(current)}
            >
              Edit Properties...
            </button>
            <button
              type="button"
              className="dialog-btn"
              disabled={!current}
              onClick={() => {
                if (current) {
                  deleteQuickPart(current.id)
                  reload()
                  setSelected(null)
                }
              }}
            >
              Delete
            </button>
            <button type="button" className="dialog-btn" disabled={!current} onClick={insert}>
              Insert
            </button>
          </div>
        </div>
        <div className="organizer-right">
          <div className="organizer-preview" data-keep-light aria-label="Preview">
            {current ? (
              <div className="organizer-preview-page" dangerouslySetInnerHTML={{ __html: current.html }} />
            ) : null}
          </div>
          <p className="organizer-caption">
            {current ? (
              <>
                <strong>{current.name}</strong>
                {current.description ? <span>{current.description}</span> : null}
              </>
            ) : (
              "Select a building block to see its preview."
            )}
          </p>
        </div>
      </div>
      <div className="word-dialog-actions">
        <span className="flex-1" />
        <button type="button" className="dialog-btn" onClick={onClose}>
          Close
        </button>
      </div>
      {editing ? (
        <CreateBuildingBlockDialog
          title="Modify Building Block"
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(fields) => {
            updateBuildingBlock(editing.id, fields)
            reload()
            setEditing(null)
          }}
        />
      ) : null}
    </DialogFrame>
  )
}
