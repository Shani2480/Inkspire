import { objectBox, objectLayoutAttributes } from "@/editor/object-frame"
import { floatingAttributes } from "@/editor/objects"
import { Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { DEFAULT_MODEL_FORMAT, modelFormat, type ModelFormat } from "@/editor/model-format"
import { modelScene } from "@/editor/model-scenes"

export type ThreeDPreset =
  "cube" | "sphere" | "cylinder" | "cone" | "torus" | "electronics" | "anatomy" | "furniture" | "symbol"

export const THREED_STOCK: { id: ThreeDPreset; label: string; category: string }[] = [
  { id: "cube", label: "Cube", category: "Primitives" },
  { id: "sphere", label: "Sphere", category: "Primitives" },
  { id: "cylinder", label: "Cylinder", category: "Primitives" },
  { id: "cone", label: "Cone", category: "Primitives" },
  { id: "torus", label: "Torus", category: "Primitives" },
  { id: "electronics", label: "Device", category: "Electronics" },
  { id: "anatomy", label: "Figure", category: "Anatomy" },
  { id: "furniture", label: "Chair", category: "Furniture" },
  { id: "symbol", label: "Star", category: "Symbols" },
]

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    threeDModel: {
      insertThreeDModel: (attrs?: Partial<ThreeDAttrs>) => ReturnType
    }
  }
}

type ThreeDAttrs = {
  preset: ThreeDPreset
  src: string
  snapshot: string
  width: number
  height: number
  yaw: number
  pitch: number
  roll: number
  alt: string
}

/** The node attributes of a model's format, each kept as a data- attribute. */
function formatAttributes() {
  const attribute = (name: keyof ModelFormat) => ({
    default: DEFAULT_MODEL_FORMAT[name],
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute(`data-${name.toLowerCase()}`)
      if (value == null) {
        return DEFAULT_MODEL_FORMAT[name]
      }
      return typeof DEFAULT_MODEL_FORMAT[name] === "number" ? Number(value) : value
    },
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs[name] === DEFAULT_MODEL_FORMAT[name] ? {} : { [`data-${name.toLowerCase()}`]: String(attrs[name]) },
  })
  return Object.fromEntries(
    (Object.keys(DEFAULT_MODEL_FORMAT) as (keyof ModelFormat)[]).map((name) => [name, attribute(name)]),
  )
}

/** Whether two nodes' formats differ. */
function formatChanged(left: ProseNode, right: ProseNode) {
  return (Object.keys(DEFAULT_MODEL_FORMAT) as (keyof ModelFormat)[]).some(
    (name) => left.attrs[name] !== right.attrs[name],
  )
}

type Viewer = ReturnType<typeof import("@/editor/three-d-viewer").mountViewer>

/** The viewer, loaded on first use: three.js is large, and a document with no 3-D model never needs it. */
function lazyViewer(
  body: HTMLElement,
  node: ProseNode,
  onSnapshot: (dataUrl: string, yaw: number, pitch: number) => void,
): Viewer {
  let real: Viewer | null = null
  let disposed = false
  let queued: ((viewer: Viewer) => void)[] = []
  void import("@/editor/three-d-viewer")
    .then((module) => {
      if (disposed) {
        return
      }
      real = module.mountViewer(body, node, onSnapshot)
      queued.forEach((call) => call(real!))
      queued = []
    })
    .catch((error: unknown) => {
      // No WebGL (a webview without it): the model's last picture stands in for the view.
      console.error("The 3D viewer could not start", error)
      const snapshot = String(node.attrs.snapshot || "")
      if (snapshot && !disposed) {
        body.style.background = `center / contain no-repeat url("${snapshot.replace(/"/g, "%22")}")`
      }
    })
  const run = (call: (viewer: Viewer) => void) => (real ? call(real) : queued.push(call))
  return {
    dispose: () => {
      disposed = true
      real?.dispose()
    },
    play: (scene) => run((viewer) => viewer.play(scene)),
    setPose: (yaw, pitch) => run((viewer) => viewer.setPose(yaw, pitch)),
    setFormat: (format) => run((viewer) => viewer.setFormat(format)),
    resize: (width, height) => run((viewer) => viewer.resize(width, height)),
  }
}

export const ThreeDModel = Node.create({
  name: "threeDModel",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      preset: {
        default: "cube",
        parseHTML: (el) => el.getAttribute("data-preset") || "cube",
        renderHTML: (attrs) => ({ "data-preset": attrs.preset }),
      },
      src: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-src") || "",
        renderHTML: (attrs) => (attrs.src ? { "data-src": attrs.src } : {}),
      },
      snapshot: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-snapshot") || "",
        renderHTML: (attrs) => (attrs.snapshot ? { "data-snapshot": attrs.snapshot } : {}),
      },
      width: {
        default: 220,
        parseHTML: (el) => Number(el.getAttribute("data-width") || 220),
        renderHTML: (attrs) => ({ "data-width": attrs.width }),
      },
      height: {
        default: 160,
        parseHTML: (el) => Number(el.getAttribute("data-height") || 160),
        renderHTML: (attrs) => ({ "data-height": attrs.height }),
      },
      yaw: {
        default: 0.4,
        parseHTML: (el) => Number(el.getAttribute("data-yaw") || 0.4),
        renderHTML: (attrs) => ({ "data-yaw": attrs.yaw }),
      },
      pitch: {
        default: 0.25,
        parseHTML: (el) => Number(el.getAttribute("data-pitch") || 0.25),
        renderHTML: (attrs) => ({ "data-pitch": attrs.pitch }),
      },
      /** The Play 3D scene, "" when paused. */
      scene: {
        default: "",
        parseHTML: (el) => modelScene(el.getAttribute("data-scene")),
        renderHTML: (attrs) => (attrs.scene ? { "data-scene": attrs.scene } : {}),
      },
      roll: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute("data-roll") || 0),
        renderHTML: (attrs) => ({ "data-roll": attrs.roll }),
      },
      alt: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-alt") || "",
        renderHTML: (attrs) => (attrs.alt ? { "data-alt": attrs.alt } : {}),
      },
      /** The yaw and pitch a model opened from Word was shown at, to keep Word's drawing while it is not turned. */
      wordModel: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-word-model") || "",
        renderHTML: (attrs) => (attrs.wordModel ? { "data-word-model": attrs.wordModel } : {}),
      },
      ...formatAttributes(),
      rotate: objectLayoutAttributes().rotate,
      ...floatingAttributes("inline"),
    }
  },
  parseHTML() {
    return [{ tag: "div[data-three-d-model]" }]
  },
  renderHTML({ HTMLAttributes }) {
    const snapshot = HTMLAttributes["data-snapshot"]
    if (snapshot) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, { "data-three-d-model": "", class: "three-d-model is-print" }),
        [
          "img",
          {
            src: snapshot,
            alt: HTMLAttributes["data-alt"] || "",
            width: HTMLAttributes["data-width"],
            height: HTMLAttributes["data-height"],
          },
        ],
      ]
    }
    return ["div", mergeAttributes(HTMLAttributes, { "data-three-d-model": "", class: "three-d-model" })]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const position = () => {
        const pos = typeof getPos === "function" ? getPos() : null
        return typeof pos === "number" ? pos : undefined
      }
      // The model orbits under the pointer; it moves by its edges or with Alt, like other objects in use.
      const box = objectBox("three-d", editor.view, position, { types: ["threeDModel"], inside: () => true })
      const { dom, body } = box
      dom.setAttribute("data-three-d-model", "")
      box.paint(node)
      const writeAttrs = (snapshot: string, yaw: number, pitch: number) => {
        const pos = position()
        if (pos === undefined) {
          return
        }
        editor
          .chain()
          .command(({ tr, state }) => {
            const current = state.doc.nodeAt(pos)
            if (!current || current.type.name !== "threeDModel") {
              return false
            }
            tr.setNodeMarkup(pos, undefined, { ...current.attrs, snapshot, yaw, pitch })
            if (current.attrs.yaw === yaw && current.attrs.pitch === pitch) {
              // Only the snapshot, which follows from the other attributes; undo goes back past it to the change.
              tr.setMeta("addToHistory", false)
            }
            return true
          })
          .run()
      }
      let viewer = lazyViewer(body, node, writeAttrs)
      return {
        dom,
        update(updated) {
          if (updated.type.name !== "threeDModel") {
            return false
          }
          box.paint(updated)
          if (updated.attrs.preset !== node.attrs.preset || updated.attrs.src !== node.attrs.src) {
            viewer.dispose()
            node = updated
            viewer = lazyViewer(body, updated, writeAttrs)
            return true
          }
          if (updated.attrs.width !== node.attrs.width || updated.attrs.height !== node.attrs.height) {
            viewer.resize(Number(updated.attrs.width) || 220, Number(updated.attrs.height) || 160)
          }
          if (updated.attrs.scene !== node.attrs.scene) {
            viewer.play(modelScene(updated.attrs.scene))
          }
          if (formatChanged(updated, node)) {
            viewer.setFormat(modelFormat(updated.attrs))
          }
          if (updated.attrs.yaw !== node.attrs.yaw || updated.attrs.pitch !== node.attrs.pitch) {
            viewer.setPose(Number(updated.attrs.yaw) || 0, Number(updated.attrs.pitch) || 0)
          }
          const snap = body.querySelector<HTMLImageElement>(".three-d-snapshot")
          if (snap && updated.attrs.snapshot && snap.src !== updated.attrs.snapshot) {
            snap.src = String(updated.attrs.snapshot)
          }
          node = updated
          return true
        },
        destroy() {
          viewer.dispose()
          box.destroy()
        },
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
          body.classList.add("is-selected")
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
          body.classList.remove("is-selected")
        },
        ignoreMutation: () => true,
      }
    }
  },
  addCommands() {
    return {
      insertThreeDModel:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: "threeDModel",
              attrs: {
                preset: "cube",
                src: "",
                snapshot: "",
                width: 220,
                height: 160,
                yaw: 0.45,
                pitch: 0.3,
                roll: 0,
                alt: "",
                ...attrs,
              },
            })
            .run(),
    }
  },
})
