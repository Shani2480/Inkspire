import { useFileProtection } from "@/document/file-protection"
import { openExternal } from "@/document/help"
import { type FontOffer, fontOffer, offerText } from "@/document/missing-fonts"
import { APTOS_DOWNLOAD, useOptionalFonts } from "@/document/optional-fonts"
import { useWebFonts } from "@/document/web-fonts"
import { useDocumentStore } from "@/document/store"
import { BadgeCheck, FileLock, Signature, Type, X } from "lucide-react"
import { useEffect, useState } from "react"

/** The fonts an opened document uses that are missing here, and what can be had for them. */
function useFontOffer() {
  const saved = useDocumentStore((state) => state.savedHTML)
  const fileName = useDocumentStore((state) => state.fileName)
  const ready = useOptionalFonts((state) => state.ready)
  const status = useOptionalFonts((state) => state.status)
  const installed = useWebFonts((state) => state.installed)
  const [offer, setOffer] = useState<FontOffer | null>(null)
  useEffect(() => {
    if (!ready) {
      return
    }
    let cancelled = false
    // After the document's style sheet is on the page, and its embedded fonts are loaded.
    const timer = window.setTimeout(() => {
      void document.fonts?.ready.then(async () => {
        const next = await fontOffer(usedFontsCss(), status, installed)
        if (!cancelled) {
          setOffer(next.missing.length ? next : null)
        }
      })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [saved, fileName, ready, status, installed])
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
  const offer = useFontOffer()
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
          : offer
            ? {
                id: `fonts-${offer.missing.join(",")}`,
                icon: <Type className="size-4" strokeWidth={1.75} />,
                label: "FONTS",
                text: offerText(offer),
                action:
                  offer.web.length || offer.standIns.length
                    ? {
                        label: "Download",
                        run: () => {
                          void useWebFonts.getState().download(offer.web)
                          void useOptionalFonts.getState().download(offer.standIns.map((font) => font.id))
                        },
                      }
                    : null,
                secondary: offer.aptos ? { label: "Get Aptos", run: () => void openExternal(APTOS_DOWNLOAD) } : null,
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
      {"secondary" in bar && bar.secondary ? (
        <button type="button" className="document-message-bar-action" onClick={bar.secondary.run}>
          {bar.secondary.label}
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

/** The fonts the document's text is drawn in, as `font-family` declarations: only what is on its pages counts. */
function usedFontsCss() {
  const families = new Set<string>()
  const walker = document.createTreeWalker(
    document.querySelector("#document-scroll") ?? document.body,
    NodeFilter.SHOW_TEXT,
  )
  for (let node = walker.nextNode(), seen = 0; node && seen < 20000; node = walker.nextNode(), seen += 1) {
    const parent = node.parentElement
    if (parent && node.textContent?.trim() && parent.closest(".ProseMirror")) {
      families.add(getComputedStyle(parent).fontFamily)
    }
  }
  return [...families].map((family) => `font-family: ${family};`).join("\n")
}
