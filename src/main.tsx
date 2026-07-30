import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
// @ts-ignore — app core is JSX ported from the artifact build
import App from './core/App.jsx';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
