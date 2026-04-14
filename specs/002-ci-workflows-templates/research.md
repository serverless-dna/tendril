# Research: CI Workflows & Templates

## Build Pipeline Requirements

### Decision: Use existing Makefile targets as workflow steps
**Rationale**: The Makefile already defines `make check` (fmt + lint + test), `make sidecars`, and `make release`. Wrapping these in GitHub Actions avoids duplicating build logic and keeps CI and local dev in sync.
**Alternatives considered**: Custom GitHub Actions steps replicating each build command individually — rejected because it creates divergence between local and CI builds.

### Decision: macOS runner for release builds, Ubuntu for quality gate
**Rationale**: Tauri builds require the target OS. Release targets macOS (aarch64). The quality gate only runs format/lint/test — no Tauri build needed — so Ubuntu is cheaper and faster. The agent TypeScript checks and Rust clippy/fmt can run on Ubuntu since they don't require macOS-specific dependencies.
**Alternatives considered**: macOS for everything — rejected due to higher cost and slower runner availability. Cross-compilation — rejected as Tauri doesn't support cross-compiling with bundled sidecars.

### Decision: Quality gate does NOT build Tauri
**Rationale**: `make check` runs `fmt`, `lint` (which includes `cargo clippy` via `ui-lint`), and `test`. The `ui-lint` target depends on `sidecars` which builds the agent and fetches Deno. This is sufficient to validate code quality without a full Tauri release build. A full `cargo tauri build` takes 5+ minutes and isn't needed to gate PRs.
**Alternatives considered**: Full Tauri build on every PR — rejected as too slow and expensive for a quality gate.

**Important caveat**: `ui-lint` (cargo clippy) depends on `sidecars` target which needs the tendril-agent binary and Deno. On CI we need Node.js, Rust, and Deno available. The Makefile's `deno-fetch` target downloads Deno to `src-tauri/binaries/`, and `agent-build` creates the agent sidecar script.

## Runner Requirements

### Quality Gate Runner (ubuntu-latest)
- Node.js 22.x (agent uses node22 target, engines >=18)
- Rust stable (edition 2021, need cargo + clippy + rustfmt)
- Deno downloaded by Makefile (`make deno-fetch`)

### Release Runner (macos-latest)
- Node.js 22.x
- Rust stable
- Deno downloaded by Makefile
- Full Tauri build environment (Xcode CLT pre-installed on GitHub macOS runners)

## Version Tag Format

### Decision: Semver tags prefixed with `v` (e.g. `v0.1.0`)
**Rationale**: Standard convention for GitHub releases. The `workflow_dispatch` input will validate format before proceeding.
**Alternatives considered**: No `v` prefix — rejected as non-conventional and harder to distinguish from other tags.

## Issue Templates

### Decision: Use YAML form templates (not Markdown templates)
**Rationale**: GitHub's YAML issue forms provide structured fields with dropdowns, validation, and cleaner UX. They're the recommended approach since 2022.
**Alternatives considered**: Markdown-based issue templates — functional but less structured, no field validation.

## PR Template

### Decision: Single Markdown file at `.github/PULL_REQUEST_TEMPLATE.md`
**Rationale**: Simple, universal. GitHub auto-fills PR description with this template. Two sections: Summary and Test Plan.
**Alternatives considered**: Multiple PR templates with a chooser — overkill for a single-contributor project.
