import { useEffect, useState } from "react"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { saveDefaultStyles, useStyleStore, type StyleFont, type StyleParagraph } from "@/document/styles"

export type DefaultScope = "document" | "all"

type Request = { summary: string; resolve: (scope: DefaultScope | null) => void }

let openRequest: ((request: Request) => void) | null = null

/**
 * Word's Set As Default question: whether the choice changes the Normal style of this document only, or also of
 * every new document. Resolves to null when cancelled.
 */
export function askDefaultScope(summary: string) {
  return new Promise<DefaultScope | null>((resolve) => {
    if (!openRequest) {
      resolve(null)
      return
    }
    openRequest({ summary, resolve })
  })
}

/**
 * Makes the font or paragraph formatting the Normal style's, as Set As Default does in Word: in this document, and
 * for new documents too when asked. Styles based on Normal follow it.
 */
export function setNormalDefault(scope: DefaultScope, patch: { font?: StyleFont; paragraph?: StyleParagraph }) {
  const store = useStyleStore.getState()
  const normal = store.styles.find((style) => style.id === "normal")
  if (!normal) {
    return
  }
  const next = {
    ...normal,
    font: { ...normal.font, ...patch.font },
    paragraph: { ...normal.paragraph, ...patch.paragraph },
    changed: true,
  }
  store.update("normal", { font: next.font, paragraph: next.paragraph, changed: true })
  if (scope === "all") {
    saveDefaultStyles([next])
  }
}

export function SetDefaultDialogHost() {
  const [request, setRequest] = useState<Request | null>(null)
  const [scope, setScope] = useState<DefaultScope>("document")

  useEffect(() => {
    openRequest = (next) => {
      setScope("document")
      setRequest(next)
    }
    return () => {
      openRequest = null
    }
  }, [])

  if (!request) {
    return null
  }
  const close = (answer: DefaultScope | null) => {
    request.resolve(answer)
    setRequest(null)
  }
  return (
    <DialogFrame
      title="Inkspire"
      width={440}
      level={90}
      onClose={() => close(null)}
      onSubmit={(event) => {
        event.preventDefault()
        close(scope)
      }}
    >
      <p className="mb-3 text-[13px]">Do you want to set the default {request.summary} for:</p>
      <div className="mb-2 flex flex-col gap-2 text-[13px]" role="radiogroup" aria-label="Set as default for">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="default-scope"
            checked={scope === "document"}
            onChange={() => setScope("document")}
          />
          This document only?
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="default-scope" checked={scope === "all"} onChange={() => setScope("all")} />
          All documents based on the Normal template?
        </label>
      </div>
      <DialogButtons submit onCancel={() => close(null)} />
    </DialogFrame>
  )
}
