import './styles/fonts';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { ROUTER_BASENAME } from './config/base';
import { ToastProvider } from './components/common/Toast';
import { AuthProvider } from './context/AuthContext';
import './styles/global.css';

// A data router is required for useBlocker (unsaved-changes guard); every route is handled by <App />.
const router = createBrowserRouter([{ path: '*', element: <App /> }], { basename: ROUTER_BASENAME });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);
