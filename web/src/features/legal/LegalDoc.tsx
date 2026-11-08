import { useState } from 'react';
import { ACKNOWLEDGEMENTS, PRIVACY_POLICY, SAFETY_NOTE, TERMS, type LegalDoc as Doc } from '../../legal/content';
import { Section, Sheet } from '../../ui';

/** Readable long-form page for a legal document. */
export function LegalDoc({ doc, inSheet = false }: { doc: Doc; inSheet?: boolean }) {
  return (
    <article className="sn-doc" aria-label={doc.title}>
      <header>
        {!inSheet && <h2 className="title2">{doc.title}</h2>}
        <p className="muted footnote">Last updated {doc.updated}</p>
      </header>
      <p className="sn-doc-intro">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.body.length === 1 ? (
            <p>{s.body[0]}</p>
          ) : (
            <ul>
              {s.body.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}

export function AboutPage() {
  return (
    <div className="sn-doc">
      <Section title="Safety">
        <p className="card" style={{ boxShadow: 'none', margin: 0 }}>{SAFETY_NOTE}</p>
      </Section>
      <Section title="Acknowledgements">
        <ul className="list" style={{ padding: '4px 18px' }}>
          {ACKNOWLEDGEMENTS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** Inline "Privacy Policy" link that opens the policy in a sheet (no navigation away). */
export function PrivacyLink({ label = 'Privacy Policy' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="sn-link" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={PRIVACY_POLICY.title}>
        <LegalDoc doc={PRIVACY_POLICY} inSheet />
      </Sheet>
    </>
  );
}

/** Subtle "not an emergency service" line. */
export function SafetyNote() {
  return (
    <p className="sn-safety-note">
      <span aria-hidden="true">ⓘ</span>
      <span>{SAFETY_NOTE}</span>
    </p>
  );
}

export { PRIVACY_POLICY, TERMS };
