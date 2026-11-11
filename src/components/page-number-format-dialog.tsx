import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { PAGE_NUMBER_FORMATS } from "@/document/page-numbers"
import { useDocumentStore } from "@/document/store"
import { useState } from "react"
import { create } from "zustand"

/** Which section Format Page Numbers is open for: a section before the last by its key, "" for the last; null shut. */
export const usePageNumberFormat = create<{
  section: string | null
  open: (section: string) => void
  close: () => void
}>((set) => ({
  section: null,
  open: (section) => set({ section }),
  close: () => set({ section: null }),
}))

/**
 * Word's Format Page Numbers (Insert > Page Number): how the section's page numbers are written, and whether its
 * first page goes on from the section before or starts at a number of its own.
 */
export function PageNumberFormatDialog() {
  const key = usePageNumberFormat((state) => state.section)
  const close = usePageNumberFormat((state) => state.close)
  if (key === null) {
    return null
  }
  return <FormatBody key={key} sectionKey={key} onClose={close} />
}

function FormatBody({ sectionKey, onClose }: { sectionKey: string; onClose: () => void }) {
  const opened = useDocumentStore.getState()
  const section = sectionKey ? opened.sections.find((item) => item.key === sectionKey) : undefined
  const startAt = section ? (section.pageNumberStart ?? null) : opened.pageSetup.pageNumberStart
  const [format, setFormat] = useState(
    section ? (section.pageNumberFormat ?? "decimal") : opened.pageSetup.pageNumberFormat,
  )
  const [restart, setRestart] = useState(startAt !== null)
  const [start, setStart] = useState(startAt ?? 1)
  const known = PAGE_NUMBER_FORMATS.some((item) => item.value === format)

  const apply = () => {
    const store = useDocumentStore.getState()
    const pageNumberStart = restart ? start : null
    if (section) {
      store.setSectionSetup(section.key, { pageNumberStart, pageNumberFormat: format })
    } else {
      store.setPageSetup({ ...store.pageSetup, pageNumberStart, pageNumberFormat: format })
    }
    onClose()
  }

  return (
    <DialogFrame title="Page Number Format" width={340} level={95} onClose={onClose}>
      <div className="grid gap-3 text-xs text-[var(--dlg-text)]">
        <label className="grid grid-cols-[auto_1fr] items-center gap-2">
          Number format:
          <select
            aria-label="Number format"
            className="h-7 rounded border border-[var(--dlg-control-border)] bg-[var(--dlg-surface)] px-1"
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            {PAGE_NUMBER_FORMATS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            {known ? null : <option value={format}>{format}</option>}
          </select>
        </label>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[var(--dlg-muted)]">Page numbering</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="page-numbering" checked={!restart} onChange={() => setRestart(false)} />
            Continue from previous section
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="page-numbering" checked={restart} onChange={() => setRestart(true)} />
            Start at:
            <input
              type="number"
              aria-label="Start at"
              min={0}
              max={32767}
              value={start}
              disabled={!restart}
              className="h-7 w-20 rounded border border-[var(--dlg-control-border)] bg-[var(--dlg-surface)] px-2 disabled:opacity-50"
              onChange={(event) => setStart(Math.max(0, Math.min(32767, Math.round(Number(event.target.value) || 0))))}
            />
          </label>
        </fieldset>
      </div>
      <DialogButtons onOk={apply} onCancel={onClose} />
    </DialogFrame>
  )
}
