import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { selectedObject } from "@/editor/objects"
import { loadImage } from "@/editor/picture-flatten"
import {
  guessBackground,
  markArea,
  withoutBackground,
  workingSize,
  type BackgroundMask,
  type Pixels,
} from "@/editor/remove-background"
import type { Editor } from "@tiptap/core"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { create } from "zustand"

export const useRemoveBackground = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

/** The box the picture is shown in; the picture is scaled to fit it. */
const VIEW = { width: 560, height: 380 }
/** Word draws what is removed in magenta. */
const REMOVED = [200, 0, 200] as const

type Mode = "" | "keep" | "remove"

/**
 * Remove Background (Picture Format → Adjust), as Word's Background Removal tab: the picture with what will be
 * removed in magenta, a first guess at the background, Mark Areas to Keep and Mark Areas to Remove to correct it,
 * and Keep Changes or Discard All Changes. The picture before is kept on the picture (`backgroundOf`), so opening
 * this again starts from it and Reset Picture brings it back.
 */
export function RemoveBackgroundDialog({ editor }: { editor: Editor | null }) {
  const open = useRemoveBackground((state) => state.open)
  if (!open || !editor) {
    return null
  }
  return <BackgroundRemoval editor={editor} />
}

function BackgroundRemoval({ editor }: { editor: Editor }) {
  const hide = useRemoveBackground((state) => state.hide)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [source, setSource] = useState<{ pixels: Pixels; original: string } | null>(null)
  const [mask, setMask] = useState<BackgroundMask | null>(null)
  const [history, setHistory] = useState<BackgroundMask[]>([])
  const [mode, setMode] = useState<Mode>("")
  const [message, setMessage] = useState("")
  const stroke = useRef<{ x: number; y: number }[] | null>(null)

  useEffect(() => {
    const found = selectedObject(editor)
    if (found?.name !== "image") {
      hide()
      return
    }
    const original = String(found.attrs.backgroundOf || found.attrs.src || "")
    let live = true
    loadImage(original)
      .then((image) => {
        const size = workingSize(image.naturalWidth, image.naturalHeight)
        const canvas = document.createElement("canvas")
        canvas.width = size.width
        canvas.height = size.height
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) {
          throw new Error("The picture cannot be read.")
        }
        context.drawImage(image, 0, 0, size.width, size.height)
        const read = context.getImageData(0, 0, size.width, size.height)
        const pixels = { width: size.width, height: size.height, data: read.data }
        if (live) {
          setSource({ pixels, original })
          setMask(guessBackground(pixels))
        }
      })
      .catch((problem) => live && setMessage(String(problem instanceof Error ? problem.message : problem)))
    return () => {
      live = false
    }
  }, [editor, hide])

  const scale = source ? Math.min(VIEW.width / source.pixels.width, VIEW.height / source.pixels.height, 4) : 1

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source || !mask) {
      return
    }
    const { width, height, data } = source.pixels
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) {
      return
    }
    const shown = new ImageData(width, height)
    for (let index = 0; index < mask.length; index += 1) {
      const at = index * 4
      const alpha = data[at + 3]! / 255
      // Over white, as the picture shows on the page; what is removed is tinted magenta.
      for (let channel = 0; channel < 3; channel += 1) {
        const value = data[at + channel]! * alpha + 255 * (1 - alpha)
        shown.data[at + channel] = mask[index] ? value * 0.35 + REMOVED[channel]! * 0.65 : value
      }
      shown.data[at + 3] = 255
    }
    context.putImageData(shown, 0, 0)
  }, [source, mask])

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const width = source?.pixels.width ?? 1
    const height = source?.pixels.height ?? 1
    return {
      x: ((event.clientX - box.left) / box.width) * width,
      y: ((event.clientY - box.top) / box.height) * height,
    }
  }
  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!mode || event.button !== 0) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    stroke.current = [point(event)]
  }
  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const line = stroke.current
    if (!line) {
      return
    }
    const next = point(event)
    const last = line[line.length - 1]!
    // A point every few pixels of the picture is enough: each takes the run of colour around it.
    if (Math.hypot(next.x - last.x, next.y - last.y) >= 3 / scale) {
      line.push(next)
      const canvas = canvasRef.current
      const context = canvas?.getContext("2d")
      if (context) {
        context.strokeStyle = mode === "keep" ? "#107c10" : "#c50f1f"
        context.lineWidth = Math.max(1, 2 / scale)
        context.beginPath()
        context.moveTo(last.x, last.y)
        context.lineTo(next.x, next.y)
        context.stroke()
      }
    }
  }
  const onUp = () => {
    const line = stroke.current
    stroke.current = null
    if (!line || !source || !mask || !mode) {
      return
    }
    setHistory((list) => [...list, mask])
    setMask(markArea(source.pixels, mask, line, mode === "keep"))
  }
  const undo = () => {
    setHistory((list) => {
      const last = list[list.length - 1]
      if (last) {
        setMask(last)
      }
      return list.slice(0, -1)
    })
  }

  const keep = () => {
    if (!source || !mask) {
      hide()
      return
    }
    const result = withoutBackground(source.pixels, mask)
    const canvas = document.createElement("canvas")
    canvas.width = result.width
    canvas.height = result.height
    const context = canvas.getContext("2d")
    if (!context) {
      hide()
      return
    }
    const image = context.createImageData(result.width, result.height)
    image.data.set(result.data)
    context.putImageData(image, 0, 0)
    editor
      .chain()
      .focus()
      .updateAttributes("image", { src: canvas.toDataURL("image/png"), backgroundOf: source.original })
      .run()
    hide()
  }

  const tool = (id: Mode, label: string, sign: string) => (
    <button
      type="button"
      className={`dialog-btn${mode === id ? " is-primary" : ""}`}
      aria-pressed={mode === id}
      onClick={() => setMode(mode === id ? "" : id)}
    >
      <span aria-hidden className="mr-1 font-semibold">
        {sign}
      </span>
      {label}
    </button>
  )

  return (
    <DialogFrame title="Background Removal" width={VIEW.width + 48} onClose={hide} onSubmit={keep}>
      <div className="flex flex-wrap items-center gap-2 text-xs" role="toolbar" aria-label="Refine">
        {tool("keep", "Mark Areas to Keep", "+")}
        {tool("remove", "Mark Areas to Remove", "−")}
        <button type="button" className="dialog-btn" disabled={history.length === 0} onClick={undo}>
          Undo Mark
        </button>
      </div>
      <div
        className="mt-3 grid place-items-center rounded border border-[var(--dlg-panel-border)] bg-[var(--dlg-bg)]"
        style={{ height: VIEW.height + 12 }}
      >
        {source ? (
          <canvas
            ref={canvasRef}
            aria-label="The picture, with the parts to remove in magenta"
            className="remove-background-canvas"
            data-mode={mode || undefined}
            style={{ width: source.pixels.width * scale, height: source.pixels.height * scale }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        ) : (
          <p className="text-xs text-[var(--dlg-muted)]">{message || "Finding the background…"}</p>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--dlg-muted)]">
        Magenta parts will be removed. Pick a mark, then draw over a part to keep it or to remove it.
      </p>
      <DialogButtons submit ok="Keep Changes" cancel="Discard All Changes" okDisabled={!mask} onCancel={hide} />
    </DialogFrame>
  )
}
