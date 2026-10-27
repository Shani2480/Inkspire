import katex from "katex"
import { SaxesParser } from "saxes"
import { describe, expect, it } from "vitest"
import { isOmml, ommlToTex, texToOmml } from "@/document/docx/omml"
import { BUILT_IN_EQUATIONS } from "@/editor/equation-gallery"
import { EQUATION_STRUCTURES, EQUATION_SYMBOLS } from "@/editor/equation-templates"

const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

/** Throws unless `xml` is well formed with every prefix declared (w: is declared by the part, as in a document). */
function wellFormed(xml: string) {
  const parser = new SaxesParser({ xmlns: true })
  parser.on("error", (error) => {
    throw error
  })
  parser.write(`<w:root ${W}>${xml}</w:root>`).close()
}

const filled = (template: string) => template.replace(/#(\d)/g, (_match, n: string) => "abcdefghi"[Number(n) - 1]!)

const EVERYTHING = [
  ...EQUATION_STRUCTURES.flatMap((group) => group.items.map((item) => filled(item.tex))),
  ...EQUATION_SYMBOLS.flatMap((group) => group.items.map((item) => item.tex)),
  ...BUILT_IN_EQUATIONS.map((item) => item.tex),
]

describe("equations to Word's math markup", () => {
  it.each(EVERYTHING)("%s is written as OMML, reads back as LaTeX KaTeX draws, and writes the same again", (tex) => {
    const omml = texToOmml(tex)
    wellFormed(omml)
    expect(isOmml(omml)).toBe(true)
    const read = ommlToTex(omml)
    expect(read).not.toBeNull()
    expect(() => katex.renderToString(read!.tex, { throwOnError: true })).not.toThrow()
    expect(texToOmml(read!.tex)).toBe(omml)
  })

  it("writes each structure as Word's element", () => {
    expect(texToOmml("\\frac{a}{b}")).toContain("<m:f><m:num>")
    expect(texToOmml("x^{2}")).toContain("<m:sSup>")
    expect(texToOmml("x_{i}^{2}")).toContain("<m:sSubSup>")
    expect(texToOmml("{}^{a}x")).toContain("<m:sPre>")
    expect(texToOmml("\\sqrt{x}")).toContain('<m:degHide m:val="1"/>')
    expect(texToOmml("\\sqrt[3]{x}")).toContain("<m:deg><m:r>")
    expect(texToOmml("\\sum_{k=0}^{n} k")).toContain('<m:chr m:val="∑"/><m:limLoc m:val="undOvr"/>')
    expect(texToOmml("\\int x\\,dx")).toContain('<m:limLoc m:val="subSup"/><m:subHide m:val="1"/><m:supHide m:val="1"/>')
    expect(texToOmml("\\left[x\\right]")).toContain('<m:begChr m:val="["/><m:endChr m:val="]"/>')
    expect(texToOmml("\\binom{n}{k}")).toContain('<m:type m:val="noBar"/>')
    expect(texToOmml("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}")).toContain('<m:count m:val="2"/>')
    expect(texToOmml("\\sin\\left(x\\right)")).toMatch(/<m:func><m:fName><m:r><m:rPr><m:sty m:val="p"\/><\/m:rPr>.*sin/)
    expect(texToOmml("\\lim_{x \\to 0} f")).toContain("<m:fName><m:limLow>")
    expect(texToOmml("\\vec{v}")).toContain('<m:chr m:val="⃗"/>')
    expect(texToOmml("\\overline{z}")).toContain('<m:pos m:val="top"/>')
    expect(texToOmml("\\text{if } x")).toContain("<m:rPr><m:nor/></m:rPr>")
    expect(texToOmml("\\alpha\\leq\\infty")).toContain(">α≤∞</m:t>")
  })

  it("puts a display equation in m:oMathPara, declaring the namespace once", () => {
    const omml = texToOmml("x=1", true)
    expect(omml.startsWith(`<m:oMathPara ${M}><m:oMath>`)).toBe(true)
    wellFormed(omml)
    expect(ommlToTex(omml)).toEqual({ tex: "x=1", display: true })
  })

  it("ends a large operator's body at the next sign at its level", () => {
    const omml = texToOmml("\\sum_{i} a_{i}+b")
    expect(omml).toMatch(/<m:e><m:sSub>.*<\/m:sSub><\/m:e><\/m:nary><m:r>.*>\+b<\/m:t>/)
  })
})

describe("Word's equations to LaTeX", () => {
  it("reads the quadratic formula as Word writes it", () => {
    const run = (text: string) => `<m:r><w:rPr><w:rFonts w:ascii="Cambria Math"/></w:rPr><m:t>${text}</m:t></m:r>`
    const xml =
      `<m:oMathPara ${M}><m:oMath>${run("x=")}<m:f><m:num>${run("-b±")}` +
      `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:sSup><m:e>${run("b")}</m:e><m:sup>${run("2")}</m:sup></m:sSup>${run("-4ac")}</m:e></m:rad>` +
      `</m:num><m:den>${run("2a")}</m:den></m:f></m:oMath></m:oMathPara>`
    const read = ommlToTex(xml)
    expect(read).toEqual({ tex: "x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}", display: true })
    expect(() => katex.renderToString(read!.tex, { throwOnError: true })).not.toThrow()
  })

  it("takes Word's defaults when a property is left out", () => {
    // No begChr/endChr: parentheses. No chr on a nary: an integral, limits at the side.
    expect(ommlToTex(`<m:oMath ${M}><m:d><m:e><m:r><m:t>x</m:t></m:r></m:e></m:d></m:oMath>`)!.tex).toBe(
      "\\left(x\\right)",
    )
    expect(
      ommlToTex(
        `<m:oMath ${M}><m:nary><m:sub><m:r><m:t>0</m:t></m:r></m:sub><m:sup><m:r><m:t>1</m:t></m:r></m:sup><m:e><m:r><m:t>f</m:t></m:r></m:e></m:nary></m:oMath>`,
      )!.tex,
    ).toBe("\\int_{0}^{1}{f}")
    // No chr on an accent: a hat.
    expect(ommlToTex(`<m:oMath ${M}><m:acc><m:e><m:r><m:t>a</m:t></m:r></m:e></m:acc></m:oMath>`)!.tex).toBe("\\hat{a}")
  })

  it("reads plain text, bold and upright runs, and cases", () => {
    expect(
      ommlToTex(`<m:oMath ${M}><m:r><m:rPr><m:nor/></m:rPr><m:t>if </m:t></m:r><m:r><m:rPr><m:sty m:val="b"/></m:rPr><m:t>v</m:t></m:r></m:oMath>`)!.tex,
    ).toBe("\\text{if }\\mathbf{v}")
    const cases = texToOmml("\\begin{cases} a & b \\\\ c & d \\end{cases}")
    expect(ommlToTex(cases)!.tex).toBe("\\begin{cases}a & b \\\\ c & d\\end{cases}")
  })

  it("reads an equation with a prefix other than m:", () => {
    expect(ommlToTex('<math:oMath xmlns:math="x"><math:r><math:t>y</math:t></math:r></math:oMath>')!.tex).toBe("y")
  })

  it("gives up on markup that is not an equation", () => {
    expect(ommlToTex("<w:p/>")).toBeNull()
    expect(ommlToTex("<m:oMath><m:r>")).toBeNull()
    expect(isOmml("<w:sdt/>")).toBe(false)
  })
})
