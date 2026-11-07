import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './components/ink-theme.css';
import './components/ink-stage.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import './components/ink-palette.css';
import './components/ink-lyrics.css';
