import { Button } from "@/components/ui/button"
import { openRecoveryDocument } from "@/document/commands"
import { discardRecovery, formatRecoveryWhen, listRecoveryOffers, type RecoveryOffer } from "@/document/recovery"
import { ChevronDown, ChevronRight, FileClock, Trash2 } from "lucide-react"
import { useCallback, useEffect, useId, useState } from "react"

/**
 * Left-rail Unsaved Documents manager. Lists orphaned IndexedDB snapshots so the
 * user can restore or discard each one without blocking the workspace.
 */
export function RecoveryDialog() {
  const titleId = useId()
  const [offers, setOffers] = useState<RecoveryOffer[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)

  const refresh = useCallback(async () => {
    const next = await listRecoveryOffers()
    setOffers(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    void listRecoveryOffers().then((next) => {
      if (!cancelled) {
        setOffers(next)
      }
    })
    const onRefresh = () => {
      void refresh()
    }
    window.addEventListener("focus", onRefresh)
    window.addEventListener("aiword-recovery-changed", onRefresh)
    return () => {
      cancelled = true
      window.removeEventListener("focus", onRefresh)
      window.removeEventListener("aiword-recovery-changed", onRefresh)
    }
  }, [refresh])

  if (offers.length === 0) {
    return null
  }

  async function onRestore(offer: RecoveryOffer) {
    if (busyId) {
      return
    }
    setBusyId(offer.id)
    try {
      // The draft opens in a new window; the open document is only replaced when it is still an untouched blank.
      if (await openRecoveryDocument(offer)) {
        setOffers((current) => current.filter((item) => item.id !== offer.id))
      }
      setConfirmId(null)
    } finally {
      setBusyId(null)
    }
  }

  async function onDiscard(offer: RecoveryOffer) {
    if (busyId) {
      return
    }
    if (confirmId !== offer.id) {
      setConfirmId(offer.id)
      return
    }
    setBusyId(offer.id)
    try {
      await discardRecovery(offer.id)
      setOffers((current) => current.filter((item) => item.id !== offer.id))
      setConfirmId(null)
    } finally {
      setBusyId(null)
    }
  }

  async function onDiscardAll() {
    if (busyId) {
      return
    }
    if (!confirmAll) {
      setConfirmAll(true)
      setConfirmId(null)
      return
    }
    setBusyId("all")
    try {
      for (const offer of offers) {
        await discardRecovery(offer.id)
      }
      setOffers([])
    } finally {
      setBusyId(null)
      setConfirmAll(false)
    }
  }

  return (
    <aside
      className="recovery-rail flex w-[240px] shrink-0 flex-col border-r border-[var(--app-divider)] bg-[var(--app-ribbon-card,#f3f2f1)] text-[var(--app-ribbon-text)]"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 border-b border-[var(--app-divider)] px-3 py-2.5 text-left hover:bg-[var(--app-hover)]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <FileClock className="mt-0.5 size-4 shrink-0 text-[var(--app-theme-primary,#0f6cbd)]" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[12px] font-semibold leading-tight">
            Unsaved Documents
          </h2>
          <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--app-ribbon-muted)]">
            {offers.length === 1 ? "1 draft ready to recover" : `${offers.length} drafts ready to recover`}
          </p>
        </div>
        {open ? (
          <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-[var(--app-ribbon-muted)]" strokeWidth={2} />
        ) : (
          <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-[var(--app-ribbon-muted)]" strokeWidth={2} />
        )}
      </button>

      {open ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
          {offers.length > 1 ? (
            confirmAll ? (
              <div className="rounded-md border border-red-300 p-2 text-[11px] dark:border-red-800" role="alert">
                <p className="mb-1.5">Discard all {offers.length} drafts? They cannot be brought back.</p>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                    disabled={Boolean(busyId)}
                    onClick={() => void onDiscardAll()}
                  >
                    <Trash2 className="mr-1 size-3" strokeWidth={2} />
                    Discard all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    disabled={Boolean(busyId)}
                    onClick={() => setConfirmAll(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-[var(--app-ribbon-muted)]"
                disabled={Boolean(busyId)}
                onClick={() => void onDiscardAll()}
              >
                Discard all ({offers.length})
              </Button>
            )
          ) : null}
          {offers.map((offer) => {
            const name = offer.meta.documentName || "Untitled document (Recovered)"
            const busy = busyId === offer.id
            const confirming = confirmId === offer.id
            return (
              <article
                key={offer.id}
                className="rounded-md border border-[var(--app-popover-border,#e1dfdd)] bg-[var(--app-popover-bg,#fff)] p-2.5 shadow-sm"
              >
                <p className="truncate text-[12px] font-medium" title={name}>
                  {name}
                </p>
                <p className="mt-1 text-[10.5px] leading-snug text-[var(--app-ribbon-muted)]">
                  {formatRecoveryWhen(offer.meta.writtenAt)}
                  {" · "}
                  {offer.wordCount === 1 ? "1 word" : `${offer.wordCount} words`}
                </p>
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[var(--app-ribbon-muted)]">
                  {offer.preview}
                </p>
                {offer.meta.sourcePath ? (
                  <p className="mt-1 truncate text-[10px] text-[var(--app-ribbon-muted)]" title={offer.meta.sourcePath}>
                    {offer.meta.sourcePath}
                  </p>
                ) : null}

                <div className="mt-2.5 flex flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="w-full bg-[var(--app-theme-primary,#0f6cbd)] hover:bg-[var(--app-theme-hover)]"
                    disabled={Boolean(busyId)}
                    onClick={() => void onRestore(offer)}
                  >
                    {busy && busyId === offer.id ? "Restoring…" : "Restore"}
                  </Button>
                  {confirming ? (
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                        disabled={Boolean(busyId)}
                        onClick={() => void onDiscard(offer)}
                      >
                        <Trash2 className="mr-1 size-3" strokeWidth={2} />
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                        disabled={Boolean(busyId)}
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-[var(--app-ribbon-muted)]"
                      disabled={Boolean(busyId)}
                      onClick={() => void onDiscard(offer)}
                    >
                      Discard
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </aside>
  )
}
