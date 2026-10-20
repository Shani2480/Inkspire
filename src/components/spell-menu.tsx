import { MenuButton } from "@/components/ribbon/ribbon-button"
import { replaceSpelling } from "@/editor/actions"
import { refreshDisplayedMarks } from "@/editor/display-refresh"
import { useDocumentEditor } from "@/editor/document-editor"
import { addToDictionary, ignoreSpelling, spellingSuggestions } from "@/editor/spellcheck"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

type SpellMenuState = {
  from: number
  to: number
  word: string
  suggestions: string[]
  x: number
  y: number
}

export function SpellMenu() {
  const editor = useDocumentEditor()
  const [menu, setMenu] = useState<SpellMenuState | null>(null)

  // Underlines come from checking as you type or from a manual check; either way, clicking one offers fixes.
  useEffect(() => {
    if (!editor) {
      return
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const error = target.closest(".spell-error")
      if (!(error instanceof HTMLElement)) {
        setMenu(null)
        return
      }

      const from = Number(error.dataset.spellFrom)
      const to = Number(error.dataset.spellTo)
      if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from) {
        return
      }
      const word = editor.state.doc.textBetween(from, to)
      if (!word) {
        return
      }
      const rect = error.getBoundingClientRect()
      setMenu({
        from,
        to,
        word,
        suggestions: spellingSuggestions(word),
        x: rect.left,
        y: rect.bottom + 4,
      })
    }

    editor.view.dom.addEventListener("click", onClick)
    return () => editor.view.dom.removeEventListener("click", onClick)
  }, [editor])

  useEffect(() => {
    if (!editor) {
      return
    }
    const close = () => setMenu(null)
    editor.on("update", close)
    return () => {
      editor.off("update", close)
    }
  }, [editor])

  useEffect(() => {
    if (!menu) {
      return
    }
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
      }
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        close()
        return
      }
      const element = target instanceof Element ? target : target.parentElement
      if (element?.closest("[data-spell-menu], .spell-error")) {
        return
      }
      close()
    }
    const scroll = document.getElementById("document-scroll")
    scroll?.addEventListener("scroll", close)
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onPointer)
    return () => {
      scroll?.removeEventListener("scroll", close)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onPointer)
    }
  }, [menu])

  if (!menu || !editor) {
    return null
  }

  const width = 192
  const height = 36 + menu.suggestions.length * 32 + 80
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8))
  const top = menu.y + height > window.innerHeight ? Math.max(8, menu.y - height - 8) : menu.y

  return createPortal(
    <div
      data-spell-menu
      role="menu"
      aria-label={`Spelling suggestions for ${menu.word}`}
      className="spell-menu"
      style={{ left, top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {menu.suggestions.length === 0 ? (
        <p className="spell-menu-muted">No suggestions</p>
      ) : (
        menu.suggestions.map((suggestion) => (
          <MenuButton
            key={suggestion}
            className="spell-menu-item"
            onClick={() => {
              replaceSpelling(editor, menu.from, menu.to, suggestion)
              setMenu(null)
            }}
          >
            {suggestion}
          </MenuButton>
        ))
      )}
      <div className="spell-menu-actions">
        <MenuButton
          className="spell-menu-item"
          onClick={() => {
            addToDictionary(menu.word)
            refreshDisplayedMarks(editor)
            setMenu(null)
          }}
        >
          Add to dictionary
        </MenuButton>
        <MenuButton
          className="spell-menu-item"
          onClick={() => {
            ignoreSpelling(menu.word)
            refreshDisplayedMarks(editor)
            setMenu(null)
          }}
        >
          Ignore
        </MenuButton>
      </div>
    </div>,
    document.body,
  )
}
