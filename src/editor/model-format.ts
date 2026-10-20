/**
 * How a 3D model looks: its colour, the light on it, what its surface is like and an optional texture. Kept on the
 * model node, so the snapshot shown in print and saved in .docx shows it too.
 */

export type ModelMaterial = "matte" | "standard" | "glossy" | "metal"
export type ModelLighting = "studio" | "bright" | "soft" | "dramatic" | "warm" | "cool"
export type BuiltInTexture = "wood" | "metal" | "marble" | "fabric" | "paper" | "stone"

export type ModelFormat = {
  /** "" keeps the model's own colours. */
  color: string
  /** Tint multiplies the model's colours by the colour; Replace paints it in the colour. */
  colorMode: "tint" | "replace"
  material: ModelMaterial
  lighting: ModelLighting
  /** Brightness of the light, in percent. */
  intensity: number
  /** Where the main light comes from, in degrees around the model (0 is from the front, 90 from the right). */
  direction: number
  /** How high the main light is, in degrees above the model. */
  elevation: number
  /** "" for none, a built-in texture's id, or a picture as a data URL. */
  texture: string
  /** How many times the texture repeats across the model. */
  textureScale: number
}

export const DEFAULT_MODEL_FORMAT: ModelFormat = {
  color: "",
  colorMode: "tint",
  material: "standard",
  lighting: "studio",
  intensity: 100,
  direction: 35,
  elevation: 45,
  texture: "",
  textureScale: 1,
}

/** `reflection` is how strongly the surface reflects the room around it. */
export const MODEL_MATERIALS: {
  id: ModelMaterial
  label: string
  roughness: number
  metalness: number
  reflection: number
}[] = [
  { id: "matte", label: "Matte", roughness: 0.95, metalness: 0, reflection: 0.05 },
  { id: "standard", label: "Standard", roughness: 0.45, metalness: 0.2, reflection: 0.12 },
  { id: "glossy", label: "Glossy", roughness: 0.12, metalness: 0.05, reflection: 0.7 },
  { id: "metal", label: "Metal", roughness: 0.3, metalness: 0.9, reflection: 1 },
]

export type LightingPreset = {
  id: ModelLighting
  label: string
  /** The main light's colour and strength. */
  key: string
  keyIntensity: number
  /** The light from all around. */
  ambient: string
  ambientIntensity: number
  /** A weaker light from the other side, softening the shadows. */
  fillIntensity: number
}

export const MODEL_LIGHTINGS: LightingPreset[] = [
  {
    id: "studio",
    label: "Studio",
    key: "#ffffff",
    keyIntensity: 1.15,
    ambient: "#ffffff",
    ambientIntensity: 0.55,
    fillIntensity: 0.25,
  },
  {
    id: "bright",
    label: "Bright",
    key: "#ffffff",
    keyIntensity: 1.5,
    ambient: "#ffffff",
    ambientIntensity: 0.9,
    fillIntensity: 0.5,
  },
  {
    id: "soft",
    label: "Soft",
    key: "#fffaf2",
    keyIntensity: 0.7,
    ambient: "#ffffff",
    ambientIntensity: 0.95,
    fillIntensity: 0.45,
  },
  {
    id: "dramatic",
    label: "Dramatic",
    key: "#ffffff",
    keyIntensity: 2.1,
    ambient: "#20242c",
    ambientIntensity: 0.25,
    fillIntensity: 0,
  },
  {
    id: "warm",
    label: "Warm",
    key: "#ffc98a",
    keyIntensity: 1.3,
    ambient: "#ffe2c2",
    ambientIntensity: 0.55,
    fillIntensity: 0.2,
  },
  {
    id: "cool",
    label: "Cool",
    key: "#bcd8ff",
    keyIntensity: 1.3,
    ambient: "#d8e6ff",
    ambientIntensity: 0.6,
    fillIntensity: 0.25,
  },
]

export const BUILT_IN_TEXTURES: { id: BuiltInTexture; label: string }[] = [
  { id: "wood", label: "Wood" },
  { id: "metal", label: "Brushed Metal" },
  { id: "marble", label: "Marble" },
  { id: "fabric", label: "Fabric" },
  { id: "paper", label: "Paper" },
  { id: "stone", label: "Stone" },
]

const MATERIAL_IDS = new Set(MODEL_MATERIALS.map((item) => item.id))
const LIGHTING_IDS = new Set(MODEL_LIGHTINGS.map((item) => item.id))
const TEXTURE_IDS = new Set<string>(BUILT_IN_TEXTURES.map((item) => item.id))

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

/** The format kept in a model node's attributes, with anything unknown or out of range set back to the default. */
export function modelFormat(attrs: Record<string, unknown>): ModelFormat {
  const color = typeof attrs.color === "string" && /^#[0-9a-f]{6}$/i.test(attrs.color) ? attrs.color : ""
  const texture = typeof attrs.texture === "string" ? attrs.texture : ""
  return {
    color,
    colorMode: attrs.colorMode === "replace" ? "replace" : "tint",
    material: MATERIAL_IDS.has(attrs.material as ModelMaterial)
      ? (attrs.material as ModelMaterial)
      : DEFAULT_MODEL_FORMAT.material,
    lighting: LIGHTING_IDS.has(attrs.lighting as ModelLighting)
      ? (attrs.lighting as ModelLighting)
      : DEFAULT_MODEL_FORMAT.lighting,
    intensity: Math.round(clamp(attrs.intensity, 0, 200, DEFAULT_MODEL_FORMAT.intensity)),
    direction: Math.round(clamp(attrs.direction, 0, 360, DEFAULT_MODEL_FORMAT.direction)),
    elevation: Math.round(clamp(attrs.elevation, -30, 90, DEFAULT_MODEL_FORMAT.elevation)),
    texture: TEXTURE_IDS.has(texture) || texture.startsWith("data:image/") ? texture : "",
    textureScale: clamp(attrs.textureScale, 0.25, 8, DEFAULT_MODEL_FORMAT.textureScale),
  }
}

export function isBuiltInTexture(texture: string): texture is BuiltInTexture {
  return TEXTURE_IDS.has(texture)
}

/** Where the main light sits for a direction and height, on a sphere of `radius` around the model. */
export function lightPosition(direction: number, elevation: number, radius = 5) {
  const around = (direction * Math.PI) / 180
  const up = (elevation * Math.PI) / 180
  return {
    x: Math.sin(around) * Math.cos(up) * radius,
    y: Math.sin(up) * radius,
    z: Math.cos(around) * Math.cos(up) * radius,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Built-in textures, drawn in the app so they need no files and look the same everywhere
// ---------------------------------------------------------------------------------------------------------------

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth noise that wraps every `period` cells, so the texture tiles without seams. */
function noise(x: number, y: number, period: number, seed: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const at = (cx: number, cy: number) =>
    hash(((cx % period) + period) % period, ((cy % period) + period) % period, seed)
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
  return top + (bottom - top) * sy
}

function fbm(x: number, y: number, period: number, seed: number, octaves = 4) {
  let sum = 0
  let amplitude = 0.5
  let scale = 1
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * noise(x * scale, y * scale, period * scale, seed + octave)
    amplitude /= 2
    scale *= 2
  }
  return sum / (1 - 2 ** -octaves)
}

type Rgb = [number, number, number]

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

/** The colour of each built-in texture at (u, v), both from 0 to 1. */
const PAINTERS: Record<BuiltInTexture, (u: number, v: number) => Rgb> = {
  wood: (u, v) => {
    const grain = fbm(u * 4, v * 16, 4, 11) * 6
    const rings = (Math.sin((u * 8 + grain) * Math.PI * 2) + 1) / 2
    const fibre = noise(u * 2, v * 128, 128, 12) * 0.25
    return mix([150, 98, 56], [94, 56, 28], rings * 0.75 + fibre)
  },
  metal: (u, v) => {
    const streak = noise(u * 2, v * 256, 256, 21) * 0.6 + noise(u * 16, v * 64, 64, 22) * 0.4
    return mix([150, 154, 160], [214, 218, 224], streak)
  },
  marble: (u, v) => {
    const turbulence = fbm(u * 4, v * 4, 4, 31, 5) * 5
    const vein = Math.abs(Math.sin((u * 3 + v * 2 + turbulence) * Math.PI))
    const base = mix([246, 245, 241], [226, 224, 220], fbm(u * 8, v * 8, 8, 32))
    return mix([96, 98, 104], base, vein ** 0.28)
  },
  fabric: (u, v) => {
    const threads = 48
    const warp = Math.floor(u * threads)
    const weft = Math.floor(v * threads)
    const over = (warp + weft) % 2 === 0
    const across = over ? (Math.sin(v * threads * Math.PI * 2) + 1) / 2 : (Math.sin(u * threads * Math.PI * 2) + 1) / 2
    const fuzz = noise(u * 128, v * 128, 128, 41) * 0.25
    return mix([58, 84, 120], [104, 136, 176], across * 0.7 + fuzz)
  },
  paper: (u, v) => {
    const fibres = noise(u * 64, v * 16, 64, 51) * 0.5 + noise(u * 16, v * 64, 64, 52) * 0.5
    const speck = hash(Math.floor(u * 256), Math.floor(v * 256), 53) > 0.985 ? 0.4 : 0
    return mix([250, 247, 238], [222, 215, 198], fibres * 0.55 + speck)
  },
  stone: (u, v) => {
    const blotch = fbm(u * 6, v * 6, 6, 61, 5)
    const grit = hash(Math.floor(u * 256), Math.floor(v * 256), 62)
    const base = mix([92, 92, 96], [170, 168, 162], blotch)
    return mix(base, [40, 40, 44], grit > 0.93 ? 0.6 : grit * 0.12)
  },
}

const textureCache = new Map<string, HTMLCanvasElement>()

/** A built-in texture as a square canvas that tiles seamlessly. */
export function textureCanvas(id: BuiltInTexture, size = 256) {
  const key = `${id}:${size}`
  const cached = textureCache.get(key)
  if (cached) {
    return cached
  }
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) {
    return canvas
  }
  const image = context.createImageData(size, size)
  const paint = PAINTERS[id]
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = paint(x / size, y / size)
      const at = (y * size + x) * 4
      image.data[at] = r
      image.data[at + 1] = g
      image.data[at + 2] = b
      image.data[at + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  textureCache.set(key, canvas)
  return canvas
}

/** A small picture of a texture for the dialog: a built-in one drawn, or the user's picture. */
export function textureSwatch(texture: string) {
  if (isBuiltInTexture(texture)) {
    try {
      return textureCanvas(texture, 64).toDataURL()
    } catch {
      return ""
    }
  }
  return texture
}
