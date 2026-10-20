import {
  AccountView,
  AddInsView,
  CloseAction,
  ExportView,
  HistoryView,
  HomeView,
  InfoView,
  NewView,
  OpenView,
  OptionsView,
  PrintView,
  SaveAction,
  SaveAsView,
  ShareView,
  TransformView,
} from "@/components/backstage/views"
import { useBackstage, type BackstageTab } from "@/document/backstage"
import { themeAccentVars } from "@/document/theme"
import { useViewStore } from "@/document/view"
import {
  ArrowLeft,
  History,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  Home,
  Info,
  Package,
  Printer,
  RefreshCw,
  Save,
  Settings,
  Share2,
  User,
  X,
} from "lucide-react"
import { prefersReducedMotion } from "@/document/motion"
import { useEffect, useState, type ReactNode } from "react"

const TOP_TABS: { id: BackstageTab; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", icon: <Home className="size-4" /> },
  { id: "new", label: "New", icon: <FilePlus2 className="size-4" /> },
  { id: "open", label: "Open", icon: <FolderOpen className="size-4" /> },
  { id: "addins", label: "Get Add-ins", icon: <Package className="size-4" /> },
]

const ACTION_TABS: { id: BackstageTab; label: string; icon: ReactNode }[] = [
  { id: "info", label: "Info", icon: <Info className="size-4" /> },
  { id: "save", label: "Save", icon: <Save className="size-4" /> },
  { id: "save-as", label: "Save As", icon: <FileText className="size-4" /> },
  { id: "history", label: "History", icon: <History className="size-4" /> },
  { id: "print", label: "Print", icon: <Printer className="size-4" /> },
  { id: "share", label: "Share", icon: <Share2 className="size-4" /> },
  { id: "export", label: "Export", icon: <FileDown className="size-4" /> },
  { id: "transform", label: "Transform", icon: <RefreshCw className="size-4" /> },
  { id: "close", label: "Close", icon: <X className="size-4" /> },
]

const FOOTER_TABS: { id: BackstageTab; label: string; icon: ReactNode }[] = [
  { id: "account", label: "Account", icon: <User className="size-4" /> },
  { id: "options", label: "Options", icon: <Settings className="size-4" /> },
]

export function Backstage() {
  const open = useBackstage((state) => state.open)
  const tab = useBackstage((state) => state.tab)
  const setTab = useBackstage((state) => state.setTab)
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  const closed = useBackstage((state) => state.closed)
  const themeBackground = useViewStore((state) => state.themeBackground)
  const colorMode = useViewStore((state) => state.colorMode)

  useEffect(() => {
    if (!open) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        closeBackstage()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, closeBackstage])

  const shown = usePresence(open, LEAVE_MS)

  if (!shown) {
    return null
  }

  return (
    <div
      className={`backstage${open ? "" : " is-leaving"}`}
      style={themeAccentVars(themeBackground, colorMode)}
      role="dialog"
      aria-label="File"
      aria-hidden={open ? undefined : true}
    >
      <aside className="backstage-nav">
        <button
          type="button"
          className="backstage-back"
          aria-label="Back"
          disabled={closed}
          title={closed ? "No document is open" : undefined}
          onClick={closeBackstage}
        >
          <ArrowLeft className="size-4" strokeWidth={2.25} />
        </button>
        <nav className="backstage-nav-group" aria-label="File start">
          {TOP_TABS.map((item) => (
            <NavButton key={item.id} item={item} active={tab === item.id} onSelect={setTab} />
          ))}
        </nav>
        <div className="backstage-nav-divider" />
        <nav className="backstage-nav-group" aria-label="File actions">
          {ACTION_TABS.map((item) => (
            <NavButton key={item.id} item={item} active={tab === item.id} disabled={closed} onSelect={setTab} />
          ))}
        </nav>
        <nav className="backstage-nav-footer" aria-label="Account and settings">
          {FOOTER_TABS.map((item) => (
            <NavButton key={item.id} item={item} active={tab === item.id} onSelect={setTab} />
          ))}
        </nav>
      </aside>
      {/* Keyed by tab, so each page fades in as it is chosen and starts at its top. */}
      <div key={tab} className="backstage-content">
        {renderTab(tab)}
      </div>
    </div>
  )
}

/** How long the File view takes to slide away; kept in step with backstage-out in index.css. */
const LEAVE_MS = 160

/** True while `open`, and for `leaveMs` after it closes, so the closing animation can play before unmounting. */
function usePresence(open: boolean, leaveMs: number) {
  const [shown, setShown] = useState(open)
  useEffect(() => {
    if (open) {
      setShown(true)
      return
    }
    if (prefersReducedMotion()) {
      setShown(false)
      return
    }
    const timer = window.setTimeout(() => setShown(false), leaveMs)
    return () => window.clearTimeout(timer)
  }, [open, leaveMs])
  return open || shown
}

function NavButton({
  item,
  active,
  disabled = false,
  onSelect,
}: {
  item: { id: BackstageTab; label: string; icon: ReactNode }
  active: boolean
  /** Commands on the open document, while none is open. */
  disabled?: boolean
  onSelect: (id: BackstageTab) => void
}) {
  return (
    <button
      type="button"
      className={`backstage-nav-item${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={() => onSelect(item.id)}
    >
      <span className="backstage-nav-icon">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  )
}

function renderTab(tab: BackstageTab) {
  switch (tab) {
    case "home":
      return <HomeView />
    case "new":
      return <NewView />
    case "open":
      return <OpenView />
    case "addins":
      return <AddInsView />
    case "info":
      return <InfoView />
    case "save":
      return <SaveAction />
    case "save-as":
      return <SaveAsView />
    case "history":
      return <HistoryView />
    case "print":
      return <PrintView />
    case "share":
      return <ShareView />
    case "export":
      return <ExportView />
    case "transform":
      return <TransformView />
    case "close":
      return <CloseAction />
    case "account":
      return <AccountView />
    case "options":
      return <OptionsView />
    default:
      return <HomeView />
  }
}
