import { useState } from "react"
import { create } from "zustand"
import { Check, DialogButtons, DialogFrame, Label, Section } from "@/components/word-dialog"
import { PaneHeader } from "@/components/styles-pane"
import { MenuButton } from "@/components/ribbon/ribbon-button"
import { trackingLocked, useReviewStore, type DocumentProtection, type ProtectionEdit } from "@/document/review"
import { checkPassword, hashPassword } from "@/document/protection"
import { useDocumentStore } from "@/document/store"
import { useOptionsDialog } from "@/document/options-dialog"
import { useViewStore } from "@/document/view"
import { listChanges } from "@/editor/track-changes"
import { listComments } from "@/editor/comments"
import type { Editor } from "@tiptap/core"

/**
 * Review > Protect > Restrict Editing (Word's task pane), Track Changes > Lock Tracking, and Track Changes Options.
 * Protection is Word's: it keeps honest people from changing the document by mistake. The password is stored as a
 * salted hash in the file, and nothing is encrypted.
 */

type Dialog = "enforce" | "unprotect" | "lockTracking" | "unlockTracking" | "trackOptions" | null

export const useProtectDialogs = create<{ dialog: Dialog }>(() => ({ dialog: null }))

const openDialog = (dialog: Dialog) => useProtectDialogs.setState({ dialog })
const closeDialog = () => useProtectDialogs.setState({ dialog: null })

export const EDIT_CHOICES: { value: ProtectionEdit; label: string }[] = [
  { value: "trackedChanges", label: "Tracked changes" },
  { value: "comments", label: "Comments" },
  { value: "forms", label: "Filling in forms" },
  { value: "readOnly", label: "No changes (Read only)" },
]

const ALLOWED_TEXT: Record<ProtectionEdit, string> = {
  none: "You may edit this document, but formatting is limited to its styles.",
  trackedChanges: "You may edit this document, but all changes will be tracked.",
  comments: "You may only insert comments into this document.",
  forms: "You may only fill in forms in this region. This document has no form fields Inkspire can fill in.",
  readOnly: "This document is protected from unintentional editing. You may only view it.",
}

/** Changing the protection or Track Changes is a change to the document (Word saves both in it). */
function setProtection(protection: DocumentProtection | null) {
  useReviewStore.getState().set({ protection })
  useDocumentStore.setState({ isDirty: true })
}

export function toggleRestrictPane(open?: boolean) {
  const state = useReviewStore.getState()
  state.set({ restrictPane: open ?? !state.restrictPane })
}

export function RestrictEditingPane() {
  const open = useReviewStore((state) => state.restrictPane)
  const protection = useReviewStore((state) => state.protection)
  // The edit restriction's box and choice while not enforced; Word keeps the choice even when the box is cleared.
  const [editOn, setEditOn] = useState(false)
  const [edit, setEdit] = useState<ProtectionEdit>("readOnly")
  if (!open) {
    return null
  }
  const enforced = Boolean(protection?.enforced)
  const restricting = protection ? protection.edit !== "none" : editOn
  const choice = protection && protection.edit !== "none" ? protection.edit : edit
  const formatting = Boolean(protection?.formatting)
  const update = (next: { formatting?: boolean; editOn?: boolean; edit?: ProtectionEdit }) => {
    const nextEditOn = next.editOn ?? restricting
    const nextEdit = next.edit ?? choice
    const nextFormatting = next.formatting ?? formatting
    setEditOn(nextEditOn)
    setEdit(nextEdit)
    setProtection(
      nextEditOn || nextFormatting
        ? { edit: nextEditOn ? nextEdit : "none", enforced: false, formatting: nextFormatting }
        : null,
    )
  }
  return (
    <aside className="styles-pane restrict-pane" aria-label="Restrict Editing">
      <PaneHeader title="Restrict Editing" onClose={() => toggleRestrictPane(false)} />
      <div className="restrict-pane-body">
        <section>
          <h3>1. Formatting restrictions</h3>
          <Check
            id="restrict-formatting"
            text="Limit formatting to a selection of styles"
            letter="L"
            checked={formatting}
            disabled={enforced}
            onChange={(checked) => update({ formatting: checked })}
          />
          <p className="restrict-pane-note">Direct formatting (bold, fonts, colours) can't be applied; styles can.</p>
        </section>
        <section>
          <h3>2. Editing restrictions</h3>
          <Check
            id="restrict-editing"
            text="Allow only this type of editing in the document:"
            letter="A"
            checked={restricting}
            disabled={enforced}
            onChange={(checked) => update({ editOn: checked })}
          />
          <select
            aria-label="Type of editing allowed"
            value={choice}
            disabled={enforced || !restricting}
            onChange={(event) => update({ editOn: true, edit: event.target.value as ProtectionEdit })}
          >
            {EDIT_CHOICES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </section>
        <section>
          <h3>3. Start enforcement</h3>
          {enforced ? (
            <>
              <p className="restrict-pane-permissions">
                <strong>Your permissions</strong>
                <span>{ALLOWED_TEXT[protection!.edit]}</span>
              </p>
              <button type="button" className="dialog-btn" onClick={() => stopProtection()}>
                Stop Protection
              </button>
            </>
          ) : (
            <>
              <p className="restrict-pane-note">Are you ready to apply these settings? (You can turn them off later)</p>
              <button
                type="button"
                className="dialog-btn is-primary"
                disabled={!protection}
                onClick={() => openDialog("enforce")}
              >
                Yes, Start Enforcing Protection
              </button>
            </>
          )}
        </section>
      </div>
    </aside>
  )
}

/** Stop Protection: asks for the password when there is one. */
export function stopProtection() {
  const protection = useReviewStore.getState().protection
  if (!protection?.enforced) {
    return
  }
  if (protection.password) {
    openDialog("unprotect")
    return
  }
  setProtection({ ...protection, enforced: false, password: undefined, source: undefined })
}

/** Track Changes > Lock Tracking: on asks for a password to set, off for the password set. */
export function toggleLockTracking() {
  const state = useReviewStore.getState()
  if (trackingLocked(state)) {
    if (state.protection?.password) {
      openDialog("unlockTracking")
    } else {
      setProtection(null)
    }
    return
  }
  openDialog("lockTracking")
}

export function openTrackChangesOptions() {
  openDialog("trackOptions")
}

export function ProtectDialogsHost({ editor }: { editor: Editor | null }) {
  const dialog = useProtectDialogs((state) => state.dialog)
  if (dialog === "enforce" || dialog === "lockTracking") {
    return <SetPasswordDialog lockTracking={dialog === "lockTracking"} onClose={closeDialog} />
  }
  if (dialog === "unprotect" || dialog === "unlockTracking") {
    return <CheckPasswordDialog unlockTracking={dialog === "unlockTracking"} onClose={closeDialog} />
  }
  if (dialog === "trackOptions") {
    return <TrackChangesOptionsDialog editor={editor} onClose={closeDialog} />
  }
  return null
}

function SetPasswordDialog({ lockTracking, onClose }: { lockTracking: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("")
  const [again, setAgain] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const accept = async () => {
    if (password !== again) {
      setError("The passwords don't match.")
      return
    }
    setBusy(true)
    const hash = password ? await hashPassword(password) : undefined
    const current = useReviewStore.getState().protection
    const next: DocumentProtection = lockTracking
      ? { edit: "trackedChanges", enforced: true, formatting: false, password: hash }
      : { edit: current?.edit ?? "none", enforced: true, formatting: Boolean(current?.formatting), password: hash }
    setProtection(next)
    if (next.edit === "trackedChanges") {
      useReviewStore.getState().setTracking(true)
    }
    onClose()
  }
  const title = lockTracking ? "Lock Tracking" : "Start Enforcing Protection"
  return (
    <DialogFrame title={title} width={360} onClose={onClose} onSubmit={() => void accept()}>
      <div className="password-dialog">
        <p>
          {lockTracking
            ? "Prevent other authors from turning off Track Changes."
            : "The document is not encrypted. Anyone can open it, but only the password turns protection off."}
        </p>
        <Section title="Password (optional)">
          <div className="password-dialog-grid">
            <Label htmlFor="protect-password" text="Enter new password:" letter="E" />
            <input
              id="protect-password"
              type="password"
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError("")
              }}
            />
            <Label htmlFor="protect-again" text="Reenter password to confirm:" letter="p" />
            <input
              id="protect-again"
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(event) => {
                setAgain(event.target.value)
                setError("")
              }}
            />
          </div>
        </Section>
        {error ? (
          <p className="style-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <DialogButtons submit okDisabled={busy} ok={busy ? "Protecting…" : "OK"} onCancel={onClose} />
    </DialogFrame>
  )
}

function CheckPasswordDialog({ unlockTracking, onClose }: { unlockTracking: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [legacy, setLegacy] = useState(false)
  const [busy, setBusy] = useState(false)
  const stop = () => {
    const protection = useReviewStore.getState().protection
    setProtection(
      unlockTracking || !protection ? null : { ...protection, enforced: false, password: undefined, source: undefined },
    )
    onClose()
  }
  const accept = async () => {
    const stored = useReviewStore.getState().protection?.password
    if (!stored) {
      stop()
      return
    }
    setBusy(true)
    const result = await checkPassword(password, stored)
    setBusy(false)
    if (result === true) {
      stop()
    } else if (result === "unknown") {
      setLegacy(true)
    } else {
      setError("The password is incorrect.")
    }
  }
  const title = unlockTracking ? "Unlock Tracking" : "Unprotect Document"
  return (
    <DialogFrame title={title} width={340} onClose={onClose} onSubmit={() => void (legacy ? stop() : accept())}>
      <div className="password-dialog">
        {legacy ? (
          <p role="alert">
            This password was set by an older version of Word, which hashes it in a way Inkspire can't check. Stop
            protection anyway?
          </p>
        ) : (
          <div className="password-dialog-grid">
            <Label htmlFor="unprotect-password" text="Password:" letter="P" />
            <input
              id="unprotect-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError("")
              }}
            />
          </div>
        )}
        {error ? (
          <p className="style-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <DialogButtons
        submit
        okDisabled={busy}
        ok={legacy ? (unlockTracking ? "Unlock" : "Stop Protection") : "OK"}
        onCancel={onClose}
      />
    </DialogFrame>
  )
}

function TrackChangesOptionsDialog({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const review = useReviewStore.getState()
  const [comments, setComments] = useState(review.showComments)
  const [ink, setInk] = useState(!useViewStore.getState().hideInk)
  const [insertions, setInsertions] = useState(review.showInsertions)
  const [formatting, setFormatting] = useState(review.showFormatting)
  const [pane, setPane] = useState(review.panel)
  const accept = () => {
    const state = useReviewStore.getState()
    state.setShowComments(comments)
    state.set({ showInsertions: insertions, showFormatting: formatting })
    state.setPanel(pane)
    useViewStore.getState().setHideInk(!ink)
    onClose()
  }
  const counts = editor
    ? { changes: listChanges(editor.state.doc).length, comments: listComments(editor.state.doc).length }
    : null
  return (
    <DialogFrame title="Track Changes Options" width={400} onClose={onClose} onSubmit={accept}>
      <div className="track-options-dialog">
        <Section title="Show">
          <div className="track-options-checks">
            <Check id="track-show-comments" text="Comments" letter="C" checked={comments} onChange={setComments} />
            <Check id="track-show-ink" text="Ink" letter="k" checked={ink} onChange={setInk} />
            <Check
              id="track-show-insertions"
              text="Insertions and Deletions"
              letter="D"
              checked={insertions}
              onChange={setInsertions}
            />
            <Check
              id="track-show-formatting"
              text="Formatting"
              letter="F"
              checked={formatting}
              onChange={setFormatting}
            />
          </div>
          <div className="track-options-grid">
            <Label htmlFor="track-pane" text="Reviewing Pane:" letter="P" />
            <select
              id="track-pane"
              value={pane ? "vertical" : "off"}
              onChange={(event) => setPane(event.target.value !== "off")}
            >
              <option value="off">Off</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>
        </Section>
        {counts ? (
          <p className="restrict-pane-note">
            This document has {counts.changes} tracked {counts.changes === 1 ? "change" : "changes"} and{" "}
            {counts.comments} {counts.comments === 1 ? "comment" : "comments"}.
          </p>
        ) : null}
      </div>
      <DialogButtons submit onCancel={onClose}>
        <button
          type="button"
          className="dialog-btn"
          onClick={() => {
            onClose()
            useOptionsDialog.getState().openOptions("general")
          }}
        >
          Change User Name…
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}

/** Track Changes' menu: For Everyone, Just Mine, Lock Tracking. */
export function TrackChangesMenu({ close }: { close: () => void }) {
  const trackFor = useReviewStore((state) => state.trackFor)
  const locked = useReviewStore(trackingLocked)
  const tracking = useReviewStore((state) => state.tracking)
  const turnOn = (who: "everyone" | "mine") => {
    const state = useReviewStore.getState()
    state.set({ trackFor: who })
    state.setTracking(true)
    close()
  }
  return (
    <div className="flex w-52 flex-col">
      <MenuButton selected={tracking && trackFor === "everyone"} onClick={() => turnOn("everyone")}>
        For Everyone
      </MenuButton>
      <MenuButton selected={tracking && trackFor === "mine"} onClick={() => turnOn("mine")}>
        Just Mine
      </MenuButton>
      <MenuButton
        selected={locked}
        onClick={() => {
          close()
          toggleLockTracking()
        }}
      >
        Lock Tracking
      </MenuButton>
    </div>
  )
}

/**
 * Show Markup: which markup is drawn and whose changes. Word's Balloons choices are left out: changes here are drawn
 * in the text and listed in the Reviewing Pane, never in balloons.
 */
export function ShowMarkupMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const review = useReviewStore()
  const hideInk = useViewStore((state) => state.hideInk)
  const authors = editor ? reviewersOf(editor) : []
  const hidden = new Set(review.hiddenAuthors)
  const toggle = (label: string, checked: boolean, onClick: () => void) => (
    <MenuButton selected={checked} onClick={onClick}>
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={checked} readOnly tabIndex={-1} className="pointer-events-none" />
        {label}
      </span>
    </MenuButton>
  )
  return (
    <div className="flex w-60 flex-col">
      {toggle("Comments", review.showComments, () => review.setShowComments(!review.showComments))}
      {toggle("Ink", !hideInk, () => useViewStore.getState().setHideInk(!hideInk))}
      {toggle("Insertions and Deletions", review.showInsertions, () =>
        review.set({ showInsertions: !review.showInsertions }),
      )}
      {toggle("Formatting", review.showFormatting, () => review.set({ showFormatting: !review.showFormatting }))}
      <div className="break-menu-heading">Specific People</div>
      {toggle("All Reviewers", hidden.size === 0, () => review.set({ hiddenAuthors: hidden.size ? [] : authors }))}
      {authors.map((author) => (
        <span key={author}>
          {toggle(author, !hidden.has(author), () =>
            review.set({
              hiddenAuthors: hidden.has(author)
                ? review.hiddenAuthors.filter((name) => name !== author)
                : [...review.hiddenAuthors, author],
            }),
          )}
        </span>
      ))}
      <MenuButton
        onClick={() => {
          close()
          openTrackChangesOptions()
        }}
      >
        Track Changes Options…
      </MenuButton>
    </div>
  )
}

/** Everyone with a tracked change in the document, in the order they first appear. */
export function reviewersOf(editor: Editor) {
  return [...new Set(listChanges(editor.state.doc).map((change) => change.author || "Me"))]
}
