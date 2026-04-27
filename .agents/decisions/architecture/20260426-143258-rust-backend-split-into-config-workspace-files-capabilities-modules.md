---
id: "20260426-143258-rust-backend-split-into-config-workspace-files-capabilities"
title: "Rust backend split into config, workspace, files, capabilities modules"
category: "architecture"
date: "2026-04-26T14:32:58.694094+00:00"
tags: ["rust", "tauri", "refactor"]
---

## Decision

Split `tendril-ui/src-tauri/src/lib.rs` (629 lines) into focused modules:

- `config.rs` (197 lines) — Config CRUD, validation, defaults
- `workspace.rs` (125 lines) — Path security, workspace init
- `files.rs` (177 lines) — File system commands (read, write, list, reveal)
- `capabilities.rs` (78 lines) — Capability registry and tool source reading
- `lib.rs` (116 lines) — Thin orchestrator: mod declarations, state types, ACP command wrappers, `run()`

Also fixed:
- `default_app_config()` now emits nested provider format (`model.bedrock.modelId`) instead of legacy flat format
- `chrono_now()` renamed to `epoch_millis()` since it uses `SystemTime`, not chrono crate
- Extracted `validate_positive_int()` helper to DRY config validation
- Extracted `open_url()` and `reveal_path()` helpers in files.rs to reduce platform cfg nesting

## Rationale

`lib.rs` was a 629-line flat file mixing 6 unrelated concerns — the same problem we fixed in the agent's `index.ts`. For an open-source project, each file should have one clear responsibility.

The default config fix prevents the agent from needing to run legacy migration on first boot — the Rust side now generates the same nested format the agent expects.

## Context

This is the Rust backend of a Tauri 2 desktop app. Commands are registered via `tauri::generate_handler!` which requires function paths — modules work fine with `module::function` syntax.