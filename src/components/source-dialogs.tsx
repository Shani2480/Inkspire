import { useMemo, useState } from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { Check, DialogButtons, DialogFrame, Keyed, Label } from "@/components/word-dialog"
import {
  BIB_STYLES,
  SOURCE_TYPES,
  bibliographyEntries,
  citationContext,
  formatCitation,
  isPlaceholder,
  mainNames,
  makeTag,
  namesText,
  parseNames,
  placeholderTag,
  sourceFields,
  styleInfo,
  type BibSource,
  type Citation,
  type NameList,
  type NameRole,
  type Person,
  type SourceType,
} from "@/document/bibliography"
import { loadMasterList, putMasterSource, saveMasterList, useBibliography } from "@/document/bibliography-store"
import { useDocumentStore } from "@/document/store"
import { citationAt, editCitation, type CitationAt } from "@/editor/bibliography"
import { citedTags } from "@/editor/word-field"
import { restoreSelection } from "@/editor/selection-memory"

/**
 * References > Citations & Bibliography: Word's Source Manager (Master List and Current List), Create Source / Edit
 * Source with every source type and its fields (Show All Bibliography Fields), Edit Name, Edit Citation and Placeholder
 * Name. Left out: the Language list (sources are formatted in English), Browse for another master list, and Search
 * Libraries.
 */

type Open =
  | { kind: "manager" }
  | { kind: "create"; insert: boolean }
  | { kind: "edit-source"; tag: string }
  | { kind: "placeholder" }
  | { kind: "edit-citation"; at: CitationAt }

const useSourceDialogs = create<{ editor: Editor | null; open: Open | null }>(() => ({ editor: null, open: null }))

function show(editor: Editor | null, open: Open) {
  if (editor) {
    restoreSelection(editor)
    useSourceDialogs.setState({ editor, open })
  }
}

export const openSourceManager = (editor: Editor | null) => show(editor, { kind: "manager" })
/** Insert Citation > Add New Source…: the source goes into the document's list and is cited at the cursor. */
export const openNewSource = (editor: Editor | null) => show(editor, { kind: "create", insert: true })
export const openPlaceholder = (editor: Editor | null) => show(editor, { kind: "placeholder" })

/** The citation's dialogs from its menu: Edit Citation and Edit Source. */
export function openEditCitation(editor: Editor | null) {
  const at = editor ? citationAt(editor) : null
  if (at) {
    show(editor, { kind: "edit-citation", at })
  }
}

export function openEditSource(editor: Editor | null) {
  const at = editor ? citationAt(editor) : null
  const tag = at?.citation.tags[0]
  if (tag) {
    show(editor, { kind: "edit-source", tag })
  }
}

const dirty = () => useDocumentStore.setState({ isDirty: true })

export function SourceDialogsHost() {
  const { editor, open } = useSourceDialogs()
  const close = () => useSourceDialogs.setState({ open: null })
  const sources = useBibliography((state) => state.sources)
  if (!editor || !open) {
    return null
  }
  const taken = () => [...useBibliography.getState().sources, ...loadMasterList()].map((source) => source.tag)
  if (open.kind === "manager") {
    return <SourceManager editor={editor} onClose={close} />
  }
  if (open.kind === "create") {
    return (
      <SourceEditor
        title="Create Source"
        taken={taken()}
        onClose={close}
        onSave={(source) => {
          useBibliography.getState().putSource(source)
          putMasterSource(source)
          if (open.insert) {
            editor
              .chain()
              .focus()
              .insertCitation({ tags: [source.tag] })
              .run()
          }
          dirty()
          close()
        }}
      />
    )
  }
  if (open.kind === "edit-source") {
    const source = sources.find((item) => item.tag.toLowerCase() === open.tag.toLowerCase())
    if (!source) {
      return null
    }
    return (
      <SourceEditor
        title="Edit Source"
        source={source}
        taken={taken().filter((tag) => tag !== source.tag)}
        onClose={close}
        onSave={(next) => {
          useBibliography.getState().putSource(next, source.tag)
          if (loadMasterList().some((item) => item.tag === source.tag)) {
            putMasterSource(next, source.tag)
          }
          dirty()
          close()
        }}
      />
    )
  }
  if (open.kind === "placeholder") {
    return (
      <PlaceholderDialog
        taken={taken()}
        onClose={close}
        onSave={(tag) => {
          const existing = useBibliography
            .getState()
            .sources.some((item) => item.tag.toLowerCase() === tag.toLowerCase())
          if (!existing) {
            useBibliography.getState().putSource({ tag, type: "", names: {}, fields: {} })
          }
          editor
            .chain()
            .focus()
            .insertCitation({ tags: [tag] })
            .run()
          dirty()
          close()
        }}
      />
    )
  }
  return (
    <EditCitationDialog
      at={open.at}
      onClose={close}
      onSave={(changes) => {
        editCitation(editor, open.at, changes)
        close()
      }}
    />
  )
}

// --- Source Manager ----------------------------------------------------------------------------------------------

type SortBy = "author" | "tag" | "title" | "year"

const sortKey = (source: BibSource, by: SortBy) => {
  if (by === "tag") {
    return source.tag
  }
  if (by === "title") {
    return source.fields.Title ?? ""
  }
  if (by === "year") {
    return source.fields.Year ?? ""
  }
  const names = mainNames(source)
  return names?.corporate ?? names?.people.map((person) => `${person.last} ${person.first}`).join(" ") ?? ""
}

/** A source's line in a list: "Smith, John A.; 2020; The Art of Testing", as Word lists them by the sort. */
function sourceLine(source: BibSource, by: SortBy) {
  if (isPlaceholder(source)) {
    return source.tag
  }
  const author = namesText(mainNames(source))
  const pieces =
    by === "tag"
      ? [source.tag, author, source.fields.Title]
      : by === "title"
        ? [source.fields.Title, author, source.fields.Year]
        : by === "year"
          ? [source.fields.Year, author, source.fields.Title]
          : [author, source.fields.Year, source.fields.Title]
  return pieces.filter(Boolean).join("; ")
}

function SourceManager({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = useBibliography((state) => state.sources)
  const style = useBibliography((state) => state.style)
  const [master, setMaster] = useState(loadMasterList)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<SortBy>("author")
  const [selected, setSelected] = useState<{ list: "master" | "current"; tag: string } | null>(null)
  const [editing, setEditing] = useState<BibSource | "new" | null>(null)
  const cited = useMemo(() => new Set(citedTags(editor.state.doc).map((tag) => tag.toLowerCase())), [editor])
  const filter = (list: BibSource[]) => {
    const needle = search.trim().toLowerCase()
    return list
      .filter((source) => !needle || sourceLine(source, "tag").toLowerCase().includes(needle))
      .sort((a, b) => sortKey(a, sortBy).localeCompare(sortKey(b, sortBy)))
  }
  const listOf = (which: "master" | "current") => (which === "master" ? master : current)
  const chosen = selected ? listOf(selected.list).find((source) => source.tag === selected.tag) : undefined
  const inOther = (source: BibSource, which: "master" | "current") =>
    listOf(which === "master" ? "current" : "master").some(
      (item) => item.tag.toLowerCase() === source.tag.toLowerCase(),
    )
  const isCited = (source: BibSource) => cited.has(source.tag.toLowerCase())
  const updateMaster = (next: BibSource[]) => {
    saveMasterList(next)
    setMaster(next)
  }
  const copy = () => {
    if (!chosen || !selected) {
      return
    }
    if (selected.list === "master") {
      useBibliography.getState().putSource(structuredClone(chosen))
      dirty()
    } else {
      updateMaster(putMasterSource(structuredClone(chosen)))
    }
  }
  const remove = () => {
    if (!chosen || !selected) {
      return
    }
    if (selected.list === "master") {
      updateMaster(master.filter((item) => item.tag !== chosen.tag))
    } else {
      useBibliography.getState().removeSource(chosen.tag)
      dirty()
    }
    setSelected(null)
  }
  const preview = chosen && !isPlaceholder(chosen) ? previewOf(chosen, style) : null
  const list = (which: "master" | "current", label: string, letter: string) => (
    <div className="source-manager-list">
      <span className="source-manager-heading">
        <Keyed text={label} letter={letter} />
      </span>
      <ul role="listbox" aria-label={label} tabIndex={0}>
        {filter(listOf(which)).map((source) => {
          const mark = which === "current" ? (isPlaceholder(source) ? "?" : isCited(source) ? "✓" : "") : ""
          return (
            <li
              key={source.tag}
              role="option"
              aria-selected={selected?.list === which && selected.tag === source.tag}
              title={sourceLine(source, sortBy)}
              onClick={() => setSelected({ list: which, tag: source.tag })}
              onDoubleClick={() => setEditing(source)}
            >
              <span
                className="source-manager-mark"
                aria-label={mark === "✓" ? "Cited" : mark === "?" ? "Placeholder" : undefined}
              >
                {mark}
              </span>
              <span className="source-manager-text">{sourceLine(source, sortBy)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
  return (
    <>
      <DialogFrame title="Source Manager" width={720} onClose={onClose}>
        <div className="source-manager">
          <div className="source-manager-search">
            <Label htmlFor="source-search" text="Search:" letter="S" />
            <input
              id="source-search"
              className="dialog-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select aria-label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
              <option value="author">Sort by Author</option>
              <option value="tag">Sort by Tag</option>
              <option value="title">Sort by Title</option>
              <option value="year">Sort by Year</option>
            </select>
          </div>
          <div className="source-manager-lists">
            {list("master", "Master List", "L")}
            <div className="source-manager-actions">
              <button
                type="button"
                className="dialog-btn"
                disabled={!chosen || (chosen && selected ? inOther(chosen, selected.list) : true)}
                onClick={copy}
              >
                {selected?.list === "current" ? "< Copy" : "Copy >"}
              </button>
              <button
                type="button"
                className="dialog-btn"
                disabled={!chosen || (selected?.list === "current" && isCited(chosen))}
                title={
                  chosen && selected?.list === "current" && isCited(chosen)
                    ? "A cited source can't be deleted"
                    : undefined
                }
                onClick={remove}
              >
                Delete
              </button>
              <button
                type="button"
                className="dialog-btn"
                disabled={!chosen}
                onClick={() => chosen && setEditing(chosen)}
              >
                Edit…
              </button>
              <button type="button" className="dialog-btn" onClick={() => setEditing("new")}>
                New…
              </button>
            </div>
            {list("current", "Current List", "C")}
          </div>
          <p className="source-manager-legend">✓ cited source&nbsp;&nbsp;&nbsp;? placeholder source</p>
          <div className="source-manager-preview" aria-label="Preview">
            <span className="source-manager-heading">Preview ({styleInfo(style).styleName}):</span>
            <div className="source-manager-preview-box">
              {preview ? (
                <>
                  <p>
                    <span className="source-manager-preview-label">Citation:</span> {preview.citation}
                  </p>
                  <p>
                    <span className="source-manager-preview-label">Bibliography Entry:</span>
                  </p>
                  <p className="source-manager-preview-entry">
                    {preview.label ? `${preview.label} ` : ""}
                    {preview.parts.map((part, index) =>
                      part.italic ? <em key={index}>{part.text}</em> : <span key={index}>{part.text}</span>,
                    )}
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="word-dialog-actions">
          <span className="flex-1" />
          <button type="button" className="dialog-btn is-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </DialogFrame>
      {editing ? (
        <SourceEditor
          title={editing === "new" ? "Create Source" : "Edit Source"}
          source={editing === "new" ? undefined : editing}
          level={90}
          taken={[...current, ...master]
            .map((item) => item.tag)
            .filter((tag) => editing === "new" || tag !== editing.tag)}
          onClose={() => setEditing(null)}
          onSave={(source) => {
            if (editing === "new") {
              // A new source goes into both lists, as in Word.
              useBibliography.getState().putSource(source)
              updateMaster(putMasterSource(source))
              dirty()
            } else {
              if (current.some((item) => item.tag === editing.tag)) {
                useBibliography.getState().putSource(source, editing.tag)
                dirty()
              }
              if (master.some((item) => item.tag === editing.tag)) {
                updateMaster(putMasterSource(source, editing.tag))
              }
            }
            setSelected({ list: selected?.list ?? "current", tag: source.tag })
            setEditing(null)
          }}
        />
      ) : null}
    </>
  )
}

function previewOf(source: BibSource, style: (typeof BIB_STYLES)[number]["id"]) {
  const context = citationContext([source], style, [source.tag])
  const [entry] = bibliographyEntries([source], style, [source.tag])
  return { citation: formatCitation({ tags: [source.tag] }, context), label: entry?.label, parts: entry?.parts ?? [] }
}

// --- Create Source / Edit Source ---------------------------------------------------------------------------------

function SourceEditor({
  title,
  source,
  taken,
  level = 85,
  onClose,
  onSave,
}: {
  title: string
  source?: BibSource
  taken: string[]
  level?: number
  onClose: () => void
  onSave: (source: BibSource) => void
}) {
  const [type, setType] = useState<SourceType>(source?.type || "Book")
  const [names, setNames] = useState<Partial<Record<NameRole, NameList>>>(() => structuredClone(source?.names ?? {}))
  const [fields, setFields] = useState<Record<string, string>>(() => ({ ...(source?.fields ?? {}) }))
  const [typed, setTyped] = useState<Partial<Record<NameRole, string>>>({})
  const [all, setAll] = useState(false)
  const [tag, setTag] = useState(source?.tag ?? "")
  const [tagTouched, setTagTouched] = useState(Boolean(source?.tag) && !isPlaceholder(source!))
  const [focused, setFocused] = useState<string>("")
  const [naming, setNaming] = useState<NameRole | null>(null)
  const shown = sourceFields(type, all)
  const draft = (): BibSource => {
    const out: Partial<Record<NameRole, NameList>> = {}
    for (const [role, list] of Object.entries(names) as [NameRole, NameList][]) {
      const text = typed[role]
      const next =
        text === undefined ? list : list.corporate !== undefined ? { people: [], corporate: text } : parseNames(text)
      if (next.corporate || next.people.length > 0) {
        out[role] = next
      }
    }
    for (const [role, text] of Object.entries(typed) as [NameRole, string][]) {
      if (!(role in names) && text.trim()) {
        out[role] = parseNames(text)
      }
    }
    const cleanFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim()))
    return { ...(source ?? {}), tag: tag.trim(), type, names: out, fields: cleanFields }
  }
  const autoTag = tagTouched ? tag : makeTag(draft(), taken)
  const tagTaken = taken.some((item) => item.toLowerCase() === autoTag.trim().toLowerCase())
  const invalidTag = !autoTag.trim() || /\s/.test(autoTag.trim()) || tagTaken
  const example = shown.find((field) => field.key === focused)?.example
  const nameValue = (role: NameRole) => typed[role] ?? namesText(names[role])
  const corporate = names.Author?.corporate !== undefined
  return (
    <>
      <DialogFrame
        title={title}
        width={all ? 720 : 520}
        level={level}
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault()
          if (!invalidTag) {
            onSave({ ...draft(), tag: autoTag.trim() })
          }
        }}
      >
        <div className="source-editor">
          <div className="source-editor-type">
            <Label htmlFor="source-type" text="Type of Source" letter="S" />
            <select id="source-type" value={type} onChange={(event) => setType(event.target.value as SourceType)}>
              {SOURCE_TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <p className="source-editor-caption">
            Bibliography Fields for {styleInfo(useBibliography.getState().style).styleName}
          </p>
          <div
            className={`source-editor-fields${all ? " is-two-columns" : ""}`}
            // Two columns read down, then across, as Word's list of fields does.
            style={all ? { gridTemplateRows: `repeat(${Math.ceil(shown.length / 2)}, auto)` } : undefined}
          >
            {shown.map((field) => {
              const id = `source-field-${field.key}`
              if (field.name) {
                const role = field.key as NameRole
                const isCorporate = role === "Author" && corporate
                return (
                  <div key={field.key} className="source-editor-row">
                    <label htmlFor={id}>{isCorporate ? "Corporate Author" : field.label}</label>
                    <div className="source-editor-name">
                      <input
                        id={id}
                        className="dialog-input"
                        value={nameValue(role)}
                        onFocus={() => setFocused(field.key)}
                        onChange={(event) => setTyped((current) => ({ ...current, [role]: event.target.value }))}
                      />
                      {isCorporate ? null : (
                        <button type="button" className="dialog-btn" onClick={() => setNaming(role)}>
                          Edit
                        </button>
                      )}
                    </div>
                    {role === "Author" ? (
                      <span className="source-editor-corporate">
                        <Check
                          id="source-corporate"
                          text="Corporate Author"
                          letter="o"
                          checked={corporate}
                          onChange={(checked) => {
                            const text = nameValue("Author")
                            setNames((current) => ({
                              ...current,
                              Author: checked ? { people: [], corporate: text } : parseNames(text),
                            }))
                            setTyped((current) => ({ ...current, Author: text }))
                          }}
                        />
                      </span>
                    ) : null}
                  </div>
                )
              }
              return (
                <div key={field.key} className="source-editor-row">
                  <label htmlFor={id}>{field.label}</label>
                  <input
                    id={id}
                    className="dialog-input"
                    value={fields[field.key] ?? ""}
                    onFocus={() => setFocused(field.key)}
                    onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                </div>
              )
            })}
          </div>
          <div className="source-editor-foot">
            <Check id="source-all" text="Show All Bibliography Fields" letter="A" checked={all} onChange={setAll} />
            <span className="source-editor-example">{example ? `Example: ${example}` : ""}</span>
          </div>
          <div className="source-editor-tag">
            <Label htmlFor="source-tag" text="Tag name" letter="T" />
            <input
              id="source-tag"
              className="dialog-input"
              value={autoTag}
              aria-invalid={invalidTag}
              onChange={(event) => {
                setTagTouched(true)
                setTag(event.target.value.replace(/\s/g, ""))
              }}
            />
            <span className="source-editor-warning" role="status">
              {tagTaken ? "This tag is already used." : ""}
            </span>
          </div>
        </div>
        <DialogButtons submit okDisabled={invalidTag} onCancel={onClose} />
      </DialogFrame>
      {naming ? (
        <EditNameDialog
          role={naming}
          names={typed[naming] !== undefined ? parseNames(typed[naming]!).people : (names[naming]?.people ?? [])}
          level={level + 5}
          onClose={() => setNaming(null)}
          onSave={(people) => {
            setNames((current) => ({ ...current, [naming]: { people } }))
            setTyped((current) => {
              const next = { ...current }
              delete next[naming]
              return next
            })
            setNaming(null)
          }}
        />
      ) : null}
    </>
  )
}

// --- Edit Name ---------------------------------------------------------------------------------------------------

function EditNameDialog({
  role,
  names,
  level,
  onClose,
  onSave,
}: {
  role: NameRole
  names: Person[]
  level: number
  onClose: () => void
  onSave: (people: Person[]) => void
}) {
  const [people, setPeople] = useState<Person[]>(names)
  const [draft, setDraft] = useState<Person>({ last: "", first: "", middle: "" })
  const [selected, setSelected] = useState(-1)
  const label = (person: Person) =>
    [person.last, [person.first, person.middle].filter(Boolean).join(" ")].filter(Boolean).join(", ")
  const move = (by: number) => {
    const to = selected + by
    if (selected < 0 || to < 0 || to >= people.length) {
      return
    }
    const next = [...people]
    ;[next[selected], next[to]] = [next[to]!, next[selected]!]
    setPeople(next)
    setSelected(to)
  }
  const add = () => {
    if (!draft.last.trim() && !draft.first.trim()) {
      return
    }
    setPeople((current) => [
      ...current,
      { last: draft.last.trim(), first: draft.first.trim(), middle: draft.middle.trim() },
    ])
    setDraft({ last: "", first: "", middle: "" })
  }
  return (
    <DialogFrame
      title={`Edit Name`}
      width={420}
      level={level}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const pending = draft.last.trim() || draft.first.trim() ? [{ ...draft }] : []
        onSave([...people, ...pending])
      }}
    >
      <div className="edit-name">
        <p className="source-manager-heading">Add name ({role === "BookAuthor" ? "Book Author" : role})</p>
        <div className="edit-name-grid">
          {(
            [
              ["last", "Last:", "L"],
              ["first", "First:", "F"],
              ["middle", "Middle:", "M"],
            ] as const
          ).map(([key, text, letter]) => (
            <div key={key} className="contents">
              <Label htmlFor={`name-${key}`} text={text} letter={letter} />
              <input
                id={`name-${key}`}
                className="dialog-input"
                value={draft[key]}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (draft.last.trim() || draft.first.trim())) {
                    event.preventDefault()
                    add()
                  }
                }}
              />
            </div>
          ))}
        </div>
        <div className="edit-name-list">
          <span className="source-manager-heading">Names</span>
          <div className="edit-name-body">
            <ul role="listbox" aria-label="Names" tabIndex={0}>
              {people.map((person, index) => (
                <li key={index} role="option" aria-selected={index === selected} onClick={() => setSelected(index)}>
                  {label(person)}
                </li>
              ))}
            </ul>
            <div className="edit-name-actions">
              <button
                type="button"
                className="dialog-btn"
                disabled={!draft.last.trim() && !draft.first.trim()}
                onClick={add}
              >
                Add
              </button>
              <button type="button" className="dialog-btn" disabled={selected <= 0} onClick={() => move(-1)}>
                Up
              </button>
              <button
                type="button"
                className="dialog-btn"
                disabled={selected < 0 || selected >= people.length - 1}
                onClick={() => move(1)}
              >
                Down
              </button>
              <button
                type="button"
                className="dialog-btn"
                disabled={selected < 0}
                onClick={() => {
                  setPeople((current) => current.filter((_, index) => index !== selected))
                  setSelected(-1)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

// --- Placeholder Name and Edit Citation --------------------------------------------------------------------------

function PlaceholderDialog({
  taken,
  onClose,
  onSave,
}: {
  taken: string[]
  onClose: () => void
  onSave: (tag: string) => void
}) {
  const [tag, setTag] = useState(() => placeholderTag(taken))
  const clean = tag.trim()
  return (
    <DialogFrame
      title="Placeholder Name"
      width={340}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        if (clean) {
          onSave(clean)
        }
      }}
    >
      <div className="footnote-dialog-grid">
        <Label htmlFor="placeholder-name" text="Placeholder name:" letter="P" />
        <input
          id="placeholder-name"
          className="dialog-input"
          value={tag}
          autoFocus
          onChange={(event) => setTag(event.target.value.replace(/\s/g, ""))}
        />
      </div>
      <DialogButtons submit okDisabled={!clean} onCancel={onClose} />
    </DialogFrame>
  )
}

function EditCitationDialog({
  at,
  onClose,
  onSave,
}: {
  at: CitationAt
  onClose: () => void
  onSave: (changes: Partial<Citation>) => void
}) {
  const [pages, setPages] = useState(at.citation.pages ?? "")
  const [noAuthor, setNoAuthor] = useState(Boolean(at.citation.noAuthor))
  const [noYear, setNoYear] = useState(Boolean(at.citation.noYear))
  const [noTitle, setNoTitle] = useState(Boolean(at.citation.noTitle))
  return (
    <DialogFrame
      title="Edit Citation"
      width={340}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ pages: pages.trim() || undefined, noAuthor, noYear, noTitle })
      }}
    >
      <div className="edit-citation">
        <p className="source-manager-heading">Add</p>
        <div className="footnote-dialog-grid">
          <Label htmlFor="citation-pages" text="Pages:" letter="P" />
          <input
            id="citation-pages"
            className="dialog-input"
            value={pages}
            onChange={(event) => setPages(event.target.value)}
          />
        </div>
        <p className="source-manager-heading">Suppress</p>
        <div className="edit-citation-checks">
          <Check id="citation-author" text="Author" letter="A" checked={noAuthor} onChange={setNoAuthor} />
          <Check id="citation-year" text="Year" letter="Y" checked={noYear} onChange={setNoYear} />
          <Check id="citation-title" text="Title" letter="T" checked={noTitle} onChange={setNoTitle} />
        </div>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
