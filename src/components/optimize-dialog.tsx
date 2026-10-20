import { saveOptimizedCopy } from "@/document/commands"
import { useOptimizeDialog } from "@/document/optimize-dialog-state"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { useState } from "react"

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Optimize Size (21.48): lists what a .docx carries without using, and saves a copy without it. */
export function OptimizeDialogHost() {
  const offer = useOptimizeDialog((state) => state.offer)
  const hide = useOptimizeDialog((state) => state.hide)
  const [result, setResult] = useState("")
  if (!offer) {
    return null
  }
  const freed = offer.findings.reduce((sum, item) => sum + item.bytes, 0)
  const close = () => {
    setResult("")
    hide()
  }
  return (
    <DialogFrame title="Optimize Size" width={480} onClose={close}>
      {offer.findings.length ? (
        <>
          <p className="text-xs">
            These are in the file but not used. Removing them does not change the document or its pictures.
          </p>
          <ul className="my-2 max-h-48 overflow-auto text-xs" aria-label="Found">
            {offer.findings.map((item, index) => (
              <li key={`${item.partName}-${index}`} className="flex justify-between gap-3 py-0.5">
                <span>
                  {item.label} <span className="opacity-60">{item.partName}</span>
                </span>
                <span>{size(item.bytes)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs">
            About {size(freed)} can be removed. Your open document and its file stay as they are.
          </p>
        </>
      ) : (
        <p className="text-xs">Nothing to remove: everything in this file is in use.</p>
      )}
      {result ? (
        <p role="status" className="mt-2 text-xs">
          {result}
        </p>
      ) : null}
      <DialogButtons
        cancel="Close"
        onCancel={close}
        ok="Save Optimized Copy…"
        okDisabled={!offer.findings.length}
        onOk={() =>
          void saveOptimizedCopy(offer.fileName, offer.bytes).then((done) => {
            if (done) {
              setResult(`Saved a copy without ${done.removed} unused item${done.removed === 1 ? "" : "s"}.`)
            }
          })
        }
      />
    </DialogFrame>
  )
}
