import { MenuButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { LineCitationIcon, LineContentsIcon, LineEndnoteIcon, LineFootnoteIcon } from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import {
  CITATION_STYLES,
  deleteSource,
  formatBibliographyEntry,
  formatCitation,
  loadCitationStyle,
  loadSources,
  saveCitationStyle,
  saveSource,
  type CitationSource,
  type CitationStyle,
} from "@/document/sources"
import { useViewStore } from "@/document/view"
import { updateBlocks } from "@/editor/block-format"
import { AUTHORITY_CATEGORIES, type AuthorityCategory } from "@/editor/authorities"
import { useDocumentEditor } from "@/editor/document-editor"
import { listHeadings, listNotes, nextCaption } from "@/editor/insert-blocks"
import { chainWithSelection, insertAtSelectionEnd, restoreSelection } from "@/editor/selection-memory"
import { useEditorState } from "@tiptap/react"
import { useState } from "react"
import { DialogFrame } from "@/components/word-dialog"
import { useTocDialog } from "@/components/toc-dialogs"
import { DEFAULT_TOC_INSTRUCTION, tocLevels } from "@/document/toc"

/** Word's two built-in tables, which differ only in their heading. */
const AUTOMATIC_TABLES = [
  { name: "Automatic Table 1", title: "Contents" },
  { name: "Automatic Table 2", title: "Table of Contents" },
]

export function ReferencesTab() {
  const editor = useDocumentEditor()
  const openTocDialog = useTocDialog((state) => state.open)
  const openFind = useViewStore((state) => state.openFind)
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const [sources, setSources] = useState<CitationSource[]>(() => loadSources())
  const [style, setStyle] = useState<CitationStyle>(() => loadCitationStyle())
  const [managing, setManaging] = useState(false)
  const notes = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listNotes(current.state.doc) : []),
  })
  const headings = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listHeadings(current.state.doc) : []),
  })
  /** The levels the document's table of contents shows, or 0 when it has none. */
  const tocDepth = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      let depth = 0
      current?.state.doc.descendants((node) => {
        if (node.type.name === "tableOfContents") {
          depth = tocLevels(String(node.attrs.instruction || DEFAULT_TOC_INSTRUCTION))
        }
        return depth === 0
      })
      return depth
    },
  })
  const hasToc = (tocDepth ?? 0) > 0
  const hasIndex = useEditorState({
    editor,
    selector: ({ editor: current }) => hasNode(current, "documentIndex"),
  })
  const hasAuthorities = useEditorState({
    editor,
    selector: ({ editor: current }) => hasNode(current, "authoritiesTable"),
  })

  function applyStyle(next: CitationStyle) {
    saveCitationStyle(next)
    setStyle(next)
  }

  const off = !editor
  const noNotes = off || (notes?.length ?? 0) === 0

  const tocMenu = (close: () => void) => (
    <div className="flex w-64 flex-col">
      <p className="px-2 pt-1 pb-0.5 text-[11px] font-semibold text-neutral-500">Built-In</p>
      {AUTOMATIC_TABLES.map((table) => (
        <MenuButton
          key={table.name}
          className="h-auto flex-col items-stretch gap-1 py-1.5"
          onClick={() => {
            editor &&
              insertAtSelectionEnd(editor)
                .insertTableOfContents({
                  title: table.title,
                  instruction: DEFAULT_TOC_INSTRUCTION,
                  leader: "dot",
                  rightAlign: true,
                })
                .run()
            close()
          }}
        >
          <span className="text-left text-xs">{table.name}</span>
          <TocThumbnail title={table.title} />
        </MenuButton>
      ))}
      <div className="my-1 border-t border-black/10" />
      <MenuButton
        onClick={() => {
          close()
          openTocDialog("custom")
        }}
      >
        Custom Table of Contents…
      </MenuButton>
      <MenuButton
        className={hasToc ? undefined : "pointer-events-none opacity-50"}
        onClick={() => {
          editor?.chain().focus().removeTableOfContents().run()
          close()
        }}
      >
        Remove Table of Contents
      </MenuButton>
    </div>
  )
  const addTextMenu = (close: () => void) => (
    <div className="flex w-56 flex-col">
      {/* As in Word, as many levels as the table of contents shows (at least 3). */}
      {Array.from({ length: Math.max(3, tocDepth ?? 0) }, (_, index) => index + 1).map((level) => (
        <MenuButton
          key={level}
          onClick={() => {
            if (!editor) {
              return
            }
            restoreSelection(editor)
            if (level <= 6) {
              chainWithSelection(editor)
                .setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
                .updateAttributes("heading", { outlineLevel: String(level), namedStyle: null })
                .run()
            } else {
              // The editor's headings stop at 6; deeper levels are paragraphs with an outline level.
              chainWithSelection(editor).setParagraph().run()
              updateBlocks(editor, { outlineLevel: String(level), namedStyle: null })
            }
            close()
          }}
        >
          Level {level}
        </MenuButton>
      ))}
      <MenuButton
        onClick={() => {
          if (!editor) {
            return
          }
          restoreSelection(editor)
          chainWithSelection(editor).setParagraph().run()
          updateBlocks(editor, { outlineLevel: "", namedStyle: null })
          close()
        }}
      >
        Do Not Show in Table of Contents
      </MenuButton>
    </div>
  )
  const footnoteMenu = (close: () => void) => <NoteMenu editor={editor} kind="footnote" close={close} />
  const endnoteMenu = (close: () => void) => <NoteMenu editor={editor} kind="endnote" close={close} />
  const nextNoteMenu = (close: () => void) => (
    <div className="flex max-h-56 w-56 flex-col overflow-auto">
      {(notes ?? []).map((note, index) => (
        <MenuButton
          key={note.id}
          onClick={() => {
            editor?.chain().focus().setTextSelection(note.pos).scrollIntoView().run()
            close()
          }}
        >
          {note.kind === "endnote" ? "Endnote" : "Footnote"} {index + 1}
        </MenuButton>
      ))}
    </div>
  )
  const showNotes = () => {
    const first = notes?.[0]
    if (first && editor) {
      editor.chain().focus().setTextSelection(first.pos).scrollIntoView().run()
    }
  }
  const citationList = (close: () => void) =>
    sources.map((source, index) => (
      <MenuButton
        key={source.id}
        onClick={() => {
          editor &&
            chainWithSelection(editor)
              .insertContent(formatCitation(source, style, index + 1))
              .run()
          close()
        }}
      >
        {source.author}
        {source.year ? ` (${source.year})` : ""}
      </MenuButton>
    ))
  const citationMenu = (close: () => void) => (
    <div className="flex max-h-56 w-64 flex-col overflow-auto">{citationList(close)}</div>
  )
  const styleMenu = (close: () => void) => (
    <div className="flex w-36 flex-col">
      {CITATION_STYLES.map((item) => (
        <MenuButton
          key={item.id}
          selected={style === item.id}
          onClick={() => {
            applyStyle(item.id)
            close()
          }}
        >
          {item.label}
        </MenuButton>
      ))}
    </div>
  )
  const insertBibliography = () => {
    if (!editor) {
      return
    }
    const html = [
      `<h2>${style === "mla" ? "Works Cited" : style === "chicago" ? "Bibliography" : "References"}</h2>`,
      ...sources.map((source, index) => `<p>${formatBibliographyEntry(source, style, index + 1)}</p>`),
    ].join("")
    chainWithSelection(editor).insertContent(html).run()
  }
  const bibliographyMenu = (close: () => void) => (
    <div className="flex w-48 flex-col">
      <MenuButton
        onClick={() => {
          insertBibliography()
          close()
        }}
      >
        Insert bibliography
      </MenuButton>
    </div>
  )
  const captionMenu = (close: () => void) => (
    <div className="flex w-36 flex-col">
      {(["Figure", "Table"] as const).map((label) => (
        <MenuButton
          key={label}
          onClick={() => {
            if (editor) {
              chainWithSelection(editor)
                .insertContent(`<p>${label} ${nextCaption(editor.state.doc, label)}. </p>`)
                .run()
            }
            close()
          }}
        >
          {label}
        </MenuButton>
      ))}
    </div>
  )
  const crossReferenceMenu = (close: () => void) => (
    <div className="flex max-h-56 w-56 flex-col overflow-auto">
      {(headings ?? []).map((heading) => (
        <MenuButton
          key={heading.pos}
          onClick={() => {
            editor && chainWithSelection(editor).insertContent(heading.text).run()
            close()
          }}
        >
          {heading.text}
        </MenuButton>
      ))}
      {(headings?.length ?? 0) === 0 ? <p className="px-2 py-1 text-xs text-neutral-500">No headings yet.</p> : null}
    </div>
  )
  const authorityMenu = (close: () => void) => (
    <div className="flex max-h-64 w-52 flex-col overflow-auto">
      {AUTHORITY_CATEGORIES.map((category) => (
        <MenuButton
          key={category}
          onClick={() => {
            editor
              ?.chain()
              .focus()
              .markAuthority(category as AuthorityCategory)
              .run()
            close()
          }}
        >
          {category}
        </MenuButton>
      ))}
    </div>
  )
  const sourcesDialog = managing ? (
    <SourceDialog sources={sources} onChange={setSources} onClose={() => setManaging(false)} />
  ) : null

  if (ribbonLayout === "single") {
    // Word for the web's single line References tab (`screenshots/ribbon/`); the rest of the classic tab is under
    // More options.
    const rowCommands: LineCommand[] = [
      {
        id: "table-of-contents",
        label: "Table of Contents",
        icon: <LineContentsIcon />,
        priority: 2,
        disabled: off,
        menu: tocMenu,
      },
      {
        id: "insert-footnote",
        label: "Insert Footnote",
        icon: <LineFootnoteIcon />,
        priority: 1,
        chevron: false,
        disabled: off,
        menu: footnoteMenu,
      },
      {
        id: "insert-endnote",
        label: "Insert Endnote",
        icon: <LineEndnoteIcon />,
        chevron: false,
        disabled: off,
        menu: endnoteMenu,
      },
      {
        id: "citations",
        label: "Citations",
        icon: <LineCitationIcon />,
        priority: 1,
        menu: (close) => (
          <div className="flex max-h-80 w-64 flex-col overflow-auto">
            {citationList(close)}
            {sources.length === 0 ? <p className="px-2 py-1 text-xs text-neutral-500">No sources yet.</p> : null}
            <div className="my-1 border-t border-black/10" />
            <MenuButton
              onClick={() => {
                setManaging(true)
                close()
              }}
            >
              Manage Sources…
            </MenuButton>
            <MenuButton
              className={sources.length === 0 || off ? "pointer-events-none opacity-50" : undefined}
              onClick={() => {
                insertBibliography()
                close()
              }}
            >
              Insert Bibliography
            </MenuButton>
            <p className="px-2 pt-1 pb-0.5 text-[11px] font-semibold text-neutral-500">Style</p>
            {styleMenu(close)}
          </div>
        ),
      },
    ]
    const row = rowCommands.map((command) => ({ ...command, showLabel: true }))
    const more: LineGroup[] = [
      {
        id: "table-of-contents",
        commands: [
          { id: "add-text", label: "Add Text", icon: <AddTextIcon />, disabled: off, menu: addTextMenu },
          {
            id: "update-toc",
            label: "Update Table of Contents",
            icon: <RefreshIcon />,
            disabled: off || !hasToc,
            onClick: () => openTocDialog("update"),
          },
        ],
      },
      {
        id: "footnotes",
        commands: [
          { id: "next-footnote", label: "Next Footnote", icon: <NextIcon />, disabled: noNotes, menu: nextNoteMenu },
          { id: "show-notes", label: "Show Notes", icon: <NoteIcon />, disabled: noNotes, onClick: showNotes },
        ],
      },
      {
        id: "research",
        commands: [
          { id: "search", label: "Search", icon: <SearchIcon />, disabled: off, onClick: () => openFind(false) },
        ],
      },
      {
        id: "captions",
        commands: [
          { id: "insert-caption", label: "Insert Caption", icon: <CaptionIcon />, disabled: off, menu: captionMenu },
          {
            id: "table-of-figures",
            label: "Insert Table of Figures",
            icon: <ListIcon />,
            disabled: off,
            onClick: () => editor?.chain().focus().insertFigureTable().run(),
          },
          {
            id: "update-figures",
            label: "Update Table of Figures",
            icon: <RefreshIcon />,
            disabled: off,
            onClick: () => editor?.chain().focus().refreshFigureTable().run(),
          },
          {
            id: "cross-reference",
            label: "Cross-reference",
            icon: <NextIcon />,
            disabled: off,
            menu: crossReferenceMenu,
          },
        ],
      },
      {
        id: "index",
        commands: [
          {
            id: "mark-entry",
            label: "Mark Entry",
            icon: <MarkIcon />,
            disabled: off,
            onClick: () => editor?.chain().focus().markIndexEntry().run(),
          },
          {
            id: "insert-index",
            label: "Insert Index",
            icon: <ListIcon />,
            disabled: off,
            onClick: () => editor?.chain().focus().insertDocumentIndex().run(),
          },
          {
            id: "update-index",
            label: "Update Index",
            icon: <RefreshIcon />,
            disabled: off || !hasIndex,
            onClick: () => editor?.chain().focus().updateDocumentIndex().run(),
          },
        ],
      },
      {
        id: "authorities",
        commands: [
          { id: "mark-citation", label: "Mark Citation", icon: <MarkIcon />, disabled: off, menu: authorityMenu },
          {
            id: "insert-authorities",
            label: "Insert Table of Authorities",
            icon: <ListIcon />,
            disabled: off,
            onClick: () => editor?.chain().focus().insertAuthoritiesTable().run(),
          },
          {
            id: "update-authorities",
            label: "Update Table of Authorities",
            icon: <RefreshIcon />,
            disabled: off || !hasAuthorities,
            onClick: () => editor?.chain().focus().updateAuthoritiesTable().run(),
          },
        ],
      },
    ]

    return (
      <>
        <SingleLineBar label="References" groups={[{ id: "references", commands: row }]} more={more} />
        {sourcesDialog}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="References" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Table of Contents" className="shrink-0">
        <RibbonCommand label="Table of Contents" disabled={off} menu={tocMenu}>
          <ListIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand size="small" label="Add Text" disabled={off} menu={addTextMenu}>
            <AddTextIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Update Table"
            description="Update the table of contents so all the entries refer to the correct page numbers."
            disabled={off || !hasToc}
            onClick={() => openTocDialog("update")}
          >
            <RefreshIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Footnotes" className="shrink-0">
        <RibbonCommand label="Insert Footnote" disabled={off} menu={footnoteMenu}>
          <NoteIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand size="small" label="Insert Endnote" disabled={off} menu={endnoteMenu}>
            <NoteIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Next Footnote" disabled={noNotes} menu={nextNoteMenu}>
            <NextIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Show Notes" disabled={noNotes} onClick={showNotes}>
            <NoteIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Research" className="shrink-0">
        <RibbonCommand label="Search" disabled={off} onClick={() => openFind(false)}>
          <SearchIcon />
        </RibbonCommand>
      </RibbonGroup>

      <RibbonGroup label="Citations & Bibliography" className="shrink-0">
        <RibbonCommand label="Insert Citation" disabled={off || sources.length === 0} menu={citationMenu}>
          <CiteIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand size="small" label="Manage Sources" onClick={() => setManaging(true)}>
            <SourcesIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Style" menu={styleMenu}>
            <span className="text-[11px] font-semibold text-[var(--app-ribbon-text)]">
              {CITATION_STYLES.find((item) => item.id === style)?.label ?? "APA"}
            </span>
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Bibliography"
            disabled={off || sources.length === 0}
            menu={bibliographyMenu}
          >
            <ListIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Captions" className="shrink-0">
        <RibbonCommand label="Insert Caption" disabled={off} menu={captionMenu}>
          <CaptionIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand
            size="small"
            label="Insert Table of Figures"
            disabled={off}
            onClick={() => editor?.chain().focus().insertFigureTable().run()}
          >
            <ListIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Update Table"
            description="Refresh the table of figures so it matches the captions."
            disabled={off}
            onClick={() => editor?.chain().focus().refreshFigureTable().run()}
          >
            <RefreshIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Cross-reference"
            description="Insert the text of a heading from this document."
            disabled={off}
            menu={crossReferenceMenu}
          >
            <NextIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Index" className="shrink-0">
        <RibbonCommand label="Mark Entry" disabled={off} onClick={() => editor?.chain().focus().markIndexEntry().run()}>
          <MarkIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand
            size="small"
            label="Insert Index"
            disabled={off}
            onClick={() => editor?.chain().focus().insertDocumentIndex().run()}
          >
            <ListIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Update Index"
            disabled={off || !hasIndex}
            onClick={() => editor?.chain().focus().updateDocumentIndex().run()}
          >
            <RefreshIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Table of Authorities" className="shrink-0">
        <RibbonCommand label="Mark Citation" disabled={off} menu={authorityMenu}>
          <MarkIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand
            size="small"
            label="Insert Table of Authorities"
            disabled={off}
            onClick={() => editor?.chain().focus().insertAuthoritiesTable().run()}
          >
            <ListIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Update Table"
            description="Refresh the table of authorities so it matches the marked citations."
            disabled={off || !hasAuthorities}
            onClick={() => editor?.chain().focus().updateAuthoritiesTable().run()}
          >
            <RefreshIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      {sourcesDialog}
    </div>
  )
}

function hasNode(editor: ReturnType<typeof useDocumentEditor>, name: string) {
  if (!editor) {
    return false
  }
  let found = false
  editor.state.doc.descendants((node) => {
    if (node.type.name === name) {
      found = true
      return false
    }
  })
  return found
}

function NoteMenu({
  editor,
  kind,
  close,
}: {
  editor: ReturnType<typeof useDocumentEditor>
  kind: "footnote" | "endnote"
  close: () => void
}) {
  const [text, setText] = useState("")
  return (
    <form
      className="flex w-64 flex-col gap-2 p-1"
      onSubmit={(event) => {
        event.preventDefault()
        editor?.chain().focus().insertNote(kind, text).run()
        close()
      }}
    >
      <textarea
        aria-label={kind === "endnote" ? "Endnote" : "Footnote"}
        value={text}
        className="h-20 rounded border border-black/15 px-2 py-1 text-sm"
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="h-8 rounded bg-[#0f6cbd] text-sm text-white">
        Insert
      </button>
    </form>
  )
}

function SourceDialog({
  sources,
  onChange,
  onClose,
}: {
  sources: CitationSource[]
  onChange: (sources: CitationSource[]) => void
  onClose: () => void
}) {
  const [author, setAuthor] = useState("")
  const [title, setTitle] = useState("")
  const [year, setYear] = useState("")
  return (
    <DialogFrame
      title="Manage sources"
      width={440}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        onChange(saveSource({ author, title, year }))
        setAuthor("")
        setTitle("")
        setYear("")
      }}
    >
      <div className="mt-3 flex max-h-48 flex-col gap-1 overflow-auto">
        {sources.map((source) => (
          <div key={source.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              {source.author}
              {source.year ? ` (${source.year})` : ""} — {source.title}
            </span>
            <button
              type="button"
              className="text-xs text-neutral-500"
              onClick={() => onChange(deleteSource(source.id))}
            >
              Remove
            </button>
          </div>
        ))}
        {sources.length === 0 ? <p className="text-xs text-neutral-500">No sources yet.</p> : null}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <input
          aria-label="Author"
          value={author}
          placeholder="Author"
          className="dialog-btn"
          onChange={(event) => setAuthor(event.target.value)}
        />
        <input
          aria-label="Title"
          value={title}
          placeholder="Title"
          className="dialog-btn"
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          aria-label="Year"
          value={year}
          placeholder="Year"
          className="dialog-btn"
          onChange={(event) => setYear(event.target.value)}
        />
      </div>
      <div className="word-dialog-actions">
        <button type="submit" className="dialog-btn is-primary">
          Add
        </button>
        <button type="button" className="dialog-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </DialogFrame>
  )
}

/** A table of contents in miniature, as Word's gallery shows each built-in table. */
function TocThumbnail({ title }: { title: string }) {
  return (
    <span
      className="flex flex-col gap-0.5 rounded-sm border border-black/10 bg-white px-2 py-1.5 text-left"
      data-keep-light
    >
      <span className="text-[11px] font-semibold text-[#2f5496]">{title}</span>
      {[0, 1, 2].map((level) => (
        <span
          key={level}
          className="flex items-baseline gap-1 text-[9px] text-neutral-700"
          style={{ paddingLeft: level * 8 }}
        >
          {`Heading ${level + 1}`}
          <span className="flex-1 border-b border-dotted border-neutral-400" />1
        </span>
      ))}
    </span>
  )
}

function ListIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path d="M7 8h14M7 14h14M7 20h10" stroke="#0f6cbd" strokeWidth="1.4" />
    </svg>
  )
}
function RefreshIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path d="M8 14a6 6 0 1 0 2-4.5" fill="none" stroke="#0f6cbd" strokeWidth="1.4" />
      <path d="M8 6v4h4" fill="none" stroke="#0f6cbd" strokeWidth="1.4" />
    </svg>
  )
}
function NoteIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <text x="10" y="18" fontSize="14" fill="#0f6cbd">
        1
      </text>
    </svg>
  )
}
function NextIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path d="M8 8h8M8 14h12M16 11l4 3-4 3" fill="none" stroke="#0f6cbd" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <circle cx="12" cy="12" r="5" fill="none" stroke="#0f6cbd" strokeWidth="1.6" />
      <path d="M16 16l5 5" stroke="#0f6cbd" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function CiteIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <text x="6" y="18" fontSize="14" fill="#5b2c8e">
        “
      </text>
    </svg>
  )
}
function SourcesIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="6" y="5" width="12" height="16" fill="#fff" stroke="#5c5c5c" />
      <rect x="10" y="8" width="12" height="16" fill="#deecf9" stroke="#0f6cbd" />
    </svg>
  )
}
function CaptionIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="6" y="5" width="16" height="12" fill="#f3f3f3" stroke="#5c5c5c" />
      <path d="M8 21h12" stroke="#0f6cbd" />
    </svg>
  )
}
function AddTextIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path d="M7 8h14M7 14h10M7 20h8" stroke="#0f6cbd" strokeWidth="1.4" />
      <path d="M20 16v6M17 19h6" stroke="#0f6cbd" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function MarkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path d="M8 20 18 6l4 3-10 14H8z" fill="#fff4ce" stroke="#8a6116" />
      <path d="M16 8l4 3" stroke="#8a6116" />
    </svg>
  )
}
