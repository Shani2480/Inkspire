import { useTabLineGroups } from "@/components/ribbon/custom-groups"
import { fitLine } from "@/components/ribbon/line-fit"
import { RibbonButton, RibbonPopover, RibbonSplit } from "@/components/ribbon/ribbon-button"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

/**
 * One command on Word for the web's single line ribbon. It is described rather than rendered, because the same
 * command shows as a button on the row and as a row of the More options menu once the window is too narrow.
 */
export type LineCommand = {
  id: string
  label: string
  icon?: ReactNode
  /** Higher stays on the row longer; equal priorities leave right to left. */
  priority?: number
  /** Show the label beside the icon, as Word does for Page Break or Find. */
  showLabel?: boolean
  active?: boolean
  disabled?: boolean
  description?: string
  shortcut?: string
  onClick?: () => void
  /** A dropdown; with `onClick` as well, a split button. */
  menu?: (close: () => void) => ReactNode
  /** A dropdown shows a chevron unless this is false, as a group's More (…) does not. */
  chevron?: boolean
  /** A control that is not a button (font name, a spin box), shown as itself on the row and in the menu. */
  field?: ReactNode
}

export type LineGroup = { id: string; commands: LineCommand[] }

/** Divider between groups: 1 px line and 4 px either side. */
const DIVIDER_WIDTH = 9
const MORE_WIDTH = 34
/** The gap after each command on the row. */
const GAP = 2

/**
 * A tab on the single line ribbon. `more` lists commands that are only ever in the More options menu (the rest of
 * the classic tab), below any that left the row for lack of room.
 */
export function SingleLineBar({
  label,
  groups: own,
  more = [],
}: {
  label: string
  groups: LineGroup[]
  more?: LineGroup[]
}) {
  // As the user arranged the tab in Customize Ribbon: the groups removed left out, the user's own added.
  const groups = useTabLineGroups(own)
  const barRef = useRef<HTMLDivElement>(null)
  const widths = useRef(new Map<string, number>())
  const commands = groups.flatMap((group, index) => group.commands.map((command) => ({ command, group: index })))
  const [shown, setShown] = useState<Set<string> | null>(null)
  const signature = commands.map(({ command }) => command.id).join(" ")

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) {
      return
    }
    const fit = () => {
      const items = [...bar.querySelectorAll<HTMLElement>("[data-line-item]")]
      items.forEach((item) => {
        if (!item.hidden) {
          widths.current.set(item.dataset.lineItem ?? "", item.offsetWidth + GAP)
        }
      })
      // A command not yet measured shows for one pass so that it can be.
      if (commands.some(({ command }) => !widths.current.has(command.id))) {
        setShown(null)
        return
      }
      const style = getComputedStyle(bar)
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      // With commands that always live in More options, its button is always there.
      const available = bar.clientWidth - padding - (more.length > 0 ? MORE_WIDTH : 0)
      const fits = fitLine(
        commands.map(({ command, group }) => ({
          width: widths.current.get(command.id) ?? 0,
          priority: command.priority ?? 0,
          group,
        })),
        { available, more: more.length > 0 ? 0 : MORE_WIDTH, divider: DIVIDER_WIDTH },
      )
      const next = new Set(commands.filter((_, index) => fits[index]).map(({ command }) => command.id))
      setShown((current) =>
        current && current.size === next.size && [...next].every((id) => current.has(id)) ? current : next,
      )
    }
    fit()
    const resize = new ResizeObserver(fit)
    resize.observe(bar)
    bar.querySelectorAll("[data-line-item]").forEach((item) => resize.observe(item))
    return () => resize.disconnect()
    // The commands are rebuilt every render; their ids say when the row itself changed.
  }, [signature])

  const isShown = (command: LineCommand) => shown === null || shown.has(command.id)
  const hidden = [
    ...groups
      .map((group) => ({ ...group, commands: group.commands.filter((command) => !isShown(command)) }))
      .filter((group) => group.commands.length > 0),
    ...more,
  ]
  let anyBefore = false

  return (
    <div ref={barRef} role="toolbar" aria-label={label} className="ribbon-line" onKeyDown={moveFocus}>
      {groups.map((group) => {
        const visible = group.commands.some(isShown)
        const divider = visible && anyBefore
        anyBefore ||= visible
        return (
          <Fragment key={group.id}>
            {divider ? <span className="line-divider" aria-hidden /> : null}
            <div className="line-group" data-group={group.id} hidden={!visible || undefined}>
              {group.commands.map((command) => (
                <div
                  key={command.id}
                  className="line-item"
                  data-line-item={command.id}
                  hidden={!isShown(command) || undefined}
                >
                  <LineControl command={command} />
                </div>
              ))}
            </div>
          </Fragment>
        )
      })}
      {hidden.length > 0 ? (
        <RibbonPopover
          label="More options"
          className="line-button line-more"
          contentClassName="line-menu"
          content={(close) => <LineMenu groups={hidden} close={close} />}
        >
          <MoreHorizontal className="size-5" strokeWidth={1.75} />
        </RibbonPopover>
      ) : null}
    </div>
  )
}

/**
 * Toolbar keys, as in Word: Left and Right move between the commands on the row (wrapping), Home and End go to
 * the first and last. Text fields keep their arrows; hidden and disabled commands are skipped.
 */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]
  const target = event.target as HTMLElement
  if (!keys.includes(event.key) || target.closest("input, textarea, select, [contenteditable='true']")) {
    return
  }
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, input")].filter(
    (control) => !control.closest("[hidden]") && !control.matches(":disabled") && control.tabIndex >= 0,
  )
  const index = controls.findIndex((control) => control === target || control.contains(target))
  if (controls.length === 0 || index < 0) {
    return
  }
  const last = controls.length - 1
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? last
        : event.key === "ArrowRight"
          ? (index + 1) % controls.length
          : (index + last) % controls.length
  event.preventDefault()
  controls[next].focus()
}

function LineFace({ command, chevron = false }: { command: LineCommand; chevron?: boolean }) {
  return (
    <>
      {command.icon ? <span className="line-icon">{command.icon}</span> : null}
      {command.showLabel || !command.icon ? <span className="line-label">{command.label}</span> : null}
      {chevron ? <LineChevron /> : null}
    </>
  )
}

function LineChevron() {
  return (
    <svg className="line-chevron" viewBox="0 0 10 10" aria-hidden>
      <path
        d="M2 3.5 5 6.5 8 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A command as it stands on the row. */
function LineControl({ command }: { command: LineCommand }) {
  const labelled = command.showLabel || !command.icon
  if (command.field) {
    return (
      <div className={cn("line-field", command.disabled && "is-disabled")}>
        {command.icon || command.showLabel ? (
          <span className="line-field-label">
            <LineFace command={command} />
          </span>
        ) : null}
        {command.field}
      </div>
    )
  }
  if (command.menu && command.onClick) {
    return (
      <RibbonSplit
        label={command.label}
        onClick={command.onClick}
        active={command.active}
        disabled={command.disabled}
        className={cn("line-button", labelled && "is-labelled")}
        menu={command.menu}
      >
        <LineFace command={command} />
      </RibbonSplit>
    )
  }
  if (command.menu) {
    return (
      <RibbonPopover
        label={command.label}
        description={command.description}
        shortcut={command.shortcut}
        active={command.active}
        disabled={command.disabled}
        className={cn("line-button", labelled && "is-labelled")}
        content={command.menu}
      >
        <LineFace command={command} chevron={command.chevron !== false} />
      </RibbonPopover>
    )
  }
  return (
    <RibbonButton
      label={command.label}
      description={command.description}
      shortcut={command.shortcut}
      active={command.active}
      disabled={command.disabled}
      appearance="text"
      className={cn("line-button", labelled && "is-labelled")}
      onClick={() => command.onClick?.()}
    >
      <LineFace command={command} />
    </RibbonButton>
  )
}

/**
 * The commands that left the row, or a group's secondary commands: each keeps its icon and label, a dropdown opens
 * its own menu in place with a Back row, and a field shows as itself.
 */
export function LineMenu({ groups, close }: { groups: LineGroup[]; close: () => void }) {
  const [opened, setOpened] = useState<LineCommand | null>(null)

  if (opened?.menu) {
    return (
      <div className="line-menu-panel">
        <button type="button" className="line-menu-row is-back" onClick={() => setOpened(null)}>
          <span className="line-icon">
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </span>
          <span className="line-menu-label">{opened.label}</span>
        </button>
        <div className="line-menu-sub">{opened.menu(close)}</div>
      </div>
    )
  }

  return (
    <div className="line-menu-panel" role="menu">
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? <div className="line-menu-separator" role="separator" /> : null}
          {group.commands.map((command) => (
            <LineMenuRow key={command.id} command={command} close={close} open={() => setOpened(command)} />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

function LineMenuRow({ command, close, open }: { command: LineCommand; close: () => void; open: () => void }) {
  const icon = <span className="line-icon">{command.icon}</span>
  if (command.field) {
    return (
      <div className="line-menu-row is-field" aria-disabled={command.disabled || undefined}>
        {icon}
        <span className="line-menu-label">{command.label}</span>
        {command.field}
      </div>
    )
  }
  const run = () => {
    if (command.disabled) {
      return
    }
    if (command.onClick) {
      command.onClick()
      close()
    } else {
      open()
    }
  }
  return (
    <div className="line-menu-split">
      <button
        type="button"
        role="menuitem"
        className="line-menu-row"
        aria-pressed={command.active || undefined}
        aria-disabled={command.disabled || undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={run}
      >
        {icon}
        <span className="line-menu-label">{command.label}</span>
        {command.menu && !command.onClick ? <ChevronRight className="line-menu-next" strokeWidth={1.75} /> : null}
      </button>
      {command.menu && command.onClick ? (
        <button
          type="button"
          className="line-menu-row is-next"
          aria-label={`${command.label} options`}
          aria-disabled={command.disabled || undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => !command.disabled && open()}
        >
          <ChevronRight className="line-menu-next" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  )
}

/** A group's own More menu (Font, Paragraph): secondary commands that are never on the row. */
export function lineMore(id: string, label: string, commands: LineCommand[], priority?: number): LineCommand {
  return {
    id,
    label,
    priority,
    chevron: false,
    icon: <MoreHorizontal strokeWidth={1.75} />,
    menu: (close) => <LineMenu groups={[{ id, commands }]} close={close} />,
  }
}
