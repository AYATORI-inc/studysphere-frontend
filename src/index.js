// 必ず最初に読み込む（console.log の抑止を、他モジュールの評価より先に行うため）
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