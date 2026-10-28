import { describe, expect, it } from "vitest"
import {
  DEFAULT_QAT,
  SEPARATOR,
  addCommand,
  defaults,
  exportCustomization,
  importCustomization,
  moveCommand,
  parseRibbonCommandId,
  readCustomization,
  removeCommand,
  ribbonCommandId,
} from "@/document/customize"

const known = (id: string) => ["save", "undo", "bold"].includes(id)

describe("customization (22.5)", () => {
  it("adds a command once but a separator as often as asked", () => {
    expect(addCommand(["save"], "undo")).toEqual(["save", "undo"])
    expect(addCommand(["save"], "save")).toEqual(["save"])
    expect(addCommand(["save"], SEPARATOR)).toEqual(["save", SEPARATOR])
    expect(addCommand(["save", SEPARATOR], SEPARATOR)).toEqual(["save", SEPARATOR, SEPARATOR])
  })

  it("removes and moves, and stops at the ends", () => {
    expect(removeCommand(["a", "b", "c"], 1)).toEqual(["a", "c"])
    expect(moveCommand(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"])
    expect(moveCommand(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"])
    expect(moveCommand(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"])
  })

  it("reads a saved arrangement and ignores what is wrong with it", () => {
    expect(readCustomization(null, known)).toEqual(defaults())
    expect(readCustomization("not json", known)).toEqual(defaults())
    const saved = readCustomization(
      JSON.stringify({ qatShown: false, qat: ["bold", "gone", SEPARATOR, "save"], hiddenTabs: ["review", "bogus"] }),
      known,
    )
    expect(saved).toEqual({
      ...defaults(),
      qatShown: false,
      qat: ["bold", SEPARATOR, "save"],
      hiddenTabs: ["review"],
    })
    expect(defaults().qat).toEqual(DEFAULT_QAT)
  })

  it("keeps a ribbon button on the toolbar with its look, and drops a look whose button was taken off", () => {
    const page = ribbonCommandId("insert", "Page Break")
    const table = ribbonCommandId("insert", "Table")
    const saved = readCustomization(
      JSON.stringify({
        qat: ["save", page, "ribbon:nonsense"],
        qatBelow: true,
        qatLabels: true,
        ribbon: { [page]: { icon: "<svg/>", tab: "Insert" }, [table]: { icon: "<svg/>", tab: "Insert" }, x: 1 },
      }),
      known,
    )
    expect(saved.qat).toEqual(["save", page])
    expect(saved.ribbon).toEqual({ [page]: { icon: "<svg/>", tab: "Insert" } })
    expect(saved.qatBelow && saved.qatLabels).toBe(true)
    expect(parseRibbonCommandId(page)).toEqual({ tab: "insert", label: "Page Break" })
    // A name may hold a colon.
    expect(parseRibbonCommandId(ribbonCommandId("home", "Font: size"))).toEqual({ tab: "home", label: "Font: size" })
  })

  it("exports all customizations and imports them back, and refuses a file that is not one", () => {
    const look = { icon: "<svg/>", tab: "Home" }
    const id = ribbonCommandId("home", "Bold")
    const value = {
      ...defaults(),
      qat: ["save", SEPARATOR, id],
      hiddenTabs: ["review"],
      qatBelow: true,
      ribbon: { [id]: look },
    }
    const text = exportCustomization(value)
    expect(JSON.parse(text)).toMatchObject({ format: "inkspire-customizations", version: 2 })
    expect(importCustomization(text, known)).toEqual(value)
    // Any other JSON, or no JSON at all.
    expect(importCustomization(JSON.stringify(value), known)).toBeNull()
    expect(importCustomization("not json", known)).toBeNull()
    // A command this app does not have is dropped, as on load.
    const other = exportCustomization({ ...value, qat: ["save", "teleport"] })
    expect(importCustomization(other, known)!.qat).toEqual(["save"])
  })
})
