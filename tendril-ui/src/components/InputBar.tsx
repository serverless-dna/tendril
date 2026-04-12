import React, { useState, useRef, useEffect } from 'react';

interface InputBarProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export function InputBar({ onSubmit, onCancel, isProcessing }: InputBarProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isProcessing) {
      inputRef.current?.focus();
    }
  }, [isProcessing]);

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
    <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <input
        ref={inputRef}
        type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isProcessing}
        placeholder={isProcessing ? 'Processing...' : 'Type a message...'}
        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
      />
      {isProcessing ? (
        <button
          onClick={onCancel}
          className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
        >
          Send
        </button>
      )}
    </div>
  );
}
