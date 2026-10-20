//! Pandoc and Typst, the two helper programs behind ODT and RTF import and export and PDF export. They are not
//! shipped with the app: the person chooses to download them (the first-run setup, or when a feature needs one),
//! each is checked against a pinned SHA-256, and a copy already on the PATH is used when there is one.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::local_ai::{download_client, download_file};

#[derive(Clone, Copy, PartialEq)]
enum Archive {
    TarGz,
    TarXz,
    Zip,
}

pub struct ToolAsset {
    pub url: &'static str,
    pub size: u64,
    pub sha256: &'static str,
    archive: Archive,
}

pub struct Tool {
    pub id: &'static str,
    pub label: &'static str,
    pub purpose: &'static str,
    pub version: &'static str,
    /// The program's file name without `.exe`.
    pub exe: &'static str,
}

pub const PANDOC: Tool = Tool {
    id: "pandoc",
    label: "Pandoc",
    purpose: "Opening and saving ODT and RTF files, and exporting PDF",
    version: "3.12.1",
    exe: "pandoc",
};

pub const TYPST: Tool = Tool {
    id: "typst",
    label: "Typst",
    purpose: "Exporting PDF",
    version: "0.15.1",
    exe: "typst",
};

pub const TOOLS: [&Tool; 2] = [&PANDOC, &TYPST];

pub fn tool_by_id(id: &str) -> Option<&'static Tool> {
    TOOLS.iter().copied().find(|tool| tool.id == id)
}

/// The release file for this computer, from the projects' own GitHub releases.
pub fn asset_for(tool: &Tool, os: &str, arch: &str) -> Option<ToolAsset> {
    let asset = |url, size, sha256, archive| {
        Some(ToolAsset {
            url,
            size,
            sha256,
            archive,
        })
    };
    match (tool.id, os, arch) {
        ("pandoc", "linux", "x86_64") => asset(
            "https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-linux-amd64.tar.gz",
            35_363_545,
            "d0c90410e90204c9ca83b8539fac5c7aed01fd537207e4585849f8abc5df20b8",
            Archive::TarGz,
        ),
        ("pandoc", "linux", "aarch64") => asset(
            "https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-linux-arm64.tar.gz",
            37_892_300,
            "445d96fd08801fe636cab1158b4f017ee320ac3b7446328b4fe2f902117b19b9",
            Archive::TarGz,
        ),
        ("pandoc", "macos", "x86_64") => asset(
            "https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-x86_64-macOS.zip",
            26_487_481,
            "81ed3e2cfecf096df15d407152f89a684fd65221082b919963f738e977fad3bc",
            Archive::Zip,
        ),
        ("pandoc", "macos", "aarch64") => asset(
            "https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-arm64-macOS.zip",
            42_313_957,
            "c2146cf33a583f3ac93eccddf1bb662371d5cfcce1aad1c87ad860cca1435d46",
            Archive::Zip,
        ),
        ("pandoc", "windows", "x86_64") => asset(
            "https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-windows-x86_64.zip",
            42_154_914,
            "6ef431cb20b2c24a0371fc19200dc49d452be54b1b5c9239f3462841ef53e587",
            Archive::Zip,
        ),
        ("typst", "linux", "x86_64") => asset(
            "https://github.com/typst/typst/releases/download/v0.15.1/typst-x86_64-unknown-linux-musl.tar.xz",
            17_462_992,
            "a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c",
            Archive::TarXz,
        ),
        ("typst", "linux", "aarch64") => asset(
            "https://github.com/typst/typst/releases/download/v0.15.1/typst-aarch64-unknown-linux-musl.tar.xz",
            16_216_812,
            "5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee",
            Archive::TarXz,
        ),
        ("typst", "macos", "x86_64") => asset(
            "https://github.com/typst/typst/releases/download/v0.15.1/typst-x86_64-apple-darwin.tar.xz",
            15_635_600,
            "7f9fdd9584866245de9a79e0add8f9236fae6f40a8a45e2c4771ccc14db4e0fa",
            Archive::TarXz,
        ),
        ("typst", "macos", "aarch64") => asset(
            "https://github.com/typst/typst/releases/download/v0.15.1/typst-aarch64-apple-darwin.tar.xz",
            14_438_168,
            "48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a",
            Archive::TarXz,
        ),
        ("typst", "windows", "x86_64") => asset(
            "https://github.com/typst/typst/releases/download/v0.15.1/typst-x86_64-pc-windows-msvc.zip",
            22_463_684,
            "19ce3551153c2fe7ee9fa2f95208310c8f4d3209fedb699e0333faf8913f6736",
            Archive::Zip,
        ),
        _ => None,
    }
}

fn this_computer() -> (&'static str, &'static str) {
    (std::env::consts::OS, std::env::consts::ARCH)
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Could not open the app's data folder.".to_string())?
        .join("tools");
    std::fs::create_dir_all(&dir)
        .map_err(|_| "Could not create the app's data folder.".to_string())?;
    Ok(dir)
}

fn tool_dir(root: &Path, tool: &Tool) -> PathBuf {
    root.join(format!("{}-{}", tool.id, tool.version))
}

fn exe_name(tool: &Tool) -> String {
    if cfg!(windows) {
        format!("{}.exe", tool.exe)
    } else {
        tool.exe.to_string()
    }
}

/// The program inside an unpacked download: the file called `pandoc` or `typst`, however deep the release put it.
pub fn find_program(dir: &Path, tool: &Tool) -> Option<PathBuf> {
    let wanted = exe_name(tool);
    let mut pending = vec![dir.to_path_buf()];
    while let Some(folder) = pending.pop() {
        for entry in std::fs::read_dir(&folder).ok()?.flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path.file_name().and_then(|name| name.to_str()) == Some(wanted.as_str()) {
                return Some(path);
            }
        }
    }
    None
}

fn on_path(tool: &Tool) -> Option<PathBuf> {
    let wanted = exe_name(tool);
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|dir| dir.join(&wanted))
        .find(|candidate| candidate.is_file())
}

/// The program to run: the downloaded copy, else one on the PATH, else nothing.
pub fn resolve(app: &tauri::AppHandle, tool: &Tool) -> Option<PathBuf> {
    let managed = root(app)
        .ok()
        .and_then(|root| find_program(&tool_dir(&root, tool), tool));
    managed.or_else(|| on_path(tool))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    id: &'static str,
    label: &'static str,
    purpose: &'static str,
    version: &'static str,
    /// The download's size in bytes; 0 when there is no download for this computer.
    size: u64,
    supported: bool,
    /// "downloaded", "system" (one on the PATH) or "missing".
    source: &'static str,
}

#[tauri::command]
pub async fn tools_status(app: tauri::AppHandle) -> Result<Vec<ToolStatus>, String> {
    let (os, arch) = this_computer();
    let managed_root = root(&app)?;
    Ok(TOOLS
        .iter()
        .map(|tool| {
            let asset = asset_for(tool, os, arch);
            let source = if find_program(&tool_dir(&managed_root, tool), tool).is_some() {
                "downloaded"
            } else if on_path(tool).is_some() {
                "system"
            } else {
                "missing"
            };
            ToolStatus {
                id: tool.id,
                label: tool.label,
                purpose: tool.purpose,
                version: tool.version,
                size: asset.as_ref().map(|asset| asset.size).unwrap_or(0),
                supported: asset.is_some(),
                source,
            }
        })
        .collect())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolProgress {
    id: String,
    received: u64,
    total: u64,
}

static INSTALLING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn tools_install(app: tauri::AppHandle, ids: Vec<String>) -> Result<(), String> {
    let (os, arch) = this_computer();
    let mut wanted = Vec::new();
    for id in &ids {
        let tool = tool_by_id(id).ok_or_else(|| "That tool is not known.".to_string())?;
        let asset = asset_for(tool, os, arch)
            .ok_or_else(|| format!("{} has no download for this computer.", tool.label))?;
        wanted.push((tool, asset));
    }
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err("A download is already running.".into());
    }
    CANCEL.store(false, Ordering::SeqCst);
    let mut result = Ok(());
    for (tool, asset) in wanted {
        result = install_one(&app, tool, &asset).await;
        if result.is_err() {
            break;
        }
    }
    INSTALLING.store(false, Ordering::SeqCst);
    result
}

async fn install_one(
    app: &tauri::AppHandle,
    tool: &'static Tool,
    asset: &ToolAsset,
) -> Result<(), String> {
    let root = root(app)?;
    let dir = tool_dir(&root, tool);
    if find_program(&dir, tool).is_some() {
        return Ok(());
    }
    let client = download_client();
    let file_name = asset.url.rsplit('/').next().unwrap_or("download");
    let archive = root.join("downloads").join(file_name);
    let id = tool.id.to_string();
    let handle = app.clone();
    let mut report = move |received: u64, total: u64| {
        let _ = handle.emit(
            "tools-progress",
            ToolProgress {
                id: id.clone(),
                received,
                total,
            },
        );
    };
    download_file(
        client,
        asset.url,
        &archive,
        asset.sha256,
        asset.size,
        &CANCEL,
        &mut report,
    )
    .await?;
    let kind = asset.archive;
    let unpack_into = dir.clone();
    let source = archive.clone();
    tokio::task::spawn_blocking(move || unpack(&source, &unpack_into, kind))
        .await
        .map_err(|_| format!("Could not unpack {}.", tool.label))??;
    let _ = std::fs::remove_file(&archive);
    let program = find_program(&dir, tool)
        .ok_or_else(|| format!("The {} download did not contain the program.", tool.label))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755));
    }
    let _ = program;
    Ok(())
}

fn unpack(archive: &Path, dest: &Path, kind: Archive) -> Result<(), String> {
    let staging = dest.with_extension("tmp");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|_| "Could not unpack the download.".to_string())?;
    let failed = |_: &dyn std::fmt::Debug| "Could not unpack the download.".to_string();
    match kind {
        Archive::TarGz => {
            let file = std::fs::File::open(archive).map_err(|e| failed(&e))?;
            let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(file));
            tar.set_preserve_permissions(true);
            tar.unpack(&staging).map_err(|e| failed(&e))?;
        }
        Archive::TarXz => {
            let file = std::fs::File::open(archive).map_err(|e| failed(&e))?;
            let mut reader = std::io::BufReader::new(file);
            let mut plain = Vec::new();
            lzma_rs::xz_decompress(&mut reader, &mut plain).map_err(|e| failed(&e))?;
            let mut tar = tar::Archive::new(std::io::Cursor::new(plain));
            tar.set_preserve_permissions(true);
            tar.unpack(&staging).map_err(|e| failed(&e))?;
        }
        Archive::Zip => {
            let file = std::fs::File::open(archive).map_err(|e| failed(&e))?;
            zip::ZipArchive::new(file)
                .map_err(|e| failed(&e))?
                .extract(&staging)
                .map_err(|e| failed(&e))?;
        }
    }
    let _ = std::fs::remove_dir_all(dest);
    std::fs::rename(&staging, dest).map_err(|_| "Could not install the download.".to_string())
}

#[tauri::command]
pub fn tools_cancel_install() {
    CANCEL.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn tools_remove(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let tool = tool_by_id(&id).ok_or_else(|| "That tool is not known.".to_string())?;
    let dir = tool_dir(&root(&app)?, tool);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|_| format!("Could not remove {}.", tool.label))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_supported_computer_has_a_pinned_download_for_each_tool() {
        for (os, arch) in [
            ("linux", "x86_64"),
            ("linux", "aarch64"),
            ("macos", "x86_64"),
            ("macos", "aarch64"),
            ("windows", "x86_64"),
        ] {
            for tool in TOOLS {
                let asset = asset_for(tool, os, arch)
                    .unwrap_or_else(|| panic!("{} on {os} {arch}", tool.id));
                assert!(
                    asset.url.starts_with("https://github.com/"),
                    "{}",
                    asset.url
                );
                assert_eq!(asset.sha256.len(), 64);
                assert!(asset.size > 1_000_000);
            }
        }
        assert!(asset_for(&PANDOC, "freebsd", "x86_64").is_none());
    }

    #[test]
    fn finds_the_program_however_deep_the_release_put_it() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("pandoc-3.12.1").join("bin");
        std::fs::create_dir_all(&nested).unwrap();
        assert!(find_program(dir.path(), &PANDOC).is_none());
        let program = nested.join(exe_name(&PANDOC));
        std::fs::write(&program, b"x").unwrap();
        assert_eq!(find_program(dir.path(), &PANDOC), Some(program));
        assert!(find_program(dir.path(), &TYPST).is_none());
    }

    #[test]
    fn unpacks_a_tar_gz_and_a_tar_xz_and_a_zip() {
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        // tar.gz
        let gz = dir.path().join("a.tar.gz");
        {
            let encoder = flate2::write::GzEncoder::new(
                std::fs::File::create(&gz).unwrap(),
                flate2::Compression::fast(),
            );
            let mut builder = tar::Builder::new(encoder);
            let data = b"hello";
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, "pkg/bin/typst", &data[..])
                .unwrap();
            builder.into_inner().unwrap().finish().unwrap();
        }
        unpack(&gz, &dir.path().join("out-gz"), Archive::TarGz).unwrap();
        assert!(find_program(&dir.path().join("out-gz"), &TYPST).is_some());
        // zip
        let zip_path = dir.path().join("a.zip");
        {
            let mut writer = zip::ZipWriter::new(std::fs::File::create(&zip_path).unwrap());
            writer
                .start_file(exe_name(&PANDOC), zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"hello").unwrap();
            writer.finish().unwrap();
        }
        unpack(&zip_path, &dir.path().join("out-zip"), Archive::Zip).unwrap();
        assert!(find_program(&dir.path().join("out-zip"), &PANDOC).is_some());
    }
}
