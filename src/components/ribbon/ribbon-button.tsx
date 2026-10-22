import { useEditingOptions } from "@/document/editing-options"
import { ribbonTip } from "@/components/ribbon/tips"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { TooltipContent } from "@/components/ui/tooltip"
import { commandShortcut } from "@/lib/platform"
import { cn } from "@/lib/utils"
import { useState, type MouseEvent, type ReactElement, type ReactNode } from "react"

const ribbonControlClass =
  "inline-flex items-center justify-center rounded-[3px] text-[var(--app-ribbon-text)] hover:bg-[var(--app-hover)] aria-pressed:bg-[var(--app-pressed)] aria-pressed:hover:bg-[var(--app-pressed)] aria-disabled:text-[var(--app-ribbon-disabled)] aria-disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0"

type TooltipSide = "top" | "bottom"

export function RibbonTipContent({
  label,
  description,
  shortcut,
  side = "bottom",
}: {
  label: string
  description?: string
  shortcut?: string
  side?: TooltipSide
}) {
  const known = ribbonTip(label)
  const text = description ?? known?.description
  const showKeys = useEditingOptions((state) => state.showShortcutKeys)
  const keys = showKeys ? (shortcut ?? (known?.key ? commandShortcut(known.key, known.shift) : undefined)) : undefined

  return (
    <TooltipContent variant="office" side={side}>
      <span className="text-[11px] leading-3.5 font-semibold">{label}</span>
      {text ? (
        <span className="max-w-[220px] text-[10.5px] leading-[1.35] font-normal whitespace-normal text-[#3b3b3b]">
          {text}
        </span>
      ) : null}
      {keys ? <span className="text-[10.5px] leading-3.5 text-[#3b3b3b]">{keys}</span> : null}
    </TooltipContent>
  )
}

export function RibbonHover({
  label,
  description,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string
  description?: string
  shortcut?: string
  side?: TooltipSide
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <RibbonTipContent label={label} description={description} shortcut={shortcut} side={side} />
    </Tooltip>
  )
}

export function RibbonButton({
  label,
  description,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  onMouseDown,
  children,
  className,
  side = "bottom",
  appearance = "icon",
  onDoubleClick,
}: {
  label: string
  description?: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  onMouseDown?: (event: MouseEvent<HTMLButtonElement>) => void
  onDoubleClick?: () => void
  children: ReactNode
  className?: string
  side?: TooltipSide
  appearance?: "icon" | "text"
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        aria-pressed={active}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        onMouseDown={(event) => {
          event.preventDefault()
          onMouseDown?.(event)
        }}
        onClick={() => {
          if (!disabled) {
            onClick()
          }
        }}
        onDoubleClick={() => {
          if (!disabled) {
            onDoubleClick?.()
          }
        }}
        className={cn(
          ribbonControlClass,
          appearance === "icon" && "size-[22px] [&_svg]:size-4",
          appearance === "text" && "h-[26px] w-auto gap-1.5 px-1.5 text-xs [&_svg]:size-4",
          className,
        )}
      >
        {children}
      </TooltipTrigger>
      <RibbonTipContent label={label} description={description} shortcut={shortcut} side={side} />
    </Tooltip>
  )
}

export function RibbonPopover({
  label,
  description,
  shortcut,
  children,
  content,
  className,
  active = false,
  disabled = false,
  contentClassName,
  onOpen,
}: {
  label: string
  description?: string
  shortcut?: string
  children: ReactNode
  content: (close: () => void) => ReactNode
  className?: string
  active?: boolean
  disabled?: boolean
  contentClassName?: string
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) {
          setOpen(next)
          if (next) {
            onOpen?.()
          }
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger
          aria-label={label}
          aria-pressed={active}
          aria-expanded={open || undefined}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            ribbonControlClass,
            "h-[26px] w-auto gap-0.5 px-1.5 text-xs [&_svg:not(.ribbon-chevron)]:size-4",
            open && "is-menu-open",
            className,
          )}
          render={<PopoverTrigger />}
        >
          {children}
        </TooltipTrigger>
        <RibbonTipContent label={label} description={description} shortcut={shortcut} />
      </Tooltip>
      <PopoverContent
        align="start"
        sideOffset={0}
        className={cn(
          "ribbon-menu w-auto p-1.5 shadow-none ring-0 data-open:animate-none data-closed:animate-none",
          contentClassName,
        )}
      >
        <div onMouseDown={(event) => event.preventDefault()}>{content(() => setOpen(false))}</div>
      </PopoverContent>
    </Popover>
  )
}

export function RibbonSplit({
  label,
  menuLabel,
  children,
  menu,
  onClick,
  disabled = false,
  active = false,
  className,
  contentClassName,
}: {
  label: string
  menuLabel?: string
  children: ReactNode
  menu: (close: () => void) => ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  className?: string
  contentClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const caretLabel = menuLabel ?? `${label} menu`

  return (
    <div className={cn("ribbon-split inline-flex items-stretch", open && "is-menu-open")}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={label}
          aria-pressed={active}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          className={cn(ribbonControlClass, "h-[26px] gap-0.5 px-1", className)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!disabled) {
              onClick?.()
            }
          }}
        >
          {children}
        </TooltipTrigger>
        <RibbonTipContent label={label} />
      </Tooltip>
      <Popover
        open={disabled ? false : open}
        onOpenChange={(next) => {
          if (!disabled) {
            setOpen(next)
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger
            aria-label={caretLabel}
            aria-expanded={open}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
            className={cn(ribbonControlClass, "h-[26px] w-3.5 px-0", open && "is-menu-open")}
            onMouseDown={(event) => event.preventDefault()}
            render={<PopoverTrigger />}
          >
            <ChevronMark />
          </TooltipTrigger>
          <RibbonTipContent label={caretLabel} />
        </Tooltip>
        <PopoverContent
          align="start"
          sideOffset={0}
          className={cn(
            "ribbon-menu w-auto p-1.5 shadow-none ring-0 data-open:animate-none data-closed:animate-none",
            contentClassName,
          )}
        >
          <div onMouseDown={(event) => event.preventDefault()}>{menu(() => setOpen(false))}</div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function RibbonCommand({
  label,
  description,
  shortcut,
  children,
  disabled = false,
  active = false,
  onClick,
  menu,
  size = "large",
}: {
  label: string
  description?: string
  shortcut?: string
  children: ReactNode
  disabled?: boolean
  active?: boolean
  onClick?: () => void
  menu?: (close: () => void) => ReactNode
  size?: "large" | "small"
}) {
  if (size === "small") {
    const icon = <span className="ribbon-side-icon">{children}</span>
    const text = (
      <>
        {icon}
        <span className="ribbon-side-label">{label}</span>
        {menu ? <ChevronMark /> : null}
      </>
    )
    if (menu) {
      return (
        <RibbonPopover
          label={label}
          description={description}
          shortcut={shortcut}
          disabled={disabled}
          active={active}
          className="ribbon-side"
          content={menu}
        >
          {text}
        </RibbonPopover>
      )
    }
    return (
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={label}
          aria-pressed={active || undefined}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          className={`ribbon-side${active ? " is-active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!disabled) {
              onClick?.()
            }
          }}
        >
          {text}
        </TooltipTrigger>
        <RibbonTipContent label={label} description={description} shortcut={shortcut} />
      </Tooltip>
    )
  }

  // A split button, as Word's Paste or Borders: the picture and the label do the command, the arrow opens the menu.
  if (menu && onClick) {
    const press = () => {
      if (!disabled) {
        onClick()
      }
    }
    return (
      <div className={`ribbon-command-split${active ? " is-active" : ""}`}>
        <Tooltip>
          <TooltipTrigger
            type="button"
            aria-label={label}
            aria-pressed={active || undefined}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
            className="ribbon-large"
            onMouseDown={(event) => event.preventDefault()}
            onClick={press}
          >
            <span className="ribbon-command-icon">{children}</span>
          </TooltipTrigger>
          <RibbonTipContent label={label} description={description} shortcut={shortcut} />
        </Tooltip>
        <div className="flex items-center">
          <button
            type="button"
            aria-label={label}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
            className="ribbon-command-split-text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={press}
          >
            {label}
          </button>
          <RibbonPopover label={`${label} options`} className="h-3 w-2.5 gap-0 px-0" disabled={disabled} content={menu}>
            <ChevronMark />
          </RibbonPopover>
        </div>
      </div>
    )
  }

  if (menu) {
    return (
      <RibbonPopover
        label={label}
        description={description}
        shortcut={shortcut}
        disabled={disabled}
        active={active}
        className="ribbon-command"
        content={menu}
      >
        <span className="ribbon-command-icon">{children}</span>
        <CommandLabel label={label} menu />
      </RibbonPopover>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        aria-pressed={active || undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className={`ribbon-command${active ? " is-active" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!disabled) {
            onClick?.()
          }
        }}
      >
        <span className="ribbon-command-icon">{children}</span>
        <CommandLabel label={label} />
      </TooltipTrigger>
      <RibbonTipContent label={label} description={description} shortcut={shortcut} />
    </Tooltip>
  )
}

function CommandLabel({ label, menu = false }: { label: string; menu?: boolean }) {
  const splitAt = label.lastIndexOf(" ")
  const hyphenAt = label.lastIndexOf("-")
  const breakAt = splitAt !== -1 ? splitAt : hyphenAt
  const lead = breakAt === -1 ? "" : label.slice(0, breakAt + 1)
  const end = breakAt === -1 ? label : label.slice(breakAt + 1)

  return (
    <span className="ribbon-command-label">
      {lead ? <span className={splitAt === -1 ? "ribbon-command-label-lead" : undefined}>{lead}</span> : null}
      <span className="ribbon-command-label-end">
        {end}
        {menu ? <ChevronMark /> : null}
      </span>
    </span>
  )
}

function ChevronMark() {
  return (
    <svg className="ribbon-chevron" viewBox="0 0 8 8" aria-hidden>
      <path
        d="M1.6 2.8 4 5.2 6.4 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RibbonGroup({
  children,
  label,
  onLaunch,
  launchLabel,
  className,
  name,
}: {
  children: ReactNode
  label?: string
  onLaunch?: () => void
  launchLabel?: string
  className?: string
  name?: string
}) {
  if (!label) {
    return (
      <div
        data-group={name}
        className={cn("flex items-center gap-0.5 border-r border-[#e1e1e1] px-1.5 last:border-r-0", className)}
      >
        {children}
      </div>
    )
  }

  return (
    <div data-group={name} className={cn("ribbon-group-labeled", className)}>
      <div className="ribbon-group-body">{children}</div>
      <div className="ribbon-caption">
        <span>{label}</span>
        {onLaunch ? (
          <Tooltip>
            <TooltipTrigger
              type="button"
              className="ribbon-launcher"
              aria-label={launchLabel ?? label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onLaunch}
            >
              <LauncherIcon />
            </TooltipTrigger>
            <RibbonTipContent label={launchLabel ?? label} description={launcherDescription(launchLabel ?? label)} />
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}

function launcherDescription(name: string) {
  if (name === "Font") {
    return "Show the Font dialog box to change the font, size, color, and effects."
  }
  if (name === "Paragraph") {
    return "Show the Paragraph dialog box to change alignment, indentation, and spacing."
  }
  if (name === "Clipboard") {
    return "Show text copied while the app has been running."
  }
  if (name === "Borders") {
    return "Show the Borders and Shading dialog box to set the borders and the fill of the selected cells, or of the whole table."
  }
  return `Show the ${name} dialog box.`
}

function LauncherIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 8h6M6 4l2 4M8 4v4H4" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function MenuButton({
  selected,
  disabled,
  onClick,
  children,
  className,
}: {
  selected?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={selected}
      disabled={disabled}
      className={cn("h-8 w-full justify-start px-2 font-normal", selected && "bg-neutral-100", className)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
