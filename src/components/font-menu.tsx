import { useLayoutEffect, useRef, useState } from "react"
import { MenuButton } from "@/components/ribbon/ribbon-button"
import { FONT_FAMILIES } from "@/components/ribbon/options"
import { ensureSystemFonts, useFontChoices, type FontChoice } from "@/editor/system-fonts"
import { cn } from "@/lib/utils"

/** Height of one row of the menu; rows are a fixed height so only the ones in view need to exist. */
const ROW = 32
/** Rows kept beyond each edge of the view, so scrolling does not show blank space. */
const OVERSCAN = 6

type Row = { kind: "body" } | { kind: "heading" } | { kind: "font"; font: FontChoice }

/**
 * The font list: the theme's body font, the bundled fonts, then the system's, each shown in its own face.
 *
 * A system can have hundreds of fonts, and drawing every one in its own face on open made the menu lag, so only the
 * rows in view are drawn.
 */
export function FontMenuList({
  active,
  bodyLabel,
  onBody,
  onSelect,
  className = "flex max-h-80 w-56 flex-col",
}: {
  active: string
  bodyLabel: string
  onBody: () => void
  onSelect: (value: string) => void
  className?: string
}) {
  const fonts = useFontChoices()
  const bundledCount = FONT_FAMILIES.length
  const rows: Row[] = [
    { kind: "body" },
    ...fonts.slice(0, bundledCount).map((font) => ({ kind: "font" as const, font })),
    ...(fonts.length > bundledCount ? [{ kind: "heading" as const }] : []),
    ...fonts.slice(bundledCount).map((font) => ({ kind: "font" as const, font })),
  ]
  const listRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 10 * ROW })

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }
    // Open with the current font in view.
    const index = active ? rows.findIndex((row) => row.kind === "font" && row.font.value === active) : 0
    if (index > 0) {
      list.scrollTop = Math.max(0, index * ROW - list.clientHeight / 2 + ROW / 2)
    }
    setView({ top: list.scrollTop, height: list.clientHeight || 10 * ROW })
    // Only when the menu opens: later the person scrolls it.
  }, [])

  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW) + OVERSCAN)

  return (
    <div
      ref={listRef}
      className={cn(className, "overflow-x-hidden overflow-y-auto")}
      onScroll={(event) => {
        const list = event.currentTarget
        setView({ top: list.scrollTop, height: list.clientHeight })
      }}
    >
      <div className="relative w-full flex-none" style={{ height: rows.length * ROW }}>
        {rows.slice(first, last).map((row, offset) => {
          const index = first + offset
          const style = { position: "absolute", top: index * ROW, left: 0, right: 0, height: ROW } as const
          if (row.kind === "heading") {
            return (
              <p key="heading" className="flex items-end px-2 pb-1 text-[11px] text-neutral-500" style={style}>
                System fonts
              </p>
            )
          }
          if (row.kind === "body") {
            return (
              <div key="body" style={style}>
                <MenuButton selected={!active} onClick={onBody}>
                  {bodyLabel}
                </MenuButton>
              </div>
            )
          }
          return (
            <div key={row.font.value} style={style}>
              <MenuButton selected={active === row.font.value} onClick={() => onSelect(row.font.value)}>
                <span className="block truncate" style={{ fontFamily: row.font.value }}>
                  {row.font.label}
                </span>
              </MenuButton>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function openFontMenu() {
  void ensureSystemFonts()
}
