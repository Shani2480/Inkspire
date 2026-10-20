import { DialogFrame } from "@/components/word-dialog"
import { useFileError, type FileProblemAction, type FileProblemKind } from "@/document/file-errors"
import { useEffect, useRef, useState, type ReactNode } from "react"

const LABELS: Record<FileProblemAction, string> = {
  retry: "Try Again",
  "save-as": "Save As…",
  "open-other": "Open Another File…",
  "remove-recent": "Remove from Recent",
  close: "Close",
}

/**
 * The app's dialog for a file that could not be opened, saved or exported: an icon for the kind of problem, a
 * plain heading and message, the buttons that fit, and the system's own words under Details.
 */
export function FileErrorDialog() {
  const problem = useFileError((state) => state.problem)
  const answer = useFileError((state) => state.answer)
  const [details, setDetails] = useState(false)
  const [copied, setCopied] = useState(false)
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setDetails(false)
    setCopied(false)
    if (problem) {
      primaryRef.current?.focus()
    }
  }, [problem])

  if (!problem) {
    return null
  }

  const copy = () => {
    const text = `${problem.title}\n${problem.message}\n\n${problem.detail}`
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <DialogFrame title="Inkspire" width={460} level={130} onClose={() => answer("close")}>
      <div role="alert" className="file-error" data-kind={problem.kind}>
        <ProblemIcon kind={problem.kind} />
        <div className="min-w-0 flex-1">
          <h2 className="file-error-title">{problem.title}</h2>
          <p className="file-error-message">{problem.message}</p>
          {problem.detail ? (
            <div className="file-error-details">
              <button
                type="button"
                className="file-error-toggle"
                aria-expanded={details}
                onClick={() => setDetails((open) => !open)}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path
                    d={details ? "M2 3.5 5 6.5 8 3.5" : "M3.5 2 6.5 5 3.5 8"}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Details
              </button>
              {details ? (
                <div className="file-error-detail">
                  <code>{problem.detail}</code>
                  <button type="button" className="dialog-btn" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="word-dialog-actions">
        <span className="flex-1" />
        {problem.actions.map((action, index) => (
          <button
            key={action}
            ref={index === 0 ? primaryRef : undefined}
            type="button"
            className={`dialog-btn${index === 0 && action !== "close" ? " is-primary" : ""}`}
            onClick={() => answer(action)}
          >
            {LABELS[action]}
          </button>
        ))}
      </div>
    </DialogFrame>
  )
}

/* Outline drawings on a 32 grid with one 1.5 stroke, in the icon tokens; the badge carries the problem's colour. */

const base = {
  fill: "none",
  stroke: "var(--icon-base-color)",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

function Badge({ tone, children }: { tone: "danger" | "warning" | "info"; children: ReactNode }) {
  return (
    <g>
      <circle cx="23" cy="23" r="7.25" fill={`var(--file-error-${tone})`} stroke="var(--dlg-bg)" strokeWidth="1.5" />
      <g
        fill="none"
        stroke="var(--file-error-badge-text)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </g>
  )
}

const page = <path d="M7 3.5h10.5L23 9v5.5M7 3.5v24h8.5" {...base} />
const pageFold = <path d="M17.5 3.5V9H23" {...base} />

function ProblemIcon({ kind }: { kind: FileProblemKind }) {
  return (
    <svg className="file-error-icon" width="40" height="40" viewBox="0 0 32 32" aria-hidden>
      {drawing(kind)}
    </svg>
  )
}

function drawing(kind: FileProblemKind) {
  switch (kind) {
    case "not-found":
    case "folder-missing":
      return (
        <>
          {kind === "folder-missing" ? (
            <path d="M3.5 8.5v15h12M3.5 8.5V6.5h7l2 2.5h12v5" {...base} />
          ) : (
            <>
              {page}
              {pageFold}
            </>
          )}
          <Badge tone="warning">
            <path d="M21 21.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.3" />
            <path d="M23 26.6h.01" strokeWidth="2" />
          </Badge>
        </>
      )
    case "protected":
    case "permission":
    case "read-only":
      return (
        <>
          {page}
          {pageFold}
          <Badge tone="info">
            <rect x="19.8" y="22" width="6.4" height="4.6" rx="0.8" />
            <path d="M21.2 22v-1.4a1.8 1.8 0 0 1 3.6 0V22" />
          </Badge>
        </>
      )
    case "in-use":
      return (
        <>
          {page}
          {pageFold}
          <Badge tone="warning">
            <path d="M23 19.6V23l2.2 1.4" />
          </Badge>
        </>
      )
    case "disk-full":
      return (
        <>
          <rect x="3.5" y="9" width="21" height="10" rx="2" {...base} />
          <path d="M7 14h.01M10 14h.01" {...base} strokeWidth="2" />
          <path d="M3.5 22.5h12" {...base} />
          <Badge tone="danger">
            <path d="M23 19.8v3.6" />
            <path d="M23 26.2h.01" strokeWidth="2" />
          </Badge>
        </>
      )
    case "unsupported":
    case "legacy-word":
    case "desktop-only":
      return (
        <>
          {page}
          {pageFold}
          <path d="M10.5 13h7M10.5 17h4" {...base} stroke="var(--icon-muted-color)" />
          <Badge tone="info">
            <path d="M23 22.4v3.4" />
            <path d="M23 20.1h.01" strokeWidth="2" />
          </Badge>
        </>
      )
    case "damaged":
      return (
        <>
          {page}
          {pageFold}
          <path d="M7 15.5l3-2 3 2.5 3-2.5 2.5 2" {...base} stroke="var(--icon-muted-color)" />
          <Badge tone="danger">
            <path d="M20.6 20.6l4.8 4.8M25.4 20.6l-4.8 4.8" />
          </Badge>
        </>
      )
    default:
      return (
        <>
          {page}
          {pageFold}
          <Badge tone="danger">
            <path d="M20.6 20.6l4.8 4.8M25.4 20.6l-4.8 4.8" />
          </Badge>
        </>
      )
  }
}
