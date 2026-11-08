import { PERSONAS, personaHref, writeCurrentPersona, type PersonaId } from '../../personas';

type Props = {
  /** Injectable for tests; defaults to a full navigation (reload with `?as=<id>`). */
  navigate?: (href: string) => void;
};

/** Full-screen "Who is this phone?" shown before any connection when no persona is chosen. */
export function PersonaPicker({ navigate = href => window.location.assign(href) }: Props) {
  const pick = (id: PersonaId) => {
    writeCurrentPersona(id);
    navigate(personaHref(id));
  };
  return (
    <main className="picker" aria-labelledby="picker-title">
      <h1 id="picker-title">Who is this phone?</h1>
      <p className="muted">Pick once. This device will stay signed in as that person.</p>
      <div className="picker-list">
        {PERSONAS.map(p => (
          <button
            key={p.id}
            type="button"
            className="picker-btn"
            style={{ ['--accent' as string]: p.accent }}
            onClick={() => pick(p.id)}
          >
            <span className="picker-name">{p.name}</span>
            <span className="picker-role">{p.roleHint}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
