import { useEditingOptions } from "@/document/editing-options"
import { useSyncExternalStore, type ReactNode, type Ref } from "react"

const COARSE = "(pointer: coarse)"

function subscribe(listener: () => void) {
  const query = matchMedia(COARSE)
  query.addEventListener?.("change", listener)
  return () => query.removeEventListener?.("change", listener)
}

/**
 * How a popup that follows the selection (the Mini Toolbar, the table's toolbar) appears here: on a touch screen as
 * the Options choose (behind a button by default, so a phone's small screen is not covered each time text is
 * selected); with a mouse, at once, as in Word.
 */
export function useTouchPopups(): "button" | "show" | "off" {
  const coarse = useSyncExternalStore(
    subscribe,
    () => matchMedia(COARSE).matches,
    () => false,
  )
  const choice = useEditingOptions((state) => state.touchPopups)
  if (!coarse) {
    return "show"
  }
  return choice === "off" || choice === "show" ? choice : "button"
}

let lastPointer = ""
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (event) => (lastPointer = event.pointerType), { capture: true, passive: true })
}

/**
 * Whether a `contextmenu` event came from a long press on a touch screen rather than a right-click. There the full
 * right-click menu covered most of a phone's screen each time text was selected; the system's own small Cut / Copy /
 * Paste bar shows instead, and the commands stay in the ribbon.
 */
export function fromTouch(event: MouseEvent) {
  const type = "pointerType" in event ? (event as PointerEvent).pointerType : ""
  return (type || lastPointer) === "touch"
}

/**
 * The small round button that stands for a popup on a touch screen, by what it belongs to: a tap opens the popup.
 * Placed below `anchor` (clear of Android's selection handles and menu, which sit at and above the selection), kept
 * on the screen.
 */
export function PopupChip({
  label,
  icon,
  anchor,
  below = 30,
  onOpen,
  chipRef,
}: {
  label: string
  icon: ReactNode
  anchor: { left: number; right: number; top: number; bottom: number }
  below?: number
  onOpen: () => void
  chipRef?: Ref<HTMLButtonElement>
}) {
  const size = 40
  const left = Math.max(8, Math.min(window.innerWidth - size - 8, anchor.right - size / 2))
  const wanted = anchor.bottom + below
  const top = Math.max(8, wanted + size > window.innerHeight - 8 ? anchor.top - below - size : wanted)
  return (
    <button
      ref={chipRef}
      type="button"
      className="popup-chip"
      aria-label={label}
      title={label}
      style={{ left, top }}
      // Keeps the selection and the keyboard where they are.
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onOpen}
    >
      {icon}
    </button>
  )
}
