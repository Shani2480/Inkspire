import { ColorMenu } from "@/components/color-menu"
import { requestPageBorders } from "@/components/design-dialogs"
import { MenuButton, RibbonCommand, RibbonGroup, RibbonHover } from "@/components/ribbon/ribbon-button"
import {
  COLOR_SCHEMES,
  DESIGN_THEMES,
  EFFECT_PRESETS,
  FONT_PAIRS,
  SPACING_PRESETS,
  colorSchemeById,
  saveFormatDefault,
  type DesignTheme,
} from "@/document/design-format"
import { clipWatermark, type PageSetup } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import {
  LineColorsIcon,
  LineFontsIcon,
  LinePageBordersIcon,
  LinePageColorIcon,
  LineThemesIcon,
  LineWatermarkIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DialogFrame } from "@/components/word-dialog"

const WATERMARKS = ["CONFIDENTIAL", "DO NOT COPY", "DRAFT", "SAMPLE", "ASAP", "URGENT"]

export function DesignTab() {
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const [confirmDefault, setConfirmDefault] = useState(false)

  function update(next: Partial<PageSetup>) {
    setPageSetup({ ...setup, ...next })
  }

  function applyTheme(theme: DesignTheme) {
    update({
      bodyFont: theme.bodyFont,
      headingFont: theme.headingFont,
      colorScheme: theme.colors,
      effects: theme.effects,
    })
  }

  const colorsMenu = (close: () => void) => (
    <div className="flex max-h-80 w-72 flex-col overflow-auto">
      {COLOR_SCHEMES.map((scheme) => (
        <MenuButton
          key={scheme.id}
          selected={setup.colorScheme === scheme.id}
          onClick={() => {
            update({ colorScheme: scheme.id })
            close()
          }}
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate">{scheme.name}</span>
            <span className="flex shrink-0 gap-0.5">
              {scheme.chips.map((color) => (
                <span key={color} className="size-3 border border-black/15" style={{ background: color }} />
              ))}
            </span>
          </span>
        </MenuButton>
      ))}
    </div>
  )
  const fontsMenu = (close: () => void) => (
    <div className="flex max-h-80 w-64 flex-col overflow-auto">
      {FONT_PAIRS.map((font) => (
        <MenuButton
          key={font.id}
          className="h-auto py-1"
          selected={setup.bodyFont === font.body && setup.headingFont === font.heading}
          onClick={() => {
            update({ bodyFont: font.body, headingFont: font.heading })
            close()
          }}
        >
          <span className="flex w-full flex-col items-start">
            <span className="text-[15px] leading-none" style={{ fontFamily: font.heading }}>
              {font.label}
            </span>
            <span className="text-[11px] text-neutral-500" style={{ fontFamily: font.body }}>
              The quick brown fox jumps
            </span>
          </span>
        </MenuButton>
      ))}
    </div>
  )
  const spacingMenu = (close: () => void) => (
    <div className="flex w-64 flex-col">
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
          <span className="flex w-full flex-col items-start">
            <span>{item.label}</span>
            <span className="text-[11px] text-neutral-500">{item.detail}</span>
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
  const selectedTheme = DESIGN_THEMES.find((theme) => themeMatches(setup, theme))?.id ?? ""
  const themesMenu = (close: () => void) => (
    <div className="grid max-h-80 w-80 grid-cols-3 gap-1 overflow-auto p-1" role="group" aria-label="Themes">
      {DESIGN_THEMES.map((theme) => (
        <ThemeThumb
          key={theme.id}
          theme={theme}
          pressed={theme.id === selectedTheme}
          onApply={(picked) => {
            applyTheme(picked)
            close()
          }}
        />
      ))}
    </div>
  )
  const confirmDialog = confirmDefault ? (
    <DialogFrame title="Set as Default" width={420} onClose={() => setConfirmDefault(false)}>
      <p className="mt-2 text-sm text-neutral-700">
        Set the current theme, colors, fonts, paragraph spacing, and effects as the default for new documents?
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
  ) : null

  if (ribbonLayout === "single") {
    const formatting: LineCommand[] = [
      { id: "themes", label: "Themes", icon: <LineThemesIcon />, priority: 2, menu: themesMenu },
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
        {confirmDialog}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="Design" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Document Formatting" className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 items-stretch">
          <ThemeGallery setup={setup} onApply={applyTheme} />
          <div className="flex shrink-0">
            <RibbonCommand label="Colors" menu={colorsMenu}>
              <ColorsIcon />
            </RibbonCommand>
            <RibbonCommand label="Fonts" menu={fontsMenu}>
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
      {confirmDialog}
    </div>
  )
}

function placePanel(panel: HTMLDivElement | null, anchor: HTMLButtonElement | null) {
  if (!panel || !anchor) {
    return
  }
  const rect = anchor.getBoundingClientRect()
  panel.style.position = "fixed"
  panel.style.top = `${rect.bottom + 2}px`
  panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 336))}px`
}

function themeMatches(setup: PageSetup, theme: DesignTheme) {
  return (
    setup.bodyFont === theme.bodyFont &&
    setup.headingFont === theme.headingFont &&
    setup.colorScheme === theme.colors &&
    setup.effects === theme.effects
  )
}

const ThemeThumb = memo(function ThemeThumb({
  theme,
  pressed,
  onApply,
}: {
  theme: DesignTheme
  pressed: boolean
  onApply: (theme: DesignTheme) => void
}) {
  const scheme = colorSchemeById(theme.colors)
  return (
    <button
      type="button"
      className="theme-thumb"
      aria-label={theme.name}
      aria-pressed={pressed}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onApply(theme)}
    >
      <span
        className="truncate text-[11px] leading-none font-semibold"
        style={{ color: scheme?.heading, fontFamily: theme.headingFont }}
      >
        Title
      </span>
      <span
        className="truncate text-[9px] leading-none font-semibold"
        style={{ color: scheme?.accent, fontFamily: theme.headingFont }}
      >
        Heading 1
      </span>
      <span
        className="truncate text-[8px] leading-none text-neutral-700"
        style={{ color: scheme?.chips[0], fontFamily: theme.bodyFont }}
      >
        Body text
      </span>
    </button>
  )
})

function ThemeGallery({ setup, onApply }: { setup: PageSetup; onApply: (theme: DesignTheme) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const themesButton = useRef<HTMLButtonElement>(null)
  const moreButton = useRef<HTMLButtonElement>(null)
  const menuPanel = useRef<HTMLDivElement>(null)
  const morePanel = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(3)
  const [start, setStart] = useState(0)
  const [menu, setMenu] = useState(false)
  const [more, setMore] = useState(false)
  const applyRef = useRef(onApply)
  applyRef.current = onApply
  const stableApply = useCallback((theme: DesignTheme) => {
    applyRef.current(theme)
    setMenu(false)
    setMore(false)
  }, [])
  const selectedId = DESIGN_THEMES.find((theme) => themeMatches(setup, theme))?.id ?? ""
  const thumbs = useMemo(
    () =>
      DESIGN_THEMES.map((theme) => (
        <ThemeThumb key={theme.id} theme={theme} pressed={theme.id === selectedId} onApply={stableApply} />
      )),
    [selectedId, stableApply],
  )
  const moreThumbs = useMemo(
    () =>
      DESIGN_THEMES.map((theme) => (
        <ThemeThumb key={`more-${theme.id}`} theme={theme} pressed={theme.id === selectedId} onApply={stableApply} />
      )),
    [selectedId, stableApply],
  )
  const menuThumbs = useMemo(
    () =>
      DESIGN_THEMES.map((theme) => (
        <ThemeThumb key={`menu-${theme.id}`} theme={theme} pressed={theme.id === selectedId} onApply={stableApply} />
      )),
    [selectedId, stableApply],
  )

  useEffect(() => {
    if (!menu && !more) {
      return
    }
    const close = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (
        menuPanel.current?.contains(target) ||
        morePanel.current?.contains(target) ||
        themesButton.current?.contains(target) ||
        moreButton.current?.contains(target)
      ) {
        return
      }
      setMenu(false)
      setMore(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [menu, more])

  useEffect(() => {
    const element = scroller.current
    if (!element) {
      return
    }
    const measure = () => {
      const fit = Math.max(1, Math.floor((element.clientWidth + 4) / 80))
      setCount(Math.min(DESIGN_THEMES.length, fit))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const maxStart = Math.max(0, DESIGN_THEMES.length - count)
  const origin = Math.min(start, maxStart)

  return (
    <div className="relative flex min-w-0 flex-1 items-stretch gap-0.5 pt-1 pr-1">
      <RibbonHover label="Themes" description="Apply a document theme.">
        <button
          type="button"
          aria-label="Themes"
          aria-expanded={menu}
          ref={themesButton}
          className="ribbon-command shrink-0"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setMore(false)
            placePanel(menuPanel.current, themesButton.current)
            setMenu((open) => !open)
          }}
        >
          <span className="ribbon-command-icon">
            <ThemesIcon />
          </span>
          <span className="ribbon-command-label">
            <span className="ribbon-command-label-end">Themes</span>
          </span>
        </button>
      </RibbonHover>
      <div ref={scroller} className="flex min-w-[80px] flex-1 overflow-hidden">
        <div className="flex gap-1" style={{ transform: `translateX(-${origin * 80}px)` }}>
          {thumbs}
        </div>
      </div>
      <div className="ribbon-gallery-nav">
        <RibbonHover label="Previous themes">
          <button
            type="button"
            aria-label="Previous themes"
            aria-disabled={origin === 0 || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (origin > 0) {
                setStart(origin - 1)
              }
            }}
          >
            <GalleryArrow direction="up" />
          </button>
        </RibbonHover>
        <RibbonHover label="Next themes">
          <button
            type="button"
            aria-label="Next themes"
            aria-disabled={origin >= maxStart || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (origin < maxStart) {
                setStart(origin + 1)
              }
            }}
          >
            <GalleryArrow direction="down" />
          </button>
        </RibbonHover>
        <RibbonHover label="More themes">
          <button
            type="button"
            ref={moreButton}
            aria-label="More"
            aria-expanded={more}
            className="ribbon-gallery-more"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setMenu(false)
              placePanel(morePanel.current, moreButton.current)
              setMore((open) => !open)
            }}
          >
            <GalleryMoreIcon />
          </button>
        </RibbonHover>
      </div>
      <div
        ref={menuPanel}
        hidden={!menu}
        className="z-50 flex max-h-80 w-72 flex-col gap-1 overflow-auto rounded border border-black/10 bg-white p-1 shadow-lg"
      >
        {menuThumbs}
      </div>
      <div
        ref={morePanel}
        hidden={!more}
        className="z-50 grid max-h-80 w-80 grid-cols-3 gap-1 overflow-auto rounded border border-black/10 bg-white p-1 shadow-lg"
      >
        {moreThumbs}
      </div>
    </div>
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
