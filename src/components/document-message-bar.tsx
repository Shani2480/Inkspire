import { useFileProtection } from "@/document/file-protection"
import { useDocumentStore } from "@/document/store"
import { BadgeCheck, FileLock, Signature, X } from "lucide-react"
import { useState } from "react"

/**
 * Word's message bar under the ribbon: a document marked as final, one opened read-only because its author asked,
 * and one that carries digital signatures.
 */
export function DocumentMessageBar() {
  const readOnly = useDocumentStore((state) => state.readOnly)
  const markedFinal = useFileProtection((state) => state.markedFinal)
  const signatures = useFileProtection((state) => state.signatures)
  const setMarkedFinal = useFileProtection((state) => state.setMarkedFinal)
  const [hidden, setHidden] = useState<string | null>(null)
  const bar =
    readOnly && markedFinal
      ? {
          id: "final",
          icon: <BadgeCheck className="size-4" strokeWidth={1.75} />,
          label: "MARKED AS FINAL",
          text: "An author has marked this document as final to discourage editing.",
          action: { label: "Edit Anyway", run: () => setMarkedFinal(false) },
        }
      : readOnly
        ? {
            id: "read-only",
            icon: <FileLock className="size-4" strokeWidth={1.75} />,
            label: "READ-ONLY",
            text: "The author would like you to open this document read-only, unless you need to make changes.",
            action: { label: "Edit Anyway", run: () => useDocumentStore.getState().setReadOnly(false) },
          }
        : signatures
          ? {
              id: `signatures-${signatures}`,
              icon: <Signature className="size-4" strokeWidth={1.75} />,
              label: "SIGNATURES",
              text: "This document has been signed. Saving it here removes the signatures, as editing it in Word does.",
              action: null,
            }
          : null
  if (!bar || hidden === bar.id) {
    return null
  }
  return (
    <div className="document-message-bar" role="status">
      <span className="document-message-bar-icon">{bar.icon}</span>
      <strong>{bar.label}</strong>
      <span className="document-message-bar-text">{bar.text}</span>
      {bar.action ? (
        <button type="button" className="document-message-bar-action" onClick={bar.action.run}>
          {bar.action.label}
        </button>
      ) : null}
      <span className="flex-1" />
      <button
        type="button"
        className="document-message-bar-close"
        aria-label="Close"
        title="Close"
        onClick={() => setHidden(bar.id)}
      >
        <X className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  )
}
