import { playEntrance, prefersReducedMotion, type FrameMotion } from "@/document/motion"

/**
 * How each kind of surface arrives: dialogs settle from just below, menus drop from their button, tooltips fade in
 * place, the File pane slides in from the left with its page following, and context menus fade in where they were
 * asked for. The File view the app opens on (is-instant) is simply there.
 */
const ENTRANCES: { selector: string; from: (element: HTMLElement) => FrameMotion; duration: number }[] = [
  { selector: ".word-dialog", from: () => ({ opacity: 0, y: 8 }), duration: 220 },
  {
    selector: '[data-slot="popover-content"]',
    from: (element) => ({ opacity: 0, y: element.dataset.side === "top" ? 6 : -6 }),
    duration: 180,
  },
  { selector: '[data-slot="tooltip-content"]', from: () => ({ opacity: 0 }), duration: 150 },
  { selector: ".backstage:not(.is-instant) .backstage-nav", from: () => ({ opacity: 0, x: -24 }), duration: 260 },
  { selector: ".backstage:not(.is-instant) .backstage-content", from: () => ({ opacity: 0, x: 16 }), duration: 260 },
  { selector: ".spell-menu, .object-menu, .mini-menu", from: () => ({ opacity: 0 }), duration: 160 },
  { selector: ".line-menu-sub", from: () => ({ opacity: 0, x: 12 }), duration: 160 },
]

const ANY = ENTRANCES.map((entry) => entry.selector).join(", ")

function enter(element: HTMLElement) {
  const entrance = ENTRANCES.find((entry) => element.matches(entry.selector))
  if (entrance) {
    playEntrance(element, entrance.from(element), entrance.duration)
  }
}

/**
 * Plays each surface's entrance as it is added to the page, from the frame it first shows. One observer does it for
 * all of them, instead of each dialog and menu component starting its own.
 */
export function installEntrances(root: HTMLElement = document.body) {
  const observer = new MutationObserver((records) => {
    if (prefersReducedMotion()) {
      return
    }
    for (const record of records) {
      for (const node of record.addedNodes) {
        // The document's own text changes all the time and never holds one of these.
        if (!(node instanceof HTMLElement) || node.closest(".ProseMirror")) {
          continue
        }
        if (node.matches(ANY)) {
          enter(node)
        }
        node.querySelectorAll<HTMLElement>(ANY).forEach(enter)
      }
    }
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
