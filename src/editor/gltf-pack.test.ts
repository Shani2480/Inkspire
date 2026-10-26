import { describe, expect, it } from "vitest"
import { packGltf, readGlb, resolveGltfFile } from "@/editor/gltf-pack"

const bytes = (...values: number[]) => new Uint8Array(values)

describe("packGltf", () => {
  it("moves separate buffers and images into one BIN chunk, keeping every view's bytes", () => {
    const json = {
      asset: { version: "2.0" },
      buffers: [
        { uri: "chair.bin", byteLength: 6 },
        { uri: "data:application/octet-stream;base64,AQID", byteLength: 3 },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 2, byteLength: 4 },
        { buffer: 1, byteLength: 3, target: 34962 },
      ],
      images: [{ uri: "textures/chair_diff_1k.jpg" }, { bufferView: 0, mimeType: "image/png" }],
    }
    const files = new Map<string, Uint8Array>([
      ["chair.bin", bytes(10, 11, 12, 13, 14, 15)],
      ["textures/chair_diff_1k.jpg", bytes(255, 216, 255)],
    ])
    const glb = packGltf(json, files)
    const { json: packed, bin } = readGlb(glb)
    expect(glb.byteLength % 4).toBe(0)
    // Buffer 0 at 0 (6 bytes, padded to 8), buffer 1 at 8 (3 bytes, padded to 12), the image at 12 (3 bytes, padded to 16).
    expect(packed.buffers).toEqual([{ byteLength: 16 }])
    expect(packed.bufferViews).toEqual([
      { buffer: 0, byteOffset: 2, byteLength: 4 },
      { buffer: 0, byteOffset: 8, byteLength: 3, target: 34962 },
      { buffer: 0, byteOffset: 12, byteLength: 3 },
    ])
    expect(packed.images).toEqual([
      { bufferView: 2, mimeType: "image/jpeg" },
      { bufferView: 0, mimeType: "image/png" },
    ])
    expect([...bin!.subarray(2, 6)]).toEqual([12, 13, 14, 15])
    expect([...bin!.subarray(8, 11)]).toEqual([1, 2, 3])
    expect([...bin!.subarray(12, 15)]).toEqual([255, 216, 255])
    expect(json.images[0]).toEqual({ uri: "textures/chair_diff_1k.jpg" })
  })

  it("finds a file by its decoded path or its name alone", () => {
    const files = new Map<string, Uint8Array>([["textures/Arm Chair_diff.jpg", bytes(1)]])
    expect(resolveGltfFile("textures/Arm%20Chair_diff.jpg", files)).toEqual(bytes(1))
    expect(resolveGltfFile("Arm Chair_diff.jpg", files)).toEqual(bytes(1))
    expect(resolveGltfFile("other.jpg", files)).toBeNull()
  })

  it("refuses a glTF whose file is missing rather than writing a broken model", () => {
    expect(() => packGltf({ buffers: [{ uri: "gone.bin", byteLength: 1 }] }, new Map())).toThrow(/gone\.bin/)
  })

  it("writes a glTF without buffers as a JSON-only .glb", () => {
    const glb = packGltf({ asset: { version: "2.0" } }, new Map())
    expect(readGlb(glb)).toEqual({
      json: { asset: { version: "2.0" }, bufferViews: [], buffers: [{ byteLength: 0 }] },
      bin: null,
    })
  })
})
