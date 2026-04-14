import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App';
import './main.css';

// Tauri webview blocks window.open — route all external opens through the OS
const originalOpen = window.open.bind(window);
window.open = (url?: string | URL, ...args: unknown[]) => {
  if (url) {
    invoke('reveal_in_file_explorer', { path: String(url) });
    return null;
  }
  return originalOpen(url as string, ...(args as [string?, string?]));
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
);
