import { NO_CROP, cropOf, isCropped, type Crop } from "@/editor/picture-crop"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("The picture could not be read."))
    image.src = src
  })
}

/** The part of the picture's own pixels that shows, for a picture `width` by `height` pixels cropped by `crop`. */
export function sourceRect(width: number, height: number, crop: Crop) {
  const x = Math.round(crop.l * width)
  const y = Math.round(crop.t * height)
  return {
    x,
    y,
    width: Math.max(1, Math.round((1 - crop.l - crop.r) * width)),
    height: Math.max(1, Math.round((1 - crop.t - crop.b) * height)),
  }
}

/** The picture with everything outside `rect` cut away, at its own resolution. A PNG stays one; others become JPEG. */
async function trimmedSource(src: string, crop: Crop): Promise<string | null> {
  const image = await loadImage(src)
  const rect = sourceRect(image.naturalWidth, image.naturalHeight, crop)
  const canvas = document.createElement("canvas")
  canvas.width = rect.width
  canvas.height = rect.height
  const context = canvas.getContext("2d")
  if (!context) {
    return null
  }
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
  return src.startsWith("data:image/png") || !src.startsWith("data:")
    ? canvas.toDataURL(src.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png", 0.92)
    : canvas.toDataURL("image/jpeg", 0.92)
}

/**
 * Permanently crops pictures (21.47): their cropped-away pixels are deleted, so the file shrinks and the crop can no
 * longer be undone after saving. The visible result is unchanged: size stays, the crop becomes none. All changes are
 * one undo step. Returns how many pictures were flattened; uncropped ones are left alone.
 */
export async function flattenCropped(
  editor: Editor,
  scope: "selected" | "all",
  trim: (src: string, crop: Crop) => Promise<string | null> = trimmedSource,
) {
  const selection = editor.state.selection
  const targets: { pos: number; src: string; crop: Crop }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image" || !isCropped(node.attrs) || !node.attrs.src) {
      return
    }
    const picked = selection instanceof NodeSelection && selection.from === pos
    if (scope === "all" || picked) {
      targets.push({ pos, src: String(node.attrs.src), crop: cropOf(node.attrs) })
    }
  })
  const results = await Promise.all(targets.map((target) => trim(target.src, target.crop).catch(() => null)))
  const tr = editor.state.tr
  let count = 0
  results.forEach((src, index) => {
    const target = targets[index]
    const node = tr.doc.nodeAt(target.pos)
    // Edited while the pictures were read: leave those alone.
    if (!src || !node || node.type.name !== "image" || node.attrs.src !== target.src) {
      return
    }
    tr.setNodeMarkup(target.pos, undefined, { ...node.attrs, src, ...NO_CROP })
    count += 1
  })
  if (count) {
    editor.view.dispatch(tr)
  }
  return count
}
