# Changelog

All notable changes to the Tendril project will be documented in this file.

## [Unreleased]

### Added
- Project specification and implementation plan for Tendril Tauri application
- Constitution v2.0.0 with 7 core principles for async-first architecture
- tendril-agent TypeScript sidecar: ACP protocol handler, Strands SDK integration, capability registry, Deno sandbox, bootstrap tools (searchCapabilities, registerCapability, loadTool, execute)
- tendril-ui Tauri + React desktop app: ACP host handler, event forwarding, conversation UI with streaming, tool trace display, token usage tracking, capability browser, workspace initialisation, settings panel
- Node.js SEA build pipeline (esbuild + postject) for standalone agent binary
- Tauri sidecar configuration for bundling both tendril-agent and Deno binaries
- Full ACP Agent Integrator Specification v1.0.0 compliance (MVP subset: initialize, new_session, prompt, cancel, shutdown)
- TailwindCSS v4 styling across all React components
- Makefile with dev, build, test, sea, release, and clean targets
- Deno binary auto-downloaded and bundled as Tauri sidecar (pinned v2.7.12)
- App config at ~/.tendril/config.json — persists workspace path, model, AWS profile, sandbox settings
