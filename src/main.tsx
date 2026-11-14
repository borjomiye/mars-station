import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './ui/theme.css';
import './ui/game.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
