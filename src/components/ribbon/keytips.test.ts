import { describe, expect, it } from "vitest"
import { assignKeys, matchKey, quickAccessKey } from "@/components/ribbon/keytips"

const prefixFree = (keys: string[]) =>
  keys.every((a, i) => keys.every((b, j) => i === j || (!a.startsWith(b) && !b.startsWith(a))))

describe("KeyTips", () => {
  it("keeps Word's letters and gives the rest letters of their names, with no key starting another", () => {
    const keys = assignKeys([
      { label: "Bold", key: "1" },
      { label: "Find", key: "FD" },
      { label: "Font", key: "FF" },
      { label: "Focus" },
      { label: "Read Mode", key: "F" },
      { label: "Immersive Reader" },
      { label: "Side to Side" },
    ])
    expect(keys.slice(0, 3)).toEqual(["1", "FD", "FF"])
    // "F" would start FD and FF, so Read Mode gets its own letters and F is free to start others.
    expect(keys[4]).toBe("RM")
    expect(keys[3]).toBe("FO")
    expect(keys[5]).toBe("IR")
    expect(keys[6]).toBe("ST")
    expect(prefixFree(keys)).toBe(true)
  })

  it("stays prefix-free on a crowded tab", () => {
    const labels = Array.from({ length: 80 }, (_, i) => ({ label: `Fill ${String.fromCharCode(65 + (i % 26))}${i}` }))
    const keys = assignKeys([{ label: "Format", key: "F" }, ...labels])
    expect(keys.every(Boolean)).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
    expect(prefixFree(keys)).toBe(true)
  })

  it("numbers the Quick Access Toolbar as Word does", () => {
    expect([0, 8, 9, 10].map(quickAccessKey)).toEqual(["1", "9", "09", "08"])
  })

  it("completes on the full key and keeps waiting on a start of one", () => {
    expect(matchKey(["FD", "FF", "1"], "F")).toEqual({ open: true })
    expect(matchKey(["FD", "FF", "1"], "FF")).toEqual({ done: 1 })
    expect(matchKey(["FD", "FF", "1"], "Q")).toEqual({ open: false })
  })
})
