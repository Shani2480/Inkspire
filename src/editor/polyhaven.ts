import { packGltf, type GltfJson } from "@/editor/gltf-pack"

/** Poly Haven's file list for one model: each format by resolution, the glTF with the files it includes. */
type PolyHavenFiles = {
  gltf?: Record<
    string,
    { gltf?: { url: string; size?: number; include?: Record<string, { url: string; size?: number }> } }
  >
}

const RESOLUTION_ORDER = ["1k", "2k", "4k", "8k"]

/** The smallest resolution offered: a page model needs no 4k textures, and the download stays a few MB. */
export function pickPolyHavenResolution(files: PolyHavenFiles) {
  const offered = Object.keys(files.gltf ?? {}).filter((key) => files.gltf?.[key]?.gltf?.url)
  offered.sort((left, right) => {
    const a = RESOLUTION_ORDER.indexOf(left)
    const b = RESOLUTION_ORDER.indexOf(right)
    return (a === -1 ? 99 : a) - (b === -1 ? 99 : b) || left.localeCompare(right)
  })
  return offered[0] ?? null
}

async function fetchBytes(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`${response.status} for ${url}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Downloads a Poly Haven model as one `.glb`: its glTF at the smallest resolution, with the `.bin` and textures it
 * includes, packed into a single file (`packGltf`). `onProgress` gets the bytes received so far and the total.
 */
export async function fetchPolyHavenModel(
  id: string,
  signal?: AbortSignal,
  onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
  const listing = await fetch(`https://api.polyhaven.com/files/${encodeURIComponent(id)}`, { signal })
  if (!listing.ok) {
    throw new Error(`${listing.status} for the file list of ${id}`)
  }
  const files = (await listing.json()) as PolyHavenFiles
  const resolution = pickPolyHavenResolution(files)
  const entry = resolution ? files.gltf?.[resolution]?.gltf : undefined
  if (!entry) {
    throw new Error(`${id} has no glTF`)
  }
  const includes = Object.entries(entry.include ?? {})
  const total = (entry.size ?? 0) + includes.reduce((sum, [, file]) => sum + (file.size ?? 0), 0)
  let received = 0
  const report = (bytes: number) => {
    received += bytes
    onProgress?.(received, total)
  }
  const [gltfBytes, ...parts] = await Promise.all([
    fetchBytes(entry.url, signal).then((bytes) => (report(bytes.byteLength), bytes)),
    ...includes.map(([, file]) => fetchBytes(file.url, signal).then((bytes) => (report(bytes.byteLength), bytes))),
  ])
  const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as GltfJson
  const named = new Map<string, Uint8Array>()
  includes.forEach(([name], index) => named.set(name, parts[index]!))
  const glb = packGltf(json, named)
  return new Blob([glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer], {
    type: "model/gltf-binary",
  })
}
