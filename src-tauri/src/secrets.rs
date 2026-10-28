//! Where API keys are kept: the operating system's keyring (Secret Service on Linux, Keychain on macOS, Credential
//! Manager on Windows). Where there is no keyring to talk to (a bare session with no Secret Service), keys fall back
//! to a file only the owner can read, and the settings say so. A key saved in the file by an earlier version moves
//! into the keyring the first time it can.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

const SERVICE: &str = "com.aiword.app.ai";

/// The providers that take a key. `compatible` is the custom OpenAI-compatible endpoint.
pub const FIELDS: [&str; 3] = ["openai", "anthropic", "compatible"];

#[derive(Default, Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct StoredKeys {
    #[serde(default)]
    pub openai: String,
    #[serde(default)]
    pub anthropic: String,
    #[serde(default)]
    pub compatible: String,
}

impl StoredKeys {
    fn get(&self, field: &str) -> &str {
        match field {
            "openai" => &self.openai,
            "anthropic" => &self.anthropic,
            "compatible" => &self.compatible,
            _ => "",
        }
    }

    fn set(&mut self, field: &str, value: &str) {
        match field {
            "openai" => self.openai = value.to_string(),
            "anthropic" => self.anthropic = value.to_string(),
            "compatible" => self.compatible = value.to_string(),
            _ => {}
        }
    }

    fn is_empty(&self) -> bool {
        FIELDS.iter().all(|field| self.get(field).trim().is_empty())
    }
}

/// Where a key was found.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Storage {
    Keyring,
    File,
    #[default]
    None,
}

/// A place secrets are kept; the real one is the keyring, tests use a map.
pub trait Vault {
    fn read(&self, field: &str) -> Result<Option<String>, String>;
    fn write(&self, field: &str, value: &str) -> Result<(), String>;
}

pub struct Keyring;

/// Android has no keyring the `keyring` crate can reach (without a backend it would keep keys in memory only), so keys
/// go to the owner-only file, which sits in the app's private storage there.
#[cfg(target_os = "android")]
impl Vault for Keyring {
    fn read(&self, _field: &str) -> Result<Option<String>, String> {
        Err("No keyring on Android.".into())
    }

    fn write(&self, _field: &str, _value: &str) -> Result<(), String> {
        Err("No keyring on Android.".into())
    }
}

#[cfg(not(target_os = "android"))]
impl Vault for Keyring {
    fn read(&self, field: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE, field).map_err(|err| err.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    fn write(&self, field: &str, value: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE, field).map_err(|err| err.to_string())?;
        if value.is_empty() {
            return match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(err) => Err(err.to_string()),
            };
        }
        entry.set_password(value).map_err(|err| err.to_string())
    }
}

fn file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| "Could not open the settings folder.".to_string())?;
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Could not create the settings folder.".to_string())?;
    restrict_dir(&directory);
    Ok(directory.join("ai-keys.json"))
}

pub fn read_file(path: &Path) -> StoredKeys {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn write_file(path: &Path, keys: &StoredKeys) -> Result<(), String> {
    let text = serde_json::to_string(keys).map_err(|_| "Could not store the key.".to_string())?;
    write_owner_only(path, text.as_bytes())
}

pub fn write_owner_only(path: &Path, bytes: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|_| "Could not store the key.".to_string())?;
        file.write_all(bytes)
            .map_err(|_| "Could not store the key.".to_string())?;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
        Ok(())
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, bytes).map_err(|_| "Could not store the key.".to_string())
    }
}

fn restrict_dir(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700));
    }
    let _ = path;
}

/// Moves keys an earlier version kept in the file into the vault, and removes the file once it holds none.
/// A key already in the vault wins. Returns whether the file is gone.
pub fn migrate(vault: &dyn Vault, file: &Path) -> bool {
    if !file.is_file() {
        return true;
    }
    let mut keys = read_file(file);
    let mut failed = false;
    for field in FIELDS {
        let value = keys.get(field).trim().to_string();
        if value.is_empty() {
            continue;
        }
        let present =
            matches!(vault.read(field), Ok(Some(existing)) if !existing.trim().is_empty());
        if present || vault.write(field, &value).is_ok() {
            keys.set(field, "");
        } else {
            failed = true;
        }
    }
    if failed && !keys.is_empty() {
        let _ = write_file(file, &keys);
        return false;
    }
    std::fs::remove_file(file).is_ok()
}

/// A saved key, from the vault or else the fallback file.
pub fn load_with(vault: &dyn Vault, file: &Path, field: &str) -> (String, Storage) {
    if let Ok(Some(value)) = vault.read(field) {
        if !value.trim().is_empty() {
            return (value.trim().to_string(), Storage::Keyring);
        }
    }
    let stored = read_file(file);
    let value = stored.get(field).trim();
    if value.is_empty() {
        (String::new(), Storage::None)
    } else {
        (value.to_string(), Storage::File)
    }
}

/// Saves a key (an empty one removes it): into the vault, or the owner-only file when the vault is not there.
pub fn save_with(
    vault: &dyn Vault,
    file: &Path,
    field: &str,
    value: &str,
) -> Result<Storage, String> {
    if vault.write(field, value).is_ok() {
        // A copy left in the file by an earlier version must not outlive the key.
        let mut keys = read_file(file);
        if !keys.get(field).is_empty() {
            keys.set(field, "");
            if keys.is_empty() {
                let _ = std::fs::remove_file(file);
            } else {
                let _ = write_file(file, &keys);
            }
        }
        return Ok(if value.is_empty() {
            Storage::None
        } else {
            Storage::Keyring
        });
    }
    let mut keys = read_file(file);
    keys.set(field, value);
    write_file(file, &keys)?;
    Ok(if value.is_empty() {
        Storage::None
    } else {
        Storage::File
    })
}

pub fn load(app: &tauri::AppHandle, field: &str) -> Result<(String, Storage), String> {
    let file = file_path(app)?;
    migrate(&Keyring, &file);
    Ok(load_with(&Keyring, &file, field))
}

pub fn save(app: &tauri::AppHandle, field: &str, value: &str) -> Result<Storage, String> {
    let file = file_path(app)?;
    save_with(&Keyring, &file, field, value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    #[derive(Default)]
    struct Memory {
        map: RefCell<HashMap<String, String>>,
        broken: bool,
    }

    impl Vault for Memory {
        fn read(&self, field: &str) -> Result<Option<String>, String> {
            if self.broken {
                return Err("no keyring".into());
            }
            Ok(self.map.borrow().get(field).cloned())
        }
        fn write(&self, field: &str, value: &str) -> Result<(), String> {
            if self.broken {
                return Err("no keyring".into());
            }
            if value.is_empty() {
                self.map.borrow_mut().remove(field);
            } else {
                self.map.borrow_mut().insert(field.into(), value.into());
            }
            Ok(())
        }
    }

    #[test]
    fn a_saved_key_goes_to_the_keyring_and_not_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("ai-keys.json");
        let vault = Memory::default();
        assert_eq!(
            save_with(&vault, &file, "openai", "sk-abc").unwrap(),
            Storage::Keyring
        );
        assert!(!file.exists());
        assert_eq!(
            load_with(&vault, &file, "openai"),
            ("sk-abc".into(), Storage::Keyring)
        );
        assert_eq!(load_with(&vault, &file, "anthropic").1, Storage::None);
    }

    #[test]
    fn without_a_keyring_the_owner_only_file_is_used_and_says_so() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("ai-keys.json");
        let vault = Memory {
            broken: true,
            ..Memory::default()
        };
        assert_eq!(
            save_with(&vault, &file, "anthropic", "k1").unwrap(),
            Storage::File
        );
        assert_eq!(
            load_with(&vault, &file, "anthropic"),
            ("k1".into(), Storage::File)
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&file).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn keys_from_the_old_file_move_into_the_keyring() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("ai-keys.json");
        std::fs::write(&file, r#"{"openai":"sk-old","anthropic":"a-old"}"#).unwrap();
        let vault = Memory::default();
        vault.write("anthropic", "a-new").unwrap();
        assert!(migrate(&vault, &file));
        assert!(!file.exists());
        assert_eq!(vault.read("openai").unwrap().as_deref(), Some("sk-old"));
        // A key already in the keyring is kept over the old one.
        assert_eq!(vault.read("anthropic").unwrap().as_deref(), Some("a-new"));
    }

    #[test]
    fn a_failed_move_keeps_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("ai-keys.json");
        std::fs::write(&file, r#"{"openai":"sk-old"}"#).unwrap();
        let vault = Memory {
            broken: true,
            ..Memory::default()
        };
        assert!(!migrate(&vault, &file));
        assert_eq!(read_file(&file).openai, "sk-old");
    }

    #[test]
    fn saving_to_the_keyring_removes_a_stale_copy_in_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("ai-keys.json");
        std::fs::write(&file, r#"{"openai":"stale"}"#).unwrap();
        let vault = Memory::default();
        save_with(&vault, &file, "openai", "fresh").unwrap();
        assert!(!file.exists());
        assert_eq!(load_with(&vault, &file, "openai").0, "fresh");
    }

    #[test]
    fn an_empty_key_removes_it() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("ai-keys.json");
        let vault = Memory::default();
        save_with(&vault, &file, "openai", "sk-x").unwrap();
        assert_eq!(
            save_with(&vault, &file, "openai", "").unwrap(),
            Storage::None
        );
        assert_eq!(load_with(&vault, &file, "openai").1, Storage::None);
    }
}
