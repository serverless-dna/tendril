import React from 'react';

interface TokenUsageProps {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
}

export function TokenUsage({ inputTokens, outputTokens, totalTokens, cost, durationMs }: TokenUsageProps) {
  return (
    <div className="flex gap-3 text-xs text-gray-400 mt-1 ml-4">
      <span>{inputTokens} in</span>
      <span>{outputTokens} out</span>
      <span>{totalTokens} total</span>
      <span>${cost.toFixed(4)}</span>
      <span>{(durationMs / 1000).toFixed(1)}s</span>
    </div>
  );
}
