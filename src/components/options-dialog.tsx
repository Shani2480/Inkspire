import { OptionsPages } from "@/components/backstage/views"
import { DialogFrame } from "@/components/word-dialog"
import { useOptionsDialog } from "@/document/options-dialog"

export function OptionsDialog() {
  const open = useOptionsDialog((state) => state.open)
  const page = useOptionsDialog((state) => state.page)
  const close = useOptionsDialog((state) => state.closeOptions)
  if (!open) {
    return null
  }
  return (
    <DialogFrame
      title="Options"
      width={900}
      height="min(640px, calc(100vh - 48px))"
      level={90}
      bodyClassName="options-dialog-body"
      onClose={close}
    >
      <OptionsPages initialPage={page} />
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn is-primary" onClick={close}>
          Close
        </button>
      </div>
    </DialogFrame>
  )
}
