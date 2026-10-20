import { testAiConnection } from "@/ai/generate"
import {
  keySourceLabel,
  loadAiKeyStatus,
  saveAiKey,
  type AiKeyStatus,
  type KeyProvider,
  type KeySource,
} from "@/ai/keys"
import {
  NO_LOCAL_STATUS,
  cancelLocalInstall,
  defaultLocalModel,
  formatBytes,
  installLocalEngine,
  loadLocalStatus,
  localReady,
  removeLocalModel,
  useLocalDownload,
  type LocalStatus,
} from "@/ai/local"
import {
  AI_PROVIDERS,
  DEFAULT_ADDRESSES,
  defaultModel,
  useAiSettings,
  type AddressedProvider,
  type AiProviderName,
} from "@/ai/settings"
import { DialogFrame } from "@/components/word-dialog"
import { errorMessage, reportError } from "@/document/commands"
import { isTauriRuntime } from "@/lib/platform"
import { useEffect, useState } from "react"

const EMPTY_STATUS: AiKeyStatus = {
  openai: "missing",
  anthropic: "missing",
  compatible: "missing",
  storage: "keyring",
}

export const PROVIDER_LABEL: Record<AiProviderName, string> = {
  builtin: "Built-in engine",
  ollama: "Local Ollama",
  lmstudio: "LM Studio",
  compatible: "Custom endpoint",
  openai: "OpenAI",
  anthropic: "Anthropic",
}

const ADDRESSED: AddressedProvider[] = ["ollama", "lmstudio", "compatible"]

const KEYED: AiProviderName[] = ["openai", "anthropic", "compatible"]

export function AiKeysDialog() {
  const open = useAiSettings((state) => state.keysOpen)
  const setOpen = useAiSettings((state) => state.setKeysOpen)
  const provider = useAiSettings((state) => state.provider)
  const setProvider = useAiSettings((state) => state.setProvider)
  const models = useAiSettings((state) => state.models)
  const addresses = useAiSettings((state) => state.addresses)
  const setModelFor = useAiSettings((state) => state.setModelFor)
  const setAddress = useAiSettings((state) => state.setAddress)
  const [status, setStatus] = useState<AiKeyStatus>(EMPTY_STATUS)
  const [typed, setTyped] = useState<Record<KeyProvider, string>>({ openai: "", anthropic: "", compatible: "" })
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setTyped({ openai: "", anthropic: "", compatible: "" })
    setError("")
    setMessage("")
    let cancelled = false
    void loadAiKeyStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(errorMessage(caught))
        }
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) {
    return null
  }

  async function store(providerName: KeyProvider, key: string) {
    setError("")
    setMessage("")
    if (!isTauriRuntime()) {
      setMessage("Open the desktop app to store a key. It stays in the Rust process.")
      return
    }
    try {
      const where = await saveAiKey(providerName, key)
      setTyped((current) => ({ ...current, [providerName]: "" }))
      setStatus(await loadAiKeyStatus())
      setMessage(
        !key.trim()
          ? "Saved key removed."
          : where === "keyring"
            ? "Key saved in the system keyring."
            : "Key saved in a file only you can read (no system keyring was found).",
      )
    } catch (caught) {
      setError(errorMessage(caught))
      await reportError(caught)
    }
  }

  async function onTest() {
    setError("")
    setMessage("")
    if (!isTauriRuntime()) {
      setMessage("Open the desktop app to test the connection.")
      return
    }
    setTesting(true)
    try {
      setMessage(await testAiConnection())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setTesting(false)
    }
  }

  return (
    <DialogFrame title="AI Settings" width={500} onClose={() => setOpen(false)} onSubmit={() => undefined}>
      <label className="flex items-center gap-2 text-xs text-neutral-600">
        <span className="w-20 shrink-0 font-medium text-neutral-700">Provider</span>
        <select
          aria-label="AI provider"
          value={provider}
          className="h-8 min-w-0 flex-1 rounded-md border border-black/10 px-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
          onChange={(event) => setProvider(event.target.value as AiProviderName)}
        >
          {AI_PROVIDERS.map((name) => (
            <option key={name} value={name}>
              {PROVIDER_LABEL[name]}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-[11px] text-neutral-500">
        {provider === "builtin"
          ? "Runs on this computer; nothing you write leaves it."
          : provider === "ollama" || provider === "lmstudio"
            ? "Runs on this computer or your local network."
            : "Your text is sent to this provider."}
      </p>

      {provider === "builtin" ? <EnginePanel /> : null}

      {ADDRESSED.includes(provider as AddressedProvider) ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600">
          <span className="w-20 shrink-0">Address</span>
          <input
            value={addresses[provider as AddressedProvider]}
            placeholder={DEFAULT_ADDRESSES[provider as AddressedProvider] || "https://example.com/v1"}
            aria-label={`${PROVIDER_LABEL[provider]} address`}
            className="h-8 min-w-0 flex-1 rounded-md border border-black/10 px-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
            onChange={(event) => setAddress(provider as AddressedProvider, event.target.value)}
          />
        </label>
      ) : null}

      {provider !== "builtin" ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600">
          <span className="w-20 shrink-0">Model</span>
          <input
            value={models[provider]}
            placeholder={defaultModel(provider)}
            aria-label={`${PROVIDER_LABEL[provider]} model`}
            className="h-8 min-w-0 flex-1 rounded-md border border-black/10 px-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
            onChange={(event) => setModelFor(provider, event.target.value)}
          />
        </label>
      ) : null}

      {provider === "openai" ? (
        <KeyField
          label="OpenAI"
          source={status.openai}
          value={typed.openai}
          onChange={(value) => setTyped((current) => ({ ...current, openai: value }))}
          onSave={() => void store("openai", typed.openai)}
          onRemove={() => void store("openai", "")}
        />
      ) : null}
      {provider === "anthropic" ? (
        <KeyField
          label="Anthropic"
          source={status.anthropic}
          value={typed.anthropic}
          onChange={(value) => setTyped((current) => ({ ...current, anthropic: value }))}
          onSave={() => void store("anthropic", typed.anthropic)}
          onRemove={() => void store("anthropic", "")}
        />
      ) : null}
      {provider === "compatible" ? (
        <KeyField
          label="Custom endpoint (optional)"
          source={status.compatible}
          value={typed.compatible}
          onChange={(value) => setTyped((current) => ({ ...current, compatible: value }))}
          onSave={() => void store("compatible", typed.compatible)}
          onRemove={() => void store("compatible", "")}
        />
      ) : null}

      {provider !== "builtin" ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-neutral-500">Test uses {PROVIDER_LABEL[provider]}.</p>
          <button type="button" className="dialog-btn" disabled={testing} onClick={() => void onTest()}>
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>
      ) : null}

      <p className={`mt-2 text-[11px] text-neutral-500${KEYED.includes(provider) ? "" : " hidden"}`}>
        {status.storage === "keyring"
          ? "Keys are kept in this computer's keyring, never in a document or a settings file."
          : "No system keyring was found, so keys are kept in a file only you can read."}
      </p>

      {message ? <p className="mt-3 text-xs text-neutral-600">{message}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      <div className="word-dialog-actions">
        <span className="flex-1" />
        <button type="button" className="dialog-btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </DialogFrame>
  )
}

/** The engine Inkspire runs itself: what it will use, what is downloaded, and the download. */
function EnginePanel() {
  const model = useAiSettings((state) => state.models.builtin)
  const setModelFor = useAiSettings((state) => state.setModelFor)
  const installing = useLocalDownload((state) => state.installing)
  const progress = useLocalDownload((state) => state.progress)
  const downloadError = useLocalDownload((state) => state.error)
  const [status, setStatus] = useState<LocalStatus>(NO_LOCAL_STATUS)
  const [removing, setRemoving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [alsoEngine, setAlsoEngine] = useState(false)

  useEffect(() => {
    if (installing) {
      return
    }
    let cancelled = false
    void loadLocalStatus().then((next) => {
      if (!cancelled) {
        setStatus(next)
      }
    })
    return () => {
      cancelled = true
    }
  }, [installing, removing])

  if (!status.supported) {
    return <p className="mt-3 text-xs text-neutral-600">{status.reason}</p>
  }
  const chosen = model || defaultLocalModel(status)
  const picked = status.models.find((item) => item.id === chosen)
  const ready = localReady(status, model)
  const othersInstalled = status.models.some((item) => item.id !== chosen && item.installed)
  const needed = (status.engineInstalled ? 0 : status.engineSize) + (picked?.installed ? 0 : (picked?.size ?? 0))
  const percent =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : 0

  return (
    <div className="mt-3 space-y-2 rounded-md border border-black/10 p-2 text-xs text-neutral-600">
      <p className="font-medium text-neutral-700">Built-in engine</p>
      <p>
        {status.backend === "vulkan"
          ? "Uses your graphics card (Vulkan)."
          : "Uses your processor. No Vulkan graphics card was found, so it will be slower."}
      </p>
      <label className="flex items-center gap-2">
        <span className="w-20 shrink-0">Model</span>
        <select
          aria-label="Built-in model"
          value={chosen}
          disabled={installing}
          className="h-8 min-w-0 flex-1 rounded-md border border-black/10 px-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
          onChange={(event) => {
            setModelFor("builtin", event.target.value)
            setConfirming(false)
          }}
        >
          {status.models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} ({formatBytes(item.size)}){item.installed ? ", downloaded" : ""}
            </option>
          ))}
        </select>
      </label>
      {installing ? (
        <div className="space-y-1">
          <progress className="w-full" max={100} value={percent} aria-label="Download progress" />
          <div className="flex items-center justify-between gap-2">
            <span>
              {progress
                ? `${progress.label}: ${formatBytes(progress.received)} of ${formatBytes(progress.total)}`
                : "Starting…"}
            </span>
            <button type="button" className="dialog-btn" onClick={() => void cancelLocalInstall()}>
              Stop
            </button>
          </div>
        </div>
      ) : confirming && picked ? (
        <div role="alertdialog" aria-label={`Remove ${picked.label}`} className="space-y-1.5">
          <p className="font-medium text-neutral-700">Remove {picked.label}?</p>
          <p>
            This deletes its {formatBytes(picked.size)} file from this computer. You can download it again later.
            {othersInstalled
              ? " The other downloaded model and the engine stay."
              : " The engine stays, unless you remove it too."}
          </p>
          {othersInstalled || !status.engineInstalled ? null : (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={alsoEngine} onChange={(event) => setAlsoEngine(event.target.checked)} />
              Also remove the engine ({formatBytes(status.engineSize)})
            </label>
          )}
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className="dialog-btn"
              onClick={() => {
                setConfirming(false)
                setAlsoEngine(false)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="dialog-btn is-primary"
              disabled={removing}
              onClick={() => {
                setRemoving(true)
                void removeLocalModel(picked.id, alsoEngine && !othersInstalled).finally(() => {
                  setRemoving(false)
                  setConfirming(false)
                  setAlsoEngine(false)
                })
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {ready ? (
            <div className="flex items-center justify-between gap-2">
              <span>Ready. It starts when you use it and stops after ten quiet minutes.</span>
              <button type="button" className="dialog-btn" onClick={() => setConfirming(true)}>
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <button type="button" className="dialog-btn" onClick={() => void installLocalEngine(chosen)}>
                  Download {formatBytes(needed)}
                </button>
                {picked?.installed ? (
                  <button type="button" className="dialog-btn" onClick={() => setConfirming(true)}>
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] text-neutral-500">
                Downloads the llama.cpp engine from GitHub and the model from Hugging Face, once, and checks both. A
                stopped download picks up where it left off.
              </p>
            </div>
          )}
        </div>
      )}
      {downloadError ? (
        <p role="alert" className="text-red-700">
          {downloadError}
        </p>
      ) : null}
    </div>
  )
}

function KeyField({
  label,
  source,
  value,
  onChange,
  onSave,
  onRemove,
}: {
  label: string
  source: KeySource
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onRemove: () => void
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-neutral-700" htmlFor={`ai-key-${label}`}>
          {label}
        </label>
        <span className="text-xs text-neutral-500">{keySourceLabel(source)}</span>
      </div>
      <div className="flex gap-2">
        <input
          id={`ai-key-${label}`}
          type="password"
          autoComplete="off"
          value={value}
          placeholder="Paste a new key"
          aria-label={`${label} API key`}
          className="h-8 min-w-0 flex-1 rounded-md border border-black/10 px-2 text-sm outline-none focus:border-neutral-400"
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="dialog-btn" disabled={!value.trim()} onClick={onSave}>
          Save
        </button>
        <button type="button" className="dialog-btn" disabled={source !== "saved"} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  )
}
