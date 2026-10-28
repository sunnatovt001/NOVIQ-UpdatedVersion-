import { installPageNavigation } from './lib/navigation';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LocaleProvider } from './contexts/LocaleContext';

installPageNavigation();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <ErrorBoundary><App /></ErrorBoundary>
    </LocaleProvider>
  </StrictMode>,
);
