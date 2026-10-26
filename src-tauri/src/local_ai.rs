//! The built-in engine: a pinned llama.cpp `llama-server` and a small instruction-tuned model, both downloaded on
//! first use (nothing is bundled in the installer), checked against pinned SHA-256 sums, and run as a child process on
//! a random localhost port. The Vulkan build is used when the machine has a real Vulkan GPU, the CPU build otherwise.
//! Inkspire talks to it as it talks to any OpenAI-compatible endpoint (see `ai.rs`). It stops after a quiet spell
//! and when the app closes.

use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};
use tokio::io::AsyncWriteExt;

/// The llama.cpp build the app runs. Bumping it means new asset names and sums below.
pub const ENGINE_TAG: &str = "b11564";

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Backend {
    Vulkan,
    Cpu,
}

impl Backend {
    fn name(self) -> &'static str {
        match self {
            Backend::Vulkan => "vulkan",
            Backend::Cpu => "cpu",
        }
    }
}

pub struct EngineAsset {
    pub arch: &'static str,
    pub backend: Backend,
    pub file: &'static str,
    pub sha256: &'static str,
    pub size: u64,
}

/// The Linux builds of the pinned release, with the sums GitHub lists for them.
pub const ENGINE_ASSETS: [EngineAsset; 4] = [
    EngineAsset {
        arch: "x86_64",
        backend: Backend::Vulkan,
        file: "llama-b11564-bin-ubuntu-vulkan-x64.tar.gz",
        sha256: "87d8f0406f6e5f0a827f6a63ece3b75e3bbc7d54b30373125bf90bb6426f9a01",
        size: 30_273_863,
    },
    EngineAsset {
        arch: "x86_64",
        backend: Backend::Cpu,
        file: "llama-b11564-bin-ubuntu-x64.tar.gz",
        sha256: "349c1499f28d93da836ba8c60160c2e77545f6cf30b4a038a0cf040ff0a949ef",
        size: 17_711_083,
    },
    EngineAsset {
        arch: "aarch64",
        backend: Backend::Vulkan,
        file: "llama-b11564-bin-ubuntu-vulkan-arm64.tar.gz",
        sha256: "6a373668a6e54f90a6abd57350603496da5f95e8d1ce753aef6920a0a6fbda64",
        size: 24_051_282,
    },
    EngineAsset {
        arch: "aarch64",
        backend: Backend::Cpu,
        file: "llama-b11564-bin-ubuntu-arm64.tar.gz",
        sha256: "92a42da53d621c1650465b73bf4fcdcdb90e656aa9997d2590a6206b27619932",
        size: 13_828_290,
    },
];

pub struct ModelInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub file: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub size: u64,
    /// The context window the engine runs this model with, in tokens: the system prompt, the selected text and the
    /// reply share it. Qwen2.5 takes 32K; 16K keeps the cache under about a gigabyte even for the 7B model, and
    /// holds the 24,000 characters of context the app sends even in a script that takes more tokens per character.
    pub context: u32,
}

pub const MODELS: [ModelInfo; 3] = [
    ModelInfo {
        id: "qwen2.5-1.5b",
        label: "Small: Qwen2.5 1.5B Instruct",
        file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        sha256: "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e",
        size: 1_117_320_736,
        context: 16_384,
    },
    ModelInfo {
        id: "qwen2.5-3b",
        label: "Standard: Qwen2.5 3B Instruct",
        file: "qwen2.5-3b-instruct-q4_k_m.gguf",
        url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
        sha256: "626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d",
        size: 2_104_932_768,
        context: 16_384,
    },
    ModelInfo {
        id: "qwen2.5-7b",
        label: "Best quality: Qwen2.5 7B Instruct",
        file: "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        sha256: "65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423",
        size: 4_683_074_240,
        context: 16_384,
    },
];

pub const DEFAULT_MODEL: &str = "qwen2.5-3b";

/// Quiet time after which the engine is stopped to give its memory back.
const IDLE_SECONDS: u64 = 10 * 60;

pub fn model_by_id(id: Option<&str>) -> Result<&'static ModelInfo, String> {
    let id = id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL);
    MODELS
        .iter()
        .find(|model| model.id == id)
        .ok_or_else(|| "Choose one of the built-in models.".to_string())
}

pub fn engine_asset(arch: &str, backend: Backend) -> Option<&'static EngineAsset> {
    ENGINE_ASSETS
        .iter()
        .find(|asset| asset.arch == arch && asset.backend == backend)
}

fn supported_here() -> Result<&'static str, String> {
    if cfg!(target_os = "linux") && matches!(std::env::consts::ARCH, "x86_64" | "aarch64") {
        Ok(std::env::consts::ARCH)
    } else {
        Err("The built-in engine is available on Linux for now. Use Ollama, a compatible endpoint or a cloud key here."
            .to_string())
    }
}

// --- Which build to run ---------------------------------------------------------------------------------------

/// Whether there is a real Vulkan GPU to use: the loader library, a GPU render node, and at least one driver (ICD)
/// that is not a software renderer (llvmpipe), which would be slower than the CPU build.
pub fn vulkan_available_in(lib_dirs: &[PathBuf], icd_dirs: &[PathBuf], render_dir: &Path) -> bool {
    let loader = lib_dirs
        .iter()
        .any(|dir| dir.join("libvulkan.so.1").exists() || dir.join("libvulkan.so").exists());
    let has_gpu = std::fs::read_dir(render_dir)
        .map(|entries| {
            entries
                .flatten()
                .any(|entry| entry.file_name().to_string_lossy().starts_with("renderD"))
        })
        .unwrap_or(false);
    let driver = icd_dirs.iter().any(|dir| {
        std::fs::read_dir(dir)
            .map(|entries| {
                entries.flatten().any(|entry| {
                    let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                    name.ends_with(".json")
                        && !name.contains("lvp")
                        && !name.contains("llvmpipe")
                        && !name.contains("swrast")
                })
            })
            .unwrap_or(false)
    });
    loader && has_gpu && driver
}

pub fn vulkan_available() -> bool {
    let mut libs: Vec<PathBuf> = [
        "/usr/lib",
        "/usr/lib64",
        "/lib",
        "/lib64",
        "/usr/local/lib",
        "/usr/lib/x86_64-linux-gnu",
        "/usr/lib/aarch64-linux-gnu",
        "/lib/x86_64-linux-gnu",
        "/lib/aarch64-linux-gnu",
    ]
    .iter()
    .map(PathBuf::from)
    .collect();
    libs.dedup();
    let mut icds: Vec<PathBuf> = [
        "/usr/share/vulkan/icd.d",
        "/etc/vulkan/icd.d",
        "/usr/local/share/vulkan/icd.d",
    ]
    .iter()
    .map(PathBuf::from)
    .collect();
    if let Some(data) = std::env::var_os("XDG_DATA_HOME") {
        icds.push(PathBuf::from(data).join("vulkan/icd.d"));
    } else if let Some(home) = std::env::var_os("HOME") {
        icds.push(PathBuf::from(home).join(".local/share/vulkan/icd.d"));
    }
    vulkan_available_in(&libs, &icds, Path::new("/dev/dri"))
}

/// The build to use: Vulkan when the GPU is there and it has not already failed to start here, else the CPU build.
pub fn pick_backend(vulkan: bool, vulkan_failed: bool) -> Backend {
    if vulkan && !vulkan_failed {
        Backend::Vulkan
    } else {
        Backend::Cpu
    }
}

// --- Where things live -------------------------------------------------------------------------------------------

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Could not open the app's data folder.".to_string())?
        .join("local-ai");
    std::fs::create_dir_all(&dir)
        .map_err(|_| "Could not create the app's data folder.".to_string())?;
    Ok(dir)
}

fn engine_dir(root: &Path, backend: Backend) -> PathBuf {
    root.join(format!("engine-{ENGINE_TAG}-{}", backend.name()))
}

fn models_dir(root: &Path) -> PathBuf {
    root.join("models")
}

fn failed_marker(root: &Path) -> PathBuf {
    root.join("vulkan-failed")
}

/// `llama-server` somewhere under the engine folder (the archive's own folder layout is not relied on).
pub fn find_server(dir: &Path) -> Option<PathBuf> {
    fn walk(dir: &Path, depth: u32) -> Option<PathBuf> {
        for entry in std::fs::read_dir(dir).ok()?.flatten() {
            let path = entry.path();
            if path.is_file() && path.file_name().is_some_and(|name| name == "llama-server") {
                return Some(path);
            }
            if depth > 0 && path.is_dir() {
                if let Some(found) = walk(&path, depth - 1) {
                    return Some(found);
                }
            }
        }
        None
    }
    walk(dir, 3)
}

// --- Status ------------------------------------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    id: &'static str,
    label: &'static str,
    size: u64,
    installed: bool,
    default: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStatus {
    supported: bool,
    reason: String,
    backend: Backend,
    vulkan: bool,
    engine_installed: bool,
    engine_size: u64,
    engine_tag: &'static str,
    models: Vec<ModelStatus>,
    running: bool,
    installing: bool,
}

#[tauri::command]
pub async fn local_ai_status(app: tauri::AppHandle) -> Result<LocalStatus, String> {
    let root = root(&app)?;
    let supported = supported_here();
    let vulkan = supported.is_ok() && vulkan_available();
    let backend = pick_backend(vulkan, failed_marker(&root).exists());
    let arch = supported.clone().unwrap_or("x86_64");
    let asset = engine_asset(arch, backend);
    let engine_installed = supported.is_ok() && find_server(&engine_dir(&root, backend)).is_some();
    Ok(LocalStatus {
        supported: supported.is_ok(),
        reason: supported.err().unwrap_or_default(),
        backend,
        vulkan,
        engine_installed,
        engine_size: asset.map(|asset| asset.size).unwrap_or(0),
        engine_tag: ENGINE_TAG,
        models: MODELS
            .iter()
            .map(|model| ModelStatus {
                id: model.id,
                label: model.label,
                size: model.size,
                installed: file_has_size(&models_dir(&root).join(model.file), model.size),
                default: model.id == DEFAULT_MODEL,
            })
            .collect(),
        running: RUNNING.lock().await.is_some(),
        installing: INSTALLING.load(Ordering::SeqCst),
    })
}

fn file_has_size(path: &Path, size: u64) -> bool {
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.len() == size)
        .unwrap_or(false)
}

// --- Downloading -------------------------------------------------------------------------------------------------

static INSTALLING: AtomicBool = AtomicBool::new(false);
static CANCEL_INSTALL: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    /// "engine" or "model".
    stage: &'static str,
    label: String,
    received: u64,
    total: u64,
}

pub fn download_client() -> &'static reqwest::Client {
    static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            // Hosts redirect to their storage; follow a few, and only to https.
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5 && attempt.url().scheme() == "https" {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build()
            .expect("HTTP client")
    });
    &CLIENT
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut file =
        std::fs::File::open(path).map_err(|_| "Could not read the downloaded file.".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "Could not read the downloaded file.".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// Downloads `url` to `dest`, resuming a `.part` file, and keeps it only when it has the pinned size and SHA-256.
pub async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    sha256: &str,
    size: u64,
    cancel: &AtomicBool,
    on_progress: &mut (dyn FnMut(u64, u64) + Send),
) -> Result<(), String> {
    if file_has_size(dest, size) {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|_| "Could not create the download folder.".to_string())?;
    }
    let part = dest.with_extension("part");
    let mut have = std::fs::metadata(&part).map(|meta| meta.len()).unwrap_or(0);
    if have > size {
        let _ = std::fs::remove_file(&part);
        have = 0;
    }
    if cancel.load(Ordering::SeqCst) {
        return Err("Stopped.".into());
    }
    if have < size {
        let mut request = client.get(url);
        if have > 0 {
            request = request.header("range", format!("bytes={have}-"));
        }
        let response = request.send().await.map_err(|_| {
            "Could not reach the download server. Check the connection and try again.".to_string()
        })?;
        let status = response.status().as_u16();
        let resumed = status == 206;
        if !(status == 200 || resumed) {
            return Err(format!("The download server answered {status}."));
        }
        let mut options = tokio::fs::OpenOptions::new();
        options.create(true).write(true);
        if resumed {
            options.append(true);
        } else {
            options.truncate(true);
            have = 0;
        }
        let mut file = options
            .open(&part)
            .await
            .map_err(|_| "Could not write the download. Is there room on the disk?".to_string())?;
        let mut response = response;
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err("Stopped.".into());
            }
            let chunk = tokio::time::timeout(Duration::from_secs(60), response.chunk())
                .await
                .map_err(|_| "The download stalled. Try again to resume it.".to_string())?
                .map_err(|_| "The download was interrupted. Try again to resume it.".to_string())?;
            let Some(chunk) = chunk else { break };
            file.write_all(&chunk).await.map_err(|_| {
                "Could not write the download. Is there room on the disk?".to_string()
            })?;
            have += chunk.len() as u64;
            on_progress(have, size);
        }
        file.flush()
            .await
            .map_err(|_| "Could not write the download.".to_string())?;
    }
    let path = part.clone();
    let actual = tokio::task::spawn_blocking(move || sha256_file(&path))
        .await
        .map_err(|_| "Could not check the download.".to_string())??;
    let length = std::fs::metadata(&part).map(|meta| meta.len()).unwrap_or(0);
    if length != size || !actual.eq_ignore_ascii_case(sha256) {
        let _ = std::fs::remove_file(&part);
        return Err("The download did not match its checksum and was removed. Try again.".into());
    }
    std::fs::rename(&part, dest).map_err(|_| "Could not finish the download.".to_string())?;
    Ok(())
}

/// Unpacks the engine archive into `dest` (replacing what was there) and makes the server runnable.
pub fn extract_engine(archive: &Path, dest: &Path) -> Result<PathBuf, String> {
    let staging = dest.with_extension("tmp");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|_| "Could not unpack the engine.".to_string())?;
    let file = std::fs::File::open(archive)
        .map_err(|_| "Could not open the engine download.".to_string())?;
    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(file));
    tar.set_preserve_permissions(true);
    tar.unpack(&staging)
        .map_err(|_| "Could not unpack the engine.".to_string())?;
    let _ = std::fs::remove_dir_all(dest);
    std::fs::rename(&staging, dest).map_err(|_| "Could not install the engine.".to_string())?;
    let server = find_server(dest)
        .ok_or_else(|| "The engine download did not contain llama-server.".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&server, std::fs::Permissions::from_mode(0o755));
    }
    Ok(server)
}

#[tauri::command]
pub async fn local_ai_install(
    app: tauri::AppHandle,
    model_id: Option<String>,
) -> Result<(), String> {
    let arch = supported_here()?;
    let model = model_by_id(model_id.as_deref())?;
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err("A download is already running.".into());
    }
    CANCEL_INSTALL.store(false, Ordering::SeqCst);
    let result = install(&app, arch, model).await;
    INSTALLING.store(false, Ordering::SeqCst);
    result
}

async fn install(
    app: &tauri::AppHandle,
    arch: &str,
    model: &'static ModelInfo,
) -> Result<(), String> {
    let root = root(app)?;
    let backend = pick_backend(vulkan_available(), failed_marker(&root).exists());
    let asset = engine_asset(arch, backend)
        .ok_or_else(|| "No engine build for this computer.".to_string())?;
    let emit = |stage: &'static str, label: &str, received: u64, total: u64| {
        let _ = app.emit(
            "local-ai-progress",
            Progress {
                stage,
                label: label.to_string(),
                received,
                total,
            },
        );
    };

    let engine = engine_dir(&root, backend);
    if find_server(&engine).is_none() {
        let archive = root.join(asset.file);
        let url = format!(
            "https://github.com/ggml-org/llama.cpp/releases/download/{ENGINE_TAG}/{}",
            asset.file
        );
        let label = format!("Engine ({})", backend.name());
        download_file(
            download_client(),
            &url,
            &archive,
            asset.sha256,
            asset.size,
            &CANCEL_INSTALL,
            &mut |got, total| emit("engine", &label, got, total),
        )
        .await?;
        let (from, to) = (archive.clone(), engine.clone());
        tokio::task::spawn_blocking(move || extract_engine(&from, &to))
            .await
            .map_err(|_| "Could not unpack the engine.".to_string())??;
        let _ = std::fs::remove_file(&archive);
    }

    download_file(
        download_client(),
        model.url,
        &models_dir(&root).join(model.file),
        model.sha256,
        model.size,
        &CANCEL_INSTALL,
        &mut |got, total| emit("model", model.label, got, total),
    )
    .await?;
    emit("model", model.label, model.size, model.size);
    Ok(())
}

#[tauri::command]
pub fn local_ai_cancel_install() {
    CANCEL_INSTALL.store(true, Ordering::SeqCst);
}

/// Deletes one model's file (and a half-finished download of it), and with `engine` the engine builds too. Nothing
/// else in the folder is touched: the other models stay.
pub fn remove_files(root: &Path, model: &ModelInfo, engine: bool) -> Result<(), String> {
    let file = models_dir(root).join(model.file);
    for path in [file.with_extension("part"), file] {
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|_| format!("Could not delete {}.", model.label))?;
        }
    }
    if engine {
        for backend in [Backend::Vulkan, Backend::Cpu] {
            let dir = engine_dir(root, backend);
            if dir.exists() {
                std::fs::remove_dir_all(&dir)
                    .map_err(|_| "Could not delete the engine.".to_string())?;
            }
        }
    }
    Ok(())
}

/// Deletes the chosen model from the disk, giving its space back; the other models stay. With `remove_engine` the
/// engine goes too. The engine is stopped first when it is running that model (or when it is going).
#[tauri::command]
pub async fn local_ai_remove(
    app: tauri::AppHandle,
    model_id: String,
    remove_engine: Option<bool>,
) -> Result<(), String> {
    if INSTALLING.load(Ordering::SeqCst) {
        return Err("Wait for the download to stop first.".into());
    }
    let model = model_by_id(Some(&model_id))?;
    let engine = remove_engine == Some(true);
    let running_it = RUNNING
        .lock()
        .await
        .as_ref()
        .is_some_and(|current| current.model == model.id);
    if engine || running_it {
        stop().await;
    }
    remove_files(&root(&app)?, model, engine)
}

// --- Running it ----------------------------------------------------------------------------------------------------

struct Running {
    child: tokio::process::Child,
    port: u16,
    model: &'static str,
}

static RUNNING: LazyLock<tokio::sync::Mutex<Option<Running>>> =
    LazyLock::new(|| tokio::sync::Mutex::new(None));
static LAST_USED: AtomicU64 = AtomicU64::new(0);
static WATCHER: AtomicBool = AtomicBool::new(false);

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_secs())
        .unwrap_or(0)
}

/// Marks the engine as in use, so the idle timer starts from now.
pub fn touch() {
    LAST_USED.store(now_seconds(), Ordering::SeqCst);
}

fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|_| "No free port for the engine.".to_string())?;
    listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|_| "No free port for the engine.".to_string())
}

/// The arguments `llama-server` runs with: this model, on this port, on this computer only, GPU layers when Vulkan.
pub fn server_args(model: &Path, context: u32, port: u16, backend: Backend) -> Vec<String> {
    let mut args = vec![
        "-m".to_string(),
        model.display().to_string(),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "-c".into(),
        context.to_string(),
        "-np".into(),
        "1".into(),
        "--no-webui".into(),
        "--alias".into(),
        "local".into(),
    ];
    if backend == Backend::Vulkan {
        args.extend(["-ngl".to_string(), "99".to_string()]);
    }
    args
}

/// Makes sure the engine is running with the model, starting it (and waiting for it to load) when it is not, and
/// returns the base address of its OpenAI-compatible API.
pub async fn ensure_running(
    app: &tauri::AppHandle,
    model_id: Option<&str>,
) -> Result<String, String> {
    let arch = supported_here()?;
    let model = model_by_id(model_id)?;
    let root = root(app)?;
    touch();

    let mut running = RUNNING.lock().await;
    if let Some(current) = running.as_mut() {
        let alive = matches!(current.child.try_wait(), Ok(None));
        if alive && current.model == model.id {
            return Ok(format!("http://127.0.0.1:{}/v1", current.port));
        }
        let _ = current.child.start_kill();
        let _ = current.child.wait().await;
        *running = None;
    }

    let model_path = models_dir(&root).join(model.file);
    if !file_has_size(&model_path, model.size) {
        return Err("Download the built-in model first (AI Tools → Built-in engine).".into());
    }
    let backend = pick_backend(vulkan_available(), failed_marker(&root).exists());
    let _ = engine_asset(arch, backend)
        .ok_or_else(|| "No engine build for this computer.".to_string())?;
    let server = find_server(&engine_dir(&root, backend)).ok_or_else(|| {
        "Download the built-in engine first (AI Tools → Built-in engine).".to_string()
    })?;
    let port = free_port()?;
    let log = std::fs::File::create(root.join("engine.log"))
        .map_err(|_| "Could not write the engine log.".to_string())?;
    let log_copy = log
        .try_clone()
        .map_err(|_| "Could not write the engine log.".to_string())?;

    let mut command = tokio::process::Command::new(&server);
    command
        .args(server_args(&model_path, model.context, port, backend))
        .current_dir(server.parent().unwrap_or(&root))
        .stdin(std::process::Stdio::null())
        .stdout(log)
        .stderr(log_copy)
        .kill_on_drop(true);
    if let Some(dir) = server.parent() {
        let existing = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
        command.env("LD_LIBRARY_PATH", format!("{}:{existing}", dir.display()));
    }
    #[cfg(unix)]
    unsafe {
        // The engine must not outlive the app, even if the app is killed.
        command.pre_exec(|| {
            libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
            Ok(())
        });
    }
    let mut child = command
        .spawn()
        .map_err(|_| "The engine could not be started. Try downloading it again.".to_string())?;

    let health = format!("http://127.0.0.1:{port}/health");
    let started = Instant::now();
    let ready = loop {
        if let Ok(Some(_)) = child.try_wait() {
            break false;
        }
        if started.elapsed() > Duration::from_secs(240) {
            break false;
        }
        let ok = download_client()
            .get(&health)
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .map(|response| response.status().is_success())
            .unwrap_or(false);
        if ok {
            break true;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    };
    if !ready {
        let _ = child.start_kill();
        let _ = child.wait().await;
        let tail = std::fs::read_to_string(root.join("engine.log"))
            .map(|text| {
                text.lines()
                    .rev()
                    .take(3)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();
        if backend == Backend::Vulkan {
            // The GPU build would not start here: from now on use the CPU build.
            let _ = std::fs::write(failed_marker(&root), b"1");
            return Err("The GPU engine could not start, so Inkspire switched to the CPU engine. Download it and try again.".into());
        }
        return Err(format!(
            "The engine did not start. {}",
            tail.chars().take(240).collect::<String>()
        ));
    }

    *running = Some(Running {
        child,
        port,
        model: model.id,
    });
    start_watcher();
    Ok(format!("http://127.0.0.1:{port}/v1"))
}

fn start_watcher() {
    if WATCHER.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let idle =
                now_seconds().saturating_sub(LAST_USED.load(Ordering::SeqCst)) >= IDLE_SECONDS;
            if idle {
                stop().await;
            }
        }
    });
}

pub async fn stop() {
    let mut running = RUNNING.lock().await;
    if let Some(mut current) = running.take() {
        let _ = current.child.start_kill();
        let _ = current.child.wait().await;
    }
}

/// Called as the app exits.
pub fn shutdown() {
    if let Ok(mut running) = RUNNING.try_lock() {
        if let Some(current) = running.as_mut() {
            let _ = current.child.start_kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn touch_file(dir: &Path, name: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(name), b"x").unwrap();
    }

    #[test]
    fn vulkan_needs_the_loader_a_gpu_and_a_hardware_driver() {
        let tmp = tempfile::tempdir().unwrap();
        let (lib, icd, dri) = (
            tmp.path().join("lib"),
            tmp.path().join("icd"),
            tmp.path().join("dri"),
        );
        touch_file(&lib, "libvulkan.so.1");
        touch_file(&icd, "radeon_icd.x86_64.json");
        touch_file(&dri, "renderD128");
        assert!(vulkan_available_in(&[lib.clone()], &[icd.clone()], &dri));
        // Each missing piece turns it off.
        assert!(!vulkan_available_in(
            &[tmp.path().join("none")],
            &[icd.clone()],
            &dri
        ));
        assert!(!vulkan_available_in(
            &[lib.clone()],
            &[tmp.path().join("none")],
            &dri
        ));
        assert!(!vulkan_available_in(
            &[lib.clone()],
            &[icd.clone()],
            &tmp.path().join("none")
        ));
    }

    #[test]
    fn a_software_renderer_does_not_count_as_a_gpu() {
        let tmp = tempfile::tempdir().unwrap();
        let (lib, icd, dri) = (
            tmp.path().join("lib"),
            tmp.path().join("icd"),
            tmp.path().join("dri"),
        );
        touch_file(&lib, "libvulkan.so.1");
        touch_file(&icd, "lvp_icd.x86_64.json");
        touch_file(&dri, "renderD128");
        assert!(!vulkan_available_in(&[lib], &[icd], &dri));
    }

    #[test]
    fn removing_a_model_leaves_the_other_model_and_the_engine() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let (small, standard) = (&MODELS[0], &MODELS[1]);
        touch_file(&models_dir(root), small.file);
        touch_file(&models_dir(root), standard.file);
        touch_file(&engine_dir(root, Backend::Cpu), "llama-server");

        remove_files(root, standard, false).unwrap();

        assert!(!models_dir(root).join(standard.file).exists());
        assert!(models_dir(root).join(small.file).exists());
        assert!(engine_dir(root, Backend::Cpu).join("llama-server").exists());
    }

    #[test]
    fn removing_a_model_also_clears_its_half_finished_download() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let model = &MODELS[1];
        let part = models_dir(root).join(model.file).with_extension("part");
        touch_file(
            &models_dir(root),
            part.file_name().unwrap().to_str().unwrap(),
        );
        remove_files(root, model, false).unwrap();
        assert!(!part.exists());
    }

    #[test]
    fn the_engine_goes_only_when_asked() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        touch_file(&models_dir(root), MODELS[0].file);
        touch_file(&engine_dir(root, Backend::Cpu), "llama-server");
        touch_file(&engine_dir(root, Backend::Vulkan), "llama-server");

        remove_files(root, &MODELS[0], true).unwrap();

        assert!(!engine_dir(root, Backend::Cpu).exists());
        assert!(!engine_dir(root, Backend::Vulkan).exists());
    }

    #[test]
    fn the_cpu_build_is_used_without_a_gpu_or_after_the_gpu_build_failed() {
        assert_eq!(pick_backend(true, false), Backend::Vulkan);
        assert_eq!(pick_backend(false, false), Backend::Cpu);
        assert_eq!(pick_backend(true, true), Backend::Cpu);
    }

    #[test]
    fn every_supported_machine_has_both_builds_and_models_are_known() {
        for arch in ["x86_64", "aarch64"] {
            for backend in [Backend::Vulkan, Backend::Cpu] {
                let asset = engine_asset(arch, backend).unwrap();
                assert!(asset.file.contains(ENGINE_TAG));
                assert_eq!(asset.sha256.len(), 64);
            }
        }
        assert_eq!(model_by_id(None).unwrap().id, DEFAULT_MODEL);
        assert_eq!(model_by_id(Some(" ")).unwrap().id, DEFAULT_MODEL);
        assert_eq!(
            model_by_id(Some("qwen2.5-1.5b")).unwrap().size,
            1_117_320_736
        );
        assert_eq!(model_by_id(Some("qwen2.5-7b")).unwrap().size, 4_683_074_240);
        assert!(model_by_id(Some("../../etc/passwd")).is_err());
        for model in MODELS {
            assert!(model.context >= 16_384);
            assert_eq!(model.sha256.len(), 64);
            assert!(model.url.starts_with("https://"));
        }
    }

    #[test]
    fn the_server_listens_on_this_computer_only() {
        let args = server_args(Path::new("/m/model.gguf"), 16_384, 5555, Backend::Cpu);
        let at = args.iter().position(|arg| arg == "--host").unwrap();
        assert_eq!(args[at + 1], "127.0.0.1");
        let at = args.iter().position(|arg| arg == "-c").unwrap();
        assert_eq!(args[at + 1], "16384");
        assert!(args.contains(&"5555".to_string()));
        assert!(!args.contains(&"-ngl".to_string()));
        assert!(
            server_args(Path::new("/m/model.gguf"), 16_384, 5555, Backend::Vulkan)
                .contains(&"-ngl".to_string())
        );
    }

    /// A one-file HTTP server on a random port that honours `Range`, for the download tests.
    fn serve(body: Vec<u8>, honour_range: bool) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let mut request = [0u8; 2048];
                let read = stream.read(&mut request).unwrap_or(0);
                let text = String::from_utf8_lossy(&request[..read]).to_string();
                let start = text
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("range: bytes=")
                            .map(str::to_string)
                    })
                    .and_then(|range| range.trim_end_matches('-').parse::<usize>().ok())
                    .filter(|_| honour_range);
                let (status, slice) = match start {
                    Some(from) => ("206 Partial Content", &body[from.min(body.len())..]),
                    None => ("200 OK", &body[..]),
                };
                let head = format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    slice.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(slice);
            }
        });
        format!("http://127.0.0.1:{port}/file")
    }

    fn sha_of(bytes: &[u8]) -> String {
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    #[tokio::test]
    async fn a_download_is_kept_only_when_its_checksum_matches() {
        let body: Vec<u8> = (0..5000u32).map(|n| (n % 251) as u8).collect();
        let url = serve(body.clone(), true);
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("m.gguf");
        let cancel = AtomicBool::new(false);
        let mut last = (0, 0);
        download_file(
            &reqwest::Client::new(),
            &url,
            &dest,
            &sha_of(&body),
            body.len() as u64,
            &cancel,
            &mut |got, total| last = (got, total),
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), body);
        assert_eq!(last, (5000, 5000));
        assert!(!dest.with_extension("part").exists());
    }

    #[tokio::test]
    async fn a_wrong_checksum_removes_the_download() {
        let body = vec![7u8; 1000];
        let url = serve(body.clone(), true);
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("m.gguf");
        let cancel = AtomicBool::new(false);
        let error = download_file(
            &reqwest::Client::new(),
            &url,
            &dest,
            &"0".repeat(64),
            1000,
            &cancel,
            &mut |_, _| {},
        )
        .await
        .unwrap_err();
        assert!(error.contains("checksum"));
        assert!(!dest.exists());
        assert!(!dest.with_extension("part").exists());
    }

    #[tokio::test]
    async fn an_interrupted_download_resumes_from_the_part_file() {
        let body: Vec<u8> = (0..4000u32).map(|n| (n % 199) as u8).collect();
        let url = serve(body.clone(), true);
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("m.gguf");
        std::fs::write(dest.with_extension("part"), &body[..1500]).unwrap();
        let cancel = AtomicBool::new(false);
        let mut first = u64::MAX;
        download_file(
            &reqwest::Client::new(),
            &url,
            &dest,
            &sha_of(&body),
            4000,
            &cancel,
            &mut |got, _| first = first.min(got),
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), body);
        // Progress started after the 1500 bytes already there.
        assert!(first > 1500);
    }

    #[tokio::test]
    async fn a_server_that_ignores_range_restarts_the_file() {
        let body: Vec<u8> = (0..3000u32).map(|n| (n % 97) as u8).collect();
        let url = serve(body.clone(), false);
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("m.gguf");
        std::fs::write(dest.with_extension("part"), &body[..1000]).unwrap();
        let cancel = AtomicBool::new(false);
        download_file(
            &reqwest::Client::new(),
            &url,
            &dest,
            &sha_of(&body),
            3000,
            &cancel,
            &mut |_, _| {},
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), body);
    }

    #[tokio::test]
    async fn cancelling_stops_the_download_and_keeps_the_part() {
        let body = vec![1u8; 4000];
        let url = serve(body.clone(), true);
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("m.gguf");
        let cancel = AtomicBool::new(true);
        let error = download_file(
            &reqwest::Client::new(),
            &url,
            &dest,
            &sha_of(&body),
            4000,
            &cancel,
            &mut |_, _| {},
        )
        .await
        .unwrap_err();
        assert_eq!(error, "Stopped.");
        assert!(!dest.exists());
    }

    #[test]
    fn the_engine_archive_unpacks_and_the_server_is_found_and_runnable() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("engine.tar.gz");
        {
            let file = std::fs::File::create(&archive).unwrap();
            let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
                file,
                flate2::Compression::fast(),
            ));
            for (name, data) in [
                ("llama-b1/llama-server", b"#!/bin/sh\n".as_slice()),
                ("llama-b1/libggml.so", b"lib".as_slice()),
            ] {
                let mut header = tar::Header::new_gnu();
                header.set_size(data.len() as u64);
                header.set_mode(0o644);
                header.set_cksum();
                builder.append_data(&mut header, name, data).unwrap();
            }
            builder.into_inner().unwrap().finish().unwrap();
        }
        let dest = dir.path().join("engine-b1-cpu");
        let server = extract_engine(&archive, &dest).unwrap();
        assert!(server.ends_with("llama-server"));
        assert!(server.parent().unwrap().join("libggml.so").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&server).unwrap().permissions().mode() & 0o111,
                0o111
            );
        }
    }

    #[test]
    fn an_archive_without_the_server_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("bad.tar.gz");
        {
            let file = std::fs::File::create(&archive).unwrap();
            let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
                file,
                flate2::Compression::fast(),
            ));
            let mut header = tar::Header::new_gnu();
            header.set_size(1);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(&mut header, "readme.txt", b"x".as_slice())
                .unwrap();
            builder.into_inner().unwrap().finish().unwrap();
        }
        assert!(extract_engine(&archive, &dir.path().join("out")).is_err());
    }
}
