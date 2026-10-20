import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const NAME = "f22_model3d.docx"

const original = URL.createObjectURL

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:model-test")
})
afterEach(() => {
  URL.createObjectURL = original
})

async function open() {
  return openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, NAME))), NAME)
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

describe("3-D models from Word (21.38)", () => {
  it("opens the model as the app's own, from the .glb and with Word's picture", async () => {
    const model = modelOf((await open()).view.html)
    expect(model?.type).toBe("threeDModel")
    expect(model?.attrs).toMatchObject({ src: "blob:model-test", alt: "Emotive creature", wordModel: "0,0" })
    expect(String(model?.attrs.snapshot)).toMatch(/^data:image\/png;base64,/)
    expect(model?.attrs.width).toBe(244)
  })

  it("keeps Word's drawing and model part while the model is not turned", async () => {
    const opened = await open()
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

  it("saves a turned model as the app's picture carrying the model, never a blob address", async () => {
    const opened = await open()
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
      expect(xml).toContain("<pic:pic")
      expect(xml).not.toContain("am3d:model3d")
    } finally {
      editor.destroy()
    }
  })
})
