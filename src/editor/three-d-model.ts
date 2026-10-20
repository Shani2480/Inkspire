import { objectBox, objectLayoutAttributes } from "@/editor/object-frame"
import { floatingAttributes } from "@/editor/objects"
import { Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import {
  DEFAULT_MODEL_FORMAT,
  isBuiltInTexture,
  lightPosition,
  MODEL_LIGHTINGS,
  MODEL_MATERIALS,
  modelFormat,
  textureCanvas,
  type ModelFormat,
} from "@/editor/model-format"
import { modelScene, scenePose, type ModelScene } from "@/editor/model-scenes"

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

function geometryFor(preset: string): THREE.BufferGeometry {
  switch (preset) {
    case "sphere":
      return new THREE.SphereGeometry(1, 32, 24)
    case "cylinder":
      return new THREE.CylinderGeometry(0.7, 0.7, 1.4, 32)
    case "cone":
      return new THREE.ConeGeometry(0.9, 1.5, 32)
    case "torus":
      return new THREE.TorusGeometry(0.7, 0.28, 16, 48)
    case "electronics":
      return new THREE.BoxGeometry(1.6, 0.15, 1)
    case "anatomy":
      return new THREE.CapsuleGeometry(0.45, 0.9, 8, 16)
    case "furniture":
      return new THREE.BoxGeometry(1.2, 1.1, 1.2)
    case "symbol":
      return new THREE.OctahedronGeometry(1)
    default:
      return new THREE.BoxGeometry(1.2, 1.2, 1.2)
  }
}

function mountViewer(
  dom: HTMLElement,
  node: ProseNode,
  onSnapshot: (dataUrl: string, yaw: number, pitch: number) => void,
) {
  const width = Number(node.attrs.width) || 220
  const height = Number(node.attrs.height) || 160
  dom.style.width = `${width}px`
  dom.style.height = `${height}px`
  dom.classList.add("three-d-model")
  dom.classList.toggle("is-word-model", Boolean(node.attrs.wordModel))
  dom.replaceChildren()

  const canvas = document.createElement("canvas")
  canvas.width = width * devicePixelRatio
  canvas.height = height * devicePixelRatio
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  dom.append(canvas)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(devicePixelRatio)
  renderer.setSize(width, height, false)
  const scene = new THREE.Scene()
  // A model opened from Word has no backdrop, as Word draws it.
  scene.background = node.attrs.wordModel ? null : new THREE.Color(0xf3f4f6)
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
  camera.position.set(2.2, 1.6, 2.4)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.target.set(0, 0, 0)

  // A soft room for shiny and metal surfaces to reflect; without one, metal shows almost black.
  const environment = new THREE.PMREMGenerator(renderer)
  scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture
  environment.dispose()

  const light = new THREE.DirectionalLight(0xffffff, 1.15)
  const fill = new THREE.DirectionalLight(0xffffff, 0.25)
  const ambient = new THREE.AmbientLight(0xffffff, 0.55)
  scene.add(light, fill, ambient)

  const material = new THREE.MeshStandardMaterial({ color: PRIMITIVE_COLOR, metalness: 0.2, roughness: 0.45 })
  const src = String(node.attrs.src || "")
  // A model with a file shows its last picture while the file loads, not the stand-in shape it would replace.
  let mesh: THREE.Object3D = src
    ? new THREE.Group()
    : new THREE.Mesh(geometryFor(String(node.attrs.preset || "cube")), material)
  scene.add(mesh)
  const poster = String(node.attrs.snapshot || "")
  if (src && poster) {
    dom.style.background = `center / contain no-repeat url("${poster.replace(/"/g, "%22")}")`
  }

  let format = modelFormat(node.attrs)
  let texture: THREE.Texture | null = null
  let textureKey = ""

  /** The texture for the format, made again only when the texture or its scale changes. */
  const textureFor = (next: ModelFormat) => {
    const key = `${next.texture.length}:${next.texture.slice(0, 64)}:${next.texture.slice(-64)}:${next.textureScale}`
    if (key === textureKey) {
      return texture
    }
    texture?.dispose()
    texture = null
    textureKey = key
    if (!next.texture) {
      return null
    }
    const made = isBuiltInTexture(next.texture)
      ? new THREE.CanvasTexture(textureCanvas(next.texture))
      : new THREE.TextureLoader().load(next.texture, () => {
          renderer.render(scene, camera)
          scheduleCapture()
        })
    made.wrapS = THREE.RepeatWrapping
    made.wrapT = THREE.RepeatWrapping
    made.repeat.set(next.textureScale, next.textureScale)
    made.colorSpace = THREE.SRGBColorSpace
    texture = made
    return made
  }

  /** Colour, surface, texture and light, on the built-in shape and on every part of a loaded model. */
  const applyFormat = (next: ModelFormat) => {
    format = next
    const surface = MODEL_MATERIALS.find((item) => item.id === next.material) ?? MODEL_MATERIALS[1]!
    const map = textureFor(next)
    const tint = next.color ? new THREE.Color(next.color) : null
    mesh.traverse((part) => {
      const owner = part as THREE.Mesh
      if (!owner.isMesh) {
        return
      }
      const materials = Array.isArray(owner.material) ? owner.material : [owner.material]
      for (const item of materials) {
        const standard = item as THREE.MeshStandardMaterial
        if (!standard.isMeshStandardMaterial) {
          continue
        }
        const base = (standard.userData.baseColor ??= standard.color.clone()) as THREE.Color
        const plain = map ? new THREE.Color(0xffffff) : base
        standard.color.copy(tint ? (next.colorMode === "replace" ? tint : plain.clone().multiply(tint)) : plain)
        standard.roughness = surface.roughness
        standard.metalness = surface.metalness
        standard.envMapIntensity = surface.reflection * Math.max(0.2, next.intensity / 100)
        if (map || standard.userData.formatMap) {
          // The model's own texture, kept once: a missing one is null, which `??=` would not keep.
          if (!("baseMap" in standard.userData)) {
            standard.userData.baseMap = standard.map
          }
          standard.map = map ?? (standard.userData.baseMap as THREE.Texture | null)
          standard.userData.formatMap = Boolean(map)
        }
        standard.needsUpdate = true
      }
    })
    const lighting = MODEL_LIGHTINGS.find((item) => item.id === next.lighting) ?? MODEL_LIGHTINGS[0]!
    const scale = next.intensity / 100
    const place = lightPosition(next.direction, next.elevation)
    light.color.set(lighting.key)
    light.intensity = lighting.keyIntensity * scale
    light.position.set(place.x, place.y, place.z)
    fill.color.set(lighting.ambient)
    fill.intensity = lighting.fillIntensity * scale
    fill.position.set(-place.x, Math.max(1, place.y / 2), -place.z)
    ambient.color.set(lighting.ambient)
    ambient.intensity = lighting.ambientIntensity * Math.max(0.35, scale)
  }
  applyFormat(format)

  if (src) {
    const loader = new GLTFLoader()
    loader.load(
      src,
      (gltf) => {
        scene.remove(mesh)
        // The model centred on its own middle and, when its units are far from the viewer's (a model made in
        // centimetres or metres), fitted to the view; it turns about that middle.
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const size = box.getSize(new THREE.Vector3())
        const largest = Math.max(size.x, size.y, size.z)
        const fit = largest > 0 && (largest < 0.5 || largest > 4) ? 2 / largest : 1
        gltf.scene.scale.setScalar(fit)
        gltf.scene.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-fit)
        mesh = new THREE.Group()
        mesh.add(gltf.scene)
        mesh.scale.setScalar(1.2)
        mesh.rotation.y = Number(node.attrs.yaw) || 0
        mesh.rotation.x = Number(node.attrs.pitch) || 0
        scene.add(mesh)
        dom.style.background = ""
        applyFormat(format)
        // A model opened from Word already has Word's own picture; the app takes its own once the model is turned.
        if (!node.attrs.wordModel) {
          scheduleCapture()
        }
      },
      undefined,
      (error) => console.error("The 3D model could not be loaded", error),
    )
  }

  mesh.rotation.y = Number(node.attrs.yaw) || 0
  mesh.rotation.x = Number(node.attrs.pitch) || 0

  let frame = 0
  let idleTimer = 0
  // Play 3D (22.15): while a scene plays the model moves from the pose it rests in; stopping puts it back.
  let playing: ModelScene = modelScene(node.attrs.scene)
  let sceneStart = performance.now()
  const rest = { yaw: mesh.rotation.y, y: mesh.position.y, scale: mesh.scale.clone() }
  const restore = () => {
    mesh.rotation.y = rest.yaw
    mesh.position.y = rest.y
    mesh.scale.copy(rest.scale)
    canvas.style.opacity = ""
  }
  const play = (next: ModelScene) => {
    if (playing === "" && next !== "") {
      rest.yaw = mesh.rotation.y
      rest.y = mesh.position.y
      rest.scale.copy(mesh.scale)
    } else if (next === "") {
      restore()
    }
    playing = next
    sceneStart = performance.now()
  }
  const tick = () => {
    frame = requestAnimationFrame(tick)
    if (playing) {
      const pose = scenePose(playing, (performance.now() - sceneStart) / 1000)
      mesh.rotation.y = rest.yaw + pose.yaw
      mesh.position.y = rest.y + pose.lift
      mesh.scale.copy(rest.scale).multiplyScalar(pose.scale)
      canvas.style.opacity = String(pose.opacity)
    }
    controls.update()
    renderer.render(scene, camera)
  }
  tick()

  const capture = () => {
    renderer.render(scene, camera)
    try {
      onSnapshot(canvas.toDataURL("image/png"), playing ? rest.yaw : mesh.rotation.y, mesh.rotation.x)
    } catch {
      // ignore
    }
  }

  const scheduleCapture = () => {
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(capture, 180)
  }
  controls.addEventListener("end", scheduleCapture)

  const handle = document.createElement("button")
  handle.type = "button"
  handle.className = "three-d-orbit"
  handle.title = "Drag to turn the 3D model"
  handle.setAttribute("aria-label", "Turn the 3D model")
  // Word's 3D control: circling arrows on a soft round plate.
  handle.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">' +
    '<ellipse cx="12" cy="12" rx="8.5" ry="3.6" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M12 3.5c2 0 3.6 3.8 3.6 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M12 20.5c-2 0-3.6-3.8-3.6-8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="m18.2 6.6 2.3 1.9-2.9.8M5.8 17.4l-2.3-1.9 2.9-.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>"
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const startYaw = mesh.rotation.y
    const startPitch = mesh.rotation.x
    const move = (next: PointerEvent) => {
      mesh.rotation.y = startYaw + (next.clientX - startX) * 0.01
      mesh.rotation.x = startPitch + (next.clientY - startY) * 0.01
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      capture()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  })
  dom.append(handle)

  const snapshot = String(node.attrs.snapshot || "")
  if (snapshot) {
    const img = document.createElement("img")
    img.className = "three-d-snapshot"
    img.src = snapshot
    img.alt = ""
    img.hidden = true
    dom.append(img)
  }

  return {
    dispose: () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(idleTimer)
      controls.dispose()
      scene.environment?.dispose()
      texture?.dispose()
      renderer.dispose()
    },
    play,
    setPose: (yaw: number, pitch: number) => {
      rest.yaw = yaw
      mesh.rotation.y = yaw
      mesh.rotation.x = pitch
      capture()
    },
    setFormat: (next: ModelFormat) => {
      applyFormat(next)
      scheduleCapture()
    },
    /** A new size, drawn at once (a live resize), with the picture for print and save taken once it settles. */
    resize: (nextWidth: number, nextHeight: number) => {
      dom.style.width = `${nextWidth}px`
      dom.style.height = `${nextHeight}px`
      renderer.setSize(nextWidth, nextHeight, false)
      camera.aspect = nextWidth / Math.max(1, nextHeight)
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
      scheduleCapture()
    },
  }
}

const PRIMITIVE_COLOR = 0x0f6cbd

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
      let viewer = mountViewer(body, node, writeAttrs)
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
            viewer = mountViewer(body, updated, writeAttrs)
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
