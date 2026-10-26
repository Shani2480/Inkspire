use crate::secrets::Vault;
use crate::{local_ai, secrets};
use std::collections::HashSet;
use std::pin::pin;
use std::sync::{LazyLock, Mutex, OnceLock};
use std::task::Poll;
use std::time::Duration;

use futures_util::StreamExt;
use futures_util::future::{Either, select};
use serde::Deserialize;
use serde::Serialize;
use tauri::Emitter;

const SYSTEM_PROMPT: &str = "\
You are Inkspire's document writer. Return only HTML that Tiptap can insert. \
Use only these elements: h1, h2, p, ul, li, table, thead, tbody, tr, th, td, strong, and em. \
Do not return markdown, code fences, explanations, or a full HTML document. \
Write placeholders in square brackets, for example [Company Name].";

const OPENAI_URL: &str = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL: &str = "https://api.openai.com/v1/models";
const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_OPENAI_MODEL: &str = "gpt-5-mini";
const DEFAULT_ANTHROPIC_MODEL: &str = "claude-sonnet-5-5";
const DEFAULT_OLLAMA_MODEL: &str = "llama3.2";
const DEFAULT_COMPATIBLE_MODEL: &str = "default";
const MAX_PROMPT_CHARS: usize = 8_000;
const MAX_CONTEXT_CHARS: usize = 24_000;
const MAX_OUTPUT_CHARS: usize = 80_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    provider: AiProvider,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    base_url: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    #[serde(alias = "openAi")]
    Openai,
    Anthropic,
    Ollama,
    /// Any OpenAI-compatible endpoint (LM Studio, llama.cpp, vLLM, OpenRouter, a company gateway…): `base_url`, and a key when it wants one.
    Compatible,
    /// The engine Inkspire runs itself (see `local_ai`).
    Builtin,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiTextChunk {
    request_id: String,
    text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiTextDone {
    request_id: String,
    html: String,
}

static CANCELLED: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

fn is_cancelled(request_id: &str) -> bool {
    CANCELLED
        .lock()
        .map(|set| set.contains(request_id))
        .unwrap_or(false)
}

fn clear_cancelled(request_id: &str) {
    if let Ok(mut set) = CANCELLED.lock() {
        set.remove(request_id);
    }
}

#[tauri::command]
pub fn cancel_ai_text(request_id: String) {
    let request_id = request_id.trim();
    if request_id.is_empty() || request_id.len() > 80 {
        return;
    }
    if let Ok(mut set) = CANCELLED.lock() {
        if set.len() > 64 {
            set.clear();
        }
        set.insert(request_id.to_string());
    }
}

async fn wait_cancel(request_id: String) {
    std::future::poll_fn(move |cx| {
        if is_cancelled(&request_id) {
            return Poll::Ready(());
        }
        let waker = cx.waker().clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            waker.wake();
        });
        Poll::Pending
    })
    .await;
}

#[tauri::command]
pub async fn generate_ai_text(
    app: tauri::AppHandle,
    prompt: String,
    context: String,
    provider_config: ProviderConfig,
    request_id: Option<String>,
    system_prompt: Option<String>,
    plain: Option<bool>,
) -> Result<String, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("Enter a prompt.".into());
    }
    if prompt.chars().count() > MAX_PROMPT_CHARS {
        return Err("The prompt is too long.".into());
    }
    let context = clip_chars(context.trim(), MAX_CONTEXT_CHARS);
    let request_id = request_id
        .filter(|id| !id.trim().is_empty() && id.len() <= 80)
        .unwrap_or_else(fallback_request_id);
    let system_prompt = match system_prompt {
        Some(value) => {
            let value = value.trim();
            if value.is_empty() {
                SYSTEM_PROMPT.to_string()
            } else if value.chars().count() > 4_000 {
                return Err("The prompt is too long.".into());
            } else {
                value.to_string()
            }
        }
        None => SYSTEM_PROMPT.to_string(),
    };
    let plain = plain.unwrap_or(false);

    if is_cancelled(&request_id) {
        clear_cancelled(&request_id);
        return Err("Stopped.".into());
    }

    let mut collected = String::new();
    let mut parser = StreamParser::new(provider_config.provider);
    let response = {
        let pending = pin!(send_request(
            &app,
            &provider_config,
            prompt,
            &context,
            &system_prompt,
        ));
        let cancel = pin!(wait_cancel(request_id.clone()));
        match select(pending, cancel).await {
            Either::Left((result, _)) => result?,
            Either::Right((_, _)) => {
                clear_cancelled(&request_id);
                return Err("Stopped.".into());
            }
        }
    };
    let mut stream = response.bytes_stream();

    loop {
        if is_cancelled(&request_id) {
            clear_cancelled(&request_id);
            return Err("Stopped.".into());
        }
        let next = pin!(stream.next());
        let cancel = pin!(wait_cancel(request_id.clone()));
        let item = match select(next, cancel).await {
            Either::Left((item, _)) => item,
            Either::Right((_, _)) => {
                clear_cancelled(&request_id);
                return Err("Stopped.".into());
            }
        };
        let Some(item) = item else {
            break;
        };
        let bytes = item.map_err(http_failure)?;
        for delta in parser.push(&bytes)? {
            if is_cancelled(&request_id) {
                clear_cancelled(&request_id);
                return Err("Stopped.".into());
            }
            if collected.chars().count() + delta.chars().count() > MAX_OUTPUT_CHARS {
                clear_cancelled(&request_id);
                return Err("The response was longer than Inkspire can insert.".into());
            }
            collected.push_str(&delta);
            app.emit(
                "ai-text-chunk",
                AiTextChunk {
                    request_id: request_id.clone(),
                    text: delta,
                },
            )
            .map_err(|err| format!("Could not stream the response: {err}"))?;
        }
    }

    if let Some(tail) = parser.finish()? {
        if collected.chars().count() + tail.chars().count() > MAX_OUTPUT_CHARS {
            clear_cancelled(&request_id);
            return Err("The response was longer than Inkspire can insert.".into());
        }
        collected.push_str(&tail);
        app.emit(
            "ai-text-chunk",
            AiTextChunk {
                request_id: request_id.clone(),
                text: tail,
            },
        )
        .map_err(|err| format!("Could not stream the response: {err}"))?;
    }

    let html = if plain {
        strip_fences(collected.trim()).trim().to_string()
    } else {
        finalize_html(&collected)
    };
    if html.is_empty() {
        clear_cancelled(&request_id);
        return Err("The model returned no text.".into());
    }

    clear_cancelled(&request_id);
    app.emit(
        "ai-text-done",
        AiTextDone {
            request_id,
            html: html.clone(),
        },
    )
    .map_err(|err| format!("Could not stream the response: {err}"))?;
    Ok(html)
}

async fn send_request(
    app: &tauri::AppHandle,
    config: &ProviderConfig,
    prompt: &str,
    context: &str,
    system: &str,
) -> Result<reqwest::Response, String> {
    let message = user_message(prompt, context);
    let builder = match config.provider {
        AiProvider::Openai => {
            let model = clean_model(config.model.as_deref(), DEFAULT_OPENAI_MODEL)?;
            let key = api_key(app, "openai", "OPENAI_API_KEY", "OpenAI")?;
            http()
                .post(OPENAI_URL)
                .bearer_auth(key)
                .header("accept", "text/event-stream")
                .json(&serde_json::json!({
                    "model": model,
                    "stream": true,
                    "messages": [
                        { "role": "system", "content": system },
                        { "role": "user", "content": message }
                    ]
                }))
        }
        AiProvider::Anthropic => {
            let model = clean_model(config.model.as_deref(), DEFAULT_ANTHROPIC_MODEL)?;
            let key = api_key(app, "anthropic", "ANTHROPIC_API_KEY", "Anthropic")?;
            http()
                .post(ANTHROPIC_URL)
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .header("accept", "text/event-stream")
                .json(&serde_json::json!({
                    "model": model,
                    "max_tokens": 4096,
                    "stream": true,
                    "system": system,
                    "messages": [{ "role": "user", "content": message }]
                }))
        }
        AiProvider::Ollama => {
            let model = clean_model(config.model.as_deref(), DEFAULT_OLLAMA_MODEL)?;
            let url = ollama_chat_url(config.base_url.as_deref())?;
            http().post(url).json(&serde_json::json!({
                "model": model,
                "stream": true,
                "options": { "num_predict": MAX_REPLY_TOKENS },
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": message }
                ]
            }))
        }
        AiProvider::Compatible => {
            let model = clean_model(config.model.as_deref(), DEFAULT_COMPATIBLE_MODEL)?;
            let url = compatible_chat_url(config.base_url.as_deref())?;
            let mut builder = http().post(url).header("accept", "text/event-stream");
            let (key, _) = secrets::load(app, "compatible")?;
            if !key.is_empty() {
                builder = builder.bearer_auth(key);
            }
            builder.json(&chat_body(&model, system, &message))
        }
        AiProvider::Builtin => {
            let base = local_ai::ensure_running(app, config.model.as_deref()).await?;
            local_ai::touch();
            http()
                .post(format!("{base}/chat/completions"))
                .header("accept", "text/event-stream")
                .json(&chat_body("local", system, &message))
        }
    };

    let response = builder.send().await.map_err(http_failure)?;
    if response.status().is_success() {
        return Ok(response);
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(provider_message(status, &body, config.provider))
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("HTTP client")
    })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiKeyStatus {
    openai: String,
    anthropic: String,
    compatible: String,
    /// Where saved keys are kept: "keyring" (the system's), or "file" when there is no keyring to use.
    storage: String,
}

#[tauri::command]
pub fn ai_key_status(app: tauri::AppHandle) -> Result<AiKeyStatus, String> {
    let source = |field: &str, env_name: &str| -> String {
        let (saved, _) = secrets::load(&app, field).unwrap_or_default();
        key_source(&saved, env_name).to_string()
    };
    Ok(AiKeyStatus {
        openai: source("openai", "OPENAI_API_KEY"),
        anthropic: source("anthropic", "ANTHROPIC_API_KEY"),
        compatible: source("compatible", ""),
        storage: if secrets::Keyring.read("probe").is_ok() {
            "keyring"
        } else {
            "file"
        }
        .to_string(),
    })
}

#[tauri::command]
pub async fn test_ai_connection(
    app: tauri::AppHandle,
    provider_config: ProviderConfig,
) -> Result<String, String> {
    match provider_config.provider {
        AiProvider::Openai => {
            let model = clean_model(provider_config.model.as_deref(), DEFAULT_OPENAI_MODEL)?;
            let key = api_key(&app, "openai", "OPENAI_API_KEY", "OpenAI")?;
            let response = http()
                .get(OPENAI_MODELS_URL)
                .bearer_auth(key)
                .send()
                .await
                .map_err(http_failure)?;
            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(provider_message(status, &body, AiProvider::Openai));
            }
            Ok(format!("Connected to OpenAI. Model ready: {model}."))
        }
        AiProvider::Anthropic => {
            let model = clean_model(provider_config.model.as_deref(), DEFAULT_ANTHROPIC_MODEL)?;
            let key = api_key(&app, "anthropic", "ANTHROPIC_API_KEY", "Anthropic")?;
            let response = http()
                .post(ANTHROPIC_URL)
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .json(&serde_json::json!({
                    "model": model,
                    "max_tokens": 16,
                    "messages": [{ "role": "user", "content": "Reply with the single word ok." }]
                }))
                .send()
                .await
                .map_err(http_failure)?;
            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(provider_message(status, &body, AiProvider::Anthropic));
            }
            Ok(format!("Connected to Anthropic. Model ready: {model}."))
        }
        AiProvider::Ollama => {
            let model = clean_model(provider_config.model.as_deref(), DEFAULT_OLLAMA_MODEL)?;
            let tags_url = ollama_tags_url(provider_config.base_url.as_deref())?;
            let response = http().get(tags_url).send().await.map_err(http_failure)?;
            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(provider_message(status, &body, AiProvider::Ollama));
            }
            let body = response.text().await.map_err(http_failure)?;
            if !ollama_has_model(&body, &model) {
                return Err(format!(
                    "Connected to Ollama, but {model} is not installed. Pull it locally, then try again."
                ));
            }
            Ok(format!("Connected to Ollama. Model ready: {model}."))
        }
        AiProvider::Compatible => {
            let url = compatible_models_url(provider_config.base_url.as_deref())?;
            let mut request = http().get(url);
            let (key, _) = secrets::load(&app, "compatible")?;
            if !key.is_empty() {
                request = request.bearer_auth(key);
            }
            let response = request.send().await.map_err(http_failure)?;
            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(provider_message(status, &body, AiProvider::Compatible));
            }
            Ok("Connected to the endpoint.".to_string())
        }
        AiProvider::Builtin => {
            local_ai::ensure_running(&app, provider_config.model.as_deref()).await?;
            Ok("The built-in engine is running.".to_string())
        }
    }
}

#[tauri::command]
pub fn save_ai_key(
    app: tauri::AppHandle,
    provider: String,
    key: String,
) -> Result<secrets::Storage, String> {
    let field = match provider.trim() {
        "openai" => "openai",
        "anthropic" => "anthropic",
        "compatible" => "compatible",
        _ => return Err("Choose a provider that takes a key.".into()),
    };
    let key = key.trim();
    if key.chars().count() > 400 || key.chars().any(|ch| ch.is_control()) {
        return Err("That key cannot be saved.".into());
    }
    secrets::save(&app, field, key)
}

fn api_key(
    app: &tauri::AppHandle,
    field: &str,
    env_name: &str,
    provider: &str,
) -> Result<String, String> {
    let (saved, _) = secrets::load(app, field)?;
    if !saved.is_empty() {
        return Ok(saved);
    }

    let key = std::env::var(env_name).unwrap_or_default();
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err(format!(
            "Add a {provider} key in AI Tools. The key stays in the Rust process."
        ));
    }
    Ok(key)
}

fn key_source(saved: &str, env_name: &str) -> &'static str {
    if !saved.trim().is_empty() {
        "saved"
    } else if !env_name.is_empty()
        && std::env::var(env_name)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    {
        "environment"
    } else {
        "missing"
    }
}

/// The most a local or compatible model may write in one reply. A small model can fall into a loop (seen with the
/// built-in engine on an integrated GPU: "????" until the context was full); this stops it after a long page.
const MAX_REPLY_TOKENS: u32 = 4096;

fn chat_body(model: &str, system: &str, message: &str) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "stream": true,
        "max_tokens": MAX_REPLY_TOKENS,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": message }
        ]
    })
}

/// An OpenAI-compatible endpoint's base: https anywhere, or http on this computer or the local network.
fn compatible_base(base_url: Option<&str>) -> Result<String, String> {
    let raw = base_url.unwrap_or("").trim().trim_end_matches('/');
    if raw.is_empty() {
        return Err("Enter the endpoint's address (for example http://127.0.0.1:1234/v1).".into());
    }
    let raw = raw.strip_suffix("/chat/completions").unwrap_or(raw);
    let url = reqwest::Url::parse(raw)
        .map_err(|_| "The endpoint address is not a valid URL.".to_string())?;
    let host = url.host_str().unwrap_or("").to_string();
    match url.scheme() {
        "https" => {}
        "http" if is_local_host(&host) => {}
        "http" => return Err("A remote endpoint has to use https.".into()),
        _ => return Err("The endpoint has to use http or https.".into()),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Leave the key out of the address; enter it in the key field.".into());
    }
    Ok(raw.to_string())
}

fn is_local_host(host: &str) -> bool {
    if matches!(host, "localhost" | "[::1]" | "::1")
        || host.ends_with(".local")
        || host.ends_with(".localhost")
    {
        return true;
    }
    match host.parse::<std::net::Ipv4Addr>() {
        Ok(ip) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
        Err(_) => false,
    }
}

fn compatible_chat_url(base_url: Option<&str>) -> Result<String, String> {
    Ok(format!("{}/chat/completions", compatible_base(base_url)?))
}

fn compatible_models_url(base_url: Option<&str>) -> Result<String, String> {
    Ok(format!("{}/models", compatible_base(base_url)?))
}

fn user_message(prompt: &str, context: &str) -> String {
    if context.is_empty() {
        format!("Task:\n{prompt}")
    } else {
        format!("Task:\n{prompt}\n\nDocument context:\n{context}")
    }
}

fn clean_model(model: Option<&str>, default: &str) -> Result<String, String> {
    let model = model.unwrap_or("").trim();
    let model = if model.is_empty() { default } else { model };
    let valid = model.len() <= 80
        && model
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':' | '/'));
    if !valid {
        return Err("The model name contains unsupported characters.".into());
    }
    Ok(model.to_string())
}

fn ollama_base(base_url: Option<&str>) -> Result<String, String> {
    let base = base_url.unwrap_or("http://127.0.0.1:11434").trim();
    let base = base.trim_end_matches('/');
    let url = reqwest::Url::parse(base)
        .map_err(|_| "The Ollama address is not a valid URL.".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Ollama must use http or https.".into());
    }
    let host = url.host_str().unwrap_or("");
    if !matches!(host, "localhost" | "127.0.0.1" | "::1") {
        return Err("Ollama is limited to this computer.".into());
    }
    Ok(base.to_string())
}

fn ollama_chat_url(base_url: Option<&str>) -> Result<String, String> {
    Ok(format!("{}/api/chat", ollama_base(base_url)?))
}

fn ollama_tags_url(base_url: Option<&str>) -> Result<String, String> {
    Ok(format!("{}/api/tags", ollama_base(base_url)?))
}

fn ollama_has_model(body: &str, model: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return false;
    };
    let Some(models) = value.get("models").and_then(|item| item.as_array()) else {
        return false;
    };
    let needle = model.to_ascii_lowercase();
    models.iter().any(|item| {
        item.get("name")
            .and_then(|name| name.as_str())
            .map(|name| {
                let name = name.to_ascii_lowercase();
                name == needle || name.starts_with(&format!("{needle}:"))
            })
            .unwrap_or(false)
    })
}

fn http_failure(err: reqwest::Error) -> String {
    if err.is_connect() {
        "Could not reach the AI provider. For Local Ollama, start the Ollama app and try again."
            .into()
    } else if err.is_timeout() {
        "The AI provider took too long to respond.".into()
    } else {
        "The AI request failed.".into()
    }
}

fn provider_message(status: reqwest::StatusCode, body: &str, provider: AiProvider) -> String {
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return match provider {
            AiProvider::Openai => "OpenAI rejected the API key.".into(),
            AiProvider::Anthropic => "Anthropic rejected the API key.".into(),
            AiProvider::Ollama => "Ollama rejected the request.".into(),
            AiProvider::Compatible => "The endpoint rejected the API key.".into(),
            AiProvider::Builtin => "The built-in engine rejected the request.".into(),
        };
    }
    if status.as_u16() == 429 {
        return "The AI provider is rate limiting requests (429).".into();
    }
    if provider == AiProvider::Ollama && status.as_u16() == 404 {
        return "That Ollama model is not installed. Pull it locally, then try again.".into();
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        let message = value
            .get("error")
            .and_then(|error| {
                error
                    .get("message")
                    .and_then(|message| message.as_str())
                    .or_else(|| error.as_str())
            })
            .unwrap_or("");
        if too_long(message) {
            return TOO_LONG.into();
        }
        if !message.is_empty() {
            return redact(message);
        }
    }
    format!("The AI provider returned status {}.", status.as_u16())
}

const TOO_LONG: &str = "The text is too long for this model. Select a shorter part of the document, or choose a model with a larger context in AI Settings.";

/// A request bigger than the model's context window: llama.cpp ("exceeds the available context size"), OpenAI-style
/// servers ("maximum context length"), Ollama and Anthropic ("prompt is too long").
fn too_long(message: &str) -> bool {
    let lower = message.to_lowercase();
    (lower.contains("context") && (lower.contains("exceed") || lower.contains("maximum")))
        || lower.contains("prompt is too long")
}

fn redact(message: &str) -> String {
    let mut out = String::new();
    let mut rest = message;
    while let Some(start) = rest.find("sk-") {
        out.push_str(&rest[..start]);
        out.push_str("[redacted]");
        let after = &rest[start + 3..];
        let skip = after
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
            .count();
        rest = &after[skip..];
    }
    out.push_str(rest);
    if out.chars().count() > 300 {
        out = out.chars().take(300).collect();
    }
    out
}

/// Reads a streamed reply line by line. It keeps bytes, not text: a network chunk can end in the middle of a
/// character (é, Hebrew, an emoji), and decoding each chunk on its own would turn both halves into "�". A line ends
/// at `\n`, which is never part of a longer character, so whole lines always decode cleanly.
struct StreamParser {
    provider: AiProvider,
    buffer: Vec<u8>,
}

impl StreamParser {
    fn new(provider: AiProvider) -> Self {
        Self {
            provider,
            buffer: Vec::new(),
        }
    }

    fn push(&mut self, chunk: impl AsRef<[u8]>) -> Result<Vec<String>, String> {
        self.buffer.extend_from_slice(chunk.as_ref());
        let mut deltas = Vec::new();
        while let Some(index) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=index).collect();
            let line = String::from_utf8_lossy(&line[..index]);
            if let Some(text) = self.consume_line(line.trim_end_matches('\r'))? {
                deltas.push(text);
            }
        }
        Ok(deltas)
    }

    fn finish(&mut self) -> Result<Option<String>, String> {
        let line = std::mem::take(&mut self.buffer);
        let line = String::from_utf8_lossy(&line);
        let line = line.trim();
        if line.is_empty() {
            return Ok(None);
        }
        self.consume_line(line)
    }

    fn consume_line(&self, line: &str) -> Result<Option<String>, String> {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') || line.starts_with("event:") {
            return Ok(None);
        }
        match self.provider {
            AiProvider::Ollama => ollama_delta(line),
            AiProvider::Openai
            | AiProvider::Anthropic
            | AiProvider::Compatible
            | AiProvider::Builtin => {
                let Some(data) = line.strip_prefix("data:") else {
                    return Ok(None);
                };
                let data = data.trim();
                if data == "[DONE]" {
                    return Ok(None);
                }
                match self.provider {
                    AiProvider::Openai | AiProvider::Compatible | AiProvider::Builtin => {
                        openai_delta(data)
                    }
                    AiProvider::Anthropic => anthropic_delta(data),
                    AiProvider::Ollama => unreachable!(),
                }
            }
        }
    }
}

fn openai_delta(data: &str) -> Result<Option<String>, String> {
    let value: serde_json::Value = serde_json::from_str(data)
        .map_err(|_| "OpenAI returned a response Inkspire could not read.".to_string())?;
    if let Some(message) = value
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(|message| message.as_str())
    {
        return Err(redact(message));
    }
    Ok(value
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("content"))
        .and_then(|content| content.as_str())
        .filter(|text| !text.is_empty())
        .map(str::to_string))
}

fn anthropic_delta(data: &str) -> Result<Option<String>, String> {
    let value: serde_json::Value = serde_json::from_str(data)
        .map_err(|_| "Anthropic returned a response Inkspire could not read.".to_string())?;
    if value.get("type").and_then(|kind| kind.as_str()) == Some("error") {
        let message = value
            .pointer("/error/message")
            .and_then(|message| message.as_str())
            .unwrap_or("Anthropic rejected the request.");
        return Err(redact(message));
    }
    Ok(value
        .pointer("/delta/text")
        .and_then(|text| text.as_str())
        .filter(|text| !text.is_empty())
        .map(str::to_string))
}

fn ollama_delta(data: &str) -> Result<Option<String>, String> {
    let value: serde_json::Value = serde_json::from_str(data)
        .map_err(|_| "Ollama returned a response Inkspire could not read.".to_string())?;
    if let Some(message) = value.get("error").and_then(|error| error.as_str()) {
        return Err(redact(message));
    }
    Ok(value
        .pointer("/message/content")
        .and_then(|content| content.as_str())
        .filter(|text| !text.is_empty())
        .map(str::to_string))
}

fn finalize_html(raw: &str) -> String {
    let stripped = strip_fences(raw.trim());
    let sanitized = sanitize_html(stripped);
    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.contains('<') {
        trimmed.to_string()
    } else {
        format!("<p>{}</p>", escape_text(trimmed))
    }
}

fn strip_fences(value: &str) -> &str {
    let trimmed = value.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed;
    };
    let rest = rest.trim_start();
    let rest = rest
        .strip_prefix("html")
        .unwrap_or(rest)
        .trim_start_matches(['\r', '\n']);
    rest.strip_suffix("```").unwrap_or(rest).trim()
}

fn sanitize_html(input: &str) -> String {
    let mut out = String::new();
    let mut rest = input;
    while !rest.is_empty() {
        let Some(start) = rest.find('<') else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        rest = &rest[start..];
        let lower = rest.to_ascii_lowercase();
        if lower.starts_with("<!--") {
            rest = skip_until(rest, "-->");
            continue;
        }
        if lower.starts_with("<!doctype") || lower.starts_with("<!") {
            rest = skip_until(rest, ">");
            continue;
        }
        if lower.starts_with("<script") {
            rest = skip_block(rest, "script");
            continue;
        }
        if lower.starts_with("<style") {
            rest = skip_block(rest, "style");
            continue;
        }
        let Some(end) = rest.find('>') else {
            break;
        };
        let tag = &rest[1..end];
        rest = &rest[end + 1..];
        let tag = tag.trim().trim_end_matches('/');
        let closing = tag.starts_with('/');
        let name = tag
            .trim_start_matches('/')
            .split_whitespace()
            .next()
            .unwrap_or("");
        let name = name.to_ascii_lowercase();
        if !allowed_tag(&name) {
            continue;
        }
        if closing {
            out.push_str("</");
            out.push_str(&name);
            out.push('>');
        } else {
            out.push('<');
            out.push_str(&name);
            out.push('>');
        }
    }
    out
}

fn allowed_tag(name: &str) -> bool {
    matches!(
        name,
        "h1" | "h2"
            | "p"
            | "ul"
            | "li"
            | "table"
            | "thead"
            | "tbody"
            | "tr"
            | "th"
            | "td"
            | "strong"
            | "em"
            | "br"
    )
}

fn skip_until<'a>(input: &'a str, marker: &str) -> &'a str {
    match input
        .to_ascii_lowercase()
        .find(&marker.to_ascii_lowercase())
    {
        Some(index) => &input[index + marker.len()..],
        None => "",
    }
}

fn skip_block<'a>(input: &'a str, name: &str) -> &'a str {
    let close = format!("</{name}");
    let lower = input.to_ascii_lowercase();
    let Some(index) = lower.find(&close) else {
        return "";
    };
    skip_until(&input[index..], ">")
}

fn escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn clip_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn fallback_request_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("ai-{nanos}")
}

#[cfg(test)]
mod tests {
    use super::{
        AiProvider, DEFAULT_ANTHROPIC_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OPENAI_MODEL,
        SYSTEM_PROMPT, StreamParser, anthropic_delta, chat_body, clean_model, compatible_chat_url,
        compatible_models_url, finalize_html, key_source, ollama_chat_url, ollama_delta,
        ollama_has_model, openai_delta, provider_message, redact, sanitize_html, user_message,
    };

    #[test]
    fn openai_delta_reads_content_and_errors() {
        assert_eq!(
            openai_delta(r#"{"choices":[{"delta":{"content":"Hi"}}]}"#).unwrap(),
            Some("Hi".into())
        );
        assert_eq!(openai_delta(r#"{"choices":[{"delta":{}}]}"#).unwrap(), None);
        let err = openai_delta(r#"{"error":{"message":"bad sk-abc123_key here"}}"#).unwrap_err();
        assert!(err.contains("[redacted]"));
        assert!(!err.contains("sk-abc123_key"));
    }

    #[test]
    fn anthropic_delta_reads_text_and_errors() {
        assert_eq!(
            anthropic_delta(
                r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"Ok"}}"#
            )
            .unwrap(),
            Some("Ok".into())
        );
        assert_eq!(
            anthropic_delta(
                r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":""}}"#
            )
            .unwrap(),
            None
        );
        assert!(anthropic_delta(r#"{"type":"error","error":{"message":"nope"}}"#).is_err());
    }

    #[test]
    fn ollama_delta_reads_message_content_and_errors() {
        assert_eq!(
            ollama_delta(r#"{"message":{"content":"Local"},"done":false}"#).unwrap(),
            Some("Local".into())
        );
        assert_eq!(ollama_delta(r#"{"message":{},"done":true}"#).unwrap(), None);
        assert!(ollama_delta(r#"{"error":"missing model"}"#).is_err());
    }

    #[test]
    fn clean_model_defaults_and_rejects_bad_names() {
        assert_eq!(
            clean_model(None, DEFAULT_OLLAMA_MODEL).unwrap(),
            DEFAULT_OLLAMA_MODEL
        );
        assert_eq!(
            clean_model(Some("  "), DEFAULT_OPENAI_MODEL).unwrap(),
            DEFAULT_OPENAI_MODEL
        );
        assert_eq!(
            clean_model(Some(DEFAULT_ANTHROPIC_MODEL), "fallback").unwrap(),
            DEFAULT_ANTHROPIC_MODEL
        );
        assert_eq!(
            clean_model(Some("org/model:tag_1.0"), "fallback").unwrap(),
            "org/model:tag_1.0"
        );
        assert!(clean_model(Some("bad name"), "fallback").is_err());
        assert!(clean_model(Some("model;rm"), "fallback").is_err());
    }

    #[test]
    fn redact_strips_api_key_prefixes() {
        let cleaned = redact("failed with sk-live_ABC-123 and sk-test_ZZ");
        assert_eq!(cleaned, "failed with [redacted] and [redacted]");
        assert!(!cleaned.contains("sk-live"));
        let long = "x".repeat(400);
        assert_eq!(redact(&long).chars().count(), 300);
    }

    #[test]
    fn key_status_never_includes_secret_material() {
        let status = key_source("sk-live_secret_value", "AIWORD_TEST_KEY_UNSET");
        assert_eq!(status, "saved");
        assert!(!status.contains("sk-"));
        assert!(!status.contains("secret"));
    }

    #[test]
    fn a_compatible_endpoint_is_https_or_local() {
        assert_eq!(
            compatible_chat_url(Some("http://127.0.0.1:1234/v1/")).unwrap(),
            "http://127.0.0.1:1234/v1/chat/completions"
        );
        assert_eq!(
            compatible_chat_url(Some("https://openrouter.ai/api/v1/chat/completions")).unwrap(),
            "https://openrouter.ai/api/v1/chat/completions"
        );
        assert!(compatible_chat_url(Some("http://192.168.1.20:8080/v1")).is_ok());
        assert!(compatible_chat_url(Some("http://gateway.local/v1")).is_ok());
        assert!(compatible_chat_url(Some("http://example.com/v1")).is_err());
        assert!(compatible_chat_url(Some("ftp://127.0.0.1/v1")).is_err());
        assert!(compatible_chat_url(Some("https://user:pass@example.com/v1")).is_err());
        assert!(compatible_chat_url(Some("")).is_err());
        assert!(compatible_chat_url(None).is_err());
        assert_eq!(
            compatible_models_url(Some("http://localhost:8080/v1")).unwrap(),
            "http://localhost:8080/v1/models"
        );
    }

    #[test]
    fn compatible_and_builtin_streams_read_like_openai() {
        for provider in [AiProvider::Compatible, AiProvider::Builtin] {
            let mut parser = StreamParser::new(provider);
            let mut out = parser
                .push("data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\ndata: [DONE]\n\n")
                .unwrap();
            out.extend(parser.finish().unwrap());
            assert_eq!(out.concat(), "Hello");
        }
    }

    #[test]
    fn the_request_body_asks_for_a_stream_with_the_system_prompt() {
        let body = chat_body("local", "Be brief.", "Task:\nx");
        assert_eq!(body["stream"], true);
        assert_eq!(body["max_tokens"], 4096);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["content"], "Task:\nx");
    }

    #[test]
    fn system_prompt_requires_tiptap_html_and_placeholders() {
        let prompt = SYSTEM_PROMPT.to_ascii_lowercase();
        assert!(prompt.contains("h1"));
        assert!(prompt.contains("h2"));
        assert!(prompt.contains(" p,") || prompt.contains(" p ") || prompt.contains(": p"));
        assert!(prompt.contains("ul"));
        assert!(prompt.contains("table"));
        assert!(SYSTEM_PROMPT.contains("[Company Name]"));
        assert!(prompt.contains("square brackets"));
    }

    #[test]
    fn key_status_names_where_a_key_comes_from() {
        assert_eq!(key_source("secret-value", "AIWORD_TEST_KEY_UNSET"), "saved");
        assert_eq!(key_source("  ", "AIWORD_TEST_KEY_UNSET"), "missing");
        let status = format!(
            "{} {}",
            key_source("secret-value", "AIWORD_TEST_KEY_UNSET"),
            key_source("", "AIWORD_TEST_KEY_UNSET")
        );
        assert!(!status.contains("secret-value"));
    }

    #[test]
    fn user_message_includes_the_task_and_context() {
        let message = user_message("Draft a proposal", "Acme builds tools.");
        assert!(message.contains("Draft a proposal"));
        assert!(message.contains("Acme builds tools."));
    }

    #[test]
    fn ollama_stays_on_this_computer() {
        assert!(
            ollama_chat_url(None)
                .unwrap()
                .starts_with("http://127.0.0.1:11434/")
        );
        assert!(ollama_chat_url(Some("http://localhost:11434")).is_ok());
        assert!(ollama_chat_url(Some("https://example.com")).is_err());
        assert!(ollama_chat_url(Some("file:///etc/passwd")).is_err());
    }

    #[test]
    fn ollama_model_list_matching_is_prefix_aware() {
        let body = r#"{"models":[{"name":"llama3.2:latest"},{"name":"mistral"}]}"#;
        assert!(ollama_has_model(body, "llama3.2"));
        assert!(ollama_has_model(body, "mistral"));
        assert!(!ollama_has_model(body, "codellama"));
    }

    #[test]
    fn parsers_extract_streamed_text() {
        let mut openai = StreamParser::new(AiProvider::Openai);
        let first = openai
            .push("data: {\"choices\":[{\"delta\":{\"content\":\"<h1>\"}}]}\n")
            .unwrap();
        let second = openai
            .push("data: {\"choices\":[{\"delta\":{\"content\":\"Plan</h1>\"}}]}\ndata: [DONE]\n")
            .unwrap();
        assert_eq!(first, vec!["<h1>"]);
        assert_eq!(second, vec!["Plan</h1>"]);

        let mut anthropic = StreamParser::new(AiProvider::Anthropic);
        let text = anthropic
            .push("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"<p>Hi</p>\"}}\n")
            .unwrap();
        assert_eq!(text, vec!["<p>Hi</p>"]);

        let mut ollama = StreamParser::new(AiProvider::Ollama);
        let local = ollama
            .push("{\"message\":{\"content\":\"<ul>\"},\"done\":false}\n{\"message\":{\"content\":\"<li>[Company Name]</li></ul>\"},\"done\":true}\n")
            .unwrap();
        assert_eq!(local, vec!["<ul>", "<li>[Company Name]</li></ul>"]);
    }

    #[test]
    fn split_chunks_are_reassembled_before_parsing() {
        let mut parser = StreamParser::new(AiProvider::Openai);
        assert!(
            parser
                .push("data: {\"choices\":[{\"delta\":{\"content\":\"Hel")
                .unwrap()
                .is_empty()
        );
        let text = parser.push("lo\"}}]}\n").unwrap();
        assert_eq!(text, vec!["Hello"]);
        assert_eq!(
            openai_delta("{\"choices\":[{\"delta\":{}}]}").unwrap(),
            None
        );
        assert!(anthropic_delta("{\"type\":\"error\",\"error\":{\"message\":\"nope\"}}").is_err());
        assert!(ollama_delta("{\"error\":\"missing\"}").is_err());
    }

    /// Feeds `stream` to a parser in pieces cut at every byte offset in `cuts`, as a network would.
    fn parse_in_pieces(provider: AiProvider, stream: &str, cuts: &[usize]) -> String {
        let bytes = stream.as_bytes();
        let mut parser = StreamParser::new(provider);
        let mut text = String::new();
        let mut from = 0;
        for &cut in cuts.iter().chain(std::iter::once(&bytes.len())) {
            text.extend(parser.push(&bytes[from..cut]).unwrap());
            from = cut;
        }
        text.extend(parser.finish().unwrap());
        text
    }

    #[test]
    fn a_character_split_between_chunks_is_not_garbled() {
        let cases = [
            (
                AiProvider::Openai,
                "data: {\"choices\":[{\"delta\":{\"content\":\"Café שלום 😀\"}}]}\n\ndata: [DONE]\n",
            ),
            (
                AiProvider::Anthropic,
                "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Café שלום 😀\"}}\n\n",
            ),
            (
                AiProvider::Ollama,
                "{\"message\":{\"content\":\"Café שלום 😀\"},\"done\":false}\n{\"message\":{},\"done\":true}\n",
            ),
        ];
        for (provider, stream) in cases {
            // Cut inside every multi-byte character: each cut lands between a character's bytes.
            let cuts: Vec<usize> = stream
                .char_indices()
                .filter(|(_, ch)| ch.len_utf8() > 1)
                .map(|(at, _)| at + 1)
                .collect();
            assert_eq!(parse_in_pieces(provider, stream, &cuts), "Café שלום 😀");
            // And one byte at a time.
            let every: Vec<usize> = (1..stream.len()).collect();
            assert_eq!(parse_in_pieces(provider, stream, &every), "Café שלום 😀");
        }
    }

    #[test]
    fn ollama_and_anthropic_streams_read_across_chunks() {
        let ollama = "{\"message\":{\"content\":\"<p>Lo\"},\"done\":false}\n{\"message\":{\"content\":\"cal</p>\"},\"done\":false}\n{\"message\":{\"content\":\"\"},\"done\":true}";
        assert_eq!(
            parse_in_pieces(AiProvider::Ollama, ollama, &[10, 40, 75]),
            "<p>Local</p>"
        );
        let anthropic = "event: message_start\ndata: {\"type\":\"message_start\"}\n\n: ping\nevent: content_block_delta\r\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"<p>Hi\"}}\r\n\r\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"</p>\"}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n";
        assert_eq!(
            parse_in_pieces(AiProvider::Anthropic, anthropic, &[7, 60, 130]),
            "<p>Hi</p>"
        );
        // An error in the middle of a stream stops it with the provider's message.
        let mut parser = StreamParser::new(AiProvider::Anthropic);
        let err = parser
            .push("data: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n")
            .unwrap_err();
        assert!(err.contains("Overloaded"));
        let mut parser = StreamParser::new(AiProvider::Ollama);
        assert!(parser.push("{\"error\":\"model not found\"}\n").is_err());
    }

    #[test]
    fn a_request_over_the_context_window_says_what_to_do() {
        let llama = r#"{"error":{"code":400,"message":"request (20512 tokens) exceeds the available context size (16384 tokens), try increasing it","type":"exceed_context_size_error"}}"#;
        let openai = r#"{"error":{"message":"This model's maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens."}}"#;
        let anthropic = r#"{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 210000 tokens > 200000 maximum"}}"#;
        for (body, provider) in [
            (llama, AiProvider::Builtin),
            (openai, AiProvider::Openai),
            (anthropic, AiProvider::Anthropic),
        ] {
            let message = provider_message(reqwest::StatusCode::BAD_REQUEST, body, provider);
            assert!(message.starts_with("The text is too long"), "{message}");
        }
        let other = provider_message(
            reqwest::StatusCode::BAD_REQUEST,
            r#"{"error":{"message":"Unknown model"}}"#,
            AiProvider::Openai,
        );
        assert_eq!(other, "Unknown model");
    }

    /// The built-in engine for real: downloads the engine and the standard model with the app's own code (into the
    /// app's data folder, so the desktop app finds them; or `INKSPIRE_LIVE_ROOT`), starts `llama-server` with the
    /// app's arguments and streams a rewrite through the app's parser. Several GB on first run, so it is ignored:
    /// `cargo test --lib live_builtin_engine -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_builtin_engine() {
        use crate::local_ai;
        let root = std::env::var("INKSPIRE_LIVE_ROOT")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| {
                std::path::PathBuf::from(std::env::var("HOME").unwrap())
                    .join(".local/share/com.aiword.app/local-ai")
            });
        let model =
            local_ai::model_by_id(std::env::var("INKSPIRE_LIVE_MODEL").ok().as_deref()).unwrap();
        let arch = std::env::consts::ARCH;
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let started = std::time::Instant::now();
            let last = std::sync::Mutex::new(0u64);
            let emit = |stage: &'static str, label: &str, got: u64, total: u64| {
                let step = got * 20 / total.max(1);
                let mut seen = last.lock().unwrap();
                if step != *seen {
                    *seen = step;
                    eprintln!("{stage} {label}: {} / {} MB", got >> 20, total >> 20);
                }
            };
            local_ai::install_into(&root, arch, model, &emit)
                .await
                .unwrap();
            eprintln!("installed in {:?}", started.elapsed());
        });

        let backend = local_ai::pick_backend(
            local_ai::vulkan_available(),
            root.join("vulkan-failed").exists(),
        );
        let server = local_ai::find_server(&local_ai::engine_dir(&root, backend)).unwrap();
        let port = 18_000 + (std::process::id() % 1000) as u16;
        let model_path = local_ai::models_dir(&root).join(model.file);
        let log = std::fs::File::create(root.join("engine-live-test.log")).unwrap();
        let mut child = std::process::Command::new(&server)
            .args(local_ai::server_args(
                &model_path,
                model.context,
                port,
                backend,
            ))
            .env("LD_LIBRARY_PATH", server.parent().unwrap())
            .stdout(log.try_clone().unwrap())
            .stderr(log)
            .spawn()
            .unwrap();
        let outcome = runtime.block_on(async {
            let base = format!("http://127.0.0.1:{port}");
            let client = reqwest::Client::new();
            let loading = std::time::Instant::now();
            loop {
                let ok = client.get(format!("{base}/health")).send().await.map(|r| r.status().is_success());
                if ok.unwrap_or(false) {
                    break;
                }
                assert!(loading.elapsed().as_secs() < 240, "the engine did not start");
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            }
            eprintln!("{backend:?} engine ready in {:?}", loading.elapsed());
            let mut out = Vec::new();
            for (prompt, context) in [
                ("Rewrite this paragraph to be more formal.", "<p>hey team, the launch is moved to friday cuz the tests aren't done yet. sorry!</p>"),
                ("Translate this paragraph into Hebrew.", "<p>The café opens at nine. Everyone is welcome.</p>"),
            ] {
                let asked = std::time::Instant::now();
                let response = client
                    .post(format!("{base}/v1/chat/completions"))
                    .json(&chat_body("local", SYSTEM_PROMPT, &user_message(prompt, context)))
                    .send()
                    .await
                    .unwrap();
                assert!(response.status().is_success(), "{}", response.status());
                let mut parser = StreamParser::new(AiProvider::Builtin);
                let mut text = String::new();
                let mut stream = response.bytes_stream();
                use futures_util::StreamExt;
                while let Some(chunk) = stream.next().await {
                    text.extend(parser.push(chunk.unwrap()).unwrap());
                }
                text.extend(parser.finish().unwrap());
                eprintln!("--- {prompt} ({:?})\n{}", asked.elapsed(), finalize_html(&text));
                out.push(finalize_html(&text));
            }
            out
        });
        let _ = child.kill();
        let _ = child.wait();
        assert!(
            outcome[0].starts_with('<') && outcome[0].len() > 20,
            "{}",
            outcome[0]
        );
        assert!(!outcome[1].contains('\u{FFFD}'), "{}", outcome[1]);
        // Whether the translation is good Hebrew is up to the model (the 3B one mixes in other scripts); the app's part
        // is that the reply ends and no character is garbled.
    }

    #[test]
    fn html_is_limited_to_editor_elements() {
        let clean =
            sanitize_html("<p onclick=\"alert(1)\">Hi</p><script>alert(1)</script><h1>Title</h1>");
        assert_eq!(clean, "<p>Hi</p><h1>Title</h1>");
        let wrapped = finalize_html("```html\n<h2>Next</h2>\n<p>[Company Name]</p>\n```");
        assert_eq!(wrapped, "<h2>Next</h2>\n<p>[Company Name]</p>");
        assert_eq!(finalize_html("Plain note"), "<p>Plain note</p>");
    }
}
