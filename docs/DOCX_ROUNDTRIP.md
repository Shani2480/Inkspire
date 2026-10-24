# Docx round-trip report

Inkspire opens and saves `.docx` with its own engine (`src/document/docx/`), not Pandoc. Pandoc is only used for
`.odt`, `.rtf`, and PDF. The tests named below run on the Word-authored files in `tests/docx-fixtures/authored/`.

## Saving without edits

The document is written from the model it was read into, so everything the reader understands comes back, and
parts it does not understand are kept byte for byte (`golden.test.ts`, `preservation.test.ts`, guide §6).

## Saving after edits

The body is rebuilt from the editor. Each paragraph, table, and run carries an anchor back to the one it was
opened from (`data-docx`, `data-docx-run`); saving starts from the source properties and applies only what
changed. Inserting a paragraph into any authored Transitional fixture leaves every other part, and every other
paragraph, byte for byte as Word wrote it (core.xml's dates aside; `edit-fidelity.test.ts`).

Property elements (`w:pPr`, `w:rPr`, `w:tblPr`, `w:trPr`, `w:tblPrEx`, `w:tcPr`, `w:sectPr`) keep their children
as Word wrote them, with a snapshot of what the model read from them (`element-source.ts`). An unchanged element
is written as it was; a changed one regenerates only the children whose value changed, keeps every child the
model does not cover (table-style conditional formatting, cell margins, vertical alignment, row heights,
extension elements), and places new children in schema order. Markup the model has no place for (symbols,
embedded objects, custom XML, inline content controls, tracked moves, permission ranges, tables nested in
cells) is kept as written and shown as text (`word-markup.test.ts`).

| Feature                                                          | Kept after an edit | Notes                                                              |
| ---------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| Theme, font table, document properties, custom XML               | yes                | byte for byte                                                      |
| settings.xml, styles.xml, numbering.xml                          | yes                | modelled elements swapped in place; root declarations kept         |
| Paragraph style, spacing, line height, indents, alignment        | yes                | unedited values keep Word's exact twips                            |
| Tabs, borders, shading, outline level, paragraph mark formatting | yes                | not shown in the editor, kept from the source paragraph            |
| Section breaks                                                   | yes                | once per source paragraph, even after a split                      |
| Run properties                                                   | yes                | runs split by the editor at tabs and breaks are joined again       |
| Tables                                                           | yes                | everything in tblPr/trPr/tcPr, merged cells, nested tables         |
| Lists                                                            | yes                | an opened list keeps its numbering instance; new items join it     |
| Tracked changes                                                  | yes                | shown as insertions and deletions; accept/reject settles them      |
| Comments and replies                                             | yes                | edited text, resolution, and new replies are written               |
| Footnote and endnote references                                  | yes                | shown as note numbers                                              |
| Fields, bookmarks                                                | yes                | shown as their result; fields spanning paragraphs (TOC) stay whole |
| Content controls, equations, shapes                              | yes                | shown as text, saved as the original markup                        |
| Hyperlinks                                                       | yes                | relationship and history kept; new links get the Hyperlink style   |
| Pictures                                                         | yes                | the drawing is reused while the picture and its size are unchanged |
| Headers, footers, page setup                                     | yes                | through the page chrome                                            |

## How an opened document is shown

The document's styles become a stylesheet (`word-styles.ts`): fonts with metric-compatible stand-ins, sizes,
spacing, and line spacing measured in the body font's single line, as Word measures it (Calibri's single line is
1.22 times its size). Contextual spacing, table styles (borders, cell margins, shading, header and total rows,
first and last columns, banding, as the table's look selects), cell borders, margins and vertical alignment,
list numbering that continues across interruptions, list indents from the numbering level, and tab stops with
leaders are shown as Word draws them. None of this is written back from the editor: saving keeps the source
markup (`word-display.test.ts`).

## Strict (ISO 29500) files

Strict files open and save as Transitional. Measures with units become twips (EMUs in DrawingML), start/end
become left/right, Strict namespaces and relationship types become Transitional, and `w:conformance` is dropped.
Saving `combined-strict.docx` gives the same body, styles, numbering, notes, theme, and properties as its
Transitional twin (`golden.test.ts`). What the Strict file does not carry (VML shape defaults, legacy
`tblLook` hex values, font charsets) stays absent.

## Known gaps

- Content controls, equations, and fields are kept but not editable in the editor.
