'use strict';

(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(registration => {
        registration.update().catch(() => {});
        document.documentElement.dataset.pwa = 'registered';
      })
      .catch(() => {
        document.documentElement.dataset.pwa = 'unavailable';
      });
  }, { once: true });
})();
