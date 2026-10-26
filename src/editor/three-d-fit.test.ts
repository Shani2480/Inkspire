import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { fitLoadedModel } from "@/editor/three-d-fit"

describe("fitLoadedModel", () => {
  it("has nothing to draw for a file without a scene (the fixtures' stub .glb)", () => {
    expect(fitLoadedModel(undefined)).toBeNull()
    expect(fitLoadedModel(null)).toBeNull()
  })

  it("has nothing to draw for a scene without extent", () => {
    expect(fitLoadedModel(new THREE.Group())).toBeNull()
    const empty = new THREE.Group()
    empty.add(new THREE.Mesh(new THREE.BufferGeometry()))
    expect(fitLoadedModel(empty)).toBeNull()
  })

  it("keeps a model near the viewer's units at its size, centred on its middle", () => {
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1))
    mesh.position.set(5, 0, 0)
    group.add(mesh)
    const fit = fitLoadedModel(group)!
    expect(fit.scale).toBe(1)
    expect(fit.centre.toArray()).toEqual([5, 0, 0])
  })

  it("scales a model made in large or small units to the view", () => {
    expect(fitLoadedModel(new THREE.Mesh(new THREE.BoxGeometry(40, 10, 10)))!.scale).toBeCloseTo(0.05)
    expect(fitLoadedModel(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)))!.scale).toBeCloseTo(20)
  })
})
