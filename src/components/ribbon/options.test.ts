import { describe, expect, it } from "vitest"
import { fontLabel } from "@/components/ribbon/options"

describe("the font box's name", () => {
  it("drops the quotes a Word file's font comes with", () => {
    expect(fontLabel(`'Times New Roman', serif`)).toBe("Times New Roman")
    expect(fontLabel(`"Aptos Display"`)).toBe("Aptos Display")
  })
})
