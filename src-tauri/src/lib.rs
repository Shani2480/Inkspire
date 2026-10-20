mod ai;
mod local_ai;
mod office;
mod pinch;
mod secrets;
mod tools;

use ai::{ai_key_status, cancel_ai_text, generate_ai_text, save_ai_key, test_ai_connection};
use local_ai::{local_ai_cancel_install, local_ai_install, local_ai_remove, local_ai_status};
use office::{from_pandoc_html, to_pandoc_html};

use std::path::{Path, PathBuf};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::Manager;
            use tauri::window::Color;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
                pinch::route_to_document(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_document,
            export_document,
            read_document,
            write_document,
            list_system_fonts,
            open_window,
            rename_document,
            generate_ai_text,
            cancel_ai_text,
            ai_key_status,
            save_ai_key,
            test_ai_connection,
            local_ai_status,
            local_ai_install,
            local_ai_cancel_install,
            local_ai_remove,
            tools::tools_status,
            tools::tools_install,
            tools::tools_cancel_install,
            tools::tools_remove,
            email_document,
            reveal_document,
            system_defaults
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                local_ai::shutdown();
            }
        });
}

/// Writes a copy of the document to a temporary folder and opens the desktop's mail client with it attached.
/// Linux uses `xdg-email`, macOS opens the file in Mail; elsewhere the caller falls back to a plain `mailto:` link.
#[tauri::command]
fn email_document(file_name: String, bytes: Vec<u8>, subject: String) -> Result<(), String> {
    let name: String = file_name
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() || matches!(ch, '.' | '-' | '_' | ' ') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if name.trim().is_empty() || name.starts_with('.') {
        return Err("That file name cannot be used.".into());
    }
    let directory = std::env::temp_dir().join("inkspire-mail");
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Could not prepare the copy to send.".to_string())?;
    let path = directory.join(&name);
    std::fs::write(&path, bytes).map_err(|_| "Could not write the copy to send.".to_string())?;

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-email")
            .arg("--subject")
            .arg(&subject)
            .arg("--attach")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|_| "No mail program could be opened.".to_string())
    }
    #[cfg(target_os = "macos")]
    {
        let _ = &subject;
        std::process::Command::new("open")
            .args(["-a", "Mail"])
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|_| "No mail program could be opened.".to_string())
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (&subject, &path);
        Err("Attaching a file is not supported here.".into())
    }
}

/// The folder-and-file check behind "Open containing folder": a full path to a file that still exists.
fn existing_file_path(path: &str) -> Result<PathBuf, String> {
    let path = assert_user_document_path(path)?;
    if !path.is_file() {
        return Err("The file could not be found.".into());
    }
    Ok(path)
}

/// `file:///…` for a path, with everything outside the unreserved set and `/` percent-encoded.
fn file_uri(path: &Path) -> String {
    let mut uri = String::from("file://");
    for byte in path.to_string_lossy().bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'_' | b'.' | b'~') {
            uri.push(byte as char);
        } else {
            uri.push_str(&format!("%{byte:02X}"));
        }
    }
    uri
}

/// Shows the file in the desktop's file manager, selecting it where the manager can. Linux asks the
/// `org.freedesktop.FileManager1` service to `ShowItems` and falls back to opening the folder with `xdg-open`;
/// macOS uses `open -R` and Windows `explorer /select,`.
#[tauri::command]
fn reveal_document(path: String) -> Result<(), String> {
    let path = existing_file_path(&path)?;
    let failed = || "The folder could not be opened.".to_string();

    #[cfg(target_os = "linux")]
    {
        let shown = std::process::Command::new("dbus-send")
            .args([
                "--session",
                "--print-reply",
                "--dest=org.freedesktop.FileManager1",
                "/org/freedesktop/FileManager1",
                "org.freedesktop.FileManager1.ShowItems",
            ])
            .arg(format!("array:string:{}", file_uri(&path)))
            .arg("string:")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        if shown {
            return Ok(());
        }
        let folder = path.parent().ok_or_else(failed)?;
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map(|_| ())
            .map_err(|_| failed())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|_| failed())
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map(|_| ())
            .map_err(|_| failed())
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = (&path, failed);
        Err("Showing a folder is not supported here.".into())
    }
}

/// What the desktop session says about the person and their region, for the first-run setup (21.42). Every field is
/// empty when the system does not give it.
#[derive(serde::Serialize, Default)]
struct SystemDefaults {
    user: String,
    full_name: String,
    lang: String,
    lc_all: String,
    lc_time: String,
    lc_numeric: String,
}

/// The display name in a `passwd` entry's GECOS field: its first comma-separated part.
fn gecos_name(entry: &str) -> String {
    entry
        .split(':')
        .nth(4)
        .and_then(|gecos| gecos.split(',').next())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// The name the system holds for the signed-in person: the passwd entry on Linux, the directory entry on macOS and
/// the account's display name on Windows. Empty when it holds none, so the app asks instead of guessing.
fn system_full_name(user: &str) -> String {
    let run = |program: &str, args: &[&str]| -> String {
        let mut command = std::process::Command::new(program);
        command.args(args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        command
            .output()
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_default()
    };
    #[cfg(target_os = "macos")]
    {
        let _ = user;
        return run("id", &["-F"]);
    }
    #[cfg(windows)]
    {
        let _ = user;
        return run(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.DirectoryServices.AccountManagement; [System.DirectoryServices.AccountManagement.UserPrincipal]::Current.DisplayName",
            ],
        );
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if user.is_empty() {
            return String::new();
        }
        gecos_name(&run("getent", &["passwd", user]))
    }
}

#[tauri::command]
fn system_defaults() -> SystemDefaults {
    let var = |name: &str| std::env::var(name).unwrap_or_default();
    let user = [var("USER"), var("LOGNAME"), var("USERNAME")]
        .into_iter()
        .find(|name| !name.is_empty())
        .unwrap_or_default();
    let full_name = system_full_name(&user);
    SystemDefaults {
        user,
        full_name,
        lang: var("LANG"),
        lc_all: var("LC_ALL"),
        lc_time: var("LC_TIME"),
        lc_numeric: var("LC_NUMERIC"),
    }
}

/// Renames the open document's file in its own folder, as the title bar's name flyout does. The new name must keep
/// the extension and must not replace another file.
#[tauri::command]
fn rename_document(from: String, to: String) -> Result<(), String> {
    let from = assert_local_document_path(&from)?;
    let to = assert_local_document_path(&to)?;
    if from.parent() != to.parent() {
        return Err("A file can only be renamed in its own folder.".into());
    }
    if file_extension(from.to_string_lossy().as_ref())
        != file_extension(to.to_string_lossy().as_ref())
    {
        return Err("Renaming keeps the file's type.".into());
    }
    if !from.is_file() {
        return Err("The file could not be found.".into());
    }
    if to.exists() && to != from {
        return Err("A file with that name is already in the folder.".into());
    }
    std::fs::rename(&from, &to).map_err(|err| format!("Could not rename the file: {err}"))
}

/// Opens another document window, set up as the main one (no system frame, transparent corners, pinch to zoom).
/// `request` is the JSON the frontend reads at launch (src/document/windows.ts): a path, a handoff or a blank.
/// Async, as creating a window from a synchronous command can deadlock on Windows.
#[tauri::command]
async fn open_window(app: tauri::AppHandle, request: String) -> Result<String, String> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tauri::window::Color;
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    static NEXT: AtomicUsize = AtomicUsize::new(1);
    let request: serde_json::Value =
        serde_json::from_str(&request).map_err(|err| format!("Bad window request: {err}"))?;
    let label = format!("doc-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let script = format!("window.__INKSPIRE_OPEN__ = {request};");
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("Inkspire")
        .inner_size(1100.0, 820.0)
        .min_inner_size(720.0, 480.0)
        .resizable(true)
        .decorations(false)
        .shadow(true)
        .zoom_hotkeys_enabled(false)
        .background_color(Color(0, 0, 0, 0))
        .initialization_script(&script)
        .transparent(true);
    let window = builder.build().map_err(|err| err.to_string())?;
    pinch::route_to_document(&window);
    Ok(label)
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("fc-list")
        .args(["-f", "%{family}\n"])
        .output()
        .map_err(|err| format!("Could not read system fonts: {err}"))?;
    if !output.status.success() {
        return Err("Could not read system fonts.".into());
    }
    Ok(font_families(&String::from_utf8_lossy(&output.stdout)))
}

fn font_families(text: &str) -> Vec<String> {
    let mut names = std::collections::BTreeSet::new();
    for line in text.lines() {
        for family in line.split(',') {
            let name = family.trim();
            if !name.is_empty() && name.len() <= 80 {
                names.insert(name.to_string());
            }
        }
    }
    names.into_iter().collect()
}

#[tauri::command]
async fn import_document(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let path = assert_user_document_path(&path)?;
    let format = import_format(path.to_string_lossy().as_ref())?;
    if !path.is_file() {
        return Err("The selected file could not be found.".into());
    }

    let html_file = TempHtml::create()?;
    let mut args = vec![
        "--from".into(),
        format.into(),
        "--to".into(),
        "html".into(),
        "--embed-resources".into(),
        "--wrap".into(),
        "none".into(),
    ];
    if format == "docx" {
        args.push("--track-changes=all".into());
    }
    args.extend([
        "--output".into(),
        html_file.path_string(),
        "--".into(),
        path.to_string_lossy().into_owned(),
    ]);
    let output = run_pandoc(&app, args).await?;
    if !output.success {
        return Err(pandoc_run_failure(
            &output,
            "Pandoc could not import this document.",
        ));
    }

    let html = std::fs::read_to_string(html_file.path())
        .map_err(|err| format!("Pandoc did not produce HTML: {err}"))?;
    Ok(from_pandoc_html(&document_body(&html)))
}

#[tauri::command]
async fn export_document(
    app: tauri::AppHandle,
    html: String,
    path: String,
    title: Option<String>,
    author: Option<String>,
    subject: Option<String>,
    keywords: Option<String>,
    description: Option<String>,
) -> Result<(), String> {
    let path = assert_user_document_path(&path)?;
    let format = export_format(path.to_string_lossy().as_ref())?;
    if path.file_name().is_none() {
        return Err("Choose a file name for the exported document.".into());
    }

    let html_file = TempHtml::create()?;
    let prepared = if format == "docx" || format == "odt" {
        to_pandoc_html(&html)
    } else {
        html
    };
    std::fs::write(html_file.path(), prepared.as_bytes())
        .map_err(|err| format!("Could not prepare the document for export: {err}"))?;

    let mut args = vec![
        "--from".into(),
        "html".into(),
        "--to".into(),
        format.into(),
        "--output".into(),
        path.to_string_lossy().into_owned(),
    ];
    push_metadata_arg(&mut args, "title", title.as_deref());
    push_metadata_arg(&mut args, "author", author.as_deref());
    push_metadata_arg(&mut args, "subject", subject.as_deref());
    push_metadata_arg(&mut args, "keywords", keywords.as_deref());
    push_metadata_arg(&mut args, "description", description.as_deref());
    args.push("--".into());
    args.push(html_file.path_string());
    if format == "pdf" {
        let missing: Vec<&str> = [
            tools::resolve(&app, &tools::PANDOC)
                .is_none()
                .then_some("pandoc"),
            pdf_engine(&app).is_none().then_some("typst"),
        ]
        .into_iter()
        .flatten()
        .collect();
        if !missing.is_empty() {
            return Err(tool_missing(&missing));
        }
        let engine = pdf_engine(&app).ok_or_else(|| tool_missing(&["typst"]))?;
        // Pandoc's Typst writer emits absolute media paths under the system temp
        // dir (e.g. /tmp/media-…/img.jpg). Typst sandboxes those against --root
        // (default: Pandoc's cwd, often src-tauri), so /tmp/… is looked up as
        // <cwd>/tmp/… and fails. Point --root at the filesystem root so absolute
        // extracted-media paths resolve.
        args.insert(0, format!("--root={}", typst_project_root()));
        args.insert(0, "--pdf-engine-opt".into());
        args.insert(0, engine);
        args.insert(0, "--pdf-engine".into());
    }

    let output = run_pandoc(&app, args).await?;
    if !output.success {
        return Err(pandoc_run_failure(
            &output,
            "Pandoc could not export this document.",
        ));
    }
    Ok(())
}

fn push_metadata_arg(args: &mut Vec<String>, key: &str, value: Option<&str>) {
    if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--metadata".into());
        args.push(format!("{key}:{value}"));
    }
}

/// Reads a user document as raw bytes. The fs plugin is scoped to app data only,
/// so every user file goes through these two commands and their path checks.
#[tauri::command]
fn read_document(path: String) -> Result<tauri::ipc::Response, String> {
    let path = assert_local_document_path(&path)?;
    if !path.is_file() {
        return Err("The selected file could not be found.".into());
    }
    let bytes =
        std::fs::read(&path).map_err(|err| format!("Could not read the document: {err}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Writes raw bytes sent as the request body. The path travels percent-encoded in
/// the `x-document-path` header so non-ASCII folder names survive.
#[tauri::command]
fn write_document(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("The document data was not sent as bytes.".into());
    };
    let encoded = request
        .headers()
        .get("x-document-path")
        .and_then(|value| value.to_str().ok())
        .ok_or("Choose a file path.")?;
    let path = assert_local_document_path(&percent_decode(encoded)?)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err("The folder for that file could not be found.".into());
        }
    }
    // Write beside the destination, then rename. A crash mid-write leaves the previous file intact.
    let mut temporary = path.clone();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Choose a file path.")?;
    temporary.set_file_name(format!(".{file_name}.tmp"));
    if let Err(err) = std::fs::write(&temporary, bytes) {
        return Err(format!("Could not save the document: {err}"));
    }
    if let Err(err) = std::fs::rename(&temporary, &path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(format!("Could not save the document: {err}"));
    }
    Ok(())
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = value
                .get(index + 1..index + 3)
                .and_then(|pair| u8::from_str_radix(pair, 16).ok())
                .ok_or("That file path is not allowed.")?;
            out.push(hex);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "That file path is not allowed.".to_string())
}

fn assert_user_document_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Choose a file path.".into());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("Choose a full file path.".into());
    }
    if path
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("That file path is not allowed.".into());
    }
    Ok(path)
}

fn assert_local_document_path(path: &str) -> Result<PathBuf, String> {
    let path = assert_user_document_path(path)?;
    match file_extension(path.to_string_lossy().as_ref()).as_deref() {
        Some(ext) if is_local_document_extension(ext) => Ok(path),
        _ => Err(
            "Inkspire can only open and save .docx, .odt, .rtf, .html, .md, .txt, and .pdf files."
                .into(),
        ),
    }
}

fn is_local_document_extension(ext: &str) -> bool {
    matches!(
        ext,
        "html" | "htm" | "txt" | "md" | "rtf" | "docx" | "odt" | "pdf"
    )
}

struct PandocRun {
    success: bool,
    stderr: Vec<u8>,
}

/// The error the page recognises: the named downloadable tools are not on this computer yet.
fn tool_missing(ids: &[&str]) -> String {
    format!("TOOL_MISSING:{}", ids.join(","))
}

async fn run_pandoc(app: &tauri::AppHandle, args: Vec<String>) -> Result<PandocRun, String> {
    let program = tools::resolve(app, &tools::PANDOC).ok_or_else(|| tool_missing(&["pandoc"]))?;
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new(program).args(&args).output()
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| format!("Pandoc could not be started: {err}"))?;
    Ok(PandocRun {
        success: output.status.success(),
        stderr: output.stderr,
    })
}

fn import_format(path: &str) -> Result<&'static str, String> {
    match file_extension(path).as_deref() {
        Some("docx") => Ok("docx"),
        Some("odt") => Ok("odt"),
        Some("rtf") => Ok("rtf"),
        _ => Err("Only .docx, .odt, and .rtf files can be imported via Pandoc.".into()),
    }
}

fn export_format(path: &str) -> Result<&'static str, String> {
    match file_extension(path).as_deref() {
        Some("docx") => Ok("docx"),
        Some("odt") => Ok("odt"),
        Some("pdf") => Ok("pdf"),
        Some("rtf") => Ok("rtf"),
        _ => Err("Export supports .docx, .odt, .pdf, and .rtf files.".into()),
    }
}

fn file_extension(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
}

fn document_body(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let Some(body_at) = lower.find("<body") else {
        return html.trim().to_string();
    };
    let Some(open_end) = html[body_at..].find('>') else {
        return html.trim().to_string();
    };
    let content = &html[body_at + open_end + 1..];
    let content_lower = content.to_ascii_lowercase();
    let body = match content_lower.rfind("</body>") {
        Some(end) => &content[..end],
        None => content,
    };
    body.trim().to_string()
}

fn pandoc_run_failure(output: &PandocRun, fallback: &str) -> String {
    let detail = String::from_utf8_lossy(&output.stderr)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if detail.is_empty() {
        return fallback.to_string();
    }
    if detail.contains("pdflatex") || detail.contains("pdf-engine") {
        return format!(
            "{detail}\nDownload Typst from Settings, or install Typst/Tectonic/TeX, then export again."
        );
    }
    detail
}

/// Project root passed to Typst so absolute extracted-media paths stay readable.
fn typst_project_root() -> String {
    #[cfg(windows)]
    {
        let temp = std::env::temp_dir();
        let mut root = PathBuf::new();
        for component in temp.components() {
            root.push(component);
            if matches!(component, std::path::Component::RootDir) {
                break;
            }
        }
        if root.as_os_str().is_empty() {
            "C:\\".into()
        } else {
            root.to_string_lossy().into_owned()
        }
    }
    #[cfg(not(windows))]
    {
        "/".into()
    }
}

/// The program Pandoc makes PDFs with: the downloaded Typst, else a PDF engine already on the PATH.
fn pdf_engine(app: &tauri::AppHandle) -> Option<String> {
    if let Some(path) = tools::resolve(app, &tools::TYPST) {
        return Some(path.to_string_lossy().into_owned());
    }
    let path = std::env::var_os("PATH")?;
    for name in [
        "tectonic",
        "weasyprint",
        "wkhtmltopdf",
        "xelatex",
        "lualatex",
        "pdflatex",
    ] {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

struct TempHtml(PathBuf);

impl TempHtml {
    fn create() -> Result<Self, String> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let mut path = std::env::temp_dir();
        path.push(format!("aiword-{nanos}-{}.html", std::process::id()));
        Ok(Self(path))
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn path_string(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
}

impl Drop for TempHtml {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        assert_local_document_path, assert_user_document_path, document_body, export_format,
        font_families, import_format, is_local_document_extension, percent_decode,
        typst_project_root,
    };
    use super::{existing_file_path, file_uri, gecos_name};
    use std::path::Path;

    #[test]
    fn font_list_splits_families() {
        let names = font_families("DejaVu Sans\nNimbus Roman,Nimbus Roman\n\n");
        assert_eq!(
            names,
            vec!["DejaVu Sans".to_string(), "Nimbus Roman".to_string()]
        );
    }

    #[test]
    fn import_accepts_office_documents() {
        assert_eq!(import_format("/docs/Report.DOCX").unwrap(), "docx");
        assert_eq!(import_format("notes.odt").unwrap(), "odt");
        assert!(import_format("notes.pdf").is_err());
        assert!(import_format("notes.html").is_err());
    }

    #[test]
    fn export_accepts_office_and_pdf_targets() {
        assert_eq!(export_format("out.docx").unwrap(), "docx");
        assert_eq!(export_format("out.odt").unwrap(), "odt");
        assert_eq!(export_format("out.PDF").unwrap(), "pdf");
        assert!(export_format("out.html").is_err());
    }

    #[test]
    fn body_extractor_keeps_a_fragment_and_strips_a_document() {
        assert_eq!(
            document_body("<p>Hello <strong>world</strong>.</p>"),
            "<p>Hello <strong>world</strong>.</p>"
        );
        assert_eq!(
            document_body("<html><head><title>T</title></head><body><p>Hi</p></body></html>"),
            "<p>Hi</p>"
        );
    }

    #[test]
    fn document_paths_must_be_absolute_without_parent_dirs() {
        assert!(assert_user_document_path("/home/user/doc.docx").is_ok());
        assert!(assert_user_document_path("relative.docx").is_err());
        assert!(assert_user_document_path("/home/user/../secret.docx").is_err());
        assert!(assert_user_document_path("").is_err());
    }

    #[test]
    fn local_document_extension_allowlist() {
        for ext in ["html", "htm", "txt", "md", "rtf", "docx", "odt", "pdf"] {
            assert!(is_local_document_extension(ext), "{ext}");
        }
        assert!(!is_local_document_extension("exe"));
        assert!(!is_local_document_extension("sh"));

        assert!(assert_local_document_path("/home/user/notes.HTM").is_ok());
        assert!(assert_local_document_path("/home/user/report.docx").is_ok());
        assert!(assert_local_document_path("/home/user/.bashrc").is_err());
        assert!(assert_local_document_path("notes.html").is_err());
        assert!(assert_local_document_path("/home/user/../secret.html").is_err());
    }

    #[test]
    fn gecos_name_is_the_first_field() {
        assert_eq!(
            gecos_name("sam:x:1000:1000:Sam Doe,,,:/home/sam:/bin/bash\n"),
            "Sam Doe"
        );
        assert_eq!(gecos_name("sam:x:1000:1000::/home/sam:/bin/bash"), "");
        assert_eq!(gecos_name(""), "");
    }

    #[test]
    fn file_uri_encodes_spaces_and_non_ascii() {
        assert_eq!(
            file_uri(Path::new("/home/a b/ש.docx")),
            "file:///home/a%20b/%D7%A9.docx"
        );
    }

    #[test]
    fn reveal_needs_an_existing_full_path() {
        assert!(existing_file_path("relative.docx").is_err());
        assert_eq!(
            existing_file_path("/no/such/folder/file.docx").unwrap_err(),
            "The file could not be found."
        );
        let here = std::env::current_exe().unwrap();
        assert!(existing_file_path(here.to_str().unwrap()).is_ok());
    }

    #[test]
    fn percent_decode_round_trips_non_ascii_paths() {
        assert_eq!(
            percent_decode("%2Fhome%2F%D7%A9%D7%A0%D7%99%2Fa%20b.docx").unwrap(),
            "/home/שני/a b.docx"
        );
        assert!(percent_decode("%zz").is_err());
        assert!(percent_decode("%").is_err());
    }

    #[test]
    fn typst_project_root_allows_absolute_temp_media() {
        let root = typst_project_root();
        #[cfg(windows)]
        {
            assert!(root.ends_with('\\') || root.ends_with('/'), "{root}");
        }
        #[cfg(not(windows))]
        {
            assert_eq!(root, "/");
        }
    }
}
