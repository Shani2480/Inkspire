import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { useHelp } from "@/document/help"

/**
 * The frame of a Word-style dialog (Paragraph, Font).
 *
 * As Word's dialogs do, it keeps one size on every tab and stays where it opened (centred) or where its title bar
 * is dragged, so switching tabs never moves it. It is modal: clicks outside do nothing, Esc cancels, Enter
 * accepts, and Alt+letter jumps to the control whose label underlines that letter (shown while Alt is held).
 * `DialogFrame` gives every other dialog the same frame, without the tabs.
 */

export type DialogTab = { id: string; label: string; letter: string }

export function WordDialog({
  title,
  width,
  height,
  tabs,
  tab,
  onTab,
  keys,
  initialFocus,
  footer,
  suspended = false,
  onAccept,
  onCancel,
  children,
  overlay,
}: {
  title: string
  width: number
  height: number
  tabs: DialogTab[]
  tab: string
  onTab: (tab: string) => void
  /** Alt+letter shortcuts on the current tab: the letter, and the id of the control it reaches. */
  keys: Record<string, string>
  /** The id of the control focused when the dialog opens. */
  initialFocus: string
  /** Buttons at the bottom left, before OK and Cancel. */
  footer?: ReactNode
  /** While a dialog opened from this one is up, its keys are its own. */
  suspended?: boolean
  onAccept: () => void
  onCancel: () => void
  children: ReactNode
  overlay?: ReactNode
}) {
  const [place, setPlace] = useState(() => ({
    x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(8, Math.round((window.innerHeight - height) / 2)),
  }))
  const [showKeys, setShowKeys] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Enter accepts after a spin box has taken in what was typed, which re-renders the owner with a new onAccept.
  const acceptRef = useRef(onAccept)
  acceptRef.current = onAccept
  const prefix = title.toLowerCase().replace(/\W+/g, "-")

  useEffect(() => {
    // After the click that opened the dialog has finished with the editor's focus.
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>(`#${initialFocus}`)?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [initialFocus])

  useEffect(() => {
    if (suspended) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setShowKeys(true)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      const inList = target?.getAttribute("role") === "listbox" || target?.getAttribute("role") === "combobox"
      if (event.key === "Enter" && target?.tagName !== "BUTTON" && target?.tagName !== "SELECT" && !inList) {
        event.preventDefault()
        event.stopPropagation()
        // Let a spin box or combo box take in what was typed first.
        target?.blur()
        window.setTimeout(() => acceptRef.current(), 0)
        return
      }
      if (event.altKey && /^[a-z]$/i.test(event.key)) {
        const letter = event.key.toLowerCase()
        const tabMatch = tabs.find((item) => item.letter.toLowerCase() === letter)
        const id = keys[letter] ?? (tabMatch ? `${prefix}-tab-${tabMatch.id}` : undefined)
        const control = id ? dialogRef.current?.querySelector<HTMLElement>(`#${id}`) : null
        if (control) {
          event.preventDefault()
          event.stopPropagation()
          if (control.getAttribute("role") === "tab" || control.tagName === "BUTTON") {
            control.click()
          } else if (control instanceof HTMLInputElement && control.type === "checkbox") {
            control.click()
            control.focus()
          } else {
            control.focus()
          }
        }
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setShowKeys(false)
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp, true)
    }
  }, [suspended, keys, tabs, prefix, onCancel])

  const startDrag = useDrag(place, setPlace, width)

  return (
    <div className="app-overlay fixed inset-0 z-[80]" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${prefix}-title`}
        className={`word-dialog${showKeys ? " show-keys" : ""}`}
        style={{ left: place.x, top: place.y, width, height }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setShowKeys(false)
          }
        }}
      >
        <TitleBar id={`${prefix}-title`} title={title} onPointerDown={startDrag} onClose={onCancel} />
        <div className="word-dialog-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`${prefix}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => onTab(item.id)}
            >
              <Keyed text={item.label} letter={item.letter} />
            </button>
          ))}
        </div>
        <div className="word-dialog-panel" role="tabpanel">
          {children}
        </div>
        <div className="word-dialog-buttons">
          {footer}
          <span className="flex-1" />
          <button type="button" className="dialog-btn is-primary" onClick={onAccept}>
            OK
          </button>
          <button type="button" className="dialog-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
        {overlay}
      </div>
    </div>
  )
}

type Place = { x: number; y: number }

/** Moves a dialog by its title bar, keeping enough of it on screen to drag it back. */
function useDrag(place: Place | null, setPlace: (place: Place) => void, width: number) {
  return (event: ReactPointerEvent) => {
    if (!place || event.button !== 0 || (event.target as HTMLElement).closest("button")) {
      return
    }
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY, place }
    const move = (moved: PointerEvent) => {
      setPlace({
        x: Math.min(window.innerWidth - 80, Math.max(80 - width, start.place.x + moved.clientX - start.x)),
        y: Math.min(window.innerHeight - 32, Math.max(0, start.place.y + moved.clientY - start.y)),
      })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
}

function TitleBar({
  id,
  title,
  onPointerDown,
  onClose,
}: {
  id: string
  title: string
  onPointerDown: (event: ReactPointerEvent) => void
  onClose: () => void
}) {
  return (
    <div className="word-dialog-title" onPointerDown={onPointerDown}>
      <h2 id={id}>{title}</h2>
      <button
        type="button"
        aria-label="Help"
        title="Help"
        tabIndex={-1}
        onClick={() => useHelp.getState().openHelp("help")}
      >
        ?
      </button>
      <button type="button" aria-label="Close" title="Close" tabIndex={-1} onClick={onClose}>
        ✕
      </button>
    </div>
  )
}

/**
 * The frame of every other dialog: Word's title bar with Help and Close, opened in the middle of the window and
 * moved only by dragging the title bar. It is modal (clicks outside do nothing) and Esc closes it. With
 * `onSubmit` its body is a form, so Enter in a field submits it.
 */
export function DialogFrame({
  title,
  width,
  onClose,
  onSubmit,
  level = 80,
  bodyClassName = "",
  className = "",
  tabs,
  tab,
  onTab,
  bodyHeight,
  height,
  children,
}: {
  title: string
  width: number
  onClose: () => void
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  /** The z-index, for a dialog opened over another. */
  level?: number
  bodyClassName?: string
  /** Classes for the layer behind the dialog. */
  className?: string
  /** Tabs above the body, as on Find and Replace; the body is then the tab's panel. */
  tabs?: { id: string; label: string }[]
  tab?: string
  onTab?: (tab: string) => void
  /** A fixed height for the body, so switching tabs never resizes (or moves) the dialog. */
  bodyHeight?: number
  /** A fixed height for the whole dialog (any CSS length), for one whose content scrolls inside it. */
  height?: string
  children: ReactNode
}) {
  const [place, setPlace] = useState<Place | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const id = `${title.toLowerCase().replace(/\W+/g, "-")}-dialog-title`
  const frameWidth = Math.min(width, window.innerWidth - 16)

  useLayoutEffect(() => {
    // Centred on the height it opens with; later changes of content grow it downwards, so it never jumps.
    const height = dialogRef.current?.offsetHeight ?? 0
    setPlace({
      x: Math.max(8, Math.round((window.innerWidth - frameWidth) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - height) / 2.4)),
    })
    // Only when it opens.
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog opened over this one handles its own Esc.
      const open = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      const top = open[open.length - 1]
      if (event.key === "Escape" && top === dialogRef.current) {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

  const startDrag = useDrag(place, setPlace, frameWidth)
  const body = `word-dialog-body${tabs ? " is-tabbed" : ""} ${bodyClassName}`
  const bodyStyle = bodyHeight ? { height: bodyHeight, flex: "none" } : undefined

  return (
    <div className={`app-overlay fixed inset-0 ${className}`} style={{ zIndex: level }} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="word-dialog is-plain"
        style={{
          left: place?.x ?? 0,
          top: place?.y ?? 0,
          width: frameWidth,
          height,
          // Content that grows after it opens scrolls inside the body instead of running off the screen.
          maxHeight: `calc(100vh - ${place?.y ?? 0}px - 8px)`,
          visibility: place ? undefined : "hidden",
        }}
      >
        <TitleBar id={id} title={title} onPointerDown={startDrag} onClose={onClose} />
        {tabs ? (
          <div className="word-dialog-tabs" role="tablist">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => onTab?.(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {onSubmit ? (
          <form
            className={body}
            style={bodyStyle}
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit(event)
            }}
          >
            {children}
          </form>
        ) : (
          <div className={body} style={bodyStyle}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

/** OK and Cancel at the foot of a dialog, after any `children` (which sit at the left). */
export function DialogButtons({
  onOk,
  onCancel,
  ok = "OK",
  cancel = "Cancel",
  okDisabled = false,
  submit = false,
  children,
}: {
  onOk?: () => void
  onCancel: () => void
  ok?: string
  cancel?: string
  okDisabled?: boolean
  /** The OK button submits the dialog's form. */
  submit?: boolean
  children?: ReactNode
}) {
  return (
    <div className="word-dialog-actions">
      {children}
      <span className="flex-1" />
      <button
        type={submit ? "submit" : "button"}
        className="dialog-btn is-primary"
        disabled={okDisabled}
        onClick={submit ? undefined : onOk}
      >
        {ok}
      </button>
      <button type="button" className="dialog-btn" onClick={onCancel}>
        {cancel}
      </button>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="word-dialog-section">
      <h3>{title}</h3>
      <div className="word-dialog-section-body">{children}</div>
    </section>
  )
}

/** A label whose shortcut letter is underlined while Alt is held. */
export function Keyed({ text, letter }: { text: string; letter: string }) {
  const at = text.indexOf(letter)
  if (at < 0) {
    return <>{text}</>
  }
  return (
    <>
      {text.slice(0, at)}
      <u className="word-dialog-key">{text[at]}</u>
      {text.slice(at + 1)}
    </>
  )
}

export function Label({ htmlFor, text, letter }: { htmlFor: string; text: string; letter: string }) {
  return (
    <label htmlFor={htmlFor} className="whitespace-nowrap">
      <Keyed text={text} letter={letter} />
    </label>
  )
}

export function Check({
  id,
  text,
  letter,
  checked,
  disabled = false,
  onChange,
}: {
  id: string
  text: string
  letter: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={`word-dialog-check${disabled ? " is-disabled" : ""}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <Keyed text={text} letter={letter} />
      </span>
    </label>
  )
}

export function trimNumber(value: number) {
  return String(Math.round(value * 100) / 100)
}

/**
 * A number box with Word's spin buttons: it shows its unit ("1.27 cm"), accepts a number typed with or without
 * one, and steps to the next multiple of `step` with the buttons or the arrow keys.
 */
export function SpinField({
  id,
  value,
  unit,
  step,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  snap,
  disabled = false,
  onChange,
}: {
  id: string
  value: string
  unit: string
  step: number
  min?: number
  max?: number
  snap?: number
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const format = (raw: string) => {
    if (raw === "" || !Number.isFinite(Number(raw))) {
      return ""
    }
    const shown = trimNumber(Number(raw))
    return unit ? `${shown} ${unit}` : shown
  }
  const [text, setText] = useState(format(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) {
      setText(format(value))
    }
  }, [value, unit, editing])

  const settle = (number: number) => {
    let next = Math.min(max, Math.max(min, number))
    if (snap) {
      next = Math.round(next / snap) * snap
    }
    return trimNumber(next)
  }

  const commit = () => {
    setEditing(false)
    const number = parseFloat(text.replace(",", "."))
    if (!Number.isFinite(number)) {
      setText(format(value))
      return
    }
    const next = settle(number)
    setText(format(next))
    onChange(next)
  }

  const stepBy = (direction: 1 | -1) => {
    const typed = parseFloat(text.replace(",", "."))
    const base = Number.isFinite(typed) ? typed : Number(value) || 0
    const index = direction > 0 ? Math.floor(base / step + 1e-6) + 1 : Math.ceil(base / step - 1e-6) - 1
    const next = settle(index * step)
    setEditing(false)
    setText(format(next))
    onChange(next)
  }

  return (
    <span className={`word-dialog-spin${disabled ? " is-disabled" : ""}`}>
      <input
        id={id}
        value={disabled ? "" : text}
        disabled={disabled}
        onChange={(event) => {
          setEditing(true)
          setText(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            stepBy(event.key === "ArrowUp" ? 1 : -1)
          }
        }}
      />
      <span className="word-dialog-spin-buttons">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Increase"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepBy(1)}
        >
          <svg viewBox="0 0 8 4" aria-hidden>
            <path d="M0 4 4 0 8 4Z" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrease"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepBy(-1)}
        >
          <svg viewBox="0 0 8 4" aria-hidden>
            <path d="M0 0 4 4 8 0Z" />
          </svg>
        </button>
      </span>
    </span>
  )
}
