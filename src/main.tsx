import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Older builds stored an administrator bearer token here. Authorization is now
// verified by the API, and the local recovery session uses an httpOnly cookie,
// so no administrator token belongs in web storage.
try {
  localStorage.removeItem('zamzam_admin_portal_session_v1');
  sessionStorage.removeItem('zamzam_admin_portal_session_v1');
} catch {
  // Web storage can be unavailable (for example in private mode).
}

createRoot(document.getElementById('root')!).render(<App />);
