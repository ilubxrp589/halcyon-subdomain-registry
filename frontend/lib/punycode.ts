import { toUnicode } from "punycode/";

/**
 * Decode a punycode (xn--) name to its Unicode form.
 * Returns null for non-punycode names.
 */
export function decodePunycode(name: string): string | null {
  if (!name.startsWith("xn--")) return null;
  try {
    const decoded = toUnicode(name);
    return decoded !== name ? decoded : null;
  } catch {
    return null;
  }
}

/** Returns the display name — Unicode if punycode, otherwise original */
export function displayName(name: string): string {
  return decodePunycode(name) ?? name;
}
