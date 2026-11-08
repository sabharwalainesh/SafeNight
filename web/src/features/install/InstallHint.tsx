import { useEffect, useState } from 'react';

const DISMISS_KEY = 'safenight.installHintDismissed';

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

export function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  );
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent);
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Small dismissible card on non-standalone mobile browsers. */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed || isStandalone() || !isMobile()) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Not remembered; the card returns next load.
    }
    setDismissed(true);
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    setPrompt(null);
    dismiss();
  };

  return (
    <aside className="install-hint card" aria-label="Install SafeNight">
      <div>
        <strong>Install SafeNight</strong>
        <p className="muted">
          {isIos()
            ? 'Tap Share, then Add to Home Screen, for a full-screen app.'
            : prompt
              ? 'Add it to your home screen for a full-screen app.'
              : 'Use your browser menu, then Add to Home screen.'}
        </p>
      </div>
      <div className="install-actions">
        {prompt && !isIos() && (
          <button type="button" className="btn" onClick={() => void install()}>
            Install app
          </button>
        )}
        <button type="button" className="btn" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}
