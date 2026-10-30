// コンソール抑止は他のimportより先に読み込む（起動時ログも対象にするため）
import './utils/consoleFilter';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 

const registerNotificationServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register('/notification-sw.js');
    console.log('Notification service worker registered.');
  } catch (error) {
    console.error('Failed to register notification service worker:', error);
  }
};

registerNotificationServiceWorker();