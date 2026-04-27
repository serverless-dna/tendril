//! Workspace path security and initialization.
//!
//! The workspace is the user-chosen directory where the capability registry
//! and tool implementations live. All file operations are scoped to this
//! directory to prevent path traversal.

use std::path::Path;

use crate::config;

/// Expand `~` to the user's home directory.
pub fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            return path.replacen('~', &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

/// Dangerous paths that must never be used as workspace roots.
pub fn is_dangerous_path(path: &Path) -> bool {
    let s = path.to_string_lossy();

    // Unix system directories
    let unix_dangerous = [
        "/", "/etc", "/usr", "/var", "/System", "/bin", "/sbin", "/lib", "/tmp",
    ];
    if unix_dangerous.iter().any(|d| s == *d) {
        return true;
    }

    // Windows system directories (case-insensitive, accept both separators)
    if cfg!(target_os = "windows") {
        let lower = s.to_lowercase();
        let win_dangerous = [
            "c:\\windows",
            "c:/windows",
            "c:\\program files",
            "c:/program files",
            "c:\\program files (x86)",
            "c:/program files (x86)",
        ];
        if win_dangerous.iter().any(|d| lower == *d) {
            return true;
        }
        // Block any drive root (e.g. "C:\", "D:", "E:/")
        let bytes = lower.as_bytes();
        if bytes.len() >= 2
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes.len() == 2 || (bytes.len() == 3 && (bytes[2] == b'\\' || bytes[2] == b'/')))
        {
            return true;
        }
    }

    false
}

/// Validate that a resolved path is within the workspace directory.
/// Prevents path traversal attacks on file read/write commands.
pub async fn validate_within_workspace(target: &Path) -> Result<(), String> {
    let workspace = config::configured_workspace()
        .await
        .ok_or("Workspace not configured")?;
    let workspace_canonical = tokio::fs::canonicalize(Path::new(&expand_tilde(&workspace)))
        .await
        .map_err(|e| format!("Failed to resolve workspace path: {e}"))?;
    let target_canonical = tokio::fs::canonicalize(target)
        .await
        .map_err(|e| format!("Failed to resolve target path: {e}"))?;
    if !target_canonical.starts_with(&workspace_canonical) {
        return Err("Access denied: path is outside workspace".to_string());
    }
    Ok(())
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

/// Initialize workspace directory structure + save to app config.
#[tauri::command]
pub async fn init_workspace(path: String) -> Result<(), String> {
    let expanded = expand_tilde(&path);
    let workspace = Path::new(&expanded);

    // Reject dangerous paths and path traversal
    if is_dangerous_path(workspace) {
        return Err(format!(
            "Refused to initialize workspace at dangerous path: {expanded}"
        ));
    }
    if expanded.contains("..") {
        return Err("Workspace path must not contain '..' traversal".to_string());
    }

    // Create workspace structure
    tokio::fs::create_dir_all(workspace.join("tools"))
        .await
        .map_err(|e| e.to_string())?;

    // Write empty registry inside tools/
    let tools_index = workspace.join("tools").join("index.json");
    if !tokio::fs::try_exists(&tools_index).await.unwrap_or(false) {
        let index_json = serde_json::to_string_pretty(&serde_json::json!({
            "version": "1.0.0",
            "capabilities": []
        }))
        .map_err(|e| format!("Failed to serialize index: {e}"))?;

        tokio::fs::write(&tools_index, index_json)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Read existing app config or create default, then set workspace path
    let mut app_config = config::read_app_config_inner()
        .await
        .unwrap_or_else(|_| config::default_app_config());
    app_config["workspace"] = serde_json::json!(expanded);

    config::write_app_config_inner(&app_config).await?;

    Ok(())
}
