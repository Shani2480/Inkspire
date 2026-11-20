import { showEmbeddedFonts } from "@/document/docx/embedded-fonts"
import type { WordDocument } from "@/document/docx/model"
import { documentStyleSheet } from "@/document/docx/word-styles"
import { currentTheme, designedCatalog, designedThemeFonts, emptyWordDocument, themeChanged } from "@/document/design"
import type { PageSetup } from "@/document/page-setup"

/** The Word document behind the file that is open, kept in memory for the next save. */
let retained: WordDocument | null = null
/** The Design tab's choices for the open document (theme, Style Set, Paragraph Spacing). */
let design: PageSetup | null = null

const STYLE_ELEMENT_ID = "word-document-styles"

export function rememberWordDocument(word: WordDocument | null) {
  retained = word
  showWordStyles()
  // The fonts it carries, shown while it is open (Word's Embed fonts in the file).
  showEmbeddedFonts(word)
}

export function currentWordDocument() {
  return retained
}

export function clearWordDocument() {
  retained = null
  showWordStyles()
  showEmbeddedFonts(null)
}

/** Draws the page with the Design tab's choices; called whenever the page setup changes. */
export function showDocumentDesign(setup: PageSetup) {
  const key = (value: PageSetup | null) =>
    value
      ? [value.themeName, value.colorScheme, value.themeColors, value.fontScheme, value.bodyFont, value.headingFont]
          .concat([value.styleSet, value.spacing])
          .join("|")
      : ""
  if (key(setup) === key(design)) {
    return
  }
  design = setup
  showWordStyles()
}

/** True when the Design tab changed what a saved .docx holds: its theme, Style Set or Paragraph Spacing. */
export function designChanged(setup: PageSetup) {
  return Boolean(setup.styleSet || setup.spacing !== "default" || themeChanged(setup))
}

/** The style sheet the page shows: the document's styles (or a Style Set's) with the theme chosen. */
export function designStyleSheet(word: WordDocument | null, setup: PageSetup | null) {
  if (!word && !setup?.styleSet) {
    // A document made in the app is drawn by the app's own stylesheet and the design variables.
    return null
  }
  const base = word ?? emptyWordDocument()
  if (!setup || !designChanged(setup)) {
    return documentStyleSheet(base)
  }
  const styled = { ...base, styles: designedCatalog(base.styles, setup, !word) }
  return documentStyleSheet(styled, designedThemeFonts(word, currentTheme(setup, word)))
}

/** Puts the open document's styles (fonts, sizes, spacing) on the page, or takes them off. */
function showWordStyles() {
  if (typeof document === "undefined") {
    return
  }
  const existing = document.getElementById(STYLE_ELEMENT_ID)
  const sheet = designStyleSheet(retained, design)
  if (sheet === null) {
    existing?.remove()
    return
  }
  const element = existing ?? document.createElement("style")
  element.id = STYLE_ELEMENT_ID
  element.textContent = sheet
  // Last in <head>, so it follows the app stylesheet it overrides.
  document.head.appendChild(element)
}
