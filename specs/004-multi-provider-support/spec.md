# Feature Specification: Multi-Provider Model Support

**Feature Branch**: `code-review` (spec created within existing worktree)  
**Created**: 2026-04-16  
**Status**: Draft  
**Input**: User description: "Add multi-provider support to tendril-agent. Currently uses Amazon Bedrock via Strands SDK. Refactor settings to have provider-specific settings and ability to select a provider. Include Ollama support for local models."

## Clarifications

### Session 2026-04-16

- Q: How should API keys be stored securely? → A: Tauri Stronghold — encrypted vault with `tauri-plugin-stronghold`, argon2 password protection. Keys never stored in plaintext config.
- Q: What happens to provider-specific values when switching providers in settings? → A: Retain per-provider — all provider configs stored simultaneously in config file. Switching changes the active provider; previously entered values for other providers persist and reappear on switch-back.
- Q: How should the config schema be structured to support multiple providers? → A: Nested provider blocks — `model.provider` as discriminant, each provider gets its own nested object (e.g., `model.bedrock: {}`, `model.ollama: {}`). All blocks coexist.
- Q: How should API keys get from Stronghold (Tauri/Rust) to the agent (Node.js child process)? → A: Inject via environment variable — Tauri reads key from Stronghold at agent spawn time, sets provider-standard env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) on the child process only.
- Q: What happens when a user tries to save settings for a provider that requires an API key but none is entered? → A: Block save — settings panel validates required credentials exist before allowing save, with inline validation error.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select a Model Provider (Priority: P1)

A user opens the Tendril settings panel and selects which model provider to use (e.g., Bedrock, Ollama, OpenAI). The settings form dynamically updates to show only the fields relevant to the chosen provider. On save, the agent restarts using the new provider.

**Why this priority**: This is the core capability — without provider selection, no other provider can be used. It gates all other stories.

**Independent Test**: Can be fully tested by changing the provider dropdown in settings, saving, and verifying the agent restarts with the correct provider initialisation logged to stderr.

**Acceptance Scenarios**:

1. **Given** a fresh install with no config, **When** the user opens settings, **Then** the provider defaults to "bedrock" with Bedrock-specific fields (region, profile, model ID) pre-populated with current defaults.
2. **Given** the user selects "ollama" as provider, **When** the settings form updates, **Then** only Ollama-relevant fields are shown (host URL, model ID) and Bedrock-specific fields (region, profile) are hidden.
3. **Given** the user saves a new provider selection, **When** the agent restarts, **Then** the agent process logs confirm the new provider is in use and the model responds to prompts.
4. **Given** the user has configured Ollama settings, **When** they switch to OpenAI and then back to Ollama, **Then** the previously entered Ollama host and model ID are restored in the form.
5. **Given** the user selects OpenAI but has not entered an API key, **When** they click Save, **Then** an inline validation error is shown ("API key required for OpenAI") and the save is blocked.

---

### User Story 2 - Use Ollama for Local Model Inference (Priority: P1)

A user with Ollama running locally configures Tendril to use an Ollama model. They set the host URL and model ID, save, and the agent connects to their local Ollama instance for all inference.

**Why this priority**: Ollama support for local models is the primary motivating use case for this feature. It enables offline/private usage without cloud API costs.

**Independent Test**: Can be fully tested by running Ollama locally with a model pulled, configuring Tendril to use it, and sending a prompt that receives a coherent response.

**Acceptance Scenarios**:

1. **Given** Ollama is running at `http://localhost:11434` with `llama3` available, **When** the user configures provider "ollama" with host `http://localhost:11434` and model `llama3`, **Then** the agent successfully sends prompts and receives streamed responses.
2. **Given** Ollama is not running or unreachable, **When** the user sends a prompt, **Then** the agent emits a clear error message indicating the Ollama host is unreachable (not a cryptic SDK exception).
3. **Given** the user specifies a model ID not available in Ollama, **When** a prompt is sent, **Then** the agent emits a clear error indicating the model is not found.

---

### User Story 3 - Use OpenAI as Provider (Priority: P2)

A user configures Tendril to use the OpenAI API. They enter their API key and select a model. The agent uses OpenAI for inference.

**Why this priority**: OpenAI is the most widely adopted commercial API. Supporting it broadens accessibility beyond AWS users.

**Independent Test**: Can be fully tested by configuring an OpenAI API key and model, sending a prompt, and receiving a response.

**Acceptance Scenarios**:

1. **Given** the user selects "openai" provider, **When** the settings form updates, **Then** a field for model ID is shown, plus a secure API key entry field that stores the key in the encrypted Stronghold vault (not in config.json).
2. **Given** valid OpenAI credentials, **When** the user sends a prompt, **Then** the agent streams a response from OpenAI.
3. **Given** an invalid API key, **When** a prompt is sent, **Then** a clear authentication error is surfaced to the user.
4. **Given** the user has not entered an API key for OpenAI, **When** they attempt to save settings, **Then** save is blocked with an inline validation error.

---

### User Story 4 - Use Anthropic Direct API (Priority: P2)

A user configures Tendril to use the Anthropic API directly (not via Bedrock). They enter their API key and select a Claude model.

**Why this priority**: Enables Anthropic model usage for users without AWS accounts.

**Independent Test**: Can be fully tested by configuring an Anthropic API key and model, sending a prompt, and receiving a response.

**Acceptance Scenarios**:

1. **Given** the user selects "anthropic" provider, **When** the settings form updates, **Then** a field for model ID is shown, plus a secure API key entry field that stores the key in the encrypted Stronghold vault.
2. **Given** valid Anthropic credentials, **When** the user sends a prompt, **Then** the agent streams a response.
3. **Given** the user has not entered an API key for Anthropic, **When** they attempt to save settings, **Then** save is blocked with an inline validation error.

---

### User Story 5 - Preserve Existing Bedrock Behaviour (Priority: P1)

Existing users with Bedrock configurations experience no change in behaviour. Their current `config.json` continues to work without migration. The refactored settings are backward-compatible.

**Why this priority**: Breaking existing users is unacceptable. Backward compatibility is a hard constraint.

**Independent Test**: Can be tested by using an existing `~/.tendril/config.json` with current Bedrock-only schema — the agent starts and behaves identically.

**Acceptance Scenarios**:

1. **Given** an existing config with `{ "model": { "modelId": "...", "region": "us-east-1" } }` (no explicit provider), **When** the agent starts, **Then** it defaults to Bedrock and operates normally.
2. **Given** an existing config with `"provider": "bedrock"`, **When** the agent starts, **Then** it uses Bedrock with all existing fields honoured.

---

### Edge Cases

- What happens when a provider-specific required field is missing (e.g., Ollama with no host URL)? → Validation error at config parse time with a clear message.
- What happens when switching providers and the old provider's fields are still in the config? → All provider configs are retained simultaneously. Only the active provider's block is validated. Previously entered values persist and reappear on switch-back.
- What happens with an unsupported provider string? → Validation error listing supported providers.
- What happens to cost calculation when switching away from Bedrock? → Cost calculation must be provider-aware (different pricing models) or disabled for providers without known pricing.
- What happens if the Stronghold vault is locked or corrupted? → Agent startup fails with a clear error message. Manual recovery requires deleting the vault file from the app data directory. Automated vault reset is out of scope for v1.
- What happens if the user sets an API key via environment variable AND in Stronghold? → Environment variable takes precedence (standard SDK behaviour). Stronghold value is used only when env var is absent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support selecting a model provider from a defined set: `bedrock`, `ollama`, `openai`, `anthropic`.
- **FR-002**: System MUST store provider selection and provider-specific settings in `~/.tendril/config.json` using a discriminated `model` section: `model.provider` as the discriminant, with `model.bedrock`, `model.ollama`, `model.openai`, `model.anthropic` as separate nested objects that coexist simultaneously.
- **FR-003**: System MUST dynamically instantiate the correct Strands SDK model class based on the configured provider.
- **FR-004**: System MUST validate provider-specific required fields at config load time and emit clear error messages for missing/invalid fields.
- **FR-005**: System MUST maintain backward compatibility — existing configs without an explicit `provider` field default to `bedrock`.
- **FR-006**: The UI settings panel MUST show a provider selector and dynamically display only the fields relevant to the selected provider.
- **FR-006a**: The settings panel MUST retain previously entered values for all providers. Switching providers MUST restore previously entered values for the newly selected provider.
- **FR-006b**: The settings panel MUST validate that required credentials (API keys) exist before allowing save. Missing required fields MUST show inline validation errors and block the save action.
- **FR-007**: System MUST handle provider connection errors gracefully and surface user-friendly error messages (not raw SDK exceptions).
- **FR-008**: System MUST support Ollama with configurable `host` (URL) and `modelId` fields.
- **FR-009**: System MUST support OpenAI with configurable `modelId` field.
- **FR-010**: System MUST support Anthropic with configurable `modelId` field.
- **FR-011**: System MUST support Bedrock with existing `region`, `profile`, and `modelId` fields.
- **FR-012**: The agent startup log MUST identify the active provider and model.
- **FR-013**: Provider-specific fields for inactive providers MUST be ignored during validation (not cause errors).
- **FR-015**: Cost calculation in `index.ts` MUST be provider-aware or gracefully degrade for providers without known token pricing.
- **FR-016**: API keys for providers requiring them (OpenAI, Anthropic) MUST be stored in a Tauri Stronghold encrypted vault (`tauri-plugin-stronghold`), protected with argon2 password hashing.
- **FR-017**: At agent spawn time, the Tauri backend MUST read API keys from Stronghold and inject them as environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) on the child process. Keys MUST NOT be passed via config file or stdin.
- **FR-018**: Environment variables for API keys MUST take precedence over Stronghold-stored keys. If an env var is already set in the user's shell, Stronghold values are not injected for that provider.
- **FR-019**: The UI MUST provide a secure password-type input for API key entry. The key value MUST be written directly to Stronghold, never persisted in the config.json file or application logs.

### Key Entities

- **ProviderConfig**: A discriminated union representing provider-specific settings. Each variant contains only the fields relevant to that provider.
- **ModelConfig (refactored)**: Top-level model configuration containing the `provider` discriminant and nested provider-specific config blocks for all providers simultaneously (e.g., `bedrock: { region, profile, modelId }`, `ollama: { host, modelId }`, `openai: { modelId }`, `anthropic: { modelId }`).
- **Provider**: An enumerated set of supported provider identifiers (`bedrock` | `ollama` | `openai` | `anthropic`).
- **SecureCredentialStore**: Tauri Stronghold vault storing API keys for providers that require them. Keyed by provider name (e.g., `openai_api_key`, `anthropic_api_key`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can switch between at least 4 providers (Bedrock, Ollama, OpenAI, Anthropic) via the settings UI and successfully send/receive prompts with each.
- **SC-002**: Existing Bedrock-only configs work without modification after the upgrade (zero-migration backward compatibility).
- **SC-003**: Invalid provider configurations produce specific, actionable error messages within 2 seconds of agent startup.
- **SC-004**: The UI settings panel renders provider-specific fields with no perceptible lag on provider selection change.
- **SC-005**: All provider-related config validation is covered by unit tests with at least one positive and one negative case per provider.
- **SC-006**: An Ollama-configured agent can complete a full prompt→response cycle against a locally running Ollama instance.

## Assumptions

- The Strands SDK `@strands-agents/sdk` package bundles (or makes available) model classes for all target providers. No additional npm packages are needed beyond what Strands provides. Provider SDK model classes read API keys from standard environment variables.
- Ollama users are responsible for installing and running Ollama locally; Tendril does not manage the Ollama process.
- API keys for OpenAI and Anthropic are stored in a Tauri Stronghold encrypted vault, never in plaintext config. The vault is password-protected with argon2 hashing.
- The Stronghold vault file lives alongside the app data directory (managed by Tauri). Users do not interact with the vault file directly.
- Bedrock authentication continues to use AWS credential chain (profile, env vars, instance metadata) — no API key storage needed.
- The initial provider set is limited to 4 (Bedrock, Ollama, OpenAI, Anthropic). Additional providers (Gemini, LiteLLM, etc.) can be added later using the same discriminated config pattern.
- Token usage reporting and cost calculation may not be available for all providers. Where pricing is unknown, cost fields will report zero.
- The Strands SDK streaming event shape may vary by provider. The stream event handler in `index.ts` may need provider-specific event parsing.
