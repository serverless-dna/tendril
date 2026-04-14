# Tasks: CI Workflows & Templates

**Input**: Design documents from `/specs/002-ci-workflows-templates/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Not requested. No test tasks generated.

**Organization**: Tasks grouped by user story for independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Includes exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Create the `.github/` directory structure

- [x] T001 Create directory structure: `.github/workflows/`, `.github/ISSUE_TEMPLATE/`

---

## Phase 2: Foundational

**Purpose**: No foundational blocking tasks — each workflow and template is independent.

**Checkpoint**: Phase 1 complete — all user stories can proceed in parallel.

---

## Phase 3: User Story 1 — Quality Gate on Pull Requests (Priority: P1) MVP

**Goal**: Every PR and branch push runs format/lint/test checks. Merge is blocked until all pass.

**Independent Test**: Open a PR with a failing lint error. Verify the workflow runs and blocks merge. Fix it, verify it passes and merge is enabled.

### Implementation for User Story 1

- [x] T002 [US1] Create quality gate workflow in `.github/workflows/quality-gate.yml` — trigger on `push` (all branches) and `pull_request` (target: main). Ubuntu runner. Steps: checkout, setup Node.js 22.x (`actions/setup-node@v4`), install Rust stable with clippy + rustfmt (`dtolnay/rust-toolchain@stable`), run `make install`, run `make check`
- [x] T003 [US1] Verify workflow handles the `ui-lint` dependency chain — `make check` calls `lint` which calls `ui-lint` which depends on `sidecars` (agent build + deno fetch). Ensure Node.js and Rust are available before `make install`
- [x] T004 [US1] Document branch protection setup in quickstart.md — after merge, manually configure in GitHub Settings: require `quality-gate` status check, require branches up to date

**Checkpoint**: Quality gate workflow runs on PRs and blocks merge on failure.

---

## Phase 4: User Story 2 — Tagged Release Build (Priority: P2)

**Goal**: Manual trigger from `main` with a version tag builds the app and publishes a GitHub Release.

**Independent Test**: Trigger the release workflow manually with tag `v0.0.1-test` from `main`. Verify it creates a GitHub Release with artefacts.

### Implementation for User Story 2

- [x] T005 [US2] Create release workflow in `.github/workflows/release.yml` — trigger: `workflow_dispatch` with input `version` (string, required, description: "Version tag e.g. v0.1.0"). macOS runner (`macos-latest`)
- [x] T006 [US2] Add branch and tag validation as first job step — check `github.ref == 'refs/heads/main'`, validate version input matches `^v[0-9]+\.[0-9]+\.[0-9]+$` pattern. Fail with clear error if either check fails
- [x] T007 [US2] Add build steps — checkout, setup Node.js 22.x, install Rust stable, run `make install`, run `make release`
- [x] T008 [US2] Add GitHub Release creation step — use `softprops/action-gh-release@v2`, set tag to version input, upload Tauri bundle artefacts from `tendril-ui/src-tauri/target/release/bundle/`
- [x] T009 [US2] Add git tag creation step before release — create and push the version tag so the release is associated with it

**Checkpoint**: Release workflow produces a tagged GitHub Release with downloadable artefacts.

---

## Phase 5: User Story 3 — Issue Templates (Priority: P3)

**Goal**: Contributors get simple, structured templates when creating issues.

**Independent Test**: Create a new issue in the repo. Verify bug report and feature request templates appear.

### Implementation for User Story 3

- [x] T010 [P] [US3] Create bug report template in `.github/ISSUE_TEMPLATE/bug-report.yml` — YAML form with fields: Description (textarea, required), Steps to Reproduce (textarea, required), Expected Behaviour (textarea, required)
- [x] T011 [P] [US3] Create feature request template in `.github/ISSUE_TEMPLATE/feature-request.yml` — YAML form with fields: Description (textarea, required), Motivation (textarea, required)

**Checkpoint**: New issues present structured templates.

---

## Phase 6: User Story 4 — PR Template (Priority: P3)

**Goal**: Contributors get a pre-filled PR description with Summary and Test Plan sections.

**Independent Test**: Open a PR. Verify the template pre-fills the description.

### Implementation for User Story 4

- [x] T012 [US4] Create PR template in `.github/PULL_REQUEST_TEMPLATE.md` — sections: Summary (## heading + blank line for description), Test Plan (## heading + checklist placeholder)

**Checkpoint**: New PRs have pre-filled description template.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T013 Update CHANGELOG.md with CI workflow and template additions
- [x] T014 Verify all workflows pass YAML linting (valid GitHub Actions syntax)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **User Stories (Phases 3-6)**: All depend on Phase 1 (directory exists)
- **Polish (Phase 7)**: After all user stories complete

### User Story Dependencies

- **US1 (Quality Gate)**: Independent — can start after Phase 1
- **US2 (Release)**: Independent — can start after Phase 1
- **US3 (Issue Templates)**: Independent — can start after Phase 1
- **US4 (PR Template)**: Independent — can start after Phase 1

All four user stories are fully independent and can be implemented in parallel.

### Within Each User Story

- Workflow tasks are sequential (each builds on the previous)
- Template tasks (US3) are parallel (different files)

### Parallel Opportunities

- T010 and T011 (issue templates) can run in parallel
- All four user stories can run in parallel after Phase 1
- US3 and US4 are the simplest — quick wins

---

## Parallel Example: All User Stories

```bash
# After Phase 1 (T001), launch all stories in parallel:
Story 1: T002 → T003 → T004   (quality gate)
Story 2: T005 → T006 → T007 → T008 → T009  (release)
Story 3: T010 + T011           (issue templates, parallel)
Story 4: T012                  (PR template)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 (Setup)
2. Complete T002-T004 (Quality Gate)
3. **STOP and VALIDATE**: Push to a branch, open a PR, verify checks run
4. Merge — quality gate is live

### Incremental Delivery

1. Quality Gate (US1) — merge first, protects everything after
2. Release workflow (US2) — merge next, enables tagged releases
3. Issue + PR templates (US3, US4) — merge last, contributor experience polish

---

## Notes

- All file paths are relative to repository root
- Branch protection (FR-004) requires manual GitHub Settings configuration after workflow is merged
- macOS runner is only needed for US2 (release build) — all other stories use Ubuntu or are file-only
- Total: 14 tasks across 4 independent user stories
