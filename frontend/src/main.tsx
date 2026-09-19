import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {FxLab} from './components/FxLab.tsx';
import './index.css';

/**
 * Two entry points, no router.
 *
 * `/dev/fx` is the effect tuning bench (ky_thuat_my_thuat.md 6). It is served in
 * every build on purpose: the whole point of the page is to be one keystroke away
 * while tuning, and it touches nothing but local state.
 */
const isFxLab = window.location.pathname.replace(/\/+$/, '') === '/dev/fx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isFxLab ? (
      <FxLab onExit={() => { window.location.href = '/'; }} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
