import { missingTools } from "@/document/helper-tools"
import { describe, expect, it } from "vitest"

describe("missingTools", () => {
  it("reads the tools a command asked for", () => {
    expect(missingTools("TOOL_MISSING:pandoc,typst")).toEqual(["pandoc", "typst"])
    expect(missingTools(new Error("TOOL_MISSING:typst"))).toEqual(["typst"])
  })
  it("ignores other failures", () => {
    expect(missingTools(new Error("Pandoc could not export this document."))).toEqual([])
  })
})
