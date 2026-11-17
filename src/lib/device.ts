import { useSyncExternalStore } from "react"

/**
 * The kind of screen the app is on. A phone is a touch screen whose short side is under 600 css px (Android's own
 * line between phones and tablets); it gets Word mobile's layout: the ribbon at the bottom, the page fitted to the
 * width, task panes as sheets. Tablets and desktops keep the full layout. The root carries it as `data-device`, so
 * the styles follow it too.
 */
export type Device = "phone" | "tablet" | "desktop"

const PHONE_SHORT_SIDE = 600

export function detectDevice(
  screenSize = typeof screen === "undefined" ? null : { width: screen.width, height: screen.height },
  coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
): Device {
  if (!coarse || !screenSize) {
    return "desktop"
  }
  return Math.min(screenSize.width, screenSize.height) < PHONE_SHORT_SIDE ? "phone" : "tablet"
}

let current: Device = detectDevice()
const listeners = new Set<() => void>()

function update() {
  const next = detectDevice()
  if (typeof document !== "undefined") {
    document.documentElement.dataset.device = next
  }
  if (next !== current) {
    current = next
    listeners.forEach((listener) => listener())
  }
}

/** Marks the root and keeps it right as the screen changes (a foldable opened, a tablet's pointer changed). */
export function installDevice() {
  update()
  window.addEventListener("resize", update)
  matchMedia("(pointer: coarse)").addEventListener?.("change", update)
}

export function currentDevice() {
  return current
}

export function isPhone() {
  return current === "phone"
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDevice(): Device {
  return useSyncExternalStore(subscribe, currentDevice, () => "desktop")
}
