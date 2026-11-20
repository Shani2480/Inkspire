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
  for (const element of document.querySelectorAll<HTMLElement>(`[aria-label="${escaped}"]`)) {
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

/** A dialog or menu is open: a hint waits until it closes. */
function busy() {
  const open = document.querySelectorAll<HTMLElement>(
    '[role="dialog"]:not(.feature-hint), [role="menu"], [role="listbox"], .backstage, .read-mode, ' +
      // A phone's task panes are sheets over the page (index.css): a hint waits until they are closed.
      '[data-device="phone"] :is(.clipboard-pane, .recovery-rail:has(> button[aria-expanded="true"]), .comments-sidebar, .ai-pane, .nav-pane, .selection-pane, .styles-pane, .format-pane, .smartart-pane)',
  )
  return [...open].some((element) => element.getClientRects().length > 0)
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
      if (Date.now() < readyAt.current || busy()) {
        setPlaced(null)
        return
      }
      const hint = nextHint(FEATURE_HINTS, dismissed, (name) => hintTarget(name) !== null)
      const target = hint ? hintTarget(hint.target) : null
      if (!hint || !target) {
        setPlaced(null)
        return
      }
      const next = place(hint, target)
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
