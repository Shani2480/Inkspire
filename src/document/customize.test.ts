import { describe, expect, it } from "vitest"
import {
  DEFAULT_QAT,
  SEPARATOR,
  addCommand,
  defaults,
  moveCommand,
  readCustomization,
  removeCommand,
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
    expect(saved).toEqual({ qatShown: false, qat: ["bold", SEPARATOR, "save"], hiddenTabs: ["review"] })
    expect(defaults().qat).toEqual(DEFAULT_QAT)
  })
})
