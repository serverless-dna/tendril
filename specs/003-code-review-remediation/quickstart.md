# Quickstart: Code Review Remediation

**Feature**: 003-code-review-remediation  
**Date**: 2026-04-15

## Prerequisites

- Rust toolchain (stable, for Tauri backend)
- Node.js ≥ 22.0.0 (for tendril-agent)
- Tauri CLI (`cargo install tauri-cli`)
- Working `~/.tendril/config.json` with a valid workspace path

## Build & Test

### Agent (TypeScript)

```bash
cd tendril-agent
npm install
npm test          # vitest — run all agent tests
npm run build     # esbuild → dist/main.cjs
```

### UI (Tauri + React)

```bash
cd tendril-ui
npm install
cargo test -p tendril-ui  # Rust backend tests
npm run dev               # Tauri dev mode (hot reload)
```

## Verification Checklist

After implementing all remediation tasks, verify:

### Security

```bash
# No unsanitised paths to OS open/explorer commands
grep -rn 'Command::new("open")' tendril-ui/src-tauri/src/ 
# Should show only workspace-validated or --reveal usage

# All directory/capability reads validate workspace
grep -n 'validate_within_workspace' tendril-ui/src-tauri/src/lib.rs
# Should appear in: list_directory, read_capabilities, read_file_content, write_file_content, reveal_in_file_explorer
```

### Async Compliance

```bash
# No std::fs in async commands
grep -n 'std::fs' tendril-ui/src-tauri/src/lib.rs
# Should only appear in non-async helper functions (validate_within_workspace uses tokio::fs now)

# No sync FS in agent
grep -rn 'readFileSync\|writeFileSync\|existsSync' tendril-agent/src/
# Should return zero results
```

### Dead Code

```bash
# uuid crate removed
grep 'uuid' tendril-ui/src-tauri/Cargo.toml
# Should return zero results

# No unused registry methods
grep -n 'exists\|list()' tendril-agent/src/registry.ts
# exists() and list() should be removed (or used)
```

### Single Source of Truth

```bash
# System prompt defined once
grep -rn 'You are Tendril' tendril-ui/src-tauri/src/ tendril-agent/src/
# Should appear in exactly one location (agent's prompt.ts or system-prompt.txt)

# Config defaults defined once  
grep -rn 'DEFAULT_TIMEOUT_MS\|DEFAULT_MAX_CAPABILITIES\|DEFAULT_MAX_TURNS' tendril-ui/src-tauri/src/
# Should return zero results (removed from Rust)
```

## Key Architecture Decisions

1. **Agent owns config defaults** — Rust backend reads config as untyped JSON, only extracts `workspace`. Agent validates with zod schema.
2. **System prompt in shared file** — `{workspace}/system-prompt.txt` written by agent, read by Rust backend for Settings display.
3. **Tauri managed state** — Both `AgentProcess` and cached `AppConfig` use `app.manage()` instead of global statics.
4. **Registry singleton** — `CapabilityRegistry` instantiated once and passed to tool factories via closure.
5. **Auto-reconnect with backoff** — 2s delay, max 3 retries, then manual reconnect button.
