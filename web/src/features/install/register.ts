/** Registers the app-shell service worker: production builds, secure contexts only. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(reg => {
        // Home-screen apps stay open for hours: look for a new worker each time the app comes back.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update();
        });
      })
      .catch(err => console.info('[safenight] service worker not registered', err));
    // A new worker took over (skipWaiting + clients.claim): reload once so this page runs the new bundle.
    // (Not on the very first install, where there was no controller before.)
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
