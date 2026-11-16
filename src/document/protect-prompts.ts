import { create } from "zustand"

/**
 * The questions Protect Document asks, as Word asks them: the password of an encrypted file being opened, whether to
 * open a file read-only when its author recommends it, the password to encrypt with, and Mark as Final's notice.
 */
export type ReadOnlyAnswer = "yes" | "no" | "cancel"

type Prompt =
  | { kind: "open-password"; fileName: string; resolve: (password: string | null) => void }
  | { kind: "read-only"; fileName: string; resolve: (answer: ReadOnlyAnswer) => void }
  | { kind: "encrypt" }
  | { kind: "mark-final"; resolve: (ok: boolean) => void }
  | { kind: "notice"; title: string; text: string }

type ProtectPromptState = {
  prompt: Prompt | null
  close: () => void
}

export const useProtectPrompts = create<ProtectPromptState>((set) => ({
  prompt: null,
  close: () => set({ prompt: null }),
}))

/** Settles whatever was being asked (as Cancel) before something else is asked. */
function replace(next: Prompt) {
  const current = useProtectPrompts.getState().prompt
  if (current?.kind === "open-password") {
    current.resolve(null)
  } else if (current?.kind === "read-only") {
    current.resolve("cancel")
  } else if (current?.kind === "mark-final") {
    current.resolve(false)
  }
  useProtectPrompts.setState({ prompt: next })
}

function settle<T>(resolve: (value: T) => void) {
  return (value: T) => {
    useProtectPrompts.setState({ prompt: null })
    resolve(value)
  }
}

/** Word's Password dialog for an encrypted file; null on Cancel. */
export function askOpenPassword(fileName: string) {
  return new Promise<string | null>((resolve) => replace({ kind: "open-password", fileName, resolve: settle(resolve) }))
}

/** "The author would like you to open this as read-only…": Yes, No or Cancel. */
export function askOpenReadOnly(fileName: string) {
  return new Promise<ReadOnlyAnswer>((resolve) => replace({ kind: "read-only", fileName, resolve: settle(resolve) }))
}

/** "This document will be marked as final and then saved." */
export function askMarkAsFinal() {
  return new Promise<boolean>((resolve) => replace({ kind: "mark-final", resolve: settle(resolve) }))
}

export function openEncryptDialog() {
  replace({ kind: "encrypt" })
}

export function showProtectNotice(title: string, text: string) {
  replace({ kind: "notice", title, text })
}
