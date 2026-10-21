import { contrastRatio, TEXT_CONTRAST } from "@/document/theme"
import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"

export type AccessibilitySeverity = "error" | "warning" | "tip"

export type AccessibilityKind =
  | "missing-alt"
  | "weak-alt"
  | "empty-heading"
  | "heading-skip"
  | "link-text"
  | "table-header"
  | "table-alt"
  | "contrast"
  | "empty-paragraphs"
  | "long-paragraph"

/** A change the checker can make on its own, without asking the AI. */
export type AccessibilityFix =
  | { type: "heading-level"; level: number }
  | { type: "table-header" }
  | { type: "color"; color: string }
  | { type: "remove-empty" }

export type AccessibilityIssue = {
  /** Stable for one position and rule, so a card keeps its state between re-checks. */
  id: string
  kind: AccessibilityKind
  severity: AccessibilitySeverity
  message: string
  /** Where the offending node starts. */
  pos: number
  /** The node's type name, used to confirm the node is still there before a fix is applied. */
  node: string
  /** A short piece of the node, shown on the card. */
  excerpt: string
  fix?: AccessibilityFix
  /** The AI can write a suggestion for this (alternative text, link text, table description). */
  ai?: "alt" | "link" | "table"
}

const GENERIC_LINKS = /^(here|click here|this|link|this link|read more|more|learn more|details|click|go)$/i
const FILE_ALT = /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|heic|avif)$/i
const GENERIC_ALT = /^(image|picture|photo|graphic|screenshot|img|untitled|figure|chart|diagram)[\s_-]*\d*$/i
const CAMERA_ALT = /^(img|dsc|image|screenshot|photo)[\s_-]*\d{2,}/i
const ALT_TYPES = new Set(["image", "textBox", "figure", "threeDModel"])

const OBJECT_NAMES: Record<string, string> = {
  image: "picture",
  textBox: "text box",
  figure: "figure",
  threeDModel: "3-D model",
}

function excerptOf(node: ProseNode) {
  const text = node.textContent.replace(/\s+/g, " ").trim()
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

/** True when the alternative text only repeats a file name or says nothing ("image", "Screenshot 2024"). */
export function isWeakAlt(alt: string) {
  const value = alt.trim()
  return FILE_ALT.test(value) || GENERIC_ALT.test(value) || CAMERA_ALT.test(value)
}

function isUrlLike(text: string) {
  return /^(https?:\/\/|www\.)\S+$/i.test(text.trim())
}

/** A colour that reads on the background: the given one moved toward black or white until it clears 4.5:1. */
export function readableColor(color: string, background: string) {
  const dark = contrastRatio("#000000", background) >= contrastRatio("#ffffff", background)
  const target = dark ? [0, 0, 0] : [255, 255, 255]
  const value = color.replace("#", "")
  const full = value.length === 3 ? [...value].map((digit) => digit + digit).join("") : value
  const base = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16))
  for (let step = 1; step <= 20; step++) {
    const amount = step / 20
    const next = base.map((part, index) => Math.round(part + (target[index]! - part) * amount))
    const hex = `#${next.map((part) => part.toString(16).padStart(2, "0")).join("")}`
    if (contrastRatio(hex, background) >= TEXT_CONTRAST) {
      return hex
    }
  }
  return dark ? "#000000" : "#ffffff"
}

function hexColor(value: unknown) {
  return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : ""
}

export type AccessibilityOptions = {
  /** The page colour text is read against. White unless the page is coloured. */
  pageColor?: string
}

/** Every accessibility problem in the document, in reading order, from one pass over it. */
export function checkAccessibility(editor: Editor | null, options: AccessibilityOptions = {}) {
  const issues: AccessibilityIssue[] = []
  if (!editor) {
    return issues
  }
  const page = hexColor(options.pageColor) || "#ffffff"
  let lastLevel = 0
  let emptyRun = 0
  let emptyStart = -1

  const flushEmpty = () => {
    if (emptyRun >= 3) {
      issues.push({
        id: `empty-paragraphs:${emptyStart}`,
        kind: "empty-paragraphs",
        severity: "tip",
        message: `${emptyRun} empty paragraphs in a row. Use spacing instead of blank lines, so screen readers do not announce “blank”.`,
        pos: emptyStart,
        node: "paragraph",
        excerpt: "",
        fix: { type: "remove-empty" },
      })
    }
    emptyRun = 0
    emptyStart = -1
  }

  editor.state.doc.descendants((node, pos) => {
    const name = node.type.name
    const isEmptyParagraph = name === "paragraph" && node.content.size === 0
    if (isEmptyParagraph) {
      if (emptyRun === 0) {
        emptyStart = pos
      }
      emptyRun++
    } else if (name !== "doc") {
      flushEmpty()
    }

    if (ALT_TYPES.has(name)) {
      const label = OBJECT_NAMES[name] ?? "object"
      const alt = String(node.attrs.alt || "").trim()
      const hasText = name === "textBox" && node.textContent.trim()
      if (!alt && !hasText) {
        issues.push({
          id: `missing-alt:${pos}`,
          kind: "missing-alt",
          severity: "error",
          message: `A ${label} has no alternative text.`,
          pos,
          node: name,
          excerpt: "",
          ai: name === "textBox" ? undefined : "alt",
        })
      } else if (alt && isWeakAlt(alt)) {
        issues.push({
          id: `weak-alt:${pos}`,
          kind: "weak-alt",
          severity: "warning",
          message: `The alternative text of a ${label} is “${alt.slice(0, 40)}”, which describes nothing.`,
          pos,
          node: name,
          excerpt: alt,
          ai: "alt",
        })
      }
    }

    if (name === "heading") {
      const level = Number(node.attrs.level) || 1
      if (!node.textContent.trim()) {
        issues.push({
          id: `empty-heading:${pos}`,
          kind: "empty-heading",
          severity: "error",
          message: `Heading ${level} is empty.`,
          pos,
          node: name,
          excerpt: "",
        })
      } else {
        if (lastLevel > 0 && level > lastLevel + 1) {
          issues.push({
            id: `heading-skip:${pos}`,
            kind: "heading-skip",
            severity: "warning",
            message: `Heading ${level} follows heading ${lastLevel}. Headings should not skip a level.`,
            pos,
            node: name,
            excerpt: excerptOf(node),
            fix: { type: "heading-level", level: lastLevel + 1 },
          })
          lastLevel = lastLevel + 1
        } else {
          lastLevel = level
        }
      }
    }

    if (name === "table") {
      const first = node.firstChild
      let headed = Boolean(node.attrs.headerRow)
      if (first && first.childCount > 0) {
        headed =
          headed ||
          Array.from({ length: first.childCount }, (_, i) => first.child(i)).every(
            (cell) => cell.type.name === "tableHeader",
          )
      }
      if (!headed) {
        issues.push({
          id: `table-header:${pos}`,
          kind: "table-header",
          severity: "warning",
          message: "A table has no header row, so a screen reader cannot tell the columns apart.",
          pos,
          node: name,
          excerpt: excerptOf(node),
          fix: { type: "table-header" },
        })
      }
      if (!String(node.attrs.altTitle || "").trim() && !String(node.attrs.altDesc || "").trim()) {
        issues.push({
          id: `table-alt:${pos}`,
          kind: "table-alt",
          severity: "tip",
          message: "A table has no alternative text.",
          pos,
          node: name,
          excerpt: excerptOf(node),
          ai: "table",
        })
      }
    }

    if (node.isTextblock) {
      if (node.textContent.length > 800) {
        issues.push({
          id: `long-paragraph:${pos}`,
          kind: "long-paragraph",
          severity: "tip",
          message: "A paragraph is very long. Consider shorter paragraphs for readability.",
          pos,
          node: name,
          excerpt: excerptOf(node),
        })
      }
      node.forEach((child, offset) => {
        const start = pos + 1 + offset
        const marks = child.marks
        const link = marks.find((mark) => mark.type.name === "link")
        if (link && child.isText) {
          const text = (child.text || "").trim()
          if (GENERIC_LINKS.test(text) || isUrlLike(text)) {
            issues.push({
              id: `link-text:${start}`,
              kind: "link-text",
              severity: "warning",
              message: `The link text “${text.slice(0, 40)}” does not say where the link goes.`,
              pos: start,
              node: "text",
              excerpt: text,
              ai: "link",
            })
          }
        }
        const color = hexColor(marks.find((mark) => mark.type.name === "textStyle")?.attrs.color)
        if (color && child.isText && (child.text || "").trim() && contrastRatio(color, page) < TEXT_CONTRAST) {
          issues.push({
            id: `contrast:${start}`,
            kind: "contrast",
            severity: "warning",
            message: `Text in ${color} is hard to read on the page (${contrastRatio(color, page).toFixed(1)}:1, needs ${TEXT_CONTRAST}:1).`,
            pos: start,
            node: "text",
            excerpt: (child.text || "").trim().slice(0, 40),
            fix: { type: "color", color: readableColor(color, page) },
          })
        }
      })
    }
    return true
  })
  flushEmpty()
  return issues
}

export function listAccessibilityIssues(editor: Editor | null) {
  return [...new Set(checkAccessibility(editor).map((issue) => issue.message))].slice(0, 12)
}

export function accessibilityStatus(editor: Editor | null) {
  const issues = listAccessibilityIssues(editor)
  if (issues.length === 0) {
    return { label: "Accessibility: Good to go", ok: true, issues }
  }
  return {
    label: `Accessibility: ${issues.length} issue${issues.length === 1 ? "" : "s"}`,
    ok: false,
    issues,
  }
}
