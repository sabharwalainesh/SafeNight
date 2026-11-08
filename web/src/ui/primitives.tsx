import { useEffect, useRef, type ReactNode } from 'react';

/** Page title in iOS large-title style (renders an h1). */
export function LargeTitle({ children }: { children: ReactNode }) {
  return <h1 className="large-title">{children}</h1>;
}

/** Inset grouped section. `title` is a small header above, `footer` explanatory text below. Put <Row>s inside. */
export function Section({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="sn-section">
      {title && <h2 className="sn-section-title">{title}</h2>}
      <div className="sn-section-body">{children}</div>
      {footer && <p className="sn-section-footer">{footer}</p>}
    </section>
  );
}

/** List row. With `onClick` it renders a button; `chevron` adds a disclosure arrow; `value` is secondary text on the right. */
export function Row({
  label,
  value,
  chevron,
  onClick,
}: {
  label: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="sn-row-label">{label}</span>
      {value != null && <span className="sn-row-value">{value}</span>}
      {chevron && (
        <svg
          className="sn-row-chevron"
          viewBox="0 0 8 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1 1l6 6-6 6" />
        </svg>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className="sn-row" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="sn-row">{inner}</div>
  );
}

/** Bottom sheet on a native <dialog>; Esc/backdrop/Done call onClose, focus is trapped and restored by the browser. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sn-sheet"
      aria-label={title}
      onClose={onClose}
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
      onClick={e => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="sn-sheet-head">
            <h2 className="headline" style={{ margin: 0 }}>
              {title}
            </h2>
            <button type="button" className="btn plain" onClick={onClose}>
              Done
            </button>
          </div>
          <div className="sn-sheet-body">{children}</div>
        </>
      )}
    </dialog>
  );
}

/** iOS segmented control with radio semantics; `label` names the group for screen readers. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="sn-seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small capsule label. tone: neutral | ok | warn | danger | info. */
export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
  children: ReactNode;
}) {
  return <span className={tone === 'neutral' ? 'sn-pill' : `sn-pill ${tone}`}>{children}</span>;
}
