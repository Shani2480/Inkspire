import { tree, type Element } from "@/document/docx/chart-xml"
import { findPart, relationshipsFor, type OpcPackage } from "@/document/docx/opc"
import { escapeXml, escapeXmlText } from "@/document/docx/xml"
import { readZip, storedZip } from "@/document/docx/zip"
import { columnName, columnIndex, resolveCell } from "@/editor/sheet-grid"

/**
 * Insert > Table > Excel Spreadsheet, as Word keeps it: an embedded Excel workbook (an OLE object, ProgID
 * Excel.Sheet.12) with a picture of its cells that Word shows, and Excel opens on a double-click. The editor shows
 * the sheet's first worksheet as its grid (`sheetBlock`): text, numbers and formulas.
 */

const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

/** Excel's default cell, in points (64 by 20 pixels). */
export const CELL_WIDTH_PT = 48
export const CELL_HEIGHT_PT = 15

/** A worksheet embedded in the document: its grid, the values its workbook shows, and the workbook itself. */
export type EmbeddedSheet = { relId: string; grid: string[][]; values: string[][]; workbook: Uint8Array }

function children(element: Element | undefined, name: string) {
  return element?.children.filter((child) => child.name === name) ?? []
}

function first(element: Element | undefined, name: string): Element | undefined {
  return element?.children.find((child) => child.name === name)
}

/** The text of an `<si>` or `<is>` (a plain `<t>`, or the runs of a rich one). */
function stringOf(element: Element | undefined) {
  if (!element) {
    return ""
  }
  const plain = first(element, "t")
  if (plain) {
    return plain.text
  }
  return children(element, "r")
    .map((run) => first(run, "t")?.text ?? "")
    .join("")
}

function resolvePath(base: string, target: string) {
  if (target.startsWith("/")) {
    return target.slice(1)
  }
  const parts = base.split("/").slice(0, -1)
  for (const piece of target.split("/")) {
    if (piece === "..") {
      parts.pop()
    } else if (piece && piece !== ".") {
      parts.push(piece)
    }
  }
  return parts.join("/")
}

/** The first worksheet of a workbook as the editor's grid: formulas as "=…", the rest as shown. */
export async function readSheetGrid(bytes: Uint8Array): Promise<string[][] | null> {
  return (await readSheetWorkbook(bytes))?.grid ?? null
}

/**
 * The first worksheet of a workbook: what was typed (`grid`) and what each cell shows (`values`), with the result
 * Excel or Cells worked out for each formula, kept for the functions the editor does not calculate.
 */
export async function readSheetWorkbook(bytes: Uint8Array): Promise<{ grid: string[][]; values: string[][] } | null> {
  let entries
  try {
    entries = await readZip(bytes)
  } catch {
    return null
  }
  const text = (name: string) => {
    const entry = entries.find((item) => item.normalizedName.toLowerCase() === name.toLowerCase())
    return entry ? new TextDecoder().decode(entry.data) : null
  }
  // The document element of a part (`tree` gives it back itself).
  const part = (name: string) => tree(text(name) ?? "") ?? undefined
  const firstSheet = children(first(part("xl/workbook.xml"), "sheets"), "sheet")[0]
  const relId = firstSheet?.attrs.id
  const relation = children(part("xl/_rels/workbook.xml.rels"), "Relationship").find((item) => item.attrs.Id === relId)
  const sheetPath = relation ? resolvePath("xl/workbook.xml", relation.attrs.Target ?? "") : "xl/worksheets/sheet1.xml"
  const worksheet = part(sheetPath)
  if (!worksheet) {
    return null
  }
  const shared = children(part("xl/sharedStrings.xml"), "si").map(stringOf)
  const cells: { row: number; col: number; value: string; shown: string }[] = []
  const data = first(worksheet, "sheetData")
  for (const row of children(data, "row")) {
    for (const cell of children(row, "c")) {
      const ref = /^([A-Z]+)(\d+)$/.exec(cell.attrs.r ?? "")
      if (!ref) {
        continue
      }
      const formula = first(cell, "f")?.text
      const raw = first(cell, "v")?.text ?? ""
      const type = cell.attrs.t
      const plain =
        type === "s"
          ? (shared[Number(raw)] ?? "")
          : type === "inlineStr"
            ? stringOf(first(cell, "is"))
            : type === "b"
              ? raw === "1"
                ? "TRUE"
                : "FALSE"
              : raw
      const value = formula ? `=${formula}` : plain
      if (value !== "") {
        cells.push({ row: Number(ref[2]) - 1, col: columnIndex(ref[1]!), value, shown: plain })
      }
    }
  }
  const rows = Math.min(200, Math.max(1, ...cells.map((cell) => cell.row + 1)))
  const cols = Math.min(52, Math.max(1, ...cells.map((cell) => cell.col + 1)))
  const blank = () => Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""))
  const grid = blank()
  const values = blank()
  for (const cell of cells) {
    if (cell.row < rows && cell.col < cols) {
      grid[cell.row]![cell.col] = cell.value
      values[cell.row]![cell.col] = cell.shown
    }
  }
  return { grid, values }
}

/** Every Excel workbook the document's body embeds, read into a grid, by the relationship that points at it. */
export async function readEmbeddedSheets(pkg: OpcPackage): Promise<EmbeddedSheet[]> {
  const sheets: EmbeddedSheet[] = []
  for (const rel of relationshipsFor(pkg, pkg.mainPartName)) {
    if (!rel.type.endsWith("/package") || !rel.partName || !/\.xlsx$/i.test(rel.partName)) {
      continue
    }
    const part = findPart(pkg, rel.partName)
    const read = part ? await readSheetWorkbook(part.data) : null
    if (part && read) {
      sheets.push({ relId: rel.id, ...read, workbook: part.data })
    }
  }
  return sheets
}

/** The relationship id of the Excel workbook a run's w:object embeds, if it is one. */
export function excelObjectRelId(xml: string) {
  const ole = /<o:OLEObject\b[^>]*>/.exec(xml)?.[0]
  if (!ole || !/\bProgID="Excel\.Sheet(\.\d+)?"/.test(ole)) {
    return null
  }
  return /\br:id="([^"]+)"/.exec(ole)?.[1] ?? null
}

/** A workbook holding the grid in its one worksheet; formulas keep the value the editor worked out. */
export function sheetWorkbook(grid: string[][]) {
  const encoder = new TextEncoder()
  const xml = (body: string) => encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`)
  const rows = grid.map((line, row) => {
    const cells = line.map((value, col) => {
      const ref = `${columnName(col)}${row + 1}`
      const text = value.trim()
      if (!text) {
        return ""
      }
      if (text.startsWith("=")) {
        const result = resolveCell(grid, row, col)
        const number = Number(result)
        if (result === "#ERR") {
          // A function the editor does not calculate: no result, so Excel or Cells works it out on opening.
          return `<c r="${ref}"><f>${escapeXmlText(text.slice(1))}</f></c>`
        }
        return result !== "" && Number.isFinite(number)
          ? `<c r="${ref}"><f>${escapeXmlText(text.slice(1))}</f><v>${number}</v></c>`
          : `<c r="${ref}" t="str"><f>${escapeXmlText(text.slice(1))}</f><v>${escapeXmlText(result)}</v></c>`
      }
      if (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) {
        return `<c r="${ref}"><v>${Number(text)}</v></c>`
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXmlText(value)}</t></is></c>`
    })
    return `<row r="${row + 1}">${cells.join("")}</row>`
  })
  const end = `${columnName(Math.max(0, (grid[0]?.length ?? 1) - 1))}${Math.max(1, grid.length)}`
  return storedZip([
    {
      name: "[Content_Types].xml",
      data: xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: xml(
        `<workbook xmlns="${SHEET_NS}" xmlns:r="${REL_NS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/styles.xml",
      data: xml(
        `<styleSheet xmlns="${SHEET_NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
          `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
          `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
          `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
          `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: xml(
        `<worksheet xmlns="${SHEET_NS}"><dimension ref="A1:${end}"/><sheetData>${rows.join("")}</sheetData></worksheet>`,
      ),
    },
  ])
}

/** VML's picture frame shape type, which Word defines once for every embedded object's picture. */
const PICTURE_FRAME =
  `<v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f">` +
  `<v:stroke joinstyle="miter"/><v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/>` +
  `<v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/>` +
  `<v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/>` +
  `<v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/>` +
  `<v:f eqn="sum @10 21600 0"/></v:formulas><v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/>` +
  `<o:lock v:ext="edit" aspectratio="t"/></v:shapetype>`

/** The w:object Word writes for an embedded Excel worksheet: its picture (`imageRelId`) and workbook (`packageRelId`). */
export function excelObjectXml(options: {
  shapeId: number
  objectId: number
  widthPt: number
  heightPt: number
  imageRelId: string
  packageRelId: string
}) {
  const { widthPt, heightPt } = options
  const shape = `_x0000_i${options.shapeId}`
  return (
    `<w:object xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" w:dxaOrig="${Math.round(widthPt * 20)}" w:dyaOrig="${Math.round(heightPt * 20)}">` +
    PICTURE_FRAME +
    `<v:shape id="${shape}" type="#_x0000_t75" style="width:${widthPt}pt;height:${heightPt}pt" o:ole="">` +
    `<v:imagedata r:id="${escapeXml(options.imageRelId)}" o:title=""/></v:shape>` +
    `<o:OLEObject Type="Embed" ProgID="Excel.Sheet.12" ShapeID="${shape}" DrawAspect="Content" ` +
    `ObjectID="_${options.objectId}" r:id="${escapeXml(options.packageRelId)}"/></w:object>`
  )
}

/** The sheet's size as Word shows the object: Excel's default cells, every column and row of the grid. */
export function sheetSizePx(grid: string[][]) {
  return { width: Math.max(1, grid[0]?.length ?? 1) * 64, height: Math.max(1, grid.length) * 20 }
}

/** The width and height of a w:object's picture (its v:shape style), in points. */
export function objectSizePt(xml: string) {
  const style = /<v:shape\b[^>]*\bstyle="([^"]*)"/.exec(xml)?.[1] ?? ""
  const length = (name: string) => {
    const match = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([\\d.]+)(pt|in|cm|mm|px)?`).exec(style)
    if (!match) {
      return undefined
    }
    const value = Number(match[1])
    const unit = match[2] ?? "px"
    return unit === "pt"
      ? value
      : unit === "in"
        ? value * 72
        : unit === "cm"
          ? (value * 72) / 2.54
          : unit === "mm"
            ? (value * 72) / 25.4
            : value * 0.75
  }
  return { width: length("width"), height: length("height") }
}
