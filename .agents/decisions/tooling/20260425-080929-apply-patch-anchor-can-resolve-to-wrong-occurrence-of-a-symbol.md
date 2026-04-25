---
id: "20260425-080929-apply-patch-anchor-can-resolve-to-wrong-occurrence-of-a-symb"
title: "apply_patch @@ anchor can resolve to wrong occurrence of a symbol"
category: "tooling"
date: "2026-04-25T08:09:29.711399+00:00"
tags: ["apply_patch", "tooling", "debugging"]
---

## Decision

When using `apply_patch` with `@@` context headers, use highly specific anchor text that uniquely identifies the target location. Prefer `@@ async fn function_name` over just `@@ function_name`, especially when the symbol appears at multiple locations in the file (definition + call sites).

If a symbol appears more than once, either:
1. Use a more specific `@@` anchor (e.g. include `fn`, `impl`, `struct` keywords)
2. Omit `@@` entirely and rely on 3+ unique non-blank context lines
3. Fall back to `write_file` for the whole file if patching fails twice

## Rationale

In `acp.rs`, `@@ resolve_deno_path` appeared to anchor to the call site (line 124) instead of the function definition (line 64), causing the engine to search for context lines in the wrong region. Both small and large patches failed identically despite context being copied verbatim from `read_file`.

## Context

Encountered while editing `tendril-ui/src-tauri/src/acp.rs` — the function `resolve_deno_path` appeared at both its definition (line 64) and a call site (line 124). Two consecutive `apply_patch` attempts failed before falling back to `write_file`.