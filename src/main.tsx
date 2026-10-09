import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LocaleProvider } from './contexts/LocaleContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <ErrorBoundary><App /></ErrorBoundary>
    </LocaleProvider>
  </StrictMode>,
);
