/**
 * Packs a glTF that keeps its buffers and images in separate files (as Poly Haven serves models) into one binary
 * `.glb`: the JSON chunk with every buffer and image moved into a single BIN chunk. One file is what the viewer,
 * the Word model part and the local-file path all take.
 */

export type GltfJson = {
  buffers?: { uri?: string; byteLength: number }[]
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }[]
  images?: { uri?: string; mimeType?: string; bufferView?: number; name?: string }[]
  [key: string]: unknown
}

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  ktx2: "image/ktx2",
}

/** The bytes a glTF uri names: a data URI decoded, or the external file found by its path, decoded path or name. */
export function resolveGltfFile(uri: string, files: Map<string, Uint8Array>): Uint8Array | null {
  const data = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri)
  if (data) {
    if (data[2]) {
      const binary = atob(data[3]!)
      return Uint8Array.from(binary, (char) => char.charCodeAt(0))
    }
    return new TextEncoder().encode(decodeURIComponent(data[3]!))
  }
  let decoded = uri
  try {
    decoded = decodeURIComponent(uri)
  } catch {
    // not encoded
  }
  const name = decoded.split("/").pop() ?? decoded
  for (const key of [uri, decoded, name]) {
    const found = files.get(key)
    if (found) {
      return found
    }
  }
  for (const [key, bytes] of files) {
    if ((key.split("/").pop() ?? key) === name) {
      return bytes
    }
  }
  return null
}

function padTo4(length: number) {
  return (4 - (length % 4)) % 4
}

/** One `.glb` from the glTF JSON and the files its buffers and images name. Throws when a named file is missing. */
export function packGltf(json: GltfJson, files: Map<string, Uint8Array>): Uint8Array {
  const out: GltfJson = JSON.parse(JSON.stringify(json)) as GltfJson
  const chunks: Uint8Array[] = []
  let total = 0
  const append = (bytes: Uint8Array) => {
    const offset = total
    chunks.push(bytes)
    total += bytes.byteLength
    const pad = padTo4(total)
    if (pad) {
      chunks.push(new Uint8Array(pad))
      total += pad
    }
    return offset
  }

  // Every buffer in turn, each starting on a 4-byte boundary; the views keep their offsets within it.
  const bufferOffsets: number[] = []
  for (const [index, buffer] of (out.buffers ?? []).entries()) {
    const bytes = buffer.uri ? resolveGltfFile(buffer.uri, files) : null
    if (!bytes) {
      throw new Error(`glTF buffer ${index} (${buffer.uri ?? "no uri"}) is missing`)
    }
    bufferOffsets.push(append(bytes))
  }
  const views = out.bufferViews ?? []
  for (const view of views) {
    view.byteOffset = (view.byteOffset ?? 0) + (bufferOffsets[view.buffer] ?? 0)
    view.buffer = 0
  }

  // Each image file becomes a view of its own in the same buffer.
  for (const [index, image] of (out.images ?? []).entries()) {
    if (!image.uri) {
      continue
    }
    const bytes = resolveGltfFile(image.uri, files)
    if (!bytes) {
      throw new Error(`glTF image ${index} (${image.uri}) is missing`)
    }
    const extension = (image.uri.split("?")[0]!.split(".").pop() ?? "").toLowerCase()
    views.push({ buffer: 0, byteOffset: append(bytes), byteLength: bytes.byteLength })
    image.bufferView = views.length - 1
    image.mimeType = image.mimeType ?? MIME_BY_EXTENSION[extension] ?? "image/png"
    delete image.uri
  }
  out.bufferViews = views
  out.buffers = [{ byteLength: total }]

  const jsonBytes = new TextEncoder().encode(JSON.stringify(out))
  const jsonPad = padTo4(jsonBytes.byteLength)
  const jsonLength = jsonBytes.byteLength + jsonPad
  const length = 12 + 8 + jsonLength + (total ? 8 + total : 0)
  const glb = new Uint8Array(length)
  const view = new DataView(glb.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, length, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, CHUNK_JSON, true)
  glb.set(jsonBytes, 20)
  glb.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength)
  if (total) {
    const binStart = 20 + jsonLength
    view.setUint32(binStart, total, true)
    view.setUint32(binStart + 4, CHUNK_BIN, true)
    let cursor = binStart + 8
    for (const chunk of chunks) {
      glb.set(chunk, cursor)
      cursor += chunk.byteLength
    }
  }
  return glb
}

/** The JSON and BIN chunks of a `.glb`, for checks and tests. */
export function readGlb(glb: Uint8Array): { json: GltfJson; bin: Uint8Array | null } {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("Not a .glb")
  }
  const jsonLength = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as GltfJson
  const binStart = 20 + jsonLength
  if (binStart >= glb.byteLength) {
    return { json, bin: null }
  }
  const binLength = view.getUint32(binStart, true)
  return { json, bin: glb.subarray(binStart + 8, binStart + 8 + binLength) }
}
