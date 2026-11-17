import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { APP_VERSION, RELEASES, updatedSinceLastRun } from "@/lib/release-notes"

function memory(initial: string | null) {
  const store = new Map<string, string>()
  if (initial !== null) {
    store.set("inkspire:last-version", initial)
  }
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  }
}

describe("Release notes", () => {
  it("has notes for the version being built, newest first", () => {
    expect(RELEASES[0]!.version).toBe(APP_VERSION)
    expect(RELEASES[0]!.notes.length).toBeGreaterThan(0)
    const order = RELEASES.map((release) => release.version.split(".").map(Number))
    for (let index = 1; index < order.length; index += 1) {
      const [a, b] = [order[index - 1]!, order[index]!]
      expect(a[0]! * 1e6 + a[1]! * 1e3 + a[2]!).toBeGreaterThan(b[0]! * 1e6 + b[1]! * 1e3 + b[2]!)
    }
  })

  it("keeps one version in the app, the desktop build and the Rust crate", () => {
    const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as { version: string }
    const cargo = /^version = "([^"]+)"/m.exec(readFileSync("src-tauri/Cargo.toml", "utf8"))?.[1]
    expect(tauri.version).toBe(APP_VERSION)
    expect(cargo).toBe(APP_VERSION)
  })

  it("shows What's New once after an update, not on the first start", () => {
    const first = memory(null)
    expect(updatedSinceLastRun(first)).toBe(false)
    expect(updatedSinceLastRun(first)).toBe(false)
    const updated = memory("0.0.1")
    expect(updatedSinceLastRun(updated)).toBe(true)
    expect(updatedSinceLastRun(updated)).toBe(false)
    expect(updatedSinceLastRun(null)).toBe(false)
  })
})
