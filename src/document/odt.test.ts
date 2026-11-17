import { describe, expect, it } from "vitest"
import { writeZip } from "@/document/docx/zip"
import { odtToHtml } from "@/document/odt"

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
  'xmlns:xlink="http://www.w3.org/1999/xlink"'

async function odt(body: string, automatic = "", extra: { name: string; data: Uint8Array }[] = []) {
  const content =
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}>` +
    `<office:automatic-styles>${automatic}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`
  const encode = (text: string) => new TextEncoder().encode(text)
  return writeZip(
    [
      { name: "mimetype", data: encode("application/vnd.oasis.opendocument.text") },
      { name: "content.xml", data: encode(content) },
      ...extra,
    ].map((entry) => ({ ...entry, stored: true })),
  )
}

describe("OpenDocument text", () => {
  it("reads headings, paragraphs, alignment and the look of runs", async () => {
    const html = await odtToHtml(
      await odt(
        '<text:h text:outline-level="2">Title</text:h>' +
          '<text:p text:style-name="P1">Centred <text:span text:style-name="T1">bold italic</text:span> and' +
          '<text:s text:c="2"/>more<text:tab/>tabbed<text:line-break/>next line</text:p>',
        '<style:style style:name="P1" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/></style:style>' +
          '<style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold" fo:font-style="italic" fo:color="#ff0000"/></style:style>',
      ),
    )
    expect(html).toContain("<h2>Title</h2>")
    expect(html).toContain('<p style="text-align: center">Centred ')
    expect(html).toContain('<strong><em><span style="color: #ff0000">bold italic</span></em></strong>')
    expect(html).toContain("&nbsp;&nbsp;more\ttabbed<br>next line")
  })

  it("reads bulleted and numbered lists, tables and links", async () => {
    const html = await odtToHtml(
      await odt(
        '<text:list text:style-name="L1"><text:list-item><text:p>one</text:p></text:list-item><text:list-item><text:p>two</text:p></text:list-item></text:list>' +
          '<text:list text:style-name="L2"><text:list-item><text:p>dot</text:p></text:list-item></text:list>' +
          '<table:table><table:table-row><table:table-cell table:number-columns-spanned="2"><text:p>wide</text:p></table:table-cell></table:table-row>' +
          "<table:table-row><table:table-cell><text:p>a</text:p></table:table-cell><table:table-cell><text:p>b</text:p></table:table-cell></table:table-row></table:table>" +
          '<text:p><text:a xlink:href="https://example.com">a link</text:a></text:p>',
        '<text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style>' +
          '<text:list-style style:name="L2"><text:list-level-style-bullet text:level="1"/></text:list-style>',
      ),
    )
    expect(html).toContain("<ol><li><p>one</p></li><li><p>two</p></li></ol>")
    expect(html).toContain("<ul><li><p>dot</p></li></ul>")
    expect(html).toContain('<tr><td colspan="2"><p>wide</p></td></tr><tr><td><p>a</p></td><td><p>b</p></td></tr>')
    expect(html).toContain('<a href="https://example.com">a link</a>')
  })

  it("embeds pictures from the package", async () => {
    const png = new Uint8Array([137, 80, 78, 71])
    const html = await odtToHtml(
      await odt('<text:p><draw:frame><draw:image xlink:href="Pictures/one.png"/></draw:frame></text:p>', "", [
        { name: "Pictures/one.png", data: png },
      ]),
    )
    expect(html).toContain('<img src="data:image/png;base64,iVBORw==" alt="">')
  })

  it("says plainly when the file is not an OpenDocument text", async () => {
    await expect(
      odtToHtml(await writeZip([{ name: "a.txt", data: new Uint8Array([1]), stored: true }])),
    ).rejects.toThrow("not an OpenDocument text")
  })
})
