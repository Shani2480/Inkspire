import { changedAttrs, type ParagraphDraft } from "@/components/paragraph-dialog"
import { describe, expect, it } from "vitest"

const draft: ParagraphDraft = {
  align: "left",
  outline: "body",
  collapsed: false,
  leftCm: "0",
  rightCm: "0",
  special: "none",
  specialBy: "",
  mirror: false,
  before: "0",
  after: "8",
  lineSpacing: "multiple",
  lineAt: "1.15",
  contextual: false,
  widow: true,
  keepNext: false,
  keepLines: false,
  pageBreakBefore: false,
  suppressLines: false,
  dontHyphenate: false,
  tightWrap: "none",
}
const attrs = { textAlign: "left", spaceAfter: 8, lineRule: "multiple", lineHeight: "1.15", keepNext: true }

describe("Paragraph dialog applies what changed (22.8)", () => {
  it("writes Keep with next alone, leaving the paragraph's spacing as it was", () => {
    expect(changedAttrs(attrs, { ...draft, keepNext: true }, draft)).toEqual({ keepNext: true })
  })

  it("writes both line spacing attributes when either field changed, and nothing when none did", () => {
    expect(changedAttrs(attrs, { ...draft, lineAt: "2" }, draft)).toEqual({ lineRule: "multiple", lineHeight: "1.15" })
    expect(changedAttrs(attrs, draft, draft)).toEqual({})
  })
})
