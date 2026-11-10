export function clientEventId() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return `mob_${crypto.randomUUID()}`;
  if (typeof crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // RFC 4122 UUID v4 bit layout, generated from a cryptographically secure RNG.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return `mob_${uuid}`;
  }
  throw new Error('SECURE_RANDOM_GENERATOR_UNAVAILABLE');
}
