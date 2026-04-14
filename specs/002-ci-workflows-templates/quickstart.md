# Quickstart: CI Workflows & Templates

## Files to Create

```
.github/
├── workflows/
│   ├── quality-gate.yml
│   └── release.yml
├── PULL_REQUEST_TEMPLATE.md
└── ISSUE_TEMPLATE/
    ├── bug-report.yml
    └── feature-request.yml
```

## Quality Gate Workflow

**Trigger**: Push to any branch, PR against `main`
**Runner**: `ubuntu-latest`
**Steps**:
1. Checkout code
2. Install Node.js 22.x
3. Install Rust stable (with clippy + rustfmt)
4. `make install` (npm install for agent + ui)
5. `make check` (fmt + lint + test)

**Branch protection**: After workflow is merged, configure in GitHub repo settings:
- Require status checks to pass: `quality-gate`
- Require branches to be up to date

## Release Workflow

**Trigger**: `workflow_dispatch` with `version` input
**Runner**: `macos-latest` (for Tauri macOS build)
**Guard**: Validate running on `main`, validate tag format `v*.*.*`
**Steps**:
1. Checkout code
2. Install Node.js 22.x
3. Install Rust stable
4. `make install`
5. `make release`
6. Create GitHub Release with tag, attach Tauri bundle artefacts

## Templates

**PR Template**: Summary + Test Plan sections, 5 lines
**Bug Report**: Description, Steps to Reproduce, Expected Behaviour (YAML form)
**Feature Request**: Description, Motivation (YAML form)

## Post-Merge Setup

After merging the workflow files, manually configure branch protection in GitHub Settings > Branches > `main`:
- Require pull request reviews
- Require status checks to pass before merging
- Select the `quality-gate` workflow as a required check
