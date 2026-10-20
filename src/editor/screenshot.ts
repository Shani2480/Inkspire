import type { Editor } from "@tiptap/core"
import { insertImageFile } from "@/editor/actions"
import { insertFittedImage } from "@/editor/image-fit"

/** Capture a screen or window via getDisplayMedia and return a PNG data URL. */
export async function captureScreenClipping(): Promise<string | null> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return null
  }
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    })
    const track = stream.getVideoTracks()[0]
    if (!track) {
      return null
    }
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    await video.play()
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) {
        resolve()
        return
      }
      video.onloadeddata = () => resolve()
    })
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) {
      return null
    }
    context.drawImage(video, 0, 0, width, height)
    return canvas.toDataURL("image/png")
  } catch {
    return null
  } finally {
    stream?.getTracks().forEach((track) => track.stop())
  }
}

export async function insertScreenClipping(editor: Editor) {
  const src = await captureScreenClipping()
  if (!src) {
    return false
  }
  await insertFittedImage(editor, { src, alt: "Screenshot" })
  return true
}

export function pickScreenshotFile(editor: Editor, at?: number) {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "image/*"
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) {
      insertImageFile(editor, file, at)
    }
  }
  input.click()
}
