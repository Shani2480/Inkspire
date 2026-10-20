import { knownColorScheme } from "@/document/design-format"
import {
  builtInHeader,
  DEFAULT_PAGE_SETUP,
  clipWatermark,
  columnCount,
  formatPageSetup,
  borderLine,
  effectPreset,
  pageBorder,
  pageNumberPlace,
  parsePageSetup,
  spacingPreset,
  type PageSetup,
} from "@/document/page-setup"

const CHROME_MARK =
  /^<!-- aiword-(header|footer|first-header|first-footer|first|page|columns|colgap|colline|lines|watermark|border|borderwidth|borderline|pagecolor|pagenum|hyphens|language|fonts|spacing|headerstyle|footerstyle|colors|effects):([^\n>]*) -->\n?/
const CHROME_LIMIT = 160

/** Absolutely positioned image from a Word header/footer (or body float). */
export type ChromeShape = {
  src: string
  width: number
  height: number
  /** CSS pixels from the left edge of the page sheet. */
  x: number
  /** CSS pixels from the top edge of the page sheet (header) or up from the bottom (footer, via zone). */
  y: number
  behind?: boolean
  alt?: string
}

export type DocumentChrome = {
  header: string
  footer: string
  differentFirstPage: boolean
  firstHeader: string
  firstFooter: string
  pageSetup: PageSetup
  headerShapes: ChromeShape[]
  footerShapes: ChromeShape[]
  firstHeaderShapes: ChromeShape[]
  firstFooterShapes: ChromeShape[]
}

export function emptyChrome(): DocumentChrome {
  return {
    header: "",
    footer: "",
    differentFirstPage: false,
    firstHeader: "",
    firstFooter: "",
    pageSetup: DEFAULT_PAGE_SETUP,
    headerShapes: [],
    footerShapes: [],
    firstHeaderShapes: [],
    firstFooterShapes: [],
  }
}

function clip(value: string) {
  return value.trim().slice(0, CHROME_LIMIT)
}

function comment(kind: "header" | "footer" | "first-header" | "first-footer", value: string) {
  const text = clip(value)
  return text ? `<!-- aiword-${kind}:${encodeURIComponent(text)} -->` : ""
}

export function packDocument(html: string, chrome: DocumentChrome) {
  const marks = [
    comment("header", chrome.header),
    comment("footer", chrome.footer),
    chrome.differentFirstPage ? "<!-- aiword-first:1 -->" : "",
    chrome.differentFirstPage ? comment("first-header", chrome.firstHeader) : "",
    chrome.differentFirstPage ? comment("first-footer", chrome.firstFooter) : "",
    `<!-- aiword-page:${formatPageSetup(chrome.pageSetup)} -->`,
    chrome.pageSetup.columns === 1 ? "" : `<!-- aiword-columns:${chrome.pageSetup.columns} -->`,
    chrome.pageSetup.columns > 1 && chrome.pageSetup.columnGap !== DEFAULT_PAGE_SETUP.columnGap
      ? `<!-- aiword-colgap:${chrome.pageSetup.columnGap} -->`
      : "",
    chrome.pageSetup.columns > 1 && chrome.pageSetup.columnLine ? "<!-- aiword-colline:1 -->" : "",
    chrome.pageSetup.lineNumbers
      ? `<!-- aiword-lines:${chrome.pageSetup.lineNumberRestart === "page" ? "page" : "1"} -->`
      : "",
    chrome.pageSetup.watermark ? `<!-- aiword-watermark:${encodeURIComponent(chrome.pageSetup.watermark)} -->` : "",
    chrome.pageSetup.border === "none"
      ? ""
      : `<!-- aiword-border:${chrome.pageSetup.border},${encodeURIComponent(chrome.pageSetup.borderColor)} -->`,
    chrome.pageSetup.borderWidth === DEFAULT_PAGE_SETUP.borderWidth
      ? ""
      : `<!-- aiword-borderwidth:${chrome.pageSetup.borderWidth} -->`,
    chrome.pageSetup.borderLine === "solid" ? "" : `<!-- aiword-borderline:${chrome.pageSetup.borderLine} -->`,
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
    return decodeURIComponent(value).slice(0, CHROME_LIMIT)
  } catch {
    return ""
  }
}

export function unpackDocument(raw: string) {
  let html = raw
  const chrome = emptyChrome()

  for (;;) {
    const match = html.match(CHROME_MARK)
    if (!match) {
      break
    }
    const value = decodeMark(match[2])
    if (match[1] === "header") {
      chrome.header = value
    } else if (match[1] === "footer") {
      chrome.footer = value
    } else if (match[1] === "first-header") {
      chrome.firstHeader = value
    } else if (match[1] === "first-footer") {
      chrome.firstFooter = value
    } else if (match[1] === "first") {
      chrome.differentFirstPage = value === "1"
    } else if (match[1] === "page") {
      chrome.pageSetup = parsePageSetup(value)
    } else if (match[1] === "columns") {
      chrome.pageSetup = { ...chrome.pageSetup, columns: columnCount(value) }
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
        lineNumbers: value === "1" || value === "page",
        lineNumberRestart: value === "page" ? "page" : "continuous",
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

  return { html, ...chrome }
}
