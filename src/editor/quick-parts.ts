/**
 * The user's building blocks (Insert > Quick Parts): pieces of a document saved by name to a gallery (Quick Parts or
 * AutoText), with a category and a description, as Word's Create New Building Block keeps them. They are kept in
 * this browser; Word keeps them in Building Blocks.dotx, which the app does not read.
 */

const KEY = "aiword-quick-parts"

export const BLOCK_GALLERIES = ["Quick Parts", "AutoText"] as const
export type BlockGallery = (typeof BLOCK_GALLERIES)[number]

export type QuickPart = {
  id: string
  name: string
  html: string
  gallery: BlockGallery
  category: string
  description: string
}

export type BlockFields = Omit<QuickPart, "id">

function read(): QuickPart[] {
  if (typeof localStorage === "undefined") {
    return []
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter(
        (item): item is QuickPart =>
          !!item &&
          typeof item === "object" &&
          typeof (item as QuickPart).id === "string" &&
          typeof (item as QuickPart).name === "string" &&
          typeof (item as QuickPart).html === "string",
      )
      .map((item) => ({
        // Parts saved before galleries existed are Quick Parts in General, Word's defaults.
        id: item.id,
        name: item.name,
        html: item.html,
        gallery: (BLOCK_GALLERIES as readonly string[]).includes(item.gallery) ? item.gallery : "Quick Parts",
        category: typeof item.category === "string" && item.category ? item.category : "General",
        description: typeof item.description === "string" ? item.description : "",
      }))
  } catch {
    return []
  }
}

function write(parts: QuickPart[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(parts.slice(0, 200)))
  } catch {
    // Kept for the session only.
  }
}

export function loadQuickParts() {
  return read()
}

/** Saves a building block; one of the same name in the same gallery is replaced, as Word asks to redefine it. */
export function saveBuildingBlock(fields: BlockFields) {
  const name = fields.name.trim().slice(0, 64)
  const html = fields.html.trim()
  if (!name || !html) {
    return read()
  }
  const block: QuickPart = {
    id: crypto.randomUUID(),
    name,
    html,
    gallery: fields.gallery,
    category: fields.category.trim() || "General",
    description: fields.description.trim(),
  }
  const next = [block, ...read().filter((item) => !(item.name === name && item.gallery === fields.gallery))]
  write(next)
  return next
}

/** Quick Parts > Save Selection to Quick Part Gallery with Word's defaults (kept for older callers). */
export function saveQuickPart(name: string, html: string) {
  return saveBuildingBlock({ name, html, gallery: "Quick Parts", category: "General", description: "" })
}

/** Edit Properties… in the Building Blocks Organizer. */
export function updateBuildingBlock(id: string, patch: Partial<Omit<BlockFields, "html">>) {
  const next = read().map((item) =>
    item.id === id
      ? {
          ...item,
          ...patch,
          name: (patch.name ?? item.name).trim() || item.name,
          category: (patch.category ?? item.category).trim() || "General",
        }
      : item,
  )
  write(next)
  return next
}

export function deleteQuickPart(id: string) {
  const next = read().filter((item) => item.id !== id)
  write(next)
  return next
}

/** Word's suggested name for a new block: the selection's first words. */
export function suggestedBlockName(text: string) {
  return text.replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ").slice(0, 32)
}
