import { VARIANT_OF_PRESET } from "@/document/docx/shape-import"
import { shapeMarkup, shapeViewBox } from "@/editor/insert-blocks"
import { dashArray } from "@/editor/shape-style"

/**
 * Word's Crop to Shape: a picture shown through one of the preset shapes. The picture's `frame` attribute names the
 * shape: "" a rectangle, "rounded" and "oval" (drawn with rounded corners, as before), or the shape gallery's name
 * for any other. In .docx it is the picture's own `a:prstGeom`.
 */

const PRESET_OF_VARIANT = new Map(Object.entries(VARIANT_OF_PRESET).map(([preset, variant]) => [variant, preset]))

/** The shape gallery's name for a picture's frame. */
export function frameVariant(frame: string) {
  return frame === "oval" ? "ellipse" : frame === "rounded" ? "round" : frame || "rect"
}

/** The frame a picture takes for a shape from the gallery. */
export function frameForVariant(variant: string) {
  return variant === "ellipse" ? "oval" : variant === "round" ? "rounded" : variant === "rect" ? "" : variant
}

/** Word's preset geometry for a picture's frame; a rectangle for a shape Word has no preset for. */
export function presetOfFrame(frame: string) {
  return PRESET_OF_VARIANT.get(frameVariant(frame)) ?? "rect"
}

/** The frame for Word's preset geometry on a picture; "" for a rectangle or a preset the app does not draw. */
export function frameOfPreset(preset: string | undefined) {
  const variant = preset ? VARIANT_OF_PRESET[preset] : undefined
  return variant ? frameForVariant(variant) : ""
}

/** Whether a shape can hold a picture: Word has a preset for it and it is a closed outline (not a line). */
export function croppableShape(variant: string) {
  return PRESET_OF_VARIANT.has(variant)
}

const MASKS = new Map<string, string>()

/**
 * A CSS mask showing the picture through the frame's shape, stretched to the picture as Word stretches a preset;
 * null for a rectangle and for rounded and oval, which are drawn with rounded corners.
 */
export function shapeMask(frame: string): string | null {
  if (!frame || frame === "rounded" || frame === "oval") {
    return null
  }
  const cached = MASKS.get(frame)
  if (cached) {
    return cached
  }
  // The drawing in solid black with no outline: the mask is its filled area.
  const body = shapeMarkup(frame)
    .replace(/fill="(?!none")[^"]*"/g, 'fill="#000"')
    .replace(/stroke="[^"]*"/g, 'stroke="none"')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shapeViewBox(frame)}" preserveAspectRatio="none">${body}</svg>`
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  MASKS.set(frame, mask)
  return mask
}

/**
 * The picture border along a Crop to Shape outline (a CSS outline would be masked away with the rest): the shape's
 * drawing stroked in the border's colour, its weight in pixels however the shape is stretched.
 */
export function shapeOutlineSvg(frame: string, color: string, widthPx: number, dash: string) {
  const pattern = dash === "dot" ? dashArray("round-dot", widthPx) : dash === "dash" ? dashArray("dash", widthPx) : ""
  const body = shapeMarkup(frame)
    .replace(/fill="[^"]*"/g, 'fill="none"')
    .replace(/stroke="[^"]*"/g, "")
    .replace(/stroke-width="[^"]*"/g, "")
    .replace(
      /<(rect|ellipse|polygon|path|circle|polyline)\b/g,
      `<$1 stroke="${color}" stroke-width="${widthPx}" vector-effect="non-scaling-stroke"${pattern ? ` stroke-dasharray="${pattern}" stroke-linecap="round"` : ""}`,
    )
  return { viewBox: shapeViewBox(frame), body }
}
