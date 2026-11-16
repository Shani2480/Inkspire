import { useFileProtection } from "@/document/file-protection"
import { fontsToOffer, useOptionalFonts } from "@/document/optional-fonts"
import { useDocumentStore } from "@/document/store"
import { BadgeCheck, FileLock, Signature, Type, X } from "lucide-react"
import { useEffect, useState } from "react"

/** The Office fonts an opened document uses that are missing here and have a free stand-in (U39). */
function useFontsToOffer() {
  const saved = useDocumentStore((state) => state.savedHTML)
  const fileName = useDocumentStore((state) => state.fileName)
  const ready = useOptionalFonts((state) => state.ready)
  const status = useOptionalFonts((state) => state.status)
  const [offer, setOffer] = useState<ReturnType<typeof fontsToOffer>>([])
  useEffect(() => {
    if (!ready) {
      return
    }
    // After the document's style sheet is on the page.
    const timer = window.setTimeout(() => {
      const sheet = document.getElementById("word-document-styles")?.textContent ?? ""
      setOffer(fontsToOffer(saved, sheet, status))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [saved, fileName, ready, status])
  return offer
}

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
  const offer = useFontsToOffer()
  const offerNames = offer.map((item) => item.office)
  const standIns = [...new Set(offer.map((item) => item.font))]
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
          : standIns.length
            ? {
                id: `fonts-${offerNames.join(",")}`,
                icon: <Type className="size-4" strokeWidth={1.75} />,
                label: "FONTS",
                text: `This document uses ${listOf(offerNames)}, which ${offerNames.length > 1 ? "are" : "is"} not installed. Download ${listOf(standIns.map((font) => font.family))}, ${standIns.length > 1 ? "free fonts" : "a free font"} with the same widths, so it lays out as in Word?`,
                action: {
                  label: "Download",
                  run: () => void useOptionalFonts.getState().download(standIns.map((font) => font.id)),
                },
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

function listOf(names: string[]) {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}
