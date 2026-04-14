# Feature Specification: CI Workflows & Templates

**Feature Branch**: `002-ci-workflows-templates`  
**Created**: 2026-04-14  
**Status**: Draft  
**Input**: User description: "Setup GitHub Action workflows for the repo. Need a release workflow that requires a version TAG to build and package a release from - it is a manual trigger and should only be run from main. Standard quality gate runs for every PR/branch and no merge can happen until they have all passed. Set up a PR template (simple and plain), also issue template - not too long - simple and plain."

## User Scenarios & Testing

### User Story 1 - Quality Gate on Pull Requests (Priority: P1)

A contributor opens a pull request against `main`. The quality gate workflow runs automatically — formatting checks, linting, and tests. The PR cannot be merged until all checks pass. The contributor sees clear pass/fail status on the PR.

**Why this priority**: Prevents broken code from reaching main. This is the foundational safety net that every other workflow depends on.

**Independent Test**: Open a PR with a deliberate lint error. Verify the workflow fails and the merge button is blocked. Fix the error, push, verify the workflow passes and merge is allowed.

**Acceptance Scenarios**:

1. **Given** a PR is opened against `main`, **When** the checks run, **Then** formatting, linting, and tests all execute and report status on the PR
2. **Given** a quality gate check fails, **When** the contributor views the PR, **Then** the merge button is blocked and the failing check is clearly identified
3. **Given** all quality gate checks pass, **When** the contributor views the PR, **Then** the merge button is enabled
4. **Given** a new commit is pushed to the PR branch, **When** the push is detected, **Then** the quality gate runs again against the updated code

---

### User Story 2 - Tagged Release Build (Priority: P2)

A maintainer wants to ship a release. They manually trigger the release workflow from `main`, providing a version tag (e.g. `v0.1.0`). The workflow builds the agent and UI, packages a Tauri release, and publishes a GitHub Release with the built artefacts attached.

**Why this priority**: Enables reproducible, tagged releases. Depends on quality gate (P1) to ensure main is always in a releasable state.

**Independent Test**: Manually trigger the release workflow with tag `v0.0.1-test` from `main`. Verify the workflow creates a GitHub Release with the correct tag and attached artefacts.

**Acceptance Scenarios**:

1. **Given** the maintainer triggers the release workflow from `main` with tag `v0.2.0`, **When** the workflow runs, **Then** it builds the application and creates a GitHub Release tagged `v0.2.0`
2. **Given** the maintainer triggers the release workflow from a non-`main` branch, **When** the workflow evaluates the trigger, **Then** the workflow refuses to run and reports an error
3. **Given** the maintainer provides a tag that does not match the version format, **When** the workflow evaluates input, **Then** the workflow fails with a clear validation error
4. **Given** the release build completes successfully, **When** the GitHub Release is created, **Then** built artefacts are attached to the release

---

### User Story 3 - Contributor Opens an Issue (Priority: P3)

A contributor wants to report a bug or request a feature. They create a new issue and are presented with a simple, structured template that guides them to provide the necessary information without being overwhelming.

**Why this priority**: Consistent issue reporting improves triage. Low effort to implement.

**Independent Test**: Create a new issue in the repository. Verify the template appears with clear sections and is quick to fill in.

**Acceptance Scenarios**:

1. **Given** a contributor creates a new issue, **When** they select "Bug Report", **Then** a simple template appears with sections for description, steps to reproduce, and expected behaviour
2. **Given** a contributor creates a new issue, **When** they select "Feature Request", **Then** a simple template appears with sections for description and motivation

---

### User Story 4 - Contributor Opens a Pull Request (Priority: P3)

A contributor opens a pull request. They are presented with a simple PR template that prompts them for a summary and test plan.

**Why this priority**: Consistent PR descriptions improve review quality. Minimal effort.

**Independent Test**: Open a PR. Verify the template pre-fills the description with the expected structure.

**Acceptance Scenarios**:

1. **Given** a contributor opens a PR, **When** the PR description editor loads, **Then** a template is pre-filled with Summary and Test Plan sections

---

### Edge Cases

- What happens when the release workflow is triggered with a tag that already exists?
- What happens when the quality gate runs on a branch with no test files?
- What happens when a PR targets a branch other than `main`?

## Requirements

### Functional Requirements

- **FR-001**: Repository MUST have a quality gate workflow that runs on every PR and branch push
- **FR-002**: Quality gate MUST execute: format check (`make fmt`), lint (`make lint`), and tests (`make test`)
- **FR-003**: Quality gate MUST run the agent TypeScript checks and the Rust clippy/format checks
- **FR-004**: Branch protection on `main` MUST require all quality gate checks to pass before merge
- **FR-005**: Repository MUST have a release workflow that is manually triggered (`workflow_dispatch`)
- **FR-006**: Release workflow MUST accept a version tag as input (e.g. `v0.1.0`)
- **FR-007**: Release workflow MUST validate it is running on the `main` branch and refuse to proceed otherwise
- **FR-008**: Release workflow MUST validate the tag format matches semver pattern (`v*.*.*`)
- **FR-009**: Release workflow MUST build the tendril-agent (esbuild bundle) and tendril-ui (Tauri build)
- **FR-010**: Release workflow MUST create a GitHub Release with the version tag and attach built artefacts
- **FR-011**: Repository MUST have a PR template with Summary and Test Plan sections
- **FR-012**: Repository MUST have issue templates for Bug Report and Feature Request
- **FR-013**: Issue templates MUST be concise — no more than 5 fields each

### Key Entities

- **Workflow**: A GitHub Actions workflow definition (YAML) that runs jobs in response to triggers
- **Quality Gate**: The set of checks (format, lint, test) that must pass for code to merge
- **Release**: A tagged, versioned build published as a GitHub Release with downloadable artefacts
- **Template**: A markdown file that pre-fills PR or issue descriptions with a consistent structure

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every PR against `main` has automated checks visible within 2 minutes of push
- **SC-002**: No code reaches `main` without passing all quality gate checks
- **SC-003**: A maintainer can produce a tagged release in under 5 minutes via manual trigger
- **SC-004**: 100% of new issues use a structured template
- **SC-005**: 100% of new PRs have a pre-filled description template

## Assumptions

- GitHub Actions is the CI/CD platform (repository is hosted on GitHub)
- The existing `make check` target (`fmt` + `lint` + `test`) is the quality gate definition
- macOS is the primary release target (aarch64-apple-darwin); cross-platform builds may be added later
- Branch protection rules will be configured manually in GitHub repository settings (not automated by the workflow)
- The release workflow does not handle changelog generation — that is maintained manually
- Tauri build requires macOS runners for macOS targets (GitHub-hosted `macos-latest`)
