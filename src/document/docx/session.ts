import type { WordDocument } from "@/document/docx/model"
import { documentStyleSheet } from "@/document/docx/word-styles"

/** The Word document behind the file that is open, kept in memory for the next save. */
let retained: WordDocument | null = null

const STYLE_ELEMENT_ID = "word-document-styles"

export function rememberWordDocument(word: WordDocument | null) {
  retained = word
  showWordStyles(word)
}

export function currentWordDocument() {
  return retained
}

export function clearWordDocument() {
  retained = null
  showWordStyles(null)
}

/** Puts the open document's styles (fonts, sizes, spacing) on the page, or takes them off. */
function showWordStyles(word: WordDocument | null) {
  if (typeof document === "undefined") {
    return
  }
  const existing = document.getElementById(STYLE_ELEMENT_ID)
  if (!word) {
    existing?.remove()
    return
  }
  const element = existing ?? document.createElement("style")
  element.id = STYLE_ELEMENT_ID
  element.textContent = documentStyleSheet(word)
  // Last in <head>, so it follows the app stylesheet it overrides.
  document.head.appendChild(element)
}
