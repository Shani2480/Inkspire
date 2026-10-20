import { FontDialog } from "@/components/font-dialog"
import { ParagraphDialog } from "@/components/paragraph-dialog"
import { useEffect, useState } from "react"

type FormatDialog = "font" | "paragraph"

const listeners = new Set<(kind: FormatDialog) => void>()

export function requestFormatDialog(kind: FormatDialog) {
  listeners.forEach((listener) => listener(kind))
}

export function FormatDialogHost() {
  const [open, setOpen] = useState<FormatDialog | null>(null)

  useEffect(() => {
    const listener = (kind: FormatDialog) => setOpen(kind)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return (
    <>
      <FontDialog open={open === "font"} onClose={() => setOpen(null)} />
      <ParagraphDialog open={open === "paragraph"} onClose={() => setOpen(null)} />
    </>
  )
}
