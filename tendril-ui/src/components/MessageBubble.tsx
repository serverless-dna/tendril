import React from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import 'streamdown/styles.css';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  text: string;
  isStreaming?: boolean;
}

const plugins = { code };

export function MessageBubble({ role, text, isStreaming = false }: MessageBubbleProps) {
  const isUser = role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[80%] rounded-lg px-4 py-3 bg-blue-600 text-white">
          <pre className="whitespace-pre-wrap break-words text-sm">{text}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%] rounded-lg px-4 py-3 dark text-sm">
        <Streamdown plugins={plugins} isAnimating={isStreaming}>
          {text || '\u00A0'}
        </Streamdown>
      </div>
    </div>
  );
}
