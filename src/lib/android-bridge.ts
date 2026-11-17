/**
 * What Android itself does for Inkspire, through MainActivity's `window.InkspireFiles`: print (and Save as PDF) with
 * the print service, share a copy through the share sheet, and open documents other apps send. Absent on the
 * desktop and in the browser, where each caller keeps its own way.
 */
type AndroidServices = {
  print(jobName: string): void
  share(name: string, mimeType: string, base64: string): void
  ready(): void
  quit(): void
  renameDocument(uri: string, name: string): string | null
}

export function androidServices(): Partial<AndroidServices> | null {
  return (globalThis as { InkspireFiles?: Partial<AndroidServices> }).InkspireFiles ?? null
}

/** Prints through Android; `done` runs once the print dialog is closed, printed or saved as PDF. */
export function androidPrint(jobName: string, done: () => void) {
  const services = androidServices()
  if (!services?.print) {
    return false
  }
  const host = globalThis as { __inkspirePrinted?: () => void }
  host.__inkspirePrinted = () => {
    delete host.__inkspirePrinted
    done()
  }
  services.print(jobName)
  return true
}

export function androidShare(name: string, mimeType: string, bytes: Uint8Array) {
  const services = androidServices()
  if (!services?.share) {
    return false
  }
  services.share(name, mimeType, toBase64(bytes))
  return true
}

/**
 * Renames a document picked on Android (a content link) in its place. The new link; null where that place does not
 * rename; undefined off Android.
 */
export function androidRename(uri: string, name: string): string | null | undefined {
  const services = androidServices()
  if (!services?.renameDocument || !uri.startsWith("content:")) {
    return undefined
  }
  return services.renameDocument(uri, name) || null
}

/** Opens what other apps send ("Open with Inkspire"), the one that started the app first. */
export function listenForAndroidOpen(open: (uri: string) => void) {
  const services = androidServices()
  if (!services?.ready) {
    return
  }
  ;(globalThis as { __inkspireOpen?: (uri: string) => void }).__inkspireOpen = open
  services.ready()
}

export function toBase64(bytes: Uint8Array) {
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}
