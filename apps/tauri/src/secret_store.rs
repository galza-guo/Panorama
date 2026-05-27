use std::sync::{Arc, OnceLock};
#[cfg(debug_assertions)]
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};

#[cfg(not(debug_assertions))]
use keyring::Entry;
#[cfg(debug_assertions)]
use serde::{Deserialize, Serialize};

use wealthfolio_core::{
    errors::Error,
    secrets::{format_service_id, SecretStore},
    Result,
};

#[cfg(not(debug_assertions))]
const USERNAME: &str = "default";

#[cfg(not(debug_assertions))]
#[derive(Debug, Default)]
pub struct KeyringSecretStore;

#[cfg(not(debug_assertions))]
impl SecretStore for KeyringSecretStore {
    fn set_secret(&self, service: &str, secret: &str) -> Result<()> {
        let entry = entry_for(service)?;
        entry
            .set_password(secret)
            .map_err(|err| Error::Secret(err.to_string()))
    }

    fn get_secret(&self, service: &str) -> Result<Option<String>> {
        let entry = entry_for(service)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(Error::Secret(err.to_string())),
        }
    }

    fn delete_secret(&self, service: &str) -> Result<()> {
        let entry = entry_for(service)?;
        match entry.delete_password() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(Error::Secret(err.to_string())),
        }
    }
}

#[cfg(not(debug_assertions))]
fn entry_for(service: &str) -> Result<Entry> {
    let service_id = format_service_id(service);
    Entry::new(&service_id, USERNAME).map_err(|err| Error::Secret(err.to_string()))
}

#[cfg(debug_assertions)]
#[derive(Debug)]
pub struct DevFileSecretStore {
    path: PathBuf,
    lock: Mutex<()>,
}

#[cfg(debug_assertions)]
#[derive(Serialize, Deserialize, Default)]
struct DevSecrets {
    secrets: HashMap<String, String>,
}

#[cfg(debug_assertions)]
impl DevFileSecretStore {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    fn with_store<F>(&self, mut op: F) -> Result<()>
    where
        F: FnMut(&mut HashMap<String, String>) -> Result<()>,
    {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| Error::Secret("Secret store lock poisoned".into()))?;
        let mut store = self.load_store_locked()?;
        op(&mut store)?;
        self.persist_store_locked(&store)
    }

    fn read_store(&self) -> Result<HashMap<String, String>> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| Error::Secret("Secret store lock poisoned".into()))?;
        self.load_store_locked()
    }

    fn load_store_locked(&self) -> Result<HashMap<String, String>> {
        if !self.path.exists() {
            return Ok(HashMap::new());
        }

        let raw = fs::read(&self.path)?;
        if raw.is_empty() {
            return Ok(HashMap::new());
        }

        let store: DevSecrets = serde_json::from_slice(&raw)?;
        Ok(store.secrets)
    }

    fn persist_store_locked(&self, store: &HashMap<String, String>) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let json = serde_json::to_string_pretty(&DevSecrets {
            secrets: store.clone(),
        })?;
        fs::write(&self.path, json)?;
        Ok(())
    }
}

#[cfg(debug_assertions)]
impl SecretStore for DevFileSecretStore {
    fn set_secret(&self, service: &str, secret: &str) -> Result<()> {
        let key = format_service_id(service);
        self.with_store(|store| {
            store.insert(key.clone(), secret.to_string());
            Ok(())
        })
    }

    fn get_secret(&self, service: &str) -> Result<Option<String>> {
        let key = format_service_id(service);
        let store = self.read_store()?;
        Ok(store.get(&key).cloned())
    }

    fn delete_secret(&self, service: &str) -> Result<()> {
        let key = format_service_id(service);
        self.with_store(|store| {
            store.remove(&key);
            Ok(())
        })
    }
}

static SHARED_SECRET_STORE: OnceLock<Arc<dyn SecretStore>> = OnceLock::new();

pub fn shared_secret_store() -> Arc<dyn SecretStore> {
    SHARED_SECRET_STORE
        .get_or_init(default_secret_store)
        .clone()
}

#[cfg(debug_assertions)]
fn default_secret_store() -> Arc<dyn SecretStore> {
    let path = dev_secret_store_path();
    log::info!(
        "Using dev file secret store at {}. Release builds use the OS keychain.",
        path.display()
    );
    Arc::new(DevFileSecretStore::new(path))
}

#[cfg(not(debug_assertions))]
fn default_secret_store() -> Arc<dyn SecretStore> {
    Arc::new(KeyringSecretStore)
}

#[cfg(debug_assertions)]
fn dev_secret_store_path() -> PathBuf {
    if let Some(path) = std::env::var_os("PANORAMA_DEV_SECRETS_PATH") {
        return PathBuf::from(path);
    }

    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("Panorama")
            .join("dev-secrets.json");
    }

    PathBuf::from("panorama-dev-secrets.json")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn dev_file_secret_store_round_trips_with_formatted_service_ids() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("dev-secrets.json");
        let store = DevFileSecretStore::new(file.clone());

        store.set_secret("Alpha", "value").unwrap();

        assert_eq!(store.get_secret("alpha").unwrap().as_deref(), Some("value"));

        let raw = std::fs::read_to_string(&file).unwrap();
        assert!(raw.contains("wealthfolio_alpha"));
        assert!(!raw.contains("\"Alpha\""));

        store.delete_secret("ALPHA").unwrap();
        assert!(store.get_secret("alpha").unwrap().is_none());
    }
}
