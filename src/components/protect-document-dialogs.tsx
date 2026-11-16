import { DialogButtons, DialogFrame, Label } from "@/components/word-dialog"
import { useFileProtection } from "@/document/file-protection"
import { useProtectPrompts } from "@/document/protect-prompts"
import { useState } from "react"

const CAUTION =
  "Caution: If you lose or forget the password, it cannot be recovered. It is advisable to keep a list of passwords " +
  "and their corresponding document names in a safe place. (Remember that passwords are case-sensitive.)"

/** The dialogs of File > Info > Protect Document, and the Password dialog for opening an encrypted file. */
export function ProtectDocumentDialogs() {
  const prompt = useProtectPrompts((state) => state.prompt)
  const close = useProtectPrompts((state) => state.close)
  if (!prompt) {
    return null
  }
  switch (prompt.kind) {
    case "open-password":
      return <OpenPasswordDialog fileName={prompt.fileName} onDone={prompt.resolve} />
    case "read-only":
      return (
        <DialogFrame title="Inkspire" width={460} level={120} onClose={() => prompt.resolve("cancel")}>
          <p className="text-[13px]">
            The author would like you to open &lsquo;{prompt.fileName}&rsquo; as read-only, unless you need to make
            changes. Open as read-only?
          </p>
          <div className="word-dialog-actions">
            <span className="flex-1" />
            <button type="button" className="dialog-btn is-primary" autoFocus onClick={() => prompt.resolve("yes")}>
              Yes
            </button>
            <button type="button" className="dialog-btn" onClick={() => prompt.resolve("no")}>
              No
            </button>
            <button type="button" className="dialog-btn" onClick={() => prompt.resolve("cancel")}>
              Cancel
            </button>
          </div>
        </DialogFrame>
      )
    case "mark-final":
      return (
        <DialogFrame title="Inkspire" width={420} level={120} onClose={() => prompt.resolve(false)}>
          <p className="text-[13px]">This document will be marked as final and then saved.</p>
          <DialogButtons onOk={() => prompt.resolve(true)} onCancel={() => prompt.resolve(false)} />
        </DialogFrame>
      )
    case "notice":
      return (
        <DialogFrame title={prompt.title} width={420} level={120} onClose={close}>
          <p className="text-[13px]">{prompt.text}</p>
          <div className="word-dialog-actions">
            <span className="flex-1" />
            <button type="button" className="dialog-btn is-primary" autoFocus onClick={close}>
              OK
            </button>
          </div>
        </DialogFrame>
      )
    case "encrypt":
      return <EncryptDialog onClose={close} />
  }
}

function OpenPasswordDialog({ fileName, onDone }: { fileName: string; onDone: (password: string | null) => void }) {
  const [password, setPassword] = useState("")
  return (
    <DialogFrame
      title="Password"
      width={340}
      level={120}
      onClose={() => onDone(null)}
      onSubmit={(event) => {
        event.preventDefault()
        onDone(password)
      }}
    >
      <p className="text-[13px]">Enter password to open file</p>
      <p className="protect-file-name" title={fileName}>
        {fileName}
      </p>
      <input
        id="open-password"
        aria-label="Password"
        className="word-dialog-text w-full"
        type="password"
        autoFocus
        autoComplete="off"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <DialogButtons submit onCancel={() => onDone(null)} />
    </DialogFrame>
  )
}

/**
 * Encrypt Document, then Confirm Password, as Word asks twice. An empty password takes the encryption off; the change
 * is written by the next save.
 */
function EncryptDialog({ onClose }: { onClose: () => void }) {
  const current = useFileProtection((state) => state.password)
  const setPassword = useFileProtection((state) => state.setPassword)
  const [password, setValue] = useState(current ?? "")
  const [confirming, setConfirming] = useState(false)
  const [again, setAgain] = useState("")
  const [mismatch, setMismatch] = useState(false)
  if (confirming) {
    return (
      <DialogFrame
        title="Confirm Password"
        width={360}
        level={120}
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault()
          if (again !== password) {
            setMismatch(true)
            return
          }
          setPassword(password)
          onClose()
        }}
      >
        <p className="text-[13px] font-semibold">Encrypt the contents of this file</p>
        <div className="mt-2">
          <Label htmlFor="confirm-password" text="Reenter password:" letter="R" />
        </div>
        <input
          id="confirm-password"
          className="word-dialog-text mt-1 w-full"
          type="password"
          autoFocus
          autoComplete="new-password"
          value={again}
          onChange={(event) => {
            setAgain(event.target.value)
            setMismatch(false)
          }}
        />
        {mismatch ? (
          <p className="protect-warning" role="alert">
            The passwords do not match. Type the same password in both boxes.
          </p>
        ) : null}
        <p className="protect-caution">{CAUTION}</p>
        <DialogButtons submit onCancel={onClose} />
      </DialogFrame>
    )
  }
  return (
    <DialogFrame
      title="Encrypt Document"
      width={360}
      level={120}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        if (!password) {
          // Clearing the box takes the password off, as in Word.
          if (current) {
            setPassword(null)
          }
          onClose()
          return
        }
        setConfirming(true)
      }}
    >
      <p className="text-[13px] font-semibold">Encrypt the contents of this file</p>
      <div className="mt-2">
        <Label htmlFor="encrypt-password" text="Password:" letter="P" />
      </div>
      <input
        id="encrypt-password"
        className="word-dialog-text mt-1 w-full"
        type="password"
        autoFocus
        autoComplete="new-password"
        value={password}
        onChange={(event) => setValue(event.target.value)}
      />
      <p className="protect-caution">{CAUTION}</p>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
