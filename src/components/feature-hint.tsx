import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useUserSettings } from "@/document/user-settings"
import { FEATURE_HINTS, type FeatureHint, nextHint, useFeatureHints } from "@/lib/feature-hints"

/** How long the app is open before the first hint, and the pause after one is dismissed before the next. */
export const FIRST_HINT_MS = 20_000
export const NEXT_HINT_MS = 120_000
const POLL_MS = 500
const WIDTH = 280
const GAP = 10

/** The control a hint points at: one with that name that is on screen and can be used. */
export function hintTarget(name: string): HTMLElement | null {
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name) : name.replace(/"/g, '\\"')
  return usable(document.querySelectorAll<HTMLElement>(`[aria-label="${escaped}"]`))
}

/**
 * Every named control on the page, by name, from one look through the page: a look per hint went through a long
 * document a dozen times every half second.
 */
function namedControls() {
  const named = new Map<string, HTMLElement[]>()
  for (const element of document.querySelectorAll<HTMLElement>("[aria-label]")) {
    const name = element.getAttribute("aria-label")!
    const list = named.get(name)
    if (list) {
      list.push(element)
    } else {
      named.set(name, [element])
    }
  }
  return named
}

/** The first of `elements` that is on screen and can be used. */
function usable(elements: Iterable<HTMLElement>): HTMLElement | null {
  for (const element of elements) {
    if (element.closest(".feature-hint") || element.getAttribute("aria-disabled") === "true") {
      continue
    }
    if ((element as HTMLButtonElement).disabled) {
      continue
    }
    const box = element.getBoundingClientRect()
    if (box.width < 4 || box.height < 4) {
      continue
    }
    if (box.bottom < 0 || box.right < 0 || box.top > window.innerHeight || box.left > window.innerWidth) {
      continue
    }
    return element
  }
  return null
}

const PHONE_PANES = [
  "clipboard-pane",
  "comments-sidebar",
  "ai-pane",
  "nav-pane",
  "selection-pane",
  "styles-pane",
  "format-pane",
  "smartart-pane",
]

/** A dialog or menu is open: a hint waits until it closes. Looked at only when a hint is due: it goes through the page. */
function busy() {
  const shown = (element: Element) => element.getClientRects().length > 0
  const open = document.querySelectorAll('[role="dialog"]:not(.feature-hint), [role="menu"], [role="listbox"], .backstage')
  if ([...open].some(shown)) {
    return true
  }
  // A phone's task panes are sheets over the page (index.css): a hint waits until they are closed. Found by class,
  // which the browser keeps a list of, rather than by a selector tried on every element of a long document.
  if (document.documentElement.dataset.device !== "phone") {
    return false
  }
  const panes = PHONE_PANES.flatMap((name) => [...document.getElementsByClassName(name)])
  const rails = [...document.getElementsByClassName("recovery-rail")].filter((rail) =>
    rail.querySelector(':scope > button[aria-expanded="true"]'),
  )
  return [...panes, ...rails].some(shown)
}

type Placed = { hint: FeatureHint; top: number; left: number; beak: number; above: boolean }

function place(hint: FeatureHint, target: HTMLElement): Placed {
  const box = target.getBoundingClientRect()
  const height = 150
  const above = box.bottom + GAP + height > window.innerHeight && box.top - GAP - height > 0
  const center = box.left + box.width / 2
  const left = Math.min(Math.max(8, center - WIDTH / 2), Math.max(8, window.innerWidth - WIDTH - 8))
  return {
    hint,
    top: above ? box.top - GAP : box.bottom + GAP,
    left,
    beak: Math.min(Math.max(16, center - left), WIDTH - 16),
    above,
  }
}

/**
 * Word's teaching callout for Inkspire's special features (`lib/feature-hints.ts`): one at a time, pointing at the
 * feature's control while it is on screen, after the app has been open a while and some time after the last one.
 * A tap on it, or using the feature, dismisses it for good.
 */
export function FeatureHints() {
  const enabled = useFeatureHints((state) => state.enabled)
  const dismissed = useFeatureHints((state) => state.dismissed)
  const dismiss = useFeatureHints((state) => state.dismiss)
  const setupDone = useUserSettings((state) => state.setupDone)
  const [placed, setPlaced] = useState<Placed | null>(null)
  const readyAt = useRef(Date.now() + FIRST_HINT_MS)
  useEffect(() => {
    if (!enabled || !setupDone) {
      setPlaced(null)
      return
    }
    const tick = () => {
      // Every hint dismissed: nothing to look for.
      if (Date.now() < readyAt.current || FEATURE_HINTS.every((hint) => dismissed.includes(hint.id))) {
        setPlaced(null)
        return
      }
      const named = namedControls()
      const target = (name: string) => usable(named.get(name) ?? [])
      const hint = nextHint(FEATURE_HINTS, dismissed, (name) => target(name) !== null)
      const control = hint ? target(hint.target) : null
      if (!hint || !control || busy()) {
        setPlaced(null)
        return
      }
      const next = place(hint, control)
      setPlaced((current) =>
        current &&
        current.hint.id === next.hint.id &&
        Math.abs(current.top - next.top) < 1 &&
        Math.abs(current.left - next.left) < 1
          ? current
          : next,
      )
    }
    tick()
    const timer = window.setInterval(tick, POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, setupDone, dismissed])

  const shownId = placed?.hint.id
  const shownTarget = placed?.hint.target
  useEffect(() => {
    if (!shownId || !shownTarget) {
      return
    }
    // Using the feature is as good as reading about it.
    const used = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const control = target?.closest("[aria-label]")
      if (control && control.getAttribute("aria-label") === shownTarget && !control.closest(".feature-hint")) {
        close(shownId)
      }
    }
    document.addEventListener("click", used, true)
    return () => document.removeEventListener("click", used, true)
  })

  function close(id: string) {
    readyAt.current = Date.now() + NEXT_HINT_MS
    setPlaced(null)
    dismiss(id)
  }

  if (!placed) {
    return null
  }
  const { hint, top, left, beak, above } = placed
  return createPortal(
    <div
      role="dialog"
      aria-label={hint.title}
      className={`feature-hint${above ? " is-above" : ""}`}
      style={{ top, left, width: WIDTH, ["--beak-x" as string]: `${beak}px` }}
      onClick={() => close(hint.id)}
    >
      <p className="feature-hint-title">{hint.title}</p>
      <p className="feature-hint-text">{hint.text}</p>
      <div className="feature-hint-actions">
        <button
          type="button"
          className="feature-hint-button"
          onClick={(event) => {
            event.stopPropagation()
            close(hint.id)
          }}
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  )
}
