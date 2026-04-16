# Tasks: Multi-Provider Model Support

**Input**: Design documents from `specs/004-multi-provider-support/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included per constitution principle VI (Test-First).

**Organization**: Tasks grouped by user story. US5 (backward compat) is foundational since it constrains all other work. US1 (provider selection) + US2 (Ollama) are the P1 MVP. US3 (OpenAI) + US4 (Anthropic) are P2 increments sharing a Stronghold dependency.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Dependencies and project configuration changes needed before any implementation.

- [x] T001 Add `tauri-plugin-stronghold` to `tendril-ui/src-tauri/Cargo.toml` dependencies and add `[profile.dev.package.scrypt] opt-level = 3` workaround
- [x] T002 Add `@tauri-apps/plugin-stronghold` to `tendril-ui/package.json` dependencies and run install
- [x] T003 Add Stronghold permissions to `tendril-ui/src-tauri/capabilities/default.json` (`stronghold:default`). Create the `capabilities/` directory and `default.json` file if they do not already exist (Tauri 2.x may not have generated them yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config schema refactoring and model factory that ALL user stories depend on. Includes US5 (backward compat) since it constrains the schema design.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests

- [x] T004 [P] Write vitest tests for legacy config migration (flat Bedrock fields → nested `model.bedrock` block) in `tendril-agent/tests/config.test.ts`
- [x] T005 [P] Write vitest tests for new nested config schema validation (valid provider, missing required fields, invalid provider string, inactive blocks ignored) in `tendril-agent/tests/config.test.ts`
- [x] T006 [P] Write vitest tests for model factory function — verify correct Strands model class instantiated per provider, verify Ollama uses `OpenAIModel` with custom `baseURL` in `tendril-agent/tests/agent.test.ts`
- [x] T004a [P] [US5] Write vitest integration test in `tendril-agent/tests/config.test.ts` — load a full legacy config JSON fixture (no `provider`, flat `modelId`/`region`/`profile`), verify `readConfig()` returns `provider: 'bedrock'` with correct nested `bedrock` block and all other settings preserved
- [x] T004b [P] [US5] Write vitest test in `tendril-agent/tests/config.test.ts` — load a new-format config with explicit `provider: 'bedrock'` and nested `bedrock` block, verify it parses correctly without migration

### Implementation

- [x] T007 [P] Update `ModelConfig` and add per-provider config interfaces (`BedrockConfig`, `OllamaConfig`, `OpenAIConfig`, `AnthropicConfig`) in `tendril-agent/src/types.ts` per data-model.md entity definitions
- [x] T008 [P] Update `AppConfig` interface in `tendril-ui/src/types.ts` to match new nested `model` schema with provider discriminant and per-provider blocks
- [x] T009 Refactor `WorkspaceConfigSchema` Zod schema in `tendril-agent/src/config.ts` — define `ProviderEnum`, per-provider Zod schemas (`BedrockConfigSchema`, `OllamaConfigSchema`, `OpenAIConfigSchema`, `AnthropicConfigSchema`), and `ModelConfigSchema` with nested optional blocks per contracts/agent-config-schema.md
- [x] T010 Add legacy config migration function in `tendril-agent/src/config.ts` — detect flat `model.modelId`+`model.region` without `model.provider`, migrate to `model.bedrock` nested block, call before Zod parse in `readConfig()`
- [x] T011 Replace hardcoded `BedrockModel` in `tendril-agent/src/agent.ts` with `createModel(config)` factory function — switch on `config.model.provider` to instantiate `BedrockModel`, `OpenAIModel` (for both openai and ollama), or `AnthropicModel` per contracts/agent-config-schema.md model factory contract
- [x] T012 Update Rust config validation in `tendril-ui/src-tauri/src/lib.rs` `validate_config_payload()` — add validation for `model.provider` enum and nested provider blocks; preserve existing sandbox/registry/agent validation
- [x] T013 Run `tendril-agent` tests (`npm test`) — confirm T004, T005, T006 tests pass with T007–T011 implementation

**Checkpoint**: Config schema v2 is live. Model factory works for all 4 providers. Legacy configs auto-migrate. Agent can be instantiated with any provider.

---

## Phase 3: User Story 1 — Select a Model Provider (Priority: P1) 🎯 MVP

**Goal**: Users can select a provider in settings, see dynamic provider-specific fields, save, and the agent restarts with the chosen provider.

**Independent Test**: Change provider dropdown → save → verify agent startup log shows new provider.

### Tests

- [x] T014 [US1] Write vitest test for provider-aware startup logging and cost lookup table in `tendril-agent/tests/index.test.ts` — verify correct cost constants and context limit per provider; also assert the startup log line includes the provider name and model ID (FR-012)

### Implementation

- [x] T015 [US1] Add provider-aware cost lookup table in `tendril-agent/src/index.ts` — replace hardcoded `INPUT_COST_PER_TOKEN`/`OUTPUT_COST_PER_TOKEN`/`MODEL_CONTEXT_LIMIT` with a static map keyed by provider per data-model.md cost table; Ollama reports zero cost
- [x] T016 [US1] Update agent startup log in `tendril-agent/src/index.ts` — log `config.model.provider` alongside model ID; remove Bedrock-specific auth error message, replace with provider-generic error handling
- [x] T017 [US1] Refactor `SettingsPanel.tsx` in `tendril-ui/src/components/SettingsPanel.tsx` — add provider selector `<select>` with options `bedrock|ollama|openai|anthropic`; conditionally render provider-specific field groups (Bedrock: region, profile, modelId; Ollama: host, modelId; OpenAI: modelId; Anthropic: modelId); retain form values per-provider using separate state for each provider's config block
- [x] T018 [US1] Update `handleSave` in `tendril-ui/src/components/SettingsPanel.tsx` — serialize full config with nested `model.provider` + all provider blocks to `write_config`; only the active provider's fields are user-facing, other blocks persist from loaded config
- [x] T019 [US1] Sync form state from config prop — when `config` changes, populate all provider-specific state variables from nested blocks in `tendril-ui/src/components/SettingsPanel.tsx`

**Checkpoint**: Provider selection works end-to-end. Bedrock still works (US5). Settings show dynamic fields. Agent restarts with correct provider.

---

## Phase 4: User Story 2 — Use Ollama for Local Model Inference (Priority: P1) 🎯 MVP

**Goal**: Users can configure Ollama host and model, save, and get streamed responses from a local Ollama instance.

**Independent Test**: Run Ollama locally, configure in settings, send a prompt, verify streamed response.

**Dependencies**: Phase 2 (model factory already handles Ollama via `OpenAIModel` + custom `baseURL`). Phase 3 (settings UI renders Ollama fields).

### Implementation

- [x] T020 [US2] Add Ollama connection error handling in `tendril-agent/src/index.ts` — catch `ECONNREFUSED` / network errors from `OpenAIModel` when `provider=ollama` and emit user-friendly error message ("Ollama is not running or unreachable at {host}") instead of raw SDK exception
- [x] T021 [US2] Add Ollama-specific defaults in `tendril-ui/src/components/SettingsPanel.tsx` — when user selects Ollama for the first time and no saved Ollama config exists, pre-populate host as `http://localhost:11434` and modelId as `llama3`

**Checkpoint**: Ollama provider works end-to-end. User can chat with a local model. Connection errors are user-friendly.

---

## Phase 5: User Story 5 — Preserve Existing Bedrock Behaviour (Priority: P1)

**Goal**: Verify that existing Bedrock-only configs work without modification after all changes.

**Independent Test**: Use a legacy `config.json` (flat `model.modelId`/`model.region`), start the agent, verify it works identically.

**Dependencies**: Phase 2 (legacy migration in config.ts — US5 tests T004a/T004b already in Phase 2), Phase 3 (settings UI).

**Note**: US5 migration tests (T004a, T004b) were moved to Phase 2 since they validate foundational migration logic and should pass before any user story work begins.

### Implementation

- [x] T024 [US5] Verify `SettingsPanel.tsx` correctly renders Bedrock fields (region, profile, modelId) when loaded config has `provider: 'bedrock'` — no new code expected, but manual verification step after Phase 3

**Checkpoint**: Legacy configs auto-migrate. Existing Bedrock users see no behaviour change. All P1 stories complete.

---

## Phase 6: User Story 3 — Use OpenAI as Provider (Priority: P2)

**Goal**: Users can enter an OpenAI API key (stored in Stronghold), select a model, and get streamed responses.

**Independent Test**: Enter a valid OpenAI API key, select `gpt-4o`, send a prompt, verify response.

**Dependencies**: Phase 2 (model factory), Phase 3 (settings UI), Phase 1 (Stronghold setup).

### Tests

- [x] T025 [P] [US3] Write Rust test for `save_api_key` and `has_api_key` Stronghold commands in `tendril-ui/src-tauri/src/lib.rs` (or separate test module) — verify key storage and retrieval via Stronghold API

### Implementation

- [x] T026 [US3] Initialize Stronghold plugin in `tendril-ui/src-tauri/src/lib.rs` — add `tauri_plugin_stronghold::Builder::with_argon2(&salt_path)` to Tauri builder setup; derive salt path from `app.path().app_local_data_dir()`
- [x] T027 [US3] Implement `save_api_key`, `has_api_key`, and `delete_api_key` Tauri commands in `tendril-ui/src-tauri/src/lib.rs` — use Stronghold store API to save/read/delete keys under `{provider}_api_key`; register commands in Tauri builder; never log key values
- [x] T028 [US3] Modify `connect_agent` in `tendril-ui/src-tauri/src/acp.rs` — before spawning sidecar, read active provider from config; if `openai` or `anthropic`, read API key from Stronghold; if key exists AND env var not already set in parent process (`std::env::var()`), inject env var using the sidecar `Command::env(key, value)` method (confirmed available in `tauri_plugin_shell::process::Command`). This implements FR-018 env var precedence: if env var already set, Stronghold value is skipped.
- [x] T029 [US3] Add API key input field to `SettingsPanel.tsx` — render `type="password"` input when provider is `openai` or `anthropic`; on mount, call `invoke('has_api_key', { provider })` to check if key exists; if yes, show `"••••••••"` placeholder; on save, if user entered a new key, call `invoke('save_api_key', { provider, apiKey })` before `write_config`
- [x] T030 [US3] Add save validation for API key in `SettingsPanel.tsx` — if active provider is `openai` or `anthropic` and no key exists in Stronghold AND no new key entered in form, show inline error "API key required for {Provider}" and block save

**Checkpoint**: OpenAI provider works end-to-end with secure key storage. Keys never in config.json.

---

## Phase 7: User Story 4 — Use Anthropic Direct API (Priority: P2)

**Goal**: Users can enter an Anthropic API key (stored in Stronghold), select a Claude model, and get streamed responses.

**Independent Test**: Enter a valid Anthropic API key, select `claude-sonnet-4-20250514`, send a prompt, verify response.

**Dependencies**: Phase 6 (Stronghold commands and API key UI already built for OpenAI; Anthropic reuses same infrastructure).

### Implementation

- [x] T031 [US4] Verify Anthropic provider works with existing infrastructure — Stronghold commands, env var injection in `acp.rs`, and API key UI in `SettingsPanel.tsx` all already handle `"anthropic"` as a provider value. Manual verification that selecting Anthropic, entering a key, saving, and prompting works end-to-end. Add Anthropic-specific default modelId (`claude-sonnet-4-20250514`) to settings panel defaults.

**Checkpoint**: Anthropic provider works. All 4 providers operational.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening across all providers.

- [x] T032 [P] Add Ollama model-not-found error handling in `tendril-agent/src/index.ts` — detect 404 response from Ollama and emit "Model {modelId} not found in Ollama. Run: ollama pull {modelId}"
- [x] T033 [P] Add Stronghold vault error handling in `tendril-ui/src-tauri/src/lib.rs` — if vault is corrupted or unreadable, emit clear error and log recovery instructions ("Delete vault.hold from app data directory to reset")
- [x] T034 [P] Update `tendril-ui/src-tauri/src/lib.rs` `validate_config_payload()` — add validation for `model.provider` as valid enum, validate nested provider block fields match data-model.md rules
- [x] T035 Run quickstart.md smoke tests — manually verify all 4 config examples (Bedrock, Ollama, OpenAI, Legacy) work correctly
- [x] T036 Code cleanup — remove any dead Bedrock-only code paths, ensure no API keys logged anywhere, verify all error messages are user-friendly
- [x] T037 [P] Write Rust integration test for env var precedence in `tendril-ui/src-tauri/src/acp.rs` (or test module) — verify that when `OPENAI_API_KEY` env var is already set in parent process, the Stronghold value is NOT injected on the sidecar child process (FR-018)
- [x] T038 [P] Add cross-provider stream event validation test in `tendril-agent/tests/index.test.ts` — verify that stream events from at least 2 providers (e.g., mock Bedrock + mock OpenAI responses) produce valid `agent_message_chunk` session updates through the existing `handleStreamEvent` function

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US5)
                                          ↘                                ↗
                                           Phase 6 (US3) → Phase 7 (US4) ─┘
                                                                           → Phase 8 (Polish)
```

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — core provider selection UI
- **Phase 4 (US2)**: Depends on Phase 2 + Phase 3 — Ollama needs settings UI
- **Phase 5 (US5)**: Depends on Phase 2 — can run in parallel with Phase 3/4 (tests only)
- **Phase 6 (US3)**: Depends on Phase 1 + Phase 2 + Phase 3 — needs Stronghold + settings UI
- **Phase 7 (US4)**: Depends on Phase 6 — reuses Stronghold + API key infrastructure
- **Phase 8 (Polish)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (Select Provider)**: Requires Phase 2 only — no other story dependencies
- **US2 (Ollama)**: Requires US1 (settings UI with Ollama fields)
- **US3 (OpenAI)**: Requires US1 (settings UI) + Stronghold setup (Phase 1)
- **US4 (Anthropic)**: Requires US3 (reuses Stronghold + API key UI)
- **US5 (Backward Compat)**: Requires Phase 2 (migration) — independently testable

### Within Each User Story

- Tests written FIRST, confirmed to FAIL before implementation
- Types/interfaces before logic
- Agent-side before UI-side
- Core function before error handling

### Parallel Opportunities

- T004, T005, T006, T004a, T004b (all Phase 2 tests) can run in parallel
- T007, T008 (type definitions) can run in parallel
- T025 (Stronghold test) can run in parallel with Phase 3/4 work
- T032, T033, T034, T037, T038 (all Polish tasks) can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```
# Parallel: Write all tests first
T004: "Write legacy config migration tests in tendril-agent/tests/config.test.ts"
T005: "Write nested config schema validation tests in tendril-agent/tests/config.test.ts"
T006: "Write model factory tests in tendril-agent/tests/agent.test.ts"

# Parallel: Update type definitions
T007: "Update ModelConfig interfaces in tendril-agent/src/types.ts"
T008: "Update AppConfig interface in tendril-ui/src/types.ts"

# Sequential: Schema → Migration → Factory (each builds on previous)
T009: "Refactor Zod schema in tendril-agent/src/config.ts"
T010: "Add legacy migration in tendril-agent/src/config.ts"
T011: "Create model factory in tendril-agent/src/agent.ts"
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3 + 4)

1. Complete Phase 1: Setup (Stronghold deps)
2. Complete Phase 2: Foundational (config schema, model factory, tests)
3. Complete Phase 3: User Story 1 — Provider Selection
4. Complete Phase 4: User Story 2 — Ollama
5. **STOP and VALIDATE**: Test Bedrock + Ollama switching end-to-end
6. This delivers the primary user goal: local model inference via Ollama

### Incremental Delivery

1. Setup + Foundational → Config v2 live
2. US1 (Provider Selection) → Settings UI works → Demo
3. US2 (Ollama) → Local models work → Demo (MVP!)
4. US5 (Backward Compat) → Verify no regressions
5. US3 (OpenAI) → Secure API keys, cloud provider → Demo
6. US4 (Anthropic) → Second cloud provider → Demo
7. Polish → Production ready
