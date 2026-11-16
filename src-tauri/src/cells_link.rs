//! Edit in Cells: an Excel worksheet in the document (Insert > Table > Excel Spreadsheet) opened in Cells, the
//! companion spreadsheet app, as Word opens one in Excel. The link is Cells' own (its `docs/app-links.md` and
//! `docs/linked-ranges.md`): Inkspire writes the workbook to its edit folder, `<cache dir>/inkspire/edit/`, opens
//! `cells://edit?file=…&for=<document name>`, and reads the file back whenever Cells saves it there.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::Manager;

/// The most an edit copy may hold (Cells writes small workbooks for a sheet in a document).
const EDIT_COPY_LIMIT: u64 = 64 * 1024 * 1024;

/// In a Flatpak the cache folder is the sandbox's own; Cells looks in the user's real one (`~/.cache`).
fn outside_flatpak(folder: PathBuf) -> PathBuf {
    match std::env::var_os("HOME").map(PathBuf::from) {
        Some(home) if std::env::var_os("FLATPAK_ID").is_some() && home.is_absolute() => {
            home.join(".cache")
        }
        _ => folder,
    }
}

fn edit_folder(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cache = app
        .path()
        .cache_dir()
        .map_err(|_| "The cache folder could not be found.".to_string())?;
    Ok(outside_flatpak(cache).join("inkspire").join("edit"))
}

/// A file name from the document's, safe on every system, with the `.xlsx` Cells asks for.
fn copy_name(document: &str, stamp: u128) -> String {
    let stem: String = document
        .trim_end_matches(".docx")
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() || matches!(ch, '-' | '_' | ' ') {
                ch
            } else {
                '_'
            }
        })
        .take(60)
        .collect();
    let stem = stem.trim();
    format!(
        "{} - Worksheet {stamp}.xlsx",
        if stem.is_empty() { "Document" } else { stem }
    )
}

/// The path, if it is an `.xlsx` inside the edit folder (and nothing outside it is ever read).
fn edit_copy(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let refused = || "This is not a worksheet Inkspire sent to Cells.".to_string();
    let folder = edit_folder(app)?.canonicalize().map_err(|_| refused())?;
    let file = Path::new(path).canonicalize().map_err(|_| refused())?;
    let xlsx = file
        .extension()
        .map(|ext| ext.eq_ignore_ascii_case("xlsx"))
        .unwrap_or(false);
    if file.starts_with(&folder) && xlsx && file.is_file() {
        Ok(file)
    } else {
        Err(refused())
    }
}

/// Whether the system has an app for `cells://` links. Linux asks xdg-mime; elsewhere the opener says.
fn cells_registered() -> bool {
    #[cfg(target_os = "linux")]
    {
        return std::process::Command::new("xdg-mime")
            .args(["query", "default", "x-scheme-handler/cells"])
            .output()
            .map(|out| {
                out.status.success() && !String::from_utf8_lossy(&out.stdout).trim().is_empty()
            })
            .unwrap_or(true);
    }
    #[allow(unreachable_code)]
    true
}

pub(crate) fn edit_link(path: &Path, document: &str) -> Result<String, String> {
    tauri::Url::parse_with_params(
        "cells://edit",
        &[("file", path.to_string_lossy().as_ref()), ("for", document)],
    )
    .map(|url| url.to_string())
    .map_err(|err| format!("The link to Cells could not be made: {err}"))
}

/// Writes the worksheet to the edit folder and opens it in Cells. Returns the copy's path, which Inkspire watches.
#[tauri::command]
pub fn edit_in_cells(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    document: String,
) -> Result<String, String> {
    if !cells_registered() {
        return Err("Cells is not installed. Install Cells to edit the worksheet there, or edit it in the document.".into());
    }
    let folder = edit_folder(&app)?;
    std::fs::create_dir_all(&folder)
        .map_err(|err| format!("The edit folder could not be made: {err}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_millis())
        .unwrap_or(0);
    let path = folder.join(copy_name(&document, stamp));
    std::fs::write(&path, &bytes)
        .map_err(|err| format!("The worksheet could not be written: {err}"))?;
    let link = edit_link(
        &path,
        if document.trim().is_empty() {
            "Inkspire"
        } else {
            document.trim()
        },
    )?;
    tauri_plugin_opener::open_url(link, None::<&str>)
        .map_err(|err| format!("Cells could not be opened: {err}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// When the edit copy was last written, in milliseconds (0 when it is gone).
#[tauri::command]
pub fn edit_copy_modified(app: tauri::AppHandle, path: String) -> Result<u64, String> {
    let Ok(file) = edit_copy(&app, &path) else {
        return Ok(0);
    };
    let modified = std::fs::metadata(&file)
        .and_then(|meta| meta.modified())
        .map_err(|err| format!("The worksheet could not be read: {err}"))?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_millis() as u64)
        .unwrap_or(0))
}

/// The edit copy's bytes, as Cells last saved them.
#[tauri::command]
pub fn read_edit_copy(app: tauri::AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let file = edit_copy(&app, &path)?;
    if std::fs::metadata(&file).map(|meta| meta.len()).unwrap_or(0) > EDIT_COPY_LIMIT {
        return Err("The worksheet is too large.".into());
    }
    let bytes =
        std::fs::read(&file).map_err(|err| format!("The worksheet could not be read: {err}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_copy_after_the_document() {
        assert_eq!(
            copy_name("Q1 Report.docx", 7),
            "Q1 Report - Worksheet 7.xlsx"
        );
        assert_eq!(copy_name("a/b:c.docx", 1), "a_b_c - Worksheet 1.xlsx");
        assert_eq!(copy_name("", 2), "Document - Worksheet 2.xlsx");
    }

    #[test]
    fn writes_cells_edit_link() {
        let link = edit_link(
            Path::new("/home/alex/.cache/inkspire/edit/R - Worksheet 1.xlsx"),
            "R.docx",
        )
        .unwrap();
        assert!(link.starts_with(
            "cells://edit?file=%2Fhome%2Falex%2F.cache%2Finkspire%2Fedit%2FR+-+Worksheet+1.xlsx"
        ));
        assert!(link.ends_with("&for=R.docx"));
    }
}
