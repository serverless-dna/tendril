import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App';
import './main.css';

// Tauri webview blocks window.open — route external opens through the OS
const originalOpen = window.open.bind(window);
window.open = (url?: string | URL, ...args: unknown[]) => {
  if (url) {
    const urlStr = String(url);
    // Only allow HTTPS URLs through to the OS. Reject all other schemes.
    if (urlStr.startsWith('https://')) {
      invoke('reveal_in_file_explorer', { path: urlStr });
    } else {
      console.warn('[main] Blocked window.open for non-HTTPS URL:', urlStr);
    }
    return null;
  }
  return originalOpen(url as string, ...(args as [string?, string?]));
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
);
