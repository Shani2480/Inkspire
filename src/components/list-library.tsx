import {
  applyBullet,
  applyMultilevel,
  applyNumbering,
  clearList,
  continueNumbering,
  readNumberStart,
  setNumberStart,
} from "@/editor/home-actions"
import { setListLevel } from "@/editor/indent"
import type { Editor } from "@tiptap/core"
import { useEffect, useState, type ReactNode } from "react"
import { DialogFrame } from "@/components/word-dialog"

const NUMBER_FORMATS = [
  { id: "decimal", samples: ["1.", "2.", "3."] },
  { id: "decimal-paren", samples: ["1)", "2)", "3)"] },
  { id: "upper-roman", samples: ["I.", "II.", "III."] },
  { id: "upper-alpha", samples: ["A.", "B.", "C."] },
  { id: "lower-alpha-paren", samples: ["a)", "b)", "c)"] },
  { id: "lower-alpha", samples: ["a.", "b.", "c."] },
  { id: "lower-roman", samples: ["i.", "ii.", "iii."] },
] as const

const BULLETS = [
  { id: "disc", samples: ["•", "•", "•"] },
  { id: "circle", samples: ["○", "○", "○"] },
  { id: "square", samples: ["■", "■", "■"] },
  { id: "'✓ '", samples: ["✓", "✓", "✓"] },
  { id: "'➤ '", samples: ["➤", "➤", "➤"] },
  { id: "'◆ '", samples: ["◆", "◆", "◆"] },
  { id: "'→ '", samples: ["→", "→", "→"] },
  { id: "'★ '", samples: ["★", "★", "★"] },
] as const

type ListDialog = "number-format" | "number-value" | "bullet" | "multilevel" | null

export function NumberingLibrary({
  editor,
  active,
  inList,
  onDialog,
  onClose,
}: {
  editor: Editor
  active: string
  inList: boolean
  onDialog: (dialog: Exclude<ListDialog, null>) => void
  onClose: () => void
}) {
  const selected = NUMBER_FORMATS.some((format) => format.id === active) ? active : inList ? "decimal" : ""

  return (
    <LibraryShell title="Numbering Library">
      <div className="grid grid-cols-3 gap-2">
        <NoneTile
          selected={!inList}
          onClick={() => {
            clearList(editor)
            onClose()
          }}
        />
        {NUMBER_FORMATS.map((format) => (
          <SampleTile
            key={format.id}
            samples={format.samples}
            selected={inList && selected === format.id}
            label={format.samples[0]}
            onClick={() => {
              applyNumbering(editor, format.id)
              onClose()
            }}
          />
        ))}
      </div>
      <LibraryFooter
        inList={inList}
        editor={editor}
        kind="number"
        onDefine={() => onDialog("number-format")}
        onValue={() => onDialog("number-value")}
        onClose={onClose}
      />
    </LibraryShell>
  )
}

export function BulletLibrary({
  editor,
  active,
  inList,
  onDialog,
  onClose,
}: {
  editor: Editor
  active: string
  inList: boolean
  onDialog: (dialog: Exclude<ListDialog, null>) => void
  onClose: () => void
}) {
  const selected = BULLETS.some((bullet) => bullet.id === active) ? active : inList ? "disc" : ""

  return (
    <LibraryShell title="Bullet Library">
      <div className="grid grid-cols-3 gap-2">
        <NoneTile
          selected={!inList}
          onClick={() => {
            clearList(editor)
            onClose()
          }}
        />
        {BULLETS.map((bullet) => (
          <SampleTile
            key={bullet.id}
            samples={bullet.samples}
            selected={inList && selected === bullet.id}
            label={bullet.samples[0]}
            onClick={() => {
              applyBullet(editor, bullet.id)
              onClose()
            }}
          />
        ))}
      </div>
      <LibraryFooter
        inList={inList}
        editor={editor}
        kind="bullet"
        onDefine={() => onDialog("bullet")}
        onClose={onClose}
      />
    </LibraryShell>
  )
}

export function MultilevelLibrary({
  editor,
  scheme,
  inList,
  onDialog,
  onClose,
}: {
  editor: Editor
  scheme: string
  inList: boolean
  onDialog: (dialog: Exclude<ListDialog, null>) => void
  onClose: () => void
}) {
  function apply(next: "outline" | "legal" | "bullets") {
    applyMultilevel(editor, next)
    onClose()
  }

  return (
    <LibraryShell title="List Library">
      <div className="grid grid-cols-2 gap-2">
        <NoneTile
          selected={!inList}
          onClick={() => {
            clearList(editor)
            onClose()
          }}
        />
        <LevelTile
          selected={inList && scheme === "outline"}
          label="1, a, i"
          lines={["1.", "a.", "i."]}
          onClick={() => apply("outline")}
        />
        <LevelTile
          selected={inList && scheme === "legal"}
          label="1, 1.1, 1.1.1"
          lines={["1.", "1.1", "1.1.1"]}
          onClick={() => apply("legal")}
        />
        <LevelTile
          selected={inList && scheme === "bullets"}
          label="Bullets"
          lines={["•", "○", "■"]}
          onClick={() => apply("bullets")}
        />
      </div>
      <LibraryFooter
        inList={inList}
        editor={editor}
        kind="multi"
        onDefine={() => onDialog("multilevel")}
        onClose={onClose}
      />
    </LibraryShell>
  )
}

export function ListDialogs({
  editor,
  dialog,
  onClose,
}: {
  editor: Editor | null
  dialog: ListDialog
  onClose: () => void
}) {
  if (!editor || !dialog) {
    return null
  }
  if (dialog === "number-format") {
    return <DefineNumberFormat editor={editor} onClose={onClose} />
  }
  if (dialog === "number-value") {
    return <SetNumberingValue editor={editor} onClose={onClose} />
  }
  if (dialog === "bullet") {
    return <DefineBullet editor={editor} onClose={onClose} />
  }
  return <DefineMultilevel editor={editor} onClose={onClose} />
}

function LibraryShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-[292px] px-1 py-1">
      <h3 className="mb-2 px-1 text-[13px] font-semibold text-[#242424]">{title}</h3>
      {children}
    </div>
  )
}

function NoneTile({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className="flex h-[74px] items-center justify-center rounded-[1px] border border-[#d0d0d0] bg-white text-[13px] text-[#242424] aria-pressed:border-[#8a8a8a] aria-pressed:shadow-[inset_0_0_0_1px_#8a8a8a]"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      None
    </button>
  )
}

function SampleTile({
  samples,
  selected,
  label,
  onClick,
}: {
  samples: readonly string[]
  selected: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      className="flex h-[74px] flex-col justify-center gap-[3px] rounded-[1px] border border-[#d0d0d0] bg-white px-2 aria-pressed:border-[#8a8a8a] aria-pressed:shadow-[inset_0_0_0_1px_#8a8a8a]"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {samples.map((sample, index) => (
        <span key={`${sample}-${index}`} className="flex items-center gap-1.5">
          <span className="w-7 shrink-0 text-left text-[11px] leading-none text-[#242424]">{sample}</span>
          <span className="h-px flex-1 bg-[#c6c6c6]" />
        </span>
      ))}
    </button>
  )
}

function LevelTile({
  lines,
  selected,
  label,
  onClick,
}: {
  lines: string[]
  selected: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      className="flex h-[74px] flex-col justify-center gap-[3px] rounded-[1px] border border-[#d0d0d0] bg-white px-2 text-left aria-pressed:border-[#8a8a8a] aria-pressed:shadow-[inset_0_0_0_1px_#8a8a8a]"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {lines.map((line, index) => (
        <span key={line} className="flex items-center gap-1.5" style={{ paddingLeft: index * 10 }}>
          <span className="w-8 shrink-0 text-[11px] leading-none text-[#242424]">{line}</span>
          <span className="h-px flex-1 bg-[#c6c6c6]" />
        </span>
      ))}
    </button>
  )
}

function LibraryFooter({
  inList,
  editor,
  kind,
  onDefine,
  onValue,
  onClose,
}: {
  inList: boolean
  editor: Editor
  kind: "number" | "bullet" | "multi"
  onDefine: () => void
  onValue?: () => void
  onClose: () => void
}) {
  const [levels, setLevels] = useState(false)

  return (
    <div className="relative mt-2 border-t border-[#e6e6e6] pt-1">
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-1 text-left text-[13px] text-[#242424] disabled:text-[#b0b0b0]"
        disabled={!inList}
        aria-expanded={levels}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setLevels((open) => !open)}
      >
        <LevelIcon />
        <span className="flex-1">Change List Level</span>
        <span aria-hidden>›</span>
      </button>
      {levels && inList ? (
        <div className="absolute top-8 left-full z-10 ml-1 w-40 rounded-md border border-[#d0d0d0] bg-white py-1 shadow-md">
          {Array.from({ length: 9 }, (_, level) => (
            <button
              key={level}
              type="button"
              className="flex h-7 w-full items-center text-left text-[12px] text-[#242424] hover:bg-[#f3f3f3]"
              style={{ paddingLeft: 8 + level * 8 }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setListLevel(editor, level)
                onClose()
              }}
            >
              {kind === "bullet" ? ["•", "○", "■"][level % 3] : levelMarker(level)}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="flex h-8 w-full items-center justify-center px-1 text-[13px] text-[#242424] hover:bg-[#f3f3f3]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onDefine()
          onClose()
        }}
      >
        {kind === "number"
          ? "Define New Number Format..."
          : kind === "bullet"
            ? "Define New Bullet..."
            : "Define New Multilevel List..."}
      </button>
      {kind === "number" && onValue ? (
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 px-1 text-left text-[13px] text-[#242424] hover:bg-[#f3f3f3]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onValue()
            onClose()
          }}
        >
          <ValueIcon />
          <span>Set Numbering Value...</span>
        </button>
      ) : null}
    </div>
  )
}

function DefineNumberFormat({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [marker, setMarker] = useState<string>("decimal")
  const [align, setAlign] = useState<"left" | "center" | "right">("left")
  const format = NUMBER_FORMATS.find((item) => item.id === marker) ?? NUMBER_FORMATS[0]

  return (
    <DialogShell title="Define New Number Format" onClose={onClose}>
      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        Number style
        <select
          aria-label="Number style"
          className="h-8 rounded-md border border-black/15 px-2 text-sm text-neutral-900"
          value={marker}
          onChange={(event) => setMarker(event.target.value)}
        >
          {NUMBER_FORMATS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.samples.join(" ")}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex flex-col gap-1 text-xs text-neutral-600">
        Number format
        <input
          aria-label="Number format"
          readOnly
          value={format.samples[0]}
          className="h-8 rounded-md border border-black/15 px-2 text-sm"
        />
      </label>
      <label className="mt-3 flex flex-col gap-1 text-xs text-neutral-600">
        Alignment
        <select
          aria-label="Alignment"
          className="h-8 rounded-md border border-black/15 px-2 text-sm text-neutral-900"
          value={align}
          onChange={(event) => setAlign(event.target.value as "left" | "center" | "right")}
        >
          <option value="left">Left</option>
          <option value="center">Centered</option>
          <option value="right">Right</option>
        </select>
      </label>
      <Preview samples={format.samples} />
      <DialogButtons
        onClose={onClose}
        onOk={() => {
          applyNumbering(editor, marker)
          editor.chain().focus().setTextAlign(align).run()
          onClose()
        }}
      />
    </DialogShell>
  )
}

function SetNumberingValue({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [mode, setMode] = useState<"start" | "continue">("start")
  const [value, setValue] = useState("1")

  useEffect(() => {
    setValue(String(readNumberStart(editor)))
  }, [editor])

  return (
    <DialogShell title="Set Numbering Value" onClose={onClose}>
      <label className="flex items-center gap-2 text-sm text-neutral-800">
        <input type="radio" name="number-value" checked={mode === "start"} onChange={() => setMode("start")} />
        Start new list
      </label>
      <label className="mt-2 flex items-center gap-2 pl-6 text-xs text-neutral-600">
        Set value to
        <input
          aria-label="Set value to"
          type="number"
          min={1}
          value={value}
          disabled={mode !== "start"}
          className="h-8 w-20 rounded-md border border-black/15 px-2 text-sm text-neutral-900"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm text-neutral-800">
        <input type="radio" name="number-value" checked={mode === "continue"} onChange={() => setMode("continue")} />
        Continue from previous list
      </label>
      <DialogButtons
        onClose={onClose}
        onOk={() => {
          if (mode === "continue") {
            continueNumbering(editor)
          } else {
            if (!editor.isActive("orderedList")) {
              applyNumbering(editor, "decimal")
            }
            setNumberStart(editor, Number(value) || 1)
          }
          onClose()
        }}
      />
    </DialogShell>
  )
}

function DefineBullet({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [symbol, setSymbol] = useState("•")

  return (
    <DialogShell title="Define New Bullet" onClose={onClose}>
      <div className="flex flex-wrap gap-1">
        {["•", "○", "■", "✓", "➤", "◆", "→", "★"].map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={symbol === item}
            className="flex size-8 items-center justify-center rounded border border-[#d0d0d0] text-sm aria-pressed:border-[#0f6cbd]"
            onClick={() => setSymbol(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <label className="mt-3 flex flex-col gap-1 text-xs text-neutral-600">
        Character
        <input
          aria-label="Bullet character"
          value={symbol}
          maxLength={2}
          className="h-8 rounded-md border border-black/15 px-2 text-sm"
          onChange={(event) => setSymbol(event.target.value)}
        />
      </label>
      <DialogButtons
        onClose={onClose}
        onOk={() => {
          applyBullet(editor, bulletMarker(symbol))
          onClose()
        }}
      />
    </DialogShell>
  )
}

function DefineMultilevel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [scheme, setScheme] = useState<"outline" | "legal" | "bullets">("outline")

  return (
    <DialogShell title="Define New Multilevel List" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        <LevelTile
          selected={scheme === "outline"}
          label="1, a, i"
          lines={["1.", "a.", "i."]}
          onClick={() => setScheme("outline")}
        />
        <LevelTile
          selected={scheme === "legal"}
          label="1, 1.1, 1.1.1"
          lines={["1.", "1.1", "1.1.1"]}
          onClick={() => setScheme("legal")}
        />
        <LevelTile
          selected={scheme === "bullets"}
          label="Bullets"
          lines={["•", "○", "■"]}
          onClick={() => setScheme("bullets")}
        />
      </div>
      <DialogButtons
        onClose={onClose}
        onOk={() => {
          applyMultilevel(editor, scheme)
          onClose()
        }}
      />
    </DialogShell>
  )
}

function Preview({ samples }: { samples: readonly string[] }) {
  return (
    <div className="mt-3 rounded-md border border-black/10 p-3">
      <p className="text-[11px] text-neutral-500">Preview</p>
      <div className="mt-2 flex flex-col gap-1">
        {samples.map((sample, index) => (
          <span key={`${sample}-${index}`} className="flex items-center gap-2 text-sm">
            <span className="w-8">{sample}</span>
            <span className="h-px flex-1 bg-[#d0d0d0]" />
          </span>
        ))}
      </div>
    </div>
  )
}

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <DialogFrame title={title} width={380} onClose={onClose} level={70}>
      <div className="mt-3">{children}</div>
    </DialogFrame>
  )
}

function DialogButtons({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  return (
    <div className="word-dialog-actions">
      <span className="flex-1" />
      <button type="button" className="dialog-btn is-primary" onClick={onOk}>
        OK
      </button>
      <button type="button" className="dialog-btn" onClick={onClose}>
        Cancel
      </button>
    </div>
  )
}

function levelMarker(level: number) {
  const markers = ["1.", "a.", "i.", "1)", "a)", "I.", "A.", "i)", "•"]
  return markers[level] ?? "1."
}

function bulletMarker(symbol: string) {
  if (symbol === "•") {
    return "disc"
  }
  if (symbol === "○") {
    return "circle"
  }
  if (symbol === "■") {
    return "square"
  }
  const character = symbol.replace(/['"\\]/g, "").slice(0, 2) || "•"
  return `'${character} '`
}

function LevelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M1 4h5M1 7h8M1 10h5" stroke="currentColor" strokeWidth="1" />
      <path d="M9 2.5 11.5 5 9 7.5M11.5 6.5 9 9 11.5 11.5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function ValueIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M1 3h2.2M1 7h2.2M1 11h2.2" stroke="#0f6cbd" strokeWidth="1" />
      <path d="M8 9.2 11.2 6l1.3 1.3L9.3 10.5H8z" fill="#c45911" />
    </svg>
  )
}
