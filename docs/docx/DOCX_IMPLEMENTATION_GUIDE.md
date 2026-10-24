# DOCX Import/Export: What Microsoft Word Does, and How to Implement It

Target: Microsoft 365 Word **16.0.17932.21000** (Office16, x64, Windows 11). Use this file as context in Cursor
(e.g. put it in `docs/` or `.cursor/rules/`).

## How this was established

1. **Static inspection** of `WINWORD.EXE`, `WWLIB.DLL` and `Mso30win32client.dll` with REA: PE imports, exports,
   resources and embedded strings/assert messages. No decompiler was used.
2. **Black-box reader probe**: 53 hand-built packages (`C:\REA\docx-probe\cases\`), each with one defect or edge
   case, were opened by the installed Word through COM automation. Word then saved each one again as `.docx`
   and the saved copy was inspected (`roundtrip\`).
3. **Writer probe**: Word itself authored 19 single-feature documents (`authored\`) plus a combined document saved
   as Transitional, Strict and Flat OPC. The XML that Word emitted is recorded in
   `C:\REA\docx-probe\authored-report.md`.
4. **Specifications**: ECMA-376 / ISO/IEC 29500 (Parts 1–3), [MS-OI29500] (Office's implementation notes for
   ISO 29500) and [MS-DOCX] (Word's extensions: w14, w15, w16*).

Evidence labels:
- **[M]** measured: Word was run on a test file and the outcome observed (case IDs such as `z04` refer to the probe)
- **[O]** observed statically: binary strings/imports, or bytes of a Word-written file
- **[S]** stated by a specification
- **[I]** inferred from the above
- **[R]** recommendation for your implementation

"Opens" means `Documents.Open` succeeded with no repair. "Repair-only" means the normal open failed with
*"The file appears to be corrupted"* and `OpenAndRepair` then succeeded. In the UI, that is the
"Word found unreadable content… Do you want to recover?" prompt. "Rejected" means it failed even with repair.

---

## 1. Where the DOCX code lives in Word

| Binary | Role | Evidence |
|---|---|---|
| `Office16\WINWORD.EXE` (1.6 MB) | Launcher only. Imports 3 ordinals from `Mso20Win32Client.dll`; exports only `DllGetLCID`. | [O] |
| `Office16\WWLIB.DLL` (54 MB) | The Word engine: document model, OOXML ⇄ model conversion, layout. Imports `Mso::OpenXml::IPackage`. | [O] |
| `…\Microsoft Shared\Office16\Mso30win32client.dll` | Shared OPC package ("Metro") and ZIP layer for Word/Excel/PowerPoint: `CPackage`, `CZipArchive`, `CContentTypes`, `CRelationships`. | [O] |
| `oart.dll`, `chart.dll`, `igx.dll` | DrawingML shapes and pictures, charts, SmartArt. | [O] |
| `msls70.dll`, `mspts70.dll` | Line and page/table layout (not file format). | [O] |

**[R]** Mirror this layering:

```
ZipLayer -> OpcPackage (parts, content types, rels) -> WordprocessingML reader/writer -> YourModel -> Layout
```

### Word converts; it does not edit XML
[O] WWLIB uses the legacy binary-model vocabulary (`sprmPRsid`, `pdod`, `CP`, `FWriteMetro`,
`HrCreateMetroPdod`). [M] The probe confirms the conversion: on save, Word normalises everything it understood.
It reorders `rPr` children (`w13`), drops dangling references (`w09`, `w16`) and drops unknown ignorable markup
(`x03`). It also writes a default `sectPr` when there is none (`w01`), adds a trailing `<w:p/>` after a table at
the end of the body (`w10`, `w12`) and always writes theme, styles, webSettings and fontTable (`w17`).
Unknown **parts** are kept (§7).

**[R]** Parse into your own model and write fresh XML on save. Keep unknown parts as bytes.

---

## 2. Reader: what Word accepts, repairs and rejects [M]

This table is the core result. It shows Word's actual tolerance, which is the bar your reader must meet for files
"that open in Word". It also shows the lines your writer must never cross.

### 2.1 ZIP layer

| Case | Input | Word | Implication for you |
|---|---|---|---|
| z01 | all entries Stored | opens | support method 0 |
| z02 | data descriptors (GP bit 3) | opens | read sizes from the central directory, not local headers |
| z03 | ZIP64 records on every entry | opens | support ZIP64 **reading** |
| z04/z05 | wrong CRC-32 on `document.xml` / `styles.xml` | **opens, no repair prompt** | Word does not enforce CRCs. Don't make a CRC error fatal; at most log it |
| z06 | entry names with `\` | opens | normalise `\` → `/` |
| z07 | `[Content_Types].xml` stored last | opens | entry order does not matter for reading |

[O] The writer refuses ZIP64 (`"WriteLocalEntries compressedLength is too large. zip64 not supported"`).
Word writes only Deflate (8) and Stored (0).

### 2.2 Content types

| Case | Input | Word |
|---|---|---|
| c01 | no `[Content_Types].xml` | **rejected, even with repair** |
| c02 | no Override for the main part (falls back to `Default xml = application/xml`) | **rejected, even with repair** |
| c03 | `.docx` whose main part has the macroEnabled (docm) content type | **rejected** |
| c04 | `.docx` whose main part has the template (dotx) content type | **rejected** |
| c05 | Override `PartName="/WORD/DOCUMENT.XML"` for `word/document.xml` | opens (case-insensitive match) [S: OPC §9.1.1.1] |
| c06 | `styles.xml` with no content type | repair-only |

[O] The string `mpfTryRegenerateMissingContentTypes` exists, but [M] c01 shows that regeneration does **not**
rescue a `.docx` opened normally or with repair. Treat a missing or wrong main content type as fatal in your
writer's tests. In your reader you may be more lenient than Word, but don't rely on that leniency.

**[R] Extension check:** `.docx` ⇒ `…wordprocessingml.document.main+xml`, `.docm` ⇒
`application/vnd.ms-word.document.macroEnabled.main+xml`, `.dotx` ⇒ `…wordprocessingml.template.main+xml`,
`.dotm` ⇒ `application/vnd.ms-word.template.macroEnabledTemplate.main+xml`. Word refuses a mismatch, so your
writer must keep the extension and the content type consistent. To save a macro document as `.docx`, drop
`vbaProject` and change the content type.

### 2.3 Relationships and part names

| Case | Input | Word |
|---|---|---|
| r01 | package rel `Target="/word/document.xml"` (absolute) | opens |
| r02 | main part at `/content/main.xml`, found only via the `officeDocument` rel | opens. **Find the main part by rel type, never by path** |
| r03 | entry stored as `my styles.xml` (literal space), rel `Target="my%20styles.xml"` | repair-only |
| r04 | rel `Target="Styles.XML"`, entry `styles.xml` | opens (case-insensitive) |
| r05 | `w:hyperlink r:id` pointing at a missing rel | repair-only (repair keeps the link text, drops the `r:id`) |
| r06 | styles rel present, `styles.xml` entry missing | opens (missing auxiliary part is tolerated) |
| r07 | two rels with the same `Id` | repair-only |
| r08 | external `attachedTemplate` (`file://…`, `TargetMode="External"`) | opens; rel and `w:attachedTemplate` kept on save |
| r09 | unknown part (custom content type) related from `document.xml` | opens; **part, content type and rel preserved on save** |
| r10 | unknown part related from `_rels/.rels` | opens; **preserved on save** |

r03 explained [S: OPC §9.1.1, ECMA-376-2 Annex A]: the part name is the percent-encoded IRI. A part named
`/word/my%20styles.xml` must be stored in the ZIP as `word/my%20styles.xml`, **not** with a literal space.
**[R]** Writer: avoid characters that need escaping in part names. Reader: compare percent-decoded,
case-folded names.

### 2.4 XML and Markup Compatibility

| Case | Input | Word |
|---|---|---|
| x01 | ISO Strict namespaces and relationship types | opens; saved back as Transitional |
| x02 | element in an unknown namespace **not** in `mc:Ignorable` | **rejected, even with repair** |
| x03 | unknown namespace element + attribute listed in `mc:Ignorable` | opens; content skipped, **dropped on save** |
| x04 | `mc:AlternateContent`, Choice `Requires` an unknown prefix | opens; **Fallback** used |
| x05 | `mc:AlternateContent`, Choice `Requires="w14"` | opens; **Choice** used |
| x06 | `styles.xml` not well-formed | repair-only |
| x07 | `document.xml` not well-formed | **rejected** |
| x08 | unknown element in the `w:` namespace (`<w:probeElement/>`) | opens; ignored, dropped |
| x09 | `<!DOCTYPE>` with an internal entity | **rejected** (DTDs are prohibited, [S] ECMA-376-2 §8.1.4) |
| x10 | `document.xml` in UTF-16LE with BOM | opens |
| x11 | UTF-8 with BOM | opens |
| x12 | `w:sz="abc"` and `w:jc="sideways"` | **rejected, even with repair** |

Key consequences:
- **x12 matters most for writers.** Word schema-validates attribute values, and one bad enum or number makes the
  whole document unopenable. The probe combined both bad values, so it is not known which one alone triggers
  rejection. Treat both as fatal. **[R]** Generate attribute values only from typed enums and integer types,
  never pass strings through, and run the Open XML SDK validator in CI (§10).
- x02 vs x03: an unknown namespace is fatal unless it is listed in `mc:Ignorable` ([S] ECMA-376-3 §10.1). Any
  extension namespace you write **must** be declared and listed in `mc:Ignorable`.
- x08: unknown elements in a *known* namespace are tolerated by Word. Don't rely on that in your writer.

**[R] MCE reader rules** (ECMA-376-3): keep a set of understood namespaces. Skip elements and attributes in
ignorable namespaces you don't understand (optionally keep them raw). For `AlternateContent`, take the first
`Choice` whose `Requires` prefixes are all understood, otherwise `Fallback`. Treat an unknown non-ignorable
namespace as an error. Also handle `mc:ProcessContent` and `mc:MustUnderstand`.

### 2.5 WordprocessingML semantics

| Case | Input | Word |
|---|---|---|
| w01 | body without `w:sectPr` | opens; writes a default A4 sectPr on save |
| w02 | empty `w:body` | opens; writes `<w:p/>` + sectPr |
| w03 | `w:t` with leading/trailing spaces, with and without `xml:space` | without `xml:space="preserve"` the spaces are **trimmed**; with it they are kept |
| w04 | two paragraphs with the same `w14:paraId` | opens; Word assigns a new ID to the second |
| w05 | `w14:paraId="FFFFFFFF"` (≥ 0x80000000) | opens; the invalid ID is dropped [S: MS-DOCX requires < 0x80000000] |
| w06 | `rsidR` not listed in `settings.xml <w:rsids>` | opens; kept |
| w07 | `settings.xml` without `compatibilityMode` | opens **in compatibility mode 12 (Word 2007)** and saves `val="12"` |
| w08 | `compatibilityMode = 14` | opens as 14; stays 14 |
| w09 | `pStyle` referencing an undefined style | opens; reference dropped |
| w10 | table without `w:tblGrid` | opens; grid generated |
| w11 | `w:tc` with no `w:p` | repair-only. **Every cell needs at least one paragraph** [S] |
| w12 | table as the last block before `sectPr` | opens; Word appends `<w:p/>` after it on save |
| w13 | `rPr` children out of schema order | opens; reordered on save |
| w14 | `w:rPr` placed **after** `w:t` in a run | opens, but the **formatting is silently lost** |
| w15 | `fldChar begin` with no `separate`/`end` | opens; the instruction text becomes literal body text |
| w16 | `bookmarkStart` without `bookmarkEnd` | opens; bookmark dropped |
| w17 | no styles part at all | opens; Word writes styles, theme, webSettings and fontTable on save |

Writer rules that follow:
- Always write `<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>` (w07).
- `xml:space="preserve"` on every `w:t` / `w:delText` / `w:instrText` whose text starts or ends with whitespace
  (w03). Word itself writes it exactly in those cases.
- Elements in schema order. `w:rPr` / `w:pPr` / `w:tblPr` / `w:tcPr` come first in their parent (w14).
- Balanced complex fields and paired bookmarks/comment ranges.
- At least one `w:p` in every `w:tc`, and a `w:p` after a final table.
- [M] Word does not invent `w14:paraId` for paragraphs that lack one when a file is merely opened and saved
  (baseline round-trip: 0 paraIds). They are optional for a valid file. Add them if you support comments or
  co-authoring.

---

## 3. Part graph and type URIs

[O] WWLIB loads each auxiliary part separately and logs `Failed loading metroPartTypeWord<X>` /
`Skipped loading … because of a previous error`. [M] r06 shows a missing auxiliary part doesn't stop the open,
but c06/x06 show that a *present but broken* one (no content type, malformed XML) triggers the repair prompt.
**[R]** Isolate each part loader. Silently ignore a missing part. A broken part produces a repair note.

### Content types (Transitional, as written by Word) [M][O]

| Part | Content type |
|---|---|
| main (docx / docm / dotx / dotm) | `application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml` / `application/vnd.ms-word.document.macroEnabled.main+xml` / `…wordprocessingml.template.main+xml` / `application/vnd.ms-word.template.macroEnabledTemplate.main+xml` |
| styles, numbering, settings, webSettings, fontTable | `application/vnd.openxmlformats-officedocument.wordprocessingml.{styles,numbering,settings,webSettings,fontTable}+xml` |
| header, footer, footnotes, endnotes | `…wordprocessingml.{header,footer,footnotes,endnotes}+xml` |
| comments, commentsExtended, commentsIds, commentsExtensible, people | `…wordprocessingml.{comments,commentsExtended,commentsIds,commentsExtensible,people}+xml` |
| glossary | `…wordprocessingml.document.glossary+xml` |
| theme | `application/vnd.openxmlformats-officedocument.theme+xml` |
| core / app / custom properties | `application/vnd.openxmlformats-package.core-properties+xml` / `…officedocument.extended-properties+xml` / `…officedocument.custom-properties+xml` |
| rels | `application/vnd.openxmlformats-package.relationships+xml` (Default `rels`) |
| images | Default by extension, e.g. `png` → `image/png`, `jpeg` → `image/jpeg`, `emf` → `image/x-emf` |

### Relationship types

Transitional base `http://schemas.openxmlformats.org/officeDocument/2006/relationships/` + `officeDocument,
styles, numbering, settings, webSettings, fontTable, theme, header, footer, footnotes, endnotes, comments,
hyperlink, image, glossaryDocument, attachedTemplate, oleObject, package, chart, customXml, aFChunk, font,
extended-properties, custom-properties`. Package-level core properties:
`http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties`.

Microsoft extensions, as Word wrote them [M]:
- `commentsExtended`: `http://schemas.microsoft.com/office/2011/relationships/commentsExtended`
- `people`: `http://schemas.microsoft.com/office/2011/relationships/people`
- `commentsIds`: `http://schemas.microsoft.com/office/2016/09/relationships/commentsIds`
- `commentsExtensible`: `http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible`

### Strict (ISO 29500 Strict) [M]

Saving as Strict (`combined-strict.docx`, FileFormat 24) shows:
- namespaces become `http://purl.oclc.org/ooxml/…` (`wordprocessingml/main`, `officeDocument/relationships`,
  `drawingml/main`, `drawingml/wordprocessingDrawing`, `drawingml/picture`, `officeDocument/math`);
- relationship types become `http://purl.oclc.org/ooxml/officeDocument/relationships/<x>`;
- the root carries `w:conformance="strict"`;
- the main part's **content type stays the Transitional one** (`…wordprocessingml.document.main+xml`);
- the ZIP layout is the same (image Stored, everything else Deflate).

[M] x01 shows Word reads Strict and saves it back as Transitional. **[R]** Map Strict URIs to Transitional
before element dispatch so only one parser exists. Strict also changes some value types, e.g. percentages
written as `50%` and measurements with units ([S] ISO 29500-1 §22.9, [MS-OI29500]). Normalise those in the same
layer. Write Transitional only.

---

## 4. Writer: package layout Word produces [M][O]

Measured on every round-trip copy and on Normal.dotm:

| Property | Word's output |
|---|---|
| Entry order | `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/_rels/document.xml.rels`, (footnotes, endnotes, headers/footers, media…), `word/theme/theme1.xml`, `word/settings.xml`, (numbering), `word/styles.xml`, `word/webSettings.xml`, `word/fontTable.xml`, `docProps/core.xml`, `docProps/app.xml`, then preserved unknown parts **last** |
| Compression | XML Deflate (8), GP flags `0x0006`; images **Stored (0)**; no data descriptors |
| Timestamps | DOS date `0x0021`, time `0` (1980-01-01 00:00) on every entry |
| Extra field | ID `0xA220` padding: 520 bytes on `[Content_Types].xml` and `_rels/.rels`, 264 bytes on `document.xml.rels` and the `docProps` parts. Optional; it only exists to allow in-place rewrites |
| ZIP64 | never written |
| XML | UTF-8, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + CRLF, then the root on one line, no indentation |
| Rel IDs | `rIdN`, attributes `Id, Type, Target[, TargetMode]` |
| Content types | `Default` for `rels`, `xml` and image extensions; `Override` for every XML part |
| rsids | a new session rsid is stamped and appended to `<w:rsids>` on every save |

**[R] Writer recipe:** assign rIds while serialising, so every `r:id`/`r:embed` has a rel. Write
`[Content_Types].xml` first. Deflate XML and store or deflate media. Use fixed timestamps for reproducible
output. Write to a temp file, then rename atomically. Never write ZIP64.

### Minimal package that Word opens as a modern (non-compat) document

```
[Content_Types].xml
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml"  ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  </Types>
_rels/.rels                    rId1 officeDocument -> word/document.xml
word/_rels/document.xml.rels   rId1 styles -> styles.xml ; rId2 settings -> settings.xml
word/settings.xml
  <w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
  </w:settings>
word/document.xml
  <w:document xmlns:w="…/wordprocessingml/2006/main" xmlns:r="…/officeDocument/2006/relationships">
    <w:body>
      <w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r></w:p>
      <w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
        <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
        <w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>
    </w:body>
  </w:document>
```

This is probe case `00_baseline` plus the compat setting. The baseline (which opens) carries styles and
settings. `docProps/*` are optional; Word adds them on save.

Word defaults (A4/EU locale, from Normal.dotm): `pgSz 11906×16838`, margins 1440, header/footer 708,
`cols space 708`, `docGrid linePitch 360`, `defaultTabStop 720`. docDefaults use theme fonts `minorHAnsi`,
`sz 24`, and `spacing after=160 line=278 lineRule=auto`. US Letter is `12240×15840`.

---

## 5. Writer templates: exactly what Word emits per feature [M]

From `authored-report.md`, with rsid attributes removed. `w14:paraId`/`w14:textId` are left out of the snippets
below for brevity. Word writes them on every paragraph it authors, as 8 hex digits below 0x80000000, and uses
`textId="77777777"` for empty paragraphs. The required namespace declarations are listed in §5.15.

### 5.1 Runs and direct formatting
```xml
<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr>               <!-- paragraph-mark formatting lives in pPr/rPr -->
  <w:r><w:t xml:space="preserve">plain </w:t></w:r>
  <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:i/><w:color w:val="FF0000"/>
        <w:sz w:val="28"/><w:u w:val="single"/></w:rPr><w:t>styled</w:t></w:r>
  <w:r><w:rPr>…</w:rPr><w:tab/><w:t>after-tab</w:t></w:r>
  <w:r><w:rPr>…</w:rPr><w:br/><w:t>after-linebreak</w:t></w:r>
</w:p>
```
Properties are repeated in full on each run; there is no inheritance between sibling runs. `w:tab` and `w:br`
appear inside runs alongside `w:t`. Double spaces inside text need no `xml:space` (only leading/trailing ones do).
rPr child order: `rStyle, rFonts, b, bCs, i, iCs, caps, …, color, …, sz, szCs, highlight, u, …, vertAlign, lang`
([S] ECMA-376-1 §17.3.2).

### 5.2 Paragraph formatting and styles
```xml
<w:pPr><w:pStyle w:val="Heading1"/><w:keepNext/>
  <w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/>
  <w:ind w:left="720" w:firstLine="360"/><w:jc w:val="center"/></w:pPr>
```
Built-in style IDs are the English names without spaces (`Heading1`, `ListParagraph`, `TOC1`, `Hyperlink`,
`FootnoteText`, `FootnoteReference`, `CommentText`, `CommentReference`, `Header`, `Footer`, `PlaceholderText`).
Custom styles: [M] Word derives the styleId by removing spaces from the name ("Probe Para Style" →
`ProbeParaStyle`). `w:line="360" lineRule="auto"` means 1.5 lines (240 = single).

### 5.3 Bullets and numbering
Body:
```xml
<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>…</w:p>
```
`word/numbering.xml` (rel `numbering`). abstractNums come first, then nums:
```xml
<w:abstractNum w:abstractNumId="0" w15:restartNumberingAfterBreak="0">
  <w:nsid w:val="3C6372D1"/><w:multiLevelType w:val="singleLevel"/><w:tmpl w:val="10000001"/>
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#xF0B7;"/><w:lvlJc w:val="left"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1" w16cid:durableId="381757116"><w:abstractNumId w:val="0"/></w:num>
```
Decimal list: `numFmt="decimal"`, `lvlText="%1."`, `tmpl="1000000F"`, no rPr. The bullet is U+F0B7 in the
Symbol font (private-use code point). Render it as `•` if you don't ship Symbol. `nsid`, `tmpl` and `durableId`
are optional. Generate random values if you emit them.

### 5.4 Tables
```xml
<w:tbl>
  <w:tblPr><w:tblW w:w="9026" w:type="dxa"/>
    <w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>…left/bottom/right/insideH/insideV…</w:tblBorders>
    <w:tblLayout w:type="fixed"/>
    <w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="3008"/><w:gridCol w:w="3009"/><w:gridCol w:w="3009"/></w:tblGrid>
  <w:tr><w:trPr><w:tblHeader/></w:trPr>                       <!-- repeat header row -->
    <w:tc><w:tcPr><w:tcW w:w="6017" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr><w:p>…</w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3009" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr><w:p>…</w:p></w:tc></w:tr>
  <w:tr>… <w:tc><w:tcPr><w:tcW w:w="3009" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr>   <!-- continue -->
</w:tbl>
<w:p/>                                                       <!-- Word always follows a table with a paragraph -->
```
Horizontal merge = `gridSpan` (one `w:tc` covering N grid columns). Vertical merge = `vMerge="restart"`, then
`<w:vMerge/>` in the cells below, each still containing a `w:p`. Border `w:sz` is in eighths of a point. Word
also writes `w:tblPrEx` with cell margins and `w:shd` per cell; both are optional.

### 5.5 Sections, page breaks, headers and footers
- A section **other than the last** ends with a paragraph whose `w:pPr` holds a `w:sectPr`. The last section's
  `w:sectPr` is the last child of `w:body`.
- Landscape: `<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>`. Width and height are swapped and `orient`
  is set. Columns: `<w:cols w:num="2" w:space="708"/>`.
- Page break: `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` (its own paragraph).
- Headers/footers: Word created **all three** variants (`even`, `default`, `first`) as `header1-3.xml` /
  `footer1-3.xml` (rel types `header`/`footer`), plus empty `footnotes.xml`/`endnotes.xml`. You only need the
  ones you use.
```xml
<w:sectPr>
  <w:headerReference w:type="default" r:id="rId7"/><w:footerReference w:type="default" r:id="rId9"/>
  <w:headerReference w:type="first" r:id="rId10"/><w:footerReference w:type="first" r:id="rId11"/>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
  <w:cols w:space="708"/><w:titlePg/><w:docGrid w:linePitch="360"/>      <!-- titlePg enables "first" -->
</w:sectPr>
```
`header2.xml`: `<w:hdr …><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:t>…</w:t></w:r></w:p></w:hdr>`.
Different odd/even pages also need `<w:evenAndOddHeaders/>` in settings.

### 5.6 Fields
Complex field (e.g. a page number in the footer):
```xml
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve"> PAGE  \* MERGEFORMAT </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:rPr><w:noProof/></w:rPr><w:t>1</w:t></w:r>                  <!-- cached result: render this -->
<w:r><w:fldChar w:fldCharType="end"/></w:r>
```
Simple field: `<w:fldSimple w:instr=" DATE  \* MERGEFORMAT "><w:r><w:t>10/17/2026</w:t></w:r></w:fldSimple>`.
A TOC is a complex field (`TOC \o "1-3"`) that spans paragraphs. Each entry paragraph has style `TOC1`, a
`right` tab with a `dot` leader and a nested `PAGEREF _Toc… \h` field. The headings carry `_Toc…` bookmarks.
The closing `fldChar end` sits in a later paragraph. **[R]** Your field parser must nest and span paragraphs.
Render the cached result; never drop it (w15 shows what happens otherwise).

### 5.7 Footnotes and endnotes
Body: `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>`
(endnotes: `EndnoteReference` / `w:endnoteReference`).
`footnotes.xml` **must** begin with the separator notes:
```xml
<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p>…<w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>
  <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>
  <w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>Footnote text</w:t></w:r></w:p></w:footnote>
```
When this part exists, Word also lists the separators in settings (`<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>`).
[M] Measured in `f08`; endnotes get the matching `w:endnotePr`.

### 5.8 Comments
Body (the second comment is a reply):
```xml
<w:commentRangeStart w:id="0"/><w:r><w:t>commented text</w:t></w:r><w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
```
Parts Word writes (all related from `document.xml`):
- `comments.xml`: `<w:comment w:id="0" w:author="Author Name" w:date="2026-10-17T12:08:00Z" w:initials="AN"><w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r><w:r><w:t>Comment</w:t></w:r></w:p></w:comment>`
- `commentsExtended.xml` (w15): `<w15:commentEx w15:paraId="<paraId of the comment's last paragraph>" w15:done="0"/>`.
  A reply adds `w15:paraIdParent="<parent's paraId>"`. Threading and "resolved" live **only** here.
- `commentsIds.xml` (w16cid): `<w16cid:commentId w16cid:paraId="…" w16cid:durableId="0D0FF904"/>`
- `commentsExtensible.xml` (w16cex): `<w16cex:commentExtensible w16cex:durableId="0D0FF904" w16cex:dateUtc="2026-10-17T10:08:00Z"/>`
- `people.xml` (w15): `<w15:person w15:author="Author Name"><w15:presenceInfo w15:providerId="…" w15:userId="…"/></w15:person>`.
  `presenceInfo` is optional; omit it.

Note: `w:date` in `comments.xml` is **local time without an offset**, while `dateUtc` is UTC. A minimal writer
needs only `comments.xml`. For replies or resolved state, also write `commentsExtended.xml`, and give the
comment paragraphs `w14:paraId`.

### 5.9 Tracked changes
```xml
<w:ins w:id="4" w:author="Author Name" w:date="2026-10-17T12:08:00Z"><w:r><w:t xml:space="preserve"> INSERTED</w:t></w:r></w:ins>
<w:del w:id="1" w:author="Author Name" w:date="…"><w:r><w:delText xml:space="preserve">deleted </w:delText></w:r></w:del>
<w:r><w:rPr><w:b/><w:rPrChange w:id="0" w:author="…" w:date="…"><w:rPr/></w:rPrChange></w:rPr><w:t>now bold</w:t></w:r>
```
Deleted text uses `w:delText`, never `w:t`. `rPrChange` holds the **old** properties. Revision `w:id`s are
unique across the document. Word also writes `people.xml`.

### 5.10 Hyperlinks and bookmarks
```xml
<w:hyperlink r:id="rId4" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>external</w:t></w:r></w:hyperlink>
<!-- rels: <Relationship Id="rId4" Type="…/hyperlink" Target="https://example.com/?a=1&amp;b=2" TargetMode="External"/> -->
<w:bookmarkStart w:id="0" w:name="MyMark"/><w:r><w:t>target</w:t></w:r><w:bookmarkEnd w:id="0"/>
<w:hyperlink w:anchor="MyMark" w:history="1">…</w:hyperlink>
```
Blue underline comes from the `Hyperlink` character style. Define it in styles.xml if you use it.

### 5.11 Inline image
```xml
<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>
  <wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="609600" cy="304800"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:docPr id="1" name="Picture 1"/><wp:cNvGraphicFramePr/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:nvPicPr><pic:cNvPr id="1" name=""/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="609600" cy="304800"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>
  </wp:inline></w:drawing></w:r>
```
Media lives at `word/media/image1.png` (rel `image`), with `<Default Extension="png" ContentType="image/png"/>`
and the entry Stored. Extents are in EMU: 914400 per inch, 9525 per pixel at 96 dpi. `wp:docPr/@id` must be
unique across the document ([S]; duplicates were not probed). Word also adds a
`a14:useLocalDpi` extension and `wp14:anchorId`/`editId`; both are optional.

### 5.12 Floating shapes and text boxes
Word writes `mc:AlternateContent`: `<mc:Choice Requires="wps">` holding `w:drawing/wp:anchor` with
`wps:wsp` (and `wps:txbx/w:txbxContent` for text), and `<mc:Fallback>` holding a VML `w:pict`. `wp:anchor`
attributes include `simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1"
allowOverlap="1"`, then `positionH/positionV` with `relativeFrom` + `posOffset` (EMU) and a wrap element
(`wrapNone`, `wrapSquare`, …). **[R]** Reader: take the `wps` Choice. Writer: the Fallback may be omitted
because current Word understands `wps`, but `wps` must then appear in `mc:Ignorable` **or** the
`AlternateContent` must still be used. The safe choice is to always wrap it as Word does.

### 5.13 Content controls
```xml
<w:sdt><w:sdtPr><w:alias w:val="Title"/><w:tag w:val="Tag"/><w:id w:val="-863211242"/>
  <w:placeholder><w:docPart w:val="DefaultPlaceholder_-1854013440"/></w:placeholder><w:text/></w:sdtPr>
  <w:sdtContent><w:p><w:r><w:t>value</w:t></w:r></w:p></w:sdtContent></w:sdt>
```
Dropdown: `<w:dropDownList><w:listItem w:displayText="Choice A" w:value="A"/></w:dropDownList>`. A
placeholder-showing control adds `<w:showingPlcHdr/>`, and its run uses the `PlaceholderText` style.
`w:placeholder` references a building block, so Word created the **glossary sub-package**
(`word/glossary/document.xml` with its own styles, settings, webSettings and fontTable, rel `glossaryDocument`).
**[R]** You can omit `w:placeholder` and avoid writing a glossary. Preserve an existing glossary as opaque parts.

### 5.14 Equations
`<m:oMathPara><m:oMath><m:r><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t>x=</m:t></m:r><m:f><m:num>…</m:num><m:den>…</m:den></m:f></m:oMath></m:oMathPara>`
inside a `w:p` (namespace `http://schemas.openxmlformats.org/officeDocument/2006/math`). **[R]** If you
don't render OMML, keep it as raw XML and show the `m:t` text.

### 5.15 Namespaces to declare
Core: `w`, `r`, plus `wp`, `a`, `pic` for images, `m` for math, `mc` + `wps` + `v` + `o` for shapes.
Extensions you emit must be declared **and** listed in `mc:Ignorable`, for example
`xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"` (paraId/textId),
`w15 = …/word/2012/wordml`, `w16cid = …/word/2016/wordml/cid`, `w16cex = …/word/2018/wordml/cex`,
`wp14 = …/word/2010/wordprocessingDrawing`, `wps = …/word/2010/wordprocessingShape`
(all under `http://schemas.microsoft.com/office/`). Word writes about 30 declarations and
`mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh wp14"` on every root (measured on this build).

### 5.16 Document properties
- `docProps/core.xml` (`cp:coreProperties`): `dc:title`, `dc:creator`, `cp:lastModifiedBy`, `cp:revision`,
  `dcterms:created` / `dcterms:modified` with `xsi:type="dcterms:W3CDTF"` in UTC (`2026-10-17T10:09:00Z`,
  no seconds fraction).
- `docProps/app.xml`: `Application`, `AppVersion` (`16.0000`), page/word/character counts. Counts are informational.
- `docProps/custom.xml` (rel `custom-properties`): `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="…"><vt:lpwstr>…</vt:lpwstr></property>`.
  This `fmtid` is fixed. `pid` starts at 2 and increments.

---

## 6. Round-trip fidelity: what Word preserves [M]

| Item | Word on save |
|---|---|
| Unknown parts related from the document or from the package | **preserved**: same bytes, content type and rel; written last (r09, r10) |
| Unknown ignorable markup (attributes/elements) | **dropped** (x03) |
| Unknown elements in `w:` | dropped (x08) |
| External attachedTemplate | preserved (r08) |
| rsids | kept, even unlisted ones (w06); a new session rsid is added |
| paraIds | kept; duplicates re-assigned (w04); invalid ones dropped (w05); none invented for unedited paragraphs |
| compatibilityMode | kept as-is (w07: 12 stays 12, w08: 14 stays 14) |
| Strict | converted to Transitional (x01) |

**[R]** Do at least what Word does: keep unknown parts with their rels. Going beyond Word and keeping unknown
ignorable XML on the nearest model node is a bonus, not a requirement.

---

## 7. Other formats Word reads and writes

- **Flat OPC** [M] (`combined-flat.xml`, FileFormat 19): one XML file,
  `<?mso-application progid="Word.Document"?>` then
  `<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">`. Each part is a
  `<pkg:part pkg:name="/word/document.xml" pkg:contentType="…">`. XML parts go in `<pkg:xmlData>`; binary parts
  go in `<pkg:binaryData>` (base64) with `pkg:compression="store"`. Rels parts carry `pkg:padding="512"`.
  There is no `[Content_Types].xml`, because the content type is on each part. [O] The same format is used for
  the clipboard ("Microsoft Office Open XML") and `Range.WordOpenXML`/`InsertXML`. **[R]** Cheap to support on
  top of your package layer, and it makes copy/paste with Word lossless.
- **Strict OOXML**: see §3.
- [O] Word 2003 XML, ODT, RTF and legacy `.doc` (OLE compound file) use separate converters.
  Encrypted OOXML is an OLE compound file (`EncryptionInfo` + `EncryptedPackage`), not a ZIP.
  **[R]** Sniff the first bytes: `PK\x03\x04` → OPC; `D0 CF 11 E0` → `.doc` or encrypted; `<?xml` → Flat OPC or
  2003 XML. Show a specific message for each.

---

## 8. Recommended internal model [R]

```
Document
  styles: Map<styleId, Style{type, name, basedOn, next, link, pPr, rPr, tblPr…}>   # keep IDs verbatim
  numbering: abstractNums + nums (+ lvlOverride)                                  # resolve at layout time
  sections[]: SectionProps (pgSz, orient, pgMar, cols, header/footer refs {default,first,even}, titlePg, type)
  body: Block[]   Block = Paragraph | Table | Sdt | Unknown(rawXml)
  Paragraph { paraId?, styleId, pPr(direct), markRPr, inlines: Inline[], sectionBreak?: SectionProps }
  Inline = Run{rPr, content: (Text|Tab|Break{type}|NoteRef|CommentRef|Drawing)[]}
         | FieldBegin{instr}/FieldSeparate/FieldEnd | SimpleField{instr, inlines}
         | Hyperlink{relId|anchor, inlines} | BookmarkStart/End{id,name} | CommentRangeStart/End{id}
         | Ins/Del{id, author, date, inlines} | Math(rawXml) | Unknown(rawXml)
  Table { tblPr, grid[], rows[{trPr, cells[{tcPr(gridSpan, vMerge), blocks: Block[] (≥1 Paragraph)}]}] }
  headers/footers/footnotes/endnotes/comments: same Block[] structure (+ comment thread info)
  media: Map<partName, bytes + contentType>
  preserved: unknown parts + their incoming rels
```

Property resolution, per ECMA-376-1 §17.7.2:
`docDefaults → table style → numbering level → paragraph style chain (basedOn) → character style chain → direct`.
Toggle properties (`b, i, caps, smallCaps, strike, dstrike, vanish, emboss, imprint, outline, shadow`) toggle
through **style** levels rather than override. Direct formatting sets absolute values.

Units: twips (1/1440 in) for page size, margins, indents, spacing and table widths (`dxa`); half-points for
`w:sz`; eighths of a point for border `w:sz`; EMU (914400/in) for DrawingML; `pct` table widths in fiftieths
of a percent (Transitional) or `"50%"` (Strict).

---

## 9. Implementation checklist

**Reader** (to open everything Word opens)
- [ ] ZIP: Stored + Deflate, data descriptors, ZIP64, `\` in names; CRC mismatch is a warning, not an error
- [ ] Content types: Default + Override, case-insensitive part-name match
- [ ] Find the main part by `officeDocument` rel; absolute and relative targets; case-insensitive, percent-decoded lookup
- [ ] Strict → Transitional mapping (namespaces, rel types, value types)
- [ ] MCE: Ignorable, AlternateContent (Choice/Fallback), ProcessContent, MustUnderstand
- [ ] UTF-8 / UTF-16 with BOM; refuse DTDs (security: entity expansion)
- [ ] Missing auxiliary parts ignored; broken ones produce a repair note
- [ ] `w:t` whitespace: trim unless `xml:space="preserve"` (matches Word)
- [ ] Missing compatibilityMode ⇒ treat as 12 if you emulate compat layout
- [ ] Fields spanning paragraphs, nested fields, cached results
- [ ] styles, numbering, sections, headers/footers, notes, comments(+extended), hyperlinks, bookmarks, tables
      (grid, gridSpan, vMerge), images (inline/anchor), tracked changes, SDTs
- [ ] Preserve unknown parts with their rels

**Writer** (never produce what Word rejects)
- [ ] `[Content_Types].xml` present, Override for the main part with the content type matching the extension
- [ ] Every XML part has a content type; image extensions have Defaults
- [ ] All attribute values valid per schema (typed enums and integers only), elements in schema order
- [ ] Every non-core namespace declared and listed in `mc:Ignorable`
- [ ] No DTD; UTF-8; well-formed
- [ ] Every `r:id`/`r:embed` resolves; rel Ids unique per rels part
- [ ] `compatibilityMode=15`
- [ ] `xml:space="preserve"` on `w:t`/`w:delText`/`w:instrText` with leading/trailing whitespace
- [ ] ≥1 `w:p` in every `w:tc`; a `w:p` after a final table; `w:sectPr` last in `w:body`
- [ ] Balanced fields, paired bookmarks and comment ranges; unique bookmark, revision, comment and `docPr` ids
- [ ] Footnote/endnote parts start with separator (-1) and continuationSeparator (0)
- [ ] paraIds (if written) unique and < 0x80000000
- [ ] Part names without characters that need escaping; no ZIP64; temp file + atomic rename
- [ ] Re-emit preserved parts and rels

**Tests**
- [ ] Reuse the probe corpus: `C:\REA\docx-probe\cases\*.docx` + `results\*.json` give Word's verdict for 53
      inputs. Your reader should accept at least everything marked OPENS.
- [ ] Each Word-authored file in `authored\` should load in your app and re-save to something Word opens
- [ ] Open XML SDK `OpenXmlValidator` (NuGet package `DocumentFormat.OpenXml`, runs on Linux with .NET) on every file you write
- [ ] Load→save→load idempotent (byte-identical with fixed timestamps)
- [ ] Final gate: Word opens it without a repair prompt (automate with `word-open-one.ps1`)

---

## 10. Rerunning the probe (e.g. after a Word update or to test your own output)

From `C:\REA\docx-probe` (Python 3, Word installed; the scripts start their own invisible Word instance and
kill only the processes they started):

```
python gen.py                                   # regenerate cases\*.docx + cases\index.tsv
powershell -File run-word.ps1                   # open each case in Word -> results\*.json, roundtrip\*.docx
python analyze.py --roundtrip                   # OPENS / REPAIR-ONLY / REJECTED table + round-trip facts
powershell -File word-author.ps1                # Word authors feature docs -> authored\*.docx
python extract-features.py                      # -> authored-report.md (per-feature XML)
```

To check a file your app wrote:
`powershell -File word-open-one.ps1 -InputPath C:\path\out.docx -ResultPath C:\path\out.json -RoundTripPath C:\path\out.word.docx`.
`open.ok = true` means Word accepts it cleanly. A diff of your XML against `out.word.docx` shows how Word
normalises it.

---

## 11. Cursor prompts you can paste

1. *"Implement `OpcPackage` per DOCX_IMPLEMENTATION_GUIDE.md §2.1–2.3 and §4. The reader must accept every
   case marked 'opens' in those tables (CRC mismatch = warning, case-insensitive part names, main part via rel
   type, ZIP64 read). The writer must follow the §4 layout. Add unit tests named after the case IDs (z01…r10)."*
2. *"Add a Markup Compatibility filter (§2.4) between the XML tokenizer and the WordprocessingML parser: Ignorable
   skipping, AlternateContent Choice/Fallback selection, and an error for unknown non-ignorable namespaces.
   Tests: x02, x03, x04, x05."*
3. *"Make the DOCX writer schema-safe: replace string attribute values with typed enums and integers, emit
   children in ECMA-376 order, and add a test that runs OpenXmlValidator on generated files (see §2.4 x12 and
   §9 Writer)."*
4. *"Implement writers for each feature in §5 (runs, paragraphs, lists, tables, sections/headers/footers,
   fields, notes, comments, tracked changes, hyperlinks, images, shapes, SDTs, properties) producing exactly the
   XML shown. Add golden-file tests comparing against C:\REA\docx-probe\authored\f*.docx after removing
   rsid/paraId attributes."*
5. *"Implement style resolution per §8, including toggle-property semantics, and the §2.5 reader rules
   (whitespace trimming, compat mode 12 when missing)."*
