import React from 'react';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  text: string;
}

export function MessageBubble({ role, text }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
        }`}
      >
        <pre className={`whitespace-pre-wrap break-words text-sm ${isUser ? '' : 'font-mono'}`}>
          {text || '\u00A0'}
        </pre>
      </div>
    </div>
  );
}
