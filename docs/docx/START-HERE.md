# DOCX Kit for Cursor: start here

This kit gives Cursor what it needs to implement .docx open and save in your word processor. Everything in it
comes from testing the real Microsoft Word 16.0.17932.21000 on Windows.

## What's in the kit

```
START-HERE.md                         <- this file
docs/docx/DOCX_IMPLEMENTATION_GUIDE.md <- the main guide (what Word accepts, rejects and writes)
docs/docx/authored-report.md          <- the exact XML Word writes for each feature
tests/docx-fixtures/cases/            <- 53 test .docx files (some are broken on purpose) + index.tsv
tests/docx-fixtures/results/          <- Word's verdict for each case (JSON)
tests/docx-fixtures/authored/         <- 19 feature documents written by Word + combined (Transitional/Strict/Flat)
.cursor/rules/docx.mdc                <- Cursor rule that points every DOCX task at the guide
tools/docx-validate/                  <- Open XML SDK validator (runs on Linux with .NET)
tools/word-open-one.ps1               <- the "does real Word open it?" check (Windows only, needs Word)
```

Notes on the fixtures:
- **`cases/` files are byte-exact copies.** Some have bad CRCs or broken XML on purpose. Many ZIP tools will
  complain about them; that is expected. Don't "fix" them.
- **`authored/` files have no personal data.** The author name was replaced with "Author Name" and the account
  ID with zeros. To do that they were re-zipped, so their ZIP headers no longer match Word's byte layout
  exactly. For ZIP layout details, trust guide §4, not these files. The XML inside is unchanged apart from the name.
- **`results/*.json` keep the original Windows paths** (`C:\REA\docx-probe\...`). Match results to cases by
  file name.

---

## Step 1: Copy the kit into your project (on Linux)

Get the kit across from Windows in one of these ways:
- **Mount the Windows drive.** Copy `C:\REA\docx-kit.zip` from the mounted Windows partition. This works only
  if Windows Fast Startup is off and the drive isn't BitLocker-locked.
- **Use a USB stick or cloud drive.** Copy `docx-kit.zip` onto it before you reboot.

Then, in your project root:

```bash
unzip ~/docx-kit.zip -d /tmp/docx-kit
cp -r /tmp/docx-kit/docs /tmp/docx-kit/tests /tmp/docx-kit/tools /tmp/docx-kit/.cursor .
# (merge by hand if you already have docs/, tests/, tools/ or .cursor/)
git add docs/docx tests/docx-fixtures .cursor/rules/docx.mdc tools
```

If your repository is public, the fixtures are safe to commit; they contain no personal data.

## Step 2: Check the Cursor rule

`.cursor/rules/docx.mdc` is already in place. Edit its `globs:` line so it matches the folders where your
docx code will live. In Cursor, check **Settings → Rules** to confirm it is listed.

## Step 3: First prompt (planning, no code)

Open Cursor chat in Agent mode and paste this, filling in the brackets:

> My word processor is written in **[language / framework]**. The document model lives in **[path]**, and
> loading/saving currently happen in **[path, or "nowhere yet"]**. Read `docs/docx/DOCX_IMPLEMENTATION_GUIDE.md`.
> Propose a module layout following its §1 (zip → OPC package → WordprocessingML reader/writer → my model), and
> map the recommended model in §8 onto my existing model. Pick a ZIP library and an XML library for my stack
> that support ZIP64 reading, Stored + Deflate, and streaming XML. **Don't write code yet.** List the gaps in my
> model first.

Review the plan, correct it, and then continue.

## Step 4: Build in stages, one prompt per stage

Finish each stage, with its tests passing, before starting the next. Start a new chat for each stage so the
context stays small. The rule file brings the guide back in automatically.

**Stage 1: ZIP and package layer**
> Implement the ZIP + OPC package layer per guide §2.1–2.3 and §4. Add a test that loads every file in
> `tests/docx-fixtures/cases/`, reads Word's verdict from `tests/docx-fixtures/results/<name>.json` (`open.ok`),
> and asserts that every case Word opens, my reader opens too. Treat CRC mismatches as warnings. Name the tests
> after the case IDs (z01, c05, r02…).

*Done when:* every case marked OPENS in guide §2 loads.

**Stage 2: Markup Compatibility**
> Add a Markup Compatibility filter (guide §2.4) between the XML parser and the WordprocessingML reader:
> mc:Ignorable skipping, AlternateContent Choice/Fallback, and an error for unknown non-ignorable namespaces.
> Tests: x02, x03, x04, x05.

**Stage 3: Text, paragraphs, styles, settings**
> Read and write paragraphs, runs, styles and settings per guide §2.5, §5.1, §5.2 and §8, including style
> resolution with toggle properties. The writer always emits compatibilityMode 15 and `xml:space="preserve"`
> where needed. Attribute values come from typed enums/integers only, and elements are written in schema order.
> Add a round-trip test for `00_baseline` and all w01–w17 cases.

**Stage 4: Lists and tables**
> Implement numbering (guide §5.3) and tables with gridSpan/vMerge (§5.4). Golden test: load
> `tests/docx-fixtures/authored/f04_bullets.docx`, `f05_numbering.docx` and `f06_table.docx`, save them, and
> compare the document XML with the originals, ignoring `w:rsid*`, `w14:paraId` and `w14:textId` attributes.

**Stage 5: Sections, headers/footers, fields**
> Implement sections, page breaks and header/footer parts (§5.5), plus simple and complex fields, including
> fields that span paragraphs and nested fields (§5.6). Golden tests: f07, f12, f15.

**Stage 6: Notes, comments, tracked changes, links**
> Implement footnotes/endnotes (§5.7), comments with commentsExtended threading (§5.8), tracked changes
> (§5.9), and hyperlinks/bookmarks (§5.10). Golden tests: f08, f09, f10, f11.

**Stage 7: Images and shapes**
> Implement inline images and media parts (§5.11) and floating shapes/text boxes via AlternateContent (§5.12).
> Keep content controls (§5.13) and equations (§5.14) as raw XML that round-trips, and show their text.
> Golden tests: f13, f14, f16, f17.

**Stage 8: Preservation and validation**
> Preserve unknown parts and their relationships per §6 (tests r09 and r10). Add a CI step that runs
> `tools/docx-validate` on every .docx the test suite writes, and fails on any validation error.

## Step 5: Validate on Linux

The validator needs the .NET 8 SDK:

```bash
# Ubuntu/Debian
sudo apt install dotnet-sdk-8.0
cd tools/docx-validate
dotnet run -- /path/to/output.docx /path/to/other.docx
```

It prints every schema or semantic error with its part and XPath, and exits with code 1 if any file has errors.
Zero errors is a strong sign Word will accept the file. Guide §2.4 case x12 shows that one invalid attribute
value makes Word refuse the whole document. The validator wasn't run while building this kit (no .NET SDK on
the Windows machine). If `dotnet run` reports a compile error, paste it into Cursor.

Optional sanity check: `libreoffice --headless --convert-to pdf out.docx` confirms the file parses, but
LibreOffice is far more lenient than Word, so passing it proves little.

## Step 6: The real Word check (Windows, occasionally)

Only real Word can confirm that a file opens without the "unreadable content" prompt. Every so often, boot into
Windows (or use a Windows VM with Office) and run:

```powershell
powershell -File tools\word-open-one.ps1 -InputPath C:\path\out.docx -ResultPath C:\path\out.json -RoundTripPath C:\path\out.word.docx
```

- `"open": { "ok": true }` means Word opened it cleanly.
- A `repair` entry means Word wanted to repair the file. Paste the error and the XML into Cursor with
  "see guide §2".
- Comparing your `word/document.xml` with the one in `out.word.docx` shows how Word normalises your output.

To re-run the full Word test suite after a Word update, use the scripts in `C:\REA\docx-probe` on Windows
(guide §10).

---

## Tips for working with Cursor

- **Stay incremental.** "Implement docx support" produces a shallow version of everything. The stages above
  each fit in one session.
- **When Cursor guesses XML, point it at the reference.** Say *"use the exact XML from guide §5.x /
  authored-report.md"*.
- **Golden tests are your safety net.** Never let Cursor "fix" a failing golden test by changing the expected
  file. Make it fix the writer.
- **Watch these failure modes** from guide §2. Each one breaks the file in real Word:
  - a missing content type for any part
  - an invalid attribute value
  - an unknown namespace not listed in `mc:Ignorable`
  - a table cell with no paragraph
  - a dangling `r:id`
  - duplicate relationship IDs
  - unbalanced fields
