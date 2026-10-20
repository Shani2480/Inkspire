/**
 * Strict (ISO 29500) to Transitional conversion for markup the engine keeps verbatim: drawings, content
 * controls, equations, the theme, and other passthrough parts. Modelled markup is converted while it is read.
 */

const STRICT = "http://purl.oclc.org/ooxml/"
const OOXML = "http://schemas.openxmlformats.org/"

/** Strict namespace and relationship-type URIs, longest first, with their Transitional equivalents. */
const URIS: [string, string][] = [
  [
    `${STRICT}officeDocument/relationships/extendedProperties`,
    `${OOXML}officeDocument/2006/relationships/extended-properties`,
  ],
  [
    `${STRICT}officeDocument/relationships/customProperties`,
    `${OOXML}officeDocument/2006/relationships/custom-properties`,
  ],
  [`${STRICT}officeDocument/relationships`, `${OOXML}officeDocument/2006/relationships`],
  [`${STRICT}officeDocument/extendedProperties`, `${OOXML}officeDocument/2006/extended-properties`],
  [`${STRICT}officeDocument/customProperties`, `${OOXML}officeDocument/2006/custom-properties`],
  [`${STRICT}officeDocument/docPropsVTypes`, `${OOXML}officeDocument/2006/docPropsVTypes`],
  [`${STRICT}officeDocument/customXml`, `${OOXML}officeDocument/2006/customXml`],
  [`${STRICT}officeDocument/sharedTypes`, `${OOXML}officeDocument/2006/sharedTypes`],
  [`${STRICT}officeDocument/math`, `${OOXML}officeDocument/2006/math`],
  [`${STRICT}officeDocument/bibliography`, `${OOXML}officeDocument/2006/bibliography`],
  [`${STRICT}wordprocessingml/main`, `${OOXML}wordprocessingml/2006/main`],
  [`${STRICT}schemaLibrary/main`, `${OOXML}schemaLibrary/2006/main`],
  [`${STRICT}drawingml/wordprocessingDrawing`, `${OOXML}drawingml/2006/wordprocessingDrawing`],
  [`${STRICT}drawingml/chartDrawing`, `${OOXML}drawingml/2006/chartDrawing`],
  [`${STRICT}drawingml/lockedCanvas`, `${OOXML}drawingml/2006/lockedCanvas`],
  [`${STRICT}drawingml/compatibility`, `${OOXML}drawingml/2006/compatibility`],
  [`${STRICT}drawingml/diagram`, `${OOXML}drawingml/2006/diagram`],
  [`${STRICT}drawingml/picture`, `${OOXML}drawingml/2006/picture`],
  [`${STRICT}drawingml/chart`, `${OOXML}drawingml/2006/chart`],
  [`${STRICT}drawingml/main`, `${OOXML}drawingml/2006/main`],
]

const DRAWING_NAMESPACE = `${OOXML}drawingml/2006/`
const WORD_NAMESPACE = `${OOXML}wordprocessingml/2006/main`
/** Prefixes Word uses for DrawingML when the declaration sits outside the kept markup. */
const DRAWING_PREFIXES = new Set(["a", "pic", "wp", "c", "dgm", "lc", "cdr", "comp"])

/** Twips and EMUs per unit of a universal measure. */
const TWIPS: Record<string, number> = { mm: 1440 / 25.4, cm: 1440 / 2.54, in: 1440, pt: 20, pc: 240, pi: 240 }
const EMUS: Record<string, number> = { mm: 36000, cm: 360000, in: 914400, pt: 12700, pc: 152400, pi: 152400 }
const MEASURE = /^(-?\d+(?:\.\d+)?)(mm|cm|in|pt|pc|pi)$/
const PERCENT = /^(-?\d+(?:\.\d+)?)%$/
/** WordprocessingML attributes counted in half-points rather than twips. */
const HALF_POINT_ELEMENTS = new Set(["sz", "szCs", "kern"])

export function isStrictMarkup(xml: string) {
  return xml.includes(STRICT)
}

export function transitionalUriOf(uri: string) {
  for (const [strict, transitional] of URIS) {
    if (uri === strict || uri.startsWith(`${strict}/`)) {
      return transitional + uri.slice(strict.length)
    }
  }
  return uri
}

/**
 * Rewrites Strict namespaces and relationship types, and turns Strict value forms back into Transitional ones:
 * DrawingML percentages ("50%") become thousandths, universal measures ("36pt") become EMUs in DrawingML and
 * twips (half-points for sizes) in WordprocessingML.
 */
export function transitionalMarkup(xml: string) {
  if (!isStrictMarkup(xml)) {
    return xml
  }
  const uris = xml.replace(/http:\/\/purl\.oclc\.org\/ooxml\/[A-Za-z0-9/._-]*/g, (uri) => transitionalUriOf(uri))
  const prefixes = new Map<string, string>()
  for (const match of uris.matchAll(/xmlns:([A-Za-z0-9_-]+)="([^"]*)"/g)) {
    prefixes.set(match[1]!, match[2]!)
  }
  const kind = (prefix: string) => {
    const uri = prefixes.get(prefix)
    if (uri) {
      return uri.startsWith(DRAWING_NAMESPACE) ? "drawing" : uri === WORD_NAMESPACE ? "word" : "other"
    }
    return DRAWING_PREFIXES.has(prefix) ? "drawing" : prefix === "w" ? "word" : "other"
  }
  return uris.replace(
    /<([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)(\s[^<>]*?)(\/?)>/g,
    (tag, prefix: string, local, attrs, slash) => {
      const space = kind(prefix)
      if (space === "other") {
        return tag
      }
      const converted = String(attrs).replace(/(\s[A-Za-z0-9_:-]+)="([^"]*)"/g, (pair, name: string, value: string) => {
        const qualified = name.trim()
        if (qualified.startsWith("xmlns")) {
          return pair
        }
        if (space === "drawing") {
          const next = drawingValue(value)
          return next === value ? pair : `${name}="${next}"`
        }
        // w:ind start/end, and start/end alignment, are Transitional's left/right.
        const renamed = local === "ind" ? qualified.replace(/:start$/, ":left").replace(/:end$/, ":right") : qualified
        const next = wordValue(value, local, qualified)
        return renamed === qualified && next === value ? pair : ` ${renamed}="${next}"`
      })
      const element =
        space === "word" && isSideElement(local, converted) ? (local === "start" ? "left" : "right") : local
      return `<${prefix}:${element}${converted}${slash}>`
    },
  )
}

/** A border or margin side named start/end, as opposed to w:start, the numbering start value. */
function isSideElement(local: string, attrs: string) {
  if (local !== "start" && local !== "end") {
    return false
  }
  return /:(?:w|sz|space|color)="/.test(attrs) || /:val="[^"0-9][^"]*"/.test(attrs)
}

function drawingValue(value: string) {
  const percent = PERCENT.exec(value)
  if (percent) {
    return String(Math.round(Number(percent[1]) * 1000))
  }
  const measure = MEASURE.exec(value)
  return measure ? String(Math.round(Number(measure[1]) * (EMUS[measure[2]!] ?? 0))) : value
}

function wordValue(value: string, element: string, attribute: string) {
  const measure = MEASURE.exec(value)
  if (measure) {
    const twips = Number(measure[1]) * (TWIPS[measure[2]!] ?? 0)
    return String(Math.round(HALF_POINT_ELEMENTS.has(element) ? twips / 10 : twips))
  }
  const percent = PERCENT.exec(value)
  if (percent && attribute.endsWith(":w")) {
    // Table widths count fiftieths of a percent.
    return String(Math.round(Number(percent[1]) * 50))
  }
  if (percent) {
    return String(Math.round(Number(percent[1])))
  }
  if ((value === "start" || value === "end") && attribute.endsWith(":val") && (element === "jc" || element === "tab")) {
    return value === "start" ? "left" : "right"
  }
  return value
}
