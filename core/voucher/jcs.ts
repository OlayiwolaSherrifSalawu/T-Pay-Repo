/**
 * JSON Canonicalization Scheme (RFC 8785), restricted to the subset vouchers use.
 *
 * Vouchers carry only strings, safe integers, booleans, null, arrays and objects.
 * Fractional numbers are refused outright, which keeps amounts out of floating
 * point and avoids needing the RFC's ES6 number serialisation edge cases.
 */
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

/** Orders keys by UTF-16 code units, as RFC 8785 section 3.2.3 requires. */
function compareUtf16(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const difference = a.charCodeAt(i) - b.charCodeAt(i);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

export function canonicalize(value: CanonicalValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Canonical payloads only carry safe integers, got ${value}`);
    }
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const members = Object.keys(value)
      .sort(compareUtf16)
      .map((key) => {
        const member = value[key];
        if (member === undefined) {
          throw new Error(`Canonical payload has undefined member "${key}"`);
        }
        return `${JSON.stringify(key)}:${canonicalize(member)}`;
      });
    return `{${members.join(',')}}`;
  }
  throw new Error(`Cannot canonicalize a value of type ${typeof value}`);
}
