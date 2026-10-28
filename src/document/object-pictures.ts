import { floatingAttributes } from "@/editor/objects"
import { textBoxChains } from "@/editor/text-box-link"
import { textBoxMark } from "@/document/docx/word-text-box"
import type { Editor, JSONContent } from "@tiptap/core"
import { DOMParser as ProseDOMParser, Fragment, type Node as ProseNode, type Schema } from "@tiptap/pm/model"

/** The objects Word has no part for: each is saved as its picture, with itself kept inside to open again. */
const OBJECT_TYPES = new Set(["figure", "threeDModel", "smartArt", "drawingCanvas", "textBox"])

/**
 * What an object and its picture share: the size, the turn, the wrap and the place, and for a chart opened from
 * Word the run it came from, so an unchanged chart keeps Word's parts.
 */
const LAYOUT_KEYS = ["width", "height", "rotate", "docxKey", ...Object.keys(floatingAttributes("inline"))]

const SKIPPED = "[data-resize], [data-rotate], [data-object-handle], .object-edge, .object-size-tip"

const SVG_STYLES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
]

type Paint =
  | { kind: "box"; x: number; y: number; w: number; h: number; style: CSSStyleDeclaration }
  | { kind: "text"; x: number; y: number; text: string; font: string; color: string }
  | { kind: "image"; x: number; y: number; w: number; h: number; src: string }

/**
 * The object as JSON, with the size its picture was saved at (`shown`), to tell whether Word resized it, and
 * anything else the saved file draws it from (a SmartArt graphic's `shapes`).
 */
function encodeObject(node: ProseNode, shown: [number, number], extra: Record<string, unknown> = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...node.toJSON(), shown, ...extra }))
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

type SavedObject = JSONContent & {
  shown?: [number, number]
  /** A text box opened from Word: its text as HTML, read into the box here. */
  html?: string
  fromWord?: boolean
}

function decodeObject(data: string): SavedObject | null {
  try {
    const binary = atob(data)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as JSONContent
  } catch {
    return null
  }
}

/** An SVG drawn on its own: the page's styles do not reach it, so its computed ones are written into it. */
function svgSource(svg: SVGSVGElement, width: number, height: number) {
  const copy = svg.cloneNode(true) as SVGSVGElement
  const from = [svg, ...svg.querySelectorAll("*")]
  const to = [copy, ...copy.querySelectorAll("*")]
  from.forEach((element, index) => {
    const style = getComputedStyle(element)
    const target = to[index] as SVGElement | undefined
    if (target) {
      target.setAttribute("style", SVG_STYLES.map((name) => `${name}:${style.getPropertyValue(name)}`).join(";"))
    }
  })
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  copy.setAttribute("width", String(width))
  copy.setAttribute("height", String(height))
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
}

/** What the object shows, as boxes, text and images, in the object's own pixels. */
function paintsOf(dom: HTMLElement): { width: number; height: number; paints: Paint[] } {
  const turn = dom.style.transform
  dom.style.transform = "none"
  try {
    const frame = dom.getBoundingClientRect()
    const width = dom.offsetWidth || frame.width
    const height = dom.offsetHeight || frame.height
    const scale = frame.width / (width || 1) || 1
    const at = (rect: DOMRect) => ({
      x: (rect.left - frame.left) / scale,
      y: (rect.top - frame.top) / scale,
      w: rect.width / scale,
      h: rect.height / scale,
    })
    const paints: Paint[] = []
    const visit = (element: Element) => {
      if (element !== dom && element.matches(SKIPPED)) {
        return
      }
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden") {
        return
      }
      const box = at(element.getBoundingClientRect())
      if (element instanceof SVGSVGElement) {
        paints.push({ kind: "image", ...box, src: svgSource(element, box.w, box.h) })
        return
      }
      if (element instanceof HTMLCanvasElement) {
        try {
          paints.push({ kind: "image", ...box, src: element.toDataURL("image/png") })
        } catch {
          // A canvas with another site's pictures in it cannot be read.
        }
        return
      }
      if (element instanceof HTMLImageElement) {
        paints.push({ kind: "image", ...box, src: element.currentSrc || element.src })
        return
      }
      paints.push({ kind: "box", ...box, style })
      for (const child of element.childNodes) {
        if (child instanceof Element) {
          visit(child)
        } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
          const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
          const text = child.textContent
          const range = document.createRange()
          // Word by word, so wrapped lines land where they are shown.
          for (const match of text.matchAll(/\S+/g)) {
            range.setStart(child, match.index)
            range.setEnd(child, match.index + match[0].length)
            const rect = range.getClientRects()[0]
            if (rect) {
              const place = at(rect)
              paints.push({
                kind: "text",
                x: place.x,
                y: place.y + place.h / 2,
                text: match[0],
                font,
                color: style.color,
              })
            }
          }
        }
      }
    }
    visit(dom)
    return { width, height, paints }
  } finally {
    dom.style.transform = turn
  }
}

function paintBox(context: CanvasRenderingContext2D, paint: Extract<Paint, { kind: "box" }>) {
  const { x, y, w, h, style } = paint
  const radius = Number.parseFloat(style.borderTopLeftRadius) || 0
  const background = style.backgroundColor
  if (background && background !== "transparent" && !/rgba\(.*,\s*0\)$/.test(background)) {
    context.fillStyle = background
    context.beginPath()
    context.roundRect(x, y, w, h, radius)
    context.fill()
  }
  const sides = [
    ["Top", x, y, w, Number.parseFloat(style.borderTopWidth)],
    ["Bottom", x, y + h, w, Number.parseFloat(style.borderBottomWidth)],
    ["Left", x, y, Number.parseFloat(style.borderLeftWidth), h],
    ["Right", x + w, y, Number.parseFloat(style.borderRightWidth), h],
  ] as const
  for (const [side, left, top, across, down] of sides) {
    const size = side === "Top" || side === "Bottom" ? down : across
    if (!size || style.getPropertyValue(`border-${side.toLowerCase()}-style`) === "none") {
      continue
    }
    context.fillStyle = style.getPropertyValue(`border-${side.toLowerCase()}-color`)
    if (side === "Top" || side === "Bottom") {
      context.fillRect(left, side === "Top" ? top : top - size, across, size)
    } else {
      context.fillRect(side === "Left" ? left : left - size, top, size, down)
    }
  }
}

async function loadImage(src: string) {
  const image = new Image()
  image.src = src
  try {
    await image.decode()
    return image
  } catch {
    return null
  }
}

/** The object's picture as a PNG data URL, drawn at twice its size so it stays sharp. */
async function objectPicture(dom: HTMLElement) {
  const { width, height, paints } = paintsOf(dom)
  if (!width || !height) {
    return null
  }
  const images = await Promise.all(paints.map((paint) => (paint.kind === "image" ? loadImage(paint.src) : null)))
  const canvas = document.createElement("canvas")
  const density = 2
  canvas.width = Math.ceil(width * density)
  canvas.height = Math.ceil(height * density)
  const context = canvas.getContext("2d")
  if (!context) {
    return null
  }
  context.scale(density, density)
  context.textBaseline = "middle"
  paints.forEach((paint, index) => {
    if (paint.kind === "box") {
      paintBox(context, paint)
    } else if (paint.kind === "text") {
      context.font = paint.font
      context.fillStyle = paint.color
      context.fillText(paint.text, paint.x, paint.y)
    } else {
      const image = images[index]
      if (image && paint.w > 0 && paint.h > 0) {
        try {
          context.drawImage(image, paint.x, paint.y, paint.w, paint.h)
        } catch {
          // A picture that cannot be drawn is left out.
        }
      }
    }
  })
  try {
    return { src: canvas.toDataURL("image/png"), width: Math.round(width), height: Math.round(height) }
  } catch {
    return null
  }
}

function layoutOf(node: ProseNode, schema: Schema, into: string) {
  const type = schema.nodes[into]
  const attrs: Record<string, unknown> = {}
  for (const key of LAYOUT_KEYS) {
    if (type && key in type.spec.attrs! && key in node.attrs) {
      attrs[key] = node.attrs[key]
    }
  }
  return attrs
}

/**
 * Linked text boxes as Word keeps them: the chain's whole text in its first box, the others empty, each numbered
 * by its place from 0. Opened again, the text flows on from the first box as it did.
 */
export function chainsAsWord(doc: ProseNode) {
  const saved = new Map<number, ProseNode>()
  for (const boxes of textBoxChains(doc).values()) {
    const text = boxes.reduce((all, box) => all.append(box.node.content), Fragment.empty)
    boxes.forEach((box, index) => {
      const attrs = { ...box.node.attrs, linkSeq: index }
      saved.set(box.pos, box.node.type.create(attrs, index === 0 ? text : Fragment.empty, box.node.marks))
    })
  }
  return saved
}

/**
 * The document as it goes into a .docx: each shape, chart, 3D model, SmartArt, drawing canvas and text box becomes
 * the picture it shows, at its size and with its wrap and place, carrying the object to open as itself again.
 */
export async function documentWithObjectPictures(editor: Editor): Promise<JSONContent> {
  const { state, view } = editor
  const image = state.schema.nodes.image
  const found: { pos: number; node: ProseNode; dom: HTMLElement }[] = []
  state.doc.descendants((node, pos) => {
    if (!OBJECT_TYPES.has(node.type.name)) {
      return true
    }
    const dom = view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      found.push({ pos, node, dom })
    }
    return false
  })
  if (!image || found.length === 0) {
    return editor.getJSON()
  }
  const pictures = await Promise.all(found.map(({ dom }) => objectPicture(dom)))
  const saved = chainsAsWord(state.doc)
  const tr = state.tr
  for (let index = found.length - 1; index >= 0; index -= 1) {
    const { pos, node } = found[index]!
    const picture = pictures[index]
    if (!picture) {
      continue
    }
    const attrs = layoutOf(node, state.schema, "image")
    const width = Number(node.attrs.width) || picture.width
    const height = Number(node.attrs.height) || picture.height
    const picturedNode = image.create({
      ...attrs,
      src: picture.src,
      alt: typeof node.attrs.alt === "string" ? node.attrs.alt : null,
      width,
      height,
      // A text box always floats, as its picture does.
      ...(node.type.name === "textBox" && attrs.wrap === "inline" ? { wrap: "front" } : {}),
      objectNode: encodeObject(
        saved.get(pos) ?? node,
        [width, height],
        node.type.name === "smartArt" ? { shapes: smartArtShapes(found[index]!.dom) } : {},
      ),
    })
    tr.replaceWith(pos, pos + node.nodeSize, picturedNode)
  }
  return tr.doc.toJSON() as JSONContent
}

const SHAPE_PRESETS: Record<string, string> = {
  rect: "rect",
  rounded: "roundRect",
  ellipse: "ellipse",
  hexagon: "hexagon",
  diamond: "diamond",
  parallelogram: "parallelogram",
}

let swatch: CanvasRenderingContext2D | null | undefined

/** A computed colour, in any CSS form (`rgb()`, `oklch()`…), as #rrggbb; "" for transparent. */
function hexColor(value: string) {
  swatch ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (!swatch || !value || value === "transparent") {
    return ""
  }
  swatch.clearRect(0, 0, 1, 1)
  swatch.fillStyle = "#000"
  swatch.fillStyle = value
  swatch.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data
  if (!a) {
    return ""
  }
  return `#${[r, g, b].map((part) => (part ?? 0).toString(16).padStart(2, "0")).join("")}`
}

/**
 * The shapes of a SmartArt graphic as it is drawn, for the drawing Word keeps with the diagram: each shape's box in
 * px from the graphic's corner, its outline, colours and text.
 */
function smartArtShapes(dom: HTMLElement) {
  const frame = dom.getBoundingClientRect()
  const zoom = dom.offsetWidth > 0 ? frame.width / dom.offsetWidth || 1 : 1
  return [...dom.querySelectorAll<HTMLElement>(".smartart-cell")].map((cell) => {
    const box = cell.getBoundingClientRect()
    const style = getComputedStyle(cell)
    const text = cell.querySelector<HTMLElement>(".smartart-text") ?? cell
    const rounded = parseFloat(style.borderTopLeftRadius) > 0
    const preset =
      SHAPE_PRESETS[cell.dataset.shape ?? ""] ??
      (style.borderTopLeftRadius === "50%" ? "ellipse" : rounded ? "roundRect" : "rect")
    return {
      x: Math.round(((box.left - frame.left) / zoom) * 100) / 100,
      y: Math.round(((box.top - frame.top) / zoom) * 100) / 100,
      w: Math.round((box.width / zoom) * 100) / 100,
      h: Math.round((box.height / zoom) * 100) / 100,
      text: text.innerText ?? text.textContent ?? "",
      preset,
      fill: hexColor(style.backgroundColor),
      line: parseFloat(style.borderTopWidth) > 0 ? hexColor(style.borderTopColor) : "",
      color: hexColor(getComputedStyle(text).color),
      size: Math.round((parseFloat(getComputedStyle(text).fontSize) || 16) * 0.75 * 10) / 10,
    }
  })
}

/** The object a picture carries; a Word text box's text comes as HTML, read as the editor reads pasted text. */
function objectOf(schema: Schema, json: SavedObject) {
  const object = schema.nodeFromJSON(json)
  if (json.html === undefined || typeof document === "undefined") {
    return object
  }
  const holder = document.createElement("div")
  holder.innerHTML = json.html
  return ProseDOMParser.fromSchema(schema).parse(holder, { topNode: object.type.create(object.attrs) })
}

/** Pictures saved for the app's own objects open as those objects again, at the size and place the file gives. */
export function restoreObjects(editor: Editor) {
  const { state } = editor
  const tr = state.tr
  const found: { pos: number; node: ProseNode }[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === "image" && node.attrs.objectNode) {
      found.push({ pos, node })
    }
    return true
  })
  for (let index = found.length - 1; index >= 0; index -= 1) {
    const { pos, node } = found[index]!
    const json = decodeObject(String(node.attrs.objectNode))
    if (!json?.type || !OBJECT_TYPES.has(json.type)) {
      continue
    }
    try {
      const object = objectOf(state.schema, json)
      const layout = layoutOf(node, state.schema, object.type.name)
      const [width, height] = json.shown ?? [0, 0]
      if (Math.abs(Number(node.attrs.width) - width) <= 1 && Math.abs(Number(node.attrs.height) - height) <= 1) {
        // Not resized since: the object keeps its own size (none, for one that sizes itself).
        delete layout.width
        delete layout.height
      }
      // The layout as the file has it, in case Word moved, sized or wrapped the picture.
      let restored = object.type.create(
        { ...object.attrs, ...Object.fromEntries(Object.entries(layout).filter(([key]) => key in object.attrs)) },
        object.content,
        object.marks,
      )
      if (json.fromWord && "wordBox" in restored.attrs) {
        // Marked as Word wrote it, so saving it unchanged keeps Word's own drawing.
        restored = restored.type.create(
          { ...restored.attrs, wordBox: textBoxMark(restored.toJSON()) },
          restored.content,
        )
      }
      tr.replaceWith(pos, pos + node.nodeSize, restored)
    } catch {
      // An object this version cannot read stays a picture.
    }
  }
  if (tr.docChanged) {
    editor.view.dispatch(tr.setMeta("addToHistory", false))
  }
}
