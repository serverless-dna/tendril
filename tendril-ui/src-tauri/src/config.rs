//! Application configuration — read, write, validate.
//!
//! Config lives at `~/.tendril/config.json`. The agent is the owner of
//! defaults and full schema validation (via Zod); Rust performs lightweight
//! validation on writes to catch obvious errors before they hit disk.

use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::workspace::is_dangerous_path;

/// App-level config lives at ~/.tendril/config.json
pub fn app_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".tendril")
        .join("config.json")
}

/// Default config using the nested provider format.
///
/// NOTE: This must match the agent's `WorkspaceConfigSchema` defaults in
/// `tendril-agent/src/config.ts`. The agent is the canonical owner of
/// defaults — this exists only for `init_workspace` to write a valid
/// starting config before the agent has ever run.
pub fn default_app_config() -> Value {
    serde_json::json!({
        "workspace": null,
        "model": {
            "provider": "bedrock",
            "bedrock": {
                "modelId": "us.anthropic.claude-sonnet-4-5-20250514",
                "region": "us-east-1"
            }
        },
        "sandbox": {
            "denoPath": "deno",
            "timeoutMs": 45_000,
            "allowedDomains": []
        },
        "registry": { "maxCapabilities": 500 },
        "agent": { "maxTurns": 100 }
    })
}

/// Get the configured workspace path, or None if not set.
pub async fn configured_workspace() -> Option<String> {
    read_app_config_inner().await.ok().and_then(|c| {
        c.get("workspace")
            .and_then(|w| w.as_str())
            .map(|s| s.to_string())
    })
}

pub async fn read_app_config_inner() -> Result<Value, String> {
    let path = app_config_path();
    let content = tokio::fs::read_to_string(&path).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Config not found".to_string()
        } else {
            e.to_string()
        }
    })?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub async fn write_app_config_inner(config: &Value) -> Result<(), String> {
    let path = app_config_path();
    let parent = path.parent().ok_or("Config path has no parent directory")?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|e| e.to_string())?;
    let config_str = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    tokio::fs::write(&path, config_str)
        .await
        .map_err(|e| e.to_string())?;
    eprintln!("[config] Saved to {}", path.display());
    Ok(())
}

// ── Validation ──────────────────────────────────────────────────────────────

/// Validate a JSON field is a non-empty string.
fn validate_non_empty_string(parent: &Value, field: &str, label: &str) -> Result<(), String> {
    match parent.get(field) {
        Some(v) => match v.as_str() {
            Some("") => Err(format!("Config validation: {label} must not be empty")),
            Some(_) => Ok(()),
            None => Err(format!("Config validation: {label} must be a string")),
        },
        None => Err(format!("Config validation: {label} is required")),
    }
}

fn validate_positive_int(parent: &Value, field: &str, label: &str) -> Result<(), String> {
    if let Some(v) = parent.get(field) {
        if let Some(n) = v.as_f64() {
            if n <= 0.0 || n != n.floor() {
                return Err(format!(
                    "Config validation: {label} must be a positive integer"
                ));
            }
        } else if !v.is_null() {
            return Err(format!("Config validation: {label} must be a number"));
        }
    }
    Ok(())
}

/// Validate known config field types before writing.
pub fn validate_config_payload(config: &Value) -> Result<(), String> {
    // Workspace path
    if let Some(workspace) = config.get("workspace").and_then(|w| w.as_str()) {
        if workspace.is_empty() {
            return Err("Config validation: workspace must not be empty".to_string());
        }
        if is_dangerous_path(Path::new(workspace)) {
            return Err(format!(
                "Config validation: workspace must not be a system directory: {workspace}"
            ));
        }
    }

    // Model provider + nested blocks
    if let Some(model) = config.get("model") {
        if let Some(provider) = model.get("provider").and_then(|p| p.as_str()) {
            let valid_providers = ["bedrock", "ollama", "openai", "anthropic"];
            if !valid_providers.contains(&provider) {
                return Err(format!(
                    "Config validation: model.provider must be one of: {}",
                    valid_providers.join(", ")
                ));
            }

            // Active provider's config block must exist
            if model.get(provider).is_none() || !model.get(provider).unwrap().is_object() {
                return Err(format!(
                    "Config validation: model.{provider} config block is required when provider is {provider}"
                ));
            }

            // Required fields per provider
            if let Some(block) = model.get(provider) {
                match provider {
                    "bedrock" => {
                        validate_non_empty_string(block, "modelId", "model.bedrock.modelId")?;
                        validate_non_empty_string(block, "region", "model.bedrock.region")?;
                    }
                    "ollama" => {
                        validate_non_empty_string(block, "host", "model.ollama.host")?;
                        validate_non_empty_string(block, "modelId", "model.ollama.modelId")?;
                    }
                    "openai" => {
                        validate_non_empty_string(block, "modelId", "model.openai.modelId")?;
                    }
                    "anthropic" => {
                        validate_non_empty_string(block, "modelId", "model.anthropic.modelId")?;
                    }
                    _ => {}
                }
            }
        }
    }

    // Sandbox
    if let Some(sandbox) = config.get("sandbox") {
        validate_positive_int(sandbox, "timeoutMs", "sandbox.timeoutMs")?;
    }

    // Registry
    if let Some(registry) = config.get("registry") {
        validate_positive_int(registry, "maxCapabilities", "registry.maxCapabilities")?;
    }

    // Agent
    if let Some(agent) = config.get("agent") {
        validate_positive_int(agent, "maxTurns", "agent.maxTurns")?;
    }

    Ok(())
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

/// Read app config from ~/.tendril/config.json
#[tauri::command]
pub async fn read_config() -> Result<Value, String> {
    read_app_config_inner().await
}

/// Write app config to ~/.tendril/config.json
#[tauri::command]
pub async fn write_config(config: Value) -> Result<(), String> {
    validate_config_payload(&config)?;
    write_app_config_inner(&config).await
}
