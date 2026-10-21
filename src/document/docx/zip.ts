import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter, type Entry, type FileEntry } from "@zip.js/zip.js"

/** DOS date 0x0021, time 0: 1980-01-01 00:00, the timestamp Word writes on every entry. */
export const ZIP_FIXED_DATE = new Date(1980, 0, 1, 0, 0, 0)
export const ZIP_FIXED_DOS_STAMP = 0x00210000

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ZipError"
  }
}

export type ZipEntry = {
  /** Name as stored in the central directory. */
  name: string
  /** Backslashes folded to slashes, with no leading slash. */
  normalizedName: string
  data: Uint8Array
  compressionMethod: number
  zip64: boolean
  dataDescriptor: boolean
  rawLastModDate: number | bigint
  rawBitFlag: number
  /** Set when the stored CRC-32 does not match the bytes. Word still opens these files. */
  crcWarning: string | null
}

const READER_OPTIONS = {
  useWebWorkers: false,
  checkCrc32: false,
  filenameValidation: "tolerant" as const,
  strictness: "tolerant" as const,
}

const WRITER_OPTIONS = {
  useWebWorkers: false,
  useCompressionStream: false,
  zip64: false,
  dataDescriptor: false,
  bufferedWrite: true,
  extendedTimestamp: false,
  lastModDate: ZIP_FIXED_DATE,
}

export function normalizeZipName(name: string) {
  return name.replace(/\\/g, "/").replace(/^\/+/, "")
}

export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), READER_OPTIONS)
  try {
    const entries = await reader.getEntries()
    const result: ZipEntry[] = []
    for (const entry of entries) {
      if (entry.directory) {
        continue
      }
      result.push(await readEntry(entry))
    }
    return result
  } catch (error) {
    if (error instanceof ZipError) {
      throw error
    }
    const message = error instanceof Error ? error.message : "The file is not a zip archive."
    throw new ZipError(message)
  } finally {
    await reader.close()
  }
}

async function readEntry(entry: Entry): Promise<ZipEntry> {
  const file = entry as FileEntry
  const data = new Uint8Array(await file.arrayBuffer({ useWebWorkers: false, checkCrc32: false }))
  const expected = file.crc32
  const actual = crc32(data)
  const mismatch = expected != null && expected !== actual
  return {
    name: file.filename,
    normalizedName: normalizeZipName(file.filename),
    data,
    compressionMethod: file.compressionMethod,
    zip64: file.zip64,
    dataDescriptor: file.bitFlag?.dataDescriptor ?? false,
    rawLastModDate: file.rawLastModDate,
    rawBitFlag: file.rawBitFlag ?? 0,
    crcWarning: mismatch ? `CRC-32 mismatch for ${normalizeZipName(file.filename)}` : null,
  }
}

export type ZipWriteEntry = {
  name: string
  data: Uint8Array
  /** Images are stored. XML is deflated. */
  stored: boolean
}

/**
 * Write a zip Word will accept: no ZIP64, no data descriptors, XML deflated (method 8,
 * general-purpose flags 0x0006), images stored, fixed DOS timestamps.
 * The caller writes the bytes to a temporary file and renames it into place.
 */
export async function writeZip(entries: ZipWriteEntry[]): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), WRITER_OPTIONS)
  try {
    for (const entry of entries) {
      await writer.add(entry.name, new Uint8ArrayReader(entry.data), {
        ...WRITER_OPTIONS,
        level: entry.stored ? 0 : 1,
      })
    }
    return await writer.close(new Uint8Array(), { zip64: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not write the zip archive."
    throw new ZipError(message)
  }
}

const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  CRC_TABLE[index] = value
}

/** Three more tables, so four bytes are folded in per step ("slicing by 4"): about three times faster on large parts. */
const CRC_SLICES = new Uint32Array(256 * 3)
for (let index = 0; index < 256; index += 1) {
  let value = CRC_TABLE[index]!
  for (let slice = 0; slice < 3; slice += 1) {
    value = CRC_TABLE[value & 0xff]! ^ (value >>> 8)
    CRC_SLICES[slice * 256 + index] = value
  }
}

export function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  let index = 0
  const stop = data.length - 3
  for (; index < stop; index += 4) {
    crc ^= data[index]! | (data[index + 1]! << 8) | (data[index + 2]! << 16) | (data[index + 3]! << 24)
    crc =
      CRC_SLICES[512 + (crc & 0xff)]! ^
      CRC_SLICES[256 + ((crc >>> 8) & 0xff)]! ^
      CRC_SLICES[(crc >>> 16) & 0xff]! ^
      CRC_TABLE[crc >>> 24]!
  }
  for (; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ data[index]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * A small zip with every entry stored, written at once: a chart's embedded workbook, built while a document is
 * turned into WordprocessingML, which has no await.
 */
export function storedZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const time = ZIP_FIXED_DOS_STAMP & 0xffff
  const date = ZIP_FIXED_DOS_STAMP >>> 16
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, entry.data.length, true)
    local.setUint32(22, entry.data.length, true)
    local.setUint16(26, name.length, true)
    const record = new DataView(new ArrayBuffer(46))
    record.setUint32(0, 0x02014b50, true)
    record.setUint16(4, 20, true)
    record.setUint16(6, 20, true)
    record.setUint16(12, time, true)
    record.setUint16(14, date, true)
    record.setUint32(16, crc, true)
    record.setUint32(20, entry.data.length, true)
    record.setUint32(24, entry.data.length, true)
    record.setUint16(28, name.length, true)
    record.setUint32(42, offset, true)
    chunks.push(new Uint8Array(local.buffer), name, entry.data)
    central.push(new Uint8Array(record.buffer), name)
    offset += 30 + name.length + entry.data.length
  }
  const size = central.reduce((sum, chunk) => sum + chunk.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const bytes = new Uint8Array(all.reduce((sum, chunk) => sum + chunk.length, 0))
  let at = 0
  for (const chunk of all) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}
