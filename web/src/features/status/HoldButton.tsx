import { useCallback, useEffect, useRef, useState } from 'react';

const HOLD_MS = 1500;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

type Props = { label: string; describedBy: string; disabled?: boolean; onConfirm: () => void };

/** Hold-to-confirm button: pointer or Space/Enter held for 1.5s; releasing early cancels. */
export function HoldButton({ label, describedBy, disabled, onConfirm }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);
  const reduced = useRef(prefersReducedMotion());

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setHolding(false);
    setElapsed(0);
  }, []);

  const start = useCallback(() => {
    if (disabled || timer.current !== null) return;
    startedAt.current = Date.now();
    setHolding(true);
    timer.current = window.setInterval(() => {
      const e = Date.now() - startedAt.current;
      if (e >= HOLD_MS) {
        stop();
        onConfirm();
      } else setElapsed(e);
    }, 50);
  }, [disabled, onConfirm, stop]);

  useEffect(() => stop, [stop]);

  const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
  const secsLeft = (Math.ceil((HOLD_MS - elapsed) / 500) / 2).toFixed(1);

  return (
    <button
      type="button"
      className={`status-btn status-emergency${holding ? ' is-holding' : ''}`}
      aria-describedby={describedBy}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop();
      }}
      onBlur={stop}
    >
      <span className="status-hold-label">{holding && reduced.current ? `Keep holding... ${secsLeft}s` : label}</span>
      {!reduced.current && <span className="status-hold-bar" style={{ width: `${pct}%` }} aria-hidden="true" />}
    </button>
  );
}
