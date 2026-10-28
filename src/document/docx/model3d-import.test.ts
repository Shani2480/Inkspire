import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { createExtensions } from "@/editor/extensions"
import { wordModelPose, wordModelRot } from "@/editor/model-views"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
// The creature of 123.docx with a stub .glb, in f22 alone and in f24 among the paragraph exceptions.
const NAMES = ["f22_model3d.docx", "f24_paragraph_exceptions.docx"]

const original = URL.createObjectURL

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:model-test")
})
afterEach(() => {
  URL.createObjectURL = original
})

async function open(name: string) {
  return openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
}

function modelOf(html: string) {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body
  const image = root.querySelector<HTMLImageElement>("img[data-inkspire-object]")
  return image
    ? (JSON.parse(atob(image.getAttribute("data-inkspire-object") ?? "")) as {
        type: string
        attrs: Record<string, unknown>
      })
    : null
}

async function save(opened: Awaited<ReturnType<typeof open>>, editor: Editor) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "edited.docx",
  })
  return openPackage(saved.bytes, "edited.docx")
}

describe.each(NAMES)("3-D models from Word (21.38) in %s", (name) => {
  it("opens the model as the app's own, from the .glb and with Word's picture", async () => {
    const model = modelOf((await open(name)).view.html)
    expect(model?.type).toBe("threeDModel")
    expect(model?.attrs).toMatchObject({ src: "blob:model-test", alt: "Emotive creature" })
    // Word's turn (am3d:rot ax 33.6°, ay 28.5°, az 17.6°) is the first pose, and marks the model as not turned.
    expect(model?.attrs).toMatchObject(wordModelPose({ ax: 2013006, ay: 1710973, az: 1054029 }))
    expect(model?.attrs.wordModel).toBe(`${model?.attrs.yaw},${model?.attrs.pitch}`)
    expect(String(model?.attrs.snapshot)).toMatch(/^data:image\/png;base64,/)
    expect(model?.attrs.width).toBe(244)
  })

  it("keeps Word's drawing and model part while the model is not turned", async () => {
    const opened = await open(name)
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: opened.view.html,
    })
    try {
      const pkg = await save(opened, editor)
      const xml = new TextDecoder().decode(findPart(pkg, "/word/document.xml")!.data)
      expect(xml).toContain("am3d:model3d")
      expect(findPart(pkg, "/word/media/model3d1.glb")).toBeDefined()
    } finally {
      editor.destroy()
    }
  })

  it("saves a turned model as Word's model with the new turn and the app's picture of it", async () => {
    const opened = await open(name)
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: opened.view.html,
    })
    try {
      const json = editor.getJSON()
      const image = json.content?.find((node) => node.type === "image")
      expect(image).toBeDefined()
      const model = JSON.parse(atob(String(image!.attrs!.objectNode)))
      model.attrs.yaw = 1.2
      image!.attrs!.objectNode = btoa(JSON.stringify(model))
      // The picture the app takes of the turned model replaces Word's.
      image!.attrs!.src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      const saved = await saveDocxBytes({
        json,
        chrome: opened.view.chrome,
        props: opened.view.props,
        word: opened.word,
        unchanged: false,
        fileName: "edited.docx",
      })
      const pkg = await openPackage(saved.bytes, "edited.docx")
      const xml = new TextDecoder().decode(findPart(pkg, "/word/document.xml")!.data)
      expect(xml).not.toContain("blob:")
      expect(xml).toContain("am3d:model3d")
      expect(findPart(pkg, "/word/media/model3d1.glb")).toBeDefined()
      const rot = /<am3d:rot ax="(\d+)" ay="(\d+)" az="(\d+)"\/>/.exec(xml)
      expect(rot).not.toBeNull()
      const turned = { ...model.attrs, yaw: 1.2 }
      const expected = wordModelRot({ yaw: turned.yaw, pitch: turned.pitch, roll: turned.roll })
      expect(rot!.slice(1).map(Number)).toEqual([expected.ax, expected.ay, expected.az])
      // The raster and the fallback picture are the app's picture of the turn, not Word's.
      const embed = /<am3d:blip r:embed="([^"]+)"/.exec(xml)?.[1]
      const relationship = pkg.relationships
        .find((group) => group.source === pkg.mainPartName)
        ?.items.find((item) => item.id === embed)
      expect(relationship?.partName).toMatch(/^\/word\/media\/image\d+\.png$/)
      // The 1-pixel picture the test gave the turned model, not Word's 59 KB one.
      expect(findPart(pkg, relationship!.partName!)!.data.length).toBeLessThan(200)
      // Reopened, the model shows the turn it was saved at.
      const again = modelOf((await openDocxBytes(saved.bytes, "edited.docx")).view.html)
      expect(Number(again?.attrs.yaw)).toBeCloseTo(1.2, 3)
      expect(Number(again?.attrs.pitch)).toBeCloseTo(Number(model.attrs.pitch), 3)
    } finally {
      editor.destroy()
    }
  })
})
