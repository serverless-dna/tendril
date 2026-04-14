# Implementation Plan: CI Workflows & Templates

**Branch**: `001-tendril-tauri-app` | **Date**: 2026-04-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-ci-workflows-templates/spec.md`

## Summary

Set up GitHub Actions CI/CD for the Tendril repository: a quality gate workflow that blocks PR merges until format/lint/test pass, a manual release workflow that builds tagged releases from `main`, and simple PR + issue templates.

## Technical Context

**Language/Version**: GitHub Actions YAML, Bash (workflow scripts)  
**Primary Dependencies**: GitHub Actions runners (`ubuntu-latest`, `macos-latest`), existing `Makefile` targets  
**Storage**: N/A  
**Testing**: Existing `make check` (fmt + lint + test) is the quality gate  
**Target Platform**: GitHub-hosted runners; macOS for Tauri builds  
**Project Type**: CI/CD configuration (YAML + Markdown templates)  
**Performance Goals**: Quality gate completes in under 5 minutes  
**Constraints**: Release workflow must run only from `main`; macOS runners needed for Tauri  
**Scale/Scope**: Single repository, single platform target (macOS aarch64) initially

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Async-First | N/A | CI workflows don't affect runtime architecture |
| II. Event-Driven State | N/A | No runtime changes |
| III. Component Isolation | N/A | No runtime changes |
| IV. Protocol Compliance | N/A | No protocol changes |
| V. Sandboxed Execution | N/A | No sandbox changes |
| VI. Test-First | PASS | Quality gate enforces test passage before merge — strengthens this principle |
| VII. Simplicity | PASS | Minimal workflows, reuses existing `make` targets, no custom actions |

No violations. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-ci-workflows-templates/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # N/A (no data entities)
├── quickstart.md        # Phase 1 output
└── contracts/           # N/A (no external interfaces)
```

### Source Code (repository root)

```text
.github/
├── workflows/
│   ├── quality-gate.yml     # Runs on PR + branch push
│   └── release.yml          # Manual trigger, tag-based, main-only
├── PULL_REQUEST_TEMPLATE.md
└── ISSUE_TEMPLATE/
    ├── bug-report.yml
    └── feature-request.yml
```

**Structure Decision**: Standard `.github/` directory layout. Workflows use YAML forms for issue templates (GitHub's preferred format for structured forms). PR template is plain Markdown.
