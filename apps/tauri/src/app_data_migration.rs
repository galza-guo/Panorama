use std::fs;
use std::io;
use std::path::Path;

const LEGACY_APP_DIR_NAMES: &[&str] = &["com.teymz.wealthfolio", "com.wealthfolio.app"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppDataMigrationStatus {
    NotNeeded,
    LegacyDataNotFound,
    Migrated,
}

pub fn migrate_from_known_legacy_app_data_dirs(
    current_app_data_dir: impl AsRef<Path>,
) -> io::Result<AppDataMigrationStatus> {
    let current_app_data_dir = current_app_data_dir.as_ref();
    if current_app_data_dir.join("app.db").exists() {
        return Ok(AppDataMigrationStatus::NotNeeded);
    }

    let Some(parent) = current_app_data_dir.parent() else {
        return Ok(AppDataMigrationStatus::LegacyDataNotFound);
    };

    for legacy_dir_name in LEGACY_APP_DIR_NAMES {
        let legacy_dir = parent.join(legacy_dir_name);
        if legacy_dir.join("app.db").exists() {
            migrate_legacy_app_data_dir(&legacy_dir, current_app_data_dir)?;
            return Ok(AppDataMigrationStatus::Migrated);
        }
    }

    Ok(AppDataMigrationStatus::LegacyDataNotFound)
}

pub fn migrate_legacy_app_data_dir(
    legacy_app_data_dir: impl AsRef<Path>,
    current_app_data_dir: impl AsRef<Path>,
) -> io::Result<()> {
    let legacy_app_data_dir = legacy_app_data_dir.as_ref();
    let current_app_data_dir = current_app_data_dir.as_ref();

    if current_app_data_dir.join("app.db").exists() || !legacy_app_data_dir.join("app.db").exists()
    {
        return Ok(());
    }

    fs::create_dir_all(current_app_data_dir)?;
    copy_dir_contents_non_destructive(legacy_app_data_dir, current_app_data_dir)
}

fn copy_dir_contents_non_destructive(source_dir: &Path, target_dir: &Path) -> io::Result<()> {
    for entry in fs::read_dir(source_dir)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());
        copy_path_non_destructive(&source_path, &target_path)?;
    }

    Ok(())
}

fn copy_path_non_destructive(source_path: &Path, target_path: &Path) -> io::Result<()> {
    if target_path.exists() {
        return Ok(());
    }

    let metadata = fs::metadata(source_path)?;
    if metadata.is_dir() {
        fs::create_dir_all(target_path)?;
        copy_dir_contents_non_destructive(source_path, target_path)?;
        return Ok(());
    }

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source_path, target_path)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        migrate_from_known_legacy_app_data_dirs, migrate_legacy_app_data_dir,
        AppDataMigrationStatus,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn migrates_legacy_database_and_sqlite_sidecars_before_database_init() {
        let temp = tempdir().unwrap();
        let legacy_dir = temp.path().join("com.teymz.wealthfolio");
        let current_dir = temp.path().join("com.gallantguo.panorama");
        fs::create_dir_all(&legacy_dir).unwrap();

        fs::write(legacy_dir.join("app.db"), b"legacy db").unwrap();
        fs::write(legacy_dir.join("app.db-wal"), b"legacy wal").unwrap();
        fs::write(legacy_dir.join("app.db-shm"), b"legacy shm").unwrap();
        fs::create_dir_all(legacy_dir.join("addons/example-addon")).unwrap();
        fs::write(legacy_dir.join("addons/example-addon/manifest.json"), b"{}").unwrap();

        migrate_legacy_app_data_dir(&legacy_dir, &current_dir).unwrap();

        assert_eq!(fs::read(current_dir.join("app.db")).unwrap(), b"legacy db");
        assert_eq!(
            fs::read(current_dir.join("app.db-wal")).unwrap(),
            b"legacy wal"
        );
        assert_eq!(
            fs::read(current_dir.join("app.db-shm")).unwrap(),
            b"legacy shm"
        );
        assert_eq!(
            fs::read(current_dir.join("addons/example-addon/manifest.json")).unwrap(),
            b"{}"
        );
    }

    #[test]
    fn does_not_overwrite_an_existing_current_database() {
        let temp = tempdir().unwrap();
        let legacy_dir = temp.path().join("com.teymz.wealthfolio");
        let current_dir = temp.path().join("com.gallantguo.panorama");
        fs::create_dir_all(&legacy_dir).unwrap();
        fs::create_dir_all(&current_dir).unwrap();

        fs::write(legacy_dir.join("app.db"), b"legacy db").unwrap();
        fs::write(current_dir.join("app.db"), b"current db").unwrap();

        migrate_legacy_app_data_dir(&legacy_dir, &current_dir).unwrap();

        assert_eq!(fs::read(current_dir.join("app.db")).unwrap(), b"current db");
    }

    #[test]
    fn known_legacy_migration_uses_the_current_app_data_parent_directory() {
        let temp = tempdir().unwrap();
        let legacy_dir = temp.path().join("com.teymz.wealthfolio");
        let current_dir = temp.path().join("com.gallantguo.panorama");
        fs::create_dir_all(&legacy_dir).unwrap();
        fs::write(legacy_dir.join("app.db"), b"legacy db").unwrap();

        let status = migrate_from_known_legacy_app_data_dirs(&current_dir).unwrap();

        assert_eq!(status, AppDataMigrationStatus::Migrated);
        assert_eq!(fs::read(current_dir.join("app.db")).unwrap(), b"legacy db");
    }
}
