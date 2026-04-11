# Strands SDK → ACP Event Mapping

**Branch**: `001-tendril-tauri-app` | **Date**: 2026-04-11

## Event Translation Table

| Strands Event | ACP sessionUpdate | Notes |
|---|---|---|
| `ModelStreamUpdateEvent` | `agent_message_chunk` | Extract `event.delta` as text |
| `BeforeToolCallEvent` | `tool_call` | Map `event.toolUse.name` → title, `event.toolUse.input` → input |
| `ToolResultEvent` | `tool_call_update` (completed) | Map `event.result` → rawOutput |
| `AgentResultEvent` | `query_result` | Extract `result.metrics.accumulatedUsage` for token counts |
| (after AgentResultEvent) | `prompt_complete` | Always last. `stop_reason: "end_turn"` |
| (on agent.cancel()) | `prompt_complete` | `stop_reason: "interrupted"` |

## Tool Kind Mapping

All four bootstrap tools map to `kind: "other"` since they are domain-specific:

| Bootstrap Tool | ACP kind |
|---|---|
| searchCapabilities | other |
| registerCapability | other |
| loadTool | other |
| execute | execute |

## Cost Calculation

Strands provides `inputTokens` and `outputTokens` via `result.metrics.accumulatedUsage`.
No built-in cost calculation. Agent computes cost from token counts using model pricing:

```
cost = (inputTokens * inputPricePerToken) + (outputTokens * outputPricePerToken)
```

Pricing can be hardcoded initially; configurable pricing is out of scope.

## Context Tracking

`context_tokens` is cumulative across the session. Track by summing `inputTokens` from each turn.
`context_limit` comes from the model's known context window (e.g., 200000 for Claude Sonnet 4.5).
