import { parseRibbonCommandId, ribbonCommandId, type RibbonCommandLook } from "@/document/customize"

/**
 * Ribbon buttons on the Quick Access Toolbar (22.5). Any button on the ribbon can be added (right-click → Add to Quick
 * Access Toolbar, or the Customize dialog's per-tab lists). The toolbar runs it by pressing the ribbon's own button,
 * so it does exactly what the ribbon does. A main tab stays built while hidden and its buttons work from there; a
 * button that opens a menu or gallery brings its tab to the front first, so the menu opens where it belongs.
 */

const PANEL = "[data-ribbon-tab]"
const BUTTON = "button[aria-label], [role='button'][aria-label]"
const CUSTOM = "[data-group^='custom:']"

let showTab: ((id: string) => void) | null = null

/** The ribbon tells this module how to bring a tab to the front. */
export function registerRibbonTabSetter(setter: ((id: string) => void) | null) {
  showTab = setter
}

/** The ribbon's buttons that are not commands: scrolling the tab, the layout toggle. */
const NOT_COMMANDS =
  /^(Scroll ribbon|Previous styles|Next styles|More styles|Show the |Collapse the |Simplified Ribbon|Classic Ribbon)/

/** The ribbon command a press or right-click landed on, with the look the toolbar draws it with; null for none. */
export function ribbonCommandAt(
  target: EventTarget | null,
): { id: string; label: string; look: RibbonCommandLook } | null {
  if (!(target instanceof Element)) {
    return null
  }
  const button = target.closest<HTMLElement>(BUTTON)
  // A button in a group the user made is a copy of a ribbon command, not one of its own.
  if (button?.closest(CUSTOM)) {
    return null
  }
  const panel = button?.closest<HTMLElement>(PANEL)
  const label = button?.getAttribute("aria-label")?.trim()
  const tab = panel?.dataset.ribbonTab
  if (!button || !panel || !label || !tab || NOT_COMMANDS.test(label)) {
    return null
  }
  return {
    id: ribbonCommandId(tab, label),
    label,
    look: { icon: iconOf(button), tab: panel.dataset.ribbonTabLabel || tab },
  }
}

/** Every command on a built tab, once each, in ribbon order. */
export function ribbonCommandsOn(tab: string) {
  const panel = document.querySelector(`${PANEL}[data-ribbon-tab="${CSS.escape(tab)}"]`)
  const found = new Map<string, { id: string; label: string; look: RibbonCommandLook }>()
  for (const button of panel?.querySelectorAll<HTMLElement>(BUTTON) ?? []) {
    const command = ribbonCommandAt(button)
    if (command && !found.has(command.id)) {
      found.set(command.id, command)
    }
  }
  return [...found.values()]
}

function buttonFor(id: string) {
  const parsed = parseRibbonCommandId(id)
  if (!parsed) {
    return null
  }
  const panel = document.querySelector(`${PANEL}[data-ribbon-tab="${CSS.escape(parsed.tab)}"]`)
  const found = panel?.querySelectorAll<HTMLElement>(`[aria-label="${CSS.escape(parsed.label)}"]`) ?? []
  // The ribbon's own button, not a copy in a group the user made (which would press itself).
  return [...found].find((button) => !button.closest(CUSTOM)) ?? null
}

/** Whether a ribbon command can be used now: its tab is built (a tool tab only while its object is selected). */
export function ribbonCommandEnabled(id: string) {
  const button = buttonFor(id)
  return Boolean(button) && !isDisabled(button!)
}

function isDisabled(button: HTMLElement) {
  return (
    (button instanceof HTMLButtonElement && button.disabled) ||
    button.getAttribute("aria-disabled") === "true" ||
    button.hasAttribute("data-disabled")
  )
}

/** Runs a ribbon command from the toolbar; false when its button is not there or not usable. */
export function runRibbonCommand(id: string) {
  const parsed = parseRibbonCommandId(id)
  const button = buttonFor(id)
  if (!parsed || !button || isDisabled(button)) {
    return false
  }
  const opensPopup = button.hasAttribute("aria-haspopup") || button.hasAttribute("aria-expanded")
  if (opensPopup && !button.offsetParent && showTab) {
    showTab(parsed.tab)
    // Pressed once the tab is in front, so its menu opens under the button.
    requestAnimationFrame(() => requestAnimationFrame(() => buttonFor(id)?.click()))
    return true
  }
  button.click()
  return true
}

/** The button's icon as SVG markup, coloured as drawn now, so the toolbar can show it while the tab is not built. */
function iconOf(button: HTMLElement) {
  const svg = button.querySelector("svg")
  if (!svg) {
    return ""
  }
  const copy = svg.cloneNode(true) as SVGElement
  // Parts coloured by a class (the ribbon's accent colours) keep the colour they are drawn in; the rest follow the
  // toolbar's text colour, as they follow the ribbon's.
  const originals = [svg, ...svg.querySelectorAll("*")]
  const copies = [copy, ...copy.querySelectorAll("*")]
  originals.forEach((original, index) => {
    const part = copies[index]
    if (part && index > 0 && original.getAttribute("class")) {
      const style = getComputedStyle(original)
      for (const property of ["fill", "stroke"] as const) {
        const value = style.getPropertyValue(property)
        if (value && !/currentcolor/i.test(original.getAttribute(property) ?? "")) {
          part.setAttribute(property, value)
        }
      }
    }
    part?.removeAttribute("class")
    part?.removeAttribute("style")
  })
  copy.setAttribute("width", "16")
  copy.setAttribute("height", "16")
  if (!copy.getAttribute("xmlns")) {
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  }
  return cleanIcon(copy.outerHTML)
}

/**
 * An icon kept in the user's settings, made safe to draw: SVG drawing elements and plain presentation attributes
 * only, so markup put in the saved settings by hand cannot run anything.
 */
export function cleanIcon(markup: string) {
  if (!markup) {
    return ""
  }
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml")
  const root = parsed.documentElement
  if (root.nodeName !== "svg" || parsed.querySelector("parsererror")) {
    return ""
  }
  const allowed = new Set([
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "defs",
    "linearGradient",
    "radialGradient",
    "stop",
    "clipPath",
    "mask",
    "title",
  ])
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (!allowed.has(element.nodeName)) {
      element.remove()
      continue
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.toLowerCase()
      if (name.startsWith("on") || name.includes("href") || /javascript:|url\((?!["']?#)/.test(value)) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  return new XMLSerializer().serializeToString(root)
}
