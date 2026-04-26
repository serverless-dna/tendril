---
id: "20260426-022318-sidecar-agent-restructured-into-loop-and-transport-layers"
title: "Sidecar agent restructured into loop/ and transport/ layers"
category: "architecture"
date: "2026-04-26T02:23:18.414986+00:00"
tags: ["strands", "agentic-loop", "refactor", "sidecar"]
---

## Decision

Restructured `tendril-agent/src/` to make the agentic loop visible:

- `loop/` — tools (ordered by cycle step: search → load → create → execute), prompt, registry, sandbox
- `transport/` — ACP protocol (conversation framing), stream handler (SDK event → loop phase classifier), error classifier
- Root — agent.ts (model + agent wiring), index.ts (slim orchestrator), config.ts, costs.ts, types.ts

The stream handler classifies Strands SDK events into loop phases: think (text delta), act (tool call), observe (tool result), metadata (token usage). The `for await` loop in index.ts reads like the agentic loop it is.

## Rationale

The agentic loop (think → act → observe → repeat) was invisible — hidden inside `agent.stream()` with a 252-line `index.ts` observing raw SDK events via stringly-typed `Record<string, unknown>` chains. The refactor surfaces the loop phases in both directory structure and code flow, making the codebase serve as a readable example of building an agentic loop with Strands SDK.

## Context

This sidecar runs as a Node.js process spawned by a Tauri chat app. It needs streaming (not batch responses), so the SDK owns the loop and our code observes it. The 4 tools combined into `loop/tools.ts` show the cycle: list → load/register → execute.