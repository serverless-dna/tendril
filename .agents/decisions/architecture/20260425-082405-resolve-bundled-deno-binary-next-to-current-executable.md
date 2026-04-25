---
id: "20260425-082405-resolve-bundled-deno-binary-next-to-current-executable"
title: "Resolve bundled deno binary next to current executable"
category: "architecture"
date: "2026-04-25T08:24:05.821305+00:00"
tags: ["deno", "sidecar", "packaging", "macos"]
---

## Decision

`resolve_deno_path()` in `acp.rs` uses `std::env::current_exe().parent()` as the primary search location for the bundled deno binary, checking for both a plain name (`deno` / `deno.exe`) and a target-triple-suffixed name.

Search order:
1. Plain `deno` next to current executable (packaged app)
2. Triple-suffixed `deno-{triple}` next to current executable
3. `resource_dir/binaries/deno-{triple}` (Tauri externalBin)
4. `cwd/binaries/deno-{triple}` (dev)
5. `cwd/binaries/deno` (dev, plain)
6. Bare `"deno"` fallback (PATH)

## Rationale

The packaged macOS `.app` bundle places the `deno` binary (plain name, no target-triple suffix) in `Contents/MacOS/` alongside the main executable. The previous implementation only checked `resource_dir/binaries/` with a triple-suffixed filename, which never matched the actual bundled binary. Using `current_exe().parent()` is OS-agnostic — it resolves to `Contents/MacOS/` on macOS, and the install directory on Windows/Linux.

## Context

Reported as "deno is not available" in the packaged Tendril app on macOS aarch64. The deno binary was present in `Contents/MacOS/deno` but the resolver never looked there. Fixed in `tendril-ui/src-tauri/src/acp.rs`.