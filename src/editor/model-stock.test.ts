import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { STOCK_MODEL_IDS, stockModel } from "@/editor/model-stock"
import { THREED_STOCK } from "@/editor/three-d-model"

const PRIMITIVES = ["cube", "sphere", "cylinder", "cone", "torus"]

function meshes(root: THREE.Object3D) {
  const found: THREE.Mesh[] = []
  root.traverse((part) => {
    if ((part as THREE.Mesh).isMesh) {
      found.push(part as THREE.Mesh)
    }
  })
  return found
}

describe("stock 3D models", () => {
  it("offers at least ten models in each of Electronics, Anatomy, Furniture and Symbols", () => {
    for (const category of ["Electronics", "Anatomy", "Furniture", "Symbols"]) {
      expect(THREED_STOCK.filter((item) => item.category === category).length).toBeGreaterThanOrEqual(10)
    }
  })

  it("builds every model the library lists", () => {
    for (const item of THREED_STOCK) {
      if (!PRIMITIVES.includes(item.id)) {
        expect(STOCK_MODEL_IDS).toContain(item.id)
      }
    }
    expect(new Set(THREED_STOCK.map((item) => item.id)).size).toBe(THREED_STOCK.length)
  })

  it.each(STOCK_MODEL_IDS)("%s is built with its own surfaces, centred and sized like the others", (id) => {
    const model = stockModel(id)
    const parts = meshes(model)
    // An extruded symbol (a star, an arrow) is one solid; everything else is made of parts.
    const category = THREED_STOCK.find((item) => item.id === id)?.category
    expect(parts.length).toBeGreaterThan(category === "Symbols" ? 0 : 1)
    for (const part of parts) {
      const material = part.material as THREE.MeshStandardMaterial
      expect(material.isMeshStandardMaterial).toBe(true)
      expect(material.userData.ownSurface).toEqual({
        roughness: material.roughness,
        metalness: material.metalness,
        reflection: expect.any(Number),
      })
    }
    const bounds = new THREE.Box3().setFromObject(model)
    const centre = bounds.getCenter(new THREE.Vector3())
    expect(centre.length()).toBeLessThan(1e-6)
    expect(bounds.getSize(new THREE.Vector3()).length() / 2).toBeCloseTo(1.35, 5)
  })

  it("keeps the primitives as they were", () => {
    const cube = stockModel("cube") as THREE.Mesh
    expect(cube.geometry).toBeInstanceOf(THREE.BoxGeometry)
    expect((cube.geometry as THREE.BoxGeometry).parameters.width).toBe(1.2)
    const material = cube.material as THREE.MeshStandardMaterial
    expect(material.color.getHexString()).toBe("0f6cbd")
    expect(material.userData.ownSurface).toEqual({ roughness: 0.45, metalness: 0.2, reflection: 0.12 })
  })

  it("opens the earlier one-per-category presets as the models that replaced them", () => {
    const count = (id: string) => meshes(stockModel(id)).length
    expect(count("electronics")).toBe(count("tablet"))
    expect(count("anatomy")).toBe(count("figure"))
    expect(count("furniture")).toBe(count("chair"))
    expect(count("symbol")).toBe(count("star"))
  })

  it("shows an unknown preset as the cube", () => {
    const model = stockModel("no-such-model") as THREE.Mesh
    expect(model.geometry).toBeInstanceOf(THREE.BoxGeometry)
  })

  it("draws the same model every time", () => {
    const shape = (id: string) =>
      meshes(stockModel(id)).map((part) => part.getWorldPosition(new THREE.Vector3()).toArray().join(","))
    expect(shape("bookshelf")).toEqual(shape("bookshelf"))
    expect(shape("neuron")).toEqual(shape("neuron"))
  })
})
