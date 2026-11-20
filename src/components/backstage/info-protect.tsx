import { toggleRestrictPane } from "@/components/protect-pane"
import { useBackstage } from "@/document/backstage"
import { openVersion, restoreVersion, saveDocument } from "@/document/commands"
import { useFileProtection } from "@/document/file-protection"
import { askMarkAsFinal, openEncryptDialog, showProtectNotice } from "@/document/protect-prompts"
import { listRecoveryOffers } from "@/document/recovery"
import { useReviewStore } from "@/document/review"
import { useDocumentStore } from "@/document/store"
import { deleteVersions, listVersions, VERSIONS_KEPT, type VersionSummary } from "@/document/versions"
import { BadgeCheck, ChevronDown, FileClock, FileLock, History, KeyRound, Lock, LockKeyhole } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

type MenuItem = { id: string; icon: ReactNode; title: string; detail: string; on?: boolean; run: () => void }

/** A card on Info whose button opens a menu of large items, as Word's Protect Document and Manage Document do. */
function CardMenu({
  icon,
  title,
  label,
  description,
  lines,
  items,
  highlighted = false,
}: {
  icon: ReactNode
  title: string
  label: string
  description: string
  lines: string[]
  items: MenuItem[]
  highlighted?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [open])
  return (
    <div className={`backstage-info-row${highlighted ? " is-flagged" : ""}`} ref={ref}>
      <div className="backstage-info-trigger-wrap">
        <button
          type="button"
          className="backstage-info-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="backstage-info-trigger-icon">{icon}</span>
          <span className="backstage-info-trigger-label">
            {label}
            <ChevronDown className="size-3" strokeWidth={2} />
          </span>
        </button>
        {open ? (
          <div className="backstage-info-menu" role="menu" aria-label={label}>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`backstage-info-menu-item${item.on ? " is-on" : ""}`}
                aria-pressed={item.on}
                onClick={() => {
                  setOpen(false)
                  item.run()
                }}
              >
                <span className="backstage-info-menu-icon">{item.icon}</span>
                <span className="min-w-0">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="backstage-info-text">
        <h3>{title}</h3>
        <p>{description}</p>
        {lines.map((line) => (
          <p key={line} className="backstage-info-flag">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

async function toggleMarkAsFinal() {
  const { markedFinal, setMarkedFinal } = useFileProtection.getState()
  if (markedFinal) {
    setMarkedFinal(false)
    return
  }
  if (!(await askMarkAsFinal())) {
    return
  }
  setMarkedFinal(true)
  saveDocument()
}

/** Info > Protect Document. */
export function ProtectDocumentCard() {
  const password = useFileProtection((state) => state.password)
  const readOnlyRecommended = useFileProtection((state) => state.readOnlyRecommended)
  const markedFinal = useFileProtection((state) => state.markedFinal)
  const signatures = useFileProtection((state) => state.signatures)
  const setReadOnlyRecommended = useFileProtection((state) => state.setReadOnlyRecommended)
  const restricted = useReviewStore((state) => Boolean(state.protection?.enforced && state.protection.edit !== "none"))
  const lines = [
    password ? "A password is required to open this document." : "",
    markedFinal ? "This document has been marked as final to discourage editing." : "",
    readOnlyRecommended ? "Readers are asked to open this document read-only." : "",
    restricted ? "Certain types of changes are restricted in this document." : "",
    signatures
      ? `This document has ${signatures === 1 ? "a digital signature" : `${signatures} digital signatures`}. Saving it here removes them, as editing it in Word does.`
      : "",
  ].filter(Boolean)
  const close = () => useBackstage.getState().closeBackstage()
  return (
    <CardMenu
      icon={<Lock className="size-7" strokeWidth={1.5} />}
      label="Protect Document"
      title="Protect Document"
      description="Control what types of changes people can make to this document."
      lines={lines}
      highlighted={lines.length > 0}
      items={[
        {
          id: "read-only",
          icon: <FileLock className="size-6" strokeWidth={1.5} />,
          title: "Always Open Read-Only",
          detail: "Prevent accidental changes by asking readers to opt-in to editing.",
          on: readOnlyRecommended,
          run: () => setReadOnlyRecommended(!readOnlyRecommended),
        },
        {
          id: "encrypt",
          icon: <KeyRound className="size-6" strokeWidth={1.5} />,
          title: "Encrypt with Password",
          detail: "Password-protect this document.",
          on: Boolean(password),
          run: openEncryptDialog,
        },
        {
          id: "restrict",
          icon: <LockKeyhole className="size-6" strokeWidth={1.5} />,
          title: "Restrict Editing",
          detail: "Control what types of changes others can make.",
          on: restricted,
          run: () => {
            toggleRestrictPane(true)
            close()
          },
        },
        {
          id: "final",
          icon: <BadgeCheck className="size-6" strokeWidth={1.5} />,
          title: "Mark as Final",
          detail: "Let readers know the document is final.",
          on: markedFinal,
          run: () => void toggleMarkAsFinal(),
        },
      ]}
    />
  )
}

/** Manage Document > Recover Unsaved Documents: the Unsaved Documents pane, with the drafts kept for recovery. */
export async function recoverUnsavedDocuments() {
  const offers = await listRecoveryOffers()
  if (!offers.length) {
    showProtectNotice("Recover Unsaved Documents", "There are no unsaved documents to recover.")
    return
  }
  useBackstage.getState().closeBackstage()
  window.dispatchEvent(new Event("aiword-recovery-show"))
}

/** Info > Manage Document. */
export function ManageDocumentCard() {
  const isDirty = useDocumentStore((state) => state.isDirty)
  return (
    <CardMenu
      icon={<FileClock className="size-7" strokeWidth={1.5} />}
      label="Manage Document"
      title="Manage Document"
      description={isDirty ? "There are unsaved changes." : "There are no unsaved changes."}
      lines={[]}
      items={[
        {
          id: "recover",
          icon: <FileClock className="size-6" strokeWidth={1.5} />,
          title: "Recover Unsaved Documents",
          detail: "Browse recent copies of unsaved files.",
          run: () => void recoverUnsavedDocuments(),
        },
      ]}
    />
  )
}

/** Info > Version History: opens History. */
export function VersionHistoryCard() {
  return (
    <div className="backstage-info-row">
      <div className="backstage-info-trigger-wrap">
        <button
          type="button"
          className="backstage-info-trigger"
          onClick={() => useBackstage.getState().setTab("history")}
        >
          <span className="backstage-info-trigger-icon">
            <History className="size-7" strokeWidth={1.5} />
          </span>
          <span className="backstage-info-trigger-label">Version History</span>
        </button>
      </div>
      <div className="backstage-info-text">
        <h3>Version History</h3>
        <p>View and restore previous versions.</p>
      </div>
    </div>
  )
}

function useVersions(file: string | null) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null)
  useEffect(() => {
    let live = true
    const load = () => void listVersions(file).then((next) => live && setVersions(next))
    load()
    window.addEventListener("aiword-versions-changed", load)
    return () => {
      live = false
      window.removeEventListener("aiword-versions-changed", load)
    }
  }, [file])
  return versions
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** File > History: the versions kept of this file, each saved copy with its time and author, newest first. */
export function HistoryView() {
  const path = useDocumentStore((state) => state.currentFilePath)
  const versions = useVersions(path)
  const [confirmClear, setConfirmClear] = useState(false)
  const groups = new Map<string, VersionSummary[]>()
  for (const version of versions ?? []) {
    const day = new Date(version.savedAt).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    groups.set(day, [...(groups.get(day) ?? []), version])
  }
  return (
    <div className="backstage-pane">
      <h1 className="backstage-greeting">History</h1>
      <p className="backstage-muted history-intro">
        Every time this document is saved, a copy is kept here, so an earlier version can be opened or restored. The
        last {VERSIONS_KEPT} versions are kept, on this computer only.
      </p>
      {!path ? (
        <p className="backstage-empty">Save the document to start keeping its versions.</p>
      ) : versions === null ? null : versions.length === 0 ? (
        <p className="backstage-empty">No versions yet. A version is kept each time you save this document.</p>
      ) : (
        <div className="history-list">
          {[...groups].map(([day, items]) => (
            <section key={day} className="history-day">
              <h2 className="backstage-card-title">{day}</h2>
              {items.map((version, index) => (
                <div key={version.id} className="history-row">
                  <div className="min-w-0">
                    <strong>
                      {new Date(version.savedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      {day === [...groups.keys()][0] && index === 0 ? (
                        <span className="history-current">Current</span>
                      ) : null}
                    </strong>
                    <span>
                      {version.author || "Unknown author"} · {formatSize(version.size)}
                    </span>
                  </div>
                  <div className="history-actions">
                    <button
                      type="button"
                      className="backstage-secondary-btn"
                      onClick={() => void openVersion(version.id)}
                    >
                      Open version
                    </button>
                    {day === [...groups.keys()][0] && index === 0 ? null : (
                      <button
                        type="button"
                        className="backstage-secondary-btn"
                        onClick={() => void restoreVersion(version.id)}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          ))}
          <div className="history-clear">
            {confirmClear ? (
              <>
                <span>Delete every kept version of this document? The document itself stays as it is.</span>
                <button
                  type="button"
                  className="backstage-secondary-btn"
                  onClick={() => {
                    setConfirmClear(false)
                    void deleteVersions(path)
                  }}
                >
                  Delete versions
                </button>
                <button type="button" className="backstage-secondary-btn" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="backstage-link" onClick={() => setConfirmClear(true)}>
                Delete all versions…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
