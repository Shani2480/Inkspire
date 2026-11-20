import { DEFAULT_PAGE_SETUP, type PageSetup } from "@/document/page-setup"

/**
 * Mailings > Envelopes and Labels: the envelope and label sheets Word offers most, and the documents they make. An
 * envelope is a page of its size with the return address at the top left and the delivery address in from the left
 * and down (in a borderless table, which every reader places the same way). A sheet of labels is a borderless table
 * with the labels' exact sizes, the gaps between them as narrow columns, as Word lays it out.
 */

export type EnvelopeSize = { id: string; label: string; width: number; height: number }

/** Width and height in mm, the envelope lying on its long side. */
export const ENVELOPE_SIZES: EnvelopeSize[] = [
  { id: "size10", label: "Size 10 (4 1/8 x 9 1/2 in)", width: 241.3, height: 104.8 },
  { id: "dl", label: "DL (110 x 220 mm)", width: 220, height: 110 },
  { id: "c5", label: "C5 (162 x 229 mm)", width: 229, height: 162 },
  { id: "c6", label: "C6 (114 x 162 mm)", width: 162, height: 114 },
  { id: "monarch", label: "Monarch (3 7/8 x 7 1/2 in)", width: 190.5, height: 98.4 },
]

export type LabelProduct = {
  id: string
  vendor: string
  number: string
  type: string
  paper: "letter" | "a4"
  columns: number
  rows: number
  /** Label width and height, the margins of the sheet and the distance from one label's left to the next (mm). */
  width: number
  height: number
  top: number
  side: number
  pitch: number
}

export const LABEL_PRODUCTS: LabelProduct[] = [
  {
    id: "5160",
    vendor: "Avery US Letter",
    number: "5160",
    type: "Address Labels",
    paper: "letter",
    columns: 3,
    rows: 10,
    width: 66.7,
    height: 25.4,
    top: 12.7,
    side: 4.8,
    pitch: 69.85,
  },
  {
    id: "5163",
    vendor: "Avery US Letter",
    number: "5163",
    type: "Shipping Labels",
    paper: "letter",
    columns: 2,
    rows: 5,
    width: 101.6,
    height: 50.8,
    top: 12.7,
    side: 4,
    pitch: 106.4,
  },
  {
    id: "L7160",
    vendor: "Avery A4/A5",
    number: "L7160",
    type: "Address Labels",
    paper: "a4",
    columns: 3,
    rows: 7,
    width: 63.5,
    height: 38.1,
    top: 15.15,
    side: 7.2,
    pitch: 66,
  },
  {
    id: "L7163",
    vendor: "Avery A4/A5",
    number: "L7163",
    type: "Address Labels",
    paper: "a4",
    columns: 2,
    rows: 7,
    width: 99.1,
    height: 38.1,
    top: 15.15,
    side: 4.65,
    pitch: 101.6,
  },
  {
    id: "L7165",
    vendor: "Avery A4/A5",
    number: "L7165",
    type: "Parcel Labels",
    paper: "a4",
    columns: 2,
    rows: 4,
    width: 99.1,
    height: 67.7,
    top: 13.1,
    side: 4.65,
    pitch: 101.6,
  },
]

const MM_TO_PX = 96 / 25.4

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Lines of an address as paragraphs that keep together (no space after, as Word's envelope addresses). */
function linesHtml(text: string) {
  const lines = text.split(/\r?\n/)
  return lines
    .map((line) => `<p style="margin-top: 0pt; margin-bottom: 0pt">${escapeHtml(line) || "<br>"}</p>`)
    .join("")
}

/** The editor's merge field markup, for documents made with fields in them. */
export function fieldHtml(instr: string, result: string) {
  return `<span data-word-field="" data-instr="${escapeHtml(instr)}" data-result="${escapeHtml(result)}">${escapeHtml(result)}</span>`
}

/** Word's Address Block with its usual format: the Insert Address Block dialog's first choices. */
export const ADDRESS_BLOCK_FIELD = fieldHtml(
  'ADDRESSBLOCK \\f "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>><< _SUFFIX0_>>\n<<_COMPANY_\n>><<_STREET1_\n>><<_STREET2_\n>><<_CITY_>><<, _STATE_>><< _POSTAL_>><<\n_COUNTRY_>>" \\l 1033 \\c 2',
  "«AddressBlock»",
)

export function envelopePageSetup(size: EnvelopeSize): PageSetup {
  return {
    ...DEFAULT_PAGE_SETUP,
    paperWidth: size.width,
    paperHeight: size.height,
    marginTop: 10,
    marginBottom: 10,
    marginLeft: 12,
    marginRight: 12,
  }
}

/** An envelope's content: the return address, then the delivery address in from the left and down. */
export function envelopeHtml(
  size: EnvelopeSize,
  delivery: string,
  returnAddress: string | null,
  deliveryHtml?: string,
) {
  const textWidth = size.width - 24
  const left = Math.round(textWidth * 0.42 * MM_TO_PX)
  const right = Math.round(textWidth * 0.58 * MM_TO_PX)
  // The delivery address starts a little above the middle, as on Word's envelopes (checked in Word, VM): a spacer
  // paragraph's space before pushes it down from below the return address (lines of about 14.5 pt).
  const returnLines = returnAddress ? returnAddress.split(/\r?\n/).length : 1
  const down = Math.max(0, Math.round(size.height * 0.42 * 2.835 - 10 * 2.835 - (returnLines + 1) * 14.5))
  const body = deliveryHtml ?? linesHtml(delivery)
  return (
    (returnAddress ? linesHtml(returnAddress) : '<p style="margin-top: 0pt; margin-bottom: 0pt"><br></p>') +
    `<p style="margin-top: ${down}pt; margin-bottom: 0pt"><br></p>` +
    '<table data-frame="none"><tbody><tr>' +
    `<td colwidth="${left}" data-borders="none"><p><br></p></td>` +
    `<td colwidth="${right}" data-borders="none">${body}</td>` +
    "</tr></tbody></table><p><br></p>"
  )
}

export function labelsPageSetup(product: LabelProduct): PageSetup {
  return {
    ...DEFAULT_PAGE_SETUP,
    paper: product.paper,
    marginTop: product.top,
    marginBottom: 2,
    marginLeft: product.side,
    marginRight: 2,
  }
}

/**
 * A sheet of labels: every label the same text (Full page of the same label), one label in a row and column
 * (Single label), or for a merge, the first label's content and «Next Record» then the same in each other one.
 */
export function labelsHtml(
  product: LabelProduct,
  content: { text: string } | { merge: string },
  single?: { row: number; column: number },
) {
  const gap = product.pitch - product.width
  const label = Math.round(product.width * MM_TO_PX)
  const spacer = Math.round(gap * MM_TO_PX)
  const height = Math.round(product.height * MM_TO_PX)
  const next = fieldHtml("NEXT", "«Next Record»")
  const rows: string[] = []
  for (let row = 1; row <= product.rows; row += 1) {
    const cells: string[] = []
    for (let column = 1; column <= product.columns; column += 1) {
      let inner: string
      if ("merge" in content) {
        const first = row === 1 && column === 1
        inner = first ? `<p>${content.merge}</p>` : `<p>${next}${content.merge}</p>`
      } else if (!single || (single.row === row && single.column === column)) {
        inner = linesHtml(content.text)
      } else {
        inner = "<p><br></p>"
      }
      cells.push(`<td colwidth="${label}" data-borders="none">${inner}</td>`)
      if (column < product.columns && gap > 0.5) {
        cells.push(`<td colwidth="${spacer}" data-borders="none"><p><br></p></td>`)
      }
    }
    rows.push(`<tr style="height: ${height}px" data-height-rule="exact">${cells.join("")}</tr>`)
  }
  return `<table data-frame="none"><tbody>${rows.join("")}</tbody></table><p><br></p>`
}
