import { openLinkDialog } from "@/components/link-dialog"
import { openEditCitation, openEditSource } from "@/components/source-dialogs"
import { citationAt, citationToText, updateCitationsAndBibliography } from "@/editor/bibliography"
import { NodeSelection } from "@tiptap/pm/state"
import { linkAtSelection, removeLink } from "@/editor/links"
import { followLink } from "@/editor/editing-behavior"
import { insideSelection } from "@/components/object-context-menu"
import { openTableProperties } from "@/components/table-properties-dialog"
import { CellSelection } from "@tiptap/pm/tables"
import { openBordersAndShading } from "@/components/borders-shading-dialog"
import { askText } from "@/components/text-prompt"
import { MenuLabel } from "@/components/menu-icons"
import { useClipboard } from "@/document/clipboard"
import { useViewStore } from "@/document/view"
import { useProofing } from "@/ai/proofing"
import { useDocumentStore } from "@/document/store"
import { addComment } from "@/editor/comments"
import { copySelection, cutSelection, pasteFromClipboard, pasteStored } from "@/editor/home-actions"
import { requestFormatDialog } from "@/components/format-dialogs"
import { findSelection } from "@/components/find-dialog"
import { rememberSelection } from "@/editor/selection-memory"
import { inTable } from "@/editor/table-tools"
import { openAdjustListIndents, openSetNumberingValue } from "@/components/list-numbering-dialogs"
import {
  canContinueNumbering,
  continueNumbering,
  listAt,
  numberedListAt,
  restartNumbering,
} from "@/editor/list-numbering"
import type { Editor } from "@tiptap/core"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type Item = {
  id: string
  label: string
  run?: () => void
  disabled?: boolean
  children?: { label: string; run: () => void }[]
}

export function TextContextMenu({ editor }: { editor: Editor | null }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [query, setQuery] = useState("")
  const [pasteOpen, setPasteOpen] = useState(false)
  // Where the menu is drawn once measured: below the click when it fits, else above it, as Word does.
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const items = useClipboard((state) => state.items)

  useEffect(() => {
    if (!editor) {
      return
    }
    const onContext = (event: MouseEvent) => {
      const target = event.target
      if (event.defaultPrevented || !(target instanceof Element) || !editor.view.dom.contains(target)) {
        return
      }
      if (target.closest(".page-image, .image-frame, .object-frame, input, textarea, button, label")) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      // Selected cells or an object stay selected only for a right-click on them; elsewhere the caret goes to the click,
      // as in Word.
      const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      const field = target.closest(".word-field")
      const citation = field instanceof HTMLElement && /^\s*CITATION\b/i.test(field.dataset.instr ?? "") ? field : null
      if (citation) {
        // A citation is selected whole, as Word selects its content control.
        const at = editor.view.posAtDOM(citation, 0)
        const pos = [at, at - 1].find((p) => p >= 0 && editor.state.doc.nodeAt(p)?.type.name === "wordField")
        if (pos !== undefined) {
          editor.commands.setNodeSelection(pos)
        }
      } else if (
        (editor.state.selection instanceof CellSelection || editor.state.selection instanceof NodeSelection) &&
        hit &&
        !insideSelection(editor, hit.pos)
      ) {
        editor.commands.setTextSelection(hit.pos)
      }
      rememberSelection(editor)
      setQuery("")
      setPasteOpen(false)
      setPlaced(null)
      setPoint({ x: event.clientX, y: event.clientY })
    }
    editor.view.dom.addEventListener("contextmenu", onContext)
    return () => editor.view.dom.removeEventListener("contextmenu", onContext)
  }, [editor])

  useEffect(() => {
    if (!point) {
      return
    }
    const close = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-text-menu]")) {
        return
      }
      setPoint(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPoint(null)
      }
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", onKey)
    }
  }, [point])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!point || !menu) {
      return
    }
    setPlaced(placeMenu(point, menu.offsetWidth, menu.offsetHeight))
  }, [point, query])

  if (!editor || !point) {
    return null
  }

  const word = selectedWord(editor)
  const link = linkAtSelection(editor)
  const citation = citationAt(editor)
  const selection = editor.state.selection
  const onBibliography = selection instanceof NodeSelection && selection.node.type.name === "bibliography"
  const inList = listAt(editor.state) !== null
  const numbered = numberedListAt(editor.state) !== null
  const entries: Item[] = [
    { id: "cut", label: "Cut", run: () => cutSelection(editor) },
    { id: "copy", label: "Copy", run: () => copySelection(editor) },
    {
      id: "paste",
      label: "Paste Options",
      children: [
        { label: "Keep Source Formatting", run: () => void pasteFromClipboard(editor, "source") },
        { label: "Merge Formatting", run: () => void pasteFromClipboard(editor, "merge") },
        { label: "Picture", run: () => void pasteFromClipboard(editor, "picture") },
        { label: "Keep Text Only", run: () => void pasteFromClipboard(editor, "text") },
        ...items.slice(0, 3).map((item) => ({ label: item.text.slice(0, 42), run: () => pasteStored(editor, item) })),
      ],
    },
    { id: "font", label: "Font…", run: () => requestFormatDialog("font") },
    { id: "paragraph", label: "Paragraph…", run: () => requestFormatDialog("paragraph") },
    // Word's list commands: Adjust List Indents on any list; restarting and continuing on a numbered one.
    ...(inList
      ? [{ id: "list-indents", label: "Adjust List Indents…", run: () => openAdjustListIndents(editor) }]
      : []),
    ...(numbered
      ? [
          { id: "restart-numbering", label: "Restart at 1", run: () => restartNumbering(editor) },
          {
            id: "continue-numbering",
            label: "Continue Numbering",
            disabled: !canContinueNumbering(editor.state),
            run: () => continueNumbering(editor),
          },
          { id: "numbering-value", label: "Set Numbering Value…", run: () => openSetNumberingValue(editor) },
        ]
      : []),
    // Word's citation menu (the control's drop-down): Edit Citation, Edit Source, static text, Update.
    ...(citation
      ? [
          { id: "edit-citation", label: "Edit Citation…", run: () => openEditCitation(editor) },
          { id: "edit-source", label: "Edit Source…", run: () => openEditSource(editor) },
          {
            id: "citation-text",
            label: "Convert Citation to Static Text",
            run: () => citationToText(editor, citation),
          },
        ]
      : []),
    ...(citation || onBibliography
      ? [{ id: "update-citations", label: "Update Citations and Bibliography", run: updateCitationsAndBibliography }]
      : []),
    ...(inTable(editor)
      ? [
          { id: "borders", label: "Borders and Shading…", run: () => openBordersAndShading(editor) },
          { id: "table-properties", label: "Table Properties…", run: () => openTableProperties(editor) },
        ]
      : []),
    {
      id: "block",
      label: "Block Authors",
      run: () => useViewStore.getState().setRestricted(!useViewStore.getState().restricted),
    },
    word
      ? { id: "search", label: `Search “${word}”`, run: () => findSelection(word) }
      : { id: "search", label: "Search", run: () => findSelection("") },
    { id: "synonyms", label: "Synonyms", run: () => useProofing.getState().openPanel("thesaurus") },
    { id: "aloud", label: "Read Aloud", run: () => speak(editor) },
    { id: "translate", label: "Translate", run: () => useProofing.getState().openPanel("translation") },
    // Word's link commands: Edit, Open, Copy and Remove Link on a link; Link… elsewhere.
    ...(link
      ? [
          { id: "edit-link", label: "Edit Link…", run: () => openLinkDialog(editor) },
          { id: "open-link", label: "Open Link", run: () => followLink(link.href) },
          {
            id: "copy-link",
            label: "Copy Link",
            run: () => void navigator.clipboard?.writeText(link.href).catch(() => undefined),
          },
          { id: "remove-link", label: "Remove Link", run: () => removeLink(editor) },
        ]
      : [{ id: "link", label: "Link…", run: () => openLinkDialog(editor) }]),
    {
      id: "comment",
      label: "New Comment",
      run: () => {
        void askText({ title: "New Comment", label: "Comment", multiline: true, ok: "Post" }).then((text) => {
          if (text?.trim()) {
            addComment(editor, text)
          }
        })
      },
    },
  ]
  const needle = query.trim().toLowerCase()
  const visible = needle ? entries.filter((item) => item.label.toLowerCase().includes(needle)) : entries

  return createPortal(
    <div
      role="menu"
      aria-label="Text"
      data-text-menu=""
      className="app-popup fixed z-[70] w-64 rounded-md border border-[#d0d0d0] bg-white py-1 text-[13px] text-[#242424] shadow-lg"
      ref={menuRef}
      style={placed ?? { left: point.x, top: point.y, visibility: "hidden" }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        if (event.target instanceof HTMLInputElement) {
          return
        }
        event.preventDefault()
      }}
    >
      <label className="block px-2 py-1">
        <span className="sr-only">Search the menus</span>
        <input
          aria-label="Search the menus"
          placeholder="Search the menus"
          value={query}
          className="h-7 w-full rounded border border-[#d0d0d0] px-2 text-[12px]"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {visible.map((item) =>
        item.children ? (
          <div key={item.id} className="relative">
            <button type="button" role="menuitem" className="menu-row" onClick={() => setPasteOpen((open) => !open)}>
              <MenuLabel label={item.label} />
              <span aria-hidden>›</span>
            </button>
            {pasteOpen ? (
              <div className="absolute top-0 left-full z-10 w-52 rounded-md border border-[#d0d0d0] bg-white py-1 shadow-lg">
                {item.children.map((child) => (
                  <button
                    key={child.label}
                    type="button"
                    role="menuitem"
                    className="menu-row"
                    onClick={() => {
                      child.run()
                      setPoint(null)
                    }}
                  >
                    <MenuLabel label={child.label} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="menu-row"
            disabled={item.disabled}
            aria-disabled={item.disabled || undefined}
            onClick={() => {
              rememberSelection(editor)
              item.run?.()
              setPoint(null)
            }}
          >
            <MenuLabel label={item.label} />
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

/** The selection's first word, or with no selection the word the caret is in (Word's "Search “word”"). */
export function selectedWord(editor: Editor) {
  const { from, to, empty, $from } = editor.state.selection
  if (empty) {
    const text = $from.parent.textBetween(0, $from.parent.content.size, "\uFFFC", "\uFFFC")
    const at = $from.parentOffset
    const before = /[\p{L}\p{N}'’-]*$/u.exec(text.slice(0, at))?.[0] ?? ""
    const after = /^[\p{L}\p{N}'’-]*/u.exec(text.slice(at))?.[0] ?? ""
    return (before + after).replace(/^['’-]+|['’-]+$/g, "").slice(0, 40)
  }
  const word = editor.state.doc.textBetween(from, to, " ").trim().split(/\s+/)[0] ?? ""
  return word.slice(0, 40)
}

/** Places a menu of the given size at a click: below and to the right when it fits, else flipped above / to the left,
 * and kept 8 px inside the window. */
export function placeMenu(point: { x: number; y: number }, width: number, height: number, view = { width: innerWidth, height: innerHeight }) {
  const margin = 8
  const left = point.x + width <= view.width - margin ? point.x : Math.max(margin, Math.min(point.x - width, view.width - margin - width))
  const top = point.y + height <= view.height - margin ? point.y : Math.max(margin, Math.min(point.y - height, view.height - margin - height))
  return { left, top }
}

function speak(editor: Editor) {
  if (typeof speechSynthesis === "undefined") {
    return
  }
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel()
    return
  }
  const { from, to, empty } = editor.state.selection
  const text = empty ? editor.state.doc.textContent : editor.state.doc.textBetween(from, to, "\n")
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000))
  utterance.lang = useDocumentStore.getState().pageSetup.language || "en"
  speechSynthesis.speak(utterance)
}
