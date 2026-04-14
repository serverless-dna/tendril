import React, { useRef, useEffect } from 'react';
import { useAgent } from '../hooks/useAgent';
import { MessageBubble } from './MessageBubble';
import { ToolTrace } from './ToolTrace';
import { TokenUsage } from './TokenUsage';
import { InputBar } from './InputBar';
import { TendrilLogo } from './TendrilLogo';

interface ChatViewProps {
  draft: string;
  onDraftChange: (text: string) => void;
}

export function ChatView({ draft, onDraftChange }: ChatViewProps) {
  const { messages, isProcessing, connectionStatus, error, sendPrompt, cancelPrompt } = useAgent();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <TendrilLogo size={24} />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tendril</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-green-500'
                : connectionStatus === 'connecting'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-gray-500">{connectionStatus}</span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-700 text-sm border-b border-red-200">
          {error}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg">Send a message to get started</p>
            <p className="text-sm mt-2">Tendril will build tools as it needs them</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={msg.id}>
            <MessageBubble
              role={msg.role}
              text={msg.text}
              isStreaming={isProcessing && msg.role === 'assistant' && idx === messages.length - 1}
            />
            {msg.toolCalls.map((tc) => (
              <ToolTrace key={tc.toolCallId} {...tc} />
            ))}
            {msg.usage && <TokenUsage {...msg.usage} />}
          </div>
        ))}
        {isProcessing && (
          <div className="flex items-center gap-2 mb-3 ml-1">
            <svg className="animate-spin h-4 w-4 text-purple-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-gray-400 text-sm">Processing</span>
          </div>
        )}
      </div>

      {/* Input */}
      <InputBar onSubmit={sendPrompt} onCancel={cancelPrompt} isProcessing={isProcessing} draft={draft} onDraftChange={onDraftChange} />
    </div>
  );
}
