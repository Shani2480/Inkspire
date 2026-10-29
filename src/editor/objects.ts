import { pageGridCell } from "@/document/page-grid"
import { pageMetrics, type PageMetrics } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { imagePasteDropPlugin } from "@/editor/image-fit"
import {
  bindPictureCrop,
  cropOf,
  ensureCropHandles,
  isCropped,
  pictureCropAttributes,
  useCropMode,
  wholeSize,
} from "@/editor/picture-crop"
import { shapeMask, shapeOutlineSvg } from "@/editor/picture-shape"
import { bindObjectResize, type Box, type ResizeEdge } from "@/editor/object-resize"
import { bindRotate, ensureRotateHandle, rotatedBounds } from "@/editor/object-rotate"
import { PAGE_GAP } from "@/editor/pages"
import { BORDER_DASHES, pictureFilter, pictureFormatAttributes } from "@/editor/picture-format"
import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import Image from "@tiptap/extension-image"
import type { Node as ProseNode } from "@tiptap/pm/model"
import {
  alignTextBox,
  cssDash,
  cssGradient,
  cssTexture,
  effectStyle,
  shapeStyleAttributes,
  textBoxStyleAttributes,
  textLayoutStyle,
  textStyle,
} from "@/editor/shape-style"
import { NodeSelection, Plugin, type EditorState, type Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

export type ObjectWrap = "inline" | "square" | "tight" | "through" | "topBottom" | "behind" | "front"
/** Word's Move with Text (the object keeps its offset from its paragraph) or Fix Position on Page. */
export type ObjectAnchoring = "move" | "fixed"

/** Word's wrap choices, in its order: in line, then the ones text wraps around, then behind and in front. */
export const WRAP_CHOICES: { id: ObjectWrap; label: string }[] = [
  { id: "inline", label: "In Line with Text" },
  { id: "square", label: "Square" },
  { id: "tight", label: "Tight" },
  { id: "through", label: "Through" },
  { id: "topBottom", label: "Top and Bottom" },
  { id: "behind", label: "Behind Text" },
  { id: "front", label: "In Front of Text" },
]

/** Whether an editor is a header or footer: there pictures sit in line, behind the text or in front of it. */
export function isChromeEditor(editor: Editor | null) {
  return Boolean(editor?.view.dom.classList.contains("chrome-editor"))
}

/** The wraps an object offers: a text box is never in line, and a header has no text to wrap around an object. */
export function wrapChoicesFor(editor: Editor | null, objectName?: string) {
  const chrome = isChromeEditor(editor)
  return WRAP_CHOICES.filter(
    (choice) =>
      !(objectName === "textBox" && choice.id === "inline") &&
      !(chrome && choice.id !== "inline" && choice.id !== "behind" && choice.id !== "front"),
  )
}

/** Text flows beside the object (on its roomier side), as Word's "Largest only". */
export function wrapsBeside(wrap: unknown) {
  return wrap === "square" || wrap === "tight" || wrap === "through"
}

/** Space kept between the object and the text beside it: Word's 0.13" for Square, less for Tight and Through. */
export function wrapDistance(wrap: unknown) {
  return wrap === "square" ? 12 : wrap === "tight" || wrap === "through" ? 6 : 0
}

/** Word's "Wrap text": on both sides, only one side, or the side with more room. */
export type WrapSide = "both" | "left" | "right" | "largest"
export const WRAP_SIDES: { id: WrapSide; label: string }[] = [
  { id: "both", label: "Both sides" },
  { id: "left", label: "Left only" },
  { id: "right", label: "Right only" },
  { id: "largest", label: "Largest only" },
]

export function wrapSide(value: unknown): WrapSide {
  return value === "left" || value === "right" || value === "largest" ? value : "both"
}

/** Distance from text on each side, in pixels: the object's own (Layout > Text Wrapping) or its wrap's default. */
export function wrapGaps(node: ProseNode) {
  const wrap = objectWrap(node.attrs.wrap)
  const side = wrapDistance(wrap)
  const own = (value: unknown, fallback: number) =>
    value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? fallback : Number(value)
  return {
    top: own(node.attrs.distT, 0),
    bottom: own(node.attrs.distB, 0),
    left: own(node.attrs.distL, side),
    right: own(node.attrs.distR, side),
  }
}

const OBJECT_NODES = new Set(["image", "textBox", "figure", "threeDModel", "drawingCanvas", "smartArt"])
export type ObjectAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
export type LayerMove = "forward" | "front" | "backward" | "back"

export const OBJECT_ANCHORS: { id: ObjectAnchor; label: string; x: number; y: number }[] = [
  { id: "top-left", label: "Top left", x: 0, y: 0 },
  { id: "top-center", label: "Top center", x: 0.5, y: 0 },
  { id: "top-right", label: "Top right", x: 1, y: 0 },
  { id: "middle-left", label: "Middle left", x: 0, y: 0.5 },
  { id: "middle-center", label: "Middle center", x: 0.5, y: 0.5 },
  { id: "middle-right", label: "Middle right", x: 1, y: 0.5 },
  { id: "bottom-left", label: "Bottom left", x: 0, y: 1 },
  { id: "bottom-center", label: "Bottom center", x: 0.5, y: 1 },
  { id: "bottom-right", label: "Bottom right", x: 1, y: 1 },
]

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textBox: {
      insertTextBox: (options?: {
        text?: string
        fill?: string
        borderColor?: string
        width?: number
        border?: string
      }) => ReturnType
    }
    objectFrame: {
      setObjectWrap: (wrap: ObjectWrap) => ReturnType
      setObjectAnchoring: (anchoring: ObjectAnchoring) => ReturnType
      setObjectAnchor: (anchor: ObjectAnchor) => ReturnType
      setObjectLayer: (move: LayerMove) => ReturnType
      setObjectRotate: (degrees: number) => ReturnType
      updateObject: (attrs: Record<string, unknown>) => ReturnType
      alignObject: (side: ObjectSide, to?: "margin" | "page") => ReturnType
    }
  }
}

export function objectWrap(value: unknown): ObjectWrap {
  return WRAP_CHOICES.some((choice) => choice.id === value) ? (value as ObjectWrap) : "inline"
}

export function objectAnchoring(value: unknown): ObjectAnchoring {
  return value === "move" ? "move" : "fixed"
}

export function isObjectNode(node: ProseNode) {
  return OBJECT_NODES.has(node.type.name)
}

export function isFloating(node: ProseNode) {
  if (node.type.name === "textBox") {
    return true
  }
  return isObjectNode(node) && objectWrap(node.attrs.wrap) !== "inline"
}

/** The attributes every object that can float shares: its wrap, place, layer and how it is anchored. */
export function floatingAttributes(defaultWrap: ObjectWrap = "inline") {
  return {
    wrap: {
      default: defaultWrap,
      parseHTML: (element: HTMLElement) =>
        element.hasAttribute("data-wrap") ? objectWrap(element.getAttribute("data-wrap")) : defaultWrap,
      renderHTML: (attributes: Record<string, unknown>) => ({ "data-wrap": objectWrap(attributes.wrap) }),
    },
    x: numberAttr("x", "data-x", 0),
    y: numberAttr("y", "data-y", 0),
    z: numberAttr("z", "data-z", 1),
    page: numberAttr("page", "data-page", 1),
    // Documents from before Move with Text kept page positions, so "fixed" is the default.
    anchoring: {
      default: "fixed",
      parseHTML: (element: HTMLElement) => objectAnchoring(element.getAttribute("data-anchoring")),
      renderHTML: (attributes: Record<string, unknown>) => ({
        "data-anchoring": objectAnchoring(attributes.anchoring),
      }),
    },
    // Move with Text: the object's top below its anchor, the paragraph that follows it.
    dy: numberAttr("dy", "data-dy", 0),
    // Pictures from Word may instead sit `dy` below the top margin of the page their paragraph is on.
    relative: {
      default: "paragraph",
      parseHTML: (element: HTMLElement) =>
        element.getAttribute("data-relative") === "margin" ? "margin" : "paragraph",
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes.relative === "margin" ? { "data-relative": "margin" } : {},
    },
    // Layout > Text Wrapping: the sides text flows on and the distances from it (null: the wrap's own).
    wrapSide: textAttr("wrapSide", "data-wrap-side", "both"),
    distT: optionalNumberAttr("distT", "data-dist-t"),
    distB: optionalNumberAttr("distB", "data-dist-b"),
    distL: optionalNumberAttr("distL", "data-dist-l"),
    distR: optionalNumberAttr("distR", "data-dist-r"),
    // Layout > Position: an alignment ("left", "center", "right"; "top", "center", "bottom") the place was set by,
    // what the horizontal place is measured from, and Word's Allow overlap and Lock anchor.
    alignH: textAttr("alignH", "data-align-h", ""),
    alignV: textAttr("alignV", "data-align-v", ""),
    fromH: textAttr("fromH", "data-from-h", "margin"),
    allowOverlap: {
      default: true,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-allow-overlap") !== "0",
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes.allowOverlap === false ? { "data-allow-overlap": "0" } : {},
    },
    lockAnchor: {
      default: false,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-lock-anchor") === "1",
      renderHTML: (attributes: Record<string, unknown>) => (attributes.lockAnchor ? { "data-lock-anchor": "1" } : {}),
    },
    // Tight and Through: the outline text wraps around as "x,y x,y …" in Word's 21600 box over the object (empty:
    // found from the object's drawing), and whether Edit Wrap Points set it.
    wrapPoints: textAttr("wrapPoints", "data-wrap-points", ""),
    wrapEdited: {
      default: false,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-wrap-edited") === "1",
      renderHTML: (attributes: Record<string, unknown>) => (attributes.wrapEdited ? { "data-wrap-edited": "1" } : {}),
    },
  }
}

function textAttr(key: string, name: string, fallback: string) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => element.getAttribute(name) ?? fallback,
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = typeof attributes[key] === "string" ? (attributes[key] as string) : fallback
      return value === fallback ? {} : { [name]: value }
    },
  }
}

function optionalNumberAttr(key: string, name: string) {
  return {
    default: null as number | null,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(name)
      const value = raw === null || raw === "" ? Number.NaN : Number(raw)
      return Number.isFinite(value) ? value : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes[key]
      return value === null || value === undefined || !Number.isFinite(Number(value)) ? {} : { [name]: String(value) }
    },
  }
}

export function patchObject(editor: Editor, pos: number, attrs: Record<string, unknown>) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || !isObjectNode(node)) {
    return
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }))
}

export function selectedObject(editor: Editor | null) {
  if (!editor) {
    return null
  }
  const found = findObject(editor.state)
  if (!found) {
    return null
  }
  return {
    pos: found.pos,
    name: found.node.type.name as "image" | "textBox" | "figure" | "threeDModel" | "drawingCanvas" | "smartArt",
    attrs: found.node.attrs,
  }
}

function parseImageDimension(element: HTMLElement, name: "width" | "height") {
  const attr = element.getAttribute(name)
  if (attr) {
    const value = Number.parseFloat(attr)
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null
  }
  const styleValue = name === "width" ? element.style.width : element.style.height
  if (styleValue) {
    const value = Number.parseFloat(styleValue)
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null
  }
  return null
}

export const PositionedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => parseImageDimension(element, "width"),
        renderHTML: (attributes) => (attributes.width ? { width: String(attributes.width) } : {}),
      },
      height: {
        default: null,
        parseHTML: (element) => parseImageDimension(element, "height"),
        renderHTML: (attributes) => (attributes.height ? { height: String(attributes.height) } : {}),
      },
      ...floatingAttributes("inline"),
      rotate: numberAttr("rotate", "data-rotate", 0),
      border: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-border") || "",
        renderHTML: (attributes) => (attributes.border ? { "data-border": String(attributes.border) } : {}),
      },
      effect: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-effect") || "",
        renderHTML: (attributes) => (attributes.effect ? { "data-effect": String(attributes.effect) } : {}),
      },
      ...pictureCropAttributes(),
      ...pictureFormatAttributes(),
      // The app's own object (a shape, chart, 3D model…) this picture stands for in a .docx, as base64 JSON.
      objectNode: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-inkspire-object") || "",
        renderHTML: (attributes) =>
          attributes.objectNode ? { "data-inkspire-object": String(attributes.objectNode) } : {},
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      imagePasteDropPlugin(this.editor),
      new Plugin({
        props: {
          handleKeyDown: (view, event) =>
            event.key.startsWith("Arrow") && !event.shiftKey && !event.altKey
              ? nudgeObject(view, event.key, event.ctrlKey || event.metaKey)
              : false,
        },
      }),
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div")
      let current = node
      const paint = (next: ProseNode) => {
        current = next
        paintImage(dom, next)
      }
      paint(node)
      // Crop mode belongs to the selected picture: its handles show and the hidden parts are drawn faint.
      const syncCropping = (active: boolean) => {
        const on = active && dom.classList.contains("ProseMirror-selectednode")
        if (on !== dom.classList.contains("is-cropping")) {
          dom.classList.toggle("is-cropping", on)
          paint(current)
        }
      }
      const stopCropMode = useCropMode.subscribe((state) => syncCropping(state.active))
      const stopDrag = bindDrag(dom, editor.view, getPos, { body: true })
      const stopResize = bindResize(dom, editor.view, getPos)
      const stopCrop = bindPictureCrop(dom, editor.view, getPos, (node, box, edge, from) =>
        resizeAttrs(node, box, edge, from),
      )
      const stopRotate = bindRotate(dom, editor.view, getPos)
      const onSelect = (event: PointerEvent) => {
        if (event.button !== 0) {
          return
        }
        const target = event.target instanceof Element ? event.target : null
        if (target?.closest("[data-resize], [data-object-handle], [data-rotate], [data-crop-edge]")) {
          return
        }
        const pos = getPos()
        if (pos == null) {
          return
        }
        event.preventDefault()
        editor.view.dispatch(editor.view.state.tr.setSelection(NodeSelection.create(editor.view.state.doc, pos)))
      }
      dom.addEventListener("pointerdown", onSelect)
      return {
        dom,
        ignoreMutation: () => true,
        update(next) {
          if (next.type.name !== "image") {
            return false
          }
          paint(next)
          return true
        },
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
          syncCropping(useCropMode.getState().active)
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
          if (dom.classList.contains("is-cropping")) {
            useCropMode.getState().set(false)
          }
          syncCropping(false)
        },
        destroy() {
          stopCropMode()
          stopDrag()
          stopResize()
          stopCrop()
          stopRotate()
          dom.removeEventListener("pointerdown", onSelect)
        },
      }
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setObjectWrap: (wrap) => setWrapCommand(wrap),
      setObjectAnchoring: (anchoring) => setAnchoringCommand(anchoring),
      setObjectAnchor: (anchor) => updateCommand((node, pos, editor) => anchorAttrs(editor, pos, node, anchor)),
      setObjectLayer: (move) => updateCommand((node, _pos, editor) => ({ z: nextZ(editor.state.doc, node, move) })),
      setObjectRotate: (degrees: number) =>
        updateCommand((node) => ({ rotate: (Number(node.attrs.rotate) || 0) + degrees })),
      updateObject: (attrs) => updateCommand(() => attrs),
      alignObject: (side, to = "margin") =>
        updateCommand((node, pos, editor) => alignAttrs(editor, pos, node, side, to)),
    }
  },
})

/** A text box's fill, outline, effects and text formatting (20.9). */
export function paintTextBoxBody(body: HTMLElement, node: ProseNode) {
  const attrs = node.attrs
  const fill = String(attrs.fill || "#ffffff")
  const image = String(attrs.fillImage || "")
  const texture = String(attrs.texture || "")
  const gradient = String(attrs.fillGradient || "")
  body.style.background = image
    ? `center / cover no-repeat url("${image.replace(/"/g, "%22")}")`
    : texture
      ? cssTexture(texture)
      : gradient
        ? cssGradient(fill, gradient)
        : fill === "none"
          ? "transparent"
          : fill
  const stroke = String(attrs.stroke || "")
  const weight = Number(attrs.strokeWidth) || 0
  const none = stroke === "none" || (!stroke && attrs.border === "none")
  body.style.borderColor = none ? "transparent" : stroke || String(attrs.borderColor || "#d4d4d4")
  body.style.borderWidth = weight && !none ? `${(weight * 4) / 3}px` : ""
  body.style.borderStyle = attrs.strokeDash && !none ? cssDash(String(attrs.strokeDash)) : ""
  const effects = effectStyle(attrs)
  const text = textStyle(attrs)
  Object.assign(body.style, textLayoutStyle(attrs), {
    filter: effects.filter,
    transform: [effects.transform, text.transform].filter(Boolean).join(" "),
    webkitBoxReflect: effects.webkitBoxReflect || text.webkitBoxReflect,
    color: text.color,
    webkitTextStroke: text.webkitTextStroke,
    textShadow: text.textShadow,
    // Align Left, Center, Right and Justify apply to the box's text as a whole.
    textAlign: typeof attrs.textAlign === "string" ? attrs.textAlign : "",
  })
}

export const TextBox = Node.create({
  name: "textBox",
  group: "block",
  content: "inline*",
  defining: true,
  isolating: true,
  selectable: true,

  addAttributes() {
    return {
      ...floatingAttributes("front"),
      // A text box always floats.
      wrap: {
        default: "front",
        parseHTML: (element: HTMLElement) => {
          const wrap = objectWrap(element.getAttribute("data-wrap") || "front")
          return wrap === "inline" ? "front" : wrap
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-wrap": attributes.wrap === "inline" ? "front" : objectWrap(attributes.wrap),
        }),
      },
      x: numberAttr("x", "data-x", 36),
      y: numberAttr("y", "data-y", 36),
      rotate: numberAttr("rotate", "data-rotate", 0),
      width: numberAttr("width", "data-width", 200),
      // 0: as high as its text. Set by resizing; the text can still make it taller.
      height: numberAttr("height", "data-height", 0),
      fill: {
        default: "#ffffff",
        parseHTML: (element) => element.getAttribute("data-fill") || "#ffffff",
        renderHTML: (attributes) => ({ "data-fill": String(attributes.fill || "#ffffff") }),
      },
      border: {
        default: "single",
        parseHTML: (element) =>
          element.getAttribute("data-border") === "none" || element.getAttribute("data-border") === "double"
            ? element.getAttribute("data-border")
            : "single",
        renderHTML: (attributes) => ({
          "data-border": attributes.border === "none" || attributes.border === "double" ? attributes.border : "single",
        }),
      },
      borderColor: {
        default: "#d4d4d4",
        parseHTML: (element) => element.getAttribute("data-border-color") || "#d4d4d4",
        renderHTML: (attributes) => ({ "data-border-color": String(attributes.borderColor || "#d4d4d4") }),
      },
      // The Shape Outline colour ("none": no line); empty keeps the border colour above.
      stroke: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-stroke") || "",
        renderHTML: (attributes) => (attributes.stroke ? { "data-stroke": String(attributes.stroke) } : {}),
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-alt") || "",
        renderHTML: (attributes) => (attributes.alt ? { "data-alt": String(attributes.alt) } : {}),
      },
      // Linked text boxes (Create Link): the chain the box is in and its place in it (see `text-box-link.ts`).
      linkId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-link-id") || "",
        renderHTML: (attributes) => (attributes.linkId ? { "data-link-id": String(attributes.linkId) } : {}),
      },
      linkSeq: numberAttr("linkSeq", "data-link-seq", 0),
      // A box opened from Word: its look and text as Word wrote them, so saving it unchanged keeps Word's drawing.
      wordBox: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-word-box") || "",
        renderHTML: (attributes) => (attributes.wordBox ? { "data-word-box": String(attributes.wordBox) } : {}),
      },
      ...shapeStyleAttributes(),
      ...textBoxStyleAttributes(),
    }
  },

  parseHTML() {
    return [{ tag: "div[data-text-box]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-text-box": "", class: "text-box" }), 0]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div")
      const body = document.createElement("div")
      body.className = "text-box-body"
      const handle = document.createElement("div")
      handle.className = "object-handle"
      handle.dataset.objectHandle = ""
      handle.contentEditable = "false"
      handle.title = "Drag text box"
      dom.append(handle, body)
      const paint = (next: ProseNode) => {
        dom.className = frameClass(dom, next, "text-box")
        dom.dataset.border = String(next.attrs.border || "single")
        applyFrame(dom, next)
        dom.style.width = `${Math.max(80, Number(next.attrs.width) || 200)}px`
        const height = Number(next.attrs.height) || 0
        body.style.minHeight = height ? `${height}px` : ""
        // A linked box keeps its size: what does not fit flows on, and the last box clips the rest.
        const linked = Boolean(next.attrs.linkId)
        body.style.height = linked && height ? `${height}px` : ""
        body.style.overflow = linked ? "clip" : ""
        dom.toggleAttribute("data-linked", linked)
        paintTextBoxBody(body, next)
      }
      paint(node)
      ensureRotateHandle(dom)
      ensureResizeHandles(dom)
      let current = node
      let alignFrame = 0
      // Middle and bottom alignment follow the text as it is typed.
      const align = () => {
        cancelAnimationFrame(alignFrame)
        alignFrame = requestAnimationFrame(() => alignTextBox(body, current.attrs, useViewStore.getState().zoom))
      }
      align()
      const stopDrag = bindDrag(dom, editor.view, getPos)
      const stopRotate = bindRotate(dom, editor.view, getPos)
      const stopResize = bindObjectResize(dom, editor.view, getPos, {
        types: ["textBox"],
        start: (current) => ({
          width: Number(current.attrs.width) || dom.offsetWidth,
          height: Number(current.attrs.height) || body.offsetHeight,
        }),
        attrs: resizeAttrs,
      })
      return {
        dom,
        contentDOM: body,
        ignoreMutation(mutation) {
          // The body's own style (fill, alignment padding) is drawn here, not typed.
          if (mutation.type === "attributes" && mutation.target === body) {
            return true
          }
          return mutation.type !== "selection" && !body.contains(mutation.target)
        },
        update(next) {
          if (next.type.name !== "textBox") {
            return false
          }
          current = next
          paint(next)
          ensureRotateHandle(dom)
          ensureResizeHandles(dom)
          align()
          return true
        },
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
        },
        destroy() {
          cancelAnimationFrame(alignFrame)
          stopDrag()
          stopRotate()
          stopResize()
        },
      }
    }
  },

  addCommands() {
    return {
      insertTextBox:
        (options) =>
        ({ editor, state, tr }) => {
          const page = pageForPosition(state.selection.from, editor.storage.pagination?.breaks ?? [])
          const z = highestZ(state.doc) + 1
          const type = state.schema.nodes[this.name]
          if (!type) {
            return false
          }
          const box = type.create(
            {
              x: 36,
              y: 48,
              page,
              z,
              wrap: "front",
              width: options?.width ?? 200,
              fill: options?.fill ?? "#ffffff",
              borderColor: options?.borderColor ?? "#d4d4d4",
              border: options?.border ?? "single",
            },
            state.schema.text((options?.text || "Text box").slice(0, 120)),
          )
          const insertAt = state.selection.$from.depth === 0 ? state.selection.to : state.selection.$from.after(1)
          tr.insert(insertAt, box)
          tr.setSelection(NodeSelection.create(tr.doc, insertAt))
          return true
        },
    }
  },
})

function numberAttr(key: string, name: string, fallback: number) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => {
      const value = Number(element.getAttribute(name))
      return Number.isFinite(value) ? value : fallback
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = Number(attributes[key])
      return { [name]: String(Number.isFinite(value) ? value : fallback) }
    },
  }
}

export function findObject(state: EditorState) {
  const { selection } = state
  if (selection instanceof NodeSelection && isObjectNode(selection.node)) {
    return { pos: selection.from, node: selection.node }
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === "textBox") {
      return { pos: $from.before(depth), node }
    }
  }
  return null
}

function updateCommand(change: (node: ProseNode, pos: number, editor: Editor) => Record<string, unknown>) {
  return ({ editor, state, tr }: { editor: Editor; state: EditorState; tr: Transaction }) => {
    const found = findObject(state)
    if (!found) {
      return false
    }
    tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...change(found.node, found.pos, editor) })
    if (tr.doc.nodeAt(found.pos)) {
      tr.setSelection(NodeSelection.create(tr.doc, found.pos))
    }
    return true
  }
}

/**
 * Changing the wrap keeps the object where it shows. An object leaving the line takes the place it had there and
 * moves with its text, as in Word; a text box never goes in line.
 */
function setWrapCommand(wrap: ObjectWrap) {
  return ({ editor, state, tr }: { editor: Editor; state: EditorState; tr: Transaction }) => {
    const found = findObject(state)
    if (!found) {
      return false
    }
    const { node, pos } = found
    if (node.type.name === "textBox" && wrap === "inline") {
      return false
    }
    const attrs: Record<string, unknown> = { ...node.attrs, wrap }
    if (!isFloating(node) && wrap !== "inline") {
      // An object sized by the page (a full-width SmartArt, say) keeps the size it shows once it floats.
      const dom = editor.view.nodeDOM(pos)
      if (dom instanceof HTMLElement) {
        if ("width" in node.attrs && !Number(node.attrs.width)) {
          attrs.width = dom.offsetWidth
        }
        if ("height" in node.attrs && !Number(node.attrs.height)) {
          attrs.height = dom.offsetHeight
        }
      }
      const placed = placementOf(editor.view, pos)
      if (placed) {
        Object.assign(attrs, {
          page: placed.page,
          x: placed.x,
          y: placed.y,
          anchoring: "move",
          dy: 0,
          relative: "paragraph",
        })
      }
      attrs.z = highestZ(state.doc) + 1
    }
    tr.setNodeMarkup(pos, undefined, attrs)
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    return true
  }
}

/** Move with Text keeps the object's offset below the paragraph under it; Fix Position keeps its page place. */
function setAnchoringCommand(anchoring: ObjectAnchoring) {
  return ({ editor, state, tr }: { editor: Editor; state: EditorState; tr: Transaction }) => {
    const found = findObject(state)
    if (!found || !isFloating(found.node)) {
      return false
    }
    const shown = shownPlace(editor.view, found.pos, found.node)
    const attrs = { ...found.node.attrs, anchoring, page: shown.page, x: shown.x, y: shown.y }
    tr.setNodeMarkup(found.pos, undefined, attrs)
    if (anchoring === "move") {
      reanchor(editor.view, tr, found.pos, shown.page, shown.y)
    } else {
      const at = tr.mapping.map(found.pos)
      if (tr.doc.nodeAt(at)) {
        tr.setSelection(NodeSelection.create(tr.doc, at))
      }
    }
    return true
  }
}

/** Where a floating object shows: the paginator's place for one that moves with text, else its own. */
export function shownPlace(view: EditorView, pos: number, node: ProseNode) {
  const dom = view.nodeDOM(pos)
  const data = dom instanceof HTMLElement ? dom.dataset : undefined
  const read = (value: string | undefined, fallback: number) => {
    const number = Number(value)
    return value !== undefined && Number.isFinite(number) ? number : fallback
  }
  return {
    page: read(data?.page, Number(node.attrs.page) || 1),
    x: read(data?.x, Number(node.attrs.x) || 0),
    y: read(data?.y, Number(node.attrs.y) || 0),
  }
}

/** The scale the pages are drawn at, from an element's drawn and laid out widths. */
function scaleOf(element: HTMLElement) {
  const width = element.offsetWidth
  return width > 0 ? element.getBoundingClientRect().width / width : 1
}

/** A point on screen in the coordinates floating objects are placed in (the editor's, unscaled). */
export function editorPoint(view: EditorView, clientX: number, clientY: number) {
  const root = view.dom
  const rect = root.getBoundingClientRect()
  const scale = scaleOf(root)
  return { left: (clientX - rect.left) / scale - root.clientLeft, top: (clientY - rect.top) / scale - root.clientTop }
}

/** The page a point in editor coordinates falls on, and the point within that page's text area. */
export function pagePoint(left: number, top: number) {
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const pageCount = Math.max(1, document.querySelectorAll(".page-sheet").length)
  let best = { page: 1, x: left, y: top, distance: Number.POSITIVE_INFINITY }
  for (let page = 1; page <= pageCount + 1; page += 1) {
    const cell = objectCell(page, metrics)
    const inside = top >= cell.top && top < cell.top + metrics.height + PAGE_GAP
    const distance = inside ? Math.abs(left - cell.left - metrics.width / 2) : Number.POSITIVE_INFINITY
    if (distance < best.distance) {
      best = { page, x: left - cell.left, y: top - cell.top, distance }
    }
  }
  return { page: best.page, x: best.x, y: best.y }
}

/** Where an object in the text shows, as a floating object's page, x and y. */
function placementOf(view: EditorView, pos: number) {
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) {
    return null
  }
  // The picture or drawing itself, never a handle's icon; a framed object (20.7) is measured by its frame.
  const media = dom.classList.contains("object-box")
    ? dom
    : (dom.querySelector<HTMLElement>(":scope > img, :scope > svg, :scope > canvas, img, canvas") ?? dom)
  const rect = media.getBoundingClientRect()
  const point = editorPoint(view, rect.left, rect.top)
  const placed = pagePoint(point.left, point.top)
  return { page: placed.page, x: Math.max(0, Math.round(placed.x)), y: Math.max(0, Math.round(placed.y)) }
}

/**
 * Anchors an object that moves with text to the paragraph it now sits on, as Word does when one is dragged: the
 * object's node goes just before the last block starting above its top on that page, and `dy` is how far below
 * that block's top it sits.
 */
export function reanchor(view: EditorView, tr: Transaction, pos: number, page: number, y: number) {
  const node = tr.doc.nodeAt(pos)
  if (!node) {
    return
  }
  let target: { pos: number; top: number } | null = null
  let first: { pos: number; top: number } | null = null
  view.state.doc.forEach((child, offset) => {
    if (isFloating(child)) {
      return
    }
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement)) {
      return
    }
    const rect = dom.getBoundingClientRect()
    const point = editorPoint(view, rect.left + 1, rect.top)
    const placed = pagePoint(point.left, point.top)
    if (placed.page !== page) {
      return
    }
    first ??= { pos: offset, top: placed.y }
    if (placed.y <= y + 1) {
      target = { pos: offset, top: placed.y }
    }
  })
  const anchor = (target ?? first) as { pos: number; top: number } | null
  if (!anchor) {
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    return
  }
  const dy = Math.round(Math.max(0, y - anchor.top))
  const attrs = { ...node.attrs, anchoring: "move", dy, relative: "paragraph" }
  // The block positions were read from the document before this transaction's own steps.
  const insertAt = tr.mapping.map(anchor.pos)
  if (insertAt === pos || insertAt === pos + node.nodeSize) {
    tr.setNodeMarkup(pos, undefined, attrs)
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    return
  }
  const before = tr.steps.length
  tr.delete(pos, pos + node.nodeSize)
  const at = tr.mapping.slice(before).map(insertAt, -1)
  tr.insert(at, node.type.create(attrs, node.content, node.marks))
  tr.setSelection(NodeSelection.create(tr.doc, at))
}

/** The object's size on the page, in pixels. */
function objectSize(editor: Editor, pos: number, node: ProseNode) {
  const dom = editor.view.nodeDOM(pos)
  return {
    width: dom instanceof HTMLElement ? dom.offsetWidth : Number(node.attrs.width) || 160,
    height: dom instanceof HTMLElement ? dom.offsetHeight : Number(node.attrs.height) || 80,
  }
}

/** Where a `width` × `height` object sits on the margins for one of the nine places. */
export function anchorPlace(anchor: ObjectAnchor, width: number, height: number) {
  const preset = OBJECT_ANCHORS.find((item) => item.id === anchor) ?? OBJECT_ANCHORS[0]
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const contentWidth = metrics.width - metrics.marginLeft - metrics.marginRight
  return {
    x: Math.round(Math.max(0, preset.x * Math.max(0, contentWidth - width))),
    y: Math.round(Math.max(0, preset.y * Math.max(0, metrics.contentHeight - height))),
  }
}

const ALIGN_H = ["left", "center", "right"] as const
const ALIGN_V = ["top", "center", "bottom"] as const

/**
 * Word's Position gallery: the object goes to one of nine places on the margins, fixed on its page. One in line
 * with the text becomes Square-wrapped, as in Word; a floating one keeps its wrap.
 */
function anchorAttrs(editor: Editor, pos: number, node: ProseNode, anchor: ObjectAnchor) {
  const preset = OBJECT_ANCHORS.find((item) => item.id === anchor) ?? OBJECT_ANCHORS[0]
  const size = objectSize(editor, pos, node)
  const floating = isFloating(node)
  const page = floating
    ? shownPlace(editor.view, pos, node).page
    : (placementOf(editor.view, pos)?.page ?? (Number(node.attrs.page) || 1))
  return {
    ...anchorPlace(anchor, size.width, size.height),
    page,
    anchoring: "fixed",
    dy: 0,
    alignH: ALIGN_H[Math.round(preset.x * 2)],
    alignV: ALIGN_V[Math.round(preset.y * 2)],
    fromH: "margin",
    ...(floating ? {} : { wrap: "square", z: highestZ(editor.state.doc) + 1 }),
  }
}

export type ObjectSide = "left" | "center" | "right" | "top" | "middle" | "bottom"

/**
 * Word's Align: one edge (or the middle) of the object to the margins or the page, on one axis, keeping the other.
 * An object in line leaves the line (Square), as Word's Align does.
 */
function alignAttrs(editor: Editor, pos: number, node: ProseNode, side: ObjectSide, to: "margin" | "page") {
  const size = objectSize(editor, pos, node)
  const floating = isFloating(node)
  const shown = floating ? shownPlace(editor.view, pos, node) : null
  const page = shown?.page ?? placementOf(editor.view, pos)?.page ?? (Number(node.attrs.page) || 1)
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const horizontal = side === "left" || side === "center" || side === "right"
  const fraction = side === "left" || side === "top" ? 0 : side === "center" || side === "middle" ? 0.5 : 1
  const attrs: Record<string, unknown> = {
    page,
    anchoring: "fixed",
    dy: 0,
    x: shown?.x ?? (Number(node.attrs.x) || 0),
    y: shown?.y ?? (Number(node.attrs.y) || 0),
    ...(floating ? {} : { wrap: "square", z: highestZ(editor.state.doc) + 1 }),
  }
  if (horizontal) {
    const span = to === "page" ? metrics.width : metrics.width - metrics.marginLeft - metrics.marginRight
    const offset = to === "page" ? -metrics.marginLeft : 0
    attrs.x = Math.round(offset + fraction * Math.max(0, span - size.width))
    attrs.alignH = side === "center" ? "center" : side
    attrs.fromH = to
  } else {
    const span = to === "page" ? metrics.height : metrics.contentHeight
    const offset = to === "page" ? -metrics.marginTop : 0
    attrs.y = Math.round(offset + fraction * Math.max(0, span - size.height))
    attrs.alignV = side === "middle" ? "center" : side
  }
  return attrs
}

/**
 * Word's Align Selected Objects: lines the picked floating objects up with each other, on the page of the first.
 * Returns the new places so a caller can test them without a browser.
 */
export function alignSelectedObjects(editor: Editor, positions: number[], side: ObjectSide) {
  const items = positions
    .map((pos) => ({ pos, node: editor.state.doc.nodeAt(pos) }))
    .filter((item): item is { pos: number; node: ProseNode } => Boolean(item.node && isFloating(item.node)))
    .map((item) => ({
      ...item,
      ...shownPlace(editor.view, item.pos, item.node),
      ...objectSize(editor, item.pos, item.node),
    }))
  if (items.length < 2) {
    return false
  }
  const horizontal = side === "left" || side === "center" || side === "right"
  const start = (item: (typeof items)[number]) => (horizontal ? item.x : item.y)
  const length = (item: (typeof items)[number]) => (horizontal ? item.width : item.height)
  const low = Math.min(...items.map(start))
  const high = Math.max(...items.map((item) => start(item) + length(item)))
  const tr = editor.state.tr
  for (const item of items) {
    const place =
      side === "left" || side === "top"
        ? low
        : side === "right" || side === "bottom"
          ? high - length(item)
          : (low + high - length(item)) / 2
    tr.setNodeMarkup(item.pos, undefined, {
      ...item.node.attrs,
      page: items[0]!.page,
      anchoring: "fixed",
      dy: 0,
      x: item.x,
      y: item.y,
      [horizontal ? "x" : "y"]: Math.round(place),
      [horizontal ? "alignH" : "alignV"]: "",
    })
  }
  editor.view.dispatch(tr)
  return true
}

/**
 * Which Position gallery choice the object is at: "inline", one of the nine places, or null when it was placed
 * some other way (dragged, or typed in Layout).
 */
export function objectPosition(
  node: ProseNode,
  size: { width: number; height: number },
): ObjectAnchor | "inline" | null {
  if (!isFloating(node)) {
    return node.type.name === "textBox" ? null : "inline"
  }
  if (objectAnchoring(node.attrs.anchoring) !== "fixed") {
    return null
  }
  const x = Number(node.attrs.x) || 0
  const y = Number(node.attrs.y) || 0
  const found = OBJECT_ANCHORS.find((item) => {
    const place = anchorPlace(item.id, size.width, size.height)
    return Math.abs(place.x - x) <= 2 && Math.abs(place.y - y) <= 2
  })
  return found?.id ?? null
}

/** The selected object's Position gallery choice (see objectPosition). */
export function selectedPosition(editor: Editor | null) {
  const found = editor ? findObject(editor.state) : null
  if (!editor || !found) {
    return null
  }
  return objectPosition(found.node, objectSize(editor, found.pos, found.node))
}

function nextZ(doc: ProseNode, node: ProseNode, move: LayerMove) {
  const values: number[] = []
  doc.descendants((child) => {
    if (isObjectNode(child)) {
      values.push(Number(child.attrs.z) || 0)
    }
  })
  const current = Number(node.attrs.z) || 0
  if (move === "front") {
    return Math.max(current, ...values) + 1
  }
  if (move === "back") {
    return Math.min(current, ...values) - 1
  }
  if (move === "forward") {
    const above = values.filter((value) => value > current).sort((a, b) => a - b)[0]
    return above == null ? current + 1 : above + 1
  }
  const below = values.filter((value) => value < current).sort((a, b) => b - a)[0]
  return below == null ? current - 1 : below - 1
}

function highestZ(doc: ProseNode) {
  let z = 0
  doc.descendants((node) => {
    if (isObjectNode(node)) {
      z = Math.max(z, Number(node.attrs.z) || 0)
    }
  })
  return z
}

function pageForPosition(pos: number, breaks: number[]) {
  let page = 1
  for (const breakPos of breaks) {
    if (breakPos <= pos) {
      page += 1
    }
  }
  return page
}

function paintImage(dom: HTMLElement, node: ProseNode) {
  const floating = objectWrap(node.attrs.wrap) !== "inline"
  let image = dom.querySelector<HTMLImageElement>("img:not(.image-crop-ghost)")
  if (!image) {
    image = document.createElement("img")
    image.draggable = false
    dom.append(image)
  }
  image.src = String(node.attrs.src || "")
  image.alt = String(node.attrs.alt || "")
  // Hovering a picture shows its alt text, as Word does.
  image.title = image.alt
  const width = Number(node.attrs.width)
  const height = Number(node.attrs.height)
  image.style.width = width > 0 ? `${width}px` : ""
  image.style.height = height > 0 ? `${height}px` : "auto"
  image.style.maxWidth = "none"
  // A cropped picture sits in a shell the size of the part that shows, the whole picture offset inside it.
  const crop = cropOf(node.attrs)
  const cropping = dom.classList.contains("is-cropping")
  const cropped = isCropped(node.attrs) && width > 0 && height > 0
  let shell = dom.querySelector<HTMLElement>(":scope > .image-crop")
  if (cropped || cropping) {
    if (!shell) {
      shell = document.createElement("span")
      shell.className = "image-crop"
      shell.contentEditable = "false"
      dom.insertBefore(shell, image)
      shell.append(image)
    }
  } else if (shell) {
    dom.insertBefore(image, shell)
    shell.remove()
    shell = null
  }
  let ghost = shell?.querySelector<HTMLImageElement>(":scope > .image-crop-ghost") ?? null
  if (shell && width > 0 && height > 0) {
    const whole = wholeSize(width, height, crop)
    Object.assign(shell.style, {
      display: "block",
      position: "relative",
      width: `${width}px`,
      height: `${height}px`,
      overflow: cropping ? "visible" : "hidden",
    })
    const place = (target: HTMLElement) =>
      Object.assign(target.style, {
        position: "absolute",
        left: `${-crop.l * whole.width}px`,
        top: `${-crop.t * whole.height}px`,
        width: `${whole.width}px`,
        height: `${whole.height}px`,
      })
    place(image)
    image.style.clipPath = cropping ? `inset(${crop.t * 100}% ${crop.r * 100}% ${crop.b * 100}% ${crop.l * 100}%)` : ""
    if (cropping) {
      if (!ghost) {
        ghost = document.createElement("img")
        ghost.className = "image-crop-ghost"
        ghost.draggable = false
        ghost.alt = ""
        shell.insertBefore(ghost, image)
      }
      ghost.src = image.src
      place(ghost)
    }
  } else if (!shell) {
    for (const name of ["position", "left", "top", "clipPath"] as const) {
      image.style[name] = ""
    }
  }
  if (!cropping && ghost) {
    ghost.remove()
  }
  // The picture's frame, outline and soft edges belong to the part that shows.
  const shape = shell ?? image
  if (shell) {
    for (const name of ["outline", "outlineOffset", "borderRadius"] as const) {
      image.style[name] = ""
    }
    image.style.setProperty("mask-image", "")
  }
  const border = String(node.attrs.border || "")
  const borderPx = Number(node.attrs.borderWidth) > 0 ? (Number(node.attrs.borderWidth) * 96) / 72 : 2
  const dash = BORDER_DASHES.find((item) => item.id === String(node.attrs.borderDash || ""))?.css ?? "solid"
  const frame = String(node.attrs.frame || "")
  // Along a Crop to Shape outline the border is drawn over the picture; elsewhere it is the box's own outline.
  const traced = Boolean(border) && shapeMask(frame) !== null
  shape.style.outline = border && !traced ? `${borderPx}px ${dash} ${border}` : ""
  shape.style.outlineOffset = border && !traced ? "1px" : ""
  let trace = dom.querySelector<SVGSVGElement>(":scope > .image-shape-outline")
  if (traced) {
    if (!trace) {
      trace = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      trace.classList.add("image-shape-outline")
      trace.setAttribute("aria-hidden", "true")
      trace.setAttribute("preserveAspectRatio", "none")
      dom.insertBefore(trace, shape.nextSibling)
    }
    const outline = shapeOutlineSvg(frame, border, borderPx, String(node.attrs.borderDash || ""))
    trace.setAttribute("viewBox", outline.viewBox)
    trace.innerHTML = outline.body
    trace.style.width = width > 0 ? `${width}px` : "100%"
    trace.style.height = height > 0 ? `${height}px` : "100%"
  } else {
    trace?.remove()
  }
  shape.style.borderRadius = frame === "oval" ? "50%" : frame === "rounded" ? "12%" : ""
  image.style.filter = pictureFilter(node.attrs)
  const transparency = Math.max(0, Math.min(100, Number(node.attrs.transparency) || 0))
  image.style.opacity = transparency ? String(1 - transparency / 100) : ""
  // Soft edges fade the picture's border into the page.
  const soft = Number(node.attrs.softEdge) || 0
  const fade = soft ? `${Math.round(soft * 1.4)}px` : ""
  // Crop to Shape shows the picture through the shape's outline; soft edges fade inside it.
  const layers = [
    shapeMask(frame),
    ...(soft
      ? [
          `linear-gradient(to right, transparent, #000 ${fade}, #000 calc(100% - ${fade}), transparent)`,
          `linear-gradient(to bottom, transparent, #000 ${fade}, #000 calc(100% - ${fade}), transparent)`,
        ]
      : []),
  ].filter((layer): layer is string => Boolean(layer))
  shape.style.setProperty("mask-image", layers.join(", "))
  shape.style.setProperty("mask-size", layers.length ? layers.map(() => "100% 100%").join(", ") : "")
  shape.style.setProperty("mask-repeat", layers.length ? "no-repeat" : "")
  shape.style.setProperty("mask-composite", layers.length > 1 ? "intersect" : "")
  shape.style.setProperty("-webkit-mask-composite", layers.length > 1 ? "source-in" : "")
  const effects = effectStyle(node.attrs)
  dom.style.filter = effects.filter
  dom.style.setProperty("-webkit-box-reflect", effects.webkitBoxReflect)
  const rotate = Number(node.attrs.rotate) || 0
  dom.style.transform = [rotate ? `rotate(${rotate}deg)` : "", effects.transform].filter(Boolean).join(" ")
  ensureResizeHandles(dom)
  ensureCropHandles(dom)
  ensureRotateHandle(dom)
  let handle = dom.querySelector<HTMLElement>("[data-object-handle]")
  if (floating && !handle) {
    handle = document.createElement("div")
    handle.className = "object-handle"
    handle.dataset.objectHandle = ""
    handle.contentEditable = "false"
    handle.title = "Drag picture"
    dom.append(handle)
  }
  if (!floating && handle) {
    handle.remove()
  }
  if (!floating) {
    dom.className = `page-image${liveClasses(dom)}`
    dom.style.position = ""
    dom.style.left = ""
    dom.style.top = ""
    dom.style.zIndex = ""
    // Lock wrapper to display size so pagination never measures the intrinsic PNG (often huge).
    dom.style.width = width > 0 ? `${width}px` : ""
    dom.style.height = height > 0 ? `${height}px` : ""
    dom.style.maxWidth = "100%"
    // Centred or right-aligned as its paragraph is in Word; a block so the margins can place it.
    const align = node.attrs.textAlign
    dom.style.display = align === "center" || align === "right" ? "block" : ""
    dom.style.marginLeft = align === "center" || align === "right" ? "auto" : ""
    dom.style.marginRight = align === "center" ? "auto" : ""
    // A turned picture in line keeps the lines above and below clear of its corners, as in Word.
    const turnedBy = width > 0 && height > 0 ? Math.max(0, -rotatedBounds(width, height, rotate).dy) : 0
    dom.style.marginTop = turnedBy ? `${Math.round(turnedBy)}px` : ""
    dom.style.marginBottom = turnedBy ? `${Math.round(turnedBy)}px` : ""
    if (width > 0) {
      image.setAttribute("width", String(width))
    }
    if (height > 0) {
      image.setAttribute("height", String(height))
    }
    return
  }
  dom.className = frameClass(dom, node, "image-frame")
  // A floating frame takes the picture's size (the in-line wrapper's lock would keep its old size).
  Object.assign(dom.style, {
    width: "",
    height: "",
    maxWidth: "",
    display: "",
    marginLeft: "",
    marginRight: "",
    marginTop: "",
    marginBottom: "",
  })
  applyFrame(dom, node)
}

/** Places a floating object's frame and records the place it shows at (read by dragging and the Layout menus). */
export function applyFrame(dom: HTMLElement, node: ProseNode) {
  Object.assign(dom.style, frameStyle(node, dom))
  const place = flowPlace(dom, node)
  dom.dataset.page = String(Math.max(1, place.page))
  dom.dataset.x = String(Number(node.attrs.x) || 0)
  dom.dataset.y = String(place.y)
  // In a header or footer, measured from the page's top margin rather than the box (see `.chrome-box` in index.css).
  if (objectAnchoring(node.attrs.anchoring) === "move" && node.attrs.relative === "margin") {
    dom.dataset.relative = "margin"
  } else {
    delete dom.dataset.relative
  }
}

/**
 * The paginator found where objects that move with text land (their paragraph's place plus their offset): draw
 * them there. Only the frames move; the document is unchanged.
 */
export function placeFlowObjects(view: EditorView, placements: { pos: number; page: number; y: number }[]) {
  for (const placed of placements) {
    const dom = view.nodeDOM(placed.pos)
    const node = view.state.doc.nodeAt(placed.pos)
    if (!(dom instanceof HTMLElement) || !node) {
      continue
    }
    dom.dataset.flowPage = String(placed.page)
    dom.dataset.flowY = String(placed.y)
    applyFrame(dom, node)
  }
}

/** Classes a repaint keeps: the selection and a drag in progress. */
export function liveClasses(dom: HTMLElement) {
  return ["ProseMirror-selectednode", "is-rotating", "is-resizing", "is-cropping"]
    .filter((name) => dom.classList.contains(name))
    .map((name) => ` ${name}`)
    .join("")
}

export function frameClass(dom: HTMLElement, node: ProseNode, base: string) {
  return `${base} object-frame${node.attrs.wrap === "behind" ? " object-behind" : ""}${liveClasses(dom)}`
}

/**
 * Where a floating object is drawn. One that moves with text is drawn where the paginator last placed it
 * (`data-flow-page` / `data-flow-y`, see placeFlowObjects), which follows its paragraph.
 */
function flowPlace(dom: HTMLElement, node: ProseNode) {
  const page = Number(node.attrs.page) || 1
  const y = Number(node.attrs.y) || 0
  if (objectAnchoring(node.attrs.anchoring) !== "move" || dom.dataset.flowPage === undefined) {
    return { page, y }
  }
  return { page: Number(dom.dataset.flowPage) || page, y: Number(dom.dataset.flowY) || 0 }
}

function frameStyle(node: ProseNode, dom?: HTMLElement) {
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const wrap = objectWrap(node.attrs.wrap)
  const floating = node.type.name === "textBox" || wrap !== "inline"
  if (!floating) {
    return { position: "static", left: "", top: "", zIndex: "" }
  }
  const place = dom ? flowPlace(dom, node) : { page: Number(node.attrs.page) || 1, y: Number(node.attrs.y) || 0 }
  const x = Number(node.attrs.x) || 0
  return {
    position: "absolute",
    left: `${Math.round(objectLeft(place.page, x, metrics))}px`,
    top: `${objectTop(place.page, place.y, metrics)}px`,
    zIndex: wrap === "behind" ? String(-1000 + (Number(node.attrs.z) || 0)) : String(20 + (Number(node.attrs.z) || 0)),
    transform: Number(node.attrs.rotate) ? `rotate(${Number(node.attrs.rotate)}deg)` : "",
    clipPath: pageClip(node, x, place.y, metrics, dom),
  }
}

/**
 * Word draws nothing outside the page: the part of a floating object past the sheet's edges (a cover photo larger
 * than the page) is cut off. `x` and `y` are from the text's top-left corner, the margins in from the sheet's. A
 * polygon, not an inset: its corners are the sheet's, whatever size the frame's own box is (a wide picture overflows
 * a frame the text's width). Not for a turned object (the clip would turn with it) or one in a header or footer box.
 */
export function pageClip(node: ProseNode, x: number, y: number, metrics: PageMetrics, dom?: HTMLElement) {
  const width = Number(node.attrs.width) || 0
  const height = Number(node.attrs.height) || 0
  if (width <= 0 || height <= 0 || Number(node.attrs.rotate) || dom?.closest(".chrome-box")) {
    return ""
  }
  const left = -(x + metrics.marginLeft)
  const top = -(y + metrics.marginTop)
  const right = left + metrics.width
  const bottom = top + metrics.height
  if (left <= 0.5 && top <= 0.5 && width <= right + 0.5 && height <= bottom + 0.5) {
    return ""
  }
  const px = (value: number) => `${Math.round(value)}px`
  return `polygon(${px(left)} ${px(top)}, ${px(right)} ${px(top)}, ${px(right)} ${px(bottom)}, ${px(left)} ${px(bottom)})`
}

export function objectTop(page: number, y: number, metrics: PageMetrics) {
  return objectCell(page, metrics).top + y
}

export function objectLeft(page: number, x: number, metrics: PageMetrics) {
  return objectCell(page, metrics).left + x
}

function objectCell(page: number, metrics: PageMetrics) {
  const pageView = useViewStore.getState().movement === "side" ? 1 : useViewStore.getState().pageView
  return pageGridCell(Math.max(0, page - 1), pageView, metrics.width + PAGE_GAP, metrics.height + PAGE_GAP)
}

type DragPeer = { pos: number; x: number; y: number; page: number; attrs: Record<string, unknown> }

/** Floating objects grouped with the one at `pos`, which move with it. */
function groupPeers(view: EditorView, pos: number, node: ProseNode) {
  const groupId = typeof node.attrs.groupId === "string" ? node.attrs.groupId : ""
  const peers: DragPeer[] = []
  if (!groupId) {
    return peers
  }
  view.state.doc.descendants((child, childPos) => {
    if (childPos === pos || child.attrs.groupId !== groupId || !isFloating(child)) {
      return
    }
    peers.push({
      pos: childPos,
      x: Number(child.attrs.x) || 0,
      y: Number(child.attrs.y) || 0,
      page: Number(child.attrs.page) || 1,
      attrs: child.attrs,
    })
  })
  return peers
}

/**
 * Moving an object with the mouse, as Word does. A floating object follows the pointer over the page and the text
 * makes room for it as it goes; a picture in line with the text moves between paragraphs, shown by a drop line.
 * `body` lets the object be dragged from anywhere on it; a text box, whose body is text, only drags by its handle.
 * Esc puts the object back.
 */
export function bindDrag(
  dom: HTMLElement,
  view: EditorView,
  getPos: () => number | undefined,
  options: {
    /** Drag by the body, or (for an object used inside) only when this says so, e.g. with Alt held. */
    body?: boolean | ((event: PointerEvent) => boolean)
    /** Listen before the object's own content, so an Alt drag moves a 3D model instead of orbiting it. */
    capture?: boolean
  } = {},
) {
  const onDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (event.button !== 0 || !target || target.closest("[data-rotate], [data-resize]")) {
      return
    }
    const body = typeof options.body === "function" ? options.body(event) : Boolean(options.body)
    if (!body && target.closest("canvas, .three-d-orbit")) {
      return
    }
    const handle = target.closest("[data-object-handle]")
    if (!(handle && dom.contains(handle)) && !body) {
      return
    }
    const pos = getPos()
    const node = pos == null ? null : view.state.doc.nodeAt(pos)
    if (pos == null || !node) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    dom.setPointerCapture(event.pointerId)
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
    const zoom = useViewStore.getState().zoom || 1
    const startX = event.clientX
    const startY = event.clientY
    const floating = isFloating(node)
    const original = node.attrs
    const shown = shownPlace(view, pos, node)
    const peers = floating ? groupPeers(view, pos, node) : []
    let dragging = false
    let frame = 0
    let latest: PointerEvent | null = null
    let drop: number | null = null
    const line = floating ? null : document.createElement("div")

    const placeAt = (ev: PointerEvent) =>
      placeIn(
        view,
        shown.page,
        shown.x + (ev.clientX - startX) / zoom,
        shown.y + (ev.clientY - startY) / zoom,
        pageMetrics(useDocumentStore.getState().pageSetup),
      )

    // In a header an object keeps its offset from its paragraph, which is what a .docx stores; elsewhere its place.
    const chrome = inChrome(view)
    const anchored = objectAnchoring(original.anchoring) === "move" && original.relative !== "margin"
    const from = anchored ? shown.y - (Number(original.dy) || 0) : 0
    const shift = (attrs: Record<string, unknown>, placed: { page: number; x: number; y: number }) =>
      chrome
        ? {
            ...attrs,
            anchoring: "move",
            relative: anchored ? "paragraph" : "margin",
            x: placed.x,
            dy: Math.round(placed.y - from),
          }
        : { ...attrs, ...placed }

    /** The floating object (and its group) at a place, as a transaction; Move with Text waits for the drop. */
    const moveTo = (placed: { page: number; x: number; y: number }, attrs: Record<string, unknown>) => {
      const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
      const tr = view.state.tr.setNodeMarkup(pos, undefined, shift(attrs, placed))
      const dx = placed.x - shown.x
      const dy = placed.y - shown.y
      for (const peer of peers) {
        if (tr.doc.nodeAt(peer.pos)) {
          tr.setNodeMarkup(peer.pos, undefined, {
            ...peer.attrs,
            ...placeIn(view, peer.page, peer.x + dx, peer.y + dy, metrics),
          })
        }
      }
      return tr.setSelection(NodeSelection.create(tr.doc, pos))
    }

    const restore = () => {
      if (!floating) {
        return
      }
      const tr = view.state.tr.setNodeMarkup(pos, undefined, original)
      for (const peer of peers) {
        if (tr.doc.nodeAt(peer.pos)) {
          tr.setNodeMarkup(peer.pos, undefined, peer.attrs)
        }
      }
      view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)).setMeta("addToHistory", false))
    }

    const preview = () => {
      frame = 0
      const ev = latest
      if (!ev) {
        return
      }
      if (floating) {
        // Shown as fixed on the page while it moves, so the pages reflow around it without moving its anchor.
        view.dispatch(
          moveTo(placeAt(ev), chrome ? original : { ...original, anchoring: "fixed" }).setMeta("addToHistory", false),
        )
        return
      }
      drop = inlineDrop(view, ev.clientX, ev.clientY)
      dom.style.translate = `${ev.clientX - startX}px ${ev.clientY - startY}px`
      showDropLine(view, line!, drop)
    }

    const finish = () => {
      cancelAnimationFrame(frame)
      dom.removeEventListener("pointermove", move)
      dom.removeEventListener("pointerup", up)
      dom.removeEventListener("pointercancel", cancel)
      window.removeEventListener("keydown", onKey, true)
      delete dom.dataset.dragging
      dom.style.translate = ""
      line?.remove()
    }

    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) {
          return
        }
        dragging = true
        dom.dataset.dragging = ""
      }
      latest = ev
      frame ||= requestAnimationFrame(preview)
    }

    const up = (ev: PointerEvent) => {
      finish()
      if (!dragging) {
        return
      }
      if (!floating) {
        moveInline(view, pos, inlineDrop(view, ev.clientX, ev.clientY))
        return
      }
      restore()
      const placed = placeAt(ev)
      const tr = moveTo(placed, original)
      if (objectAnchoring(original.anchoring) === "move" && !inChrome(view)) {
        // Moving with text: the object takes the paragraph it was dropped on as its anchor.
        reanchor(view, tr, pos, placed.page, placed.y)
      }
      view.dispatch(tr)
    }

    const cancel = () => {
      finish()
      if (dragging) {
        restore()
      }
    }

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault()
        ev.stopPropagation()
        cancel()
      }
    }

    if (line) {
      line.className = "object-drop-line"
    }
    dom.addEventListener("pointermove", move)
    dom.addEventListener("pointerup", up)
    dom.addEventListener("pointercancel", cancel)
    window.addEventListener("keydown", onKey, true)
  }
  const capture = Boolean(options.capture)
  dom.addEventListener("pointerdown", onDown, capture)
  return () => dom.removeEventListener("pointerdown", onDown, capture)
}

/** Where a picture in line with the text lands: before or after the top-level block under the pointer. */
function inlineDrop(view: EditorView, clientX: number, clientY: number) {
  const found = view.posAtCoords({ left: clientX, top: clientY })
  if (!found) {
    return null
  }
  const $pos = view.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos)
  if ($pos.depth === 0) {
    const after = $pos.nodeAfter
    return after ? $pos.pos : null
  }
  const start = $pos.before(1)
  const block = view.state.doc.nodeAt(start)
  const dom = view.nodeDOM(start)
  if (!block || !(dom instanceof HTMLElement)) {
    return start
  }
  const rect = dom.getBoundingClientRect()
  return clientY > rect.top + rect.height / 2 ? start + block.nodeSize : start
}

function showDropLine(view: EditorView, line: HTMLElement, drop: number | null) {
  const block = drop == null ? null : view.state.doc.nodeAt(drop)
  const before = block ? view.nodeDOM(drop!) : null
  const after = drop != null && drop > 0 ? view.state.doc.resolve(drop).nodeBefore : null
  const afterDom = after ? view.nodeDOM(drop! - after.nodeSize) : null
  const rect =
    before instanceof HTMLElement
      ? {
          top: before.getBoundingClientRect().top - 2,
          left: before.getBoundingClientRect().left,
          width: before.getBoundingClientRect().width,
        }
      : afterDom instanceof HTMLElement
        ? {
            top: afterDom.getBoundingClientRect().bottom + 1,
            left: afterDom.getBoundingClientRect().left,
            width: afterDom.getBoundingClientRect().width,
          }
        : null
  if (!rect) {
    line.remove()
    return
  }
  Object.assign(line.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px` })
  if (!line.isConnected) {
    document.body.append(line)
  }
}

function moveInline(view: EditorView, pos: number, drop: number | null) {
  const node = view.state.doc.nodeAt(pos)
  if (!node || drop == null || drop === pos || drop === pos + node.nodeSize) {
    return
  }
  const tr = view.state.tr.delete(pos, pos + node.nodeSize)
  const at = tr.mapping.map(drop, -1)
  tr.insert(at, node)
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView())
}

/** Arrow keys nudge a selected floating object; with Ctrl they move it a pixel at a time. */
export function nudgeObject(view: EditorView, key: string, fine: boolean) {
  const selection = view.state.selection
  if (!(selection instanceof NodeSelection) || !isFloating(selection.node)) {
    return false
  }
  const step = fine ? 1 : 8
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0
  if (!dx && !dy) {
    return false
  }
  const node = selection.node
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const contentWidth = metrics.width - metrics.marginLeft - metrics.marginRight
  const x = Math.round(Math.max(0, Math.min(contentWidth - 24, (Number(node.attrs.x) || 0) + dx)))
  const attrs =
    objectAnchoring(node.attrs.anchoring) === "move" || inChrome(view)
      ? { ...node.attrs, x, dy: (Number(node.attrs.dy) || 0) + dy }
      : {
          ...node.attrs,
          ...placeOnPage(
            Number(node.attrs.page) || 1,
            (Number(node.attrs.x) || 0) + dx,
            (Number(node.attrs.y) || 0) + dy,
            metrics,
          ),
        }
  const tr = view.state.tr.setNodeMarkup(selection.from, undefined, attrs)
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, selection.from)))
  return true
}

/** A header or footer is an editor of its own, with one page-less layer: objects there are placed from its corner. */
function inChrome(view: EditorView) {
  return view.dom.classList.contains("chrome-editor")
}

function placeIn(view: EditorView, page: number, x: number, y: number, metrics: PageMetrics) {
  return inChrome(view)
    ? { page: 1, x: Math.round(Math.max(-CHROME_REACH, x)), y: Math.round(Math.max(-CHROME_REACH, y)) }
    : placeOnPage(page, x, y, metrics)
}

/** How far a picture in the header may sit above or left of the header's own corner. */
const CHROME_REACH = 400

function placeOnPage(page: number, x: number, y: number, metrics: PageMetrics) {
  const contentWidth = metrics.width - metrics.marginLeft - metrics.marginRight
  let nextPage = Math.max(1, page)
  let nextY = y
  while (nextY < 0 && nextPage > 1) {
    nextPage -= 1
    nextY += metrics.contentHeight
  }
  while (nextY > metrics.contentHeight - 24) {
    nextPage += 1
    nextY -= metrics.contentHeight
  }
  return {
    x: Math.round(Math.max(0, Math.min(contentWidth - 24, x))),
    y: Math.round(Math.max(0, nextY)),
    page: nextPage,
  }
}

const RESIZE_EDGES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const

export function ensureResizeHandles(dom: HTMLElement) {
  if (dom.querySelector("[data-resize]")) {
    return
  }
  for (const edge of RESIZE_EDGES) {
    const handle = document.createElement("div")
    handle.className = `image-resize image-resize-${edge}`
    handle.dataset.resize = edge
    handle.contentEditable = "false"
    dom.append(handle)
  }
}

/**
 * The attributes for an object resized to `box`. A floating object dragged by its left or top edge keeps its
 * opposite edge in place, as in Word.
 */
export function resizeAttrs(node: ProseNode, box: Box, edge: ResizeEdge, from: Box): Record<string, unknown> {
  const attrs: Record<string, unknown> = { width: box.width, height: box.height }
  if (!isFloating(node)) {
    return attrs
  }
  if (edge.includes("w")) {
    // It may grow into the left margin, as in Word, but not off the page.
    const margin = pageMetrics(useDocumentStore.getState().pageSetup).marginLeft
    attrs.x = Math.max(-margin, Math.round((Number(node.attrs.x) || 0) + from.width - box.width))
  }
  if (edge.includes("n")) {
    const shift = from.height - box.height
    if (objectAnchoring(node.attrs.anchoring) === "move") {
      attrs.dy = Math.round((Number(node.attrs.dy) || 0) + shift)
    } else {
      attrs.y = Math.max(0, Math.round((Number(node.attrs.y) || 0) + shift))
    }
  }
  return attrs
}

/** An in-line object grows no wider than the page's text. */
export function inlineMaxWidth(node: ProseNode) {
  if (isFloating(node)) {
    return undefined
  }
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  return metrics.width - metrics.marginLeft - metrics.marginRight
}

function bindResize(dom: HTMLElement, view: EditorView, getPos: () => number | undefined) {
  return bindObjectResize(dom, view, getPos, {
    types: ["image"],
    start: (node) => {
      const image = dom.querySelector<HTMLImageElement>("img:not(.image-crop-ghost)")
      const zoom = useViewStore.getState().zoom || 1
      const rect = image?.getBoundingClientRect()
      return {
        width: Number(node.attrs.width) || Math.round((rect?.width ?? 0) / zoom),
        height: Number(node.attrs.height) || Math.round((rect?.height ?? 0) / zoom),
      }
    },
    attrs: resizeAttrs,
    max: inlineMaxWidth,
  })
}
