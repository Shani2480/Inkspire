/**
 * Word's shape formatting (20.9): fill (solid, gradient, picture, texture), outline (colour, weight, dashes,
 * arrows), effects (shadow, reflection, glow, soft edges, bevel, 3-D rotation), flips, and for text boxes the text
 * fill, outline and effects, direction, vertical alignment and margins. Shapes and text boxes share the attributes,
 * so one command formats either.
 */

type Attrs = Record<string, unknown>

export function stringAttr(key: string, fallback = "") {
  const name = `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => element.getAttribute(name) ?? fallback,
    renderHTML: (attributes: Attrs) =>
      attributes[key] !== undefined && attributes[key] !== fallback ? { [name]: String(attributes[key]) } : {},
  }
}

export function numberAttr(key: string, fallback = 0) {
  const name = `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => {
      const value = Number(element.getAttribute(name))
      return element.hasAttribute(name) && Number.isFinite(value) ? value : fallback
    },
    renderHTML: (attributes: Attrs) => {
      const value = Number(attributes[key])
      return Number.isFinite(value) && value !== fallback ? { [name]: String(value) } : {}
    },
  }
}

export function booleanAttr(key: string) {
  const name = `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
  return {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute(name) === "1",
    renderHTML: (attributes: Attrs) => (attributes[key] ? { [name]: "1" } : {}),
  }
}

/** The formatting both shapes and text boxes take (their fill and outline colour attributes are their own). */
export function shapeStyleAttributes() {
  return {
    fillGradient: stringAttr("fillGradient"),
    fillImage: stringAttr("fillImage"),
    texture: stringAttr("texture"),
    strokeWidth: numberAttr("strokeWidth"),
    strokeDash: stringAttr("strokeDash"),
    arrowBegin: stringAttr("arrowBegin"),
    arrowEnd: stringAttr("arrowEnd"),
    shadow: stringAttr("shadow"),
    glow: stringAttr("glow"),
    softEdge: numberAttr("softEdge"),
    reflection: stringAttr("reflection"),
    bevel: stringAttr("bevel"),
    rot3d: stringAttr("rot3d"),
    flipH: booleanAttr("flipH"),
    flipV: booleanAttr("flipV"),
    shapeStyle: stringAttr("shapeStyle"),
  }
}

/** A text box's own text formatting and layout (Text Options and Layout & Properties). */
export function textBoxStyleAttributes() {
  return {
    textFill: stringAttr("textFill"),
    textOutline: stringAttr("textOutline"),
    textEffect: stringAttr("textEffect"),
    textDirection: stringAttr("textDirection"),
    vAlign: stringAttr("vAlign"),
    // Margins in points, Word's defaults (0.1" at the sides, 0.05" above and below).
    insetL: numberAttr("insetL", 7.2),
    insetT: numberAttr("insetT", 3.6),
    insetR: numberAttr("insetR", 7.2),
    insetB: numberAttr("insetB", 3.6),
    autoFit: booleanAttr("autoFit"),
    noWrap: booleanAttr("noWrap"),
  }
}

// --- Choices, as Word names them -------------------------------------------------------------------------------

/** The Office theme's dark text and six accents: the columns of the Theme Styles gallery. */
export const THEME_ACCENTS = [
  { id: "dark", label: "Black, Dark 1", color: "#000000" },
  { id: "accent1", label: "Blue, Accent 1", color: "#4472c4" },
  { id: "accent2", label: "Orange, Accent 2", color: "#ed7d31" },
  { id: "accent3", label: "Gray, Accent 3", color: "#a5a5a5" },
  { id: "accent4", label: "Gold, Accent 4", color: "#ffc000" },
  { id: "accent5", label: "Blue, Accent 5", color: "#5b9bd5" },
  { id: "accent6", label: "Green, Accent 6", color: "#70ad47" },
]

export const STYLE_INTENSITIES = [
  { id: "outline", label: "Colored Outline" },
  { id: "fill", label: "Colored Fill" },
  { id: "light-outline", label: "Light 1 Outline, Colored Fill" },
  { id: "subtle", label: "Subtle Effect" },
  { id: "moderate", label: "Moderate Effect" },
  { id: "intense", label: "Intense Effect" },
] as const

export type ShapeStyleChoice = { id: string; label: string; attrs: Attrs }

const CLEARED: Attrs = {
  fillGradient: "",
  fillImage: "",
  texture: "",
  strokeWidth: 0,
  strokeDash: "",
  shadow: "",
  glow: "",
  softEdge: 0,
  reflection: "",
  bevel: "",
}

export function themeStyle(
  accent: (typeof THEME_ACCENTS)[number],
  intensity: (typeof STYLE_INTENSITIES)[number]["id"],
) {
  const color = accent.color
  const dark = shade(color, -0.35)
  const looks: Record<string, Attrs> = {
    outline: { fill: "#ffffff", stroke: color, strokeWidth: 1 },
    fill: { fill: color, stroke: dark, strokeWidth: 1 },
    "light-outline": { fill: color, stroke: "#ffffff", strokeWidth: 1.5 },
    subtle: { fill: shade(color, 0.75), stroke: color, strokeWidth: 1 },
    moderate: { fill: color, fillGradient: "light-down", stroke: "none", shadow: "outer-b" },
    intense: { fill: color, fillGradient: "dark-down", stroke: "none", shadow: "outer-b", bevel: "circle" },
  }
  return { ...CLEARED, ...looks[intensity], shapeStyle: `${accent.id}-${intensity}` }
}

/** Word's Presets row: transparent and gradient looks. */
export const PRESET_STYLES: ShapeStyleChoice[] = [
  {
    id: "preset-transparent-dark",
    label: "Transparent, Colored Outline - Black, Dark 1",
    attrs: { fill: "none", stroke: "#000000", strokeWidth: 1 },
  },
  {
    id: "preset-transparent-blue",
    label: "Transparent, Colored Outline - Blue, Accent 1",
    attrs: { fill: "none", stroke: "#4472c4", strokeWidth: 1 },
  },
  {
    id: "preset-transparent-orange",
    label: "Transparent, Colored Outline - Orange, Accent 2",
    attrs: { fill: "none", stroke: "#ed7d31", strokeWidth: 1 },
  },
  {
    id: "preset-gradient-blue",
    label: "Gradient Fill - Blue, Accent 1",
    attrs: { fill: "#4472c4", fillGradient: "light-diagonal", stroke: "none" },
  },
  {
    id: "preset-gradient-gold",
    label: "Gradient Fill - Gold, Accent 4",
    attrs: { fill: "#ffc000", fillGradient: "light-diagonal", stroke: "none" },
  },
  {
    id: "preset-gradient-green",
    label: "Gradient Fill - Green, Accent 6",
    attrs: { fill: "#70ad47", fillGradient: "light-diagonal", stroke: "none" },
  },
].map((preset) => ({ ...preset, attrs: { ...CLEARED, ...preset.attrs, shapeStyle: preset.id } }))

export const GRADIENT_DIRECTIONS = [
  { id: "diagonal", label: "Linear Diagonal - Top Left to Bottom Right" },
  { id: "down", label: "Linear Down" },
  { id: "diagonal-up", label: "Linear Diagonal - Top Right to Bottom Left" },
  { id: "right", label: "Linear Right" },
  { id: "radial", label: "From Center" },
  { id: "left", label: "Linear Left" },
  { id: "diagonal-back", label: "Linear Diagonal - Bottom Left to Top Right" },
  { id: "up", label: "Linear Up" },
] as const

export const TEXTURES = [
  { id: "canvas", label: "Canvas" },
  { id: "denim", label: "Denim" },
  { id: "paper", label: "Recycled Paper" },
  { id: "wood", label: "Oak" },
  { id: "marble", label: "White Marble" },
  { id: "dots", label: "Small Dots" },
  { id: "stripes", label: "Wide Downward Diagonal" },
  { id: "grid", label: "Small Grid" },
] as const

export const OUTLINE_WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6]

export const OUTLINE_DASHES = [
  { id: "", label: "Solid" },
  { id: "round-dot", label: "Round Dot" },
  { id: "square-dot", label: "Square Dot" },
  { id: "dash", label: "Dash" },
  { id: "dash-dot", label: "Dash Dot" },
  { id: "long-dash", label: "Long Dash" },
  { id: "long-dash-dot", label: "Long Dash Dot" },
  { id: "long-dash-dot-dot", label: "Long Dash Dot Dot" },
] as const

export const ARROW_STYLES = [
  { begin: "", end: "", label: "Arrow Style 1" },
  { begin: "", end: "arrow", label: "Arrow Style 2" },
  { begin: "arrow", end: "", label: "Arrow Style 3" },
  { begin: "arrow", end: "arrow", label: "Arrow Style 4" },
  { begin: "", end: "open", label: "Arrow Style 5" },
  { begin: "open", end: "open", label: "Arrow Style 6" },
  { begin: "", end: "stealth", label: "Arrow Style 7" },
  { begin: "oval", end: "oval", label: "Arrow Style 8" },
  { begin: "diamond", end: "arrow", label: "Arrow Style 9" },
] as const

export const SHADOWS = [
  {
    group: "Outer",
    items: [
      { id: "outer-br", label: "Offset: Bottom Right" },
      { id: "outer-b", label: "Offset: Bottom" },
      { id: "outer-bl", label: "Offset: Bottom Left" },
      { id: "outer-r", label: "Offset: Right" },
      { id: "outer-center", label: "Offset: Center" },
      { id: "outer-l", label: "Offset: Left" },
      { id: "outer-tr", label: "Offset: Top Right" },
      { id: "outer-t", label: "Offset: Top" },
      { id: "outer-tl", label: "Offset: Top Left" },
    ],
  },
  {
    group: "Inner",
    items: [
      { id: "inner", label: "Inside: Center" },
      { id: "inner-tl", label: "Inside: Top Left" },
    ],
  },
  { group: "Perspective", items: [{ id: "perspective", label: "Perspective: Below" }] },
] as const

export const REFLECTIONS = [
  { id: "tight", label: "Tight Reflection: Touching" },
  { id: "half", label: "Half Reflection: Touching" },
  { id: "full", label: "Full Reflection: Touching" },
  { id: "tight-offset", label: "Tight Reflection: 4 pt offset" },
  { id: "half-offset", label: "Half Reflection: 4 pt offset" },
  { id: "full-offset", label: "Full Reflection: 4 pt offset" },
] as const

export const GLOW_SIZES = [5, 8, 11, 18]

export const SOFT_EDGES = [1, 2.5, 5, 10, 25, 50]

export const BEVELS = [
  { id: "circle", label: "Round" },
  { id: "relaxed", label: "Relaxed Inset" },
  { id: "cross", label: "Cross" },
  { id: "cool", label: "Cool Slant" },
  { id: "angle", label: "Angle" },
  { id: "soft", label: "Soft Round" },
  { id: "convex", label: "Convex" },
  { id: "slope", label: "Slope" },
  { id: "divot", label: "Divot" },
  { id: "riblet", label: "Riblet" },
  { id: "hard", label: "Hard Edge" },
  { id: "art-deco", label: "Art Deco" },
] as const

export const ROTATIONS_3D = [
  {
    group: "Parallel",
    items: [
      { id: "iso-left", label: "Isometric: Left Down" },
      { id: "iso-right", label: "Isometric: Right Up" },
      { id: "iso-top", label: "Isometric: Top Up" },
      { id: "off-axis-1", label: "Off Axis 1: Right" },
      { id: "off-axis-2", label: "Off Axis 2: Left" },
    ],
  },
  {
    group: "Perspective",
    items: [
      { id: "perspective-front", label: "Perspective: Front" },
      { id: "perspective-left", label: "Perspective: Left" },
      { id: "perspective-right", label: "Perspective: Right" },
      { id: "perspective-below", label: "Perspective: Below" },
      { id: "perspective-above", label: "Perspective: Above" },
    ],
  },
  {
    group: "Oblique",
    items: [
      { id: "oblique-tl", label: "Oblique: Top Left" },
      { id: "oblique-br", label: "Oblique: Bottom Right" },
    ],
  },
] as const

/** Word's Preset effects: combinations of the effects above. */
export const EFFECT_PRESETS = [
  { id: "1", label: "Preset 1", attrs: { shadow: "outer-br" } },
  { id: "2", label: "Preset 2", attrs: { shadow: "outer-b", bevel: "circle" } },
  { id: "3", label: "Preset 3", attrs: { bevel: "soft" } },
  { id: "4", label: "Preset 4", attrs: { shadow: "outer-br", bevel: "relaxed" } },
  { id: "5", label: "Preset 5", attrs: { reflection: "tight", bevel: "circle" } },
  { id: "6", label: "Preset 6", attrs: { shadow: "perspective", bevel: "angle" } },
  { id: "7", label: "Preset 7", attrs: { glow: "#4472c4:8", bevel: "circle" } },
  { id: "8", label: "Preset 8", attrs: { rot3d: "perspective-front", bevel: "circle", shadow: "outer-b" } },
]

export const NO_EFFECTS: Attrs = { shadow: "", glow: "", softEdge: 0, reflection: "", bevel: "", rot3d: "" }

export const TEXT_DIRECTIONS = [
  { id: "", label: "Horizontal" },
  { id: "rotate90", label: "Rotate all text 90°" },
  { id: "rotate270", label: "Rotate all text 270°" },
  { id: "stacked", label: "Stacked" },
] as const

export const TEXT_EFFECTS = [
  { id: "shadow", label: "Shadow" },
  { id: "reflection", label: "Reflection" },
  { id: "glow", label: "Glow" },
  { id: "bevel", label: "Bevel" },
  { id: "transform-arch", label: "Transform: Arch" },
  { id: "transform-wave", label: "Transform: Wave" },
] as const

// --- Painting ---------------------------------------------------------------------------------------------------

/** A colour lighter (amount > 0, toward white) or darker (amount < 0, toward black). */
export function shade(color: string, amount: number) {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!match) {
    return color
  }
  const value = Number.parseInt(match[1]!, 16)
  const channel = (shift: number) => {
    const part = (value >> shift) & 255
    const next = amount >= 0 ? part + (255 - part) * amount : part * (1 + amount)
    return Math.round(Math.min(255, Math.max(0, next)))
      .toString(16)
      .padStart(2, "0")
  }
  return `#${channel(16)}${channel(8)}${channel(0)}`
}

/**
 * A gradient from Word that is none of the app's presets (more stops, its own angle, theme colours), kept whole as
 * "word:<angle>:<pos>#hex;<pos>#hex…": positions in percent, and the angle in degrees clockwise from left-to-right
 * as DrawingML's `a:lin` gives it, or "radial".
 */
export type WordGradient = { angle: number | null; stops: [number, string][] }

export function wordGradientValue(gradient: WordGradient) {
  const stops = gradient.stops.map(([position, color]) => `${Math.round(position * 10) / 10}${color}`).join(";")
  return `word:${gradient.angle === null ? "radial" : Math.round(gradient.angle * 100) / 100}:${stops}`
}

export function parseWordGradient(value: string): WordGradient | null {
  const match = /^word:(radial|-?[\d.]+):(.+)$/.exec(value)
  if (!match) {
    return null
  }
  const stops = match[2]!.split(";").map((part) => /^([\d.]+)(#[0-9a-f]{6})$/i.exec(part))
  if (stops.length < 2 || stops.some((stop) => !stop)) {
    return null
  }
  return {
    angle: match[1] === "radial" ? null : Number(match[1]),
    stops: stops.map((stop) => [Number(stop![1]), stop![2]!.toLowerCase()]),
  }
}

/** A gradient's colour stops, as offsets from 0 to 1, for the app's presets and Word's own alike. */
export function gradientStopList(fill: string, gradient: string): [number, string][] {
  const word = parseWordGradient(gradient)
  if (word) {
    return word.stops.map(([position, color]) => [position / 100, color])
  }
  const [from, to] = gradientStops(fill, gradient)
  return [
    [0, from!],
    [1, to!],
  ]
}

export function gradientStops(fill: string, gradient: string) {
  const [tone] = gradient.split("-")
  const base = fill && fill !== "none" ? fill : "#4472c4"
  return tone === "dark" ? [shade(base, 0.25), shade(base, -0.4)] : [shade(base, 0.7), base]
}

export function gradientVector(gradient: string): [number, number, number, number] | null {
  const word = parseWordGradient(gradient)
  if (word) {
    if (word.angle === null) {
      return null
    }
    // Across the box at that angle, from corner to corner as Word spans it, in the box's own units.
    const radians = (word.angle * Math.PI) / 180
    const [cos, sin] = [Math.cos(radians), Math.sin(radians)]
    const reach = (Math.abs(cos) + Math.abs(sin)) / 2
    const round = (value: number) => Math.round(value * 10000) / 10000
    return [round(0.5 - cos * reach), round(0.5 - sin * reach), round(0.5 + cos * reach), round(0.5 + sin * reach)]
  }
  const direction = gradient.split("-").slice(1).join("-")
  const vectors: Record<string, [number, number, number, number]> = {
    down: [0, 0, 0, 1],
    up: [0, 1, 0, 0],
    right: [0, 0, 1, 0],
    left: [1, 0, 0, 0],
    diagonal: [0, 0, 1, 1],
    "diagonal-up": [1, 0, 0, 1],
    "diagonal-back": [0, 1, 1, 0],
  }
  return direction === "radial" ? null : (vectors[direction] ?? vectors.down!)
}

/** A CSS gradient for a text box, matching the shape gradient. */
export function cssGradient(fill: string, gradient: string) {
  const stops = gradientStopList(fill, gradient)
    .map(([offset, color]) => `${color} ${Math.round(offset * 1000) / 10}%`)
    .join(", ")
  const vector = gradientVector(gradient)
  if (!vector) {
    return `radial-gradient(circle, ${stops})`
  }
  const angle = (Math.atan2(vector[2] - vector[0], -(vector[3] - vector[1])) * 180) / Math.PI
  return `linear-gradient(${Math.round(angle)}deg, ${stops})`
}

function textureMarkup(id: string, pattern: string) {
  const tiles: Record<string, string> = {
    canvas: `<rect width="8" height="8" fill="#e8dcc4"/><path d="M0 2h8M0 6h8M2 0v8M6 0v8" stroke="#d6c6a5" stroke-width=".6"/>`,
    denim: `<rect width="8" height="8" fill="#3b5b8c"/><path d="M0 8 8 0M-2 2 2 -2M6 10 10 6" stroke="#5574a6" stroke-width="1.2"/>`,
    paper: `<rect width="8" height="8" fill="#f1ede4"/><circle cx="2" cy="3" r=".5" fill="#d8d0bf"/><circle cx="6" cy="6" r=".4" fill="#cfc6b3"/>`,
    wood: `<rect width="8" height="8" fill="#c08a4e"/><path d="M0 2q4 -1 8 0M0 5q4 1.4 8 0" stroke="#9c6a35" stroke-width=".8" fill="none"/>`,
    marble: `<rect width="8" height="8" fill="#f4f4f2"/><path d="M0 6q3 -4 8 -2" stroke="#d2d2cf" stroke-width=".6" fill="none"/>`,
    dots: `<rect width="8" height="8" fill="#ffffff"/><circle cx="4" cy="4" r="1.2" fill="#4472c4"/>`,
    stripes: `<rect width="8" height="8" fill="#ffffff"/><path d="M-2 2 2 -2M0 8 8 0M6 10 10 6" stroke="#4472c4" stroke-width="1.6"/>`,
    grid: `<rect width="8" height="8" fill="#ffffff"/><path d="M0 0h8M0 0v8" stroke="#4472c4" stroke-width=".8"/>`,
  }
  return `<pattern id="${pattern}" patternUnits="userSpaceOnUse" width="8" height="8">${tiles[id] ?? tiles.canvas}</pattern>`
}

/** A texture as a CSS background (for text boxes). */
export function cssTexture(id: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">${textureMarkup(id, "t").replace(/^<pattern[^>]*>|<\/pattern>$/g, "")}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const DASHES: Record<string, number[]> = {
  "round-dot": [0.1, 2],
  "square-dot": [1, 1],
  dash: [4, 3],
  "dash-dot": [4, 3, 1, 3],
  "long-dash": [8, 3],
  "long-dash-dot": [8, 3, 1, 3],
  "long-dash-dot-dot": [8, 3, 1, 3, 1, 3],
}

/** The dash pattern for a line `width` units wide. */
export function dashArray(dash: string, width: number) {
  const pattern = DASHES[dash]
  return pattern ? pattern.map((part) => Math.max(0.1, part * width)).join(" ") : ""
}

/** CSS border style for a text box outline. */
export function cssDash(dash: string) {
  if (!dash) {
    return "solid"
  }
  return dash.includes("dot") && !dash.includes("dash") ? "dotted" : "dashed"
}

function markerMarkup(id: string, kind: string, color: string, start: boolean) {
  const shapes: Record<string, string> = {
    arrow: `<path d="M0 0 L10 5 L0 10 Z" fill="${color}"/>`,
    open: `<path d="M0 0 L10 5 L0 10" fill="none" stroke="${color}" stroke-width="1.5"/>`,
    stealth: `<path d="M0 0 L10 5 L0 10 L3 5 Z" fill="${color}"/>`,
    diamond: `<path d="M0 5 L5 0 L10 5 L5 10 Z" fill="${color}"/>`,
    oval: `<circle cx="5" cy="5" r="4" fill="${color}"/>`,
  }
  return `<marker id="${id}" viewBox="0 0 10 10" refX="${start ? 1 : 9}" refY="5" markerWidth="4" markerHeight="4" orient="${start ? "auto-start-reverse" : "auto"}" markerUnits="strokeWidth">${shapes[kind] ?? shapes.arrow}</marker>`
}

const BEVEL_DEPTH: Record<string, [number, number]> = {
  circle: [2.4, 4],
  relaxed: [1.2, 2.5],
  cross: [1.6, 6],
  cool: [1, 8],
  angle: [0.8, 6],
  soft: [3, 2],
  convex: [3.2, 3],
  slope: [1.6, 5],
  divot: [1.2, 7],
  riblet: [0.8, 9],
  hard: [0.6, 10],
  "art-deco": [1.4, 7],
}

let filterIds = 0

/**
 * Formats a shape drawn as SVG markup (in its own viewBox) as the attributes say: fill, outline, arrows, flips,
 * soft edges and bevel inside the SVG; the shadow, glow, reflection and 3-D rotation are CSS for its element.
 */
export function paintShapeSvg(svg: SVGSVGElement, attrs: Attrs, size: { width: number; height: number }) {
  const id = `shape-${(filterIds += 1)}`
  const box = svg.viewBox.baseVal
  const viewX = box?.x || 0
  const viewY = box?.y || 0
  const viewWidth = box?.width || 80
  const viewHeight = box?.height || 56
  // Units of the viewBox per CSS pixel (the SVG keeps its aspect).
  const scale = Math.min(size.width / viewWidth, size.height / viewHeight) || 1
  const unit = 1 / scale
  // A stretched drawing (a shape filling its box) keeps its strokes in pixels, so they do not stretch with it.
  const stretched = svg.getAttribute("preserveAspectRatio") === "none"
  const fill = String(attrs.fill || "")
  const stroke = String(attrs.stroke || "")
  const gradient = String(attrs.fillGradient || "")
  const image = String(attrs.fillImage || "")
  const texture = String(attrs.texture || "")
  const defs: string[] = []
  let paint = fill
  if (image) {
    defs.push(
      `<pattern id="${id}-image" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="${image.replace(/"/g, "&quot;")}" width="1" height="1" preserveAspectRatio="xMidYMid slice"/></pattern>`,
    )
    paint = `url(#${id}-image)`
  } else if (texture) {
    defs.push(textureMarkup(texture, `${id}-texture`))
    paint = `url(#${id}-texture)`
  } else if (gradient) {
    const stops = gradientStopList(fill, gradient)
      .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
      .join("")
    const vector = gradientVector(gradient)
    defs.push(
      vector
        ? `<linearGradient id="${id}-gradient" x1="${vector[0]}" y1="${vector[1]}" x2="${vector[2]}" y2="${vector[3]}">${stops}</linearGradient>`
        : `<radialGradient id="${id}-gradient">${stops}</radialGradient>`,
    )
    paint = `url(#${id}-gradient)`
  }
  const widthPt = Number(attrs.strokeWidth) || 0
  const strokeUnits = widthPt ? ((widthPt * 4) / 3) * (stretched ? 1 : unit) : 0
  const dash = String(attrs.strokeDash || "")
  const begin = String(attrs.arrowBegin || "")
  const end = String(attrs.arrowEnd || "")
  for (const element of svg.querySelectorAll<SVGElement>(
    "rect, ellipse, polygon, path, circle, polyline, line, text",
  )) {
    const ownFill = element.getAttribute("fill")
    const open = ownFill === "none" || element.tagName === "line" || element.tagName === "polyline"
    if (paint && !open) {
      element.setAttribute("fill", paint)
    }
    const ownStroke = element.getAttribute("stroke")
    if (stroke === "none") {
      if (!open) {
        element.setAttribute("stroke", "none")
      }
    } else if (stroke) {
      element.setAttribute("stroke", stroke)
      if (!element.getAttribute("stroke-width") && !ownStroke) {
        element.setAttribute("stroke-width", String(2))
      }
    }
    if (strokeUnits && (element.getAttribute("stroke") ?? "none") !== "none") {
      element.setAttribute("stroke-width", String(strokeUnits))
    }
    if (stretched && (element.getAttribute("stroke") ?? "none") !== "none") {
      element.setAttribute("vector-effect", "non-scaling-stroke")
    }
    if (dash && (element.getAttribute("stroke") ?? "none") !== "none") {
      element.setAttribute("stroke-dasharray", dashArray(dash, Number(element.getAttribute("stroke-width")) || 2))
      if (dash === "round-dot") {
        element.setAttribute("stroke-linecap", "round")
      }
    }
    if (open && (begin || end)) {
      const color = element.getAttribute("stroke") || stroke || "#242424"
      if (begin) {
        defs.push(markerMarkup(`${id}-begin`, begin, color, true))
        element.setAttribute("marker-start", `url(#${id}-begin)`)
      }
      if (end) {
        defs.push(markerMarkup(`${id}-end`, end, color, false))
        element.setAttribute("marker-end", `url(#${id}-end)`)
      }
    }
  }
  const filters: string[] = []
  const bevel = String(attrs.bevel || "")
  if (bevel) {
    const [blur, elevation] = BEVEL_DEPTH[bevel] ?? BEVEL_DEPTH.circle!
    filters.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur * unit}" result="bevelBlur"/>` +
        `<feSpecularLighting in="bevelBlur" surfaceScale="${elevation}" specularConstant=".75" specularExponent="16" lighting-color="#ffffff" result="bevelLight"><feDistantLight azimuth="225" elevation="45"/></feSpecularLighting>` +
        `<feComposite in="bevelLight" in2="SourceAlpha" operator="in" result="bevelLit"/>` +
        `<feComposite in="SourceGraphic" in2="bevelLit" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="bevelOut"/>`,
    )
  }
  const soft = Number(attrs.softEdge) || 0
  if (soft) {
    const radius = ((soft * 4) / 3) * unit
    filters.push(
      `<feMorphology in="SourceAlpha" operator="erode" radius="${radius / 2}" result="softCore"/>` +
        `<feGaussianBlur in="softCore" stdDeviation="${radius / 2}" result="softMask"/>` +
        `<feComposite in="${bevel ? "bevelOut" : "SourceGraphic"}" in2="softMask" operator="in"/>`,
    )
  }
  if (filters.length) {
    defs.push(`<filter id="${id}-filter" x="-20%" y="-20%" width="140%" height="140%">${filters.join("")}</filter>`)
  }
  const flipH = Boolean(attrs.flipH)
  const flipV = Boolean(attrs.flipV)
  const transform =
    flipH || flipV
      ? `translate(${flipH ? viewX * 2 + viewWidth : 0} ${flipV ? viewY * 2 + viewHeight : 0}) scale(${flipH ? -1 : 1} ${flipV ? -1 : 1})`
      : ""
  if (defs.length || transform) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g")
    group.append(...svg.childNodes)
    if (transform) {
      group.setAttribute("transform", transform)
    }
    if (filters.length) {
      group.setAttribute("filter", `url(#${id}-filter)`)
    }
    svg.replaceChildren(group)
    if (defs.length) {
      svg.insertAdjacentHTML("afterbegin", `<defs>${defs.join("")}</defs>`)
    }
  }
  svg.style.overflow = "visible"
  Object.assign(svg.style, effectStyle(attrs))
}

const SHADOW_OFFSETS: Record<string, [number, number]> = {
  "outer-br": [3, 3],
  "outer-b": [0, 3],
  "outer-bl": [-3, 3],
  "outer-r": [3, 0],
  "outer-center": [0, 0],
  "outer-l": [-3, 0],
  "outer-tr": [3, -3],
  "outer-t": [0, -3],
  "outer-tl": [-3, -3],
}

const ROTATIONS: Record<string, string> = {
  "iso-left": "rotateX(45deg) rotateZ(-35deg)",
  "iso-right": "rotateX(45deg) rotateZ(35deg)",
  "iso-top": "rotateX(55deg)",
  "off-axis-1": "rotateY(-25deg) rotateX(8deg)",
  "off-axis-2": "rotateY(25deg) rotateX(8deg)",
  "perspective-front": "perspective(400px) rotateX(18deg)",
  "perspective-left": "perspective(400px) rotateY(25deg)",
  "perspective-right": "perspective(400px) rotateY(-25deg)",
  "perspective-below": "perspective(400px) rotateX(-20deg)",
  "perspective-above": "perspective(400px) rotateX(30deg)",
  "oblique-tl": "skew(-12deg, -6deg)",
  "oblique-br": "skew(12deg, 6deg)",
}

const REFLECTION_CSS: Record<string, string> = {
  tight: "below 0px linear-gradient(transparent 70%, rgb(255 255 255 / 0.45))",
  half: "below 0px linear-gradient(transparent 50%, rgb(255 255 255 / 0.45))",
  full: "below 0px linear-gradient(transparent 5%, rgb(255 255 255 / 0.45))",
  "tight-offset": "below 5px linear-gradient(transparent 70%, rgb(255 255 255 / 0.45))",
  "half-offset": "below 5px linear-gradient(transparent 50%, rgb(255 255 255 / 0.45))",
  "full-offset": "below 5px linear-gradient(transparent 5%, rgb(255 255 255 / 0.45))",
}

/** Shadow, glow, reflection and 3-D rotation as CSS, for a shape's SVG or a text box's body. */
export function effectStyle(attrs: Attrs): Record<string, string> {
  const filters: string[] = []
  let shadow = String(attrs.shadow || "")
  // Pictures and old shapes kept their shadow as `effect`.
  if (!shadow && attrs.effect === "shadow") {
    shadow = "outer-br"
  }
  const offset = SHADOW_OFFSETS[shadow]
  if (offset) {
    filters.push(`drop-shadow(${offset[0]}px ${offset[1]}px 3px rgb(0 0 0 / 0.4))`)
  } else if (shadow === "perspective") {
    filters.push("drop-shadow(6px 8px 6px rgb(0 0 0 / 0.3))")
  } else if (shadow.startsWith("inner")) {
    // An inner shadow darkens the top left edge inside the shape.
    filters.push("drop-shadow(-1px -1px 0 rgb(0 0 0 / 0.35))")
  }
  const glow = String(attrs.glow || "")
  if (glow) {
    const [color, size] = glow.split(":")
    const radius = Number(size) || 8
    filters.push(`drop-shadow(0 0 ${radius / 2}px ${color}) drop-shadow(0 0 ${radius / 2}px ${color})`)
  }
  const rotation = ROTATIONS[String(attrs.rot3d || "")]
  const reflection = REFLECTION_CSS[String(attrs.reflection || "")]
  return {
    filter: filters.join(" "),
    transform: rotation ?? "",
    webkitBoxReflect: reflection ?? "",
  }
}

/** A text box's text fill, outline and effect, as CSS for its body. */
export function textStyle(attrs: Attrs): Record<string, string> {
  const fill = String(attrs.textFill || "")
  const outline = String(attrs.textOutline || "")
  const effect = String(attrs.textEffect || "")
  const shadows: Record<string, string> = {
    shadow: "2px 2px 2px rgb(0 0 0 / 0.4)",
    glow: "0 0 4px #ffc000, 0 0 8px #ffc000",
    bevel: "1px 1px 0 rgb(255 255 255 / 0.7), -1px -1px 0 rgb(0 0 0 / 0.3)",
  }
  const transforms: Record<string, string> = {
    "transform-arch": "perspective(200px) rotateX(12deg)",
    "transform-wave": "skewY(-4deg)",
  }
  return {
    color: fill && fill !== "none" ? fill : fill === "none" ? "transparent" : "",
    webkitTextStroke: outline ? `0.6px ${outline}` : "",
    textShadow: shadows[effect] ?? "",
    webkitBoxReflect:
      effect === "reflection" ? "below 0px linear-gradient(transparent 55%, rgb(255 255 255 / 0.4))" : "",
    transform: transforms[effect] ?? "",
  }
}

/** Direction and margins of a text box's text (the vertical alignment is measured: see `alignTextBox`). */
export function textLayoutStyle(attrs: Attrs): Record<string, string> {
  const direction = String(attrs.textDirection || "")
  return {
    writingMode: direction ? "vertical-rl" : "",
    textOrientation: direction === "stacked" ? "upright" : "",
    // 270°: the vertical text read from the bottom up.
    rotate: direction === "rotate270" ? "180deg" : "",
    padding: [attrs.insetT ?? 3.6, attrs.insetR ?? 7.2, attrs.insetB ?? 3.6, attrs.insetL ?? 7.2]
      .map((pt) => `${(Number(pt) * 4) / 3}px`)
      .join(" "),
    whiteSpace: attrs.noWrap ? "nowrap" : "",
  }
}

/**
 * Middle and bottom alignment in a text box of a set height: the text (inline content, so no flex box) is pushed
 * down by the room left under it.
 */
export function alignTextBox(body: HTMLElement, attrs: Attrs, zoom: number) {
  const vAlign = String(attrs.vAlign || "")
  const top = (Number(attrs.insetT ?? 3.6) * 4) / 3
  const height = Number(attrs.height) || 0
  if (!vAlign || vAlign === "top" || !height || attrs.textDirection) {
    body.style.paddingTop = `${top}px`
    return
  }
  const range = document.createRange()
  range.selectNodeContents(body)
  const text = range.getBoundingClientRect().height / (zoom || 1)
  const room = Math.max(0, height - top - (Number(attrs.insetB ?? 3.6) * 4) / 3 - text)
  body.style.paddingTop = `${top + (vAlign === "middle" ? room / 2 : room)}px`
}
