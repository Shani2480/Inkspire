import { NO_EFFECTS, numberAttr, stringAttr } from "@/editor/shape-style"

/**
 * Word's Picture Format (21.2): corrections (brightness and contrast), colour (saturation, recolour), artistic
 * effects, transparency, the frame (border, rounded corners) and, shared with shapes, shadow, reflection, glow, soft
 * edges and 3-D rotation. A picture keeps each as an attribute; `pictureFilter` draws the adjustments as a CSS filter
 * so every choice previews live, and the .docx writer turns them into `a:lum`, `a:grayscl`, `a:alphaModFix` and the
 * picture's own `a:ln`.
 */

type Attrs = Record<string, unknown>

/** The attributes a picture takes besides its size, position and crop. */
export function pictureFormatAttributes() {
  return {
    // Corrections, -100 to 100 as Word's Brightness and Contrast.
    brightness: numberAttr("brightness"),
    contrast: numberAttr("contrast"),
    // Colour: saturation in percent (Word's 0 to 400), and a recolour: grayscale, sepia, washout, black-white.
    saturation: numberAttr("saturation", 100),
    recolor: stringAttr("recolor"),
    artistic: stringAttr("artistic"),
    // Percent transparent, 0 to 100.
    transparency: numberAttr("transparency"),
    borderWidth: numberAttr("borderWidth"),
    borderDash: stringAttr("borderDash"),
    // The picture's shape: "" (rectangle), "rounded" or "oval".
    frame: stringAttr("frame"),
    shadow: stringAttr("shadow"),
    glow: stringAttr("glow"),
    softEdge: numberAttr("softEdge"),
    reflection: stringAttr("reflection"),
    rot3d: stringAttr("rot3d"),
  }
}

/** Every attribute Reset Picture takes back. */
export const PICTURE_RESET: Attrs = {
  ...NO_EFFECTS,
  brightness: 0,
  contrast: 0,
  saturation: 100,
  recolor: "",
  artistic: "",
  transparency: 0,
  border: "",
  borderWidth: 0,
  borderDash: "",
  frame: "",
  effect: "",
  cropL: 0,
  cropT: 0,
  cropR: 0,
  cropB: 0,
}

export const CORRECTION_STEPS = [-40, -20, 0, 20, 40]

export const SATURATIONS = [0, 33, 66, 100, 200, 300, 400]

export const RECOLORS = [
  { id: "", label: "No Recolor" },
  { id: "grayscale", label: "Grayscale" },
  { id: "sepia", label: "Sepia" },
  { id: "washout", label: "Washout" },
  { id: "black-white", label: "Black and White: 50%" },
]

export const ARTISTIC_EFFECTS = [
  { id: "", label: "None" },
  { id: "blur", label: "Blur" },
  { id: "pencil", label: "Pencil Grayscale" },
  { id: "photocopy", label: "Photocopy" },
  { id: "paint", label: "Paint Brush" },
]

export const TRANSPARENCIES = [0, 15, 30, 50, 65, 80, 95]

export const BORDER_WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6]

export const BORDER_DASHES = [
  { id: "", label: "Solid", css: "solid" },
  { id: "dot", label: "Round Dot", css: "dotted" },
  { id: "dash", label: "Dash", css: "dashed" },
]

/** A picture style: Word's gallery of frames, shadows, reflections and shapes. */
export type PictureStyle = { id: string; label: string; attrs: Attrs }

const NO_STYLE: Attrs = { ...NO_EFFECTS, border: "", borderWidth: 0, borderDash: "", frame: "", effect: "" }

export const PICTURE_STYLE_GALLERY: PictureStyle[] = [
  { id: "plain", label: "No Style", attrs: NO_STYLE },
  {
    id: "simple",
    label: "Simple Frame, White",
    attrs: { ...NO_STYLE, border: "#ffffff", borderWidth: 6, shadow: "outer-br" },
  },
  { id: "black", label: "Simple Frame, Black", attrs: { ...NO_STYLE, border: "#000000", borderWidth: 2.25 } },
  { id: "shadow", label: "Drop Shadow Rectangle", attrs: { ...NO_STYLE, shadow: "outer-br" } },
  {
    id: "rounded",
    label: "Rounded Diagonal Corner, White",
    attrs: { ...NO_STYLE, border: "#ffffff", borderWidth: 6, frame: "rounded", shadow: "outer-br" },
  },
  { id: "oval", label: "Soft Edge Oval", attrs: { ...NO_STYLE, frame: "oval", softEdge: 10 } },
  { id: "soft", label: "Soft Edge Rectangle", attrs: { ...NO_STYLE, softEdge: 10 } },
  {
    id: "reflected",
    label: "Reflected Rounded Rectangle",
    attrs: { ...NO_STYLE, frame: "rounded", reflection: "half-tight" },
  },
  {
    id: "metal",
    label: "Metal Frame",
    attrs: { ...NO_STYLE, border: "#7f7f7f", borderWidth: 4.5, shadow: "outer-br" },
  },
  { id: "dark", label: "Thick Matte, Black", attrs: { ...NO_STYLE, border: "#000000", borderWidth: 6 } },
  { id: "blue", label: "Simple Frame, Blue", attrs: { ...NO_STYLE, border: "#0f6cbd", borderWidth: 3 } },
  {
    id: "tilt",
    label: "Perspective Shadow, White",
    attrs: { ...NO_STYLE, border: "#ffffff", borderWidth: 6, shadow: "perspective" },
  },
]

/**
 * The picture's colour and tone adjustments as a CSS filter. Brightness and contrast follow Word's -100 to 100 (a
 * 50% step is a 0.5 change of the CSS factor), saturation is in percent, and the recolours and artistic effects stand
 * on the same filter functions.
 */
export function pictureFilter(attrs: Attrs): string {
  const filters: string[] = []
  const brightness = Number(attrs.brightness) || 0
  const contrast = Number(attrs.contrast) || 0
  const saturation = attrs.saturation === undefined ? 100 : Number(attrs.saturation)
  if (brightness) {
    filters.push(`brightness(${(1 + brightness / 100).toFixed(2)})`)
  }
  if (contrast) {
    filters.push(`contrast(${(1 + contrast / 100).toFixed(2)})`)
  }
  if (saturation !== 100 && Number.isFinite(saturation)) {
    filters.push(`saturate(${(saturation / 100).toFixed(2)})`)
  }
  switch (String(attrs.recolor || "")) {
    case "grayscale":
      filters.push("grayscale(1)")
      break
    case "sepia":
      filters.push("sepia(1)")
      break
    case "washout":
      filters.push("brightness(1.5) contrast(0.6)")
      break
    case "black-white":
      filters.push("grayscale(1) contrast(4)")
      break
  }
  switch (String(attrs.artistic || "")) {
    case "blur":
      filters.push("blur(2px)")
      break
    case "pencil":
      filters.push("grayscale(1) contrast(1.8) brightness(1.1)")
      break
    case "photocopy":
      filters.push("grayscale(1) contrast(5) brightness(1.15)")
      break
    case "paint":
      filters.push("saturate(1.5) contrast(1.2) blur(0.6px)")
      break
  }
  // The older softened picture.
  if (attrs.effect === "soft") {
    filters.push("contrast(0.92) brightness(1.05)")
  }
  return filters.join(" ")
}

/** True when a picture carries any of Word's picture formatting, so a source drawing cannot stand for it. */
export function hasPictureFormat(attrs: Attrs): boolean {
  return (
    Boolean(Number(attrs.brightness)) ||
    Boolean(Number(attrs.contrast)) ||
    (attrs.saturation !== undefined && Number(attrs.saturation) !== 100) ||
    Boolean(attrs.recolor) ||
    Boolean(attrs.artistic) ||
    Boolean(Number(attrs.transparency)) ||
    Boolean(attrs.border) ||
    Boolean(attrs.frame) ||
    Boolean(attrs.shadow) ||
    Boolean(attrs.glow) ||
    Boolean(Number(attrs.softEdge)) ||
    Boolean(attrs.reflection)
  )
}

/** The pixels a picture needs at `ppi` for the size it is shown at (96 CSS pixels to the inch). */
export function targetPixels(displayWidth: number, displayHeight: number, ppi: number) {
  const scale = ppi / 96
  return {
    width: Math.max(1, Math.round(displayWidth * scale)),
    height: Math.max(1, Math.round(displayHeight * scale)),
  }
}

export const COMPRESS_TARGETS = [
  { id: "print", label: "Print (220 ppi): excellent quality on most printers and screens", ppi: 220 },
  { id: "web", label: "Web (150 ppi): good for web pages and projectors", ppi: 150 },
  { id: "email", label: "Email (96 ppi): minimize document size for sharing", ppi: 96 },
] as const
