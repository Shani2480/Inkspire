import { decodeXml } from "@/document/docx/xml"
import { openPackage, partKey, writePackage, type OpcPackage } from "@/document/docx/opc"

/**
 * Lossless size optimization (21.48): finds what a .docx carries without using, and removes it. Nothing is
 * resampled or recompressed; only parts and relationships nothing refers to go, so the document opens as before.
 */
export type SizeFindingKind = "orphan-part" | "unused-image" | "thumbnail" | "printer-settings"

export type SizeFinding = {
  kind: SizeFindingKind
  /** What the person sees in the list. */
  label: string
  /** The part that goes (or, for an unused picture whose part other things use, the relationship). */
  partName: string
  /** Bytes freed (uncompressed) when the part goes. */
  bytes: number
  /** For unused pictures: where the relationship is, and its id. */
  source?: string
  relationshipId?: string
}

const IMAGE_REL = /\/image$/
const THUMBNAIL_REL = /\/metadata\/thumbnail$/

function targetsOf(pkg: OpcPackage, partName: string) {
  const key = partKey(partName)
  return pkg.relationships.flatMap((group) =>
    group.items
      .filter((item) => item.targetMode === "Internal" && item.partName && partKey(item.partName) === key)
      .map((item) => ({ group, item })),
  )
}

function reachableParts(pkg: OpcPackage) {
  const seen = new Set<string>()
  const queue = [""]
  const done = new Set<string>()
  while (queue.length) {
    const source = queue.pop()!
    const sourceKey = source === "" ? "" : partKey(source)
    if (done.has(sourceKey)) {
      continue
    }
    done.add(sourceKey)
    for (const group of pkg.relationships) {
      if ((group.source === "" ? "" : partKey(group.source)) !== sourceKey) {
        continue
      }
      for (const item of group.items) {
        if (item.targetMode === "Internal" && item.partName) {
          seen.add(partKey(item.partName))
          queue.push(item.partName)
        }
      }
    }
  }
  return seen
}

/** What one pass finds in the package. */
export function findOversize(pkg: OpcPackage): SizeFinding[] {
  const findings: SizeFinding[] = []
  const reachable = reachableParts(pkg)
  const taken = new Set<string>()
  const sizeOf = (name: string) => pkg.parts.find((part) => partKey(part.name) === partKey(name))?.data.length ?? 0

  for (const part of pkg.parts) {
    const key = partKey(part.name)
    if (key === "[content_types].xml" || part.name === pkg.mainPartName) {
      continue
    }
    if (/^word\/printersettings\//.test(key)) {
      findings.push({
        kind: "printer-settings",
        label: "Printer settings",
        partName: part.name,
        bytes: part.data.length,
      })
      taken.add(key)
    } else if (!reachable.has(key)) {
      findings.push({
        kind: "orphan-part",
        label: "Part nothing refers to",
        partName: part.name,
        bytes: part.data.length,
      })
      taken.add(key)
    }
  }
  for (const group of pkg.relationships) {
    for (const item of group.items) {
      if (item.targetMode !== "Internal" || !item.partName || taken.has(partKey(item.partName))) {
        continue
      }
      if (group.source === "" && THUMBNAIL_REL.test(item.type)) {
        findings.push({
          kind: "thumbnail",
          label: "Stale preview picture",
          partName: item.partName,
          bytes: sizeOf(item.partName),
          source: group.source,
          relationshipId: item.id,
        })
        taken.add(partKey(item.partName))
      } else if (group.source !== "" && IMAGE_REL.test(item.type)) {
        const owner = pkg.parts.find((part) => partKey(part.name) === partKey(group.source))
        const xml = owner ? decodeXml(owner.data) : ""
        if (owner && !xml.includes(`"${item.id}"`) && !xml.includes(`'${item.id}'`)) {
          const shared = targetsOf(pkg, item.partName).filter(
            (other) => other.item !== item && !(other.group === group && other.item.id === item.id),
          )
          findings.push({
            kind: "unused-image",
            label: "Picture no longer used",
            partName: item.partName,
            // A picture other places still use stays; only this relationship goes.
            bytes: shared.length ? 0 : sizeOf(item.partName),
            source: group.source,
            relationshipId: item.id,
          })
        }
      }
    }
  }
  return findings
}

function remove(pkg: OpcPackage, findings: SizeFinding[]) {
  for (const finding of findings) {
    if (finding.relationshipId !== undefined && finding.source !== undefined) {
      const group = pkg.relationships.find(
        (candidate) => partKey(candidate.source) === partKey(finding.source!) || candidate.source === finding.source,
      )
      if (group) {
        group.items = group.items.filter((item) => item.id !== finding.relationshipId)
      }
    }
  }
  for (const finding of findings) {
    if (finding.kind !== "unused-image") {
      // The whole part goes, so everything that pointed at it goes too.
      const key = partKey(finding.partName)
      for (const group of pkg.relationships) {
        group.items = group.items.filter((item) => !item.partName || partKey(item.partName) !== key)
      }
    }
    if (targetsOf(pkg, finding.partName).length === 0) {
      const key = partKey(finding.partName)
      pkg.parts = pkg.parts.filter((part) => partKey(part.name) !== key)
      pkg.overrides = pkg.overrides.filter((override) => partKey(override.partName) !== key)
      // Its own relationships go with it.
      pkg.relationships = pkg.relationships.filter((group) => group.source === "" || partKey(group.source) !== key)
    }
  }
}

/** Everything that can go, found again after each removal until nothing is left. */
export async function analyzeDocx(bytes: Uint8Array, fileName = "document.docx") {
  const pkg = await openPackage(bytes, fileName)
  const all: SizeFinding[] = []
  for (let pass = 0; pass < 5; pass += 1) {
    const found = findOversize(pkg)
    if (!found.length) {
      break
    }
    all.push(...found)
    remove(pkg, found)
  }
  return all
}

/** The same file without the findings; the original bytes untouched when there is nothing to remove. */
export async function optimizeDocx(bytes: Uint8Array, fileName = "document.docx") {
  const pkg = await openPackage(bytes, fileName)
  let removed = 0
  for (let pass = 0; pass < 5; pass += 1) {
    const found = findOversize(pkg)
    if (!found.length) {
      break
    }
    removed += found.length
    remove(pkg, found)
  }
  return removed ? { bytes: await writePackage(pkg), removed } : { bytes, removed: 0 }
}
