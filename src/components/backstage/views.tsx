import { AddInsManager } from "@/components/addins"
import { openCustomize } from "@/components/customize-dialog"
import { ShortcutSettings } from "@/components/backstage/shortcut-settings"
import { createStepLock, pageForKey, wheelStep } from "@/components/backstage/preview-steps"
import { isTauriRuntime } from "@/lib/platform"
import { TemplateCard } from "@/components/backstage/template-card"
import { RecentTable, greetingForNow } from "@/components/backstage/recent-table"
import { requestPageSetup } from "@/components/design-dialogs"
import { useBackstage } from "@/document/backstage"
import {
  applyTemplateDocument,
  closeDocument,
  exportDocument,
  openDocument,
  openRecentDocument,
  optimizeDocumentSize,
  printDocument,
  saveDocument,
  emailDocument,
  saveDocumentAs,
  saveDocumentAsFormat,
  type ExportFormat,
} from "@/document/commands"
import { documentName, useDocumentStore } from "@/document/store"
import { HOME_FEATURED_IDS, SUGGESTED_SEARCHES, filterTemplates, templatesByIds } from "@/document/templates"
import { THEME_OPTIONS } from "@/document/theme"
import { defaultStyles, resetDefaultStyles, savedDefaultIds } from "@/document/styles"
import { loadPageSetupDefault, resetPageSetupDefault } from "@/document/design-format"
import { useViewStore } from "@/document/view"
import { placeCopy, printCopy } from "@/document/print-copy"
import { defaultPictureWrap, setDefaultPictureWrap } from "@/document/object-layout"
import { WRAP_CHOICES } from "@/editor/objects"
import { useBodyEditor } from "@/editor/document-editor"
import { useEditorState } from "@tiptap/react"
import { MARGIN_PRESETS, marginPresetId, pageMetrics } from "@/document/page-setup"
import {
  DRAFT_FONT_NAMES,
  DRAFT_FONT_SIZES,
  FIELD_SHADING_CHOICES,
  PASTE_CHOICES,
  RECOVERY_CHOICES,
  useEditingOptions,
} from "@/document/editing-options"
import { useUserSettings } from "@/document/user-settings"
import { FileDown, FileText, FolderOpen, Monitor, Printer } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

export function HomeView() {
  const setTab = useBackstage((state) => state.setTab)
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  const featured = templatesByIds(HOME_FEATURED_IDS)

  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">{greetingForNow()}</h1>
      <section className="backstage-section">
        <div className="backstage-section-head">
          <h2 className="backstage-heading">New</h2>
          <button type="button" className="backstage-link" onClick={() => setTab("new")}>
            More templates
          </button>
        </div>
        <div className="backstage-template-row">
          {featured.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onSelect={() => {
                void applyTemplateDocument(template.html).then((opened) => {
                  if (opened) {
                    closeBackstage()
                  }
                })
              }}
            />
          ))}
        </div>
      </section>
      <section className="backstage-section">
        <div className="backstage-section-head">
          <h2 className="backstage-heading">Recent</h2>
          <button type="button" className="backstage-link" onClick={() => setTab("open")}>
            More documents
          </button>
        </div>
        <RecentTable />
      </section>
    </div>
  )
}

export function NewView() {
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
  const templates = useMemo(() => filterTemplates(category, query), [category, query])

  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">New</h1>
      <div className="backstage-new-toolbar">
        <input
          className="backstage-search is-wide"
          value={query}
          placeholder="Search for online templates"
          aria-label="Search templates"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="backstage-suggested">
          <span className="backstage-suggested-label">Suggested searches:</span>
          <div className="backstage-pills">
            {SUGGESTED_SEARCHES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={category === item.id ? "is-active" : ""}
                onClick={() => setCategory(category === item.id ? "all" : item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="backstage-template-grid">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={() => {
              void applyTemplateDocument(template.html).then((opened) => {
                if (opened) {
                  closeBackstage()
                }
              })
            }}
          />
        ))}
      </div>
      <div className="backstage-empty-search-note">
        <p>Not finding what you’re looking for?</p>
        <p>Use the search box at the top to find more templates.</p>
      </div>
    </div>
  )
}

function PlacesSidebar({
  active,
  onSelect,
  onBrowse,
}: {
  active: string
  onSelect: (id: string) => void
  onBrowse: () => void
}) {
  const places = [
    { id: "recent", label: "Recent", icon: <FileText className="size-4" /> },
    { id: "this-pc", label: "This PC", icon: <Monitor className="size-4" />, group: "Other locations" },
    { id: "browse", label: "Browse", icon: <FolderOpen className="size-4" />, group: "Other locations" },
  ]

  let lastGroup: string | undefined

  return (
    <aside className="backstage-card backstage-places">
      <h2 className="backstage-card-title">Places</h2>
      <ul className="backstage-places-list">
        {places.map((place) => {
          const showGroup = place.group && place.group !== lastGroup
          if (place.group) {
            lastGroup = place.group
          }
          return (
            <li key={place.id}>
              {showGroup ? <div className="backstage-places-group">{place.group}</div> : null}
              <button
                type="button"
                className={active === place.id ? "is-active" : ""}
                onClick={() => {
                  onSelect(place.id)
                  if (place.id === "browse" || place.id === "this-pc") {
                    onBrowse()
                  }
                }}
              >
                {place.icon}
                <span>{place.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

export function OpenView() {
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  const recentFiles = useDocumentStore((state) => state.recentFiles)
  const recentFolders = useDocumentStore((state) => state.recentFolders)
  const pinnedFiles = useDocumentStore((state) => state.pinnedFiles)
  const togglePinned = useDocumentStore((state) => state.togglePinned)
  const [listTab, setListTab] = useState<"documents" | "folders">("documents")
  const [place, setPlace] = useState("recent")

  // The picker opens over this screen; cancelling it leaves the user here, picking a file leaves the backstage.
  const browse = () => {
    void openDocument().then((opened) => {
      if (opened) {
        closeBackstage()
      }
    })
  }

  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">Open</h1>
      <div className="backstage-open-layout">
        <PlacesSidebar active={place} onSelect={setPlace} onBrowse={browse} />
        <div className="backstage-open-main">
          <div className="backstage-filter-tabs" role="tablist" aria-label="Open list">
            <button
              type="button"
              role="tab"
              aria-selected={listTab === "documents"}
              className={listTab === "documents" ? "is-active" : ""}
              onClick={() => setListTab("documents")}
            >
              Documents
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listTab === "folders"}
              className={listTab === "folders" ? "is-active" : ""}
              onClick={() => setListTab("folders")}
            >
              Folders
            </button>
          </div>
          <p className="backstage-pin-hint">
            Pin files you want to easily find later. Click the pin icon that appears when you hover over a file.
          </p>
          {listTab === "documents" ? (
            recentFiles.length === 0 ? (
              <p className="backstage-empty">No recent documents yet.</p>
            ) : (
              <div className="backstage-file-sections">
                <OpenFileSection
                  title="Recent"
                  paths={recentFiles}
                  pinnedFiles={pinnedFiles}
                  onOpen={(path) => {
                    openRecentDocument(path)
                    closeBackstage()
                  }}
                  onTogglePin={togglePinned}
                />
              </div>
            )
          ) : recentFolders.length === 0 ? (
            <p className="backstage-empty">Folders appear here after you open or save files.</p>
          ) : (
            <ul className="backstage-simple-list">
              {recentFolders.map((folder) => (
                <li key={folder}>
                  <button type="button" onClick={browse}>
                    <FolderOpen className="size-4 shrink-0 opacity-70" />
                    <span className="truncate">{folder}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="backstage-secondary-btn backstage-recover-btn" onClick={browse}>
            Recover Unsaved Documents
          </button>
        </div>
      </div>
    </div>
  )
}

function OpenFileSection({
  title,
  paths,
  pinnedFiles,
  onOpen,
  onTogglePin,
}: {
  title: string
  paths: string[]
  pinnedFiles: string[]
  onOpen: (path: string) => void
  onTogglePin: (path: string) => void
}) {
  return (
    <section className="backstage-card">
      <h2 className="backstage-card-title">{title}</h2>
      <div className="backstage-table" role="table">
        <div className="backstage-table-head is-open" role="row">
          <span role="columnheader" className="backstage-table-pin" />
          <span role="columnheader">Name</span>
          <span role="columnheader">Date modified</span>
        </div>
        {paths.map((path) => {
          const pinned = pinnedFiles.includes(path)
          return (
            <div key={path} className="backstage-table-row is-open" role="row">
              <button
                type="button"
                className="backstage-table-pin"
                title={pinned ? "Unpin" : "Pin"}
                aria-label={pinned ? "Unpin" : "Pin"}
                onClick={() => onTogglePin(path)}
              >
                {pinned ? "★" : "☆"}
              </button>
              <button type="button" className="backstage-table-name" onClick={() => onOpen(path)}>
                <FileText className="size-4 shrink-0 opacity-70" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{documentName(path)}</span>
                  <span className="block truncate text-[11px] opacity-60">{path}</span>
                </span>
              </button>
              <span className="backstage-table-date">—</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function InfoView() {
  const path = useDocumentStore((state) => state.currentFilePath)
  const html = useDocumentStore((state) => state.documentHTML)
  const props = useDocumentStore((state) => state.documentProps)
  const isDirty = useDocumentStore((state) => state.isDirty)
  const readOnly = useDocumentStore((state) => state.readOnly)
  const setDocumentProps = useDocumentStore((state) => state.setDocumentProps)
  const setReadOnly = useDocumentStore((state) => state.setReadOnly)
  const editor = useBodyEditor()
  const [showAll, setShowAll] = useState(false)
  const stats = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return { words: 0, characters: 0, pages: 1 }
      }
      const text = current.state.doc.textBetween(0, current.state.doc.content.size, " ")
      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      return {
        words,
        characters: text.replace(/\s/g, "").length,
        pages: current.storage.pagination?.pageCount ?? 1,
      }
    },
  })

  const sizeLabel = path ? `${Math.max(1, Math.round(new Blob([html]).size / 1024))} KB` : "Not saved yet"
  const editTime = formatDuration(props.totalEditingMs)

  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">Info</h1>
      <div className="backstage-info-layout">
        <div className="backstage-info-main">
          <div className="backstage-card">
            <h2 className="backstage-doc-title">{props.title || documentName(path)}</h2>
            <p className="backstage-muted truncate" title={path ?? undefined}>
              {path ?? "Not saved yet — this document only exists in memory."}
            </p>
          </div>
          <div className="backstage-action-cards">
            <button type="button" className="backstage-action-card" onClick={() => setReadOnly(!readOnly)}>
              <strong>Protect Document</strong>
              <em>Control what types of changes people can make to this document.</em>
              <span>{readOnly ? "Allow Editing" : "Mark as Final"}</span>
            </button>
            <button
              type="button"
              className="backstage-action-card"
              onClick={() => {
                if (!editor) {
                  return
                }
                const { from, to, empty } = editor.state.selection
                const chain = editor.chain().focus()
                if (empty) {
                  chain.selectAll()
                } else {
                  chain.setTextSelection({ from, to })
                }
                chain.unsetAllMarks().run()
              }}
            >
              <strong>Inspect Document</strong>
              <em>Check for Issues</em>
              <span>
                Before publishing this file, be aware that it contains:
                <br />
                Document properties and author’s name
                <br />
                Custom XML data
              </span>
            </button>
            <button type="button" className="backstage-action-card" disabled>
              <strong>Manage Document</strong>
              <em>Manage Document</em>
              <span>{isDirty ? "There are unsaved changes." : "There are no unsaved changes."}</span>
            </button>
          </div>
        </div>
        <aside className="backstage-card backstage-props">
          <h2 className="backstage-card-title">Properties</h2>
          <p className="backstage-muted mb-2 text-[12px]">
            These fields are written into the file so Word, LibreOffice, and other editors can show them.
          </p>
          <PropRow label="Size" value={sizeLabel} />
          <PropRow label="Pages" value={String(stats?.pages ?? 1)} />
          <PropRow label="Words" value={String(stats?.words ?? 0)} />
          <PropRow label="Total editing time" value={editTime} />
          <label className="backstage-prop-edit">
            <span>Title</span>
            <input
              value={props.title}
              placeholder="Add a title"
              onChange={(event) => setDocumentProps({ title: event.target.value })}
            />
          </label>
          <label className="backstage-prop-edit">
            <span>Subject</span>
            <input
              value={props.subject}
              placeholder="Add a subject"
              onChange={(event) => setDocumentProps({ subject: event.target.value })}
            />
          </label>
          <label className="backstage-prop-edit">
            <span>Tags</span>
            <input
              value={props.tags}
              placeholder="Add tags (keywords)"
              onChange={(event) => setDocumentProps({ tags: event.target.value })}
            />
          </label>
          <label className="backstage-prop-edit">
            <span>Category</span>
            <input
              value={props.category}
              placeholder="Add a category"
              onChange={(event) => setDocumentProps({ category: event.target.value })}
            />
          </label>
          <label className="backstage-prop-edit">
            <span>Comments</span>
            <input
              value={props.comments}
              placeholder="Add comments"
              onChange={(event) => setDocumentProps({ comments: event.target.value })}
            />
          </label>
          <label className="backstage-prop-edit">
            <span>Author</span>
            <input
              value={props.author}
              placeholder="Add an author"
              onChange={(event) => setDocumentProps({ author: event.target.value })}
            />
          </label>
          <button type="button" className="backstage-link" onClick={() => useUserSettings.getState().reopen()}>
            Run setup again…
          </button>
          <button type="button" className="backstage-link" onClick={() => void optimizeDocumentSize()}>
            Optimize size…
          </button>
          <label className="backstage-prop-edit">
            <span>Company</span>
            <input
              value={props.company}
              placeholder="Add a company"
              onChange={(event) => setDocumentProps({ company: event.target.value })}
            />
          </label>
          {showAll ? (
            <>
              <h3 className="backstage-props-sub">Related Dates</h3>
              <PropRow label="Last Modified" value={path ? "When last saved" : "Not saved yet"} />
              <PropRow label="Created" value={formatStamp(props.createdAt)} />
              <PropRow label="Last Printed" value={props.lastPrintedAt ? formatStamp(props.lastPrintedAt) : "—"} />
              <h3 className="backstage-props-sub">Related People</h3>
              <PropRow label="Last Modified By" value={path ? props.author || "—" : "Not saved yet"} />
              <PropRow label="Characters" value={String(stats?.characters ?? 0)} />
            </>
          ) : null}
          <button type="button" className="backstage-link" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Hide Properties" : "Show All Properties"}
          </button>
        </aside>
      </div>
    </div>
  )
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="backstage-prop-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatStamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "—"
  }
  return date.toLocaleString()
}

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) {
    return "Less than a minute"
  }
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem ? `${hours} hr ${rem} min` : `${hours} hr`
}

export function SaveAsView() {
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  const recentFolders = useDocumentStore((state) => state.recentFolders)
  const path = useDocumentStore((state) => state.currentFilePath)
  const props = useDocumentStore((state) => state.documentProps)
  const [name, setName] = useState(props.title || documentName(path).replace(/\.[^.]+$/, "") || "Document")
  const [format, setFormat] = useState("docx")
  const [place, setPlace] = useState("recent")

  const save = () => {
    void saveDocumentAsFormat(format).then((saved) => {
      if (saved) {
        closeBackstage()
      }
    })
  }

  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">Save As</h1>
      <div className="backstage-open-layout">
        <PlacesSidebar active={place} onSelect={setPlace} onBrowse={save} />
        <div className="backstage-save-layout is-stacked">
          <section className="backstage-card">
            <p className="backstage-pin-hint">Pin folders you want to easily find later.</p>
            <h2 className="backstage-card-title">Recent folders</h2>
            {recentFolders.length === 0 ? (
              <p className="backstage-empty">Browse to choose a folder on this computer.</p>
            ) : (
              <ul className="backstage-simple-list">
                {recentFolders.map((folder) => (
                  <li key={folder}>
                    <button type="button" onClick={save}>
                      <FolderOpen className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{folder.split(/[/\\]/).pop() || folder}</span>
                        <span className="block truncate text-[11px] opacity-60">{folder}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="backstage-card backstage-save-form">
            <label>
              <span>File name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>File format</span>
              <select value={format} onChange={(event) => setFormat(event.target.value)}>
                <option value="docx">Word Document (.docx)</option>
                <option value="odt">OpenDocument Text (.odt)</option>
                <option value="rtf">Rich Text (.rtf)</option>
                <option value="pdf">PDF (.pdf)</option>
                <option value="html">HTML (.html)</option>
                <option value="md">Markdown (.md)</option>
                <option value="txt">Plain Text (.txt)</option>
              </select>
            </label>
            <div className="backstage-save-actions">
              <button type="button" className="backstage-primary-btn" onClick={save}>
                Save
              </button>
              <button type="button" className="backstage-secondary-btn" onClick={save}>
                Browse…
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export function PrintView() {
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  const pageSetup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const html = useDocumentStore((state) => state.documentHTML)
  const editor = useBodyEditor()
  const pages =
    useEditorState({
      editor,
      selector: ({ editor: current }) => current?.storage.pagination?.pageCount ?? 1,
    }) ?? 1
  const [copies, setCopies] = useState(1)
  const [range, setRange] = useState("all")
  const [sides, setSides] = useState("long")
  const [collate, setCollate] = useState("collated")
  const [pagesPerSheet, setPagesPerSheet] = useState("1")
  const [pageIndex, setPageIndex] = useState(0)
  // Null fits the whole page in the preview, as Word's Zoom to Page does; otherwise the page's scale.
  const [zoom, setZoom] = useState<number | null>(null)
  const page = pageMetrics(pageSetup, true)
  const previewRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState({ height: 520, width: 400, high: 400 })

  useLayoutEffect(() => {
    const preview = previewRef.current
    const viewport = viewportRef.current
    if (!preview || !viewport) {
      return
    }
    // The preview takes the height left in the File menu below its top, so the page never runs past the window.
    const measure = () => {
      let scroller: HTMLElement | null = preview.parentElement
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
        scroller = scroller.parentElement
      }
      const frame = scroller ?? document.documentElement
      const top = preview.getBoundingClientRect().top - frame.getBoundingClientRect().top + frame.scrollTop
      const height = Math.max(320, Math.floor(frame.clientHeight - top - 24))
      setRoom((current) =>
        current.height === height && current.width === viewport.clientWidth && current.high === viewport.clientHeight
          ? current
          : { height, width: viewport.clientWidth, high: viewport.clientHeight },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(preview)
    observer.observe(viewport)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  const fit = Math.max(0.05, Math.min((room.width - 16) / page.width, (room.high - 16) / page.height))
  const scale = zoom ?? fit

  // The wheel and the keys turn pages one at a time, as in Word's print preview; Ctrl + wheel zooms.
  const stepLock = useRef(createStepLock())
  const turn = useRef({ pageIndex, pages, scale })
  turn.current = { pageIndex, pages, scale }
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const goTo = (index: number, fromEnd = false) => {
      const { pageIndex: current, pages: count } = turn.current
      const next = Math.max(0, Math.min(count - 1, index))
      if (next === current) {
        return
      }
      setPageIndex(next)
      stepLock.current.stepped()
      requestAnimationFrame(() => {
        viewport.scrollTop = fromEnd ? viewport.scrollHeight : 0
      })
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
        setZoom(Math.max(0.1, Math.min(2, turn.current.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1))))
        return
      }
      const step = wheelStep(event.deltaY, viewport)
      if (step === 0) {
        return
      }
      event.preventDefault()
      if (stepLock.current.allow()) {
        goTo(turn.current.pageIndex + step, step < 0)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, select, textarea, [contenteditable]") || event.ctrlKey || event.metaKey) {
        return
      }
      const next = pageForKey(event.key, turn.current.pageIndex, turn.current.pages)
      if (next === null) {
        return
      }
      event.preventDefault()
      goTo(next)
    }
    viewport.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("keydown", onKey)
    return () => {
      viewport.removeEventListener("wheel", onWheel)
      window.removeEventListener("keydown", onKey)
    }
  }, [])

  const marginLabel = (() => {
    const id = marginPresetId(pageSetup) ?? "custom"
    const preset = MARGIN_PRESETS.find((item) => item.id === id)
    if (!preset) {
      return "Custom"
    }
    return `${preset.label} (Top: ${pageSetup.marginTop} cm Bottom: ${pageSetup.marginBottom} cm…)`
  })()

  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">Print</h1>
      <div className="backstage-print-layout">
        <div className="backstage-card backstage-print-settings">
          <div className="backstage-print-top">
            <button
              type="button"
              className="backstage-primary-btn is-large"
              onClick={() => {
                printDocument()
                closeBackstage()
              }}
            >
              <Printer className="size-4" />
              Print
            </button>
            <label className="backstage-copies">
              <span>Copies</span>
              <input
                type="number"
                min={1}
                max={99}
                value={copies}
                onChange={(event) => setCopies(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
          </div>
          <div className="backstage-print-block">
            <h2 className="backstage-card-title">Printer</h2>
            <button type="button" className="backstage-secondary-btn w-full" onClick={() => printDocument()}>
              System printer… (Ready)
            </button>
            <button type="button" className="backstage-link" onClick={() => printDocument()}>
              Printer Properties
            </button>
          </div>
          <div className="backstage-print-block">
            <h2 className="backstage-card-title">Settings</h2>
            <label>
              <span className="sr-only">Page range</span>
              <select value={range} onChange={(event) => setRange(event.target.value)}>
                <option value="all">Print All Pages — The whole thing</option>
                <option value="current">Print Current Page</option>
                <option value="custom">Custom Print</option>
              </select>
            </label>
            <label>
              <span>Pages</span>
              <input type="text" placeholder="e.g. 1-3, 5" disabled={range === "all"} />
            </label>
            <label>
              <span className="sr-only">Sides</span>
              <select value={sides} onChange={(event) => setSides(event.target.value)}>
                <option value="long">Print on Both Sides — Flip pages on long edge</option>
                <option value="short">Print on Both Sides — Flip pages on short edge</option>
                <option value="one">Print One Sided</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Collate</span>
              <select value={collate} onChange={(event) => setCollate(event.target.value)}>
                <option value="collated">Collated — 1,2,3 1,2,3 1,2,3</option>
                <option value="uncollated">Uncollated — 1,1,1 2,2,2 3,3,3</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Orientation</span>
              <select
                value={pageSetup.orientation}
                onChange={(event) =>
                  setPageSetup({
                    ...pageSetup,
                    orientation: event.target.value as typeof pageSetup.orientation,
                  })
                }
              >
                <option value="portrait">Portrait Orientation</option>
                <option value="landscape">Landscape Orientation</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Paper size</span>
              <select
                value={pageSetup.paper}
                onChange={(event) =>
                  setPageSetup({ ...pageSetup, paper: event.target.value as typeof pageSetup.paper })
                }
              >
                <option value="a4">A4 — 21 cm x 29,7 cm</option>
                <option value="letter">Letter — 21,59 cm x 27,94 cm</option>
                <option value="legal">Legal — 21,59 cm x 35,56 cm</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Margins</span>
              <select
                value={marginPresetId(pageSetup) ?? "custom"}
                onChange={(event) => {
                  const preset = MARGIN_PRESETS.find((item) => item.id === event.target.value)
                  if (!preset) {
                    return
                  }
                  setPageSetup({
                    ...pageSetup,
                    marginTop: preset.top,
                    marginRight: preset.right,
                    marginBottom: preset.bottom,
                    marginLeft: preset.left,
                  })
                }}
              >
                {MARGIN_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.id === (marginPresetId(pageSetup) ?? "custom") ? marginLabel : preset.label}
                  </option>
                ))}
                <option value="custom">Custom Margins</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Pages per sheet</span>
              <select value={pagesPerSheet} onChange={(event) => setPagesPerSheet(event.target.value)}>
                <option value="1">1 Page Per Sheet</option>
                <option value="2">2 Pages Per Sheet</option>
                <option value="4">4 Pages Per Sheet</option>
              </select>
            </label>
            <button
              type="button"
              className="backstage-link"
              onClick={() => {
                closeBackstage()
                requestAnimationFrame(() => requestPageSetup())
              }}
            >
              Page Setup
            </button>
          </div>
        </div>
        <div ref={previewRef} className="backstage-print-preview" style={{ height: room.height }}>
          <div ref={viewportRef} className="backstage-preview-viewport">
            <div className="backstage-preview-sheet" style={{ width: page.width * scale, height: page.height * scale }}>
              <PreviewPage page={page} pageIndex={pageIndex} scale={scale} html={html} pageSetup={pageSetup} />
            </div>
          </div>
          <div className="backstage-preview-nav">
            <button
              type="button"
              aria-label="Previous page"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
            >
              ‹
            </button>
            <span>
              {Math.min(pageIndex + 1, pages)} of {pages}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={pageIndex >= pages - 1}
              onClick={() => setPageIndex((value) => Math.min(pages - 1, value + 1))}
            >
              ›
            </button>
            <label className="backstage-preview-zoom">
              Zoom
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.05}
                value={scale}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <span>{Math.round(scale * 100)}%</span>
            </label>
            <button
              type="button"
              className="backstage-preview-fit"
              aria-pressed={zoom === null}
              title="Zoom to Page"
              onClick={() => setZoom(null)}
            >
              Zoom to Page
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One page of the print preview, copied from the pages the editor has laid out, so it shows exactly what the
 * editor shows (page breaks, section breaks, headers, footers, page numbers, watermark, borders) without the
 * editing marks. Before the editor has drawn pages (Web Layout, Read Mode) it falls back to the document's text.
 */
function PreviewPage({
  page,
  pageIndex,
  scale,
  html,
  pageSetup,
}: {
  page: ReturnType<typeof pageMetrics>
  pageIndex: number
  scale: number
  html: string
  pageSetup: unknown
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cloneRef = useRef<HTMLElement | null>(null)
  const [live, setLive] = useState(true)

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    // After the editor has paginated the latest change.
    const frame = window.requestAnimationFrame(() => {
      const source = document.querySelector<HTMLElement>("#document-scroll .page-canvas")
      const clone = source ? printCopy(source) : null
      if (!clone) {
        cloneRef.current = null
        host.replaceChildren()
        setLive(false)
        return
      }
      host.replaceChildren(clone)
      cloneRef.current = clone
      placeCopy(clone, pageIndex)
      setLive(true)
    })
    return () => window.cancelAnimationFrame(frame)
    // pageIndex is applied by the effect below, without copying the pages again.
  }, [html, pageSetup])

  useEffect(() => {
    if (cloneRef.current) {
      placeCopy(cloneRef.current, pageIndex)
    }
  }, [pageIndex])

  return (
    <div
      data-keep-light
      className="backstage-preview-page"
      style={{ width: page.width, height: page.height, transform: `scale(${scale})` }}
    >
      <div ref={hostRef} className="backstage-preview-live" />
      {live ? null : (
        <div
          style={{
            height: "100%",
            padding: `${page.marginTop}px ${page.marginRight}px ${page.marginBottom}px ${page.marginLeft}px`,
          }}
        >
          <div className="backstage-preview-clip" style={{ height: page.contentHeight }}>
            <div
              style={{ transform: `translateY(${-pageIndex * page.contentHeight}px)` }}
              dangerouslySetInnerHTML={{ __html: html || "<p></p>" }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function ExportView() {
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  const setTab = useBackstage((state) => state.setTab)
  const [mode, setMode] = useState<"pdf" | "change">("pdf")
  const [format, setFormat] = useState<ExportFormat>("docx")
  const changeTypes: { id: ExportFormat; title: string; detail: string }[] = [
    { id: "docx", title: "Word Document", detail: "Export a native .docx with page setup and formatting." },
    { id: "rtf", title: "Rich Text Format", detail: "Export an .rtf copy via Pandoc for wide compatibility." },
    { id: "odt", title: "OpenDocument Text", detail: "Export an .odt copy for LibreOffice and similar apps." },
    { id: "md", title: "Markdown", detail: "Save a lightweight .md copy for notes and code repos." },
    { id: "html", title: "HTML", detail: "Publish a web-friendly HTML version." },
    { id: "txt", title: "Plain Text", detail: "Export text only without formatting." },
  ]

  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">Export</h1>
      <div className="backstage-export-layout">
        <div className="backstage-export-nav">
          <button type="button" className={mode === "pdf" ? "is-active" : ""} onClick={() => setMode("pdf")}>
            <FileDown className="size-4" />
            <span>
              <strong>Create a PDF/XPS Document</strong>
              <em>Preserves layout, formatting, fonts, and images</em>
            </span>
          </button>
          <button type="button" className={mode === "change" ? "is-active" : ""} onClick={() => setMode("change")}>
            <FileText className="size-4" />
            <span>
              <strong>Change File Type</strong>
              <em>Save a copy in another document format</em>
            </span>
          </button>
        </div>
        <div className="backstage-card backstage-export-card">
          {mode === "pdf" ? (
            <>
              <h2 className="backstage-card-title">Create a PDF/XPS Document</h2>
              <ul className="backstage-export-bullets">
                <li>Preserves layout, formatting, fonts, and images</li>
                <li>Content can’t be easily changed</li>
                <li>Free viewers are available on the web</li>
              </ul>
              <button
                type="button"
                className="backstage-primary-btn"
                onClick={() => {
                  exportDocument("pdf")
                  closeBackstage()
                }}
              >
                Create PDF/XPS
              </button>
            </>
          ) : (
            <>
              <h2 className="backstage-card-title">Change File Type</h2>
              <div className="backstage-export-types">
                {changeTypes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={format === item.id ? "is-active" : ""}
                    onClick={() => setFormat(item.id)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="backstage-primary-btn"
                onClick={() => {
                  exportDocument(format)
                  closeBackstage()
                }}
              >
                Save As {format.toUpperCase()}
              </button>
              <button type="button" className="backstage-link" onClick={() => setTab("save-as")}>
                Open Save As…
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StubView({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">{title}</h1>
      <div className="backstage-card backstage-stub">
        <p className="backstage-muted">{detail}</p>
      </div>
    </div>
  )
}

export function AddInsView() {
  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">Get Add-ins</h1>
      <div className="backstage-card">
        <AddInsManager />
      </div>
    </div>
  )
}

export function HistoryView() {
  return <StubView title="History" detail="Version history will appear here in a future update." />
}

export function ShareView() {
  const closeBackstage = useBackstage((state) => state.closeBackstage)

  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">Share</h1>
      <div className="backstage-card">
        <p className="backstage-muted mb-3">
          Invite links are not wired yet. Send a copy of this document to share it with others.
        </p>
        <button
          type="button"
          className="backstage-primary-btn"
          onClick={() => {
            closeBackstage()
            void saveDocumentAs()
          }}
        >
          Send a copy
        </button>
      </div>
      <div className="backstage-card">
        <p className="backstage-muted mb-3">
          Open your mail program with this document as a Word attachment (.docx).
          {isTauriRuntime() ? "" : " In the browser the message opens without it; attach the saved file yourself."}
        </p>
        <button
          type="button"
          className="backstage-primary-btn"
          onClick={() => {
            closeBackstage()
            void emailDocument()
          }}
        >
          Email as Attachment
        </button>
      </div>
    </div>
  )
}

export function TransformView() {
  return <StubView title="Transform" detail="Document transform tools are not available in this build." />
}

export function AccountView() {
  const props = useDocumentStore((state) => state.documentProps)
  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">Account</h1>
      <div className="backstage-card backstage-stub">
        <p>
          Signed in locally as <strong>{props.author || "Guest"}</strong>
        </p>
        <p className="backstage-muted">Cloud accounts are not connected in this build.</p>
      </div>
    </div>
  )
}

export type OptionsPage =
  | "general"
  | "display"
  | "proofing"
  | "save"
  | "language"
  | "accessibility"
  | "advanced"
  | "ribbon"
  | "quick-access"
  | "addins"

/** Word's Options list (22.9): the pages of the Options dialog. */
const OPTION_PAGES: { id: OptionsPage; label: string }[] = [
  { id: "general", label: "General" },
  { id: "display", label: "Display" },
  { id: "proofing", label: "Proofing" },
  { id: "save", label: "Save" },
  { id: "language", label: "Language" },
  { id: "accessibility", label: "Accessibility" },
  { id: "advanced", label: "Advanced" },
  { id: "ribbon", label: "Customize Ribbon" },
  { id: "quick-access", label: "Quick Access Toolbar" },
  { id: "addins", label: "Add-ins" },
]

/** Options Word has that the app cannot honour yet: shown, switched off, with a note, rather than hidden. */
function UnavailableOptions({ items }: { items: string[] }) {
  return (
    <div className="options-unavailable">
      {items.map((label) => (
        <label key={label} className="backstage-check" aria-disabled="true">
          <input type="checkbox" disabled /> {label}
        </label>
      ))}
      <p className="backstage-muted">These are not available in this version yet.</p>
    </div>
  )
}

/** The pages of the Options dialog (22.9). Choices apply as they are made. */
export function OptionsPages({ initialPage = "general" }: { initialPage?: OptionsPage }) {
  const colorMode = useViewStore((state) => state.colorMode)
  const setColorMode = useViewStore((state) => state.setColorMode)
  const themeBackground = useViewStore((state) => state.themeBackground)
  const setThemeBackground = useViewStore((state) => state.setThemeBackground)
  const showRuler = useViewStore((state) => state.showRuler)
  const toggleRuler = useViewStore((state) => state.toggleRuler)
  const showFormattingMarks = useViewStore((state) => state.showFormattingMarks)
  const toggleFormattingMarks = useViewStore((state) => state.toggleFormattingMarks)
  const autoSave = useViewStore((state) => state.autoSave)
  const toggleAutoSave = useViewStore((state) => state.toggleAutoSave)
  const zoom = useViewStore((state) => state.zoom)
  const setZoom = useViewStore((state) => state.setZoom)
  const props = useDocumentStore((state) => state.documentProps)
  const setDocumentProps = useDocumentStore((state) => state.setDocumentProps)
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const setRibbonLayout = useViewStore((state) => state.setRibbonLayout)
  const spellCheck = useViewStore((state) => state.spellCheck)
  const toggleSpellCheck = useViewStore((state) => state.toggleSpellCheck)
  const settings = {
    locale: useUserSettings((state) => state.locale),
    dateFormat: useUserSettings((state) => state.dateFormat),
  }
  const [page, setPage] = useState<OptionsPage>(initialPage)
  const editing = useEditingOptions()
  const miniToolbar = editing.miniToolbar

  return (
    <div className="options-layout">
      <nav className="options-nav" aria-label="Options pages">
        {OPTION_PAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={page === item.id ? "page" : undefined}
            onClick={() => setPage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="backstage-options-grid">
        {page === "general" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">General & Theme</h2>
            <label className="backstage-check">
              <input
                type="checkbox"
                checked={miniToolbar}
                onChange={(event) => useEditingOptions.getState().set({ miniToolbar: event.target.checked })}
              />{" "}
              Show Mini Toolbar on selection
            </label>
            <label className="backstage-check">
              <input
                type="checkbox"
                checked={editing.livePreview}
                onChange={(event) => editing.set({ livePreview: event.target.checked })}
              />{" "}
              Enable Live Preview
            </label>
            <label className="backstage-prop-edit">
              <span>Author name</span>
              <input value={props.author} onChange={(event) => setDocumentProps({ author: event.target.value })} />
            </label>
            <fieldset className="backstage-fieldset">
              <legend>Theme mode</legend>
              <label>
                <input type="radio" checked={colorMode === "light"} onChange={() => setColorMode("light")} /> Light
              </label>
              <label>
                <input type="radio" checked={colorMode === "dark"} onChange={() => setColorMode("dark")} /> Dark
              </label>
            </fieldset>
            <div className="backstage-theme-swatches">
              {THEME_OPTIONS.map((theme) => (
                <button
                  key={theme.name}
                  type="button"
                  title={theme.name}
                  className={themeBackground === theme.value ? "is-active" : ""}
                  style={{ background: theme.value }}
                  onClick={() => setThemeBackground(theme.value)}
                />
              ))}
            </div>
          </section>
        )}
        {page === "display" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">Display & Rulers</h2>
            <label className="backstage-check">
              <input type="checkbox" checked={showRuler} onChange={toggleRuler} /> Show ruler
            </label>
            <label className="backstage-check">
              <input type="checkbox" checked={showFormattingMarks} onChange={toggleFormattingMarks} /> Show formatting
              marks (¶)
            </label>
            <fieldset className="backstage-fieldset">
              <legend>Always show these formatting marks on the screen</legend>
              {(
                [
                  ["marksTabs", "Tab characters"],
                  ["marksSpaces", "Spaces"],
                  ["marksParagraph", "Paragraph marks"],
                  ["marksHidden", "Hidden text"],
                  ["marksHyphens", "Optional hyphens"],
                ] as const
              ).map(([name, label]) => (
                <label key={name} className="backstage-check">
                  <input
                    type="checkbox"
                    checked={editing[name]}
                    onChange={(event) => editing.set({ [name]: event.target.checked })}
                  />{" "}
                  {label}
                </label>
              ))}
              <UnavailableOptions items={["Object anchors"]} />
            </fieldset>
            <fieldset className="backstage-fieldset">
              <legend>Printing options</legend>
              {(
                [
                  ["printDrawings", "Print drawings and shapes"],
                  ["printBackgrounds", "Print background colors"],
                  ["printHidden", "Print hidden text"],
                  ["printProperties", "Print document properties"],
                ] as const
              ).map(([name, label]) => (
                <label key={name} className="backstage-check">
                  <input
                    type="checkbox"
                    checked={editing[name]}
                    onChange={(event) => editing.set({ [name]: event.target.checked })}
                  />{" "}
                  {label}
                </label>
              ))}
              <UnavailableOptions items={["Update fields before printing", "Update linked data before printing"]} />
            </fieldset>
            <label className="backstage-prop-edit">
              <span>Default zoom</span>
              <input
                type="number"
                min={50}
                max={200}
                step={10}
                value={Math.round(zoom * 100)}
                onChange={(event) => setZoom((Number(event.target.value) || 100) / 100)}
              />
            </label>
          </section>
        )}
        {page === "ribbon" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">Ribbon</h2>
            <fieldset className="backstage-fieldset">
              <legend>Ribbon layout</legend>
              <label>
                <input type="radio" checked={ribbonLayout === "classic"} onChange={() => setRibbonLayout("classic")} />{" "}
                Classic
              </label>
              <label>
                <input type="radio" checked={ribbonLayout === "single"} onChange={() => setRibbonLayout("single")} />{" "}
                Single line
              </label>
            </fieldset>
            <button type="button" className="dialog-btn" onClick={() => openCustomize("ribbon")}>
              Customize Ribbon and Quick Access Toolbar…
            </button>
          </section>
        )}
        {page === "advanced" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">Editing options</h2>
            {(
              [
                ["typingReplacesSelection", "Typing replaces selected text"],
                ["dragAndDrop", "Allow text to be dragged and dropped"],
                ["ctrlClickLink", "Use Ctrl + Click to follow hyperlink"],
                ["insertKeyOvertype", "Use the Insert key to control overtype mode"],
                ["overtype", "Use overtype mode"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="backstage-check">
                <input
                  type="checkbox"
                  checked={editing[name]}
                  onChange={(event) => editing.set({ [name]: event.target.checked })}
                />{" "}
                {label}
              </label>
            ))}
            <h3 className="backstage-card-title">Cut, copy, and paste</h3>
            {(
              [
                ["pasteSameDocument", "Pasting within the same document"],
                ["pasteOtherPrograms", "Pasting from other programs"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="backstage-prop-edit">
                <span>{label}</span>
                <select value={editing[name]} onChange={(event) => editing.set({ [name]: event.target.value })}>
                  {PASTE_CHOICES.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <UnavailableOptions
              items={[
                "When selecting, automatically select entire word",
                "Use smart paragraph selection",
                "Use smart cursoring",
                "Prompt to update style",
                "Keep track of formatting",
                "Enable click and type",
                "Show Paste Options button when content is pasted",
                "Show AutoComplete suggestions",
              ]}
            />
            <h3 className="backstage-card-title">Show document content</h3>
            {(
              [
                ["showBackgrounds", "Show background colors and images in Print Layout view"],
                ["picturePlaceholders", "Show picture placeholders"],
                ["showDrawings", "Show drawings and text boxes on screen"],
                ["showBookmarks", "Show bookmarks"],
                ["textBoundaries", "Show text boundaries"],
                ["cropMarks", "Show crop marks"],
                ["fieldCodes", "Show field codes instead of their values"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="backstage-check">
                <input
                  type="checkbox"
                  checked={editing[name]}
                  onChange={(event) => editing.set({ [name]: event.target.checked })}
                />{" "}
                {label}
              </label>
            ))}
            <label className="backstage-prop-edit">
              <span>Field shading</span>
              <select
                value={editing.fieldShading}
                onChange={(event) => editing.set({ fieldShading: event.target.value })}
              >
                {FIELD_SHADING_CHOICES.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="backstage-check">
              <input
                type="checkbox"
                checked={editing.draftFont}
                onChange={(event) => editing.set({ draftFont: event.target.checked })}
              />{" "}
              Use draft font in Draft and Outline views
            </label>
            <label className="backstage-prop-edit">
              <span>Name</span>
              <select
                aria-label="Draft font name"
                value={editing.draftFontName}
                disabled={!editing.draftFont}
                onChange={(event) => editing.set({ draftFontName: event.target.value })}
              >
                {DRAFT_FONT_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="backstage-prop-edit">
              <span>Size</span>
              <select
                aria-label="Draft font size"
                value={editing.draftFontSize}
                disabled={!editing.draftFont}
                onChange={(event) => editing.set({ draftFontSize: Number(event.target.value) })}
              >
                {DRAFT_FONT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <UnavailableOptions items={["Show text wrapped within the document window"]} />
          </section>
        )}
        {page === "advanced" && <NewDocumentDefaults />}
        {page === "save" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">Save & AutoSave</h2>
            <label className="backstage-check">
              <input type="checkbox" checked={autoSave} onChange={toggleAutoSave} /> Keep a recovery copy of unsaved
              changes (AutoSave)
            </label>
            <label className="backstage-prop-edit">
              <span>Save recovery copy every</span>
              <select
                value={editing.recoverySeconds}
                onChange={(event) => editing.set({ recoverySeconds: Number(event.target.value) })}
              >
                {RECOVERY_CHOICES.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds > 60 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </label>
            <p className="backstage-muted">
              AutoSave is a safeguard: it never overwrites your file on disk. Your edits are kept in a recovery copy
              until you save, and if the app closes before you do, Unsaved Documents offers them back. Closing a
              document with unsaved changes asks whether to save them.
            </p>
            <p className="backstage-muted">
              Default save format follows the Save As dialog filters (.docx, .html, .pdf, .md, .txt).
            </p>
          </section>
        )}
        {page === "advanced" && <ShortcutSettings />}
        {page === "proofing" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">Proofing</h2>
            <label className="backstage-check">
              <input type="checkbox" checked={spellCheck} onChange={toggleSpellCheck} /> Check spelling as you type
            </label>
            {(
              [
                ["ignoreUppercase", "Ignore words in UPPERCASE"],
                ["ignoreNumbers", "Ignore words that contain numbers"],
                ["ignoreAddresses", "Ignore Internet and file addresses"],
                ["flagRepeated", "Flag repeated words"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="backstage-check">
                <input
                  type="checkbox"
                  checked={editing[name]}
                  onChange={(event) => editing.set({ [name]: event.target.checked })}
                />{" "}
                {label}
              </label>
            ))}
            <label className="backstage-check">
              <input
                type="checkbox"
                checked={editing.mainDictionaryOnly}
                onChange={(event) => editing.set({ mainDictionaryOnly: event.target.checked })}
              />{" "}
              Suggest from main dictionary only
            </label>
            <label className="backstage-check">
              <input
                type="checkbox"
                checked={editing.readability}
                onChange={(event) => editing.set({ readability: event.target.checked })}
              />{" "}
              Show readability statistics (in Word Count)
            </label>
            <UnavailableOptions items={["Mark grammar errors as you type"]} />
          </section>
        )}
        {page === "language" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">Language</h2>
            <dl className="backstage-defaults">
              <dt>Language</dt>
              <dd>{settings.locale || "Not set"}</dd>
              <dt>Date format</dt>
              <dd>{settings.dateFormat || "Not set"}</dd>
            </dl>
            <p className="backstage-muted">These come from the first-run setup. Change them by running it again.</p>
            <UnavailableOptions items={["Choose editing languages", "Display language", "Help language"]} />
          </section>
        )}
        {page === "accessibility" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">Accessibility</h2>
            {(
              [
                ["keepAccessibilityRunning", "Keep accessibility checker running while I edit"],
                ["animation", "Provide feedback with animation"],
                ["showShortcutKeys", "Show shortcut keys in ScreenTips"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="backstage-check">
                <input
                  type="checkbox"
                  checked={editing[name]}
                  onChange={(event) => editing.set({ [name]: event.target.checked })}
                />{" "}
                {label}
              </label>
            ))}
            <UnavailableOptions items={["Provide feedback with sound", "Automatically generate alt text for me"]} />
          </section>
        )}
        {page === "quick-access" && (
          <section className="backstage-card">
            <h2 className="backstage-card-title">Quick Access Toolbar</h2>
            <p className="backstage-muted">Choose which commands sit beside the title and in what order.</p>
            <button type="button" className="dialog-btn" onClick={() => openCustomize("quick-access")}>
              Customize Quick Access Toolbar…
            </button>
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * What a new document starts with: the Normal style's font and spacing and any other styles saved with Set As
 * Default or "New documents based on this template", and the page setup saved as default; each can go back to the
 * app's own.
 */
function NewDocumentDefaults() {
  // Read again after a reset; the defaults live in storage, not in a store.
  const [version, setVersion] = useState(0)
  const { normal, saved, page, wrap } = useMemo(() => {
    void version
    const styles = defaultStyles()
    const ids = savedDefaultIds()
    return {
      normal: styles.find((style) => style.id === "normal"),
      saved: styles.filter((style) => ids.has(style.id)),
      page: loadPageSetupDefault(),
      wrap: defaultPictureWrap(),
    }
  }, [version])
  const font = normal?.font
  const paragraph = normal?.paragraph
  const family = font?.family ? font.family.split(",")[0]!.replace(/["']/g, "") : "+Body (theme font)"
  return (
    <section className="backstage-card">
      <h2 className="backstage-card-title">New documents</h2>
      <dl className="backstage-defaults">
        <dt>Font</dt>
        <dd>
          {family}, {font?.size ?? 12} pt{font?.bold ? ", bold" : ""}
          {font?.italic ? ", italic" : ""}
          {font?.color ? (
            <span className="backstage-default-color" style={{ background: font.color }} title={font.color} />
          ) : null}
        </dd>
        <dt>Paragraph</dt>
        <dd>
          {paragraph?.before ?? 0} pt before, {paragraph?.after ?? 0} pt after, line spacing {paragraph?.line ?? 1}
          {paragraph?.align && paragraph.align !== "left" ? `, ${paragraph.align}` : ""}
        </dd>
        <dt>Saved styles</dt>
        <dd>{saved.length ? saved.map((style) => style.name).join(", ") : "None (the built-in styles)"}</dd>
        <dt>Pictures</dt>
        <dd>{WRAP_CHOICES.find((choice) => choice.id === wrap)?.label ?? "In Line with Text"}</dd>
        <dt>Page setup</dt>
        <dd>
          {page
            ? `${page.paper.toUpperCase()} ${page.orientation}, margins ${page.marginTop}/${page.marginRight}/${page.marginBottom}/${page.marginLeft} mm`
            : "The app's own"}
        </dd>
      </dl>
      <p className="backstage-muted">
        Set As Default in the Font and Paragraph dialogs, &ldquo;New documents based on this template&rdquo; when
        modifying a style, and Wrap Text &gt; Set as Default Layout change these.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="dialog-btn"
          disabled={saved.length === 0}
          onClick={() => {
            resetDefaultStyles()
            setVersion((value) => value + 1)
          }}
        >
          Reset Styles
        </button>
        <button
          type="button"
          className="dialog-btn"
          disabled={!page}
          onClick={() => {
            resetPageSetupDefault()
            setVersion((value) => value + 1)
          }}
        >
          Reset Page Setup
        </button>
        <button
          type="button"
          className="dialog-btn"
          disabled={wrap === "inline"}
          onClick={() => {
            setDefaultPictureWrap(null)
            setVersion((value) => value + 1)
          }}
        >
          Reset Picture Layout
        </button>
      </div>
    </section>
  )
}

export function CloseAction() {
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  useEffect(() => {
    let active = true
    void closeDocument().then((closed) => {
      // Cancelled at the save prompt: back to the document, as in Word.
      if (active && !closed) {
        closeBackstage()
      }
    })
    return () => {
      active = false
    }
  }, [closeBackstage])
  return <p className="backstage-muted p-8">Closing the document…</p>
}

export function SaveAction() {
  const path = useDocumentStore((state) => state.currentFilePath)
  const setTab = useBackstage((state) => state.setTab)
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  useEffect(() => {
    if (!path) {
      setTab("save-as")
      return
    }
    saveDocument()
    closeBackstage()
  }, [path, setTab, closeBackstage])
  return <p className="backstage-muted p-8">{path ? "Saving…" : "Opening Save As…"}</p>
}
