---
id: "20260425-051702-replace-launcher-payload-sidecar-with-node-js-sea-binary"
title: "Replace launcher+payload sidecar with Node.js SEA binary"
category: "architecture"
date: "2026-04-25T05:17:02.431099+00:00"
tags: ["sidecar", "sea", "node", "bundling"]
---

## Decision
The `tendril-agent-launcher` Rust crate and raw CJS payload approach is replaced with a Node.js Single Executable Application (SEA). The SEA binary is the sidecar — no runtime `node` dependency.

## Rationale
The launcher called `Command::new("node")` which fails in bundled macOS `.app` contexts (Finder/Launchpad) because the shell `PATH` isn't inherited. The SEA embeds the Node.js runtime, eliminating the external dependency entirely.

## Context
- `tendril-agent-launcher/` still exists in the repo but is no longer built or referenced by the build pipeline
- The `sea` Makefile target handles cross-platform SEA creation (codesign on macOS, plain postject on Linux/Windows)
- `postject` added as a devDependency in `tendril-agent/package.json`
- `build:sea` npm script removed from package.json — the Makefile owns the SEA build
- `tendril-agent-payload` removed from `externalBin` in tauri.conf.json
- All CI workflow references to `tendril-agent-launcher` removed