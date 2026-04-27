//! File system commands — read, write, list, reveal.
//!
//! All operations are scoped to the workspace directory via
//! `validate_within_workspace`. No file outside the workspace
//! can be read, written, or revealed.

use std::path::Path;

use crate::workspace::{expand_tilde, validate_within_workspace};

#[derive(serde::Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[tauri::command]
pub async fn list_directory(dir_path: String) -> Result<Vec<FileEntry>, String> {
    let expanded = expand_tilde(&dir_path);
    let dir = Path::new(&expanded);

    validate_within_workspace(dir).await?;

    let mut entries: Vec<FileEntry> = Vec::new();
    let mut read_dir = tokio::fs::read_dir(dir).await.map_err(|e| e.to_string())?;

    while let Some(entry) = read_dir.next_entry().await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }

        entries.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    // Directories first, then files, alphabetically
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub async fn read_file_content(file_path: String) -> Result<String, String> {
    let expanded = expand_tilde(&file_path);
    let path = Path::new(&expanded);
    validate_within_workspace(path).await?;

    let metadata = tokio::fs::metadata(path).await.map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err(format!("Not a file: {expanded}"));
    }
    if metadata.len() > 1_048_576 {
        return Err("File too large (>1MB)".to_string());
    }
    tokio::fs::read_to_string(path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file_content(file_path: String, content: String) -> Result<(), String> {
    let expanded = expand_tilde(&file_path);
    let path = Path::new(&expanded);

    if let Some(parent) = path.parent() {
        if !tokio::fs::try_exists(parent).await.unwrap_or(false) {
            return Err(format!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }
    }

    // For existing files, validate the file itself; for new files, validate the parent
    if tokio::fs::try_exists(path).await.unwrap_or(false) {
        validate_within_workspace(path).await?;
    } else if let Some(parent) = path.parent() {
        validate_within_workspace(parent).await?;
    }

    tokio::fs::write(path, content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reveal_in_file_explorer(path: String) -> Result<(), String> {
    // HTTPS URLs: open in default browser
    if path.starts_with("https://") {
        return open_url(&path);
    }

    // Reject non-HTTPS URL schemes
    if path.starts_with("http://")
        || path.starts_with("file://")
        || path.starts_with("javascript:")
        || path.starts_with("data:")
    {
        return Err(format!("Unsupported URL scheme: {path}"));
    }

    // File path: validate within workspace, then reveal (don't execute)
    let expanded = expand_tilde(&path);
    let file_path = Path::new(&expanded);
    validate_within_workspace(file_path).await?;

    reveal_path(&expanded)
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn reveal_path(expanded: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("--reveal")
            .arg(expanded)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{expanded}"))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = Path::new(expanded)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| expanded.to_string());
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
