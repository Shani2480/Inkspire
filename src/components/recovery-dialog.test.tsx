import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RecoveryDialog } from "@/components/recovery-dialog"

const discard = vi.fn(async () => undefined)
let offers: unknown[] = []

vi.mock("@/document/recovery", () => ({
  discardRecovery: (id: string) => discard(id),
  formatRecoveryWhen: () => "Today",
  listRecoveryOffers: async () => offers,
}))
const openRecovery = vi.fn(async (_offer: unknown) => true)
vi.mock("@/document/commands", () => ({
  openRecoveryDocument: (offer: unknown) => openRecovery(offer),
}))

const offer = (id: string) => ({
  id,
  wordCount: 3,
  preview: "text",
  meta: { documentName: `Doc ${id}`, writtenAt: 1, sourcePath: "" },
})

describe("Unsaved Documents rail", () => {
  beforeEach(() => {
    discard.mockClear()
    openRecovery.mockClear()
    offers = [offer("a"), offer("b"), offer("c")]
  })
  afterEach(cleanup)

  it("discards every draft after one confirmation", async () => {
    render(<RecoveryDialog />)
    fireEvent.click(await screen.findByRole("button", { name: "Discard all (3)" }))
    expect(discard).not.toHaveBeenCalled()
    expect(screen.getByText(/Discard all 3 drafts\?/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Discard all" }))
    await waitFor(() => expect(discard).toHaveBeenCalledTimes(3))
    expect(discard.mock.calls.map((call) => call[0] as string)).toEqual(["a", "b", "c"])
    await waitFor(() => expect(screen.queryByText("Doc a")).toBeNull())
  })

  it("keeps everything when the confirmation is cancelled", async () => {
    render(<RecoveryDialog />)
    fireEvent.click(await screen.findByRole("button", { name: "Discard all (3)" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(discard).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Discard all (3)" })).toBeTruthy()
  })

  it("restores a draft through the window-opening command and takes it off the list", async () => {
    render(<RecoveryDialog />)
    const restore = await screen.findAllByRole("button", { name: "Restore" })
    fireEvent.click(restore[0]!)
    await waitFor(() => expect(openRecovery).toHaveBeenCalledTimes(1))
    expect((openRecovery.mock.calls[0]![0] as { id: string }).id).toBe("a")
    await waitFor(() => expect(screen.queryByText("Doc a")).toBeNull())
  })

  it("keeps the draft listed when the person backs out of restoring it", async () => {
    openRecovery.mockResolvedValueOnce(false)
    render(<RecoveryDialog />)
    fireEvent.click((await screen.findAllByRole("button", { name: "Restore" }))[0]!)
    await waitFor(() => expect(openRecovery).toHaveBeenCalled())
    expect(screen.getByText("Doc a")).toBeTruthy()
  })

  it("offers no discard-all for a single draft", async () => {
    offers = [offer("only")]
    render(<RecoveryDialog />)
    await screen.findByText("Doc only")
    expect(screen.queryByRole("button", { name: /Discard all/ })).toBeNull()
  })
})
