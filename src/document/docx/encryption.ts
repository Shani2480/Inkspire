/**
 * File > Info > Protect Document > Encrypt with Password, as Word does it (MS-OFFCRYPTO "Agile" encryption): the
 * .docx is encrypted with AES-256 and put in a compound file with the key's description, from which only the
 * password gets it back. Word 2010 and later write this, and read it.
 */

import { isCompoundFile, readCompoundFile, writeCompoundFile, type CfbStreams } from "@/document/docx/cfb"
import { sha512 } from "@/document/docx/sha512"

export class EncryptionError extends Error {
  override name = "EncryptionError"
  constructor(
    message: string,
    readonly code: "wrong-password" | "unsupported" | "damaged",
  ) {
    super(message)
  }
}

const SEGMENT = 4096
const SPIN_COUNT = 100_000
const BLOCK_VERIFIER_INPUT = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79])
const BLOCK_VERIFIER_VALUE = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e])
const BLOCK_KEY = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6])
const BLOCK_HMAC_KEY = new Uint8Array([0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6])
const BLOCK_HMAC_VALUE = new Uint8Array([0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33])

const PASSWORD_URI = "http://schemas.microsoft.com/office/2006/keyEncryptor/password"

/** A compound file that holds an encrypted package (rather than an old .doc). */
export function isEncryptedPackage(bytes: Uint8Array) {
  if (!isCompoundFile(bytes)) {
    return false
  }
  try {
    const streams = readCompoundFile(bytes)
    return streams.has("EncryptionInfo") && streams.has("EncryptedPackage")
  } catch {
    return false
  }
}

function subtle() {
  const api = globalThis.crypto?.subtle
  if (!api) {
    throw new EncryptionError("This system cannot encrypt files.", "unsupported")
  }
  return api
}

function random(length: number) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

function utf16(text: string) {
  const out = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i += 1) {
    out[i * 2] = text.charCodeAt(i) & 0xff
    out[i * 2 + 1] = text.charCodeAt(i) >> 8
  }
  return out
}

function le32(value: number) {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

/** Cut to `length`, or padded with `fill` up to it, as the spec sizes keys and IVs. */
function fit(bytes: Uint8Array, length: number, fill = 0x36) {
  if (bytes.length >= length) {
    return bytes.slice(0, length)
  }
  const out = new Uint8Array(length).fill(fill)
  out.set(bytes)
  return out
}

function padTo(bytes: Uint8Array, block: number) {
  if (bytes.length % block === 0) {
    return bytes
  }
  const out = new Uint8Array(Math.ceil(bytes.length / block) * block)
  out.set(bytes)
  return out
}

/** The password hashed with the salt, SPIN_COUNT times: what every key of the file is made from. */
function passwordHash(password: string, salt: Uint8Array, spinCount: number) {
  let hash = sha512(salt, utf16(password))
  const counter = new Uint8Array(4)
  const view = new DataView(counter.buffer)
  for (let i = 0; i < spinCount; i += 1) {
    view.setUint32(0, i, true)
    hash = sha512(counter, hash)
  }
  return hash
}

async function aesKey(raw: Uint8Array) {
  return subtle().importKey("raw", raw as BufferSource, "AES-CBC", false, ["encrypt", "decrypt"])
}

/** AES-CBC without padding (the input is a whole number of blocks); WebCrypto always pads, so the pad is cut off. */
async function encryptBlocks(key: CryptoKey, iv: Uint8Array, data: Uint8Array) {
  const out = new Uint8Array(
    await subtle().encrypt({ name: "AES-CBC", iv: iv as BufferSource }, key, padTo(data, 16) as BufferSource),
  )
  return out.subarray(0, out.length - 16)
}

/** AES-CBC without padding: a block that decrypts to a full pad is added, so WebCrypto finds the padding it expects. */
async function decryptBlocks(key: CryptoKey, iv: Uint8Array, data: Uint8Array) {
  if (data.length === 0 || data.length % 16) {
    throw new EncryptionError("The encrypted data is damaged.", "damaged")
  }
  const last = data.subarray(data.length - 16)
  const pad = new Uint8Array(16).fill(16)
  const extra = (await subtle().encrypt({ name: "AES-CBC", iv: last as BufferSource }, key, pad as BufferSource)).slice(
    0,
    16,
  )
  const joined = new Uint8Array(data.length + 16)
  joined.set(data)
  joined.set(new Uint8Array(extra), data.length)
  return new Uint8Array(
    await subtle().decrypt({ name: "AES-CBC", iv: iv as BufferSource }, key, joined as BufferSource),
  )
}

function base64(bytes: Uint8Array) {
  let text = ""
  for (const byte of bytes) {
    text += String.fromCharCode(byte)
  }
  return btoa(text)
}

function fromBase64(text: string) {
  const raw = atob(text.replace(/\s+/g, ""))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i)
  }
  return out
}

function unicodeLp(text: string) {
  const body = utf16(text)
  const out = new Uint8Array(4 + Math.ceil(body.length / 4) * 4)
  out.set(le32(body.length))
  out.set(body, 4)
  return out
}

function join(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The \u0006DataSpaces storage Word writes beside the encrypted package (MS-OFFCRYPTO 2.1). */
function dataSpaces(): CfbStreams {
  const version1 = new Uint8Array([1, 0, 0, 0])
  const version = join(unicodeLp("Microsoft.Container.DataSpaces"), version1, version1, version1)
  const entry = join(le32(1), le32(0), unicodeLp("EncryptedPackage"), unicodeLp("StrongEncryptionDataSpace"))
  const map = join(le32(8), le32(1), le32(entry.length + 4), entry)
  const definition = join(le32(8), le32(1), unicodeLp("StrongEncryptionTransform"))
  const id = utf16("{FF9A3F03-56EF-4613-BDD5-5A41C1D07246}")
  const primary = join(
    le32(8 + 4 + id.length),
    le32(1),
    le32(id.length),
    id,
    unicodeLp("Microsoft.Container.EncryptionTransform"),
    version1,
    version1,
    version1,
    // EncryptionTransformInfo: no name, block size 0, cipher mode 0, reserved 4.
    le32(0),
    le32(0),
    le32(0),
    le32(4),
  )
  const prefix = "\u0006DataSpaces/"
  return new Map([
    [`${prefix}Version`, version],
    [`${prefix}DataSpaceMap`, map],
    [`${prefix}DataSpaceInfo/StrongEncryptionDataSpace`, definition],
    [`${prefix}TransformInfo/StrongEncryptionTransform/\u0006Primary`, primary],
  ])
}

async function segmentIv(salt: Uint8Array, index: number) {
  return fit(sha512(salt, le32(index)), 16)
}

/** Encrypts a .docx (its zip bytes) with the password, into the compound file Word opens with that password. */
export async function encryptPackage(pkg: Uint8Array, password: string): Promise<Uint8Array> {
  const keySalt = random(16)
  const passwordSalt = random(16)
  const secret = random(32)
  const key = await aesKey(secret)

  // The package: its size, then 4096-byte segments, each with an IV from the salt and its number.
  const size = new Uint8Array(8)
  new DataView(size.buffer).setUint32(0, pkg.length % 0x100000000, true)
  new DataView(size.buffer).setUint32(4, Math.floor(pkg.length / 0x100000000), true)
  const segments: Uint8Array[] = [size]
  for (let index = 0; index * SEGMENT < pkg.length; index += 1) {
    const chunk = pkg.subarray(index * SEGMENT, (index + 1) * SEGMENT)
    segments.push(await encryptBlocks(key, await segmentIv(keySalt, index), chunk))
  }
  const encrypted = join(...segments)

  // Data integrity: an HMAC of the encrypted stream, its key and value encrypted with the secret key.
  const hmacKey = random(64)
  const hmacCrypto = await subtle().importKey(
    "raw",
    hmacKey as BufferSource,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  )
  const hmacValue = new Uint8Array(await subtle().sign("HMAC", hmacCrypto, encrypted as BufferSource))
  const encryptedHmacKey = await encryptBlocks(key, fit(sha512(keySalt, BLOCK_HMAC_KEY), 16), hmacKey)
  const encryptedHmacValue = await encryptBlocks(key, fit(sha512(keySalt, BLOCK_HMAC_VALUE), 16), hmacValue)

  // The password's key encrypts the verifier (to tell a wrong password) and the secret key.
  const hash = passwordHash(password, passwordSalt, SPIN_COUNT)
  const derive = async (block: Uint8Array) => aesKey(fit(sha512(hash, block), 32))
  const verifier = random(16)
  const encryptedVerifierInput = await encryptBlocks(await derive(BLOCK_VERIFIER_INPUT), passwordSalt, verifier)
  const encryptedVerifierValue = await encryptBlocks(await derive(BLOCK_VERIFIER_VALUE), passwordSalt, sha512(verifier))
  const encryptedKey = await encryptBlocks(await derive(BLOCK_KEY), passwordSalt, secret)

  const params = (salt: Uint8Array) =>
    `saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${base64(salt)}"`
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption" xmlns:p="${PASSWORD_URI}" ` +
    `xmlns:c="http://schemas.microsoft.com/office/2006/keyEncryptor/certificate">` +
    `<keyData ${params(keySalt)}/>` +
    `<dataIntegrity encryptedHmacKey="${base64(encryptedHmacKey)}" encryptedHmacValue="${base64(encryptedHmacValue)}"/>` +
    `<keyEncryptors><keyEncryptor uri="${PASSWORD_URI}">` +
    `<p:encryptedKey spinCount="${SPIN_COUNT}" ${params(passwordSalt)} ` +
    `encryptedVerifierHashInput="${base64(encryptedVerifierInput)}" ` +
    `encryptedVerifierHashValue="${base64(encryptedVerifierValue)}" encryptedKeyValue="${base64(encryptedKey)}"/>` +
    `</keyEncryptor></keyEncryptors></encryption>`
  const info = join(new Uint8Array([4, 0, 4, 0]), le32(0x40), new TextEncoder().encode(xml))
  const streams: CfbStreams = new Map([...dataSpaces(), ["EncryptionInfo", info], ["EncryptedPackage", encrypted]])
  return writeCompoundFile(streams)
}

type KeyParams = {
  salt: Uint8Array
  keyBytes: number
  hashSize: number
  blockSize: number
  hash: string
  cipher: string
}

function readParams(element: string): KeyParams {
  const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(element)?.[1] ?? ""
  return {
    salt: fromBase64(attr("saltValue")),
    keyBytes: Number(attr("keyBits")) / 8,
    hashSize: Number(attr("hashSize")),
    blockSize: Number(attr("blockSize")),
    hash: attr("hashAlgorithm"),
    cipher: `${attr("cipherAlgorithm")}/${attr("cipherChaining")}`,
  }
}

/**
 * The .docx inside an encrypted file. Throws EncryptionError "wrong-password" for a password that does not open it,
 * and "unsupported" for encryption the app does not read (Word 2007's Standard encryption, certificates only).
 */
export async function decryptPackage(file: Uint8Array, password: string): Promise<Uint8Array> {
  const streams = readCompoundFile(file)
  const info = streams.get("EncryptionInfo")
  const encrypted = streams.get("EncryptedPackage")
  if (!info || !encrypted || info.length < 8 || encrypted.length < 8) {
    throw new EncryptionError("The file is not an encrypted document.", "damaged")
  }
  const view = new DataView(info.buffer, info.byteOffset, info.byteLength)
  const major = view.getUint16(0, true)
  const minor = view.getUint16(2, true)
  if (major !== 4 || minor !== 4) {
    throw new EncryptionError(
      "The file uses an older kind of encryption, which Inkspire can't open yet.",
      "unsupported",
    )
  }
  const xml = new TextDecoder().decode(info.subarray(8))
  const keyData = /<(?:\w+:)?keyData\b[^>]*>/.exec(xml)?.[0]
  const passwordKey = /<(?:\w+:)?encryptedKey\b[^>]*>/.exec(xml.slice(xml.indexOf(PASSWORD_URI)))?.[0]
  if (!keyData || !passwordKey) {
    throw new EncryptionError("The file is encrypted with a certificate, not a password.", "unsupported")
  }
  const data = readParams(keyData)
  const pass = readParams(passwordKey)
  if (
    data.hash !== "SHA512" ||
    pass.hash !== "SHA512" ||
    !data.cipher.startsWith("AES/") ||
    data.cipher !== "AES/ChainingModeCBC"
  ) {
    throw new EncryptionError(
      `The file is encrypted with ${pass.hash} and ${data.cipher}, which Inkspire can't open yet.`,
      "unsupported",
    )
  }
  const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(passwordKey)?.[1] ?? ""
  const hash = passwordHash(password, pass.salt, Number(attr("spinCount")) || SPIN_COUNT)
  const derive = async (block: Uint8Array) => aesKey(fit(sha512(hash, block), pass.keyBytes))
  const iv = fit(pass.salt, pass.blockSize)
  const verifier = (
    await decryptBlocks(await derive(BLOCK_VERIFIER_INPUT), iv, fromBase64(attr("encryptedVerifierHashInput")))
  ).subarray(0, pass.salt.length)
  const expected = (
    await decryptBlocks(await derive(BLOCK_VERIFIER_VALUE), iv, fromBase64(attr("encryptedVerifierHashValue")))
  ).subarray(0, pass.hashSize)
  const actual = sha512(verifier)
  if (!actual.every((byte, index) => byte === expected[index])) {
    throw new EncryptionError("The password is incorrect.", "wrong-password")
  }
  const secret = (await decryptBlocks(await derive(BLOCK_KEY), iv, fromBase64(attr("encryptedKeyValue")))).subarray(
    0,
    data.keyBytes,
  )
  const key = await aesKey(secret)
  const sizeView = new DataView(encrypted.buffer, encrypted.byteOffset, 8)
  const size = sizeView.getUint32(0, true) + sizeView.getUint32(4, true) * 0x100000000
  const out = new Uint8Array(Math.ceil(size / SEGMENT) * SEGMENT + 16)
  let written = 0
  for (let index = 0; written < size; index += 1) {
    const start = 8 + index * SEGMENT
    const chunk = encrypted.subarray(start, Math.min(start + SEGMENT, encrypted.length))
    if (!chunk.length) {
      throw new EncryptionError("The encrypted document is cut short.", "damaged")
    }
    const plain = await decryptBlocks(
      key,
      fit(sha512(data.salt, le32(index)), data.blockSize),
      chunk.subarray(0, chunk.length - (chunk.length % 16)),
    )
    out.set(plain, written)
    written += plain.length
  }
  return out.slice(0, size)
}
