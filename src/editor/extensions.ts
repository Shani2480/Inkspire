import Color from "@tiptap/extension-color"
import FontFamily from "@tiptap/extension-font-family"
import Highlight from "@tiptap/extension-highlight"
import { PositionedImage, TextBox } from "@/editor/objects"
import { FramedTable, ShadedTableCell, ShadedTableHeader, SizedTableRow, StyledTableView } from "@/editor/table-tools"
import TextAlign from "@tiptap/extension-text-align"
import { FontSize, TextStyle } from "@tiptap/extension-text-style"
import { WordLineHeight } from "@/editor/line-height"
import StarterKit from "@tiptap/starter-kit"
import { CharacterStyle, StyledUnderline, SubscriptMark, SuperscriptMark, TextBoxMark } from "@/editor/character-format"
import { FormatPainter } from "@/editor/home-actions"
import { StyledBulletList, StyledOrderedList } from "@/editor/lists"
import { BlankPage } from "@/editor/blank-page"
import { AuthoritiesTable, AuthorityMark } from "@/editor/authorities"
import { CoverPage } from "@/editor/cover-page"
import { DocumentIndex, IndexEntry } from "@/editor/index-entry"
import { OnlineVideo } from "@/editor/online-video"
import { DateField, FormulaField, IfField } from "@/editor/fields"
import { FormattingMarks } from "@/editor/formatting-marks"
import { DocxSource } from "@/editor/docx-source"
import { DocxRun, WordBlock, WordInline } from "@/editor/docx-preserved"
import { IndentKeymap, IndentedHeading, IndentedListItem, IndentedParagraph } from "@/editor/indent"
import { DocTab, TabStops } from "@/editor/tab-stops"
import { PageBreak } from "@/editor/page-break"
import { TableOfContents } from "@/editor/toc"
import { Pagination } from "@/editor/pages"
import { PlaceholderHighlight } from "@/editor/placeholder-highlight"
import { Comment } from "@/editor/comments"
import { Equation } from "@/editor/equation"
import { ColumnBreak } from "@/editor/column-break"
import { ColumnSection } from "@/editor/columns"
import { DrawingCanvas } from "@/editor/drawing"
import { TableDrawing } from "@/editor/table-draw"
import { EditPoints } from "@/editor/edit-points"
import { TextBoxFlow } from "@/editor/text-box-link"
import { ObjectGrouping } from "@/editor/object-group"
import {
  Bookmark,
  Figure,
  FigureTable,
  Note,
  SignatureLine,
  WordArt,
  insertBlockCommands,
} from "@/editor/insert-blocks"
import { ShortcutKeymap } from "@/editor/shortcut-keymap"
import { EditingBehavior } from "@/editor/editing-behavior"
import { DocumentTheme } from "@/editor/document-theme"
import { SectionBreak } from "@/editor/section-break"
import { SheetBlock } from "@/editor/sheet-block"
import { SmartArt } from "@/editor/smartart"
import { InactiveSelection } from "@/editor/inactive-selection"
import { TableFitText } from "@/editor/table-fit-text"
import { Grammar } from "@/editor/grammar"
import { Spellcheck } from "@/editor/spellcheck"
import { TripleClickSelectAll } from "@/editor/triple-click-select"
import { TellMeFlash } from "@/tell-me/flash"
import { ThreeDModel } from "@/editor/three-d-model"
import { Deletion, Insertion, TrackChanges } from "@/editor/track-changes"

export function createExtensions() {
  return [
    StarterKit.configure({
      underline: false,
      paragraph: false,
      heading: false,
      listItem: false,
      bulletList: false,
      orderedList: false,
      link: {
        openOnClick: false,
        autolink: true,
      },
    }),
    IndentedParagraph.configure(),
    IndentedHeading.configure(),
    IndentedListItem.configure(),
    IndentKeymap.configure(),
    ShortcutKeymap.configure(),
    EditingBehavior.configure(),
    DocxSource.configure(),
    DocxRun.configure(),
    WordInline.configure(),
    WordBlock.configure(),
    DocTab.configure(),
    TabStops.configure(),
    StyledBulletList.configure(),
    StyledOrderedList.configure(),
    StyledUnderline.configure(),
    SubscriptMark.configure(),
    SuperscriptMark.configure(),
    TextBoxMark.configure(),
    CharacterStyle.configure(),
    FormatPainter.configure(),
    TextStyle.configure(),
    Color.configure(),
    FontFamily.configure(),
    FontSize.configure(),
    WordLineHeight.configure({
      types: ["paragraph", "heading"],
    }),
    TextAlign.configure({
      types: ["heading", "paragraph", "textBox"],
      // No alignment of its own: the paragraph follows its style (which is left unless the style says otherwise).
      defaultAlignment: null,
    }),
    Highlight.configure({ multicolor: true }),
    FramedTable.configure({ resizable: true, handleWidth: 8, View: StyledTableView }),
    SizedTableRow.configure(),
    ShadedTableHeader.configure(),
    ShadedTableCell.configure(),
    PositionedImage.configure({
      allowBase64: true,
      inline: false,
    }),
    TextBox.configure(),
    TextBoxFlow,
    PageBreak.configure(),
    BlankPage.configure(),
    CoverPage.configure(),
    OnlineVideo.configure(),
    DateField.configure(),
    FormulaField.configure(),
    IfField.configure(),
    Equation.configure(),
    TableOfContents.configure(),
    PlaceholderHighlight.configure(),
    InactiveSelection,
    TableFitText,
    FormattingMarks.configure(),
    Spellcheck.configure(),
    Grammar.configure(),
    TripleClickSelectAll.configure(),
    TellMeFlash.configure(),
    DocumentTheme.configure(),
    Comment.configure(),
    Bookmark.configure(),
    IndexEntry.configure(),
    AuthorityMark.configure(),
    Figure.configure(),
    DrawingCanvas.configure(),
    TableDrawing,
    EditPoints,
    ColumnSection.configure(),
    ColumnBreak.configure(),
    ObjectGrouping.configure(),
    WordArt.configure(),
    SignatureLine.configure(),
    Note.configure(),
    FigureTable.configure(),
    DocumentIndex.configure(),
    AuthoritiesTable.configure(),
    SmartArt.configure(),
    ThreeDModel.configure(),
    SectionBreak.configure(),
    SheetBlock.configure(),
    insertBlockCommands.configure(),
    Insertion.configure(),
    Deletion.configure(),
    TrackChanges.configure(),
  ]
}

export const extensions = [...createExtensions(), Pagination]
