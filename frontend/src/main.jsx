import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import PolyDashboard from './PolyDashboard.jsx';

const isPolyPage = window.location.pathname === '/poly' || window.location.pathname.startsWith('/poly/');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPolyPage ? <PolyDashboard /> : <App />}
  </StrictMode>,
);
