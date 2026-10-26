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
import { chainWithSelection, rememberSelection } from "@/editor/selection-memory"
import { inTable } from "@/editor/table-tools"
import type { Editor } from "@tiptap/core"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

type Item = {
  id: string
  label: string
  run?: () => void
  children?: { label: string; run: () => void }[]
}

export function TextContextMenu({ editor }: { editor: Editor | null }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [query, setQuery] = useState("")
  const [pasteOpen, setPasteOpen] = useState(false)
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
      // Selected cells stay selected only for a right-click on them; elsewhere the caret goes to the click, as in Word.
      const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (editor.state.selection instanceof CellSelection && hit && !insideSelection(editor, hit.pos)) {
        editor.commands.setTextSelection(hit.pos)
      }
      rememberSelection(editor)
      setQuery("")
      setPasteOpen(false)
      setPoint({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 280)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 360)),
      })
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

  if (!editor || !point) {
    return null
  }

  const word = selectedWord(editor)
  const entries: Item[] = [
    { id: "cut", label: "Cut", run: () => cutSelection(editor) },
    { id: "copy", label: "Copy", run: () => copySelection(editor) },
    {
      id: "paste",
      label: "Paste Options",
      children: [
        { label: "Keep Source Formatting", run: () => void pasteFromClipboard(editor, "source") },
        { label: "Merge Formatting", run: () => void pasteFromClipboard(editor, "merge") },
        { label: "Keep Text Only", run: () => void pasteFromClipboard(editor, "text") },
        ...items.slice(0, 3).map((item) => ({ label: item.text.slice(0, 42), run: () => pasteStored(editor, item) })),
      ],
    },
    { id: "font", label: "Font…", run: () => requestFormatDialog("font") },
    { id: "paragraph", label: "Paragraph…", run: () => requestFormatDialog("paragraph") },
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
    { id: "search", label: `Search “${word || "show"}”`, run: () => findSelection(word || "show") },
    { id: "synonyms", label: "Synonyms", run: () => useProofing.getState().openPanel("thesaurus") },
    { id: "aloud", label: "Read Aloud", run: () => speak(editor) },
    { id: "translate", label: "Translate", run: () => useProofing.getState().openPanel("translation") },
    {
      id: "link",
      label: "Link",
      run: () => {
        void askText({ title: "Insert Hyperlink", label: "Address:", value: "https://" }).then((href) => {
          if (href) {
            chainWithSelection(editor).setLink({ href }).run()
          }
        })
      },
    },
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
      style={{ left: Math.min(point.x, window.innerWidth - 272), top: Math.min(point.y, window.innerHeight - 360) }}
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

function selectedWord(editor: Editor) {
  const { from, to, empty } = editor.state.selection
  const text = empty ? "" : editor.state.doc.textBetween(from, to, " ")
  const word = text.trim().split(/\s+/)[0] ?? ""
  return word.slice(0, 40)
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
