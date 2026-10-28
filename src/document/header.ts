import { chromeHtml } from "@/document/chrome-html"
import { knownColorScheme } from "@/document/design-format"
import {
  builtInHeader,
  DEFAULT_PAGE_SETUP,
  clipWatermark,
  columnCount,
  columnWidths,
  lineNumberRestart,
  formatPageSetup,
  borderDisplay,
  borderLine,
  borderSpace,
  pageSides,
  effectPreset,
  pageBorder,
  pageNumberPlace,
  parsePageSetup,
  spacingPreset,
  type PageSetup,
} from "@/document/page-setup"

const CHROME_MARK =
  /^<!-- aiword-(header|footer|first-header|first-footer|even-header|even-footer|first|oddeven|page|columns|colgap|colline|colwidths|lines|watermark|border|borderwidth|borderline|borderplace|pagecolor|pagenum|hyphens|language|fonts|spacing|headerstyle|footerstyle|colors|effects):([^\n>]*) -->\n?/

export type DocumentChrome = {
  /** The header and footer of each kind of page, as editor HTML. */
  header: string
  footer: string
  differentFirstPage: boolean
  firstHeader: string
  firstFooter: string
  /** The header and footer of even pages, when the page setup has odd and even pages differ. */
  evenHeader: string
  evenFooter: string
  pageSetup: PageSetup
}

export function emptyChrome(): DocumentChrome {
  return {
    header: "",
    footer: "",
    differentFirstPage: false,
    firstHeader: "",
    firstFooter: "",
    evenHeader: "",
    evenFooter: "",
    pageSetup: DEFAULT_PAGE_SETUP,
  }
}

/** A header or footer is saved as its HTML, so pictures and styled lines come back as they were. */
function comment(
  kind: "header" | "footer" | "first-header" | "first-footer" | "even-header" | "even-footer",
  value: string,
) {
  const html = chromeHtml(value).trim()
  return html ? `<!-- aiword-${kind}:${encodeURIComponent(html)} -->` : ""
}

export function packDocument(html: string, chrome: DocumentChrome) {
  const marks = [
    comment("header", chrome.header),
    comment("footer", chrome.footer),
    chrome.differentFirstPage ? "<!-- aiword-first:1 -->" : "",
    chrome.differentFirstPage ? comment("first-header", chrome.firstHeader) : "",
    chrome.differentFirstPage ? comment("first-footer", chrome.firstFooter) : "",
    chrome.pageSetup.differentOddEven ? comment("even-header", chrome.evenHeader) : "",
    chrome.pageSetup.differentOddEven ? comment("even-footer", chrome.evenFooter) : "",
    `<!-- aiword-page:${formatPageSetup(chrome.pageSetup)} -->`,
    chrome.pageSetup.differentOddEven ? "<!-- aiword-oddeven:1 -->" : "",
    chrome.pageSetup.columns === 1 ? "" : `<!-- aiword-columns:${chrome.pageSetup.columns} -->`,
    chrome.pageSetup.columns > 1 && chrome.pageSetup.columnGap !== DEFAULT_PAGE_SETUP.columnGap
      ? `<!-- aiword-colgap:${chrome.pageSetup.columnGap} -->`
      : "",
    chrome.pageSetup.columns > 1 && chrome.pageSetup.columnLine ? "<!-- aiword-colline:1 -->" : "",
    chrome.pageSetup.columns > 1 && chrome.pageSetup.columnWidths
      ? `<!-- aiword-colwidths:${chrome.pageSetup.columnWidths.map((column) => `${column.width}/${column.space}`).join(",")} -->`
      : "",
    chrome.pageSetup.lineNumbers
      ? `<!-- aiword-lines:${chrome.pageSetup.lineNumberRestart === "continuous" ? "1" : chrome.pageSetup.lineNumberRestart} -->`
      : "",
    chrome.pageSetup.watermark ? `<!-- aiword-watermark:${encodeURIComponent(chrome.pageSetup.watermark)} -->` : "",
    chrome.pageSetup.border === "none"
      ? ""
      : `<!-- aiword-border:${chrome.pageSetup.border},${encodeURIComponent(chrome.pageSetup.borderColor)} -->`,
    chrome.pageSetup.borderWidth === DEFAULT_PAGE_SETUP.borderWidth
      ? ""
      : `<!-- aiword-borderwidth:${chrome.pageSetup.borderWidth} -->`,
    chrome.pageSetup.borderLine === "solid" ? "" : `<!-- aiword-borderline:${chrome.pageSetup.borderLine} -->`,
    chrome.pageSetup.border === "none"
      ? ""
      : `<!-- aiword-borderplace:${chrome.pageSetup.borderDisplay},${chrome.pageSetup.borderFrom},${chrome.pageSetup.borderSpace.join(" ")},${chrome.pageSetup.borderSides.join(" ")},${borderFlags(chrome.pageSetup)} -->`,
    chrome.pageSetup.pageColor ? `<!-- aiword-pagecolor:${encodeURIComponent(chrome.pageSetup.pageColor)} -->` : "",
    chrome.pageSetup.pageNumber === "bottom-center" ? "" : `<!-- aiword-pagenum:${chrome.pageSetup.pageNumber} -->`,
    chrome.pageSetup.hyphenation ? "<!-- aiword-hyphens:1 -->" : "",
    chrome.pageSetup.language && chrome.pageSetup.language !== "en-US" && chrome.pageSetup.language !== "en"
      ? `<!-- aiword-language:${encodeURIComponent(chrome.pageSetup.language)} -->`
      : "",
    chrome.pageSetup.bodyFont || chrome.pageSetup.headingFont
      ? `<!-- aiword-fonts:${encodeURIComponent(chrome.pageSetup.bodyFont)}|${encodeURIComponent(chrome.pageSetup.headingFont)} -->`
      : "",
    chrome.pageSetup.colorScheme ? `<!-- aiword-colors:${encodeURIComponent(chrome.pageSetup.colorScheme)} -->` : "",
    chrome.pageSetup.effects ? `<!-- aiword-effects:${chrome.pageSetup.effects} -->` : "",
    chrome.pageSetup.spacing === "default" ? "" : `<!-- aiword-spacing:${chrome.pageSetup.spacing} -->`,
    chrome.pageSetup.headerStyle === "blank" ? "" : `<!-- aiword-headerstyle:${chrome.pageSetup.headerStyle} -->`,
    chrome.pageSetup.footerStyle === "blank" ? "" : `<!-- aiword-footerstyle:${chrome.pageSetup.footerStyle} -->`,
  ].filter(Boolean)
  return marks.length ? `${marks.join("\n")}\n${html}` : html
}

function decodeMark(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return ""
  }
}

/** Page Border Options' check boxes that are on, as the `borderplace` mark keeps them ("front header"). */
function borderFlags(setup: PageSetup) {
  return [
    setup.borderInFront ? "front" : "",
    setup.borderSurroundHeader ? "header" : "",
    setup.borderSurroundFooter ? "footer" : "",
    setup.borderAlign ? "align" : "",
  ]
    .filter(Boolean)
    .join(" ")
}

export function unpackDocument(raw: string) {
  let html = raw
  const chrome = emptyChrome()
  // Files written while a new document was numbered at the bottom centre carry no page number mark; they keep it.
  chrome.pageSetup = { ...chrome.pageSetup, pageNumber: "bottom-center" }
  let borderPlaced = false

  for (;;) {
    const match = html.match(CHROME_MARK)
    if (!match) {
      break
    }
    const value = decodeMark(match[2])
    if (match[1] === "header") {
      chrome.header = chromeHtml(value)
    } else if (match[1] === "footer") {
      chrome.footer = chromeHtml(value)
    } else if (match[1] === "first-header") {
      chrome.firstHeader = chromeHtml(value)
    } else if (match[1] === "first-footer") {
      chrome.firstFooter = chromeHtml(value)
    } else if (match[1] === "even-header") {
      chrome.evenHeader = chromeHtml(value)
    } else if (match[1] === "even-footer") {
      chrome.evenFooter = chromeHtml(value)
    } else if (match[1] === "first") {
      chrome.differentFirstPage = value === "1"
    } else if (match[1] === "page") {
      chrome.pageSetup = parsePageSetup(value)
    } else if (match[1] === "oddeven") {
      chrome.pageSetup = { ...chrome.pageSetup, differentOddEven: value === "1" }
    } else if (match[1] === "columns") {
      chrome.pageSetup = { ...chrome.pageSetup, columns: columnCount(value) }
    } else if (match[1] === "colwidths") {
      const widths = value.split(",").map((item) => {
        const [width, space] = item.split("/").map(Number)
        return { width, space }
      })
      chrome.pageSetup = {
        ...chrome.pageSetup,
        columnWidths: columnWidths(widths, chrome.pageSetup.columns),
      }
    } else if (match[1] === "colline") {
      chrome.pageSetup = { ...chrome.pageSetup, columnLine: value === "1" }
    } else if (match[1] === "colgap") {
      const gap = Number(value)
      chrome.pageSetup = {
        ...chrome.pageSetup,
        columnGap: Number.isFinite(gap)
          ? Math.min(5, Math.max(0.2, Math.round(gap * 100) / 100))
          : DEFAULT_PAGE_SETUP.columnGap,
      }
    } else if (match[1] === "lines") {
      chrome.pageSetup = {
        ...chrome.pageSetup,
        lineNumbers: value === "1" || value === "page" || value === "section",
        lineNumberRestart: lineNumberRestart(value),
      }
    } else if (match[1] === "watermark") {
      chrome.pageSetup = { ...chrome.pageSetup, watermark: clipWatermark(value) }
    } else if (match[1] === "border") {
      const [style, color] = value.split(",")
      chrome.pageSetup = {
        ...chrome.pageSetup,
        border: pageBorder(style),
        borderColor: /^#[0-9a-fA-F]{6}$/.test(color ?? "") ? color : DEFAULT_PAGE_SETUP.borderColor,
      }
    } else if (match[1] === "borderwidth") {
      const width = Number(value)
      chrome.pageSetup = {
        ...chrome.pageSetup,
        borderWidth: Number.isFinite(width) ? width : DEFAULT_PAGE_SETUP.borderWidth,
      }
    } else if (match[1] === "borderline") {
      chrome.pageSetup = { ...chrome.pageSetup, borderLine: borderLine(value) }
    } else if (match[1] === "borderplace") {
      const [display, from, space, sides, flags] = value.split(",")
      borderPlaced = true
      chrome.pageSetup = {
        ...chrome.pageSetup,
        borderDisplay: borderDisplay(display),
        borderFrom: from === "text" ? "text" : "page",
        borderSpace: borderSpace(String(space ?? "").split(" ")) ?? DEFAULT_PAGE_SETUP.borderSpace,
        borderSides: pageSides(sides),
        // Files written before the Options check boxes keep Word's defaults.
        ...(flags === undefined
          ? {}
          : {
              borderInFront: flags.includes("front"),
              borderSurroundHeader: flags.includes("header"),
              borderSurroundFooter: flags.includes("footer"),
              borderAlign: flags.includes("align"),
            }),
      }
    } else if (match[1] === "pagecolor") {
      chrome.pageSetup = { ...chrome.pageSetup, pageColor: /^#[0-9a-fA-F]{6}$/.test(value) ? value : "" }
    } else if (match[1] === "pagenum") {
      chrome.pageSetup = { ...chrome.pageSetup, pageNumber: pageNumberPlace(value) }
    } else if (match[1] === "hyphens") {
      chrome.pageSetup = { ...chrome.pageSetup, hyphenation: value === "1" }
    } else if (match[1] === "language") {
      chrome.pageSetup = { ...chrome.pageSetup, language: value || "en-US" }
    } else if (match[1] === "fonts") {
      const [body, heading] = value.split("|")
      chrome.pageSetup = { ...chrome.pageSetup, bodyFont: body ?? "", headingFont: heading ?? "" }
    } else if (match[1] === "colors") {
      chrome.pageSetup = { ...chrome.pageSetup, colorScheme: knownColorScheme(value) }
    } else if (match[1] === "effects") {
      chrome.pageSetup = { ...chrome.pageSetup, effects: effectPreset(value) }
    } else if (match[1] === "spacing") {
      chrome.pageSetup = { ...chrome.pageSetup, spacing: spacingPreset(value) }
    } else if (match[1] === "headerstyle") {
      chrome.pageSetup = { ...chrome.pageSetup, headerStyle: builtInHeader(value) }
    } else if (match[1] === "footerstyle") {
      chrome.pageSetup = { ...chrome.pageSetup, footerStyle: builtInHeader(value) }
    }
    html = html.slice(match[0].length)
  }
  if (chrome.pageSetup.border !== "none" && !borderPlaced) {
    // Written before the border had Options: it was drawn on the margins.
    chrome.pageSetup = {
      ...chrome.pageSetup,
      borderFrom: "text",
      borderSpace: [0, 0, 0, 0],
      borderSurroundHeader: false,
      borderSurroundFooter: false,
    }
  }

  return { html, ...chrome }
}
