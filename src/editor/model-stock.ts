import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { DEFAULT_MODEL_FORMAT, lightPosition } from "@/editor/model-format"

/**
 * The stock 3D models: built from three.js shapes in parts, each with its own colour and surface, so a model needs no
 * file and costs nothing to ship. Each part's own surface is kept on `userData.ownSurface`; the viewer keeps it while
 * the model's format is Standard and paints over it for Matte, Glossy or Metal.
 */

type Vec = [number, number, number]

type Look = {
  roughness?: number
  metalness?: number
  /** How strongly the surface reflects the room; by default from how metal or smooth it is. */
  reflection?: number
  glow?: string
  glowStrength?: number
  map?: THREE.Texture | null
  opacity?: number
  doubleSided?: boolean
}

function paint(color: string, look: Look = {}) {
  const roughness = look.roughness ?? 0.5
  const metalness = look.metalness ?? 0
  const reflection = look.reflection ?? (metalness > 0.5 ? 1 : roughness < 0.25 ? 0.6 : 0.15)
  const made = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: reflection })
  if (look.map) {
    made.map = look.map
  }
  if (look.glow) {
    made.emissive.set(look.glow)
    made.emissiveIntensity = look.glowStrength ?? 0.6
    if (look.map) {
      made.emissiveMap = look.map
    }
  }
  if (look.opacity !== undefined) {
    made.transparent = true
    made.opacity = look.opacity
    made.depthWrite = false
  }
  if (look.doubleSided) {
    made.side = THREE.DoubleSide
  }
  made.userData.ownSurface = { roughness, metalness, reflection }
  return made
}

function put(
  group: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  at: Vec = [0, 0, 0],
  turn: Vec = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...at)
  mesh.rotation.set(...turn)
  group.add(mesh)
  return mesh
}

/** A box with rounded edges. */
function box(width: number, height: number, depth: number, radius = 0.02) {
  return new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, width / 2, height / 2, depth / 2) * 0.999)
}

function roundedRect(width: number, height: number, radius: number) {
  const x = -width / 2
  const y = -height / 2
  const r = Math.min(radius, width / 2, height / 2)
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + width - r, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + r)
  shape.lineTo(x + width, y + height - r)
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  shape.lineTo(x + r, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  return shape
}

/** A shape extruded along z with softened edges, centred, `depth` thick overall. */
function extruded(shape: THREE.Shape, depth: number, bevel = 0.02, segments = 3) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segments,
    curveSegments: 24,
  })
  geometry.center()
  return geometry
}

/** A rounded slab standing in the xy plane, as a phone or a screen is. */
function slab(width: number, height: number, depth: number, radius: number, bevel = 0.012) {
  return extruded(roundedRect(width - bevel * 2, height - bevel * 2, radius), depth, bevel)
}

/** A strap `length` long rising from the origin along y and curling back (toward -z) round a circle. */
function bent(width: number, length: number, thickness: number, radius: number) {
  const geometry = new THREE.BoxGeometry(width, length, thickness, 1, 32, 1).translate(0, length / 2, 0)
  const position = geometry.getAttribute("position")
  for (let index = 0; index < position.count; index += 1) {
    const angle = position.getY(index) / radius
    const reach = radius + position.getZ(index)
    position.setXYZ(index, position.getX(index), reach * Math.sin(angle), reach * Math.cos(angle) - radius)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** A flat rounded rectangle facing +z, with its picture stretched across it. */
function plate(width: number, height: number, radius: number) {
  const geometry = new THREE.ShapeGeometry(roundedRect(width, height, radius), 12)
  const uv = geometry.getAttribute("uv")
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) / width + 0.5, uv.getY(index) / height + 0.5)
  }
  return geometry
}

function tube(points: Vec[], radius: number, segments = 64, radial = 16) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)))
  return new THREE.TubeGeometry(curve, segments, radius, radial, false)
}

/** A tube with round ends. */
function hose(group: THREE.Object3D, points: Vec[], radius: number, material: THREE.Material, segments = 64) {
  put(group, tube(points, radius, segments), material)
  put(group, new THREE.SphereGeometry(radius, 16, 12), material, points[0])
  put(group, new THREE.SphereGeometry(radius, 16, 12), material, points[points.length - 1])
}

/** A solid turned about the upright, from (radius, height) pairs. */
function lathe(profile: [number, number][], segments = 48) {
  return new THREE.LatheGeometry(
    profile.map(([radius, height]) => new THREE.Vector2(radius, height)),
    segments,
  )
}

/** A rod from one point to another. */
function rod(
  group: THREE.Object3D,
  from: Vec,
  to: Vec,
  radius: number,
  material: THREE.Material,
  round = false,
  endRadius = radius,
) {
  const start = new THREE.Vector3(...from)
  const end = new THREE.Vector3(...to)
  const length = start.distanceTo(end)
  const geometry = round
    ? new THREE.CapsuleGeometry(radius, length, 8, 16)
    : new THREE.CylinderGeometry(endRadius, radius, length, 20)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize())
  group.add(mesh)
  return mesh
}

/** An ellipsoid. */
function blob(
  group: THREE.Object3D,
  radius: number,
  scale: Vec,
  material: THREE.Material,
  at: Vec,
  turn: Vec = [0, 0, 0],
) {
  const mesh = put(group, new THREE.SphereGeometry(radius, 32, 24), material, at, turn)
  mesh.scale.set(...scale)
  return mesh
}

/** A sphere moved vertex by vertex, for organic shapes. */
function sculpt(widthSegments: number, heightSegments: number, move: (point: THREE.Vector3) => void) {
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments)
  const position = geometry.getAttribute("position")
  const point = new THREE.Vector3()
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index)
    move(point)
    position.setXYZ(index, point.x, point.y, point.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** The same numbers every time, so a stock model looks the same in every document. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/** A picture drawn on a canvas, or none where there is no canvas (tests). */
function drawn(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  if (typeof document === "undefined" || typeof navigator === "undefined" || /jsdom/i.test(navigator.userAgent)) {
    return null
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) {
    return null
  }
  draw(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function roundedFill(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath()
  context.roundRect(x, y, w, h, r)
  context.fill()
}

/** A lit screen: a wallpaper with a few windows or tiles on it. */
function screen(kind: "desktop" | "phone" | "watch") {
  const [width, height] = kind === "desktop" ? [640, 400] : kind === "phone" ? [240, 480] : [200, 240]
  const texture = drawn(width, height, (context) => {
    const wallpaper = context.createLinearGradient(0, 0, width, height)
    wallpaper.addColorStop(0, "#1e3c72")
    wallpaper.addColorStop(0.55, "#2a5298")
    wallpaper.addColorStop(1, "#6dd5ed")
    context.fillStyle = wallpaper
    context.fillRect(0, 0, width, height)
    context.fillStyle = "rgba(255,255,255,0.18)"
    context.beginPath()
    context.ellipse(width * 0.8, height * 0.2, width * 0.35, height * 0.3, 0, 0, Math.PI * 2)
    context.fill()
    if (kind === "desktop") {
      context.fillStyle = "rgba(255,255,255,0.92)"
      roundedFill(context, 60, 50, 330, 220, 10)
      context.fillStyle = "#0f6cbd"
      roundedFill(context, 60, 50, 330, 26, 10)
      context.fillRect(60, 64, 330, 12)
      context.fillStyle = "#c8d3e0"
      for (let line = 0; line < 7; line += 1) {
        context.fillRect(80, 96 + line * 22, line % 3 === 2 ? 180 : 280, 9)
      }
      context.fillStyle = "rgba(255,255,255,0.85)"
      roundedFill(context, 420, 120, 170, 130, 10)
      context.fillStyle = "#f2c230"
      context.fillRect(440, 200, 22, 34)
      context.fillStyle = "#3cb371"
      context.fillRect(472, 170, 22, 64)
      context.fillStyle = "#e04848"
      context.fillRect(504, 186, 22, 48)
      context.fillStyle = "rgba(20,24,32,0.55)"
      roundedFill(context, 180, 352, 280, 36, 12)
      const dock = ["#f2c230", "#3cb371", "#e04848", "#3f7fe0", "#9b59b6", "#1abc9c"]
      dock.forEach((color, index) => {
        context.fillStyle = color
        roundedFill(context, 194 + index * 44, 358, 26, 26, 7)
      })
    } else if (kind === "phone") {
      context.fillStyle = "#ffffff"
      context.font = "bold 46px sans-serif"
      context.textAlign = "center"
      context.fillText("9:41", width / 2, 96)
      const tiles = ["#f2c230", "#3cb371", "#e04848", "#3f7fe0", "#9b59b6", "#1abc9c", "#ff8a3d", "#ffffff"]
      for (let index = 0; index < 16; index += 1) {
        context.fillStyle = tiles[index % tiles.length]!
        roundedFill(context, 22 + (index % 4) * 52, 160 + Math.floor(index / 4) * 64, 38, 38, 10)
      }
      context.fillStyle = "rgba(255,255,255,0.3)"
      roundedFill(context, 18, 420, 204, 46, 18)
    } else {
      context.fillStyle = "#0b0d12"
      context.fillRect(0, 0, width, height)
      context.lineWidth = 14
      const rings = ["#fa114f", "#92e82a", "#1eeaef"]
      rings.forEach((color, index) => {
        context.strokeStyle = `${color}44`
        context.beginPath()
        context.arc(width / 2, height / 2 + 20, 70 - index * 18, 0, Math.PI * 2)
        context.stroke()
        context.strokeStyle = color
        context.beginPath()
        context.arc(width / 2, height / 2 + 20, 70 - index * 18, -Math.PI / 2, Math.PI * (0.6 + index * 0.35))
        context.stroke()
      })
      context.fillStyle = "#ffffff"
      context.font = "bold 30px sans-serif"
      context.textAlign = "center"
      context.fillText("10:09", width / 2, 42)
    }
  })
  return paint("#ffffff", { roughness: 0.18, map: texture, glow: "#ffffff", glowStrength: texture ? 0.55 : 0 })
}

// ---------------------------------------------------------------------------------------------------------------
// Electronics

function laptop() {
  const group = new THREE.Group()
  const shell = paint("#c7cad0", { metalness: 0.75, roughness: 0.32 })
  const keyColour = paint("#25272c", { roughness: 0.6 })
  put(group, box(3, 0.12, 2, 0.05), shell, [0, 0.06, 0])
  put(group, box(2.64, 0.012, 1.22, 0.005), paint("#9fa3aa", { metalness: 0.6, roughness: 0.4 }), [0, 0.121, -0.28])
  const keys: THREE.BufferGeometry[] = []
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      keys.push(box(0.17, 0.03, 0.15, 0.015).translate(-1.14 + col * 0.19, 0.135, -0.8 + row * 0.19))
    }
  }
  keys.push(box(1.1, 0.03, 0.15, 0.015).translate(0, 0.135, 0.15))
  put(group, mergeGeometries(keys), keyColour)
  put(group, box(1.05, 0.008, 0.58, 0.004), paint("#b5b9c0", { metalness: 0.6, roughness: 0.25 }), [0, 0.122, 0.62])
  const lid = new THREE.Group()
  lid.position.set(0, 0.12, -0.99)
  lid.rotation.x = -0.24
  put(lid, box(3, 2, 0.07, 0.035), shell, [0, 1, -0.035])
  put(lid, new THREE.PlaneGeometry(2.94, 1.94), paint("#0d0e10", { roughness: 0.15 }), [0, 1, 0.001])
  put(lid, plate(2.74, 1.68, 0.02), screen("desktop"), [0, 1.03, 0.003])
  put(lid, new THREE.SphereGeometry(0.018, 12, 8), paint("#1b2a4a", { roughness: 0.1 }), [0, 1.92, 0.004])
  group.add(lid)
  return group
}

function phone() {
  const group = new THREE.Group()
  const body = paint("#1d1e22", { metalness: 0.6, roughness: 0.3 })
  put(group, slab(0.8, 1.64, 0.08, 0.12), body)
  put(group, plate(0.77, 1.61, 0.11), paint("#050506", { roughness: 0.1 }), [0, 0, 0.0405])
  put(group, plate(0.72, 1.55, 0.09), screen("phone"), [0, 0, 0.042])
  put(group, plate(0.2, 0.05, 0.025), paint("#050506", { roughness: 0.1 }), [0, 0.72, 0.043])
  put(group, slab(0.34, 0.34, 0.03, 0.09), paint("#2a2b30", { metalness: 0.5, roughness: 0.25 }), [-0.17, 0.58, -0.05])
  const glass = paint("#0b0c10", { roughness: 0.05, reflection: 0.8 })
  const ring = paint("#8d9097", { metalness: 0.9, roughness: 0.25 })
  for (const [x, y] of [
    [-0.25, 0.66],
    [-0.25, 0.5],
    [-0.09, 0.58],
  ] as const) {
    put(group, new THREE.CylinderGeometry(0.055, 0.055, 0.025, 24), glass, [x, y, -0.07], [Math.PI / 2, 0, 0])
    put(group, new THREE.TorusGeometry(0.058, 0.01, 8, 24), ring, [x, y, -0.083])
  }
  put(group, box(0.015, 0.2, 0.03, 0.006), body, [0.405, 0.32, 0])
  put(group, box(0.015, 0.12, 0.03, 0.006), body, [-0.405, 0.42, 0])
  put(group, box(0.015, 0.12, 0.03, 0.006), body, [-0.405, 0.26, 0])
  return group
}

function tablet() {
  const group = new THREE.Group()
  put(group, slab(2.3, 1.6, 0.07, 0.12), paint("#c9ccd2", { metalness: 0.7, roughness: 0.32 }))
  put(group, plate(2.27, 1.57, 0.11), paint("#08090b", { roughness: 0.1 }), [0, 0, 0.0355])
  put(group, plate(2.08, 1.4, 0.03), screen("desktop"), [0, 0, 0.037])
  put(group, new THREE.SphereGeometry(0.014, 12, 8), paint("#1b2a4a", { roughness: 0.1 }), [0, 0.74, 0.037])
  put(group, slab(0.2, 0.2, 0.02, 0.06), paint("#2a2b30", { metalness: 0.5, roughness: 0.3 }), [-0.95, 0.6, -0.042])
  return group
}

function monitor() {
  const group = new THREE.Group()
  const dark = paint("#1b1c20", { roughness: 0.45, metalness: 0.2 })
  const silver = paint("#c3c6cc", { metalness: 0.8, roughness: 0.3 })
  put(group, slab(3.2, 1.9, 0.1, 0.05), dark, [0, 1.55, 0])
  put(group, plate(3.14, 1.84, 0.03), paint("#060607", { roughness: 0.12 }), [0, 1.55, 0.051])
  put(group, plate(3.02, 1.7, 0.01), screen("desktop"), [0, 1.57, 0.052])
  put(group, box(1.3, 0.9, 0.14, 0.06), dark, [0, 1.5, -0.1])
  put(group, box(0.28, 1.1, 0.07, 0.03), silver, [0, 0.62, -0.22], [0.12, 0, 0])
  const base = put(group, slab(1.3, 0.8, 0.05, 0.2), silver, [0, 0.025, -0.12])
  base.rotation.x = -Math.PI / 2
  return group
}

function keyboard() {
  const group = new THREE.Group()
  put(group, box(3.4, 0.12, 1.2, 0.05), paint("#c3c6cc", { metalness: 0.75, roughness: 0.3 }), [0, 0.06, 0])
  const keys: THREE.BufferGeometry[] = []
  const key = (x: number, z: number, width = 0.19) => keys.push(box(width, 0.06, 0.19, 0.03).translate(x, 0.15, z))
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 14; col += 1) {
      key(-1.46 + col * 0.225, -0.45 + row * 0.225)
    }
  }
  for (let col = 0; col < 3; col += 1) {
    key(-1.46 + col * 0.225, 0.45)
    key(1.46 - col * 0.225, 0.45)
  }
  key(0, 0.45, 1.6)
  put(group, mergeGeometries(keys), paint("#f4f5f7", { roughness: 0.4 }))
  return group
}

function headphones() {
  const group = new THREE.Group()
  const dark = paint("#24262d", { roughness: 0.35, metalness: 0.3 })
  const leather = paint("#3a3b42", { roughness: 0.8 })
  const metal = paint("#c3c6cc", { metalness: 0.9, roughness: 0.25 })
  const arc = (radius: number, from: number, to: number, lift: number): Vec[] =>
    Array.from({ length: 25 }, (_, index) => {
      const angle = from + ((to - from) * index) / 24
      return [Math.cos(angle) * radius, Math.sin(angle) * radius + lift, 0]
    })
  put(group, tube(arc(1.0, 0, Math.PI, 0.42), 0.055), dark)
  put(group, tube(arc(0.92, Math.PI * 0.22, Math.PI * 0.78, 0.42), 0.09), leather)
  for (const side of [-1, 1]) {
    put(group, new THREE.CylinderGeometry(0.42, 0.4, 0.26, 40), dark, [side * 1.0, -0.05, 0], [0, 0, Math.PI / 2])
    put(group, new THREE.TorusGeometry(0.38, 0.018, 8, 40), metal, [side * 1.13, -0.05, 0], [0, Math.PI / 2, 0])
    put(group, new THREE.TorusGeometry(0.31, 0.11, 16, 40), leather, [side * 0.83, -0.05, 0], [0, Math.PI / 2, 0])
    put(
      group,
      new THREE.CylinderGeometry(0.28, 0.28, 0.02, 32),
      paint("#15161a", { roughness: 0.95 }),
      [side * 0.8, -0.05, 0],
      [0, 0, Math.PI / 2],
    )
    put(
      group,
      new THREE.TorusGeometry(0.47, 0.028, 10, 32, Math.PI),
      metal,
      [side * 1.0, -0.05, 0],
      [0, Math.PI / 2, 0],
    )
  }
  return group
}

function camera() {
  const group = new THREE.Group()
  const body = paint("#1c1d21", { roughness: 0.7 })
  const rubber = paint("#121315", { roughness: 0.95 })
  const metal = paint("#8d9097", { metalness: 0.9, roughness: 0.3 })
  put(group, box(1.9, 1.2, 0.7, 0.09), body)
  put(group, box(0.44, 1.12, 0.52, 0.16), rubber, [0.78, -0.03, 0.22])
  put(group, box(0.62, 0.38, 0.6, 0.07), body, [-0.05, 0.72, 0])
  put(group, box(0.32, 0.04, 0.3, 0.01), metal, [-0.05, 0.92, 0])
  put(group, new THREE.CylinderGeometry(0.08, 0.08, 0.06, 24), metal, [0.75, 0.62, 0.25])
  put(
    group,
    new THREE.CylinderGeometry(0.17, 0.17, 0.12, 32),
    paint("#3a3c42", { metalness: 0.6, roughness: 0.4 }),
    [-0.62, 0.66, 0],
  )
  const forward: Vec = [Math.PI / 2, 0, 0]
  put(group, new THREE.CylinderGeometry(0.49, 0.49, 0.08, 48), metal, [-0.05, -0.05, 0.39], forward)
  put(group, new THREE.CylinderGeometry(0.43, 0.45, 0.6, 48), body, [-0.05, -0.05, 0.72], forward)
  put(group, new THREE.CylinderGeometry(0.46, 0.46, 0.22, 48), rubber, [-0.05, -0.05, 0.64], forward)
  put(group, new THREE.CylinderGeometry(0.445, 0.445, 0.06, 48), metal, [-0.05, -0.05, 1.0], forward)
  put(group, new THREE.TorusGeometry(0.44, 0.012, 8, 48), paint("#d23b3b", { roughness: 0.3 }), [-0.05, -0.05, 0.9])
  put(
    group,
    new THREE.SphereGeometry(0.5, 40, 16, 0, Math.PI * 2, 0, 0.7),
    paint("#1b2a4a", { roughness: 0.04, metalness: 0.3, reflection: 1 }),
    [-0.05, -0.05, 0.56],
    forward,
  )
  return group
}

function speaker() {
  const group = new THREE.Group()
  put(group, box(1.0, 1.6, 1.0, 0.05), paint("#7a4e2d", { roughness: 0.55 }))
  put(group, new THREE.PlaneGeometry(0.94, 1.54), paint("#1c1c1f", { roughness: 0.85 }), [0, 0, 0.501])
  const cone = paint("#2a2a2e", { roughness: 0.6, doubleSided: true })
  const forward: Vec = [Math.PI / 2, 0, 0]
  put(group, new THREE.TorusGeometry(0.33, 0.04, 12, 48), paint("#141416", { roughness: 0.8 }), [0, -0.25, 0.51])
  put(
    group,
    lathe([
      [0.06, -0.12],
      [0.2, -0.06],
      [0.33, 0],
    ]),
    cone,
    [0, -0.25, 0.51],
    forward,
  )
  put(group, new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, 1.1), cone, [0, -0.25, 0.39], forward)
  put(
    group,
    new THREE.TorusGeometry(0.15, 0.025, 10, 40),
    paint("#8d9097", { metalness: 0.9, roughness: 0.3 }),
    [0, 0.42, 0.51],
  )
  put(
    group,
    new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, 1.2),
    paint("#c3c6cc", { metalness: 0.85, roughness: 0.25 }),
    [0, 0.42, 0.47],
    forward,
  )
  put(group, new THREE.TorusGeometry(0.09, 0.02, 10, 32), paint("#141416", { roughness: 0.8 }), [0, -0.62, 0.505])
  return group
}

function watch() {
  const group = new THREE.Group()
  const metal = paint("#c9ccd2", { metalness: 0.85, roughness: 0.22 })
  const band = paint("#2d3e50", { roughness: 0.75 })
  put(group, slab(0.9, 1.08, 0.26, 0.22, 0.05), metal)
  put(group, plate(0.84, 1.02, 0.19), paint("#050506", { roughness: 0.08 }), [0, 0, 0.131])
  put(group, plate(0.72, 0.88, 0.13), screen("watch"), [0, 0, 0.132])
  put(group, new THREE.CylinderGeometry(0.065, 0.065, 0.09, 24), metal, [0.48, 0.18, 0], [0, 0, Math.PI / 2])
  put(group, box(0.04, 0.24, 0.1, 0.02), metal, [0.46, -0.15, 0])
  // The straps curl back from the case as they would round a wrist.
  put(group, bent(0.72, 1.3, 0.07, 0.6), band, [0, 0.5, -0.05])
  put(group, bent(0.72, 1.3, 0.07, 0.6), band, [0, -0.5, -0.05], [0, 0, Math.PI])
  // Lying face up, as a watch is shown on a table.
  group.rotation.x = -1.1
  const outer = new THREE.Group()
  outer.add(group)
  return outer
}

function controller() {
  const group = new THREE.Group()
  const outline = new THREE.Shape()
  outline.moveTo(-0.6, 0.55)
  outline.lineTo(0.6, 0.55)
  outline.bezierCurveTo(1.1, 0.6, 1.35, 0.3, 1.4, -0.1)
  outline.bezierCurveTo(1.45, -0.6, 1.3, -1.0, 1.0, -1.0)
  outline.bezierCurveTo(0.75, -1.0, 0.65, -0.6, 0.45, -0.4)
  outline.lineTo(-0.45, -0.4)
  outline.bezierCurveTo(-0.65, -0.6, -0.75, -1.0, -1.0, -1.0)
  outline.bezierCurveTo(-1.3, -1.0, -1.45, -0.6, -1.4, -0.1)
  outline.bezierCurveTo(-1.35, 0.3, -1.1, 0.6, -0.6, 0.55)
  put(group, extruded(outline, 0.54, 0.13, 6), paint("#2f3138", { roughness: 0.55 }))
  const dark = paint("#17181c", { roughness: 0.5 })
  put(group, box(0.34, 0.11, 0.08, 0.02), dark, [-0.75, 0.1, 0.29])
  put(group, box(0.11, 0.34, 0.08, 0.02), dark, [-0.75, 0.1, 0.29])
  const buttons: [number, number, string][] = [
    [0.75, -0.08, "#3cb371"],
    [0.93, 0.1, "#e04848"],
    [0.57, 0.1, "#3f7fe0"],
    [0.75, 0.28, "#f2c230"],
  ]
  for (const [x, y, color] of buttons) {
    put(
      group,
      new THREE.CylinderGeometry(0.075, 0.075, 0.08, 24),
      paint(color, { roughness: 0.2 }),
      [x, y, 0.28],
      [Math.PI / 2, 0, 0],
    )
  }
  for (const x of [-0.35, 0.35]) {
    put(group, new THREE.CylinderGeometry(0.17, 0.17, 0.05, 32), dark, [x, -0.3, 0.27], [Math.PI / 2, 0, 0])
    put(group, new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16), dark, [x, -0.3, 0.33], [Math.PI / 2, 0, 0])
    put(
      group,
      new THREE.CylinderGeometry(0.15, 0.14, 0.06, 32),
      paint("#26272c", { roughness: 0.9 }),
      [x, -0.3, 0.42],
      [Math.PI / 2, 0, 0],
    )
  }
  for (const x of [-0.16, 0.16]) {
    put(group, box(0.12, 0.06, 0.04, 0.02), paint("#5c5f68", { roughness: 0.4 }), [x, 0.26, 0.28])
  }
  for (const x of [-0.85, 0.85]) {
    put(group, box(0.6, 0.12, 0.3, 0.05), paint("#43464f", { roughness: 0.45 }), [x, 0.6, -0.02])
  }
  return group
}

// ---------------------------------------------------------------------------------------------------------------
// Anatomy

function figure() {
  const group = new THREE.Group()
  const skin = paint("#e3b994", { roughness: 0.55 })
  const joint = paint("#d4a67f", { roughness: 0.5 })
  blob(group, 0.3, [0.85, 1.05, 0.95], skin, [0, 3.45, 0])
  rod(group, [0, 2.98, 0], [0, 3.22, 0], 0.1, skin)
  const torso = put(
    group,
    lathe([
      [0, 2.0],
      [0.38, 2.05],
      [0.4, 2.3],
      [0.35, 2.55],
      [0.45, 2.82],
      [0.52, 2.93],
      [0.42, 3.02],
      [0, 3.06],
    ]),
    skin,
  )
  torso.scale.z = 0.6
  blob(group, 0.4, [1, 0.55, 0.65], skin, [0, 1.95, 0])
  for (const side of [-1, 1]) {
    const shoulder: Vec = [side * 0.55, 2.88, 0]
    const elbow: Vec = [side * 0.72, 2.25, -0.02]
    const wrist: Vec = [side * 0.8, 1.68, 0.05]
    rod(group, shoulder, elbow, 0.09, skin, true)
    rod(group, elbow, wrist, 0.075, skin, true)
    for (const at of [shoulder, elbow]) {
      put(group, new THREE.SphereGeometry(0.1, 20, 14), joint, at)
    }
    blob(group, 0.1, [0.6, 1.1, 0.9], skin, [side * 0.82, 1.55, 0.06])
    const hip: Vec = [side * 0.2, 1.78, 0]
    const knee: Vec = [side * 0.22, 0.98, 0.02]
    const ankle: Vec = [side * 0.22, 0.17, 0]
    rod(group, hip, knee, 0.14, skin, true)
    rod(group, knee, ankle, 0.105, skin, true)
    put(group, new THREE.SphereGeometry(0.12, 20, 14), joint, knee)
    blob(group, 0.13, [0.9, 0.55, 2.0], skin, [side * 0.22, 0.07, 0.12])
  }
  return group
}

function heart() {
  const group = new THREE.Group()
  const muscle = paint("#b3262e", { roughness: 0.4 })
  const artery = paint("#cf3a3f", { roughness: 0.35 })
  const vein = paint("#4b63b8", { roughness: 0.4 })
  const shape = sculpt(64, 48, (point) => {
    const t = (1 - point.y) / 2
    point.x *= 1 - 0.55 * t * t
    point.z *= (1 - 0.5 * t * t) * 0.82
    point.y *= point.y < 0 ? 1.3 : 0.9
    point.x += -0.35 * t * t
  })
  put(group, shape, muscle)
  blob(group, 0.38, [1, 1.1, 0.9], paint("#a2232b", { roughness: 0.45 }), [0.62, 0.45, 0.05])
  blob(group, 0.34, [1.1, 0.9, 0.9], paint("#a2232b", { roughness: 0.45 }), [-0.32, 0.6, -0.35])
  hose(
    group,
    [
      [0.05, 0.4, 0],
      [0.05, 1.3, 0.05],
      [-0.15, 1.75, 0],
      [-0.55, 1.7, -0.1],
      [-0.75, 1.35, -0.3],
      [-0.72, 0.7, -0.5],
    ],
    0.2,
    artery,
  )
  for (const [from, to] of [
    [
      [-0.08, 1.75, 0.02],
      [0.02, 2.2, 0.04],
    ],
    [
      [-0.32, 1.8, -0.04],
      [-0.32, 2.27, -0.02],
    ],
    [
      [-0.54, 1.74, -0.12],
      [-0.68, 2.16, -0.12],
    ],
  ] as [Vec, Vec][]) {
    rod(group, from, to, 0.065, artery, true)
  }
  hose(
    group,
    [
      [0.22, 0.55, 0.4],
      [0.3, 1.1, 0.35],
      [0.15, 1.35, 0.1],
      [-0.2, 1.42, -0.15],
    ],
    0.16,
    vein,
  )
  hose(
    group,
    [
      [0.15, 1.3, 0.1],
      [0.6, 1.36, -0.1],
      [0.92, 1.25, -0.2],
    ],
    0.11,
    vein,
  )
  hose(
    group,
    [
      [0.62, 0.55, -0.1],
      [0.62, 1.65, -0.12],
    ],
    0.15,
    vein,
  )
  hose(
    group,
    [
      [0.05, 0.27, 0.72],
      [-0.1, -0.26, 0.64],
      [-0.26, -0.78, 0.43],
    ],
    0.035,
    paint("#e0525a", { roughness: 0.3 }),
  )
  group.rotation.z = 0.22
  const outer = new THREE.Group()
  outer.add(group)
  return outer
}

function brain() {
  const group = new THREE.Group()
  const tissue = paint("#e8a3a6", { roughness: 0.55 })
  for (const side of [-1, 1]) {
    const hemisphere = sculpt(128, 96, (point) => {
      const phase = side * 1.7
      const n =
        Math.sin(point.x * 9 + Math.sin(point.y * 7 + phase) * 1.5) +
        Math.sin(point.y * 8 + Math.sin(point.z * 6) * 1.5 + phase) +
        Math.sin(point.z * 9 + Math.sin(point.x * 5) * 1.5)
      const radius = 1 + 0.06 * Math.sqrt(Math.abs(n) / 3)
      point.multiplyScalar(radius)
      point.set(point.x * 0.62, point.y * 0.72, point.z * 1.05)
      if (point.x * side < 0) {
        point.x *= 0.3
      }
      if (point.y < -0.3) {
        point.y = -0.3 + (point.y + 0.3) * 0.6
      }
      point.x += side * 0.2
    })
    put(group, hemisphere, tissue)
  }
  const cerebellum = sculpt(64, 64, (point) => {
    point.multiplyScalar(1 + 0.05 * Math.abs(Math.sin(point.y * 26)))
    point.set(point.x * 0.62, point.y * 0.32, point.z * 0.42)
  })
  put(group, cerebellum, paint("#d98d93", { roughness: 0.6 }), [0, -0.52, -0.6])
  rod(group, [0, -0.35, -0.25], [0, -1.15, -0.42], 0.15, paint("#d7a1a0", { roughness: 0.55 }), false, 0.11)
  return group
}

function eye() {
  const group = new THREE.Group()
  const forward: Vec = [Math.PI / 2, 0, 0]
  put(group, new THREE.SphereGeometry(1, 64, 48), paint("#f4f1ec", { roughness: 0.25 }))
  const iris = drawn(256, 128, (context) => {
    const shade = context.createLinearGradient(0, 0, 0, 128)
    shade.addColorStop(0, "#1d3f58")
    shade.addColorStop(0.45, "#3d86b8")
    shade.addColorStop(0.85, "#2a6690")
    shade.addColorStop(1, "#0f2333")
    context.fillStyle = shade
    context.fillRect(0, 0, 256, 128)
    const random = seeded(7)
    for (let line = 0; line < 220; line += 1) {
      context.strokeStyle = random() > 0.5 ? "rgba(160,210,240,0.35)" : "rgba(10,30,50,0.35)"
      context.lineWidth = 1 + random() * 1.5
      const x = random() * 256
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x + (random() - 0.5) * 6, 110 + random() * 18)
      context.stroke()
    }
  })
  put(
    group,
    new THREE.SphereGeometry(1.003, 64, 12, 0, Math.PI * 2, 0, 0.42),
    paint(iris ? "#ffffff" : "#3d86b8", { roughness: 0.4, map: iris }),
    [0, 0, 0],
    forward,
  )
  put(
    group,
    new THREE.SphereGeometry(1.005, 48, 4, 0, Math.PI * 2, 0, 0.15),
    paint("#050608", { roughness: 0.2 }),
    [0, 0, 0],
    forward,
  )
  put(
    group,
    new THREE.SphereGeometry(0.5, 48, 24, 0, Math.PI * 2, 0, 1.05),
    paint("#ffffff", { roughness: 0.02, opacity: 0.22, reflection: 1 }),
    [0, 0, 0.55],
    forward,
  )
  rod(group, [0.12, 0, -0.85], [0.2, 0, -1.75], 0.17, paint("#f1d9b5", { roughness: 0.6 }))
  const muscle = paint("#b85450", { roughness: 0.75 })
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const points: Vec[] = Array.from({ length: 8 }, (_, index) => {
      const along = -2.6 + index * 0.2
      const radius = 1.015
      return [
        Math.cos(angle) * Math.sin(along) * -radius,
        Math.sin(angle) * Math.sin(along) * -radius,
        Math.cos(along) * radius,
      ]
    })
    put(group, tube(points, 0.055, 32, 10), muscle)
  }
  return group
}

function tooth() {
  const group = new THREE.Group()
  const enamel = paint("#f4eedd", { roughness: 0.22, reflection: 0.5 })
  const cusps: [number, number][] = [
    [0.25, 0.22],
    [-0.25, 0.22],
    [0.25, -0.22],
    [-0.25, -0.22],
  ]
  const crown = sculpt(64, 48, (point) => {
    const norm = Math.pow(point.x ** 4 + point.y ** 4 + point.z ** 4, 0.25)
    point.divideScalar(norm)
    point.set(point.x * 0.62, point.y * 0.45, point.z * 0.55)
    if (point.y > 0) {
      const bump = cusps.reduce((sum, [x, z]) => sum + Math.exp(-((point.x - x) ** 2 + (point.z - z) ** 2) / 0.03), 0)
      point.y += 0.14 * Math.min(1, bump) - 0.05
    } else {
      const narrow = 1 + point.y * 0.35
      point.x *= narrow
      point.z *= narrow
    }
  })
  put(group, crown, enamel, [0, 0.5, 0])
  const root = paint("#e8d9b8", { roughness: 0.55 })
  const profile = lathe([
    [0.0, -1.25],
    [0.06, -1.2],
    [0.12, -0.95],
    [0.17, -0.45],
    [0.2, 0.0],
    [0.0, 0.05],
  ])
  put(group, profile, root, [0.24, 0.25, 0.08], [0.1, 0, 0.14])
  put(group, profile, root, [-0.24, 0.25, 0.08], [0.1, 0, -0.14])
  put(group, profile, root, [0, 0.25, -0.2], [-0.16, 0, 0])
  return group
}

function bone() {
  const group = new THREE.Group()
  const material = paint("#eee3c6", { roughness: 0.65 })
  rod(group, [0, -1.45, 0], [0, 1.4, 0], 0.16, material, false, 0.14)
  rod(group, [0, 1.35, 0], [-0.36, 1.62, 0], 0.12, material)
  put(group, new THREE.SphereGeometry(0.25, 32, 24), material, [-0.43, 1.68, 0])
  blob(group, 0.2, [1, 1.35, 1], material, [0.13, 1.5, 0])
  blob(group, 0.26, [1.6, 0.8, 1.05], material, [0, -1.5, 0])
  for (const side of [-1, 1]) {
    blob(group, 0.24, [1, 1, 1.15], material, [side * 0.19, -1.62, 0.03])
  }
  return group
}

function lungs() {
  const group = new THREE.Group()
  const tissue = paint("#e58a93", { roughness: 0.7 })
  const airway = paint("#efd3c6", { roughness: 0.5 })
  for (const side of [-1, 1]) {
    const lobe = sculpt(64, 48, (point) => {
      point.multiplyScalar(1 + 0.012 * Math.sin(point.x * 23) * Math.sin(point.y * 19) * Math.sin(point.z * 21))
      if (point.y > 0) {
        point.x *= 1 - 0.35 * point.y
        point.z *= 1 - 0.3 * point.y
      }
      point.set(point.x * 0.55, point.y * 1.05, point.z * 0.5)
      if (point.x * side < 0) {
        point.x *= 0.45
      }
      if (point.y < -0.6) {
        point.y = -0.6 + (point.y + 0.6) * 0.35
      }
    })
    const mesh = put(group, lobe, tissue, [side * 0.62, 0, 0])
    mesh.scale.setScalar(side > 0 ? 1.05 : 1)
    hose(
      group,
      [
        [0, 0.78, 0],
        [side * 0.25, 0.58, 0],
        [side * 0.5, 0.3, 0],
      ],
      0.09,
      airway,
      24,
    )
  }
  rod(group, [0, 0.75, 0], [0, 1.75, 0], 0.14, airway)
  const ring = paint("#f7e6dd", { roughness: 0.45 })
  for (let y = 0.85; y < 1.75; y += 0.12) {
    put(group, new THREE.TorusGeometry(0.145, 0.025, 8, 32), ring, [0, y, 0], [Math.PI / 2, 0, 0])
  }
  return group
}

function dna() {
  const group = new THREE.Group()
  const height = 3
  const turns = 2.2
  const radius = 0.55
  const at = (t: number, offset: number): Vec => {
    const angle = t * turns * Math.PI * 2 + offset
    return [Math.cos(angle) * radius, t * height - height / 2, Math.sin(angle) * radius]
  }
  const strand = (offset: number) => Array.from({ length: 120 }, (_, index) => at(index / 119, offset))
  hose(group, strand(0), 0.07, paint("#2f6fd6", { roughness: 0.3 }), 240)
  hose(group, strand(Math.PI * 0.85), 0.07, paint("#e0533d", { roughness: 0.3 }), 240)
  const pairs = [
    ["#f2c230", "#3cb371"],
    ["#9b59b6", "#1abc9c"],
  ].map((colors) => colors.map((color) => paint(color, { roughness: 0.35 })))
  const random = seeded(11)
  for (let index = 1; index < 24; index += 1) {
    const t = index / 24
    const left = at(t, 0)
    const right = at(t, Math.PI * 0.85)
    const middle: Vec = [(left[0] + right[0]) / 2, left[1], (left[2] + right[2]) / 2]
    const pair = pairs[Math.floor(random() * 2)]!
    const flip = random() > 0.5 ? 1 : 0
    rod(group, left, middle, 0.035, pair[flip]!)
    rod(group, middle, right, 0.035, pair[1 - flip]!)
  }
  return group
}

function cell() {
  const group = new THREE.Group()
  put(
    group,
    new THREE.SphereGeometry(1, 64, 48, Math.PI, Math.PI * 1.5),
    paint("#f4b3c2", { roughness: 0.45, doubleSided: true }),
  )
  const wall = paint("#fbe1e7", { roughness: 0.8, doubleSided: true })
  put(group, new THREE.CircleGeometry(0.985, 64, -Math.PI / 2, Math.PI), wall, [0, 0, 0])
  put(group, new THREE.CircleGeometry(0.985, 64, -Math.PI / 2, Math.PI), wall, [0, 0, 0], [0, -Math.PI / 2, 0])
  put(group, new THREE.SphereGeometry(0.38, 40, 30), paint("#7b4fa8", { roughness: 0.4 }))
  put(group, new THREE.SphereGeometry(0.14, 24, 16), paint("#4a2a75", { roughness: 0.4 }), [0.16, 0.12, 0.2])
  const mitochondrion = paint("#f08c3a", { roughness: 0.45 })
  for (const [at, turn] of [
    [
      [-0.02, 0.5, 0.55],
      [0.4, 0, 1.2],
    ],
    [
      [0.55, -0.42, -0.02],
      [1.57, 0.3, 0.5],
    ],
    [
      [0.62, 0.35, -0.02],
      [1.57, 0, -0.7],
    ],
    [
      [-0.02, -0.55, 0.45],
      [0.2, 0, 0.4],
    ],
  ] as [Vec, Vec][]) {
    put(group, new THREE.CapsuleGeometry(0.075, 0.2, 8, 16), mitochondrion, at, turn)
  }
  const reticulum = paint("#5aa0d8", { roughness: 0.4 })
  for (const radius of [0.5, 0.58, 0.66]) {
    put(group, new THREE.TorusGeometry(radius, 0.025, 8, 48, Math.PI * 0.55), reticulum, [0, 0, 0], [0, 0, -0.2])
  }
  const golgi = paint("#f2c230", { roughness: 0.4 })
  for (let layer = 0; layer < 4; layer += 1) {
    put(
      group,
      new THREE.TorusGeometry(0.22 + layer * 0.06, 0.03, 8, 32, Math.PI * 0.7),
      golgi,
      [0, -0.62 + layer * 0.02, 0.38],
      [0, -Math.PI / 2, 0.9],
    )
  }
  const random = seeded(5)
  const dots: THREE.BufferGeometry[] = []
  for (let index = 0; index < 60; index += 1) {
    const angle = random() * Math.PI - Math.PI / 2
    const distance = 0.45 + random() * 0.48
    const onSide = random() > 0.5
    const y = Math.sin(angle) * distance
    const across = Math.cos(angle) * distance
    dots.push(new THREE.SphereGeometry(0.018, 8, 6).translate(onSide ? 0.005 : across, y, onSide ? across : 0.005))
  }
  put(group, mergeGeometries(dots), paint("#5b3f8c", { roughness: 0.5 }))
  return group
}

function neuron() {
  const group = new THREE.Group()
  const body = paint("#8e5cc7", { roughness: 0.4 })
  const random = seeded(3)
  put(
    group,
    sculpt(48, 32, (point) => point.multiplyScalar(0.35 * (1 + 0.08 * Math.sin(point.x * 7) * Math.sin(point.y * 5)))),
    body,
  )
  for (let branch = 0; branch < 7; branch += 1) {
    const angle = (branch / 7) * Math.PI * 2 + random() * 0.4
    const rise = 0.2 + random() * 0.9
    const direction = new THREE.Vector3(Math.cos(angle), rise, Math.sin(angle)).normalize()
    const points: Vec[] = [[direction.x * 0.25, direction.y * 0.25, direction.z * 0.25]]
    const length = 0.9 + random() * 0.5
    for (let step = 1; step <= 4; step += 1) {
      const along = 0.25 + (length * step) / 4
      points.push([
        direction.x * along + (random() - 0.5) * 0.15,
        direction.y * along + (random() - 0.5) * 0.15,
        direction.z * along + (random() - 0.5) * 0.15,
      ])
    }
    put(group, tube(points, 0.055, 24, 10), body)
    const end = points[points.length - 1]!
    for (let twig = 0; twig < 2; twig += 1) {
      const turn = (twig - 0.5) * 0.9
      hose(
        group,
        [
          end,
          [
            end[0] + direction.x * 0.25 + turn * direction.z * 0.3,
            end[1] + 0.2 + random() * 0.15,
            end[2] + direction.z * 0.25 - turn * direction.x * 0.3,
          ],
        ],
        0.025,
        body,
        8,
      )
    }
  }
  const axon: Vec[] = [
    [0, -0.3, 0],
    [0.1, -1.0, 0.05],
    [0.35, -1.7, 0.1],
    [0.55, -2.4, 0.15],
    [0.7, -2.9, 0.2],
  ]
  put(group, tube(axon, 0.05, 64, 10), body)
  const curve = new THREE.CatmullRomCurve3(axon.map((point) => new THREE.Vector3(...point)))
  const myelin = paint("#f3e3b6", { roughness: 0.5 })
  for (let segment = 0; segment < 5; segment += 1) {
    const from = curve.getPoint(0.14 + segment * 0.16)
    const to = curve.getPoint(0.24 + segment * 0.16)
    rod(group, from.toArray() as Vec, to.toArray() as Vec, 0.1, myelin, true)
  }
  const tip = axon[axon.length - 1]!
  for (let twig = 0; twig < 4; twig += 1) {
    const angle = (twig / 4) * Math.PI * 2
    const end: Vec = [tip[0] + Math.cos(angle) * 0.25, tip[1] - 0.25, tip[2] + Math.sin(angle) * 0.25]
    put(group, tube([tip, end], 0.025, 6, 8), body)
    put(group, new THREE.SphereGeometry(0.06, 16, 12), body, end)
  }
  return group
}

// ---------------------------------------------------------------------------------------------------------------
// Furniture

function chair() {
  const group = new THREE.Group()
  const wood = paint("#a8703f", { roughness: 0.55 })
  put(group, box(1.0, 0.08, 0.95, 0.03), wood, [0, 0.95, 0])
  put(group, box(0.92, 0.08, 0.86, 0.04), paint("#3e6a8a", { roughness: 0.9 }), [0, 1.03, 0.02])
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.4, 0.4]) {
      rod(group, [x, 0, z], [x, 0.92, z], 0.035, wood, false, 0.045)
    }
    rod(group, [x, 0.3, -0.4], [x, 0.3, 0.4], 0.02, wood)
    put(group, box(0.07, 1.0, 0.07, 0.02), wood, [x, 1.45, -0.43], [-0.08, 0, 0])
  }
  put(group, box(0.92, 0.16, 0.06, 0.03), wood, [0, 1.88, -0.47], [-0.08, 0, 0])
  for (const x of [-0.2, 0, 0.2]) {
    put(group, box(0.06, 0.62, 0.03, 0.01), wood, [x, 1.5, -0.45], [-0.08, 0, 0])
  }
  return group
}

function armchair() {
  const group = new THREE.Group()
  const fabric = paint("#2f6f73", { roughness: 0.92 })
  const legs = paint("#5b3a24", { roughness: 0.5 })
  put(group, box(1.6, 0.45, 1.4, 0.08), fabric, [0, 0.5, 0])
  put(group, box(1.2, 0.2, 1.1, 0.1), fabric, [0, 0.82, 0.08])
  put(group, box(1.6, 0.95, 0.3, 0.12), fabric, [0, 1.15, -0.55], [-0.12, 0, 0])
  put(group, box(1.15, 0.7, 0.22, 0.1), fabric, [0, 1.15, -0.36], [-0.12, 0, 0])
  for (const side of [-1, 1]) {
    put(group, box(0.22, 0.55, 1.4, 0.1), fabric, [side * 0.75, 0.95, 0])
    for (const z of [-0.58, 0.58]) {
      rod(group, [side * 0.7, 0, z * 1.05], [side * 0.66, 0.3, z], 0.035, legs, false, 0.05)
    }
  }
  return group
}

function sofa() {
  const group = new THREE.Group()
  const fabric = paint("#7d8a99", { roughness: 0.92 })
  const legs = paint("#2b2b2b", { metalness: 0.6, roughness: 0.4 })
  put(group, box(3.0, 0.45, 1.3, 0.08), fabric, [0, 0.5, 0])
  put(group, box(3.0, 0.9, 0.3, 0.12), fabric, [0, 1.1, -0.5], [-0.1, 0, 0])
  for (const side of [-1, 1]) {
    put(group, box(1.4, 0.22, 1.0, 0.1), fabric, [side * 0.72, 0.83, 0.1])
    put(group, box(1.38, 0.65, 0.25, 0.12), fabric, [side * 0.72, 1.15, -0.3], [-0.12, 0, 0])
    put(group, box(0.26, 0.65, 1.3, 0.1), fabric, [side * 1.6, 0.92, 0])
    for (const z of [-0.5, 0.5]) {
      rod(group, [side * 1.55, 0, z], [side * 1.55, 0.27, z], 0.035, legs, false, 0.045)
    }
  }
  put(group, box(0.45, 0.45, 0.15, 0.12), paint("#d9a43c", { roughness: 0.9 }), [-1.15, 1.08, -0.12], [-0.2, 0.3, 0.15])
  return group
}

function table() {
  const group = new THREE.Group()
  const wood = paint("#8b5a2b", { roughness: 0.45 })
  put(group, box(3.0, 0.1, 1.6, 0.03), wood, [0, 1.5, 0])
  put(group, box(2.7, 0.16, 1.3, 0.01), wood, [0, 1.37, 0])
  for (const x of [-1.3, 1.3]) {
    for (const z of [-0.62, 0.62]) {
      put(group, box(0.12, 1.42, 0.12, 0.02), wood, [x, 0.71, z])
    }
  }
  return group
}

function desk() {
  const group = new THREE.Group()
  const top = paint("#c8a27a", { roughness: 0.45 })
  const white = paint("#ececec", { roughness: 0.5 })
  const handle = paint("#9aa0a8", { metalness: 0.85, roughness: 0.3 })
  put(group, box(3.2, 0.08, 1.4, 0.02), top, [0, 1.5, 0])
  put(group, box(0.9, 1.46, 1.3, 0.02), white, [-1.1, 0.73, 0])
  for (let drawer = 0; drawer < 3; drawer += 1) {
    const y = 0.28 + drawer * 0.46
    put(group, box(0.84, 0.42, 0.03, 0.015), paint("#f7f7f7", { roughness: 0.4 }), [-1.1, y, 0.66])
    put(group, box(0.4, 0.03, 0.04, 0.012), handle, [-1.1, y + 0.12, 0.69])
  }
  put(group, box(0.08, 1.46, 1.3, 0.02), white, [1.52, 0.73, 0])
  put(group, box(2.2, 0.6, 0.04, 0.01), white, [0.45, 1.15, -0.6])
  return group
}

function officeChair() {
  const group = new THREE.Group()
  const black = paint("#26282c", { roughness: 0.55 })
  const metal = paint("#b9bcc2", { metalness: 0.9, roughness: 0.25 })
  for (let arm = 0; arm < 5; arm += 1) {
    const angle = (arm / 5) * Math.PI * 2 + Math.PI / 2
    put(
      group,
      box(0.75, 0.07, 0.12, 0.03),
      black,
      [Math.cos(angle) * 0.38, 0.18, Math.sin(angle) * 0.38],
      [0, -angle, 0],
    )
    put(group, new THREE.SphereGeometry(0.07, 16, 12), black, [Math.cos(angle) * 0.74, 0.07, Math.sin(angle) * 0.74])
  }
  put(group, new THREE.CylinderGeometry(0.1, 0.12, 0.12, 24), black, [0, 0.2, 0])
  put(group, new THREE.CylinderGeometry(0.065, 0.065, 0.28, 20), black, [0, 0.38, 0])
  put(group, new THREE.CylinderGeometry(0.045, 0.045, 0.32, 20), metal, [0, 0.62, 0])
  put(group, box(1.0, 0.14, 0.95, 0.06), black, [0, 0.82, 0])
  put(group, box(0.95, 0.1, 0.9, 0.05), paint("#3a3d44", { roughness: 0.9 }), [0, 0.92, 0.02])
  put(group, box(0.12, 0.6, 0.06, 0.02), black, [0, 1.05, -0.47])
  put(group, box(0.92, 1.05, 0.1, 0.05), paint("#3a3d44", { roughness: 0.92 }), [0, 1.55, -0.5], [-0.1, 0, 0])
  for (const side of [-1, 1]) {
    put(group, box(0.06, 0.32, 0.06, 0.02), black, [side * 0.52, 0.98, -0.05])
    put(group, box(0.1, 0.05, 0.42, 0.025), black, [side * 0.52, 1.16, -0.02])
  }
  return group
}

function bed() {
  const group = new THREE.Group()
  const wood = paint("#6e4a2f", { roughness: 0.5 })
  put(group, box(2.0, 0.3, 3.0, 0.03), wood, [0, 0.35, 0])
  for (const x of [-0.93, 0.93]) {
    for (const z of [-1.43, 1.43]) {
      put(group, box(0.1, 0.22, 0.1, 0.02), wood, [x, 0.1, z])
    }
  }
  put(group, box(2.1, 1.3, 0.1, 0.04), wood, [0, 0.95, -1.5])
  put(group, box(1.9, 0.3, 2.9, 0.08), paint("#f2f1ee", { roughness: 0.9 }), [0, 0.65, 0])
  put(group, box(1.96, 0.06, 1.95, 0.03), paint("#4b6ea8", { roughness: 0.9 }), [0, 0.82, 0.48])
  put(group, box(1.96, 0.07, 0.25, 0.03), paint("#f7f7f5", { roughness: 0.9 }), [0, 0.83, -0.46])
  for (const x of [-0.45, 0.45]) {
    put(group, box(0.8, 0.18, 0.5, 0.09), paint("#fafafa", { roughness: 0.9 }), [x, 0.9, -1.2], [-0.15, 0, 0])
  }
  return group
}

function bookshelf() {
  const group = new THREE.Group()
  const wood = paint("#9a6b3f", { roughness: 0.55 })
  for (const x of [-0.97, 0.97]) {
    put(group, box(0.06, 2.6, 0.7, 0.01), wood, [x, 1.3, 0])
  }
  for (const y of [0.03, 2.57]) {
    put(group, box(2.0, 0.06, 0.7, 0.01), wood, [0, y, 0])
  }
  for (const y of [0.65, 1.3, 1.95]) {
    put(group, box(1.88, 0.04, 0.66, 0.005), wood, [0, y, 0])
  }
  put(group, box(1.94, 2.54, 0.02, 0.005), paint("#b88a5c", { roughness: 0.6 }), [0, 1.3, -0.34])
  const colours = ["#b03a2e", "#1f618d", "#117864", "#b9770e", "#6c3483", "#2e4053", "#d4ac0d", "#a04000"].map(
    (color) => paint(color, { roughness: 0.6 }),
  )
  const random = seeded(19)
  for (const floor of [0.06, 0.67, 1.32, 1.97]) {
    let x = -0.9
    while (x < 0.85) {
      const width = 0.06 + random() * 0.07
      const height = 0.36 + random() * 0.18
      if (random() < 0.08) {
        x += 0.12
        continue
      }
      const leaning = x > 0.6 && random() < 0.5
      put(
        group,
        box(width, height, 0.42 + random() * 0.12, 0.008),
        colours[Math.floor(random() * colours.length)]!,
        [x + width / 2 + (leaning ? 0.08 : 0), floor + height / 2 - (leaning ? 0.02 : 0), 0.02],
        [0, 0, leaning ? -0.28 : 0],
      )
      x += width + 0.005
      if (leaning) {
        break
      }
    }
  }
  return group
}

function floorLamp() {
  const group = new THREE.Group()
  const brass = paint("#b8955a", { metalness: 0.85, roughness: 0.3 })
  put(
    group,
    new THREE.CylinderGeometry(0.42, 0.45, 0.07, 48),
    paint("#2f2f33", { metalness: 0.6, roughness: 0.35 }),
    [0, 0.035, 0],
  )
  put(group, new THREE.CylinderGeometry(0.028, 0.028, 2.9, 16), brass, [0, 1.5, 0])
  put(
    group,
    new THREE.CylinderGeometry(0.42, 0.62, 0.7, 48, 1, true),
    paint("#f1e6d0", { roughness: 0.9, glow: "#ffe2a8", glowStrength: 0.25, doubleSided: true }),
    [0, 3.15, 0],
  )
  put(group, new THREE.TorusGeometry(0.42, 0.012, 8, 48), brass, [0, 3.5, 0], [Math.PI / 2, 0, 0])
  put(group, new THREE.TorusGeometry(0.62, 0.012, 8, 48), brass, [0, 2.8, 0], [Math.PI / 2, 0, 0])
  put(
    group,
    new THREE.SphereGeometry(0.12, 24, 16),
    paint("#fff6dc", { glow: "#fff2c8", glowStrength: 1 }),
    [0, 3.05, 0],
  )
  return group
}

function barStool() {
  const group = new THREE.Group()
  const metal = paint("#2f3035", { metalness: 0.7, roughness: 0.35 })
  put(group, new THREE.CylinderGeometry(0.44, 0.42, 0.1, 48), paint("#a8703f", { roughness: 0.5 }), [0, 1.98, 0])
  put(group, new THREE.CylinderGeometry(0.4, 0.43, 0.08, 48), paint("#2f2f33", { roughness: 0.8 }), [0, 2.07, 0])
  for (let leg = 0; leg < 4; leg += 1) {
    const angle = Math.PI / 4 + (leg * Math.PI) / 2
    rod(
      group,
      [Math.cos(angle) * 0.3, 1.93, Math.sin(angle) * 0.3],
      [Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5],
      0.03,
      metal,
    )
  }
  put(group, new THREE.TorusGeometry(0.43, 0.022, 10, 48), metal, [0, 0.7, 0], [Math.PI / 2, 0, 0])
  return group
}

// ---------------------------------------------------------------------------------------------------------------
// Symbols

const SYMBOL_DEPTH = 0.36

function polygon(points: [number, number][]) {
  const shape = new THREE.Shape()
  shape.moveTo(...points[0]!)
  points.slice(1).forEach((point) => shape.lineTo(...point))
  shape.closePath()
  return shape
}

function badge(shape: THREE.Shape, color: string, look: Look = { roughness: 0.2 }, bevel = 0.08) {
  const group = new THREE.Group()
  put(group, extruded(shape, SYMBOL_DEPTH, bevel, 5), paint(color, look))
  return group
}

function star() {
  const points = Array.from({ length: 10 }, (_, index): [number, number] => {
    const angle = Math.PI / 2 + (index * Math.PI) / 5
    const radius = index % 2 ? 0.42 : 1
    return [Math.cos(angle) * radius, Math.sin(angle) * radius]
  })
  return badge(polygon(points), "#f5b301", { metalness: 0.55, roughness: 0.25 })
}

function heartSymbol() {
  const shape = new THREE.Shape()
  shape.moveTo(0, -1)
  shape.bezierCurveTo(-0.5, -0.55, -1.1, -0.15, -1.1, 0.35)
  shape.bezierCurveTo(-1.1, 0.8, -0.75, 1.05, -0.5, 1.05)
  shape.bezierCurveTo(-0.25, 1.05, -0.05, 0.9, 0, 0.6)
  shape.bezierCurveTo(0.05, 0.9, 0.25, 1.05, 0.5, 1.05)
  shape.bezierCurveTo(0.75, 1.05, 1.1, 0.8, 1.1, 0.35)
  shape.bezierCurveTo(1.1, -0.15, 0.5, -0.55, 0, -1)
  return badge(shape, "#e0263a", { roughness: 0.18 }, 0.16)
}

function check() {
  return badge(
    polygon([
      [-1, 0.1],
      [-0.65, 0.45],
      [-0.3, 0.1],
      [0.65, 1.05],
      [1.0, 0.7],
      [-0.3, -0.6],
    ]),
    "#22a352",
  )
}

function cross() {
  const w = 0.3
  const plus: [number, number][] = [
    [-w, 1],
    [w, 1],
    [w, w],
    [1, w],
    [1, -w],
    [w, -w],
    [w, -1],
    [-w, -1],
    [-w, -w],
    [-1, -w],
    [-1, w],
    [-w, w],
  ]
  const turn = Math.PI / 4
  return badge(
    polygon(plus.map(([x, y]) => [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)])),
    "#d93838",
  )
}

function arrow() {
  return badge(
    polygon([
      [-1, 0.25],
      [0.2, 0.25],
      [0.2, 0.65],
      [1, 0],
      [0.2, -0.65],
      [0.2, -0.25],
      [-1, -0.25],
    ]),
    "#1f78d1",
  )
}

function lightning() {
  return badge(
    polygon([
      [0.2, 1.0],
      [-0.5, -0.1],
      [0.0, -0.1],
      [-0.3, -1.0],
      [0.6, 0.25],
      [0.1, 0.25],
      [0.45, 1.0],
    ]),
    "#ffc21a",
    { roughness: 0.25, metalness: 0.2 },
  )
}

function question() {
  const group = new THREE.Group()
  const material = paint("#7b4fd6", { roughness: 0.2 })
  hose(
    group,
    [
      [-0.45, 0.55, 0],
      [-0.35, 0.95, 0],
      [0, 1.1, 0],
      [0.38, 0.95, 0],
      [0.45, 0.6, 0],
      [0.25, 0.3, 0],
      [0.02, 0.1, 0],
      [0, -0.25, 0],
    ],
    0.17,
    material,
  )
  put(group, new THREE.SphereGeometry(0.21, 32, 24), material, [0, -0.72, 0])
  return group
}

function exclamation() {
  const group = new THREE.Group()
  const material = paint("#f28c1c", { roughness: 0.2 })
  rod(group, [0, -0.3, 0], [0, 1.0, 0], 0.13, material, false, 0.22)
  put(group, new THREE.SphereGeometry(0.22, 32, 24), material, [0, 1.0, 0])
  put(group, new THREE.SphereGeometry(0.13, 32, 24), material, [0, -0.3, 0])
  put(group, new THREE.SphereGeometry(0.21, 32, 24), material, [0, -0.75, 0])
  return group
}

function pin() {
  const group = new THREE.Group()
  const profile: [number, number][] = [[0, -1]]
  for (let step = 0; step <= 24; step += 1) {
    const angle = -0.9 + ((Math.PI / 2 + 0.9) * step) / 24
    profile.push([Math.max(0.0001, 0.6 * Math.cos(angle)), 0.5 + 0.6 * Math.sin(angle)])
  }
  profile.push([0, 1.1])
  put(group, lathe(profile, 64), paint("#e53935", { roughness: 0.2 }))
  blob(group, 0.24, [1, 1, 0.4], paint("#ffffff", { roughness: 0.3 }), [0, 0.55, 0.56])
  return group
}

function gear() {
  const shape = new THREE.Shape()
  const teeth = 12
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const base = (tooth / teeth) * Math.PI * 2
    const step = (Math.PI * 2) / teeth
    const points: [number, number, number][] = [
      [0.8, base, 0],
      [1.0, base + step * 0.12, 0],
      [1.0, base + step * 0.42, 0],
      [0.8, base + step * 0.54, 0],
    ]
    points.forEach(([radius, angle], index) => {
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (tooth === 0 && index === 0) {
        shape.moveTo(x, y)
      } else {
        shape.lineTo(x, y)
      }
    })
    shape.absarc(0, 0, 0.8, base + step * 0.54, base + step, false)
  }
  const hole = new THREE.Path()
  hole.absarc(0, 0, 0.3, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return badge(shape, "#9aa3ad", { metalness: 0.85, roughness: 0.3 }, 0.04)
}

function bulb() {
  const group = new THREE.Group()
  put(
    group,
    lathe(
      [
        [0.0001, 1.45],
        [0.35, 1.4],
        [0.6, 1.15],
        [0.68, 0.85],
        [0.6, 0.5],
        [0.4, 0.15],
        [0.3, -0.1],
        [0.3, -0.15],
      ],
      64,
    ),
    paint("#fff6d5", {
      roughness: 0.05,
      opacity: 0.45,
      glow: "#ffe9a8",
      glowStrength: 0.35,
      reflection: 1,
      doubleSided: true,
    }),
  )
  const metal = paint("#b8b8b8", { metalness: 0.9, roughness: 0.3 })
  put(group, new THREE.CylinderGeometry(0.3, 0.27, 0.45, 32), metal, [0, -0.38, 0])
  for (const y of [-0.2, -0.32, -0.44, -0.56]) {
    put(group, new THREE.TorusGeometry(0.29, 0.03, 8, 32), metal, [0, y, 0], [Math.PI / 2, 0, 0])
  }
  put(group, new THREE.CylinderGeometry(0.14, 0.1, 0.12, 24), paint("#2b2b2e", { roughness: 0.6 }), [0, -0.66, 0])
  const glow = paint("#ffb02e", { glow: "#ffb02e", glowStrength: 1.2 })
  const coil: Vec[] = Array.from({ length: 40 }, (_, index) => {
    const t = index / 39
    return [-0.16 + t * 0.32, 0.75 + Math.sin(t * Math.PI * 8) * 0.05, Math.cos(t * Math.PI * 8) * 0.05]
  })
  put(group, tube(coil, 0.012, 120, 6), glow)
  const wire = paint("#8a8a8a", { metalness: 0.8, roughness: 0.4 })
  rod(group, [-0.1, -0.12, 0], [-0.16, 0.75, 0], 0.01, wire)
  rod(group, [0.1, -0.12, 0], [0.16, 0.75, 0], 0.01, wire)
  return group
}

function trophy() {
  const group = new THREE.Group()
  const gold = paint("#e2b13c", { metalness: 0.9, roughness: 0.25 })
  put(
    group,
    lathe(
      [
        [0.0001, 0.25],
        [0.2, 0.27],
        [0.42, 0.45],
        [0.6, 0.85],
        [0.7, 1.35],
        [0.74, 1.55],
        [0.68, 1.55],
        [0.64, 1.37],
        [0.55, 0.9],
        [0.38, 0.55],
        [0.0001, 0.45],
      ],
      64,
    ),
    gold,
  )
  put(group, new THREE.TorusGeometry(0.3, 0.055, 12, 32, Math.PI), gold, [0.62, 1.05, 0], [0, 0, -Math.PI / 2])
  put(group, new THREE.TorusGeometry(0.3, 0.055, 12, 32, Math.PI), gold, [-0.62, 1.05, 0], [0, 0, Math.PI / 2])
  rod(group, [0, -0.15, 0], [0, 0.28, 0], 0.13, gold, false, 0.08)
  put(group, new THREE.SphereGeometry(0.14, 24, 16), gold, [0, 0.12, 0])
  put(group, box(0.7, 0.1, 0.7, 0.02), gold, [0, -0.2, 0])
  put(group, box(1.0, 0.38, 1.0, 0.03), paint("#3b2a20", { roughness: 0.5 }), [0, -0.44, 0])
  put(group, box(0.5, 0.16, 0.02, 0.005), gold, [0, -0.44, 0.505])
  return group
}

// ---------------------------------------------------------------------------------------------------------------

const BUILDERS: Record<string, () => THREE.Object3D> = {
  laptop,
  phone,
  tablet,
  monitor,
  keyboard,
  headphones,
  camera,
  speaker,
  watch,
  controller,
  figure,
  heart,
  brain,
  eye,
  tooth,
  bone,
  lungs,
  dna,
  cell,
  neuron,
  chair,
  armchair,
  sofa,
  table,
  desk,
  "office-chair": officeChair,
  bed,
  bookshelf,
  "floor-lamp": floorLamp,
  "bar-stool": barStool,
  star,
  "heart-symbol": heartSymbol,
  check,
  cross,
  arrow,
  question,
  exclamation,
  lightning,
  pin,
  gear,
  bulb,
  trophy,
}

/** The ids documents made before the stock grew name, each shown as the model that took its place. */
const EARLIER: Record<string, string> = { electronics: "tablet", anatomy: "figure", furniture: "chair", symbol: "star" }

export const STOCK_MODEL_IDS = Object.keys(BUILDERS)

const PRIMITIVE_COLOR = "#0f6cbd"

function primitive(preset: string) {
  switch (preset) {
    case "sphere":
      return new THREE.SphereGeometry(1, 32, 24)
    case "cylinder":
      return new THREE.CylinderGeometry(0.7, 0.7, 1.4, 32)
    case "cone":
      return new THREE.ConeGeometry(0.9, 1.5, 32)
    case "torus":
      return new THREE.TorusGeometry(0.7, 0.28, 16, 48)
    case "cube":
      return new THREE.BoxGeometry(1.2, 1.2, 1.2)
    default:
      return null
  }
}

/** How far a stock model reaches from its middle, the same for every model, so each fills the view alike. */
const STOCK_REACH = 1.35

/** The model a preset names, centred on its middle; an unknown preset is the cube. */
export function stockModel(preset: string): THREE.Object3D {
  const build = BUILDERS[EARLIER[preset] ?? preset]
  if (!build) {
    const geometry = primitive(preset) ?? primitive("cube")!
    return new THREE.Mesh(geometry, paint(PRIMITIVE_COLOR, { roughness: 0.45, metalness: 0.2, reflection: 0.12 }))
  }
  const inner = build()
  const bounds = new THREE.Box3().setFromObject(inner)
  const reach = bounds.getSize(new THREE.Vector3()).length() / 2
  const scale = STOCK_REACH / Math.max(reach, 0.001)
  inner.scale.multiplyScalar(scale)
  inner.position.copy(bounds.getCenter(new THREE.Vector3()).multiplyScalar(-scale))
  const outer = new THREE.Group()
  outer.add(inner)
  return outer
}

/** Free the geometry, materials and pictures of a model no longer shown. */
export function disposeModel(root: THREE.Object3D) {
  root.traverse((part) => {
    const mesh = part as THREE.Mesh
    if (!mesh.isMesh) {
      return
    }
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      ;(material as THREE.MeshStandardMaterial).map?.dispose()
      material.dispose()
    }
  })
}

const pictureCache = new Map<string, string>()

/**
 * Pictures of stock models for the library's tiles, drawn as the model first shows on the page (same light, camera
 * and pose). One renderer draws them all and is let go afterwards; each picture is kept for the session.
 */
export function stockPictures(presets: string[], width = 240, height = 180): Record<string, string> {
  const missing = presets.filter((preset) => !pictureCache.has(preset))
  if (missing.length) {
    const canvas = document.createElement("canvas")
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    const scene = new THREE.Scene()
    const environment = new THREE.PMREMGenerator(renderer)
    scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture
    environment.dispose()
    const light = new THREE.DirectionalLight(0xffffff, 1.15)
    const place = lightPosition(DEFAULT_MODEL_FORMAT.direction, DEFAULT_MODEL_FORMAT.elevation)
    light.position.set(place.x, place.y, place.z)
    const fill = new THREE.DirectionalLight(0xffffff, 0.25)
    fill.position.set(-place.x, Math.max(1, place.y / 2), -place.z)
    scene.add(light, fill, new THREE.AmbientLight(0xffffff, 0.55))
    const view = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
    view.position.set(2.2, 1.6, 2.4)
    view.lookAt(0, 0, 0)
    for (const preset of missing) {
      const model = stockModel(preset)
      model.rotation.order = "YXZ"
      model.rotation.set(0.3, 0.45, 0)
      scene.add(model)
      renderer.render(scene, view)
      pictureCache.set(preset, canvas.toDataURL("image/png"))
      scene.remove(model)
      disposeModel(model)
    }
    scene.environment?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
  return Object.fromEntries(presets.map((preset) => [preset, pictureCache.get(preset) ?? ""]))
}
