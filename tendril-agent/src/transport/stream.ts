/**
 * Stream event handler — observes the Strands agentic loop.
 *
 * The loop inside agent.stream() follows this cycle:
 *   THINK   → model produces text/reasoning  (modelStreamUpdateEvent)
 *   ACT     → model invokes a tool           (beforeToolCallEvent)
 *   OBSERVE → tool returns a result           (toolResultEvent / afterToolCallEvent)
 *   REPEAT  → back to THINK until the model stops calling tools
 *
 * This module classifies each SDK event into a loop phase and maps it
 * to a SessionUpdate for the UI.
 */

import type { SessionUpdate } from '../types.js';

// ── Loop Phases ─────────────────────────────────────────────────────────────

export type LoopPhase = 'think' | 'act' | 'observe' | 'metadata' | 'unknown';

export interface ClassifiedEvent {
  phase: LoopPhase;
  event: Record<string, unknown>;
}

/** Classify a raw Strands SDK stream event into an agentic loop phase. */
export function classifyEvent(event: unknown): ClassifiedEvent {
  if (!event || typeof event !== 'object') {
    return { phase: 'unknown', event: {} };
  }

  const e = event as Record<string, unknown>;
  const type = (e.type as string) ?? '';

  switch (type) {
    case 'modelStreamUpdateEvent':
      return classifyModelUpdate(e);
    case 'beforeToolCallEvent':
      return { phase: 'act', event: e };
    case 'toolResultEvent':
      return { phase: 'observe', event: e };
    case 'afterToolCallEvent':
      // afterToolCallEvent duplicates toolResultEvent — ignore it
      return { phase: 'unknown', event: e };
    default:
      return { phase: 'unknown', event: e };
  }
}

function classifyModelUpdate(e: Record<string, unknown>): ClassifiedEvent {
  const inner = e.event as Record<string, unknown> | undefined;
  if (!inner) return { phase: 'unknown', event: e };

  const innerType = inner.type as string;
  if (innerType === 'modelContentBlockDeltaEvent') return { phase: 'think', event: e };
  if (innerType === 'modelMetadataEvent') return { phase: 'metadata', event: e };
  return { phase: 'unknown', event: e };
}

// ── Phase → SessionUpdate Mappers ───────────────────────────────────────────

/** THINK phase: model is producing text. Extract the delta for streaming to UI. */
export function handleThink(event: Record<string, unknown>): SessionUpdate | null {
  const inner = event.event as Record<string, unknown> | undefined;
  if (!inner) return null;

  const delta = inner.delta as Record<string, unknown> | undefined;
  const text = delta?.text as string | undefined;
  if (!text) return null;

  return {
    sessionUpdate: 'agent_message_chunk',
    text,
    content: { type: 'text', text },
  };
}

/** ACT phase: model is calling a tool. Extract the tool call details. */
export function handleAct(event: Record<string, unknown>, toolCounter: number): { update: SessionUpdate; toolCallId: string } {
  const toolUse = (event.toolUse as Record<string, unknown>) ?? event;
  const toolCallId = (toolUse.toolUseId as string) ?? `tool-${toolCounter + 1}`;
  const name = (toolUse.name as string) ?? 'unknown';

  return {
    update: {
      sessionUpdate: 'tool_call',
      toolCallId,
      title: name,
      kind: name === 'execute' ? 'execute' : 'other',
      input: toolUse.input ?? {},
    },
    toolCallId,
  };
}

/** OBSERVE phase: a tool returned a result. */
export function handleObserve(event: Record<string, unknown>, lastToolId: string, toolCounter: number): SessionUpdate {
  const result = (event.result as Record<string, unknown>) ?? event;
  const rawOutput = result.content ?? result.result ?? result.text ?? '';

  return {
    sessionUpdate: 'tool_call_update',
    toolCallId: lastToolId || `tool-${toolCounter}`,
    status: 'completed',
    rawOutput: typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput),
    title: (event.name as string) ?? 'unknown',
  };
}

/** METADATA phase: extract token usage from the model response. */
export function handleMetadata(event: Record<string, unknown>): { inputTokens: number; outputTokens: number } | null {
  const inner = event.event as Record<string, unknown> | undefined;
  if (!inner) return null;

  const usage = inner.usage as Record<string, number> | undefined;
  if (!usage) return null;

  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}
