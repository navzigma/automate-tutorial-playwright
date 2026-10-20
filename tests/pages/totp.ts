import { createHmac } from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret: string): Buffer {
  let bits = '';
  for (const char of secret.toUpperCase().replace(/[\s=-]/g, '')) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error(`The 2FA secret holds "${char}", which is not base32`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

/** The 6-digit code an authenticator app shows for this base32 secret (RFC 6238, 30-second steps). */
export function totp(secret: string, time = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** Milliseconds until the current code expires. */
export function totpRemaining(time = Date.now()): number {
  return 30_000 - (time % 30_000);
}
