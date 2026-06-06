use wealthfolio_server::config::Config;

static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn cleanup_env() {
    for key in ["PANORAMA_DB_PATH", "WF_DB_PATH", "WF_SECRET_KEY"] {
        std::env::remove_var(key);
    }
}

#[test]
fn panorama_db_path_takes_priority_over_legacy_wf_db_path() {
    let _env_guard = ENV_LOCK.lock().expect("env lock poisoned");
    cleanup_env();
    std::env::set_var("PANORAMA_DB_PATH", "/tmp/panorama.db");
    std::env::set_var("WF_DB_PATH", "/tmp/wealthfolio.db");
    std::env::set_var("WF_SECRET_KEY", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    let config = Config::from_env();

    assert_eq!(config.db_path, "/tmp/panorama.db");
    cleanup_env();
}

#[test]
fn legacy_wf_db_path_still_works_as_fallback() {
    let _env_guard = ENV_LOCK.lock().expect("env lock poisoned");
    cleanup_env();
    std::env::set_var("WF_DB_PATH", "/tmp/wealthfolio.db");
    std::env::set_var("WF_SECRET_KEY", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    let config = Config::from_env();

    assert_eq!(config.db_path, "/tmp/wealthfolio.db");
    cleanup_env();
}
