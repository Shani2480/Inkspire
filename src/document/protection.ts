import type { DocumentProtection, ProtectionHash } from "@/document/review"

/**
 * Restrict Editing's password, as Word keeps it in w:documentProtection: never the password, only a salted hash
 * repeated `spinCount` times (ISO/IEC 29500: H0 = H(salt + password as UTF-16LE), Hn = H(Hn-1 + n as 4 bytes LE)).
 * Like Word's, it stops casual edits; it does not encrypt the document.
 */

const SPIN_COUNT = 100000

function utf16(text: string) {
  const bytes = new Uint8Array(text.length * 2)
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    bytes[index * 2] = code & 0xff
    bytes[index * 2 + 1] = code >> 8
  }
  return bytes
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

function fromBase64(text: string) {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
  } catch {
    return new Uint8Array()
  }
}

function join(left: Uint8Array, right: Uint8Array) {
  const out = new Uint8Array(left.length + right.length)
  out.set(left)
  out.set(right, left.length)
  return out
}

const DIGESTS: Record<string, string> = {
  "SHA-512": "SHA-512",
  "SHA-384": "SHA-384",
  "SHA-256": "SHA-256",
  "SHA-1": "SHA-1",
}

async function iterate(algorithm: string, salt: Uint8Array, password: string, spinCount: number) {
  const digest = DIGESTS[algorithm.toUpperCase()]!
  let hash = new Uint8Array(await crypto.subtle.digest(digest, join(salt, utf16(password))))
  const counter = new Uint8Array(4)
  for (let index = 0; index < spinCount; index += 1) {
    counter[0] = index & 0xff
    counter[1] = (index >>> 8) & 0xff
    counter[2] = (index >>> 16) & 0xff
    counter[3] = (index >>> 24) & 0xff
    hash = new Uint8Array(await crypto.subtle.digest(digest, join(hash, counter)))
  }
  return hash
}

/** A new hash for the password (Word's SHA-512 with 100 000 spins and a random 16-byte salt). */
export async function hashPassword(password: string, spinCount = SPIN_COUNT): Promise<ProtectionHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return {
    algorithm: "SHA-512",
    hash: toBase64(await iterate("SHA-512", salt, password, spinCount)),
    salt: toBase64(salt),
    spinCount,
  }
}

/**
 * Whether the password matches: true or false, or "unknown" for the legacy form Word 2007–2019 write (it hashes a key
 * derived from the password with tables this app does not carry), so the caller can say it cannot check it.
 */
export async function checkPassword(password: string, stored: ProtectionHash): Promise<boolean | "unknown"> {
  if (!DIGESTS[stored.algorithm.toUpperCase()]) {
    return "unknown"
  }
  const hash = await iterate(stored.algorithm, fromBase64(stored.salt), password, stored.spinCount)
  return toBase64(hash) === stored.hash
}

/** The w:documentProtection element for the protection, or Word's own when it is what was read. */
export function protectionXml(protection: DocumentProtection | null | undefined) {
  if (!protection) {
    return ""
  }
  if (protection.source) {
    try {
      const attributes = JSON.parse(protection.source) as Record<string, string>
      const on = (value: string | undefined) => value === "1" || value === "true" || value === "on"
      const same =
        attributes.edit === protection.edit &&
        on(attributes.enforcement) === protection.enforced &&
        on(attributes.formatting) === protection.formatting &&
        (attributes.hashValue ?? attributes.hash) === protection.password?.hash
      if (same) {
        return `<w:documentProtection ${Object.entries(attributes)
          .map(([name, value]) => `w:${name}="${escape(value)}"`)
          .join(" ")}/>`
      }
    } catch {
      // Not from Word: written below.
    }
  }
  const attributes = [
    `w:edit="${protection.edit}"`,
    protection.formatting ? `w:formatting="1"` : "",
    `w:enforcement="${protection.enforced ? 1 : 0}"`,
  ]
  const password = protection.password
  if (password && DIGESTS[password.algorithm.toUpperCase()]) {
    attributes.push(
      `w:algorithmName="${escape(password.algorithm)}"`,
      `w:hashValue="${escape(password.hash)}"`,
      `w:saltValue="${escape(password.salt)}"`,
      `w:spinCount="${password.spinCount}"`,
    )
  }
  return `<w:documentProtection ${attributes.filter(Boolean).join(" ")}/>`
}

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}
