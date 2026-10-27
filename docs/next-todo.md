# Next to-do list

The next work is the **Next** list below. Do not start a later phase until it is explicitly requested. Work inside a section lands in the numbered order below.

Where a simpler version already exists, the note says so. The item is still open until it matches the control written here. Names, groups, and dialog fields are the ones visible in `screenshots/`. A dropdown whose menu is closed in those shots stays a dropdown with that label. Do not add menu entries that are not on screen.

## Next — open items

Items built but not yet checked in Word, Chrome or the desktop app are collected in `verify-list.md`; tick them there, do not re-check them here.

Every fix or feature also gets a dated entry in `changes.md` (newest first) the session it lands: what was wrong, what changed and where, how it was checked, what is open.

**Done.** Icons (Iconify + cache), 3D Models Stock library from Insert + catalog cache, SmartArt gallery with in-place text edit, more Design themes, Section Break (next page / continuous), Spreadsheet block with A1-style cross-cell formulas, and Mailings Start / Recipients / Preview / Finish & Merge.

Phases 1–14 are done.

## Rich header and footer (H1-H4 done; left over below)

Fixed 2026-10-26: a table in an open header or footer could not be clicked into or resized (the margin's zone lay
over the header's content); the live header or footer now sits over the zone.

Fixed 2026-10-21: after a header picture was edited and the header closed, the closed header's copy kept the picture's selection frame and handles (and, through `.page-canvas:has(.ProseMirror-selectednode …)`, switched the header zone off so it could not be opened again). The copy (`drawnMarkup` in `chrome-editors.tsx`) now drops the selection class and handles, and is no longer re-taken once the editor is off the page. While the header was open the first page's header was padded 1.75rem each side (room for the First page checkbox), so its picture or text sat 28 px to the right of where the closed header draws it; that padding rule is gone (the checkbox sits in the margin). The rotate handle (every picture, shape and object) now sits above the middle of the top edge on a short stem, as in Word.

Fixed 2026-10-22: printing lays the pages out as the editor drew them (`document/print-copy.ts`: one paper-sized
box per page, each a copy of the canvas moved to that page and clipped, the app hidden, the page's margin boxes
empty), so a header picture, a page number field, the first and even pages' own header and footer, the watermark and
the page border print as on screen, in light and dark mode; the print preview shares the copy. Each page's copy keeps
its own sheet and hides the body blocks on other pages, so the text behind the clip is not in the printed file. The
old flow print (the browser's pagination, header and footer text in the page's margin boxes) is kept for Web Layout
and Read Mode, where no pages are laid out. A header set from the gallery or read from a file was drawn empty until it
was opened once (the copy was taken only from an editor on the page); a closed editor's drawing is copied too. The
Header & Footer tab stays beside Picture Format or Shape Format while a picture or shape in the header is selected.
A new document has no page number overlay (`pageNumber: "none"`, the Page Number menu puts a field in); older native
files without the mark keep theirs. Checked in headless Chrome: a three-page document with a logo and a page field in
the header printed to PDF, each page with its own number, `pdftotext` finding each page's text once.

Left over: none for one section. **Done (2026-10-26).** The Navigation group has Previous and Next (between the
first-page, even and odd headers, as Word does with one section) and Link to Previous, greyed with a note since the
app has one section. Test: `chrome-editing.test.ts`. Checked in headless Chrome.

**Done (2026-10-26).** A tall header pushes the body down and a tall footer pushes it up, as in Word: each header and
footer box reports how far it reaches into the page (`chrome-extent.ts`) and `pageMetrics` uses the larger of the
margin and that reach, so the paginator, page gaps, rulers and the Header/Footer boundary follow. Floating pictures
push nothing (as in Word). The tallest header counts for every page (Word moves only the pages that header is on).
Test: `chrome-extent.test.ts`. Checked in headless Chrome (header and footer).

Today the header and footer are one-line text inputs (160 characters, plain text). A picture inserted while the header
is open goes into the page body, and pictures that came from a .docx header sit in a read-only layer. Goal: the header
and footer are real rich-text areas, so a picture is a normal image there, with the body's Picture Format tab.

- **H1 — Model and round trip (no UI change).** Keep each header/footer as editor HTML next to its docx story. Open:
  story blocks → HTML with the body projector (`blocksToHtml`), pictures through the story's own relationships.
  Save: HTML → story blocks (`blocksFromNodes`), new pictures as media parts with relationships in the story part.
  Native format: pack the HTML, drop the 160-character limit. Tests: logo header, two-paragraph footer, page-number
  field, first-page and odd/even variants all survive open → save → open.
- **H2 — Editing surface.** While Header & Footer is open, one TipTap editor sits in the header or footer zone of the
  clicked page (the other pages show the same HTML, read-only, and update as you type). The body editor goes
  read-only and dims, as in Word. Tab/Shift+Tab move between header and footer; Esc and double-click in the body
  close it. Header text styles (Header, Footer) and the centre/right tab stops come with it.
- **H3 — Pictures and objects.** Insert > Picture/Online Pictures/Shapes while the header is open insert into it.
  The Picture Format tab, resize handles, alignment, alt text, wrapping (in line, behind/in front of text) work the
  same as in the body. Imported header pictures stop using the read-only `page-chrome-layer`.
- **H4 — Fields and options.** Page Number / Number of Pages / Date fields from the Header & Footer tab insert real
  fields, Different First Page and Different Odd & Even Pages edit their own header/footer, Link to Previous stays
  out of scope (one section).
- **Risks.** The header must not change the body's page height (the paginator reads `headerFromEdge` and the header
  height); a tall picture in the header pushes the body down as in Word. Existing documents with the 160-character
  limit and the current `aiword-header` comments must still open.

## Phase 1 — Insert components

**Done.** WordArt gallery (gradients / shadows / path warps), Quick Parts (local library), Bookmark (unique ids + HTML anchors), Chart, Shapes (gallery + drag resize), Drop Cap, Signature Line gallery + setup, Equation presets + re-edit, Symbol grid.

These sit on the Insert tab. The tab already has Table, Text Box, image insert, Page Break, Blank Page, and Date & Time.

1. **WordArt.** Text group. A dropdown labeled WordArt. Inserts text drawn as art, with paths, gradients, and shadows.
2. **Quick Parts.** Text group. A dropdown labeled Quick Parts. A library the user can save reusable text or block snippets into, and insert from later. Store the library locally.
3. **Bookmark.** Links group. A button labeled Bookmark. Tags a text location with a unique id so other parts of the document can link to it.
4. **Chart.** Illustrations group. A button labeled Chart. Inserts a configurable bar, line, or pie chart.
5. **Shapes.** Illustrations group. A dropdown labeled Shapes. Inserts vector shapes (rectangles, circles, arrows) the user can resize.
6. **Drop Cap.** Text group. A dropdown labeled Drop Cap. Formats the paragraph so the first character spans three lines.
7. **Signature Line.** Text group. A dropdown labeled Signature Line. Inserts a block with an X, a horizontal line, and editable fields for name and title.
8. **Equation.** Symbols group. A dropdown labeled Equation. Edits and renders a mathematical formula.
9. **Symbol.** Symbols group. A dropdown labeled Symbol. Opens a grid for choosing a special character and inserting it.

## Phase 2 — Draw components

**Done.** Drawing Canvas TipTap NodeView (SVG layer); Pen + Highlighter via Perfect Freehand with mm width and SVG path storage in `data-strokes`; contextual Draw tab auto-opens on canvas selection (clear / undo last stroke).

The screenshots do not show a Draw tab. These stay as already written.

1. **Drawing Canvas.** A custom TipTap NodeView that is its own drawing layer, drawn with SVG or a canvas element.
2. **Pen Tool.** Freehand strokes on that canvas, using a library such as Perfect Freehand. Stroke width is set in millimeters. Strokes are stored in the document as SVG paths.
3. **Highlighter.** A semi-transparent, thick-stroke tool that draws on the same canvas.

## Phase 3 — Design components

**Done.** Themes gallery (memoized thumbs) + Colors / Fonts / Paragraph Spacing (Compact, Open, …) / Effects / Set as Default; Watermark dropdown; Page Color (screen + print); Page Borders dialog (style, color, width mm).

Design tab. The app already has an AI themes menu, a watermark text field, and page-border choices None, Single, and Double with a color swatch. Those stay until the controls below replace them.

Document Formatting group, left to right:

1. **Themes.** A dropdown labeled Themes, then a horizontal gallery of theme thumbnails. Each thumbnail shows sample text (Title, Heading 1, and body) in that theme’s fonts and colors. The gallery ends with a More arrow. Opening the gallery must not rebuild every thumbnail. Themes gallery with expanded examples is in place.
2. **Colors.** A dropdown labeled Colors.
3. **Fonts.** A dropdown labeled Fonts.
4. **Paragraph Spacing.** A dropdown labeled Paragraph Spacing. Sets line height and the space after every paragraph. Include presets such as Compact and Open.
5. **Effects.** A dropdown labeled Effects.
6. **Set as Default.** A button labeled Set as Default, with a checkmark. Makes the current document formatting the default for new documents.

Page Background group, left to right:

7. **Watermark.** A dropdown labeled Watermark. The text field on Design is the simpler version.
8. **Page Color.** A dropdown labeled Page Color. Sets the background color of the printable page.
9. **Page Borders.** A button labeled Page Borders. Style, color, and width in millimeters. The stored preset (`none`, `single`, `double`) and color stay. This item adds width and a fuller style choice. The same command is the Borders… button on the Page Setup dialog, Layout tab.

## Phase 4 — Layout components

**Done.** Page Setup dropdowns (Margins / Orientation / Size / Columns with selection block + 1.25 cm gap + guides + ruler drag / Breaks incl. Column & section Even/Odd / Line Numbers Continuous & Restart Each Page / Hyphenation + lang); Paragraph Indent/Spacing spinners + launcher; Arrange Position / Wrap / Bring Forward / Send Backward / Selection Pane / Align / Group / Rotate.

Layout tab. Paper size, Portrait, Landscape, margin presets, position, wrap, layering, one/two/three columns, and a line-number toggle already exist. The notes below say where.

Page Setup group, left to right. Each of these is a dropdown:

1. **Margins.** Labeled Margins. The margin popover is the simpler version.
2. **Orientation.** Labeled Orientation. The Portrait and Landscape buttons are the simpler version.
3. **Size.** Labeled Size. The paper menu (Letter, A4, Legal) is the simpler version.
4. **Columns.** Labeled Columns. The one, two, and three column buttons are the page-wide setting.

   Also add a block the user applies to a selection, splitting that text with the CSS `columns` property. The default column gap is 1.25 cm.

   When a page has more than one column, draw a subtle border around each column so the placement is visible while editing. The borders are an editing guide and do not print. The horizontal ruler marks each column and the gap between columns. Dragging a column mark on the ruler resizes that column. This applies to the page-wide columns and to the selection block.

5. **Breaks.** Labeled Breaks. Page break already exists on Insert. This is the Layout dropdown.
6. **Line Numbers.** Labeled Line Numbers. The line-number toggle is the simpler version.
7. **Hyphenation.** Labeled Hyphenation. Sets `hyphens: auto` on the document. The document element must have the correct HTML `lang` attribute.

Paragraph group:

8. **Indent.** Two fields, Left and Right, each showing `0 cm` with up and down spinners.
9. **Spacing.** Two fields, Before showing `0 pt` and After showing `8 pt`, each with up and down spinners.
10. **Paragraph dialog launcher.** The small arrow at the corner of the Paragraph group. Opens paragraph formatting for the indent and spacing fields above.

Arrange group. Position, Wrap Text, Bring Forward, and Send Backward already exist as separate buttons. Match the screenshot’s dropdowns, then add the three controls that are absent:

11. **Position.** A dropdown labeled Position.
12. **Wrap Text.** A dropdown labeled Wrap Text.
13. **Bring Forward.** A dropdown labeled Bring Forward. Bring to front stays inside it. The separate Bring forward and Bring to front buttons are the simpler version.
14. **Send Backward.** A dropdown labeled Send Backward. Send to back stays inside it. The separate Send backward and Send to back buttons are the simpler version.
15. **Selection Pane.** A button labeled Selection Pane.
16. **Align.** A dropdown labeled Align.
17. **Group.** A dropdown labeled Group.
18. **Rotate.** A dropdown labeled Rotate.

## Phase 5 — Home ribbon

**Done.** Clipboard (Paste split / Cut / Copy / Format Painter); Font (Clear Formatting, Underline styles split, Subscript / Superscript, Text Effects, Font launcher); Paragraph (Bullet / Numbering / Multilevel galleries, Sort A–Z, Shading, Borders split with last-used apply, Paragraph launcher); Styles gallery (Normal → Quote + More); Editing (Find / Replace / Select); Add-ins.

Home already has undo, redo, find and replace, styles Body and Heading 1–3, font family, font size, grow and shrink font, bold, italic, underline, strikethrough, text color, highlight, change case, alignment, bullets, numbering, line spacing, indent, paragraph marks, spell check, thesaurus, and translate.

Clipboard group, left to right:

1. **Paste.** A split button labeled Paste, with a dropdown. Keep Text Only, and the Clipboard group launcher + sidebar, are in place.
2. **Cut.** A button labeled Cut.
3. **Copy.** A button labeled Copy.
4. **Format Painter.** A button labeled Format Painter.

Font group. The font name shows Aptos (Body) and the size shows 12 in the screenshot. Add the controls that are absent:

5. **Clear All Formatting.** The eraser button in the font group.
6. **Underline style.** The underline button is a split button. The dropdown chooses underline style and already draws each style. A single underline toggle already exists. This item matches the polish note that underline looks right.
7. **Subscript.** The subscript button.
8. **Superscript.** The superscript button.
9. **Text Effects and Typography.** The glowing-A button. Preview gallery and Outline / Shadow / Reflection / Glow flyouts are in place.
10. **Font dialog launcher.** The small arrow at the corner of the Font group. Opens the Font dialog in Phase 12.

Paragraph group:

11. **Bullets gallery.** The bullets split button and drawn Bullet Library gallery are in place.
12. **Numbering gallery.** The numbering split button and Numbering Library gallery are in place.
13. **Multilevel List.** The multilevel dropdown and drawn List Library tiles are in place.
14. **Sort.** The A-Z sort button.
15. **Shading.** The paint-bucket button.
16. **Borders.** A split button. The dropdown is the border menu. The button applies the current border.
17. **Paragraph dialog launcher.** The small arrow at the corner of the Paragraph group.

Styles group. The gallery shows these styles, in order: Normal, No Spacing, Heading 1, Heading 2, Title, Subtitle, Subtle Emphasis, Emphasis, Intense Emphasis, Strong, Quote. Body and Heading 1–3 already exist.

18. **Styles gallery.** Those eleven styles, with a More arrow at the end of the gallery.

Editing group. Find and replace already exist as one dialog opened from Home.

19. **Find.** A dropdown labeled Find.
20. **Replace.** A button labeled Replace.
21. **Select.** A dropdown labeled Select.

22. **Add-ins.** A button labeled Add-ins at the right end of the Home tab.

## Phase 6 — Rest of the Insert tab

**Done.** Cover Page gallery + remove; Table / Pictures / Icons / 3D / SmartArt / Chart (existing); Screenshot (Screen Clipping + From File); Media Online Videos (YouTube/Vimeo embed node); Link / Cross-reference / Comment; Header / Footer / Page Number; Text Box gallery / Date & Time / Object (Text from File, Spreadsheet, Equation).

Insert groups and the order inside them. Skip controls already built (Table grid, Text Box, image file, Page Break, Blank Page, Date & Time) except where the screenshot control is a dropdown the app does not have.

Pages group:

1. **Cover Page.** A dropdown labeled Cover Page.
2. **Table.** The Table button is a dropdown. The row-and-column grid is the simpler version.

Illustrations group. Shapes and Chart are Phase 1.

3. **Pictures.** A dropdown labeled Pictures. Insert image from a file is the simpler version.
4. **Icons.** A button labeled Icons. Bundled SVG grid, Online Icons… (Iconify, dark-mode modal, localStorage/IndexedDB cache, shimmer) are in place.
5. **3D Models.** Opens the interactive stock browser (Primitives / Electronics / Anatomy / Furniture / Symbols / Online + From Local File… .glb/.gltf). Inserts `threeDModel` with orbit handle, snapshot export, and contextual 3D Model ribbon. In place.
6. **SmartArt.** Visual thumbnail gallery (List / Process / Cycle / Hierarchy / Relationship / Matrix / Pyramid) plus More SmartArt Graphics… split-pane dialog. In place.
7. **Screenshot.** A dropdown labeled Screenshot.

Media group:

8. **Online Videos.** A button labeled Online Videos.

Links group. Bookmark is Phase 1.

9. **Link.** A button labeled Link.
10. **Cross-reference.** A button labeled Cross-reference.

Comments group:

11. **Comment.** A button labeled Comment. New comment on Review is a different control.

Header & Footer group:

12. **Header.** A dropdown labeled Header. The page already has an editable header field. This dropdown inserts a header.
13. **Footer.** A dropdown labeled Footer. The page already has an editable footer field. This dropdown inserts a footer.
14. **Page Number.** A dropdown labeled Page Number.

Text group. Text Box, Quick Parts, WordArt, Drop Cap, and Signature Line are covered above. Date & Time already exists as a menu.

15. **Text Box.** A dropdown labeled Text Box. Inserting one floating box is the simpler version.
16. **Date & Time.** A dropdown labeled Date & Time. The static and automatic date menu is the simpler version.
17. **Object.** A dropdown labeled Object.

## Phase 7 — References tab

**Done.** TOC (Automatic + Add Text Level 1–3 / Do Not Show + Update); Footnotes (Insert Footnote/Endnote, Next, Show Notes); Research Search; Citations (Insert, Manage Sources, Style APA/MLA/Chicago/IEEE, Bibliography); Captions (Insert Caption, TOF, Update, Cross-reference); Index (Mark Entry, Insert, Update); Table of Authorities (Mark Citation by category, Insert, Update).

A new ribbon tab labeled References, between Layout and Mailings. Groups left to right:

Table of Contents. A table-of-contents block and an Update command already exist on Insert.

1. **Table of Contents.** A dropdown labeled Table of Contents.
2. **Add Text.** A dropdown labeled Add Text.
3. **Update Table.** A button labeled Update Table.

Footnotes:

4. **Insert Footnote.** A button labeled Insert Footnote.
5. **Insert Endnote.** A button labeled Insert Endnote.
6. **Next Footnote.** A dropdown labeled Next Footnote.
7. **Show Notes.** A button labeled Show Notes.

Research:

8. **Search.** A button labeled Search.

Citations & Bibliography:

9. **Insert Citation.** A button labeled Insert Citation.
10. **Manage Sources.** A button labeled Manage Sources.
11. **Style.** A dropdown showing APA, labeled Style.
12. **Bibliography.** A dropdown labeled Bibliography.

Captions:

13. **Insert Caption.** A button labeled Insert Caption.
14. **Insert Table of Figures.** A button labeled Insert Table of Figures.
15. **Update Table.** A button labeled Update Table, in the Captions group.
16. **Cross-reference.** A button labeled Cross-reference, in the Captions group.

Index:

17. **Mark Entry.** A button labeled Mark Entry.
18. **Insert Index.** A button labeled Insert Index.
19. **Update Index.** A button labeled Update Index.

Table of Authorities:

20. **Mark Citation.** A button labeled Mark Citation.
21. **Insert Table of Authorities.** A button labeled Insert Table of Authorities.
22. **Update Table.** A button labeled Update Table, in the Table of Authorities group.

## Phase 8 — Mailings tab

**Taken out of the app (2026-10-27), on the backlog.** The tab and mail merge were removed until they can be
finished (see "Mail merge (Mailings tab)" under Future features). The description below is kept for when it returns.

**Was done.** Create (Envelopes / Labels); Start Mail Merge (Letters / E-mail / Envelopes / Labels / Directory); Select Recipients (CSV + sample) + Edit Recipient List; Write & Insert Fields (Highlight, Address Block, Greeting Line, Insert Merge Field, Rules, Match Fields, Update Labels); Preview (toggle, record nav + number field, Find Recipient, Check for Errors); Finish & Merge (Edit / Print / E-mail).

A new ribbon tab labeled Mailings, between References and Review. Start Mail Merge, Select Recipients (CSV / sample), Preview Results, and Finish & Merge are in place; deepen remaining Word controls below as needed. Groups left to right:

Create:

1. **Envelopes.** A button labeled Envelopes.
2. **Labels.** A button labeled Labels.

Start Mail Merge:

3. **Start Mail Merge.** A dropdown labeled Start Mail Merge.
4. **Select Recipients.** A dropdown labeled Select Recipients.
5. **Edit Recipient List.** A button labeled Edit Recipient List.

Write & Insert Fields:

6. **Highlight Merge Fields.** A button labeled Highlight Merge Fields.
7. **Address Block.** A button labeled Address Block.
8. **Greeting Line.** A button labeled Greeting Line.
9. **Insert Merge Field.** A dropdown labeled Insert Merge Field.
10. **Rules.** A dropdown labeled Rules.
11. **Match Fields.** A button labeled Match Fields.
12. **Update Labels.** A button labeled Update Labels.

Preview Results:

13. **Preview Results.** A button labeled Preview Results.
14. **Record navigation.** First-record, previous-record, a record-number field, next-record, and last-record buttons.
15. **Find Recipient.** A button labeled Find Recipient.
16. **Check for Errors.** A button labeled Check for Errors.

Finish:

17. **Finish & Merge.** A dropdown labeled Finish & Merge.

## Phase 9 — Review tab

**Done.** Proofing (Spelling & Grammar / Thesaurus / Word Count); Speech Read Aloud; Accessibility Checker dropdown; Language (Translate dropdown + Language); Comments (New / Delete / Prev / Next / Show); Tracking (Track Changes, Simple Markup closed label, Reviewing Pane); Changes (Accept / Reject dropdowns + Prev / Next); Compare dropdown; Protect (Block Authors + Restrict Editing); Hide Ink; Linked Notes.

Review already has Comments, New comment, Track changes, a markup menu (All markup, Simple, Original), Accept, Reject, Accept all, and Reject all. Spell check, Thesaurus, and Translate are on Home.

Proofing:

1. **Spelling & Grammar.** A button labeled Spelling & Grammar. Spell check on Home is the simpler version.
2. **Thesaurus.** A button labeled Thesaurus. The Home thesaurus panel is the simpler version.
3. **Word Count.** A button labeled Word Count. The status bar already shows a word count. This opens the count.

Speech:

4. **Read Aloud.** A button labeled Read Aloud.

Accessibility:

5. **Check Accessibility.** A dropdown labeled Check Accessibility.

Language:

6. **Translate.** A dropdown labeled Translate. Translate on Home is the simpler version.
7. **Language.** A dropdown labeled Language.

Comments. New Comment already exists.

8. **Delete.** A dropdown labeled Delete.
9. **Previous.** A button labeled Previous, in the Comments group.
10. **Next.** A button labeled Next, in the Comments group.
11. **Show Comments.** A button labeled Show Comments. The comments panel toggle is the simpler version.

Tracking:

12. **Show Markup.** A dropdown whose closed label reads Simple Markup.
13. **Reviewing Pane.** A button labeled Reviewing Pane.

Changes. Accept and Reject already exist as buttons.

14. **Accept.** A dropdown labeled Accept.
15. **Reject.** A dropdown labeled Reject.
16. **Previous.** A button labeled Previous, in the Changes group.
17. **Next.** A button labeled Next, in the Changes group.

Compare:

18. **Compare.** A dropdown labeled Compare.

Protect:

19. **Block Authors.** A dropdown labeled Block Authors.
20. **Restrict Editing.** A dropdown labeled Restrict Editing.

Ink:

21. **Hide Ink.** A button labeled Hide Ink.

OneNote:

22. **Linked Notes.** A button labeled Linked Notes.

## Phase 10 — View tab

**Done.** Views (Read / Print / Web / Outline / Draft); Immersive (Focus + Immersive Reader); Page Movement (Vertical + Side to Side); Show (Ruler / Gridlines / Navigation Pane); Zoom (dialog / 100% / One / Multiple / Page Width); Window (New / Arrange / Split / Side by Side / Sync / Reset / Switch); Macros dropdown; SharePoint Properties; Help tab shell.

View already has Ruler, Gridlines, Page width, One page, and Multiple pages. The status bar has a zoom slider. The theme-color menu is not in the screenshots.

Views:

1. **Read Mode.** A button labeled Read Mode.
2. **Print Layout.** A button labeled Print Layout. This is the current page view.
3. **Web Layout.** A button labeled Web Layout.
4. **Outline.** A button labeled Outline.
5. **Draft.** A button labeled Draft.

Immersive:

6. **Focus.** A button labeled Focus.
7. **Immersive Reader.** A button labeled Immersive Reader.

Page Movement:

8. **Vertical.** A button labeled Vertical.
9. **Side to Side.** A button labeled Side to Side.

Show. Ruler is checked in the screenshot. Gridlines is present and unchecked.

10. **Navigation Pane.** A checkbox labeled Navigation Pane.

Zoom:

11. **Zoom.** A button labeled Zoom.
12. **100%.** A button labeled 100%.
13. **One Page.** A button labeled One Page. The One page zoom mode is the simpler version.
14. **Multiple Pages.** A button labeled Multiple Pages. The Multiple pages zoom mode is the simpler version.
15. **Page Width.** A button labeled Page Width. The Page width zoom mode is the simpler version.

Window:

16. **New Window.** A button labeled New Window.
17. **Arrange All.** A button labeled Arrange All.
18. **Split.** A button labeled Split.
19. **View Side by Side.** A button labeled View Side by Side.
20. **Synchronous Scrolling.** A button labeled Synchronous Scrolling.
21. **Reset Window Position.** A button labeled Reset Window Position.
22. **Switch Windows.** A dropdown labeled Switch Windows.

Macros:

23. **Macros.** A dropdown labeled Macros.

SharePoint:

24. **Properties.** A button labeled Properties.

The ribbon also shows a Help tab after View. Its contents are not in the screenshots, so this item is only the tab labeled Help.

## Phase 11 — File backstage

**Done.** Full left nav (Home → Options) including Get Add-ins / History / Share / Transform / Account / Feedback stubs; Home New row + Recent/Pinned; New suggested searches + gallery; Open/Save As Places; Info Protect/Inspect/Manage + Properties; Print settings list; Export PDF/XPS + Change File Type; window title `Document1 - Word`.

File is a full-page backstage, not the small Open / Save / Save As / Print / Recent menu. The left nav, top to bottom, is: Home, New, Open, Get Add-ins, Info, Save, Save As, History, Print, Share, Export, Transform, Close, then Account, Feedback, and Options at the bottom. The window title on these screens is Document1 - Word.

Home:

1. **Greeting.** The heading Good afternoon.
2. **New.** A New heading and a template row: Blank document, Welcome to Word (caption Take a tour), Single spaced (blank), Snapshot calendar, Insert your first table of cont…, Modern chronological resume, Modern chronological cover…, Blue spheres cover letter. A link at the right reads More templates.
3. **Recent and Pinned.** Two tabs, Recent and Pinned. Recent is selected on the screenshot.
4. **Recent list.** Columns Name and Date modified. Each row is a document icon, the file name, the place under the name, and the date. A link at the right reads More documents.

New. The nav item New is selected.

5. **Blank document.** A large Blank document tile.
6. **Search for online templates.** A search box with that placeholder.
7. **Suggested searches.** Chips labeled Business, Cards, Flyers, Letters, Education, Resumes and Cover Letters, and Holiday.
8. **Template gallery.** The tiles under the search, in this order: Welcome to Word, Single spaced (blank), Snapshot calendar, Insert your first table of co…, Modern chronological res…, Modern chronological cov…, Blue spheres cover letter, Restaurant brochure, Education brochure, Vivid shapes event brochure, Bubbles appointment cale…, Banner calendar, Metro report, Student report with photo, Professional APA Style pa…, World’s best award certifi…, Colorful employee of the…, Service invoice (Green Gra…, General professional thank…, Party invitation flyer.
9. **Empty search note.** The lines “Not finding what you’re looking for?” and “Use the search box at the top to find more templates.”

Open. The nav item Open is selected.

10. **Places.** A Recent button, then the place list grouped as Jibs Cloud, Cloudteam Company B.V., Personal, and Other locations. Other locations contains This PC, Add a Place, and Browse.
11. **Documents and Folders.** Two tabs, Documents and Folders. Documents is selected.
12. **File list.** A pinned hint, “Pin files you want to easily find later. Click the pin icon that appears when you hover over a file.” Then sections Last Week and Older. Columns are a pin, Name, and Date modified. Each row shows the file name and its place.
13. **Recover Unsaved Documents.** A button with that label at the bottom of the list.

Info. The nav item Info is selected.

14. **Protect Document.** A button labeled Protect Document. The text under it reads “Control what types of changes people can make to this document.”
15. **Inspect Document.** A button labeled Check for Issues. The heading is Inspect Document. The text reads “Before publishing this file, be aware that it contains:” followed by “Document properties and author’s name” and “Custom XML data”.
16. **Manage Document.** A button labeled Manage Document. The line under it reads “There are no unsaved changes.”
17. **Properties.** A Properties heading. Rows: Size (Not saved yet), Pages, Words (0), Total Editing Time (3 Minutes), Title (Add a title), Tags (Add a tag), Comments (Add comments).
18. **Related Dates.** Rows: Last Modified, Created (Today, 12:47), Last Printed.
19. **Related People.** Author, with Add an author.
20. **Last Modified By.** The value shown is Not saved yet.
21. **Show All Properties.** A link with that label.

Save and Save As. Save has no page of its own in the screenshots. Save As is selected on its shot. The current Save and Save As commands are the simpler version.

22. **Save As places.** The same place list as Open: Recent, the cloud and personal accounts, This PC, Add a Place, and Browse.
23. **Save As folders.** A pin hint for folders, then Last Week and Older. Each row is a folder name and its place.

Print. The current print command is the simpler version. The page is selected in the nav.

24. **Print.** A Copies field showing 1, with up and down spinners, and a Print button.
25. **Printer.** A Printer heading, a printer dropdown (the shot shows HPScan, Ready), and a Printer Properties link.
26. **Settings.** A Settings list, each row a dropdown: Print All Pages (“The whole thing”), a Pages field, Print on Both Sides (“Flip pages on long edge”), Collated (“1,2,3 1,2,3 1,2,3”), Portrait Orientation, A4 (“21 cm x 29,7 cm”), Normal Margins (“Top: 2,54 cm Bottom: 2,54 c…”), 1 Page Per Sheet. Under the list, a Page Setup link.
27. **Preview.** The page preview, with previous and next arrows, “1 of 1”, and a zoom slider at 100%.

Export:

28. **Create a PDF/XPS Document.** The selected item. The description reads “Preserves layout, formatting, fonts, and images”, “Content can’t be easily changed”, and “Free viewers are available on the web”. A button labeled Create PDF/XPS.
29. **Change File Type.** The second item in the Export list.

Nav items whose pages are not shown. Add the entries only: Get Add-ins, History, Share, Transform, Close, Account, Feedback, Options.

## Phase 12 — Font dialog

**Done.** Font / Advanced tabs; +Body / +Headings + system font list; style / size / color / underline / effects; Character Spacing + OpenType; shared preview + Set As Default / Text Effects… / OK / Cancel.

Opened from the Font dialog launcher. Two tabs, Font and Advanced. The title bar reads Font. Both tabs share the footer: Set As Default, Text Effects…, OK, and Cancel.

Font tab:

1. **Font.** A list. The shot shows +Body selected, then +Headings, Alien Encounters, AniMe Vision - MB_EN, and Aptos. Use the same system-font list as the ribbon Font dropdown.
2. **Font style.** A list: Regular (selected), Italic, Bold, Bold Italic.
3. **Size.** A list with 12 selected. Visible sizes include 8, 9, 10, 11, and 12.
4. **Font color.** A dropdown set to Automatic.
5. **Underline style.** A dropdown set to (none).
6. **Underline color.** A dropdown set to Automatic.
7. **Effects.** Checkboxes: Strikethrough, Double strikethrough, Superscript, Subscript, Small caps, All caps, Hidden.
8. **Preview.** A preview box showing +Body, and the line “This is the body theme font. The current document theme defines which font will be used.”

Advanced tab:

9. **Scale.** A dropdown set to 100%, under Character Spacing.
10. **Spacing.** A dropdown set to Normal, and a By field with spinners.
11. **Position.** A dropdown set to Normal, and a By field with spinners.
12. **Kerning.** A checked box, “Kerning for fonts”, a field showing 1, and the label “Points and above”.
13. **Ligatures.** A dropdown set to Standard and Contextual, under OpenType Features.
14. **Number spacing.** A dropdown set to Default.
15. **Number forms.** A dropdown set to Default.
16. **Stylistic sets.** A dropdown set to Default.
17. **Use Contextual Alternates.** An unchecked checkbox.
18. **Preview.** The same +Body preview and theme-font sentence as the Font tab.

## Phase 13 — Page Setup dialog

**Done.** Margins / Paper / Layout tabs with cm fields + spinners, orientation, paper source lists, section/headers/vertical align, Line Numbers… / Borders… / Print Options…, preview, Apply to, Set As Default.

The title bar reads Page Setup. Three tabs: Margins, Paper, Layout. Every tab has a preview thumbnail, an Apply to dropdown set to Whole document, Set As Default, OK, and Cancel. Margin fields on Layout already exist as millimeter inputs. This dialog is the one in the screenshots, in centimeters.

Margins tab:

1. **Margins.** Fields Top, Bottom, Left, and Right, each showing 2,54 cm with spinners. Gutter showing 0 cm with spinners. Gutter position, a dropdown set to Left.
2. **Orientation.** Two choices, Portrait (selected) and Landscape.
3. **Pages.** A Multiple pages dropdown set to Normal.

Paper tab:

4. **Paper size.** A dropdown set to A4. Width showing 21 cm. Height showing 29,7 cm. Both dimensions have spinners.
5. **Paper source.** Two lists, First page and Other pages. Both have “Default tray (Printer auto select)” selected. The visible rows are Automatically Select, Printer auto select, Tray, Tray 1, Manual Feed, Tray 2, Tray 3, and Tray 4.
6. **Print Options…** A button with that label.

Layout tab:

7. **Section.** A Section start dropdown set to New page. An unchecked box, Suppress endnotes. Layout → Breaks already inserts Section Break (Next Page / Continuous).
8. **Headers and footers.** Unchecked boxes Different odd and even, and Different first page. A first-page checkbox already exists on the page. From edge: Header and Footer, each showing 1,25 cm with spinners.
9. **Page.** A Vertical alignment dropdown set to Top.
10. **Line Numbers…** A button with that label.
11. **Borders…** A button with that label. Same command as Page Borders in Phase 3.

## Phase 14 — Title bar and status bar

**Done.** Title bar AutoSave / Save / Undo / Redo / Search / Share / Account; status bar Language, Accessibility, Focus, Read/Print/Web view buttons, Zoom −/slider/%/+.

Title bar. Quick access already has File, Open, Save, Save As, and Print. Undo and redo are on Home. The window already has minimize, maximize, and close.

1. **AutoSave.** A toggle labeled AutoSave, shown On.
2. **Save.** The save icon sits in the title bar next to AutoSave. Save in the File menu is the simpler version.
3. **Undo and Redo.** The curved-arrow buttons in the title bar, after Save.
4. **Search.** A search box in the center of the title bar, placeholder Search.
5. **Share.** A button labeled Share at the right of the title bar, before the window buttons.
6. **Account.** The account button at the right of the title bar.

Status bar. Word count, page “Page 1 of 1”, and a zoom slider with a percent label already exist.

7. **Language.** The language label. The shots show English (Netherlands) and English (United States).
8. **Accessibility.** The label “Accessibility: Good to go”.
9. **Focus.** A Focus button.
10. **View buttons.** Read Mode, Print Layout (selected), and Web Layout.
11. **Zoom.** The minus control, the slider, the percent (100%), and the plus control. The existing slider is the simpler version.

## Phase 15 — Icons, SmartArt, & Chart dropdown refactors

**Done.** Icons dark-mode modal + bundled SVG dropdown + cache/shimmer; SmartArt visual gallery + More dialog; Chart dropdown-first (Column / Line / Pie / Bar / Area / Scatter) + More Charts…

## Phase 16 — Interactive 3D Models engine

**Done.** Stock/local/online 3D browser; TipTap `threeDModel` with Three.js orbit + snapshot for print/docx; contextual 3D Model ribbon (camera, lighting, pan/zoom, reset).

**Fixed 2026-10-26** (see `changes.md`): the Online tab inserted a cube with the thumbnail; it now downloads the
Poly Haven glTF with its `.bin` and textures, packs them into one `.glb` (`editor/gltf-pack.ts`,
`editor/polyhaven.ts`) and inserts that model. Open: a model inserted from the library or a local file is saved to
`.docx` as its picture only.

## Phase 17 — Single line ribbon

Word for the web's two ribbon layouts. Reference: `screenshots/ribbon/` (seven single line shots, then the same seven tabs in the classic layout). Classic stays the default; the choice is remembered. Each sub-phase lands on its own and is started only when requested.

Rules for every tab:

- One row, 40 px high card. Buttons 32 px high, icons in a 20 px box, labels 13 px, chevrons and dividers identical everywhere.
- A command keeps its label when Word's single line shows one (Page Break, Table, Find); otherwise it is icon only with a tooltip.
- Groups are separated by a vertical divider, in the order of the classic tab.
- Commands that do not fit the width leave the row lowest priority first, then right to left, and appear in a **More options** (…) menu at the end of the row. A group's own … menu (Font, Paragraph) holds its secondary commands at every width.
- In the overflow menu a command keeps its icon and label; a dropdown opens its menu in place with a Back row; a field (font name, spin box) shows as itself.
- Icons: same grid and stroke per tab, colours from the icon tokens, checked side by side in light and dark.

### 17.0 — Layout switch and primitives

**Done (ticked off 2026-10-22).** The arrow at the ribbon's bottom right collapses the ribbon to the single line and expands it back (a toggle with a tooltip, as Word for the web's arrow is, rather than a two-entry menu); Ctrl+F1 (⌘F1 on Mac) does the same (bound in `app-menu.ts`, checked in Chrome). `ribbonLayout` lives in the view store, classic by default, kept in local storage. The single line primitives are in `single-line.tsx` (bar, group, button, dropdown, split, field, group More, overflow More options). Every tab, including the context tabs, has a single line layout, so the classic fallback is never needed. The card's height eases between layouts and the document area takes what the ribbon gives up.

1. **Ribbon layout arrow.** The chevron at the bottom right of the ribbon, in both layouts. It opens a menu, Ribbon layout: Classic ribbon, Single line ribbon. (Menu from memory; the screenshots show the arrow only.)
2. **Setting.** `ribbonLayout` in the view store, classic by default, kept in local storage.
3. **Primitives.** Single line bar, group, button, dropdown, split button, field, group More menu, overflow More options menu.
4. **Fallback.** A tab without a single line layout yet shows its classic body.
5. **Layout.** The document area takes the height the ribbon gives up.

### 17.1 — Home

**Done.** All commands below; menus shared with the classic tab (`home-menus.tsx`). Simpler versions: Checklist is a bullet list with an empty box (no clickable check box yet); Dictate uses the browser's speech recognition and is disabled where there is none; Editor opens the Check Grammar pane; the Find menu also holds Replace and Select.

Undo (split) | Paste (split), Format Painter | Font name, Font size, Grow Font, Shrink Font, Bold, Italic, Underline, Highlight (split), Font Color (split), Clear Formatting, More (Strikethrough, Subscript, Superscript, Change Case, Text Effects, Font…) | Bullets (split), Numbering (split), Checklist, Decrease Indent, Increase Indent, Align (dropdown), Borders (split), Shading (split), More (Multilevel List, Sort, Show/Hide ¶, Line Spacing, Paragraph…) | Styles box (Normal ▾) | Find (dropdown, labelled) | Dictate (labelled) | Editor (labelled) | Add-ins.

### 17.2 — Insert

**Done.** Row and More options as below, with a line icon set (`line-icons.tsx`) and the classic tab's menus and dialogs shared. Differences: Link is a dropdown (the classic Link form), not a split button; Table of Contents inserts Automatic Table 1; New Comment opens the comment form; Header & Footer starts editing the header; Emoji is a palette of 48 common emoji typed as text.

Page Break, Table ▾, Picture ▾, Drawing, Link ▾ (split), Table of Contents, Bookmarks ▾, Online Video, New Comment, Header & Footer, Page Numbers ▾, Equation, Symbol ▾, Emoji ▾ — all labelled. Shapes, Icons, SmartArt, Chart, 3D Models, Text Box, WordArt and the rest of the classic tab go to More options.

### 17.3 — Layout

**Done.** Row as below; indent in cm and spacing in pt as in the classic tab (Word for the web shows inches by locale). Page Borders opens the Page Borders dialog rather than a menu. More options holds Hyphenation, Page Setup…, Paragraph… and the Arrange group.

Margins ▾, Orientation ▾, Size ▾, Columns ▾, Breaks ▾, Line Numbers ▾ | Indent Left [0"], Indent Right [0"], Spacing Before [0 pt], Spacing After [8 pt] — labelled spin fields | Page Borders ▾ (labelled), Page Color ▾ (icon) | More options.

### 17.4 — References

**Done.** Row as below. Insert Footnote and Insert Endnote open the note form (no chevron). Citations holds the sources to cite, Manage Sources…, Insert Bibliography and the Style choices. More options holds the rest of the classic tab; its three Update Table commands are named after their table.

Table of Contents ▾, Insert Footnote, Insert Endnote, Citations ▾ — labelled. Captions, Index and Table of Authorities from the classic tab go to More options.

### 17.5 — Review

**Done.** Row as below except: Editor opens Check Grammar (no menu); Word Count has no chevron; Mark All as Read and Filter are left out (comments have no read state or authors to filter by); Track Changes is a toggle rather than a dropdown. Accept and Reject are split buttons that settle the change at the cursor. More options holds Thesaurus, Read Aloud, Language, Reviewing Pane, Compare, Block Authors, Restrict Editing, Hide Ink and Linked Notes.

Editor ▾, Spelling & Grammar ▾, Word Count ▾, Check Accessibility, Mark All as Read | Translate ▾ | New Comment, Delete ▾, Previous Comment, Next Comment (icons), Show Comments (labelled toggle) | Filter ▾, Markup view ▾ | Track Changes ▾, Accept ▾, Reject ▾, Previous Change, Next Change (icons).

### 17.6 — View

**Done.** Row as below. Separate Pages switches between Print Layout and Web Layout; the Zoom box lists 50–200%, Page Width, One Page and Custom… (the Zoom dialog). Footnotes and Endnotes go to the first note of their kind and are disabled without one. Dark Mode switches the app's colour mode. More options holds the rest of the classic tab: the other layouts, Focus, Page Movement, Gridlines, the zoom commands, Office Theme, Window, Macros and Properties.

Separate Pages (toggle), Reading View, Immersive Reader | Zoom [100% ▾], 100% | Ruler (toggle), Navigation, Header & Footer, Footnotes, Endnotes | Dark Mode.

### 17.7 — Help

**Done.** The Help tab was a placeholder; both layouts now have the five commands, each opening a Word-frame dialog (`src/components/help-dialogs.tsx`, state in `src/document/help.ts`). Help is searchable topics (also F1); Contact Support shows version details and opens the project's GitHub issues; Feedback (like / don't like / suggestion) opens a pre-filled new issue to review before posting; Keyboard Shortcuts lists the shortcuts the app wires up; What's New lists recent changes. The desktop app may open only the project's GitHub pages (`opener:allow-open-url` in `src-tauri/capabilities/default.json`).

Help, Contact Support, Feedback, Keyboard Shortcuts, What's New — labelled.

### 17.8 — Tabs Word for the web does not have

Design, Mailings, Draw and AI Tools: the classic tab's first command of each group, labelled, the rest in More options.

**Done.** Deviation: the row holds each classic tab's large commands rather than only the first of each group, because the first alone would hide the tab's purpose (Pen on Draw, Select Recipients on Mailings, Rewrite on AI Tools); small commands and fields go to More options.

- Design: Themes (a grid of the theme previews), Colors, Fonts | Watermark, Page Color, Page Borders. More: Paragraph Spacing, Effects, Set as Default.
- Mailings: Envelopes, Labels | Start Mail Merge, Select Recipients | Insert Merge Field | Preview Results, ‹ 2 of 3 › | Finish & Merge. More: Edit Recipient List, the small Write & Insert Fields commands, First/Last Record, Find Recipient, Check for Errors. The record counter replaces the classic "Preview:" badge, which would cover the row. (Preview Results still only shows the record; it does not yet substitute the fields in the page, in either layout.)
- Draw (context tab of a drawing canvas): Select, Pen, Highlighter | Drawing Canvas, Clear. More: Width and Pen/Highlighter Color.
- AI Tools: Summarize, Rewrite, Chat | Template Builder | Fill Variables | AI Keys, and Stop while generating. More: Provider and Model.

### 17.9 — Context tabs

Table Design, Table Layout, Picture Format, Shape Format, Chart Design, Format, 3D Model, Header & Footer, Draw: the same rule as 17.8.

**Done.** Same rule as 17.8: the large commands (and each classic gallery, as a dropdown) on the row, labelled; small commands and fields in More options, where Height and Width share one Size row. The menus are hoisted inside each tab so both layouts use the same ones; the Header, Footer and Page Number menus come from `useChromeMenus` in `insert-tab.tsx`.

- Table Design: Table Styles, Style Options (stays open, like the checkboxes) | Borders.
- Table Layout: Select, Insert (Above/Below/Left/Right), Delete | Merge Cells, Split Cells | Alignment (the 3×3 grid), Sort.
- Picture Format: Corrections, Picture Styles, Alt Text | Wrap Text, Position, Crop.
- Shape Format: Shapes, Shape Fill, Shape Outline, WordArt Styles | Wrap Text, Position.
- Chart Design: Add Chart Element, Quick Layout, Chart Styles | Switch Row/Column, Change Chart Type. Format: Shape Fill, Shape Outline | Bring Forward, Send Backward, Rotate.
- 3D Model: 3D Models, Front, 3D Model Views | Wrap Text.
- Header & Footer: Header, Footer, Page Number | Go to Header, Go to Footer, Different First Page | Close Header and Footer.

Left for 17.10: many small commands in More options (and on the classic tabs) still show the generic table glyph from `ContextGlyph` (Selection Pane, Align, Group, Draw Text Box, Eraser, AutoFit…).

### 17.10 — Polish

Icon contact sheet per tab in both layouts and both themes; narrow widths; keyboard order; tooltips.

**Done.**

- Contact sheet of every tab's row at 1400 and 480 px, light and dark. Borders (Home) had a white fill that showed as a solid square in dark mode; it is now an outline in both layouts. View's 100% is a text button, since a "100" drawn at 20 px could not be read.
- `ContextGlyph` gives the context tabs' small commands their own outline drawings by exact label (Selection Pane, Align, Group, Draw Text Box, Eraser, AutoFit, Distribute, Formula…) instead of the generic table, in both layouts.
- Keyboard: on the single line row, Left/Right move between commands (wrapping) and Home/End go to the ends; text and spin fields keep their arrows; hidden and disabled commands are skipped. Tab still visits each command.
- Tooltips checked on labelled and icon-only commands (name, description, shortcut). More options stays inside the window at 420 px and scrolls.

## Phase 18 — Fixes and finish

One sub-phase at a time, each checked in the browser in both themes before the next starts.

### 18.1 — Charts in Word documents

Opening a document with a chart failed: "Unknown namespace is not listed in mc:Ignorable: …/drawingml/2006/chart".

**Done.** The markup reader understands the chart, chart drawing, SmartArt (diagram), locked canvas, chartex and `a16` namespaces. A drawing's open content (`a:graphicData`, `a:ext`) passes any namespace through, since the drawing is kept whole. An unknown namespace elsewhere is still rejected, and `mc:Choice` still requires real support. Saving after an edit dropped the chart part (its type looked "known" to the reader, but the writer never wrote it). Parts behind a kept drawing (charts with their styles and workbooks, SmartArt, embedded objects) now go back as they came. The editor shows a stand-in, "[Chart 1]", where the chart sits. Charts are not drawn yet.

### 18.2 — Open and save errors

Themed error dialogs, with icons, for files that cannot be opened or saved. Cases: not found, not a Word file or unsupported format, damaged, password protected, permission denied or read only, disk full or write failed. Each dialog says what happened in plain words, with the file name, and offers what fits: Retry, Save As…, Open another file, Remove from recent, Details (copy). Map the reader's `OpcError`/`WmlError`/`MceError` codes and the Tauri fs errors to these cases in one place.

**Done.** `src/document/file-errors.ts` sorts an error into one case: not found, folder missing, unsupported type, old Word 97–2003 file, password protected, damaged, no permission, read-only location, in use, disk full, needs the desktop app, or other. The inputs are the reader's errors, the desktop app's messages and OS error numbers, and the file's first bytes (a compound file is an old .doc, or an encrypted .docx). `FileErrorDialog` uses the app's dialog frame: an icon per case with a coloured badge (themed tokens), a plain heading and message with just the file name, Details (the system's own words) with Copy, and the buttons that fit:

- Open: Try Again, Open Another File…, Remove from Recent (a missing recent file stays listed until removed, as in Word).
- Save and export: Save As… (switching to .docx when the format was the problem), Try Again, Close.

Open, Open Recent, drop, Save, Save As and Export all go through it, in the browser too (before, the browser only logged to the console). A file with an unknown extension is no longer opened as text.

### 18.3 — Ruler shadows

A soft shadow where the top ruler meets the document area and where the side ruler meets it. The shadow stays when the rulers are hidden, along the ribbon's bottom edge and the window's left edge. Tokens for both themes.

**Done.** Two gradient strips (`.ruler-shadow`, 6 px, `--app-ruler-shadow` per theme) sit over the document area in `DocumentRulers`. They run along the top ruler's bottom edge and the side ruler's right edge, and with the rulers off, along the ribbon and the window's left edge. The pages scroll under them; they take no clicks.

### 18.4 — Page break focus

After Insert › Page Break (or Ctrl+Enter), scroll the new page into view and leave the caret blinking at its top, as Word does.

**Done.** Page Break (Insert, Layout, Ctrl+Enter) and Blank Page flag their transaction. A small plugin in `page-break.ts` waits until the pages are laid out (the caret stops moving for three frames), then scrolls the new page's top into view, 24 px under the ruler, and keeps the editor focused. It leaves the view alone when the page top and the caret are both already showing.

### 18.5 — Ribbon toggle

The chevron at the ribbon's bottom right becomes a direct toggle: pointing up collapses to the single line, pointing down expands to the classic ribbon. The tooltip says which.

**Done.** `RibbonLayoutToggle` replaces the Ribbon display options menu, which only held these two choices. Classic: an up arrow, "Collapse the ribbon". Single line: a down arrow, "Expand the ribbon". The choice is remembered as before. Ctrl+F1 (⌘F1) does the same, as in Word, and is listed under Keyboard Shortcuts. `toggleRibbonLayout` is on the view store.

### 18.6 — Title bar double click

Double-clicking the title bar's empty area maximizes the window, or restores it if already maximized (Tauri `toggleMaximize`). Double clicks on its buttons and fields are ignored.

**Done.** The bug: the title bar's drag layer had its own double-click handler as well. Tauri's drag script already maximizes on a double click in a drag region (`internal_toggle_maximize`, granted by `core:default`), so the window toggled twice and stayed as it was. Also, the empty space between the title bar's controls belonged to the content columns, not the drag layer. The `<header>` is now `data-tauri-drag-region="deep"` with no handler of ours. Every empty part drags the window and toggles maximize on a double click; Tauri skips buttons, fields and other controls. Checked by running Tauri's own `drag.js` against the page: empty spots and the top edge send one drag plus one toggle; the search box, the search options, Save and Close send nothing. Not run in the desktop build.

### 18.7 — Animations

Subtle motion: the page fades and rises in when a document is created or opened; File (backstage) slides in and out; menus, dropdowns and dialogs fade and scale from their anchor. Durations 120–200 ms, Fluent easing, and none at all under `prefers-reduced-motion`.

**Done.** Motion tokens on `:root` (`--motion-ease-in/out`, 120/160/220 ms) and one block at the end of `index.css`:

- New, opened or recovered document: the page stage fades in and rises 16 px (`playDocumentEntrance` in `src/document/motion.ts`), and the rulers re-measure when it lands.
- File: the pane fades in, its nav slides from the left and the page follows. Each File tab fades in when chosen. Closing slides the pane out (160 ms, kept mounted by `usePresence`).
- Ribbon menus: a 120 ms fade and 4 px drop, as a transition from Base UI's starting style (keyframe entrances flickered in the desktop webview, 420f0fe). They close at once, as Office's do. Context, spelling and mini toolbar menus fade in.
- Dialogs settle in from 6 px below at 98% scale.
- With reduced motion, none of it runs and the File pane unmounts at once.

Not yet checked in the desktop webview for flicker.

**Done 2026-10-27** (from a screencast of the desktop app): the start screen at launch has no entrance, the splash
goes at once (no fade over the start screen) and hides its card until the picture loads, File no longer fades the
whole window in and closes at once, and the main ribbon tabs stay built (`Activity`), so switching is one frame.
The tab slide then still stuttered: its first, slow frame ate most of it. Now that frame is drawn with the commands
unseen and the slide starts on the next one, set on the card element rather than through state. A recording then
showed WebKitGTK replays a frame of each entrance after the content has settled. Turning motion off there felt dead,
so every entrance is now drawn from script a frame at a time (`src/document/entrances.ts`, `playEntrance`), checked
in WebKitGTK itself (MiniBrowser on Xvfb, recorded) with no jumps. The tab underline no longer fades between tabs.
Then only switches to and from Home slid: the slide picked Home's panel, which Activity had hidden but not yet
marked hidden. It now picks the panel actually shown (`shownTabPanel`), as do the ribbon's scroll arrows.

### 18.8 — Styles

Modify Style dialog (name, based on, next style, font, paragraph, preview) from the Styles gallery's right-click and a Manage Styles pane: new style, modify, delete (built-ins can't be deleted, only hidden), all saved in the current document's styles.xml. "New documents based on this template" saves the chosen styles as defaults applied to every new document.

**Done.** Each document has its own style list (`useStyleStore` in `src/document/styles.ts`): the built-ins on a new document, the opened .docx's own definitions (plus the custom styles its text uses), or the list packed into an app HTML file or recovery draft.

- Right-click a gallery style: Update to Match Selection, Modify…, Remove from Style Gallery, Delete (custom styles only). The More menu adds Create a Style… and Manage Styles…, as does the Styles group's launcher.
- Modify Style / Create New Style from Formatting (`src/components/style-dialogs.tsx`): name, type, based on, following paragraph, font, size, bold/italic/underline, colour, alignment, line spacing, space before/after, left indent, preview and summary, "Add to the Styles gallery", and "Only in this document" / "New documents based on this template".
- Manage Styles: every style with Modify, New Style, Delete (with a confirmation; its paragraphs go back to Normal), Show/Hide in Gallery, Set as Default and Reset Defaults.
- Changed and new paragraph styles are drawn by a generated stylesheet. Character styles are applied as formatting tagged with the style, and re-stamped when the style changes.
- On a .docx save, the changed and used styles are written to styles.xml (merged into Word's own definition when there is one), and each paragraph keeps its Word style id. Defaults for new documents are kept in localStorage.
- Alignment: TipTap wrote `text-align: left` inline on every paragraph, which hid any centred style, including centred Word styles in opened files. Paragraphs now have no alignment unless one is set (`defaultAlignment: null`).

Checked in headless Chrome, both themes: modify Title (36 pt italic), create Callout from the selection (16 pt bold centred), save as .docx and reopen (both styles come back from styles.xml), Set as Default, delete Callout (its paragraph goes back to Normal), then a new document starts with Callout. 8 new unit tests.

## Phase 19 — Objects, focus, options and windows

### 19.1 — Overlaps and the chart namespace

- Chart error: the 16 Oct AppImage predates the 18.1 fix. Add Word-shaped chart tests (inline, floating, in a header, chartex behind `mc:AlternateContent`) to be sure, then rebuild the desktop app.
- Ribbon labels that touch or overlap (Insert: Spreadsheet, Drawing Canvas, Screenshot; Bookmark, Cross-reference): give large buttons a minimum gap and let labels wrap to two lines as Word does. Check every tab for label collisions with a script.
- Text Effects reflection tiles spill into the next row and heading: keep each tile's reflection inside it and let the flyout fit.

**Done, in part.** The chart error does not happen with the current code: the desktop build was from before 18.1. A new test reads the chart shapes Word writes (floating, chartex behind `mc:AlternateContent`, inside a drawing canvas). Text Effects: the effect was set on each tile button, so a reflection mirrored the whole tile, border included, into the row below; it now sits on the letter inside the tile, which clips it (`.effect-tile`), in the ribbon menu and the Font dialog alike. Overlapping labels (desktop only, `screenshots/ribbon.png`): WebKitGTK did not grow a large button from its label's `width: 44px; min-width: min-content`, so a long word (Spreadsheet, Cross-reference) spilled over its neighbours. The label is now `width: min-content; min-width: 44px`, and a hyphenated name breaks after the hyphen (Cross- / reference). Chrome renders the ribbon pixel-identically and a script measuring every label on every tab finds no collisions; to confirm in the desktop app.

### 19.2 — Dialog focus and motion

- Dialog title bars follow the theme's colours.
- While a dialog is open, the main title bar looks inactive (lighter, muted text), as an OS shows the window without focus.
- Remove the flicker at the end of the animations (layer change at the last frame).
- A subtle animation when the ribbon collapses to one line or expands.

**Done.** The title bar's fill is a root variable (`--app-title-fill`, solid or gradient, darkened in dark mode, from `themeAccentVars`). Dialog title bars (`.word-dialog-title`, and the Icons, SmartArt and 3D Models libraries) use it with white text. While any modal dialog is open (`:root:has([role="dialog"][aria-modal="true"])`) the main title bar is washed out (`--app-titlebar-inactive`), as an OS draws a window without focus; the File view is not modal and leaves it alone. The libraries and the chart sheet are now marked `aria-modal`. Flicker: animated dialogs, menus and the File pane keep a compositing layer for good (`will-change: opacity`, not transform, which would capture fixed pickers), so the desktop webview no longer repaints them as an animation ends; the new-document entrance no longer moves the pages but fades a workspace-coloured cover off them. The ribbon card eases its height (220 ms) between the full and single line layouts. Checked in Chrome in light, dark, a gradient and a green theme; the flicker itself only shows in the desktop app.

### 19.3 — Object layout (wrap and position)

- Selecting a picture or other object selects just the object (handles), never the whole line.

  **Done.** (`screenshots/pictureselection.png`) Shapes, icons, charts and 3D models are block `figure` nodes as wide as the line. ProseMirror clears the highlight only inside the editor (`.ProseMirror-hideselection *::selection`); WebKitGTK also paints the selected block's selection gap in an ancestor's colour, the whole line. `:root:has(.ProseMirror-hideselection) ::selection` now clears it while an object is selected; text selection is unchanged.

- Word's wrap choices for pictures, shapes, icons, charts, 3D models and text boxes: In Line with Text, Square, Tight, Through, Top and Bottom, Behind Text, In Front of Text, plus Move with Text / Fix Position on Page.
- Word's Layout Options button beside the selected object; the Wrap Text menus (ribbon and right-click) and Size and Position use the same choices.
- Text flows around Square/Tight/Through objects on the side(s) with room, above and below for Top and Bottom.
- The choices round-trip in .docx (`wp:inline` / `wp:anchor` with `wrapSquare`, `wrapTight`, `wrapThrough`, `wrapTopAndBottom`, `wrapNone` + `behindDoc`).

  **Done.** `WRAP_CHOICES` in `src/editor/objects.ts` is the one list: the right-click Wrap Text submenu, `WrapTextMenu` (`src/components/wrap-menu.tsx`, every ribbon tab), the text box panel and the Layout Options button (`src/components/layout-options.tsx`) all use it. Pictures, shapes, icons, charts and 3D models can float; a text box never goes in line. A floating object either moves with text (`anchoring: "move"`: the node sits just before its anchor paragraph, `dy` below its top; the paginator places it as it lays out the pages) or keeps its place on the page (`"fixed"`, the old behaviour and the default for older documents). Square, Tight and Through clear room with a float on the side with more room (`.object-wrap-room`, Word's "Largest only"); Top and Bottom reserves a band. .docx: `wp:anchor` is read into `DrawingLayout` (wrap, behindDoc, positionH/V with offset or align, relativeHeight) and opened as a floating picture before its paragraph; saving writes `wp:anchor` into the next paragraph, and an untouched picture keeps Word's own XML. Vertical positions from the page or margin open as `relative: "margin"` (below the top margin of the anchor paragraph's page). Shapes, charts and 3D models now save floating too (checked 2026-10-27: a floating native shape, a shape saved as a picture and a chart each write `wp:anchor`), and the Layout dialog has its Text Wrapping tab.

### 19.4 — Moving objects

- Drag a selected object to move it, according to its wrap: an inline object moves to the caret position under the pointer (between words); a floating one moves freely on the page.
- Live preview while dragging: the text reflows around the object's new place as it moves, for Square, Tight, Through and Top and Bottom.
- Arrow keys nudge a floating object; Esc cancels a drag.

  **Done.** `bindDrag` (`src/editor/objects.ts`): pictures, shapes, icons, charts and 3D models drag from anywhere on them after a 4px move (a click still just selects); a text box keeps its handle. A floating object is shown as fixed at the pointer's place each frame (transactions without history), so the paginator reflows the text around it live; the drop puts the attributes back and applies the move as one undo step, re-anchoring a Move with Text object to the paragraph it lands on. An in-line object shows a drop line and moves before or after the top-level block under the pointer. Esc or a cancelled pointer puts it back. Arrow keys move a selected floating object 8px, Ctrl+arrow 1px. The picture toolbar and the click menu listen in the capture phase so they see a drag start.

### 19.5 — 3D model formatting

- A Format 3D Model dialog of its own (from the 3D Model tab and the right-click menu): colour (tint or replace), lighting (presets plus intensity and direction), material (matte, glossy, metal) and texture.
- Textures: a built-in set (wood, metal, marble, fabric, paper, stone) generated in the app, and From File… for an image of the user's.
- Settings are saved with the model (and its snapshot for print and .docx).

  **Done.** `src/components/model-format-dialog.tsx` (3D Model tab: Format 3D Model, Lighting ▸ Lighting Options…; right-click: Format 3D Model…) with three tabs: Color and Material (Auto or a colour, tinting or replacing the model's colours; Matte, Standard, Glossy, Metal), Lighting (Studio, Bright, Soft, Dramatic, Warm, Cool; intensity, direction and height of the main light) and Texture (none, six textures drawn in the app in `src/editor/model-format.ts` that tile without seams, or From File…, scaled to at most 1024px; repeat). Changes show on the model as they are made; OK is one undo step, Cancel puts it back. The settings are attributes of the model node (`data-color`, `data-lighting`, …), applied to the built-in shapes and every part of a loaded glTF model; a soft room environment gives metal and glossy surfaces something to reflect. Snapshot updates no longer add undo steps. The flat picture models (figure, kind "model") are unchanged.

### 19.6 — Table of contents from heading styles

- Build the table from the document's heading styles: Heading 1–9, and paragraphs with an outline level, including custom styles based on headings; the hierarchy follows the level. Custom TOC options (Show levels, Use outline levels, Styles and their levels) as in Word.
- Detect an existing table of contents in an opened document: a TOC field (simple or complex), a content control (`docPartGallery` "Table of Contents"), a hyperlinked TOC, or paragraphs in TOC 1–9 styles. Update Table refreshes it in place. Test with the document in `screenshots/` and Word-made fixtures.

  **Done.** Headings for the table: heading nodes, paragraphs with an outline level, and paragraphs in a style based (through any chain) on Heading 1–9 (`tocLevelOf(node, styles)`). Opening a .docx now keeps outline levels (the paragraph's own `w:outlineLvl` or its style's) as `data-outline`, and saving writes the editor's outline level back. Besides TOC fields and Table of Contents content controls, `readLooseTocAt` (`src/document/docx/toc.ts`) finds a table of contents with no field: two or more paragraphs in a row that are each a link into the document (`w:anchor` or a `#…` target) or use the TOC 1–9 styles, with a title paragraph such as "Table of Contents" or "Contents" above becoming its title. Page numbers are split off after a tab or a final number; levels come from the TOC style, the heading the entry names, or the indent. A plain list of links needs `_Toc` targets or entries naming headings to count. `screenshots/1.docx` (a converter's output: link paragraphs like "1. Purpose 3") now opens as a table of contents, and Update Table rebuilds it from the Heading 1 paragraphs. Saved unchanged, the original paragraphs are written back.

### 19.7 — Options and defaults

- File > Options (Word Options): General (colour mode, ribbon layout), Save (AutoSave, recovery), Defaults (the default font and the styles saved for new documents, with Reset).
- The Font dialog's Set As Default asks Word's "This document only / All documents based on the Normal template" and changes the Normal style, saved as a default when chosen.
- The Paragraph dialog's preview shows its sample text in dark mode.

  **Done.** Set As Default in the Font and Paragraph dialogs asks Word's question (`src/components/set-default-dialog.tsx`) and changes the Normal style of this document, or of new documents too (saved with the default styles; the old separate font default is converted once). The Paragraph dialog starts from Normal's own spacing. The font boxes (ribbon, single line and mini toolbar) show the font and size of the paragraph's style, through the styles it is based on, where the text has none of its own. File > Options gains a Ribbon card (Classic / Single line) and a New documents card listing the default font, paragraph, saved styles and page setup, with Reset Styles and Reset Page Setup. The Paragraph preview is drawn on white paper in both colour modes.

### 19.8 — Close with Ctrl+W

- Ctrl+W (and File > Close) asks to save a changed document, then shows the File view with no document open.

  **Done.** `closeDocument` (`src/document/commands.ts`), used by Ctrl+W, Ctrl+F4, File > Close and Tell Me, asks to save a changed document and then leaves an empty blank in the editor behind the File view, which opens on Home in a no-document state (`closed` on `useBackstage`): the Back arrow and the commands on a document (Info to Close) are greyed, Esc does nothing, and only Ctrl+O works from the keyboard. New, a template, Open, a recent file or a recovered draft leaves it. A new blank document no longer counts as changed (its baseline was the template's HTML, not the editor's), so it does not ask to be saved when it is closed or replaced. In a browser tab Ctrl+W stays the browser's own. Not this item: a React "error during concurrent rendering" logged at startup, also before this phase.

### 19.9 — Several documents

- Open several documents at once, each in its own window (as Word does) in the desktop app; a new browser tab on the web. Opening into an untouched blank document reuses it.
- Per-window recovery drafts, View > Switch Windows, and closing the last window behaves as today.

  **Done.** `src/document/windows.ts`. A window takes the next document itself while it is untouched (no document open, or a new blank with nothing in it, `untouchedHere`); otherwise Open, Recent, a dropped file, File > New (a template) and Ctrl+N open a window of their own. Desktop: the `open_window` command (`src-tauri/src/lib.rs`) builds a window like the main one (`doc-N`, frameless, transparent, pinch to zoom) and passes the request in an initialization script; the capability covers `doc-*`. Browser: a new tab, opened inside the click so it is not blocked, with the request in the address; where the browser still blocks it, the document opens in this tab as before. A file or template read in one window is handed to the new one through IndexedDB. A file already open in another window brings that window forward. Windows list themselves in localStorage (name, path, unsaved, a heartbeat); View > Switch Windows lists them in the order they opened and brings one forward (a browser may not let a tab take the focus), and View > New Window opens a blank one. Ctrl+W with other windows open closes the window with its document (on the desktop, counted from the real windows); the last one shows the File view, as in 19.8. Recovery drafts were already per window (owner + heartbeat), so a draft is not offered while its window is open. The pinch zoom event now goes to its own window only. Checked in Chrome with three tabs; the desktop windows are built (`cargo check`) but not run here. Ctrl+N and Ctrl+W are under Keyboard Shortcuts.

## Phase 20 — Objects, charts and polish

Order: the small fixes first (20.1, 20.3, 20.4, 20.11, 20.12), then the object work (20.2, 20.5, 20.6, 20.7, 20.10), then 20.9 and 20.8.

### 20.1 — Template Builder preview scrolls

- While the AI writes, a long template grows the dialog past the bottom of the screen. The preview should stay inside the dialog and scroll, following the text as it arrives.
- Cause: the Template Builder (`src/components/template-builder.tsx`) uses the flush body (`.word-dialog-body.is-flush`), and its frame has no height limit (only `.word-dialog.is-plain` has `max-height`), so `flex-1 overflow-auto` on `.template-preview` never takes effect.
- Plan: give the builder's frame a fixed height, `min(720px, 100vh - 48px)`, as Word does for its large dialogs (a `className`/height prop on `DialogFrame`, not a global change). Keep `min-h-0` down the flex chain (body, grid, preview section) so only `.template-preview` scrolls, and the prompt column scrolls on its own on short screens. While writing, keep the preview scrolled to the end unless the user has scrolled up; it follows again once they are back at the bottom.
- Check: run a long prompt at 1400×900 and at a short 1280×640 window; the buttons stay visible and the dialog never passes the screen edge, in light and dark.

  **Done.** `DialogFrame` takes a `height`. The Template Builder is `min(720px, 100vh - 48px)` high, its columns are bounded grid rows (`minmax(0, 1fr)`), the prompt column scrolls on its own, and only the preview scrolls. While writing, the preview keeps to the end unless the user scrolls up (more than 24 px from the bottom); a new run follows again. Checked in Chrome at 1400×900 and 1280×640.

### 20.2 — Live resize of pictures and objects

- Dragging a resize handle resizes only the `<img>`. The selection frame and its handles stay at the old size, and the text reflows only after the mouse is released. In Word, the frame follows the pointer and the text wraps around the new size as it changes.
- Cause: `bindResize` (`src/editor/objects.ts`) and the figure resize (`src/editor/insert-blocks.ts`) set the media element's style directly and write `width`/`height` only on pointerup.
- Plan: one shared resize helper for pictures, shapes, icons, charts, 3D models and text boxes. On each pointer move, at most once per animation frame, dispatch `setNodeMarkup` with the new size and `addToHistory: false`; the node view updates its wrapper, so the frame and handles follow, and the paginator reflows the text and wrap room (Square, Tight, Through, Top and Bottom) live. On release, restore the original size without history, then apply the final size as one undo step (the 19.4 pattern). Esc or pointercancel restores the original size.
- Details:
  - Corner handles keep the aspect ratio; Shift on a side handle keeps it too, as in Word.
  - Show a size tip (e.g. "8.2 × 5.1 cm") beside the pointer.
  - Keep the minimum size (24 px) and the page's text width as the maximum for in-line objects.
  - The picture toolbar and Layout Options button hide while resizing and come back at the new place.
- Check: resize an in-line and a Square-wrapped picture, a shape and a chart in Chrome, and watch the text reflow during the drag. Undo takes the resize back in one step. Esc cancels it. The saved .docx keeps the new size.

  **Done.** `bindObjectResize` (`src/editor/object-resize.ts`) serves pictures and figures (shapes, icons, charts). Each animation frame writes the size without history, so the frame, its handles and the wrapped text follow the pointer; on release the original comes back and the final size goes in as one undo step, and Esc or pointercancel puts it back. Corners keep the ratio (whichever way the pointer moved further), Shift keeps it on a side, 24 px is the minimum and the text width the maximum in line. Dragging a floating object's left or top edge keeps its other edge in place (into the left margin, not off the page). A "8.5 × 4.2 cm" tip follows the pointer, the picture bar and Layout Options hide during the drag and the bar comes back at the new size. Also fixed: a picture turned from In Line to floating kept its in-line frame size, and Undo with an object selected could crash the editor (a stale position in the object menu). Text boxes and 3D models join in 20.7. Checked in Chrome: in-line and Square pictures, an in-line shape and a Square chart.

### 20.3 — Splash screen only at launch

- The splash screen shows each time a window loads, so every document opened in a new window (19.9) or a new tab shows it again. It should show only when the app starts.
- Plan: show the splash only in the first window of an app session.
  - Desktop: skip it in windows opened by `open_window` (their label is `doc-N`, or they carry `__INKSPIRE_OPEN__`).
  - Browser: skip it when the tab was opened with an open request (`#inkspire-open=`), or when another window is already on the open-windows list (`openWindows()` in `src/document/windows.ts`).
  - A skipped window starts with no splash and a plain workspace-coloured background until the workspace is ready, so it does not flash white.
- Details: `App.tsx` decides once, before the first render (`shouldShowSplash()`), so the splash never mounts in those windows. Reloading the main window during development still shows it.
- Check: start the app (splash shows), then press Ctrl+N and Ctrl+O with a document open, and open a recent file (no splash in the new windows/tabs). Close every window and start again (the splash shows).

  **Done.** `isLaunchWindow()` (`src/document/windows.ts`), read once in `App.tsx` before the first render: on the desktop only the `main` window shows the splash; in a browser not a tab opened with a request, nor one opened while another tab is open. Other windows start on the frame's workspace colour until the workspace is ready. Checked in Chrome: first tab shows it, a Ctrl+N tab never does, a fresh start after closing all shows it again.

### 20.4 — Table rows one line high

- A newly inserted table (Insert > Table, the grid or Insert Table…) has rows that look about three lines high. In Word, an empty row is one line of text high.
- Cause: the app's own tables (`.page-editor td, th` in `src/index.css`) have 0.4em padding above and below, and each cell's paragraph takes Normal's spacing: 9 pt after and 1.65 line spacing. Word's Table Grid style sets 0 pt after and single spacing inside a table, with cell margins of 0 above and below and 5.4 pt on the sides. Tables opened from Word already follow this (`table[data-word-table="1"]`).
- Plan:
  - In the app's own tables, a cell's paragraphs get 0 space before and after and single line spacing, unless the paragraph or its style sets its own. Low specificity (`:where`), so the Paragraph dialog and styles still win.
  - Cell padding becomes Word's: 0 above and below, 5.4 pt left and right.
  - Saving to .docx writes the same, so a reopened table is the same height. The Table Properties row height ("at least") keeps working.
  - Leave tables opened from .docx as they are.
- Check: insert a 3×3 table; an empty row is one line high, as in Word. Typing wraps within the cell. Rows grow with the text. Header row, banded rows and the table styles still look right. Save, reopen, and the height is unchanged.

  **Done.** Three causes, not two. (1) Cell padding 0.4em above and below; (2) cell paragraphs took Normal's 9 pt after and 1.65 spacing; (3) with the cursor in the table, the end-of-cell mark (¤, `::after`) came after an empty paragraph's line break and made every empty row two lines high. Tables made in the app now have Word's cell margins (0 / 5.4 pt) and their unstyled cell paragraphs no space and 1.2 line height (`:root:root`, so a changed Normal does not leak in; inline spacing and styled paragraphs still win); in an empty cell the mark is drawn before the break. Saving a table made in the app (no source table) writes Table Grid lines (single, 4, or the frame chosen: bottom only, none) and `spacing before=0 after=0 line=240` on unstyled cell paragraphs, so Word and the app reopen it with the same rows; before, such tables saved with no borders at all. Tables from .docx are unchanged. Checked in Chrome: an empty 3×3 row is 20 px against a 19 px line. Test: `src/document/docx/app-table.test.ts`.

### 20.5 — Rotate handle on the top-right corner, with live rotation

- When a picture or any other object is selected, the rotate handle should sit a little out from the top-right corner, on a short stem at 45° (up and to the right). Dragging it rotates the object, which turns live under the pointer, with the text reflowing as it turns, the same as for resizing (20.2).
- Now: `src/editor/object-rotate.ts` adds a round handle 28 px above the corner on a vertical stem (`.object-rotate` in `src/index.css`). Dragging it only sets a CSS `transform` on the object's element. The `rotate` attribute is written on release, so the selection frame, the resize handles and the text around the object update only after the drag. The handle can also be covered or cut off near the page edge or the header area, so it doesn't always take the click.
- Plan:
  - **Handle:** place it about 18 px out on the diagonal from the top-right corner, with a 45° stem joining it to the corner (a rotated `::before`), in every view. Probe with `elementFromPoint` that nothing covers it (see the office-style-ui layering rules). Keep it visible above the header/footer zones and inside the page scroller, so it is never cut off.
  - **Live rotation:** on each pointer move, at most once per animation frame, set `rotate` with `setNodeMarkup` and `addToHistory: false`. The frame, the resize handles and the handle itself turn with the object. The wrap room uses the rotated bounding box, so Square, Tight and Top and Bottom text reflows live. On release, restore the original without history and apply the final angle as one undo step (the 19.4 and 20.2 pattern). Esc or pointercancel puts it back.
  - **Steps:** 1° steps by default; Shift snaps to 15°, as in Word. The old 5°/Alt behaviour goes. Show the angle in a tip beside the pointer.
  - **Same for every object:** pictures, shapes, icons, charts, text boxes and 3D models (rotating the frame, not the model's camera) share one handler. Format > Rotate and the Size and Position angle field set the same attribute.
  - **.docx:** the angle round-trips (`a:xfrm rot`, in 60000ths of a degree).
- Check: select a picture in line and one with Square wrap. The handle sits on the diagonal and always takes the click. Dragging turns the picture live, with the frame following and the text reflowing. Shift snaps. Undo takes the turn back in one step. Esc cancels. Save and reopen keeps the angle.

  **Done.** The handle sits 18 px out on the diagonal from the top-right corner, on a 45° stem. `bindRotate` (`src/editor/object-rotate.ts`) writes `rotate` without history on each animation frame, so the frame, handles and handle turn with the object; on release the original comes back and the final angle goes in as one undo step; Esc or pointercancel puts it back. 1° steps, Shift snaps to 15°, and a tip shows the angle. The paginator gives text the room of the upright box around a turned object (`rotatedBounds`), and a turned picture in line keeps the lines above and below clear of its corners. While an object with handles is selected, the header/footer zones let clicks through, so handles near the top or bottom of the page always take them; the picture bar sits above the handle. Pictures save and open their angle as `a:xfrm rot`. Shared by pictures, shapes, icons, charts and text boxes; 3D models join in 20.7. Checked in Chrome: in-line and Square pictures (live, Shift, undo), a text box and a shape (live, Esc).

### 20.6 — Wrap Text and Position menus as in Word

- For a selected picture or other object, the Wrap Text and Position menus (Picture Format, Shape Format and the other object tabs, Layout > Arrange, the single line ribbon, the right-click menu and the Layout Options button) should look and work as they do in Word.
- Now:
  - Position is a plain text list. The object tabs show only the first six anchors, and the Layout tab shows a grid of text buttons. Nothing shows which one is current.
  - Wrap Text (`src/components/wrap-menu.tsx`) has Word's seven wraps with icons, plus Move with Text / Fix Position on Page. It lacks Edit Wrap Points, More Layout Options… and Set as Default Layout.
  - There is no Layout dialog, so the Size and Position dialog has no Text Wrapping tab (noted under 19.3).
- Plan:
  - **Position gallery**, as in Word:
    - "In Line with Text": one tile.
    - "With Text Wrapping": nine tiles, Top/Middle/Bottom by Left/Center/Right. Each is a small page picture with lines of text and the object placed there, drawn in the app's line icon style.
    - Then More Layout Options….
    - The current choice is highlighted. Hovering a tile previews the place live (no history), and Esc or leaving the menu puts the object back.
    - Choosing a tile makes the object Square-wrapped and fixed relative to the margin at that place, as Word does. All tabs share one component (`PositionMenu`), replacing the three copies.
  - **Wrap Text menu, completed:**
    - The seven wraps with Word's icons, with the current one checked.
    - Edit Wrap Points: disabled unless Tight or Through, and later the wrap polygon.
    - Move with Text and Fix Position on Page, checked.
    - Set as Default Layout: new pictures are inserted with this wrap. It is saved like the other defaults and shown in File > Options > New documents.
    - More Layout Options….
    - Hovering a wrap previews the reflow live.
  - **Ribbon buttons show the current state:** the Wrap Text and Position buttons draw the selected object's current wrap and position, as Word's do. The tooltips name them.
  - **Layout dialog (More Layout Options…):** Word's three tabs, in the app's dialog frame.
    - Position: horizontal and vertical, each by alignment, absolute position or relative position, relative to page, margin, column or paragraph. Plus Move object with text, Lock anchor and Allow overlap.
    - Text Wrapping: the wrap tiles, wrap text both sides / left only / right only / largest only, and the distances from text on all four sides.
    - Size: height and width (absolute or relative), rotation, scale with lock aspect ratio, and Reset.
    - Previews live; OK is one undo step. It also replaces the Size and Position launcher.
  - **.docx:** positionH/V align and offsets, `wrapText` sides, `distT/B/L/R` and `allowOverlap` round-trip. Most are read already (`DrawingLayout`); write them back the same way.
  - Text flows on the chosen side(s) and at the chosen distance (the paginator's wrap room), not only on the side with more room.
- Check: select a picture. The Position gallery highlights In Line, and hovering a tile moves the picture there live. Choosing Top Right puts it there with Square wrap. The Wrap Text menu checks the current wrap. More Layout Options… changes the distance from text and the side, and the text reflows. Undo takes each change back in one step. Save, reopen in the app (and in Word if available), and the layout is the same. Compare with Word's menus side by side, in light and dark.

  **Done.**
  - `PositionMenu` (`src/components/position-menu.tsx`) replaces the three copies: In Line, the nine places drawn as small pages (`PositionGlyph`), and More Layout Options…. The current place is highlighted. Hovering a tile shows the object there, and moving off or closing puts it back (`objectPreview`, `src/editor/object-preview.ts`, which inverts the preview's steps, so even commands that move the node preview cleanly). Choosing a place fixes the object on its page at that alignment; an in-line one becomes Square.
  - The Wrap Text menu previews each wrap on hover and adds Edit Wrap Points (disabled; the wrap follows the frame), More Layout Options… and Set as Default Layout. New pictures are then put in with that wrap; Options > New documents shows it and can reset it.
  - The Wrap Text and Position buttons on every tab (classic and single line) draw the selected object's wrap and place.
  - The Layout dialog (`src/components/layout-dialog.tsx`) has three tabs. Position: alignment or absolute, from the margin or page, below the margin or paragraph, plus Move object with text, Lock anchor and Allow overlap. Text Wrapping: the seven wraps, which sides, and the distances. Size: height and width, rotation, scale with lock aspect ratio, and the original size with Reset. It previews live; OK is one undo step and Cancel restores. It replaces the old Size and Position form, and the right-click menu and Layout Options' "See more…" open it.
  - New floating attributes: `wrapSide`, `distT/B/L/R`, `alignH/alignV`, `fromH`, `allowOverlap`, `lockAnchor`. The paginator uses the sides and distances. "Both sides" flows on the roomier side, because line boxes can't put text on both sides of one object.
  - .docx reads and writes `wrapText`, `dist*`, `allowOverlap`, `locked`, `wp:align` (written only while the object is still where its alignment puts it) and positionH from the page. Vertical alignment to the margin now places the picture properly (it was always at the top).
  - Also: Ctrl+Z and Ctrl+Y undo and redo from the ribbon and menus, not only in the text.
  - Checked in Chrome: highlight, hover preview and restore, Top Right, one-step undo, the menus' looks, and the dialog (Square, Right only, distance, width, Centered, OK, undo, Cancel).

### 20.7 — One object frame for every kind of object

- 3D models, charts, drawing canvases, SmartArt, icons and shapes should resize, rotate, move and wrap text exactly as pictures do, with the same selection frame and handles: eight resize handles, the rotate handle (20.5), the Layout Options button, dragging to move (19.4) and the Wrap Text and Position choices (19.3, 20.6).
- Now:
  - **Pictures** (`image`) and text boxes use the shared code in `src/editor/objects.ts`: frame, handles, `bindDrag`, wrap, anchoring and nudge.
  - **Shapes, icons, charts and flat models** (`figure` in `src/editor/insert-blocks.ts`) have their own copy of resize and rotate, and float (19.3), but save in line in .docx.
  - **Interactive 3D models** (`threeDModel`, `src/editor/three-d-model.ts`) have only a width: no wrap, position, rotate handle, resize handles or drag. A drag inside them turns the camera.
  - **Drawing canvases** (`drawingCanvas`, `src/editor/drawing.ts`) and **SmartArt** (`smartArt`, `src/editor/smartart.ts`) are full-width blocks with none of these.
- Plan:
  1. **Shared layout attributes:** one helper that adds the same attributes to every object node: width, height, rotate, wrap, x, y, z, page, anchoring, dy, relative, distances from text and lock aspect ratio. One parse/render for them (`data-*`). Old documents open unchanged: no attributes means in line, at the old size.
  2. **Shared object frame:** one node-view wrapper (`objectFrame(dom, view, getPos, options)`) that adds the selection border, the eight handles (corners keep the aspect ratio), the rotate handle, the Layout Options button and the drag-to-move binding. It also handles live resize and rotate previews (20.2, 20.5) and nudging. `image`, `textBox`, `figure`, `threeDModel`, `drawingCanvas` and `smartArt` all use it. The copies in `insert-blocks.ts` and `object-rotate.ts` go.
  3. **Moving objects that are used inside**, where a drag inside the object belongs to it:
     - 3D models: a drag inside orbits the camera, as in Word.
     - Drawing canvases: a drag inside draws with the pen.
     - SmartArt: a click inside edits its text.

     Move these by their border, or from anywhere while Alt is held. The pointer shows the move cursor over the border. A click selects the object first; double-click (or the tab's command) goes inside.

  4. **Resizing each kind:**
     - 3D model: the renderer and camera aspect follow the new size live (`renderer.setSize`), and the snapshot is retaken on release.
     - Chart: redrawn at the new size, not stretched.
     - Drawing canvas: the strokes scale with the frame (viewBox). Ctrl+drag grows the drawing area instead.
     - SmartArt: the layout is recomputed for the new box, and its text reflows.
     - Icons and shapes: scale. Shift keeps a shape's proportions.
  5. **Menus:** Wrap Text, Position, Rotate, Align, Bring Forward / Send Backward, Group and Selection Pane work on all of them, from every ribbon tab, the right-click menu and the Layout Options button. Each object's own tab (3D Model, Chart Design, Drawing, SmartArt Design, Graphics Format, Shape Format) gets the Arrange group as in Word.
  6. **.docx:** floating shapes, charts, SmartArt, 3D models (as their picture with the model kept) and drawing canvases are written as `wp:anchor` with their wrap, position and rotation, like pictures. Unchanged ones from Word keep Word's own XML.
- Check, for each of the six kinds:
  - Select it. The frame, handles, rotate handle and Layout Options button look exactly like a picture's.
  - Resize, rotate and move it live, and nudge it with the arrow keys.
  - Set every wrap, and pick positions from the gallery.
  - Undo each step once.
  - Use the object itself: orbit the model, draw on the canvas, type in the SmartArt.
  - Save, reopen, and the layout is the same.
- **Done.** `objectBox` (`src/editor/object-frame.ts`) gives 3D models, drawing canvases and SmartArt the picture's frame: eight handles, the rotate handle, live resize and rotate, drag to move, every wrap and position, with `objectLayoutAttributes` for their size, turn and place (old documents open in line, as before). An object used inside moves by its edges or with Alt held: a drag inside orbits the model, draws on the canvas (with the pen; the Select tool moves) or types in SmartArt. Text boxes gained height and resize handles. Figures (shapes, icons, charts) already shared the resize and rotate code. The 3D Model tab's Arrange group works, with Position. In .docx, figures, 3D models, SmartArt, drawing canvases and text boxes, which Word has no part for and were dropped, are saved as their picture with their wrap, place and turn, carrying the object itself in the drawing's `docPr` extension list (`src/document/object-pictures.ts`); on open they become the objects again, at the size and place the file gives if Word changed them. Checked in Chrome: each kind selected, set to Square, resized live and moved; and a chart, SmartArt, canvas and text box saved to .docx and opened again as themselves.

### 20.8 — Charts as in Word (improvement)

- Chart options and formatting should match Word: the same chart types, the same Chart Design and Format tabs, the three buttons beside a selected chart, and the Format pane for every part of the chart.
- Now:
  - A chart is a `figure` (kind "chart") drawn as SVG from a small data sheet (`src/editor/chart-sheet.ts`): series in columns, categories in rows.
  - Six families: column, line, pie/doughnut, bar, area and scatter, with a few variants each.
  - The Chart Design tab has Add Chart Element, Quick Layout, Chart Styles, Change Colors, Switch Row/Column, Change Chart Type, and Select / Edit / Refresh Data. Most are simplified: a colour accent, a handful of options.
  - There is no Format tab for charts, no on-chart buttons and no Format pane. Charts in opened Word documents show as a "[Chart 1]" stand-in (18.1).
- Plan:
  1. **Chart model.** Replace the sheet-plus-kind attributes with a structured chart spec (JSON on the node):
     - Data: categories, series (name, values, own chart type for combo charts, secondary axis), and the sheet they come from.
     - Elements: chart title, axis titles, axes, gridlines (major/minor), legend (position), data labels (position, content), data table, error bars, trendlines, up/down bars, drop and high-low lines.
     - Style and colour palette, and per-element formatting: fill, line, effects, font and number format.

     Old charts convert on open. One SVG renderer draws from the spec, every element is hit-testable, and it uses the theme's colours and fonts.

  2. **Chart types, Word's set**, in the Insert Chart and Change Chart Type dialog. It has a list on the left, variant tiles with previews drawn from the chart's own data, and Recent and Templates:
     - Column, Line, Pie, Bar, Area, X Y (Scatter), Map (later) and Stock.
     - Surface (as a 2D contour), Radar, Treemap, Sunburst, Histogram, Box & Whisker, Waterfall, Funnel and Combo.
     - 3D variants drawn flat with depth, as a simpler version.
  3. **Chart Design tab:**
     - Add Chart Element: Word's full menu, each with its submenu of placements and "More … Options" opening the Format pane.
     - Quick Layout: Word's eleven layouts. Change Colors: Colorful and Monochromatic palettes from the theme.
     - Chart Styles: a gallery of about 14 styles, previewed on hover.
     - Switch Row/Column, Select Data (the Select Data Source dialog, with series and categories to add, edit, remove, reorder and hide), Edit Data (the sheet) and Refresh.
     - Change Chart Type, and Save as Template (kept locally, offered under Templates). **Done 2026-10-27** (right-click → Save as Template…; Templates in the dialog; no .crtx).
  4. **Format tab:**
     - Current Selection: a dropdown of the chart's parts (Chart Area, Plot Area, Title, each axis, each series, Legend, …), plus Format Selection and Reset to Match Style.
     - Insert Shapes, Shape Styles (fill, outline, effects), WordArt Styles for chart text, Arrange (shared with 20.7) and Size.
  5. **Beside the selected chart**, as in Word:
     - Chart Elements (+): check boxes with flyouts.
     - Chart Styles (brush): Style and Color tabs.
     - Chart Filters (funnel): Values and Names, to show or hide series and categories, with Apply.
     - Plus the Layout Options button (20.6).
  6. **Format pane** (a task pane on the right, like the Navigation pane) for whatever part is selected. Clicking a part on the chart selects it, and double-click opens the pane. Word's sections:
     - Fill & Line.
     - Effects (shadow, glow, soft edges, 3-D format).
     - Size & Properties.
     - Options for the part: axis bounds, units, crosses at, log scale, reverse order, tick marks and labels, number format; series overlap and gap width, smooth lines, markers, explosion and first-slice angle; data label contents (value, category, series name, percentage, from cells), separator and position; legend position and overlap; trendline type (linear, exponential, logarithmic, polynomial, power, moving average), forecast, equation and R².
     - Changes preview live; each change is one undo step.
  7. **Right-click on a chart part:** Delete, Reset to Match Style, Font…, Change Chart Type…, Select Data…, Edit Data, Format <part>…, Add Data Labels and Add Trendline, as Word's menu.
  8. **.docx:** save charts as real Word charts: a `c:chartSpace` part with the series, cached values, elements and formatting, plus the embedded workbook with the data, so Word opens and edits them. Open Word's charts into the same spec and draw them; this replaces the "[Chart 1]" stand-in from 18.1. Unchanged charts keep Word's own parts.
- Order: 1 and 8 first (model, renderer, round trip), then 3, 5 and 6, then 2, 4 and 7.
- Check:
  - Build each chart type and compare it with Word's for the same data, side by side.
  - Toggle every chart element, apply each Quick Layout, style and colour set, filter series, edit and select data, and format an axis and a series in the pane.
  - Undo works throughout.
  - Save, open in Word if available, edit there, reopen, and the chart matches in light and dark.
- **Done.**
  - Model and drawing (1): a chart is a spec kept on its node (`src/editor/chart-spec.ts`): categories, series (name, values, own type for combos, secondary axis, hidden, trendline), title, axis titles, axes, gridlines (major, minor, vertical), legend, data labels (position and contents), data table, style (Word's 14), colour palette (Colorful 1–4, Monochromatic 1–7 from the theme accents), value axis options (bounds, unit, reverse, log, number format), gap width, overlap, first slice angle, hole size, explosion and per-part formatting (fill, line, text colour, size, bold). Charts from before convert on open. One SVG renderer draws it at the chart's own size with Word's fonts and colours, and names every part (`data-chart-part`) so it can be clicked. New charts start with Word's sample data at 6 × 3.5 in.
  - Types (2): Column, Line (6 variants), Pie and Doughnut, Bar, Area, X Y (Scatter, 5 variants), Radar (3) and Combo (3) in the Insert Chart / Change Chart Type dialog, with a type list, variant tiles and a large preview drawn from the chart's own data, and Recent.
  - Chart Design tab (3): Add Chart Element (Word's menu with each element's placements, previewed on hover, and More … Options opening the pane), Quick Layout (11 layouts drawn from the chart), Change Colors, the Chart Styles gallery (scrolled, with More), Switch Row/Column, Select Data (series to add, rename, remove, reorder and hide; categories to rename and hide; Switch Row/Column), Edit Data (the sheet, now keeping each series' options) and Refresh, and Change Chart Type. In both ribbon layouts.
  - Format tab (4): Current Selection (the parts list, Format Selection, Reset to Match Style), Shape Fill and Outline and Text Fill for the picked part (previewed on hover), Arrange and Size.
  - Beside the chart (5): Chart Elements (+, check boxes with flyouts), Chart Styles (brush: Style and Color tabs) and Chart Filters (funnel: series and categories, previewed on hover, Apply, Select Data…), under Layout Options.
  - Parts and pane (6, 7): the first click on a chart picks the chart, the next picks the part under the pointer (outlined); a right-click picks it for the menu, a double-click opens the Format pane on it. The pane has the part list, Fill & Line, Text (for text parts), Size & Properties and the part's options: title text, axis bounds, unit, log scale, reverse order and number format, category order, legend position, data label contents and position, series overlap, gap width, secondary axis, smoothing, markers, trendline type, first slice angle, explosion and hole size. Each change shows at once and is one undo step. The right-click menu has Delete (for the part), Reset to Match Style, Change Chart Type…, Select Data…, Edit Data…, Add/Delete Data Labels and Add Trendline on a series, and Format <part>….
  - .docx (8): a chart saves as a real Word chart: a `c:chartSpace` part with the series, cached values, elements, colours and formatting, and an embedded workbook with the sheet (`src/document/docx/chart-xml.ts`). Word's charts open into the same spec and are drawn and editable, replacing the "[Chart 1]" stand-in. A chart opened from Word and not changed keeps Word's own parts; a chart this app saved keeps its own options (style, palette) while its data in the file is unchanged.
  - Not done: Map, Stock, Surface, Treemap, Sunburst, Histogram, Box & Whisker, Waterfall and Funnel, and 3-D variants; Save as Template and Templates; the pane's Effects section and per-point formatting beyond pie slices; Insert Shapes and WordArt styles beyond Text Fill on the Format tab; picking a single data point; charts in headers and footers and `chartex` charts still show the stand-in. A chart from before 20.8 that had no size of its own now shows at Word's size. Done later: error bars (standard error, percentage, standard deviation, fixed), drop lines, high-low lines and up/down bars are drawn, offered in Add Chart Element and the Chart Elements pane, and saved as `c:errBars`/`c:dropLines`/`c:hiLowLines`/`c:upDownBars` and read back (not checked in Chrome or Word; More Options panes for them not done; error bars are one setting for all series, y direction only).
  - Checked in Chrome: inserting, the three buttons and their panels, Add Chart Element with hover preview, Change Chart Type and Undo, picking the title and a series and the pane for each, the Format tab, six charts of different types saved and reopened with identical specs, a Word chart opened, drawn and saved unchanged with its part kept. The saved file opens in LibreOffice with all six charts drawn.

### 20.9 — Shape Format tab as in Word

- The Shape Format tab, shown when a shape, text box or WordArt is selected, should match Word's: the same groups in the same order, the same galleries and split buttons, the same icons and sizes, and the same menus.
- Now (`ShapeFormatTab` in `src/components/ribbon/context-tabs.tsx`):
  - **Insert Shapes:** the right groups, but Shape Styles is two rows of fill and outline swatches with no style gallery, and no Shape Fill / Shape Outline split buttons.
  - **Arrange and Size:** every command is a small button. Rotate turns by 15° (no menu), and Size has no launcher.
  - **Text:** has no Text Direction.
  - **WordArt Styles:** has no Text Fill / Text Outline / Text Effects.
- Plan (Word's Shape Format, left to right):
  1. **Insert Shapes:**
     - The shapes gallery: a scrolling grid with a More arrow opening Word's categorised list (Recently Used, Lines, Rectangles, Basic Shapes, Block Arrows, Equation Shapes, Flowchart, Stars and Banners, Callouts).
     - Edit Shape: Change Shape ▸ (the same gallery), Edit Points, Reroute Connectors.
     - Draw Text Box.
  2. **Shape Styles:**
     - The style gallery: Theme Styles (7 colours × 6 intensities, from Colored Outline to Intense Effect) and Presets, previewed live on hover, with the More arrow.
     - Shape Fill split: theme colours, standard colours, No Fill, More Fill Colors…, Picture…, Gradient ▸, Texture ▸.
     - Shape Outline split: colours, No Outline, Weight ▸, Dashes ▸, Arrows ▸.
     - Shape Effects ▸: Preset, Shadow, Reflection, Glow, Soft Edges, Bevel and 3-D Rotation, each with a gallery and Options….
     - The launcher opens the Format Shape pane.
  3. **WordArt Styles:** the WordArt quick styles gallery, Text Fill, Text Outline and Text Effects (Shadow, Reflection, Glow, Bevel, 3-D Rotation, Transform). Live preview; the launcher opens the pane's Text Options.
  4. **Text:** Text Direction ▸ (Horizontal, Rotate 90°/270°, Stacked), Align Text ▸ (Top, Middle, Bottom) and Create Link.
  5. **Accessibility:** Alt Text, as a large button.
  6. **Arrange:** the shared group from 20.6 and 20.7.
     - Position gallery and Wrap Text menu.
     - Bring Forward and Send Backward splits (Bring to Front, Bring in Front of Text, …), Selection Pane.
     - Align ▸: Left … Bottom, Distribute, Align to Page/Margin/Selected Objects, View Gridlines, Grid Settings….
     - Group ▸: Group, Regroup, Ungroup.
     - Rotate ▸: Right 90°, Left 90°, Flip Vertical, Flip Horizontal, More Rotation Options….
  7. **Size:** Height and Width spinners in cm; the launcher opens Layout > Size (20.6).
- **Format Shape pane:** a task pane on the right, shared with charts (20.8) and pictures. Shape Options: Fill & Line, Effects, and Layout & Properties (text box margins, wrap text in shape, resize shape to fit text, autofit). Text Options: Text Fill & Outline, Text Effects, Text Box. Live, one undo step per change.
- **Icons and sizes** follow the office-style-ui rules: large buttons only where Word has them (Alt Text, Position, Wrap Text in the wide layout), and groups collapse as the window narrows the way Word's do. The single line ribbon gets the same commands in its row and More options.
- **Saved in .docx:** the style, fill (solid, gradient, picture, texture), outline (weight, dash, arrows), effects, text direction and text box settings, as `wps` shape properties. Unchanged shapes from Word keep their XML.
- Check: compare against Word's Shape Format at the same window widths (full, medium, narrow), group by group. Each gallery previews on hover and applies with one undo step. A styled shape keeps its look after save and reopen, in light and dark.
- **Done.** A new `ShapeFormatTab` (`src/components/ribbon/shape-format-tab.tsx`) has Word's groups in order:
  - **Insert Shapes:** a three-row gallery with the arrows and More (Word's categories, Recently Used first), Edit Shape (Change Shape, Edit Points, Convert to Freeform; Reroute Connectors shown disabled) and Draw Text Box.
  - **Shape Styles:** the Theme Styles gallery (7 colours × 6 intensities) and Presets, and Shape Fill and Shape Outline split buttons. Fill has theme and standard colours, No Fill, More Fill Colors…, Picture…, and Gradient ▸ and Texture ▸ flyouts. Outline has colours, No Outline, and Weight ▸, Dashes ▸ and Arrows ▸ (arrows for lines). Shape Effects has Preset, Shadow, Reflection, Glow, Soft Edges, Bevel and 3-D Rotation galleries. The launcher opens the pane.
  - **WordArt Styles:** quick styles, and Text Fill, Text Outline and Text Effects for a text box's text.
  - **Text:** Text Direction ▸ and Align Text ▸ (Top, Middle, Bottom).
  - **Accessibility:** a large Alt Text button.
  - **Arrange:** large Position and Wrap Text; Bring Forward and Send Backward splits (also In Front of / Behind Text); Selection Pane; Align ▸ (six sides, Distribute, Align to Page/Margin, View Gridlines); Group ▸; and Rotate ▸ (with Flip Vertical/Horizontal and More Rotation Options…). These come from `src/components/arrange-menus.tsx`, which the Layout tab now uses too.
  - **Size:** cm spinners; the launcher opens Layout > Size.
  - **Previews:** every gallery, swatch and list choice previews on the shape while hovered, and a click is one undo step.
  - **Single line ribbon:** the same commands in the row and More.
- **Rendering and storage.** Shapes and text boxes share the attributes in `src/editor/shape-style.ts`. Fill, outline, arrows, flips, bevel and soft edges are drawn inside the SVG; shadow, glow, reflection and 3-D rotation are CSS. Text boxes get the same fill, outline and effects, plus text fill/outline/effect, direction, vertical alignment (measured, since the content is inline) and margins.
- **Format Shape pane** (`src/components/format-shape-pane.tsx`): Shape Options (Fill & Line, Effects, Layout & Properties with the text box settings and Alt Text) and Text Options. Each change is live and one undo step.
- **.docx:** styled shapes and text boxes keep their look through save and reopen via 20.7's saved object.
- **Done (native shapes, 22.11 follow-up):** a shape made or formatted in the app is now written as Word's own `wps:wsp` (preset geometry, solid fill, outline, size, rotation, flips, wrap and place) when Word draws it the same way: a preset Word has, a plain hex fill or none, a plain outline. Outline dashes (`a:prstDash`) and two-stop gradients (`a:gradFill`, linear or radial) are written too; picture or texture fills, arrows, shadows, glow, reflection, bevel and 3-D rotation still go as a picture. It reopens in the app as the same shape (`docx/shape-write.ts`, tests in `shape-write.test.ts`). The reader reads dashes and gradients back. **Done 2026-10-27:** any gradient Word wrote opens as it is (every stop, its angle, theme colours, and the theme gradient a shape style refers to), is drawn on shapes and text boxes, and is saved back unchanged; Word dashes outside the Dash Type list open as the nearest one. Not verified in Word itself: the drawing has no `mc:AlternateContent` VML fallback, which Word 2010 and later do not need but older readers would. **Not done:** shape text, shapes beyond the 17 presets, dash and arrow writing, effects as DrawingML (`a:effectLst`), gradients as `a:gradFill` (each is a separate mapping). Also not done: Reroute Connectors, Create Link (linked text boxes), and Word's collapsing of groups at narrow widths (the classic tab scrolls instead).
- **Checked in Chrome:** style preview and apply, fill gradient flyout, glow, dashes and Undo, flip, Align Center, the pane, and a text box with middle alignment, gradient, dashed outline and red shadowed text. A styled star and text box survive a .docx round trip with every style attribute.

### 20.10 — Floating bars on selected objects

- Selecting an object (picture, 3D model, icon, shape, chart, SmartArt, drawing canvas or text box) shows a small floating bar, as Word's mini toolbar does. Each bar should be properly designed: buttons on one grid, the same size and spacing, aligned icons and labels, and placed tidily beside the object.
- Now there are three unrelated designs:
  - Pictures: `PictureBar` (`src/components/picture-bar.tsx`, `.picture-bar`) with Crop, Rotate, Picture Border, Alt Text and wrap glyphs.
  - Text boxes: `ObjectEditor` (`src/components/object-editor.tsx`), a panel under the box with its own controls.
  - 3D models: a text "⟳" button in the middle of the model (`.three-d-orbit`).
  - Icons, shapes, charts, SmartArt and canvases have none.
  - Sizes, borders, separators and placement differ from bar to bar, and from the Layout Options button.
- Plan:
  1. **One component:** `ObjectBar` (`src/components/object-bar.tsx`), portalled like the picture bar.
     - It takes a list of commands per object kind and replaces `PictureBar` and the text box panel.
     - It shares the Layout Options button's look and tokens: `--app-*` colours in light and dark, the 6 px radius, the menu shadow, and the 120 ms fade.
  2. **Layout, as Word's mini toolbar:**
     - One row of 32 × 44 px buttons, each a 20 px line icon over an 11 px label (Style, Crop, Fill, Outline, …), centred on a 4 px grid. Split buttons have their chevron under the label.
     - Thin separators between groups, and 4 px padding all round.
     - Labels never wrap or overflow (`width: min-content`, at least 44 px, as in 19.1), and each button has a tooltip with its shortcut.
  3. **Commands per kind**, following Word:
     - Picture: Style ▸ (picture styles gallery), Crop, Wrap Text ▸, Rotate ▸, Alt Text.
     - Shape: Style ▸, Fill ▸, Outline ▸, Wrap Text ▸, Alt Text.
     - Icon: Style ▸ (graphics styles), Fill ▸, Outline ▸, Change Icon, Wrap Text ▸.
     - 3D model: 3D Model Views ▸, Reset ▸, Format 3D Model…, Wrap Text ▸, Alt Text.
     - Chart: Chart Elements ▸, Chart Styles ▸, Chart Filters ▸, Edit Data (with 20.8's on-chart buttons).
     - SmartArt: Add Shape ▸, Change Colors ▸, Styles ▸, Layouts ▸.
     - Drawing canvas: Pen ▸, Highlighter ▸, Eraser, Color ▸, Thickness ▸.
     - Text box: Style ▸, Fill ▸, Outline ▸, Align Text ▸, Wrap Text ▸.

     The menus are the ribbon's own (shared components), so the bar and the ribbon never disagree. The current state is shown, e.g. the wrap icon.

  4. **Placement:**
     - Centred above the object, 8 px clear of its frame and rotate handle.
     - Below it when there is no room above; inside the visible page area, never under the ribbon or the rulers.
     - It follows the object while scrolling, zooming and reflowing.
     - It is hidden while the object is dragged, resized or rotated (20.2, 20.5, 20.7), and fades back at the new place.
     - It never covers the Layout Options button.
     - Esc dismisses it until the object is selected again, and right-click shows it with the context menu as in Word.
  5. **3D model's own control:** Word's 3D control, a circular-arrows SVG icon in the model's centre on a soft round plate. It appears on hover and selection and turns the model. It replaces the "⟳" character and is styled with the same tokens.
  6. **Keyboard and accessibility:** `role="toolbar"` with roving tab index and arrow keys. Alt+F10 moves focus to the bar, and Esc returns to the object. Each button has an aria-label.
- Check:
  - For each kind, select it and screenshot the bar at 100% and 200% zoom, in light and dark.
  - Buttons line up on the grid, labels are centred and never clipped, and separators are even.
  - Compare with Word's mini toolbars.
  - The bar moves out of the way while dragging and resizing, and never covers the Layout Options button or the rotate handle.
  - Each command matches its ribbon counterpart.
- **Done.** `ObjectBar` (`src/components/object-bar.tsx`) replaces the picture bar and the text box panel for every kind: one row of 44 px icon-over-label buttons (20 px icons, 11 px labels, chevron under the label of a menu button) in the Layout Options look (`--app-*` tokens, 6 px radius, menu shadow, 120 ms fade), with separators between groups and a tooltip on each. Commands per kind follow Word: Picture (Style, Crop, Wrap Text, Rotate, Alt Text), Shape (Style, Fill, Outline, Wrap Text, Rotate, Alt Text), Icon (Style, Fill, Outline, Change Icon, Wrap Text), 3D model (Views, Reset, Format, Wrap Text, Alt Text), Chart (Elements, Styles, Edit Data, Wrap Text), SmartArt (Add Shape, Colors, Layouts, Wrap Text), Drawing canvas (Select, Pen, Highlighter, Color, Thickness, Wrap Text) and Text box (Style, Fill, Outline, Align Text, Wrap Text). Its menus come from `src/components/object-menus.tsx`, which the ribbon's Picture, Shape and Chart tabs now use too. It sits centred above the object clear of the rotate handle (below when there is no room), never over the Layout Options button, follows scrolling, zoom and reflow, hides during a drag, resize, turn or stroke and comes back at the new place. Esc puts it away until the object is clicked or right-clicked again; Alt+F10 moves into it (`role="toolbar"`, roving tab index, arrows, Home/End) and Esc returns to the object. The 3D model's control is now circling arrows on a round plate, shown on hover and selection. Not done: SmartArt Styles and Chart Filters (no such styles yet; 20.8), and a drawing Eraser (the canvas has no eraser tool). Checked in Chrome: every kind's bar, a menu opened from the keyboard, hiding while dragging, Esc and scrolling.

### 20.11 — Contextual tabs in coloured text, not coloured blocks

- The tabs that appear for a selected object (Table Design and Layout, Picture Format, Shape Format, Chart Design, 3D Model, Draw, Header & Footer) should look like the other tabs, with only their label in a different colour, as in Word. No filled background. The colour follows the app's theme colour and works in both dark and light mode.
- Now (`src/components/ribbon/ribbon.tsx`):
  - `CONTEXT_TAB` gives each tab its own fixed hex colour (green, purple, orange, teal, …).
  - `contextTabStyle` paints an inactive contextual tab as a solid block in that colour with white text. The active one switches to coloured text with an underline.
  - The colours ignore the chosen theme. Some are too dark to read on the dark ribbon.
- Plan:
  1. **One token:** `--app-context-tab`, set by `themeAccentVars` (`src/document/theme.ts`) from the theme's primary colour.
     - Light mode: the primary colour, darkened just enough to reach 4.5:1 contrast on the ribbon background.
     - Dark mode: a lighter tint (`color-mix` with white) that reaches 4.5:1 on the dark ribbon.
     - Gradient and multicolour themes use their first stop.
     - A hover variant goes with it.
  2. **The tab's look:** a contextual tab is drawn exactly like a normal tab: transparent background, same padding, font and height. Only the label is in `--app-context-tab`, at semibold weight as in Word.
     - When active: the same colour, with the usual underline in that colour (`--ribbon-underline`).
     - On hover: the normal tab hover background, with the coloured label kept.
     - Remove the per-tab hex tones and `contextTabStyle`'s filled branch. Every contextual tab uses the one token, as Word 365 does.
  3. **Everywhere it applies:** the classic ribbon, the single line ribbon's tab row, the overflow menu that lists tabs when the window is narrow, and the collapsed ribbon. The contextual tabs keep their place after the fixed tabs, appear without a jump (120 ms fade, off with reduced motion), and the ribbon does not change height.
  4. **Tests:** a unit test that the token meets 4.5:1 contrast for every theme in `THEME_OPTIONS`, in both modes.
- Check: select a table, a picture, a shape, a chart, a 3D model, a drawing canvas and the header. The new tabs show only coloured labels, with the active one underlined. Switch through every Office Theme colour and dark/light mode: the colour follows, and the label stays readable. Compare with Word.

  **Done.** `contextTabColor()` (`src/document/theme.ts`) mixes the theme's colour (a gradient's first stop) toward black in light mode or white in dark mode, in 5% steps, until it reaches 4.5:1 on the tab row (#ebebeb / #1e1e1e); `themeAccentVars` sets it as `--app-context-tab`. Every contextual tab (Table Design and Layout, Picture Format, Shape Format, Chart Design and Format, 3D Model, Draw, Header & Footer) has the `ribbon-context-tab` class: transparent like the other tabs, semibold label and underline in that colour. The fixed per-tab hex tones and the filled block style are gone. Both ribbon layouts share the tab row. Test: `src/document/theme.test.ts` (every theme, both modes). Checked in Chrome in light and dark.

### 20.12 — File name in the middle of the title bar, search on the right

- No file name is visible anywhere in the window, so you can't tell which document is open, especially now that each document has its own window (19.9). The document's name should be in the middle of the title bar and take priority over everything else there. The search box moves to the right side.
- Now (`src/components/title-bar.tsx`):
  - Left: AutoSave and the Quick Access Toolbar. Middle (flex-1): `TellMeSearch`. Right: Share, Account and the window buttons.
  - `documentTitle()` ("Report.docx* - Word") is set only as the OS window title (`setTitle`), which the frameless window never shows.
- Plan:
  1. **Three columns:** `grid-template-columns: 1fr auto 1fr`, so the name sits at the true centre of the window, not of the space left over.
     - Left column: Mac controls, AutoSave and the Quick Access Toolbar.
     - Centre: the document name.
     - Right column: search, Share, Account and the window buttons.
     - The drag region stays `deep`, so the empty space around the name still drags and double-click maximises (18.6).
  2. **Document name**, as Word shows it:
     - The name without the extension (Document1, Report), and "- Compatibility Mode" for old formats if it applies.
     - A save state after a separator: "• Saved", "• Saving…", "• Unsaved", or "• Saved to this PC" after a save, from `saveStateLabel`.
     - 13 px, medium weight, white on the title fill, in theme tokens for every theme and gradient, light and dark.
     - The full path is in the tooltip.
     - It is a button with a chevron. Its flyout shows:
       - the file name, editable to rename (Save As to the new name in the same folder, or just the name for an unsaved document);
       - the location, with Open file location on the desktop;
       - Version History (File > History) and AutoSave state.
     - The name updates at once on Save As, Rename and opening, and has `aria-live` for screen readers.
  3. **Search on the right:**
     - A compact box (about 220 px) before Share, with the same Alt+Q shortcut, placeholder and options button.
     - On focus it widens leftwards (to about 360 px) over empty title space, never over the name, and its results drop down right-aligned.
  4. **Priority when narrow:** the name is the last thing to shrink. As the window narrows:
     1. The Account name collapses to its avatar, and Share to its icon.
     2. The search box becomes a magnifier button that opens the box as a dropdown.
     3. The Quick Access Toolbar moves extra buttons to its overflow ▾.
     4. Only then does the name truncate with an ellipsis (at least ~120 px always shown). The save state is dropped before the name is cut.

     Checked at 720 px, the window's minimum width.

  5. **OS title kept:** `setTitle` still sets "Name - Inkspire" for the taskbar and Alt+Tab. In a browser, `document.title` is the same, and the tab shows it too. Switch Windows (19.9) uses the same name.
- Check:
  - Open a saved file, a new blank and an unsaved edit: the name and state show in the centre and change as you type and save.
  - Rename from the flyout.
  - Resize from full width down to 720 px: the name stays readable while everything else steps down.
  - Alt+Q focuses the search on the right.
  - Dragging and double-clicking the empty title area still work.
  - Every theme in light and dark. Compare with Word's title bar.

  **Done.** The title bar is a grid, `minmax(0,1fr) fit-content(46%) minmax(0,1fr)`, so `DocumentName` (`src/components/document-name.tsx`) sits at the window's true centre: the name without its extension, then "• Unsaved", "• Saving…", "• Saved" ("Saved to this PC" on the desktop), nothing for an untouched new document; the full path is its tooltip. Its flyout: File Name (rename; on the desktop the new `rename_document` command renames the file in its folder, refusing another folder, a changed type or an existing file, and the Recent list follows; with no file yet it renames the document, which Save As then offers), Location with Copy path, Version History and the AutoSave state. Search, Share, Account and the window buttons are on the right. Container queries on the bar: below 1080 px the account name goes, below 960 px Share's label, below 860 px the AutoSave words and the search becomes a magnifier that opens over the bar (Alt+Q too); the name is truncated only after that. The bar is above the ribbon (z-index 45) so the flyout opens over it. The OS and tab title stay "Name - Word" (Phase 11). Checked in Chrome at 1500, 1100, 900 and 720 px: the name is centred to the pixel at every width, and nothing overlaps it. "Open file location" is left out (no permission to open folders yet).

## Phase 21 — UI fixes, Word parity, cloud and AI

Part 1 is implementation work (bugs and features). Part 2 is discovery: analyse the codebase and write a short technical proposal for each item before any production code. Before complex UI changes (ribbons, dialogs), read the theme provider, the dialog components and the state stores, and reuse them so everything stays consistent. Several items extend something that already exists (the mini toolbar, the Picture Format and Table tabs, the title bar search from 20.12, the Save As places from Phase 11): start from that code, don't build a second version.

### Part 1 — Implementation

#### 21.1 — Mini toolbar on selected text

- Match Word's mini toolbar: Font, Size, Bold, Italic, Underline, Highlight, Font Color, Bullets and Numbering, plus the alignments (Left, Center, Right, Justify).

  **Done.** The mini toolbar's second row now ends with Bullets and Numbering (each toggles the list, with the current marker) and the four alignments (Left, Center, Right, Justify, the current one pressed), after a separator. Font, Size, Grow, Shrink, Clear, Bold, Italic, Underline, Highlight and Font Color were already there. The bullet and numbering libraries (the drop-down beside each button in Word) are not in the mini toolbar yet, because their "Define New" dialogs belong to the Home tab. Checked in Chrome: both lists and centring apply to the selected text.

#### 21.2 — Picture Format tab as in Word

- Rebuild the tab with Word's groups and layout: Adjust, Picture Styles, Accessibility, Arrange, Size.

  **Done.** `PictureFormatTab` has Word's groups and stacks. Adjust: Corrections (a 5 × 5 brightness and contrast gallery), Color (saturation and recolor), Artistic Effects, Transparency, Compress Pictures (a dialog: Print 220, Web 150, Email 96 ppi, resampled on a canvas for the size shown, never enlarged), Change Picture, Reset Picture (takes back every picture setting). Picture Styles: a gallery of twelve frames, shadows, reflections and shapes, Picture Border (colour, weight, dashes) and Picture Effects (the Shape Format menu: shadow, reflection, glow, soft edges, bevel, 3-D rotation). Arrange gains Align and Group. Each gallery tile is the picture itself with the choice applied, and each choice previews on the picture as the pointer passes. The adjustments live in `picture-format.ts` (attributes, one CSS filter) and are drawn in `paintImage`. In .docx they are written as `a:lum`, `a:grayscl`, `a:biLevel`, `a:alphaModFix`, the frame (`prstGeom`), the border (`a:ln`) and `a:effectLst`; a picture with such settings is written anew rather than from its source drawing. Not done: Remove Background, Picture Layout (to SmartArt), Saturation and the artistic effects in .docx (Word has no plain counterpart), and reading these settings back from a .docx Word wrote (the picture opens without them). Tests: `picture-format.test.ts` and `floating.test.ts`. Checked in Chrome: every gallery, the live preview, Compress and Reset.

#### 21.3 — Table Design tab as in Word

- Table Style Options check boxes, the Table Styles gallery, Borders and Shading, laid out as in Word.

  **Done.** Table Style Options are Word's six in two columns (Header Row, Total Row, Banded Rows / First Column, Last Column, Banded Columns); Total Row and Last Column are new table attributes, drawn and kept in the table view. Table Styles shows seven swatches with a More drop-down holding all fourteen; the same gallery is in the table pop-up (`table-design-menus.tsx`). Borders group: Shading (colour menu), Line Style, Line Weight, Pen Color and the Borders menu (Bottom, Top, Left, Right, No, All, Outside, Inside, Inside Horizontal, Inside Vertical, View Gridlines). Cell `borders` is now "all", "none" or a list of sides, drawn with the pen (`borderPen`). Not done: Border Styles gallery, Border Painter, Horizontal Line, Draw Table, diagonal borders, Borders and Shading… (22.4), and borders per side in .docx. Test: `table-borders.test.ts`. Checked in Chrome, light and dark.

#### 21.4 — Table Layout tab as in Word

- Groups: Table, Rows & Columns, Merge, Cell Size, Alignment, Data. Fix every button alignment and spacing inconsistency.

  **Done.** The groups now use Word's large buttons side by side (View Gridlines, Eraser, the four Insert buttons, Split Cells, Split Table, Text Direction, Cell Margins, Repeat Header Rows, Convert to Text, Formula); Insert Right is no longer cut off. Distribute Rows/Columns stay a small stack beside Height and Width. Not done: Properties (needs the Table Properties dialog, 22.10) and the group launchers. Checked in Chrome.

#### 21.5 — Edit the author name

- The author name at the top right is clickable. It opens an inline edit or a themed popover where the user changes the document and app author name.

  **Done.** The account button in the title bar opens a flyout (`AuthorName` in `title-bar.tsx`) with the author name to edit and an Account link. Saving writes `documentProps.author`, which is also kept in `localStorage` for new documents, so comments and tracked changes use it. Checked in Chrome: the name changes on the button.

#### 21.6 — Non-destructive crop

- A Crop tool on the Picture Format tab and in the picture's right-click menu.
- Word-style crop handles that hide the cropped parts without deleting pixels, so the crop can be changed later (and kept in .docx as `a:srcRect`).

  **Done.** Crop (Picture Format → Size, the picture's mini bar, and Crop in its right-click menu) turns the selected picture into crop mode: black corner and edge handles, the cropped-away parts drawn faint beside the part that shows. Dragging a handle hides or shows that edge live without scaling or resampling the picture (`picture-crop.ts`); a floating picture keeps its far edge in place; one undo step per drag; Esc cancels the drag, and clicking Crop again or selecting something else leaves the mode. The crop is four attributes (`cropL/T/R/B`, percent of the whole picture), so it can be changed any time, and the picture's frame, outline and soft edges follow the part that shows. In .docx it is `a:srcRect` (with the visible size as the extent, as Word writes it) and a Word crop opens as the same crop; a source picture whose crop is unchanged is still written from its source drawing. The old uniform "crop 12 %" toggle is gone. **Crop to Shape, Aspect Ratio, Fill / Fit done (2026-10-27):** Crop is a split button with Word's menu; Crop to Shape uses any shape Word has a preset for (`a:prstGeom` on the picture), Aspect Ratio crops centred at the picture's scale, Fill and Fit scale the picture in its frame (Fit as a negative `a:srcRect`) (`picture-shape.ts`, `picture-crop.ts`). Not done: dragging the picture inside its frame, the faint cropped-away parts showing outside a shape in crop mode, and Crop as a split button on the picture bar. Tests: `picture-crop.test.ts`, `floating.test.ts`. Checked in Chrome: Crop, drag west and south handles, leave the mode, undo.

#### 21.7 — Table floating toolbar in dark mode

- Fix the font rendering and the foreground/background contrast of the table floating toolbar in dark mode.

  **Done.** The table floating toolbar's labels, separators, hover and pressed states and its Italic, Underline and other icons took fixed greys; they now use the theme tokens and `currentColor`. Checked in dark mode.

#### 21.8 — Table row selection cursor

- The arrow shown at the left edge of a table row is too large. Use the standard OS cursor size, mirrored horizontally (pointing up-right).

  **Done.** The left-margin selection arrow (`.is-line-select`) is now 12 × 19 px, the size of the system arrow, still mirrored so it points up-right, with the hot spot at its tip.

#### 21.9 — Table Styles dialog

- Table Styles in the table's pop-up opens a themed dialog to browse and apply table styles.

  **Done.** The gallery drop-down (ribbon and table pop-up) ends in "Table Styles…", and the Table Styles group's launcher opens the same dialog: a list of the fourteen styles with a chip each, a preview table in the chosen style, Apply and Cancel. Test: `table-styles-dialog.test.tsx`. Checked in Chrome (dark).

#### 21.10 — No native prompts

- Insert Comment opens a native `window.prompt`/`window.alert`. Replace it with the app's dialog, or behave like New Comment on the Review tab (inline). Find and replace every other native `prompt`, `alert` and `confirm` in the code.

  **Done.** `askText` (`text-prompt.tsx`) is one themed dialog on `DialogFrame` for a line or a few lines of text; it resolves with the text or null. Insert Comment (text menu, table toolbar, Tell Me), Link, Alt Text (pictures, shapes, 3-D models, Alt Text in the object menu) and the chart Edit Series / Edit Category use it. No `prompt`, `alert` or `confirm` is left in `src`. Test: `text-prompt.test.tsx`.

#### 21.11 — Dialog theme audit

- Every modal, pop-up and dialog uses the standard dialog wrapper and the active light and dark theme tokens.

  **Done.** The audit found the chart data sheet as the one modal with its own frame and fixed light colours; it is now a `DialogFrame` ("Chart Data") with dialog tokens, so it follows light and dark. The Icons, 3-D Models and SmartArt libraries already carry their own theme tokens and the global dialog remap covers Tailwind greys inside dialogs; the hard-coded hex colours left in the Font, Paragraph, Color, Design, clipboard-menu and field-editor surfaces were switched to the tokens. Checked the chart data dialog in Chrome (dark).

#### 21.12 — Search bar overlap when the window is narrow

- Shrinking the window makes the search box and its filter/options icons overlap. Fix with flex/grid wrapping and min-widths, or collapse the options into a compact menu at small widths.

  **Done.** Already holds from 20.12: at 1100 and 900 px the search box and its options button sit side by side without touching, at 700 px the search is a magnifier that opens over the bar. Measured in Chrome at 1100, 900, 700 and 560 px; nothing changed.

#### 21.13 — Print Preview shows only the document

- Hide app controls, such as the "Update Table of Contents" button, from Print Preview and from `@media print`. Only document content renders.

  **Done.** The print preview copy drops the "Update Table…" tab, the rotate handle and the 3-D orbit handle, and `@media print` hides them and the drawing canvas hint. Checked with a table of contents: the preview has the block and no tab.

#### 21.14 — Word's keyboard shortcuts

- Ctrl+Z Undo, Ctrl+Y Redo, Ctrl+B / I / U, Ctrl+L / E / R / J alignments, Ctrl+K Hyperlink, Ctrl+P Print, Ctrl+S Save, and the other standard Word shortcuts, everywhere in the editor.

  **Done.** One registry (`editor/shortcuts.ts`) holds Word's shortcuts and a keymap plugin (`shortcut-keymap.ts`, ahead of the editor's own) runs them: Ctrl+B / I / U, Ctrl+= and Ctrl+Shift+= (subscript, superscript), Ctrl+Shift+> / < and Ctrl+] / [ (font size), Ctrl+Shift+A (all caps), Shift+F3 (case cycle), Ctrl+Space (clear formatting), Ctrl+Shift+Space (non-breaking space), Ctrl+Shift+C (format painter), Ctrl+D (Font), Ctrl+L / E / R / J (alignment), Ctrl+Shift+L (bullets), Ctrl+M / Ctrl+Shift+M (indent), Ctrl+1 / 2 / 5 (line spacing), Ctrl+Shift+N (Normal), Ctrl+Alt+1–3 (headings), Ctrl+K (hyperlink), Ctrl+Alt+M (comment), Ctrl+Shift+E (track changes), F7 (spelling and grammar). Ctrl+Z / Y, Ctrl+S / P / F / H / G / O / N / W, Ctrl+Enter and Ctrl+Shift+Enter were already there. Two app keys moved to give Word's their place: the AI Template Builder is now Ctrl+Shift+J (Ctrl+J justifies) and Ctrl+= no longer zooms (the keypad + and Ctrl+wheel still do); Ctrl+E is Center rather than inline code. **Done 2026-10-27:** Ctrl+Shift+D (double underline), Ctrl+Shift+K (small caps), Ctrl+Shift+H (hidden), Ctrl+T / Ctrl+Shift+T (hanging indent, 1.27 cm a step), Ctrl+Q (reset paragraph formatting), and Ctrl+Shift+C / Ctrl+Shift+V as Word's Copy and Paste Formatting (Ctrl+Shift+C used to arm the format painter; the Format Painter button still does). In a browser tab Ctrl+T and Ctrl+Q may be taken by the browser; the desktop app gets them. Tests: `shortcuts.test.ts`. Checked in Chrome: every key above, by pressing it.

#### 21.15 — Keyboard Shortcuts settings

- A Keyboard Shortcuts section in Settings (Options) to view and rebind shortcuts. Custom mappings are kept in the user config.

  **Done.** File → Options ends with a Keyboard Shortcuts card (`shortcut-settings.tsx`) that lists every command of the registry by group with its keys, Change (press the new keys; Escape cancels), Reset per command and Reset all. A key belongs to one command: taking one moves it and says from which command; the application's own keys (Ctrl+S, O, P, F, H, G, Z, Y, C, V, X, A, W, N, Ctrl+Shift+J, zoom) and bare letters are refused. A command moved off a key the editor also binds natively (bold, italic, underline, the headings) no longer answers to the old key. The bindings are kept in the app's local storage (`aiword.shortcuts`), per window origin, not in a config file. Tests: `shortcut-settings.test.tsx`, `shortcuts.test.ts`. Checked in Chrome: rebinding Bold to Ctrl+Alt+B, the old key stops and the new one works.

#### 21.16–21.18 — Cloud accounts (Google Drive, OneDrive)

- Moved to [Future features](#future-features) on 2026-10-19: not planned for now.

#### 21.19 — Share by email

- An "Email as Attachment" option in Share that opens the desktop's default mail client (`xdg-email`, `mailto:` or the desktop portal).

  **Done.** Share (File → Share) has "Email as Attachment". In the desktop app a new `email_document` command writes a .docx copy to a temporary folder and opens the mail program with it attached (`xdg-email --attach` on Linux, Mail on macOS). Where that is not possible (the web, Windows) it opens a `mailto:` message titled after the document and the Share page says so; the opener capability allows `mailto:`. Test: `email.test.ts` (the fallback). The Rust side compiles (`cargo check`) but the attach was not run against a mail program here.

#### 21.20 — Clear AI errors

- Replace the generic "Request failed" with specific messages: API key missing, invalid API key (401), rate limit (429), local Ollama not reachable at localhost:11434, network timeout.
- When the configuration is the cause, the error has a button that opens the AI settings.

  **Done.** `explainAiError` (`ai/errors.ts`) turns the raw failure into a specific message: missing key, rejected key (401), rate limit (429), Ollama not reachable at localhost:11434, model not installed, timeout, network. When the configuration is the cause the chat error has an "Open AI settings" button. The Rust side now names a 429 as a rate limit. Test: `errors.test.ts`. The Rust change was not compiled here.

#### 21.21 — Resend in the AI chat

- A Resend / Retry button on user messages and on failed replies in the AI chat.

  **Done.** Every user message in the chat has Resend (it drops that message and the replies after it and sends it again); a failed request shows Retry under the error. Tests: `chat.test.ts`. Checked in Chrome (web build, where the error is the "open the desktop app" notice).

#### 21.22 — Rewrite follows the chat panel

- With the AI chat panel open, Rewrite streams its result into the current chat thread.
- With the panel closed, the result shows in the existing floating AI Sparkle pop-over.

  **Done.** With the chat panel open, Rewrite adds a turn to the thread ("Rewrite: …" and the passage) and the reply streams in with Insert / Replace selection / Copy; with the panel closed the existing pop-over is used. Test: `chat.test.ts` (`askAbout`). Not run against a real model in this environment.

#### 21.23 — Interactive Equation Editor

- Replace the static, prefilled equation templates with a full editor, as Word's Insert → Equation and its contextual Equation tab.
- Build simple and complex expressions from scratch with structure templates (fractions, radicals, integrals, sums, matrices, scripts, math symbols) and by typing LaTeX or UnicodeMath, rendered live in the document.

  **Done.** Insert → Equation → Insert New Equation, and Edit Equation in an equation's menu, now open one editor (`components/equation-editor.tsx`): a LaTeX box with a live preview (and KaTeX's reason when it cannot be drawn), and Structures, Symbols and Examples tabs. Structures are fractions, scripts, radicals, integrals, large operators, brackets and cases, functions, accents and matrices; symbols are Greek letters, operators, relations and arrows (`editor/equation-templates.ts`). A structure button wraps the selected text in the template's first place and leaves the rest as empty braces with the first place selected. Typed UnicodeMath-style symbols (α, ≤, ∞, √x, x², …) render the same as their LaTeX. Selecting an equation brings a contextual Equation tab (Edit Equation, a menu for each structure and symbol group, in both ribbon layouts) that adds to the equation. Tests: `equation-templates.test.ts` (template filling, every template and symbol is valid KaTeX, typed symbols), `equation-editor.test.tsx`. Checked in Chrome: the editor opened with its palette and preview, an inserted equation brought the Equation tab, and Fraction added a fraction to it. Not done: no click-to-place-a-structure inside an equation drawn in the page (the ribbon appends at the end; only the editor works at a caret). **Inline/display and OMML done (2026-10-27):** Change to Display / Change to Inline on the Equation tab, display equations on an empty line, and equations saved to and opened from .docx as Word's math, with an unchanged Word equation saved exactly as it was read (`document/docx/omml.ts`, `omml.test.ts`). Still open: Word's linear format (UnicodeMath) and the Professional/Linear switch, `m:jc` on display equations, and math run styles beyond plain, bold and upright. I also fixed two `no-useless-assignment` lint errors in `shape-import.ts` from 21.35.

#### 21.24 — Embedded spreadsheet keeps its grid

- Typing into an inserted spreadsheet collapses it and replaces it with plain text.
- Make the spreadsheet its own node in the editor schema, with its own focus, key handling and state, so cell edits stay in the grid and never reach the document's text input handler.

  **Done.** The spreadsheet already was its own node (`sheetBlock`); the fault was that the document's input handler still saw typing in a cell and replaced the selected node with the typed text. The node view now stops the events from its cell inputs (`stopEvent`) so they stay in the grid, follows the node in place instead of rebuilding the grid (so the focused cell keeps its text and caret), and Tab / Shift+Tab / Enter / the arrow keys move between cells, saving the cell they leave. Tests: `sheet-block.test.ts`. Checked in Chrome: typed 12, Tab, 30, Tab, =A1+B1 and the grid kept them, showing 42.

#### 21.25 — Chart axis labels never collide

- Shrinking a chart squeezes its axis labels until they overlap or can't be read.
- Pick the label step from the chart's current width and height: on a value axis use a larger round step (1, 2, 3 … 100 becomes 0, 10, 20 … or 0, 25, 50 …); on a category axis show every second, fifth … label, as Word's automatic label interval does. Recompute live while resizing. A bound, unit or interval the user set in the Format pane wins.

  **Done.** The value axis asks for fewer labels as the chart gets short or narrow (two to five, 28 px apart vertically, a label's width apart on a bar chart), so the steps stay round; the category axis shows every second, third … label once they would touch, and long names are cut to the room they have. A major unit or bound set in the Format pane still wins. Same for a scatter chart's X axis. Test: `chart-spec.test.ts`. Not checked in the browser (pure SVG, covered by the test).

#### 21.29 — Print Preview steps one page at a time

- In the Print Preview pane the mouse wheel (and PageUp / PageDown) moves to the next or previous page, as in Word's full-page print preview, instead of scrolling the pane continuously.
- One wheel notch (or one touchpad swipe, debounced so inertia does not skip pages) steps one page; PageDown / PageUp, Right / Down and Left / Up arrows do the same, and Home / End go to the first / last page. The page counter and the page thumbnails follow the step. A zoomed-in page that is taller than the pane still scrolls inside itself first, and steps only once its edge is reached. Ctrl + wheel keeps zooming. The editor's own scrolling is unchanged.
- Tests: the wheel and key handler (step, debounce, bounds at the first and last page). Check in Chrome with a multi-page document, with a mouse wheel and a touchpad.

  **Done.** In File → Print the wheel steps one page (`preview-steps.ts`): a wheel notch or a touchpad flick turns one page and the events that follow it, inertia included, are ignored until they have been quiet; PageDown / PageUp, Right / Down / Left / Up turn a page, Home and End go to the first and last. A zoomed-in page that is taller than the pane scrolls inside first and steps at its edge (and lands at the top, or at the bottom when going back). Ctrl + wheel zooms the preview. The keys are ignored while a field in the settings column has focus. Tests: `preview-steps.test.ts`. Checked in Chrome with a seven-page document (wheel, burst, keys); a real touchpad was not tried.

#### 21.30 — Table Design and Layout: what 21.3 and 21.4 left out

- **Borders saved in .docx:** **Done (writing).** A cell's drawn sides, weight, colour and style (`borders`, `borderPen`) are written as `w:tcBorders`, and a cell fill (`backgroundColor`) as `w:shd`, through `cell-edits.ts`; a Word cell the person has not touched keeps its own tcBorders and shading. Reopening shows them through the cell's Word CSS. Not done: clearing the fill of a cell that Word shaded, and reading tcBorders back into the Borders menu state.
- **Border Styles gallery:** **Done.** Table Design → Borders → Border Styles opens twelve ready-made pens (thin, medium, thick, grey, dashed, dotted, double, blue, orange and green accents, red dashed, heavy blue; `BORDER_STYLE_PRESETS`). Choosing one sets the pen (the Line Style, Line Weight and Pen Color menus follow it) and switches the Border Painter on, as Word does.
- **Border Painter:** **Done.** The Border Painter button (both ribbon layouts) draws the pen on the cell edge nearest to each click (`paintCellEdge`, `nearestCellSide`), on top of the edges already drawn, with a crosshair over the cells, until it is switched off, Escape is pressed or the Table Design tab is left. Tests: `border-painter.test.ts` (nearest side, the edge painted and kept, the presets). Checked in Chrome: choosing Red dashed and clicking the bottom of a cell set that cell to `bottom` with a 1.33 px dashed `#c00000` pen. Not done: the painter draws only on the clicked cell's own side, so the neighbouring cell's facing edge is not set and a shared edge relies on the cell it was clicked in; no Border Painter eraser mode; the gallery samples are black on the dark theme's menu.
- **Borders menu:** Horizontal Line, Draw Table, and Diagonal Down / Diagonal Up borders (cells need a diagonal side and `w:tl2br` / `w:tr2bl` in .docx).
  **Horizontal Line done (in the editor).** The Table Design Borders menu has Horizontal Line: an empty paragraph with a bottom border below the cursor's block (below the whole table from a cell), then a plain paragraph to continue in (`insertHorizontalLine`, `horizontal-line.test.ts`). **Paragraph borders and fill now round-trip.** The Home tab's paragraph Borders and Shading, and this line, are written to .docx as `w:pBdr` and `w:shd` (in schema order, after the numbering and before the tabs) and read back from Word paragraphs (`ParagraphProperties.borders/shading`, `document/docx/block-format.ts`); a Word paragraph that is not edited keeps its exact lines, and an edited one is written with the editor's one 0.75 pt line. Tests: `paragraph-box.test.ts`, and the new fixture `f23_paragraph_box.docx` in `edit-fidelity`. Not done: style-level borders are written but not shown in the editor, per-side pens of Word paragraphs are drawn as the editor's one line, and the horizontal line was not looked at in Chrome. **Draw Table done (2026-10-27).** Draw Table is Word's pencil: a box makes a one-cell table that size and a line splits a cell; Eraser merges the cells on either side of a clicked border (`src/editor/table-draw.ts`, `table-draw.test.ts`). Not done: redrawing a removed border along an existing line, diagonals with the pencil, a box beside text becoming a floating table, and a line across several cells (only the cell it starts in is split).
  **Diagonals done.** The Borders menu has Diagonal Down Border and Diagonal Up Border; each toggles on the selected cells (off again when every selected cell already has it), keeps the cell's sides, and is cleared by No Border. A cell's `borders` holds `diagDown` / `diagUp` beside the side names and is drawn in the pen's colour as a thin gradient across the cell. In .docx they are written as `w:tl2br` / `w:tr2bl` after the sides in `w:tcBorders`, read from Word cells (`TableBorders.tl2br/tr2bl`) and drawn on opening. Tests: `table-borders.test.ts` (toggle, keeps sides, No Border), `cell-edits.test.ts` (mapping, order, reopening). Not looked at in Chrome by hand. Still open: Horizontal Line, Draw Table, the Borders and Shading… link (22.4), Table Properties and the Table Layout launchers (22.10), and reading `tcBorders` back into the Borders menu state.
- **Borders and Shading…:** the dialog from the Borders menu is Phase 22.4; link the menu entry to it when that is built.
- **Table Layout:** Properties (needs the Table Properties dialog, 22.10) and the launchers on the Rows & Columns and Cell Size groups.
- Tests: Border Painter on an edge. Check in Chrome. (The .docx round trip of per-side borders is in `cell-edits.test.ts`.)

#### 21.31 — Remove the selection context menu (copy/paste popup)

- Remove the floating menu with copy/paste actions that appears on right-click or when text is selected (`clipboard-context-menu`).
- Text selection then relies on the browser's and OS's own behaviour, or on the dedicated mini-toolbar.
- Check that the mini-toolbar, the object context menus (picture, table) and the keyboard shortcuts for copy, cut and paste still work, and drop the tests and styles that only served the removed menu.

  **Done.** `clipboard-context-menu.tsx` (the Cut / Copy / Paste / Paste Options pop-up that opened on a right-click on the bare page sheet) is gone, with its open-state hook and its `[data-clipboard-menu]` styles; the text menu and the object mini-toolbar no longer wait on it. The editor's own right-click text menu (Font, Paragraph, Link … with its Cut / Copy / Paste Options) is a different component and stays. It had no tests of its own. Type check and the 315 tests pass; not checked in the browser.

#### 21.32 — Embedded chart data sheet docked beside the chart

- **Embedded Chart Data Sheet Positioning (Docked/Inline View):** "Edit Data" on an embedded chart currently opens the data sheet as a separate dialog (`ChartSheetDialog`, "Chart Data"). Instead of a detached page or a window floating at a random spot, anchor the data entry grid directly next to the chart inside the editor canvas container, side by side or stacked immediately below or above it, as Word's embedded Excel datasheet does.
- The grid follows the chart when the page scrolls or the chart is moved or resized, flips to the side with room, and closes on Escape, on a click outside both chart and grid, or from its own Close button. Edits update the chart live, as the dialog does today.
- Tests: the placement choice (side, below, above, near the page edge). Check in Chrome with a chart near the top, the bottom and the right edge of a page, and in light and dark.

  **Done.** "Edit Data" (ribbon, object bar, right-click) opens the sheet as a panel docked against the chart (`chart-sheet-dialog.tsx`, placement in `chart-sheet-place.ts`): to the right, else to the left, else under, else over the chart, clamped inside the window. It follows the chart on scroll, window resize and chart resize. A cell's edit reaches the chart when the cell is left, so the chart updates while the sheet is open; Done, Escape and a click outside the chart and sheet close it. Tests: `chart-sheet-place.test.ts`. Checked in Chrome (light): docked right of a new column chart, B2 changed to 6 and the bar followed, scrolled with the chart, Escape closed it. Not checked: dark mode, left/below/above in the browser (covered by the test). When the chart is scrolled partly under the ribbon the panel is held at the top of the window, over the ribbon, rather than the page area.

#### 21.33 — No browser context menu anywhere

- **Disable Global Browser Context Menu (Right-Click):** Intercept `contextmenu` at the window (capture phase) and call `preventDefault()` so the webview's default menu ("Inspect", "Reload", "Back" and the rest) never appears anywhere in the application window.
- Right-click then shows only the app's own context-aware menus: text (formatting, Font, Paragraph, Link, comment), table tools, picture, chart and shape menus, spelling suggestions, and the ribbon, backstage and status bar where Word has one. Where the app has no menu for the spot, nothing opens. Native text fields (dialog inputs, the search box, the formula bar) keep a minimal Cut / Copy / Paste menu, or the desktop wrapper's own, so they stay editable with the mouse.
- Must not break the existing handlers that call `preventDefault` themselves (`TextContextMenu`, `ObjectContextMenu`, the table menu). The developer tools stay reachable from the keyboard in a development build only.
- Tests: the window handler blocks an unhandled spot and leaves an app menu's own handler working. Check in Chrome and in the desktop app, on the ribbon, the page margin, the status bar and a dialog.

  **Done.** `lib/context-menu-guard.ts` (`suppressBrowserContextMenu`, installed in `main.tsx`) listens for `contextmenu` on the window and calls `preventDefault()` unless an app menu has already done so or the target is a native text field (text inputs and textareas keep the webview's own Cut / Copy / Paste menu). It runs in the bubbling phase on purpose, after `TextContextMenu`, `ObjectContextMenu`, the chart and object-bar handlers, so none of them is disturbed. Tests: `context-menu-guard.test.ts` (an unhandled spot is blocked, an app handler still works, text fields keep the native menu while buttons and checkboxes do not, removal). Checked in Chrome by sending right-clicks to the ribbon, the status bar and the page text (all blocked or handled by the app) and an input (native). Not done: not tried in the Tauri desktop app, no hand right-click on a dialog, and no custom Cut / Copy / Paste menu for text fields (they use the webview's). The developer tools stay reachable by their usual keyboard shortcut; no build-specific switch was added.

#### 21.34 — Home tab "Open Containing Folder" works

- **Fix Home Tab "Open Containing Folder" Action:** the icon next to each recent file on the Home tab does nothing. Add the file-system command behind it: in the desktop app a Tauri command (and the opener capability it needs) that shows the file's folder in the Linux desktop file manager, selecting the file where the manager supports it (the `org.freedesktop.FileManager1` `ShowItems` call, falling back to `xdg-open` on the parent folder; Finder `open -R` and Explorer `/select,` on macOS and Windows).
- Where the file no longer exists, say so in a message instead of opening a wrong folder; in the web build, where a path is not known, hide or disable the icon with a tooltip that says why.
- Tests: the path to folder (and the missing-file message) logic. The Rust side compiles (`cargo check`). Check in the desktop app with a recent file, a moved file and a path with spaces.

  **Done.** The icon did nothing because it called the opener plugin's `revealItemInDir`, whose permission was never granted. It now calls a Tauri command, `reveal_document` (`src-tauri/src/lib.rs`): it checks for a full path to a file that still exists ("The file could not be found." otherwise), then on Linux sends `org.freedesktop.FileManager1.ShowItems` through `dbus-send` with a percent-encoded `file://` URI so the file is selected, falling back to `xdg-open` on the parent folder; macOS uses `open -R`, Windows `explorer /select,`. In the app, `document/reveal.ts` (`revealDocument`) turns a missing file into the usual "We couldn't find this file" dialog, with Remove from Recent, instead of opening a wrong folder; in the web build the icon is disabled with a tooltip that says it needs the desktop app. Tests: Rust `file_uri_encodes_spaces_and_non_ascii` and `reveal_needs_an_existing_full_path` (`cargo test --lib` passes), `reveal.test.ts` (the call with a spaced path, the missing-file dialog and Remove from Recent, the web build). Not done: not run in the desktop app, so the file manager was not seen opening; the `ShowItems` call and the macOS and Windows branches are untested here, and the Recent "Folders" list has no such icon yet.

#### 21.35 — Word's drawn shapes open from .docx

- Found by opening `123.docx` (made in Word): its anchored shapes `Frame 6` and `Heart 7` (`wps:wsp` inside `mc:AlternateContent`, preset geometry `frame` and `heart`, 160 × 145 pt and 137 × 136 pt, behind-text `wrapNone`, accent-1 outline with `lnRef` and `fillRef` styles) do not appear on the page at all.
- Read a `wps:wsp` drawing into the app's shape object (preset, size, position from `wp:positionH` / `wp:positionV`, wrap, fill, line, text, rotation, adjust values) and keep the original XML for what the model does not cover, so the shape saves back as Word wrote it. Reading the VML fallback is not needed when the DrawingML choice is present.
- Tests: the two shapes from `123.docx` (a small fixture without the 29 MB model) open as shapes with the right preset, size and offset, and a save without edits keeps them byte for byte. Check in Chrome that they sit where Word puts them.

  **Done.** A Word shape with a preset the app draws (rectangle, rounded and snipped rectangles, ellipse, triangle, diamond, hexagon, plus, heart, frame, teardrop, the three arrows) opens as an editable shape (`docx/shape-import.ts`): preset, size, behind/in-front wrap and place from the anchor, fill and outline from its own `spPr`, else from its `wps:style` references resolved against the theme (`shade`, `tint`, `lumMod`, `lumOff`), outline weight from `a:ln` or the line style. Saved without formatting it in the app, it goes back as Word's own `wps:wsp` drawing; after a change it is written as the app's picture of the shape. Not done, still shown as text as before: a shape with text or a text box, a preset the app has no drawing for (callouts, stars, math signs), and a shape in a paragraph that has text (it would move in the source when it opens as a block). Tests: `shape-import.test.ts` on the new fixture `f20_word_shapes.docx` (Frame and Heart from `123.docx`, 17 KB), plus the whole suite. Checked in Chrome with `123.docx`: both shapes show, teal with the dark outline, after the table (the app puts a floating object before its paragraph); not compared pixel by pixel with Word.

#### 21.36 — SmartArt from .docx shows its drawing

- `123.docx` has a SmartArt graphic (`Diagram 9`: data, layout, colors, quickStyle and the pre-rendered `drawing1.xml`). The app shows only the text `[Diagram 9]` (`drawingText` in `docx/inlines.ts`).
- Show the graphic from its `drawing1.xml` (Word's own rendered shapes and text, `dsp:` drawing), at the frame's size, so it looks as it did in Word. Keep all five diagram parts untouched on save. Editing it as SmartArt (22.1, 22.13) is separate; until then it is shown and kept, not editable, and says so in its tooltip.
- Tests: a drawing part with shapes and text renders the same count of shapes and the same text; a save keeps the diagram parts byte for byte. Check in Chrome.

  **Done.** The graphic is drawn from Word's pre-rendered `drawing1.xml` (`docx/smartart-import.ts`): each `dsp:sp` with its preset geometry (rectangle, rounded rectangle, ellipse, triangle, diamond, hexagon, parallelogram, trapezoid, chevron, pentagon, the four arrows, plus; any other preset is drawn as its box), fill and outline (own, else from `dsp:style`, theme colours with shade, tint, lumMod, lumOff), rotation, flips, and its text centred in `dsp:txXfrm`. It shows as a picture of the frame's size, inline or floating; on save the original drawing and all five diagram parts go back as Word wrote them while its size, place and rotation are unchanged. Not done: editing it as SmartArt (22.1, 22.13), gradients and pictures inside diagram shapes, curved and block-arc presets, wrapped and run-formatted text (text is one line per paragraph at its size). Tests: `smartart-import.test.ts` on the new fixture `f21_smartart.docx` (the bubble diagram of `123.docx`, 22 KB). Checked in Chrome with `123.docx`: the bubbles show in the teal of the theme, 576 × 336 px, where `[Diagram 9]` was.

#### 21.37 — Line numbering from .docx

- `123.docx` has `w:lnNumType w:countBy="1" w:restart="continuous"` in its section, yet no line numbers show. The app has the feature (`pageSetup.lineNumbers`, `lineNumberRestart`, Layout → Line Numbers) but the importer does not read `lnNumType` (it is only kept as an unread element in `element-source.ts`).
- Read `lnNumType` into the page setup (`countBy`, `start`, `distance`, `restart` = continuous / newPage / newSection) and write it back from the setup when it was changed in the app; Suppress Line Numbers on a paragraph (`w:suppressLineNumbers`, 22.8) stays honoured.
- Tests: reading and writing the element, count by 2 and restart each page. Check in Chrome with `123.docx`: numbers show beside each line of the text.

  **Done.** `w:lnNumType` is read into the section (`LineNumbering`: `countBy`, `start`, `distance`, `restart`) and into the page setup, so Layout → Line Numbers shows it (Continuous, or Restart Each Page for `newPage`); saving writes Word's own element while the setup is as it was, `numbering every line` with the chosen restart after a change in the app, and none when turned off. Tests: `line-numbers.test.ts` (the fixture `f20_word_shapes.docx` has the element). Checked in Chrome with `123.docx`: the numbers show beside the text and run on across pages. **Done 2026-10-27:** Start at, Count by and From text are in the Line Numbers dialog (Layout → Line Numbers → Line Numbering Options…, which opens Page Setup on its Layout tab), drawn, read from `w:lnNumType` (Word counts `start` from 0) and written back. Turning numbering on now draws it at once; before, nothing showed until the next edit. Not done: `restart="newSection"` shows as continuous and is written back unchanged; Suppress Line Numbers on a paragraph (22.8) is not read.

#### 21.38 — 3-D models from .docx stay 3-D

- `123.docx` has a 3-D model (`3D Model 10`, "Emotive creature": `am3d:model3d` in `mc:AlternateContent`, `media/model3d1.glb` with a `media/image2.png` fallback, behind-text anchor at −0.36 cm, −0.2 cm, 6.5 × 8.6 cm). The app opens only the fallback picture as a flat image, so it cannot be rotated and the model data is not tied to the picture.
- Read the `.glb` through the model relationship (`http://schemas.microsoft.com/office/2017/06/relationships/model3d`) into the app's 3-D model object (the one 3-D Models inserts, with its orbit handle), keep the picture as the preview while it loads, and keep the camera (`am3d:trans`, `am3d:camera`, rotation, scale) so the first view matches Word's. Write the model, the fallback and the `mc:AlternateContent` back on save. Large models (30 MB here) must not freeze the open: load them after the page is shown.
- Tests: the model part is found from the relationship and the object keeps its `.glb` bytes through a save. Check in Chrome with `123.docx`: the creature turns when dragged.

  **Done.** A Word 3-D model opens as the app's own model (`modelPictureHtml` in `docx/inlines.ts`): the `.glb` is found through the model relationship and handed to the viewer as a blob URL (the 29 MB file is not copied into the page), Word's fallback picture is the poster while it loads and the print picture, the alt text and the place, size and wrap come from the drawing, and it draws without the app's grey backdrop. Not turned, a save writes Word's `am3d:model3d` drawing and the `.glb` part back as they were; turned or resized, it is written as the app's picture of the model with the `.glb` inside it (no blob address). Viewer: any loaded model is now centred on its own middle and fitted to the view when its units are far from the viewer's (Word's are), a model with a file shows its last picture instead of the stand-in cube while it loads, and a load failure is logged. Also fixed on the way: saving a new picture into a file whose Word media numbering skips (`image1` gone, `image2` kept) reused `image2.png` and failed with "File already exists"; it now takes the next free number. Not done: Word's camera, rotation and lights (`am3d:camera`, `am3d:trans`) are not used, so the first view is the app's default, not Word's pose; animation (`a3danim`) is not played. Tests: `model3d-import.test.ts` on the new fixture `f22_model3d.docx` (the creature of `123.docx` with a 12-byte `.glb`, 73 KB). Checked in Chrome with the real `123.docx`: the creature loads in 3-D, transparent, and turns with the orbit handle; the reload after a turn takes as long as the first load.

  **Fixed 2026-10-24** (see `changes.md`): the desktop CSP blocked the loader's fetch of the model's blob URL
  (`connect-src` lacked `blob:`), and a file with nothing to draw (the fixtures' stub `.glb`) left an empty view
  whose first turn was captured as the model's picture. The viewer now keeps the stand-in and the picture until a
  model has loaded (`three-d-fit.ts`), and `model3d-import.test.ts` runs on f24 as well.

#### 21.39 — Two-page spread follows odd and even pages

- **Two-Page Spread View Pagination Flow:** when the zoom shows two pages side by side (spread view), typing past a page break must fill the spread as Word's print layout does: an odd-numbered page sits on the right and an even-numbered page on the left. Page 1 is alone on the right, then 2 | 3, 4 | 5 and so on, so a new page opened by typing lands on the correct side and the view follows the caret to it.
- The page pairing follows the real page numbers, including a section that restarts numbering or starts on an odd or even page, and a manual page break. Where only one page of a pair exists, the other side is left blank. Zoom, scrolling and the page counter keep working on the spread; single-page zoom is unchanged.
- Tests: the pairing of page numbers into spreads (first page alone on the right, restart, odd/even section break). Check in Chrome by zooming out to two pages and typing from page 1 through page 4.

  **Done.** View → Multiple Pages → 2 pages is now a book spread (`document/page-grid.ts`, one empty place before page 1): page 1 sits alone on the right, then 2 | 3, 4 | 5, so every odd page is on the right and every even page on the left; the page sheets, the text, objects, the rulers and the stack height all follow, and a page opened by typing lands on the side its number gives. The 4 and 8 page grids and the single page are unchanged. Tests: `page-grid.test.ts` (pairing, the next page opened by typing, row count, unchanged views). Checked in Chrome with `123.docx` at 2 pages: page 1 on the right, 2 | 3 below it. Not done: pairing follows the page's position in the document, not a restarted page number (a section that restarts numbering at 1 does not start a new spread), and an "odd/even page" section break does not insert the blank page Word adds; typing through the page boundary was not driven by hand, only the layout it feeds. **2026-10-27, left for later:** as far as known, Word does not show that blank page in Print Layout (the next page's number skips; the blank page is printed), so doing it needs page numbering and printing to skip a page, not only the layout. Low use, so deferred.

#### 21.40 — Ribbon tabs change with a subtle animation

- **Ribbon Tab Transition Animation:** switching tabs in the ribbon header (Home, Insert, Design …, including the contextual tabs) plays a short, smooth fade and slight slide of the new tab's commands, so the change reads as a transition rather than a swap. Keep it brief (about 150 ms, using the app's existing motion tokens `--motion-*`), never move the ribbon's height, and keep it from running on the first paint or when the ribbon is collapsed and reopened.
- Honour `prefers-reduced-motion` (no animation). Fast switching between tabs must not queue or flicker; the tab clicked last wins.
- Tests: the tab change keeps the right group visible and the reduced-motion path has no animation class. Check in Chrome, light and dark, switching tabs quickly.

  **Done.** Choosing a ribbon tab now sets a short-lived `data-tab-motion` flag on the ribbon card (`components/ribbon/tab-motion.ts`, `useTabMotion`), and `index.css` fades and slides the new tab's commands in over `--motion-tab` (150 ms, 4 px, opacity and transform only, so the ribbon's height never moves). The flag is not set on first paint or when the collapsed ribbon is reopened, and `prefers-reduced-motion` turns the animation off. Choosing another tab before it settles restarts the timer, so the tab clicked last wins. Tests: `tab-motion.test.tsx` (still at first, moves after a choice, settles, restarts on a quick second choice). Not done: not looked at in Chrome (light, dark, fast switching), and the reduced-motion path is covered by the stylesheet rule only, not by a test.

#### 21.41 — Object menu only on right-click

- **Object Dropdown Menu Trigger Refactor (Right-Click Only):** a plain click on an embedded object (picture, chart, shape, 3-D model, SmartArt, text box) now opens the object's menu on its own (`ObjectContextMenu` shows on `pointerup` and whenever the selection becomes an object). Remove that: a left click only selects the object and shows its handles and the floating object bar, and the menu appears only on an explicit right-click (the `contextmenu` event, or the Menu key / Shift+F10 on a selected object).
- The menu keeps its content, its closing rules (Escape, click outside, scroll, zoom) and its place under the pointer. Selecting by keyboard, dragging, resizing, rotating and cropping never open it. Clicking an object that is already selected does not open it either.
- Tests: a click selects without a menu; a right-click opens it; Shift+F10 opens it for the selected object. Check in Chrome with a picture, a chart, a shape and a table (whose own menu is unchanged).

  **Done.** `ObjectContextMenu` no longer opens from a click or from the selection becoming an object. It opens on the `contextmenu` event, which now finds the object under the pointer (a picture, or any object node or one that contains the click), selects it and opens the menu at the pointer, and on the Menu key / Shift+F10 for a selected object or a cell selection (placed under the object). Escape, a click outside, scroll, zoom and moving the selection away still close it. The `pointerup`/drag-distance bookkeeping and the `dismissed` flag are gone. Tests: `object-context-menu.test.tsx` (a selecting click opens nothing, Shift+F10 opens it, a right-click on a picture opens it, moving the selection closes it, Shift+F10 with no object does nothing). Checked in Chrome with the 3-D model in `123.docx`: a click shows the handles and floating bar with no menu; a right-click opens the menu at the pointer. Not done: a chart, a shape and a table were not tried by hand, and a right-click inside a table with no cell selection still opens nothing of ours (the table menu follows a cell selection, as before).

#### 21.42 — First-run setup wizard with author and locale detection

- **First-Run Setup Wizard / Author & Locale Auto-Detection:** on the first launch, show a setup dialog that confirms the author name and details, the locale, the date format and the number format. Pre-fill each value from what the system offers (environment variables such as `LANG`/`LC_*`/`USER`, the desktop portal settings, or the browser's `Intl` locale where available), and leave a field blank for manual entry when the system gives nothing.
- The confirmed values are stored with the other settings and used as the author of new documents and comments and as the default date and number formats. The dialog is shown once; the same settings stay editable afterwards (Options), with a way to run the setup again and to reset the detected values.
- Tests: detection from a set of environment and `Intl` values (present, partial, absent), blank fields when nothing is found, the dialog shown only on first run, and the stored values read back. Check in Chrome with cleared storage.

  **Done.** `components/first-run-setup.tsx` shows "Welcome to Inkspire" on the first launch (author name, initials, language and region, date format, decimal and thousands separators; Continue or Skip) and never again once answered. The values start from `document/user-settings.ts` (`detectSettings`): `LC_ALL`, then `LANG`, with `LC_TIME` and `LC_NUMERIC` for the date and number formats, and the browser's locale only when the environment says nothing; the date pattern and the separators come from `Intl` for that locale. In the desktop app the new `system_defaults` Tauri command supplies `USER`, the full name from the account's `passwd` entry, and those variables. An author already typed before this setup is kept over a guess; anything unknown stays blank. Confirming stores the values in `aiword.user-settings` and sets the document author. File → Info has "Run setup again…". Tests: `user-settings.test.ts` (environment parsing, LC_* precedence, browser fallback, blank when nothing is found, once-only storage), `first-run-setup.test.tsx` (the dialog, skip, not shown when done), Rust `gecos_name_is_the_first_field`. Checked in Chrome with cleared storage: the dialog opened pre-filled (browser locale, `dd/MM/yyyy`, separators) and Continue stored the values. **Follow-up:** the chosen date pattern now writes Insert Date & Time, date fields and comment dates (`formatWithPattern`/`formatDay`, tests in `user-settings.test.ts`), and the chosen locale drives the time format and the ruler's units and number style (`readLocale`). Not done: the desktop app was not run, so `system_defaults` is untested live; the desktop portal is not asked (the environment and account entry only); the stored decimal and thousands separators are not used anywhere yet (field results and the rulers still follow the locale); there is no editable Options page for the formats beyond "Run setup again".

#### 21.43 — Default table gridlines are faint, explicit borders stand out

- **Table Gridline Contrast Adjustment (Default vs. Explicit Borders):** lighten the default gridlines and cell borders of a newly inserted table, when no explicit borders have been applied, so they read as faint, unobtrusive guides (as Word's View Gridlines do) rather than as drawn lines. Explicit borders the person applies (Borders menu, Border Styles, Border Painter, a Word file's own borders) must then be clearly different: darker, and full strength, so a cell with a border is told apart from one without at a glance.
- Applies to light and dark themes and to print preview (default gridlines are not printed; explicit borders are). A table made in the app keeps saving as Word's Table Grid, so the default look must stay a view-only matter and not change what is written to .docx. View Gridlines still switches the faint lines off.
- Tests: the default and the explicit border colours differ by a minimum contrast, in both themes (computed from the CSS tokens), and a table without explicit borders saves unchanged. Check in Chrome: insert a table, apply Outside Borders to a few cells, and compare.

  **Done.** The default cell border of a table made in the app is now `--table-default-line` (`#e6e6e9`, from `#d4d4d8`) and the View Gridlines dashes `--table-gridline` (`#dcdce0`, from `#c8c8c8`), both barely darker than the white page; every border the person draws and the diagonals use `--table-explicit-line` (`#404040`) unless the pen says otherwise, which is how a pen's own colour and weight still win. A drawn border is about 9:1 against the page and 8:1 against the default line. These are view-only CSS tokens: nothing written to .docx changes. Tests: `table-lines.test.ts` (computed contrast of the tokens against the page and each other, and that the rules use them). Not done: not looked at in Chrome by hand; the dark theme was not given its own values (the page stays white in it); and default lines are still printed, because a table made in the app is saved to .docx with Word's Table Grid lines and printing must match what Word prints, which differs from the "not printed" idea above.

#### 21.44 — First-run setup wizard: locale and date format as dropdowns

- **First-Run Setup Wizard - Locale & Date Format Dropdowns:** replace the text input boxes for language/locale and date format in the first-run setup wizard (`components/first-run-setup.tsx`, 21.42) with interactive dropdown selection menus populated with standard system/locale options.
- The detected value (21.42) is pre-selected; when the system gave none, the dropdown starts on a "Choose…" entry. Keep a way to enter a value that is not in the list (an "Other…" entry) so a detected locale or pattern that the list lacks is not lost.
- Tests: the dropdowns list the standard options and pre-select the detected one; choosing an entry is what is saved; a detected value outside the list is kept.

**Done.** Language and region and Date format are dropdowns (30 locales, 12 date patterns shown with today's-style sample), pre-selecting the detected value, starting on "Choose…" when there is none, keeping a detected value the list lacks as its own entry, and "Other…" switches to a text box. Tests in `first-run-setup.test.tsx`. Not done: the decimal and thousands separators are still text boxes and do not follow a changed locale; the locale list is fixed, not read from the system. Checked in Chrome: both are dropdowns and a detected en-NL is kept as its own entry.

#### 21.45 — Recent file missing: warn without leaving the Recent list

- **Recent File Missing - Error Handling & View Retention:** when a person clicks a recent file that no longer exists on disk, show the warning dialog _without_ navigating away from the current screen or changing the view; they must remain on the Home/Recent files tab.
- Today the click goes through `openRecentDocument` (`document/commands.ts`), which may close the backstage or switch view before it finds the file is gone; the check must happen first, and only a successful open leaves the Home view. The dialog is the existing file-error dialog; after it is closed the list is as it was (consider offering to remove the dead entry from Recent).
- Tests: opening a missing recent file shows the dialog and leaves the backstage view on Home/Recent; opening an existing one still opens it and leaves the view.

**Done.** When this window already has a document, a Recent file is now read first; if that fails the file-error dialog shows here and no window opens and the backstage stays on Home (before, the new window opened and showed the error). When this window is untouched it already read before changing the view. Tests in `recent-missing.test.ts`. Not done: an existing file is read twice (once to check, once in its window); not tried in the desktop app.

#### 21.46 — Non-destructive image cropping with a deferred commit

- **Non-Destructive Image Cropping & Deferred Commit:** image cropping changes are only previewed live while the crop handles are dragged and are _not_ permanently committed until the person releases the handles and clicks an explicit "Apply/Commit" action. Cropping stays fully non-destructive: the original image's dimensions and pixel data are preserved, so the crop can be readjusted or reset at any time.
- Check against the current Crop (21.x, Picture Format → Crop): where it commits today, whether Escape or a click elsewhere cancels, and that the crop is kept as a source rectangle (`a:srcRect` in .docx) rather than as trimmed pixels.
- Tests: a crop in progress changes nothing in the document until Apply; Cancel restores the previous crop; Reset Picture returns the full original; save and reopen keeps the crop and the full image.

**Done (partly).** The crop was already non-destructive (two percentages per side, `a:srcRect` in .docx, covered by `floating.test.ts`), but it committed on releasing a handle. Now dragging only previews (no history), and the crop becomes one undo step on **Apply** (the Crop button reads Apply Crop while cropping, in the ribbon and the object bar, or Enter); **Cancel** (button, Esc, or selecting something else) puts the picture back as it was; **Reset** shows the whole picture again, still pending. Tests in `crop-session.test.ts`. Checked in Chrome with `123.docx`: Crop shows Apply, Cancel and Reset; dragging the right handle only previews; Cancel restores the full picture; a second drag then Enter applies it, and one Ctrl+Z restores the original width. Esc and Reset were not tried. Not done: Reset Picture (the Picture Format command) was not changed; leaving the picture by clicking elsewhere cancels rather than applies, which may surprise people.

#### 21.47 — Permanent crop: compress / flatten cropped images

- **Permanent Crop / Size Reduction Option:** an explicit "Compress / Flatten Cropped Images" option in the picture tools that permanently crops and trims the discarded pixels, so the document file shrinks when the person wants that. It is a separate, deliberate action (with a warning that it cannot be undone after saving), never a side effect of cropping.
- Relates to the Compress Pictures dialog (`CompressDialog`): "Delete cropped areas of pictures" is the same idea; check what it already does before adding another entry point.
- Tests: flattening a cropped picture leaves the visible result unchanged and the stored image smaller; an uncropped picture is left alone; the file size drops.

**Done (partly).** The Compress Pictures dialog had no cropped-areas option, so it is there now rather than a second entry point: "Delete cropped areas of pictures" with "Apply only to this picture" (unticked it flattens every cropped picture, with or without a selection). It cuts the hidden pixels at the picture's own resolution (`picture-flatten.ts`), keeps the shown size, clears the crop, and is one undo step; a note says the crop cannot be changed back after saving. Also fixed Compress, which measured the resolution against the cropped size and so over-shrank cropped pictures. Tests in `picture-flatten.test.ts` (geometry, all/selected, uncropped untouched, undo). Not done: the canvas cutting and the file getting smaller are not tested (jsdom has no canvas) and not tried in Chrome; a JPEG is re-encoded once at quality 0.92 (slightly lossy); no separate button in Picture Format, only through Compress Pictures; no size shown before and after.

#### 21.48 — Lossless document size optimization

- **Lossless Document Size Optimization:** a document optimization / compression utility that strips redundant metadata, temporary cache states and unreferenced binary assets (media, embeddings, orphaned relationships and parts) without degrading image quality or losing any document detail or fidelity. It never recompresses or resamples images; at most it re-packs the zip.
- Show what was found before it is removed (a list with sizes) and the saved size afterwards; keep a way back (Save As a copy, or Undo before saving).
- Tests: a fixture with an orphaned image, a stale thumbnail and unused relationships loses exactly those and opens identically (the whole `edit-fidelity` suite still passes); a file with nothing to strip is byte-for-byte unchanged in content.

**Done (partly).** File → Info → "Optimize size…" builds the .docx as it would be saved, lists what it carries without using (parts nothing refers to, pictures whose relationship the part never uses, a stale `docProps/thumbnail`, printer settings) with sizes and a total, and "Save Optimized Copy…" writes a copy without them; the open document and its file are untouched. Never resamples or recompresses images; only the zip is re-packed. Engine `docx/optimize.ts`; tests in `optimize.test.ts` (exactly the four planted extras found and removed, document reopens with its text, second pass finds nothing, a clean file comes back as the same bytes); the whole suite, `edit-fidelity` included, passes. Not done: it looks at the file the app would save, which is written fresh from the model, so most of what it finds exists only in files whose extra parts the app carries through (so it may often say "Nothing to remove"); core-properties metadata, unused styles and embedded fonts are not touched; sizes are uncompressed bytes, not the saved file size, and no before/after size of the zip is shown; checked in Chrome that Info → Optimize size… opens and says "Nothing to remove" for a fresh document; not tried with extras, nor in the desktop app (Save needs a path picker).

### Part 2 — Discovery (proposal first, no production code)

#### 21.26 — Built-in local AI or bring your own key

- The cleanest way to ship or set up a light local engine on Linux for summarise, rewrite and grammar, without bloating the installer: WebLLM / ONNX runtime, a bundled llama.cpp binary, or an automated Ollama setup.
- One provider architecture and Settings UI to switch between the built-in engine and external or local APIs: Anthropic Claude, OpenAI, Ollama, LM Studio and custom OpenAI-compatible endpoints.

  **Done (partly, 2026-10-19).** Plan from the proposal, as built:
  - **Provider architecture (A).** `ai.rs` has two new providers beside OpenAI, Anthropic and Ollama: `compatible` (any OpenAI-compatible endpoint: base address, optional key; https anywhere, http only on this computer or the local network) and `builtin`. In the app, AI Settings (was AI Keys) lists Built-in engine, Local Ollama, LM Studio (a compatible endpoint that starts from `http://127.0.0.1:1234/v1`), Custom endpoint, OpenAI and Anthropic, with a model per provider, an address for the three that take one, and Test connection. New users start on the built-in engine.
  - **Keys in the OS keyring (3).** `secrets.rs`: keys go to the system keyring (Secret Service on Linux, Keychain, Credential Manager) through the `keyring` crate. Without a keyring the owner-only file is the fallback and the dialog says so; keys an earlier version kept in `ai-keys.json` move into the keyring the first time and the file is removed (a key already in the keyring wins). The settings never show a key.
  - **Built-in engine (B), downloaded on first use.** `local_ai.rs`: a pinned llama.cpp (`b11564`) `llama-server` and a model (Qwen2.5 3B Instruct Q4_K_M, 2.0 GB, or 1.5B, 1.1 GB) are downloaded only when the user clicks Download (the button shows the size; nothing is in the installer), each checked against its pinned SHA-256 and size, resumable (`.part` + `Range`), with progress and Stop. The Vulkan build is used when there is the loader, a GPU render node and a hardware Vulkan driver (llvmpipe does not count), otherwise the CPU build; a Vulkan build that will not start switches to the CPU build for good. The server runs on a random port on 127.0.0.1 only, is stopped after ten quiet minutes, when the app exits, and (Linux) if the app dies. Linux x86-64 and arm64 only for now.
  - **Experience (C).** Requests stream through the same path as the other providers (so Stop works); the AI tab shows a chip (Download needed / Downloading… / Ready · model / Running); errors name the fix and open the settings; Remove deletes the engine and models.
  - **Tests (D).** Rust (49): keyring/file/migration, address rules, SSE streams for compatible and built-in, Vulkan detection from fake driver folders, backend choice, download checksum, resume, restart when `Range` is ignored, cancel, archive unpacking, server arguments. TypeScript: `providers.test.ts`, `ai-keys.test.tsx` (download offer and sizes, CPU or GPU wording, ready and Remove, unsupported system, custom address, keyring save and file warning, chip text).
  - **Not done:** a live run with the real engine and model (needs the download; see below), macOS and Windows builds of the engine, more model tiers (a 7B needs a split-file download), GPU choice (the first Vulkan device is used), a chat template or context size per model (8192 tokens), and the older Ollama and key-based providers did not get new streaming tests. **Follow-up (2026-10-26).** Streamed
    replies were decoded per network chunk, so a character split between two chunks came out as "��"; the parser now
    keeps bytes and decodes whole lines. Ollama and Anthropic streams now have tests across chunks (split characters,
    pings, `\r\n`, an error mid-stream) Each built-in model now has its own context size (16K tokens for the three Qwen2.5 models,
    `ModelInfo.context`), and a request over any provider's window says the text is too long and what to do. The 7B
    tier was already listed (one file, 4.7 GB). Still not done: macOS and Windows engines, GPU choice,
    a chat template per model (llama-server uses the one in the GGUF). **Live run (2026-10-26).** Done with the app's
    own code (`live_builtin_engine`, ignored test): on a Radeon 680M the Vulkan build gave "????" without end for a
    Hebrew prompt and was no faster than the CPU, so Vulkan is now used only for a discrete GPU, and replies are
    capped at 4,096 tokens for the built-in engine, compatible endpoints and Ollama. On the CPU build the 3B and 7B
    models answer in 3–7 s and stop by themselves. Not run: a discrete GPU (none here).

#### 21.27 — Add-ins

**Built (2026-10-22, from the proposal below).** `src/addins/`: a registry of built-in add-ins (Markdown, Document Templates, Writing Assistant, Citation Import for BibTeX and CSL-JSON), a store of the installed ones (kept in this browser), Home > Add-ins lists their commands, File > Get Add-ins and Options > Add-ins list the catalogue with Add and Remove. Not built: Mermaid (needs a new dependency), live Zotero, third-party plugins.

- Which add-ins the stack can realistically offer out of the box: citation managers (Zotero, Mendeley), Mermaid and diagrams, Markdown and LaTeX import, translation, grammar checkers, document templates.
- How the Add-ins menu and the plugin API should be structured.

  **Proposal (2026-10-20, discovery only; no code).** Today both entry points are stubs: the Home Add-ins popover says "No add-ins are installed" and File → Get Add-ins is a `StubView`.
  - **Out of the box (no plugin runtime needed), in this order:** (1) Markdown and LaTeX import/export: `markdown.ts` (marked/turndown) and KaTeX are already bundled, so these are menu entries, not add-ins. (2) Mermaid diagrams: one lazily loaded dependency, rendered to SVG and inserted as a picture node with the source kept in a `data-mermaid` attribute so it re-edits. (3) Document templates: `templates.ts` / `templates-pro.ts` already exist; list them under Add-ins. (4) Grammar and translation: already the AI providers (21.26); show them as built-in add-ins that open the AI tab. (5) Citation managers (Zotero, Mendeley): import a CSL-JSON / BibTeX file into the existing Sources store (`sources.ts`); live Zotero needs its local HTTP API on 127.0.0.1:23119, so it is a later step.
  - **Structure.** A built-in add-in is a plain object `{ id, name, description, group, commands[], panel? }` registered in `src/addins/registry.ts`. The Home Add-ins popover lists installed ones with their commands; File → Get Add-ins lists the catalogue with Add / Remove and persists the enabled ids in user settings. Commands call the editor and document stores through the same command layer the ribbon uses.
  - **Third-party plugin API (later, only if wanted).** Sandboxed iframe or Worker with a message API (`getSelection`, `insertHtml`, `setStatus`), a manifest with declared permissions, no filesystem or network by default. Do not run third-party code in the main window.
  - **Decision for the owner:** build only the built-in registry first (small, safe), or also the sandboxed plugin API.

#### 21.28 — File → Transform

- Which transformations are worth building: clean web page / HTML, interactive Markdown or a static site, presentation slides / Beamer, EPUB, an executive summary document.

  **Proposal (2026-10-20, discovery only; no code).** File → Transform is a `StubView`. Export already runs through Pandoc (`export_document` in `src-tauri/src/lib.rs`, formats docx, odt, rtf, pdf, html, md, txt), so most transformations are new Pandoc targets plus a Transform view, not new engines.
  - **Worth building, in this order:** (1) Clean web page: standalone HTML with embedded CSS and pictures as data URIs (Pandoc `--embed-resources`). (2) EPUB: Pandoc `epub3`, headings become chapters, document title/author fill the metadata, cover from the first picture or Cover Page. (3) Slides: Pandoc `revealjs` for a browser deck and `beamer` for PDF; Heading 1 starts a section, Heading 2 a slide. (4) Markdown static site: one `.md` per Heading 1 plus an index in a chosen folder. (5) Executive summary: an AI transform (21.26 providers) that inserts a one-page summary into a new document and leaves the original untouched.
  - **Structure.** A `Transform` view lists the options with a short preview of the result, a destination picker, and a progress/error line. Pandoc-backed ones call a generalised `export_document` that takes a target format and extra args from an allow-list, never raw strings from the UI. Output is always a new file or new document; the open document is never changed.
  - **Risks.** Pandoc must be installed (the existing export already depends on it; reuse its error message). Slides and EPUB depend on a clean heading structure, so the view should warn when the document has no Heading 1.
  - **Decision for the owner:** confirm the order, and whether the AI summary belongs here or in the AI tab.

## Phase 22 — Visual parity audit (screenshots of 2026-10-19)

Source: the 48 top-level files in `screenshots/` taken on 2026-10-19 (`screenshots/old/` ignored). Left out as Microsoft-only: "More … from Office.com" entries (equations, cover pages, SmartArt "Office.com" category), Microsoft Search box, AutoSave to the cloud / OneDrive and SharePoint server-draft settings, Trust Center and Privacy Settings, "store my languages in the cloud", Office Background (Microsoft account artwork), Ink Equation, the Claude/Add-ins ribbon group from the account. Items that duplicate Phase 21 are marked (= 21.x) and not repeated.

### Missing Core Features

#### 22.1 — SmartArt Design contextual tab (screenshot 081722)

- No SmartArt Design tab exists; only the Insert gallery and a dialog. Build the tab: Create Graphic (Add Shape + menu, Add Bullet, Text Pane, Promote, Demote, Move Up, Move Down, Right to Left, Layout), Layouts gallery, Change Colors, SmartArt Styles gallery, Reset Graphic.
- Add the SmartArt Format tab (shape styles, WordArt, Arrange, Size as on the Shape Format tab) and the Text Pane with the small `‹` tab on the frame.

  **Done (partly).** A SmartArt graphic now brings a SmartArt Design tab (full and single-line ribbon): Create Graphic (Add Shape After/Before, Add Bullet, Text Pane, Promote, Demote, Move Up, Move Down, Right to Left), Layouts (the seven layouts as a row with the arrow stack), Change Colors, SmartArt Styles (Simple Fill, Subtle Effect, Intense Effect) and Reset Graphic. The graphic now has outline levels per item (`levels`, with `rtl` and `style`, saved in the app's own format), the Design tab acts on the shape the caret was last in, and the Text Pane (a floating list, `smartart-text-pane.tsx`) edits the same items. Tests: `smartart-model.test.ts` (add, bullet, promote, demote, move). Checked in Chrome: the tab appears, Demote indents and shrinks the shape, the pane lists the outline. Not done: the SmartArt Format tab (shape styles, WordArt, Arrange, Size) and the `‹` tab on the frame; layouts do not draw the levels as a tree (they indent); Move Up/Down of the first/last item and Right to Left, Styles, Reset and Colors were not clicked through in Chrome; the layout row shows names, not pictures; SmartArt made in the app is saved to `.docx` as its picture with the graphic kept inside (as before), not as a Word diagram; whether the new levels, direction and style come back after a save and reopen was not tested.

#### 22.2 — Equation contextual tab (screenshot 081453; extends 21.23)

- An Equation tab: Tools (Equation menu), Conversions (Unicode / LaTeX / Text and Convert), Symbols gallery with its category drop-down, Structures (Fraction, Script, Radical, Integral, Large Operator, Bracket, Function, Accent, Limit and Log, Operator, Matrix), each with a gallery.
- Equation gallery (081431): Built-In list with Area of Circle, Binomial Theorem, Expansion of a Sum, Fourier Series, Pythagorean Theorem rendered, scrolling; "Save Selection to Equation Gallery…" for the user's own.

  **Done (partly).** The Equation tab already had Edit Equation, Structures and Symbols. New: Tools → Equation gallery (Built-In: Area of Circle, Binomial Theorem, Expansion of a Sum, Fourier Series, Pythagorean Theorem, Quadratic Formula, drawn; your own under General; "Save Selection to Equation Gallery…" asks for a name and keeps the equation in this browser/profile); the Insert tab's Equation gallery now uses the same list (it gains Fourier Series); Conversions (Unicode / LaTeX / Text and Convert, which turns the selected equation into text of that kind); Symbols shows the chosen category's symbols with a category drop-down; Structures now has Limit and Log and Operator beside Fraction, Script, Radical, Integral, Large Operator, Bracket, Function, Accent and Matrix. Tests: `equation-gallery.test.ts`. Checked in Chrome: the tab, Convert on the Pythagorean equation gives `a^2+b^2=c^2` in the line. Not done: Convert only goes from equation to text (not text back to an equation, nor Word's Professional/Linear switch); the symbol row shows the first 14 of a category and has no "more" gallery; Structures open lists, not Word's pictured galleries with sub-groups; the saved gallery is not shared between machines; the gallery menu and Save Selection were not clicked through in Chrome.

#### 22.3 — Table Design: Shading and Border tools (screenshot 081403)

- Missing: Shading drop-down, Border Styles gallery, line style / weight / Pen Color boxes, Borders menu (Bottom, Top, Left, Right, No, All, Outside, Inside, Inside Horizontal, Inside Vertical, Diagonal Down, Diagonal Up, Horizontal Line, Draw Table, View Gridlines, Borders and Shading…), Border Painter, and the Borders group dialog launcher. Today the group has only All Borders and No Border.

  **Done.** Most of this came with 21.30 (Shading, Border Styles, Line Style / Weight / Pen Color, the Borders menu with the diagonals, Horizontal Line and Borders and Shading…, Border Painter). New on 2026-10-22: the Borders group has its dialog launcher (opens Borders and Shading); the Borders menu lists Draw Table (a 3×3 table, as the Layout tab's); Borders is a split button in both layouts (`RibbonCommand` with `onClick` and `menu` now draws Word's large split: picture and label do the command, the arrow opens the menu), which applies again the border last chosen from its menu, Bottom Border to begin with, as in Word; its tooltip names that border. Tests: `table-design-menus.test.tsx` (the menu's rows in Word's order, choosing one applies it and reports it, Draw Table). Checked in Chrome, classic and single line, light and dark: pressing Borders put a bottom border on the cell, Top Border from the menu then a top border on the next cell, the launcher opened the dialog. Not done: Word's icons for Line Style and Line Weight (the single line row uses one borders icon for all six commands); the gaps 21.30 lists (Word's `tcBorders` are not read back into the menu state, the painter does not set the neighbouring cell's facing edge, no eraser mode).

#### 22.4 — Borders and Shading dialog (screenshots 083136, 083202, 083207, 083250, 083304)

- The existing dialog (`design-dialogs.tsx`) is a page-border panel only. Build Word's three tabs: Borders (Setting None/Box/Shadow/3-D/Custom, or None/Box/All/Grid/Custom for a table; Style list; Color; Width; clickable Preview with edge buttons incl. diagonals; Apply to Text / Paragraph / Cell / Table; Options…), Page Border (adds Art, Apply to Whole document / This section / first page only / all except first), Shading (Fill, Patterns style and color, Apply to, Preview).
- Reachable from the Home Borders menu, the Table Design Borders menu and the table's right-click.

  **Done (first pass).** Borders and Shading… in the Home and Table Design Borders menus opens one dialog with Word's three tabs (`components/borders-shading-dialog.tsx`). Borders: Setting (None, Box, All for a table, Custom), Style list, Color with Automatic, Width in points, a Preview whose edge buttons toggle top, bottom, left, right (and, for a table, the lines between cells; for a cell, both diagonals), Apply to Paragraph, or Cell / Table inside a table. Page Border: the existing page border panel (`PageBorderPanel`), applied to the page setup. Shading: Fill with No Color, Apply to, and a preview. OK applies only the tabs that were touched; Cancel changes nothing. A table or cell is set exactly to the preview (`setBordersOnCells`, `shadeScope` in `table-tools.ts`); a paragraph gets the sides and the fill. Tests: `border-painter.test.ts` (the table side), `borders-shading-dialog.test.tsx`. Checked in Chrome: from Table Design → Borders → Borders and Shading…, Box on a cell set its borders to all. 22.3 is covered by 21.30 (Shading, Border Styles, Border Painter, Line Style / Weight / Pen Color, the Borders menu with diagonals, Horizontal Line, Borders and Shading…). **Follow-up (2026-10-21).** The dialog now opens on what is drawn (`readScopedBorders` in `table-tools.ts` reads a cell's or table's edges, pen and fill back; a paragraph's sides and fill), and a right-click inside a table lists Borders and Shading… (text context menu). Checked in Chrome: Box on a cell, reopen shows Box set. Not done: Shadow and 3-D settings (Shadow is shown disabled), Grid as a separate setting, Options… (text distance), Patterns in Shading, Apply to Text, Page Border's Art, Whole document / This section / first page choices; a paragraph's pen (style, colour, width) is not kept, only its sides.

  **Done 2026-10-26** (see `changes.md`): a paragraph keeps its pen and Word's Shadow setting, on screen and in
  `.docx` (`w:shadow` is now read and written on every border); Shadow is enabled for a paragraph; a pen change alone
  applies. Left: Patterns, Options… (text distance), Apply to Text, 3-D, Grid, Page Border Art and scopes; the gap
  between a paragraph's text and its box.

  **Done 2026-10-26** (see `changes.md`): Options… sets a paragraph's distance from text (`borderSpace`, `w:space`
  read and written per side), and the box is drawn that far out from the text, which keeps its place. Left:
  Patterns, Apply to Text, 3-D, Grid, Page Border Art and scopes, Options for page borders and table cells.

  **Done 2026-10-26** (see `changes.md`): Shading > Patterns (style and colour) for a paragraph, drawn and kept in
  `w:shd`. Left: patterns for table cells, Apply to Text, 3-D, Grid, Page Border Art and scopes.

  **Done 2026-10-26** (see `changes.md`): Apply to Text: box, shadow, fill and pattern on selected text
  (`textBorder` mark, `w:bdr` / `w:shd` in `w:rPr`). Left: patterns for table cells, 3-D, Grid, Page Border Art and
  scopes.

  **Done 2026-10-26** (see `changes.md`): page borders are read from and saved to `.docx` (`w:pgBorders`, Word's
  element kept while unchanged, art included); Page Border has Apply to (whole document, this section, first page
  only, all except first) and Options… (margins, Measure from Text / Edge of page), drawn per page. Left: patterns
  for table cells, 3-D, Grid, Page Border Art (drawn and offered), per-side page borders, the page Options check
  boxes.

  **Fixed 2026-10-26** (see `changes.md`): a right-click in a table selected the whole table, so Apply to: Cell
  from the table menu changed every cell; it now puts the caret in the cell clicked.

  **Done 2026-10-26** (see `changes.md`): Shading patterns for table cells (Cell or Table), drawn under the
  diagonals and kept in the cell's `w:shd`; a Word cell's pattern is drawn. Left: 3-D, Grid, Page Border Art,
  per-side page borders, the page Options check boxes, reading a Word cell's fill and pattern back into the dialog.

  **Done 2026-10-26** (see `changes.md`): 3-D for a paragraph (`w:frame` read and written, drawn as the box). Left:
  Grid, Page Border Art, per-side page borders, the page Options check boxes, reading a Word cell's fill and pattern
  back into the dialog.

  **Done 2026-10-26** (see `changes.md`): Grid for a table (thin inside lines, per-side cell pens kept in
  `w:tcBorders`). Left: Page Border Art, per-side page borders, the page Options check boxes, reading a Word cell's
  fill and pattern back into the dialog.

  **Found 2026-10-26, fixed the same day (see `changes.md`; the guide is now drawn under the borders):** with View
  Gridlines on, the dashed guide (`outline` on every cell in
  `index.css`, `table[data-gridlines="1"]`) is drawn over drawn borders too, so solid lines look dashed; Word shows
  gridlines only where a side has no border. Needs the guide drawn per side from the cell's actual borders (app
  `borders` and Word's `data-word-cell` / table frame), not one outline per cell.

  **Done 2026-10-26** (see `changes.md`): a Word cell's fill and pattern are read back into the dialog, and a new
  fill, pattern or clearing shows over Word's and saves merged with it. Left: Page Border Art, per-side page
  borders, the page Options check boxes, the View Gridlines guide over drawn borders.

  **Done 2026-10-26** (see `changes.md`): Page Border sides from the preview's edge buttons, read and written per
  side. Left: Page Border Art, a different line per page side, the page Options check boxes.

  **Done 2026-10-26** (see `changes.md`): the page Options check boxes (settings.xml and `w:zOrder`; Surround header
  and footer drawn). Left: Page Border Art, a different line per page side, drawing Always display in front and
  Align paragraph borders.

#### 22.5 — Customize Ribbon and Quick Access Toolbar (screenshots 083125, 083136)

- None exists. Two lists with "Choose commands from" (Popular, All, Not in the Ribbon, tabs…), Add / Remove, up/down, New Tab / New Group / Rename, Reset, Import/Export, per-tab visibility check boxes; Quick Access Toolbar with Separator, "Show Quick Access Toolbar", Toolbar Position (Above/Below Ribbon), "Always show command labels", For all documents / this document. Keep the choice in the user config.

  **Done (partly).** New: a Customize the Ribbon and Quick Access Toolbar dialog (`customize-dialog.tsx`), opened from the arrow at the end of the Quick Access Toolbar (More Commands…) or from Options → Ribbon. Quick Access Toolbar page: Show Quick Access Toolbar, a list of commands (New, Open, Save, Save As, Print, Undo, Redo, Bold, Italic, Underline, AI, and a Separator) with Add and Remove, Move Up and Down, Reset; the arrow's menu also toggles each command. Customize Ribbon page: check boxes to show or hide each main tab (Home always shows). The choice is kept in this browser or profile (`aiword.customize`) and read back on start; OK applies, Cancel changes nothing. Tests: `customize.test.ts`, `customize-dialog.test.tsx`. Checked in Chrome: the toolbar arrow menu, More Commands… and the dialog. **Done 2026-10-27:** any ribbon command goes on the toolbar (right-click → Add to Quick Access Toolbar, or the dialog), "Choose commands from" lists Popular, All and each tab, Toolbar Position (below the ribbon) and Always show command labels (see changes.md). Import/Export done 2026-10-27 (JSON, see changes.md). Not done: New Tab, New Group, Rename and moving ribbon groups or commands; "Commands Not in the Ribbon"; "For this document" (the choice is for all documents); hiding a tab was tested in the dialog tests but not seen live in Chrome.

#### 22.6 — Chart types still missing in Insert Chart (screenshot 081749)

- Present: Column, Line, Pie, Bar, Area, X Y (Scatter), Radar. Missing: Templates, Map (local file data only), Stock, Surface, Treemap, Sunburst, Histogram, Box & Whisker, Waterfall, Funnel, Combo, and the 3-D variants of Column, Bar, Line, Pie, Area.
- Round-trip each through .docx chartex where Word writes it.

  **Done (partly).** Insert Chart and Change Chart Type now list Histogram, Waterfall and Funnel (`chart-expand.ts`). Each keeps the data as typed and is drawn, and saved to .docx, as the ordinary chart that looks like it: Histogram bins the first series (ceil(log2 n + 1) bins) into touching columns; Waterfall floats each change from the running total (green up, red down) and adds a Total column; Funnel is centred bars with the first category on top. Tests: `chart-expand.test.ts` (bins, running totals, expansion, drawing, saving). Checked in Chrome: Waterfall and Funnel in the Insert Chart dialog preview. **Surface (2026-10-26).** All four variants drawn and saved as Word's own surface charts (round trip); stepped
  contour edges, no 3-D rotation. **Treemap and Sunburst (2026-10-26).** Own painters over a label tree (`levels`: Branch / Stem columns in the
  sheet); Word gets the leaves as columns or a doughnut; both reopen as themselves. **Box & Whisker (2026-10-26).** Its own painter (quartiles by exclusive median, whiskers to 1.5 × IQR, outliers,
  mean ×, a label per statistic); Word gets the medians as columns; reopens as itself. No inclusive-median option, no
  inner points. **Stock (2026-10-26).** High-Low-Close and Open-High-Low-Close, drawn as Word's (high-low lines, up/down
  bars, Close tick), saved and read as `c:stockChart`; the dialog preview now uses each type's own sample. Not done:
  Map (Filled Map done 2026-10-27, countries only; see changes.md), Combo
  beyond the three that exist. Templates done 2026-10-27 (see changes.md). **Volume stock charts (2026-10-27):** Volume-High-Low-Close and
  Volume-Open-High-Low-Close, the volume as columns on the left axis and the prices on a right one, saved as Word's
  bar group plus stock group. **3-D and of-pie (2026-10-27):** the 3-D variants of Column (4), Bar (3),
  Line, Pie and Area (3), Pie of Pie and Bar of Pie, drawn and saved as Word's own 3-D and of-pie charts (see
  changes.md); 3-D Rotation (X, Y, Right Angle Axes, Perspective kept but not drawn, Depth) in the Format pane since 2026-10-27, Height (% of base) and Autoscale since 2026-10-27 (not for 3-D pie), but no view from below or the left; of-pie split by value, percentage and custom points, and Second Plot Size, since 2026-10-27; since 2026-10-27 they are written as Word's own chartex charts with the plain chart as the fallback, Pareto exists, and Word's chartex charts open (see changes.md) (since 2026-10-26 they come back
  into the app as Histogram/Waterfall/Funnel while Word has not edited their data); Waterfall Set as total, bars below and across zero, per-point colours, and Box & Whisker Series Options (inner points, outliers, mean markers, mean line, inclusive/exclusive quartiles), saved in chartex, since 2026-10-27; Histogram bins (Automatic by Scott's rule, By Category, Bin width, Number of bins, Overflow, Underflow) since 2026-10-27, kept in the app's own copy of the chart only; Histogram was not looked at in Chrome.

#### 22.7 — Columns dialog and the Text Wrapping break (screenshots 082750, 082741, 082806)

- Breaks menu: add the Text Wrapping break. Add "Line between", per-column Width and Spacing, "Equal column width", "Start new column", Apply to (Whole document / This point forward / Selected text) and a Preview.
- Columns: add the Left and Right presets and "More Columns…" (the dialog does not exist).

  **Done (partly).** Layout → Breaks has Text Wrapping (a line break, `w:br`). Layout → Columns now lists One, Two, Three and More Columns…; the old "Selected text" group moved into the new Columns dialog (`columns-dialog.tsx`): presets, Number of columns (1–3), Spacing, Line between, and Apply to (Whole document / Selected text). Line between is a new page-setup field (`columnLine`) saved as `w:cols/@w:sep` in `.docx` and as `aiword-colline` in the app's own header, drawn as a rule in each gap, kept in print. Tests: `columns-dialog.test.tsx`, `column-line.test.ts`. **Follow-up (2026-10-20).** Preview pane (count, spacing, line between); Line between now works for a selected-text section (`line` attribute, `data-line="1"`, drawn with `column-rule`; editor/HTML only, selected-text sections are not written to .docx); a select-all apply now leaves the cursor inside the new section (the spacing was silently skipped before); the Presets radios no longer overflow. Checked in Chrome (headless): dialog and the ruled two-column result. Not done: Left and Right presets and per-column Width, Equal column width, Start new column and "This point forward" (the layout engine only has equal columns, up to three). **2026-10-27:** a column break (Layout → Breaks → Column, Ctrl+Shift+Enter) was dropped on save; it is now written as Word's paragraph holding `<w:br w:type="column"/>` and opens as a column break again. A column break in the middle of a Word paragraph still opens as a line break. Unequal columns (Left, Right, per-column widths) cannot be drawn with the browser's columns, which are always equal; they need a column layout of the editor's own.

#### 22.8 — Paragraph dialog gaps (screenshots 082827, 082832)

- Collapsed by default (with Outline level), Suppress line numbers, Don't hyphenate, Textbox options: Tight wrap, Keep lines together, Page break before: verify each is wired to layout and .docx (`w:suppressLineNumbers`, `w:suppressAutoHyphens`, `w:textboxTightWrap`).

  **Done.** Outline level, Keep with next, Keep lines together and Page break before were already in the paragraph model and `.docx`. New: `suppressLineNumbers`, `suppressAutoHyphens` (Don't hyphenate), `mirrorIndents` and `textboxTightWrap` are read, kept through the dialog and written in schema order, and only when set. Suppress Line Numbers is honoured by the line numbering (`collectLineNumbers`), Don't hyphenate by `hyphens: none`. The page layout now starts a "Page break before" paragraph on a new page and moves a "Keep lines together" paragraph whole to the next page when it would be split and fits one page. Tests: `paragraph-box.test.ts` (schema order, reopen, plain paragraph writes none), `pages.test.ts` (`mustMoveToNextPage`), fixture `f24_paragraph_exceptions.docx`. Widow/orphan control and Keep with next are now honoured by the layout (`page-breaking.ts`: `linesOnPage`, `keepWithNextMustMove`, tested; wired into `layoutPages`): with widow control (Word's default, off only when a paragraph sets it so) a page end never leaves one line of a paragraph alone and a paragraph of fewer than four lines is not split; a Keep-with-next paragraph moves to the next page when the first two lines of what follows (all of it, for a chain of them) would not fit under it. Checked in Chrome with 40 paragraphs of mixed length: all 5 split paragraphs have at least two lines on each side; Keep with next was not tried in Chrome. Not done: the wiring in `layoutPages` is not unit-tested (jsdom cannot measure) and the page-break and keep-lines wiring in `layoutPages` is not unit-tested (jsdom cannot measure) and not checked in Chrome; Mirror indents now take effect (22.8 follow-up): on an even page the paragraph's left and right indents swap (`mirroredMargins`, a node decoration from the layout; checked in Chrome: 72 px / 0 on odd pages, 0 / 72 px on even ones; the swap does not re-measure line wrapping, so a mirrored paragraph that wraps differently may shift one line; first-line and hanging indents are not mirrored). Tight wrap is saved but has no layout effect; "Collapsed by default" is not written to `.docx`.

#### 22.9 — Word Options dialog (screenshots 083008 … 083117, 083136)

Today Options is a backstage page of five cards (`OptionsView`). Word's is a modal with a left list: General, Display, Proofing, Save, Language, Accessibility, Advanced, Customize Ribbon, Quick Access Toolbar, Add-ins (Trust Center is out of scope). Missing options, by page:

- General: Show Mini Toolbar on selection, Enable Live Preview, Update document content while dragging, Collapse the ribbon automatically, ScreenTip style (feature descriptions / no descriptions / don't show), User name and Initials, "Always use these values", Office Theme (Colorful / Dark Gray / Black / White) and "Never change the document page color", Show the Start screen when the app starts.
- Display: white space between pages, highlighter marks, document tooltips, per-mark formatting marks (Tab characters, Spaces, Paragraph marks, Hidden text, Optional hyphens, Object anchors, Show all), print options (drawings, background colors and images, document properties, hidden text, update fields and linked data before printing).
- Proofing: AutoCorrect Options, Ignore UPPERCASE / words with numbers / Internet addresses, Flag repeated words, Suggest from main dictionary only, Custom Dictionaries, grammar options (Mark grammar errors as you type, Frequently confused words, Check grammar with spelling, Show readability statistics, Writing Style and Settings), Recheck Document, language modes (French, Spanish, German).
- Save: default format, AutoRecover every N minutes, keep last AutoRecovered version, AutoRecover and default local file locations (Browse…), default personal templates location, additional places for saving, Embed fonts (only used characters, no common system fonts).
- Language: display language and authoring/proofing language lists with Add, Remove, Move Up/Down, Set as Preferred; link to the system keyboard settings.
- Accessibility: Keep accessibility checker running, Provide feedback with sound/animation, Show shortcut keys in ScreenTips, Automatically generate alt text, Expand all headings when opening a document.
- Advanced: Editing options (typing replaces selection, select entire word, drag and drop, Ctrl+Click to follow hyperlink, drawing canvas, smart paragraph selection, smart cursoring, Insert key / overtype, prompt to update style, Normal style for lists, track formatting, click and type, AutoComplete suggestions), Cut/copy/paste (the five Pasting defaults, Insert/paste pictures as, Keep bullets and numbers, Insert key for paste, Show Paste Options button, smart cut and paste), Pen, Image Size and Quality (discard editing data, do not compress, default resolution), Chart (properties follow data point), Show document content (backgrounds, text wrapped in window, drawings and text boxes, bookmarks, text boundaries, crop marks, field codes, field shading, draft font, Font Substitution), Display (recent documents and folders count, measurement units, style area pane width, pixels for HTML, scroll bars, vertical ruler, character positioning, subpixel positioning, pop-up add row/column buttons), Advanced Typography (smart justification, hyphenation), Print (draft quality, background, reverse order, field codes, duplex front/back, scale for A4/Letter, default tray), Save (backup copy, background saves, embed linguistic data), General (confirm conversion on open, update automatic links at open, background repagination, File Locations…, Web Options…, mailing address), Layout options and Compatibility options for the open document (each `w:compat` flag the layout engine honours).
- Each option needs a settings store, a Word-style default, and its effect in the editor; list the ones the engine cannot honour as disabled with a note rather than hiding them.

**Done (partly).** Options is now a left list of pages (General, Display, Proofing, Save, Language, Accessibility, Advanced, Customize Ribbon, Quick Access Toolbar) in `OptionsView`; the existing cards moved onto their pages, Proofing carries the real spell-check toggle, Language shows the first-run locale and date format, Quick Access Toolbar opens the Customize dialog, and options the app cannot honour (UPPERCASE/numbers/addresses ignore, repeated words, grammar, accessibility feedback, editing languages) are listed switched off with a note. Test: `options-pages.test.tsx`. New: Show Mini Toolbar on selection (General) is a real option (`editing-options.ts`, kept in this browser). **Follow-up (2026-10-22).** Options is now a modal (`OptionsDialog`, File > Options and Tell Me open it over the document; choices apply as made, Close shuts it) and has an Add-ins page. **Follow-up (2026-10-22, five more options made real).** Provide feedback with animation (off stops every animation and transition, `data-no-motion` on the root), Show shortcut keys in ScreenTips, Keep accessibility checker running (off: the status bar shows "Accessibility: Check" and does not scan), Suggest from main dictionary only (hides words the user added from suggestions) and Show readability statistics (Flesch Reading Ease and Flesch-Kincaid Grade Level in Word Count; `lib/readability.ts`). **Per-mark formatting marks (2026-10-22).** Options > Display > Always show these formatting marks: Tab characters, Spaces, Paragraph marks, Hidden text and Optional hyphens each draw on their own with Show/Hide ¶ off (classes `fm-tabs`, `fm-spaces`, `fm-paras`, `fm-hidden`, `fm-hyphens` on the page; `formatting-marks` still means all). Object anchors stays off. **Print options (2026-10-22).** Options > Display > Printing options: Print drawings and shapes, Print background colors, Print hidden text (all follow `@media print` rules keyed on root attributes) and Print document properties (a page of properties after the document). Defaults keep today's printing (drawings and page colour print, hidden text does not; Word's default for page colour is off). Update fields and Update linked data before printing stay off. **Advanced editing options (2026-10-22).** Options > Advanced > Editing options (`editor/editing-behavior.ts`): Typing replaces selected text (off: text goes in front and the selection stays), Allow text to be dragged and dropped, Use Ctrl + Click to follow hyperlink (links did not open at all before; http(s), mailto, tel and #bookmark links), Use the Insert key to control overtype mode and Use overtype mode (status bar shows Insert/Overtype), and Pasting within the same document / from other programs: Keep Source Formatting, Merge Formatting (keeps bold, italic, underline, strike, links, sub/superscript) or Keep Text Only. Still off: select entire word, smart paragraph selection, smart cursoring, prompt to update style, keep track of formatting, click and type, Paste Options button, AutoComplete. Not Chrome-checked: drag and drop off, link follow. **Show document content (2026-10-22).** Options > Advanced > Show document content, each with Word's default: Show background colors and images (off: the page is white on screen and the watermark is not drawn), Show picture placeholders (an empty frame the size of each picture), Show drawings and text boxes on screen (off: shapes, text boxes, drawing canvases and SmartArt keep their place but are not drawn), Show bookmarks (off by default, as in Word; on: grey brackets around bookmarked text, an I-beam at a bookmark from a .docx), Show text boundaries (the faint margin guide the page always drew is now this option: off by default, dotted when on), Show crop marks (a short line along each text edge at the four corners), Show field codes instead of their values (also Alt+F9; a field draws its result in a `.field-value` span and its code in `data-field-code`, `editor/field-codes.ts`: `{ = 2 + 2 }`, `{ DATE \@ "M/d/yyyy" }`, `{ IF a <> b "yes" "no" }`, and a .docx field's own instruction, `{ PAGE }`, `{ TOC \o "1-3" \h }`), Field shading (Never / Always / When selected, Word's default, so fields are no longer grey until selected), and Use draft font in Draft and Outline views with its name and size. Found while doing this: the print rule for "Print drawings and shapes" matched `figure[data-kind]`, but a shape is a `div.insert-figure`, so it never hid anything; fixed, and it now also covers text boxes, canvases and SmartArt. Tests: `field-codes.test.ts`, `editing-options.test.ts`, `options-pages.test.tsx`, `chrome-fields.test.ts` (a page number in a header copy with the nested span). Checked in headless Chrome, light and dark: every switch, Alt+F9, page colour off, the Outline draft font, a header page number still numbered. Still off: Show text wrapped within the document window (no Draft reflow), Font Substitution… Still off: grammar as you type, feedback with sound, automatic alt text (the AI cannot see pictures), the language lists. Not done: none of the per-option settings in the lists above that need a new store and editor effect (Mini Toolbar, Live Preview, ScreenTip style, per-mark formatting marks, AutoRecover, embed fonts, paste defaults, Advanced editing/print/compat options). Checked in Chrome: the nine pages switch and Proofing shows its options disabled.

### Functional Parity Enhancements

#### 22.10 — Table Layout tab (screenshot 081415; extends 21.4)

**Done (2026-10-26).** Double-clicking a column's right border fits the column to its contents (from free room, then
the right neighbour down to its own contents); end-of-cell marks no longer move the text when the caret enters a
table; dragging a row's border resizes it live. Checked in headless Chrome.
With the whole table selected, a column border's double-click fits every column within the page; a row border's
double-click fits the row (every row with the table selected).

**Done (2026-10-26, Table Properties as Word's).** Table Properties... is on the table right-click menu, and the
dialog has Word's layout: Size, Alignment with Indent from left, Text wrapping, Borders and Shading..., Options...
(Table Options); Row with Row height is and Allow row to break across pages, Previous / Next Row; Column with
Previous / Next Column; Cell with Preferred width, Vertical alignment and Options... (Cell Options); Alt Text. All of
it is saved to .docx. Not done: wrapping text around a table, and drawing Fit text. See `changes.md`.

**Done (2026-10-27, text wrapping around tables).** Around, Table Positioning (horizontal and vertical place and what
it is measured from, distances from the text, Move with text, Allow overlap, Remove Positioning), and dragging the
move handle to float a table where it is dropped; saved as `w:tblpPr` / `w:tblOverlap`. Not done: text on both
sides of a table in the middle of the page, splitting a floating table across pages, keeping overlapping floating
tables apart.

**Done (2026-10-27, tables across pages).** Tables did not break across pages at all: one taller than the room left
jumped to the next page whole and ran off its bottom. Now every table breaks between rows (rows a merged cell spans
stay together), with the first row drawn again at the top of each page when the table repeats its header row. A
floating table that would run past the end of its page goes into the text there and breaks the same way. A floating
table with Allow overlap off moves down past the floating tables it would cover. Text on both sides of a table is on
the backlog (Future features). Not done: a row taller than a page is not split inside; "Allow row to break across
pages" is not honoured (rows never split); the text beside a floating table's first part, as Word keeps it.

- Present and matching: all groups. Missing: Properties button (Table Properties dialog), Cell Size dialog launcher and Rows & Columns launcher, Height and Width spin boxes shown beside AutoFit in cm with a live value, 3×3 alignment grid sized as Word's (three-by-three, 22 px), Select menu items (Cell, Column, Row, Table).
- The floating table toolbar (081826 shows Word's own) should be Font, Size, Grow/Shrink, bullets, numbering, Bold, Italic, alignment, highlight, font color, shading, borders, format painter, Insert, Delete, New Comment, Insert Below, Delete Rows, Merge Cells (21.7 covers dark mode only).

  **Done (Properties and launchers).** Table Layout → Table → Properties (both ribbon layouts), and the launchers of Rows & Columns and Cell Size, open Table Properties (`components/table-properties-dialog.tsx`) with Table, Row, Column and Cell tabs: cell margins (Narrow / Normal / Wide), View gridlines, Repeat as header row, Borders and Shading…; Specify height and the row height in cm; the column width in cm; the cell's vertical alignment. OK applies only what changed (`applyTableProperties` in `table-layout.ts`), so an untouched field never rewrites the table; Cancel changes nothing. The Height and Width boxes, the 3×3 alignment grid and the Select menu were already there. Tests: `table-properties-dialog.test.tsx`. Not looked at in Chrome (the browser tab became unreachable during the check). **Follow-up (2026-10-21).** Table tab: Alignment (Left / Center / Right; `align` on the table, `data-align`, saved as `w:jc`); new Alt Text tab (Title, Description; `altTitle` / `altDesc`, saved as `w:tblCaption` / `w:tblDescription`). Found while doing this: row height, repeat-as-header-row and a cell's vertical alignment set in this dialog were never written to .docx; they are now (`w:trHeight` keeping its hRule, `w:tblHeader`, `w:vAlign`; a Word row height now also shows in the editor). Cell margins (`w:tblCellMar`) are still not saved. **Done 2026-10-27:** custom table and cell margins were already saved; the Narrow / Normal / Wide presets (Cell Margins button, Table Properties) now set the table's margins, so they are saved as `w:tblCellMar`, reopen as the same preset, and replace margins a Word table came with. Tests: `table-alt.test.ts`, `table-properties-dialog.test.tsx`. Checked in Chrome: Center + Alt Text from Table Layout → Properties. Not done: preferred width and text wrapping (the editor draws a table at 100% or the sum of its column widths), Options…, "Allow row to break across pages" (shown as a note), the floating table toolbar's full command set, and the launchers do not yet open the exact tab Word does for Cell Size (they open Column).

#### 22.11 — Shape Format tab (screenshots 081539, 081637)

- Compare the Insert Shapes gallery rows, Edit Shape menu (Change Shape, Edit Points, Convert to Freeform), Draw Text Box, Text group (Text Direction, Align Text, Create Link — the last greyed when nothing is selected), Alt Text, Size launcher. Verify each exists and is disabled and enabled as in Word; the WordArt row greys out when the shape has no text.
- Shape yellow adjustment handles on the Layout Options-selected shape (081607): verify every shape in the gallery has its Word adjustment handles (081607 shows the Division sign with three).

**Done (partly).** Audited the Shape Format tab against the list: Edit Shape (Change Shape, Edit Points, Reroute Connectors), Draw Text Box, Text Direction and Align Text (off without a text box), Create Link (always off), Alt Text and the WordArt row already existed; added the missing Convert to Freeform row (disabled with a note, like Edit Points). **Done 2026-10-27:** Edit Points and Convert to Freeform work (shapes hold their outline as points, saved as Word's `a:custGeom`; see changes.md). The resize handles are hidden while editing, and the point and segment right-click menus and curve handles are done (2026-10-27, see changes.md); dragging a segment bends it (2026-10-27), and the box grows while dragging (2026-10-27). Create Link and Break Link done 2026-10-27 (see changes.md). Not done: the per-shape adjustment-handle audit against the gallery; not compared visually in Chrome.

#### 22.12 — Layout Options pane (screenshot 081612)

- Check against Word: header "Layout Options" with close, "In Line with Text" and six "With Text Wrapping" icons, "Move with text" and "Fix position on page" radios with info tooltips, "See more…". Info icons and the keyboard focus order are the likely gaps.

**Done (partly).** The pane already had the header, In Line with Text, the six wraps, both radios and See more…; added a Close button, info icons with tooltips on the two radios, and focus moving to the first enabled wrap when it opens. Arrow keys now move between the wrap tiles. Not done: Tab order inside the pane was not checked; not looked at in Chrome; no test (the pane depends on DOM measurement jsdom can't give).

**Removed 2026-10-26** (owner's request, see `changes.md`): the Layout Options button and pane are gone; the same
choices are in the object toolbar's and the ribbon's Wrap Text menus and the right-click menu.

#### 22.13 — SmartArt dialog (screenshot 081705)

- Categories All, List, Process, Cycle, Hierarchy, Relationship, Matrix, Pyramid, Picture; a 4-column thumbnail grid of every layout, and on the right a preview with name and description. Ours has five layout ids; add the missing layouts (Relationship, Matrix, Pyramid, Picture and their variants) and the preview pane.

**Done (partly).** The dialog now opens on an All category listing every layout, uses a 4-column grid, and the preview shows the layout name and a description; selection is by position so variants that share a layout (Basic List / Vertical List) highlight correctly. A Picture category is listed, disabled with a note. Relationship, Matrix and Pyramid already existed. Not done: Word's many other layouts and the Picture ones are not built (each needs CSS and a thumbnail). Vertical List and Chevron Process are now real layouts of their own (stacked rows with indented sub-items; chevron-shaped steps), no longer drawn as List and Process. Checked in Chrome: All category, four columns, described preview, Picture disabled.

#### 22.14 — Chart side panels (screenshots 082327–082511)

- Chart Styles (brush): the Style tab shows live thumbnails of the current chart in each style; the Color tab has Colorful and Monochromatic groups and "How do I change these colors?". Chart Filters (funnel): Values tab with Series and Categories sections, Select All, check boxes, Apply and "Select Data…"; Names tab. Chart Elements (+): Axes, Axis Titles, Chart Title, Data Labels, Data Table, Error Bars, Gridlines, Legend, Trendline, Up/Down Bars, each with a flyout. Verify every item and the Apply button behave as in Word.
- Chart Design styles gallery shows eight thumbnails of the actual chart type; ours should render the user's own chart in each. **Already done** (found 2026-10-27: `ChartStylesGallery` draws `withStyle(chart.spec, style)`, the chart itself in each style). **2026-10-27:** small thumbnails now draw text as bars and keep the plot's share, as Word's do.
- Edit Data opens a small "Chart in …" spreadsheet window pinned under the chart (081826 shows Word's); match this as a docked pane rather than a dialog.

**Done (partly).** Audited the panels: Chart Elements (check box per element with flyouts), Chart Styles (Style tab with the user's own chart in each style, Color tab with Colorful and Monochromatic), Chart Filters (Values and Names tabs, Apply, Select Data…) and the Chart Design styles gallery already existed. Added (Select All) to the filter Values tab and a "How do I change these colors?" note under the Color tab. Not done: Error Bars, Lines and Up/Down Bars stay disabled (the chart renderer has none); the "How do I change" text is a note, not a link to help; Edit Data is still a dialog, not a docked "Chart in …" pane; not compared in Chrome.

#### 22.15 — 3D Model tab (screenshot 082635)

- Word's groups: Play 3D (Pause, Scenes), Adjust (3D Models, Reset 3D Model), 3D Model Views gallery of preset angles, Accessibility, Arrange, Size with Pan & Zoom. Ours has Camera (Front, Lighting, Presets) and no Play 3D animations: add Pause and Scenes (turntable, swing, jump & turn, arrive, leave, turn).

**Done (partly).** Added Play 3D: a Scenes menu (Turntable, Swing, Jump & Turn, Arrive, Leave, Turn) and Pause in the 3D Model ribbon tab (both layouts) and the object bar. The scene is a `scene` attribute on the model (`data-scene`); the live viewer animates it from the resting pose and Pause puts the model back. Motion is in `model-scenes.ts` with tests. Not done: the scene is not written to .docx (Word's own animation is not mapped), and printing/PDF show the resting snapshot; Word's Adjust group already had 3D Models and Reset, and the Views gallery shows angle thumbnails rather than named presets (Top, Bottom, Left…); Checked in Chrome with `123.docx`: the 3D Model tab and the object bar show Play 3D, Scenes lists the six scenes, Turntable visibly animates the model and Pause freezes it at rest. Other scenes were not run; the Scenes and Pause ribbon icons reuse the lighting glyph.

**Done 2026-10-26** (see `changes.md`): the 3D Model Views gallery lists Word's twelve named views (Front, Back,
Left, Right, Top, Bottom, Above/Below …), each tile the model drawn by the viewer from that side, six a row with
the arrow stack and a 4 × 3 menu; a view faces the camera square on (the model now turns, then tips, then rolls).
Pause, Scenes, Lighting and Views have their own glyphs. Left: the scene is not written to `.docx`; Word's pose
from a file is not read.

#### 22.16 — Cover Page gallery (screenshot 082655)

- Ours has five covers (Sideline, Motion, Whisp, Banded, Facet). Add Word's set (Austin, Banded, Facet, Filigree, Grid, Integral, Ion Dark, Ion Light, Motion, Retrospect, Semaphore, Sideline, Slice, Whisp, …) as thumbnails in a 3-column gallery with names beneath, plus "Remove Current Cover Page" and "Save Selection to Cover Page Gallery…" (local only).

**Done (partly).** Fourteen covers now (added Austin, Filigree, Grid, Integral, Ion (Dark), Ion (Light), Retrospect, Semaphore, Slice) in a 3-column gallery with names beneath; Remove Current Cover Page was there; "Save Selection to Cover Page Gallery…" saves the cover at the top of the document (variant, title, subtitle) to this browser and lists it in the gallery. Tests in `cover-gallery.test.ts`. Not done: the new covers are simple gradient designs, not Word's artwork; Word's remaining covers (Pinstripes, Mod, Stacks…) are not added; saved covers can be renamed (✎ on the tile) and deleted (×); Save is not limited to a selection, it saves the current cover only. Checked in Chrome: 14 thumbnails in three columns, Ion (Dark) inserts; fixed unreadable Banded and Integral labels.

#### 22.17 — Align menu for objects (screenshot 082842)

- Add Align to Page / Align to Margin check marks (both), Align Selected Objects, Use Alignment Guides (check), View Gridlines, Grid Settings… (spacing, snap), Distribute Horizontally/Vertically disabled below three objects.

  **Done (partly).** Align to Page and Align to Margin already had check marks, View Gridlines was a check, and Distribute Horizontally/Vertically are disabled below three picked objects. New: Align Selected Objects (a third choice next to Page and Margin, enabled with two or more picked objects) lines the picked floating objects up with each other (`alignSelectedObjects`). Test: `align-selected.test.ts` (left and top; jsdom has no object sizes, so right, centre and bottom are untested). Not done: Use Alignment Guides (the app has no drag guides to switch), Grid Settings… (spacing, snap to grid; the app has no snapping), not checked in Chrome.

#### 22.18 — Comments (screenshot 082922)

- Comment shown in the margin with the anchor line to the range, author avatar, "A few seconds ago", Reply and Resolve buttons in the card, red outline for the active comment. Check card layout and the live timestamp.

  **Done (partly).** The comment card already had the author avatar, Reply, Resolve and a relative time. New: the time reads "A few seconds ago" at first and counts up on its own every 15 seconds (`RelativeTime`, used in the popover and the Review panel); the active comment's card in the Review panel has a red outline. Test: `comment-time.test.ts`. Not done: the anchor line from the margin card to the commented range; the active comment's popover and the highlighted text keep the theme colour, not red; not checked in Chrome against Word's card layout.

  **Done 2026-10-26** (see `changes.md`): the anchor line from the range to the open card, the active range in red
  with Word's brackets, the card outlined in red and placed beside the page; going to a comment puts the caret at
  its start rather than selecting it. Checked in Chrome. Left: no line to the Review panel's cards.

#### 22.19 — Word's formatting-mark glyphs (screenshot 081951)

**Done (2026-10-22).** Compared with the screenshot: the row's end mark ¤ now sits just outside the table on the right (the table's wrapper stops clipping while marks are on), as Word draws it; the table's move handle is Word's small white box with a four-way arrow at the top-left corner (click selects the table; dragging it does not move the table, which would need a floating table); the resize square is new at the bottom-right corner: dragging it grows or shrinks the whole table, every column in step (`scaledColumnWidths`, drawn as it goes, one history step when let go). Object anchors are new: with marks on, or with "Object anchors" ticked in Options > Display (no longer unavailable), the paragraph a floating object is anchored to (the block after it) shows ⚓ in the margin (`fmt-anchor` from the formatting marks plugin). The ¶, ¤, ·, → and ↵ glyphs were already there; the empty-paragraph spacing matched. Tests: `table-resize.test.ts`, `formatting-marks.test.ts` (anchors). Checked in Chrome, light and dark: marks, both handles, a drag from 624 px to 472 px and its undo, the anchor beside the right paragraph. Not done: Word draws the marks in the text's colour (here the grey `--fmt-mark-color`); the resize square scales the columns, not the row heights; Word's dragging of the move handle.

- Paragraph marks `¶`, table cell end marks `¤`, row end marks and the empty-paragraph spacing in a document with a picture followed by paragraphs and a table; the table's move handle (top-left) and resize square (bottom-right). Compare the drawn marks.

### UI/Layout Polish

**Done (partly).** With Show/Hide ¶ on, every table now shows the end-of-cell mark ¤ in place of ¶ (before, only the table the caret was in did, and the others showed ¶), an empty cell shows ¤ before its line break, and each row ends with a ¤ at the right inside its last cell (outside the table it was clipped). The marks are hidden in print. CSS only, so there is no test. Checked in Chrome: cell marks and row-end marks show in a new table with ¶ on. Not done: the spacing around a picture followed by paragraphs is unchecked; Word puts the row-end mark outside the table; the table move handle and resize square were not compared with Word.

#### 22.20 — Breaks menu layout (screenshot 082750)

- Two-line rows: bold name with its underlined access letter, a one-sentence description beneath, a 32 px icon at the left; sections "Page Breaks" and "Section Breaks" as bold headings. Ours is a compact list without descriptions or icons, plus a "Blank Page" item Word does not have there.

  **Done.** Layout → Breaks has two-line rows (bold name, one-sentence description) with a small page glyph, bold "Page Breaks" and "Section Breaks" headings, and no Blank Page item (it stays on Insert). Not done: the glyphs are simple outlines, not Word's 32 px icons; underlined access letters; not checked in Chrome.

#### 22.21 — Columns menu (screenshot 082741)

- Rows with a page icon, name and a "More Columns…" footer; selected row highlighted. Ours adds a "Selected text" group; Word applies to the selection or section from the dialog instead.

  **Done.** Layout → Columns rows have a column glyph and the current choice is highlighted; the "Selected text" group is gone (it is in the Columns dialog, 22.7). Not done: Left and Right rows (22.7); Word's larger page icons; not checked in Chrome.

#### 22.22 — Dialog chrome (screenshots 082806, 082827, 083136…)

- Word's dialogs use a dark title bar, `?` and `×` at the right, grouped boxes with a light legend ("Presets", "Width and spacing", "Preview"), a footer button row with OK default-outlined. Check our dialog wrapper against the Columns, Paragraph, Borders and Shading and Word Options layouts: spin-field widths, tab strip height, preview box size and the default-button outline.

  **Done (partly).** The wrapper already had the draggable title bar with `?` and `✕`, tabs and the OK/Cancel row. New for every dialog: grouped boxes (`fieldset`) get a thin border and a light legend, and the default button (OK) has an outline ring. CSS only, so there is no test. `?` in every dialog's title bar opens Help topics. Not done: the title bar is not dark; the `?` is not specific to the dialog it is in; spin-field widths, tab strip height and preview box sizes of the Columns, Paragraph, Borders and Shading and Options layouts were not compared one by one; not checked in Chrome.

#### 22.23 — Ribbon alignment against Word

- Table Design: the style gallery shows 14 swatches in a row with up, down and expand arrows at the right. Chart Design: gallery of 8 thumbnails with the same three arrows. Shape Format: gallery arrows stacked at the right of each gallery. Check each gallery's arrow stack, the group label baseline, and the dialog launcher at the group's lower right.
- Contextual tab names are in blue text (done in 20.11); the tab's underline and the `Share` button at the right.

  **Done (partly).** Table Design's Table Styles gallery now has Word's arrow stack at the right (previous, next, and the expand menu, the `GalleryNav` of the Shape Format tab) and pages through all 14 looks, seven at a time; before it had a single "More" button and could not show the other seven. Home's Styles gallery already had the stack. Chart Design and Shape Format already had the stack. Not done: group label baseline and dialog launcher position were not compared; the contextual tab underline and Share button; the arrow stack was not seen in Chrome (the browser session was lost), and it has no test.

#### 22.24 — Ruler and margins on the page edges (screenshots 081809, 081951)

- Compare the vertical ruler's numbers (rotated), the margin shading, the indent markers' shape and the page's drop shadow with Word.

  **Done (partly).** Checked in Chrome: the ruler numbers in the margins now count outwards from the margin edge (2 1 | 1 2 3 …, and the same down the vertical ruler) instead of showing −2 −1, as Word does; the margin shading on both rulers was already there. Test: `measure.test.ts`. Not done: the indent markers' shape and the page's drop shadow were looked at but not compared against the Word screenshots pixel by pixel.

## Empty document guard and the Editor pane (2026-10-22)

**Done.** A completely blank new document (no text, picture, table, shape or field in the body, headers or footers; `document/blank.ts`) is never marked Unsaved, never gets a recovery copy (`recoveryWanted` in `recovery.ts`, which also records a pending edit first), and old copies of blank pages are left out of Unsaved Documents. The editor's immediate "modified" mark on the first keystroke is skipped while the document is blank. Tests: `blank.test.ts`. Checked in Chrome: Enter, typing and deleting on a new document leave it Saved with no snapshot in IndexedDB; real text makes it Unsaved and writes one.

**Done.** Spelling and grammar moved out of the Grammar dialog into the Editor pane (`components/editor-pane.tsx`, beside the Accessibility Checker; Review > Spelling & Grammar > Editor, the Editor command, F7, Tell Me, add-ins). Grammar rules run as you type (`editor/grammar-rules.ts`: extra spaces, space before or missing after punctuation, repeated punctuation; for English also a sentence's first capital, the pronoun I, and a/an) and are underlined blue on the page (`editor/grammar.ts`, a plugin like spelling, with per-paragraph caching); the AI pass (`requestGrammar`) runs from "Check with AI" or by itself when typing pauses, and its findings are underlined double. The pane lists spelling (with the dictionary's suggestions, Ignore, Add to dictionary) and grammar (suggestion chips, Ignore for the session, Dismiss for AI findings), each card selects its text; the header has the document-wide switches (spelling as you type, grammar as you type, AI when typing pauses), Check with AI, Recheck and Show ignored. Thesaurus and Translate keep the small dialog. Tests: `grammar-rules.test.ts`, `grammar.test.ts`, `editor-pane.test.tsx`. Checked in Chrome, light and dark. Not done: a status-bar proofing indicator; grammar rules beyond these few (anything that needs judgement is the AI's); the AI pass needs the desktop app's keys.

## AI-first ideas

Suggestions, not started:

1. **AI accessibility check.** Review-tab / status-bar replacement for Office “Check Accessibility”. Run the document through the configured AI provider and return concrete fixes (alt text, heading order, contrast, link text) the user can apply locally.
   - **Done:** Accessibility Checker pane (Review → Check Accessibility, status-bar button). Rules: missing/file-name alt (pictures, figures, 3-D, empty text boxes), empty headings, skipped heading levels, generic link text, tables without header row or alt text, low contrast, runs of empty paragraphs, very long paragraphs. One-click fixes for heading level, table header, contrast and empty paragraphs. "Suggest text with AI" writes alt text, link text and table descriptions in one batch; each is editable and applied only on Apply. The AI cannot see pictures (file name and surrounding text only), and the pane says so. Not done: sending the picture itself to a vision model; contrast against highlights/shaded cells; checking headers/footers.
2. **AI Compare versions.** Review-tab replacement for co-authoring “Compare” / “Block Authors” workflows. Diff two local files (or the current doc vs a chosen path) and ask the model for a short change summary plus a structured insert/delete list the user can accept or reject.
   - **Done (2026-10-22):** Review → Compare → Compare… (Combine… opens the same dialog) is Word's Compare Documents dialog: Original and Revised rows, one of them "This document" and the other a chosen .docx/.odt/.rtf/.html/.md/.txt file, with Swap. The differences are written into the open document as the Track Changes marks (`src/document/compare.ts`: paragraphs lined up by text, an edited paragraph compared word by word, a paragraph that came or went marked whole, one replaced by an unrelated paragraph shown as both), so the Review pane lists them for Accept/Reject; accepting or rejecting a whole paragraph now removes the paragraph with its text. The dialog shows the counts and up to five AI lines on what changed (`src/ai/compare-summary.ts`), or the reason the AI is off. Tell Me: Compare. Not done: a three-way Combine of two revised copies; comparing formatting-only changes (same text, different style is "no change"); a side-by-side view of the two files; comparing headers/footers; `.odt` outside the desktop app.
3. **AI cover-page generation.** Insert-tab replacement for Microsoft online Cover Page / New-template galleries. Prompt for title, subtitle, and tone; generate a first-page layout (heading, rule, optional byline) inserted as normal document blocks—no cloud template store.
   - **Done (2026-10-22):** Insert → Cover Page → Generate with AI… asks for Title (pre-filled from the document properties), Subtitle and Tone (Formal, Friendly, Bold, Academic, Playful); the model gets the brief, the author, the date and the document's opening text and answers with title, subtitle, tagline and byline (`src/ai/cover-page.ts`). The dialog previews the cover; Insert puts it at the front as a Title paragraph, a Subtitle paragraph, a rule, the tagline and byline (centred) and a page break, replacing a gallery cover page if there is one. With the AI off, or with "Insert without AI", the typed title and subtitle plus an author · date byline make the cover. Tell Me: Generate Cover Page with AI. Not done: a choice of layouts/colours for the generated cover; a picture; regenerating a single line.

### SmartArt: more layouts and Picture

**Done (partly).** Five new layouts: Basic Block List, Step Up Process, Basic Venn, Picture Caption List and Vertical Picture List. The gallery's Picture category now works (each shape has a picture slot; click it to choose an image, kept per item as `pictures` and carried through Add Shape, Move and Promote/Demote). Not done: Picture layouts do not crop or resize to the slot beyond cover-fit; the new layouts are not saved as Word diagram layouts (same as the others, kept as the picture with the graphic inside). Checked in Chrome: Picture category lists both, inserting Picture Caption List shows three picture slots with captions; the other three new layouts and picking an image were not clicked through.

### Options: settings with real effects

**Done (partly).** `editing-options.ts` now holds more switches (kept in this browser): Enable Live Preview (General; off stops object previews while the pointer is over a choice), Proofing's Ignore words in UPPERCASE, Ignore words that contain numbers, Ignore Internet and file addresses and Flag repeated words (all drawn from the spelling check, on by default as in Word), and Save's "Save recovery copy every" 5 s to 5 min (drives the AutoSave timer). Tests: `spelling-options.test.ts`, `options-pages.test.tsx`. Checked in Chrome: a repeated word and a misspelt one are underlined; a capitalised word, a word with digits and a web address are not. Not done: Live Preview does not yet gate the Themes and style gallery hovers (only object previews); ScreenTip style, per-mark formatting marks, embed fonts, paste defaults, Suggest from main dictionary only, grammar, readability statistics and the Advanced editing, print and compatibility options are still listed off.

### Native Word shapes: effects, more presets, reading the look back

**Fixed 2026-10-24 (Document1.docx from Word).** Three things were wrong when a shape went to Word and back. (1) A
shape in the app was drawn letterboxed inside its box (the SVG kept its 80 by 56 aspect and the drawings had
padding), while Word stretches a preset over its whole extent, so a Lightning saved from the app opened in Word
bigger and at Word's own slant ("rotated a bit"). A shape figure now stretches its drawing to its box
(`preserveAspectRatio="none"`, `shapeViewBox` in `insert-blocks.ts` measures the drawing's tight bounds once in a
hidden SVG; `vector-effect: non-scaling-stroke` keeps outlines in pixels; flips mirror about that box; the wrap
contour uses the same box), and Lightning and Explosion are drawn with Word's own `lightningBolt` and
`irregularSeal1` geometry. (2) Word's Explosion: 8 Points (`irregularSeal1`) had no variant, so it opened as an
empty raw run and showed nothing; it is now the app's `burst` (labelled "Explosion: 8 Points"). A gradient the app
cannot show (three stops, theme colours) now gives the shape its first stop's colour instead of no fill, a glow in
a theme colour (as Word's glow presets are written) is read through the theme, and a reflection whose end is within
1 % of a preset (Word's Tight ends at 55500) is matched. Tests in `shape-import.test.ts` and `shape-write.test.ts`.
Checked in Chrome: Document1.docx shows the rotated, glowing bolt filling its box and the Explosion beside it; a
Heart from the gallery fills its box. Not reproduced: the bolt turned in Word was fully visible here (Chrome);
if it is cut off in the desktop app that is still open. Not done: the other 40-odd preset drawings are still
hand-drawn approximations of Word's geometry, so they differ from Word in detail (the stretch now matches in size).

**Done (partly).** `docx/shape-effects.ts`: a shape's outer shadow (the nine directions), glow, soft edges and reflection (tight, half, full, with or without gap) are written as `a:effectLst`, so such shapes are no longer saved as a picture; the reader now reads a dash (`a:prstDash`), a light or dark two-stop gradient in the app's seven directions or radial, and those effects back, so a shape the app wrote reopens with its look instead of its plain colour. A gradient Word made with other stops, angles or more than two stops is still shown as its plain colour. The unchanged-shape check (`shapeLook`) now includes dash, gradient and effects, so changing one writes the shape anew. Twenty-nine more Word presets open and save as editable shapes (parallelogram, trapezoid, pentagon, octagon, chevron, 4/5/6/8-point stars, down, left-right and up-down arrows, notched arrow, moon, cloud, donut, lightning bolt, can, smiley face, sun, flowchart process/decision/terminator/document, wave, plaque, block arc, no symbol). Tests in `shape-write.test.ts` and `shape-import.test.ts`. Not verified in Word itself or in Chrome. **Not done:** shape text (the app's shapes hold no text yet, so there is nothing to write), arrowheads and lines/connectors as `wps` (still a picture), bevel, 3-D rotation, inner and perspective shadows (still a picture), the remaining presets (callouts, curved and bent arrows, brackets, braces, rest of the flowchart set), and the app draws some presets slightly differently from Word's own geometry (Word redraws them when it opens the file).

### Tight and Through wrap follow the outline

**Done (partly).** A floating shape or picture with Tight or Through wrap now has text follow its outline instead of its box (`editor/wrap-contour.ts`): the outline is read once per source from a small drawing (a shape's own SVG, a picture's opaque pixels, 48 bands), turned into a CSS `polygon()` for the float that clears the room (`shape-outside`), and the layout reruns when it has loaded. A picture with no transparency, a text box, chart, 3-D model and any turned object still wrap by their box (as Square does). Tests: `wrap-contour.test.ts` (bands, full-box check, flips, polygon on both sides). Checked in Chrome: an ellipse with Tight wrap, the lines beside it shorten towards its top and bottom and are longest at its middle. Not done: Edit Wrap Points (still disabled), a turned object's outline, text on both sides of one object, reading and writing Word's own `wp:wrapPolygon` (it is neither read nor written: a Tight picture from Word wraps by the outline the app finds, and saves as before), and the paragraph's `w:textboxTightWrap` stays saved with no layout effect (it is a legacy text-box setting that Word itself barely uses).

### Shapes that hold text

**Done (partly).** A shape (any closed one; lines, arrows, brackets and braces hold none) takes text: double-click it, type, click away to keep it (Esc drops the edit). The text is the figure's `text` attribute with `textColor`, `textSize` (pt, 14 by default) and `textBold`, drawn centred over the shape in a colour that reads on its fill (white on dark, dark on light). In `.docx` it is written as `wps:txbx` / `w:txbxContent` (one centred paragraph per line, `anchor="ctr"`) inside the native shape, and read back: a Word shape with text (not a `txBox` text box, which stays whole) opens as an editable shape holding its text, and an untouched one still goes back as Word's own drawing, since the text is part of what is compared. A shape saved as a picture (bevel, arrows, textures) keeps its text in the picture. Tests in `shape-write.test.ts`. Checked in Chrome: double-click on a hexagon, typing "Inside the shape", the text shows centred and wraps. Not done: formatting the text (colour, size, bold, font, alignment have no controls yet; only what Word wrote is kept), rich runs in text Word wrote (the first run's colour, size and bold are used for all, and the lines are joined as plain paragraphs), vertical alignment and insets, text that follows the shape's outline, Enter and F2 to start editing from the keyboard, and the text is not in the shape's Alt Text or search.

**Follow-up (shape text size).** With a shape selected, the Home tab's Font Size box and list, Grow/Shrink Font and Bold (Home, Mini Toolbar, Quick Access Toolbar) act on its text (`editor/shape-text.ts`: `selectedShapeText`, `setShapeText`, `stepShapeTextSize`, `toggleBold`) and the size box shows the shape's size (14 pt by default); sizes go through Word's list and are saved as `w:sz` in `.docx`. Tests: `shape-text.test.ts`. Checked in Chrome: Grow Font twice took 14 to 18 pt, Bold toggled from Home and from the Quick Access Toolbar. Not done: font colour, font name, italic, underline and alignment for shape text (Home's controls still act on nothing when a shape is selected), the Font dialog, and text typed while the shape is being edited still uses the shape's single size.

**Follow-up (shape text colour and font).** With a shape selected, Home's Font Color (button, menu, Automatic) and Font name list act on its text too: new `textFont` attribute (with `textColor`, which was already there), drawn on the text, written as `w:rFonts` and `w:color` and read back (`applyFontColor`, `applyFontFamily` in `editor/shape-text.ts`; the boxes show the shape's own colour and font). Tests: `shape-text.test.ts`, `shape-write.test.ts`. Checked in Chrome: the colour menu set a red, the font list set Georgia, both on the text. Not done: italic, underline, alignment and highlight for shape text, the Font dialog, the Mini Toolbar's colour and font for a selected shape (it shows with text selections, not shapes), and theme fonts and colours Word wrote (`w:themeColor`, `w:asciiTheme`) are not read, so such text opens in the default colour and font.

**Follow-up (discard all recovered drafts).** The Unsaved Documents rail now has "Discard all (N)" when two or more drafts are listed; it asks once ("Discard all N drafts? They cannot be brought back.") and then clears every draft. Tests: `recovery-dialog.test.tsx`. Not Chrome-checked. Not done: no undo after discarding.

### Read Mode and Web Layout

**Done (partly).** Web Layout is a real layout, not a restyled print page: the text runs the width of the window (`webWidth` in `document/view.ts`, measured by the page canvas; `pageMetrics` returns one very tall "page" for it, `pageMetrics(setup, true)` still gives the sheet for the print preview), so there are no page breaks (manual breaks and blank pages are ignored too), margins, headers, footers or page numbers, columns are ignored, and the ruler is hidden. It stays editable and zooms. Read Mode replaces the ribbon with a slim bar (Tools: Read Aloud and the headings; View: Edit Document, Column Width, Page Color, Layout) and shows the text in read-only columns that run sideways (`components/read-mode.tsx`, `document/read-pages.ts`): turn pages with the arrows, PageUp/PageDown, Space, Home/End, the wheel or the buttons at the edges; "Page n of m" at the bottom; click an image to see it large; Esc or Edit Document leaves. Paper Layout in the View menu shows the real pages, read-only. Entering Read Mode no longer turns Focus on. Tests: `web-layout.test.ts`, `read-pages.test.ts`, `read-mode.test.tsx`. Checked in Chrome: Web Layout reflow and back to four pages, column reading, page turns, Sepia, Paper Layout (needed a fix: the pagination measured zero while the editor was hidden), Esc. Not done: Show Comments, the Navigation Pane and Find inside Read Mode, Inverse and Sepia for Paper Layout, text-to-speech highlighting, tables, charts, shapes and floating objects are shown as the HTML the editor produces (floats become in-line), objects other than pictures do not open large, the last page of columns can overlap the one before it, and Web Layout has no ruler.

## AI assistant for the selection (2026-10-22)

**Done.** A question asked of selected text, in the AI chat or the Ask AI prompt at the selection, is read for what it wants (`ai/assist.ts`: `assistIntent`). "Is this sentence correct?", "check the grammar", "any errors?" get a verdict first ("There are some grammatical errors in the sentence." / "The sentence is fine.") and the question "Should I suggest fixes?" with Yes and No; Yes lists the fixes. "Proofread this", "fix the grammar", "correct this" (and the prompt's "Fix spelling and grammar" chip) give the verdict and the fixes at once. Each fix shows what it replaces, the reason, and an Apply button that puts it in the document where it was flagged (`findCorrection` maps the checked text to positions and takes the occurrence nearest the flagged offset, so "a" → "an" lands on the right "a"; later fixes move as earlier ones land); "Apply all" does the rest; "Applied" once done; a fix whose text is gone says so. The verdict comes from the model as a JSON object (`requestReview`, `parseReview`); without the AI (the web build, or no key) the built-in grammar rules give the verdict and the note says so. Any other request about a selection still rewrites it. Store: `ai/chat.ts` (`ReviewCard` on a message, `reviewSelection`, `suggestFixes`, `declineFixes`, `applyFix`, `applyAllFixes`); UI: `components/ai-sidebar.tsx` (`ReviewReply`). Tests: `ai/assist.test.ts`, `ai/chat.test.ts`, `components/ai-sidebar.test.tsx`. Checked in Chrome (rules fallback): verdict, Yes, Apply, Apply all, proofread from the Ask AI prompt, a clean sentence, light and dark. Not done: spelling is not part of the rules fallback (the AI covers it); the fixes are not underlined on the page (the Editor pane does that for the whole document); no status-bar indicator; the intent is read from English wording only.

## Future features

Ideas kept for later; not in the current plan.

### Text on both sides of a floating table

Word puts text on both sides of a floating table with room on each side (a table in the middle of the column).
The editor lays text out with the browser, whose floats let text pass on one side only, so text goes on the
roomier side (`floatSide` in `src/editor/table-float.ts`). Doing it needs the lines beside the table split in two,
a layout of the editor's own for those paragraphs, which also touches the caret, selection and typing. Kept for
later at the owner's choice (2026-10-27).

### Mail merge (Mailings tab)

Removed from the app on 2026-10-27 at the owner's request, to come back when it can be done properly. The whole tab
went: Envelopes, Labels, Start Mail Merge, Select Recipients (CSV and sample), Edit Recipient List, the Write &
Insert Fields commands, Preview Results with record navigation, Find Recipient, Check for Errors and Finish & Merge,
in both ribbon layouts, plus the `mergeField` mark and the Highlight Merge Fields view switch. The last version is in
git just before the removal commit: `src/components/ribbon/mailings-tab.tsx`, `src/document/mail-merge.ts`,
`src/editor/merge-field.ts`, the Mailings line icons and tooltips.

What it lacked, to do when it returns:

- Preview Results only moved between records; it never put the recipient's values into the page.
- Merge fields were not written to .docx as Word's `MERGEFIELD` fields, nor read from them; the recipient list and
  `w:mailMerge` settings were not saved.
- Finish & Merge needs a check against Word (one document per record, print, e-mail).

### Cloud accounts (was 21.16–21.18)

- OAuth2 (PKCE, loopback redirect in the Tauri shell, tokens in the OS keyring) sign-in for Google Drive and Microsoft OneDrive, with document sync and cloud file management.
- Save As → Places from real accounts: show Google Drive or OneDrive only with a valid token; remove the static, mocked cloud places.
- Share to the cloud: upload the current document to the linked drive and create a shareable link.
- Needs from the owner: a Google Cloud OAuth client ID (type Desktop app; `drive.file` scope avoids full verification), a Microsoft Entra app registration (public client, loopback redirect, `Files.ReadWrite` and `offline_access`), and a test account for each.
