import { assignKeys, COMMAND_KEYS, matchKey, quickAccessKey, TAB_KEYS } from "@/components/ribbon/keytips"
import { useBodyEditor } from "@/editor/document-editor"
import { rememberSelection } from "@/editor/selection-memory"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type Badge = { key: string; element: HTMLElement; x: number; y: number; disabled: boolean; tab?: boolean }
type Mode = { level: "tabs" | "commands"; typed: string; badges: Badge[] } | null

const visible = (element: Element) => {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden"
}
const labelOf = (element: Element) =>
  (
    element.getAttribute("aria-label") ||
    (element instanceof HTMLInputElement ? element.labels?.[0]?.textContent : element.textContent) ||
    ""
  ).trim()
const isDisabled = (element: Element) =>
  element.matches(":disabled") || element.getAttribute("aria-disabled") === "true"

/** The tab panel in front: hidden tabs stay mounted with `display: none` (see the office-style-ui notes). */
function shownPanel() {
  return [...document.querySelectorAll<HTMLElement>(".app-ribbon [data-ribbon-tab]")].find(
    (panel) => !panel.hidden && panel.style.display !== "none" && panel.offsetParent !== null,
  )
}

/** Level one: File, the tabs and the Quick Access Toolbar, as Word badges them. */
function tabBadges(): Badge[] {
  const items: { element: HTMLElement; label: string; key?: string; tab: boolean }[] = []
  const file = document.querySelector<HTMLElement>(".ribbon-file-tab")
  if (file && visible(file)) {
    items.push({ element: file, label: "File", key: "F", tab: true })
  }
  for (const tab of document.querySelectorAll<HTMLElement>(".app-ribbon [role=tab]")) {
    const label = labelOf(tab)
    if (visible(tab) && label && label !== "File") {
      items.push({ element: tab, label, key: TAB_KEYS[label] ?? undefined, tab: true })
    }
  }
  const keys = assignKeys(items)
  const quick = [...document.querySelectorAll<HTMLElement>('[aria-label="Quick access"] button')].filter(visible)
  return [
    ...items.map((item, index) => place(item.element, keys[index], true)),
    ...quick.map((element, index) => place(element, quickAccessKey(index), false)),
  ]
}

/** Level two: the commands of the tab in front. */
function commandBadges(): Badge[] {
  const panel = shownPanel()
  if (!panel) {
    return []
  }
  const known = COMMAND_KEYS[panel.dataset.ribbonTab ?? ""] ?? {}
  const bounds = panel.getBoundingClientRect()
  const controls = [
    ...panel.querySelectorAll<HTMLElement>("button, [role=button], [role=combobox], input:not([type=hidden])"),
  ].filter((element) => {
    if (!visible(element) || element.closest(".ribbon-style")) {
      return false
    }
    // Controls scrolled out of the ribbon's view get no badge.
    const rect = element.getBoundingClientRect()
    return rect.right > bounds.left && rect.left < bounds.right
  })
  const items: { element: HTMLElement; label: string; key?: string }[] = []
  const byLabel = new Map<string, number>()
  for (const element of controls) {
    const label = labelOf(element)
    if (!label || /^(Previous|Next) styles$/.test(label)) {
      continue
    }
    const launcher = element.classList.contains("ribbon-launcher")
    // A split button's arrow ("Bullets menu", "Underline styles", "Paste options") shares its button's key: the
    // key goes to the arrow when Word's key opens the menu.
    const main = /^(.+?) (menu|options|styles)$/.exec(label)?.[1]
    if (main && byLabel.has(main) && !launcher) {
      const entry = known[main]
      if (typeof entry === "object" && entry.menu) {
        items[byLabel.get(main)!].element = element
      }
      continue
    }
    if (byLabel.has(label) && !launcher) {
      continue
    }
    const entry = known[launcher ? `@${label}` : label]
    items.push({ element, label, key: typeof entry === "object" ? entry.key : entry })
    if (!launcher) {
      byLabel.set(label, items.length - 1)
    }
  }
  const keys = assignKeys(items)
  return items.map((item, index) => place(item.element, keys[index], false))
}

/** A badge under the middle of its control, kept on screen. */
function place(element: HTMLElement, key: string, tab: boolean): Badge {
  const rect = element.getBoundingClientRect()
  const x = Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width / 2))
  const y = Math.min(window.innerHeight - 18, rect.bottom - (tab ? 6 : rect.height > 40 ? 14 : 10))
  return { key, element, x, y, disabled: isDisabled(element), tab }
}

const nextFrames = (run: () => void) => requestAnimationFrame(() => requestAnimationFrame(run))

/**
 * Word's KeyTips: Alt (released on its own) or F10 shows them; Alt+letter goes straight to a tab. Letters choose,
 * Backspace takes a letter back, Esc goes back a level, and a click, Alt or leaving the window hides them.
 */
export function KeyTipsLayer() {
  const editor = useBodyEditor()
  const [mode, setMode] = useState<Mode>(null)
  const modeRef = useRef<Mode>(null)
  modeRef.current = mode
  const editorRef = useRef(editor)
  editorRef.current = editor

  useEffect(() => {
    let altAlone = false
    const blocked = () => !!document.querySelector('[aria-modal="true"], .backstage, [data-backstage]')
    const show = (level: "tabs" | "commands", typed = "") =>
      setMode({ level, typed, badges: level === "tabs" ? tabBadges() : commandBadges() })
    const hide = () => setMode(null)
    const press = (badge: Badge) => {
      if (badge.disabled) {
        return
      }
      if (editorRef.current) {
        rememberSelection(editorRef.current)
      }
      if (badge.tab && badge.element.getAttribute("role") === "tab") {
        badge.element.click()
        setMode({ level: "commands", typed: "", badges: [] })
        nextFrames(() => {
          if (modeRef.current?.level === "commands") {
            show("commands")
          }
        })
        return
      }
      hide()
      if (badge.element instanceof HTMLInputElement && !["checkbox", "radio"].includes(badge.element.type)) {
        badge.element.focus()
        badge.element.select()
        return
      }
      badge.element.click()
    }
    const type = (current: NonNullable<Mode>, letter: string) => {
      const typed = current.typed + letter
      const keys = current.badges.map((badge) => badge.key)
      const found = matchKey(keys, typed)
      if ("done" in found) {
        press(current.badges[found.done])
      } else if (found.open) {
        setMode({ ...current, typed })
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const current = modeRef.current
      if (event.key === "Alt") {
        altAlone = !event.repeat && !event.ctrlKey && !event.metaKey && !event.shiftKey
        return
      }
      altAlone = false
      if (current) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === "Escape") {
          if (current.typed) {
            setMode({ ...current, typed: "" })
          } else if (current.level === "commands") {
            show("tabs")
          } else {
            hide()
          }
        } else if (event.key === "Backspace") {
          setMode({ ...current, typed: current.typed.slice(0, -1) })
        } else if (event.key === "F10") {
          hide()
        } else if (/^[a-z0-9]$/i.test(event.key) && !event.ctrlKey && !event.metaKey) {
          type(current, event.key.toUpperCase())
        } else if (!["Shift", "Control", "Meta", "CapsLock"].includes(event.key)) {
          hide()
        }
        return
      }
      if (blocked()) {
        return
      }
      if (event.key === "F10" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        show("tabs")
        return
      }
      // Alt+H and the like: the tab level with that letter typed. Alt with Shift, Ctrl or a symbol stays a shortcut.
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        /^Key[A-Z]$|^Digit\d$/.test(event.code)
      ) {
        const letter = event.code.slice(-1)
        const badges = tabBadges()
        if (badges.some((badge) => badge.key.startsWith(letter))) {
          event.preventDefault()
          event.stopPropagation()
          type({ level: "tabs", typed: "", badges }, letter)
        }
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Alt") {
        return
      }
      const alone = altAlone
      altAlone = false
      if (!alone) {
        return
      }
      event.preventDefault()
      if (modeRef.current) {
        hide()
      } else if (!blocked()) {
        show("tabs")
      }
    }
    const onAway = () => {
      altAlone = false
      if (modeRef.current) {
        hide()
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp, true)
    window.addEventListener("pointerdown", onAway, true)
    window.addEventListener("blur", onAway)
    window.addEventListener("resize", onAway)
    window.addEventListener("wheel", onAway, { passive: true })
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp, true)
      window.removeEventListener("pointerdown", onAway, true)
      window.removeEventListener("blur", onAway)
      window.removeEventListener("resize", onAway)
      window.removeEventListener("wheel", onAway)
    }
  }, [])

  if (!mode) {
    return null
  }
  return createPortal(
    <div className="keytips-layer" aria-hidden data-keytips={mode.level}>
      {mode.badges
        .filter((badge) => badge.key.startsWith(mode.typed))
        .map((badge, index) => (
          <span
            key={`${badge.key}-${index}`}
            className="keytip"
            data-disabled={badge.disabled || undefined}
            style={{ left: badge.x, top: badge.y }}
          >
            {badge.key}
          </span>
        ))}
    </div>,
    document.body,
  )
}
