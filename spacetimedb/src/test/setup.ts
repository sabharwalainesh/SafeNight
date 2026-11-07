// Polyfills for older Node runtimes; no-ops on Node 22+.
const sym = Symbol as unknown as { dispose?: symbol };
if (!sym.dispose) {
  Object.defineProperty(Symbol, 'dispose', { value: Symbol.for('Symbol.dispose') });
}
const setProto = Set.prototype as unknown as { isSubsetOf?: unknown };
if (!setProto.isSubsetOf) {
  Object.defineProperty(Set.prototype, 'isSubsetOf', {
    value: function isSubsetOf<T>(this: Set<T>, other: Set<T>) {
      return [...this].every(value => other.has(value));
    },
  });
}
