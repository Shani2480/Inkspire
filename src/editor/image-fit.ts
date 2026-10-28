import { defaultPictureWrap } from "@/document/object-layout"
import { PX_PER_CM, PX_PER_MM } from "@/document/measure"
import { pageMetrics, setupColumns } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { clampColumnGap } from "@/editor/columns"
import { INDENT_STEP_PX, clampIndent } from "@/editor/indent"
import type { Editor } from "@tiptap/core"
import type { ResolvedPos } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"

export type ImageFitBounds = {
  kind: "body" | "cell" | "column"
  maxWidth: number
  maxHeight: number | null
}

const MIN_SIZE = 24
const SOFT_MAX_WIDTH = 400

export function loadImageNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({
        width: Math.max(1, image.naturalWidth || image.width || 1),
        height: Math.max(1, image.naturalHeight || image.height || 1),
      })
    }
    image.onerror = () => reject(new Error("Could not read image dimensions"))
    image.src = src
  })
}

export function fitImageSize(
  naturalWidth: number,
  naturalHeight: number,
  bounds: ImageFitBounds,
): { width: number; height: number } {
  const ratio = naturalWidth / Math.max(1, naturalHeight)
  let width = Math.max(1, naturalWidth)
  let height = Math.max(1, naturalHeight)

  // Never upscale; shrink to the container. Soft-cap body images that exceed 400px
  // when the line is wider, matching Word's "comfortable" default for large photos.
  let maxWidth = Math.max(MIN_SIZE, bounds.maxWidth)
  if (bounds.kind === "body" && maxWidth > SOFT_MAX_WIDTH && width > SOFT_MAX_WIDTH) {
    maxWidth = SOFT_MAX_WIDTH
  }

  if (width > maxWidth) {
    width = maxWidth
    height = width / ratio
  }

  if (bounds.maxHeight != null && height > bounds.maxHeight) {
    height = Math.max(MIN_SIZE, bounds.maxHeight)
    width = height * ratio
    if (width > maxWidth) {
      width = maxWidth
      height = width / ratio
    }
  }

  return {
    width: Math.max(MIN_SIZE, Math.round(width)),
    height: Math.max(MIN_SIZE, Math.round(height)),
  }
}

export function measureImageInsertBounds(editor: Editor, pos?: number): ImageFitBounds {
  const target = Math.max(0, Math.min(editor.state.doc.content.size, pos ?? editor.state.selection.from))
  const $pos = editor.state.doc.resolve(target)

  const cell = measureCellBounds(editor, $pos)
  if (cell) {
    return cell
  }

  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  let lineWidth = Math.max(MIN_SIZE, metrics.width - metrics.marginLeft - metrics.marginRight)
  let kind: ImageFitBounds["kind"] = "body"

  const columnWidth = measureColumnWidth(editor, $pos, lineWidth)
  if (columnWidth != null) {
    lineWidth = columnWidth
    kind = "column"
  }

  const blockInset = textBlockInset($pos)
  return {
    kind,
    maxWidth: Math.max(MIN_SIZE, lineWidth - blockInset),
    maxHeight: null,
  }
}

function measureCellBounds(editor: Editor, $pos: ResolvedPos): ImageFitBounds | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      continue
    }
    const pos = $pos.before(depth)
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      const style = getComputedStyle(dom)
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
      const innerW = Math.max(MIN_SIZE, dom.clientWidth - padX)
      const rawH = dom.clientHeight - padY
      // Empty/short cells grow with content — only clamp height when the cell already has room.
      const innerH = rawH >= 48 ? rawH : null
      return { kind: "cell", maxWidth: innerW, maxHeight: innerH }
    }
    return { kind: "cell", maxWidth: 160, maxHeight: 160 }
  }
  return null
}

function measureColumnWidth(editor: Editor, $pos: ResolvedPos, contentWidth: number): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.type.name !== "columnSection") {
      continue
    }
    const columns = Math.max(2, Number(node.attrs.columns) || 2)
    const gapCm = clampColumnGap(Number(node.attrs.gap) || 1.25)
    const gapPx = gapCm * PX_PER_CM
    return Math.max(MIN_SIZE, (contentWidth - gapPx * (columns - 1)) / columns)
  }

  const setup = useDocumentStore.getState().pageSetup
  if (setup.columns > 1 && setup.columnWidths) {
    // Unequal columns: the column the picture's block is drawn in, else the narrowest.
    const top = $pos.depth > 0 ? editor.view.nodeDOM($pos.before(1)) : null
    const drawn = top instanceof HTMLElement ? parseFloat(top.style.getPropertyValue("--col-w")) : NaN
    if (Number.isFinite(drawn) && drawn > 0) {
      return Math.max(MIN_SIZE, drawn)
    }
    return Math.max(MIN_SIZE, Math.min(...setupColumns(setup).map((column) => column.width * PX_PER_CM)))
  }
  if (setup.columns > 1) {
    const columns = setup.columns
    const gapPx = (setup.columnGap || 1.25) * PX_PER_CM
    return Math.max(MIN_SIZE, (contentWidth - gapPx * (columns - 1)) / columns)
  }

  // Live column layout from the editor DOM (page-level multi-column).
  const editorDom = editor.view.dom
  if (editorDom instanceof HTMLElement) {
    const count = Number(editorDom.dataset.columns || 0)
    if (count > 1) {
      const gap = parseFloat(getComputedStyle(editorDom).columnGap) || 0
      return Math.max(MIN_SIZE, (contentWidth - gap * (count - 1)) / count)
    }
  }

  return null
}

function textBlockInset($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.type.name !== "paragraph" && node.type.name !== "heading") {
      continue
    }
    const left = clampIndent(node.attrs.indent) * INDENT_STEP_PX
    const right = Math.max(0, Number(node.attrs.indentRight) || 0) * PX_PER_MM
    const special = String(node.attrs.specialIndent || "")
    const [kind, raw] = special.split(":")
    const amount = Number(raw) * PX_PER_CM
    const hanging = kind === "hanging" && Number.isFinite(amount) && amount > 0 ? amount : 0
    return left + right + hanging
  }
  return 0
}

export async function insertFittedImage(editor: Editor, options: { src: string; alt?: string; at?: number }) {
  if (editor.isDestroyed || !options.src) {
    return false
  }
  const at = options.at
  const bounds = measureImageInsertBounds(editor, at)
  let width: number | undefined
  let height: number | undefined
  try {
    const natural = await loadImageNaturalSize(options.src)
    const fitted = fitImageSize(natural.width, natural.height, bounds)
    width = fitted.width
    height = fitted.height
  } catch {
    width = Math.min(SOFT_MAX_WIDTH, bounds.maxWidth)
    height = Math.round(width * 0.75)
  }

  if (editor.isDestroyed) {
    return false
  }

  const chain = editor.chain().focus()
  if (at != null) {
    chain.setTextSelection(at)
  }
  const inserted = chain
    .setImage({
      src: options.src,
      alt: options.alt || "",
      width,
      height,
    })
    .run()
  // Set as Default Layout: a new picture takes the chosen wrap, from where it was put in line.
  const wrap = defaultPictureWrap()
  if (inserted && wrap !== "inline") {
    const { from } = editor.state.selection
    const before = from > 0 ? editor.state.doc.resolve(from).nodeBefore : null
    const at = before?.type.name === "image" ? from - before.nodeSize : null
    if (at !== null) {
      editor.chain().setNodeSelection(at).setObjectWrap(wrap).run()
    }
  }
  return inserted
}

function imageFilesFromList(list: FileList | File[] | null | undefined) {
  if (!list) {
    return [] as File[]
  }
  return [...list].filter((file) => file.type.startsWith("image/"))
}

export function imagePasteDropPlugin(editor: Editor) {
  return new Plugin({
    key: new PluginKey("imageAutoFit"),
    props: {
      handlePaste(_view, event) {
        const files = imageFilesFromList(event.clipboardData?.files)
        if (files.length === 0 && event.clipboardData?.items) {
          for (const item of event.clipboardData.items) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
              const file = item.getAsFile()
              if (file) {
                files.push(file)
              }
            }
          }
        }
        if (files.length === 0) {
          return false
        }
        event.preventDefault()
        void insertImageFiles(editor, files)
        return true
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) {
          return false
        }
        const files = imageFilesFromList(event.dataTransfer?.files)
        if (files.length === 0) {
          return false
        }
        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        void insertImageFiles(editor, files, coords?.pos)
        return true
      },
    },
  })
}

async function insertImageFiles(editor: Editor, files: File[], at?: number) {
  let position = at
  for (const file of files) {
    const src = await readFileAsDataUrl(file)
    if (!src) {
      continue
    }
    const before = editor.state.doc.content.size
    await insertFittedImage(editor, { src, alt: file.name, at: position })
    // Stack subsequent images after the one just inserted.
    if (position != null) {
      position = Math.min(editor.state.doc.content.size, position + (editor.state.doc.content.size - before) + 1)
    }
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => resolve("")
    reader.readAsDataURL(file)
  })
}
