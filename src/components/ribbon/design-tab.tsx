import { ColorMenu } from "@/components/color-menu"
import { requestPageBorders } from "@/components/design-dialogs"
import { MenuButton, RibbonCommand, RibbonGroup, RibbonHover, RibbonPopover } from "@/components/ribbon/ribbon-button"
import { MenuHeading } from "@/components/shape-menus"
import { nextCustomName, ThemeColorsDialog, ThemeFontsDialog } from "@/components/theme-dialogs"
import {
  builtInTheme,
  colorSetup,
  currentTheme,
  customColorSchemes,
  customFontSchemes,
  customThemes,
  fontSetup,
  saveCustomColors,
  saveCustomFonts,
  saveCustomTheme,
  stackOf,
  styleLooks,
  styleSetCatalog,
  STYLE_SETS,
  themeFromThmx,
  themeSetup,
  thmxEntries,
  type SavedTheme,
  type StyleLook,
} from "@/document/design"
import { EFFECT_PRESETS, SPACING_PRESETS, saveFormatDefault } from "@/document/design-format"
import { currentWordDocument } from "@/document/docx/session"
import { readZip, writeZip } from "@/document/docx/zip"
import { clipWatermark, type PageSetup } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { WORD_COLOR_SCHEMES, WORD_FONT_SCHEMES, WORD_THEMES } from "@/document/word-design-data"
import { openLocalFile, pickSavePath, writeBytes } from "@/lib/file-io"
import {
  LineColorsIcon,
  LineFontsIcon,
  LinePageBordersIcon,
  LinePageColorIcon,
  LineThemesIcon,
  LineWatermarkIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { DialogFrame } from "@/components/word-dialog"

const WATERMARKS = ["CONFIDENTIAL", "DO NOT COPY", "DRAFT", "SAMPLE", "ASAP", "URGENT"]

/** The fields a theme sets; cleared by Reset to Theme from Template. */
const NO_THEME: Partial<PageSetup> = {
  themeName: "",
  colorScheme: "",
  themeColors: "",
  fontScheme: "",
  headingFont: "",
  bodyFont: "",
}

/** "Office Theme" and "Office" are one theme: Word's menus drop the suffix its files carry. */
const sameName = (left: string, right: string) => left.replace(/ Theme$/, "") === right.replace(/ Theme$/, "")

/**
 * Design tab, Document Formatting as in Word: Themes, the Style Set gallery, Colors, Fonts, Paragraph Spacing,
 * Effects and Set as Default. The themes, colour and font schemes and Style Sets are Word's own (generated from
 * its files by tools/word-design-extract.py). Left out: Save as a New Style Set… (a Word template the app does not
 * write) and Custom Paragraph Spacing… (Manage Styles, which the app does not have).
 */
export function DesignTab() {
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const [confirmDefault, setConfirmDefault] = useState(false)
  const [dialog, setDialog] = useState<"colors" | "fonts" | null>(null)
  // Custom schemes and themes live in local storage: re-read them after one is saved.
  const [, refresh] = useReducer((count: number) => count + 1, 0)
  const word = currentWordDocument()
  const theme = currentTheme(setup, word)

  function update(next: Partial<PageSetup>) {
    setPageSetup({ ...setup, ...next })
  }

  const applyTheme = useCallback(
    (picked: SavedTheme) => setPageSetup({ ...useDocumentStore.getState().pageSetup, ...themeSetup(picked) }),
    [setPageSetup],
  )

  async function browseThemes() {
    const opened = await openLocalFile(
      [{ name: "Office Themes", extensions: ["thmx"] }],
      "Choose Theme or Themed Document",
    )
    if (!opened) {
      return
    }
    const picked = themeFromThmx(await readZip(opened.bytes), opened.name)
    if (picked) {
      saveCustomTheme(picked)
      refresh()
      applyTheme(picked)
    }
  }

  async function saveTheme() {
    const name = theme.name.replace(/ Theme$/, "") || "Theme"
    const path = await pickSavePath(
      [{ name: "Office Theme", extensions: ["thmx"] }],
      `${name}.thmx`,
      "Save Current Theme",
    )
    if (!path) {
      return
    }
    const bytes = await writeZip(thmxEntries(theme).map((entry) => ({ ...entry, stored: false })))
    await writeBytes(path, bytes)
    const saved = { ...theme, name: (path.split(/[/\\]/).pop() ?? name).replace(/\.thmx$/i, "") }
    saveCustomTheme(saved)
    refresh()
  }

  const themesMenu = (close: () => void) => {
    const thumb = (item: SavedTheme) => (
      <ThemeThumb
        key={item.name}
        theme={item}
        pressed={sameName(item.name, theme.name)}
        onApply={(picked) => {
          applyTheme(picked)
          close()
        }}
      />
    )
    const custom = customThemes()
    return (
      <div className="design-menu w-[332px]">
        {custom.length > 0 ? (
          <>
            <MenuHeading>Custom</MenuHeading>
            <div className="design-theme-grid" role="group" aria-label="Custom themes">
              {custom.map(thumb)}
            </div>
          </>
        ) : null}
        <MenuHeading>Office</MenuHeading>
        <div className="design-theme-grid" role="group" aria-label="Themes">
          {WORD_THEMES.map((item) => builtInTheme(item.name))
            .filter((item): item is SavedTheme => item !== null)
            .map(thumb)}
        </div>
        <div className="design-menu-actions">
          <MenuButton
            onClick={() => {
              update(NO_THEME)
              close()
            }}
          >
            Reset to Theme from Template
          </MenuButton>
          <MenuButton
            onClick={() => {
              close()
              void browseThemes()
            }}
          >
            Browse for Themes…
          </MenuButton>
          <MenuButton
            onClick={() => {
              close()
              void saveTheme()
            }}
          >
            Save Current Theme…
          </MenuButton>
        </div>
      </div>
    )
  }

  const colorsMenu = (close: () => void) => {
    const row = (scheme: { name: string; colors: string[] }) => (
      <MenuButton
        key={scheme.name}
        selected={scheme.name === theme.colorsName}
        onClick={() => {
          update(colorSetup(scheme))
          close()
        }}
      >
        <span className="flex w-full items-center gap-2">
          <span className="flex shrink-0 gap-px" data-keep-light>
            {[2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
              <span key={index} className="design-chip" style={{ background: scheme.colors[index] }} />
            ))}
          </span>
          <span className="truncate">{scheme.name}</span>
        </span>
      </MenuButton>
    )
    const custom = customColorSchemes()
    return (
      <div className="design-menu w-[280px]">
        <div className="design-menu-list">
          {custom.length > 0 ? (
            <>
              <MenuHeading>Custom</MenuHeading>
              {custom.map(row)}
            </>
          ) : null}
          <MenuHeading>Office</MenuHeading>
          {WORD_COLOR_SCHEMES.filter((scheme) => scheme.menu).map(row)}
        </div>
        <div className="design-menu-actions">
          <MenuButton
            onClick={() => {
              close()
              setDialog("colors")
            }}
          >
            Customize Colors…
          </MenuButton>
        </div>
      </div>
    )
  }

  const fontsMenu = (close: () => void) => {
    const row = (scheme: { name: string; major: string; minor: string }) => (
      <MenuButton
        key={scheme.name}
        className="h-auto py-1"
        selected={scheme.name === theme.fontsName}
        onClick={() => {
          update(fontSetup(scheme))
          close()
        }}
      >
        <span className="flex w-full items-center gap-2">
          <span className="design-font-glyph" style={{ fontFamily: stackOf(scheme.major) }} data-keep-light>
            Aa
          </span>
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-[11px] text-[var(--app-ribbon-muted)]">{scheme.name}</span>
            <span className="truncate text-[14px]" style={{ fontFamily: stackOf(scheme.major) }}>
              {scheme.major}
            </span>
            <span className="truncate text-[11px]" style={{ fontFamily: stackOf(scheme.minor) }}>
              {scheme.minor}
            </span>
          </span>
        </span>
      </MenuButton>
    )
    const custom = customFontSchemes()
    return (
      <div className="design-menu w-[264px]">
        <div className="design-menu-list">
          {custom.length > 0 ? (
            <>
              <MenuHeading>Custom</MenuHeading>
              {custom.map(row)}
            </>
          ) : null}
          <MenuHeading>Office</MenuHeading>
          {WORD_FONT_SCHEMES.filter((scheme) => scheme.menu).map(row)}
        </div>
        <div className="design-menu-actions">
          <MenuButton
            onClick={() => {
              close()
              setDialog("fonts")
            }}
          >
            Customize Fonts…
          </MenuButton>
        </div>
      </div>
    )
  }

  const spacingMenu = (close: () => void) => (
    <div className="design-menu w-[248px]">
      <MenuHeading>Style Set</MenuHeading>
      <MenuButton
        className="h-auto py-1"
        selected={setup.spacing === "default"}
        onClick={() => {
          update({ spacing: "default" })
          close()
        }}
      >
        <span className="flex w-full items-center gap-2">
          <SpacingSample line={1.15} after={2} />
          <span className="flex flex-col items-start leading-tight">
            <span>Default</span>
            <span className="text-[11px] text-[var(--app-ribbon-muted)]">The Style Set’s own spacing</span>
          </span>
        </span>
      </MenuButton>
      <MenuHeading>Built-In</MenuHeading>
      {SPACING_PRESETS.map((item) => (
        <MenuButton
          key={item.id}
          className="h-auto py-1"
          selected={setup.spacing === item.id}
          onClick={() => {
            update({ spacing: item.id })
            close()
          }}
        >
          <span className="flex w-full items-center gap-2">
            <SpacingSample {...SPACING_SAMPLES[item.id as keyof typeof SPACING_SAMPLES]} />
            <span className="flex flex-col items-start leading-tight">
              <span>{item.label}</span>
              <span className="text-[11px] text-[var(--app-ribbon-muted)]">{item.detail}</span>
            </span>
          </span>
        </MenuButton>
      ))}
    </div>
  )
  const effectsMenu = (close: () => void) => (
    <div className="flex w-44 flex-col">
      {EFFECT_PRESETS.map((item) => (
        <MenuButton
          key={item.id}
          selected={setup.effects === item.id}
          onClick={() => {
            update({ effects: item.id })
            close()
          }}
        >
          <span className="flex w-full items-center justify-between gap-3">
            <span>{item.label}</span>
            <EffectSample id={item.id} />
          </span>
        </MenuButton>
      ))}
    </div>
  )
  const watermarkMenu = (close: () => void) => (
    <div className="w-56 p-1">
      <MenuButton
        onClick={() => {
          update({ watermark: "" })
          close()
        }}
      >
        Remove watermark
      </MenuButton>
      <div className="mt-1 grid grid-cols-2 gap-1">
        {WATERMARKS.map((text) => (
          <button
            key={text}
            type="button"
            aria-label={text}
            aria-pressed={setup.watermark === text}
            data-keep-light
            className="flex h-16 flex-col items-center justify-center rounded border border-[#e1e1e1] bg-white aria-pressed:border-[var(--app-theme-primary)] aria-pressed:bg-[var(--app-theme-light)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              update({ watermark: clipWatermark(text) })
              close()
            }}
          >
            <span
              className="text-[9px] font-semibold tracking-wide text-black/25 uppercase"
              style={{ transform: "rotate(-28deg)" }}
            >
              {text}
            </span>
          </button>
        ))}
      </div>
      <form
        className="mt-1 border-t border-black/10 p-1"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          update({ watermark: clipWatermark(String(data.get("watermark") ?? "")) })
          close()
        }}
      >
        <p className="px-1 pb-1 text-[11px] text-neutral-500">Custom watermark</p>
        <input
          name="watermark"
          aria-label="Custom watermark"
          defaultValue={setup.watermark}
          maxLength={40}
          placeholder="Custom text"
          className="h-7 w-full rounded border border-black/15 px-2 text-xs"
        />
      </form>
    </div>
  )
  const pageColorMenu = (close: () => void) => (
    <ColorMenu
      active={setup.pageColor}
      clearLabel="No Color"
      onClear={() => {
        update({ pageColor: "" })
        close()
      }}
      onSelect={(pageColor) => {
        update({ pageColor })
        close()
      }}
    />
  )
  const openPageBorders = () => requestPageBorders({ setup, onApply: (patch) => update(patch) })
  const styleSetMenu = (close: () => void) => (
    <StyleSetPanel
      setup={setup}
      theme={theme}
      onApply={(id) => {
        update({ styleSet: id, spacing: "default" })
        close()
      }}
    />
  )
  const dialogs = (
    <>
      {confirmDefault ? (
        <DialogFrame title="Set as Default" width={420} onClose={() => setConfirmDefault(false)}>
          <p className="mt-2 text-sm text-neutral-700">
            Set the current style set, theme, colors, fonts, paragraph spacing, and effects as the default for new
            documents?
          </p>
          <div className="word-dialog-actions">
            <button
              type="button"
              className="dialog-btn is-primary"
              onClick={() => {
                saveFormatDefault(setup)
                setConfirmDefault(false)
              }}
            >
              Yes
            </button>
            <button type="button" className="dialog-btn" onClick={() => setConfirmDefault(false)}>
              No
            </button>
          </div>
        </DialogFrame>
      ) : null}
      {dialog === "colors" ? (
        <ThemeColorsDialog
          initial={{
            name: nextCustomName(customColorSchemes().map((item) => item.name)),
            colors: theme.colors,
          }}
          onClose={() => setDialog(null)}
          onSave={(scheme) => {
            saveCustomColors(scheme)
            refresh()
            update(colorSetup(scheme))
            setDialog(null)
          }}
        />
      ) : null}
      {dialog === "fonts" ? (
        <ThemeFontsDialog
          initial={{
            name: nextCustomName(customFontSchemes().map((item) => item.name)),
            major: theme.major,
            minor: theme.minor,
          }}
          onClose={() => setDialog(null)}
          onSave={(scheme) => {
            saveCustomFonts(scheme)
            refresh()
            update(fontSetup(scheme))
            setDialog(null)
          }}
        />
      ) : null}
    </>
  )
  if (ribbonLayout === "single") {
    const formatting: LineCommand[] = [
      { id: "themes", label: "Themes", icon: <LineThemesIcon />, priority: 2, menu: themesMenu },
      { id: "style-set", label: "Style Set", icon: <StyleSetIcon />, priority: 1, menu: styleSetMenu },
      { id: "colors", label: "Colors", icon: <LineColorsIcon />, priority: 1, menu: colorsMenu },
      { id: "fonts", label: "Fonts", icon: <LineFontsIcon />, priority: 1, menu: fontsMenu },
    ]
    const background: LineCommand[] = [
      { id: "watermark", label: "Watermark", icon: <LineWatermarkIcon />, priority: 1, menu: watermarkMenu },
      {
        id: "page-color",
        label: "Page Color",
        icon: <LinePageColorIcon color={setup.pageColor || "transparent"} />,
        menu: pageColorMenu,
      },
      { id: "page-borders", label: "Page Borders", icon: <LinePageBordersIcon />, onClick: openPageBorders },
    ]
    const more: LineGroup[] = [
      {
        id: "formatting",
        commands: [
          { id: "paragraph-spacing", label: "Paragraph Spacing", icon: <SpacingIcon />, menu: spacingMenu },
          { id: "effects", label: "Effects", icon: <EffectsIcon />, menu: effectsMenu },
          { id: "set-default", label: "Set as Default", icon: <DefaultIcon />, onClick: () => setConfirmDefault(true) },
        ],
      },
    ]
    return (
      <>
        <SingleLineBar
          label="Design"
          groups={[
            { id: "formatting", commands: formatting.map((command) => ({ ...command, showLabel: true })) },
            { id: "background", commands: background.map((command) => ({ ...command, showLabel: true })) },
          ]}
          more={more}
        />
        {dialogs}
      </>
    )
  }
  return (
    <div role="toolbar" aria-label="Design" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Document Formatting" className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 items-stretch">
          <RibbonCommand label="Themes" description="Change the overall design of the document." menu={themesMenu}>
            <ThemesIcon />
          </RibbonCommand>
          <StyleSetGallery setup={setup} theme={theme} onApply={(id) => update({ styleSet: id, spacing: "default" })} />
          <div className="flex shrink-0">
            <RibbonCommand label="Colors" description="Change the theme colors." menu={colorsMenu}>
              <ColorsIcon />
            </RibbonCommand>
            <RibbonCommand label="Fonts" description="Change the theme fonts." menu={fontsMenu}>
              <FontIcon />
            </RibbonCommand>
            <div className="flex flex-col justify-center">
              <RibbonCommand size="small" label="Paragraph Spacing" menu={spacingMenu}>
                <SpacingIcon />
              </RibbonCommand>
              <RibbonCommand size="small" label="Effects" menu={effectsMenu}>
                <EffectsIcon />
              </RibbonCommand>
              <RibbonCommand size="small" label="Set as Default" onClick={() => setConfirmDefault(true)}>
                <DefaultIcon />
              </RibbonCommand>
            </div>
          </div>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Page Background" className="shrink-0">
        <RibbonCommand label="Watermark" menu={watermarkMenu}>
          <WatermarkIcon />
        </RibbonCommand>
        <RibbonCommand label="Page Color" menu={pageColorMenu}>
          <ColorIcon />
        </RibbonCommand>
        <RibbonCommand label="Page Borders" onClick={openPageBorders}>
          <BorderIcon />
        </RibbonCommand>
      </RibbonGroup>
      {dialogs}
    </div>
  )
}

/** Lines of text with the preset's line height and gap, as Word's Paragraph Spacing pictures. */
const SPACING_SAMPLES = {
  none: { line: 1, after: 0 },
  compact: { line: 1, after: 1 },
  tight: { line: 1.15, after: 1.5 },
  open: { line: 1.15, after: 3 },
  relaxed: { line: 1.5, after: 1.5 },
  double: { line: 2, after: 2 },
}

function SpacingSample({ line, after }: { line: number; after: number }) {
  const step = 2.4 * line
  const rows: number[] = []
  let y = 3
  for (const _ of [0, 1]) {
    for (const __ of [0, 1]) {
      rows.push(y)
      y += step
    }
    y += after
  }
  return (
    <svg className="design-spacing-sample" viewBox="0 0 24 24" aria-hidden data-keep-light>
      <rect x="0.5" y="0.5" width="23" height="23" fill="#fff" stroke="#c8c8c8" />
      {rows.map((top, index) => (
        <path key={index} d={`M4 ${top.toFixed(2)}h${index % 2 ? 11 : 16}`} stroke="#7a7a7a" strokeWidth="1" />
      ))}
    </svg>
  )
}

/** A theme in the Themes menu: "Aa" in its heading font over its six accents, and its name. */
const ThemeThumb = memo(function ThemeThumb({
  theme,
  pressed,
  onApply,
}: {
  theme: SavedTheme
  pressed: boolean
  onApply: (theme: SavedTheme) => void
}) {
  return (
    <button
      type="button"
      className="design-theme-thumb"
      aria-label={theme.name}
      aria-pressed={pressed}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onApply(theme)}
    >
      <span
        className="design-theme-face"
        data-keep-light
        style={{ background: theme.colors[1], color: theme.colors[0] }}
      >
        <span style={{ fontFamily: stackOf(theme.major) }}>Aa</span>
        <span className="design-theme-accents">
          {theme.colors.slice(4, 10).map((color, index) => (
            <span key={index} style={{ background: color }} />
          ))}
        </span>
      </span>
      <span className="design-theme-name">{theme.name}</span>
    </button>
  )
})

/** The look of the document as it is now: its own styles, or the app's when it was made in the app. */
function documentLooks(setup: PageSetup, theme: SavedTheme) {
  const word = currentWordDocument()
  const set = setup.styleSet ? styleSetCatalog(setup.styleSet) : null
  if (set || word) {
    return styleLooks(set ?? word!.styles, theme)
  }
  const heading = stackOf(theme.major)
  const body = stackOf(theme.minor)
  const colors = theme.colors
  const look = (patch: Partial<StyleLook>): StyleLook => ({
    family: body,
    size: 12,
    color: "#000000",
    bold: false,
    italic: false,
    caps: false,
    rule: "",
    ...patch,
  })
  return {
    title: look({ family: heading, size: 28, color: setup.themeColors ? colors[4]! : "#2e75b6" }),
    heading: look({ family: heading, size: 22, bold: true, color: setup.themeColors ? colors[4]! : "#000000" }),
    body: look({}),
  }
}

/** A Style Set thumbnail: its Title, Heading 1 and body text, drawn in the document's theme. */
const StyleSetThumb = memo(function StyleSetThumb({
  name,
  looks,
  pressed,
  onApply,
}: {
  name: string
  looks: ReturnType<typeof styleLooks>
  pressed: boolean
  onApply: () => void
}) {
  const text = (look: StyleLook, scale: number, max: number) => ({
    fontFamily: look.family,
    fontSize: `${Math.min(max, Math.max(4, look.size * scale))}px`,
    color: look.color,
    fontWeight: look.bold ? 700 : 400,
    fontStyle: look.italic ? "italic" : "normal",
    textTransform: look.caps ? ("uppercase" as const) : undefined,
    borderBottom: look.rule ? `1px solid ${look.rule}` : undefined,
  })
  return (
    <RibbonHover label={name}>
      <button
        type="button"
        className="style-set-thumb"
        aria-label={name}
        aria-pressed={pressed}
        data-keep-light
        onMouseDown={(event) => event.preventDefault()}
        onClick={onApply}
      >
        <span className="style-set-line" style={text(looks.title, 0.5, 15)}>
          Title
        </span>
        <span className="style-set-line" style={text(looks.heading, 0.5, 9)}>
          Heading 1
        </span>
        <span className="style-set-body" style={{ ...text(looks.body, 0.42, 5), borderBottom: undefined }}>
          Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa.
        </span>
      </button>
    </RibbonHover>
  )
})

function useStyleSetThumbs(setup: PageSetup, theme: SavedTheme, onApply: (id: string) => void) {
  const applyRef = useRef(onApply)
  applyRef.current = onApply
  const key = `${theme.colors.join()}|${theme.major}|${theme.minor}`
  return useMemo(
    () => ({
      current: documentLooks(setup, theme),
      sets: STYLE_SETS.map((set) => ({
        ...set,
        looks: styleLooks(styleSetCatalog(set.id)!, theme),
        apply: () => applyRef.current(set.id),
      })),
    }),
    [key, setup.styleSet, setup.themeColors],
  )
}

/** Design > Style Set: "This Document" and Word's built-in Style Sets, with Reset to the Default Style Set. */
function StyleSetPanel({
  setup,
  theme,
  onApply,
}: {
  setup: PageSetup
  theme: SavedTheme
  onApply: (id: string) => void
}) {
  const thumbs = useStyleSetThumbs(setup, theme, onApply)
  return (
    <div className="design-menu w-[352px]">
      <MenuHeading>This Document</MenuHeading>
      <div className="style-set-grid">
        <StyleSetThumb
          name="This Document"
          looks={thumbs.current}
          pressed={false}
          onApply={() => onApply(setup.styleSet)}
        />
      </div>
      <MenuHeading>Built-In</MenuHeading>
      <div className="style-set-grid" role="group" aria-label="Style Sets">
        {thumbs.sets.map((set) => (
          <StyleSetThumb
            key={set.id}
            name={set.name}
            looks={set.looks}
            pressed={set.id === setup.styleSet}
            onApply={set.apply}
          />
        ))}
      </div>
      <div className="design-menu-actions">
        <MenuButton disabled={!setup.styleSet} onClick={() => onApply("")}>
          Reset to the Default Style Set
        </MenuButton>
      </div>
    </div>
  )
}

const THUMB_STEP = 80

/** The Style Set gallery on the ribbon: as many sets as fit, the scroll arrows, and More for the whole panel. */
function StyleSetGallery({
  setup,
  theme,
  onApply,
}: {
  setup: PageSetup
  theme: SavedTheme
  onApply: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(3)
  const [start, setStart] = useState(0)
  const thumbs = useStyleSetThumbs(setup, theme, onApply)
  const total = thumbs.sets.length + 1
  useEffect(() => {
    const element = scroller.current
    if (!element) {
      return
    }
    const measure = () => setCount(Math.min(total, Math.max(1, Math.floor((element.clientWidth + 4) / THUMB_STEP))))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [total])
  const maxStart = Math.max(0, total - count)
  const origin = Math.min(start, maxStart)
  return (
    <div className="relative flex min-w-0 flex-1 items-stretch gap-0.5 pt-1 pr-1" role="group" aria-label="Style Set">
      <div ref={scroller} className="flex min-w-[80px] flex-1 overflow-hidden">
        <div className="flex gap-1" style={{ transform: `translateX(-${origin * THUMB_STEP}px)` }}>
          <StyleSetThumb
            name="This Document"
            looks={thumbs.current}
            pressed={false}
            onApply={() => onApply(setup.styleSet)}
          />
          {thumbs.sets.map((set) => (
            <StyleSetThumb
              key={set.id}
              name={set.name}
              looks={set.looks}
              pressed={set.id === setup.styleSet}
              onApply={set.apply}
            />
          ))}
        </div>
      </div>
      <div className="ribbon-gallery-nav">
        <RibbonHover label="Previous style sets">
          <button
            type="button"
            aria-label="Previous style sets"
            aria-disabled={origin === 0 || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => origin > 0 && setStart(origin - 1)}
          >
            <GalleryArrow direction="up" />
          </button>
        </RibbonHover>
        <RibbonHover label="Next style sets">
          <button
            type="button"
            aria-label="Next style sets"
            aria-disabled={origin >= maxStart || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => origin < maxStart && setStart(origin + 1)}
          >
            <GalleryArrow direction="down" />
          </button>
        </RibbonHover>
        <RibbonPopover
          label="More style sets"
          className="ribbon-gallery-more"
          content={(close) => (
            <StyleSetPanel
              setup={setup}
              theme={theme}
              onApply={(id) => {
                onApply(id)
                close()
              }}
            />
          )}
        >
          <GalleryMoreIcon />
        </RibbonPopover>
      </div>
    </div>
  )
}

function StyleSetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="none" stroke="var(--icon-base-color, #444)" />
      <path d="M5 5.5h6" stroke="var(--icon-accent-color, #0f6cbd)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 8.5h5M5 11h4" stroke="var(--icon-base-color, #444)" strokeLinecap="round" />
    </svg>
  )
}

function GalleryArrow({ direction }: { direction: "up" | "down" }) {
  const path = direction === "up" ? "M1.6 5.2 4 2.8 6.4 5.2" : "M1.6 2.8 4 5.2 6.4 2.8"
  return (
    <svg className="ribbon-chevron" viewBox="0 0 8 8" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GalleryMoreIcon() {
  return (
    <svg className="ribbon-chevron" viewBox="0 0 8 8" aria-hidden>
      <path
        d="M1 1.5h6M1.6 3.4 4 5.7 6.4 3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ThemesIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="5" y="6" width="18" height="16" rx="1" fill="#fff" stroke="#8a8a8a" />
      <path d="M8 12h8M8 16h6" stroke="#2e75b6" />
      <rect x="17" y="11" width="4" height="6" fill="#ed7d31" />
    </svg>
  )
}

function ColorsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="6" y="8" width="4" height="12" fill="#5b9bd5" />
      <rect x="12" y="8" width="4" height="12" fill="#ed7d31" />
      <rect x="18" y="8" width="4" height="12" fill="#70ad47" />
    </svg>
  )
}

function FontIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <text x="5" y="20" fontSize="16" fontFamily="Georgia, serif" fill="#1f4e79">
        A
      </text>
      <text x="16" y="20" fontSize="14" fontFamily="Calibri, sans-serif" fill="#242424">
        a
      </text>
    </svg>
  )
}

function SpacingIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path d="M8 6h12M8 14h12M8 22h12" stroke="#444" />
      <path d="M5 9v10M4 10l1-2 1 2M4 18l1 2 1-2" stroke="#0f6cbd" strokeLinecap="round" />
    </svg>
  )
}

function EffectsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" fill="#5b9bd5" />
      <rect x="11" y="11" width="12" height="12" rx="2" fill="#ed7d31" opacity="0.85" />
    </svg>
  )
}

function DefaultIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <circle cx="14" cy="14" r="8" fill="#e8f5e9" stroke="#107c10" />
      <path
        d="M10 14.2 12.6 16.8 18.2 11.2"
        fill="none"
        stroke="#107c10"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EffectSample({ id }: { id: string }) {
  const shadow =
    id === "subtle"
      ? "0 1px 1px rgb(0 0 0 / 0.25)"
      : id === "moderate"
        ? "2px 3px 2px rgb(0 0 0 / 0.35)"
        : id === "intense"
          ? "0 0 6px #5b9bd5, 2px 3px 2px rgb(0 0 0 / 0.3)"
          : "1px 1px 1px rgb(0 0 0 / 0.35)"
  return (
    <span className="flex gap-0.5">
      <span className="size-3 rounded-sm bg-[#5b9bd5]" style={{ boxShadow: shadow }} />
      <span className="size-3 rounded-full bg-[#ed7d31]" style={{ boxShadow: shadow }} />
    </span>
  )
}

function WatermarkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="6" y="4" width="16" height="20" fill="#fff" stroke="#8a8a8a" />
      <text x="8" y="17" fontSize="6" fill="#c8c8c8">
        DRAFT
      </text>
    </svg>
  )
}

function ColorIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path d="M8 16c0-5 6-10 6-10s6 5 6 10a6 6 0 0 1-12 0Z" fill="#deecf9" stroke="#0f6cbd" />
    </svg>
  )
}

function BorderIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="6" y="6" width="16" height="16" fill="none" stroke="#0f6cbd" strokeWidth="2" />
    </svg>
  )
}
