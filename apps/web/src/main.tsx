import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { parsePublicEnv } from '@sentinel/contracts';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import { App } from './App';
import './styles.css';

parsePublicEnv(import.meta.env);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemen root tidak ditemukan.');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
