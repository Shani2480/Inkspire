/** A SmartArt graphic's text as the Design tab edits it (22.1): items with an outline level, in reading order. */
export type SmartArtItem = { text: string; level: number; picture?: string; look?: SmartArtLook }

/** The SmartArt Format tab's shapes (22.1): Change Shape's choices. */
export const SMARTART_SHAPES = [
  { id: "rect", label: "Rectangle" },
  { id: "rounded", label: "Rounded Rectangle" },
  { id: "ellipse", label: "Oval" },
  { id: "hexagon", label: "Hexagon" },
  { id: "diamond", label: "Diamond" },
  { id: "parallelogram", label: "Parallelogram" },
] as const

export type SmartArtShape = (typeof SMARTART_SHAPES)[number]["id"]

/**
 * One shape's own look, set on the SmartArt Format tab over the graphic's colours and style: its outline, Shape
 * Fill and Shape Outline, Text Fill, and Larger / Smaller steps.
 */
export type SmartArtLook = {
  shape?: SmartArtShape
  fill?: string
  line?: string
  text?: string
  /** Text Outline: the colour of a line round the text's letters. */
  outline?: string
  size?: number
  /** Shape Effects: a shadow below and right, a glow round the shape, or soft edges. */
  effect?: SmartArtEffect
}

/** The SmartArt Format tab's Shape Effects. */
export const SMARTART_EFFECTS = [
  { id: "shadow", label: "Shadow" },
  { id: "glow", label: "Glow" },
  { id: "soft", label: "Soft Edges" },
] as const

export type SmartArtEffect = (typeof SMARTART_EFFECTS)[number]["id"]

/** Larger and Smaller go up to this many steps either way, as Word's do. */
export const MAX_SIZE_STEP = 5

function readLook(value: unknown): SmartArtLook | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }
  const raw = value as Record<string, unknown>
  const look: SmartArtLook = {}
  if (SMARTART_SHAPES.some((shape) => shape.id === raw.shape)) {
    look.shape = raw.shape as SmartArtShape
  }
  if (SMARTART_EFFECTS.some((effect) => effect.id === raw.effect)) {
    look.effect = raw.effect as SmartArtEffect
  }
  for (const key of ["fill", "line", "text", "outline"] as const) {
    if (typeof raw[key] === "string" && /^#[0-9a-f]{6}$/i.test(raw[key] as string)) {
      look[key] = raw[key] as string
    }
  }
  const size = Number(raw.size)
  if (Number.isInteger(size) && size !== 0) {
    look.size = Math.max(-MAX_SIZE_STEP, Math.min(MAX_SIZE_STEP, size))
  }
  return Object.keys(look).length > 0 ? look : undefined
}

/** The item with its look changed; a key set to undefined goes back to the graphic's own. */
export function withLook(item: SmartArtItem, change: Partial<Record<keyof SmartArtLook, unknown>>): SmartArtItem {
  const merged: Record<string, unknown> = { ...item.look, ...change }
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined || merged[key] === "") {
      delete merged[key]
    }
  }
  const look = readLook(merged)
  const next: SmartArtItem = { ...item }
  delete next.look
  return look ? { ...next, look } : next
}

export const MAX_LEVEL = 4

export function readItems(labels: unknown, levels: unknown, pictures?: unknown, looks?: unknown): SmartArtItem[] {
  const read = (value: unknown): unknown[] => {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  const texts = read(labels).map(String)
  const depth = read(levels)
  const images = read(pictures)
  const shapes = read(looks)
  return texts.map((text, index) => {
    const level = Number(depth[index])
    const picture = typeof images[index] === "string" ? (images[index] as string) : ""
    const look = readLook(shapes[index])
    return {
      text,
      level: Number.isInteger(level) ? Math.min(MAX_LEVEL, Math.max(0, level)) : 0,
      ...(picture ? { picture } : {}),
      ...(look ? { look } : {}),
    }
  })
}

export function writeItems(items: SmartArtItem[]) {
  return {
    labels: JSON.stringify(items.map((item) => item.text)),
    levels: JSON.stringify(items.map((item) => item.level)),
    pictures: JSON.stringify(items.map((item) => item.picture ?? "")),
    looks: JSON.stringify(items.some((item) => item.look) ? items.map((item) => item.look ?? null) : []),
  }
}

/** The index one past the item's last descendant (the items after it that are deeper). */
export function blockEnd(items: SmartArtItem[], index: number) {
  let end = index + 1
  while (end < items.length && items[end]!.level > items[index]!.level) {
    end += 1
  }
  return end
}

const NEW_TEXT = "Text"

/** Add Shape After / Before: a new item at the active item's level, after its whole block or before it. */
export function addShape(items: SmartArtItem[], index: number, after: boolean) {
  if (items.length === 0) {
    return { items: [{ text: NEW_TEXT, level: 0 }], index: 0 }
  }
  const at = Math.min(Math.max(index, 0), items.length - 1)
  const insertAt = after ? blockEnd(items, at) : at
  const next = [...items]
  next.splice(insertAt, 0, { text: NEW_TEXT, level: items[at]!.level })
  return { items: next, index: insertAt }
}

/** Add Bullet: a new item one level below the active one, as its last child. */
export function addBullet(items: SmartArtItem[], index: number) {
  if (items.length === 0) {
    return { items: [{ text: NEW_TEXT, level: 0 }], index: 0 }
  }
  const at = Math.min(Math.max(index, 0), items.length - 1)
  const insertAt = blockEnd(items, at)
  const next = [...items]
  next.splice(insertAt, 0, { text: NEW_TEXT, level: Math.min(MAX_LEVEL, items[at]!.level + 1) })
  return { items: next, index: insertAt }
}

export function canPromote(items: SmartArtItem[], index: number) {
  return (items[index]?.level ?? 0) > 0
}

export function canDemote(items: SmartArtItem[], index: number) {
  const item = items[index]
  const before = items[index - 1]
  return Boolean(item && before && item.level <= before.level && item.level < MAX_LEVEL)
}

/** Promote / Demote shift the item and everything under it. */
function shift(items: SmartArtItem[], index: number, delta: number) {
  const end = blockEnd(items, index)
  return items.map((item, position) =>
    position >= index && position < end
      ? { ...item, level: Math.min(MAX_LEVEL, Math.max(0, item.level + delta)) }
      : item,
  )
}

export const promote = (items: SmartArtItem[], index: number) =>
  canPromote(items, index) ? shift(items, index, -1) : items

export const demote = (items: SmartArtItem[], index: number) =>
  canDemote(items, index) ? shift(items, index, 1) : items

/** The start of the previous item of the same level (a sibling), or null. */
function previousSibling(items: SmartArtItem[], index: number) {
  const level = items[index]!.level
  for (let at = index - 1; at >= 0; at -= 1) {
    if (items[at]!.level < level) {
      return null
    }
    if (items[at]!.level === level) {
      return at
    }
  }
  return null
}

export function canMoveUp(items: SmartArtItem[], index: number) {
  return Boolean(items[index]) && previousSibling(items, index) !== null
}

export function canMoveDown(items: SmartArtItem[], index: number) {
  const end = items[index] ? blockEnd(items, index) : 0
  return Boolean(items[index]) && end < items.length && items[end]!.level === items[index]!.level
}

/** Move Up / Down swap an item (with its children) with the sibling before or after it; returns the new index. */
export function moveItem(items: SmartArtItem[], index: number, direction: "up" | "down") {
  if (direction === "up") {
    const sibling = previousSibling(items, index)
    if (sibling === null) {
      return { items, index }
    }
    const end = blockEnd(items, index)
    return {
      items: [
        ...items.slice(0, sibling),
        ...items.slice(index, end),
        ...items.slice(sibling, index),
        ...items.slice(end),
      ],
      index: sibling,
    }
  }
  if (!canMoveDown(items, index)) {
    return { items, index }
  }
  const end = blockEnd(items, index)
  const nextEnd = blockEnd(items, end)
  return {
    items: [
      ...items.slice(0, index),
      ...items.slice(end, nextEnd),
      ...items.slice(index, end),
      ...items.slice(nextEnd),
    ],
    index: index + (nextEnd - end),
  }
}
