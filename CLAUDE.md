# core Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-15

## Active Technologies
- GitHub Actions YAML, Bash (workflow scripts) + GitHub Actions runners (`ubuntu-latest`, `macos-latest`), existing `Makefile` targets (001-tendril-tauri-app)
- Rust (stable, Tauri 2.x backend), TypeScript 5.7+ (React 18 frontend, Node.js 22 agent) + Tauri 2.x, React 18, tokio 1.x, serde_json 1.x, @strands-agents/sdk, zod 4.x, esbuild (code-review)
- `~/.tendril/config.json` (app config), `{workspace}/tools/index.json` (capability registry) (code-review)

- TypeScript 5.x (agent), Rust (Tauri shell), React 18+ (frontend) + `@strands-agents/sdk` (agent), `tauri-plugin-shell` (IPC), TailwindCSS v4 (styling) (001-tendril-tauri-app)

## Project Structure

```text
src/
tests/
```

## Commands

cargo test && cargo clippy

## Code Style

TypeScript 5.x (agent), Rust (Tauri shell), React 18+ (frontend): Follow standard conventions

## Recent Changes
- code-review: Added Rust (stable, Tauri 2.x backend), TypeScript 5.7+ (React 18 frontend, Node.js 22 agent) + Tauri 2.x, React 18, tokio 1.x, serde_json 1.x, @strands-agents/sdk, zod 4.x, esbuild
- 001-tendril-tauri-app: Added GitHub Actions YAML, Bash (workflow scripts) + GitHub Actions runners (`ubuntu-latest`, `macos-latest`), existing `Makefile` targets

- 001-tendril-tauri-app: Added TypeScript 5.x (agent), Rust (Tauri shell), React 18+ (frontend) + `@strands-agents/sdk` (agent), `tauri-plugin-shell` (IPC), TailwindCSS v4 (styling)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
