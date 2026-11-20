/**
 * Compound files (MS-CFB), the container old .doc files use and Word wraps a password-protected .docx in. Reads
 * any version; writes version 3 (512-byte sectors), as Word does for encrypted documents.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const FREE = 0xffffffff
const END = 0xfffffffe
const FAT_SECTOR = 0xfffffffd
const DIFAT_SECTOR = 0xfffffffc
const NO_STREAM = 0xffffffff
const MINI_CUTOFF = 4096

export class CfbError extends Error {
  override name = "CfbError"
}

export function isCompoundFile(bytes: Uint8Array | undefined | null) {
  return Boolean(bytes && bytes.length >= 512 && SIGNATURE.every((byte, index) => bytes[index] === byte))
}

/** A stream by its path from the root, storages joined with "/" (for example "\u0006DataSpaces/Version"). */
export type CfbStreams = Map<string, Uint8Array>

export function readCompoundFile(bytes: Uint8Array): CfbStreams {
  if (!isCompoundFile(bytes)) {
    throw new CfbError("Not a compound file.")
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const sectorSize = 1 << view.getUint16(30, true)
  const miniSize = 1 << view.getUint16(32, true)
  const cutoff = view.getUint32(56, true)
  const sectorAt = (sector: number) => (sector + 1) * sectorSize
  // The FAT's own sectors: 109 in the header, the rest in the DIFAT chain.
  const fatSectors: number[] = []
  for (let i = 0; i < 109; i += 1) {
    const sector = view.getUint32(76 + i * 4, true)
    if (sector !== FREE) {
      fatSectors.push(sector)
    }
  }
  let difat = view.getUint32(68, true)
  for (let guard = 0; difat !== END && difat !== FREE && guard < 100000; guard += 1) {
    const at = sectorAt(difat)
    const per = sectorSize / 4 - 1
    for (let i = 0; i < per; i += 1) {
      const sector = view.getUint32(at + i * 4, true)
      if (sector !== FREE) {
        fatSectors.push(sector)
      }
    }
    difat = view.getUint32(at + per * 4, true)
  }
  const fat: number[] = []
  for (const sector of fatSectors) {
    const at = sectorAt(sector)
    if (at + sectorSize > bytes.length) {
      throw new CfbError("The file is cut short.")
    }
    for (let i = 0; i < sectorSize / 4; i += 1) {
      fat.push(view.getUint32(at + i * 4, true))
    }
  }
  const chain = (start: number, table: number[]) => {
    const sectors: number[] = []
    for (let sector = start; sector !== END && sector !== FREE; sector = table[sector] ?? END) {
      if (sectors.length > table.length) {
        throw new CfbError("A sector chain loops.")
      }
      sectors.push(sector)
    }
    return sectors
  }
  const readChain = (start: number, size?: number) => {
    const sectors = chain(start, fat)
    const out = new Uint8Array(sectors.length * sectorSize)
    sectors.forEach((sector, index) => {
      out.set(bytes.subarray(sectorAt(sector), sectorAt(sector) + sectorSize), index * sectorSize)
    })
    return size === undefined ? out : out.subarray(0, size)
  }
  const directory = readChain(view.getUint32(48, true))
  const dirView = new DataView(directory.buffer, directory.byteOffset, directory.byteLength)
  type Entry = { name: string; type: number; left: number; right: number; child: number; start: number; size: number }
  const entries: Entry[] = []
  for (let at = 0; at + 128 <= directory.length; at += 128) {
    const nameLength = dirView.getUint16(at + 64, true)
    let name = ""
    for (let i = 0; i + 2 < nameLength && i < 64; i += 2) {
      name += String.fromCharCode(dirView.getUint16(at + i, true))
    }
    entries.push({
      name,
      type: dirView.getUint8(at + 66),
      left: dirView.getUint32(at + 68, true),
      right: dirView.getUint32(at + 72, true),
      child: dirView.getUint32(at + 76, true),
      start: dirView.getUint32(at + 116, true),
      // Version 3 files may leave garbage in the high half of the size.
      size:
        sectorSize === 512
          ? dirView.getUint32(at + 120, true)
          : dirView.getUint32(at + 120, true) + dirView.getUint32(at + 124, true) * 0x100000000,
    })
  }
  const root = entries[0]
  if (!root || root.type !== 5) {
    throw new CfbError("The file has no root entry.")
  }
  const miniStream = root.start === END ? new Uint8Array(0) : readChain(root.start, root.size)
  const miniFat: number[] = []
  const miniFatStart = view.getUint32(60, true)
  if (miniFatStart !== END && miniFatStart !== FREE) {
    const table = readChain(miniFatStart)
    const tableView = new DataView(table.buffer, table.byteOffset, table.byteLength)
    for (let i = 0; i + 4 <= table.length; i += 4) {
      miniFat.push(tableView.getUint32(i, true))
    }
  }
  const streams: CfbStreams = new Map()
  const visit = (id: number, prefix: string, seen: Set<number>) => {
    if (id === NO_STREAM || seen.has(id)) {
      return
    }
    seen.add(id)
    const entry = entries[id]
    if (!entry) {
      return
    }
    visit(entry.left, prefix, seen)
    visit(entry.right, prefix, seen)
    const path = prefix + entry.name
    if (entry.type === 2) {
      if (entry.size < cutoff) {
        const out = new Uint8Array(chain(entry.start, miniFat).length * miniSize)
        chain(entry.start, miniFat).forEach((sector, index) => {
          out.set(miniStream.subarray(sector * miniSize, sector * miniSize + miniSize), index * miniSize)
        })
        streams.set(path, out.subarray(0, entry.size))
      } else {
        streams.set(path, readChain(entry.start, entry.size))
      }
    } else if (entry.type === 1) {
      visit(entry.child, `${path}/`, seen)
    }
  }
  visit(root.child, "", new Set())
  return streams
}

type Node = { name: string; data?: Uint8Array; children: Node[]; id: number; start: number; size: number }

/** Directory order: shorter names first, then by upper-case code units. */
function compareNames(a: string, b: string) {
  if (a.length !== b.length) {
    return a.length - b.length
  }
  const x = a.toUpperCase()
  const y = b.toUpperCase()
  return x < y ? -1 : x > y ? 1 : 0
}

/** Writes streams (paths as readCompoundFile returns them) into a version 3 compound file. */
export function writeCompoundFile(streams: CfbStreams): Uint8Array {
  const root: Node = { name: "Root Entry", children: [], id: 0, start: END, size: 0 }
  for (const [path, data] of streams) {
    let parent = root
    const parts = path.split("/")
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        parent.children.push({ name: part, data, children: [], id: 0, start: END, size: data.length })
        return
      }
      let storage = parent.children.find((child) => child.name === part && !child.data)
      if (!storage) {
        storage = { name: part, children: [], id: 0, start: 0, size: 0 }
        parent.children.push(storage)
      }
      parent = storage
    })
  }
  const nodes: Node[] = []
  const number = (node: Node) => {
    node.id = nodes.length
    nodes.push(node)
    node.children.sort((a, b) => compareNames(a.name, b.name))
    node.children.forEach(number)
  }
  number(root)

  // Small streams go in the mini stream, 64-byte sectors chained in the mini FAT.
  const miniFat: number[] = []
  const miniParts: Uint8Array[] = []
  const big: Node[] = []
  for (const node of nodes) {
    if (!node.data) {
      continue
    }
    if (node.data.length === 0) {
      node.start = END
    } else if (node.data.length < MINI_CUTOFF) {
      const count = Math.ceil(node.data.length / 64)
      node.start = miniFat.length
      for (let i = 0; i < count; i += 1) {
        miniFat.push(i === count - 1 ? END : miniFat.length + 1)
      }
      const padded = new Uint8Array(count * 64)
      padded.set(node.data)
      miniParts.push(padded)
    } else {
      big.push(node)
    }
  }
  const miniStream = concat(miniParts)
  const sectorsFor = (length: number) => Math.ceil(length / 512)
  const directorySectors = sectorsFor(nodes.length * 128)
  const miniFatSectors = sectorsFor(miniFat.length * 4)
  const dataSectors =
    big.reduce((total, node) => total + sectorsFor(node.size), 0) +
    sectorsFor(miniStream.length) +
    miniFatSectors +
    directorySectors
  let fatCount = 1
  let difatCount = 0
  for (;;) {
    const total = dataSectors + fatCount + difatCount
    const nextFat = Math.ceil(total / 128)
    const nextDifat = nextFat > 109 ? Math.ceil((nextFat - 109) / 127) : 0
    if (nextFat === fatCount && nextDifat === difatCount) {
      break
    }
    fatCount = nextFat
    difatCount = nextDifat
  }
  const totalSectors = dataSectors + fatCount + difatCount
  const fat = new Uint32Array(fatCount * 128).fill(FREE)
  const out = new Uint8Array(512 + totalSectors * 512)
  const view = new DataView(out.buffer)
  let next = 0
  const place = (data: Uint8Array) => {
    const count = sectorsFor(data.length)
    const start = next
    for (let i = 0; i < count; i += 1) {
      fat[start + i] = i === count - 1 ? END : start + i + 1
    }
    out.set(data, 512 + start * 512)
    next += count
    return count ? start : END
  }
  for (const node of big) {
    node.start = place(node.data!)
  }
  root.start = miniStream.length ? place(miniStream) : END
  root.size = miniStream.length
  const miniFatBytes = new Uint8Array(miniFatSectors * 512).fill(0xff)
  const miniFatView = new DataView(miniFatBytes.buffer)
  miniFat.forEach((value, index) => miniFatView.setUint32(index * 4, value, true))
  const miniFatStart = miniFatSectors ? place(miniFatBytes) : END
  const directory = new Uint8Array(directorySectors * 512)
  const directoryStart = place(directory)
  const fatStart = next
  for (let i = 0; i < fatCount; i += 1) {
    fat[fatStart + i] = FAT_SECTOR
  }
  next += fatCount
  const difatStart = next
  for (let i = 0; i < difatCount; i += 1) {
    fat[difatStart + i] = DIFAT_SECTOR
  }

  // The directory: each storage's children as a balanced tree, the deepest level red.
  const dirView = new DataView(directory.buffer)
  const write = (node: Node, type: number, left: number, right: number, child: number, color: number) => {
    const at = node.id * 128
    const name = node.name.slice(0, 31)
    for (let i = 0; i < name.length; i += 1) {
      dirView.setUint16(at + i * 2, name.charCodeAt(i), true)
    }
    dirView.setUint16(at + 64, (name.length + 1) * 2, true)
    dirView.setUint8(at + 66, type)
    dirView.setUint8(at + 67, color)
    dirView.setUint32(at + 68, left, true)
    dirView.setUint32(at + 72, right, true)
    dirView.setUint32(at + 76, child, true)
    dirView.setUint32(at + 116, type === 1 ? 0 : node.start, true)
    dirView.setUint32(at + 120, type === 1 ? 0 : node.size, true)
  }
  const tree = (children: Node[]): number => {
    if (!children.length) {
      return NO_STREAM
    }
    const depth = Math.floor(Math.log2(children.length))
    const full = children.length === 2 ** (depth + 1) - 1
    const build = (from: number, to: number, level: number): number => {
      if (from > to) {
        return NO_STREAM
      }
      const middle = Math.floor((from + to) / 2)
      const node = children[middle]!
      const left = build(from, middle - 1, level + 1)
      const right = build(middle + 1, to, level + 1)
      const red = !full && level === depth && depth > 0
      if (node.data) {
        write(node, 2, left, right, NO_STREAM, red ? 0 : 1)
      } else {
        write(node, 1, left, right, tree(node.children), red ? 0 : 1)
      }
      return node.id
    }
    return build(0, children.length - 1, 0)
  }
  write(root, 5, NO_STREAM, NO_STREAM, tree(root.children), 1)
  for (let at = nodes.length * 128; at < directory.length; at += 128) {
    // Unused entries: no siblings, no child.
    dirView.setUint32(at + 68, NO_STREAM, true)
    dirView.setUint32(at + 72, NO_STREAM, true)
    dirView.setUint32(at + 76, NO_STREAM, true)
  }
  out.set(directory, 512 + directoryStart * 512)

  const fatBytes = new Uint8Array(fat.buffer)
  if (new Uint16Array(new Uint8Array([1, 0]).buffer)[0] !== 1) {
    throw new CfbError("Big-endian hosts are not supported.")
  }
  out.set(fatBytes, 512 + fatStart * 512)
  // The FAT sectors' places: 109 in the header, the rest in DIFAT sectors, each ending with the next one's place.
  const fatPlaces = Array.from({ length: fatCount }, (_, index) => fatStart + index)
  for (let i = 0; i < difatCount; i += 1) {
    const at = 512 + (difatStart + i) * 512
    for (let j = 0; j < 127; j += 1) {
      view.setUint32(at + j * 4, fatPlaces[109 + i * 127 + j] ?? FREE, true)
    }
    view.setUint32(at + 508, i === difatCount - 1 ? END : difatStart + i + 1, true)
  }

  SIGNATURE.forEach((byte, index) => (out[index] = byte))
  view.setUint16(24, 0x003e, true)
  view.setUint16(26, 0x0003, true)
  view.setUint16(28, 0xfffe, true)
  view.setUint16(30, 9, true)
  view.setUint16(32, 6, true)
  view.setUint32(44, fatCount, true)
  view.setUint32(48, directoryStart, true)
  view.setUint32(56, MINI_CUTOFF, true)
  view.setUint32(60, miniFatStart, true)
  view.setUint32(64, miniFatSectors, true)
  view.setUint32(68, difatCount ? difatStart : END, true)
  view.setUint32(72, difatCount, true)
  for (let i = 0; i < 109; i += 1) {
    view.setUint32(76 + i * 4, fatPlaces[i] ?? FREE, true)
  }
  return out
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
