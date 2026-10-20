import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_ADDRESSES, useAiSettings } from "@/ai/settings"
import { AiKeysDialog } from "@/components/ai-keys"

const invoke = vi.fn()

vi.mock("@/lib/platform", () => ({ isTauriRuntime: () => true }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => undefined }))

const status = (over: Record<string, unknown> = {}) => ({
  supported: true,
  reason: "",
  backend: "cpu",
  vulkan: false,
  engineInstalled: false,
  engineSize: 17_711_083,
  engineTag: "b1",
  models: [
    { id: "qwen2.5-1.5b", label: "Small", size: 1_117_320_736, installed: false, default: false },
    { id: "qwen2.5-3b", label: "Standard", size: 2_104_932_768, installed: false, default: true },
  ],
  running: false,
  installing: false,
  ...over,
})

function answer(local: Record<string, unknown>) {
  invoke.mockImplementation(async (command: string) => {
    if (command === "local_ai_status") {
      return local
    }
    if (command === "ai_key_status") {
      return { openai: "missing", anthropic: "saved", compatible: "missing", storage: "keyring" }
    }
    return undefined
  })
}

describe("AI Settings dialog", () => {
  beforeEach(() => {
    invoke.mockReset()
    useAiSettings.setState({
      provider: "builtin",
      keysOpen: true,
      models: { builtin: "", ollama: "", lmstudio: "", compatible: "", openai: "", anthropic: "" },
      addresses: { ...DEFAULT_ADDRESSES },
    })
  })
  afterEach(cleanup)

  it("offers the one-time download with its size and starts it for the chosen model", async () => {
    answer(status())
    render(<AiKeysDialog />)
    const button = await screen.findByRole("button", { name: /Download 2\.0 GB/ })
    fireEvent.click(button)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("local_ai_install", { modelId: "qwen2.5-3b" }))
  })

  it("shows a checking line, not the browser message, while the desktop app loads the engine status", async () => {
    answer(status())
    render(<AiKeysDialog />)
    expect(screen.getByText(/Checking the built-in engine/)).toBeTruthy()
    expect(screen.queryByText(/Open the desktop app/)).toBeNull()
    expect(await screen.findByRole("button", { name: /Download 2\.0 GB/ })).toBeTruthy()
  })

  it("says the engine uses the processor when there is no Vulkan graphics card", async () => {
    answer(status())
    render(<AiKeysDialog />)
    expect(await screen.findByText(/Uses your processor/)).toBeTruthy()
  })

  it("says it uses the graphics card when Vulkan is there", async () => {
    answer(status({ backend: "vulkan", vulkan: true }))
    render(<AiKeysDialog />)
    expect(await screen.findByText(/Uses your graphics card/)).toBeTruthy()
  })

  it("shows it ready, with a way to remove it, once everything is downloaded", async () => {
    answer(
      status({
        engineInstalled: true,
        models: [{ id: "qwen2.5-3b", label: "Standard", size: 2_104_932_768, installed: true, default: true }],
      }),
    )
    render(<AiKeysDialog />)
    expect(await screen.findByText(/Ready\./)).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!)
    // It says what it will do first, and nothing is deleted until that is confirmed.
    expect(await screen.findByText(/Remove Standard\?/)).toBeTruthy()
    expect(invoke).not.toHaveBeenCalledWith("local_ai_remove", expect.anything())
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("local_ai_remove", { modelId: "qwen2.5-3b", removeEngine: false }),
    )
  })

  it("removes only the model that is chosen and keeps the other one", async () => {
    answer(
      status({
        engineInstalled: true,
        models: [
          { id: "qwen2.5-1.5b", label: "Small", size: 1_117_320_736, installed: true, default: false },
          { id: "qwen2.5-3b", label: "Standard", size: 2_104_932_768, installed: true, default: true },
        ],
      }),
    )
    render(<AiKeysDialog />)
    await screen.findByText(/Ready\./)
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!)
    expect(await screen.findByText(/The other downloaded model and the engine stay/)).toBeTruthy()
    expect(screen.queryByLabelText(/Also remove the engine/)).toBeNull()
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("local_ai_remove", { modelId: "qwen2.5-3b", removeEngine: false }),
    )
  })

  it("lets Cancel back out of a removal", async () => {
    answer(
      status({
        engineInstalled: true,
        models: [{ id: "qwen2.5-3b", label: "Standard", size: 2_104_932_768, installed: true, default: true }],
      }),
    )
    render(<AiKeysDialog />)
    await screen.findByText(/Ready\./)
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!)
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(invoke).not.toHaveBeenCalledWith("local_ai_remove", expect.anything())
  })

  it("explains an unsupported system instead of offering a download", async () => {
    answer(status({ supported: false, reason: "The built-in engine is available on Linux for now." }))
    render(<AiKeysDialog />)
    expect(await screen.findByText(/available on Linux for now/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull()
  })

  it("asks for an address for a custom endpoint and keeps it", async () => {
    answer(status())
    useAiSettings.setState({ provider: "compatible" })
    render(<AiKeysDialog />)
    const field = await screen.findByLabelText("Custom endpoint address")
    fireEvent.change(field, { target: { value: "https://gateway.example/v1" } })
    expect(useAiSettings.getState().addresses.compatible).toBe("https://gateway.example/v1")
  })

  it("says where keys are kept and saves one through the keyring command", async () => {
    answer(status())
    invoke.mockImplementation(async (command: string) => {
      if (command === "save_ai_key") {
        return "keyring"
      }
      if (command === "ai_key_status") {
        return { openai: "missing", anthropic: "missing", compatible: "missing", storage: "keyring" }
      }
      return status()
    })
    useAiSettings.setState({ provider: "openai" })
    render(<AiKeysDialog />)
    expect(await screen.findByText(/kept in this computer's keyring/)).toBeTruthy()
    expect(screen.queryByLabelText("Anthropic API key")).toBeNull()
    fireEvent.change(screen.getByLabelText("OpenAI API key"), { target: { value: "sk-test" } })
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_ai_key", { provider: "openai", key: "sk-test" }))
    expect(await screen.findByText("Key saved in the system keyring.")).toBeTruthy()
  })

  it("warns when there is no keyring and keys go to a file", async () => {
    invoke.mockImplementation(async (command: string) =>
      command === "ai_key_status"
        ? { openai: "missing", anthropic: "missing", compatible: "missing", storage: "file" }
        : status(),
    )
    render(<AiKeysDialog />)
    expect(await screen.findByText(/No system keyring was found/)).toBeTruthy()
  })
})

describe("the engine chip", () => {
  it("says what the built-in engine is doing", async () => {
    const { engineChipText } = await import("@/components/engine-chip")
    const base = status() as unknown as Parameters<typeof engineChipText>[0]
    expect(engineChipText(base, "", false)).toBe("Download needed")
    expect(engineChipText(base, "", true)).toBe("Downloading…")
    expect(engineChipText({ ...base, supported: false }, "", false)).toBe("Not available here")
    const ready = {
      ...base,
      engineInstalled: true,
      models: [{ id: "qwen2.5-3b", label: "Standard: Qwen2.5 3B", size: 1, installed: true, default: true }],
    }
    expect(engineChipText(ready, "", false)).toBe("Ready · Qwen2.5 3B")
    expect(engineChipText({ ...ready, running: true }, "", false)).toBe("Running · Qwen2.5 3B")
  })
})
