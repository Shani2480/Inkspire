import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Tauri refuses a command the app manifest (`src-tauri/build.rs`) does not list, or that no capability allows, with
// "<name> not allowed. Command not found": registering it in `generate_handler!` is not enough. Open containing
// folder, Share by email and the first-run defaults were refused this way until 2026-11-16.
const root = path.resolve(process.cwd(), "src-tauri")
const read = (file: string) => readFileSync(path.join(root, file), "utf8")

function registered() {
  const handler = /generate_handler!\[([\s\S]*?)\]/.exec(read("src/lib.rs"))?.[1] ?? ""
  return handler
    .split(",")
    .map((item) => item.trim().split("::").pop() ?? "")
    .filter(Boolean)
}

describe("desktop commands", () => {
  it("lists every registered command in the app manifest and allows it in the capability", () => {
    const commands = registered()
    expect(commands.length).toBeGreaterThan(20)
    const manifest = /commands\(&\[([\s\S]*?)\]\)/.exec(read("build.rs"))?.[1] ?? ""
    const listed = [...manifest.matchAll(/"([a-z_]+)"/g)].map((match) => match[1])
    const capability = JSON.parse(read("capabilities/default.json")) as { permissions: unknown[] }
    const allowed = capability.permissions.filter((item): item is string => typeof item === "string")
    const missing = commands.filter(
      (command) => !listed.includes(command) || !allowed.includes(`allow-${command.replace(/_/g, "-")}`),
    )
    expect(missing).toEqual([])
  })
})
