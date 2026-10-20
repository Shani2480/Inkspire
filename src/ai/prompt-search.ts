export type PromptHit = {
  title: string
  prompt: string
}

const LIBRARY_URL = "https://cdn.jsdelivr.net/gh/f/awesome-chatgpt-prompts@main/prompts.csv"
const LIBRARY_NAME = "awesome-chatgpt-prompts"

let library: Promise<PromptHit[]> | null = null

export function promptLibraryName() {
  return LIBRARY_NAME
}

export async function searchPromptLibrary(query: string, signal?: AbortSignal) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) {
    return []
  }

  const hits = await loadLibrary()
  if (signal?.aborted) {
    return []
  }
  return hits
    .filter((hit) => {
      const haystack = `${hit.title}\n${hit.prompt}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
    .slice(0, 8)
}

async function loadLibrary() {
  if (!library) {
    library = fetchLibrary().catch((error) => {
      library = null
      throw error
    })
  }
  return library
}

async function fetchLibrary() {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(LIBRARY_URL, { signal: controller.signal })
    if (!response.ok) {
      throw new Error("The prompt library could not be reached.")
    }
    return promptsFromCsv(await response.text())
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The prompt library could not be reached.")
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

function promptsFromCsv(text: string) {
  const rows = parseCsv(text)
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? []
  const titleIndex = header.indexOf("act")
  const promptIndex = header.indexOf("prompt")
  if (titleIndex < 0 || promptIndex < 0) {
    return []
  }

  const hits: PromptHit[] = []
  for (const row of rows.slice(1)) {
    const title = row[titleIndex]?.trim() ?? ""
    const prompt = row[promptIndex]?.trim() ?? ""
    if (!title || !prompt) {
      continue
    }
    hits.push({ title, prompt })
  }
  return hits
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ",") {
      row.push(field)
      field = ""
      continue
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1
      }
      row.push(field)
      field = ""
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row)
      }
      row = []
      continue
    }
    field += char
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row)
    }
  }
  return rows
}
