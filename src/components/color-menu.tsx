import { openColorDialog } from "@/components/color-dialog"
import { MenuButton } from "@/components/ribbon/ribbon-button"

export const THEME_COLUMNS = [
  ["#ffffff", "#f2f2f2", "#d9d9d9", "#bfbfbf", "#a6a6a6", "#7f7f7f"],
  ["#000000", "#7f7f7f", "#595959", "#3f3f3f", "#262626", "#0c0c0c"],
  ["#e7e6e6", "#d0cece", "#afabab", "#767171", "#3b3838", "#161616"],
  ["#44546a", "#d6dce4", "#adb9ca", "#8496b0", "#333f50", "#222a35"],
  ["#4472c4", "#d6dce4", "#b4c6e7", "#8faadc", "#2f5496", "#1f3864"],
  ["#ed7d31", "#fbe5d6", "#f8cbad", "#f4b183", "#c65911", "#833c0b"],
  ["#a5a5a5", "#ededed", "#dbdbdb", "#c9c9c9", "#7b7b7b", "#525252"],
  ["#ffc000", "#fff2cc", "#ffe699", "#ffd966", "#bf8f00", "#806000"],
  ["#5b9bd5", "#deebf7", "#bdd7ee", "#9dc3e6", "#2e75b6", "#1e4e79"],
  ["#70ad47", "#e2efda", "#c6e0b4", "#a9d08e", "#548235", "#375623"],
]

export const STANDARD_COLORS = [
  "#c00000",
  "#ff0000",
  "#ffc000",
  "#ffff00",
  "#92d050",
  "#00b050",
  "#00b0f0",
  "#0070c0",
  "#002060",
  "#7030a0",
]

export const HIGHLIGHT_PALETTE = [
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#ff00ff",
  "#0000ff",
  "#ff0000",
  "#000080",
  "#008080",
  "#008000",
  "#800080",
  "#800000",
  "#808000",
  "#808080",
  "#c0c0c0",
  "#000000",
]

export function ColorMenu({
  active,
  clearLabel,
  onClear,
  onSelect,
  palette = "theme",
}: {
  active: string
  clearLabel: string
  onClear: () => void
  onSelect: (color: string) => void
  palette?: "theme" | "highlight"
}) {
  return (
    <div className="w-[214px] p-2">
      <MenuButton onClick={onClear}>{clearLabel}</MenuButton>
      {palette === "highlight" ? (
        <div className="mt-1 grid grid-cols-5 gap-1">
          {HIGHLIGHT_PALETTE.map((color) => (
            <Swatch key={color} color={color} selected={same(active, color)} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <>
          <p className="mt-2 mb-1 px-1 text-[11px] text-[#767676]">Theme Colors</p>
          <div className="grid grid-cols-10 gap-[3px]">
            {THEME_COLUMNS.map((column) => (
              <div key={column[0]} className="flex flex-col gap-[3px]">
                {column.map((color) => (
                  <Swatch
                    key={`${column[0]}-${color}`}
                    color={color}
                    selected={same(active, color)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 mb-1 px-1 text-[11px] text-[#767676]">Standard Colors</p>
          <div className="grid grid-cols-10 gap-[3px]">
            {STANDARD_COLORS.map((color) => (
              <Swatch key={color} color={color} selected={same(active, color)} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
      <div className="mt-2 border-t border-[#ededed] pt-1">
        <MenuButton onClick={() => openColorDialog(active || "#000000", onSelect)}>More Colors…</MenuButton>
      </div>
    </div>
  )
}

function Swatch({
  color,
  selected,
  onSelect,
}: {
  color: string
  selected: boolean
  onSelect: (color: string) => void
}) {
  return (
    <button
      type="button"
      aria-label={color}
      aria-pressed={selected}
      className="size-4 border border-[#d0d0d0] aria-pressed:border-[#242424] aria-pressed:shadow-[inset_0_0_0_1px_#fff]"
      style={{ background: color }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(color)}
    />
  )
}

function same(left: string, right: string) {
  return left.trim().toLowerCase() === right.toLowerCase()
}
