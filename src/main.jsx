import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import ToastContainer from './components/ui/Toast.jsx';

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
        <ToastContainer />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
