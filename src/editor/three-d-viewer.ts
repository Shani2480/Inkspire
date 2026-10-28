import {
  isBuiltInTexture,
  lightPosition,
  MODEL_LIGHTINGS,
  MODEL_MATERIALS,
  modelFormat,
  textureCanvas,
  type ModelFormat,
} from "@/editor/model-format"
import { modelScene, scenePose, type ModelScene } from "@/editor/model-scenes"
import { MODEL_VIEWS, viewPose } from "@/editor/model-views"
import { fitLoadedModel } from "@/editor/three-d-fit"
import type { Node as ProseNode } from "@tiptap/pm/model"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"

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

export function mountViewer(
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

  const src = String(node.attrs.src || "")
  const poster = String(node.attrs.snapshot || "")
  // A model with a file shows its last picture (Word's, for a model from Word) until the file has loaded and drawn.
  // Set before anything that can fail, so a webview without WebGL still shows the picture.
  if (src && poster) {
    dom.style.background = `center / contain no-repeat url("${poster.replace(/"/g, "%22")}")`
  }

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
  // A model with a file shows its last picture while the file loads, not the stand-in shape it would replace.
  let mesh: THREE.Object3D = src
    ? new THREE.Group()
    : new THREE.Mesh(geometryFor(String(node.attrs.preset || "cube")), material)
  scene.add(mesh)
  // Until the file has loaded there is nothing in the view, so no picture is taken of it: the one the model has
  // stays (Word's, for a model from Word), in the page, in print and in the saved file.
  let modelReady = !src

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
        // The model centred on its own middle and, when its units are far from the viewer's (a model made in
        // centimetres or metres), fitted to the view; it turns about that middle. A file with nothing to draw (no
        // scene, or one without extent) is treated as a failed load: the stand-in and the picture stay.
        // A model with animations stands as the first frame of its first one, as Word shows it (its poster frame).
        const [clip] = gltf.animations
        if (clip) {
          const mixer = new THREE.AnimationMixer(gltf.scene)
          mixer.clipAction(clip).play()
          mixer.update(0)
        }
        const fit = fitLoadedModel(gltf.scene)
        if (!fit) {
          console.error("The 3D model has nothing to draw", src)
          return
        }
        const previous = mesh
        scene.remove(previous)
        gltf.scene.scale.setScalar(fit.scale)
        gltf.scene.position.copy(fit.centre).multiplyScalar(-fit.scale)
        mesh = new THREE.Group()
        mesh.rotation.order = POSE_ORDER
        mesh.add(gltf.scene)
        mesh.scale.setScalar(1.2)
        // The pose the stand-in was turned to while the file loaded, or the rest pose of a playing scene.
        mesh.rotation.y = playing ? rest.yaw : previous.rotation.y
        mesh.rotation.x = previous.rotation.x
        mesh.rotation.z = previous.rotation.z
        rest.y = mesh.position.y
        rest.scale.copy(mesh.scale)
        scene.add(mesh)
        modelReady = true
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

  mesh.rotation.order = POSE_ORDER
  mesh.rotation.y = Number(node.attrs.yaw) || 0
  mesh.rotation.x = Number(node.attrs.pitch) || 0
  mesh.rotation.z = Number(node.attrs.roll) || 0

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
    if (!modelReady) {
      return
    }
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
    views = null
  }
  controls.addEventListener("end", scheduleCapture)

  // The model drawn in each of Word's named views, for the 3D Model Views gallery; made again after a change.
  let views: string[] | null = null
  const pictures = () => {
    if (!modelReady) {
      return null
    }
    if (views) {
      return views
    }
    const size = renderer.getSize(new THREE.Vector2())
    const ratio = renderer.getPixelRatio()
    const saved = { turn: mesh.rotation.clone(), lift: mesh.position.y, scale: mesh.scale.clone() }
    mesh.position.y = rest.y
    mesh.scale.copy(playing ? rest.scale : saved.scale)
    renderer.setPixelRatio(1)
    renderer.setSize(96, 72, false)
    camera.aspect = 96 / 72
    camera.updateProjectionMatrix()
    views = MODEL_VIEWS.map((view) => {
      const pose = viewPose(view, camera.position)
      mesh.rotation.set(pose.pitch, pose.yaw, pose.roll)
      renderer.render(scene, camera)
      return canvas.toDataURL("image/png")
    })
    mesh.rotation.copy(saved.turn)
    mesh.position.y = saved.lift
    mesh.scale.copy(saved.scale)
    renderer.setPixelRatio(ratio)
    renderer.setSize(size.x, size.y, false)
    camera.aspect = size.x / Math.max(1, size.y)
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
    return views
  }

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
    camera: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    pictures,
    setPose: (yaw: number, pitch: number, roll = 0) => {
      rest.yaw = yaw
      mesh.rotation.y = yaw
      mesh.rotation.x = pitch
      mesh.rotation.z = roll
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
/**
 * The model turns about the upright first (`yaw`) and then tips toward or away from the viewer (`pitch`), so a
 * named view (`model-views.ts`) faces the camera square on.
 */
const POSE_ORDER = "YXZ"
