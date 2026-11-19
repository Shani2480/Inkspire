import { openFootnoteDialog } from "@/components/footnote-dialog"
import { openCaptionDialog, openCrossReferenceDialog } from "@/components/caption-dialogs"
import { MenuButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { LineCitationIcon, LineContentsIcon, LineEndnoteIcon, LineFootnoteIcon } from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { BIB_STYLES, isPlaceholder, mainNames, namesText, styleInfo, type BibSource } from "@/document/bibliography"
import { useBibliography } from "@/document/bibliography-store"
import { openNewSource, openPlaceholder, openSourceManager } from "@/components/source-dialogs"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { updateBlocks } from "@/editor/block-format"
import { AUTHORITY_CATEGORIES, type AuthorityCategory } from "@/editor/authorities"
import { useDocumentEditor } from "@/editor/document-editor"
import { listNotes } from "@/editor/insert-blocks"
import { chainWithSelection, insertAtSelectionEnd, restoreSelection } from "@/editor/selection-memory"
import { useEditorState } from "@tiptap/react"
import { useState } from "react"
import { hasTableOfFigures, useTocDialog } from "@/components/toc-dialogs"
import { openIndexDialog, openMarkEntryDialog } from "@/components/index-dialogs"
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
  const sources = useBibliography((state) => state.sources)
  const style = useBibliography((state) => state.style)
  const notes = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listNotes(current.state.doc) : []),
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
  const hasFigures = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? hasTableOfFigures(current) : false),
  })
  const hasAuthorities = useEditorState({
    editor,
    selector: ({ editor: current }) => hasNode(current, "authoritiesTable"),
  })

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
                  // Word's gallery closes the field in an empty Normal paragraph: a blank line below the table.
                  endLine: true,
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
    sources.map((source) => (
      <MenuButton
        key={source.tag}
        className="h-auto flex-col items-start gap-0 py-1"
        onClick={() => {
          editor &&
            chainWithSelection(editor)
              .insertCitation({ tags: [source.tag] })
              .run()
          close()
        }}
      >
        <SourceItem source={source} />
      </MenuButton>
    ))
  const citationMenu = (close: () => void) => (
    <div className="flex w-72 flex-col">
      {sources.length > 0 ? <div className="flex max-h-72 flex-col overflow-y-auto">{citationList(close)}</div> : null}
      {sources.length > 0 ? <div className="my-1 border-t border-black/10" /> : null}
      <MenuButton
        onClick={() => {
          openNewSource(editor)
          close()
        }}
      >
        Add New Source…
      </MenuButton>
      <MenuButton
        onClick={() => {
          openPlaceholder(editor)
          close()
        }}
      >
        Add New Placeholder…
      </MenuButton>
    </div>
  )
  const styleMenu = (close: () => void) => (
    <div className="flex w-56 flex-col">
      {BIB_STYLES.map((item) => (
        <MenuButton
          key={item.id}
          selected={style === item.id}
          onClick={() => {
            useBibliography.getState().setStyle(item.id)
            useDocumentStore.setState({ isDirty: true })
            close()
          }}
        >
          {item.label}
        </MenuButton>
      ))}
    </div>
  )
  const insertBibliography = (heading?: string) => {
    if (editor) {
      chainWithSelection(editor).insertBibliography(heading).run()
    }
  }
  const bibliographyMenu = (close: () => void) => (
    <div className="flex w-64 flex-col">
      <p className="px-2 pt-1 pb-0.5 text-[11px] font-semibold text-neutral-500">Built-In</p>
      {BIBLIOGRAPHY_GALLERY.map((heading) => (
        <MenuButton
          key={heading}
          className="h-auto flex-col items-stretch gap-1 py-1.5"
          onClick={() => {
            insertBibliography(heading)
            close()
          }}
        >
          <span className="text-xs font-semibold">{heading}</span>
          <BibliographyThumbnail title={heading} />
        </MenuButton>
      ))}
      <div className="my-1 border-t border-black/10" />
      <MenuButton
        onClick={() => {
          insertBibliography()
          close()
        }}
      >
        Insert Bibliography
      </MenuButton>
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
          <div className="flex w-72 flex-col">
            <p className="px-2 pt-1 pb-0.5 text-[11px] font-semibold text-neutral-500">Insert Citation</p>
            {citationMenu(close)}
            <div className="my-1 border-t border-black/10" />
            <MenuButton
              onClick={() => {
                openSourceManager(editor)
                close()
              }}
            >
              Manage Sources…
            </MenuButton>
            <MenuButton
              className={off ? "pointer-events-none opacity-50" : undefined}
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
          {
            id: "footnote-dialog",
            label: "Footnote and Endnote…",
            icon: <NoteIcon />,
            disabled: off,
            onClick: () => openFootnoteDialog(editor),
          },
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
          {
            id: "insert-caption",
            label: "Insert Caption",
            icon: <CaptionIcon />,
            disabled: off,
            onClick: () => openCaptionDialog(editor),
          },
          {
            id: "table-of-figures",
            label: "Insert Table of Figures",
            icon: <ListIcon />,
            disabled: off,
            onClick: () => openTocDialog("figures"),
          },
          {
            id: "update-figures",
            label: "Update Table of Figures",
            icon: <RefreshIcon />,
            disabled: off || !hasFigures,
            onClick: () => openTocDialog("updateFigures"),
          },
          {
            id: "cross-reference",
            label: "Cross-reference",
            icon: <NextIcon />,
            disabled: off,
            onClick: () => openCrossReferenceDialog(editor),
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
            onClick: () => openMarkEntryDialog(editor),
          },
          {
            id: "insert-index",
            label: "Insert Index",
            icon: <ListIcon />,
            disabled: off,
            onClick: () => openIndexDialog(editor),
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

      <RibbonGroup
        label="Footnotes"
        className="shrink-0"
        onLaunch={() => openFootnoteDialog(editor)}
        launchLabel="Footnote and Endnote"
      >
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
        <RibbonCommand label="Insert Citation" disabled={off} menu={citationMenu}>
          <CiteIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand size="small" label="Manage Sources" disabled={off} onClick={() => openSourceManager(editor)}>
            <SourcesIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Style" menu={styleMenu}>
            <span className="text-[11px] font-semibold text-[var(--app-ribbon-text)]">
              {styleInfo(style).styleName}
            </span>
          </RibbonCommand>
          <RibbonCommand size="small" label="Bibliography" disabled={off} menu={bibliographyMenu}>
            <ListIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Captions" className="shrink-0">
        <RibbonCommand label="Insert Caption" disabled={off} onClick={() => openCaptionDialog(editor)}>
          <CaptionIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand
            size="small"
            label="Insert Table of Figures"
            disabled={off}
            onClick={() => openTocDialog("figures")}
          >
            <ListIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Update Table"
            description="Update the table of figures to include all of the entries in the document."
            disabled={off || !hasFigures}
            onClick={() => openTocDialog("updateFigures")}
          >
            <RefreshIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Cross-reference"
            description="Refer to a heading, bookmark, figure or table, as text, its page or above/below."
            disabled={off}
            onClick={() => openCrossReferenceDialog(editor)}
          >
            <NextIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Index" className="shrink-0">
        <RibbonCommand
          label="Mark Entry"
          description="Include the selected text in the index of your document (Alt+Shift+X)."
          disabled={off}
          onClick={() => openMarkEntryDialog(editor)}
        >
          <MarkIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand size="small" label="Insert Index" disabled={off} onClick={() => openIndexDialog(editor)}>
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

/** Word's built-in bibliographies: the same list under different headings. */
const BIBLIOGRAPHY_GALLERY = ["Bibliography", "References", "Works Cited"]

/** A source as Insert Citation lists it: the author, then the title and year. */
function SourceItem({ source }: { source: BibSource }) {
  if (isPlaceholder(source)) {
    return <span className="text-sm">{source.tag}</span>
  }
  const author = namesText(mainNames(source)) || source.fields.Title || source.tag
  const rest = [source.fields.Title, source.fields.Year ? `(${source.fields.Year})` : ""].filter(Boolean).join(", ")
  return (
    <>
      <span className="max-w-64 truncate text-sm font-semibold">{author}</span>
      {rest ? <span className="max-w-64 truncate text-xs">{rest}</span> : null}
    </>
  )
}

/** A bibliography in miniature, as Word's gallery shows each built-in one. */
function BibliographyThumbnail({ title }: { title: string }) {
  return (
    <span
      className="flex flex-col gap-0.5 rounded-sm border border-black/10 bg-white px-2 py-1.5 text-left"
      data-keep-light
    >
      <span className="text-[11px] font-semibold text-[#2f5496]">{title}</span>
      {["Chen, J. (2003). Citations and References.", "Haas, J. (2005). Creating a Formal Publication."].map((line) => (
        <span key={line} className="pl-2 -indent-2 text-[9px] text-neutral-700">
          {line}
        </span>
      ))}
    </span>
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
