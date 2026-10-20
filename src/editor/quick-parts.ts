const KEY = "aiword-quick-parts"

export type QuickPart = {
  id: string
  name: string
  html: string
}

function read(): QuickPart[] {
  if (typeof localStorage === "undefined") {
    return []
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (item): item is QuickPart =>
        !!item &&
        typeof item === "object" &&
        typeof (item as QuickPart).id === "string" &&
        typeof (item as QuickPart).name === "string" &&
        typeof (item as QuickPart).html === "string",
    )
  } catch {
    return []
  }
}

function write(parts: QuickPart[]) {
  localStorage.setItem(KEY, JSON.stringify(parts.slice(0, 40)))
}

export function loadQuickParts() {
  return read()
}

export function saveQuickPart(name: string, html: string) {
  const title = name.trim().slice(0, 40)
  const body = html.trim()
  if (!title || !body) {
    return read()
  }
  const next = [{ id: crypto.randomUUID(), name: title, html: body }, ...read().filter((item) => item.name !== title)]
  write(next)
  return next
}

export function deleteQuickPart(id: string) {
  const next = read().filter((item) => item.id !== id)
  write(next)
  return next
}
