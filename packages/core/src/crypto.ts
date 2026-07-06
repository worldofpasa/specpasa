/**
 * AES-GCM encryption for provider/integration credentials at rest (ADR-4,
 * cross-cutting "Secrets" note). Uses WebCrypto only, so it runs on both the
 * Node and Cloudflare Workers targets. Payload format:
 * v1:<b64 salt>:<b64 iv>:<b64 ciphertext>
 */

const VERSION = "v1";
const PBKDF2_ITERATIONS = 100_000;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return [VERSION, toB64(salt), toB64(iv), toB64(new Uint8Array(ciphertext))].join(":");
}

export async function decryptSecret(payload: string, secret: string): Promise<string> {
  const [version, salt, iv, ciphertext] = payload.split(":");
  if (version !== VERSION || !salt || !iv || !ciphertext) {
    throw new Error("Malformed encrypted payload");
  }
  const key = await deriveKey(secret, fromB64(salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) as BufferSource },
    key,
    fromB64(ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}
