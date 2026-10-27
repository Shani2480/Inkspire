import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installEntrances } from "@/document/entrances"
import { cubicBezier } from "@/document/motion"

let uninstall = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  uninstall = installEntrances()
})
afterEach(() => {
  uninstall()
  document.body.innerHTML = ""
  vi.useRealTimers()
})

const added = async (html: string) => {
  document.body.insertAdjacentHTML("beforeend", html)
  await Promise.resolve()
  return document.body.lastElementChild as HTMLElement
}

describe("entrances drawn frame by frame", () => {
  it("brings a dialog in from unseen, just below, and settles where it belongs", async () => {
    const dialog = await added('<div class="word-dialog"></div>')
    expect(dialog.style.opacity).toBe("0")
    expect(dialog.style.translate).toBe("0px 8px")
    vi.advanceTimersToNextFrame()
    expect(Number(dialog.style.opacity)).toBeGreaterThan(0)
    vi.advanceTimersByTime(400)
    expect(dialog.style.opacity).toBe("1")
    expect(dialog.style.translate).toBe("0px 0px")
  })

  it("finds a menu inside what was added, and drops a ribbon menu from above its button", async () => {
    const wrapper = await added(
      '<div><div data-slot="popover-content" class="ribbon-menu" data-side="bottom"></div></div>',
    )
    const menu = wrapper.firstElementChild as HTMLElement
    expect(menu.style.translate).toBe("0px -6px")
  })

  it("leaves the File view the app opens on alone", async () => {
    const backstage = await added('<div class="backstage is-instant"><aside class="backstage-nav"></aside></div>')
    expect((backstage.firstElementChild as HTMLElement).style.opacity).toBe("")
  })

  it("never looks inside the document", async () => {
    const editor = await added('<div class="ProseMirror"></div>')
    editor.insertAdjacentHTML("beforeend", '<div class="word-dialog"></div>')
    await Promise.resolve()
    expect((editor.firstElementChild as HTMLElement).style.opacity).toBe("")
  })
})

describe("cubicBezier", () => {
  it("runs from 0 to 1 along the curve", () => {
    const linear = cubicBezier(0, 0, 1, 1)
    expect(linear(0)).toBe(0)
    expect(linear(1)).toBe(1)
    expect(linear(0.5)).toBeCloseTo(0.5, 3)
    expect(cubicBezier(0.2, 0, 0, 1)(0.5)).toBeGreaterThan(0.8)
  })
})
