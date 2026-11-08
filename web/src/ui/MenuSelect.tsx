import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export type MenuOption<T extends string | number> = { value: T; label: string; hint?: string };

/**
 * iOS-style pop-up button: a row showing the label and current value with ⌃⌄ chevrons.
 * Opens a rounded listbox with a checkmark on the selected item. Arrow keys, Home/End,
 * Enter/Space select, Escape closes and returns focus.
 */
export function MenuSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: MenuOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const show = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pick = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close();
  };
  const onListKey = (e: KeyboardEvent) => {
    const n = options.length;
    if (e.key === 'ArrowDown') setActive((a) => (a + 1) % n);
    else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + n) % n);
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(n - 1);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      close(e.key === 'Escape');
      if (e.key === 'Tab') return;
    } else return;
    e.preventDefault();
  };

  return (
    <div className="sn-menu" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="sn-menu-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${current?.label ?? 'none'}`}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="sn-menu-label">{label}</span>
        <span className="sn-menu-value">{current?.label ?? '—'}</span>
        <svg className="sn-menu-chev" viewBox="0 0 10 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6l3-3 3 3M2 10l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="sn-menu-list"
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-o${active}`}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? 'active' : undefined}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className="sn-menu-check" aria-hidden="true">{o.value === value ? '✓' : ''}</span>
              <span className="sn-menu-text">
                {o.label}
                {o.hint && <span className="sn-menu-hint">{o.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
