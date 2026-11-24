import { cropOf, type Crop } from "@/editor/picture-crop"

/**
 * The Crop part of Word's Format Picture pane: the whole picture's size and its offset from the frame's centre
 * (Picture position), and the frame's size and its place on the picture (Crop position), all in pixels. A picture
 * keeps its crop as the share cut off each side plus the frame's size; these are the same thing measured Word's way.
 */
export type CropFields = {
  /** The whole picture, at the scale it is shown. */
  pictureWidth: number
  pictureHeight: number
  /** The picture's centre from the frame's centre, as Word's Offset X and Y. */
  offsetX: number
  offsetY: number
  /** The frame: the part of the picture that shows. */
  cropWidth: number
  cropHeight: number
  /** The frame's left and top edges from the picture's. */
  cropLeft: number
  cropTop: number
}

type Attrs = Record<string, unknown>

/** The fields for a picture shown `width` by `height` pixels with its crop. */
export function cropFields(width: number, height: number, attrs: Attrs): CropFields {
  const crop = cropOf(attrs)
  const pictureWidth = width / Math.max(0.05, 1 - crop.l - crop.r)
  const pictureHeight = height / Math.max(0.05, 1 - crop.t - crop.b)
  const cropLeft = crop.l * pictureWidth
  const cropTop = crop.t * pictureHeight
  return {
    pictureWidth,
    pictureHeight,
    offsetX: (pictureWidth - width) / 2 - cropLeft,
    offsetY: (pictureHeight - height) / 2 - cropTop,
    cropWidth: width,
    cropHeight: height,
    cropLeft,
    cropTop,
  }
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * The attributes after one field changes, as Word moves the rest: the picture's size and offset keep the frame where
 * it is on the page; the frame's size keeps its left and top edges on the picture.
 */
export function withCropField(fields: CropFields, key: keyof CropFields, value: number): Attrs {
  const next = { ...fields, [key]: value }
  const pictureWidth = Math.max(1, next.pictureWidth)
  const pictureHeight = Math.max(1, next.pictureHeight)
  const cropWidth = Math.max(1, next.cropWidth)
  const cropHeight = Math.max(1, next.cropHeight)
  let { cropLeft, cropTop } = next
  if (key === "pictureWidth" || key === "offsetX") {
    cropLeft = (pictureWidth - cropWidth) / 2 - next.offsetX
  }
  if (key === "pictureHeight" || key === "offsetY") {
    cropTop = (pictureHeight - cropHeight) / 2 - next.offsetY
  }
  const crop: Crop = {
    l: cropLeft / pictureWidth,
    r: 1 - (cropLeft + cropWidth) / pictureWidth,
    t: cropTop / pictureHeight,
    b: 1 - (cropTop + cropHeight) / pictureHeight,
  }
  // A side may leave empty room (a negative crop, as Fit leaves) but not cut off nearly all of the picture.
  const side = (share: number) => round(Math.max(-100, Math.min(95, share * 100)))
  return {
    width: round(cropWidth),
    height: round(cropHeight),
    cropL: side(crop.l),
    cropT: side(crop.t),
    cropR: side(crop.r),
    cropB: side(crop.b),
  }
}
