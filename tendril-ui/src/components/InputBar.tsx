import React, { useState, useRef, useEffect } from 'react';

interface InputBarProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export function InputBar({ onSubmit, onCancel, isProcessing }: InputBarProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isProcessing) {
      textareaRef.current?.focus();
    }
  }, [isProcessing]);

  // Auto-resize textarea to content, max 6 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;
    onSubmit(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isProcessing}
        placeholder={isProcessing ? 'Processing...' : 'Type a message... (Shift+Enter for new line)'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        rows={2}
        className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
      />
      {isProcessing ? (
        <button
          onClick={onCancel}
          className="rounded-lg bg-red-500 px-4 py-3 text-sm text-white hover:bg-red-600 flex-shrink-0"
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="rounded-lg bg-blue-600 px-4 py-3 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 flex-shrink-0"
        >
          Send
        </button>
      )}
    </div>
  );
}
