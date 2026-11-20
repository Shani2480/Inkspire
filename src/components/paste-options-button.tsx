import { useOptionsDialog } from "@/document/options-dialog"
import { pasteHtmlAs, pastePlainText } from "@/editor/editing-behavior"
import { notePaste, usePasteOptions, type PastedClip } from "@/editor/smart-editing"
import { TextSelection } from "@tiptap/pm/state"
import { useEffect, useReducer, useRef } from "react"

type Mode = "keep" | "merge" | "text"

const CHOICES: { mode: Mode; label: string; letter: string }[] = [
  { mode: "keep", label: "Keep Source Formatting", letter: "K" },
  { mode: "merge", label: "Merge Formatting", letter: "M" },
  { mode: "text", label: "Keep Text Only", letter: "T" },
]

function plainText(clip: PastedClip) {
  if (clip.text) {
    return clip.text
  }
  const box = document.createElement("div")
  box.innerHTML = clip.html ?? ""
  return box.innerText || box.textContent || ""
}

/** Pastes the same clipboard again over what was pasted, in the formatting chosen. */
function repaste(mode: Mode) {
  const { range, clip, view } = usePasteOptions.getState()
  if (!view || view.isDestroyed || !range || !clip) {
    return
  }
  const size = view.state.doc.content.size
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, Math.min(range.from, size), Math.min(range.to, size)),
    ),
  )
  notePaste(clip)
  if (mode !== "text" && clip.html) {
    pasteHtmlAs(view, clip.html, mode)
  } else {
    pastePlainText(view, plainText(clip))
  }
  view.focus()
}

function ClipboardGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <rect x="3" y="2.5" width="10" height="12" rx="1.2" fill="none" stroke="var(--icon-base-color)" />
      <rect x="5.5" y="1.5" width="5" height="2.5" rx="0.6" fill="var(--icon-accent-color)" />
      <path d="M5.5 7.5h5M5.5 10h5M5.5 12.5h3" stroke="var(--icon-muted-color)" strokeLinecap="round" />
    </svg>
  )
}

/** Word's Paste Options button: after a paste, at the end of what was pasted, to paste it again another way. */
export function PasteOptionsButton() {
  const range = usePasteOptions((state) => state.range)
  const clip = usePasteOptions((state) => state.clip)
  const menuOpen = usePasteOptions((state) => state.menuOpen)
  const setMenuOpen = usePasteOptions((state) => state.setMenuOpen)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const lone = useRef(false)

  // Follow the page as it scrolls or the window changes size.
  useEffect(() => {
    if (!range) {
      return
    }
    window.addEventListener("scroll", redraw, true)
    window.addEventListener("resize", redraw)
    return () => {
      window.removeEventListener("scroll", redraw, true)
      window.removeEventListener("resize", redraw)
    }
  }, [range])

  // Ctrl pressed and let go on its own opens the menu, as in Word; then K, M or T choose.
  useEffect(() => {
    if (!range) {
      return
    }
    const down = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        lone.current = !event.repeat
        return
      }
      lone.current = false
      if (usePasteOptions.getState().menuOpen) {
        const choice = CHOICES.find((item) => item.letter.toLowerCase() === event.key.toLowerCase())
        if (choice && !event.ctrlKey) {
          event.preventDefault()
          event.stopPropagation()
          setMenuOpen(false)
          repaste(choice.mode)
        } else if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          setMenuOpen(false)
        }
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === "Control" && lone.current) {
        setMenuOpen(!usePasteOptions.getState().menuOpen)
      }
      lone.current = false
    }
    window.addEventListener("keydown", down, true)
    window.addEventListener("keyup", up, true)
    return () => {
      window.removeEventListener("keydown", down, true)
      window.removeEventListener("keyup", up, true)
    }
  }, [range, setMenuOpen])

  const view = usePasteOptions((state) => state.view)
  if (!range || !clip || !view || view.isDestroyed) {
    return null
  }
  let at: { left: number; bottom: number }
  try {
    at = view.coordsAtPos(Math.min(range.to, view.state.doc.content.size))
  } catch {
    return null
  }
  const left = Math.min(at.left + 4, window.innerWidth - 80)
  const top = Math.min(at.bottom + 4, window.innerHeight - 30)
  return (
    <div className="paste-options" style={{ left, top }} onMouseDown={(event) => event.preventDefault()}>
      <button
        type="button"
        className="paste-options-button"
        aria-label="Paste Options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Paste Options (Ctrl)"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <ClipboardGlyph />
        <span className="paste-options-ctrl">(Ctrl)</span>
        <svg viewBox="0 0 8 8" width="8" height="8" aria-hidden>
          <path d="M1.5 3l2.5 2.5L6.5 3" fill="none" stroke="currentColor" />
        </svg>
      </button>
      {menuOpen ? (
        <div className="paste-options-menu" role="menu" aria-label="Paste Options">
          <p className="paste-options-title">Paste Options:</p>
          {CHOICES.map((choice) => (
            <button
              key={choice.mode}
              type="button"
              role="menuitem"
              className="paste-options-item"
              disabled={choice.mode !== "text" && !clip.html}
              onClick={() => {
                setMenuOpen(false)
                repaste(choice.mode)
              }}
            >
              <span>{choice.label}</span>
              <span className="paste-options-key">({choice.letter})</span>
            </button>
          ))}
          <div className="paste-options-separator" />
          <button
            type="button"
            role="menuitem"
            className="paste-options-item"
            onClick={() => {
              setMenuOpen(false)
              useOptionsDialog.getState().openOptions("advanced")
            }}
          >
            Set Default Paste…
          </button>
        </div>
      ) : null}
    </div>
  )
}
