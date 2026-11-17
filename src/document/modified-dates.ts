import { invoke } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"
import { isTauriRuntime } from "@/lib/platform"

/**
 * Recent's "Date modified": when each document was last changed. The desktop app reads the file's date
 * (`documents_modified`); Android asks the place a picked document lives in (`InkspireFiles.lastModified`); the
 * browser knows none.
 */
async function readModified(paths: string[]): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  if (!isTauriRuntime() || paths.length === 0) {
    return found
  }
  const android = (globalThis as { InkspireFiles?: { lastModified?: (uri: string) => number } }).InkspireFiles
  const files = paths.filter((path) => !path.startsWith("content:"))
  for (const path of paths) {
    if (path.startsWith("content:") && android?.lastModified) {
      const ms = Number(android.lastModified(path))
      if (ms > 0) {
        found.set(path, ms)
      }
    }
  }
  if (files.length > 0) {
    try {
      const times = await invoke<Array<number | null>>("documents_modified", { paths: files })
      files.forEach((path, index) => {
        const ms = times[index]
        if (typeof ms === "number" && ms > 0) {
          found.set(path, ms)
        }
      })
    } catch {
      // Dates are a courtesy: the list shows without them.
    }
  }
  return found
}

export function useModifiedDates(paths: string[]) {
  const [dates, setDates] = useState<Map<string, number>>(() => new Map())
  const key = paths.join("\n")
  useEffect(() => {
    let live = true
    void readModified(key ? key.split("\n") : []).then((found) => {
      if (live) {
        setDates(found)
      }
    })
    return () => {
      live = false
    }
  }, [key])
  return dates
}

/** As Word's lists show it: the time for today, the day and month this year, the full date before. */
export function formatModified(ms: number | undefined, now = new Date(), locale?: string) {
  if (!ms) {
    return "—"
  }
  const date = new Date(ms)
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(locale, { day: "numeric", month: "short" })
  }
  return date.toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric" })
}
