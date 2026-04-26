/**
 * Error classification for provider-specific error messages.
 *
 * Translates raw error strings from LLM providers into user-friendly
 * messages for the UI.
 */

import type { Provider } from '../types.js';

export function isAuthError(message: string): boolean {
  const authPatterns = [
    'UnrecognizedClientException',
    'AccessDeniedException',
    'ExpiredTokenException',
    'credentials',
    'security token',
    'Incorrect API key',
    '401',
    'authentication_error',
  ];
  return authPatterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

export function isOllamaConnectionError(message: string): boolean {
  const patterns = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'fetch failed', 'network error'];
  return patterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

export function isOllamaModelNotFound(message: string): boolean {
  return message.includes('404') || (message.toLowerCase().includes('model') && message.toLowerCase().includes('not found'));
}

/** Classify an error and return a user-friendly message. */
export function classifyError(
  message: string,
  provider: Provider,
  modelId: string,
  ollamaHost?: string,
): string {
  if (provider === 'ollama' && isOllamaConnectionError(message)) {
    return `Ollama is not running or unreachable at ${ollamaHost ?? 'unknown'}`;
  }

  if (provider === 'ollama' && isOllamaModelNotFound(message)) {
    return `Model ${modelId} not found in Ollama. Run: ollama pull ${modelId}`;
  }

  if (isAuthError(message)) {
    return `${provider} authentication failed: ${message}`;
  }

  return message;
}
